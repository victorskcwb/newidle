import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { hasKey } from '@abismo/i18n';
import { describe, expect, it } from 'vitest';

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.tsx?$/.test(name) && !name.endsWith('.test.ts') ? [path] : [];
  });
}

describe('i18n', () => {
  it('every literal text key used by the client exists in pt-BR', () => {
    const dir = new URL('.', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
    const missing: string[] = [];
    for (const file of sources(dir)) {
      for (const m of readFileSync(file, 'utf8').matchAll(/\bt\(\s*'([a-zA-Z0-9_.]+)'/g)) {
        if (!hasKey(m[1]!)) missing.push(`${m[1]} (${file})`);
      }
    }
    expect(missing).toEqual([]);
  });
});
