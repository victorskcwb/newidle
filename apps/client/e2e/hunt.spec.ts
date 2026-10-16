import { expect, test } from '@playwright/test';
import { createHero, waitForLoot } from './helpers.ts';

/**
 * The hunt loop on a phone-sized screen: the hero hunts on its own, monsters die, loot
 * reaches the backpack and an item shows its rarity and affixes.
 * `?speed=6` (dev builds only) makes the game run 6× faster so the test is short.
 */
test('the hero hunts, kills, loots and the backpack shows the items', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await createHero(page);

  await expect(page.getByTestId('hero-level')).toHaveText(/Nv\. \d+/);
  await expect(page.getByTestId('event-log')).toContainText('derrotado!', { timeout: 45_000 });
  await expect(page.getByTestId('rates')).toContainText('abates/h', { timeout: 15_000 });

  await waitForLoot(page);
  await page.getByTestId('backpack-button').click();
  const cells = page.getByTestId('backpack').getByTestId('item-cell');
  // The equipped sword is the first cell; backpack items follow it.
  await expect(cells.nth(1)).toBeVisible();
  await cells.nth(1).click();
  const card = page.getByTestId('item-card');
  await expect(card).toContainText(/Comum|Mágico|Raro|Épico|Lendário/);
  await expect(card).toContainText('Nível do item');

  expect(errors).toEqual([]);
});

test('hero creation validates the name and only offers the Guerreiro', async ({ page }) => {
  await page.goto('/');
  const start = page.getByTestId('create-hero');
  await expect(start).toBeDisabled();
  await page.getByTestId('hero-name').fill('a');
  await expect(start).toBeDisabled();
  await page.getByTestId('hero-name').fill('Lia das Cinzas');
  await expect(start).toBeEnabled();
  await expect(page.getByText('Libera no reset 5')).toBeVisible();
});
