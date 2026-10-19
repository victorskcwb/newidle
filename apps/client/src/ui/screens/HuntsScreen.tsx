import { DungeonPanel } from '../DungeonPanel.tsx';
import type { Hunt, Monster } from '@abismo/content';
import type { RateSheet } from '@abismo/engine';
import { useEffect, useMemo, useState } from 'react';
import { formatNumber, localeTag, t } from '../../i18n.ts';
import { useUi } from '../../state/store.ts';
import { Icon } from '../Icon.tsx';
import { Sheet } from '../Sheet.tsx';
import { useSim } from '../useSim.ts';
import { HuntInfo, MonsterSprite, WorldMap } from '../WorldMap.tsx';

const FAV_KEY = 'abismo.favoriteHunts';

function loadFavorites(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(FAV_KEY) ?? '[]') as string[]);
  } catch {
    return new Set();
  }
}

/** Difficulty for this hero, 1 to 5 stars: monster level against hero level. */
function stars(monster: Monster, heroLevel: number) {
  const n = Math.max(1, Math.min(5, Math.round(3 + (monster.level - heroLevel) / 6)));
  return '★'.repeat(n) + '☆'.repeat(5 - n);
}

type Tab = 'hunts' | 'bosses' | 'abyss' | 'map';
type Sort = 'level' | 'levelDesc' | 'name';

/**
 * Adventures: every hunt as a card (its monsters, difficulty stars and level), searchable by
 * place or monster, sortable, with favourites and "my level"; the bosses; and the world map.
 * Tapping a card opens its sheet (monsters, drops, rates per hour) with the hunt button.
 */
export function HuntsScreen() {
  const sim = useSim();
  const openScreen = useUi((s) => s.openScreen);
  const [rates, setRates] = useState<Record<string, RateSheet>>({});
  const [tab, setTab] = useState<Tab>(sim.state.dungeon.active ? 'abyss' : 'hunts');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<Sort>('level');
  const [myLevel, setMyLevel] = useState(false);
  const [onlyFav, setOnlyFav] = useState(false);
  const [favs, setFavs] = useState<Set<string>>(loadFavorites);
  const s = sim.state;
  const [selected, setSelected] = useState<string | null>(s.hunt?.huntId ?? null);
  const hunts = [...sim.content.hunts.values()];
  const level = s.hero.level;

  useEffect(() => {
    let live = true;
    void (async () => {
      for (const h of hunts) {
        if (!s.unlockedHunts.includes(h.id)) continue;
        const r = await sim.ratesFor(h.id);
        if (!live) return;
        setRates((prev) => ({ ...prev, [h.id]: r }));
      }
    })();
    return () => {
      live = false;
    };
    // Recomputed when the screen opens (the setup does not change while it is open).
  }, [sim]);

  const monstersOf = (h: Hunt) =>
    h.spawns.map((sp) => sim.content.monsters.get(sp.monsterId)!).filter(Boolean);
  const lockReason = (h: Hunt) => {
    if (s.unlockedHunts.includes(h.id)) return null;
    const before = hunts.find((x) => x.unlocks === h.id);
    const boss = before?.boss ? sim.content.monsters.get(before.boss.monsterId) : undefined;
    return boss ? t('hunts.lockedBy', { boss: t(boss.nameKey) }) : t('hunts.locked');
  };
  const toggleFav = (id: string) => {
    const next = new Set(favs);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setFavs(next);
    try {
      localStorage.setItem(FAV_KEY, JSON.stringify([...next]));
    } catch {
      // Favourites just do not persist in private mode.
    }
  };

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    const out = hunts.filter((h) => {
      if (onlyFav && !favs.has(h.id)) return false;
      if (myLevel && (level < h.levelRange[0] || level > h.levelRange[1])) return false;
      if (!q) return true;
      const names = [
        t(h.nameKey),
        t(`region.${h.regionId}`),
        ...monstersOf(h).map((m) => t(m.nameKey)),
      ];
      return names.some((n) => n.toLowerCase().includes(q));
    });
    out.sort((a, b) =>
      sort === 'name'
        ? t(a.nameKey).localeCompare(t(b.nameKey), localeTag)
        : (sort === 'level' ? 1 : -1) * (a.recommendedLevel - b.recommendedLevel),
    );
    return out;
  }, [query, sort, myLevel, onlyFav, favs, level]);

  const picked = selected ? sim.content.hunts.get(selected) : undefined;
  const tabs: [Tab, string, string][] = [
    ['hunts', 'hunts', t('adventures.hunts')],
    ['bosses', 'skull', t('adventures.bosses')],
    ['abyss', 'resets', t('adventures.abyss')],
    ['map', 'hunts', t('adventures.map')],
  ];

  return (
    <Sheet title={t('adventures.title')} testId="hunts">
      <div className="adv-tabs" role="tablist">
        {tabs.map(([k, icon, label]) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={tab === k}
            className={`adv-tab${tab === k ? ' active' : ''}`}
            onClick={() => setTab(k)}
            data-testid={`adv-tab-${k}`}
          >
            {k === 'bosses' ? <span className="adv-skull">☠</span> : <Icon name={icon} size={22} />}
            {label}
          </button>
        ))}
      </div>

      {tab === 'map' && <WorldMap rates={rates} />}
      {tab === 'abyss' && <DungeonPanel />}

      {tab === 'hunts' && (
        <>
          <div className="adv-tools">
            <input
              className="input adv-search"
              placeholder={t('adventures.search')}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label={t('adventures.search')}
            />
            <span className="muted small">{t('adventures.count', { n: list.length })}</span>
            <select
              className="ab-select"
              value={sort}
              onChange={(e) => setSort(e.target.value as Sort)}
              aria-label={t('inventory.sort')}
            >
              <option value="level">{t('adventures.sort.level')}</option>
              <option value="levelDesc">{t('adventures.sort.levelDesc')}</option>
              <option value="name">{t('adventures.sort.name')}</option>
            </select>
            <button
              type="button"
              className={`filter-chip${myLevel ? ' active' : ''}`}
              onClick={() => setMyLevel(!myLevel)}
              aria-pressed={myLevel}
            >
              {t('adventures.myLevel')}
            </button>
            <button
              type="button"
              className={`filter-chip${onlyFav ? ' active' : ''}`}
              onClick={() => setOnlyFav(!onlyFav)}
              aria-pressed={onlyFav}
            >
              ♥ {t('adventures.favorites')}
            </button>
          </div>
          <div className="adv-grid">
            {list.map((h) => {
              const locked = lockReason(h);
              const here = s.hunt?.huntId === h.id && s.activity.kind !== 'idle_town';
              return (
                <div
                  key={h.id}
                  role="button"
                  tabIndex={0}
                  className={`adv-card${locked ? ' locked' : ''}${selected === h.id ? ' selected' : ''}`}
                  onClick={() => setSelected(h.id)}
                  onKeyDown={(e) => e.key === 'Enter' && setSelected(h.id)}
                  data-testid={`hunt-${h.id}`}
                >
                  <button
                    type="button"
                    className={`fav${favs.has(h.id) ? ' on' : ''}`}
                    aria-label={t('adventures.favorite')}
                    aria-pressed={favs.has(h.id)}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleFav(h.id);
                    }}
                  >
                    ♥
                  </button>
                  <div className="pixel adv-name">{t(h.nameKey)}</div>
                  <div className="adv-mobs">
                    {monstersOf(h).map((m) => (
                      <div key={m.id} className="adv-mob" title={t(m.nameKey)}>
                        <MonsterSprite monster={m} />
                        <span className="adv-stars">{stars(m, level)}</span>
                      </div>
                    ))}
                    {locked && <span className="adv-lock">🔒</span>}
                  </div>
                  <div className="muted small">
                    {t(`region.${h.regionId}`)}
                    {h.boss &&
                      ` · ${t('hunts.boss', { boss: t(sim.content.monsters.get(h.boss.monsterId)!.nameKey) })}`}
                    {h.boss && s.defeatedBosses.includes(h.boss.monsterId) && ' ✓'}
                  </div>
                  {locked && <div className="tone-bad small adv-locked">{locked}</div>}
                  <span className={`adv-level${locked ? ' bad' : ''}`}>
                    {here ? t('hunts.here') : t('adventures.level', { level: h.recommendedLevel })}
                  </span>
                  {rates[h.id] && (
                    <div className="rates small">
                      {t('rates.summary', {
                        kills: formatNumber(rates[h.id]!.killsPerHour),
                        xp: formatNumber(rates[h.id]!.xpPerHour),
                        gold: formatNumber(rates[h.id]!.goldPerHour),
                      })}
                    </div>
                  )}
                </div>
              );
            })}
            {list.length === 0 && <div className="muted">{t('adventures.none')}</div>}
          </div>
          {picked && (
            <HuntInfo hunt={picked} rates={rates[picked.id]} locked={lockReason(picked)} />
          )}
        </>
      )}

      {tab === 'bosses' && (
        <div className="adv-grid">
          {hunts
            .filter((h) => h.boss)
            .map((h) => {
              const boss = sim.content.monsters.get(h.boss!.monsterId)!;
              const defeated = s.defeatedBosses.includes(boss.id);
              const progress = s.hunt?.huntId === h.id ? s.hunt.killsSinceBoss : null;
              const locked = lockReason(h);
              return (
                <div key={boss.id} className={`adv-card boss${locked ? ' locked' : ''}`}>
                  <div className="pixel adv-name tone-bad">{t(boss.nameKey)}</div>
                  <div className="adv-mobs big">
                    <MonsterSprite monster={boss} />
                  </div>
                  <div className="muted small">
                    {t('hud.level', { level: boss.level })} ·{' '}
                    {t('map.hp', { n: formatNumber(boss.hp) })}
                  </div>
                  <div className="small">
                    {t(h.nameKey)} · {t('map.boss', { n: h.boss!.everyKills })}
                  </div>
                  {progress !== null && (
                    <div className="bar bar-xp boss-progress">
                      <div
                        className="bar-fill"
                        style={{
                          width: `${Math.min(100, (progress / h.boss!.everyKills) * 100)}%`,
                        }}
                      />
                      <span className="bar-text">
                        {progress}/{h.boss!.everyKills}
                      </span>
                    </div>
                  )}
                  <span className={`adv-level${defeated ? '' : ' bad'}`}>
                    {defeated ? t('adventures.defeated') : t('adventures.undefeated')}
                  </span>
                  {!locked && (
                    <button
                      type="button"
                      className="btn btn-small btn-primary"
                      onClick={() => {
                        sim.startHunt(h.id);
                        openScreen(null);
                      }}
                    >
                      {t('map.huntHere')}
                    </button>
                  )}
                </div>
              );
            })}
        </div>
      )}
    </Sheet>
  );
}
