import { useState } from 'react';
import { hubWs } from '../../api/hub-ws';
import { useHubConnection } from '../../hooks/useHubConnection';
import { useHubStore } from '../../store/hubStore';
import { useSettingsStore } from '../../store/settingsStore';
import type { Hub } from '../../types/harmony';
import { Button } from '../common/Button';
import { HubStatusBadge } from '../layout/HubStatusBadge';

export function HubCard({ hub, onClaim }: { hub: Hub; onClaim: (hub: Hub) => void }): JSX.Element {
  const { status, connected, connecting, connect, disconnect, error } = useHubConnection(hub.id);
  const selected = useHubStore((s) => s.selectedHubId === hub.id);
  const select = useHubStore((s) => s.select);
  const claimed = useSettingsStore((s) => s.settings.knownHubs[hub.id]?.claimed ?? false);
  const [syncing, setSyncing] = useState(false);

  const sync = async (): Promise<void> => {
    setSyncing(true);
    try {
      await hubWs.sync(hub.id);
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className={`card flex flex-col gap-3 ${selected ? 'ring-2 ring-accent' : ''}`}>
      <div className="flex items-start justify-between">
        <div>
          <div className="font-semibold">{hub.friendlyName}</div>
          <div className="muted font-mono text-xs">
            {hub.ip}
            {hub.activeRemoteId && ` · remote ${hub.activeRemoteId}`}
          </div>
          {hub.hubSwVersion && <div className="muted text-xs">Firmware {hub.hubSwVersion}</div>}
        </div>
        <HubStatusBadge state={status?.state} transport={status?.transport} title={error ?? undefined} />
      </div>
      {error && status?.state === 'error' && <div className="text-xs text-red-600 dark:text-red-400">{error}</div>}
      <div className="flex flex-wrap gap-2">
        {!selected && (
          <Button size="sm" variant="primary" onClick={() => select(hub.id)}>
            Use this hub
          </Button>
        )}
        {connected ? (
          <Button size="sm" variant="ghost" onClick={() => void disconnect()}>
            Disconnect
          </Button>
        ) : (
          <Button size="sm" onClick={() => void connect()} loading={connecting}>
            Connect
          </Button>
        )}
        <Button size="sm" onClick={() => void sync()} disabled={!connected} loading={syncing} title="setup.sync">
          Sync
        </Button>
        {!claimed && (
          <Button size="sm" onClick={() => onClaim(hub)} disabled={!connected}>
            Claim…
          </Button>
        )}
        {claimed && <span className="muted self-center text-xs">Claimed on server</span>}
      </div>
    </div>
  );
}
