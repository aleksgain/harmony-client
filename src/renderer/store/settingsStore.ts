import { create } from 'zustand';
import type { Settings } from '../types/harmony';
import { DEFAULT_SETTINGS } from '../types/harmony';

interface SettingsState {
  settings: Settings;
  loaded: boolean;
  load: () => Promise<void>;
  update: (partial: Partial<Settings>) => Promise<void>;
  signOut: () => Promise<void>;
}

/** Mirror of electron-store; main process is the source of truth. */
export const useSettingsStore = create<SettingsState>((set) => ({
  settings: DEFAULT_SETTINGS,
  loaded: false,
  load: async () => {
    const settings = await window.harmony.settings.get();
    set({ settings, loaded: true });
  },
  update: async (partial) => {
    const settings = await window.harmony.settings.set(partial);
    set({ settings });
  },
  signOut: async () => {
    const settings = await window.harmony.settings.set({ auth: null });
    set({ settings });
  },
}));
