import { addItem, type ItemStack } from '@valdren/engine';
import { formatNumber, t } from '../../i18n.ts';
import { useGame } from '../../state/store.ts';
import { itemName } from './SkillsPanel.tsx';

/** Bank plus the not-yet-deposited action inventory, as one grid. */
export function BankPanel() {
  const slot = useGame((s) => s.slot);
  const all: ItemStack[] = [];
  for (const s of [...slot.bank, ...slot.inventory]) addItem(all, s.itemId, s.qty);

  return (
    <section className="card" aria-label={t('ui.bank')}>
      <h2 className="card-title">{t('ui.bank')}</h2>
      {all.length === 0 ? (
        <p className="muted">{t('ui.bankEmpty')}</p>
      ) : (
        <ul className="bank-grid">
          {all.map((s) => (
            <li key={s.itemId} className="bank-item" title={itemName(s.itemId)}>
              <span className="bank-name">{itemName(s.itemId)}</span>
              <span className="bank-qty">{formatNumber(s.qty)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
