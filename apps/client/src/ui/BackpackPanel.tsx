import { EQUIPMENT_SLOTS, RARITIES, type EquipmentSlot } from '@abismo/content';
import {
  backpackSize,
  heroStats,
  inTown,
  rarityRank,
  sellPrice,
  type ItemInstance,
} from '@abismo/engine';
import { useMemo, useState } from 'react';
import { formatNumber, t } from '../i18n.ts';
import { useUi } from '../state/store.ts';
import { compareItem, itemLines, itemName, requirementText } from './items.ts';
import { PixelIcon } from './PixelIcon.tsx';
import { RARITY_COLOR, RARITY_GLYPH } from './rarity.ts';
import { HeroSprite } from './SheetSprite.tsx';
import { tryIntent } from './Sheet.tsx';
import { useSim } from './useSim.ts';

/** Icon of an empty equipment slot: the first item base of that slot, dimmed. */
export const SLOT_ICON: Record<EquipmentSlot, string> = {
  weapon: 'item.sword_rusty',
  offhand: 'item.shield_plank',
  helm: 'item.helm_leather',
  chest: 'item.vest_leather',
  gloves: 'item.gloves_cloth',
  pants: 'item.pants_leather',
  boots: 'item.boots_worn',
  belt: 'item.belt_rope',
  ring: 'item.ring_copper',
  amulet: 'item.amulet_bone',
};

/** True when equipping the item would raise damage, defence or life and lower none of them. */
function isUpgrade(rows: ReturnType<typeof compareItem>) {
  const main = rows.slice(0, 4);
  return (
    main.some((r) => r.after > r.before + 1e-9) && main.every((r) => r.after >= r.before - 1e-9)
  );
}

export function ItemCell({
  item,
  selected,
  onSelect,
  upgrade = false,
}: {
  item: ItemInstance;
  selected: boolean;
  onSelect: () => void;
  upgrade?: boolean;
}) {
  const sim = useSim();
  return (
    <button
      type="button"
      className={`cell rarity-${item.rarity}${selected ? ' selected' : ''}`}
      style={{ borderColor: RARITY_COLOR[item.rarity] }}
      onClick={onSelect}
      aria-label={`${itemName(sim.content, item)} (${t(`rarity.${item.rarity}`)})`}
      data-testid="item-cell"
    >
      <PixelIcon name={`item.${item.baseId}`} size={32} />
      <span className="glyph" aria-hidden style={{ color: RARITY_COLOR[item.rarity] }}>
        {RARITY_GLYPH[item.rarity]}
      </span>
      {item.refine > 0 && <span className="cell-refine">+{item.refine}</span>}
      <span className="cell-ilvl">{item.ilvl}</span>
      {upgrade && (
        <span className="cell-up" title={t('inventory.upgrade')}>
          ▲
        </span>
      )}
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
  const [error, setError] = useState<string | null>(null);
  const lines = itemLines(sim.content, item);
  const req = requirementText(sim.content, sim.state.hero, item);
  const rows = equipped ? [] : compareItem(sim.content, sim.state.hero, item);
  const town = inTown(sim.state);
  return (
    <div className="item-card" data-testid="item-card">
      <div className="item-head">
        <span
          className={`item-big rarity-${item.rarity}`}
          style={{ borderColor: RARITY_COLOR[item.rarity] }}
        >
          <PixelIcon name={`item.${item.baseId}`} size={48} />
        </span>
        <div>
          <div className="item-title pixel" style={{ color: RARITY_COLOR[item.rarity] }}>
            <span aria-hidden>{RARITY_GLYPH[item.rarity]} </span>
            {itemName(sim.content, item)}
          </div>
          <div className="muted">
            {t(`rarity.${item.rarity}`)} · {t('item.ilvl', { ilvl: item.ilvl })}
            {equipped && ` · ${t('backpack.equipped')}`}
          </div>
          {req && <div className="tone-bad">{equipped ? t('item.inactive') : req}</div>}
        </div>
      </div>
      <ul className="item-lines">
        {lines.base.map((l) => (
          <li key={l}>{l}</li>
        ))}
        {lines.unique && (
          <li className="unique" data-testid="unique-effect">
            {t('item.unique')}: {lines.unique}
          </li>
        )}
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
      {error && <div className="tone-bad">{error}</div>}
      {equipped && onUnequip && (
        <div className="row">
          <button type="button" className="btn" onClick={onUnequip}>
            {t('action.unequip')}
          </button>
        </div>
      )}
      {!equipped && (
        <div className="row item-actions">
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
          <button
            type="button"
            className="btn"
            disabled={!town}
            title={town ? undefined : t('inventory.sellInTown')}
            onClick={() => {
              const err = tryIntent(() => sim.sell([item.uid]));
              setError(err);
              if (!err) select(null);
            }}
            data-testid="sell-item"
          >
            <PixelIcon name="gold" size={16} />{' '}
            {t('inventory.sell', { gold: formatNumber(sellPrice(item)) })}
          </button>
        </div>
      )}
    </div>
  );
}

type SortKey = 'recent' | 'rarity' | 'ilvl';

/** Equipment around the hero (left column, right column), as on a character sheet. */
const DOLL_LEFT: EquipmentSlot[] = ['helm', 'amulet', 'weapon', 'gloves', 'ring'];
const DOLL_RIGHT: EquipmentSlot[] = ['chest', 'offhand', 'belt', 'pants', 'boots'];

function Paperdoll() {
  const sim = useSim();
  const { selectedUid, select } = useUi();
  const hero = sim.state.hero;
  const stats = heroStats(hero, sim.content);
  const slot = (s: EquipmentSlot) => {
    const item = hero.equipment[s];
    return item ? (
      <ItemCell
        key={s}
        item={item}
        selected={item.uid === selectedUid}
        onSelect={() => select(item.uid)}
      />
    ) : (
      <div
        key={s}
        className="cell empty"
        title={`${t(`slot.${s}`)} · ${t('backpack.nothingEquipped')}`}
      >
        <PixelIcon name={SLOT_ICON[s]} size={32} />
      </div>
    );
  };
  return (
    <div className="paperdoll" data-testid="paperdoll">
      <div className="doll-col">{DOLL_LEFT.map(slot)}</div>
      <div className="doll-hero">
        <div className="doll-figure">
          <HeroSprite outfit={hero.appearance.outfit} scale={4} />
        </div>
        <dl className="doll-stats">
          <div>
            <dt>{t('stat.label.damage')}</dt>
            <dd>
              {formatNumber(stats.damageMin)}–{formatNumber(stats.damageMax)}
            </dd>
          </div>
          <div>
            <dt>{t('stat.label.defense')}</dt>
            <dd>{formatNumber(stats.defense)}</dd>
          </div>
          <div>
            <dt>{t('stat.label.maxHp')}</dt>
            <dd>{formatNumber(stats.maxHp)}</dd>
          </div>
          <div>
            <dt>{t('stat.label.magicFind')}</dt>
            <dd>+{stats.magicFindPct}%</dd>
          </div>
        </dl>
      </div>
      <div className="doll-col">{DOLL_RIGHT.map(slot)}</div>
    </div>
  );
}

function Materials() {
  const sim = useSim();
  const s = sim.state;
  return (
    <div className="mat-list" data-testid="materials">
      {RARITIES.map((r) => {
        const m = sim.content.salvageMaterial[r];
        return (
          <div key={m.id} className="mat-row">
            <PixelIcon name={`material.${m.id}`} size={32} />
            <span style={{ color: RARITY_COLOR[r] }}>{t(m.nameKey)}</span>
            <span className="pixel">{formatNumber(s.materials[m.id] ?? 0n)}</span>
          </div>
        );
      })}
      {[...sim.content.consumables.values()].map((c) => (
        <div key={c.id} className="mat-row">
          <PixelIcon name={`consumable.${c.id}`} size={32} />
          <span>{t(c.nameKey)}</span>
          <span className="pixel">{formatNumber(s.consumables[c.id] ?? 0)}</span>
        </div>
      ))}
      <div className="mat-row">
        <PixelIcon name="gold" size={32} />
        <span className="res-gold">{t('hud.gold')}</span>
        <span className="pixel">{formatNumber(s.gold)}</span>
      </div>
    </div>
  );
}

/**
 * The inventory: the hero with its ten equipment slots, the backpack and stash as icon
 * grids (filter by slot, sort, green arrow on upgrades) and materials with potions.
 */
export function BackpackPanel() {
  const sim = useSim();
  const { tab, setTab, selectedUid, select, openBackpack } = useUi();
  const [filter, setFilter] = useState<EquipmentSlot | 'all'>('all');
  const [sort, setSort] = useState<SortKey>('recent');
  const [view, setView] = useState<'items' | 'materials'>('items');
  const s = sim.state;
  const source = tab === 'backpack' ? s.backpack : s.stash;
  const items = useMemo(() => {
    const list = source.filter(
      (i) => filter === 'all' || sim.content.itemBases.get(i.baseId)?.slot === filter,
    );
    if (sort === 'rarity')
      list.sort((a, b) => rarityRank(b.rarity) - rarityRank(a.rarity) || b.ilvl - a.ilvl);
    else if (sort === 'ilvl') list.sort((a, b) => b.ilvl - a.ilvl);
    else list.reverse();
    return list;
  }, [source, filter, sort, sim.content, s.backpack.length, s.stash.length]);
  const upgrades = useMemo(
    () =>
      new Set(
        items.filter((i) => isUpgrade(compareItem(sim.content, s.hero, i))).map((i) => i.uid),
      ),
    [items, sim.content, s.hero],
  );
  const equipped = Object.values(s.hero.equipment);
  const selected = [...source, ...equipped].find((i) => i?.uid === selectedUid);

  return (
    <div className="sheet-backdrop" onClick={() => openBackpack(false)}>
      <section
        className="panel sheet inventory"
        onClick={(e) => e.stopPropagation()}
        aria-label={t('backpack.title')}
        data-testid="backpack"
      >
        <header className="sheet-head">
          <h2 className="pixel sheet-title">{t('inventory.title')}</h2>
          <button
            type="button"
            className="round-btn"
            aria-label={t('action.close')}
            onClick={() => openBackpack(false)}
          >
            ✕
          </button>
        </header>
        <div className="inv-layout">
          <Paperdoll />
          <div className="inv-main">
            <div className="tabs" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={view === 'items' && tab === 'backpack'}
                className={`tab${view === 'items' && tab === 'backpack' ? ' active' : ''}`}
                onClick={() => {
                  setView('items');
                  setTab('backpack');
                }}
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
                aria-selected={view === 'items' && tab === 'stash'}
                className={`tab${view === 'items' && tab === 'stash' ? ' active' : ''}`}
                onClick={() => {
                  setView('items');
                  setTab('stash');
                }}
              >
                {t('backpack.stash')} ({s.stash.length})
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={view === 'materials'}
                className={`tab${view === 'materials' ? ' active' : ''}`}
                onClick={() => setView('materials')}
                data-testid="tab-materials"
              >
                {t('backpack.materials')}
              </button>
            </div>
            {view === 'materials' ? (
              <Materials />
            ) : (
              <>
                <div className="inv-tools">
                  <div className="slot-filter" role="group" aria-label={t('inventory.filter')}>
                    <button
                      type="button"
                      className={`filter-chip${filter === 'all' ? ' active' : ''}`}
                      onClick={() => setFilter('all')}
                    >
                      {t('inventory.all')}
                    </button>
                    {EQUIPMENT_SLOTS.map((slot) => (
                      <button
                        key={slot}
                        type="button"
                        className={`filter-chip${filter === slot ? ' active' : ''}`}
                        onClick={() => setFilter(slot)}
                        title={t(`slot.${slot}`)}
                        aria-label={t(`slot.${slot}`)}
                      >
                        <PixelIcon name={SLOT_ICON[slot]} size={16} />
                      </button>
                    ))}
                  </div>
                  <select
                    className="input sort"
                    value={sort}
                    onChange={(e) => setSort(e.target.value as SortKey)}
                    aria-label={t('inventory.sort')}
                  >
                    <option value="recent">{t('inventory.sort.recent')}</option>
                    <option value="rarity">{t('inventory.sort.rarity')}</option>
                    <option value="ilvl">{t('inventory.sort.ilvl')}</option>
                  </select>
                </div>
                <div className="grid">
                  {items.length === 0 && <div className="muted">{t('backpack.empty')}</div>}
                  {items.map((item) => (
                    <ItemCell
                      key={item.uid}
                      item={item}
                      selected={item.uid === selectedUid}
                      upgrade={upgrades.has(item.uid)}
                      onSelect={() => select(item.uid)}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
        {selected && (
          <ItemCard
            item={selected}
            equipped={equipped.some((e) => e?.uid === selected.uid)}
            onUnequip={() => {
              const slot = sim.content.itemBases.get(selected.baseId)!.slot;
              sim.unequip(slot);
              select(null);
            }}
          />
        )}
      </section>
    </div>
  );
}
