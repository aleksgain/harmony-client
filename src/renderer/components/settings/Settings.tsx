import { useEffect, useState } from 'react';
import { useSettingsStore } from '../../store/settingsStore';
import type { Theme } from '../../types/harmony';
import { Button } from '../common/Button';
import { AccountPanel } from './AccountPanel';
import { DnsRewriteHelp } from './DnsRewriteHelp';
import { HubDiscoveryServerConfig } from './HubDiscoveryServerConfig';
import { ServerConfig } from './ServerConfig';

export function Settings(): JSX.Element {
  const { settings, update } = useSettingsStore();
  const [version, setVersion] = useState('');

  useEffect(() => {
    void window.harmony.app.getVersion().then(setVersion);
  }, []);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <ServerConfig />
      <AccountPanel />
      <HubDiscoveryServerConfig />

      <section className="card grid grid-cols-2 gap-4">
        <div>
          <label className="label" htmlFor="theme">
            Appearance
          </label>
          <select
            id="theme"
            className="input"
            value={settings.theme}
            onChange={(e) => void update({ theme: e.target.value as Theme })}
          >
            <option value="system">Match system</option>
            <option value="dark">Dark</option>
            <option value="light">Light</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="transport">
            Local hub protocol
          </label>
          <select
            id="transport"
            className="input"
            value={settings.preferredTransport}
            onChange={(e) => void update({ preferredTransport: e.target.value as 'websocket' | 'xmpp' })}
          >
            <option value="websocket">WebSocket (port 8088) — recommended</option>
            <option value="xmpp">XMPP (port 5222) — legacy fallback</option>
          </select>
          <p className="muted mt-1 text-xs">The other protocol is tried automatically if the preferred one fails.</p>
        </div>
      </section>

      <DnsRewriteHelp />

      <section className="card flex items-center justify-between text-sm">
        <span className="muted">Harmony Revival {version}</span>
        <Button size="sm" onClick={() => void window.harmony.updater.check()}>
          Check for updates
        </Button>
      </section>
    </div>
  );
}
