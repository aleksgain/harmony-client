import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildGetJson2UrisEnvelope, parseDiscoveryServices, servicesByHost } from '../logitech';

// Real GetJson2Uris response from svcs.myharmony.com (2026-11-17).
const REAL = readFileSync(join(__dirname, 'fixtures/discovery-getjson2uris.xml'), 'utf8');

describe('parseDiscoveryServices', () => {
  it('parses every service from the live Discovery response', () => {
    const services = parseDiscoveryServices(REAL);
    expect(services).toHaveLength(25);
    expect(services[0]).toEqual({
      identifier: 'AccountManager/Context',
      address:
        'https://svcs.myharmony.com/HarmonyPlatform/AccountManager.svc/json2/Remote/{remoteId}/Context',
    });
    expect(services.map((s) => s.identifier)).toContain('CompileManager/StartCompile');
  });

  it('groups services by host', () => {
    const groups = servicesByHost(parseDiscoveryServices(REAL));
    expect(Object.keys(groups)).toContain('svcs.myharmony.com');
    expect(groups['svcs.myharmony.com']?.length).toBe(12);
  });

  it('does not run one entry into the next when a field is missing', () => {
    const xml =
      '<a:ServiceDescription><a:Address>https://x/1</a:Address></a:ServiceDescription>' +
      '<a:ServiceDescription><a:Address>https://x/2</a:Address><a:Identifier>Two</a:Identifier></a:ServiceDescription>';
    expect(parseDiscoveryServices(xml)).toEqual([{ identifier: 'Two', address: 'https://x/2' }]);
  });

  it('accepts unprefixed elements and unescapes entities', () => {
    const xml =
      '<ServiceDescription><Address>https://h/a?x=1&amp;y=2</Address><Identifier>A</Identifier></ServiceDescription>';
    expect(parseDiscoveryServices(xml)).toEqual([
      { identifier: 'A', address: 'https://h/a?x=1&y=2' },
    ]);
  });

  it('throws on a SOAP fault', () => {
    const fault =
      '<s:Envelope><s:Body><s:Fault><faultcode>s:Client</faultcode><faultstring>Bad &amp; wrong</faultstring></s:Fault></s:Body></s:Envelope>';
    expect(() => parseDiscoveryServices(fault)).toThrow('Discovery fault: Bad & wrong');
  });
});

describe('buildGetJson2UrisEnvelope', () => {
  it('builds the request the live service accepts', () => {
    const env = buildGetJson2UrisEnvelope();
    expect(env).toContain('<GetJson2Uris xmlns="http://tempuri.org/">');
    expect(env).toContain('<clientTypeId>HarmonyTouch</clientTypeId><clientId></clientId>');
  });
});
