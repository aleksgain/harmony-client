import type { HubConnectionState } from '../../types/harmony';

const STYLES: Record<HubConnectionState | 'unknown', { dot: string; label: string }> = {
  connected: { dot: 'bg-emerald-500', label: 'Online' },
  syncing: { dot: 'bg-sky-500 animate-pulse', label: 'Syncing' },
  connecting: { dot: 'bg-amber-400 animate-pulse', label: 'Connecting' },
  error: { dot: 'bg-red-500', label: 'Error' },
  disconnected: { dot: 'bg-slate-400', label: 'Offline' },
  unknown: { dot: 'bg-slate-400', label: 'Offline' },
};

export function HubStatusBadge({
  state,
  transport,
  title,
}: {
  state: HubConnectionState | undefined;
  transport?: 'websocket' | 'xmpp' | null;
  title?: string;
}): JSX.Element {
  const s = STYLES[state ?? 'unknown'];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 px-2 py-0.5 text-xs dark:border-navy-600"
      title={title}
    >
      <span className={`h-2 w-2 rounded-full ${s.dot}`} />
      {s.label}
      {transport === 'xmpp' && <span className="muted">(XMPP)</span>}
    </span>
  );
}
