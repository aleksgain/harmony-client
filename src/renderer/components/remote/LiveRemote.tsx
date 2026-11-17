import { useState } from 'react';
import { hubWs } from '../../api/hub-ws';
import { useHubConnection } from '../../hooks/useHubConnection';
import type { HarmonyAction, HarmonyDevice } from '../../types/harmony';
import { ErrorNote } from '../common/EmptyState';
import { RemoteButton } from './RemoteButton';

function parseAction(action: string): HarmonyAction | null {
  try {
    return JSON.parse(action) as HarmonyAction;
  } catch {
    return null;
  }
}

/** Virtual remote for one device: every command, grouped like MyHarmony. */
export function LiveRemote({
  hubId,
  device,
}: {
  hubId: string;
  device: HarmonyDevice;
}): JSX.Element {
  const { connected } = useHubConnection(hubId);
  const [error, setError] = useState<unknown>(null);
  const [filter, setFilter] = useState('');
  const needle = filter.toLowerCase();

  const send = async (command: string, holdMs: number): Promise<void> => {
    setError(null);
    try {
      await hubWs.sendCommand(hubId, device.id, command, holdMs);
    } catch (err) {
      setError(err);
      throw err;
    }
  };

  return (
    <div className="space-y-3">
      {!connected && <ErrorNote error="Hub is not connected — commands can't be sent." />}
      <ErrorNote error={error} />
      <input
        className="input"
        placeholder="Filter commands…"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
      />
      {device.controlGroup.map((g) => {
        const fns = g.function.filter(
          (f) =>
            !needle ||
            f.label.toLowerCase().includes(needle) ||
            f.name.toLowerCase().includes(needle),
        );
        if (fns.length === 0) return null;
        return (
          <div key={g.name}>
            <div className="label">{g.name}</div>
            <div className="grid grid-cols-4 gap-1.5 md:grid-cols-6">
              {fns.map((f) => {
                const cmd = parseAction(f.action)?.command ?? f.name;
                return (
                  <RemoteButton
                    key={f.name}
                    label={f.label || f.name}
                    disabled={!connected}
                    onSend={(ms) => send(cmd, ms)}
                  />
                );
              })}
            </div>
          </div>
        );
      })}
      {device.controlGroup.length === 0 && (
        <p className="muted text-sm">This device has no commands.</p>
      )}
    </div>
  );
}
