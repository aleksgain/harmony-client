import { useEffect } from 'react';
import { useConfigStore } from '../../store/configStore';
import type { useHubConfig } from '../../hooks/useHubConfig';
import { Button } from './Button';
import { ErrorNote } from './EmptyState';

/** Save / discard bar for the hub config draft. Cmd/Ctrl+S saves. */
export function ConfigToolbar({
  hubId,
  cfg,
}: {
  hubId: string;
  cfg: ReturnType<typeof useHubConfig>;
}): JSX.Element {
  const discard = useConfigStore((s) => s.discard);
  const { dirty, save } = cfg;

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (dirty && !save.isPending) save.mutate();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dirty, save]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between rounded-md bg-slate-100 px-3 py-2 text-sm dark:bg-navy-800">
        <span className="muted">
          {cfg.source === 'server'
            ? 'Config from harmony-server'
            : cfg.source === 'hub'
              ? 'Config read from hub'
              : '—'}
          {cfg.config?.configVersion !== undefined && ` · version ${cfg.config.configVersion}`}
          {dirty && (
            <strong className="ml-2 text-amber-600 dark:text-amber-400">Unsaved changes</strong>
          )}
          {save.isSuccess && !dirty && (
            <span className="ml-2 text-emerald-600">✓ Saved and sync requested</span>
          )}
        </span>
        <span className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={() => void cfg.reload()}>
            Reload
          </Button>
          <Button size="sm" variant="ghost" disabled={!dirty} onClick={() => discard(hubId)}>
            Discard
          </Button>
          <Button
            size="sm"
            variant="primary"
            disabled={!dirty}
            loading={save.isPending}
            onClick={() => save.mutate()}
          >
            Save &amp; sync
          </Button>
        </span>
      </div>
      <ErrorNote error={cfg.error} />
    </div>
  );
}
