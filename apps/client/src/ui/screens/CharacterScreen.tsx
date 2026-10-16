import { EQUIPMENT_SLOTS } from '@abismo/content';
import {
  ATTRIBUTES,
  baseAttributes,
  heroStats,
  type Attribute,
  type AutoAllocateProfile,
} from '@abismo/engine';
import { useState } from 'react';
import { formatNumber, t } from '../../i18n.ts';
import { useUi } from '../../state/store.ts';
import { ItemCard, ItemCell } from '../BackpackPanel.tsx';
import { Sheet, tryIntent } from '../Sheet.tsx';
import { useSim } from '../useSim.ts';

const PROFILES: AutoAllocateProfile[] = ['off', 'balanced', 'strength', 'vitality'];

/** Equipment in the 10 slots, attributes and their distribution, derived stats. */
export function CharacterScreen() {
  const sim = useSim();
  const { selectedUid, select } = useUi();
  const [error, setError] = useState<string | null>(null);
  const hero = sim.state.hero;
  const stats = heroStats(hero, sim.content);
  const base = baseAttributes(hero, sim.content);
  const selected = Object.values(hero.equipment).find((i) => i?.uid === selectedUid);

  const allocate = (attribute: Attribute, n: number) =>
    setError(tryIntent(() => sim.allocate(attribute, Math.min(n, hero.unspentAttributePoints))));

  const derived: [string, string][] = [
    [t('stat.label.maxHp'), formatNumber(stats.maxHp)],
    [t('stat.label.maxMana'), formatNumber(stats.maxMana)],
    [t('stat.label.damage'), `${formatNumber(stats.damageMin)}–${formatNumber(stats.damageMax)}`],
    [
      t('stat.label.attackSpeed'),
      (10 / stats.attackIntervalTicks).toLocaleString('pt-BR', { maximumFractionDigits: 2 }),
    ],
    [t('stat.label.accuracy'), formatNumber(stats.accuracy)],
    [t('stat.label.evasion'), formatNumber(stats.evasion)],
    [t('stat.label.defense'), formatNumber(stats.defense)],
    [t('stat.label.crit'), `${(stats.critChancePpm / 10_000).toLocaleString('pt-BR')}%`],
    [t('stat.label.critDamage'), `${stats.critDamagePct}%`],
    [t('stat.label.leech'), `${stats.lifeLeechPct}%`],
    [t('stat.label.xp'), `+${stats.xpPct}%`],
    [t('stat.label.gold'), `+${stats.goldPct}%`],
    [t('stat.label.magicFind'), `+${stats.magicFindPct}%`],
  ];

  return (
    <Sheet title={t('screen.character')} testId="character">
      <div className="equipment">
        {EQUIPMENT_SLOTS.map((slot) => {
          const item = hero.equipment[slot];
          const inactive = stats.inactiveSlots.includes(slot);
          return item ? (
            <div key={slot} className={inactive ? 'inactive-slot' : undefined}>
              <ItemCell
                item={item}
                selected={item.uid === selectedUid}
                onSelect={() => select(item.uid)}
              />
            </div>
          ) : (
            <div key={slot} className="cell empty" title={t('backpack.nothingEquipped')}>
              <span className="slot-abbr">{t(`slot.${slot}`).slice(0, 3)}</span>
            </div>
          );
        })}
      </div>
      {selected && (
        <ItemCard
          item={selected}
          equipped
          onUnequip={() => {
            const slot = sim.content.itemBases.get(selected.baseId)!.slot;
            setError(tryIntent(() => sim.unequip(slot)));
            select(null);
          }}
        />
      )}

      <h3 className="pixel">
        {t('character.attributes')}{' '}
        <span
          className={hero.unspentAttributePoints > 0 ? 'tone-good' : 'muted'}
          data-testid="unspent-points"
        >
          {t('character.points', { n: hero.unspentAttributePoints })}
        </span>
      </h3>
      <div className="attr-list">
        {ATTRIBUTES.map((a) => (
          <div key={a} className="attr-row">
            <span>{t(`attribute.${a}`)}</span>
            <span className="pixel" title={t('character.base', { n: base[a] })}>
              {stats.attributes[a]}
            </span>
            <span className="muted small">{t(`attribute.${a}.effect`)}</span>
            <button
              type="button"
              className="btn icon"
              disabled={hero.unspentAttributePoints < 1}
              onClick={() => allocate(a, 1)}
              aria-label={`+1 ${t(`attribute.${a}`)}`}
              data-testid={`add-${a}`}
            >
              +1
            </button>
            <button
              type="button"
              className="btn icon"
              disabled={hero.unspentAttributePoints < 1}
              onClick={() => allocate(a, 5)}
              aria-label={`+5 ${t(`attribute.${a}`)}`}
            >
              +5
            </button>
          </div>
        ))}
      </div>
      <label className="field inline">
        <span>{t('character.auto')}</span>
        <select
          className="input"
          value={hero.autoAllocate}
          onChange={(e) => sim.setAutoAllocate(e.target.value as AutoAllocateProfile)}
          data-testid="auto-profile"
        >
          {PROFILES.map((p) => (
            <option key={p} value={p}>
              {t(`profile.${p}`)}
            </option>
          ))}
        </select>
      </label>
      {error && <p className="tone-bad">{error}</p>}

      <h3 className="pixel">{t('character.stats')}</h3>
      <dl className="stat-list">
        {derived.map(([k, v]) => (
          <div key={k}>
            <dt className="muted">{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
    </Sheet>
  );
}
