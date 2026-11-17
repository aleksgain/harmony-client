import { useNavigate } from 'react-router-dom';
import { ServerConfig } from '../components/settings/ServerConfig';

/** Shown when no harmony-server URL is configured. */
export function OnboardingPage(): JSX.Element {
  const navigate = useNavigate();
  return (
    <div className="flex h-full items-center justify-center p-8">
      <div className="w-full max-w-2xl space-y-4">
        <div>
          <h1 className="text-2xl font-semibold">Welcome to Harmony Revival</h1>
          <p className="muted mt-1">
            This app replaces MyHarmony for configuring Harmony Hubs. It needs a{' '}
            <strong>harmony-server</strong> — the self-hosted replacement for Logitech&apos;s cloud
            — to store your hub configuration and look up devices. Point it at your server to get
            started.
          </p>
        </div>
        <ServerConfig onSaved={() => navigate('/hubs')} />
        <p className="muted text-xs">
          Don&apos;t have a server yet? Run <code>harmony-server</code> with Docker and use{' '}
          <code>http://localhost:8765</code>.
        </p>
      </div>
    </div>
  );
}
