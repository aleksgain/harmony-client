import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type { ProxyRequest, ProxyResponse } from '@shared/api';
import type {
  HarmonyBridge,
  IpcEventChannel,
  IpcEventMap,
  IpcInvokeChannel,
  IpcInvokeMap,
  Unsubscribe,
} from '@shared/ipc';

function invoke<C extends IpcInvokeChannel>(
  channel: C,
  ...args: IpcInvokeMap[C]['args']
): Promise<IpcInvokeMap[C]['result']> {
  return ipcRenderer.invoke(channel, ...args) as Promise<IpcInvokeMap[C]['result']>;
}

function on<C extends IpcEventChannel>(
  channel: C,
  cb: (payload: IpcEventMap[C]) => void,
  filter?: (payload: IpcEventMap[C]) => boolean,
): Unsubscribe {
  const listener = (_e: IpcRendererEvent, payload: IpcEventMap[C]): void => {
    if (!filter || filter(payload)) cb(payload);
  };
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

const bridge: HarmonyBridge = {
  hubs: {
    startDiscovery: () => invoke('hubs:startDiscovery'),
    stopDiscovery: () => invoke('hubs:stopDiscovery'),
    list: () => invoke('hubs:list'),
    addByIp: (ip) => invoke('hubs:addByIp', ip),
    onDiscovered: (cb) => on('hub:discovered', cb),
    onStatus: (cb) => on('hub:status', cb),
    connect: (hubId) => invoke('hubs:connect', hubId),
    disconnect: (hubId) => invoke('hubs:disconnect', hubId),
    status: (hubId) => invoke('hubs:status', hubId),
  },
  hub: {
    getConfig: (hubId) => invoke('hub:getConfig', hubId),
    getCurrentActivity: (hubId) => invoke('hub:getCurrentActivity', hubId),
    getStateDigest: (hubId) => invoke('hub:getStateDigest', hubId),
    startActivity: (hubId, activityId) => invoke('hub:startActivity', hubId, activityId),
    sendCommand: (hubId, deviceId, command, holdMs) =>
      invoke('hub:sendCommand', hubId, deviceId, command, holdMs),
    syncConfig: (hubId) => invoke('hub:syncConfig', hubId),
    onStateChange: (hubId, cb) => on('hub:stateChange', cb, (n) => n.hubId === hubId),
    onActivityChanged: (hubId, cb) => on('hub:activityChanged', cb, (n) => n.hubId === hubId),
  },
  usb: {
    listDevices: () => invoke('usb:listDevices'),
    identify: (devicePath) => invoke('usb:identify', devicePath),
    readProperties: (devicePath) => invoke('usb:readProperties', devicePath),
    getProvisionInfo: (devicePath) => invoke('usb:getProvisionInfo', devicePath),
    provision: (devicePath, params) => invoke('usb:provision', devicePath, params),
    factoryReset: (devicePath) => invoke('usb:factoryReset', devicePath),
    getFirmwareVersion: (devicePath) => invoke('usb:getFirmwareVersion', devicePath),
  },
  settings: {
    get: () => invoke('settings:get'),
    set: (partial) => invoke('settings:set', partial),
  },
  server: {
    request: <T>(req: ProxyRequest) => invoke('server:request', req) as Promise<ProxyResponse<T>>,
  },
  updater: {
    check: () => invoke('updater:check'),
    onUpdateAvailable: (cb) => on('updater:available', cb),
    onUpdateDownloaded: (cb) => on('updater:downloaded', cb),
    onProgress: (cb) => on('updater:progress', cb),
    installUpdate: () => invoke('updater:install'),
  },
  app: {
    getVersion: () => invoke('app:getVersion'),
    platform: process.platform,
    onNavigate: (cb) => on('menu:navigate', (p) => cb(p.path)),
  },
};

contextBridge.exposeInMainWorld('harmony', bridge);
