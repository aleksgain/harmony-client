import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSettingsStore } from '../store/settings';
import type { UsbHubDevice } from '../../shared/usb';
import type { ProvisionParams } from '../../shared/usb';
import clsx from 'clsx';

type Step = 'scan' | 'identify' | 'configure' | 'provisioning' | 'done' | 'error';

export default function ProvisionPage() {
  const navigate = useNavigate();
  const settings = useSettingsStore();
  const [step, setStep] = useState<Step>('scan');
  const [devices, setDevices] = useState<UsbHubDevice[]>([]);
  const [selected, setSelected] = useState<UsbHubDevice | null>(null);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState('');
  const [params, setParams] = useState<Partial<ProvisionParams>>({
    discoveryServer: settings.hubDiscoveryServer,
    accountId: settings.auth?.accountId ?? '',
    activeRemoteId: '',
    authToken: settings.auth?.token ?? '',
    email: settings.auth?.email ?? '',
    mode: '1',
  });

  async function scanDevices() {
    setScanning(true);
    setError('');
    try {
      const devs = await window.harmony.usb.listDevices();
      setDevices(devs);
      if (devs.length === 1) {
        setSelected(devs[0]);
        setStep('identify');
      } else if (devs.length > 1) {
        setStep('identify');
      }
    } catch (err: any) {
      setError(err?.message ?? 'Failed to scan USB devices');
    } finally {
      setScanning(false);
    }
  }

  async function identifySelected() {
    if (!selected) return;
    setError('');
    try {
      const info = await window.harmony.usb.getProvisionInfo(selected.path);
      // Pre-fill accountId / activeRemoteId if already provisioned
      const result = (info?.result ?? info?.data) as Record<string, unknown> | undefined;
      if (result?.activeRemoteId) {
        setParams((p) => ({
          ...p,
          activeRemoteId: String(result.activeRemoteId),
          accountId: (result.accountId as string) ?? p.accountId,
          email: (result.email as string) ?? p.email,
        }));
      }
      setStep('configure');
    } catch (err: any) {
      setError(err?.message ?? 'Could not read hub provisioning info');
    }
  }

  async function provision() {
    if (!selected || !params.accountId || !params.activeRemoteId || !params.authToken) return;
    setStep('provisioning');
    setError('');
    try {
      await window.harmony.usb.provision(selected.path, params as ProvisionParams);
      setStep('done');
    } catch (err: any) {
      setError(err?.message ?? 'Provisioning failed');
      setStep('error');
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-semibold mb-1">USB Provisioning</h1>
      <p className="text-sm text-muted mb-6">
        Redirect a Harmony Hub to your self-hosted server via USB.
        Connect the Hub to this computer with its USB cable first.
      </p>

      {/* Step indicators */}
      <div className="flex items-center gap-2 mb-8">
        {(['scan', 'identify', 'configure', 'provisioning', 'done'] as Step[]).map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <div
              className={clsx(
                'w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold',
                step === s
                  ? 'bg-blue-600 text-white'
                  : ['done', 'provisioning', 'configure', 'identify'].indexOf(s) <
                      ['done', 'provisioning', 'configure', 'identify'].indexOf(step)
                    ? 'bg-green-500 text-white'
                    : 'bg-subtle text-muted',
              )}
            >
              {i + 1}
            </div>
            <span className={clsx('text-xs capitalize', step === s ? 'text-current' : 'text-muted')}>
              {s}
            </span>
            {i < 4 && <div className="w-6 h-px bg-border-default" />}
          </div>
        ))}
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-600 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Step content */}
      {step === 'scan' && (
        <ScanStep devices={devices} scanning={scanning} onScan={scanDevices} onSelect={(d) => { setSelected(d); setStep('identify'); }} />
      )}
      {step === 'identify' && selected && (
        <IdentifyStep device={selected} onNext={identifySelected} onBack={() => setStep('scan')} />
      )}
      {step === 'configure' && (
        <ConfigureStep
          params={params}
          onChange={(p) => setParams((prev) => ({ ...prev, ...p }))}
          onNext={provision}
          onBack={() => setStep('identify')}
        />
      )}
      {step === 'provisioning' && (
        <div className="text-center py-12">
          <div className="w-10 h-10 rounded-full border-4 border-blue-200 border-t-blue-600 animate-spin mx-auto mb-4" />
          <p className="font-medium">Writing to hub…</p>
          <p className="text-sm text-muted mt-1">Do not disconnect the USB cable</p>
        </div>
      )}
      {step === 'done' && (
        <div className="text-center py-12">
          <div className="w-12 h-12 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center mx-auto mb-4">
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-6 h-6 text-green-500">
              <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" />
            </svg>
          </div>
          <h3 className="font-semibold text-lg">Hub provisioned</h3>
          <p className="text-sm text-muted mt-1 mb-6">
            Disconnect the USB cable. The hub will reboot and connect to{' '}
            <strong>{params.discoveryServer}</strong>.
          </p>
          <button
            onClick={() => navigate('/dashboard')}
            className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-700 transition-colors"
          >
            Go to Dashboard
          </button>
        </div>
      )}
      {step === 'error' && (
        <div className="text-center py-8">
          <p className="text-sm text-muted mb-4">Check the error above and try again.</p>
          <button
            onClick={() => setStep('configure')}
            className="px-4 py-2 rounded-lg border border-default bg-surface text-sm hover:bg-subtle transition-colors"
          >
            Back
          </button>
        </div>
      )}
    </div>
  );
}

function ScanStep({
  devices,
  scanning,
  onScan,
  onSelect,
}: {
  devices: UsbHubDevice[];
  scanning: boolean;
  onScan(): void;
  onSelect(d: UsbHubDevice): void;
}) {
  return (
    <div className="bg-surface border border-default rounded-xl p-6">
      <p className="text-sm text-muted mb-4">
        Connect the Hub via USB, then click Scan.
      </p>
      <button
        onClick={onScan}
        disabled={scanning}
        className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-700 disabled:opacity-60 transition-colors"
      >
        {scanning ? 'Scanning…' : 'Scan USB'}
      </button>
      {devices.length > 0 && (
        <div className="mt-4 flex flex-col gap-2">
          {devices.map((d) => (
            <button
              key={d.path}
              onClick={() => onSelect(d)}
              className="flex justify-between items-center px-4 py-3 rounded-lg bg-subtle hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              <div className="text-sm text-left">
                <div className="font-medium">{d.candidates[0]?.codename ?? `Hub (${d.vid}:${d.pid})`}</div>
                <div className="text-xs text-muted">skin {d.candidates[0]?.modelId} · {d.path}</div>
              </div>
              <span className="text-xs text-muted">Select →</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function IdentifyStep({
  device,
  onNext,
  onBack,
}: {
  device: UsbHubDevice;
  onNext(): void;
  onBack(): void;
}) {
  return (
    <div className="bg-surface border border-default rounded-xl p-6">
      <h3 className="font-medium mb-3">Selected Hub</h3>
      <div className="text-sm grid grid-cols-2 gap-x-4 gap-y-1 mb-6">
        <span className="text-muted">Model</span>
        <span>{device.candidates[0]?.codename ?? 'Unknown'}</span>
        <span className="text-muted">VID:PID</span>
        <span>{device.vid}:{device.pid}</span>
        <span className="text-muted">Skin</span>
        <span>{device.candidates[0]?.modelId}</span>
        <span className="text-muted">Path</span>
        <span className="font-mono text-xs truncate">{device.path}</span>
      </div>
      <div className="flex gap-2 justify-end">
        <button onClick={onBack} className="px-3 py-1.5 text-sm border border-default rounded-lg hover:bg-subtle">Back</button>
        <button onClick={onNext} className="px-4 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">Read hub info →</button>
      </div>
    </div>
  );
}

function ConfigureStep({
  params,
  onChange,
  onNext,
  onBack,
}: {
  params: Partial<ProvisionParams>;
  onChange(p: Partial<ProvisionParams>): void;
  onNext(): void;
  onBack(): void;
}) {
  const canSubmit = params.accountId && params.activeRemoteId && params.authToken && params.discoveryServer;
  return (
    <div className="bg-surface border border-default rounded-xl p-6">
      <h3 className="font-medium mb-4">Provisioning parameters</h3>
      <div className="flex flex-col gap-3 mb-6">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted uppercase tracking-wider">Discovery server</span>
          <input
            value={params.discoveryServer ?? ''}
            onChange={(e) => onChange({ discoveryServer: e.target.value })}
            className="px-3 py-2 rounded-lg border border-default bg-subtle text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            placeholder="https://svcs.myharmony.com"
          />
          <span className="text-xs text-muted">Hub will be redirected to this server</span>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted uppercase tracking-wider">Account ID</span>
          <input
            value={params.accountId ?? ''}
            onChange={(e) => onChange({ accountId: e.target.value })}
            className="px-3 py-2 rounded-lg border border-default bg-subtle text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted uppercase tracking-wider">Global Remote ID</span>
          <input
            value={params.activeRemoteId ?? ''}
            onChange={(e) => onChange({ activeRemoteId: e.target.value })}
            className="px-3 py-2 rounded-lg border border-default bg-subtle text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted uppercase tracking-wider">Auth token</span>
          <input
            type="password"
            value={params.authToken ?? ''}
            onChange={(e) => onChange({ authToken: e.target.value })}
            className="px-3 py-2 rounded-lg border border-default bg-subtle text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
        </label>
      </div>
      <div className="flex gap-2 justify-end">
        <button onClick={onBack} className="px-3 py-1.5 text-sm border border-default rounded-lg hover:bg-subtle">Back</button>
        <button
          onClick={onNext}
          disabled={!canSubmit}
          className="px-4 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          Provision hub
        </button>
      </div>
    </div>
  );
}
