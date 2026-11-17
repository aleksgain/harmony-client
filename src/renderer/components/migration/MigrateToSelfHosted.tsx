import { useState } from 'react';
import { api } from '../../api/client';
import { hubWs } from '../../api/hub-ws';
import { useHubCloud } from '../../hooks/useHubCloud';
import { useHubStatus, useHubStore } from '../../store/hubStore';
import { useSettingsStore } from '../../store/settingsStore';
import type { Hub } from '../../types/harmony';
import { Button } from '../common/Button';
import { ErrorNote } from '../common/EmptyState';
import { Modal } from '../common/Modal';
import { AccountPanel } from '../settings/AccountPanel';
import { ServerConfig } from '../settings/ServerConfig';

type Step = 'server' | 'account' | 'hubs' | 'repoint' | 'switch';
const STEPS: { id: Step; label: string }[] = [
  { id: 'server', label: 'Server' },
  { id: 'account', label: 'Account' },
  { id: 'hubs', label: 'Copy hubs' },
  { id: 'repoint', label: 'Repoint hubs' },
  { id: 'switch', label: 'Switch' },
];

interface CopyResult {
  ok: boolean;
  message: string;
}

/**
 * Move from Logitech's cloud (or hub-only use) to a self-hosted harmony-server:
 * server → account → copy each hub's config → repoint the hub → switch backend.
 * Nothing on the hub is changed; repointing is explained, not performed.
 */
export function MigrateToSelfHosted({ onClose }: { onClose: () => void }): JSX.Element {
  const { settings, update } = useSettingsStore();
  const hubs = useHubStore((s) => Object.values(s.hubs));
  const [step, setStep] = useState<Step>('server');
  const [results, setResults] = useState<Record<string, CopyResult>>({});
  const [busyHub, setBusyHub] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);

  const idx = STEPS.findIndex((s) => s.id === step);
  const next = (): void => setStep(STEPS[Math.min(idx + 1, STEPS.length - 1)]?.id ?? step);
  const back = (): void => setStep(STEPS[Math.max(idx - 1, 0)]?.id ?? step);

  const canNext =
    step === 'server'
      ? !!settings.serverUrl
      : step === 'account'
        ? !!settings.auth
        : step === 'hubs'
          ? Object.values(results).some((r) => r.ok)
          : true;

  const copyHub = async (hub: Hub): Promise<void> => {
    setBusyHub(hub.id);
    setError(null);
    try {
      await hubWs.connect(hub.id);
      const config = await hubWs.getConfig(hub.id);
      const saved = await api.claimHub(
        hub.id,
        { friendlyName: hub.friendlyName, activeRemoteId: hub.activeRemoteId, ip: hub.ip },
        config,
      );
      await update({
        knownHubs: {
          ...settings.knownHubs,
          [hub.id]: {
            id: hub.id,
            friendlyName: hub.friendlyName,
            ip: hub.ip,
            activeRemoteId: hub.activeRemoteId,
            claimed: true,
          },
        },
      });
      setResults((r) => ({
        ...r,
        [hub.id]: {
          ok: true,
          message: `${config.device.length} devices, ${config.activity.filter((a) => a.id !== '-1').length} activities saved (version ${saved.configVersion})`,
        },
      }));
    } catch (err) {
      setResults((r) => ({ ...r, [hub.id]: { ok: false, message: (err as Error).message } }));
    } finally {
      setBusyHub(null);
    }
  };

  const finish = async (): Promise<void> => {
    try {
      await update({ backend: 'harmony-server' });
      onClose();
    } catch (err) {
      setError(err);
    }
  };

  return (
    <Modal
      title="Move to self-hosted"
      wide
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={idx === 0 ? onClose : back}>
            {idx === 0 ? 'Cancel' : 'Back'}
          </Button>
          {step !== 'switch' ? (
            <Button variant="primary" disabled={!canNext} onClick={next}>
              Next
            </Button>
          ) : (
            <Button variant="primary" onClick={() => void finish()}>
              Use harmony-server
            </Button>
          )}
        </>
      }
    >
      <ol className="mb-4 flex flex-wrap gap-4 text-xs">
        {STEPS.map((s, i) => (
          <li key={s.id} className={step === s.id ? 'font-semibold text-accent' : 'muted'}>
            {i + 1}. {s.label}
          </li>
        ))}
      </ol>

      {step === 'server' && (
        <div className="space-y-2">
          <p className="text-sm">
            Point the app at your harmony-server. Test the connection, then save.
          </p>
          <ServerConfig />
        </div>
      )}

      {step === 'account' && (
        <div className="space-y-2">
          <p className="text-sm">
            Sign in, or create an account if this is a new server. Your hubs are registered to it.
          </p>
          <AccountPanel />
        </div>
      )}

      {step === 'hubs' && (
        <div className="space-y-3 text-sm">
          <p>
            Each hub&apos;s current devices and activities are read from the hub on your network and
            saved on your server. The hub itself is not changed.
          </p>
          {hubs.length === 0 && (
            <p className="muted">No hubs found yet. Add one on the Hubs page first.</p>
          )}
          <ul className="space-y-2">
            {hubs.map((h) => {
              const r = results[h.id];
              return (
                <li key={h.id} className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium">{h.friendlyName}</div>
                    <div className="muted font-mono text-xs">{h.ip}</div>
                    {r && (
                      <div
                        className={`text-xs ${r.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}
                      >
                        {r.ok ? '✓ ' : '✗ '}
                        {r.message}
                      </div>
                    )}
                  </div>
                  <Button
                    size="sm"
                    onClick={() => void copyHub(h)}
                    loading={busyHub === h.id}
                    disabled={!!busyHub}
                  >
                    {r?.ok ? 'Copy again' : 'Copy to server'}
                  </Button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {step === 'repoint' && (
        <div className="space-y-3 text-sm">
          <p>
            A hub takes new config only from the cloud it is provisioned with. Until it points at
            your server, it keeps working locally (activities, commands), but edits saved on your
            server do not reach it.
          </p>
          <ul className="space-y-2">
            {hubs.map((h) => (
              <RepointStatus key={h.id} hub={h} />
            ))}
          </ul>
          <div className="space-y-1">
            <p className="font-medium">Ways to repoint a hub</p>
            <ul className="muted list-disc space-y-1 pl-5 text-xs">
              <li>
                <strong>USB provisioning</strong> (Hubs page): writes your server as the hub&apos;s
                discovery server. Set it under Settings → Hub discovery server first.
              </li>
              <li>
                <strong>DNS override</strong>: answer Logitech&apos;s hostnames with your server.
                Tested on hub firmware 4.15.600: the hub accepts this for update checks and time,
                but <em>rejects</em> a self-signed certificate for Discovery, so config sync does
                not move this way on stock firmware.
              </li>
              <li>
                <strong>Rooted hub</strong>: repoint <code>discoveryServer</code> directly. See
                harmony-server&apos;s <code>docs/hub-root-repoint.md</code>.
              </li>
            </ul>
          </div>
        </div>
      )}

      {step === 'switch' && (
        <div className="space-y-2 text-sm">
          <p>
            The app will use <strong>{settings.serverUrl}</strong> for your account, saved configs
            and the device database. Your hubs on the network work exactly as before.
          </p>
          <p className="muted text-xs">
            You can switch back to Logitech cloud or hub-only in Settings → Backend at any time.
          </p>
        </div>
      )}

      <div className="mt-3">
        <ErrorNote error={error} />
      </div>
    </Modal>
  );
}

function RepointStatus({ hub }: { hub: Hub }): JSX.Element {
  const connected = useHubStatus(hub.id)?.state === 'connected';
  const cloud = useHubCloud(hub.id, connected);
  const label =
    cloud.data?.cloud === 'this-server'
      ? { text: 'Points at your server', cls: 'text-emerald-600 dark:text-emerald-400' }
      : cloud.data?.cloud === 'logitech'
        ? { text: "Still on Logitech's cloud", cls: 'text-amber-700 dark:text-amber-400' }
        : cloud.data
          ? { text: 'Points at another server', cls: 'text-amber-700 dark:text-amber-400' }
          : { text: connected ? 'Checking…' : 'Not connected', cls: 'muted' };
  return (
    <li className="flex items-center justify-between gap-3">
      <span className="font-medium">{hub.friendlyName}</span>
      <span className={`text-xs ${label.cls}`}>
        {label.text}
        {cloud.data && <span className="muted font-mono"> · {cloud.data.discoveryServer}</span>}
      </span>
    </li>
  );
}
