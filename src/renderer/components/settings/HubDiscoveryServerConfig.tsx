import { useState } from 'react';
import { api } from '../../api/client';
import { useSettingsStore } from '../../store/settingsStore';
import { LOGITECH_DISCOVERY_SERVER, normalizeDiscoveryServer } from '../../types/harmony';
import { Button } from '../common/Button';
import { ErrorNote } from '../common/EmptyState';

/**
 * The discovery server written into a hub during USB provisioning. After
 * provisioning, this is the backend the hub contacts for everything — the
 * single setting that moves a hub off Logitech's cloud.
 */
export function HubDiscoveryServerConfig(): JSX.Element {
  const { settings, update } = useSettingsStore();
  const [value, setValue] = useState(settings.hubDiscoveryServer);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [testing, setTesting] = useState(false);

  const test = async (): Promise<void> => {
    setTesting(true);
    setError(null);
    setStatus(null);
    try {
      const origin = new URL(normalizeDiscoveryServer(value)).origin;
      const h = await api.health(origin);
      setStatus(`Reachable in ${h.latencyMs} ms`);
    } catch (err) {
      setError(err);
    } finally {
      setTesting(false);
    }
  };

  const isLogitech = value.includes('svcs.myharmony.com');

  return (
    <section className="card space-y-3">
      <div>
        <h2 className="font-semibold">Hub discovery server</h2>
        <p className="muted text-sm">
          Written into the hub as <code>discoveryServer</code> when you provision it over USB. The
          hub uses it for all future cloud contact. Stored as{' '}
          <code>{normalizeDiscoveryServer(value || LOGITECH_DISCOVERY_SERVER)}</code>.
        </p>
      </div>
      <div className="flex gap-2">
        <input className="input" value={value} onChange={(e) => setValue(e.target.value)} />
        <Button onClick={() => void test()} loading={testing}>
          Test connection
        </Button>
        <Button variant="primary" onClick={() => void update({ hubDiscoveryServer: value.trim() })}>
          Save
        </Button>
      </div>
      <div className="flex flex-wrap gap-2 text-xs">
        <button
          className="text-accent hover:underline"
          onClick={() => setValue(LOGITECH_DISCOVERY_SERVER)}
        >
          Logitech default
        </button>
        {settings.serverUrl && (
          <button
            className="text-accent hover:underline"
            onClick={() => setValue(settings.serverUrl ?? '')}
          >
            Use my harmony-server ({settings.serverUrl})
          </button>
        )}
      </div>
      {isLogitech && (
        <p className="text-xs text-amber-700 dark:text-amber-400">
          Logitech&apos;s default leaves the hub on Logitech&apos;s cloud. Point this at your own
          harmony-server for self-hosted mode, or use a DNS override (below) instead.
        </p>
      )}
      {status && <div className="text-sm text-emerald-600 dark:text-emerald-400">✓ {status}</div>}
      <ErrorNote error={error} />
    </section>
  );
}
