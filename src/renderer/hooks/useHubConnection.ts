import { useCallback, useEffect, useState } from 'react';
import { hubWs } from '../api/hub-ws';
import { useHubStatus } from '../store/hubStore';
import type { HubStatus } from '../types/harmony';

export function useHubConnection(hubId: string | null | undefined): {
  status: HubStatus | null;
  connected: boolean;
  connecting: boolean;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
} {
  const status = useHubStatus(hubId);
  const [error, setError] = useState<string | null>(null);

  const connect = useCallback(async () => {
    if (!hubId) return;
    setError(null);
    try {
      await hubWs.connect(hubId);
    } catch (err) {
      setError((err as Error).message);
    }
  }, [hubId]);

  const disconnect = useCallback(async () => {
    if (hubId) await hubWs.disconnect(hubId);
  }, [hubId]);

  // Auto-connect the selected hub once.
  useEffect(() => {
    if (hubId && (!status || status.state === 'disconnected')) void connect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hubId]);

  return {
    status,
    connected: status?.state === 'connected' || status?.state === 'syncing',
    connecting: status?.state === 'connecting',
    error: error ?? status?.error ?? null,
    connect,
    disconnect,
  };
}
