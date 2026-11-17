import { useQuery } from '@tanstack/react-query';
import { BACKENDS } from '../../api/backends';
import { servicesByHost } from '../../types/harmony';
import { Button } from '../common/Button';
import { ErrorNote } from '../common/EmptyState';

/** Status of Logitech's MyHarmony cloud (read-only). */
export function LogitechPanel(): JSX.Element {
  const discovery = useQuery({
    queryKey: ['logitechDiscovery'],
    queryFn: () => window.harmony.logitech.discover(),
    retry: false,
    staleTime: 5 * 60_000,
  });
  const groups = discovery.data ? servicesByHost(discovery.data.services) : {};

  return (
    <section className="card space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-semibold">Logitech cloud</h2>
          <p className="muted text-sm">
            Checks that Logitech&apos;s MyHarmony services still answer. Nothing is sent to your
            Logitech account.
          </p>
        </div>
        <Button size="sm" onClick={() => void discovery.refetch()} loading={discovery.isFetching}>
          Check again
        </Button>
      </div>

      {discovery.data && (
        <div className="space-y-2 text-sm">
          <div className="text-emerald-600 dark:text-emerald-400">
            ✓ Discovery online ({discovery.data.latencyMs} ms) · {discovery.data.services.length}{' '}
            services
          </div>
          <details>
            <summary className="muted cursor-pointer text-xs">Service directory</summary>
            <ul className="mt-2 space-y-1 font-mono text-xs">
              {Object.entries(groups).map(([host, list]) => (
                <li key={host}>
                  <span className="font-semibold">{host}</span>
                  <span className="muted"> — {list.map((s) => s.identifier).join(', ')}</span>
                </li>
              ))}
            </ul>
          </details>
        </div>
      )}
      <ErrorNote error={discovery.error} />

      <p className="rounded-md bg-amber-50 p-2 text-xs text-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
        {BACKENDS.logitech.limitation}
      </p>
    </section>
  );
}
