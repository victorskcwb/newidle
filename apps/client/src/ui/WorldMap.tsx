import type { Hunt, Monster } from '@abismo/content';
import {
  difficultyRule,
  difficultyUnlocked,
  huntAt,
  HUNT_DIFFICULTIES,
  ILVL_SPREAD,
  LEGENDARY_MIN_HUNT_ILVL,
  type HuntDifficulty,
  type RateSheet,
} from '@abismo/engine';
import { useEffect, useState } from 'react';
import { formatNumber, t } from '../i18n.ts';
import { useUi } from '../state/store.ts';
import { Icon } from './Icon.tsx';
import { PixelIcon } from './PixelIcon.tsx';
import { RARITY_COLOR } from './rarity.ts';
import { HeroSprite, SheetSprite, useManifest } from './SheetSprite.tsx';
import { useSim } from './useSim.ts';

interface WorldMapData {
  width: number;
  height: number;
  nodes: { kind: 'hunt' | 'town'; id: string; regionId: string; x: number; y: number }[];
}

let mapPromise: Promise<WorldMapData | null> | null = null;
function useWorldMapData() {
  const [data, setData] = useState<WorldMapData | null>(null);
  useEffect(() => {
    let live = true;
    mapPromise ??= fetch('sprites/worldmap.json')
      .then((r) => r.json() as Promise<WorldMapData>)
      .catch(() => null);
    void mapPromise.then((d) => live && setData(d));
    return () => {
      live = false;
    };
  }, []);
  return data;
}

export function MonsterSprite({ monster }: { monster: Monster }) {
  const manifest = useManifest();
  const atlas = manifest?.atlases[monster.sprite.atlas];
  const sprite = atlas?.sprites[monster.sprite.key];
  if (!atlas?.image || !atlas.frameWidth || !sprite?.frames) return <span className="mob-sprite" />;
  return (
    <span className="mob-sprite">
      <SheetSprite
        image={atlas.image}
        frames={sprite.frames.idle}
        width={atlas.frameWidth}
        height={atlas.frameHeight ?? atlas.frameWidth}
        columns={atlas.columns ?? 16}
        scale={1}
      />
    </span>
  );
}

/** Everything about one hunt: monsters, drops and, when unlocked, the rates per hour. */
function signed(n: number): string {
  return n > 0 ? `+${n}` : String(n);
}

/** What a monster resists or is weak to (decision 170), e.g. "fogo 50% · gelo −25%". */
function Resistances({ monster }: { monster: Monster }) {
  const entries = Object.entries(monster.resistances ?? {}).filter(([, v]) => v !== 0);
  if (entries.length === 0) return null;
  return (
    <div className="small resistances">
      {entries.map(([element, pct]) => (
        <span
          key={element}
          className={pct! > 0 ? 'tone-bad' : 'tone-good'}
          title={pct! > 0 ? t('resist.resists') : t('resist.weak')}
        >
          {t(`element.${element}`)} {pct! > 0 ? `${pct}%` : `−${-pct!}%`}
        </span>
      ))}
    </div>
  );
}

export function HuntInfo({
  hunt,
  rates,
  locked,
}: {
  hunt: Hunt;
  rates?: RateSheet;
  locked: string | null;
}) {
  const sim = useSim();
  const openScreen = useUi((s) => s.openScreen);
  const s = sim.state;
  const chosen = s.hunt?.huntId === hunt.id ? s.hunt.difficulty : 'normal';
  const [difficulty, setDifficulty] = useState<HuntDifficulty>(chosen);
  // The sheet passed in is for the difficulty already chosen; another one is sampled here.
  const [otherRates, setOtherRates] = useState<RateSheet | null>(null);
  useEffect(() => setDifficulty(chosen), [hunt.id]);
  useEffect(() => {
    setOtherRates(null);
    if (locked || rates?.difficulty === difficulty) return;
    let live = true;
    void sim.ratesFor(hunt.id, difficulty).then((r) => live && setOtherRates(r));
    return () => {
      live = false;
    };
  }, [hunt.id, difficulty]);
  const shown = rates?.difficulty === difficulty ? rates : (otherRates ?? undefined);
  const totalWeight = hunt.spawns.reduce((n, sp) => n + sp.weight, 0);
  const mobs = hunt.spawns.map((sp) => ({
    m: sim.content.monsters.get(sp.monsterId)!,
    share: sp.weight / totalWeight,
  }));
  const boss = hunt.boss ? sim.content.monsters.get(hunt.boss.monsterId) : undefined;
  const dropPct =
    mobs.reduce(
      (n, { m, share }) =>
        n + share * (sim.content.lootTables.get(m.lootTableId)?.equipmentDropChancePpm ?? 0),
      0,
    ) / 10_000;
  const current =
    s.hunt?.huntId === hunt.id &&
    s.hunt.difficulty === difficulty &&
    s.activity.kind !== 'idle_town';
  const groups = huntAt(hunt, difficulty).groupSize;
  const rule = difficultyRule(difficulty);
  return (
    <div className="hunt-info" data-testid="hunt-info">
      <div className="hunt-info-head">
        <div>
          <div className="pixel hunt-info-name">{t(hunt.nameKey)}</div>
          <div className="muted small">
            {t(`region.${hunt.regionId}`)} ·{' '}
            {t('hunts.levels', { from: hunt.levelRange[0], to: hunt.levelRange[1] })} ·{' '}
            {t('hunts.recommended', { level: hunt.recommendedLevel })}
          </div>
        </div>
        {!locked && (
          <button
            type="button"
            className={`btn${current ? '' : ' btn-primary'}`}
            disabled={current}
            onClick={() => {
              sim.startHunt(hunt.id, difficulty);
              openScreen(null);
            }}
            data-testid="map-hunt"
          >
            {current ? t('hunts.here') : t('map.huntHere')}
          </button>
        )}
      </div>
      {locked && <div className="tone-bad small">🔒 {locked}</div>}

      {!locked && (
        <div className="difficulty" role="radiogroup" aria-label={t('difficulty.title')}>
          {HUNT_DIFFICULTIES.map((d) => {
            const open = difficultyUnlocked(s, hunt, d);
            return (
              <button
                key={d}
                type="button"
                role="radio"
                aria-checked={difficulty === d}
                className={`filter-chip difficulty-${d}${difficulty === d ? ' active' : ''}`}
                disabled={!open}
                title={open ? undefined : t('difficulty.locked')}
                onClick={() => setDifficulty(d)}
                data-testid={`difficulty-${d}`}
              >
                {!open && '🔒 '}
                {t(`difficulty.${d}`)}
              </button>
            );
          })}
          <div className="muted small difficulty-facts">
            {[
              t('difficulty.groups', { min: groups.min, max: groups.max }),
              rule.eliteChancePct !== 100 && t('difficulty.elites', { pct: rule.eliteChancePct }),
              rule.goldPct !== 0 && t('difficulty.gold', { pct: signed(rule.goldPct) }),
              rule.magicFindPct !== 0 &&
                t('difficulty.magicFind', { pct: signed(rule.magicFindPct) }),
            ]
              .filter(Boolean)
              .join(' · ')}
          </div>
        </div>
      )}

      <h4 className="pixel">{t('map.monsters')}</h4>
      <div className="mob-list">
        {mobs.map(({ m, share }) => (
          <div key={m.id} className="mob">
            <MonsterSprite monster={m} />
            <div>
              <div>{t(m.nameKey)}</div>
              <div className="muted small">
                {t('hud.level', { level: m.level })} · {t('map.hp', { n: formatNumber(m.hp) })} ·{' '}
                {t('map.xp', { n: m.xp })} · {Math.round(share * 100)}%
              </div>
              <Resistances monster={m} />
            </div>
          </div>
        ))}
        {boss && (
          <div className="mob boss">
            <MonsterSprite monster={boss} />
            <div>
              <div className="tone-bad">
                {t(boss.nameKey)} {s.defeatedBosses.includes(boss.id) ? '✓' : ''}
              </div>
              <div className="muted small">
                {t('map.boss', { n: hunt.boss!.everyKills })} ·{' '}
                {t('hud.level', { level: boss.level })} ·{' '}
                {t('map.hp', { n: formatNumber(boss.hp) })}
              </div>
              <Resistances monster={boss} />
            </div>
          </div>
        )}
      </div>

      <h4 className="pixel">{t('map.drops')}</h4>
      <div className="drop-facts small">
        <span>
          <PixelIcon name="item.iron_blade" size={16} />{' '}
          {t('map.dropChance', { pct: dropPct.toFixed(1) })}
        </span>
        <span>
          <PixelIcon name="gem" size={16} />{' '}
          {t('map.ilvl', {
            from: Math.max(1, hunt.ilvl - ILVL_SPREAD),
            to: hunt.ilvl + ILVL_SPREAD,
          })}
        </span>
        <span style={{ color: RARITY_COLOR.legendary }}>
          {hunt.ilvl >= LEGENDARY_MIN_HUNT_ILVL ? t('map.legendaryYes') : t('map.legendaryNo')}
        </span>
        <span>
          <PixelIcon name="book" size={16} /> {t('map.cards', { n: mobs.length + (boss ? 1 : 0) })}
        </span>
      </div>

      {!locked && (
        <>
          <h4 className="pixel">{t('map.perHour')}</h4>
          {shown ? (
            <div className="rate-grid">
              <div>
                <Icon name="hunt" size={16} /> <b>{formatNumber(shown.killsPerHour)}</b>
                <span className="muted small">{t('map.kills')}</span>
              </div>
              <div>
                <Icon name="xp" size={16} className="tone-xp" />{' '}
                <b>{formatNumber(shown.xpPerHour)}</b>
                <span className="muted small">XP</span>
              </div>
              <div>
                <PixelIcon name="gold" size={16} /> <b>{formatNumber(shown.goldPerHour)}</b>
                <span className="muted small">{t('hud.gold')}</span>
              </div>
              <div>
                <PixelIcon name="item.iron_blade" size={16} />{' '}
                <b>
                  {formatNumber(
                    Math.round(Object.values(shown.dropsPerHour).reduce((a, b) => a + b, 0)),
                  )}
                </b>
                <span className="muted small">{t('map.items')}</span>
              </div>
              <div>
                <PixelIcon name="consumable.potion_hp_small" size={16} />{' '}
                <b>
                  {formatNumber(
                    Math.round(Object.values(shown.potionsUsedPerHour).reduce((a, b) => a + b, 0)),
                  )}
                </b>
                <span className="muted small">{t('map.potions')}</span>
              </div>
              <div>
                <PixelIcon name="skull" size={16} /> <b>{shown.deathsPerHour.toFixed(1)}</b>
                <span className="muted small">{t('map.deaths')}</span>
              </div>
            </div>
          ) : (
            <div className="muted small">{t('rates.calculating')}</div>
          )}
        </>
      )}
    </div>
  );
}

/**
 * The world map: towns and hunts along the road through the three regions. Tap a hunt to
 * see its monsters, drops and expected rates; the hero's current hunt is marked.
 */
export function WorldMap({ rates }: { rates: Record<string, RateSheet> }) {
  const sim = useSim();
  const data = useWorldMapData();
  const s = sim.state;
  const [selected, setSelected] = useState<string>(
    s.hunt?.huntId ?? [...sim.content.hunts.values()][0]!.id,
  );
  const hunts = [...sim.content.hunts.values()];
  const lockReason = (h: Hunt) => {
    if (s.unlockedHunts.includes(h.id)) return null;
    const before = hunts.find((x) => x.unlocks === h.id);
    const boss = before?.boss ? sim.content.monsters.get(before.boss.monsterId) : undefined;
    return boss ? t('hunts.lockedBy', { boss: t(boss.nameKey) }) : t('hunts.locked');
  };
  const hunt = sim.content.hunts.get(selected);
  return (
    <div className="worldmap-wrap">
      {data && (
        <div
          className="worldmap"
          style={{ aspectRatio: `${data.width} / ${data.height}` }}
          data-testid="worldmap"
        >
          <img src="sprites/worldmap.png" alt="" className="worldmap-img" draggable={false} />
          {data.nodes.map((n) => {
            const left = `${(n.x / data.width) * 100}%`;
            const top = `${(n.y / data.height) * 100}%`;
            if (n.kind === 'town') {
              return (
                <div key={`town-${n.id}`} className="map-town" style={{ left, top }}>
                  <Icon name="town" size={18} />
                  <span className="map-label">{t(`town.${n.id}`)}</span>
                </div>
              );
            }
            const h = sim.content.hunts.get(n.id);
            if (!h) return null;
            const locked = !s.unlockedHunts.includes(h.id);
            const here = s.hunt?.huntId === h.id;
            return (
              <button
                type="button"
                key={n.id}
                className={`map-node${locked ? ' locked' : ''}${here ? ' here' : ''}${selected === n.id ? ' selected' : ''}`}
                style={{ left, top }}
                onClick={() => setSelected(n.id)}
                aria-label={t(h.nameKey)}
                data-testid={`map-node-${n.id}`}
              >
                {here ? (
                  <HeroSprite outfit={s.hero.appearance.outfit} scale={0.6} />
                ) : (
                  <Icon name={locked ? 'quests' : 'hunt'} size={16} />
                )}
                <span className="map-label">
                  {t(h.nameKey)}
                  <small>
                    {h.levelRange[0]}–{h.levelRange[1]}
                  </small>
                </span>
              </button>
            );
          })}
        </div>
      )}
      {hunt && <HuntInfo hunt={hunt} rates={rates[hunt.id]} locked={lockReason(hunt)} />}
    </div>
  );
}
