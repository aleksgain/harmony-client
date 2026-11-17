import { useSettingsStore } from '../../store/settingsStore';

const HOSTS = [
  'svcs.myharmony.com',
  'lb-svcs.myharmony.com',
  'content.dhg.myharmony.com',
  'sl.dhg.myharmony.com',
];

/**
 * Alternative to USB re-provisioning: answer the hub's Logitech hostnames
 * with your harmony-server's address on your LAN resolver.
 */
export function DnsRewriteHelp(): JSX.Element {
  const serverUrl = useSettingsStore((s) => s.settings.serverUrl);
  let host = '<server-ip>';
  try {
    if (serverUrl) host = new URL(serverUrl).hostname;
  } catch {
    /* keep placeholder */
  }

  return (
    <section className="card space-y-3 text-sm">
      <h2 className="font-semibold">DNS override (no re-provisioning)</h2>
      <p className="muted">
        A hub that is already provisioned keeps calling Logitech&apos;s hostnames. If your router or
        DNS server can rewrite those to your harmony-server, the hub will talk to it without any USB
        step. The server must present a certificate the hub accepts for those names — whether hub
        firmware pins Logitech&apos;s CA is not yet confirmed.
      </p>
      <div>
        <div className="label">Hostnames to rewrite → {host}</div>
        <ul className="list-inside list-disc font-mono text-xs">
          {HOSTS.map((h) => (
            <li key={h}>{h}</li>
          ))}
        </ul>
      </div>
      <details>
        <summary className="cursor-pointer font-medium">Pi-hole / AdGuard Home</summary>
        <pre className="mt-2 overflow-x-auto rounded bg-slate-100 p-2 text-xs dark:bg-navy-950">
          {HOSTS.map((h) => `${host} ${h}`).join('\n')}
        </pre>
        <p className="muted mt-1 text-xs">
          Pi-hole: Local DNS → DNS Records. AdGuard: Filters → DNS rewrites.
        </p>
      </details>
      <details>
        <summary className="cursor-pointer font-medium">dnsmasq / OpenWrt</summary>
        <pre className="mt-2 overflow-x-auto rounded bg-slate-100 p-2 text-xs dark:bg-navy-950">
          {HOSTS.map((h) => `address=/${h}/${host}`).join('\n')}
        </pre>
      </details>
      <details>
        <summary className="cursor-pointer font-medium">UniFi</summary>
        <p className="muted mt-1 text-xs">
          Settings → Routing → DNS → Create entry (Host (A) record) for each hostname. Ensure the
          hub&apos;s network uses the gateway as its DNS server and that DNS over HTTPS is not
          bypassing it.
        </p>
      </details>
      <p className="muted text-xs">
        After changing DNS, power-cycle the hub so it re-resolves, then use “Sync” on the Hubs page.
      </p>
    </section>
  );
}
