import { join } from 'node:path';
import { app, BrowserWindow, Menu, nativeTheme, shell, type MenuItemConstructorOptions } from 'electron';
import { HubManager } from './hub-manager';
import { registerIpcHandlers, sendToRenderer } from './ipc-handlers';
import { getSettings } from './store';
import { Updater } from './updater';

const DARK_BG = '#1a1a2e';
const LIGHT_BG = '#f5f6fa';

let mainWindow: BrowserWindow | null = null;
const getWindow = (): BrowserWindow | null => mainWindow;

const hubs = new HubManager();
const updater = new Updater(getWindow);

function backgroundColor(): string {
  const theme = getSettings().theme;
  const dark = theme === 'dark' || (theme === 'system' && nativeTheme.shouldUseDarkColors);
  return dark ? DARK_BG : LIGHT_BG;
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    title: 'Harmony Revival',
    width: 1280,
    height: 820,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    backgroundColor: backgroundColor(),
    autoHideMenuBar: true,
    icon: join(__dirname, '../../build/icon.png'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.once('ready-to-show', () => mainWindow?.show());
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // External links open in the system browser, never in-app.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('http://localhost') && !url.startsWith('file://')) e.preventDefault();
  });

  // electron-vite injects ELECTRON_RENDERER_URL in dev for HMR.
  const devUrl = process.env.ELECTRON_RENDERER_URL;
  if (!app.isPackaged && devUrl) {
    void mainWindow.loadURL(devUrl);
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

function navigate(path: string): void {
  sendToRenderer(mainWindow, 'menu:navigate', { path });
}

/** No menu on Windows/Linux; minimal native menu on macOS (needed for Cmd+Q, copy/paste). */
function buildMenu(): void {
  if (process.platform !== 'darwin') {
    Menu.setApplicationMenu(null);
    return;
  }
  const template: MenuItemConstructorOptions[] = [
    {
      label: app.name,
      submenu: [
        { role: 'about' },
        { label: 'Check for Updates…', click: () => void updater.check() },
        { type: 'separator' },
        { label: 'Settings…', accelerator: 'Cmd+,', click: () => navigate('/settings') },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    { role: 'windowMenu' },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  void app.whenReady().then(() => {
    app.setAppUserModelId('org.harmonyrevival.client');
    buildMenu();
    registerIpcHandlers(getWindow, hubs, updater);
    createWindow();
    updater.init();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });

  app.on('before-quit', () => {
    hubs.shutdown();
    updater.dispose();
  });
}
