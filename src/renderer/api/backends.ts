import { useSettingsStore } from '../store/settingsStore';
import type { BackendKind, Settings } from '../types/harmony';
import { api } from './client';

/**
 * What each backend can do in this app. The hub's local API (activities,
 * commands, reading its config) works with every backend.
 */
export interface BackendCapabilities {
  /** Sign in / create an account in the app. */
  account: boolean;
  /** Store edited configs and push them to the hub. */
  saveConfig: boolean;
  /** Look up devices (manufacturer/model IR database). */
  deviceDb: boolean;
  /** Register hubs to an account. */
  claimHubs: boolean;
}

export interface BackendInfo {
  kind: BackendKind;
  label: string;
  summary: string;
  capabilities: BackendCapabilities;
  /** Why missing capabilities are missing, shown next to disabled controls. */
  limitation?: string;
}

export const BACKENDS: Record<BackendKind, BackendInfo> = {
  logitech: {
    kind: 'logitech',
    label: 'Logitech cloud',
    summary:
      "Keep using Logitech's MyHarmony cloud while it is still online. Your hub stays as it is.",
    capabilities: { account: false, saveConfig: false, deviceDb: false, claimHubs: false },
    limitation:
      "Signing in to Logitech and editing through Logitech's cloud are not supported yet: the " +
      'sign-in protocol still has to be captured. Use the official Harmony app for edits, or ' +
      'move to harmony-server.',
  },
  'harmony-server': {
    kind: 'harmony-server',
    label: 'harmony-server (self-hosted)',
    summary:
      'Your own server stores your account, hub configs and the device database. Nothing ' +
      'depends on Logitech.',
    capabilities: { account: true, saveConfig: true, deviceDb: true, claimHubs: true },
  },
  none: {
    kind: 'none',
    label: 'Hub only (no cloud)',
    summary:
      'Talk to the hub on your network only: run activities, send commands and view its ' +
      'config. Nothing is saved anywhere else.',
    capabilities: { account: false, saveConfig: false, deviceDb: false, claimHubs: false },
    limitation:
      'Saving config changes needs a backend: a hub only accepts new config from the cloud ' +
      'it is provisioned with.',
  },
};

export function backendInfo(kind: BackendKind | null | undefined): BackendInfo | null {
  return kind ? BACKENDS[kind] : null;
}

/** The active backend; `info` is null only before onboarding. */
export function useBackend(): { info: BackendInfo | null; settings: Settings } {
  const settings = useSettingsStore((s) => s.settings);
  return { info: backendInfo(settings.backend), settings };
}

/** harmony-server features are usable: backend chosen, URL set and signed in. */
export function serverReady(settings: Settings): boolean {
  return settings.backend === 'harmony-server' && !!settings.serverUrl && !!settings.auth;
}

export interface BackendHealth {
  ok: boolean;
  latencyMs?: number;
  detail: string;
}

export async function checkBackend(settings: Settings): Promise<BackendHealth> {
  switch (settings.backend) {
    case 'harmony-server': {
      const h = await api.health();
      return {
        ok: true,
        latencyMs: h.latencyMs,
        detail: `${settings.serverUrl ?? ''}${h.version ? ` · server ${h.version}` : ''}`,
      };
    }
    case 'logitech': {
      const d = await window.harmony.logitech.discover();
      return {
        ok: true,
        latencyMs: d.latencyMs,
        detail: `Discovery online · ${d.services.length} services`,
      };
    }
    default:
      return { ok: true, detail: 'No cloud in use' };
  }
}
