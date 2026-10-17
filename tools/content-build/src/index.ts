/**
 * Validates every content file, its cross-references, translations, maps and sprites.
 * Exits with code 1 (failing CI) and a list of problems if anything is wrong.
 *
 *   pnpm content:build
 */
import { existsSync, readFileSync } from 'node:fs';
import {
  ContentError,
  HERO_ANIMATIONS,
  MONSTER_ANIMATIONS,
  loadContent,
  spriteManifestSchema,
  tiledMapSchema,
  translationKeys,
  validateHuntMap,
  validateTownMap,
  objectsOf,
  type ContentDb,
} from '@abismo/content';
import { hasKey } from '@abismo/i18n';
import { PNG } from 'pngjs';

const assets = new URL('../../../assets/', import.meta.url);
const problems: string[] = [];

let content: ContentDb | null = null;
try {
  content = loadContent();
} catch (e) {
  if (e instanceof ContentError) problems.push(...e.problems.map((p) => `content: ${p}`));
  else throw e;
}

function readJson(rel: string): unknown {
  const url = new URL(rel, assets);
  if (!existsSync(url)) {
    problems.push(`missing file assets/${rel}`);
    return null;
  }
  return JSON.parse(readFileSync(url, 'utf8'));
}

if (content) {
  for (const key of translationKeys(content)) {
    if (!hasKey(key)) problems.push(`i18n: missing pt-BR text for "${key}"`);
  }

  for (const hunt of content.hunts.values()) {
    const raw = readJson(`${hunt.mapId}.tmj`);
    if (raw === null) continue;
    const parsed = tiledMapSchema.safeParse(raw);
    if (!parsed.success) {
      problems.push(`map ${hunt.mapId}: ${parsed.error.issues.map((i) => i.message).join('; ')}`);
      continue;
    }
    for (const p of validateHuntMap(parsed.data, hunt.routeLayer)) {
      problems.push(`map ${hunt.mapId}: ${p}`);
    }
    for (const ts of parsed.data.tilesets) {
      if (ts.image && !existsSync(new URL(ts.image, new URL(`${hunt.mapId}.tmj`, assets)))) {
        problems.push(`map ${hunt.mapId}: tileset image ${ts.image} not found`);
      }
    }
  }

  // One town per region, with the NPCs of the manifest.
  const regions = new Set([...content.hunts.values()].map((h) => h.regionId));
  for (const region of regions) {
    const raw = readJson(`maps/town_${region}.tmj`);
    if (raw === null) continue;
    const parsed = tiledMapSchema.safeParse(raw);
    if (!parsed.success) {
      problems.push(`town ${region}: ${parsed.error.issues.map((i) => i.message).join('; ')}`);
      continue;
    }
    for (const p of validateTownMap(parsed.data)) problems.push(`town ${region}: ${p}`);
    for (const n of objectsOf(parsed.data, 'npcs')) {
      if (!hasKey(`npc.${n.name}`)) problems.push(`i18n: missing pt-BR text for "npc.${n.name}"`);
    }
  }

  const manifest = spriteManifestSchema.safeParse(readJson('sprites/manifest.json'));
  if (!manifest.success) {
    problems.push(
      `sprites/manifest.json: ${manifest.error.issues.map((i) => i.message).join('; ')}`,
    );
  } else {
    const atlases = manifest.data.atlases;
    // Every sheet exists and every frame fits inside it.
    for (const [name, atlas] of Object.entries(atlases)) {
      if (!atlas.image) continue;
      const url = new URL(atlas.image, assets);
      if (!existsSync(url)) {
        problems.push(`sprites: atlas ${name} image ${atlas.image} not found`);
        continue;
      }
      const png = PNG.sync.read(readFileSync(url));
      const w = atlas.frameWidth ?? 16;
      const h = atlas.frameHeight ?? w;
      const frames = Math.floor(png.width / w) * Math.floor(png.height / h);
      for (const [key, sprite] of Object.entries(atlas.sprites)) {
        const sets = [sprite.frames, ...(sprite.looks ?? [])].filter((s) => s !== undefined);
        const all = sets.flatMap((s) => [...s.idle, ...s.run, ...(s.hit ?? [])]);
        for (const f of [...all, sprite.weapon]) {
          if (f !== undefined && f >= frames)
            problems.push(`sprites: ${name}/${key} frame ${f} outside the sheet`);
        }
      }
    }
    const hero = atlases.hero?.sprites.warrior;
    if (!hero) problems.push('sprites: no hero/warrior sprite');
    for (const anim of HERO_ANIMATIONS) {
      if (hero && !hero.animations[anim]) problems.push(`sprites: hero/warrior lacks "${anim}"`);
    }
    for (const m of content.monsters.values()) {
      const sprite = atlases[m.sprite.atlas]?.sprites[m.sprite.key];
      if (!sprite) {
        problems.push(
          `sprites: monster ${m.id} → ${m.sprite.atlas}/${m.sprite.key} not in manifest`,
        );
        continue;
      }
      for (const anim of MONSTER_ANIMATIONS) {
        if (!sprite.animations[anim]) problems.push(`sprites: ${m.sprite.key} lacks "${anim}"`);
      }
    }
  }
}

if (problems.length > 0) {
  console.error(`Content check failed (${problems.length}):\n- ${problems.join('\n- ')}`);
  process.exit(1);
}
const c = content!;
console.log(
  `Content OK: ${c.hunts.size} hunts, ${c.monsters.size} monsters, ${c.itemBases.size} item bases, ` +
    `${c.affixes.size} affixes, ${c.skills.size} skills; maps, sprites and pt-BR texts complete.`,
);
