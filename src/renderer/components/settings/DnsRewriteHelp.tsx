import { useSettingsStore } from '../../store/settingsStore';

/**
 * Hostnames a hub resolves (observed on firmware 4.15.600). `ping` is a CNAME
 * of `cf-svcs`; override it explicitly, or a resolver that cached the CNAME
 * keeps sending it to Logitech.
 */
const HOSTS = [
  'svcs.myharmony.com',
  'lb-svcs.myharmony.com',
  'cf-svcs.myharmony.com',
  'ping.myharmony.com',
  'setup.myharmony.com',
  'sus.dhg.myharmony.com',
  'home.myharmony.com',
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
        step. The server must present a certificate the hub accepts for those names.
      </p>
      <p className="rounded-md bg-amber-50 p-2 text-xs text-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
        Tested on hub firmware 4.15.600: the hub accepts harmony-server&apos;s self-signed
        certificate for update checks and time, but <strong>rejects it for Discovery</strong> (TLS
        alert <code>unknown_ca</code>), so config sync stays with Logitech on stock firmware. A DNS
        override is still useful for those other services and for capturing traffic. If the hub is
        on an isolated IoT network, also allow it to reach the server on TCP 80/443.
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
