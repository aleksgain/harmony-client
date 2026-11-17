import Store from 'electron-store';
import { DEFAULT_SETTINGS, migrateSettings, type KnownHub, type Settings } from '@shared/harmony';

/**
 * Persisted settings. electron-store v8 is used deliberately: v9+ is ESM-only,
 * and the electron-vite main bundle is CommonJS.
 */
const store = new Store<Settings>({
  name: 'settings',
  defaults: DEFAULT_SETTINGS,
  clearInvalidConfig: true,
});

export function getSettings(): Settings {
  return migrateSettings({ ...DEFAULT_SETTINGS, ...store.store });
}

export function setSettings(partial: Partial<Settings>): Settings {
  for (const [key, value] of Object.entries(partial) as [keyof Settings, unknown][]) {
    if (value === undefined) continue;
    store.set(key, value as Settings[typeof key]);
  }
  return getSettings();
}

export function rememberHub(hub: KnownHub): void {
  const known = { ...store.get('knownHubs') };
  known[hub.id] = { ...known[hub.id], ...hub };
  store.set('knownHubs', known);
}
