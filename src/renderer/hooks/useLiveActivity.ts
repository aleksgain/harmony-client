import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { hubWs } from '../api/hub-ws';
import { ActivityStatus } from '../types/harmony';

/**
 * Current activity for a hub: initial fetch via `getCurrentActivity`, then
 * kept fresh by `connect.stateDigest?notify` pushes (with a slow poll as a
 * safety net, since notifications are lost across reconnects).
 */
export function useLiveActivity(hubId: string | null, connected: boolean) {
  const qc = useQueryClient();
  const key = ['currentActivity', hubId];

  const query = useQuery({
    queryKey: key,
    queryFn: async () => ({
      activityId: await hubWs.getCurrentActivity(hubId as string),
      status: ActivityStatus.Started as ActivityStatus,
    }),
    enabled: !!hubId && connected,
    refetchInterval: 60_000,
  });

  useEffect(() => {
    if (!hubId) return;
    const offState = window.harmony.hub.onStateChange(hubId, (n) => {
      if (n.data?.activityId === undefined) return;
      qc.setQueryData(key, { activityId: String(n.data.activityId), status: n.data.activityStatus });
    });
    const offDone = window.harmony.hub.onActivityChanged(hubId, (n) => {
      qc.setQueryData(key, { activityId: n.data.activityId, status: ActivityStatus.Started });
    });
    return () => {
      offState();
      offDone();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hubId, qc]);

  return {
    activityId: query.data?.activityId ?? null,
    status: query.data?.status ?? null,
    isOff: query.data?.activityId === '-1',
    start: (activityId: string) => hubWs.startActivity(hubId as string, activityId),
    powerOff: () => hubWs.powerOff(hubId as string),
  };
}
