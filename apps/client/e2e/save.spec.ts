import { SAVE_VERSION } from '@abismo/engine';
import { expect, test } from '@playwright/test';
import { createHero, waitForLoot } from './helpers.ts';

const TWO_HOURS = 2 * 60 * 60 * 1000;

/**
 * Section 12.1: create hero → hunt → equip an item → refine → close → move the clock 2 h
 * ahead → the "while you were away" summary.
 */
test('the save survives closing the game and 2 hours away are resolved offline', async ({
  context,
}) => {
  const page = await context.newPage();
  await createHero(page, 'Viajante');
  await waitForLoot(page);

  await page.getByTestId('backpack-button').click();
  await page.getByTestId('backpack').getByTestId('item-cell').nth(1).click();
  await page.getByRole('button', { name: 'Equipar', exact: true }).click();
  await page.getByRole('button', { name: 'Fechar' }).click();

  // Refine the weapon at the blacksmith (+1 always succeeds). Debug resources pay for it.
  await page.getByTestId('nav-settings').click();
  await page.getByTestId('debug-resources').click();
  await page.getByRole('button', { name: 'Fechar' }).click();
  await page.getByTestId('nav-smith').click();
  await expect(page.getByTestId('refine-chance')).toContainText('chance de 100%');
  await page.getByTestId('refine-button').click();
  await expect(page.getByTestId('refine-result')).toContainText('Sucesso! Agora +1.');
  await page.getByRole('button', { name: 'Fechar' }).click();
  const level = await page.getByTestId('hero-level').textContent();
  // Equipping saves right away; give the write a moment, then close the game.
  await page.waitForTimeout(1_000);
  await page.close();

  // Same browser profile (same IndexedDB), with the clock 2 hours ahead.
  const later = await context.newPage();
  await later.clock.install({ time: Date.now() + TWO_HOURS });
  await later.goto('/');
  const modal = later.getByTestId('offline-modal');
  await expect(modal).toBeVisible();
  await expect(later.getByTestId('offline-time')).toContainText(/2 h|1 h 59 min/);
  await expect(later.getByTestId('offline-kills')).toContainText(/\d+ abates/);
  await later.getByTestId('offline-continue').click();
  await expect(modal).toBeHidden();

  // Same hero, not a new one, and still hunting.
  await expect(later.getByText('Viajante').first()).toBeVisible();
  const after = Number((await later.getByTestId('hero-level').textContent())!.replace(/\D/g, ''));
  expect(after).toBeGreaterThanOrEqual(Number(level!.replace(/\D/g, '')));
});

test('export and import the save as text', async ({ page }) => {
  await createHero(page, 'Exportado');
  await page.getByTestId('nav-settings').click();
  await page.getByTestId('open-save').click();
  const text = await page.getByTestId('export-text').inputValue();
  expect(JSON.parse(text)).toMatchObject({
    version: SAVE_VERSION,
    state: { hero: { name: 'Exportado' } },
  });

  await page.getByTestId('import-text').fill('isto não é um save');
  await page.getByRole('button', { name: 'Importar', exact: true }).click();
  await expect(page.getByTestId('save')).toContainText('Save inválido');

  const renamed = text.replace('"name":"Exportado"', '"name":"Importado"');
  await page.getByTestId('import-text').fill(renamed);
  await page.getByRole('button', { name: 'Importar', exact: true }).click();
  await expect(page.getByText('Importado').first()).toBeVisible();
});
