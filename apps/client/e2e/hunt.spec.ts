import { expect, test } from '@playwright/test';

/**
 * The first-task loop on a phone-sized screen: the hero hunts on its own, monsters die,
 * loot reaches the backpack and an item shows its rarity and affixes.
 * `?speed=6` (dev builds only) makes the game run 6× faster so the test is short.
 */
test('the hero hunts, kills, loots and the backpack shows the items', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?speed=6');

  await expect(page.locator('[data-testid="scene"] canvas')).toBeVisible();
  await expect(page.getByTestId('hero-level')).toHaveText(/Nv\. \d+/);

  const log = page.getByTestId('event-log');
  await expect(log).toContainText('Caçada: Cemitério Esquecido');
  await expect(log).toContainText('derrotado!', { timeout: 45_000 });
  await expect(page.getByTestId('rates')).toContainText('abates/h', { timeout: 15_000 });

  // Wait for the first item to reach the backpack (12% drop chance per kill).
  const backpack = page.getByTestId('backpack-button');
  await expect(backpack).not.toContainText('0/40', { timeout: 90_000 });
  await backpack.click();
  const cells = page.getByTestId('backpack').getByTestId('item-cell');
  // The equipped sword is the first cell; backpack items follow it.
  await expect(cells.nth(1)).toBeVisible();
  await cells.nth(1).click();
  const card = page.getByTestId('item-card');
  await expect(card).toContainText(/Comum|Mágico|Raro|Épico|Lendário/);
  await expect(card).toContainText('Nível do item');

  expect(errors).toEqual([]);
});
