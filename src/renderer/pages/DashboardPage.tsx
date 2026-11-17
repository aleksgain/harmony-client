import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { PlusCircleIcon, SignalIcon } from '@heroicons/react/24/outline';
import { useHubList, useDiscovery } from '../hooks/useHubs';
import { useHubsStore } from '../store/hubs';
import HubCard from '../components/hubs/HubCard';

export default function DashboardPage() {
  const { data: hubs = [], isLoading } = useHubList();
  const { start, stop } = useDiscovery();
  const discovering = useHubsStore((s) => s.discovering);

  // Start discovery on page mount
  useEffect(() => {
    start();
    return () => { stop(); };
  }, []);

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="text-sm text-muted mt-0.5">
            {discovering ? 'Scanning network for Harmony Hubs…' : 'Harmony Hub overview'}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={discovering ? stop : start}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm border transition-colors ${
              discovering
                ? 'border-blue-300 bg-blue-50 dark:bg-blue-950 text-accent'
                : 'border-default bg-surface hover:bg-subtle'
            }`}
          >
            <SignalIcon className={`w-4 h-4 ${discovering ? 'animate-pulse' : ''}`} />
            {discovering ? 'Scanning…' : 'Scan'}
          </button>
          <Link
            to="/setup"
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm bg-blue-600 text-white hover:bg-blue-700 transition-colors"
          >
            <PlusCircleIcon className="w-4 h-4" />
            Add Hub
          </Link>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2].map((i) => (
            <div key={i} className="h-40 rounded-xl bg-subtle animate-pulse" />
          ))}
        </div>
      ) : hubs.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {hubs.map((hub) => (
            <HubCard key={hub.id} hub={hub} />
          ))}
        </div>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="border-2 border-dashed border-default rounded-xl p-12 text-center">
      <SignalIcon className="w-10 h-10 mx-auto text-muted mb-3" />
      <h3 className="font-medium mb-1">No Harmony Hubs found</h3>
      <p className="text-sm text-muted mb-4">
        Make sure your Hub is powered on and connected to the same network.
      </p>
      <div className="flex gap-3 justify-center">
        <Link
          to="/setup"
          className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-700 transition-colors"
        >
          Add by IP address
        </Link>
        <Link
          to="/provision"
          className="px-4 py-2 rounded-lg border border-default bg-surface text-sm hover:bg-subtle transition-colors"
        >
          Provision new Hub
        </Link>
      </div>
    </div>
  );
}
