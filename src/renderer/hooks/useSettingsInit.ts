import { useEffect } from 'react';
import { useSettingsStore } from '../store/settings';

/** Load settings from main process once on mount. */
export function useSettingsInit() {
  const { _loaded, load } = useSettingsStore();
  useEffect(() => {
    if (!_loaded) {
      load().catch(console.error);
    }
  }, [_loaded, load]);
}
