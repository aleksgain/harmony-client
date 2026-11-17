/**
 * Core Harmony data model, shared between the Electron main process and the
 * renderer. These mirror the JSON shapes returned by the hub's
 * `vnd.logitech.harmony.engine?config` command and by harmony-server.
 *
 * The hub returns a lot more fields than are modelled here; unknown fields are
 * preserved via the index signatures so that a round-trip (load → edit → PUT)
 * never drops data the hub or server cares about.
 */

/** Numeric device type. The hub itself reports a string (e.g. "Television");
 *  see `normalizeDeviceType()` in ./device-types.ts for the mapping. */
export type DeviceTypeId = number;

export interface Hub {
  /** Stable hub UUID from discovery (or `remote-<activeRemoteId>` if unknown). */
  id: string;
  friendlyName: string;
  ip: string;
  port: number;
  hubSwVersion: string;
  /** Numeric hub id from `setup.account?getProvisionInfo`; required in the WS URL. */
  activeRemoteId: string;
  connected: boolean;
}

export type HubConnectionState = 'disconnected' | 'connecting' | 'connected' | 'syncing' | 'error';

export interface HubStatus {
  hubId: string;
  state: HubConnectionState;
  transport: 'websocket' | 'xmpp' | null;
  error?: string;
}

export interface HarmonyFunction {
  name: string;
  label: string;
  /** JSON-encoded string: `{"command":"VolumeUp","type":"IRCommand","deviceId":"123"}` */
  action: string;
}

export interface ControlGroup {
  name: string;
  function: HarmonyFunction[];
}

/** Optional per-device timing metadata from the device database (milliseconds). */
export interface DeviceTiming {
  powerOnDelay?: number;
  inputDelay?: number;
  interKeyDelay?: number;
  powerOffDelay?: number;
}

export interface HarmonyDevice {
  id: string;
  label: string;
  type: DeviceTypeId;
  manufacturer: string;
  model: string;
  controlGroup: ControlGroup[];
  timing?: DeviceTiming;
  isManualPower?: string | boolean;
  [extra: string]: unknown;
}

/**
 * Per-device "fixit" entry: the state the device should be in while the
 * activity runs (power, input). The hub uses this to correct out-of-sync devices.
 */
export interface FixitEntry {
  id: string;
  Power?: 'On' | 'Off' | string;
  Input?: string;
  isRelativePower?: boolean;
  isManualPower?: boolean;
  [extra: string]: unknown;
}

/** One step in an activity's power-on sequence (Harmony Revival extension). */
export interface PowerStep {
  deviceId: string;
  /** Delay after powering this device on before moving to the next step (ms). */
  delayMs: number;
  /** Input to select on this device once it is on. */
  input?: string;
}

export interface Activity {
  id: string;
  label: string;
  /** Device IDs participating in this activity. */
  devices: string[];
  fixit?: Record<string, FixitEntry[]>;
  /** Remote button → device command mapping for this activity. */
  controlGroup?: ControlGroup[];
  /** Ordered power-on sequence; power-off runs in reverse. */
  powerSequence?: PowerStep[];
  activityOrder?: number;
  [extra: string]: unknown;
}

export interface HarmonyConfig {
  activity: Activity[];
  device: HarmonyDevice[];
  configVersion?: number;
}

/** Parsed `action` payload carried by HarmonyFunction.action. */
export interface HarmonyAction {
  command: string;
  type: 'IRCommand' | 'IRSequence' | string;
  deviceId: string;
}

/** Activity status codes from `connect.stateDigest?notify`. */
export enum ActivityStatus {
  Off = 0,
  Starting = 1,
  Started = 2,
  TurningOff = 3,
}

export interface StateDigest {
  activityId: string;
  activityStatus: ActivityStatus;
  configVersion?: number;
  hubSwVersion?: string;
  syncStatus?: number;
  [extra: string]: unknown;
}

/** Hub-pushed notification forwarded from main to renderer. */
export interface HubNotification<T = unknown> {
  hubId: string;
  type: string;
  data: T;
}

export interface ProvisionInfo {
  activeRemoteId: number | string;
  accountId?: string;
  email?: string;
  discoveryServer?: string;
  [extra: string]: unknown;
}

export type Theme = 'system' | 'dark' | 'light';

export interface AuthState {
  token: string;
  accountId: string;
  email: string;
}

export interface KnownHub {
  id: string;
  friendlyName: string;
  ip: string;
  activeRemoteId: string;
  /** Hub has been claimed on the configured harmony-server. */
  claimed: boolean;
}

export interface Settings {
  serverUrl: string | null;
  auth: AuthState | null;
  theme: Theme;
  /** Accept self-signed TLS certificates from the configured server only. */
  allowInsecureTls: boolean;
  knownHubs: Record<string, KnownHub>;
  /** Preferred local transport; XMPP is a fallback for hubs with WS issues. */
  preferredTransport: 'websocket' | 'xmpp';
}

export const DEFAULT_SETTINGS: Settings = {
  serverUrl: null,
  auth: null,
  theme: 'system',
  allowInsecureTls: false,
  knownHubs: {},
  preferredTransport: 'websocket',
};

/** Server candidates probed during onboarding, in order. */
export const DEFAULT_SERVERS = [
  'https://harmony.local',
  'http://localhost:8765',
  'http://192.168.1.x:8765', // placeholder shown as "local network"
] as const;
