import { useState } from 'react';
import { api } from '../../api/client';
import { useSettingsStore } from '../../store/settingsStore';
import type { ServerHealth } from '../../types/api';
import { DEFAULT_SERVERS } from '../../types/harmony';
import { Button } from '../common/Button';
import { ErrorNote } from '../common/EmptyState';

const CANDIDATE_LABELS: Record<string, string> = {
  'https://harmony.local': 'harmony.local (mDNS)',
  'http://localhost:8765': 'This computer',
  'http://192.168.1.x:8765': 'Local network (edit the address)',
};

/** harmony-server REST endpoint used by this app. */
export function ServerConfig({ onSaved }: { onSaved?: () => void }): JSX.Element {
  const { settings, update } = useSettingsStore();
  const [url, setUrl] = useState(settings.serverUrl ?? '');
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<ServerHealth | null>(null);
  const [error, setError] = useState<unknown>(null);

  const test = async (candidate = url): Promise<boolean> => {
    setTesting(true);
    setError(null);
    setResult(null);
    try {
      const health = await api.health(candidate.trim());
      setResult(health);
      return true;
    } catch (err) {
      setError(err);
      return false;
    } finally {
      setTesting(false);
    }
  };

  const save = async (): Promise<void> => {
    const clean = url.trim().replace(/\/+$/, '');
    await update({ serverUrl: clean || null });
    onSaved?.();
  };

  const autodetect = async (): Promise<void> => {
    for (const c of DEFAULT_SERVERS) {
      if (c.includes('.x:')) continue;
      setUrl(c);
      if (await test(c)) return;
    }
  };

  return (
    <section className="card space-y-3">
      <div>
        <h2 className="font-semibold">harmony-server</h2>
        <p className="muted text-sm">
          The REST API this app uses for your account, saved hub configs and the device database.
        </p>
      </div>
      <div>
        <label className="label" htmlFor="server-url">
          Server URL
        </label>
        <div className="flex gap-2">
          <input
            id="server-url"
            className="input"
            placeholder="https://harmony.local"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void test()}
          />
          <Button onClick={() => void test()} loading={testing} disabled={!url.trim()}>
            Test connection
          </Button>
          <Button variant="primary" onClick={() => void save()} disabled={!url.trim()}>
            Save
          </Button>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {DEFAULT_SERVERS.map((c) => (
            <button
              key={c}
              className="rounded-full border border-slate-300 px-2 py-0.5 text-xs hover:border-accent dark:border-navy-600"
              onClick={() => setUrl(c)}
            >
              {CANDIDATE_LABELS[c] ?? c}
            </button>
          ))}
          <button className="text-xs text-accent hover:underline" onClick={() => void autodetect()}>
            Auto-detect
          </button>
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={settings.allowInsecureTls}
          onChange={(e) => void update({ allowInsecureTls: e.target.checked })}
        />
        Accept a self-signed certificate from this server
        <span className="muted text-xs">(applies to the server above only)</span>
      </label>
      {result && (
        <div className="text-sm text-emerald-600 dark:text-emerald-400">
          ✓ Reachable in {result.latencyMs} ms{result.version ? ` — server ${result.version}` : ''}
        </div>
      )}
      <ErrorNote error={error} />
    </section>
  );
}
