/**
 * Harmony Hub USB HID provisioning.
 *
 * The hub exposes a file-system RPC protocol over HID reports.  Every exchange
 * is a sequence of Open → Write/Read → Close over virtual files such as
 * /sys/sysinfo and /sys/hlapi.
 *
 * Protocol reference (from decompiled Web.Driver.dll ROM templates):
 *
 *   Command packet (one HID output report):
 *     [0] service.id   = 0xFF
 *     [1] command.id
 *     [2] sequence.number  (0x00 for first)
 *     [3] parameter.number (count of params)
 *     [4..] params: typed
 *           byte    = 1 byte
 *           dword   = 4 bytes big-endian
 *           string  = NUL-terminated or length-prefixed per command
 *
 *   Data packet (follows a Write command):
 *     [0] 0x00  [1] 0x00  [2..] payload
 *
 *   Response:
 *     [0] 0xFF  [1] command.id echo  [2] status (0xFF = error)
 *     Open: [5]=file.handle  [7..10]=file.size (big-endian)
 *     Read: N packets of [seq][size][data…] ended by 0xFE marker
 *
 *   Command IDs:
 *     0x00 Ping
 *     0x01 Open
 *     0x03 Write
 *     0x04 Read
 *     0x05 Flush
 *     0x06 DevCtrl (checksum / IR)
 *     0x07 Close
 *     0x08 HBusCommand (JSON HBus message, hubs only)
 *     0xFF Reset
 */

import HID from 'node-hid';

// ---------------------------------------------------------------------------
// Device table (from DesktopServiceConfig.xml, embedded in MyHarmony MSI)
// ---------------------------------------------------------------------------

export interface HubDeviceSpec {
  vid: number;
  pid: number;
  skin: number;
  codename: string;
  model: string;
  /** True for standalone hubs; false for hub-paired remotes that need a hub. */
  isHub: boolean;
}

export const HUB_DEVICES: HubDeviceSpec[] = [
  // Standalone hubs (VID 0x046D, PID 0xC129) — all share the same PID
  { vid: 0x046D, pid: 0xC129, skin: 97,  codename: 'Pimento',     model: 'Harmony Hub',                isHub: true },
  { vid: 0x046D, pid: 0xC129, skin: 106, codename: 'Creemore',    model: 'Harmony Home Hub / Elite',   isHub: true },
  { vid: 0x046D, pid: 0xC129, skin: 400, codename: 'Brownie',     model: 'Harmony Hub (gen3)',         isHub: true },
  { vid: 0x046D, pid: 0xC131, skin: 113, codename: 'Pavarotti',   model: 'Harmony Express',            isHub: true },
  { vid: 0x046D, pid: 0xC132, skin: 115, codename: 'Crackerjack', model: 'Harmony Hub (Companion)',    isHub: true },
  // Hub-paired remotes (need a hub for cloud sync)
  { vid: 0x046D, pid: 0xC12B, skin: 99,  codename: 'Juniper',     model: 'Harmony Touch',              isHub: false },
  { vid: 0x046D, pid: 0xC12B, skin: 100, codename: 'JuniperRF',   model: 'Harmony Touch RF',           isHub: false },
  { vid: 0x046D, pid: 0xC12B, skin: 102, codename: 'Bulliet',     model: 'Harmony Ultimate One',       isHub: false },
  { vid: 0x046D, pid: 0xC12B, skin: 105, codename: 'NewCastle',   model: 'Harmony Ultimate',           isHub: false },
  { vid: 0x046D, pid: 0xC12B, skin: 108, codename: 'NewCastleWh', model: 'Harmony Ultimate (white)',   isHub: false },
  { vid: 0x046D, pid: 0xC12B, skin: 111, codename: 'Hops',        model: 'Harmony Elite',              isHub: false },
  { vid: 0x046D, pid: 0xC12B, skin: 112, codename: 'HopsLite',    model: 'Harmony Companion',          isHub: false },
  { vid: 0x046D, pid: 0xC12B, skin: 116, codename: 'Orville',     model: 'Harmony Hub (RF)',           isHub: false },
];

export interface SysInfo {
  arch?: string;
  skin?: number;
  fw_ver?: string;
  hw_ver?: string;
  fw_type?: string;
  guid?: string;
  serial_number?: string;
  raw: Record<string, string>;
}

export interface CfgProperties {
  host_name?: string;
  discovery_service_link?: string;
  account_email?: string;
  raw: Record<string, string>;
}

export interface ProvisionParams {
  /** Our server hostname, e.g. "svcs.myharmony.com" or "harmony.local". */
  domain: string;
  accountId: string;
  globalRemoteId: string;
  authToken: string;
  /** The key redirection lever — hub uses this for all future cloud contact. */
  discoveryServer: string;
  mode?: string;
}

// ---------------------------------------------------------------------------
// Low-level HID helpers
// ---------------------------------------------------------------------------

const SERVICE_ID = 0xFF;

const enum Cmd {
  Ping         = 0x00,
  Open         = 0x01,
  Write        = 0x03,
  Read         = 0x04,
  Flush        = 0x05,
  DevCtrl      = 0x06,
  Close        = 0x07,
  HBusCommand  = 0x08,
  Reset        = 0xFF,
}

function buildCommand(cmd: Cmd, params: Buffer): Buffer {
  const pkt = Buffer.alloc(64, 0); // default report length; overridden per device
  pkt[0] = SERVICE_ID;
  pkt[1] = cmd;
  pkt[2] = 0x00; // sequence
  pkt[3] = 0x00; // param count (not used in practice; params are inline)
  params.copy(pkt, 4);
  return pkt;
}

function encodeString(s: string): Buffer {
  return Buffer.concat([Buffer.from(s, 'ascii'), Buffer.from([0x00])]);
}

function encodeDword(n: number): Buffer {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(n, 0);
  return b;
}

// ---------------------------------------------------------------------------
// UsbHub — wraps node-hid for a single hub device
// ---------------------------------------------------------------------------

export class UsbHub {
  private device: HID.HID;
  private reportLen: number;

  constructor(devicePath: string, reportLen = 64) {
    this.device = new HID.HID(devicePath);
    this.reportLen = reportLen;
  }

  close(): void {
    try { this.device.close(); } catch { /* ignore */ }
  }

  private async write(packet: Buffer): Promise<void> {
    const padded = Buffer.alloc(this.reportLen + 1, 0); // +1 for HID report ID 0x00
    packet.copy(padded, 1);
    return new Promise((resolve, reject) => {
      try {
        this.device.write([...padded]);
        resolve();
      } catch (e) { reject(e); }
    });
  }

  private async read(timeoutMs = 5000): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('HID read timeout')), timeoutMs);
      this.device.read((err, data) => {
        clearTimeout(timer);
        if (err) return reject(err);
        resolve(Buffer.from(data));
      });
    });
  }

  async ping(): Promise<void> {
    const cmd = buildCommand(Cmd.Ping, Buffer.from([0x00]));
    await this.write(cmd);
    await this.read();
  }

  async openFile(path: string, mode: 'R' | 'W', size?: number): Promise<number> {
    const params = Buffer.concat([
      encodeString(path),
      encodeString(mode),
      ...(size !== undefined ? [encodeDword(size)] : []),
    ]);
    const cmd = buildCommand(Cmd.Open, params);
    await this.write(cmd);
    const resp = await this.read();
    if (resp[0] !== 0xFF || resp[2] === 0xFF) {
      throw new Error(`Open failed for ${path}: status=${resp[2]?.toString(16)}`);
    }
    const handle = resp[5];
    return handle;
  }

  async readFile(handle: number): Promise<Buffer> {
    const params = Buffer.concat([Buffer.from([handle]), encodeDword(64)]);
    const cmd = buildCommand(Cmd.Read, params);
    await this.write(cmd);

    const chunks: Buffer[] = [];
    while (true) {
      const pkt = await this.read();
      if (pkt[0] === 0xFE) break; // end marker
      const size = pkt[1];
      chunks.push(pkt.slice(2, 2 + size));
    }
    return Buffer.concat(chunks);
  }

  async writeFile(handle: number, data: Buffer): Promise<void> {
    const dataLen = data.length;
    const packetDataSize = this.reportLen - 2;
    const nPackets = Math.ceil(dataLen / packetDataSize);

    // Write command
    const writeCmd = buildCommand(Cmd.Write, Buffer.concat([
      Buffer.from([handle]),
      encodeDword(nPackets),
    ]));
    await this.write(writeCmd);

    // Data packets
    for (let i = 0; i < nPackets; i++) {
      const chunk = data.slice(i * packetDataSize, (i + 1) * packetDataSize);
      const dataPkt = Buffer.alloc(this.reportLen, 0);
      dataPkt[0] = 0x00;
      dataPkt[1] = 0x00;
      chunk.copy(dataPkt, 2);
      await this.write(dataPkt);
    }

    const resp = await this.read();
    if (resp[0] !== 0xFF || resp[2] === 0xFF) {
      throw new Error(`Write failed: status=${resp[2]?.toString(16)}`);
    }
  }

  async flush(handle: number): Promise<void> {
    const cmd = buildCommand(Cmd.Flush, Buffer.from([handle]));
    await this.write(cmd);
    await this.read();
  }

  async closeFile(handle: number): Promise<void> {
    const cmd = buildCommand(Cmd.Close, Buffer.from([handle]));
    await this.write(cmd);
    await this.read();
  }

  // ---------------------------------------------------------------------------
  // High-level operations
  // ---------------------------------------------------------------------------

  async readSysInfo(): Promise<SysInfo> {
    const handle = await this.openFile('/sys/sysinfo', 'R');
    const raw = await this.readFile(handle);
    await this.closeFile(handle);
    return parseSysInfo(raw.toString('ascii'));
  }

  async readCfgProperties(): Promise<CfgProperties> {
    const handle = await this.openFile('/cfg/properties', 'R');
    const raw = await this.readFile(handle);
    await this.closeFile(handle);
    return parseCfgProperties(raw.toString('ascii'));
  }

  /**
   * Write a JSON object to /sys/hlapi — the hub's high-level provisioning API.
   * This is the mechanism for setting the hub's discoveryServer (cloud redirect).
   */
  async writeHlapi(payload: object): Promise<void> {
    const json = JSON.stringify(payload);
    const data = Buffer.from(json, 'utf8');
    const handle = await this.openFile('/sys/hlapi', 'W', data.length);
    await this.writeFile(handle, data);
    await this.flush(handle);
    await this.closeFile(handle);
  }

  /**
   * Provision the hub: write auth token and server URL into /sys/hlapi.
   *
   * The `discoveryServer` field is the key redirection lever — the hub will
   * contact this URL for all subsequent cloud operations.
   */
  async provision(params: ProvisionParams): Promise<void> {
    const payload = {
      command: 'account?provision',
      params: {
        provisionInfo: {
          domain: params.domain,
          accountId: params.accountId,
          globalRemoteId: params.globalRemoteId,
          authToken: params.authToken,
          discoveryServer: params.discoveryServer,
          mode: params.mode ?? '1',
        },
      },
    };
    await this.writeHlapi(payload);
  }

  /**
   * Identify + return sysinfo.  Standard sequence:
   *   Ping → Open(/sys/sysinfo, R) → Read → Close
   */
  async identify(): Promise<SysInfo> {
    await this.ping();
    return this.readSysInfo();
  }
}

// ---------------------------------------------------------------------------
// Parsers
// ---------------------------------------------------------------------------

function parseKV(raw: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of raw.split('\n')) {
    const comma = line.indexOf(',');
    if (comma === -1) continue;
    const key = line.slice(0, comma).trim();
    const val = line.slice(comma + 1).trim().replace(/\0/g, '');
    if (key) result[key] = val;
  }
  return result;
}

function parseSysInfo(raw: string): SysInfo {
  const kv = parseKV(raw);
  return {
    arch:          kv['arch'],
    skin:          kv['skin'] != null ? parseInt(kv['skin'], 10) : undefined,
    fw_ver:        kv['fw_ver'],
    hw_ver:        kv['hw_ver'],
    fw_type:       kv['fw_type'],
    guid:          kv['guid'],
    serial_number: kv['serial_number'],
    raw:           kv,
  };
}

function parseCfgProperties(raw: string): CfgProperties {
  const kv = parseKV(raw);
  return {
    host_name:             kv['host_name'],
    discovery_service_link: kv['discovery_service_link'],
    account_email:         kv['account_email'],
    raw:                   kv,
  };
}

// ---------------------------------------------------------------------------
// Device enumeration
// ---------------------------------------------------------------------------

export interface FoundHub {
  devicePath: string;
  vendorId: number;
  productId: number;
  spec: HubDeviceSpec | undefined;
}

export function listConnectedHubs(): FoundHub[] {
  const hidDevices = HID.devices();
  return hidDevices
    .filter(d =>
      HUB_DEVICES.some(h => h.vid === d.vendorId && h.pid === d.productId)
    )
    .map(d => ({
      devicePath: d.path ?? '',
      vendorId: d.vendorId ?? 0,
      productId: d.productId ?? 0,
      spec: HUB_DEVICES.find(h => h.vid === d.vendorId && h.pid === d.productId),
    }))
    .filter(d => d.devicePath !== '');
}

/**
 * Find the HubDeviceSpec that matches a skin number.
 * Skin is read from /sys/sysinfo after Open — use this to get the exact model.
 */
export function specForSkin(skin: number): HubDeviceSpec | undefined {
  return HUB_DEVICES.find(h => h.skin === skin);
}
