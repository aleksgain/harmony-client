import http from 'node:http';
import https from 'node:https';

export interface HttpResult {
  status: number;
  body: string;
}

export interface HttpOptions {
  method: string;
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
  /** Accept self-signed certificates (server only, opt-in via settings). */
  insecureTls?: boolean;
}

/**
 * Minimal HTTP client built on node:http(s).
 *
 * We avoid global fetch here because undici treats `Origin` as a header it may
 * rewrite, and the hub *requires* `Origin: http://sl.dhg.myharmony.com` on the
 * bootstrap call. node:http sends headers verbatim.
 */
export function httpRequest(url: string, opts: HttpOptions): Promise<HttpResult> {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const lib = target.protocol === 'https:' ? https : http;
    const body = opts.body !== undefined ? Buffer.from(opts.body, 'utf8') : undefined;
    const req = lib.request(
      target,
      {
        method: opts.method,
        headers: {
          ...(body ? { 'Content-Length': String(body.length) } : {}),
          ...opts.headers,
        },
        timeout: opts.timeoutMs ?? 10_000,
        ...(target.protocol === 'https:' && opts.insecureTls ? { rejectUnauthorized: false } : {}),
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () =>
          resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString('utf8') }),
        );
        res.on('error', reject);
      },
    );
    req.on('timeout', () => req.destroy(new Error(`Request to ${target.host} timed out`)));
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}
