import { useState, useEffect } from 'react';
import type { UpdateInfoPayload } from '../../../shared/ipc';
import { ArrowPathIcon } from '@heroicons/react/24/outline';

export default function UpdateBanner() {
  const [update, setUpdate] = useState<UpdateInfoPayload | null>(null);
  const [downloaded, setDownloaded] = useState(false);

  useEffect(() => {
    const unsubAvail = window.harmony.updater.onUpdateAvailable(setUpdate);
    const unsubDown = window.harmony.updater.onUpdateDownloaded((info) => {
      setUpdate(info);
      setDownloaded(true);
    });
    return () => {
      unsubAvail();
      unsubDown();
    };
  }, []);

  if (!update) return null;

  return (
    <div className="flex items-center gap-3 px-4 py-2 bg-blue-600 text-white text-sm shrink-0">
      <ArrowPathIcon className="w-4 h-4 shrink-0" />
      <span className="flex-1">
        {downloaded
          ? `Harmony Revival ${update.version} is ready to install.`
          : `Harmony Revival ${update.version} is available.`}
      </span>
      {downloaded ? (
        <button
          onClick={() => window.harmony.updater.installUpdate()}
          className="px-3 py-0.5 bg-white text-blue-700 rounded text-xs font-medium hover:bg-blue-50"
        >
          Restart & Install
        </button>
      ) : null}
    </div>
  );
}
