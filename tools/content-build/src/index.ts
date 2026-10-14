/**
 * Validates packages/content/data and writes dist/content.<hash>.json.
 * Fails (exit 1) on schema errors, broken references or missing pt-BR translations.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ContentError,
  SKILL_IDS,
  buildContentDb,
  bundledRawContent,
  contentTranslationKeys,
} from '@valdren/content';
import { hasKey } from '@valdren/i18n';

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');

try {
  const db = buildContentDb(bundledRawContent);
  const keys = [...contentTranslationKeys(db), ...SKILL_IDS.map((s) => `skill.${s}`)];
  const missing = keys.filter((k) => !hasKey(k));
  if (missing.length > 0) throw new ContentError(missing.map((k) => `missing pt-BR key "${k}"`));

  const json = JSON.stringify(db.raw);
  const hash = createHash('sha256').update(json).digest('hex').slice(0, 12);
  mkdirSync(outDir, { recursive: true });
  for (const f of readdirSync(outDir)) if (/^content\..*\.json$/.test(f)) rmSync(join(outDir, f));
  writeFileSync(join(outDir, `content.${hash}.json`), json);
  writeFileSync(
    join(outDir, 'manifest.json'),
    JSON.stringify({ hash, file: `content.${hash}.json` }),
  );
  console.log(
    `content ok: ${db.items.size} items, ${db.actions.size} actions, ${db.monsters.size} monsters → content.${hash}.json`,
  );
} catch (e) {
  console.error(e instanceof ContentError ? e.message : e);
  process.exit(1);
}
