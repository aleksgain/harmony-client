/**
 * Logitech MyHarmony cloud: what is verified and what is not.
 *
 * Verified against the live service (2026-11-17): Discovery.svc answers the
 * SOAP `IDiscovery.GetJson2Uris(clientTypeId, clientId)` call without
 * authentication and returns the directory of json2 services (account, remote
 * manager, compile/sync, content, ...). The `json2` REST flavour of Discovery
 * itself does NOT work (HTTP 415).
 *
 * Not yet known: how a client signs in, and the request bodies of the services
 * the directory points to. Those need a capture of the official app (see the
 * hub-capture issue template). Until then the app only discovers and checks
 * reachability, and never writes to a Logitech account.
 */

export const LOGITECH_DISCOVERY_URL = 'https://svcs.myharmony.com/Discovery/Discovery.svc';

/** Client type the MyHarmony apps identify as. */
export const LOGITECH_CLIENT_TYPE = 'HarmonyTouch';

export interface LogitechService {
  /** e.g. `AccountManager/Context`, `CompileManager/StartCompile`. */
  identifier: string;
  address: string;
}

export interface LogitechDiscovery {
  discoveryUrl: string;
  services: LogitechService[];
  latencyMs: number;
  fetchedAt: string;
}

const xmlUnescape = (s: string): string =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');

export function buildGetJson2UrisEnvelope(
  clientTypeId = LOGITECH_CLIENT_TYPE,
  clientId = '',
): string {
  return (
    '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body>' +
    '<GetJson2Uris xmlns="http://tempuri.org/">' +
    `<clientTypeId>${clientTypeId}</clientTypeId><clientId>${clientId}</clientId>` +
    '</GetJson2Uris></s:Body></s:Envelope>'
  );
}

/**
 * Pull `{Identifier, Address}` pairs out of a Discovery SOAP response. The
 * data-contract prefix varies (`a:`, `b:` or none), so match on local names.
 */
export function parseDiscoveryServices(xml: string): LogitechService[] {
  if (/<(\w+:)?Fault[\s>]/.test(xml)) {
    const msg = /<faultstring[^>]*>([^<]*)</.exec(xml)?.[1];
    throw new Error(`Discovery fault: ${msg ? xmlUnescape(msg) : 'unknown'}`);
  }
  const out: LogitechService[] = [];
  const block = /<(?:\w+:)?ServiceDescription>([\s\S]*?)<\/(?:\w+:)?ServiceDescription>/g;
  const field = (body: string, name: string): string => {
    const m = new RegExp(`<(?:\\w+:)?${name}>([^<]*)</(?:\\w+:)?${name}>`).exec(body);
    return xmlUnescape(m?.[1] ?? '').trim();
  };
  for (const m of xml.matchAll(block)) {
    const body = m[1] ?? '';
    const address = field(body, 'Address');
    const identifier = field(body, 'Identifier');
    if (address && identifier) out.push({ identifier, address });
  }
  return out;
}

/** Groups services by host, for display. */
export function servicesByHost(services: LogitechService[]): Record<string, LogitechService[]> {
  const out: Record<string, LogitechService[]> = {};
  for (const s of services) {
    let host = s.address;
    try {
      host = new URL(s.address).host;
    } catch {
      /* keep raw */
    }
    (out[host] ??= []).push(s);
  }
  return out;
}
