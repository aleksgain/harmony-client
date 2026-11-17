# Harmony Revival — desktop client

`harmony-client` is a cross-platform desktop app (Windows, macOS, Linux) for configuring Logitech Harmony Hubs. It replaces MyHarmony, which Logitech abandoned.

Logitech pulled MyHarmony for Windows, and the Mac build now just says "use the mobile app". The mobile app can't add devices or build activities, so without a desktop app a hub can't be reconfigured. This app fills that gap. It works with [`harmony-server`](https://github.com/aleksgain/harmony-server), a self-hosted replacement for Logitech's cloud.

> Screenshots: _coming soon_

## What it does

- **Finds hubs** on your LAN using the hub's "reverse bonjour" discovery. You can also add a hub by IP if it's on another VLAN.
- **Talks to hubs locally** over the WebSocket API on port 8088. The legacy XMPP API on port 5222 is a fallback.
- **Edits the hub config**: add devices (type, then manufacturer, then model, from the server's device database) and build activities (devices, power-on order and delays, inputs, button mapping).
- **Saves to harmony-server** and then tells the hub to `setup.sync`, so the hub pulls the new config right away.
- **Virtual remote** to test any device's IR commands. Press-and-hold is supported.
- **USB provisioning**: identify a USB-attached hub and point it at your own discovery server (claim). Factory reset is also available.
- **Auto-updates** from GitHub Releases. It never restarts without asking.

## Download

Prebuilt installers will be on the [Releases page](https://github.com/aleksgain/harmony-client/releases/latest) once CI publishes them:

| Platform | File                                                |
| -------- | --------------------------------------------------- |
| Windows  | `harmony-client-Setup-<version>.exe` (NSIS)         |
| macOS    | `harmony-client-<version>-<arch>.dmg`               |
| Linux    | `harmony-client-<version>-<arch>.AppImage` / `.deb` |

## Build from source

Requirements: Node.js 22+. USB support needs native build tools for `node-hid`:

- **Linux:** `libusb-1.0-0-dev`, `libudev-dev`, `build-essential`
- **macOS:** Xcode Command Line Tools
- **Windows:** Visual Studio Build Tools with C++

```sh
npm install        # also rebuilds node-hid against Electron
npm run dev        # Electron + Vite with hot-reloading renderer
```

Other scripts: `npm run typecheck`, `npm run lint`, `npm run format`. The `Makefile` wraps the same commands (`make dev`, `make build`, `make dist`).

## Build a distributable

```sh
npm run dist           # current platform
npm run dist:win       # / dist:mac / dist:linux
```

Output goes to `dist/`. macOS code-signing and notarisation are configured by CI through electron-builder environment variables.

## First-run setup

1. **Server URL.** On first launch the app asks for your harmony-server. Try `https://harmony.local` or `http://localhost:8765`, or click **Auto-detect**. Use **Test connection** to check it. If your server uses a self-signed certificate, tick "Accept a self-signed certificate". This exception applies to that server only.
2. **Sign in** under Settings → Account.
3. **Find your hub.** Go to Hubs → **Scan network**. If nothing shows up, the hub is probably on another subnet or VLAN (broadcasts don't cross). Enter its IP and click **Add**.
4. **Claim it.** Use **Set up a hub…** or **Claim…** on the hub card. This registers the hub on your server and uploads its current devices and activities.
5. **Add a device.** Go to Devices → **Add device**, pick the type, the manufacturer, and the model, then name it. Use **Save & sync** (Ctrl/⌘+S) to push the change.
6. **Build an activity.** Go to Activities → **New activity**. Pick devices, set the power order and inputs, and click **Auto-assign** for buttons. Then **Save & sync**.

### Getting the hub to use your server

A provisioned hub keeps contacting Logitech's hostnames. There are two ways to move it to your server:

- **USB provisioning** (Hubs → USB provisioning). Connect the hub over micro-USB, click **Identify**, then **Provision hub**. This writes `discoveryServer` into the hub. The value comes from Settings → _Hub discovery server_ (`https://svcs.myharmony.com` by default; use the preset for your own harmony-server).
- **DNS override.** Settings → _DNS override_ lists the hostnames to rewrite, with examples for Pi-hole, AdGuard, dnsmasq and UniFi.

**Linux USB permissions.** Add a udev rule, then replug the hub:

```
# /etc/udev/rules.d/70-harmony.rules
SUBSYSTEM=="hidraw", ATTRS{idVendor}=="046d", ATTRS{idProduct}=="c129|c12b|c131|c132", MODE="0660", TAG+="uaccess"
```

## Architecture

```
┌──────────── Renderer (React 18, sandboxed) ─────────────┐
│ pages/ components/  Zustand stores  TanStack Query      │
│        │ window.harmony (contextBridge, typed)          │
└────────┼────────────────────────────────────────────────┘
         │ IPC (channels typed in src/shared/ipc.ts)
┌────────┼──────────── Main process (Node) ───────────────┐
│ ipc-handlers ─┬─ HubManager ─ HubSession ─┬─ HubWebSocket  :8088
│               │      └─ HubDiscovery       └─ HubXmpp      :5222
│               │         (UDP 5224 → TCP 61991)
│               ├─ UsbHubService (node-hid, /sys/* file RPC)
│               ├─ server-proxy ── harmony-server REST
│               ├─ store (electron-store)  └─ updater
└─────────────────────────────────────────────────────────┘
```

- **All network and USB I/O runs in the main process.** The renderer has no Node access. REST calls go through the main process too, so CORS doesn't matter and a self-signed certificate can be accepted for that one server only.
- **Hub WebSocket.** The app first sends `POST /` with `Origin: http://sl.dhg.myharmony.com` (the hub requires this header) to get `activeRemoteId`. It then opens `ws://<ip>:8088/?domain=svcs.myharmony.com&hubId=<id>`. Requests use the `hbus` envelope and are matched to responses by UUID. Code `100` means "in progress". Notifications (`connect.stateDigest?notify`, `harmony.engine?startActivityFinished`) are forwarded to the renderer. The connection uses a ping/pong heartbeat and reconnects with exponential backoff.
- **XMPP fallback.** A minimal client using SASL PLAIN: it signs in as guest, pairs to get an identity, then signs in again with that identity. It also handles Harmony's colon-separated encoding, where `::` escapes a colon.
- **USB HID** (`src/main/hid-protocol.ts`, `usb-hid.ts`). This reimplements the file-system RPC from MyHarmony's ROM templates. Commands are `FF <cmd> <seq> <nparams> <typed params>`. Data packets are `[seq][len][data]`. The sequence counter runs 0–63 per operation. Provisioning writes the text request `vnd.logitech.setup/vnd.logitech.account?provision&provisionInfo=<urlencoded JSON>` to `/sys/hlapi` and reads the JSON reply back. Which operations a device supports comes from MyHarmony's `DesktopServiceConfig.xml`, and the UI disables the rest.
- **Config workflow.** The app loads the config both live from the hub and from the server. The newer `configVersion` seeds the draft. Edits change the draft only. Saving sends `PUT` to the server, then `setup.sync` to the hub.

## Keyboard shortcuts

| Shortcut             | Action                                                |
| -------------------- | ----------------------------------------------------- |
| Ctrl/⌘ + 1…5         | Dashboard / Hubs / Devices / Activities / Settings    |
| Ctrl/⌘ + ,           | Settings                                              |
| Ctrl/⌘ + S           | Save config and sync hub (Devices / Activities pages) |
| Esc                  | Close dialog                                          |
| Enter / Space (hold) | Press / hold a virtual-remote button                  |

## License

Apache-2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE).
