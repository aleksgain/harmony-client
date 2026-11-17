import type {
  DeviceDbEntry,
  DeviceModelSummary,
  LoginRequest,
  LoginResponse,
  Manufacturer,
  ProxyRequest,
  ServerHealth,
  ServerHubConfig,
} from '../types/api';
import type { HarmonyConfig } from '../types/harmony';

/**
 * harmony-server REST client. Requests are proxied through the main process
 * (see src/main/server-proxy.ts) so CORS and self-signed certs are non-issues.
 */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(req: ProxyRequest): Promise<T> {
  const res = await window.harmony.server.request<T>(req);
  if (!res.ok) throw new ApiError(res.error ?? `HTTP ${res.status}`, res.status);
  return res.data as T;
}

const enc = encodeURIComponent;

/** Some servers return `{items: [...]}`, others a bare array. Accept both. */
function asList<T>(data: T[] | { items?: T[] } | null | undefined): T[] {
  if (Array.isArray(data)) return data;
  return data?.items ?? [];
}

export const api = {
  /**
   * Reachability probe. Tries the harmony-server health endpoint first, then
   * the legacy Logitech-style discovery ping (what a hub would call).
   */
  async health(baseUrl?: string): Promise<ServerHealth> {
    const started = performance.now();
    for (const path of ['/api/health', '/Discovery/Discovery.svc/json2/Ping']) {
      const res = await window.harmony.server.request<{ version?: string }>({
        method: 'GET',
        path,
        baseUrl,
        timeoutMs: 5_000,
      });
      if (res.ok) {
        return { ok: true, version: res.data?.version, latencyMs: Math.round(performance.now() - started) };
      }
      if (res.status === 0) {
        throw new ApiError(res.error ?? 'Server unreachable', 0);
      }
    }
    throw new ApiError('Server responded, but neither /api/health nor the discovery ping succeeded', 404);
  },

  login(body: LoginRequest): Promise<LoginResponse> {
    return request<LoginResponse>({ method: 'POST', path: '/api/auth/login', body });
  },

  // --- hubs
  getHubConfig(hubId: string): Promise<ServerHubConfig> {
    return request<ServerHubConfig>({ method: 'GET', path: `/api/hubs/${enc(hubId)}/config` });
  },

  /** Saving bumps `configVersion` server-side; the hub picks it up on `setup.sync`. */
  putHubConfig(hubId: string, config: HarmonyConfig): Promise<ServerHubConfig> {
    return request<ServerHubConfig>({ method: 'PUT', path: `/api/hubs/${enc(hubId)}/config`, body: config });
  },

  /**
   * Claim a hub for the current account. The server API only defines
   * GET/PUT config, so claiming is an upsert: PUT the hub's current config
   * (creating the record) with its metadata.
   */
  async claimHub(
    hubId: string,
    meta: { friendlyName: string; activeRemoteId: string },
    config: HarmonyConfig,
  ): Promise<ServerHubConfig> {
    return request<ServerHubConfig>({
      method: 'PUT',
      path: `/api/hubs/${enc(hubId)}/config`,
      body: { ...config, friendlyName: meta.friendlyName, activeRemoteId: meta.activeRemoteId },
    });
  },

  /**
   * Hub auth token to embed during USB provisioning (MyHarmony obtained it
   * from Security.GetAuthenticatedUserAuthToken). Endpoint is a proposal —
   * falls back to the user's session token if the server lacks it.
   */
  async getHubAuthToken(hubId: string): Promise<string> {
    try {
      const res = await request<{ authToken?: string; token?: string }>({
        method: 'POST',
        path: `/api/hubs/${enc(hubId)}/token`,
      });
      const token = res.authToken ?? res.token;
      if (token) return token;
    } catch (err) {
      if (!(err instanceof ApiError) || (err.status !== 404 && err.status !== 405)) throw err;
    }
    const settings = await window.harmony.settings.get();
    if (!settings.auth?.token) throw new ApiError('Sign in to harmony-server first', 401);
    return settings.auth.token;
  },

  startActivity(hubId: string, activityId: string): Promise<void> {
    return request<void>({ method: 'POST', path: `/api/hubs/${enc(hubId)}/activity`, body: { activityId } });
  },

  sendCommand(hubId: string, deviceId: string, command: string): Promise<void> {
    return request<void>({ method: 'POST', path: `/api/hubs/${enc(hubId)}/command`, body: { deviceId, command } });
  },

  // --- device database
  async manufacturers(query = ''): Promise<Manufacturer[]> {
    const q = query ? `?q=${enc(query)}` : '';
    const data = await request<(Manufacturer | string)[] | { items?: (Manufacturer | string)[] }>({
      method: 'GET',
      path: `/api/devices/${q}`,
    });
    return asList(data).map((m) => (typeof m === 'string' ? { name: m } : m));
  },

  async models(manufacturer: string, query = ''): Promise<DeviceModelSummary[]> {
    const q = query ? `?q=${enc(query)}` : '';
    const data = await request<(DeviceModelSummary | string)[] | { items?: (DeviceModelSummary | string)[] }>({
      method: 'GET',
      path: `/api/devices/${enc(manufacturer)}/${q}`,
    });
    return asList(data).map((m) => (typeof m === 'string' ? { manufacturer, model: m } : m));
  },

  device(manufacturer: string, model: string): Promise<DeviceDbEntry> {
    return request<DeviceDbEntry>({ method: 'GET', path: `/api/devices/${enc(manufacturer)}/${enc(model)}` });
  },
};
