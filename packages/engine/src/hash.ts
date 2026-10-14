import type { SlotState } from './types.ts';

/**
 * Canonical JSON: object keys sorted, no whitespace, `undefined` fields dropped.
 * Only plain data (objects, arrays, strings, finite numbers, booleans, null) is supported.
 */
export function canonicalJson(value: unknown): string {
  if (value === null) return 'null';
  switch (typeof value) {
    case 'number':
      if (!Number.isFinite(value)) throw new TypeError('canonicalJson: non-finite number');
      return JSON.stringify(value);
    case 'string':
    case 'boolean':
      return JSON.stringify(value);
    case 'object': {
      if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
      const obj = value as Record<string, unknown>;
      const keys = Object.keys(obj)
        .filter((k) => obj[k] !== undefined)
        .sort();
      return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`).join(',')}}`;
    }
    default:
      throw new TypeError(`canonicalJson: unsupported type ${typeof value}`);
  }
}

const FNV64_OFFSET = 0xcbf29ce484222325n;
const FNV64_PRIME = 0x100000001b3n;

/** FNV-1a 64 over the UTF-8 bytes of a string, as 16 hex digits. */
export function fnv1a64(text: string): string {
  let hash = FNV64_OFFSET;
  const update = (byte: number) => {
    hash = BigInt.asUintN(64, (hash ^ BigInt(byte)) * FNV64_PRIME);
  };
  for (const char of text) {
    const cp = char.codePointAt(0)!;
    if (cp < 0x80) update(cp);
    else if (cp < 0x800) {
      update(0xc0 | (cp >> 6));
      update(0x80 | (cp & 0x3f));
    } else if (cp < 0x10000) {
      update(0xe0 | (cp >> 12));
      update(0x80 | ((cp >> 6) & 0x3f));
      update(0x80 | (cp & 0x3f));
    } else {
      update(0xf0 | (cp >> 18));
      update(0x80 | ((cp >> 12) & 0x3f));
      update(0x80 | ((cp >> 6) & 0x3f));
      update(0x80 | (cp & 0x3f));
    }
  }
  return hash.toString(16).padStart(16, '0');
}

/** Stable hash of a slot state, compared between client and server at checkpoints. */
export function hashState(state: SlotState): string {
  return fnv1a64(canonicalJson(state));
}
