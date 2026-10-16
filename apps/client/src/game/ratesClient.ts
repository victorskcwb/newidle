import { encodeSave, type GameState, type RateSheet } from '@abismo/engine';
import type { RatesRequest } from './rates.worker.ts';

/** Asks the rates worker for a rate sheet; requests are answered in order. */
export class RatesClient {
  private worker = new Worker(new URL('./rates.worker.ts', import.meta.url), { type: 'module' });
  private nextId = 1;
  private pending = new Map<number, (r: RateSheet) => void>();

  constructor() {
    this.worker.onmessage = (e: MessageEvent<{ id: number; rates: RateSheet }>) => {
      this.pending.get(e.data.id)?.(e.data.rates);
      this.pending.delete(e.data.id);
    };
  }

  compute(state: GameState, huntId: string): Promise<RateSheet> {
    const id = this.nextId++;
    const request: RatesRequest = { id, save: encodeSave(state, 0), huntId };
    return new Promise((resolve) => {
      this.pending.set(id, resolve);
      this.worker.postMessage(request);
    });
  }
}
