import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useHubsStore } from '../store/hubs';
import { useHubConfig, useSendCommand, useStartActivity } from '../hooks/useHubs';
import type { ControlGroup, HarmonyDevice } from '../../shared/harmony';
import clsx from 'clsx';

export default function RemotePage() {
  const { hubId = '', deviceId: paramDeviceId } = useParams<{
    hubId: string;
    deviceId?: string;
  }>();
  const { data: config } = useHubConfig(hubId);
  const status = useHubsStore((s) => s.status[hubId]);
  const currentActivityId = useHubsStore((s) => s.currentActivity[hubId]);
  const { mutate: sendCommand, isLoading: sending } = useSendCommand();
  const { mutate: startActivity } = useStartActivity(hubId);

  const devices = config?.device ?? [];
  const activities = config?.activity ?? [];
  const [selectedDeviceId, setSelectedDeviceId] = useState(paramDeviceId ?? '');
  const selectedDevice = devices.find((d) => d.id === selectedDeviceId) ?? devices[0];
  const connected = status?.state === 'connected';

  if (!config) {
    return (
      <div className="flex items-center justify-center h-full text-muted text-sm">
        {connected ? 'Loading config…' : 'Hub not connected'}
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto flex gap-6 h-full">
      {/* Left panel: activity + device picker */}
      <div className="w-56 shrink-0 flex flex-col gap-4">
        {/* Activities */}
        <section>
          <h3 className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">
            Activities
          </h3>
          <div className="flex flex-col gap-1">
            {activities.filter((a) => a.id !== '-1').map((a) => (
              <button
                key={a.id}
                onClick={() => startActivity(a.id)}
                disabled={!connected}
                className={clsx(
                  'w-full text-left px-3 py-2 rounded-lg text-sm transition-colors',
                  currentActivityId === a.id
                    ? 'bg-blue-50 dark:bg-blue-950 text-accent font-medium'
                    : 'hover:bg-subtle text-current',
                  !connected && 'opacity-50 cursor-not-allowed',
                )}
              >
                {a.label}
              </button>
            ))}
            <button
              onClick={() => startActivity('-1')}
              disabled={!connected}
              className="w-full text-left px-3 py-2 rounded-lg text-sm text-muted hover:bg-subtle transition-colors disabled:opacity-50"
            >
              Power off
            </button>
          </div>
        </section>

        {/* Devices */}
        <section>
          <h3 className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">
            Devices
          </h3>
          <div className="flex flex-col gap-1">
            {devices.map((d) => (
              <button
                key={d.id}
                onClick={() => setSelectedDeviceId(d.id)}
                className={clsx(
                  'w-full text-left px-3 py-2 rounded-lg text-sm transition-colors',
                  selectedDevice?.id === d.id
                    ? 'bg-subtle font-medium'
                    : 'hover:bg-subtle text-muted hover:text-current',
                )}
              >
                {d.label}
              </button>
            ))}
          </div>
        </section>
      </div>

      {/* Right panel: button grid */}
      <div className="flex-1">
        {selectedDevice ? (
          <DeviceRemote
            hubId={hubId}
            device={selectedDevice}
            connected={connected}
            sending={sending}
            onSend={(cmd) =>
              sendCommand({ hubId, deviceId: selectedDevice.id, command: cmd })
            }
          />
        ) : (
          <div className="flex items-center justify-center h-full text-muted text-sm">
            Select a device
          </div>
        )}
      </div>
    </div>
  );
}

function DeviceRemote({
  device,
  connected,
  sending,
  onSend,
}: {
  hubId: string;
  device: HarmonyDevice;
  connected: boolean;
  sending: boolean;
  onSend: (cmd: string) => void;
}) {
  return (
    <div>
      <h2 className="text-lg font-semibold mb-4">
        {device.label}
        <span className="text-sm font-normal text-muted ml-2">
          {device.manufacturer} {device.model}
        </span>
      </h2>
      <div className="flex flex-col gap-4">
        {device.controlGroup.map((group) => (
          <ControlGroupSection
            key={group.name}
            group={group}
            connected={connected}
            sending={sending}
            onSend={onSend}
          />
        ))}
      </div>
    </div>
  );
}

function ControlGroupSection({
  group,
  connected,
  sending,
  onSend,
}: {
  group: ControlGroup;
  connected: boolean;
  sending: boolean;
  onSend: (cmd: string) => void;
}) {
  return (
    <section>
      <h4 className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">
        {group.name}
      </h4>
      <div className="flex flex-wrap gap-2">
        {group.function.map((fn) => {
          let command = fn.name;
          try {
            const parsed = JSON.parse(fn.action);
            command = parsed.command ?? fn.name;
          } catch {}
          return (
            <button
              key={fn.name}
              onClick={() => onSend(command)}
              disabled={!connected || sending}
              title={fn.name}
              className={clsx(
                'px-3 py-1.5 rounded-lg text-sm border border-default bg-surface',
                'hover:bg-subtle active:scale-95 transition-all',
                'disabled:opacity-40 disabled:cursor-not-allowed',
              )}
            >
              {fn.label || fn.name}
            </button>
          );
        })}
      </div>
    </section>
  );
}
