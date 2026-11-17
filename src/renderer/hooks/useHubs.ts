import { useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useHubsStore } from '../store/hubs';
import type { Hub } from '../../shared/harmony';

/** Fetch hub list + set up push-notification listeners. */
export function useHubList() {
  const { setHub, setStatus } = useHubsStore();
  const qc = useQueryClient();

  // Initial load
  const query = useQuery({
    queryKey: ['hubs'],
    queryFn: () => window.harmony.hubs.list(),
    onSuccess(hubs: Hub[]) {
      hubs.forEach((h) => setHub(h));
    },
  });

  // Push from main
  useEffect(() => {
    const unsubDiscover = window.harmony.hubs.onDiscovered((hub) => {
      setHub(hub);
      qc.invalidateQueries({ queryKey: ['hubs'] });
    });
    const unsubStatus = window.harmony.hubs.onStatus((status) => {
      setStatus(status);
    });
    return () => {
      unsubDiscover();
      unsubStatus();
    };
  }, [setHub, setStatus, qc]);

  return query;
}

export function useHubConfig(hubId: string) {
  const { setConfig } = useHubsStore();
  return useQuery({
    queryKey: ['hub', hubId, 'config'],
    queryFn: () => window.harmony.hub.getConfig(hubId),
    enabled: !!hubId,
    onSuccess(config) {
      setConfig(hubId, config);
    },
  });
}

export function useStartActivity(hubId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (activityId: string) =>
      window.harmony.hub.startActivity(hubId, activityId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['hub', hubId] });
    },
  });
}

export function useSendCommand() {
  return useMutation({
    mutationFn: ({
      hubId,
      deviceId,
      command,
      holdMs,
    }: {
      hubId: string;
      deviceId: string;
      command: string;
      holdMs?: number;
    }) => window.harmony.hub.sendCommand(hubId, deviceId, command, holdMs),
  });
}

export function useDiscovery() {
  const { setDiscovering } = useHubsStore();

  const start = useCallback(async () => {
    setDiscovering(true);
    await window.harmony.hubs.startDiscovery();
  }, [setDiscovering]);

  const stop = useCallback(async () => {
    await window.harmony.hubs.stopDiscovery();
    setDiscovering(false);
  }, [setDiscovering]);

  return { start, stop };
}
