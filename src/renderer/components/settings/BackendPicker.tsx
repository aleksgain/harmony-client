import { BACKENDS } from '../../api/backends';
import { useSettingsStore } from '../../store/settingsStore';
import type { BackendKind } from '../../types/harmony';

const ORDER: BackendKind[] = ['logitech', 'harmony-server', 'none'];

/** Choose which cloud the app works with. */
export function BackendPicker({
  onPicked,
}: {
  onPicked?: (kind: BackendKind) => void;
}): JSX.Element {
  const { settings, update } = useSettingsStore();

  const pick = async (kind: BackendKind): Promise<void> => {
    await update({ backend: kind });
    onPicked?.(kind);
  };

  return (
    <section className="card space-y-3">
      <div>
        <h2 className="font-semibold">Backend</h2>
        <p className="muted text-sm">
          Where your account, saved hub configs and the device database live. You can switch any
          time; the hub on your network works with all of them.
        </p>
      </div>
      <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Backend">
        {ORDER.map((kind) => {
          const b = BACKENDS[kind];
          const active = settings.backend === kind;
          return (
            <button
              key={kind}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => void pick(kind)}
              className={`rounded-md border p-3 text-left transition-colors ${
                active
                  ? 'border-accent bg-accent/5'
                  : 'border-slate-300 hover:border-accent dark:border-navy-600'
              }`}
            >
              <div className="font-medium">{b.label}</div>
              <div className="muted mt-1 text-xs">{b.summary}</div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
