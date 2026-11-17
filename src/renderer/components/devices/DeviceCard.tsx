import { getDeviceType, type HarmonyDevice } from '../../types/harmony';
import { Button } from '../common/Button';

export function DeviceCard({
  device,
  onRemove,
  onTest,
}: {
  device: HarmonyDevice;
  onRemove: () => void;
  onTest: () => void;
}): JSX.Element {
  const t = getDeviceType(device.type);
  const commands = device.controlGroup.reduce((n, g) => n + g.function.length, 0);
  return (
    <div className="card flex items-center gap-4">
      <span className="text-3xl" aria-hidden title={t.label}>
        {t.icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate font-semibold">{device.label}</div>
        <div className="muted truncate text-xs">
          {device.manufacturer} {device.model} · {t.label} · {commands} commands
        </div>
      </div>
      <Button size="sm" onClick={onTest}>
        Remote
      </Button>
      <Button size="sm" variant="ghost" onClick={onRemove} aria-label={`Remove ${device.label}`}>
        Remove
      </Button>
    </div>
  );
}
