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
  // The Abyss opens after the first region's bosses.
  await page.getByTestId('adv-tab-abyss').click();
  await expect(page.getByTestId('dungeon')).toContainText('Libera ao derrotar 3 chefes');
  await page.getByRole('button', { name: 'Fechar' }).last().click();

  // Goals: three for today and one for the week.
  await page.getByTestId('nav-quests').click();
  await expect(page.getByTestId('quest-2')).toBeVisible();
  await expect(page.getByTestId('quest-weekly')).toBeVisible();
  await page.getByRole('button', { name: 'Fechar' }).last().click();

  // Card album: every monster has a card, none found yet.
  await page.getByTestId('nav-cards').click();
  await expect(page.getByTestId('cards')).toContainText('0 de 35 cartas');
  await expect(page.getByTestId('card-card_bone_walker')).toContainText('???');
  await page.getByRole('button', { name: 'Fechar' }).last().click();

  // Jump to level 100 (debug, development builds only).
  await page.getByTestId('nav-settings').click();
  await page.getByTestId('debug-level').click();
  // Past the first minutes, the login calendar opens once a day.
  await page.getByTestId('login-claim').click();
  await expect(page.getByTestId('login-modal')).toBeHidden();
  await page.getByTestId('debug-resources').click();
  // Level 100 unlocks auto-equip; the best-hunt move still needs the region's bosses.
  await page.getByTestId('auto-equipBest').locator('input').check();
  await expect(page.getByTestId('auto-equipBest').locator('input')).toBeChecked();
  await expect(page.getByTestId('auto-bestHunt').locator('input')).toBeDisabled();
  await page.getByRole('button', { name: 'Fechar' }).last().click();
  await page.getByTestId('nav-quests').click();
  await expect(page.getByTestId('login-claim')).toHaveText('Volte amanhã');
  await page.getByRole('button', { name: 'Fechar' }).last().click();
  await expect(page.getByTestId('hero-level')).toHaveText('Nv. 100');

  // Journal: level achievements unlocked; a title can be shown next to the name.
  await page.getByTestId('nav-journal').click();
  await expect(page.getByTestId('ach-level_100')).toHaveClass(/done/);
  await page.getByTestId('ach-level_100').getByRole('button', { name: 'Usar' }).click();
  await expect(page.getByTestId('hero-title')).toHaveText('o Centenário');
  await page.getByTestId('journal-tab-bestiary').click();
  await expect(page.getByTestId('beast-bone_walker')).toBeVisible();
  await page.getByTestId('journal-tab-stats').click();
  await expect(page.getByTestId('journal-stats')).toContainText('Monstros derrotados');
  await page.getByRole('button', { name: 'Fechar' }).last().click();

  // Learn the first active skill: it fills the first slot.
  await page.getByTestId('nav-skills').click();
  await expect(page.getByTestId('skill-points')).toContainText('50 pontos');
  await page.getByRole('button', { name: 'Aprender Golpe pesado' }).click();
  await expect(page.getByTestId('slot-0')).toContainText('Golpe pesado');
  await page.getByRole('button', { name: 'Fechar' }).last().click();

  // Reset: back to level 1 with reset points; the shop opens.
  await page.getByTestId('nav-altar').click();
  await expect(page.getByTestId('reset-points')).toContainText('Ganha 10 pontos');
  await page.getByTestId('reset-button').click();
  await page.getByTestId('reset-confirm').click();
  await expect(page.getByText('Renascido! +10 pontos de reset.')).toBeVisible();
  await expect(page.getByTestId('hero-level')).toHaveText('Nv. 1');
  await page.getByTestId('upgrade-wisdom').getByRole('button').click();
  await expect(page.getByTestId('upgrade-wisdom')).toContainText('1/40');

  expect(errors).toEqual([]);
});
