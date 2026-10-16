import { expect, test } from '@playwright/test';
import { createHero } from './helpers.ts';

/**
 * Section 12.1, performance: fights with effects and floating numbers on a mid-range phone
 * profile (Pixel 7 viewport, CPU throttled 4× through the DevTools protocol).
 * Opt-in (`PERF=1 pnpm --filter @abismo/client test:e2e`): CI machines have no GPU, so a
 * frame-rate assertion there would measure the CI box, not the game.
 */
test.skip(!process.env.PERF, 'set PERF=1 to measure the frame rate');

test('keeps close to 60 fps while fighting on a throttled phone profile', async ({ page }) => {
  await createHero(page, 'Medidor', 2);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await expect(page.getByTestId('event-log')).toContainText('derrotado!', { timeout: 60_000 });

  const fps = await page.evaluate(
    () =>
      new Promise<{ fps: number; worst: number }>((resolve) => {
        const frames: number[] = [];
        const start = performance.now();
        const tick = (now: number) => {
          frames.push(now);
          if (now - start < 10_000) requestAnimationFrame(tick);
          else {
            const gaps = frames.slice(1).map((f, i) => f - frames[i]!);
            gaps.sort((a, b) => a - b);
            resolve({
              fps: (frames.length - 1) / ((frames.at(-1)! - frames[0]!) / 1000),
              worst: gaps[Math.floor(gaps.length * 0.99)]!,
            });
          }
        };
        requestAnimationFrame(tick);
      }),
  );
  console.log(`fps ${fps.fps.toFixed(1)}, 99th percentile frame ${fps.worst.toFixed(1)} ms`);
  expect(fps.fps).toBeGreaterThanOrEqual(55);
});
