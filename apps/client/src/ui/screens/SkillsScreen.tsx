import type { Skill } from '@abismo/content';
import { learnBlock, respecCost, type LearnBlock } from '@abismo/engine';
import { useState } from 'react';
import { formatNumber, t } from '../../i18n.ts';
import { Sheet, tryIntent } from '../Sheet.tsx';
import { useSim } from '../useSim.ts';
import { Icon } from '../Icon.tsx';

function blockText(
  block: LearnBlock,
  skills: Map<string, Skill> | ReadonlyMap<string, Skill>,
): string {
  if (block.kind === 'requires') {
    const req = skills.get(block.skillId);
    return t('skills.requires', {
      skill: req ? t(req.nameKey) : block.skillId,
      level: block.level,
    });
  }
  return t(`skills.block.${block.kind}`);
}

/** Effect of a skill at a level, for the node card. */
function effectText(skill: Skill, level: number): string {
  if (skill.kind === 'passive')
    return t(skill.descKey, { value: skill.perLevel * Math.max(1, level) });
  const l = Math.max(1, level);
  const parts = [t(skill.descKey)];
  if (skill.damagePct > 0)
    parts.push(t('skills.damage', { pct: skill.damagePct + skill.damagePctPerLevel * (l - 1) }));
  if (skill.buff)
    parts.push(
      t('skills.buff', {
        pct: skill.buff.value + skill.buff.perLevel * (l - 1),
        s: skill.buff.durationSeconds,
      }),
    );
  if (skill.maxTargets > 1) parts.push(t('skills.targets', { n: skill.maxTargets }));
  parts.push(
    t('skills.cost', {
      mana: skill.manaCost + skill.manaCostPerLevel * (l - 1),
      s: skill.cooldownSeconds,
    }),
  );
  return parts.join(' · ');
}

/**
 * Warrior tree (section 5.4): learn with points, choose the active skills and their order
 * (slot 1 is tried first), redistribute for gold (free after a reset).
 */
export function SkillsScreen() {
  const sim = useSim();
  const hero = sim.state.hero;
  const [slot, setSlot] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const tree = [...sim.content.skills.values()].filter((s) => s.classId === hero.classId);
  const rows = Math.max(...tree.map((s) => s.position.row)) + 1;
  const cost = respecCost(hero);
  const learnedActives = tree.filter(
    (s) => s.kind === 'active' && (hero.skillLevels[s.id] ?? 0) > 0,
  );

  return (
    <Sheet title={t('screen.skills')} testId="skills">
      <div className="row">
        <span
          className={hero.unspentSkillPoints > 0 ? 'tone-good pixel' : 'muted'}
          data-testid="skill-points"
        >
          {t('skills.points', { n: hero.unspentSkillPoints })}
        </span>
        <button
          type="button"
          className="btn"
          disabled={Object.keys(hero.skillLevels).length === 0 || sim.state.gold < cost}
          onClick={() => setError(tryIntent(() => sim.respecSkills()))}
        >
          {cost === 0n ? t('skills.respecFree') : t('skills.respec', { gold: formatNumber(cost) })}
        </button>
      </div>

      <h3 className="pixel">{t('skills.slots')}</h3>
      <p className="muted small">{t('skills.slotsHint')}</p>
      <div className="slots">
        {hero.activeSkills.map((id, i) => {
          const skill = id ? sim.content.skills.get(id) : undefined;
          return (
            <button
              key={i}
              type="button"
              className={`btn slot${slot === i ? ' selected' : ''}`}
              onClick={() => setSlot(slot === i ? null : i)}
              data-testid={`slot-${i}`}
            >
              <span className="muted">{i + 1}.</span>{' '}
              {skill ? t(skill.nameKey) : t('skills.emptySlot')}
            </button>
          );
        })}
      </div>
      {slot !== null && (
        <div className="slot-picker">
          {learnedActives.map((s) => (
            <button
              key={s.id}
              type="button"
              className="btn"
              onClick={() => {
                setError(tryIntent(() => sim.setActiveSkill(slot, s.id)));
                setSlot(null);
              }}
            >
              {t(s.nameKey)}
            </button>
          ))}
          <button
            type="button"
            className="btn"
            onClick={() => {
              setError(tryIntent(() => sim.setActiveSkill(slot, null)));
              setSlot(null);
            }}
          >
            {t('skills.clearSlot')}
          </button>
          {learnedActives.length === 0 && <span className="muted">{t('skills.noActives')}</span>}
        </div>
      )}
      {error && <p className="tone-bad">{error}</p>}

      <h3 className="pixel">{t(`skills.tree.${hero.classId}`)}</h3>
      <div className="tree" style={{ gridTemplateRows: `repeat(${rows}, auto)` }}>
        {tree.map((skill) => {
          const level = hero.skillLevels[skill.id] ?? 0;
          const block = learnBlock(hero, skill);
          return (
            <div
              key={skill.id}
              className={`node${level > 0 ? ' learned' : ''}${skill.kind === 'active' ? ' active-skill' : ''}`}
              style={{ gridRow: skill.position.row + 1, gridColumn: skill.position.col + 1 }}
              data-testid={`node-${skill.id}`}
            >
              <div className="node-head">
                <Icon name={`skill.${skill.id}`} size={28} className="node-icon" />
                <span className="pixel">{t(skill.nameKey)}</span>
                <span className="muted small">
                  {level}/{skill.maxLevel}
                </span>
              </div>
              <div className="muted small">{t(`skills.kind.${skill.kind}`)}</div>
              <div className="small">{effectText(skill, level)}</div>
              {block && block.kind !== 'no_points' && block.kind !== 'max_level' && (
                <div className="tone-bad small">{blockText(block, sim.content.skills)}</div>
              )}
              <button
                type="button"
                className="btn"
                disabled={block !== null}
                onClick={() => setError(tryIntent(() => sim.learnSkill(skill.id)))}
                aria-label={t('skills.learn', { skill: t(skill.nameKey) })}
              >
                +
              </button>
            </div>
          );
        })}
      </div>
    </Sheet>
  );
}
