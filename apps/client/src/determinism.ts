/** Dev-only page used by e2e/determinism.spec.ts: runs the shared engine scenario in the browser. */
import { runDeterminism } from '@valdren/engine/testing';

const el = document.getElementById('result')!;
const result = runDeterminism(100_000);
el.textContent = JSON.stringify(result);
el.dataset.done = 'true';
