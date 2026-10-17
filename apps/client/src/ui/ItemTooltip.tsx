import { sellPrice } from '@abismo/engine';
import { formatNumber, t } from '../i18n.ts';
import { useUi } from '../state/store.ts';
import { compareItem, itemLines, itemName, requirementText } from './items.ts';
import { PixelIcon } from './PixelIcon.tsx';
import { RARITY_COLOR, RARITY_GLYPH } from './rarity.ts';
import { useSim } from './useSim.ts';

/**
 * Item details next to the mouse while it rests on an item (desktop): name, rarity, item
 * level, stats, affixes, the change against the equipped item and the sale price.
 */
export function ItemTooltip() {
  const sim = useSim();
  const hover = useUi((s) => s.hover);
  if (!hover) return null;
  const { item } = hover;
  const equipped = Object.values(sim.state.hero.equipment).some((e) => e?.uid === item.uid);
  const lines = itemLines(sim.content, item);
  const req = requirementText(sim.content, sim.state.hero, item);
  const rows = equipped
    ? []
    : compareItem(sim.content, sim.state.hero, item).filter((r) => r.after !== r.before);
  // Keep the box on screen: flip to the left or up near the edges.
  const left = hover.x + 300 > window.innerWidth ? hover.x - 296 : hover.x + 16;
  const top = Math.min(hover.y + 12, window.innerHeight - 260);
  return (
    <div className="item-tooltip" style={{ left, top, borderColor: RARITY_COLOR[item.rarity] }}>
      <div className="tt-head">
        <PixelIcon name={`item.${item.baseId}`} size={32} />
        <div>
          <div className="pixel" style={{ color: RARITY_COLOR[item.rarity] }}>
            {RARITY_GLYPH[item.rarity]} {itemName(sim.content, item)}
          </div>
          <div className="muted small">
            {t(`rarity.${item.rarity}`)} · {t('item.ilvl', { ilvl: item.ilvl })}
            {equipped && ` · ${t('backpack.equipped')}`}
          </div>
        </div>
      </div>
      {req && <div className="tone-bad small">{req}</div>}
      <ul className="item-lines small">
        {lines.base.map((l) => (
          <li key={l}>{l}</li>
        ))}
        {lines.unique && <li className="unique">{lines.unique}</li>}
        {lines.affixes.map((l) => (
          <li key={l} className="affix">
            {l}
          </li>
        ))}
      </ul>
      {rows.length > 0 && (
        <div className="small">
          {rows.map((r) => {
            const diff = r.after - r.before;
            return (
              <div key={r.label} className={diff > 0 ? 'tone-good' : 'tone-bad'}>
                {r.label} {diff > 0 ? '+' : ''}
                {diff.toFixed(r.digits)}
              </div>
            );
          })}
        </div>
      )}
      <div className="tt-foot muted small">
        <span>
          <PixelIcon name="gold" size={16} /> {formatNumber(sellPrice(item))}
        </span>
        <span>{equipped ? t('tooltip.rightUnequip') : t('tooltip.rightEquip')}</span>
      </div>
    </div>
  );
}
