import { expect, test } from '@playwright/test';
import { DETERMINISM_GOLDEN_100K } from '@valdren/engine/testing';

test('engine in the browser matches Node: same hash and events after 100,000 ticks', async ({
  page,
}) => {
  await page.goto('/determinism.html');
  const result = page.locator('#result[data-done="true"]');
  await expect(result).toBeVisible({ timeout: 60_000 });
  expect(JSON.parse((await result.textContent()) ?? '')).toEqual(DETERMINISM_GOLDEN_100K);
});

test('test page renders the scene and starts mining copper', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.getByTestId('scene').locator('canvas')).toBeVisible();
  await page.getByRole('button', { name: 'Começar' }).first().click();
  await expect(page.getByRole('heading', { name: 'Minerar cobre' })).toBeVisible();
  // First ore: 5 ticks (3 s) + 1 tick render delay.
  await expect(page.locator('.bank-item', { hasText: 'Minério de cobre' })).toBeVisible({
    timeout: 6_000,
  });
  expect(errors).toEqual([]);
});
