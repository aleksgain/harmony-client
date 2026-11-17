import { EventEmitter } from 'node:events';
import net from 'node:net';
import { randomUUID } from 'node:crypto';
import {
  HubCommandError,
  type HubTransport,
  type RequestOptions,
  type TransportEvents,
} from './hub-transport';

/**
 * Minimal XMPP client for the hub's legacy API on TCP 5222.
 *
 * Logitech disabled this API in firmware 4.15.206 and later re-enabled it
 * behind a toggle in the mobile app, so it's only a *fallback* here. The hub
 * speaks plain (unencrypted) XMPP with SASL PLAIN and no STARTTLS, which is
 * simple enough that a full XMPP library would be dead weight. This client
 * understands exactly the stanzas the hub emits; it is not a general parser.
 *
 * Auth is a two-step dance:
 *   1. log in as guest (guest@x.com / guest) and send a `vnd.logitech.pair`
 *      request; the hub answers `identity=<uuid>:status=succeeded`.
 *   2. reconnect as `<identity>@connect.logitech.com` / `<identity>`.
 */

export const HUB_XMPP_PORT = 5222;
const NS = 'connect.logitech.com';
/** The hub validates the device descriptor; `#iOS6.0.1#iPhone` is known-good. */
const PAIR_NAME = 'harmony-revival#iOS6.0.1#iPhone';
const KEEPALIVE_MS = 30_000;
const DEFAULT_TIMEOUT_SEC = 5;

interface Stanza {
  name: string;
  attrs: Record<string, string>;
  inner: string;
}

interface Pending {
  resolve: (data: unknown) => void;
  reject: (err: Error) => void;
  timer: NodeJS.Timeout;
  wait: 'response' | 'ack';
  cmd: string;
  timeoutMs: number;
}

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function xmlUnescape(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function parseAttrs(tag: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const m of tag.matchAll(/([\w:.-]+)\s*=\s*(["'])(.*?)\2/gs)) {
    if (m[1] && m[3] !== undefined) attrs[m[1]] = xmlUnescape(m[3]);
  }
  return attrs;
}

/** Text content of an element body: CDATA wins, else unescaped text. */
function textContent(inner: string): string {
  const cdata = /<!\[CDATA\[([\s\S]*?)\]\]>/.exec(inner);
  if (cdata?.[1] !== undefined) return cdata[1];
  return xmlUnescape(inner.replace(/<[^>]+>/g, ''));
}

/**
 * Harmony's "colon-separated" encoding: `k=v:k2=v2`. Literal colons inside a
 * value (e.g. in a JSON action) are escaped as `::`.
 */
export function encodeColonParams(params: Record<string, unknown>): string {
  return Object.entries(params)
    .map(([k, v]) => {
      const str = typeof v === 'string' ? v : JSON.stringify(v);
      return `${k}=${str.replace(/:/g, '::')}`;
    })
    .join(':');
}

export function decodeColonParams(body: string): Record<string, string> {
  const out: Record<string, string> = {};
  // Split on single ':' not part of '::'
  const parts = body.split(/(?<!:):(?!:)/);
  for (const part of parts) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    out[part.slice(0, idx).trim()] = part.slice(idx + 1).replace(/::/g, ':');
  }
  return out;
}

function decodeBody(raw: string): unknown {
  const trimmed = raw.trim();
  if (!trimmed) return {};
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      return JSON.parse(trimmed);
    } catch {
      /* fall through */
    }
  }
  return decodeColonParams(trimmed);
}

/** Pulls complete top-level stanzas off the front of the stream buffer. */
function extractStanzas(buf: string): { stanzas: Stanza[]; rest: string } {
  const stanzas: Stanza[] = [];
  let rest = buf;
  for (;;) {
    rest = rest.replace(/^\s+/, '');
    // Skip XML declaration and the stream header (never closed until the end).
    const header = /^<\?xml[^>]*\?>|^<stream:stream[^>]*>/.exec(rest);
    if (header) {
      rest = rest.slice(header[0].length);
      continue;
    }
    if (rest.startsWith('</stream:stream>')) {
      stanzas.push({ name: 'stream:end', attrs: {}, inner: '' });
      rest = rest.slice('</stream:stream>'.length);
      continue;
    }
    const open = /^<([\w:.-]+)([^>]*?)(\/?)>/s.exec(rest);
    if (!open || !open[1]) break;
    const [whole, name, attrStr = '', selfClose] = open;
    if (selfClose) {
      stanzas.push({ name, attrs: parseAttrs(attrStr), inner: '' });
      rest = rest.slice(whole.length);
      continue;
    }
    const closeTag = `</${name}>`;
    const end = rest.indexOf(closeTag, whole.length);
    if (end < 0) break; // incomplete; wait for more data
    stanzas.push({ name, attrs: parseAttrs(attrStr), inner: rest.slice(whole.length, end) });
    rest = rest.slice(end + closeTag.length);
  }
  return { stanzas, rest };
}

export class HubXmpp extends EventEmitter<TransportEvents> implements HubTransport {
  readonly kind = 'xmpp' as const;
  private sock: net.Socket | null = null;
  private buffer = '';
  private ready = false;
  private keepalive: NodeJS.Timeout | null = null;
  private readonly pending = new Map<string, Pending>();
  private stanzaWaiter: ((s: Stanza) => boolean) | null = null;

  constructor(private readonly ip: string) {
    super();
  }

  get isOpen(): boolean {
    return this.ready && !!this.sock && !this.sock.destroyed;
  }

  async open(): Promise<void> {
    if (this.isOpen) return;
    // Step 1: guest session, obtain identity token.
    await this.connectAndAuth('guest', 'x.com', 'guest');
    const pairReply = await this.request<Record<string, string>>(
      'vnd.logitech.connect/vnd.logitech.pair',
      { method: 'pair', name: PAIR_NAME },
      { timeoutSec: 10 },
      true,
    );
    const identity = pairReply.identity;
    if (!identity) throw new Error('Hub did not return an XMPP pairing identity');
    this.teardown();

    // Step 2: authenticated session.
    await this.connectAndAuth(identity, NS, identity);
    this.keepalive = setInterval(() => this.sock?.write(' '), KEEPALIVE_MS);
    this.emit('open');
  }

  close(): void {
    this.sock?.write('</stream:stream>');
    this.teardown();
    this.emit('close', 'client disconnect');
  }

  request<T = unknown>(
    cmd: string,
    params: Record<string, unknown> = {},
    opts: RequestOptions = {},
    allowDuringAuth = false,
  ): Promise<T> {
    if (!this.sock || (!this.ready && !allowDuringAuth)) {
      return Promise.reject(new Error('Hub XMPP session is not connected'));
    }
    const id = randomUUID();
    const body = xmlEscape(encodeColonParams(params));
    const xml = `<iq type="get" id="${id}"><oa xmlns="${NS}" mime="${xmlEscape(cmd)}">${body}</oa></iq>`;
    const wait = opts.wait ?? 'response';
    if (wait === 'none') {
      this.sock.write(xml);
      return Promise.resolve(undefined as T);
    }
    const timeoutMs = (opts.timeoutSec ?? DEFAULT_TIMEOUT_SEC) * 1000;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(
        () => this.settle(id, new Error(`Timed out waiting for ${cmd}`)),
        timeoutMs,
      );
      this.pending.set(id, {
        resolve: resolve as (d: unknown) => void,
        reject,
        timer,
        wait,
        cmd,
        timeoutMs,
      });
      this.sock?.write(xml);
    });
  }

  // --- connection plumbing -------------------------------------------------

  private async connectAndAuth(user: string, domain: string, password: string): Promise<void> {
    this.ready = false;
    await new Promise<void>((resolve, reject) => {
      const sock = net.connect({ host: this.ip, port: HUB_XMPP_PORT, timeout: 8_000 });
      this.sock = sock;
      this.buffer = '';
      sock.setEncoding('utf8');
      sock.once('connect', () => resolve());
      sock.once('timeout', () => sock.destroy(new Error('XMPP connect timed out')));
      sock.on('error', (err) => {
        reject(err);
        this.emit('error', err);
      });
      sock.on('data', (chunk: string) => this.onData(chunk));
      sock.on('close', () => {
        const wasReady = this.ready;
        this.ready = false;
        this.failAll(new Error('Hub XMPP connection closed'));
        if (wasReady) this.emit('close', 'socket closed');
      });
    });
    // Connect timeout must not become an idle timeout once connected.
    this.sock?.setTimeout(0);

    this.openStream(domain);
    await this.waitFor((s) => s.name === 'stream:features');
    const plain = Buffer.from(`\0${user}\0${password}`).toString('base64');
    this.sock?.write(
      `<auth xmlns="urn:ietf:params:xml:ns:xmpp-sasl" mechanism="PLAIN">${plain}</auth>`,
    );
    const authResult = await this.waitFor((s) => s.name === 'success' || s.name === 'failure');
    if (authResult.name === 'failure') throw new Error('Hub rejected XMPP authentication');

    // Stream restart after SASL, then resource bind.
    this.openStream(domain);
    await this.waitFor((s) => s.name === 'stream:features');
    this.sock?.write(
      '<iq type="set" id="bind_1"><bind xmlns="urn:ietf:params:xml:ns:xmpp-bind"><resource>gatorade</resource></bind></iq>',
    );
    await this.waitFor((s) => s.name === 'iq' && s.attrs.id === 'bind_1');
    this.ready = true;
  }

  private openStream(domain: string): void {
    this.sock?.write(
      `<?xml version="1.0"?><stream:stream to="${domain}" xmlns="jabber:client" xmlns:stream="http://etherx.jabber.org/streams" version="1.0">`,
    );
  }

  private waitFor(match: (s: Stanza) => boolean, timeoutMs = 8_000): Promise<Stanza> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.stanzaWaiter = null;
        reject(new Error('Timed out during XMPP handshake'));
      }, timeoutMs);
      this.stanzaWaiter = (s) => {
        if (!match(s)) return false;
        clearTimeout(timer);
        this.stanzaWaiter = null;
        resolve(s);
        return true;
      };
    });
  }

  private onData(chunk: string): void {
    this.buffer += chunk;
    const { stanzas, rest } = extractStanzas(this.buffer);
    this.buffer = rest;
    for (const s of stanzas) {
      if (this.stanzaWaiter?.(s)) continue;
      this.handleStanza(s);
    }
  }

  private handleStanza(s: Stanza): void {
    if (s.name === 'iq' && s.attrs.id) {
      const p = this.pending.get(s.attrs.id);
      if (!p) return;
      const oa = /<oa([^>]*)>([\s\S]*?)<\/oa>|<oa([^>]*)\/>/.exec(s.inner);
      const attrs = parseAttrs(oa?.[1] ?? oa?.[3] ?? '');
      const code = Number(attrs.errorcode ?? (s.attrs.type === 'error' ? 500 : 200));
      if (code === 100 && p.wait === 'response') {
        clearTimeout(p.timer);
        p.timer = setTimeout(
          () => this.settle(s.attrs.id as string, new Error(`Timed out waiting for ${p.cmd}`)),
          p.timeoutMs,
        );
        return;
      }
      if (code === 200 || code === 100) {
        this.settle(s.attrs.id, null, decodeBody(textContent(oa?.[2] ?? '')));
      } else {
        this.settle(
          s.attrs.id,
          new HubCommandError(
            `Hub returned ${code} for ${p.cmd}: ${attrs.errorstring ?? 'error'}`,
            code,
            p.cmd,
          ),
        );
      }
      return;
    }
    if (s.name === 'message') {
      const ev = /<event([^>]*)>([\s\S]*?)<\/event>/.exec(s.inner);
      if (!ev) return;
      const type = parseAttrs(ev[1] ?? '').type ?? 'unknown';
      this.emit('notification', type, decodeBody(textContent(ev[2] ?? '')));
    }
    if (s.name === 'stream:end') this.teardown();
  }

  private settle(id: string, err: Error | null, data?: unknown): void {
    const p = this.pending.get(id);
    if (!p) return;
    clearTimeout(p.timer);
    this.pending.delete(id);
    if (err) p.reject(err);
    else p.resolve(data);
  }

  private failAll(err: Error): void {
    for (const id of [...this.pending.keys()]) this.settle(id, err);
  }

  private teardown(): void {
    if (this.keepalive) clearInterval(this.keepalive);
    this.keepalive = null;
    this.ready = false;
    const sock = this.sock;
    this.sock = null;
    sock?.removeAllListeners('close');
    sock?.destroy();
    this.failAll(new Error('Hub XMPP connection closed'));
  }
}
