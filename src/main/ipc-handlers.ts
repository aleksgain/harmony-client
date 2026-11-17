import { app, ipcMain, type BrowserWindow, type IpcMainInvokeEvent } from 'electron';
import type { IpcEventChannel, IpcEventMap, IpcInvokeChannel, IpcInvokeMap } from '@shared/ipc';
import type { HubManager } from './hub-manager';
import { serverRequest } from './server-proxy';
import { getSettings, setSettings } from './store';
import type { Updater } from './updater';

type Handler<C extends IpcInvokeChannel> = (
  event: IpcMainInvokeEvent,
  ...args: IpcInvokeMap[C]['args']
) => Promise<IpcInvokeMap[C]['result']> | IpcInvokeMap[C]['result'];

/** Typed wrapper over ipcMain.handle — the channel name fixes args and result. */
function handle<C extends IpcInvokeChannel>(channel: C, fn: Handler<C>): void {
  ipcMain.removeHandler(channel);
  ipcMain.handle(channel, (event, ...args) => fn(event, ...(args as IpcInvokeMap[C]['args'])));
}

export function sendToRenderer<C extends IpcEventChannel>(
  win: BrowserWindow | null,
  channel: C,
  payload: IpcEventMap[C],
): void {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

export function registerIpcHandlers(
  getWindow: () => BrowserWindow | null,
  hubs: HubManager,
  updater: Updater,
): void {
  // --- hub manager → renderer events
  hubs.on('discovered', (hub) => sendToRenderer(getWindow(), 'hub:discovered', hub));
  hubs.on('status', (s) => sendToRenderer(getWindow(), 'hub:status', s));
  hubs.on('stateChange', (n) => sendToRenderer(getWindow(), 'hub:stateChange', n));
  hubs.on('activityChanged', (n) => sendToRenderer(getWindow(), 'hub:activityChanged', n));
  hubs.on('notification', (n) => sendToRenderer(getWindow(), 'hub:notification', n));

  // --- hubs
  handle('hubs:startDiscovery', () => hubs.startDiscovery());
  handle('hubs:stopDiscovery', () => hubs.stopDiscovery());
  handle('hubs:list', () => hubs.list());
  handle('hubs:addByIp', (_e, ip) => hubs.addByIp(ip.trim()));
  handle('hubs:connect', (_e, hubId) => hubs.connect(hubId));
  handle('hubs:disconnect', (_e, hubId) => hubs.disconnect(hubId));
  handle('hubs:status', (_e, hubId) => hubs.status(hubId));

  // --- per-hub commands
  handle('hub:getConfig', (_e, hubId) => hubs.session(hubId).getConfig());
  handle('hub:getCurrentActivity', (_e, hubId) => hubs.session(hubId).getCurrentActivity());
  handle('hub:getStateDigest', (_e, hubId) => hubs.session(hubId).getStateDigest());
  handle('hub:startActivity', (_e, hubId, activityId) =>
    hubs.session(hubId).startActivity(activityId),
  );
  handle('hub:sendCommand', (_e, hubId, deviceId, command, holdMs) =>
    hubs.session(hubId).sendCommand(deviceId, command, holdMs),
  );
  handle('hub:syncConfig', (_e, hubId) => hubs.session(hubId).syncConfig());

  // --- settings / server
  handle('settings:get', () => getSettings());
  handle('settings:set', (_e, partial) => setSettings(partial));
  handle('server:request', (_e, req) => serverRequest(req));

  // --- updater / app
  handle('updater:check', () => updater.check());
  handle('updater:install', () => updater.install());
  handle('app:getVersion', () => app.getVersion());
}
