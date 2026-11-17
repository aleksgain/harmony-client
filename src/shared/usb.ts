/**
 * USB-attached Harmony hubs and hub-paired remotes.
 *
 * The table below is generated from MyHarmony's embedded
 * `DesktopServiceConfig.xml` (Web.Driver.dll resources). `operations` lists
 * the ROM templates MyHarmony shipped for that model — i.e. what the device
 * is known to support over the HID file-system RPC. Anything not in this list
 * is disabled in the UI.
 */

export type UsbOperation =
  | 'identifyremote'
  | 'connectivity'
  | 'firmwareupgrade'
  | 'userconfiguration'
  | 'learnir'
  | 'getavailablewifinetworks'
  | 'getwifinetworkstatus'
  | 'savewifinetwork'
  | 'testoperationnoreboot'
  | 'saveprovisionsettings'
  | 'getprovisionsettingsstatus'
  | 'syncremote'
  | 'getdeviceinfo'
  | 'saveprovisioninfo'
  | 'getprovisioninfo'
  | 'simplepostresponse'
  | 'factoryreset'
  | 'enabledebugmode'
  | 'toggledebugmode'
  | 'getrequest'
  | 'postresponse'
  | 'getonremotechanges'
  | 'saveconfigchanged'
  | 'fwupdatepatch'
  | 'hubfirmwareupgrade'
  | 'eraserffirmware'
  | (string & {});

export interface UsbModel {
  codename: string;
  vid: number;
  pid: number;
  /** MyHarmony "modelid"; equals the primary skin. */
  modelId: number;
  skins: number[];
  operations: UsbOperation[];
}

export type UsbDeviceKind = 'hub' | 'remote';

export const USB_MODELS: UsbModel[] = [
  { codename: "Pimento", vid: 0x046D, pid: 0xC129, modelId: 97, skins: [97], operations: ["identifyremote", "connectivity", "firmwareupgrade", "userconfiguration", "learnir", "getavailablewifinetworks", "getwifinetworkstatus", "savewifinetwork", "testoperationnoreboot", "saveprovisionsettings", "getprovisionsettingsstatus", "syncremote", "getdeviceinfo", "saveprovisioninfo", "getprovisioninfo", "simplepostresponse", "factoryreset", "enabledebugmode", "toggledebugmode"] },
  { codename: "Juniper", vid: 0x046D, pid: 0xC12B, modelId: 99, skins: [99], operations: ["identifyremote", "connectivity", "firmwareupgrade", "userconfiguration", "learnir", "getavailablewifinetworks", "getwifinetworkstatus", "savewifinetwork", "getdeviceinfo", "simplepostresponse", "testoperationnoreboot", "postresponse", "getrequest", "saveprovisioninfo", "getprovisioninfo", "syncremote", "getonremotechanges", "saveconfigchanged", "fwupdatepatch", "toggledebugmode", "factoryreset", "eraserffirmware"] },
  { codename: "JuniperRF", vid: 0x046D, pid: 0xC12B, modelId: 100, skins: [100], operations: ["identifyremote", "connectivity", "firmwareupgrade", "userconfiguration", "learnir", "testoperationnoreboot", "postresponse", "getrequest", "saveprovisioninfo", "getprovisioninfo", "syncremote", "getonremotechanges", "saveconfigchanged", "getwifinetworkstatus", "getavailablewifinetworks", "savewifinetwork", "hubfirmwareupgrade", "getdeviceinfo", "simplepostresponse", "factoryreset", "enabledebugmode", "fwupdatepatch", "toggledebugmode"] },
  { codename: "Bulliet", vid: 0x046D, pid: 0xC12B, modelId: 102, skins: [102], operations: ["identifyremote", "connectivity", "firmwareupgrade", "userconfiguration", "learnir", "getavailablewifinetworks", "getwifinetworkstatus", "savewifinetwork", "getdeviceinfo", "simplepostresponse", "testoperationnoreboot", "postresponse", "getrequest", "saveprovisioninfo", "getprovisioninfo", "syncremote", "getonremotechanges", "saveconfigchanged", "fwupdatepatch", "toggledebugmode", "factoryreset", "eraserffirmware"] },
  { codename: "NewCastle", vid: 0x046D, pid: 0xC12B, modelId: 105, skins: [105], operations: ["identifyremote", "connectivity", "firmwareupgrade", "userconfiguration", "learnir", "testoperationnoreboot", "postresponse", "getrequest", "saveprovisioninfo", "getprovisioninfo", "syncremote", "getonremotechanges", "saveconfigchanged", "getwifinetworkstatus", "getavailablewifinetworks", "savewifinetwork", "hubfirmwareupgrade", "getdeviceinfo", "simplepostresponse", "factoryreset", "enabledebugmode", "fwupdatepatch", "toggledebugmode"] },
  { codename: "Creemore", vid: 0x046D, pid: 0xC129, modelId: 106, skins: [106], operations: ["identifyremote", "connectivity", "firmwareupgrade", "userconfiguration", "learnir", "getavailablewifinetworks", "getwifinetworkstatus", "savewifinetwork", "testoperationnoreboot", "saveprovisionsettings", "getprovisionsettingsstatus", "syncremote", "getdeviceinfo", "saveprovisioninfo", "getprovisioninfo", "simplepostresponse", "factoryreset", "enabledebugmode", "toggledebugmode"] },
  { codename: "Brownie", vid: 0x046D, pid: 0xC129, modelId: 400, skins: [400], operations: ["identifyremote", "connectivity", "firmwareupgrade", "userconfiguration", "learnir", "getavailablewifinetworks", "getwifinetworkstatus", "savewifinetwork", "testoperationnoreboot", "saveprovisionsettings", "getprovisionsettingsstatus", "syncremote", "getdeviceinfo", "saveprovisioninfo", "getprovisioninfo", "simplepostresponse", "factoryreset", "enabledebugmode", "toggledebugmode"] },
  { codename: "NewCastleWhite", vid: 0x046D, pid: 0xC12B, modelId: 108, skins: [108], operations: ["identifyremote", "connectivity", "firmwareupgrade", "userconfiguration", "learnir", "testoperationnoreboot", "postresponse", "getrequest", "saveprovisioninfo", "getprovisioninfo", "syncremote", "getonremotechanges", "saveconfigchanged", "getwifinetworkstatus", "getavailablewifinetworks", "savewifinetwork", "hubfirmwareupgrade", "getdeviceinfo", "simplepostresponse", "factoryreset", "enabledebugmode", "fwupdatepatch", "toggledebugmode"] },
  { codename: "Hops", vid: 0x046D, pid: 0xC12B, modelId: 111, skins: [111], operations: ["identifyremote", "connectivity", "firmwareupgrade", "userconfiguration", "learnir", "testoperationnoreboot", "postresponse", "getrequest", "saveprovisioninfo", "getprovisioninfo", "syncremote", "getonremotechanges", "saveconfigchanged", "getwifinetworkstatus", "getavailablewifinetworks", "savewifinetwork", "hubfirmwareupgrade", "getdeviceinfo", "simplepostresponse", "factoryreset", "enabledebugmode", "fwupdatepatch", "toggledebugmode"] },
  { codename: "HopsLite", vid: 0x046D, pid: 0xC12B, modelId: 112, skins: [112], operations: ["identifyremote", "connectivity", "firmwareupgrade", "userconfiguration", "learnir", "testoperationnoreboot", "postresponse", "getrequest", "saveprovisioninfo", "getprovisioninfo", "syncremote", "getonremotechanges", "saveconfigchanged", "getwifinetworkstatus", "getavailablewifinetworks", "savewifinetwork", "hubfirmwareupgrade", "getdeviceinfo", "simplepostresponse", "factoryreset", "enabledebugmode", "fwupdatepatch", "toggledebugmode"] },
  { codename: "Pavarotti Hub", vid: 0x046D, pid: 0xC131, modelId: 113, skins: [113], operations: ["identifyremote", "connectivity", "firmwareupgrade", "userconfiguration", "learnir", "getavailablewifinetworks", "getwifinetworkstatus", "savewifinetwork", "testoperationnoreboot", "saveprovisionsettings", "getprovisionsettingsstatus", "syncremote", "getdeviceinfo", "saveprovisioninfo", "getprovisioninfo", "simplepostresponse", "factoryreset", "enabledebugmode", "toggledebugmode"] },
  { codename: "Crackerjack", vid: 0x046D, pid: 0xC132, modelId: 115, skins: [115], operations: ["identifyremote", "connectivity", "firmwareupgrade", "userconfiguration", "learnir", "getavailablewifinetworks", "getwifinetworkstatus", "savewifinetwork", "testoperationnoreboot", "saveprovisionsettings", "getprovisionsettingsstatus", "syncremote", "getdeviceinfo", "saveprovisioninfo", "getprovisioninfo", "simplepostresponse", "factoryreset", "enabledebugmode", "toggledebugmode"] },
  { codename: "Orville", vid: 0x046D, pid: 0xC12B, modelId: 116, skins: [116], operations: ["identifyremote", "connectivity", "firmwareupgrade", "userconfiguration", "learnir", "testoperationnoreboot", "postresponse", "getrequest", "saveprovisioninfo", "getprovisioninfo", "syncremote", "getonremotechanges", "saveconfigchanged", "getwifinetworkstatus", "getavailablewifinetworks", "savewifinetwork", "hubfirmwareupgrade", "getdeviceinfo", "simplepostresponse", "factoryreset", "enabledebugmode", "fwupdatepatch", "toggledebugmode"] },
];

/** Hubs (as opposed to hub-paired remotes). */
export const HUB_MODEL_IDS = new Set([97, 106, 113, 115, 400]);

export const USB_MODEL_NAMES: Record<number, string> = {
  97: 'Harmony Hub',
  99: 'Harmony Touch',
  100: 'Harmony Touch RF',
  102: 'Harmony Ultimate One',
  105: 'Harmony Ultimate / Elite remote',
  106: 'Harmony Home Hub / Elite hub',
  108: 'Harmony Ultimate (white)',
  111: 'Harmony Companion / Smart Control remote',
  112: 'Harmony Companion remote (lite)',
  113: 'Harmony Express',
  115: 'Harmony Hub',
  116: 'Harmony remote (Orville)',
  400: 'Harmony Hub (gen3)',
};

/** A USB HID interface that matches one of the known VID/PIDs. */
export interface UsbHubDevice {
  /** OS HID path; the stable handle used by all usb:* IPC calls. */
  path: string;
  vid: number;
  pid: number;
  product?: string;
  serialNumber?: string;
  /** Candidate models for this VID/PID (several skins share a PID). Narrowed by identify(). */
  candidates: { modelId: number; codename: string; kind: UsbDeviceKind }[];
}

/** Parsed `/sys/sysinfo`. */
export interface SysInfo {
  arch?: string;
  skin?: string;
  fw_ver?: string;
  hw_ver?: string;
  fw_type?: string;
  guid?: string;
  serial_number?: string;
  [key: string]: string | undefined;
}

/** Result of identifyremote, with model + capability resolution. */
export interface UsbIdentifyResult {
  path: string;
  sysinfo: SysInfo;
  model: UsbModel | null;
  kind: UsbDeviceKind | null;
  displayName: string;
  operations: UsbOperation[];
  /** Report sizes actually used for this device. */
  requestPacketLength: number;
  responsePacketLength: number;
}

/** Parsed `/cfg/properties`. */
export interface CfgProperties {
  host_name?: string;
  discovery_service_link?: string;
  account_email?: string;
  [key: string]: string | undefined;
}

/**
 * Inputs for `vnd.logitech.setup/vnd.logitech.account?provision`.
 * Field set mirrors MyHarmony's ProvisionController.SaveProvision().
 */
export interface ProvisionParams {
  /** Hub auth token (MyHarmony: Security.GetAuthenticatedUserAuthToken). */
  authToken: string;
  accountId: string;
  email: string;
  /** Hub display name (skin 97 only). */
  name?: string;
  language?: string;
  /** Discovery service base; normalised to `.../Discovery/Discovery.svc`. */
  discoveryServer: string;
  /** MyHarmony RemoteMode as a string. Semantics not fully known; "1" is the common value. */
  mode?: string;
  activeRemoteId?: string;
  susChannel?: string;
}

/** Hub's reply to an HLAPI write (`{errorCode, errorMessage, mime, result|data, status}`). */
export interface HlapiResponse {
  errorCode?: string | number;
  errorMessage?: string;
  mime?: string;
  status?: string | number;
  result?: unknown;
  data?: unknown;
  [key: string]: unknown;
}

export function modelsForVidPid(vid: number, pid: number): UsbModel[] {
  return USB_MODELS.filter((m) => m.vid === vid && m.pid === pid);
}

export function modelForSkin(skin: number): UsbModel | null {
  return USB_MODELS.find((m) => m.skins.includes(skin)) ?? null;
}

export function supports(ops: readonly string[], op: UsbOperation): boolean {
  return ops.includes(op);
}

/** Logitech's default; writing this leaves the hub on Logitech's (dead) cloud. */
export const LOGITECH_DISCOVERY_SERVER = 'https://svcs.myharmony.com';

/**
 * MyHarmony writes `<discoveryServiceAddress>/Discovery.svc`, where the address
 * is e.g. `https://svcs.myharmony.com/Discovery`. Accept a bare origin too.
 */
export function normalizeDiscoveryServer(input: string): string {
  const trimmed = input.trim().replace(/\/+$/, '');
  if (/\/Discovery\.svc$/i.test(trimmed)) return trimmed;
  if (/\/Discovery$/i.test(trimmed)) return `${trimmed}/Discovery.svc`;
  return `${trimmed}/Discovery/Discovery.svc`;
}
