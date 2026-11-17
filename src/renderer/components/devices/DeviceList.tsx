import { useState } from 'react';
import { useConfigStore } from '../../store/configStore';
import type { HarmonyDevice } from '../../types/harmony';
import { Button } from '../common/Button';
import { EmptyState } from '../common/EmptyState';
import { Modal } from '../common/Modal';
import { LiveRemote } from '../remote/LiveRemote';
import { AddDeviceWizard } from './AddDeviceWizard';
import { DeviceCard } from './DeviceCard';

export function DeviceList({
  hubId,
  devices,
}: {
  hubId: string;
  devices: HarmonyDevice[];
}): JSX.Element {
  const [adding, setAdding] = useState(false);
  const [testing, setTesting] = useState<HarmonyDevice | null>(null);
  const removeDevice = useConfigStore((s) => s.removeDevice);

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button variant="primary" onClick={() => setAdding(true)}>
          Add device
        </Button>
      </div>
      {devices.length === 0 ? (
        <EmptyState title="No devices">
          Add the TV, receiver and players this hub should control.
        </EmptyState>
      ) : (
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          {devices.map((d) => (
            <DeviceCard
              key={d.id}
              device={d}
              onTest={() => setTesting(d)}
              onRemove={() => {
                if (
                  window.confirm(`Remove ${d.label}? It will also be removed from all activities.`)
                ) {
                  removeDevice(hubId, d.id);
                }
              }}
            />
          ))}
        </div>
      )}
      {adding && <AddDeviceWizard hubId={hubId} onClose={() => setAdding(false)} />}
      {testing && (
        <Modal title={`Remote — ${testing.label}`} wide onClose={() => setTesting(null)}>
          <LiveRemote hubId={hubId} device={testing} />
        </Modal>
      )}
    </div>
  );
}
