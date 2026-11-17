import { useEffect } from 'react';
import type { HubNotification, StateDigest } from '../types/harmony';

/**
 * The renderer never opens a socket to the hub itself: the WebSocket/XMPP
 * connection lives in the main process (see src/main/hub-websocket.ts). This
 * module is the thin typed layer over that IPC surface.
 */
export const hubWs = {
  connect: (hubId: string) => window.harmony.hubs.connect(hubId),
  disconnect: (hubId: string) => window.harmony.hubs.disconnect(hubId),
  getConfig: (hubId: string) => window.harmony.hub.getConfig(hubId),
  getCurrentActivity: (hubId: string) => window.harmony.hub.getCurrentActivity(hubId),
  startActivity: (hubId: string, activityId: string) => window.harmony.hub.startActivity(hubId, activityId),
  powerOff: (hubId: string) => window.harmony.hub.startActivity(hubId, '-1'),
  sendCommand: (hubId: string, deviceId: string, command: string, holdMs?: number) =>
    window.harmony.hub.sendCommand(hubId, deviceId, command, holdMs),
  sync: (hubId: string) => window.harmony.hub.syncConfig(hubId),
};

/** Subscribe to `connect.stateDigest?notify` for one hub. */
export function useHubStateNotifications(
  hubId: string | null,
  cb: (n: HubNotification<StateDigest>) => void,
): void {
  useEffect(() => {
    if (!hubId) return;
    return window.harmony.hub.onStateChange(hubId, cb);
  }, [hubId, cb]);
}
