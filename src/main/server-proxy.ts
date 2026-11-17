import type { ProxyRequest, ProxyResponse } from '@shared/api';
import { httpRequest } from './http';
import { getSettings } from './store';

/**
 * harmony-server REST calls are made from the main process rather than the
 * renderer so that (a) CORS on the server doesn't matter, (b) a self-signed
 * certificate on `https://harmony.local` can be accepted when the user opts
 * in, without disabling TLS checks for anything else.
 */
export async function serverRequest(req: ProxyRequest): Promise<ProxyResponse> {
  const settings = getSettings();
  const base = (req.baseUrl ?? settings.serverUrl ?? '').replace(/\/+$/, '');
  if (!base) return { status: 0, ok: false, data: null, error: 'No server URL configured' };

  let url: URL;
  try {
    url = new URL(base + (req.path.startsWith('/') ? req.path : `/${req.path}`));
  } catch {
    return { status: 0, ok: false, data: null, error: `Invalid server URL: ${base}` };
  }

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (req.body !== undefined) headers['Content-Type'] = 'application/json';
  if (settings.auth?.token) headers.Authorization = `Bearer ${settings.auth.token}`;

  try {
    const res = await httpRequest(url.toString(), {
      method: req.method,
      headers,
      body: req.body !== undefined ? JSON.stringify(req.body) : undefined,
      timeoutMs: req.timeoutMs ?? 15_000,
      insecureTls: settings.allowInsecureTls,
    });
    let data: unknown = null;
    if (res.body) {
      try {
        data = JSON.parse(res.body);
      } catch {
        data = res.body;
      }
    }
    const ok = res.status >= 200 && res.status < 300;
    const errBody = data as { error?: string; message?: string } | null;
    return {
      status: res.status,
      ok,
      data,
      error: ok ? undefined : (errBody?.error ?? errBody?.message ?? `HTTP ${res.status}`),
    };
  } catch (err) {
    return { status: 0, ok: false, data: null, error: (err as Error).message };
  }
}
