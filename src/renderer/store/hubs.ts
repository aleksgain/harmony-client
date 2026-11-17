import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type { Hub, HubStatus, HarmonyConfig } from '../../shared/harmony';

interface HubsState {
  hubs: Record<string, Hub>;
  status: Record<string, HubStatus>;
  configs: Record<string, HarmonyConfig>;
  currentActivity: Record<string, string>;
  discovering: boolean;
  setHub(hub: Hub): void;
  setStatus(status: HubStatus): void;
  setConfig(hubId: string, config: HarmonyConfig): void;
  setCurrentActivity(hubId: string, activityId: string): void;
  setDiscovering(discovering: boolean): void;
  removeHub(hubId: string): void;
}

export const useHubsStore = create<HubsState>()(
  immer((set) => ({
    hubs: {},
    status: {},
    configs: {},
    currentActivity: {},
    discovering: false,

    setHub(hub) {
      set((draft) => {
        draft.hubs[hub.id] = hub;
      });
    },

    setStatus(status) {
      set((draft) => {
        draft.status[status.hubId] = status;
      });
    },

    setConfig(hubId, config) {
      set((draft) => {
        draft.configs[hubId] = config;
      });
    },

    setCurrentActivity(hubId, activityId) {
      set((draft) => {
        draft.currentActivity[hubId] = activityId;
      });
    },

    setDiscovering(discovering) {
      set((draft) => {
        draft.discovering = discovering;
      });
    },

    removeHub(hubId) {
      set((draft) => {
        delete draft.hubs[hubId];
        delete draft.status[hubId];
        delete draft.configs[hubId];
        delete draft.currentActivity[hubId];
      });
    },
  })),
);
