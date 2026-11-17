import { useQuery } from '@tanstack/react-query';
import { useSettingsStore } from '../store/settingsStore';

export type HubCloud = 'logitech' | 'this-server' | 'other';

export interface HubCloudInfo {
  cloud: HubCloud;
  discoveryServer: string;
}

/** Classify a hub's `discoveryServer` against the app's configured server. */
export function classifyDiscoveryServer(
  discoveryServer: string,
  serverUrl: string | null,
): HubCloud {
  let host = '';
  try {
    host = new URL(discoveryServer).hostname.toLowerCase();
  } catch {
    return 'other';
  }
  if (host.endsWith('myharmony.com')) return 'logitech';
  try {
    if (serverUrl && new URL(serverUrl).hostname.toLowerCase() === host) return 'this-server';
  } catch {
    /* fall through */
  }
  return 'other';
}

/**
 * Which cloud the hub itself is provisioned with (`discoveryServer` in its
 * state digest). The hub pulls config from there on `setup.sync`, so while it
 * still points at Logitech, edits saved to harmony-server do not reach it.
 */
export function useHubCloud(hubId: string | null | undefined, connected: boolean) {
  const serverUrl = useSettingsStore((s) => s.settings.serverUrl);
  return useQuery({
    queryKey: ['hubCloud', hubId, serverUrl],
    enabled: !!hubId && connected,
    staleTime: 60_000,
    queryFn: async (): Promise<HubCloudInfo | null> => {
      const digest = await window.harmony.hub.getStateDigest(hubId as string);
      const ds = typeof digest.discoveryServer === 'string' ? digest.discoveryServer : '';
      if (!ds) return null;
      return { cloud: classifyDiscoveryServer(ds, serverUrl), discoveryServer: ds };
    },
  });
}
