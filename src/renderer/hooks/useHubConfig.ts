import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { api, ApiError } from '../api/client';
import { hubWs } from '../api/hub-ws';
import { isDirty, useConfigStore } from '../store/configStore';
import { useSettingsStore } from '../store/settingsStore';
import type { HarmonyConfig } from '../types/harmony';

/**
 * Config workflow:
 *   1. load the live config from the hub (`engine?config` over local WS)
 *   2. load the server-stored config (`GET /api/hubs/{id}/config`)
 *   3. edit a draft; save PUTs it to the server (bumps configVersion)
 *   4. trigger `setup.sync` so the hub pulls the new config immediately
 *
 * Which one seeds the draft: the server copy wins when it's at least as new
 * as the hub's, because it may contain edits the hub hasn't synced yet.
 */
export function useHubConfig(hubId: string | null, hubConnected: boolean) {
  const qc = useQueryClient();
  const serverConfigured = useSettingsStore((s) => !!s.settings.serverUrl);
  const entry = useConfigStore((s) => (hubId ? s.configs[hubId] : undefined));
  const setLoaded = useConfigStore((s) => s.setLoaded);
  const markSaved = useConfigStore((s) => s.markSaved);

  const hubQuery = useQuery({
    queryKey: ['hubConfig', 'hub', hubId],
    queryFn: () => hubWs.getConfig(hubId as string),
    enabled: !!hubId && hubConnected,
  });

  const serverQuery = useQuery({
    queryKey: ['hubConfig', 'server', hubId],
    queryFn: async (): Promise<HarmonyConfig | null> => {
      try {
        return await api.getHubConfig(hubId as string);
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) return null; // not claimed yet
        throw err;
      }
    },
    enabled: !!hubId && serverConfigured,
  });

  // Seed the draft once both sources settled, without clobbering unsaved edits.
  useEffect(() => {
    if (!hubId || isDirty(entry)) return;
    const hub = hubQuery.data;
    const server = serverQuery.data;
    if (hubQuery.isFetching || serverQuery.isFetching) return;
    const pick =
      server && (!hub || (server.configVersion ?? 0) >= (hub.configVersion ?? 0))
        ? { cfg: server, src: 'server' as const }
        : hub
          ? { cfg: hub, src: 'hub' as const }
          : null;
    if (pick && pick.cfg !== entry?.base) setLoaded(hubId, pick.cfg, pick.src);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hubId, hubQuery.data, serverQuery.data, hubQuery.isFetching, serverQuery.isFetching]);

  const save = useMutation({
    mutationFn: async () => {
      if (!hubId || !entry) throw new Error('Nothing to save');
      const saved = await api.putHubConfig(hubId, entry.draft);
      markSaved(hubId, { activity: saved.activity, device: saved.device, configVersion: saved.configVersion });
      // Push to hub immediately if we can reach it; otherwise it syncs on its own schedule.
      if (hubConnected) await hubWs.sync(hubId);
      return saved;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['hubConfig', 'hub', hubId] });
    },
  });

  return {
    config: entry?.draft ?? null,
    source: entry?.source ?? null,
    dirty: isDirty(entry),
    loading: hubQuery.isLoading || serverQuery.isLoading,
    error: hubQuery.error ?? serverQuery.error ?? save.error ?? null,
    save,
    reload: async () => {
      if (hubId) useConfigStore.getState().discard(hubId);
      await Promise.all([hubQuery.refetch(), serverQuery.refetch()]);
    },
  };
}
