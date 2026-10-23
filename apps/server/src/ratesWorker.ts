import { parentPort } from 'node:worker_threads';
import { loadContent } from '@abismo/content';
import { computeRates, decodeSave } from '@abismo/engine';

/**
 * Builds rate sheets off the event loop (~1.5 s each). The state travels as save text, like in
 * the client's rates worker, so bigints and the format checks are the same as on disk.
 */
const content = loadContent();

export interface RatesJob {
  id: number;
  save: string;
  huntId: string;
}

parentPort!.on('message', (job: RatesJob) => {
  try {
    const { state } = decodeSave(job.save, content);
    parentPort!.postMessage({ id: job.id, rates: computeRates(state, content, job.huntId) });
  } catch (e) {
    parentPort!.postMessage({ id: job.id, error: String(e) });
  }
});
