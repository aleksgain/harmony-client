import { useEffect, useState } from 'react';
import { useSettingsStore } from '../../store/settingsStore';
import type { Theme } from '../../types/harmony';
import { Button } from '../common/Button';
import { MigrateToSelfHosted } from '../migration/MigrateToSelfHosted';
import { AccountPanel } from './AccountPanel';
import { BackendPicker } from './BackendPicker';
import { DnsRewriteHelp } from './DnsRewriteHelp';
import { HubDiscoveryServerConfig } from './HubDiscoveryServerConfig';
import { LogitechPanel } from './LogitechPanel';
import { ServerConfig } from './ServerConfig';

export function Settings(): JSX.Element {
  const { settings, update } = useSettingsStore();
  const [version, setVersion] = useState('');
  const [migrating, setMigrating] = useState(false);
  const selfHosted = settings.backend === 'harmony-server';

  useEffect(() => {
    void window.harmony.app.getVersion().then(setVersion);
  }, []);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <BackendPicker />

      <section className="card flex items-center justify-between gap-4 text-sm">
        <div>
          <h2 className="font-semibold">Move to self-hosted</h2>
          <p className="muted">
            {selfHosted
              ? 'Copy another hub to your harmony-server, or check whether your hubs are repointed.'
              : 'Copy your hubs to a harmony-server and switch this app to it, step by step.'}
          </p>
        </div>
        <Button variant={selfHosted ? 'secondary' : 'primary'} onClick={() => setMigrating(true)}>
          {selfHosted ? 'Open' : 'Start'}
        </Button>
      </section>

      {settings.backend === 'logitech' && <LogitechPanel />}
      {selfHosted && (
        <>
          <ServerConfig />
          <AccountPanel />
          <HubDiscoveryServerConfig />
        </>
      )}

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
            onChange={(e) =>
              void update({ preferredTransport: e.target.value as 'websocket' | 'xmpp' })
            }
          >
            <option value="websocket">WebSocket (port 8088) — recommended</option>
            <option value="xmpp">XMPP (port 5222) — legacy fallback</option>
          </select>
          <p className="muted mt-1 text-xs">
            The other protocol is tried automatically if the preferred one fails.
          </p>
        </div>
      </section>

      {selfHosted && <DnsRewriteHelp />}

      <section className="card flex items-center justify-between text-sm">
        <span className="muted">Harmony Revival {version}</span>
        <Button size="sm" onClick={() => void window.harmony.updater.check()}>
          Check for updates
        </Button>
      </section>
      {migrating && <MigrateToSelfHosted onClose={() => setMigrating(false)} />}
    </div>
  );
}
