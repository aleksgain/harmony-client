import { useRef, useState } from 'react';

/**
 * Press-and-hold aware button. Short click → single press/release; holding
 * reports the hold duration so volume ramps work like on a real remote.
 */
export function RemoteButton({
  label,
  onSend,
  disabled,
}: {
  label: string;
  onSend: (holdMs: number) => Promise<void>;
  disabled?: boolean;
}): JSX.Element {
  const downAt = useRef<number | null>(null);
  const [state, setState] = useState<'idle' | 'sending' | 'ok' | 'err'>('idle');

  const release = (): void => {
    if (downAt.current === null) return;
    const held = Date.now() - downAt.current;
    downAt.current = null;
    setState('sending');
    onSend(held > 300 ? held : 0)
      .then(() => setState('ok'))
      .catch(() => setState('err'))
      .finally(() => window.setTimeout(() => setState('idle'), 600));
  };

  const ring =
    state === 'ok'
      ? 'ring-2 ring-emerald-500'
      : state === 'err'
        ? 'ring-2 ring-red-500'
        : state === 'sending'
          ? 'opacity-70'
          : '';

  return (
    <button
      disabled={disabled}
      onPointerDown={() => (downAt.current = Date.now())}
      onPointerUp={release}
      onPointerLeave={release}
      onKeyDown={(e) => {
        if ((e.key === 'Enter' || e.key === ' ') && downAt.current === null)
          downAt.current = Date.now();
      }}
      onKeyUp={(e) => (e.key === 'Enter' || e.key === ' ') && release()}
      className={`truncate rounded-md border border-slate-200 bg-white px-2 py-2 text-xs font-medium hover:bg-slate-100 active:translate-y-px disabled:opacity-40 dark:border-navy-600 dark:bg-navy-800 dark:hover:bg-navy-700 ${ring}`}
      title={label}
    >
      {label}
    </button>
  );
}
