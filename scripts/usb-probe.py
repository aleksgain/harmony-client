#!/usr/bin/env python3
"""
Read-only USB HID probe for Logitech Harmony hubs and remotes (Linux hidraw).

Mirrors src/main/hid-protocol.ts / usb-hid.ts so the reconstructed protocol
can be checked against real hardware without building node-hid. It performs
ONLY read operations:

  1. enumerate /dev/hidraw* with VID 0x046D and print report sizes, plus Harmony
     remotes the kernel leaves unbound (reached via libusb; see usb_unbound_devices)
  2. soft reset (Ping 0) -> Ping -> Open(/sys/sysinfo, R) -> Read -> Close
  3. optionally Open(/cfg/properties, R) -> Read -> Close   (--properties)

Nothing is written to /sys/hlapi or any other file, so the device's
provisioning and configuration are left untouched.

Every packet sent and received is logged as hex to a JSONL trace so the
exchange can be compared with the implementation.

Usage:
  sudo python3 scripts/usb-probe.py                  # list + identify all
  sudo python3 scripts/usb-probe.py --properties     # also read /cfg/properties
  sudo python3 scripts/usb-probe.py --list           # enumerate only
  python3 scripts/usb-probe.py --out ~/Git/harmony-captures

(sudo is needed unless a udev rule grants access to the hidraw node.)
"""
from __future__ import annotations

import argparse
import errno
import glob
import json
import os
import re
import select
import sys
import time
from pathlib import Path

VID_LOGITECH = 0x046D
SERVICE = 0xFF
END_MARKER = 0xFE
ERR = 0xFF
CMD = {"Ping": 0x00, "Open": 0x01, "Read": 0x04, "Close": 0x07}
# Harmony PIDs from USB_MODELS in src/shared/usb.ts. Other 046D devices (Unifying/
# Bolt receivers, mice, keyboards) speak HID++ and must never get these packets.
HARMONY_PIDS = {0xC129, 0xC12B, 0xC131, 0xC132}


# ---------------------------------------------------------------- enumeration
def hidraw_devices():
    for node in sorted(glob.glob("/sys/class/hidraw/hidraw*")):
        name = os.path.basename(node)
        uevent = Path(node, "device", "uevent")
        try:
            info = dict(
                line.split("=", 1) for line in uevent.read_text().splitlines() if "=" in line
            )
        except OSError:
            continue
        hid_id = info.get("HID_ID", "")  # e.g. 0003:0000046D:0000C129
        try:
            _bus, vid, pid = (int(x, 16) for x in hid_id.split(":"))
        except ValueError:
            continue
        if vid != VID_LOGITECH:
            continue
        desc = b""
        try:
            desc = Path(node, "device", "report_descriptor").read_bytes()
        except OSError:
            pass
        yield {
            "node": f"/dev/{name}",
            "vid": f"{vid:04x}",
            "pid": f"{pid:04x}",
            "name": info.get("HID_NAME", ""),
            "uniq": info.get("HID_UNIQ", ""),
            "descriptor_hex": desc.hex(),
            "report_lengths": report_lengths(desc),
            "uses_report_ids": b"\x85" in desc,
            "known_harmony": pid in HARMONY_PIDS,
        }


def usb_unbound_devices():
    """Harmony remotes the kernel deliberately ignores.

    drivers/hid/hid-quirks.c puts Logitech's Harmony PID range (0xC110-0xC14F)
    on the HID ignore list, so usbhid never binds them and no hidraw node
    appears. They are reachable through libusb (usbfs) instead.
    """
    for dev in sorted(glob.glob("/sys/bus/usb/devices/*")):
        try:
            vid = int(Path(dev, "idVendor").read_text(), 16)
            pid = int(Path(dev, "idProduct").read_text(), 16)
        except (OSError, ValueError):
            continue
        if vid != VID_LOGITECH or pid not in HARMONY_PIDS:
            continue
        for itf in sorted(glob.glob(f"{dev}/*:*")):
            try:
                if Path(itf, "bInterfaceClass").read_text().strip() != "03":
                    continue
            except OSError:
                continue
            if os.path.exists(f"{itf}/driver"):
                continue  # bound to usbhid -> already covered by hidraw_devices()
            eps = {}
            for ep in glob.glob(f"{itf}/ep_*"):
                addr = int(Path(ep, "bEndpointAddress").read_text(), 16)
                eps[addr] = int(Path(ep, "wMaxPacketSize").read_text(), 16)
            ep_in = next((a for a in eps if a & 0x80), 0x81)
            ep_out = next((a for a in eps if not a & 0x80), 0x02)
            busnum = int(Path(dev, "busnum").read_text())
            devnum = int(Path(dev, "devnum").read_text())
            yield {
                "node": f"usb:{busnum:03d}/{devnum:03d}",
                "vid": f"{vid:04x}",
                "pid": f"{pid:04x}",
                "name": Path(dev, "product").read_text().strip() if os.path.exists(f"{dev}/product") else "",
                "uniq": "",
                "descriptor_hex": "",
                "report_lengths": {"input": eps.get(ep_in, 64), "output": eps.get(ep_out, 64)},
                "uses_report_ids": False,
                "known_harmony": True,
                "usb": {"bus": busnum, "addr": devnum, "iface": int(itf.rsplit(".", 1)[1]),
                        "ep_in": ep_in, "ep_out": ep_out},
            }


def report_lengths(desc: bytes):
    """Same algorithm as reportLengthsFromDescriptor() in hid-protocol.ts."""
    size = count = inp = out = 0
    i = 0
    while i < len(desc):
        prefix = desc[i]
        if prefix == 0xFE:
            i += 3 + (desc[i + 1] if i + 1 < len(desc) else 0)
            continue
        sc = prefix & 0x03
        n = 4 if sc == 3 else sc
        tag = prefix & 0xFC
        val = int.from_bytes(desc[i + 1 : i + 1 + n], "little") if n else 0
        if tag == 0x74:
            size = val
        elif tag == 0x94:
            count = val
        elif tag == 0x80:
            inp += size * count
        elif tag == 0x90:
            out += size * count
        i += 1 + n
    return {"input": (inp + 7) // 8, "output": (out + 7) // 8}


# ---------------------------------------------------------------- protocol
def enc_byte(v):
    return [0x01, v & 0xFF]


def enc_str(s):
    return [0x80, *s.encode("utf-8"), 0x00]


class Link:
    def __init__(self, node, req_len, resp_len, trace):
        self.fd = os.open(node, os.O_RDWR | os.O_NONBLOCK)
        self.req_len = req_len
        self.resp_len = resp_len
        self.trace = trace
        self.seq = 0xFF

    def next_seq(self):
        self.seq = 0 if self.seq >= 63 else self.seq + 1
        return self.seq

    def reset_seq(self):
        self.seq = 0xFF

    def log(self, direction, data: bytes, note=""):
        rec = {"t": round(time.time(), 4), "dir": direction, "hex": data.hex(), "note": note}
        self.trace.write(json.dumps(rec) + "\n")
        self.trace.flush()

    def write(self, packet: bytes, note=""):
        if len(packet) > self.req_len:
            raise ValueError(f"packet {len(packet)} > report width {self.req_len}")
        packet = packet.ljust(self.req_len, b"\x00")
        self.log("out", packet, note)
        os.write(self.fd, b"\x00" + packet)  # report id 0 (unnumbered reports)

    def read(self, timeout=10.0, note=""):
        r, _, _ = select.select([self.fd], [], [], timeout)
        if not r:
            self.log("timeout", b"", note)
            raise TimeoutError(f"no response within {timeout}s ({note})")
        data = os.read(self.fd, 4096)
        self.log("in", data, note)
        return data

    def drain(self):
        while True:
            r, _, _ = select.select([self.fd], [], [], 0.1)
            if not r:
                return
            try:
                self.log("in", os.read(self.fd, 4096), "drain")
            except OSError:
                return

    def command(self, name, params, timeout=10.0, expect=True):
        cmd = CMD[name]
        flat = [b for prm in params for b in prm]
        pkt = bytes([SERVICE, cmd, self.next_seq(), len(params), *flat])
        self.write(pkt, name)
        if not expect:
            return None
        res = self.read(timeout, name)
        for _ in range(4):  # skip an 0xFE end marker left over from a Read
            if not res or res[0] != END_MARKER:
                break
            res = self.read(timeout, name)
        check(res, cmd)
        return res

    def close(self):
        os.close(self.fd)


class UsbLink(Link):
    """Same protocol over libusb interrupt endpoints (ctypes, no pyusb needed)."""

    def __init__(self, usb, req_len, resp_len, trace):
        import ctypes
        import ctypes.util

        self.ct = ctypes
        name = ctypes.util.find_library("usb-1.0") or "libusb-1.0.so.0"
        self.lib = lib = ctypes.CDLL(name)
        lib.libusb_init.argtypes = [ctypes.POINTER(ctypes.c_void_p)]
        lib.libusb_get_device_list.argtypes = [ctypes.c_void_p, ctypes.POINTER(ctypes.POINTER(ctypes.c_void_p))]
        lib.libusb_get_device_list.restype = ctypes.c_ssize_t
        lib.libusb_free_device_list.argtypes = [ctypes.POINTER(ctypes.c_void_p), ctypes.c_int]
        lib.libusb_get_bus_number.argtypes = [ctypes.c_void_p]
        lib.libusb_get_bus_number.restype = ctypes.c_uint8
        lib.libusb_get_device_address.argtypes = [ctypes.c_void_p]
        lib.libusb_get_device_address.restype = ctypes.c_uint8
        lib.libusb_open.argtypes = [ctypes.c_void_p, ctypes.POINTER(ctypes.c_void_p)]
        lib.libusb_close.argtypes = [ctypes.c_void_p]
        lib.libusb_exit.argtypes = [ctypes.c_void_p]
        lib.libusb_claim_interface.argtypes = [ctypes.c_void_p, ctypes.c_int]
        lib.libusb_release_interface.argtypes = [ctypes.c_void_p, ctypes.c_int]
        lib.libusb_interrupt_transfer.argtypes = [ctypes.c_void_p, ctypes.c_ubyte, ctypes.c_char_p, ctypes.c_int,
                                                  ctypes.POINTER(ctypes.c_int), ctypes.c_uint]
        lib.libusb_control_transfer.argtypes = [ctypes.c_void_p, ctypes.c_uint8, ctypes.c_uint8, ctypes.c_uint16,
                                                ctypes.c_uint16, ctypes.c_char_p, ctypes.c_uint16, ctypes.c_uint]
        lib.libusb_error_name.argtypes = [ctypes.c_int]
        lib.libusb_error_name.restype = ctypes.c_char_p

        self.req_len, self.resp_len, self.trace, self.seq = req_len, resp_len, trace, 0xFF
        self.iface, self.ep_in, self.ep_out = usb["iface"], usb["ep_in"], usb["ep_out"]
        self.ctx = ctypes.c_void_p()
        self._chk(lib.libusb_init(ctypes.byref(self.ctx)), "init")
        lst = ctypes.POINTER(ctypes.c_void_p)()
        n = lib.libusb_get_device_list(self.ctx, ctypes.byref(lst))
        self.h = ctypes.c_void_p()
        try:
            for i in range(n):
                d = lst[i]
                if lib.libusb_get_bus_number(d) == usb["bus"] and lib.libusb_get_device_address(d) == usb["addr"]:
                    self._chk(lib.libusb_open(d, ctypes.byref(self.h)), "open")
                    break
            else:
                raise OSError(errno.ENODEV, f"usb {usb['bus']:03d}/{usb['addr']:03d} not found")
        finally:
            lib.libusb_free_device_list(lst, 1)
        self._chk(lib.libusb_claim_interface(self.h, self.iface), "claim_interface")
        # HID report descriptor (GET_DESCRIPTOR 0x22), read-only; lets us check report sizes.
        buf = ctypes.create_string_buffer(512)
        r = lib.libusb_control_transfer(self.h, 0x81, 0x06, 0x2200, self.iface, buf, 512, 1000)
        self.report_descriptor = buf.raw[:r] if r > 0 else b""

    def _chk(self, rc, what):
        if rc < 0:
            name = self.lib.libusb_error_name(rc).decode()
            code = errno.EACCES if name == "LIBUSB_ERROR_ACCESS" else errno.EIO
            raise OSError(code, f"libusb_{what}: {name}")
        return rc

    def write(self, packet: bytes, note=""):
        if len(packet) > self.req_len:
            raise ValueError(f"packet {len(packet)} > report width {self.req_len}")
        packet = packet.ljust(self.req_len, b"\x00")
        self.log("out", packet, note)
        n = self.ct.c_int()
        self._chk(self.lib.libusb_interrupt_transfer(self.h, self.ep_out, packet, len(packet),
                                                     self.ct.byref(n), 5000), "write")

    def _rx(self, timeout_ms):
        buf = self.ct.create_string_buffer(self.resp_len)
        n = self.ct.c_int()
        rc = self.lib.libusb_interrupt_transfer(self.h, self.ep_in, buf, self.resp_len,
                                                self.ct.byref(n), max(1, int(timeout_ms)))
        if rc == -7:  # LIBUSB_ERROR_TIMEOUT
            return None
        self._chk(rc, "read")
        return buf.raw[: n.value]

    def read(self, timeout=10.0, note=""):
        data = self._rx(timeout * 1000)
        if data is None:
            self.log("timeout", b"", note)
            raise TimeoutError(f"no response within {timeout}s ({note})")
        self.log("in", data, note)
        return data

    def drain(self):
        while (data := self._rx(100)) is not None:
            self.log("in", data, "drain")

    def close(self):
        self.lib.libusb_release_interface(self.h, self.iface)
        self.lib.libusb_close(self.h)
        self.lib.libusb_exit(self.ctx)


def check(res: bytes, cmd: int):
    if not res or res[0] != SERVICE:
        raise RuntimeError(f"unexpected service byte in {res[:8].hex()}")
    if res[1] != cmd:
        raise RuntimeError(f"response for cmd 0x{res[1]:02x}, expected 0x{cmd:02x}: {res[:8].hex()}")
    if res[2] == ERR:
        raise RuntimeError(f"device error for cmd 0x{cmd:02x}: {res[:12].hex()}")


def read_file(link: Link, path: str, packets_per_read: int) -> bytes:
    res = link.command("Open", [enc_str(path), enc_str("R")], timeout=25)
    handle = res[5]
    size = int.from_bytes(res[7:11], "big") if len(res) >= 11 else 0
    out = bytearray()
    try:
        for _ in range(10_000):
            pkt = bytes([SERVICE, CMD["Read"], link.next_seq(), 2, *enc_byte(handle), *enc_byte(packets_per_read)])
            link.write(pkt, f"Read {path}")
            got = ended = False
            for _ in range(packets_per_read + 1):
                try:
                    p = link.read(25, f"Read {path}")
                except TimeoutError:
                    if got:
                        break
                    raise
                if p[0] == SERVICE:
                    check(p, CMD["Read"])
                    continue
                if p[0] == END_MARKER:
                    ended = True
                    break
                n = min(p[1], len(p) - 2)
                out += p[2 : 2 + n]
                got = True
                if size and len(out) >= size:
                    break
            if ended or not got or not size or len(out) >= size:
                break
    finally:
        try:
            link.command("Close", [enc_byte(handle)], timeout=30)
        except Exception as e:  # noqa: BLE001
            print(f"    (close failed: {e})")
    return bytes(out[:size] if size else out)


KV_RE = re.compile(r"^([^,=:\s]+)\s*(?:[,=:]|\s)\s*(.*)$")


def kv(text: str):
    """Same as parseKeyValueLines() in hid-protocol.ts (`,` `=` `:` or space)."""
    d = {}
    for line in text.splitlines():
        m = KV_RE.match(line.rstrip("\x00").strip())
        if m:
            d[m.group(1)] = m.group(2).strip()
    return d


# ---------------------------------------------------------------- main
def probe(dev, args, outdir: Path):
    rl = dev["report_lengths"]
    req = rl["output"] or 64
    resp = rl["input"] or 64
    stamp = time.strftime("%Y%m%d-%H%M%S")
    trace_path = outdir / f"usb-trace-{dev['pid']}-{stamp}.jsonl"
    result = {"device": dev, "trace": str(trace_path), "steps": {}}
    with trace_path.open("w") as trace:
        try:
            if "usb" in dev:
                link = UsbLink(dev["usb"], req, resp, trace)
                dev["descriptor_hex"] = link.report_descriptor.hex()
                dev["report_lengths_from_descriptor"] = report_lengths(link.report_descriptor)
            else:
                link = Link(dev["node"], req, resp, trace)
        except OSError as e:
            hint = " (try sudo, or add a udev rule)" if e.errno in (errno.EACCES, errno.EPERM) else ""
            result["error"] = f"open {dev['node']}: {e}{hint}"
            return result
        try:
            # identifyremote: soft reset -> Ping -> /sys/sysinfo
            link.command("Ping", [enc_byte(0)], expect=False)
            time.sleep(0.2)
            link.drain()
            link.reset_seq()
            try:
                link.command("Ping", [])
                result["steps"]["ping"] = "ok"
            except Exception as e:  # noqa: BLE001
                result["steps"]["ping"] = f"FAILED: {e}"
                return result
            link.reset_seq()
            try:
                raw = read_file(link, "/sys/sysinfo", 8)
                result["steps"]["sysinfo_raw"] = raw.decode("utf-8", "replace")
                result["steps"]["sysinfo"] = kv(raw.decode("utf-8", "replace"))
            except Exception as e:  # noqa: BLE001
                result["steps"]["sysinfo"] = f"FAILED: {e}"
            if args.properties:
                link.reset_seq()
                try:
                    raw = read_file(link, "/cfg/properties", 50)
                    props = kv(raw.decode("utf-8", "replace"))
                    # Don't keep the account email in a file meant for sharing.
                    if "account_email" in props:
                        props["account_email"] = "<redacted>"
                    result["steps"]["properties"] = props
                except Exception as e:  # noqa: BLE001
                    result["steps"]["properties"] = f"FAILED: {e}"
        finally:
            link.close()
    return result


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--list", action="store_true", help="enumerate only, no I/O")
    ap.add_argument("--node", action="append", default=[],
                    help="probe this /dev/hidrawN (or usb:BUS/DEV) even if its PID is not a known Harmony (repeatable)")
    ap.add_argument("--properties", action="store_true", help="also read /cfg/properties")
    ap.add_argument("--out", default=str(Path(__file__).resolve().parents[2] / "harmony-captures"),
                    help="output directory (default: ../harmony-captures next to the repo)")
    args = ap.parse_args()

    if not sys.platform.startswith("linux"):
        sys.exit("This probe uses Linux hidraw; on macOS/Windows use the app's USB page.")

    outdir = Path(args.out).expanduser()
    outdir.mkdir(parents=True, exist_ok=True)
    devs = list(hidraw_devices()) + list(usb_unbound_devices())
    summary = {"time": time.strftime("%Y-%m-%dT%H:%M:%S%z"), "devices": devs, "results": []}
    if not devs:
        print("No Logitech hidraw devices found. Is the hub/remote plugged in (and powered)?")
        print("Tip: `lsusb | grep -i 046d` should show it.")
    for d in devs:
        tag = "harmony" if d["known_harmony"] else "skip (not a known Harmony PID)"
        print(f"{d['node']}  {d['vid']}:{d['pid']}  {d['name']!r}  report in/out={d['report_lengths']}"
              f"  report_ids={d['uses_report_ids']}  [{tag}]")
    targets = [d for d in devs if d["known_harmony"] or d["node"] in args.node]
    if not args.list:
        if devs and not targets:
            print("\nNo known Harmony device found; nothing probed. Use --node /dev/hidrawN to force one.")
        for d in targets:
            print(f"\n== probing {d['node']} ==")
            r = probe(d, args, outdir)
            summary["results"].append(r)
            print(json.dumps({k: v for k, v in r.items() if k != "device"}, indent=2))
    out = outdir / f"usb-probe-{time.strftime('%Y%m%d-%H%M%S')}.json"
    out.write_text(json.dumps(summary, indent=2))
    try:
        sudo_uid = os.environ.get("SUDO_UID")
        if sudo_uid:  # hand files back to the invoking user
            for f in outdir.iterdir():
                os.chown(f, int(sudo_uid), int(os.environ.get("SUDO_GID", sudo_uid)))
            os.chown(outdir, int(sudo_uid), int(os.environ.get("SUDO_GID", sudo_uid)))
    except OSError:
        pass
    print(f"\nWrote {out}")


if __name__ == "__main__":
    main()
