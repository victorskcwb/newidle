/**
 * Interface icons: SVGs from game-icons.net (CC BY 3.0), one per name the game uses. The
 * files live in assets/vendor/game-icons/<author>/<file>.svg; `pnpm art` turns them into
 * apps/client/src/ui/icons.generated.ts (path data only, coloured by CSS) and lists the
 * authors in assets/vendor/game-icons/ICONS.md.
 */
import { readFileSync, writeFileSync } from 'node:fs';

export const UI_ICONS: Record<string, string> = {
  // Navigation
  character: 'lorc/visored-helm',
  backpack: 'delapouite/backpack',
  skills: 'delapouite/skills',
  cards: 'faithtoken/card-random',
  quests: 'lorc/scroll-unfurled',
  hunts: 'lorc/treasure-map',
  smith: 'lorc/anvil-impact',
  altar: 'skoll/pentacle',
  filter: 'delapouite/funnel',
  settings: 'lorc/cog',
  save: 'delapouite/save',
  town: 'delapouite/village',
  hunt: 'lorc/crossed-swords',
  log: 'lorc/quill-ink',
  offline: 'lorc/hourglass',
  journal: 'lorc/open-book',
  achievement: 'lorc/trophy',
  // Resources
  gold: 'delapouite/two-coins',
  potion: 'delapouite/health-potion',
  manaPotion: 'caro-asercion/round-potion',
  xp: 'delapouite/upgrade',
  hp: 'zeromancer/heart-plus',
  mana: 'lorc/crystal-ball',
  level: 'delapouite/stars-stack',
  resets: 'lorc/cycle',
  charm: 'lorc/chained-heart',
  // Attributes and stats
  strength: 'delapouite/biceps',
  dexterity: 'lorc/sprint',
  vitality: 'delapouite/heart-beats',
  energy: 'lorc/brain',
  damage: 'lorc/broadsword',
  defense: 'lorc/checked-shield',
  crit: 'skoll/bullseye',
  attackSpeed: 'lorc/sands-of-time',
  magicFind: 'lorc/magnifying-glass',
  // Skills (by skill id)
  'skill.sword_mastery': 'lorc/crossed-swords',
  'skill.heavy_strike': 'lorc/sword-wound',
  'skill.toughness': 'lorc/muscle-up',
  'skill.precision': 'delapouite/eye-target',
  'skill.war_cry': 'lorc/shouting',
  'skill.iron_skin': 'lorc/shield-reflect',
  'skill.fury': 'delapouite/enrage',
  'skill.whirlwind': 'lorc/whirlwind',
  'skill.bloodthirst': 'lorc/bleeding-wound',
  'skill.critical_eye': 'skoll/bullseye',
  'skill.charge': 'delapouite/charging-bull',
  'skill.undead_bane': 'lorc/skull-crossed-bones',
  // Items (by base id)
  'item.sword_rusty': 'delapouite/rusty-sword',
  'item.iron_blade': 'lorc/broadsword',
  'item.blackened_sword': 'lorc/dripping-sword',
  'item.abyssal_blade': 'lorc/rune-sword',
  'item.shield_plank': 'lorc/cracked-shield',
  'item.shield_iron': 'lorc/bordered-shield',
  'item.shield_tower': 'delapouite/templar-shield',
  'item.shield_ashen': 'lorc/fire-shield',
  'item.helm_leather': 'delapouite/light-helm',
  'item.helm_iron': 'sbed/helmet',
  'item.helm_steel': 'lorc/visored-helm',
  'item.helm_ashen': 'lorc/horned-helm',
  'item.vest_leather': 'lorc/leather-vest',
  'item.chain_shirt': 'delapouite/chest-armor',
  'item.plate_cuirass': 'lorc/breastplate',
  'item.ashen_cuirass': 'lorc/spiked-armor',
  'item.gloves_cloth': 'delapouite/gloves',
  'item.gauntlets_iron': 'delapouite/gauntlet',
  'item.gauntlets_steel': 'lorc/mailed-fist',
  'item.gauntlets_ashen': 'delapouite/armor-punch',
  'item.pants_leather': 'irongamer/armored-pants',
  'item.greaves_iron': 'delapouite/greaves',
  'item.greaves_steel': 'delapouite/leg-armor',
  'item.greaves_ashen': 'delapouite/armor-cuisses',
  'item.boots_worn': 'lorc/leather-boot',
  'item.boots_iron': 'lorc/boots',
  'item.boots_steel': 'delapouite/metal-boot',
  'item.boots_ashen': 'lorc/steeltoe-boots',
  'item.belt_rope': 'lucasms/belt',
  'item.belt_leather': 'lorc/belt-buckles',
  'item.belt_studded': 'delapouite/belt-armor',
  'item.belt_ashen': 'delapouite/black-belt',
  'item.ring_copper': 'delapouite/ring',
  'item.ring_silver': 'lorc/engagement-ring',
  'item.ring_gold': 'delapouite/diamond-ring',
  'item.ring_obsidian': 'delapouite/power-ring',
  'item.amulet_bone': 'delapouite/primitive-necklace',
  'item.amulet_bronze': 'lorc/gem-pendant',
  'item.amulet_jade': 'delapouite/emerald-necklace',
  'item.amulet_ember': 'lorc/gem-necklace',
};

/** Display names of the contributors (folder → name), from the pack's license.txt. */
export const ICON_AUTHORS: Record<string, string> = {
  lorc: 'Lorc',
  delapouite: 'Delapouite',
  faithtoken: 'Faithtoken',
  skoll: 'Skoll',
  'caro-asercion': 'Caro Asercion',
  zeromancer: 'Zeromancer',
  sbed: 'Sbed',
  irongamer: 'Irongamer',
  lucasms: 'Lucas',
};

/** Writes the icon module for the client and the list of icons with their authors. */
export function buildUiIcons(assets: URL, out: URL) {
  const paths: Record<string, string> = {};
  const rows: string[] = [];
  for (const [name, file] of Object.entries(UI_ICONS)) {
    const svg = readFileSync(new URL(`vendor/game-icons/${file}.svg`, assets), 'utf8');
    // Every icon is a black 512×512 square (left out) under white paths.
    const d = [...svg.matchAll(/<path[^>]*\sd="([^"]+)"/g)]
      .map((m) => m[1]!)
      .filter((p) => p !== 'M0 0h512v512H0z');
    if (d.length === 0) throw new Error(`icon ${file} has no paths`);
    paths[name] = d.join(' ');
    const author = file.split('/')[0]!;
    rows.push(`| ${name} | ${file}.svg | ${ICON_AUTHORS[author] ?? author} |`);
  }
  writeFileSync(
    out,
    '// Generated by `pnpm art` from assets/vendor/game-icons (game-icons.net, CC BY 3.0).\n' +
      '// Do not edit: change tools/content-build/src/ui-icons.ts instead.\n' +
      `export const ICON_PATHS: Record<string, string> = ${JSON.stringify(paths, null, 2)};\n`,
  );
  writeFileSync(
    new URL('vendor/game-icons/ICONS.md', assets),
    '# Ícones do game-icons.net usados no jogo\n\n' +
      'Licença: [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/) ' +
      '(Zeromancer: CC0). Fonte: <https://game-icons.net>. Os ícones são recoloridos pela ' +
      'interface.\n\n| Nome no jogo | Arquivo | Autor |\n| --- | --- | --- |\n' +
      rows.join('\n') +
      '\n',
  );
  return rows.length;
}
