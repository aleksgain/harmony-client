/**
 * Harmony USB HID "file-system RPC" protocol (MyHarmony calls it "Molson").
 *
 * Reconstructed from MyHarmony's Web.Driver.dll: the ROM templates
 * (Resources/Templates/SKIN<n>.<operation>.xml) plus the Builder.Molson
 * serialisers. Everything here is pure (no I/O) so it can be unit-tested.
 *
 * Command packet (one HID output report, zero-padded to the report width):
 *   [0] service id       0xFF
 *   [1] command id       see CMD
 *   [2] sequence number  per-operation counter 0..63 (SequenceNumber.cs)
 *   [3] parameter count  copied *literally* from the template (see openWrite)
 *   [4..] parameters, each type-prefixed (MolsonParameterWriter.GetBytes):
 *        byte   -> 01 vv
 *        word   -> 02 hh ll           (big-endian)
 *        dword  -> 04 b3 b2 b1 b0     (big-endian)
 *        string -> 80 <utf8 bytes> 00
 *
 * Data packet (Write payload, and what Read streams back):
 *   [0] sequence number  [1] payload length  [2..] payload, zero-padded
 * A Read stream ends early with a packet whose first byte is 0xFE.
 *
 * Response to a command:
 *   [0] 0xFF  [1] command id echo  [2] status (0xFF = error)
 *   Open:  [5] file handle, [7..10] file size (big-endian)
 */

export const SERVICE_ID = 0xff;
export const END_MARKER = 0xfe;
export const ERROR_STATUS = 0xff;

export const CMD = {
  Ping: 0x00,
  Open: 0x01,
  Write: 0x03,
  Read: 0x04,
  Flush: 0x05,
  DevCtrl: 0x06,
  Close: 0x07,
  HBusCommand: 0x08,
  Reset: 0xff,
} as const;
export type CommandId = (typeof CMD)[keyof typeof CMD];

export type Param =
  | { type: 'byte'; value: number }
  | { type: 'word'; value: number }
  | { type: 'dword'; value: number }
  | { type: 'string'; value: string };

export const p = {
  byte: (value: number): Param => ({ type: 'byte', value }),
  word: (value: number): Param => ({ type: 'word', value }),
  dword: (value: number): Param => ({ type: 'dword', value }),
  string: (value: string): Param => ({ type: 'string', value }),
};

export function encodeParam(param: Param): number[] {
  switch (param.type) {
    case 'byte':
      return [0x01, param.value & 0xff];
    case 'word':
      return [0x02, (param.value >> 8) & 0xff, param.value & 0xff];
    case 'dword':
      return [
        0x04,
        (param.value >>> 24) & 0xff,
        (param.value >>> 16) & 0xff,
        (param.value >>> 8) & 0xff,
        param.value & 0xff,
      ];
    case 'string':
      return [0x80, ...Buffer.from(param.value, 'utf8'), 0x00];
  }
}

/** Per-operation sequence counter: first value 0, wraps after 63. */
export class SequenceCounter {
  private current = 0xff;
  next(): number {
    this.current = this.current >= 63 ? 0 : this.current + 1;
    return this.current;
  }
}

function pad(bytes: number[], width: number): Buffer {
  if (bytes.length > width) {
    throw new Error(`HID packet overflow: ${bytes.length} bytes > report width ${width}`);
  }
  const buf = Buffer.alloc(width);
  Buffer.from(bytes).copy(buf);
  return buf;
}

export function buildCommand(
  width: number,
  cmd: CommandId,
  params: Param[],
  seq: number,
  /** Override for templates whose declared count differs from the params sent. */
  declaredParamCount = params.length,
): Buffer {
  return pad([SERVICE_ID, cmd, seq, declaredParamCount, ...params.flatMap(encodeParam)], width);
}

export function buildDataPackets(width: number, data: Buffer, seq: SequenceCounter): Buffer[] {
  const chunk = width - 2;
  const packets: Buffer[] = [];
  for (let off = 0; off < data.length; off += chunk) {
    const slice = data.subarray(off, Math.min(off + chunk, data.length));
    packets.push(pad([seq.next(), slice.length, ...slice], width));
  }
  return packets;
}

export interface CommandResponse {
  cmd: number;
  status: number;
  raw: Buffer;
}

export function parseCommandResponse(buf: Buffer, expected: CommandId): CommandResponse {
  if (buf[0] !== SERVICE_ID) {
    throw new Error(`Unexpected HID response: service byte 0x${(buf[0] ?? 0).toString(16)}`);
  }
  const cmd = buf[1] ?? -1;
  const status = buf[2] ?? ERROR_STATUS;
  if (cmd !== expected) {
    throw new Error(`HID response for command 0x${cmd.toString(16)}, expected 0x${expected.toString(16)}`);
  }
  if (status === ERROR_STATUS) throw new Error(`Device returned error for command 0x${expected.toString(16)}`);
  return { cmd, status, raw: buf };
}

export function parseOpenResponse(buf: Buffer): { handle: number; size: number } {
  parseCommandResponse(buf, CMD.Open);
  return { handle: buf[5] ?? 0, size: buf.length >= 11 ? buf.readUInt32BE(7) : 0 };
}

/** Extracts payload from a Read data packet, or null for the 0xFE end marker. */
export function parseDataPacket(buf: Buffer): Buffer | null {
  if (buf[0] === END_MARKER) return null;
  const size = Math.min(buf[1] ?? 0, buf.length - 2);
  return buf.subarray(2, 2 + size);
}

/**
 * `/sys/sysinfo` and `/cfg/properties` are `key<delim>value` lines. The
 * templates declare `,` as the key/value delimiter; some firmware uses `=`.
 */
export function parseKeyValueLines(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\0+$/, '').trim();
    if (!line) continue;
    const m = /^([^,=:]+)[,=:](.*)$/.exec(line);
    if (m && m[1]) out[m[1].trim()] = (m[2] ?? '').trim();
  }
  return out;
}

/** .NET HttpUtility.UrlEncode semantics: `+` for space, lowercase hex. */
export function dotnetUrlEncode(s: string): string {
  return encodeURIComponent(s)
    .replace(/%20/g, '+')
    .replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16)}`)
    .replace(/%[0-9A-F]{2}/g, (m) => m.toLowerCase());
}

/**
 * Pulls the OUTPUT and INPUT report sizes out of a raw HID report descriptor
 * (Report Size × Report Count per main item, summed per report). Only needed
 * on Linux, where hidraw exposes the descriptor via sysfs; node-hid has no API
 * for it. Returns sizes in bytes excluding the report-id byte.
 */
export function reportLengthsFromDescriptor(desc: Buffer): { input: number; output: number } {
  let reportSize = 0;
  let reportCount = 0;
  let inputBits = 0;
  let outputBits = 0;
  let i = 0;
  while (i < desc.length) {
    const prefix = desc[i] ?? 0;
    if (prefix === 0xfe) {
      i += 3 + (desc[i + 1] ?? 0); // long item
      continue;
    }
    const sizeCode = prefix & 0x03;
    const size = sizeCode === 3 ? 4 : sizeCode;
    const tag = prefix & 0xfc;
    let value = 0;
    for (let b = 0; b < size; b++) value |= (desc[i + 1 + b] ?? 0) << (8 * b);
    if (tag === 0x74) reportSize = value; // Report Size
    else if (tag === 0x94) reportCount = value; // Report Count
    else if (tag === 0x80) inputBits += reportSize * reportCount; // Input
    else if (tag === 0x90) outputBits += reportSize * reportCount; // Output
    i += 1 + size;
  }
  return { input: Math.ceil(inputBits / 8), output: Math.ceil(outputBits / 8) };
}
