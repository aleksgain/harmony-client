import { app, type BrowserWindow } from 'electron';
import electronUpdater, { type UpdateInfo } from 'electron-updater';
import { sendToRenderer } from './ipc-handlers';

// electron-updater is CJS; the default-import dance keeps both bundlers happy.
const { autoUpdater } = electronUpdater;

/** GitHub Releases feed for harmony-revival/harmony-client. */
export const UPDATE_FEED_URL =
  'https://github.com/harmony-revival/harmony-client/releases/latest/download/';

const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

function notes(info: UpdateInfo): string | undefined {
  if (typeof info.releaseNotes === 'string') return info.releaseNotes;
  if (Array.isArray(info.releaseNotes)) return info.releaseNotes.map((n) => n.note ?? '').join('\n');
  return undefined;
}

export class Updater {
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly getWindow: () => BrowserWindow | null) {}

  init(): void {
    // Dev builds have no app-update.yml; don't spam errors.
    if (!app.isPackaged) return;

    // The `publish` block in package.json (provider: github) is the primary
    // feed config; the generic URL is kept as an explicit fallback.
    autoUpdater.autoDownload = true;
    // Never restart on the user: install only when they click "Restart" or quit.
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.allowPrerelease = false;

    autoUpdater.on('update-available', (info) =>
      sendToRenderer(this.getWindow(), 'updater:available', { version: info.version, releaseNotes: notes(info) }),
    );
    autoUpdater.on('download-progress', (p) =>
      sendToRenderer(this.getWindow(), 'updater:progress', { percent: p.percent }),
    );
    autoUpdater.on('update-downloaded', (info) =>
      sendToRenderer(this.getWindow(), 'updater:downloaded', { version: info.version, releaseNotes: notes(info) }),
    );
    autoUpdater.on('error', (err) =>
      sendToRenderer(this.getWindow(), 'updater:error', { message: err.message }),
    );

    void this.check();
    this.timer = setInterval(() => void this.check(), CHECK_INTERVAL_MS);
  }

  async check(): Promise<void> {
    if (!app.isPackaged) return;
    try {
      await autoUpdater.checkForUpdates();
    } catch {
      // Primary (github provider) failed; try the generic feed once.
      try {
        autoUpdater.setFeedURL({ provider: 'generic', url: UPDATE_FEED_URL });
        await autoUpdater.checkForUpdates();
      } catch {
        /* offline or no releases yet — surfaced via 'error' event */
      }
    }
  }

  install(): void {
    // isSilent=false, isForceRunAfter=true: show installer UI on Windows, relaunch after.
    autoUpdater.quitAndInstall(false, true);
  }

  dispose(): void {
    if (this.timer) clearInterval(this.timer);
  }
}
