import type { Rarity } from '@abismo/content';
import {
  MAX_REFINE,
  findItem,
  refineBlock,
  refineChancePpm,
  refineCost,
  reforgeBlock,
  reforgeCost,
  REFINE_LOSES_LEVEL_FROM,
  type ItemInstance,
  type RefineResult,
  type RolledAffix,
  consumableOfKind,
  PPM,
  TEMPERING_BONUS_PPM,
} from '@abismo/engine';
import { useState } from 'react';
import { formatNumber, t } from '../../i18n.ts';
import { itemName } from '../items.ts';
import { RARITY_COLOR, RARITY_GLYPH } from '../rarity.ts';
import { Sheet, tryIntent } from '../Sheet.tsx';
import { useSim } from '../useSim.ts';

const BULK: Rarity[] = ['common', 'magic', 'rare'];

/** Blacksmith (section 7.5): refine +1 to +15 with visible chances, and bulk salvage. */
export function SmithScreen() {
  const sim = useSim();
  const s = sim.state;
  const [uid, setUid] = useState<number | null>(s.hero.equipment.weapon?.uid ?? null);
  const [protect, setProtect] = useState(false);
  const [temper, setTemper] = useState(false);
  const [result, setResult] = useState<RefineResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [bulk, setBulk] = useState<Rarity>('common');
  const [affixIndex, setAffixIndex] = useState(0);
  const [rerolled, setRerolled] = useState<RolledAffix | null>(null);
  const protectionId =
    [...sim.content.consumables.values()].find((c) => c.kind === 'refine_protection')?.id ?? '';
  const charms = s.consumables[protectionId] ?? 0;
  const temperingId = consumableOfKind(sim.content, 'refine_tempering');
  const stones = s.consumables[temperingId] ?? 0;

  const equipped = Object.values(s.hero.equipment).filter((i): i is ItemInstance => !!i);
  const choices = [...equipped, ...s.backpack, ...s.stash];
  const item = uid !== null ? findItem(s, uid) : undefined;
  const target = item ? item.refine + 1 : 0;
  const cost = item && item.refine < MAX_REFINE ? refineCost(target, item.ilvl) : null;
  const block = item
    ? refineBlock(s, item, protect, protectionId, temper && stones > 0, temperingId)
    : null;
  const bulkCount = [...s.backpack, ...s.stash].filter(
    (i) => BULK.indexOf(i.rarity) >= 0 && BULK.indexOf(i.rarity) <= BULK.indexOf(bulk),
  ).length;

  return (
    <Sheet title={t('screen.smith')} testId="smith">
      <h3 className="pixel">{t('smith.refine')}</h3>
      <select
        className="input"
        value={uid ?? ''}
        onChange={(e) => {
          setUid(Number(e.target.value));
          setResult(null);
          setRerolled(null);
          setAffixIndex(0);
        }}
        data-testid="smith-item"
      >
        {choices.map((i) => (
          <option key={i.uid} value={i.uid}>
            {RARITY_GLYPH[i.rarity]} {itemName(sim.content, i)}
            {equipped.includes(i) ? ` (${t('backpack.equipped')})` : ''}
          </option>
        ))}
      </select>

      {item && (
        <div className="item-card">
          <div className="item-title pixel" style={{ color: RARITY_COLOR[item.rarity] }}>
            {itemName(sim.content, item)}
          </div>
          {cost ? (
            <>
              <div className="pixel" data-testid="refine-chance">
                +{item.refine} → +{target} ·{' '}
                {t('smith.chance', {
                  pct:
                    Math.min(
                      PPM,
                      refineChancePpm(target) + (temper && stones > 0 ? TEMPERING_BONUS_PPM : 0),
                    ) / 10_000,
                })}
              </div>
              <div className="muted small">
                {target >= REFINE_LOSES_LEVEL_FROM ? t('smith.failDrops') : t('smith.failKeeps')}
              </div>
              <ul className="item-lines">
                <li className={s.gold < cost.gold ? 'tone-bad' : undefined}>
                  {t('smith.gold', { need: formatNumber(cost.gold), have: formatNumber(s.gold) })}
                </li>
                {Object.entries(cost.materials).map(([id, qty]) => {
                  const have = s.materials[id] ?? 0n;
                  return (
                    <li key={id} className={have < BigInt(qty) ? 'tone-bad' : undefined}>
                      {t(sim.content.materials.get(id)!.nameKey)}: {formatNumber(have)} / {qty}
                    </li>
                  );
                })}
              </ul>
              {target >= REFINE_LOSES_LEVEL_FROM && (
                <label className="check">
                  <input
                    type="checkbox"
                    checked={protect}
                    disabled={charms === 0}
                    onChange={(e) => setProtect(e.target.checked)}
                  />
                  {t('smith.protect', { n: charms })}
                </label>
              )}
              <label className="check">
                <input
                  type="checkbox"
                  checked={temper && stones > 0}
                  disabled={stones === 0}
                  onChange={(e) => setTemper(e.target.checked)}
                  data-testid="refine-temper"
                />
                {t('smith.temper', { n: stones })}
              </label>
              <button
                type="button"
                className="btn btn-primary wide"
                disabled={block !== null}
                onClick={() =>
                  setError(
                    tryIntent(() => setResult(sim.refine(item.uid, protect, temper && stones > 0))),
                  )
                }
                data-testid="refine-button"
              >
                {t('smith.refineButton', { n: target })}
              </button>
              {block && <div className="tone-bad small">{t(`smith.block.${block}`)}</div>}
            </>
          ) : (
            <div className="muted">{t('smith.maxed')}</div>
          )}
          {result && (
            <p
              className={result.success ? 'tone-good pixel' : 'tone-bad'}
              data-testid="refine-result"
            >
              {result.success
                ? t('smith.success', { n: result.to })
                : result.protectionUsed
                  ? t('smith.protected')
                  : result.to < result.from
                    ? t('smith.failDropped', { n: result.to })
                    : t('smith.failed')}
            </p>
          )}
        </div>
      )}
      {error && <p className="tone-bad">{error}</p>}

      <h3 className="pixel">{t('smith.reforge')}</h3>
      {item && (
        <Reforge
          item={item}
          index={affixIndex}
          setIndex={setAffixIndex}
          result={rerolled}
          onReforge={() =>
            setError(tryIntent(() => setRerolled(sim.reforge(item.uid, affixIndex))))
          }
        />
      )}

      <h3 className="pixel">{t('smith.bulk')}</h3>
      <p className="muted small">{t('smith.bulkHint')}</p>
      <div className="choice-row">
        {BULK.map((r) => (
          <button
            key={r}
            type="button"
            className={`btn choice${bulk === r ? ' active' : ''}`}
            style={{ color: RARITY_COLOR[r] }}
            onClick={() => setBulk(r)}
          >
            {t('smith.upTo', { rarity: t(`rarity.${r}`) })}
          </button>
        ))}
      </div>
      <button
        type="button"
        className="btn wide"
        disabled={bulkCount === 0}
        onClick={() => setError(tryIntent(() => void sim.salvageUpTo(bulk)))}
        data-testid="bulk-salvage"
      >
        {t('smith.bulkButton', { n: bulkCount })}
      </button>
    </Sheet>
  );
}

/** Reforge (milestone 2): reroll one chosen affix of a rare or better item. */
function Reforge({
  item,
  index,
  setIndex,
  result,
  onReforge,
}: {
  item: ItemInstance;
  index: number;
  setIndex: (i: number) => void;
  result: RolledAffix | null;
  onReforge: () => void;
}) {
  const sim = useSim();
  const s = sim.state;
  const cost = reforgeCost(item);
  const block = reforgeBlock(s, item, index);
  const affixText = (a: RolledAffix) => {
    const affix = sim.content.affixes.get(a.affixId);
    return affix ? t(affix.textKey, { value: a.value }) : a.affixId;
  };
  if (!cost) return <p className="muted small">{t('smith.reforgeRarity')}</p>;
  return (
    <div className="item-card">
      <p className="muted small">{t('smith.reforgeHint')}</p>
      <div className="choice-col" role="radiogroup" aria-label={t('smith.reforge')}>
        {item.affixes.map((a, i) => (
          <label key={i} className="check">
            <input type="radio" name="reforge" checked={index === i} onChange={() => setIndex(i)} />
            <span className="affix">{affixText(a)}</span>
          </label>
        ))}
      </div>
      <ul className="item-lines">
        <li className={s.gold < cost.gold ? 'tone-bad' : undefined}>
          {t('smith.gold', { need: formatNumber(cost.gold), have: formatNumber(s.gold) })}
        </li>
        {Object.entries(cost.materials).map(([id, qty]) => {
          const have = s.materials[id] ?? 0n;
          return (
            <li key={id} className={have < BigInt(qty) ? 'tone-bad' : undefined}>
              {t(sim.content.materials.get(id)!.nameKey)}: {formatNumber(have)} / {qty}
            </li>
          );
        })}
      </ul>
      <button
        type="button"
        className="btn wide"
        disabled={block !== null}
        onClick={onReforge}
        data-testid="reforge-button"
      >
        {t('smith.reforgeButton')}
      </button>
      {block && block !== 'rarity' && (
        <div className="tone-bad small">{t(`smith.reforgeBlock.${block}`)}</div>
      )}
      {result && (
        <p className="tone-good" data-testid="reforge-result">
          {t('smith.reforged', { affix: affixText(result) })}
        </p>
      )}
    </div>
  );
}
