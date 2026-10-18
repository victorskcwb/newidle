import {
  MAX_LEVEL,
  TICKS_PER_SECOND,
  backpackSize,
  claimableQuests,
  potionHoursLeft,
  shopUnlocked,
  type TargetPriority,
} from '@abismo/engine';
import type { Rarity } from '@abismo/content';
import { formatDuration, formatNumber, t } from '../i18n.ts';
import { ZOOM_LEVELS } from '../scene/GameScene.ts';
import { useUi, type Screen } from '../state/store.ts';
import { Icon } from './Icon.tsx';
import { PixelIcon } from './PixelIcon.tsx';
import { HeroSprite } from './SheetSprite.tsx';
import { useSim } from './useSim.ts';

function Bar({
  value,
  max,
  kind,
  label,
  icon,
}: {
  value: number;
  max: number;
  kind: 'hp' | 'mana' | 'xp';
  label: string;
  icon: string;
}) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div className="bar-row">
      <Icon name={icon} size={14} className={`tone-${kind}`} />
      <div
        className={`bar bar-${kind}`}
        role="meter"
        aria-label={label}
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={max}
      >
        <div className="bar-fill" style={{ width: `${pct}%` }} />
        <span className="bar-text">
          {formatNumber(value)} / {formatNumber(max)}
        </span>
      </div>
    </div>
  );
}

/** Top left: animated portrait with the level, name and the three bars. */
function HeroPanel() {
  const sim = useSim();
  const p = useUi((s) => s.presented);
  const openScreen = useUi((s) => s.openScreen);
  if (!p) return null;
  const hero = sim.state.hero;
  const title = sim.state.achievements.title;
  const titleKey = title ? sim.content.achievements.get(title)?.titleKey : undefined;
  return (
    <section className="glass hero-panel" aria-label={hero.name}>
      <button
        type="button"
        className="portrait"
        onClick={() => openScreen('character')}
        aria-label={t('screen.character')}
      >
        <span className="portrait-art">
          <HeroSprite outfit={hero.appearance.outfit} scale={1} />
        </span>
        <span className="portrait-level pixel">{p.level}</span>
      </button>
      <div className="hero-bars">
        <div className="hero-name">
          <span className="pixel">{hero.name}</span>
          {titleKey && (
            <span className="hero-title small" data-testid="hero-title">
              {t(titleKey)}
            </span>
          )}
          {hero.meal && (
            <span
              className="meal-chip"
              data-testid="meal-chip"
              title={t('meal.now', {
                meal: t(sim.content.consumables.get(hero.meal.mealId)?.nameKey ?? ''),
                minutes: Math.ceil(hero.meal.ticksLeft / 600),
              })}
            >
              <PixelIcon name={`consumable.${hero.meal.mealId}`} size={14} />
            </span>
          )}
          <span className="muted small" data-testid="hero-level">
            {t('hud.level', { level: p.level })}
          </span>
        </div>
        <Bar value={p.hp} max={p.maxHp} kind="hp" label={t('hud.hp')} icon="hp" />
        <Bar value={p.mana} max={p.maxMana} kind="mana" label={t('hud.mana')} icon="mana" />
        {p.xpToNext > 0 ? (
          <Bar value={p.xp} max={p.xpToNext} kind="xp" label={t('hud.xp')} icon="xp" />
        ) : (
          <div className="bar-row">
            <Icon name="xp" size={14} className="tone-xp" />
            <div className="bar bar-xp" aria-label={t('hud.xp')}>
              <div className="bar-fill" style={{ width: '100%' }} />
              <span className="bar-text">{t('hud.maxLevel')}</span>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

/** Top right, under the menu: the hunt with its rates and the town/hunt action. */
function HuntPanel() {
  const sim = useSim();
  const p = useUi((s) => s.presented);
  const s = sim.state;
  const hunt = s.hunt ? sim.content.hunts.get(s.hunt.huntId) : undefined;
  const hunting = s.activity.kind !== 'idle_town';
  const openScreen = useUi((u) => u.openScreen);
  const rates = sim.rates;
  const potionId = s.settings.hpPotionId;
  const potionHours = rates
    ? potionHoursLeft(rates, potionId, {
        stock: s.consumables[potionId] ?? 0,
        gold: Number(s.gold),
        price: sim.content.consumables.get(potionId)?.price ?? 0,
        autoBuy: s.settings.potionTarget > 0,
      })
    : null;
  return (
    <section className="hunt-panel">
      <div className="glass hunt-card">
        {hunt && (
          <button
            type="button"
            className="link pixel hunt-name"
            onClick={() => openScreen('hunts')}
            data-testid="hunt-name"
          >
            <Icon name="hunts" size={16} />
            <span>{t(hunt.nameKey)}</span>
            <span aria-hidden>▾</span>
          </button>
        )}
        <div className="muted activity">{t(`activity.${p?.activity ?? s.activity.kind}`)}</div>
        <div className="rates" data-testid="rates">
          {hunt && rates
            ? `${t('rates.summary', {
                kills: formatNumber(rates.killsPerHour),
                xp: formatNumber(rates.xpPerHour),
                gold: formatNumber(rates.goldPerHour),
              })} · ${potionHours === null ? t('rates.potionsSustained') : t('rates.potionsLast', { time: formatDuration(potionHours) })}`
            : hunt
              ? t('rates.calculating')
              : null}
        </div>
        {hunting ? (
          <button type="button" className="btn btn-small" onClick={() => sim.returnToTown()}>
            <Icon name="town" size={16} />
            {t('action.returnTown')}
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-small btn-primary"
            onClick={() => hunt && sim.startHunt(hunt.id)}
          >
            <Icon name="hunt" size={16} />
            {t('action.hunt')}
          </button>
        )}
      </div>
    </section>
  );
}

function BossBar() {
  const boss = useUi((u) => u.boss);
  if (!boss) return null;
  const pct = Math.max(0, (boss.hp / boss.maxHp) * 100);
  return (
    <section
      className="glass boss-bar"
      role="meter"
      aria-label={boss.name}
      aria-valuenow={boss.hp}
      aria-valuemax={boss.maxHp}
      data-testid="boss-bar"
    >
      <div className="pixel boss-name">{boss.name}</div>
      <div className="bar bar-hp">
        <div className="bar-fill" style={{ width: `${pct}%` }} />
        <span className="bar-text">
          {formatNumber(boss.hp)} / {formatNumber(boss.maxHp)}
        </span>
      </div>
    </section>
  );
}

interface NavEntry {
  screen: Screen | 'backpack' | 'log';
  icon: string;
  label: string;
  badge?: string | number;
  active?: boolean;
}

function NavButton({ entry }: { entry: NavEntry }) {
  const openScreen = useUi((s) => s.openScreen);
  const toggleBackpack = useUi((s) => s.toggleBackpack);
  const toggleLogWindow = useUi((s) => s.toggleLogWindow);
  return (
    <button
      type="button"
      className={`top-btn${entry.active ? ' active' : ''}`}
      onClick={() =>
        entry.screen === 'backpack'
          ? toggleBackpack()
          : entry.screen === 'log'
            ? toggleLogWindow()
            : openScreen(entry.screen)
      }
      aria-label={entry.label}
      title={entry.label}
      data-testid={entry.screen === 'backpack' ? 'backpack-button' : `nav-${entry.screen}`}
    >
      <Icon name={entry.icon} size={22} />
      <span className="top-label">{entry.label}</span>
      {entry.badge !== undefined && <span className="badge">{entry.badge}</span>}
    </button>
  );
}

/**
 * The menu across the top, as in MMO-style idle games: resources on the left, every screen
 * one tap away in the middle (with a badge when something waits there), options last.
 */
function TopBar() {
  const sim = useSim();
  const p = useUi((s) => s.presented);
  const backpackOpen = useUi((s) => s.backpackOpen);
  const logWindow = useUi((s) => s.logWindow);
  const s = sim.state;
  const hero = s.hero;
  const claimable = claimableQuests(s) + (sim.loginDue() ? 1 : 0);
  const size = backpackSize(hero, sim.content);
  const altarBadge =
    hero.level >= MAX_LEVEL
      ? '!'
      : shopUnlocked(hero) && hero.resets.points > 0
        ? hero.resets.points
        : undefined;
  const entries: NavEntry[] = [
    {
      screen: 'character',
      icon: 'character',
      label: t('screen.character'),
      badge: hero.unspentAttributePoints || undefined,
    },
    {
      screen: 'skills',
      icon: 'skills',
      label: t('screen.skills'),
      badge: hero.unspentSkillPoints || undefined,
    },
    {
      screen: 'backpack',
      icon: 'backpack',
      label: `${t('top.inventory')} ${s.backpack.length}/${size}`,
      badge: s.backpack.length >= size ? '!' : undefined,
      active: backpackOpen,
    },
    { screen: 'hunts', icon: 'hunts', label: t('top.hunts') },
    { screen: 'quests', icon: 'quests', label: t('top.quests'), badge: claimable || undefined },
    { screen: 'cards', icon: 'cards', label: t('screen.cards') },
    { screen: 'journal', icon: 'journal', label: t('screen.journal') },
    { screen: 'professions', icon: 'professions', label: t('screen.professions') },
    { screen: 'smith', icon: 'smith', label: t('screen.smith') },
    { screen: 'altar', icon: 'altar', label: t('screen.altar'), badge: altarBadge },
    { screen: 'filter', icon: 'filter', label: t('top.filter') },
    { screen: 'log', icon: 'log', label: t('top.log'), active: logWindow },
    { screen: 'settings', icon: 'settings', label: t('top.settings') },
  ];
  return (
    <header className="top-bar">
      <div className="top-res">
        <span className="pixel brand">ABISMO</span>
        <span className="res-chip res-gold" data-testid="gold" title={t('hud.gold')}>
          <PixelIcon name="gold" size={16} />
          {formatNumber(p?.gold ?? s.gold)}
        </span>
        <span className="res-chip" title={t('hud.potions', { n: p?.potions ?? 0 })}>
          <PixelIcon name="consumable.potion_hp_small" size={16} />
          <span data-testid="hud-potions">{p?.potions ?? 0}</span>
        </span>
        <span className="res-chip" title={t('hud.resets', { n: hero.resets.count })}>
          <Icon name="resets" size={16} className="tone-info" />
          {hero.resets.count}
        </span>
      </div>
      <nav className="top-nav" aria-label={t('menu.title')}>
        {entries.map((e) => (
          <NavButton key={e.screen} entry={e} />
        ))}
      </nav>
    </header>
  );
}

/**
 * The action bar at the bottom: hunt behaviour (target, auto-sell), the active skills and
 * potions with their cooldowns and stock, and the big HUNT / STOP button.
 */
function ActionBar() {
  const sim = useSim();
  const tick = useUi((u) => u.presented?.tick ?? 0);
  const p = useUi((u) => u.presented);
  const openScreen = useUi((u) => u.openScreen);
  const s = sim.state;
  const c = s.combat;
  const hunting = s.activity.kind !== 'idle_town';
  const behaviour = {
    targetPriority: s.settings.targetPriority,
    autoSellUpTo: s.settings.autoSellUpTo,
  };
  const manaId = s.settings.manaPotionId;
  return (
    <section className="action-bar glass" aria-label={t('actionbar.title')}>
      <div className="ab-settings">
        <label className="ab-field">
          <span>{t('actionbar.target')}</span>
          <select
            className="ab-select"
            value={behaviour.targetPriority}
            onChange={(e) =>
              sim.setHuntBehaviour({
                ...behaviour,
                targetPriority: e.target.value as TargetPriority,
              })
            }
            data-testid="target-priority"
          >
            <option value="first">{t('actionbar.target.first')}</option>
            <option value="weakest">{t('actionbar.target.weakest')}</option>
            <option value="strongest">{t('actionbar.target.strongest')}</option>
          </select>
        </label>
        <label className="ab-field">
          <span>{t('actionbar.autoSell')}</span>
          <select
            className="ab-select"
            value={behaviour.autoSellUpTo ?? 'none'}
            onChange={(e) =>
              sim.setHuntBehaviour({
                ...behaviour,
                autoSellUpTo: e.target.value === 'none' ? null : (e.target.value as Rarity),
              })
            }
            data-testid="auto-sell"
          >
            <option value="none">{t('actionbar.autoSell.none')}</option>
            <option value="common">{t('actionbar.autoSell.common')}</option>
            <option value="magic">{t('actionbar.autoSell.magic')}</option>
            <option value="rare">{t('actionbar.autoSell.rare')}</option>
          </select>
        </label>
      </div>
      <div className="ab-slots">
        {s.hero.activeSkills.map((id, i) => {
          const skill = id ? sim.content.skills.get(id) : undefined;
          const ready = id ? (c.skillReadyTick[id] ?? 0) : 0;
          const total =
            skill?.kind === 'active'
              ? Math.max(1, Math.round(skill.cooldownSeconds * TICKS_PER_SECOND))
              : 1;
          const left = Math.max(0, Math.min(1, (ready - tick) / total));
          return (
            <button
              type="button"
              key={i}
              className={`skill-slot${skill ? '' : ' empty'}`}
              title={skill ? t(skill.nameKey) : t('hud.skillEmpty')}
              aria-label={skill ? t(skill.nameKey) : t('hud.skillEmpty')}
              onClick={() => openScreen('skills')}
              style={left > 0 ? { ['--cd' as string]: `${Math.round(left * 360)}deg` } : undefined}
              data-cooldown={left > 0 ? 'on' : undefined}
            >
              <span className="slot-key">{i + 1}</span>
              {skill && <Icon name={`skill.${skill.id}`} size={24} />}
            </button>
          );
        })}
        <span className="ab-sep" aria-hidden />
        <div className="skill-slot potion-slot" title={t('hud.potions', { n: p?.potions ?? 0 })}>
          <PixelIcon name="consumable.potion_hp_small" size={32} />
          <span className="slot-count">{p?.potions ?? 0}</span>
        </div>
        <div className="skill-slot potion-slot" title={t('consumable.potion_mana_small')}>
          <PixelIcon name="consumable.potion_mana_small" size={32} />
          <span className="slot-count">{s.consumables[manaId] ?? 0}</span>
        </div>
      </div>
      {hunting ? (
        <button
          type="button"
          className="big-btn stop"
          onClick={() => sim.returnToTown()}
          data-testid="stop-button"
        >
          ■ {t('actionbar.stop')}
        </button>
      ) : (
        <button
          type="button"
          className="big-btn go"
          onClick={() => openScreen('hunts')}
          data-testid="hunts-button"
        >
          ⚔ {t('actionbar.hunts')}
        </button>
      )}
    </section>
  );
}

function Zoom() {
  const zoom = useUi((s) => s.zoom);
  const setZoom = useUi((s) => s.setZoom);
  const i = ZOOM_LEVELS.indexOf(zoom as (typeof ZOOM_LEVELS)[number]);
  return (
    <div className="zoom">
      <button
        type="button"
        className="round-btn"
        aria-label={t('action.zoomIn')}
        disabled={i >= ZOOM_LEVELS.length - 1}
        onClick={() => setZoom(ZOOM_LEVELS[i + 1]!)}
      >
        +
      </button>
      <button
        type="button"
        className="round-btn"
        aria-label={t('action.zoomOut')}
        disabled={i <= 0}
        onClick={() => setZoom(ZOOM_LEVELS[i - 1]!)}
      >
        −
      </button>
    </div>
  );
}

export function Hud() {
  return (
    <>
      <TopBar />
      <HeroPanel />
      <HuntPanel />
      <BossBar />
      <Zoom />
      <ActionBar />
    </>
  );
}
