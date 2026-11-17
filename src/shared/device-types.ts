import type { DeviceTypeId } from './harmony';

/**
 * Device type registry. The numeric ids follow the legacy MyHarmony ordering
 * (1=TV, 2=VCR, 3=CD, 4=DVD ...). The hub reports types as strings in its
 * config, so `normalizeDeviceType` maps both representations onto ids.
 */
export interface DeviceTypeInfo {
  id: DeviceTypeId;
  label: string;
  /** Strings the hub / device DB use for this type. */
  aliases: string[];
  icon: string;
}

export const DEVICE_TYPES: DeviceTypeInfo[] = [
  { id: 1, label: 'TV', aliases: ['television', 'tv'], icon: '📺' },
  { id: 2, label: 'VCR', aliases: ['vcr'], icon: '📼' },
  { id: 3, label: 'CD Player', aliases: ['cd', 'cdplayer', 'cd player'], icon: '💿' },
  { id: 4, label: 'DVD / Blu-ray', aliases: ['dvd', 'blu-ray', 'bluray', 'dvdplayer'], icon: '📀' },
  { id: 5, label: 'AV Receiver', aliases: ['avr', 'amplifier', 'stereoreceiver', 'receiver'], icon: '🔊' },
  { id: 6, label: 'Cable / Satellite', aliases: ['cable', 'satellite', 'settopbox', 'pvr', 'dvr'], icon: '📡' },
  { id: 7, label: 'Game Console', aliases: ['gameconsole', 'game console', 'console'], icon: '🎮' },
  { id: 8, label: 'Media Player', aliases: ['mediaplayer', 'media player', 'streaming', 'mediacenterpc'], icon: '▶️' },
  { id: 9, label: 'Projector', aliases: ['projector'], icon: '📽️' },
  { id: 10, label: 'Soundbar', aliases: ['soundbar', 'speakers'], icon: '🎚️' },
  { id: 11, label: 'Home Automation', aliases: ['homeautomation', 'light', 'lighting', 'thermostat'], icon: '💡' },
  { id: 99, label: 'Other', aliases: ['other', 'misc'], icon: '🔌' },
];

const OTHER = DEVICE_TYPES[DEVICE_TYPES.length - 1] as DeviceTypeInfo;

export function getDeviceType(id: DeviceTypeId): DeviceTypeInfo {
  return DEVICE_TYPES.find((t) => t.id === id) ?? OTHER;
}

export function normalizeDeviceType(raw: unknown): DeviceTypeId {
  if (typeof raw === 'number') return getDeviceType(raw).id;
  if (typeof raw === 'string') {
    const asNum = Number(raw);
    if (Number.isFinite(asNum) && raw.trim() !== '') return getDeviceType(asNum).id;
    const key = raw.toLowerCase().replace(/[\s_-]/g, '');
    const match = DEVICE_TYPES.find((t) => t.aliases.some((a) => a.replace(/[\s_-]/g, '') === key));
    if (match) return match.id;
  }
  return OTHER.id;
}
