import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../../api/client';
import { newLocalId, useConfigStore } from '../../store/configStore';
import {
  getDeviceType,
  normalizeDeviceType,
  type DeviceTypeId,
  type HarmonyDevice,
} from '../../types/harmony';
import { Button, Spinner } from '../common/Button';
import { ErrorNote } from '../common/EmptyState';
import { Modal } from '../common/Modal';
import { DeviceTypePicker } from './DeviceTypePicker';
import { ManufacturerSearch } from './ManufacturerSearch';
import { ModelSearch } from './ModelSearch';

/** 3-step picker: type → manufacturer → model, then confirm with a label. */
export function AddDeviceWizard({
  hubId,
  onClose,
}: {
  hubId: string;
  onClose: () => void;
}): JSX.Element {
  const [type, setType] = useState<DeviceTypeId | null>(null);
  const [mfr, setMfr] = useState<string | null>(null);
  const [model, setModel] = useState<string | null>(null);
  const [label, setLabel] = useState('');
  const addDevice = useConfigStore((s) => s.addDevice);

  const step = type === null ? 1 : mfr === null ? 2 : model === null ? 3 : 4;

  const detail = useQuery({
    queryKey: ['device', mfr, model],
    queryFn: () => api.device(mfr as string, model as string),
    enabled: !!mfr && !!model,
  });

  const confirm = (): void => {
    const d = detail.data;
    if (!d || !mfr || !model) return;
    const id = d.id ?? newLocalId('dev');
    // Command actions reference the device id; rewrite them for this instance.
    const controlGroup = (d.controlGroup ?? []).map((g) => ({
      ...g,
      function: g.function.map((f) => {
        try {
          const a = JSON.parse(f.action) as Record<string, unknown>;
          return { ...f, action: JSON.stringify({ ...a, deviceId: id }) };
        } catch {
          return f;
        }
      }),
    }));
    const device: HarmonyDevice = {
      ...d,
      id,
      label: label.trim() || `${mfr} ${getDeviceType(type ?? 99).label}`,
      type: d.type !== undefined ? normalizeDeviceType(d.type) : (type ?? 99),
      manufacturer: mfr,
      model,
      controlGroup,
    };
    addDevice(hubId, device);
    onClose();
  };

  const back = (): void => {
    if (step === 4) setModel(null);
    else if (step === 3) setMfr(null);
    else if (step === 2) setType(null);
  };

  const commandCount = detail.data?.controlGroup?.reduce((n, g) => n + g.function.length, 0) ?? 0;

  return (
    <Modal
      title="Add a device"
      wide
      onClose={onClose}
      footer={
        <>
          {step > 1 && (
            <Button variant="ghost" onClick={back}>
              Back
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          {step === 4 && (
            <Button variant="primary" onClick={confirm} disabled={!detail.data}>
              Add device
            </Button>
          )}
        </>
      }
    >
      <div className="muted mb-4 flex gap-2 text-xs">
        <span className={step === 1 ? 'font-semibold text-accent' : ''}>1. Type</span>›
        <span className={step === 2 ? 'font-semibold text-accent' : ''}>
          2. Manufacturer{mfr ? `: ${mfr}` : ''}
        </span>
        ›
        <span className={step >= 3 ? 'font-semibold text-accent' : ''}>
          3. Model{model ? `: ${model}` : ''}
        </span>
      </div>
      {step === 1 && <DeviceTypePicker value={type} onChange={setType} />}
      {step === 2 && <ManufacturerSearch onPick={setMfr} />}
      {step === 3 && mfr && <ModelSearch manufacturer={mfr} type={type} onPick={setModel} />}
      {step === 4 && (
        <div className="space-y-3">
          {detail.isLoading && <Spinner />}
          <ErrorNote error={detail.error} />
          {detail.data && (
            <>
              <div className="flex items-center gap-3">
                <span className="text-3xl" aria-hidden>
                  {getDeviceType(type ?? 99).icon}
                </span>
                <div>
                  <div className="font-semibold">
                    {mfr} {model}
                  </div>
                  <div className="muted text-xs">
                    {commandCount} commands in {detail.data.controlGroup?.length ?? 0} groups
                  </div>
                </div>
              </div>
              <div>
                <label className="label" htmlFor="dev-label">
                  Name in your setup
                </label>
                <input
                  id="dev-label"
                  className="input"
                  placeholder={`${mfr} ${getDeviceType(type ?? 99).label}`}
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                />
              </div>
            </>
          )}
        </div>
      )}
    </Modal>
  );
}
