import { useNavigate } from 'react-router-dom';
import { BackendPicker } from '../components/settings/BackendPicker';

/** First run: choose a backend. harmony-server details are set up afterwards in Settings. */
export function OnboardingPage(): JSX.Element {
  const navigate = useNavigate();
  return (
    <div className="flex h-full items-center justify-center p-8">
      <div className="w-full max-w-3xl space-y-4">
        <div>
          <h1 className="text-2xl font-semibold">Welcome to Harmony Revival</h1>
          <p className="muted mt-1">
            Configure and control Harmony Hubs, with or without Logitech&apos;s cloud. Start with
            what you use today; you can move to a self-hosted <strong>harmony-server</strong> later,
            step by step.
          </p>
        </div>
        <BackendPicker
          onPicked={(kind) => navigate(kind === 'harmony-server' ? '/settings' : '/hubs')}
        />
        <p className="muted text-xs">
          No server yet? Run <code>harmony-server</code> with Docker (it listens on{' '}
          <code>http://localhost</code>) and pick harmony-server.
        </p>
      </div>
    </div>
  );
}
