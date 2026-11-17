import { useShallow } from 'zustand/react/shallow';
import { useState } from 'react';
import { serverReady } from '../../api/backends';
import { api } from '../../api/client';
import { hubWs } from '../../api/hub-ws';
import { useHubDiscovery } from '../../hooks/useHubDiscovery';
import { useConfigStore } from '../../store/configStore';
import { useHubStore } from '../../store/hubStore';
import { useSettingsStore } from '../../store/settingsStore';
import type { Hub } from '../../types/harmony';
import { Button } from '../common/Button';
import { ErrorNote } from '../common/EmptyState';
import { Modal } from '../common/Modal';

type Step = 'discover' | 'claim' | 'name' | 'done';

/**
 * First-run flow: discover → claim (harmony-server only) → name.
 * Claiming uploads the hub's current config so nothing is lost. With the
 * Logitech or hub-only backend there is nothing to claim, so the step is skipped.
 */
export function HubSetupWizard({
  initialHub,
  onClose,
}: {
  initialHub?: Hub;
  onClose: () => void;
}): JSX.Element {
  const settingsNow = useSettingsStore((s) => s.settings);
  const claiming = serverReady(settingsNow);
  const afterDiscover: Step = claiming ? 'claim' : 'name';
  const [step, setStep] = useState<Step>(initialHub ? afterDiscover : 'discover');
  const [hub, setHub] = useState<Hub | null>(initialHub ?? null);
  const [name, setName] = useState(initialHub?.friendlyName ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const hubs = useHubStore(useShallow((s) => Object.values(s.hubs)));
  const { discovering, scan } = useHubDiscovery();
  const settings = useSettingsStore((s) => s.settings);
  const update = useSettingsStore((s) => s.update);

  const run = async (fn: () => Promise<void>): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  const claim = (): Promise<void> =>
    run(async () => {
      if (!hub) return;
      if (!settings.auth)
        throw new Error('Sign in under Settings → Account before claiming a hub.');
      await hubWs.connect(hub.id);
      const config = await hubWs.getConfig(hub.id);
      const saved = await api.claimHub(
        hub.id,
        { friendlyName: name || hub.friendlyName, activeRemoteId: hub.activeRemoteId, ip: hub.ip },
        config,
      );
      useConfigStore
        .getState()
        .markSaved(hub.id, { ...config, configVersion: saved.configVersion });
      setStep('name');
    });

  const finish = (): Promise<void> =>
    run(async () => {
      if (!hub) return;
      const friendlyName = name.trim() || hub.friendlyName;
      await update({
        knownHubs: {
          ...settings.knownHubs,
          [hub.id]: {
            id: hub.id,
            friendlyName,
            ip: hub.ip,
            activeRemoteId: hub.activeRemoteId,
            claimed: claiming || (settings.knownHubs[hub.id]?.claimed ?? false),
          },
        },
      });
      useHubStore.getState().upsertHub({ ...hub, friendlyName });
      useHubStore.getState().select(hub.id);
      setStep('done');
    });

  return (
    <Modal
      title="Set up a hub"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {step === 'done' ? 'Close' : 'Cancel'}
          </Button>
          {step === 'discover' && (
            <Button variant="primary" disabled={!hub} onClick={() => setStep(afterDiscover)}>
              Next
            </Button>
          )}
          {step === 'claim' && (
            <Button variant="primary" onClick={() => void claim()} loading={busy}>
              Claim hub
            </Button>
          )}
          {step === 'name' && (
            <Button variant="primary" onClick={() => void finish()} loading={busy}>
              Finish
            </Button>
          )}
        </>
      }
    >
      <ol className="mb-4 flex gap-4 text-xs">
        {(claiming
          ? (['discover', 'claim', 'name'] as const)
          : (['discover', 'name'] as const)
        ).map((s, i) => (
          <li key={s} className={step === s ? 'font-semibold text-accent' : 'muted'}>
            {i + 1}. {s[0]?.toUpperCase()}
            {s.slice(1)}
          </li>
        ))}
      </ol>

      {step === 'discover' && (
        <div className="space-y-3">
          <Button onClick={() => void scan()} loading={discovering}>
            {discovering ? 'Scanning…' : 'Scan network'}
          </Button>
          <ul className="space-y-1">
            {hubs.map((h) => (
              <li key={h.id}>
                <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-slate-100 dark:hover:bg-navy-700">
                  <input
                    type="radio"
                    name="hub"
                    checked={hub?.id === h.id}
                    onChange={() => {
                      setHub(h);
                      setName(h.friendlyName);
                    }}
                  />
                  <span className="font-medium">{h.friendlyName}</span>
                  <span className="muted font-mono text-xs">{h.ip}</span>
                </label>
              </li>
            ))}
          </ul>
          {hubs.length === 0 && !discovering && <p className="muted text-sm">No hubs found yet.</p>}
        </div>
      )}

      {step === 'claim' && hub && (
        <div className="space-y-2 text-sm">
          <p>
            Claiming registers <strong>{hub.friendlyName}</strong> ({hub.ip}) with your
            harmony-server account
            {settings.auth ? ` (${settings.auth.email})` : ''} and uploads its current devices and
            activities.
          </p>
          <p className="muted text-xs">
            The hub keeps working locally either way. For the hub itself to fetch config from your
            server (instead of Logitech), provision it over USB or set up a DNS override.
          </p>
        </div>
      )}

      {step === 'name' && (
        <div>
          <label className="label" htmlFor="hub-name">
            Hub name
          </label>
          <input
            id="hub-name"
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </div>
      )}

      {step === 'done' && <p className="text-sm">All set. Add devices from the Devices page.</p>}

      <div className="mt-3">
        <ErrorNote error={error} />
      </div>
    </Modal>
  );
}
