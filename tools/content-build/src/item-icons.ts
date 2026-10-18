/**
 * Item icons in pixel art: Kyrise's 16x16 RPG Icon Pack (CC BY 4.0, assets/vendor/
 * kyrise-rpg-icons) for weapons, armour, jewels, materials and potions, plus pants and
 * belts drawn here in the same style (black outline, light from the top left), which the
 * pack does not have. `pnpm art` writes assets/sprites/items.png (16 px cells) and
 * apps/client/src/ui/itemIcons.generated.ts (name → frame).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';

const S = 16;
const COLS = 16;

type Drawn = { kind: 'pants' | 'belt'; tier: 0 | 1 | 2 | 3 };
/** A pack icon recoloured by its brightness (ores and herbs of each tier). */
type Tinted = { file: string; tint: string };

/** Icon name → Kyrise file (without .png) or a drawn icon. */
const ITEM_ICONS: Record<string, string | Drawn | Tinted> = {
  'item.sword_rusty': 'sword_01a',
  'item.iron_blade': 'sword_01b',
  'item.blackened_sword': 'sword_02b',
  'item.abyssal_blade': 'sword_03e',
  'item.shield_plank': 'shield_01a',
  'item.shield_iron': 'shield_01b',
  'item.shield_tower': 'shield_02b',
  'item.shield_ashen': 'shield_02e',
  'item.helm_leather': 'helmet_01a',
  'item.helm_iron': 'helmet_01b',
  'item.helm_steel': 'helmet_02b',
  'item.helm_ashen': 'helmet_02e',
  'item.vest_leather': 'armor_01a',
  'item.chain_shirt': 'armor_01b',
  'item.plate_cuirass': 'armor_01c',
  'item.ashen_cuirass': 'armor_01e',
  'item.gloves_cloth': 'gloves_01a',
  'item.gauntlets_iron': 'gloves_01b',
  'item.gauntlets_steel': 'gloves_01c',
  'item.gauntlets_ashen': 'gloves_01e',
  'item.pants_leather': { kind: 'pants', tier: 0 },
  'item.greaves_iron': { kind: 'pants', tier: 1 },
  'item.greaves_steel': { kind: 'pants', tier: 2 },
  'item.greaves_ashen': { kind: 'pants', tier: 3 },
  'item.boots_worn': 'boots_01a',
  'item.boots_iron': 'boots_01b',
  'item.boots_steel': 'boots_01c',
  'item.boots_ashen': 'boots_01e',
  'item.belt_rope': { kind: 'belt', tier: 0 },
  'item.belt_leather': { kind: 'belt', tier: 1 },
  'item.belt_studded': { kind: 'belt', tier: 2 },
  'item.belt_ashen': { kind: 'belt', tier: 3 },
  'item.ring_copper': 'ring_01a',
  'item.ring_silver': 'ring_01b',
  'item.ring_gold': 'ring_01d',
  'item.ring_obsidian': 'ring_02c',
  'item.amulet_bone': 'necklace_01a',
  'item.amulet_bronze': 'necklace_02d',
  'item.amulet_jade': 'necklace_03a',
  'item.amulet_ember': 'necklace_03e',
  'material.fragment': 'shard_01h',
  'material.essence': 'shard_01c',
  'material.crystal': 'crystal_01a',
  'material.core': 'gem_01d',
  'material.soul': 'crystal_01j',
  'consumable.potion_hp_small': 'potion_02a',
  'consumable.potion_mana_small': 'potion_02b',
  'consumable.refine_charm': 'pearl_01b',
  'consumable.tempering_stone': 'ingot_01a',
  'resource.ore_copper': { file: 'stoneblock_01a', tint: '#d0803c' },
  'resource.ore_iron': { file: 'stoneblock_01a', tint: '#a4adb8' },
  'resource.ore_silver': { file: 'stoneblock_01a', tint: '#e4eef8' },
  'resource.ore_obsidian': { file: 'stoneblock_01a', tint: '#8a62c4' },
  'resource.ore_abyssal': { file: 'stoneblock_01a', tint: '#40c8bc' },
  'resource.herb_ashleaf': 'leaf_01a',
  'resource.herb_bogbloom': 'flower_01a',
  'resource.herb_ghostcap': 'flower_02a',
  'resource.herb_emberroot': { file: 'leaf_01a', tint: '#f07040' },
  'resource.herb_voidpetal': { file: 'flower_01a', tint: '#9c7cff' },
  gold: 'coin_04d',
  quest: 'scroll_01a',
  key: 'key_01a',
  chest: 'giftopen_01a',
  skull: 'skull_01a',
  book: 'book_01a',
  gem: 'gem_01a',
};

type Rgb = readonly [number, number, number];
const hex = (h: string): Rgb => [
  parseInt(h.slice(1, 3), 16),
  parseInt(h.slice(3, 5), 16),
  parseInt(h.slice(5, 7), 16),
];
const OUTLINE = hex('#000000');
/** Leather, iron, steel, ashen: base, light, dark. */
const TIERS: [Rgb, Rgb, Rgb][] = [
  [hex('#8a5a32'), hex('#b8804c'), hex('#5a3818')],
  [hex('#8c919b'), hex('#c4c9d2'), hex('#5a5f69')],
  [hex('#4f7fbf'), hex('#8ab6ea'), hex('#2f4f80')],
  [hex('#a8382c'), hex('#e0644c'), hex('#62180f')],
];
const BUCKLE: [Rgb, Rgb] = [hex('#e0b040'), hex('#fff0a0')];

/** Pants or a belt on a 16×16 grid: shapes, shading, then a black outline around them. */
function drawIcon(d: Drawn): (Rgb | null)[] {
  const px: (Rgb | null)[] = new Array<Rgb | null>(S * S).fill(null);
  const [base, light, dark] = TIERS[d.tier]!;
  const set = (x: number, y: number, c: Rgb) => {
    if (x >= 0 && y >= 0 && x < S && y < S) px[y * S + x] = c;
  };
  const rect = (x0: number, y0: number, x1: number, y1: number, c: Rgb) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(x, y, c);
  };
  if (d.kind === 'pants') {
    rect(3, 2, 12, 5, base); // hips
    rect(3, 6, 6, 13, base); // left leg
    rect(9, 6, 12, 13, base); // right leg
    rect(3, 2, 12, 3, dark); // waistband
    rect(3, 4, 3, 13, light);
    rect(9, 6, 9, 13, light);
    rect(6, 6, 6, 13, dark);
    rect(12, 4, 12, 13, dark);
    rect(3, 13, 6, 13, dark); // cuffs
    rect(9, 13, 12, 13, dark);
    if (d.tier > 0) {
      set(4, 9, light); // knee plates
      set(10, 9, light);
    }
  } else {
    rect(1, 6, 14, 9, base);
    rect(1, 6, 14, 6, light);
    rect(1, 9, 14, 9, dark);
    rect(6, 5, 9, 10, BUCKLE[0]);
    rect(7, 7, 8, 8, dark); // the buckle's hole
    set(6, 5, BUCKLE[1]);
    set(7, 5, BUCKLE[1]);
    for (const x of [3, 11, 13]) set(x, 7, dark); // belt holes
    if (d.tier >= 2) for (const x of [2, 4, 11, 13]) set(x, 8, BUCKLE[1]); // studs
  }
  const out = [...px];
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      if (px[y * S + x]) continue;
      const near = [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ].some(([dx, dy]) => {
        const nx = x + dx!;
        const ny = y + dy!;
        return nx >= 0 && ny >= 0 && nx < S && ny < S && px[ny * S + nx];
      });
      if (near) out[y * S + x] = OUTLINE;
    }
  }
  return out;
}

export function buildItemIcons(assets: URL, out: URL) {
  const names = Object.keys(ITEM_ICONS);
  const rows = Math.ceil(names.length / COLS);
  const sheet = new PNG({ width: COLS * S, height: rows * S });
  const frames: Record<string, number> = {};
  names.forEach((name, i) => {
    frames[name] = i;
    const dx = (i % COLS) * S;
    const dy = Math.floor(i / COLS) * S;
    const src = ITEM_ICONS[name]!;
    if (typeof src === 'string' || 'file' in src) {
      const file = typeof src === 'string' ? src : src.file;
      const tint = typeof src === 'string' ? null : hex(src.tint);
      const png = PNG.sync.read(
        readFileSync(new URL(`vendor/kyrise-rpg-icons/${file}.png`, assets)),
      );
      for (let y = 0; y < S; y++) {
        for (let x = 0; x < S; x++) {
          const si = (y * png.width + x) * 4;
          const di = ((dy + y) * sheet.width + dx + x) * 4;
          for (let c = 0; c < 4; c++) sheet.data[di + c] = png.data[si + c]!;
          if (tint) {
            // Brightness drives the tint; the dark outline stays dark.
            const lum = (png.data[si]! * 3 + png.data[si + 1]! * 6 + png.data[si + 2]!) / 10;
            for (let c = 0; c < 3; c++) {
              sheet.data[di + c] = Math.min(255, Math.round((tint[c]! * lum) / 150));
            }
          }
        }
      }
    } else {
      drawIcon(src).forEach((c, k) => {
        if (!c) return;
        const di = ((dy + Math.floor(k / S)) * sheet.width + dx + (k % S)) * 4;
        sheet.data[di] = c[0];
        sheet.data[di + 1] = c[1];
        sheet.data[di + 2] = c[2];
        sheet.data[di + 3] = 255;
      });
    }
  });
  writeFileSync(new URL('sprites/items.png', assets), PNG.sync.write(sheet));
  writeFileSync(
    out,
    '// Generated by `pnpm art` (tools/content-build/src/item-icons.ts). Do not edit.\n' +
      "// Pixel icons: Kyrise's 16x16 RPG Icon Pack (CC BY 4.0) and our own pants and belts.\n" +
      `export const ITEM_ICON_COLS = ${COLS};\n` +
      `export const ITEM_ICON_ROWS = ${rows};\n` +
      `export const ITEM_ICON_FRAMES: Record<string, number> = ${JSON.stringify(frames, null, 2)};\n`,
  );
  return names.length;
}
