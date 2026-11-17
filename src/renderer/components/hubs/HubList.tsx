import { useState } from 'react';
import { useHubDiscovery } from '../../hooks/useHubDiscovery';
import { useHubStore } from '../../store/hubStore';
import type { Hub } from '../../types/harmony';
import { Button } from '../common/Button';
import { EmptyState, ErrorNote } from '../common/EmptyState';
import { HubCard } from './HubCard';

export function HubList({ onClaim }: { onClaim: (hub: Hub) => void }): JSX.Element {
  const hubs = useHubStore((s) => Object.values(s.hubs));
  const { discovering, scan } = useHubDiscovery();
  const [ip, setIp] = useState('');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const addByIp = async (): Promise<void> => {
    setAdding(true);
    setError(null);
    try {
      const hub = await window.harmony.hubs.addByIp(ip);
      useHubStore.getState().upsertHub(hub);
      setIp('');
    } catch (err) {
      setError(err);
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" onClick={() => void scan().catch(setError)} loading={discovering}>
          {discovering ? 'Scanning…' : 'Scan network'}
        </Button>
        <span className="muted text-sm">or add by IP:</span>
        <input
          className="input w-48"
          placeholder="192.168.1.40"
          value={ip}
          onChange={(e) => setIp(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && ip && void addByIp()}
        />
        <Button onClick={() => void addByIp()} disabled={!ip} loading={adding}>
          Add
        </Button>
      </div>
      <ErrorNote error={error} />
      {hubs.length === 0 ? (
        <EmptyState title="No hubs yet">
          Scanning broadcasts on UDP 5224; hubs answer on TCP 61991. If your hub is on another VLAN or subnet,
          broadcast won&apos;t reach it — add it by IP instead (TCP 8088 must be reachable).
        </EmptyState>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {hubs.map((h) => (
            <HubCard key={h.id} hub={h} onClaim={onClaim} />
          ))}
        </div>
      )}
    </div>
  );
}
