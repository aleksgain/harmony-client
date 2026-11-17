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
import { useHubStore } from '../store/hubStore';
import type { HarmonyConfig } from '../types/harmony';
import { serverHubId } from '../types/harmony';

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

/** Map the app's hub key (uuid or `remote-<id>`) to the id harmony-server uses. */
function sid(hubId: string): string {
  const hub = useHubStore.getState().hubs[hubId];
  return enc(serverHubId(hub ?? { id: hubId }));
}

/** Result of PUT /api/hubs/{id}/config (harmony-server returns versions only). */
export interface SavedConfigVersions {
  configVersion: number;
  contentVersion: number;
  hubNotified?: boolean;
}

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
    // harmony-server serves /healthz; /api/health is kept for other backends.
    for (const path of ['/healthz', '/api/health', '/Discovery/Discovery.svc/json2/Ping']) {
      const res = await window.harmony.server.request<{ version?: string }>({
        method: 'GET',
        path,
        baseUrl,
        timeoutMs: 5_000,
      });
      if (res.ok) {
        return {
          ok: true,
          version: res.data?.version,
          latencyMs: Math.round(performance.now() - started),
        };
      }
      if (res.status === 0) {
        throw new ApiError(res.error ?? 'Server unreachable', 0);
      }
    }
    throw new ApiError(
      'Server responded, but none of /healthz, /api/health or the discovery ping succeeded',
      404,
    );
  },

  login(body: LoginRequest): Promise<LoginResponse> {
    return request<LoginResponse>({ method: 'POST', path: '/api/auth/login', body });
  },

  register(body: LoginRequest): Promise<LoginResponse> {
    return request<LoginResponse>({ method: 'POST', path: '/api/auth/register', body });
  },

  // --- hubs
  getHubConfig(hubId: string): Promise<ServerHubConfig> {
    return request<ServerHubConfig>({ method: 'GET', path: `/api/hubs/${sid(hubId)}/config` });
  },

  /**
   * Saving bumps `configVersion` server-side. harmony-server stores devices and
   * activities and answers with the new versions, not the config itself.
   */
  putHubConfig(hubId: string, config: HarmonyConfig): Promise<SavedConfigVersions> {
    return request<SavedConfigVersions>({
      method: 'PUT',
      path: `/api/hubs/${sid(hubId)}/config`,
      body: { device: config.device, activity: config.activity },
    });
  },

  /**
   * Claim a hub for the signed-in account (creating it on the server if it has
   * never checked in), then upload its current devices and activities.
   */
  async claimHub(
    hubId: string,
    meta: { friendlyName: string; activeRemoteId: string; ip?: string },
    config: HarmonyConfig,
  ): Promise<SavedConfigVersions> {
    const id = serverHubId({ id: hubId, activeRemoteId: meta.activeRemoteId });
    await request<unknown>({
      method: 'POST',
      path: '/api/hubs/claim',
      body: { hubId: id, hubName: meta.friendlyName, ipAddress: meta.ip ?? null },
    });
    return request<SavedConfigVersions>({
      method: 'PUT',
      path: `/api/hubs/${enc(id)}/config`,
      body: { device: config.device, activity: config.activity },
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
        path: `/api/hubs/${sid(hubId)}/token`,
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
    return request<void>({
      method: 'POST',
      path: `/api/hubs/${sid(hubId)}/activity`,
      body: { activityId },
    });
  },

  sendCommand(hubId: string, deviceId: string, command: string): Promise<void> {
    return request<void>({
      method: 'POST',
      path: `/api/hubs/${sid(hubId)}/command`,
      body: { deviceId, command },
    });
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
    const data = await request<
      (DeviceModelSummary | string)[] | { items?: (DeviceModelSummary | string)[] }
    >({
      method: 'GET',
      path: `/api/devices/${enc(manufacturer)}/${q}`,
    });
    return asList(data).map((m) => (typeof m === 'string' ? { manufacturer, model: m } : m));
  },

  device(manufacturer: string, model: string): Promise<DeviceDbEntry> {
    return request<DeviceDbEntry>({
      method: 'GET',
      path: `/api/devices/${enc(manufacturer)}/${enc(model)}`,
    });
  },
};
