import type { DeviceTiming, HarmonyConfig, HarmonyDevice } from './harmony';

/** harmony-server REST API types. */

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  accountId: string;
}

export interface Manufacturer {
  name: string;
  /** Optional: number of models in the DB, if the server reports it. */
  modelCount?: number;
}

export interface DeviceModelSummary {
  manufacturer: string;
  model: string;
  type?: number | string;
  description?: string;
}

/** Full device DB entry with all IR commands. */
export interface DeviceDbEntry extends Omit<HarmonyDevice, 'id' | 'label'> {
  id?: string;
  label?: string;
  timing?: DeviceTiming;
}

export interface ServerHubConfig extends HarmonyConfig {
  hubId: string;
  updatedAt?: string;
}

export interface ServerHealth {
  ok: boolean;
  version?: string;
  latencyMs: number;
}

export interface ApiErrorBody {
  error?: string;
  message?: string;
}

/** Request proxied through the main process (avoids CORS / self-signed TLS issues). */
export interface ProxyRequest {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  path: string;
  body?: unknown;
  /** Override base URL (used by "Test connection" before saving). */
  baseUrl?: string;
  timeoutMs?: number;
}

export interface ProxyResponse<T = unknown> {
  status: number;
  ok: boolean;
  data: T | null;
  error?: string;
}
