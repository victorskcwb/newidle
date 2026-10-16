/// <reference lib="webworker" />
import { loadContent } from '@abismo/content';
import { computeRates, decodeSave } from '@abismo/engine';

/**
 * Builds rate sheets off the main thread (an 8 h sample takes ~300 ms). The state travels as
 * an encoded save, so bigints and the format checks are the same as on disk.
 */
const content = loadContent();

export interface RatesRequest {
  id: number;
  save: string;
  huntId: string;
}

self.onmessage = (e: MessageEvent<RatesRequest>) => {
  const { id, save, huntId } = e.data;
  const { state } = decodeSave(save, content);
  const rates = computeRates(state, content, huntId);
  self.postMessage({ id, rates });
};
