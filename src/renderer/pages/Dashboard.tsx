import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { backendInfo, checkBackend } from '../api/backends';
import { Button } from '../components/common/Button';
import { EmptyState } from '../components/common/EmptyState';
import { HubStatusBadge } from '../components/layout/HubStatusBadge';
import { useHubConfig } from '../hooks/useHubConfig';
import { useHubConnection } from '../hooks/useHubConnection';
import { useLiveActivity } from '../hooks/useLiveActivity';
import { useSelectedHub } from '../store/hubStore';
import { useSettingsStore } from '../store/settingsStore';

export function Dashboard(): JSX.Element {
  const hub = useSelectedHub();
  const settings = useSettingsStore((s) => s.settings);
  const { status, connected } = useHubConnection(hub?.id);
  const cfg = useHubConfig(hub?.id ?? null, connected);
  const live = useLiveActivity(hub?.id ?? null, connected);
  const info = backendInfo(settings.backend);
  const health = useQuery({
    queryKey: ['health', settings.backend, settings.serverUrl],
    queryFn: () => checkBackend(settings),
    refetchInterval: 60_000,
    retry: false,
  });

  const current = cfg.config?.activity.find((a) => a.id === live.activityId);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <section className="card space-y-1">
        <div className="label">Backend</div>
        <div className="truncate text-sm font-medium">{info?.label ?? 'Not chosen'}</div>
        <div className="text-sm">
          {health.isSuccess ? (
            <span className="text-emerald-600 dark:text-emerald-400">
              ✓ {health.data.detail}
              {health.data.latencyMs !== undefined && ` (${health.data.latencyMs} ms)`}
            </span>
          ) : health.isError ? (
            <span className="text-red-600 dark:text-red-400">
              Unreachable — {(health.error as Error).message}
            </span>
          ) : (
            <span className="muted">Checking…</span>
          )}
        </div>
        {settings.backend === 'harmony-server' && (
          <div className="muted text-xs">
            {settings.auth ? `Signed in as ${settings.auth.email}` : 'Not signed in'}
          </div>
        )}
      </section>

      <section className="card space-y-1">
        <div className="label">Hub</div>
        {hub ? (
          <>
            <div className="flex items-center justify-between">
              <span className="font-semibold">{hub.friendlyName}</span>
              <HubStatusBadge state={status?.state} transport={status?.transport} />
            </div>
            <div className="muted font-mono text-xs">{hub.ip}</div>
            <div className="text-sm">
              {cfg.config
                ? `${cfg.config.device.length} devices · ${cfg.config.activity.filter((a) => a.id !== '-1').length} activities`
                : '—'}
            </div>
          </>
        ) : (
          <Link to="/hubs" className="text-sm text-accent hover:underline">
            Find a hub →
          </Link>
        )}
      </section>

      <section className="card space-y-2">
        <div className="label">Now playing</div>
        <div className="text-lg font-semibold">
          {live.isOff
            ? 'Off'
            : (current?.label ?? (live.activityId ? `Activity ${live.activityId}` : '—'))}
        </div>
        <Button
          size="sm"
          variant="danger"
          disabled={!connected || live.isOff}
          onClick={() => void live.powerOff()}
        >
          Power off
        </Button>
      </section>

      {!hub && (
        <div className="lg:col-span-3">
          <EmptyState
            title="Get started"
            action={
              <Link className="text-accent hover:underline" to="/hubs">
                Go to Hubs
              </Link>
            }
          >
            Scan for your Harmony Hub on the local network (or add it by IP if it is on another
            subnet), then run activities and edit devices.
          </EmptyState>
        </div>
      )}
    </div>
  );
}
