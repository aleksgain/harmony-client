import {
  LOGITECH_DISCOVERY_URL,
  buildGetJson2UrisEnvelope,
  parseDiscoveryServices,
  type LogitechDiscovery,
} from '@shared/logitech';
import { httpRequest } from './http';

/**
 * Read-only access to Logitech's MyHarmony cloud. Runs in the main process,
 * like the harmony-server proxy, so the renderer never handles cross-origin
 * requests. See src/shared/logitech.ts for what is verified.
 */
export async function discoverLogitech(url = LOGITECH_DISCOVERY_URL): Promise<LogitechDiscovery> {
  const started = Date.now();
  const res = await httpRequest(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/xml; charset=utf-8',
      SOAPAction: '"http://tempuri.org/IDiscovery/GetJson2Uris"',
    },
    body: buildGetJson2UrisEnvelope(),
    timeoutMs: 15_000,
  });
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`Logitech Discovery answered HTTP ${res.status}`);
  }
  const services = parseDiscoveryServices(res.body);
  if (services.length === 0) throw new Error('Logitech Discovery returned no services');
  return {
    discoveryUrl: url,
    services,
    latencyMs: Date.now() - started,
    fetchedAt: new Date().toISOString(),
  };
}
