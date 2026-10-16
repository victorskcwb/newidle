import {
  MAX_LEVEL,
  TICK_MS,
  TICKS_PER_HOUR,
  offlineCapTicks,
  potionHoursLeft,
  totalXpToReach,
} from '@abismo/engine';
import { t } from '../i18n.ts';
import type { GameSim } from './sim.ts';

/**
 * Reminders while the game is in the background (milestone 2): when the potions would run
 * out, when the hero reaches level 100 and when the offline limit is reached. They are
 * predicted from the rate sheet when the page is hidden and cancelled when it comes back.
 * With the page closed nothing fires: that needs server push (online milestone).
 */
export class Reminders {
  private timers: ReturnType<typeof setTimeout>[] = [];
  enabled = false;

  constructor(private sim: GameSim) {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.schedule();
      else this.cancel();
    });
  }

  static supported(): boolean {
    return typeof Notification !== 'undefined';
  }

  /** Asks the browser for permission (must be called from a tap). */
  static async request(): Promise<boolean> {
    if (!Reminders.supported()) return false;
    if (Notification.permission === 'granted') return true;
    return (await Notification.requestPermission()) === 'granted';
  }

  private cancel() {
    for (const id of this.timers) clearTimeout(id);
    this.timers = [];
  }

  private at(hours: number, title: string, body: string) {
    // Speed only applies to development runs (?speed=N).
    const ms = (hours * TICKS_PER_HOUR * TICK_MS) / this.sim.speed;
    if (!(ms > 0) || ms > 2 ** 31 - 1) return;
    this.timers.push(setTimeout(() => void show(title, body), ms));
  }

  schedule() {
    this.cancel();
    if (!this.enabled || !Reminders.supported() || Notification.permission !== 'granted') return;
    const s = this.sim.state;
    const rates = this.sim.rates;
    const hunting = s.hunt !== null && s.activity.kind !== 'idle_town';
    const capHours = offlineCapTicks(s.hero, this.sim.content) / TICKS_PER_HOUR;
    if (hunting) this.at(capHours, t('notify.title'), t('notify.offlineCap'));
    if (!hunting || !rates) return;
    const potionId = s.settings.hpPotionId;
    const potionHours = potionHoursLeft(rates, potionId, {
      stock: s.consumables[potionId] ?? 0,
      gold: Number(s.gold),
      price: this.sim.content.consumables.get(potionId)?.price ?? 0,
      autoBuy: s.settings.potionTarget > 0,
    });
    if (potionHours !== null && potionHours < capHours) {
      this.at(potionHours, t('notify.title'), t('notify.noPotions'));
    }
    if (s.hero.level < MAX_LEVEL && rates.xpPerHour > 0) {
      const missing = totalXpToReach(MAX_LEVEL) - totalXpToReach(s.hero.level) - s.hero.xp;
      const hours = missing / rates.xpPerHour;
      if (hours < capHours) this.at(hours, t('notify.title'), t('notify.level100'));
    }
  }
}

async function show(title: string, body: string) {
  const options = { body, icon: 'icons/icon-192.png', tag: body };
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) {
      await reg.showNotification(title, options);
      return;
    }
  } catch {
    // Fall back to a page notification below.
  }
  new Notification(title, options);
}
