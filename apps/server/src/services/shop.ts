import type { ContentDb } from '@valdren/content';
import { errors } from '../errors.ts';
import { COINS, type InventoryService } from './inventory.ts';

/** NPC shops buy at 40% of the item's base value (section 8.2). */
export const SHOP_BUY_PERCENT = 40;

export function shopPrice(baseValue: number, qty: number): number {
  return Math.floor((baseValue * qty * SHOP_BUY_PERCENT) / 100);
}

export class ShopService {
  constructor(
    private readonly inventory: InventoryService,
    private readonly content: ContentDb,
  ) {}

  /** Sells items to the NPC shop in one transaction; returns the coins received. */
  async sell(characterId: string, itemId: string, qty: number): Promise<number> {
    const item = this.content.items.get(itemId);
    if (!item) throw errors.unknownItem(itemId);
    const coins = shopPrice(item.baseValue, qty);
    await this.inventory.change(
      characterId,
      [
        { itemId, delta: -qty },
        { itemId: COINS, delta: coins },
      ],
      'shop',
    );
    return coins;
  }
}
