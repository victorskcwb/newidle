import { expect, test } from '@playwright/test';
import { createHero } from './helpers.ts';

/** Skills, hunt map, reset at level 100 (debug jump, section 13) and the reset shop. */
test('skills, hunt map, reset and reset shop', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await createHero(page, 'Renascido', 1);

  // Hunt map: the first hunt is open, the next one is locked by the cemetery boss.
  await page.getByTestId('hunt-name').click();
  await expect(page.getByTestId('hunt-forgotten_cemetery')).toContainText('abates/h', {
    timeout: 20_000,
  });
  await expect(page.getByTestId('hunt-pale_woods')).toContainText('Derrote O Coveiro');
  await page.getByRole('button', { name: 'Fechar' }).click();

  // Jump to level 100 (debug, development builds only).
  await page.getByTestId('menu-button').click();
  await page.getByTestId('menu-settings').click();
  await page.getByTestId('debug-level').click();
  await page.getByTestId('debug-resources').click();
  await page.getByRole('button', { name: 'Voltar', exact: true }).click();
  await expect(page.getByTestId('hero-level')).toHaveText('Nv. 100');

  // Learn the first active skill: it fills the first slot.
  await page.getByTestId('menu-skills').click();
  await expect(page.getByTestId('skill-points')).toContainText('50 pontos');
  await page.getByRole('button', { name: 'Aprender Golpe pesado' }).click();
  await expect(page.getByTestId('slot-0')).toContainText('Golpe pesado');
  await page.getByRole('button', { name: 'Voltar', exact: true }).click();

  // Reset: back to level 1 with reset points; the shop opens.
  await page.getByTestId('menu-altar').click();
  await expect(page.getByTestId('reset-points')).toContainText('Ganha 10 pontos');
  await page.getByTestId('reset-button').click();
  await page.getByTestId('reset-confirm').click();
  await expect(page.getByText('Renascido! +10 pontos de reset.')).toBeVisible();
  await expect(page.getByTestId('hero-level')).toHaveText('Nv. 1');
  await page.getByTestId('upgrade-wisdom').getByRole('button').click();
  await expect(page.getByTestId('upgrade-wisdom')).toContainText('1/40');

  expect(errors).toEqual([]);
});
