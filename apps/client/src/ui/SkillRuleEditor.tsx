import type { Skill } from '@abismo/content';
import { MAX_RULE_CONDITIONS, type RuleCondition, type SkillRule } from '@abismo/engine';
import { useState } from 'react';
import { t } from '../i18n.ts';
import { tryIntent } from './Sheet.tsx';
import { useSim } from './useSim.ts';

type Kind = RuleCondition['kind'];
const KINDS: readonly Kind[] = ['hero_hp', 'hero_mana', 'target_hp', 'enemies', 'target'];

/** A new condition of a kind, with sensible starting values. */
function freshCondition(kind: Kind): RuleCondition {
  if (kind === 'enemies') return { kind, op: 'at_least', count: 3 };
  if (kind === 'target') return { kind, is: 'boss' };
  return { kind, op: 'below', pct: 50 };
}

/** Ready-made rules for the usual cases. */
const PRESETS: readonly { key: string; rule: SkillRule }[] = [
  {
    key: 'rules.preset.bosses',
    rule: { logic: 'any', conditions: [{ kind: 'target', is: 'boss' }] },
  },
  {
    key: 'rules.preset.strong',
    rule: {
      logic: 'any',
      conditions: [
        { kind: 'target', is: 'boss' },
        { kind: 'target', is: 'elite' },
      ],
    },
  },
  {
    key: 'rules.preset.crowd',
    rule: { logic: 'all', conditions: [{ kind: 'enemies', op: 'at_least', count: 3 }] },
  },
  {
    key: 'rules.preset.lowLife',
    rule: { logic: 'all', conditions: [{ kind: 'hero_hp', op: 'below', pct: 50 }] },
  },
  {
    key: 'rules.preset.saveMana',
    rule: { logic: 'all', conditions: [{ kind: 'hero_mana', op: 'above', pct: 40 }] },
  },
];

/** One condition in words, e.g. "vida do herói abaixo de 50%". */
export function conditionText(c: RuleCondition): string {
  if (c.kind === 'enemies') return t(`rules.enemies.${c.op}`, { n: c.count });
  if (c.kind === 'target') return t(`rules.target.${c.is}`);
  return t(`rules.${c.kind}.${c.op}`, { pct: c.pct });
}

/** The whole rule in one line, or "always" when there is none. */
export function ruleText(rule: SkillRule | undefined): string {
  if (!rule || rule.conditions.length === 0) return t('rules.always');
  const joiner = rule.logic === 'all' ? t('rules.and') : t('rules.or');
  return t('rules.only', { when: rule.conditions.map(conditionText).join(` ${joiner} `) });
}

/**
 * When one active skill may be used (decision 169): a one-line summary and, when opened, an
 * editor with up to three conditions joined by "and" or "or", plus ready-made presets.
 */
export function SkillRuleEditor({ skill }: { skill: Skill }) {
  const sim = useSim();
  const saved = sim.state.settings.skillRules[skill.id];
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<SkillRule>(saved ?? { logic: 'all', conditions: [] });
  const [error, setError] = useState<string | null>(null);

  const save = (rule: SkillRule | null) => {
    const err = tryIntent(() => sim.setSkillRule(skill.id, rule));
    setError(err);
    if (!err) setOpen(false);
  };
  const setCondition = (i: number, c: RuleCondition) =>
    setDraft({ ...draft, conditions: draft.conditions.map((x, j) => (j === i ? c : x)) });

  return (
    <div className="skill-rule" data-testid={`rule-${skill.id}`}>
      <div className="skill-rule-head">
        <span className="pixel">{t(skill.nameKey)}</span>
        <span className={`small${saved ? '' : ' muted'}`}>{ruleText(saved)}</span>
        <button
          type="button"
          className="btn btn-small"
          onClick={() => {
            setDraft(saved ?? { logic: 'all', conditions: [] });
            setError(null);
            setOpen(!open);
          }}
          aria-expanded={open}
          data-testid={`rule-edit-${skill.id}`}
        >
          {open ? t('action.close') : t('rules.edit')}
        </button>
      </div>

      {open && (
        <div className="skill-rule-editor">
          <div className="skill-rule-presets">
            {PRESETS.map((p) => (
              <button
                key={p.key}
                type="button"
                className="filter-chip"
                onClick={() => setDraft(p.rule)}
              >
                {t(p.key)}
              </button>
            ))}
          </div>

          {draft.conditions.length > 1 && (
            <label className="small">
              {t('rules.logic')}{' '}
              <select
                className="ab-select"
                value={draft.logic}
                onChange={(e) =>
                  setDraft({ ...draft, logic: e.target.value as SkillRule['logic'] })
                }
              >
                <option value="all">{t('rules.logic.all')}</option>
                <option value="any">{t('rules.logic.any')}</option>
              </select>
            </label>
          )}

          {draft.conditions.map((c, i) => (
            <div key={i} className="skill-rule-row">
              <select
                className="ab-select"
                value={c.kind}
                aria-label={t('rules.condition')}
                onChange={(e) => setCondition(i, freshCondition(e.target.value as Kind))}
              >
                {KINDS.map((k) => (
                  <option key={k} value={k}>
                    {t(`rules.kind.${k}`)}
                  </option>
                ))}
              </select>

              {c.kind === 'enemies' && (
                <>
                  <select
                    className="ab-select"
                    value={c.op}
                    aria-label={t('rules.comparison')}
                    onChange={(e) =>
                      setCondition(i, { ...c, op: e.target.value as 'at_least' | 'at_most' })
                    }
                  >
                    <option value="at_least">{t('rules.op.at_least')}</option>
                    <option value="at_most">{t('rules.op.at_most')}</option>
                  </select>
                  <input
                    className="input rule-number"
                    type="number"
                    min={1}
                    max={8}
                    value={c.count}
                    aria-label={t('rules.kind.enemies')}
                    onChange={(e) => setCondition(i, { ...c, count: Number(e.target.value) })}
                  />
                </>
              )}

              {c.kind === 'target' && (
                <select
                  className="ab-select"
                  value={c.is}
                  aria-label={t('rules.kind.target')}
                  onChange={(e) =>
                    setCondition(i, { ...c, is: e.target.value as 'boss' | 'elite' | 'normal' })
                  }
                >
                  <option value="boss">{t('rules.is.boss')}</option>
                  <option value="elite">{t('rules.is.elite')}</option>
                  <option value="normal">{t('rules.is.normal')}</option>
                </select>
              )}

              {c.kind !== 'enemies' && c.kind !== 'target' && (
                <>
                  <select
                    className="ab-select"
                    value={c.op}
                    aria-label={t('rules.comparison')}
                    onChange={(e) =>
                      setCondition(i, { ...c, op: e.target.value as 'below' | 'above' })
                    }
                  >
                    <option value="below">{t('rules.op.below')}</option>
                    <option value="above">{t('rules.op.above')}</option>
                  </select>
                  <input
                    className="input rule-number"
                    type="number"
                    min={1}
                    max={99}
                    value={c.pct}
                    aria-label="%"
                    onChange={(e) => setCondition(i, { ...c, pct: Number(e.target.value) })}
                  />
                  <span className="muted">%</span>
                </>
              )}

              <button
                type="button"
                className="round-btn"
                aria-label={t('rules.remove')}
                onClick={() =>
                  setDraft({ ...draft, conditions: draft.conditions.filter((_, j) => j !== i) })
                }
              >
                ✕
              </button>
            </div>
          ))}

          <div className="row">
            <button
              type="button"
              className="btn btn-small"
              disabled={draft.conditions.length >= MAX_RULE_CONDITIONS}
              onClick={() =>
                setDraft({
                  ...draft,
                  conditions: [...draft.conditions, freshCondition('hero_hp')],
                })
              }
            >
              + {t('rules.add')}
            </button>
            <button
              type="button"
              className="btn btn-small"
              onClick={() => save(null)}
              data-testid={`rule-clear-${skill.id}`}
            >
              {t('rules.clear')}
            </button>
            <button
              type="button"
              className="btn btn-small btn-primary"
              onClick={() => save(draft)}
              data-testid={`rule-save-${skill.id}`}
            >
              {t('rules.save')}
            </button>
          </div>
          <div className="muted small">{ruleText(draft)}</div>
          {error && <p className="tone-bad small">{error}</p>}
        </div>
      )}
    </div>
  );
}
