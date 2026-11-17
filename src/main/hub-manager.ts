import { EventEmitter } from 'node:events';
import { normalizeDeviceType } from '@shared/device-types';
import type {
  Activity,
  HarmonyConfig,
  HarmonyDevice,
  Hub,
  HubNotification,
  HubStatus,
  StateDigest,
} from '@shared/harmony';
import { HubDiscovery, type DiscoveredHubInfo } from './hub-discovery';
import type { HubTransport } from './hub-transport';
import { fetchProvisionInfo, HubWebSocket, HUB_WS_PORT } from './hub-websocket';
import { HubXmpp } from './hub-xmpp';
import { getSettings, rememberHub } from './store';

/** Mime prefix for most engine commands. */
const ENGINE = 'vnd.logitech.harmony/vnd.logitech.harmony.engine';
const GET_JSON = { verb: 'get', format: 'json' } as const;

const RECONNECT_BASE_MS = 2_000;
const RECONNECT_MAX_MS = 60_000;

interface ManagerEvents {
  discovered: [Hub];
  status: [HubStatus];
  stateChange: [HubNotification<StateDigest>];
  activityChanged: [HubNotification<{ activityId: string; errorCode?: string }>];
  notification: [HubNotification];
}

/** Raw config shape from the hub; device.type is a string, ids may be numbers. */
interface RawHubConfig {
  activity?: (Partial<Activity> & { id?: string | number })[];
  device?: (Partial<HarmonyDevice> & { id?: string | number; type?: unknown })[];
  configVersion?: number;
  [extra: string]: unknown;
}

function normalizeConfig(raw: RawHubConfig): HarmonyConfig {
  const devices: HarmonyDevice[] = (raw.device ?? []).map((d) => ({
    ...d,
    id: String(d.id ?? ''),
    label: d.label ?? 'Unnamed device',
    type: normalizeDeviceType(d.type),
    manufacturer: d.manufacturer ?? '',
    model: d.model ?? '',
    controlGroup: d.controlGroup ?? [],
  }));
  const activities: Activity[] = (raw.activity ?? []).map((a) => {
    const fixitIds = a.fixit ? Object.keys(a.fixit) : [];
    return {
      ...a,
      id: String(a.id ?? ''),
      label: a.label ?? 'Unnamed activity',
      // The hub doesn't carry an explicit device list; it's implied by fixit keys.
      devices: a.devices ?? fixitIds,
    };
  });
  return { activity: activities, device: devices, configVersion: raw.configVersion };
}

/**
 * One live connection to one hub. Picks a transport (WS preferred, XMPP
 * fallback), reconnects with exponential backoff, and translates logical
 * operations into transport-specific commands.
 */
class HubSession {
  private transport: HubTransport | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private attempts = 0;
  private wantConnected = false;
  status: HubStatus;

  constructor(
    public hub: Hub,
    private readonly mgr: HubManager,
  ) {
    this.status = { hubId: hub.id, state: 'disconnected', transport: null };
  }

  async connect(): Promise<void> {
    this.wantConnected = true;
    if (this.transport?.isOpen) return;
    this.setStatus({ state: 'connecting', error: undefined });
    try {
      // Always refresh the remote id: it changes if the hub is re-provisioned.
      const info = await fetchProvisionInfo(this.hub.ip);
      this.hub = { ...this.hub, activeRemoteId: String(info.activeRemoteId) };
      this.transport = await this.openTransport();
      this.attempts = 0;
      this.hub.connected = true;
      this.setStatus({ state: 'connected', transport: this.transport.kind });
      this.mgr.upsertHub(this.hub);
    } catch (err) {
      this.setStatus({ state: 'error', error: (err as Error).message, transport: null });
      this.scheduleReconnect();
      throw err;
    }
  }

  disconnect(): void {
    this.wantConnected = false;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.transport?.removeAllListeners();
    this.transport?.close();
    this.transport = null;
    this.hub.connected = false;
    this.setStatus({ state: 'disconnected', transport: null });
  }

  private async openTransport(): Promise<HubTransport> {
    const preferred = getSettings().preferredTransport;
    const order: ('websocket' | 'xmpp')[] =
      preferred === 'xmpp' ? ['xmpp', 'websocket'] : ['websocket', 'xmpp'];
    let lastErr: Error | null = null;
    for (const kind of order) {
      const t: HubTransport =
        kind === 'websocket' ? new HubWebSocket(this.hub.ip, this.hub.activeRemoteId) : new HubXmpp(this.hub.ip);
      try {
        await t.open();
        this.wire(t);
        return t;
      } catch (err) {
        lastErr = err as Error;
        t.removeAllListeners();
        t.close();
      }
    }
    throw lastErr ?? new Error('No transport available');
  }

  private wire(t: HubTransport): void {
    t.on('close', () => {
      this.hub.connected = false;
      this.transport = null;
      if (this.wantConnected) {
        this.setStatus({ state: 'connecting', transport: null });
        this.scheduleReconnect();
      } else {
        this.setStatus({ state: 'disconnected', transport: null });
      }
    });
    t.on('error', () => {
      /* surfaced through close + status; swallow to avoid unhandled 'error' */
    });
    t.on('notification', (type, data) => this.onNotification(type, data));
  }

  private onNotification(type: string, data: unknown): void {
    const hubId = this.hub.id;
    this.mgr.emit('notification', { hubId, type, data });
    if (type === 'connect.stateDigest?notify') {
      this.mgr.emit('stateChange', { hubId, type, data: data as StateDigest });
    } else if (type === 'harmony.engine?startActivityFinished') {
      // WS sends JSON; XMPP sends `activityId=..:errorCode=..`. Both decode to an object.
      const d = (data ?? {}) as { activityId?: string | number; errorCode?: string | number };
      this.mgr.emit('activityChanged', {
        hubId,
        type,
        data: { activityId: String(d.activityId ?? ''), errorCode: d.errorCode?.toString() },
      });
    }
  }

  private scheduleReconnect(): void {
    if (!this.wantConnected || this.reconnectTimer) return;
    const delay = Math.min(RECONNECT_BASE_MS * 2 ** this.attempts, RECONNECT_MAX_MS);
    this.attempts += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect().catch(() => undefined);
    }, delay);
  }

  private setStatus(patch: Partial<HubStatus>): void {
    this.status = { ...this.status, ...patch };
    this.mgr.emit('status', this.status);
  }

  private require(): HubTransport {
    if (!this.transport?.isOpen) throw new Error(`Hub ${this.hub.friendlyName} is not connected`);
    return this.transport;
  }

  // --- logical operations -------------------------------------------------

  async getConfig(): Promise<HarmonyConfig> {
    const raw = await this.require().request<RawHubConfig>(`${ENGINE}?config`, GET_JSON, {
      timeoutSec: 30, // configs with many devices are large; the hub is slow
    });
    return normalizeConfig(raw ?? {});
  }

  async getCurrentActivity(): Promise<string> {
    const res = await this.require().request<{ result?: string | number }>(
      `${ENGINE}?getCurrentActivity`,
      GET_JSON,
    );
    return String(res?.result ?? '-1');
  }

  async getStateDigest(): Promise<StateDigest> {
    return this.require().request<StateDigest>('vnd.logitech.connect/vnd.logitech.statedigest?get', GET_JSON);
  }

  async startActivity(activityId: string): Promise<void> {
    const t = this.require();
    if (t.kind === 'xmpp') {
      await t.request(`${ENGINE}?startactivity`, { activityId, timestamp: Date.now() }, { wait: 'ack', timeoutSec: 10 });
      return;
    }
    // `async: "true"` makes the hub ack immediately (code 100) and report
    // completion via `harmony.engine?startActivityFinished`.
    await t.request(
      'harmony.activityengine?runactivity',
      { async: 'true', timestamp: 0, activityId },
      { wait: 'ack', timeoutSec: 10 },
    );
  }

  /**
   * IR commands are a press/release pair. The hub does not reliably answer
   * holdAction, so both frames are fire-and-forget. `holdMs` is how long the
   * button is "held" (e.g. for volume ramps).
   */
  async sendCommand(deviceId: string, command: string, holdMs = 0): Promise<void> {
    const t = this.require();
    const action = JSON.stringify({ command, type: 'IRCommand', deviceId });
    const cmd = `${ENGINE}?holdAction`;
    const base =
      t.kind === 'xmpp'
        ? { action, timestamp: '0' }
        : { action, timestamp: '0', verb: 'render' };
    await t.request(cmd, { ...base, status: 'press' }, { wait: 'none' });
    await new Promise((r) => setTimeout(r, Math.max(holdMs, 50)));
    await t.request(cmd, { ...base, status: 'release' }, { wait: 'none' });
  }

  /** Ask the hub to re-pull its configuration from the (replacement) cloud. */
  async syncConfig(): Promise<void> {
    this.setStatus({ state: 'syncing' });
    try {
      await this.require().request('setup.sync', {}, { timeoutSec: 30, wait: 'ack' });
    } finally {
      this.setStatus({ state: this.transport?.isOpen ? 'connected' : 'disconnected' });
    }
  }
}

export class HubManager extends EventEmitter<ManagerEvents> {
  private readonly discovery = new HubDiscovery();
  private readonly hubs = new Map<string, Hub>();
  private readonly sessions = new Map<string, HubSession>();

  constructor() {
    super();
    // Seed with previously seen hubs so the UI can reconnect without rediscovery.
    for (const known of Object.values(getSettings().knownHubs)) {
      this.hubs.set(known.id, {
        id: known.id,
        friendlyName: known.friendlyName,
        ip: known.ip,
        port: HUB_WS_PORT,
        hubSwVersion: '',
        activeRemoteId: known.activeRemoteId,
        connected: false,
      });
    }
    this.discovery.on('hub', (info) => this.onDiscovered(info));
    this.discovery.on('error', () => undefined);
  }

  list(): Hub[] {
    return [...this.hubs.values()];
  }

  startDiscovery(): Promise<void> {
    return this.discovery.start();
  }

  stopDiscovery(): void {
    this.discovery.stop();
  }

  /** Manual add for networks where broadcast doesn't reach (VLANs, VPN). */
  async addByIp(ip: string): Promise<Hub> {
    const info = await fetchProvisionInfo(ip);
    const remoteId = String(info.activeRemoteId);
    const existing = this.list().find((h) => h.ip === ip || h.activeRemoteId === remoteId);
    const hub: Hub = existing ?? {
      id: `remote-${remoteId}`,
      friendlyName: `Harmony Hub (${ip})`,
      ip,
      port: HUB_WS_PORT,
      hubSwVersion: '',
      activeRemoteId: remoteId,
      connected: false,
    };
    this.upsertHub({ ...hub, ip, activeRemoteId: remoteId });
    return this.hubs.get(hub.id) as Hub;
  }

  upsertHub(hub: Hub): void {
    const prev = this.hubs.get(hub.id);
    const merged: Hub = { ...prev, ...hub };
    this.hubs.set(hub.id, merged);
    const known = getSettings().knownHubs[hub.id];
    rememberHub({
      id: merged.id,
      friendlyName: merged.friendlyName,
      ip: merged.ip,
      activeRemoteId: merged.activeRemoteId,
      claimed: known?.claimed ?? false,
    });
    this.emit('discovered', merged);
  }

  private onDiscovered(info: DiscoveredHubInfo): void {
    const prev = this.hubs.get(info.uuid);
    this.upsertHub({
      id: info.uuid,
      friendlyName: info.friendlyName,
      ip: info.ip,
      port: HUB_WS_PORT,
      hubSwVersion: info.hubSwVersion ?? prev?.hubSwVersion ?? '',
      activeRemoteId: info.remoteId ?? prev?.activeRemoteId ?? '',
      connected: prev?.connected ?? false,
    });
  }

  session(hubId: string): HubSession {
    const existing = this.sessions.get(hubId);
    if (existing) return existing;
    const hub = this.hubs.get(hubId);
    if (!hub) throw new Error(`Unknown hub ${hubId}. Run discovery or add it by IP first.`);
    const s = new HubSession(hub, this);
    this.sessions.set(hubId, s);
    return s;
  }

  status(hubId: string): HubStatus {
    return this.sessions.get(hubId)?.status ?? { hubId, state: 'disconnected', transport: null };
  }

  connect(hubId: string): Promise<void> {
    return this.session(hubId).connect();
  }

  disconnect(hubId: string): void {
    this.sessions.get(hubId)?.disconnect();
  }

  shutdown(): void {
    this.discovery.stop();
    for (const s of this.sessions.values()) s.disconnect();
  }
}
