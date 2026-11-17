import { useEffect, useState } from 'react';
import { Button } from '../common/Button';

/** Subtle banner; never restarts on its own. */
export function UpdateBanner(): JSX.Element | null {
  const [available, setAvailable] = useState<string | null>(null);
  const [ready, setReady] = useState<string | null>(null);
  const [percent, setPercent] = useState<number | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const a = window.harmony.updater.onUpdateAvailable((i) => setAvailable(i.version));
    const p = window.harmony.updater.onProgress((x) => setPercent(Math.round(x.percent)));
    const d = window.harmony.updater.onUpdateDownloaded((i) => setReady(i.version));
    return () => {
      a();
      p();
      d();
    };
  }, []);

  if (dismissed || (!available && !ready)) return null;

  return (
    <div className="flex items-center justify-between gap-4 border-b border-accent/30 bg-accent/10 px-6 py-1.5 text-xs">
      <span>
        {ready
          ? `Version ${ready} is ready. It will install when you quit, or restart now.`
          : `Downloading version ${available}${percent !== null ? ` — ${percent}%` : '…'}`}
      </span>
      <span className="flex gap-2">
        {ready && (
          <Button
            size="sm"
            variant="primary"
            onClick={() => void window.harmony.updater.installUpdate()}
          >
            Restart &amp; update
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={() => setDismissed(true)}>
          Later
        </Button>
      </span>
    </div>
  );
}
