import { useEffect } from 'react';
import { useHubCloud } from '../../hooks/useHubCloud';
import { useConfigStore } from '../../store/configStore';
import { useHubStatus } from '../../store/hubStore';
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
  const connected = useHubStatus(hubId)?.state === 'connected';
  const hubCloud = useHubCloud(hubId, connected).data;

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (dirty && cfg.canSave && !save.isPending) save.mutate();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dirty, save, cfg.canSave]);

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
            disabled={!dirty || !cfg.canSave}
            title={cfg.saveBlockedReason ?? undefined}
            loading={save.isPending}
            onClick={() => save.mutate()}
          >
            Save &amp; sync
          </Button>
        </span>
      </div>
      {dirty && cfg.saveBlockedReason && (
        <p className="text-xs text-amber-700 dark:text-amber-400">{cfg.saveBlockedReason}</p>
      )}
      {cfg.canSave && hubCloud?.cloud === 'logitech' && (
        <p className="text-xs text-amber-700 dark:text-amber-400">
          This hub is still provisioned with Logitech&apos;s cloud ({hubCloud.discoveryServer}).
          Changes are saved on your harmony-server, but the hub keeps Logitech&apos;s config until
          it is repointed. See Settings → Move to self-hosted.
        </p>
      )}
      <ErrorNote error={cfg.error} />
    </div>
  );
}
