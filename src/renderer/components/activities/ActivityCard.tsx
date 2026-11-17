import type { Activity, HarmonyDevice } from '../../types/harmony';
import { getDeviceType } from '../../types/harmony';
import { Button } from '../common/Button';

export function ActivityCard({
  activity,
  devices,
  running,
  canStart,
  onStart,
  onEdit,
}: {
  activity: Activity;
  devices: HarmonyDevice[];
  running: boolean;
  canStart: boolean;
  onStart: () => void;
  onEdit: () => void;
}): JSX.Element {
  const members = activity.devices
    .map((id) => devices.find((d) => d.id === id))
    .filter((d): d is HarmonyDevice => !!d);
  return (
    <div
      className={`card flex flex-col gap-3 ${running ? 'border-emerald-500 dark:border-emerald-500' : ''}`}
    >
      <div className="flex items-start justify-between">
        <div className="font-semibold">{activity.label}</div>
        {running && (
          <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
            ● Running
          </span>
        )}
      </div>
      <div className="flex flex-wrap gap-1">
        {members.map((d) => (
          <span key={d.id} className="rounded bg-slate-100 px-1.5 py-0.5 text-xs dark:bg-navy-700">
            {getDeviceType(d.type).icon} {d.label}
          </span>
        ))}
        {members.length === 0 && <span className="muted text-xs">No devices</span>}
      </div>
      <div className="mt-auto flex gap-2">
        <Button size="sm" variant="primary" disabled={!canStart || running} onClick={onStart}>
          Start
        </Button>
        <Button size="sm" onClick={onEdit}>
          Edit
        </Button>
      </div>
    </div>
  );
}
