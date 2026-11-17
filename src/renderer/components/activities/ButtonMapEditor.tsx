import type { ControlGroup, HarmonyAction, HarmonyDevice } from '../../types/harmony';

/**
 * Physical remote buttons, grouped the way the hub's activity controlGroup
 * expects. Each maps to one `{command, type, deviceId}` action.
 */
export const REMOTE_BUTTONS: { group: string; buttons: string[] }[] = [
  { group: 'Volume', buttons: ['VolumeUp', 'VolumeDown', 'Mute'] },
  { group: 'Channel', buttons: ['ChannelUp', 'ChannelDown', 'ChannelPrev'] },
  {
    group: 'NavigationBasic',
    buttons: ['DirectionUp', 'DirectionDown', 'DirectionLeft', 'DirectionRight', 'Select'],
  },
  { group: 'NavigationExtended', buttons: ['Menu', 'Back', 'Exit', 'Home', 'Guide', 'Info'] },
  { group: 'TransportBasic', buttons: ['Play', 'Pause', 'Stop', 'Rewind', 'FastForward'] },
  { group: 'TransportExtended', buttons: ['SkipBack', 'SkipForward', 'Record'] },
  { group: 'ColoredButtons', buttons: ['Red', 'Green', 'Yellow', 'Blue'] },
  {
    group: 'NumericBasic',
    buttons: [
      'Number0',
      'Number1',
      'Number2',
      'Number3',
      'Number4',
      'Number5',
      'Number6',
      'Number7',
      'Number8',
      'Number9',
    ],
  },
];

type Mapping = Record<string, { deviceId: string; command: string } | undefined>;

export function controlGroupToMapping(groups: ControlGroup[] | undefined): Mapping {
  const out: Mapping = {};
  for (const g of groups ?? []) {
    for (const f of g.function) {
      try {
        const a = JSON.parse(f.action) as HarmonyAction;
        out[f.name] = { deviceId: a.deviceId, command: a.command };
      } catch {
        /* ignore malformed */
      }
    }
  }
  return out;
}

export function mappingToControlGroup(mapping: Mapping): ControlGroup[] {
  return REMOTE_BUTTONS.map(({ group, buttons }) => ({
    name: group,
    function: buttons.flatMap((b) => {
      const m = mapping[b];
      if (!m) return [];
      return [
        {
          name: b,
          label: b,
          action: JSON.stringify({ command: m.command, type: 'IRCommand', deviceId: m.deviceId }),
        },
      ];
    }),
  })).filter((g) => g.function.length > 0);
}

/** Sensible default: route each button to the first device that has a command of the same name. */
export function autoMap(devices: HarmonyDevice[], preferVolumeFrom?: string): Mapping {
  const out: Mapping = {};
  for (const { buttons } of REMOTE_BUTTONS) {
    for (const b of buttons) {
      const ordered =
        preferVolumeFrom && ['VolumeUp', 'VolumeDown', 'Mute'].includes(b)
          ? [
              ...devices.filter((d) => d.id === preferVolumeFrom),
              ...devices.filter((d) => d.id !== preferVolumeFrom),
            ]
          : devices;
      for (const d of ordered) {
        const hit = d.controlGroup.flatMap((g) => g.function).find((f) => f.name === b);
        if (hit) {
          out[b] = { deviceId: d.id, command: b };
          break;
        }
      }
    }
  }
  return out;
}

export function ButtonMapEditor({
  devices,
  mapping,
  onChange,
}: {
  devices: HarmonyDevice[];
  mapping: Mapping;
  onChange: (m: Mapping) => void;
}): JSX.Element {
  const commandsFor = (deviceId: string): string[] =>
    devices
      .find((d) => d.id === deviceId)
      ?.controlGroup.flatMap((g) => g.function.map((f) => f.name)) ?? [];

  return (
    <div className="space-y-4">
      {REMOTE_BUTTONS.map(({ group, buttons }) => (
        <div key={group}>
          <div className="label">{group}</div>
          <div className="grid grid-cols-[10rem_1fr_1fr] gap-x-2 gap-y-1 text-sm">
            {buttons.map((b) => {
              const m = mapping[b];
              return (
                <div key={b} className="contents">
                  <div className="self-center font-mono text-xs">{b}</div>
                  <select
                    className="input py-1"
                    aria-label={`${b} device`}
                    value={m?.deviceId ?? ''}
                    onChange={(e) => {
                      const deviceId = e.target.value;
                      if (!deviceId) return onChange({ ...mapping, [b]: undefined });
                      const cmds = commandsFor(deviceId);
                      onChange({
                        ...mapping,
                        [b]: { deviceId, command: cmds.includes(b) ? b : (cmds[0] ?? b) },
                      });
                    }}
                  >
                    <option value="">— unassigned —</option>
                    {devices.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.label}
                      </option>
                    ))}
                  </select>
                  <select
                    className="input py-1"
                    aria-label={`${b} command`}
                    disabled={!m}
                    value={m?.command ?? ''}
                    onChange={(e) =>
                      m && onChange({ ...mapping, [b]: { ...m, command: e.target.value } })
                    }
                  >
                    {m &&
                      commandsFor(m.deviceId).map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                  </select>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
