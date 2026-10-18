import { EQUIPMENT_SLOTS, RARITIES, type EquipmentSlot, type Rarity } from '@abismo/content';
import {
  claimableQuests,
  forgeCost,
  forgeIlvl,
  sellPrice,
  type CraftRarity,
  type ItemInstance,
} from '@abismo/engine';
import { useState } from 'react';
import { formatNumber, t } from '../i18n.ts';
import { useUi } from '../state/store.ts';
import { ItemCell, SLOT_ICON } from './BackpackPanel.tsx';
import { PixelIcon } from './PixelIcon.tsx';
import { RARITY_COLOR } from './rarity.ts';
import { SheetSprite, useManifest } from './SheetSprite.tsx';
import { tryIntent } from './Sheet.tsx';
import { useSim } from './useSim.ts';

function NpcPortrait({ id }: { id: string }) {
  const manifest = useManifest();
  const atlas = manifest?.atlases.npcs;
  const set = atlas?.sprites[id]?.frames;
  if (!atlas?.image || !atlas.frameWidth || !set) return null;
  return (
    <span className="npc-portrait">
      <SheetSprite
        image={atlas.image}
        frames={set.idle}
        width={atlas.frameWidth}
        height={atlas.frameHeight ?? atlas.frameWidth}
        columns={atlas.columns ?? 16}
        scale={1.3}
      />
    </span>
  );
}

function Cost({ gold, materials }: { gold: number; materials: Record<string, number> }) {
  const sim = useSim();
  const s = sim.state;
  return (
    <div className="cost">
      <span className={s.gold >= BigInt(gold) ? '' : 'tone-bad'}>
        <PixelIcon name="gold" size={16} /> {formatNumber(gold)}
      </span>
      {Object.entries(materials).map(([id, qty]) => {
        const have = s.materials[id] ?? 0n;
        return (
          <span key={id} className={have >= BigInt(qty) ? '' : 'tone-bad'}>
            <PixelIcon name={`material.${id}`} size={16} /> {qty} ({formatNumber(have)})
          </span>
        );
      })}
    </div>
  );
}

const FORGE_RARITIES: CraftRarity[] = ['magic', 'rare', 'epic'];

/** The smith forges a new item: pick the slot and the rarity, pay gold and materials. */
function Forge() {
  const sim = useSim();
  const select = useUi((s) => s.select);
  const [slot, setSlot] = useState<EquipmentSlot>('weapon');
  const [rarity, setRarity] = useState<CraftRarity>('magic');
  const [error, setError] = useState<string | null>(null);
  const [made, setMade] = useState<ItemInstance | null>(null);
  const cost = forgeCost(sim.state, sim.content, rarity);
  return (
    <div className="service" data-testid="forge">
      <p className="muted small">{t('forge.intro', { ilvl: forgeIlvl(sim.state, sim.content) })}</p>
      <div className="slot-filter">
        {EQUIPMENT_SLOTS.map((s) => (
          <button
            key={s}
            type="button"
            className={`filter-chip${slot === s ? ' active' : ''}`}
            onClick={() => setSlot(s)}
            title={t(`slot.${s}`)}
            aria-label={t(`slot.${s}`)}
          >
            <PixelIcon name={SLOT_ICON[s]} size={16} />
          </button>
        ))}
      </div>
      <div className="choice-row">
        {FORGE_RARITIES.map((r) => (
          <button
            key={r}
            type="button"
            className={`filter-chip${rarity === r ? ' active' : ''}`}
            style={{ color: RARITY_COLOR[r] }}
            onClick={() => setRarity(r)}
          >
            {t(`rarity.${r}`)}
          </button>
        ))}
      </div>
      <Cost gold={cost.gold} materials={cost.materials} />
      <button
        type="button"
        className="btn btn-primary"
        data-testid="forge-button"
        onClick={() => {
          let item: ItemInstance | null = null;
          const err = tryIntent(() => {
            item = sim.forge(slot, rarity);
          });
          setError(err);
          setMade(item);
        }}
      >
        {t('forge.make', { slot: t(`slot.${slot}`) })}
      </button>
      {error && <div className="tone-bad">{error}</div>}
      {made && (
        <div className="forged">
          <ItemCell item={made} selected={false} onSelect={() => select(made!.uid)} />
          <span className="tone-good">{t('forge.done')}</span>
        </div>
      )}
    </div>
  );
}

/** The merchant: potions for gold, and gold for unwanted items. */
function Shop() {
  const sim = useSim();
  const s = sim.state;
  const [tab, setTab] = useState<'buy' | 'sell'>('buy');
  const [msg, setMsg] = useState<string | null>(null);
  // Sell: rarities and places to sell from; every matching item is picked unless left out.
  const [rarities, setRarities] = useState<Set<Rarity>>(new Set(['common', 'magic']));
  const [from, setFrom] = useState<{ backpack: boolean; stash: boolean }>({
    backpack: true,
    stash: true,
  });
  const [kept, setKept] = useState<Set<number>>(new Set());
  const items = [...(from.backpack ? s.backpack : []), ...(from.stash ? s.stash : [])].filter((i) =>
    rarities.has(i.rarity),
  );
  const picked = items.filter((i) => !kept.has(i.uid));
  const total = picked.reduce((n, i) => n + sellPrice(i), 0);
  const toggleRarity = (r: Rarity) => {
    const next = new Set(rarities);
    if (next.has(r)) next.delete(r);
    else next.add(r);
    setRarities(next);
  };
  return (
    <div className="service" data-testid="shop">
      <div className="tabs">
        <button
          type="button"
          className={`tab${tab === 'buy' ? ' active' : ''}`}
          onClick={() => setTab('buy')}
        >
          {t('shop.buy')}
        </button>
        <button
          type="button"
          className={`tab${tab === 'sell' ? ' active' : ''}`}
          onClick={() => setTab('sell')}
          data-testid="shop-sell-tab"
        >
          {t('shop.sell')}
        </button>
      </div>
      {tab === 'buy' ? (
        <div className="mat-list">
          {[...sim.content.consumables.values()]
            .filter((c) => c.price)
            .map((c) => (
              <div key={c.id} className="mat-row shop-row2">
                <PixelIcon name={`consumable.${c.id}`} size={32} />
                <span>
                  {t(c.nameKey)}
                  <br />
                  <span className="muted small">
                    <PixelIcon name="gold" size={16} /> {c.price} ·{' '}
                    {t('shop.have', { n: s.consumables[c.id] ?? 0 })}
                  </span>
                </span>
                <span className="buy-buttons">
                  {[1, 10, 50].map((n) => (
                    <button
                      key={n}
                      type="button"
                      className="filter-chip"
                      disabled={s.gold < BigInt(c.price! * n)}
                      onClick={() => setMsg(tryIntent(() => sim.buy(c.id, n)))}
                      data-testid={`buy-${c.id}-${n}`}
                    >
                      +{n}
                    </button>
                  ))}
                </span>
              </div>
            ))}
        </div>
      ) : (
        <>
          <div className="muted small">{t('shop.sellRarities')}</div>
          <div className="choice-row" data-testid="sell-rarities">
            {RARITIES.map((r) => (
              <button
                key={r}
                type="button"
                className={`filter-chip${rarities.has(r) ? ' active' : ''}`}
                style={{ color: RARITY_COLOR[r] }}
                onClick={() => toggleRarity(r)}
                aria-pressed={rarities.has(r)}
              >
                {t(`rarity.${r}`)}
              </button>
            ))}
          </div>
          <div className="choice-row">
            {(['backpack', 'stash'] as const).map((k) => (
              <button
                key={k}
                type="button"
                className={`filter-chip${from[k] ? ' active' : ''}`}
                onClick={() => setFrom({ ...from, [k]: !from[k] })}
                aria-pressed={from[k]}
              >
                {t(k === 'backpack' ? 'backpack.title' : 'backpack.stash')}
              </button>
            ))}
          </div>
          <div className="muted small">{t('shop.tapToKeep')}</div>
          <div className="grid shop-grid">
            {items.length === 0 && <div className="muted">{t('shop.nothingToSell')}</div>}
            {items.map((item) => (
              <ItemCell
                key={item.uid}
                item={item}
                selected={!kept.has(item.uid)}
                onSelect={() => {
                  const next = new Set(kept);
                  if (next.has(item.uid)) next.delete(item.uid);
                  else next.add(item.uid);
                  setKept(next);
                }}
              />
            ))}
          </div>
          <button
            type="button"
            className="btn btn-primary"
            disabled={picked.length === 0}
            data-testid="sell-selected"
            onClick={() => {
              const n = picked.length;
              const err = tryIntent(() => sim.sell(picked.map((i) => i.uid)));
              setMsg(err ?? t('shop.sold', { n, gold: formatNumber(total) }));
              if (!err) setKept(new Set());
            }}
          >
            {t('shop.sellAll', { n: picked.length, gold: formatNumber(total) })}
          </button>
        </>
      )}
      {msg && <div className="small">{msg}</div>}
    </div>
  );
}

/**
 * A town keeper's dialog: portrait, a line of greeting and its services (goals, forge,
 * shop, stash, altar, hunts). Opens when the hero walks up to the keeper.
 */
export function NpcDialog() {
  const sim = useSim();
  const npc = useUi((s) => s.npc);
  const openNpc = useUi((u) => u.openNpc);
  const openScreen = useUi((u) => u.openScreen);
  const openBackpack = useUi((u) => u.openBackpack);
  const setTab = useUi((u) => u.setTab);
  const [note, setNote] = useState<string | null>(null);
  if (!npc) return null;
  const close = () => {
    setNote(null);
    openNpc(null);
  };
  const go = (fn: () => void) => {
    close();
    fn();
  };
  return (
    <div className="sheet-backdrop" onClick={close}>
      <section
        className="panel sheet npc-dialog"
        onClick={(e) => e.stopPropagation()}
        aria-label={t(`npc.${npc}`)}
        data-testid="npc-dialog"
      >
        <header className="npc-head">
          <NpcPortrait id={npc} />
          <div className="npc-words">
            <div className="pixel npc-name">{t(`npc.${npc}`)}</div>
            <p className="npc-line">{t(`npc.greet.${npc}`)}</p>
          </div>
          <button
            type="button"
            className="round-btn"
            aria-label={t('action.close')}
            onClick={close}
          >
            ✕
          </button>
        </header>
        {npc === 'elder' && (
          <div className="service">
            <button
              type="button"
              className="btn btn-primary wide"
              onClick={() => go(() => openScreen('quests'))}
              data-testid="npc-quests"
            >
              <PixelIcon name="quest" size={16} /> {t('npc.service.quests')}
              {claimableQuests(sim.state) > 0 && (
                <span className="badge">{claimableQuests(sim.state)}</span>
              )}
            </button>
          </div>
        )}
        {npc === 'smith' && (
          <>
            <Forge />
            <button
              type="button"
              className="btn wide"
              onClick={() => go(() => openScreen('smith'))}
            >
              {t('npc.service.refine')}
            </button>
          </>
        )}
        {npc === 'merchant' && <Shop />}
        {npc === 'banker' && (
          <div className="service">
            <button
              type="button"
              className="btn btn-primary wide"
              data-testid="deposit-all"
              disabled={sim.state.backpack.length === 0}
              onClick={() => {
                const err = tryIntent(() => {
                  const n = sim.depositAll();
                  setNote(t('stash.deposited', { n }));
                });
                if (err) setNote(err);
              }}
            >
              <PixelIcon name="chest" size={16} /> {t('npc.service.deposit')}
            </button>
            <button
              type="button"
              className="btn wide"
              onClick={() =>
                go(() => {
                  setTab('stash');
                  openBackpack(true);
                })
              }
            >
              {t('npc.service.stash', { n: sim.state.stash.length })}
            </button>
            {note && <div className="small tone-good">{note}</div>}
          </div>
        )}
        {npc === 'priestess' && (
          <div className="service">
            <button
              type="button"
              className="btn btn-primary wide"
              onClick={() => go(() => openScreen('altar'))}
            >
              <PixelIcon name="book" size={16} /> {t('npc.service.altar')}
            </button>
          </div>
        )}
        {npc === 'guard' && (
          <div className="service">
            <button
              type="button"
              className="btn btn-primary wide"
              onClick={() => go(() => openScreen('hunts'))}
            >
              <PixelIcon name="key" size={16} /> {t('npc.service.hunts')}
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
