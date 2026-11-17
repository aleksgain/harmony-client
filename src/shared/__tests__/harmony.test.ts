import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, migrateSettings, serverHubId } from '../harmony';

describe('migrateSettings', () => {
  it('maps settings from before backends existed to harmony-server', () => {
    const old = { ...DEFAULT_SETTINGS, backend: null, serverUrl: 'http://localhost:8080' };
    expect(migrateSettings(old).backend).toBe('harmony-server');
  });

  it('leaves a fresh install unchosen so onboarding runs', () => {
    expect(migrateSettings({ ...DEFAULT_SETTINGS }).backend).toBeNull();
  });

  it('never overrides an explicit choice', () => {
    const s = { ...DEFAULT_SETTINGS, backend: 'logitech' as const, serverUrl: 'http://x' };
    expect(migrateSettings(s).backend).toBe('logitech');
  });
});

describe('serverHubId', () => {
  it('prefers the activeRemoteId', () => {
    expect(serverHubId({ id: '6bd1b7c5-1e47', activeRemoteId: '19159295' })).toBe('19159295');
  });

  it('unwraps remote-<id> keys for hubs added by IP', () => {
    expect(serverHubId({ id: 'remote-19159295' })).toBe('19159295');
  });

  it('falls back to the uuid', () => {
    expect(serverHubId({ id: '6bd1b7c5-1e47', activeRemoteId: '' })).toBe('6bd1b7c5-1e47');
  });
});
