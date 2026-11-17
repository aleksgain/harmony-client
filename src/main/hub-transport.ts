import type { EventEmitter } from 'node:events';

/**
 * Common surface for the two local hub transports (WebSocket on 8088 and
 * XMPP on 5222) so `HubSession` can use either interchangeably.
 */
export interface TransportEvents {
  open: [];
  close: [reason: string];
  /** Unsolicited hub → client frame (state digest, activity finished, ...). */
  notification: [type: string, data: unknown];
  error: [Error];
}

export interface RequestOptions {
  /** Seconds before the pending promise rejects. */
  timeoutSec?: number;
  /**
   * `response` (default): resolve on the final (code 200) reply.
   * `ack`: resolve on the first reply, including code 100 "in progress".
   * `none`: fire-and-forget, resolve once the frame is written.
   */
  wait?: 'response' | 'ack' | 'none';
}

export interface HubTransport extends EventEmitter<TransportEvents> {
  readonly kind: 'websocket' | 'xmpp';
  readonly isOpen: boolean;
  open(): Promise<void>;
  close(): void;
  /** `cmd` is the full `mime?command` string. Payload types are caller-asserted. */
  request<T = unknown>(cmd: string, params?: Record<string, unknown>, opts?: RequestOptions): Promise<T>;
}

export class HubCommandError extends Error {
  constructor(
    message: string,
    readonly code: number | string | undefined,
    readonly cmd: string,
  ) {
    super(message);
    this.name = 'HubCommandError';
  }
}
