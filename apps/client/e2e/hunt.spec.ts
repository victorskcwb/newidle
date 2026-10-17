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

test('going back to town shows the village and the hunt resumes after', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await createHero(page, 'Viajante', 2);
  await page.getByRole('button', { name: 'Voltar à cidade' }).click();
  await expect(page.getByTestId('town-overlay')).toContainText('Vila de Cinzarra', {
    timeout: 30_000,
  });
  await page.getByRole('button', { name: 'Caçar' }).click();
  await expect(page.getByTestId('town-overlay')).toBeHidden({ timeout: 30_000 });
  expect(errors).toEqual([]);
});

test('in town the merchant sells potions and the smith forges an item', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await createHero(page, 'Comprador', 2);
  await page.evaluate(() =>
    (window as unknown as { abismo: { debugResources(): void } }).abismo.debugResources(),
  );
  await page.getByRole('button', { name: 'Voltar à cidade' }).click();
  await expect(page.getByTestId('town-overlay')).toBeVisible({ timeout: 30_000 });
  const ui = (id: string) =>
    page.evaluate(
      (npc) =>
        (window as unknown as { abismoUi: { getState(): { openNpc(n: string): void } } }).abismoUi
          .getState()
          .openNpc(npc),
      id,
    );
  await ui('merchant');
  const potions = page.getByTestId('hud-potions');
  const before = Number(await potions.textContent());
  await page.getByTestId('buy-potion_hp_small-10').click();
  await expect(potions).toHaveText(String(before + 10));
  await ui('smith');
  await page.getByTestId('forge-button').click();
  await expect(page.getByTestId('forge')).toContainText('Forjado!');
  expect(errors).toEqual([]);
});
