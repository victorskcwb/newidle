import { availableParallelism } from 'node:os';
import { Worker } from 'node:worker_threads';
import { encodeSave, type GameState, type RateSheet } from '@abismo/engine';
import type { RatesJob } from './ratesWorker.ts';

interface Pending {
  resolve(r: RateSheet): void;
  reject(e: Error): void;
}

/**
 * A few worker threads that compute rate sheets, so a burst of logins after a restart never
 * blocks the game loop. Each job goes to the worker with the fewest jobs waiting.
 */
export class RatesPool {
  private workers: { worker: Worker; busy: number }[] = [];
  private pending = new Map<number, Pending>();
  private nextId = 1;

  constructor(size = Math.max(1, availableParallelism() - 1)) {
    for (let i = 0; i < size; i++) {
      const worker = new Worker(new URL('./ratesWorker.ts', import.meta.url));
      const slot = { worker, busy: 0 };
      worker.on('message', (m: { id: number; rates?: RateSheet; error?: string }) => {
        slot.busy--;
        const p = this.pending.get(m.id);
        this.pending.delete(m.id);
        if (m.rates) p?.resolve(m.rates);
        else p?.reject(new Error(m.error ?? 'rates failed'));
      });
      this.workers.push(slot);
    }
  }

  compute(state: GameState, huntId: string): Promise<RateSheet> {
    const id = this.nextId++;
    const slot = this.workers.reduce((a, b) => (b.busy < a.busy ? b : a));
    slot.busy++;
    const job: RatesJob = { id, save: encodeSave(state, 0), huntId };
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      slot.worker.postMessage(job);
    });
  }

  async close() {
    await Promise.all(this.workers.map((w) => w.worker.terminate()));
  }
}
