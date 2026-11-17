import { useState } from 'react';
import { api } from '../../api/client';
import { useUsbDevices, useUsbIdentify, useUsbProvision } from '../../hooks/useUsbDevices';
import { useSettingsStore } from '../../store/settingsStore';
import {
  normalizeDiscoveryServer,
  supports,
  type CfgProperties,
  type HlapiResponse,
  type UsbHubDevice,
  type UsbIdentifyResult,
  type UsbOperation,
} from '../../types/harmony';
import { Button } from '../common/Button';
import { EmptyState, ErrorNote } from '../common/EmptyState';

const OP_LABELS: Partial<Record<UsbOperation, string>> = {
  saveprovisioninfo: 'Provision',
  getprovisioninfo: 'Read provisioning',
  factoryreset: 'Factory reset',
  syncremote: 'Sync',
  savewifinetwork: 'Wi-Fi setup',
  firmwareupgrade: 'Firmware upgrade',
};

/**
 * USB HID flow (hub plugged in via micro-USB): list → identify → provision.
 * Buttons are enabled only for operations MyHarmony shipped a template for.
 */
export function UsbProvisionPanel(): JSX.Element {
  const [open, setOpen] = useState(false);
  const devices = useUsbDevices(open);

  if (!open) {
    return (
      <section className="card flex items-center justify-between">
        <div>
          <h2 className="font-semibold">USB provisioning</h2>
          <p className="muted text-sm">
            Connect a hub by USB to read its identity or point it at your server. Needed for hubs
            that were never set up, or to move a hub off Logitech&apos;s cloud.
          </p>
        </div>
        <Button onClick={() => setOpen(true)}>Open</Button>
      </section>
    );
  }

  return (
    <section className="card space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">USB provisioning</h2>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Close
        </Button>
      </div>
      <ErrorNote error={devices.error} />
      {devices.data?.length === 0 && (
        <EmptyState title="No Harmony device on USB">
          Plug the hub into this computer with a data-capable micro-USB cable. On Linux you may need
          a udev rule granting access to <code>046d:c129</code> (see README).
        </EmptyState>
      )}
      {devices.data?.map((d) => (
        <UsbDeviceRow key={d.path} device={d} />
      ))}
    </section>
  );
}

function UsbDeviceRow({ device }: { device: UsbHubDevice }): JSX.Element {
  const identify = useUsbIdentify();
  const id = identify.data;
  const vidpid = `${device.vid.toString(16).padStart(4, '0')}:${device.pid.toString(16).padStart(4, '0')}`;

  return (
    <div className="rounded-md border border-slate-200 p-3 dark:border-navy-700">
      <div className="flex items-center justify-between">
        <div>
          <div className="font-medium">{id?.displayName ?? device.product ?? 'Harmony device'}</div>
          <div className="muted font-mono text-xs">
            {vidpid} · {device.candidates.map((c) => c.codename).join(' / ')}
          </div>
        </div>
        <Button size="sm" onClick={() => identify.mutate(device.path)} loading={identify.isPending}>
          {id ? 'Re-identify' : 'Identify'}
        </Button>
      </div>
      <ErrorNote error={identify.error} />
      {id && <IdentifiedDevice id={id} />}
    </div>
  );
}

function IdentifiedDevice({ id }: { id: UsbIdentifyResult }): JSX.Element {
  const settings = useSettingsStore((s) => s.settings);
  const provision = useUsbProvision();
  const [props, setProps] = useState<CfgProperties | null>(null);
  const [provInfo, setProvInfo] = useState<HlapiResponse | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [name, setName] = useState('Harmony Hub');
  const [confirmReset, setConfirmReset] = useState('');
  const can = (op: UsbOperation): boolean => supports(id.operations, op);
  const target = normalizeDiscoveryServer(settings.hubDiscoveryServer);

  const run = async (label: string, fn: () => Promise<void>): Promise<void> => {
    setBusy(label);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(null);
    }
  };

  const doProvision = (): Promise<void> =>
    run('provision', async () => {
      if (!settings.auth) throw new Error('Sign in under Settings → Account first.');
      const hubKey = id.sysinfo.guid ?? id.sysinfo.serial_number ?? id.path;
      const authToken = await api.getHubAuthToken(hubKey);
      await provision.mutateAsync({
        path: id.path,
        params: {
          authToken,
          accountId: settings.auth.accountId,
          email: settings.auth.email,
          name,
          discoveryServer: settings.hubDiscoveryServer,
        },
      });
    });

  return (
    <div className="mt-3 space-y-3 text-sm">
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5 font-mono text-xs">
        {Object.entries(id.sysinfo).map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="muted">{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
        <dt className="muted">report size</dt>
        <dd>
          {id.requestPacketLength}/{id.responsePacketLength} bytes
        </dd>
      </dl>

      <div className="flex flex-wrap gap-1">
        {id.operations.map((op) => (
          <span
            key={op}
            className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] dark:bg-navy-700"
          >
            {OP_LABELS[op] ?? op}
          </span>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          disabled={!can('getprovisioninfo')}
          loading={busy === 'provinfo'}
          onClick={() =>
            void run('provinfo', async () =>
              setProvInfo(await window.harmony.usb.getProvisionInfo(id.path)),
            )
          }
        >
          Read provisioning
        </Button>
        <Button
          size="sm"
          loading={busy === 'props'}
          title="Best effort: MyHarmony never read /cfg/properties on hubs"
          onClick={() =>
            void run('props', async () =>
              setProps(await window.harmony.usb.readProperties(id.path)),
            )
          }
        >
          Read /cfg/properties
        </Button>
      </div>
      {provInfo && (
        <pre className="overflow-x-auto rounded bg-slate-100 p-2 text-xs dark:bg-navy-950">
          {JSON.stringify(provInfo, null, 2)}
        </pre>
      )}
      {props && (
        <pre className="overflow-x-auto rounded bg-slate-100 p-2 text-xs dark:bg-navy-950">
          {JSON.stringify(props, null, 2)}
        </pre>
      )}

      <div className="rounded-md border border-slate-200 p-3 dark:border-navy-700">
        <div className="font-medium">Provision</div>
        <p className="muted text-xs">
          Writes <code>account?provision</code> to <code>/sys/hlapi</code>. The hub will use{' '}
          <code className="break-all">{target}</code> for all future cloud contact (change under
          Settings → Hub discovery server).
        </p>
        {id.sysinfo.skin === '97' && (
          <div className="mt-2">
            <label className="label" htmlFor="usb-hub-name">
              Hub name
            </label>
            <input
              id="usb-hub-name"
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
        )}
        <Button
          className="mt-2"
          variant="primary"
          size="sm"
          disabled={!can('saveprovisioninfo') || !settings.auth}
          loading={busy === 'provision'}
          onClick={() => void doProvision()}
        >
          Provision hub
        </Button>
        {provision.isSuccess && (
          <span className="ml-2 text-xs text-emerald-600">✓ Hub accepted provisioning</span>
        )}
      </div>

      {can('factoryreset') && (
        <div className="rounded-md border border-red-200 p-3 dark:border-red-900">
          <div className="font-medium text-red-700 dark:text-red-400">Factory reset</div>
          <p className="muted text-xs">
            Erases all devices, activities and Wi-Fi settings, then reboots. Type RESET to confirm.
          </p>
          <div className="mt-2 flex gap-2">
            <input
              className="input w-32"
              value={confirmReset}
              onChange={(e) => setConfirmReset(e.target.value)}
            />
            <Button
              size="sm"
              variant="danger"
              disabled={confirmReset !== 'RESET'}
              loading={busy === 'reset'}
              onClick={() =>
                void run('reset', async () => {
                  await window.harmony.usb.factoryReset(id.path);
                  setConfirmReset('');
                })
              }
            >
              Factory reset
            </Button>
          </div>
        </div>
      )}
      <ErrorNote error={error} />
    </div>
  );
}
