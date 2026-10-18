import type { Hunt, Monster } from '@abismo/content';
import { ILVL_SPREAD, LEGENDARY_MIN_HUNT_ILVL, type RateSheet } from '@abismo/engine';
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
        scale={2}
      />
    </span>
  );
}

/** Everything about one hunt: monsters, drops and, when unlocked, the rates per hour. */
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
  const current = s.hunt?.huntId === hunt.id && s.activity.kind !== 'idle_town';
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
              sim.startHunt(hunt.id);
              openScreen(null);
            }}
            data-testid="map-hunt"
          >
            {current ? t('hunts.here') : t('map.huntHere')}
          </button>
        )}
      </div>
      {locked && <div className="tone-bad small">🔒 {locked}</div>}

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
          {rates ? (
            <div className="rate-grid">
              <div>
                <Icon name="hunt" size={16} /> <b>{formatNumber(rates.killsPerHour)}</b>
                <span className="muted small">{t('map.kills')}</span>
              </div>
              <div>
                <Icon name="xp" size={16} className="tone-xp" />{' '}
                <b>{formatNumber(rates.xpPerHour)}</b>
                <span className="muted small">XP</span>
              </div>
              <div>
                <PixelIcon name="gold" size={16} /> <b>{formatNumber(rates.goldPerHour)}</b>
                <span className="muted small">{t('hud.gold')}</span>
              </div>
              <div>
                <PixelIcon name="item.iron_blade" size={16} />{' '}
                <b>
                  {formatNumber(
                    Math.round(Object.values(rates.dropsPerHour).reduce((a, b) => a + b, 0)),
                  )}
                </b>
                <span className="muted small">{t('map.items')}</span>
              </div>
              <div>
                <PixelIcon name="consumable.potion_hp_small" size={16} />{' '}
                <b>
                  {formatNumber(
                    Math.round(Object.values(rates.potionsUsedPerHour).reduce((a, b) => a + b, 0)),
                  )}
                </b>
                <span className="muted small">{t('map.potions')}</span>
              </div>
              <div>
                <PixelIcon name="skull" size={16} /> <b>{rates.deathsPerHour.toFixed(1)}</b>
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
                  <HeroSprite outfit={s.hero.appearance.outfit} scale={0.9} />
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
