import { expect, test } from '@playwright/test';
import { createHero } from './helpers.ts';

/** Professions: pick a gathering profession and a recipe while hunting. */
test('gathering and production while hunting', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await createHero(page, 'Mineira', 1);
  await page.getByTestId('nav-professions').click();
  await page.getByTestId('gather-mining').click();
  await expect(page.getByTestId('gather-now')).toContainText('Minério de cobre');
  await page.getByTestId('recipe-smith_fragments').click();
  await expect(page.getByTestId('recipe-smith_fragments')).toHaveText('Parar');
  // A recipe above the level stays locked.
  await expect(page.getByTestId('recipe-smith_tempering_iron')).toBeDisabled();
  await page.getByRole('button', { name: 'Fechar' }).last().click();
  expect(errors).toEqual([]);
});
