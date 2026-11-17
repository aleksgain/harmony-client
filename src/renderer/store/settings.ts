import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type { Settings } from '../../shared/harmony';
import { DEFAULT_SETTINGS } from '../../shared/harmony';

interface SettingsState extends Settings {
  _loaded: boolean;
  load(): Promise<void>;
  update(partial: Partial<Settings>): Promise<void>;
}

export const useSettingsStore = create<SettingsState>()(
  immer((set) => ({
    ...DEFAULT_SETTINGS,
    _loaded: false,

    async load() {
      const s = await window.harmony.settings.get();
      set((draft) => {
        Object.assign(draft, s);
        draft._loaded = true;
      });
    },

    async update(partial) {
      const updated = await window.harmony.settings.set(partial);
      set((draft) => {
        Object.assign(draft, updated);
      });
    },
  })),
);
