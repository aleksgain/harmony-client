import type { ProxyRequest, ProxyResponse } from './api';
import type { LogitechDiscovery } from './logitech';
import type {
  CfgProperties,
  HlapiResponse,
  ProvisionParams,
  UsbHubDevice,
  UsbIdentifyResult,
} from './usb';
import type {
  HarmonyConfig,
  Hub,
  HubNotification,
  HubStatus,
  Settings,
  StateDigest,
} from './harmony';

/**
 * Single source of truth for the IPC contract. Both `ipc-handlers.ts` (main)
 * and `preload.ts` are typed against these maps, so a channel can't drift.
 */
export interface IpcInvokeMap {
  'hubs:startDiscovery': { args: []; result: void };
  'hubs:stopDiscovery': { args: []; result: void };
  'hubs:list': { args: []; result: Hub[] };
  'hubs:addByIp': { args: [ip: string]; result: Hub };
  'hubs:connect': { args: [hubId: string]; result: void };
  'hubs:disconnect': { args: [hubId: string]; result: void };
  'hubs:status': { args: [hubId: string]; result: HubStatus };
  'hub:getConfig': { args: [hubId: string]; result: HarmonyConfig };
  'hub:getCurrentActivity': { args: [hubId: string]; result: string };
  'hub:getStateDigest': { args: [hubId: string]; result: StateDigest };
  'hub:startActivity': { args: [hubId: string, activityId: string]; result: void };
  'hub:sendCommand': {
    args: [hubId: string, deviceId: string, command: string, holdMs?: number];
    result: void;
  };
  'hub:syncConfig': { args: [hubId: string]; result: void };
  'settings:get': { args: []; result: Settings };
  'settings:set': { args: [partial: Partial<Settings>]; result: Settings };
  'server:request': { args: [req: ProxyRequest]; result: ProxyResponse };
  'logitech:discover': { args: []; result: LogitechDiscovery };
  'usb:listDevices': { args: []; result: UsbHubDevice[] };
  'usb:identify': { args: [devicePath: string]; result: UsbIdentifyResult };
  'usb:readProperties': { args: [devicePath: string]; result: CfgProperties };
  'usb:getProvisionInfo': { args: [devicePath: string]; result: HlapiResponse };
  'usb:provision': { args: [devicePath: string, params: ProvisionParams]; result: HlapiResponse };
  'usb:factoryReset': { args: [devicePath: string]; result: void };
  'usb:getFirmwareVersion': { args: [devicePath: string]; result: string };
  'updater:check': { args: []; result: void };
  'updater:install': { args: []; result: void };
  'app:getVersion': { args: []; result: string };
}

export type IpcInvokeChannel = keyof IpcInvokeMap;

export interface UpdateInfoPayload {
  version: string;
  releaseNotes?: string;
}

export interface UpdateProgressPayload {
  percent: number;
}

/** Events pushed from main → renderer. */
export interface IpcEventMap {
  'hub:discovered': Hub;
  'hub:status': HubStatus;
  'hub:stateChange': HubNotification<StateDigest>;
  'hub:activityChanged': HubNotification<{ activityId: string; errorCode?: string }>;
  'hub:notification': HubNotification;
  'updater:available': UpdateInfoPayload;
  'updater:progress': UpdateProgressPayload;
  'updater:downloaded': UpdateInfoPayload;
  'updater:error': { message: string };
  'menu:navigate': { path: string };
}

export type IpcEventChannel = keyof IpcEventMap;

export type Unsubscribe = () => void;

/** The API exposed on `window.harmony` by preload.ts. */
export interface HarmonyBridge {
  hubs: {
    startDiscovery(): Promise<void>;
    stopDiscovery(): Promise<void>;
    list(): Promise<Hub[]>;
    addByIp(ip: string): Promise<Hub>;
    onDiscovered(cb: (hub: Hub) => void): Unsubscribe;
    onStatus(cb: (status: HubStatus) => void): Unsubscribe;
    connect(hubId: string): Promise<void>;
    disconnect(hubId: string): Promise<void>;
    status(hubId: string): Promise<HubStatus>;
  };
  hub: {
    getConfig(hubId: string): Promise<HarmonyConfig>;
    getCurrentActivity(hubId: string): Promise<string>;
    getStateDigest(hubId: string): Promise<StateDigest>;
    startActivity(hubId: string, activityId: string): Promise<void>;
    sendCommand(hubId: string, deviceId: string, command: string, holdMs?: number): Promise<void>;
    syncConfig(hubId: string): Promise<void>;
    onStateChange(hubId: string, cb: (n: HubNotification<StateDigest>) => void): Unsubscribe;
    onActivityChanged(
      hubId: string,
      cb: (n: HubNotification<{ activityId: string; errorCode?: string }>) => void,
    ): Unsubscribe;
  };
  /** USB HID access to hubs (provisioning / identify). Main-process only I/O. */
  usb: {
    listDevices(): Promise<UsbHubDevice[]>;
    identify(devicePath: string): Promise<UsbIdentifyResult>;
    readProperties(devicePath: string): Promise<CfgProperties>;
    getProvisionInfo(devicePath: string): Promise<HlapiResponse>;
    provision(devicePath: string, params: ProvisionParams): Promise<HlapiResponse>;
    factoryReset(devicePath: string): Promise<void>;
    getFirmwareVersion(devicePath: string): Promise<string>;
  };
  settings: {
    get(): Promise<Settings>;
    set(partial: Partial<Settings>): Promise<Settings>;
  };
  server: {
    request<T = unknown>(req: ProxyRequest): Promise<ProxyResponse<T>>;
  };
  /** Logitech MyHarmony cloud (read-only; see src/shared/logitech.ts). */
  logitech: {
    discover(): Promise<LogitechDiscovery>;
  };
  updater: {
    check(): Promise<void>;
    onUpdateAvailable(cb: (info: UpdateInfoPayload) => void): Unsubscribe;
    onUpdateDownloaded(cb: (info: UpdateInfoPayload) => void): Unsubscribe;
    onProgress(cb: (p: UpdateProgressPayload) => void): Unsubscribe;
    installUpdate(): Promise<void>;
  };
  app: {
    getVersion(): Promise<string>;
    platform: string;
    onNavigate(cb: (path: string) => void): Unsubscribe;
  };
}
