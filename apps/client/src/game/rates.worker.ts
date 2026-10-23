/// <reference lib="webworker" />
import { loadContent } from '@abismo/content';
import { computeRates, decodeSave, RATE_SAMPLE_TICKS, type HuntDifficulty } from '@abismo/engine';

/**
 * Builds rate sheets off the main thread (an 8 h sample takes ~300 ms). The state travels as
 * an encoded save, so bigints and the format checks are the same as on disk.
 */
const content = loadContent();

export interface RatesRequest {
  id: number;
  save: string;
  huntId: string;
  /** Absent: the difficulty chosen in that hunt, or normal. */
  difficulty?: HuntDifficulty;
}

self.onmessage = (e: MessageEvent<RatesRequest>) => {
  const { id, save, huntId, difficulty } = e.data;
  const { state } = decodeSave(save, content);
  const rates = computeRates(state, content, huntId, RATE_SAMPLE_TICKS, difficulty);
  self.postMessage({ id, rates });
};
