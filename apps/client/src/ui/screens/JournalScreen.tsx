import type { Achievement } from '@abismo/content';
import {
  achievementPoints,
  achievementProgress,
  bestiaryDamagePct,
  bestiaryTier,
  COLLECTION_POINTS_PER_DAMAGE_PCT,
  COLLECTION_POINTS_PER_MAGIC_FIND_PCT,
  collectionMaxPoints,
  collectionMods,
  collectionPoints,
  equippedSetPieces,
  regionMonsters,
  RARITY_ORDER,
  TICKS_PER_HOUR,
  tierKills,
} from '@abismo/engine';
import { useState } from 'react';
import { formatDuration, formatNumber, t } from '../../i18n.ts';
import { Icon } from '../Icon.tsx';
import { PixelIcon } from '../PixelIcon.tsx';
import { RARITY_COLOR, RARITY_GLYPH } from '../rarity.ts';
import { Sheet, tryIntent } from '../Sheet.tsx';
import { useSim } from '../useSim.ts';
import { MonsterSprite } from '../WorldMap.tsx';
import { XpChart } from '../XpChart.tsx';

type Tab = 'achievements' | 'bestiary' | 'pets' | 'collection' | 'stats';
const TABS: Tab[] = ['achievements', 'bestiary', 'pets', 'collection', 'stats'];

export function achievementText(a: Achievement): string {
  return t(`achievement.kind.${a.kind}`, {
    n: formatNumber(a.target),
    rarity: a.rarity ? t(`rarity.${a.rarity}`).toLowerCase() : '',
    tier: a.tier ?? 0,
  });
}

function Achievements() {
  const sim = useSim();
  const s = sim.state;
  const [error, setError] = useState<string | null>(null);
  const list = [...sim.content.achievements.values()];
  const done = list.filter((a) => s.achievements.unlocked[a.id] !== undefined).length;
  return (
    <>
      <p className="muted small" data-testid="achievement-summary">
        {t('journal.achievementsSummary', {
          done,
          total: list.length,
          points: achievementPoints(s, sim.content),
        })}
      </p>
      {error && <p className="tone-bad">{error}</p>}
      <ul className="ach-list">
        {list.map((a) => {
          const unlocked = s.achievements.unlocked[a.id] !== undefined;
          const value = Math.min(a.target, achievementProgress(s, sim.content, a));
          const inUse = s.achievements.title === a.id;
          return (
            <li key={a.id} className={`ach${unlocked ? ' done' : ''}`} data-testid={`ach-${a.id}`}>
              <Icon name="achievement" size={26} className={unlocked ? 'tone-xp' : 'muted'} />
              <div className="ach-body">
                <div className="ach-head">
                  <span className="pixel">{t(a.nameKey)}</span>
                  <span className="muted small">{t('journal.points', { n: a.points })}</span>
                </div>
                <div className="small">{achievementText(a)}</div>
                {!unlocked && (
                  <div className="bar bar-xp quest-bar">
                    <div className="bar-fill" style={{ width: `${(value / a.target) * 100}%` }} />
                    <span className="bar-text">
                      {formatNumber(value)} / {formatNumber(a.target)}
                    </span>
                  </div>
                )}
                {a.titleKey && (
                  <div className="ach-title small">
                    <span className={unlocked ? 'tone-info' : 'muted'}>
                      {t('journal.title', { title: t(a.titleKey) })}
                    </span>
                    {unlocked && (
                      <button
                        type="button"
                        className="btn btn-small"
                        disabled={inUse}
                        onClick={() => setError(tryIntent(() => sim.setTitle(a.id)))}
                      >
                        {inUse ? t('journal.titleInUse') : t('journal.useTitle')}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {s.achievements.title && (
        <button type="button" className="btn wide" onClick={() => sim.setTitle(null)}>
          {t('journal.hideTitle')}
        </button>
      )}
    </>
  );
}

function Bestiary() {
  const sim = useSim();
  const s = sim.state;
  const tiers = sim.content.bestiaryTiers;
  const regions = [...sim.content.regions.values()].sort((a, b) => a.order - b.order);
  return (
    <>
      <p className="muted small">
        {t('journal.bestiaryHint', {
          tiers: tiers.map((x) => `${formatNumber(x.kills)} (+${x.damagePct}%)`).join(' · '),
        })}
      </p>
      {regions.map((region) => (
        <section key={region.id}>
          <h3 className="pixel">{t(region.nameKey)}</h3>
          <div className="beast-grid">
            {regionMonsters(sim.content, region).map((id) => {
              const m = sim.content.monsters.get(id)!;
              const kills = s.bestiary[id] ?? 0;
              const tier = bestiaryTier(s, sim.content, id);
              const next = tiers[tier];
              const known = tier > 0;
              return (
                <div
                  key={id}
                  className={`beast${known ? ' known' : ''}`}
                  data-testid={`beast-${id}`}
                >
                  <span className={`beast-art${kills > 0 ? '' : ' beast-unknown'}`}>
                    <MonsterSprite monster={m} />
                  </span>
                  <div className="beast-body">
                    <div className="pixel">{known || kills > 0 ? t(m.nameKey) : '???'}</div>
                    <div className="tone-xp" aria-label={t('journal.tier', { n: tier })}>
                      {'★'.repeat(tier)}
                      <span className="muted">{'☆'.repeat(tiers.length - tier)}</span>
                    </div>
                    <div className="small">
                      {t('journal.kills', { n: formatNumber(kills) })}
                      {next &&
                        ` · ${t('journal.next', { n: formatNumber(tierKills(next, !!m.boss)) })}`}
                    </div>
                    {known && (
                      <div className="small muted">
                        {t('journal.beastStats', {
                          level: m.level,
                          hp: formatNumber(m.hp),
                          xp: formatNumber(m.xp),
                        })}
                      </div>
                    )}
                    {tier > 0 && (
                      <div className="small tone-good">
                        {t('journal.bonus', { n: bestiaryDamagePct(s, sim.content, id) })}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </>
  );
}

function Pets() {
  const sim = useSim();
  const hero = sim.state.hero;
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <p className="muted small">{t('pets.hint')}</p>
      {error && <p className="tone-bad">{error}</p>}
      <div className="beast-grid">
        {[...sim.content.pets.values()].map((pet) => {
          const stars = hero.pets[pet.id] ?? 0;
          const active = hero.activePet === pet.id;
          const boss = sim.content.monsters.get(pet.bossId)!;
          return (
            <div
              key={pet.id}
              className={`beast${stars > 0 ? ' known' : ''}${active ? ' pet-active' : ''}`}
              data-testid={`pet-${pet.id}`}
            >
              <span className={`beast-art${stars > 0 ? '' : ' beast-unknown'}`}>
                <MonsterSprite monster={{ ...boss, sprite: { ...pet.sprite, scale: 1 } }} />
              </span>
              <div className="beast-body">
                <div className="pixel">{stars > 0 ? t(pet.nameKey) : '???'}</div>
                <div className="tone-xp">
                  {'★'.repeat(stars)}
                  <span className="muted">{'☆'.repeat(pet.maxStars - stars)}</span>
                </div>
                <div className="small">
                  {t('pets.bonus', {
                    bonus: t(`stat.${pet.bonus.stat}`, { value: pet.bonus.value }),
                  })}
                </div>
                <div className="small muted">{t('pets.from', { boss: t(boss.nameKey) })}</div>
                {stars > 0 && (
                  <button
                    type="button"
                    className="btn btn-small"
                    disabled={active}
                    onClick={() => setError(tryIntent(() => sim.setActivePet(pet.id)))}
                  >
                    {active ? t('pets.active') : t('pets.activate')}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {hero.activePet && (
        <button type="button" className="btn wide" onClick={() => sim.setActivePet(null)}>
          {t('pets.dismiss')}
        </button>
      )}
    </>
  );
}

function Collection() {
  const sim = useSim();
  const hero = sim.state.hero;
  const points = collectionPoints(hero);
  const mods = collectionMods(hero);
  return (
    <>
      <p className="muted small">
        {t('journal.collectionHint', {
          damage: COLLECTION_POINTS_PER_DAMAGE_PCT,
          mf: COLLECTION_POINTS_PER_MAGIC_FIND_PCT,
        })}
      </p>
      <p className="pixel" data-testid="collection-summary">
        {t('journal.collectionSummary', {
          points,
          max: collectionMaxPoints(sim.content),
          damage: mods.damagePct ?? 0,
          mf: mods.magicFindPct ?? 0,
        })}
      </p>
      <div className="coll-grid">
        {[...sim.content.itemBases.values()].map((b) => {
          const r = hero.collection[b.id];
          return (
            <span
              key={b.id}
              className={`coll-cell${r ? ' have' : ''}`}
              style={r ? { borderColor: RARITY_COLOR[r] } : undefined}
              title={`${t(b.nameKey)}${r ? ` · ${t(`rarity.${r}`)}` : ''}`}
            >
              <PixelIcon name={`item.${b.id}`} size={28} />
            </span>
          );
        })}
      </div>
      <h3 className="pixel">{t('journal.sets')}</h3>
      {[...sim.content.itemSets.values()].map((set) => {
        const n = equippedSetPieces(hero)[set.id] ?? 0;
        return (
          <section key={set.id} className="set-entry">
            <div className="pixel">
              {t('item.set', { name: t(set.nameKey), n, max: set.slots.length })}
            </div>
            <div className="muted small">
              {t('journal.setRegion', {
                region: t(sim.content.regions.get(set.regionId)!.nameKey),
              })}
            </div>
            {set.bonuses.map((b) => (
              <div
                key={`${b.pieces}${b.stat}`}
                className={n >= b.pieces ? 'tone-good small' : 'small'}
              >
                {t('item.setBonus', {
                  pieces: b.pieces,
                  bonus: t(`stat.${b.stat}`, { value: b.value }),
                })}
              </div>
            ))}
          </section>
        );
      })}
    </>
  );
}

function Stats() {
  const sim = useSim();
  const s = sim.state;
  const l = s.lifetime;
  const rows: [string, string][] = [
    [t('journal.stat.time'), formatDuration(s.tick / TICKS_PER_HOUR)],
    [t('journal.stat.kills'), formatNumber(l.kills)],
    [t('journal.stat.bosses'), formatNumber(l.bossKills)],
    [t('journal.stat.deaths'), formatNumber(l.deaths)],
    [t('journal.stat.xp'), formatNumber(l.xpEarned)],
    [t('journal.stat.gold'), formatNumber(l.goldEarned)],
    [t('journal.stat.resets'), formatNumber(s.hero.resets.count)],
    [
      t('journal.stat.cards'),
      `${Object.values(s.hero.cards).filter((n) => n > 0).length} / ${sim.content.cards.size}`,
    ],
    [
      t('journal.stat.bestiary'),
      `${[...sim.content.monsters.keys()].filter((id) => bestiaryTier(s, sim.content, id) > 0).length} / ${sim.content.monsters.size}`,
    ],
    [t('journal.stat.login'), formatNumber(s.login.claimed)],
    [t('journal.stat.points'), formatNumber(achievementPoints(s, sim.content))],
  ];
  return (
    <>
      <XpChart />
      <dl className="stat-table" data-testid="journal-stats">
        {rows.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      <h3 className="pixel">{t('journal.stat.items')}</h3>
      <dl className="stat-table">
        {RARITY_ORDER.map((r) => (
          <div key={r}>
            <dt style={{ color: RARITY_COLOR[r] }}>
              <span aria-hidden>{RARITY_GLYPH[r]} </span>
              {t(`rarity.${r}`)}
            </dt>
            <dd>{formatNumber(l.itemsByRarity[r])}</dd>
          </div>
        ))}
      </dl>
      {sim.rates && (
        <>
          <h3 className="pixel">{t('journal.stat.now')}</h3>
          <dl className="stat-table">
            <div>
              <dt>{t('journal.stat.xpPerHour')}</dt>
              <dd>{formatNumber(Math.round(sim.rates.xpPerHour))}</dd>
            </div>
            <div>
              <dt>{t('journal.stat.goldPerHour')}</dt>
              <dd>{formatNumber(Math.round(sim.rates.goldPerHour))}</dd>
            </div>
            <div>
              <dt>{t('journal.stat.killsPerHour')}</dt>
              <dd>{formatNumber(Math.round(sim.rates.killsPerHour))}</dd>
            </div>
          </dl>
        </>
      )}
    </>
  );
}

/** Journal: achievements and titles, the bestiary and lifetime statistics (GDD 3.4, 6.4, 9). */
export function JournalScreen() {
  const [tab, setTab] = useState<Tab>('achievements');
  return (
    <Sheet title={t('screen.journal')} testId="journal">
      <div className="tabs" role="tablist">
        {TABS.map((x) => (
          <button
            key={x}
            type="button"
            role="tab"
            aria-selected={tab === x}
            className={`tab${tab === x ? ' active' : ''}`}
            data-testid={`journal-tab-${x}`}
            onClick={() => setTab(x)}
          >
            {t(`journal.tab.${x}`)}
          </button>
        ))}
      </div>
      {tab === 'achievements' && <Achievements />}
      {tab === 'bestiary' && <Bestiary />}
      {tab === 'pets' && <Pets />}
      {tab === 'collection' && <Collection />}
      {tab === 'stats' && <Stats />}
    </Sheet>
  );
}
