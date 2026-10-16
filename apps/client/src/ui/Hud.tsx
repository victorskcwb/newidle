import { TICKS_PER_SECOND, backpackSize, claimableQuests, potionHoursLeft } from '@abismo/engine';
import { formatDuration, formatNumber, t } from '../i18n.ts';
import { ZOOM_LEVELS } from '../scene/GameScene.ts';
import { useUi } from '../state/store.ts';
import { useSim } from './useSim.ts';

function Bar({
  value,
  max,
  kind,
  label,
}: {
  value: number;
  max: number;
  kind: 'hp' | 'mana' | 'xp';
  label: string;
}) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
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
  );
}

function HeroPanel() {
  const sim = useSim();
  const p = useUi((s) => s.presented);
  if (!p) return null;
  return (
    <section className="panel hero-panel" aria-label={sim.state.hero.name}>
      <div className="portrait" aria-hidden>
        <span>{p.level}</span>
      </div>
      <div className="hero-bars">
        <div className="hero-name">
          <span className="pixel">{sim.state.hero.name}</span>
          <span className="muted" data-testid="hero-level">
            {t('hud.level', { level: p.level })}
          </span>
        </div>
        <Bar value={p.hp} max={p.maxHp} kind="hp" label={t('hud.hp')} />
        <Bar value={p.mana} max={p.maxMana} kind="mana" label={t('hud.mana')} />
        {p.xpToNext > 0 ? (
          <Bar value={p.xp} max={p.xpToNext} kind="xp" label={t('hud.xp')} />
        ) : (
          <div className="bar bar-xp" aria-label={t('hud.xp')}>
            <div className="bar-fill" style={{ width: '100%' }} />
            <span className="bar-text">{t('hud.maxLevel')}</span>
          </div>
        )}
      </div>
    </section>
  );
}

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
    <section className="panel hunt-panel">
      <div className="hunt-top">
        <span className="gold" data-testid="gold">
          <span aria-hidden>◉ </span>
          {formatNumber(p?.gold ?? s.gold)}
        </span>
        <span className="muted">{t('hud.resets', { n: s.hero.resets.count })}</span>
      </div>
      {hunt && (
        <button
          type="button"
          className="link pixel hunt-name"
          onClick={() => openScreen('hunts')}
          data-testid="hunt-name"
        >
          {t(hunt.nameKey)} ▾
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
      <div className="row">
        <span className="muted">{t('hud.potions', { n: p?.potions ?? 0 })}</span>
        {hunting ? (
          <button type="button" className="btn" onClick={() => sim.returnToTown()}>
            {t('action.returnTown')}
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => hunt && sim.startHunt(hunt.id)}
          >
            {t('action.hunt')}
          </button>
        )}
      </div>
    </section>
  );
}

function SkillBar() {
  const sim = useSim();
  const tick = useUi((u) => u.presented?.tick ?? 0);
  const c = sim.state.combat;
  return (
    <section className="skill-bar" aria-label={t('screen.skills')}>
      {sim.state.hero.activeSkills.map((id, i) => {
        const skill = id ? sim.content.skills.get(id) : undefined;
        const ready = id ? (c.skillReadyTick[id] ?? 0) : 0;
        const total =
          skill?.kind === 'active'
            ? Math.max(1, Math.round(skill.cooldownSeconds * TICKS_PER_SECOND))
            : 1;
        const left = Math.max(0, Math.min(1, (ready - tick) / total));
        return (
          <div
            key={i}
            className="skill-slot"
            title={skill ? t(skill.nameKey) : t('hud.skillEmpty')}
            style={left > 0 ? { ['--cd' as string]: `${Math.round(left * 360)}deg` } : undefined}
            data-cooldown={left > 0 ? 'on' : undefined}
          >
            {skill ? t(skill.nameKey).slice(0, 2) : ''}
          </div>
        );
      })}
    </section>
  );
}

function BossBar() {
  const boss = useUi((u) => u.boss);
  if (!boss) return null;
  const pct = Math.max(0, (boss.hp / boss.maxHp) * 100);
  return (
    <section
      className="panel boss-bar"
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

function Corner() {
  const sim = useSim();
  const zoom = useUi((s) => s.zoom);
  const setZoom = useUi((s) => s.setZoom);
  const openBackpack = useUi((s) => s.openBackpack);
  const openScreen = useUi((s) => s.openScreen);
  const hero = sim.state.hero;
  const i = ZOOM_LEVELS.indexOf(zoom as (typeof ZOOM_LEVELS)[number]);
  return (
    <nav className="corner">
      <div className="zoom">
        <button
          type="button"
          className="btn icon"
          aria-label={t('action.zoomOut')}
          disabled={i <= 0}
          onClick={() => setZoom(ZOOM_LEVELS[i - 1]!)}
        >
          −
        </button>
        <button
          type="button"
          className="btn icon"
          aria-label={t('action.zoomIn')}
          disabled={i >= ZOOM_LEVELS.length - 1}
          onClick={() => setZoom(ZOOM_LEVELS[i + 1]!)}
        >
          +
        </button>
      </div>
      <button
        type="button"
        className="btn"
        onClick={() => openScreen('character')}
        data-testid="character-button"
      >
        {t('action.character')}
        {hero.unspentAttributePoints > 0 && (
          <span className="badge">{hero.unspentAttributePoints}</span>
        )}
      </button>
      <button
        type="button"
        className="btn"
        onClick={() => openScreen('menu')}
        data-testid="menu-button"
      >
        {t('action.menu')}
        {hero.unspentSkillPoints + claimableQuests(sim.state) > 0 && (
          <span className="badge">{hero.unspentSkillPoints + claimableQuests(sim.state)}</span>
        )}
      </button>
      <button
        type="button"
        className="btn btn-primary backpack-btn"
        data-testid="backpack-button"
        onClick={() => openBackpack(true)}
      >
        {t('action.backpack')}{' '}
        <span className="count">
          {t('backpack.count', {
            n: sim.state.backpack.length,
            max: backpackSize(hero, sim.content),
          })}
        </span>
      </button>
    </nav>
  );
}

export function Hud() {
  return (
    <>
      <HeroPanel />
      <HuntPanel />
      <SkillBar />
      <BossBar />
      <Corner />
    </>
  );
}
