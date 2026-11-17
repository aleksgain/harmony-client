import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../../api/client';
import { useDebounced } from '../../hooks/useDebounced';
import { Spinner } from '../common/Button';
import { ErrorNote } from '../common/EmptyState';

export function ManufacturerSearch({ onPick }: { onPick: (mfr: string) => void }): JSX.Element {
  const [q, setQ] = useState('');
  const dq = useDebounced(q);
  // Server may or may not filter on ?q=; we filter client-side as well.
  const query = useQuery({ queryKey: ['manufacturers', dq], queryFn: () => api.manufacturers(dq) });
  const needle = dq.trim().toLowerCase();
  const list = (query.data ?? [])
    .filter((m) => !needle || m.name.toLowerCase().includes(needle))
    .slice(0, 200);

  return (
    <div className="space-y-2">
      <input
        className="input"
        placeholder="Search manufacturers (e.g. Samsung, Denon)…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        autoFocus
        onKeyDown={(e) => e.key === 'Enter' && list[0] && onPick(list[0].name)}
      />
      <ErrorNote error={query.error} />
      {query.isLoading ? (
        <Spinner />
      ) : (
        <ul className="max-h-80 overflow-y-auto rounded-md border border-slate-200 dark:border-navy-700">
          {list.map((m) => (
            <li key={m.name}>
              <button
                className="flex w-full justify-between px-3 py-1.5 text-left text-sm hover:bg-slate-100 dark:hover:bg-navy-700"
                onClick={() => onPick(m.name)}
              >
                {m.name}
                {m.modelCount !== undefined && (
                  <span className="muted text-xs">{m.modelCount} models</span>
                )}
              </button>
            </li>
          ))}
          {list.length === 0 && <li className="muted px-3 py-2 text-sm">No matches</li>}
        </ul>
      )}
    </div>
  );
}
