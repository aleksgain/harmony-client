/// <reference types="vite/client" />
import type { HarmonyBridge } from '@shared/ipc';

declare global {
  interface Window {
    harmony: HarmonyBridge;
  }
}

export {};
