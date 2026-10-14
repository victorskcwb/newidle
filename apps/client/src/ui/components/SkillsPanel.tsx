import { SKILL_IDS, type SkillId } from '@valdren/content';
import {
  actionRates,
  checkAction,
  levelForXp,
  xpForLevel,
  MAX_LEVEL,
  type BlockReason,
} from '@valdren/engine';
import { useState } from 'react';
import { formatNumber, formatXp, t } from '../../i18n.ts';
import { sim, useSlot } from '../../state/store.ts';

export function blockText(reason: BlockReason): string {
  switch (reason.code) {
    case 'levelTooLow':
      return t('ui.requiresLevel', { skill: t(`skill.${reason.skill}`), level: reason.level });
    case 'missingTool':
      return t('ui.requiresTool', { tool: t(`tool.${reason.tool}`) });
    case 'missingItem':
      return t('ui.missingItem', { item: itemName(reason.itemId) });
    default:
      return t(`stop.${reason.code === 'unknownAction' ? 'unknownAction' : 'queueEmpty'}`);
  }
}

export function itemName(itemId: string): string {
  const item = sim.content.items.get(itemId);
  return item ? t(item.nameKey) : itemId;
}

/** Grid of the 21 skills; tapping one lists its actions with requirements, rates and Start. */
export function SkillsPanel() {
  const slot = useSlot();
  const [selected, setSelected] = useState<SkillId>('mining');
  const [refusal, setRefusal] = useState<string | null>(null);
  const actions = sim.content.raw.actions.filter((a) => a.skill === selected);

  return (
    <section className="card" aria-label={t('ui.skills')}>
      <h2 className="card-title">{t('ui.skills')}</h2>
      <div className="skill-grid">
        {SKILL_IDS.map((skill) => {
          const xp = slot.skills.find((s) => s.skill === skill)?.xpTenths ?? 0;
          const level = levelForXp(xp);
          const from = xpForLevel(level);
          const to = level < MAX_LEVEL ? xpForLevel(level + 1) : from + 1;
          const pct = Math.min(100, ((xp - from) / (to - from)) * 100);
          return (
            <button
              key={skill}
              className={`skill ${skill === selected ? 'skill-selected' : ''}`}
              onClick={() => setSelected(skill)}
              aria-pressed={skill === selected}
            >
              <span className="skill-name">{t(`skill.${skill}`)}</span>
              <span className="skill-level">{level}</span>
              <span className="skill-bar">
                <span style={{ width: `${pct}%` }} />
              </span>
            </button>
          );
        })}
      </div>
      {refusal && (
        <p className="blocked" role="alert">
          {refusal}
        </p>
      )}
      <ul className="action-list">
        {actions.map((action) => {
          const block = checkAction(slot, action.id, sim.content);
          const rates = actionRates(slot, action.id, sim.content);
          const running = slot.activity?.actionId === action.id;
          return (
            <li key={action.id} className="action">
              <div className="action-info">
                <strong>{t(action.nameKey)}</strong>
                <span className="muted">
                  {t('ui.levelShort', { level: action.level })}
                  {rates && ` · ${t('ui.xpPerHour', { xp: formatXp(rates.xpTenthsPerHour) })}`}
                  {rates?.outputsPerHour.map((o) => (
                    <span key={o.itemId}>
                      {' · '}
                      {t('ui.itemsPerHour', { qty: formatNumber(o.qty), item: itemName(o.itemId) })}
                    </span>
                  ))}
                </span>
                {action.inputs.length > 0 && (
                  <span className="muted">
                    {t('ui.materials', {
                      list: action.inputs.map((i) => `${i.qty}× ${itemName(i.itemId)}`).join(', '),
                    })}
                  </span>
                )}
                {block && <span className="blocked">{blockText(block)}</span>}
              </div>
              <button
                className="btn"
                disabled={block !== null || running}
                onClick={() =>
                  void sim.startAction(action.id).then((r) => setRefusal(r ? blockText(r) : null))
                }
              >
                {t('ui.start')}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
