import { expect, test } from '@playwright/test';
import { createHero } from './helpers.ts';

/** The Abyss: enter after the first region's bosses, climb, see the floor, leave. */
test('a dungeon run', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await createHero(page, 'Abissal', 1);

  // A strong hero who has beaten Cinzarra's bosses (debug level, then an edited save).
  await page.getByTestId('nav-settings').click();
  await page.getByTestId('debug-level').click();
  await page.getByTestId('login-claim').click();
  await page.getByTestId('open-save').click();
  const save = JSON.parse(await page.getByTestId('export-text').inputValue());
  save.state.defeatedBosses = ['gravekeeper', 'spider_matriarch', 'lord_vharok'];
  await page.getByTestId('import-text').fill(JSON.stringify(save));
  await page.getByRole('button', { name: 'Importar', exact: true }).click();

  await page.getByTestId('hunt-name').click();
  await page.getByTestId('adv-tab-abyss').click();
  await page.getByTestId('dungeon-enter').click();
  await expect(page.getByTestId('dungeon-floor')).toContainText('Abismo · andar 1');
  await expect(page.getByTestId('dungeon-floor')).toContainText('andar 2', { timeout: 30_000 });
  await page.screenshot({ path: process.env.SHOT ?? 'test-results/dungeon.png' });

  await page.getByTestId('dungeon-floor').click();
  await page.getByTestId('dungeon-leave').click();
  await expect(page.getByTestId('dungeon-best')).toHaveText(/^[1-9]/);
  expect(errors).toEqual([]);
});
