import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import WebSocket from 'ws';
import type { ProvisionInfo } from '@shared/harmony';
import { httpRequest } from './http';
import {
  HubCommandError,
  type HubTransport,
  type RequestOptions,
  type TransportEvents,
} from './hub-transport';

export const HUB_WS_PORT = 8088;

/**
 * The hub's embedded web server only accepts requests carrying the Origin of
 * Logitech's old web app. Without it the bootstrap POST is rejected.
 */
const HUB_ORIGIN = 'http://sl.dhg.myharmony.com';

/** `domain` query param the hub expects on the WS URL. Its value is not
 *  resolved by the hub for local connections; it just has to be present. */
const WS_DOMAIN = 'svcs.myharmony.com';

const PING_INTERVAL_MS = 30_000;
const PONG_TIMEOUT_MS = 15_000;
const DEFAULT_TIMEOUT_SEC = 5;

/** Raw frame shape as sent by the hub. `data` is command-specific. */
interface HubFrame<T = unknown> {
  id?: string;
  cmd?: string;
  /** Present on unsolicited notifications, e.g. `connect.stateDigest?notify`. */
  type?: string;
  /** Hub sends both numbers and strings ("200"). 100 = in progress. */
  code?: number | string;
  msg?: string;
  data?: T;
}

interface Pending {
  resolve: (data: unknown) => void;
  reject: (err: Error) => void;
  timer: NodeJS.Timeout;
  wait: 'response' | 'ack';
  cmd: string;
  timeoutMs: number;
}

/**
 * Bootstrap: unauthenticated HTTP POST to the hub to learn its
 * `activeRemoteId`, which must be passed as `hubId` when opening the socket
 * (a wrong id yields HTTP 401 "Wrong hubId").
 */
export async function fetchProvisionInfo(ip: string, timeoutMs = 5_000): Promise<ProvisionInfo> {
  const res = await httpRequest(`http://${ip}:${HUB_WS_PORT}/`, {
    method: 'POST',
    headers: {
      Origin: HUB_ORIGIN,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'Accept-Charset': 'utf-8',
    },
    body: JSON.stringify({ id: 1, cmd: 'setup.account?getProvisionInfo', params: {} }),
    timeoutMs,
  });
  if (res.status !== 200) {
    throw new Error(`Hub at ${ip} answered getProvisionInfo with HTTP ${res.status}`);
  }
  const parsed = JSON.parse(res.body) as HubFrame<ProvisionInfo>;
  if (!parsed.data || parsed.data.activeRemoteId === undefined) {
    throw new Error(`Hub at ${ip} returned no activeRemoteId`);
  }
  return parsed.data;
}

export class HubWebSocket extends EventEmitter<TransportEvents> implements HubTransport {
  readonly kind = 'websocket' as const;
  private ws: WebSocket | null = null;
  private readonly pending = new Map<string, Pending>();
  private pingTimer: NodeJS.Timeout | null = null;
  private pongTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly ip: string,
    private readonly remoteId: string,
  ) {
    super();
  }

  get isOpen(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  open(): Promise<void> {
    if (this.isOpen) return Promise.resolve();
    const url = `ws://${this.ip}:${HUB_WS_PORT}/?domain=${WS_DOMAIN}&hubId=${encodeURIComponent(this.remoteId)}`;
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url, { headers: { Origin: HUB_ORIGIN }, handshakeTimeout: 8_000 });
      this.ws = ws;
      ws.once('open', () => {
        this.startHeartbeat();
        this.emit('open');
        resolve();
      });
      ws.once('unexpected-response', (_req, res) => {
        reject(new Error(`Hub rejected WebSocket upgrade: HTTP ${res.statusCode ?? '?'}`));
      });
      ws.on('message', (raw) => this.onMessage(raw.toString()));
      ws.on('pong', () => {
        if (this.pongTimer) clearTimeout(this.pongTimer);
        this.pongTimer = null;
      });
      ws.on('error', (err) => {
        this.emit('error', err);
        reject(err);
      });
      ws.on('close', (code, reason) => {
        this.stopHeartbeat();
        this.failAllPending(new Error('Hub connection closed'));
        this.ws = null;
        this.emit('close', `${code} ${reason.toString()}`.trim());
      });
    });
  }

  close(): void {
    this.stopHeartbeat();
    this.ws?.close(1000, 'client disconnect');
    this.ws = null;
  }

  request<T = unknown>(
    cmd: string,
    params: Record<string, unknown> = {},
    opts: RequestOptions = {},
  ): Promise<T> {
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error('Hub WebSocket is not connected'));
    }
    const id = randomUUID();
    const timeoutSec = opts.timeoutSec ?? DEFAULT_TIMEOUT_SEC;
    // The hbus envelope. `timeout` is honoured by the hub for long-running commands.
    const frame = { hubId: this.remoteId, timeout: timeoutSec, hbus: { cmd, id, params } };
    const wait = opts.wait ?? 'response';

    if (wait === 'none') {
      return new Promise((resolve, reject) => {
        ws.send(JSON.stringify(frame), (err) => (err ? reject(err) : resolve(undefined as T)));
      });
    }

    return new Promise<T>((resolve, reject) => {
      const timeoutMs = timeoutSec * 1000 + 1_000;
      const timer = setTimeout(() => this.timeoutPending(id), timeoutMs);
      this.pending.set(id, {
        resolve: resolve as (d: unknown) => void,
        reject,
        timer,
        wait,
        cmd,
        timeoutMs,
      });
      ws.send(JSON.stringify(frame), (err) => {
        if (err) this.settle(id, err);
      });
    });
  }

  private onMessage(text: string): void {
    let frame: HubFrame;
    try {
      frame = JSON.parse(text) as HubFrame;
    } catch {
      return; // hub occasionally sends keepalive garbage; ignore
    }

    const pending = frame.id ? this.pending.get(frame.id) : undefined;
    if (pending && frame.id) {
      const code = Number(frame.code ?? 200);
      if (code === 100 && pending.wait === 'response') {
        // "In progress" (e.g. runactivity). Keep waiting, restart the timer.
        clearTimeout(pending.timer);
        pending.timer = setTimeout(() => this.timeoutPending(frame.id as string), pending.timeoutMs);
        return;
      }
      if (code === 200 || code === 100) {
        this.settle(frame.id, null, frame.data);
      } else {
        this.settle(
          frame.id,
          new HubCommandError(
            `Hub returned ${frame.code ?? '?'} for ${pending.cmd}: ${frame.msg ?? 'error'}`,
            frame.code,
            pending.cmd,
          ),
        );
      }
      return;
    }

    if (frame.type) {
      this.emit('notification', frame.type, frame.data);
    } else if (frame.cmd) {
      // Some firmware sends progress for async commands without our id.
      this.emit('notification', frame.cmd, frame.data);
    }
  }

  private settle(id: string, err: Error | null, data?: unknown): void {
    const p = this.pending.get(id);
    if (!p) return;
    clearTimeout(p.timer);
    this.pending.delete(id);
    if (err) p.reject(err);
    else p.resolve(data);
  }

  private timeoutPending(id: string): void {
    const p = this.pending.get(id);
    if (!p) return;
    this.settle(id, new HubCommandError(`Timed out waiting for ${p.cmd}`, undefined, p.cmd));
  }

  private failAllPending(err: Error): void {
    for (const id of [...this.pending.keys()]) this.settle(id, err);
  }

  /** WS-level ping/pong; the hub drops idle sockets after roughly a minute. */
  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.pingTimer = setInterval(() => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
      this.ws.ping();
      this.pongTimer = setTimeout(() => this.ws?.terminate(), PONG_TIMEOUT_MS);
    }, PING_INTERVAL_MS);
  }

  private stopHeartbeat(): void {
    if (this.pingTimer) clearInterval(this.pingTimer);
    if (this.pongTimer) clearTimeout(this.pongTimer);
    this.pingTimer = null;
    this.pongTimer = null;
  }
}
