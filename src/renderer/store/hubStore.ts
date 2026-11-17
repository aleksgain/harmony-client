import { create } from 'zustand';
import type { Hub, HubStatus } from '../types/harmony';

interface HubState {
  hubs: Record<string, Hub>;
  status: Record<string, HubStatus>;
  selectedHubId: string | null;
  discovering: boolean;
  upsertHub: (hub: Hub) => void;
  setHubs: (hubs: Hub[]) => void;
  setStatus: (s: HubStatus) => void;
  select: (hubId: string | null) => void;
  setDiscovering: (v: boolean) => void;
}

export const useHubStore = create<HubState>((set) => ({
  hubs: {},
  status: {},
  selectedHubId: null,
  discovering: false,
  upsertHub: (hub) =>
    set((s) => ({
      hubs: { ...s.hubs, [hub.id]: { ...s.hubs[hub.id], ...hub } },
      selectedHubId: s.selectedHubId ?? hub.id,
    })),
  setHubs: (hubs) =>
    set((s) => {
      const map = { ...s.hubs };
      for (const h of hubs) map[h.id] = { ...map[h.id], ...h };
      return { hubs: map, selectedHubId: s.selectedHubId ?? hubs[0]?.id ?? null };
    }),
  setStatus: (st) => set((s) => ({ status: { ...s.status, [st.hubId]: st } })),
  select: (hubId) => set({ selectedHubId: hubId }),
  setDiscovering: (v) => set({ discovering: v }),
}));

export function useSelectedHub(): Hub | null {
  return useHubStore((s) => (s.selectedHubId ? (s.hubs[s.selectedHubId] ?? null) : null));
}

export function useHubStatus(hubId: string | null | undefined): HubStatus | null {
  return useHubStore((s) => (hubId ? (s.status[hubId] ?? null) : null));
}
