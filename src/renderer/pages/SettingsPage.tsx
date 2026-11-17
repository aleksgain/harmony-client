import { useState } from 'react';
import { useSettingsStore } from '../store/settings';
import type { Theme } from '../../shared/harmony';
import { DEFAULT_SERVERS } from '../../shared/harmony';
import clsx from 'clsx';

export default function SettingsPage() {
  const settings = useSettingsStore();
  const [serverUrl, setServerUrl] = useState(settings.serverUrl ?? '');
  const [saved, setSaved] = useState(false);

  async function save() {
    await settings.update({ serverUrl: serverUrl || null });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-muted mt-0.5">Configure the Harmony Revival client</p>
      </div>

      {/* Server URL */}
      <Section title="Server" description="URL of your self-hosted harmony-server instance.">
        <div className="flex flex-col gap-2">
          <input
            value={serverUrl}
            onChange={(e) => setServerUrl(e.target.value)}
            placeholder={DEFAULT_SERVERS[1]}
            className="px-3 py-2 rounded-lg border border-default bg-subtle text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
          <div className="flex gap-2 items-center">
            {DEFAULT_SERVERS.map((s) => (
              <button
                key={s}
                onClick={() => setServerUrl(s)}
                className="text-xs px-2 py-0.5 rounded border border-default bg-surface hover:bg-subtle"
              >
                {s}
              </button>
            ))}
          </div>
          <button
            onClick={save}
            className="self-start px-4 py-1.5 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-700 transition-colors"
          >
            {saved ? '✓ Saved' : 'Save'}
          </button>
        </div>
      </Section>

      {/* Transport */}
      <Section title="Hub transport" description="Preferred local protocol for controlling a connected hub.">
        <div className="flex gap-2">
          {(['websocket', 'xmpp'] as const).map((t) => (
            <button
              key={t}
              onClick={() => settings.update({ preferredTransport: t })}
              className={clsx(
                'px-4 py-2 rounded-lg border text-sm transition-colors',
                settings.preferredTransport === t
                  ? 'border-blue-400 bg-blue-50 dark:bg-blue-950 text-accent'
                  : 'border-default bg-surface hover:bg-subtle',
              )}
            >
              {t === 'websocket' ? 'WebSocket (8088)' : 'XMPP (5222)'}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted">
          WebSocket is faster. Use XMPP if the hub has connection issues.
        </p>
      </Section>

      {/* Theme */}
      <Section title="Theme" description="Appearance">
        <div className="flex gap-2">
          {(['system', 'light', 'dark'] as Theme[]).map((t) => (
            <button
              key={t}
              onClick={() => settings.update({ theme: t })}
              className={clsx(
                'px-4 py-2 rounded-lg border text-sm capitalize transition-colors',
                settings.theme === t
                  ? 'border-blue-400 bg-blue-50 dark:bg-blue-950 text-accent'
                  : 'border-default bg-surface hover:bg-subtle',
              )}
            >
              {t}
            </button>
          ))}
        </div>
      </Section>

      {/* TLS */}
      <Section title="TLS" description="Certificate validation for self-hosted servers.">
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={settings.allowInsecureTls}
            onChange={(e) => settings.update({ allowInsecureTls: e.target.checked })}
            className="w-4 h-4 rounded"
          />
          <span className="text-sm">
            Allow self-signed certificates{' '}
            <span className="text-muted">(required for https://harmony.local)</span>
          </span>
        </label>
      </Section>

      {/* DNS rewrite guide */}
      <Section
        title="Legacy MyHarmony compatibility"
        description="Run the original Logitech MyHarmony software against your self-hosted server via DNS rewrites."
      >
        <div className="p-4 bg-subtle rounded-lg font-mono text-xs space-y-1">
          <p className="text-muted"># Add to your local DNS resolver / Pi-hole / Unbound</p>
          <p>svcs.myharmony.com → <span className="text-accent">&lt;your-server-ip&gt;</span></p>
          <p>setup.myharmony.com → <span className="text-accent">&lt;your-server-ip&gt;</span></p>
          <p>content.dhg.myharmony.com → <span className="text-accent">&lt;your-server-ip&gt;</span></p>
          <p>sus.dhg.myharmony.com → <span className="text-accent">&lt;your-server-ip&gt;</span></p>
        </div>
        <p className="text-xs text-muted">
          harmony-server listens on port 80/443 and handles all legacy endpoints.
          The original MyHarmony.exe will work without modification.
        </p>
      </Section>

      {/* Auth */}
      <Section title="Authentication" description="Logitech account credentials used for hub claiming.">
        {settings.auth ? (
          <div className="flex items-center justify-between p-3 bg-subtle rounded-lg">
            <div className="text-sm">
              <div className="font-medium">{settings.auth.email}</div>
              <div className="text-xs text-muted">Account ID: {settings.auth.accountId}</div>
            </div>
            <button
              onClick={() => settings.update({ auth: null })}
              className="text-xs text-red-500 hover:text-red-600"
            >
              Sign out
            </button>
          </div>
        ) : (
          <p className="text-sm text-muted">
            Not signed in. Auth tokens are obtained via harmony-server's{' '}
            <code className="text-xs bg-subtle px-1 py-0.5 rounded">/martiniweb/account/ProceedWithLIPLogin</code>{' '}
            endpoint.
          </p>
        )}
      </Section>

      {/* Updates */}
      <Section title="Updates" description="Check for new versions of Harmony Revival.">
        <button
          onClick={() => window.harmony.updater.check()}
          className="px-4 py-1.5 rounded-lg border border-default bg-surface text-sm hover:bg-subtle transition-colors"
        >
          Check for updates
        </button>
      </Section>
    </div>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-surface border border-default rounded-xl p-5">
      <h3 className="font-semibold mb-0.5">{title}</h3>
      {description && <p className="text-sm text-muted mb-3">{description}</p>}
      <div className="flex flex-col gap-2">{children}</div>
    </div>
  );
}
