import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import type { HIDAsync, Device as HidDevice } from 'node-hid';
import {
  HUB_MODEL_IDS,
  USB_MODEL_NAMES,
  modelForSkin,
  modelsForVidPid,
  normalizeDiscoveryServer,
  supports,
  type CfgProperties,
  type HlapiResponse,
  type ProvisionParams,
  type SysInfo,
  type UsbHubDevice,
  type UsbIdentifyResult,
  type UsbOperation,
} from '@shared/usb';
import {
  CMD,
  SequenceCounter,
  buildCommand,
  buildDataPackets,
  dotnetUrlEncode,
  p,
  parseCommandResponse,
  parseDataPacket,
  parseKeyValueLines,
  parseOpenResponse,
  reportLengthsFromDescriptor,
  type CommandId,
  type Param,
} from './hid-protocol';

/**
 * USB HID access to Harmony hubs / hub-paired remotes, implementing the
 * operations MyHarmony's ROM templates describe (identifyremote,
 * saveprovisioninfo, getprovisioninfo, factoryreset).
 *
 * node-hid is a native module and is loaded lazily, so the rest of the app
 * still works if it failed to build for this platform.
 */

const DEFAULT_REPORT_LENGTH = 64;
/** Packets requested per Read command (identifyremote uses 8, hlapi 50). */
const SYSINFO_READ_PACKETS = 8;
const HLAPI_READ_PACKETS = 50;
/** Data packets per Write command (saveprovisioninfo: packets.number = 50). */
const WRITE_CHUNK_PACKETS = 50;
const HLAPI_PATH = '/sys/hlapi';

type NodeHid = typeof import('node-hid');
let hidModule: NodeHid | null = null;
let hidLoadError: string | null = null;

async function loadHid(): Promise<NodeHid> {
  if (hidModule) return hidModule;
  if (hidLoadError) throw new Error(hidLoadError);
  try {
    const mod = (await import('node-hid')) as NodeHid & { default?: NodeHid };
    hidModule = mod.default ?? mod;
    return hidModule;
  } catch (err) {
    hidLoadError = `USB support unavailable: node-hid failed to load (${(err as Error).message})`;
    throw new Error(hidLoadError);
  }
}

/**
 * Report sizes. MyHarmony takes these from the device (unit.RequestPacketSize /
 * ResponsePacketSize). node-hid has no descriptor API, so on Linux we parse
 * /sys/class/hidraw/<n>/device/report_descriptor and otherwise fall back to 64
 * (the full-speed HID maximum, and what these devices are expected to use).
 */
async function detectReportLengths(path: string): Promise<{ request: number; response: number }> {
  if (process.platform === 'linux' && path.startsWith('/dev/hidraw')) {
    try {
      const desc = await readFile(`/sys/class/hidraw/${basename(path)}/device/report_descriptor`);
      const { input, output } = reportLengthsFromDescriptor(desc);
      if (input > 0 && output > 0) return { request: output, response: input };
    } catch {
      /* fall through */
    }
  }
  return { request: DEFAULT_REPORT_LENGTH, response: DEFAULT_REPORT_LENGTH };
}

/** One open HID connection, serialising all I/O. */
class HidLink {
  private queue: Promise<unknown> = Promise.resolve();

  private constructor(
    private readonly dev: HIDAsync,
    readonly requestLength: number,
    readonly responseLength: number,
  ) {}

  static async open(path: string): Promise<HidLink> {
    const hid = await loadHid();
    const dev = await hid.HIDAsync.open(path);
    const { request, response } = await detectReportLengths(path);
    return new HidLink(dev, request, response);
  }

  close(): Promise<void> {
    return this.dev.close();
  }

  /** Run `fn` with exclusive access to the device. */
  exclusive<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.queue.then(fn, fn);
    this.queue = run.catch(() => undefined);
    return run;
  }

  /** hidapi wants the report id as byte 0; these devices use none (0x00). */
  async write(packet: Buffer): Promise<void> {
    await this.dev.write(Buffer.concat([Buffer.from([0x00]), packet]));
  }

  async read(timeoutMs: number): Promise<Buffer> {
    const buf = await this.dev.read(timeoutMs);
    if (!buf || buf.length === 0) throw new Error(`USB read timed out after ${timeoutMs} ms`);
    return buf;
  }
}

/**
 * One "operation" in MyHarmony terms: a sequence of commands sharing a packet
 * sequence counter (RomBuilder enables SequenceNumber per operation).
 */
class Operation {
  private readonly seq = new SequenceCounter();

  constructor(private readonly link: HidLink) {}

  private get width(): number {
    return this.link.requestLength;
  }

  async command(
    cmd: CommandId,
    params: Param[],
    opts: { timeoutMs?: number; expectResponse?: boolean; declaredParamCount?: number } = {},
  ): Promise<Buffer | null> {
    await this.link.write(buildCommand(this.width, cmd, params, this.seq.next(), opts.declaredParamCount));
    if (opts.expectResponse === false) return null;
    const res = await this.link.read(opts.timeoutMs ?? 10_000);
    parseCommandResponse(res, cmd);
    return res;
  }

  /** Ping with param 0 is how MyHarmony "simulates ResetUsb"; no reply expected. */
  async softReset(): Promise<void> {
    await this.command(CMD.Ping, [p.byte(0)], { expectResponse: false });
    await new Promise((r) => setTimeout(r, 200));
    // Drain anything the device may still send.
    try {
      await this.link.read(100);
    } catch {
      /* nothing pending */
    }
  }

  async ping(): Promise<void> {
    await this.command(CMD.Ping, [], { timeoutMs: 10_000 });
  }

  async openRead(path: string): Promise<{ handle: number; size: number }> {
    const res = await this.command(CMD.Open, [p.string(path), p.string('R')], { timeoutMs: 25_000 });
    return parseOpenResponse(res as Buffer);
  }

  /**
   * Open for writing. The saveprovisioninfo template sends three params
   * (path, "W", dword size) but declares `parameter.number = 0x02`; we mirror
   * the template byte-for-byte rather than "fixing" it.
   */
  async openWrite(path: string, size?: number): Promise<number> {
    const params = [p.string(path), p.string('W')];
    if (size !== undefined) params.push(p.dword(size));
    const res = await this.command(CMD.Open, params, { timeoutMs: 120_000, declaredParamCount: 2 });
    return parseOpenResponse(res as Buffer).handle;
  }

  /**
   * Read `size` bytes. Each Read command asks for N packets; the device
   * answers with a command echo (FF 04 ..), then up to N data packets
   * `[seq][len][data]`, terminating early with a 0xFE packet at EOF.
   */
  async readAll(handle: number, size: number, packetsPerRead: number): Promise<Buffer> {
    const chunks: Buffer[] = [];
    let total = 0;
    let guard = 0;
    while (total < size || (size === 0 && guard === 0)) {
      if (++guard > 10_000) throw new Error('USB read did not terminate');
      await this.link.write(
        buildCommand(this.width, CMD.Read, [p.byte(handle), p.byte(packetsPerRead)], this.seq.next()),
      );
      let gotData = false;
      let ended = false;
      for (let i = 0; i < packetsPerRead + 1; i++) {
        let pkt: Buffer;
        try {
          pkt = await this.link.read(25_000);
        } catch (err) {
          if (gotData) break;
          throw err;
        }
        if (pkt[0] === 0xff) {
          parseCommandResponse(pkt, CMD.Read); // header/echo
          continue;
        }
        const data = parseDataPacket(pkt);
        if (data === null) {
          ended = true;
          break;
        }
        gotData = true;
        chunks.push(data);
        total += data.length;
        if (size > 0 && total >= size) break;
      }
      if (ended || !gotData || size === 0) break;
    }
    return Buffer.concat(chunks).subarray(0, size > 0 ? size : undefined);
  }

  async writeAll(handle: number, data: Buffer, countParam: 'byte' | 'word' = 'byte'): Promise<void> {
    const packets = buildDataPackets(this.width, data, this.seq);
    if (packets.length === 0) {
      // e.g. factoryreset: Write(handle, word 0) with no data packets.
      await this.command(CMD.Write, [p.byte(handle), countParam === 'word' ? p.word(0) : p.byte(0)], {
        timeoutMs: 120_000,
      });
      return;
    }
    for (let i = 0; i < packets.length; i += WRITE_CHUNK_PACKETS) {
      const batch = packets.slice(i, i + WRITE_CHUNK_PACKETS);
      const count = countParam === 'word' ? p.word(batch.length) : p.byte(batch.length);
      // Command packet takes its sequence number before the data packets'.
      await this.link.write(
        buildCommand(this.width, CMD.Write, [p.byte(handle), count], this.seq.next()),
      );
      for (const pkt of batch) await this.link.write(pkt);
      parseCommandResponse(await this.link.read(120_000), CMD.Write);
    }
  }

  async close(handle: number): Promise<void> {
    await this.command(CMD.Close, [p.byte(handle)], { timeoutMs: 30_000 });
  }

  async readFile(path: string, packetsPerRead: number): Promise<Buffer> {
    const { handle, size } = await this.openRead(path);
    try {
      return await this.readAll(handle, size, packetsPerRead);
    } finally {
      await this.close(handle).catch(() => undefined);
    }
  }
}

function fwLessThan(version: string | undefined, target: [number, number, number]): boolean {
  if (!version) return false;
  const parts = version.split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    const a = parts[i] ?? 0;
    const b = target[i] ?? 0;
    if (a !== b) return a < b;
  }
  return false;
}

export class UsbHubService {
  private readonly identified = new Map<string, UsbIdentifyResult>();

  async listDevices(): Promise<UsbHubDevice[]> {
    const hid = await loadHid();
    const all: HidDevice[] = await hid.devicesAsync();
    const out = new Map<string, UsbHubDevice>();
    for (const d of all) {
      if (!d.path) continue;
      const models = modelsForVidPid(d.vendorId, d.productId);
      if (models.length === 0) continue;
      out.set(d.path, {
        path: d.path,
        vid: d.vendorId,
        pid: d.productId,
        product: d.product,
        serialNumber: d.serialNumber,
        candidates: models.map((m) => ({
          modelId: m.modelId,
          codename: m.codename,
          kind: HUB_MODEL_IDS.has(m.modelId) ? 'hub' : 'remote',
        })),
      });
    }
    return [...out.values()];
  }

  private async withDevice<T>(path: string, fn: (op: Operation, link: HidLink) => Promise<T>): Promise<T> {
    const link = await HidLink.open(path);
    try {
      return await link.exclusive(() => fn(new Operation(link), link));
    } finally {
      await link.close().catch(() => undefined);
    }
  }

  /** identifyremote: soft reset → Ping → Open(/sys/sysinfo,R) → Read → Close. */
  async identify(path: string): Promise<UsbIdentifyResult> {
    return this.withDevice(path, async (op, link) => {
      await op.softReset();
      await op.ping();
      const raw = await op.readFile('/sys/sysinfo', SYSINFO_READ_PACKETS);
      const sysinfo = parseKeyValueLines(raw.toString('utf8')) as SysInfo;
      const skin = Number(sysinfo.skin);
      const model = Number.isFinite(skin) ? modelForSkin(skin) : null;
      const result: UsbIdentifyResult = {
        path,
        sysinfo,
        model,
        kind: model ? (HUB_MODEL_IDS.has(model.modelId) ? 'hub' : 'remote') : null,
        displayName: model
          ? `${USB_MODEL_NAMES[model.modelId] ?? model.codename} (${model.codename})`
          : `Unknown Harmony device (skin ${sysinfo.skin ?? '?'})`,
        operations: model ? [...model.operations] : ['identifyremote'],
        requestPacketLength: link.requestLength,
        responsePacketLength: link.responseLength,
      };
      this.identified.set(path, result);
      return result;
    });
  }

  private async ensureIdentified(path: string): Promise<UsbIdentifyResult> {
    return this.identified.get(path) ?? this.identify(path);
  }

  private async requireOp(path: string, opName: UsbOperation): Promise<UsbIdentifyResult> {
    const id = await this.ensureIdentified(path);
    if (!supports(id.operations, opName)) {
      throw new Error(`${id.displayName} does not support "${opName}" over USB`);
    }
    return id;
  }

  /**
   * `/cfg/properties` (host_name, discovery_service_link, account_email).
   * No hub skin ships a getproperties template — MyHarmony only used it on
   * skin 82 — so this is best-effort on hubs.
   */
  async readProperties(path: string): Promise<CfgProperties> {
    await this.ensureIdentified(path);
    return this.withDevice(path, async (op) => {
      const raw = await op.readFile('/cfg/properties', HLAPI_READ_PACKETS);
      return parseKeyValueLines(raw.toString('utf8')) as CfgProperties;
    });
  }

  async getFirmwareVersion(path: string): Promise<string> {
    const id = await this.identify(path);
    return id.sysinfo.fw_ver ?? '';
  }

  /**
   * HLAPI round-trip over /sys/hlapi:
   * Open(W,size) → Write(text) → Close → Open(R) → Read → Close.
   * (No Flush: the hub templates don't issue one for /sys/hlapi.)
   */
  async hlapi(path: string, request: string): Promise<HlapiResponse> {
    return this.withDevice(path, async (op) => {
      const body = Buffer.from(request, 'utf8');
      const wh = await op.openWrite(HLAPI_PATH, body.length);
      try {
        await op.writeAll(wh, body);
      } finally {
        await op.close(wh).catch(() => undefined);
      }
      const reply = await op.readFile(HLAPI_PATH, HLAPI_READ_PACKETS);
      const text = reply.toString('utf8').replace(/\0+$/, '').trim();
      try {
        return JSON.parse(text) as HlapiResponse;
      } catch {
        return { errorCode: undefined, errorMessage: 'Non-JSON response', raw: text };
      }
    });
  }

  async getProvisionInfo(path: string): Promise<HlapiResponse> {
    await this.requireOp(path, 'getprovisioninfo');
    return this.hlapi(path, 'vnd.logitech.setup/vnd.logitech.account?getProvisionInfo');
  }

  /**
   * Claim the hub and point it at a discovery server. Mirrors
   * ProvisionController.SaveProvision(): field order, skin-97 variant
   * (email + name instead of accountId), the `//svcs` → `//lb-svcs`
   * rewrite for firmware < 4.14.18, and .NET-style URL encoding.
   */
  async provision(path: string, params: ProvisionParams): Promise<HlapiResponse> {
    const id = await this.requireOp(path, 'saveprovisioninfo');
    const skin = id.sysinfo.skin ?? '';

    let discoveryServer = normalizeDiscoveryServer(params.discoveryServer);
    const isLogitech = new URL(discoveryServer).hostname === 'svcs.myharmony.com';
    if (isLogitech && (skin === '97' || skin === '106') && fwLessThan(id.sysinfo.fw_ver, [4, 14, 18])) {
      discoveryServer = discoveryServer.replace('//svcs', '//lb-svcs');
    }

    const fields: [string, string][] = [['authToken', params.authToken]];
    if (skin === '97') {
      fields.push(['email', params.email], ['name', params.name ?? '']);
    } else {
      fields.push(['accountId', params.accountId]);
    }
    fields.push(
      ['language', params.language ?? 'en-US'],
      ['username', params.email],
      ['discoveryServer', discoveryServer],
      ['mode', params.mode ?? '1'],
      ['activeRemoteId', params.activeRemoteId ?? ''],
      ['susChannel', params.susChannel ?? 'production'],
    );
    const json = `{${fields.map(([k, v]) => `${JSON.stringify(k)}:${JSON.stringify(v)}`).join(',')}}`;
    const request = `vnd.logitech.setup/vnd.logitech.account?provision&provisionInfo=${dotnetUrlEncode(json)}`;

    const res = await this.hlapi(path, request);
    if (String(res.errorCode ?? '') !== '200') {
      throw new Error(`Hub rejected provisioning: ${res.errorCode ?? '?'} ${res.errorMessage ?? ''}`.trim());
    }
    return res;
  }

  /**
   * factoryreset template: Open(/sys/factoryreset,W) → Write(word 0) → Close,
   * then the same against /sys/reboot.
   */
  async factoryReset(path: string): Promise<void> {
    await this.requireOp(path, 'factoryreset');
    await this.withDevice(path, async (op) => {
      for (const file of ['/sys/factoryreset', '/sys/reboot']) {
        const h = await op.openWrite(file);
        await op.writeAll(h, Buffer.alloc(0), 'word');
        await op.close(h).catch(() => undefined);
      }
    });
    this.identified.delete(path);
  }
}

