import { useMemo, useState } from 'react';
import { newLocalId, useConfigStore } from '../../store/configStore';
import {
  getDeviceType,
  type Activity,
  type FixitEntry,
  type HarmonyDevice,
  type PowerStep,
} from '../../types/harmony';
import { Button } from '../common/Button';
import { Modal } from '../common/Modal';
import {
  autoMap,
  ButtonMapEditor,
  controlGroupToMapping,
  mappingToControlGroup,
} from './ButtonMapEditor';

type Tab = 'devices' | 'power' | 'buttons';

const DEFAULT_DELAY_MS = 1_000;

/** Input-ish commands on a device, e.g. InputHdmi1, InputAv. */
function inputsOf(d: HarmonyDevice): string[] {
  return d.controlGroup
    .flatMap((g) => g.function.map((f) => f.name))
    .filter((n) => /^input/i.test(n));
}

function defaultDelay(d: HarmonyDevice | undefined): number {
  return d?.timing?.powerOnDelay ?? DEFAULT_DELAY_MS;
}

export function ActivityEditor({
  hubId,
  activity,
  devices,
  onClose,
}: {
  hubId: string;
  activity: Activity | null;
  devices: HarmonyDevice[];
  onClose: () => void;
}): JSX.Element {
  const upsert = useConfigStore((s) => s.upsertActivity);
  const remove = useConfigStore((s) => s.removeActivity);
  const [tab, setTab] = useState<Tab>('devices');
  const [label, setLabel] = useState(activity?.label ?? 'Watch TV');
  const [selected, setSelected] = useState<string[]>(activity?.devices ?? []);
  const [sequence, setSequence] = useState<PowerStep[]>(
    activity?.powerSequence ??
      (activity?.devices ?? []).map((id) => ({
        deviceId: id,
        delayMs: defaultDelay(devices.find((d) => d.id === id)),
        input: activity?.fixit?.[id]?.Input,
      })),
  );
  const [mapping, setMapping] = useState(() => controlGroupToMapping(activity?.controlGroup));

  const byId = useMemo(() => new Map(devices.map((d) => [d.id, d])), [devices]);
  const members = selected.map((id) => byId.get(id)).filter((d): d is HarmonyDevice => !!d);

  const toggle = (id: string): void => {
    if (selected.includes(id)) {
      setSelected(selected.filter((x) => x !== id));
      setSequence(sequence.filter((s) => s.deviceId !== id));
    } else {
      setSelected([...selected, id]);
      setSequence([...sequence, { deviceId: id, delayMs: defaultDelay(byId.get(id)) }]);
    }
  };

  const move = (i: number, dir: -1 | 1): void => {
    const j = i + dir;
    if (j < 0 || j >= sequence.length) return;
    const next = [...sequence];
    [next[i], next[j]] = [next[j] as PowerStep, next[i] as PowerStep];
    setSequence(next);
  };

  const patchStep = (i: number, patch: Partial<PowerStep>): void =>
    setSequence(sequence.map((s, k) => (k === i ? { ...s, ...patch } : s)));

  const save = (): void => {
    const fixit: Record<string, FixitEntry> = {};
    for (const step of sequence) {
      fixit[step.deviceId] = {
        ...activity?.fixit?.[step.deviceId],
        id: step.deviceId,
        Power: 'On',
        ...(step.input ? { Input: step.input } : {}),
      };
    }
    upsert(hubId, {
      ...activity,
      id: activity?.id ?? newLocalId('act'),
      label: label.trim() || 'Activity',
      devices: sequence.map((s) => s.deviceId),
      powerSequence: sequence,
      fixit,
      controlGroup: mappingToControlGroup(mapping),
    });
    onClose();
  };

  const TABS: { id: Tab; label: string }[] = [
    { id: 'devices', label: `Devices (${selected.length})` },
    { id: 'power', label: 'Power & inputs' },
    { id: 'buttons', label: 'Buttons' },
  ];

  return (
    <Modal
      title={activity ? `Edit “${activity.label}”` : 'New activity'}
      wide
      onClose={onClose}
      footer={
        <>
          {activity && (
            <Button
              variant="danger"
              className="mr-auto"
              onClick={() => {
                if (window.confirm(`Delete activity “${activity.label}”?`)) {
                  remove(hubId, activity.id);
                  onClose();
                }
              }}
            >
              Delete
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save} disabled={selected.length === 0}>
            Apply
          </Button>
        </>
      }
    >
      <div className="mb-4">
        <label className="label" htmlFor="act-label">
          Name
        </label>
        <input
          id="act-label"
          className="input"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />
      </div>

      <div
        role="tablist"
        className="mb-4 flex gap-1 border-b border-slate-200 dark:border-navy-700"
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`-mb-px border-b-2 px-3 py-1.5 text-sm ${
              tab === t.id ? 'border-accent font-medium text-accent' : 'muted border-transparent'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'devices' && (
        <ul className="grid grid-cols-2 gap-2">
          {devices.map((d) => (
            <li key={d.id}>
              <label className="flex cursor-pointer items-center gap-2 rounded-md border border-slate-200 p-2 dark:border-navy-600">
                <input
                  type="checkbox"
                  checked={selected.includes(d.id)}
                  onChange={() => toggle(d.id)}
                />
                <span aria-hidden>{getDeviceType(d.type).icon}</span>
                <span className="truncate">{d.label}</span>
              </label>
            </li>
          ))}
        </ul>
      )}

      {tab === 'power' && (
        <div className="space-y-2">
          <p className="muted text-xs">
            Devices power on top to bottom; power-off runs in reverse. Delay is how long to wait
            after a device turns on before sending the next command (defaults come from the device
            database&apos;s timing data).
          </p>
          {sequence.map((step, i) => {
            const d = byId.get(step.deviceId);
            const inputs = d ? inputsOf(d) : [];
            return (
              <div
                key={step.deviceId}
                className="grid grid-cols-[2rem_1fr_9rem_12rem_auto] items-center gap-2"
              >
                <span className="muted text-right text-xs">{i + 1}.</span>
                <span className="truncate text-sm">{d?.label ?? step.deviceId}</span>
                <label className="flex items-center gap-1 text-xs">
                  <input
                    type="number"
                    min={0}
                    step={100}
                    className="input py-1"
                    value={step.delayMs}
                    onChange={(e) =>
                      patchStep(i, { delayMs: Math.max(0, Number(e.target.value) || 0) })
                    }
                  />
                  ms
                </label>
                <select
                  className="input py-1"
                  aria-label="Input"
                  value={step.input ?? ''}
                  onChange={(e) => patchStep(i, { input: e.target.value || undefined })}
                >
                  <option value="">No input change</option>
                  {inputs.map((x) => (
                    <option key={x} value={x}>
                      {x}
                    </option>
                  ))}
                </select>
                <span className="flex gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => move(i, -1)}
                    disabled={i === 0}
                    aria-label="Move up"
                  >
                    ↑
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => move(i, 1)}
                    disabled={i === sequence.length - 1}
                    aria-label="Move down"
                  >
                    ↓
                  </Button>
                </span>
              </div>
            );
          })}
          {sequence.length === 0 && <p className="muted text-sm">Select devices first.</p>}
        </div>
      )}

      {tab === 'buttons' && (
        <div className="space-y-3">
          <div className="flex justify-end">
            <Button
              size="sm"
              onClick={() => {
                const avr = members.find(
                  (m) => getDeviceType(m.type).id === 5 || getDeviceType(m.type).id === 10,
                );
                setMapping(autoMap(members, avr?.id));
              }}
            >
              Auto-assign
            </Button>
          </div>
          <ButtonMapEditor devices={members} mapping={mapping} onChange={setMapping} />
        </div>
      )}
    </Modal>
  );
}
