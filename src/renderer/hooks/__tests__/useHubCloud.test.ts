import { describe, expect, it } from 'vitest';
import { classifyDiscoveryServer } from '../useHubCloud';

describe('classifyDiscoveryServer', () => {
  const ds = 'https://svcs.myharmony.com/Discovery/Discovery.svc';

  it("recognises Logitech's cloud", () => {
    expect(classifyDiscoveryServer(ds, 'http://localhost:8080')).toBe('logitech');
  });

  it('recognises the configured server by hostname', () => {
    expect(
      classifyDiscoveryServer(
        'https://harmony.lan/Discovery/Discovery.svc',
        'http://harmony.lan:8080',
      ),
    ).toBe('this-server');
  });

  it('flags anything else', () => {
    expect(classifyDiscoveryServer('https://other.lan/x', 'http://harmony.lan')).toBe('other');
    expect(classifyDiscoveryServer('not a url', null)).toBe('other');
  });
});
