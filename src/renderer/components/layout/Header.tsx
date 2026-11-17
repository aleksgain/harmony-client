import { useHubConnection } from '../../hooks/useHubConnection';
import { useHubStore, useSelectedHub } from '../../store/hubStore';
import { HubStatusBadge } from './HubStatusBadge';

/** Top bar: page title + hub selector, shared across pages. */
export function Header({ title }: { title: string }): JSX.Element {
  const hubs = useHubStore((s) => s.hubs);
  const select = useHubStore((s) => s.select);
  const hub = useSelectedHub();
  const { status, error } = useHubConnection(hub?.id);

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-slate-200 px-6 dark:border-navy-700">
      <h1 className="text-lg font-semibold">{title}</h1>
      <div className="flex items-center gap-3">
        {Object.keys(hubs).length > 0 && (
          <select
            aria-label="Active hub"
            className="input w-56 py-1"
            value={hub?.id ?? ''}
            onChange={(e) => select(e.target.value || null)}
          >
            {Object.values(hubs).map((h) => (
              <option key={h.id} value={h.id}>
                {h.friendlyName} — {h.ip}
              </option>
            ))}
          </select>
        )}
        {hub && <HubStatusBadge state={status?.state} transport={status?.transport} title={error ?? undefined} />}
      </div>
    </header>
  );
}
