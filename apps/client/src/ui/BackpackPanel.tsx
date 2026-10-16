import { EQUIPMENT_SLOTS, RARITIES } from '@abismo/content';
import { backpackSize, type ItemInstance } from '@abismo/engine';
import { formatNumber, t } from '../i18n.ts';
import { useUi } from '../state/store.ts';
import { compareItem, itemLines, itemName, requirementText } from './items.ts';
import { RARITY_COLOR, RARITY_GLYPH } from './rarity.ts';
import { useSim } from './useSim.ts';

export function ItemCell({
  item,
  selected,
  onSelect,
}: {
  item: ItemInstance;
  selected: boolean;
  onSelect: () => void;
}) {
  const sim = useSim();
  return (
    <button
      type="button"
      className={`cell${selected ? ' selected' : ''}`}
      style={{ borderColor: RARITY_COLOR[item.rarity], color: RARITY_COLOR[item.rarity] }}
      onClick={onSelect}
      aria-label={`${itemName(sim.content, item)} (${t(`rarity.${item.rarity}`)})`}
      data-testid="item-cell"
    >
      <span className="glyph" aria-hidden>
        {RARITY_GLYPH[item.rarity]}
      </span>
      <span className="slot-abbr">
        {t(`slot.${sim.content.itemBases.get(item.baseId)!.slot}`).slice(0, 3)}
      </span>
    </button>
  );
}

export function ItemCard({
  item,
  equipped,
  onUnequip,
}: {
  item: ItemInstance;
  equipped: boolean;
  onUnequip?: () => void;
}) {
  const sim = useSim();
  const select = useUi((s) => s.select);
  const lines = itemLines(sim.content, item);
  const req = requirementText(sim.content, sim.state.hero, item);
  const rows = equipped ? [] : compareItem(sim.content, sim.state.hero, item);
  return (
    <div className="item-card" data-testid="item-card">
      <div className="item-title pixel" style={{ color: RARITY_COLOR[item.rarity] }}>
        <span aria-hidden>{RARITY_GLYPH[item.rarity]} </span>
        {itemName(sim.content, item)}
      </div>
      <div className="muted">
        {t(`rarity.${item.rarity}`)} · {t('item.ilvl', { ilvl: item.ilvl })}
        {equipped && ` · ${t('backpack.equipped')}`}
      </div>
      {req && <div className="tone-bad">{equipped ? t('item.inactive') : req}</div>}
      <ul className="item-lines">
        {lines.base.map((l) => (
          <li key={l}>{l}</li>
        ))}
        {lines.affixes.map((l) => (
          <li key={l} className="affix" data-testid="affix">
            {l}
          </li>
        ))}
      </ul>
      {rows.length > 0 && (
        <div className="compare">
          <div className="muted">{t('backpack.compare')}</div>
          {rows.map((r) => {
            const diff = r.after - r.before;
            return (
              <div key={r.label} className={diff > 0 ? 'tone-good' : 'tone-bad'}>
                {r.label}: {r.before.toFixed(r.digits)} → {r.after.toFixed(r.digits)} (
                {diff > 0 ? '+' : ''}
                {diff.toFixed(r.digits)})
              </div>
            );
          })}
        </div>
      )}
      {equipped && onUnequip && (
        <div className="row">
          <button type="button" className="btn" onClick={onUnequip}>
            {t('action.unequip')}
          </button>
        </div>
      )}
      {!equipped && (
        <div className="row">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              sim.equip(item.uid);
              select(null);
            }}
          >
            {t('action.equip')}
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => {
              sim.salvage(item.uid);
              select(null);
            }}
          >
            {t('action.salvage')}
          </button>
        </div>
      )}
    </div>
  );
}

export function BackpackPanel() {
  const sim = useSim();
  const { tab, setTab, selectedUid, select, openBackpack } = useUi();
  const s = sim.state;
  const items = tab === 'backpack' ? s.backpack : s.stash;
  const equipped = Object.values(s.hero.equipment);
  const selected = [...items, ...equipped].find((i) => i?.uid === selectedUid);
  return (
    <div className="sheet-backdrop" onClick={() => openBackpack(false)}>
      <section
        className="panel sheet"
        onClick={(e) => e.stopPropagation()}
        aria-label={t('backpack.title')}
        data-testid="backpack"
      >
        <header className="sheet-head">
          <div className="tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'backpack'}
              className={`tab${tab === 'backpack' ? ' active' : ''}`}
              onClick={() => setTab('backpack')}
            >
              {t('backpack.title')}{' '}
              {t('backpack.count', {
                n: s.backpack.length,
                max: backpackSize(s.hero, sim.content),
              })}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'stash'}
              className={`tab${tab === 'stash' ? ' active' : ''}`}
              onClick={() => setTab('stash')}
            >
              {t('backpack.stash')} ({s.stash.length})
            </button>
          </div>
          <button
            type="button"
            className="btn icon"
            aria-label={t('action.close')}
            onClick={() => openBackpack(false)}
          >
            ✕
          </button>
        </header>

        <div className="equipment">
          {EQUIPMENT_SLOTS.map((slot) => {
            const item = s.hero.equipment[slot];
            return item ? (
              <ItemCell
                key={slot}
                item={item}
                selected={item.uid === selectedUid}
                onSelect={() => select(item.uid)}
              />
            ) : (
              <div key={slot} className="cell empty" title={t('backpack.nothingEquipped')}>
                <span className="slot-abbr">{t(`slot.${slot}`).slice(0, 3)}</span>
              </div>
            );
          })}
        </div>

        {selected && (
          <ItemCard item={selected} equipped={equipped.some((e) => e?.uid === selected.uid)} />
        )}

        <div className="grid">
          {items.length === 0 && <div className="muted">{t('backpack.empty')}</div>}
          {items.map((item) => (
            <ItemCell
              key={item.uid}
              item={item}
              selected={item.uid === selectedUid}
              onSelect={() => select(item.uid)}
            />
          ))}
        </div>

        {tab === 'stash' && (
          <div className="materials">
            <span className="muted">{t('backpack.materials')}:</span>
            {RARITIES.map((r) => {
              const m = sim.content.salvageMaterial[r];
              return (
                <span key={m.id} style={{ color: RARITY_COLOR[r] }}>
                  {t(m.nameKey)} {formatNumber(s.materials[m.id] ?? 0n)}
                </span>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
