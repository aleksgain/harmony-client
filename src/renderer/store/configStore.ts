import { create } from 'zustand';
import type { Activity, HarmonyConfig, HarmonyDevice } from '../types/harmony';

/**
 * Working copy of each hub's config. `base` is what was last loaded/saved,
 * `draft` is what the user is editing. Saving PUTs `draft` to the server.
 */
interface HubConfigEntry {
  base: HarmonyConfig;
  draft: HarmonyConfig;
  source: 'hub' | 'server';
}

interface ConfigState {
  configs: Record<string, HubConfigEntry>;
  setLoaded: (hubId: string, config: HarmonyConfig, source: 'hub' | 'server') => void;
  markSaved: (hubId: string, config: HarmonyConfig) => void;
  discard: (hubId: string) => void;
  addDevice: (hubId: string, device: HarmonyDevice) => void;
  updateDevice: (hubId: string, deviceId: string, patch: Partial<HarmonyDevice>) => void;
  removeDevice: (hubId: string, deviceId: string) => void;
  upsertActivity: (hubId: string, activity: Activity) => void;
  removeActivity: (hubId: string, activityId: string) => void;
}

const EMPTY: HarmonyConfig = { activity: [], device: [] };

function mutateDraft(
  state: ConfigState,
  hubId: string,
  fn: (draft: HarmonyConfig) => HarmonyConfig,
): Partial<ConfigState> {
  const entry = state.configs[hubId] ?? { base: EMPTY, draft: EMPTY, source: 'server' as const };
  return { configs: { ...state.configs, [hubId]: { ...entry, draft: fn(entry.draft) } } };
}

export const useConfigStore = create<ConfigState>((set) => ({
  configs: {},
  setLoaded: (hubId, config, source) =>
    set((s) => ({ configs: { ...s.configs, [hubId]: { base: config, draft: config, source } } })),
  markSaved: (hubId, config) =>
    set((s) => ({
      configs: { ...s.configs, [hubId]: { base: config, draft: config, source: 'server' } },
    })),
  discard: (hubId) =>
    set((s) => {
      const e = s.configs[hubId];
      return e ? { configs: { ...s.configs, [hubId]: { ...e, draft: e.base } } } : {};
    }),
  addDevice: (hubId, device) =>
    set((s) => mutateDraft(s, hubId, (d) => ({ ...d, device: [...d.device, device] }))),
  updateDevice: (hubId, deviceId, patch) =>
    set((s) =>
      mutateDraft(s, hubId, (d) => ({
        ...d,
        device: d.device.map((x) => (x.id === deviceId ? { ...x, ...patch } : x)),
      })),
    ),
  removeDevice: (hubId, deviceId) =>
    set((s) =>
      mutateDraft(s, hubId, (d) => ({
        device: d.device.filter((x) => x.id !== deviceId),
        // Drop the device from activities too, or the hub rejects the config.
        activity: d.activity.map((a) => ({
          ...a,
          devices: a.devices.filter((id) => id !== deviceId),
          powerSequence: a.powerSequence?.filter((p) => p.deviceId !== deviceId),
        })),
        configVersion: d.configVersion,
      })),
    ),
  upsertActivity: (hubId, activity) =>
    set((s) =>
      mutateDraft(s, hubId, (d) => {
        const exists = d.activity.some((a) => a.id === activity.id);
        return {
          ...d,
          activity: exists
            ? d.activity.map((a) => (a.id === activity.id ? activity : a))
            : [...d.activity, activity],
        };
      }),
    ),
  removeActivity: (hubId, activityId) =>
    set((s) => mutateDraft(s, hubId, (d) => ({ ...d, activity: d.activity.filter((a) => a.id !== activityId) }))),
}));

export function isDirty(entry: HubConfigEntry | undefined): boolean {
  return !!entry && entry.base !== entry.draft;
}

/** Client-side ids for new devices/activities until the server assigns real ones. */
export function newLocalId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}
