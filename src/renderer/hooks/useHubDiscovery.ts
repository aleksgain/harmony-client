import { useCallback, useEffect } from 'react';
import { useHubStore } from '../store/hubStore';

const DISCOVERY_WINDOW_MS = 15_000;

/**
 * Keeps the hub store in sync with main-process discovery. Call `scan()` to
 * broadcast for ~15 s; hubs that answer show up via `hub:discovered`.
 */
export function useHubDiscovery(): { discovering: boolean; scan: () => Promise<void> } {
  const discovering = useHubStore((s) => s.discovering);

  const scan = useCallback(async () => {
    const { setDiscovering } = useHubStore.getState();
    setDiscovering(true);
    try {
      await window.harmony.hubs.startDiscovery();
      window.setTimeout(() => {
        void window.harmony.hubs.stopDiscovery();
        useHubStore.getState().setDiscovering(false);
      }, DISCOVERY_WINDOW_MS);
    } catch (err) {
      setDiscovering(false);
      throw err;
    }
  }, []);

  return { discovering, scan };
}

/** Mount once at app root: wires IPC events into the store. */
export function useHubEventsBridge(): void {
  useEffect(() => {
    const { setHubs, upsertHub, setStatus } = useHubStore.getState();
    void window.harmony.hubs.list().then(setHubs);
    const offDisc = window.harmony.hubs.onDiscovered(upsertHub);
    const offStatus = window.harmony.hubs.onStatus(setStatus);
    return () => {
      offDisc();
      offStatus();
    };
  }, []);
}
