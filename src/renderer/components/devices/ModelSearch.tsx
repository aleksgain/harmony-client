import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../../api/client';
import { useDebounced } from '../../hooks/useDebounced';
import { getDeviceType, normalizeDeviceType, type DeviceTypeId } from '../../types/harmony';
import { Spinner } from '../common/Button';
import { ErrorNote } from '../common/EmptyState';

export function ModelSearch({
  manufacturer,
  type,
  onPick,
}: {
  manufacturer: string;
  type: DeviceTypeId | null;
  onPick: (model: string) => void;
}): JSX.Element {
  const [q, setQ] = useState('');
  const [onlyType, setOnlyType] = useState(true);
  const dq = useDebounced(q);
  const query = useQuery({
    queryKey: ['models', manufacturer, dq],
    queryFn: () => api.models(manufacturer, dq),
  });
  const needle = dq.trim().toLowerCase();
  const list = (query.data ?? []).filter(
    (m) =>
      (!needle ||
        m.model.toLowerCase().includes(needle) ||
        m.description?.toLowerCase().includes(needle)) &&
      (!onlyType || type === null || m.type === undefined || normalizeDeviceType(m.type) === type),
  );

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          className="input"
          placeholder={`Model number (as printed on the ${manufacturer} device or its remote)…`}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          autoFocus
        />
        {type !== null && (
          <label className="flex shrink-0 items-center gap-1 text-xs">
            <input
              type="checkbox"
              checked={onlyType}
              onChange={(e) => setOnlyType(e.target.checked)}
            />
            Only {getDeviceType(type).label}
          </label>
        )}
      </div>
      <ErrorNote error={query.error} />
      {query.isLoading ? (
        <Spinner />
      ) : (
        <ul className="max-h-80 overflow-y-auto rounded-md border border-slate-200 dark:border-navy-700">
          {list.map((m) => (
            <li key={m.model}>
              <button
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-slate-100 dark:hover:bg-navy-700"
                onClick={() => onPick(m.model)}
              >
                <span aria-hidden>
                  {m.type !== undefined ? getDeviceType(normalizeDeviceType(m.type)).icon : ''}
                </span>
                <span className="font-mono">{m.model}</span>
                {m.description && <span className="muted truncate text-xs">{m.description}</span>}
              </button>
            </li>
          ))}
          {list.length === 0 && <li className="muted px-3 py-2 text-sm">No matching models</li>}
        </ul>
      )}
    </div>
  );
}
