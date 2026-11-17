import { DEVICE_TYPES, type DeviceTypeId } from '../../types/harmony';

export function DeviceTypePicker({
  value,
  onChange,
}: {
  value: DeviceTypeId | null;
  onChange: (t: DeviceTypeId) => void;
}): JSX.Element {
  return (
    <div className="grid grid-cols-3 gap-2 md:grid-cols-4">
      {DEVICE_TYPES.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={`flex flex-col items-center gap-1 rounded-lg border p-3 text-sm transition-colors ${
            value === t.id
              ? 'border-accent bg-accent/10'
              : 'border-slate-200 hover:border-accent/60 dark:border-navy-600'
          }`}
        >
          <span className="text-2xl" aria-hidden>
            {t.icon}
          </span>
          {t.label}
        </button>
      ))}
    </div>
  );
}
