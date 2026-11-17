import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { SignalIcon, PlusCircleIcon } from '@heroicons/react/24/outline';
import { useHubsStore } from '../store/hubs';
import { useDiscovery } from '../hooks/useHubs';
import clsx from 'clsx';

type Step = 'scan' | 'manual' | 'done';

export default function SetupPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('scan');
  const [ip, setIp] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const hubs = useHubsStore((s) => Object.values(s.hubs));
  const { start, stop } = useDiscovery();
  const discovering = useHubsStore((s) => s.discovering);

  async function handleScan() {
    setError('');
    await start();
    // Auto-stop after 10s
    setTimeout(stop, 10_000);
  }

  async function handleAddByIp(e: React.FormEvent) {
    e.preventDefault();
    if (!ip.trim()) return;
    setError('');
    setLoading(true);
    try {
      const hub = await window.harmony.hubs.addByIp(ip.trim());
      useHubsStore.getState().setHub(hub);
      navigate(`/remote/${hub.id}`);
    } catch (err: any) {
      setError(err?.message ?? 'Could not connect to hub at that address');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-semibold mb-1">Add a Hub</h1>
      <p className="text-sm text-muted mb-6">
        Connect to an existing Harmony Hub on your local network.
      </p>

      <div className="flex gap-3 mb-6">
        <button
          onClick={() => setStep('scan')}
          className={clsx(
            'flex-1 py-3 rounded-xl border text-sm font-medium transition-colors',
            step === 'scan'
              ? 'border-blue-400 bg-blue-50 dark:bg-blue-950 text-accent'
              : 'border-default bg-surface hover:bg-subtle',
          )}
        >
          <SignalIcon className="w-5 h-5 mx-auto mb-1" />
          Auto-discover
        </button>
        <button
          onClick={() => setStep('manual')}
          className={clsx(
            'flex-1 py-3 rounded-xl border text-sm font-medium transition-colors',
            step === 'manual'
              ? 'border-blue-400 bg-blue-50 dark:bg-blue-950 text-accent'
              : 'border-default bg-surface hover:bg-subtle',
          )}
        >
          <PlusCircleIcon className="w-5 h-5 mx-auto mb-1" />
          Enter IP address
        </button>
      </div>

      {step === 'scan' && (
        <div className="bg-surface border border-default rounded-xl p-6">
          <p className="text-sm text-muted mb-4">
            Scan your local network via UDP broadcast (port 5224). Your Hub must be
            on the same subnet.
          </p>
          <button
            onClick={handleScan}
            disabled={discovering}
            className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-700 disabled:opacity-60 transition-colors"
          >
            {discovering ? 'Scanning…' : 'Start scan'}
          </button>

          {hubs.length > 0 && (
            <div className="mt-4 flex flex-col gap-2">
              <p className="text-xs text-muted font-semibold uppercase tracking-wider">
                Found
              </p>
              {hubs.map((hub) => (
                <button
                  key={hub.id}
                  onClick={() => navigate(`/remote/${hub.id}`)}
                  className="flex items-center justify-between px-4 py-3 rounded-lg bg-subtle hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-left"
                >
                  <div>
                    <div className="font-medium text-sm">{hub.friendlyName || 'Harmony Hub'}</div>
                    <div className="text-xs text-muted">{hub.ip}</div>
                  </div>
                  <span className="text-xs text-muted">Connect →</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {step === 'manual' && (
        <div className="bg-surface border border-default rounded-xl p-6">
          <p className="text-sm text-muted mb-4">
            Enter the IP address of your Harmony Hub. You can find it in your
            router's DHCP client list.
          </p>
          <form onSubmit={handleAddByIp} className="flex gap-2">
            <input
              type="text"
              value={ip}
              onChange={(e) => setIp(e.target.value)}
              placeholder="192.168.1.100"
              pattern="\d+\.\d+\.\d+\.\d+"
              required
              className="flex-1 px-3 py-2 rounded-lg border border-default bg-subtle text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-700 disabled:opacity-60 transition-colors"
            >
              {loading ? 'Connecting…' : 'Connect'}
            </button>
          </form>
          {error && (
            <p className="mt-2 text-sm text-red-500">{error}</p>
          )}
        </div>
      )}

      <div className="mt-6 p-4 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-xl text-sm">
        <strong className="text-amber-700 dark:text-amber-300">Setting up a new Hub?</strong>
        <p className="text-amber-600 dark:text-amber-400 mt-0.5">
          A brand-new hub needs to be provisioned via USB before it can be used.{' '}
          <button
            onClick={() => navigate('/provision')}
            className="underline"
          >
            Go to USB Provisioning →
          </button>
        </p>
      </div>
    </div>
  );
}
