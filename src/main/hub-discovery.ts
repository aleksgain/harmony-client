import dgram from 'node:dgram';
import net from 'node:net';
import { EventEmitter } from 'node:events';

/**
 * Harmony "reverse bonjour" discovery.
 *
 * Instead of answering mDNS, Harmony hubs listen on UDP 5224 for a broadcast
 * naming a TCP port. Each hub then *connects back* to that TCP port on the
 * sender's address and writes a `key:value;` string describing itself, e.g.
 *
 *   uuid:1a2b...;ip:192.168.1.40;friendlyName:Living Room;remoteId:1234567;
 *   current_fw_version:4.15.600;...
 *
 * Some community docs show `key=value` instead of `key:value`; we accept both.
 * The hub closes the socket after writing, so we parse on 'end'.
 */

const BROADCAST_ADDR = '255.255.255.255';
const BROADCAST_PORT = 5224;
const DEFAULT_LISTEN_PORT = 61991;
const BROADCAST_INTERVAL_MS = 3_000;

export interface DiscoveredHubInfo {
  uuid: string;
  ip: string;
  friendlyName: string;
  remoteId?: string;
  hubSwVersion?: string;
  raw: Record<string, string>;
}

export function parseDiscoveryResponse(payload: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of payload.split(';')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    // Split on the first ':' or '=' only — values (e.g. URLs) may contain colons.
    const m = /^([^:=]+)[:=](.*)$/s.exec(trimmed);
    if (m && m[1] && m[2] !== undefined) out[m[1].trim()] = m[2].trim();
  }
  return out;
}

interface DiscoveryEvents {
  hub: [DiscoveredHubInfo];
  error: [Error];
}

export class HubDiscovery extends EventEmitter<DiscoveryEvents> {
  private udp: dgram.Socket | null = null;
  private tcp: net.Server | null = null;
  private timer: NodeJS.Timeout | null = null;
  private listenPort = DEFAULT_LISTEN_PORT;
  private readonly seen = new Map<string, DiscoveredHubInfo>();

  get running(): boolean {
    return this.timer !== null;
  }

  get hubs(): DiscoveredHubInfo[] {
    return [...this.seen.values()];
  }

  async start(): Promise<void> {
    if (this.running) {
      this.broadcast();
      return;
    }
    this.listenPort = await this.startTcpListener();
    await this.startUdp();
    this.broadcast();
    this.timer = setInterval(() => this.broadcast(), BROADCAST_INTERVAL_MS);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.udp?.close();
    this.udp = null;
    this.tcp?.close();
    this.tcp = null;
  }

  /** Try 61991 first (convention), fall back to an ephemeral port. */
  private startTcpListener(): Promise<number> {
    const listen = (port: number): Promise<number> =>
      new Promise((resolve, reject) => {
        const server = net.createServer((sock) => this.onHubConnection(sock));
        server.once('error', reject);
        server.listen(port, '0.0.0.0', () => {
          server.removeListener('error', reject);
          server.on('error', (e) => this.emit('error', e));
          this.tcp = server;
          const addr = server.address();
          resolve(typeof addr === 'object' && addr ? addr.port : port);
        });
      });
    return listen(DEFAULT_LISTEN_PORT).catch(() => listen(0));
  }

  private startUdp(): Promise<void> {
    return new Promise((resolve, reject) => {
      const sock = dgram.createSocket({ type: 'udp4', reuseAddr: true });
      sock.once('error', reject);
      sock.bind(0, () => {
        sock.removeListener('error', reject);
        sock.setBroadcast(true);
        sock.on('error', (e) => this.emit('error', e));
        this.udp = sock;
        resolve();
      });
    });
  }

  private broadcast(): void {
    if (!this.udp) return;
    // Trailing newline matches what the official apps send; hubs accept both.
    const msg = Buffer.from(`_logitech-reverse-bonjour._tcp.local.\n${this.listenPort}\n`);
    this.udp.send(msg, BROADCAST_PORT, BROADCAST_ADDR, (err) => {
      if (err) this.emit('error', err);
    });
  }

  private onHubConnection(sock: net.Socket): void {
    const chunks: Buffer[] = [];
    sock.setTimeout(5_000, () => sock.destroy());
    sock.on('data', (c: Buffer) => chunks.push(c));
    sock.on('error', () => sock.destroy());
    sock.on('end', () => {
      const fields = parseDiscoveryResponse(Buffer.concat(chunks).toString('utf8'));
      const ip = fields.ip ?? sock.remoteAddress?.replace(/^::ffff:/, '') ?? '';
      const uuid = fields.uuid ?? (fields.remoteId ? `remote-${fields.remoteId}` : ip);
      if (!uuid || !ip) return;
      const info: DiscoveredHubInfo = {
        uuid,
        ip,
        friendlyName: fields.friendlyName ?? 'Harmony Hub',
        remoteId: fields.remoteId,
        hubSwVersion: fields.current_fw_version ?? fields.hubSwVersion,
        raw: fields,
      };
      this.seen.set(uuid, info);
      this.emit('hub', info);
    });
  }
}
