import { expect, test, type Page } from '@playwright/test';
import { createHero } from './helpers.ts';

type Window = {
  abismo: {
    state: {
      hunt: { difficulty: string } | null;
      settings: { skillRules: Record<string, unknown> };
    };
    debugLevel(level: number): void;
  };
};

const state = (page: Page) =>
  page.evaluate(() => {
    const s = (window as unknown as Window).abismo.state;
    return { difficulty: s.hunt?.difficulty, rules: s.settings.skillRules };
  });

/** Decision 168 (difficulty) and 170 (resistances) on the hunt sheet. */
test('hunt sheet: monster resistances and choosing the difficulty', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await createHero(page, 'Estrategista', 2);

  await page.getByTestId('hunt-name').click();
  await page.getByTestId('hunt-forgotten_cemetery').click();
  const info = page.getByTestId('hunt-info');
  // The undead of the cemetery take 15% more fire damage.
  await expect(info.locator('.resistances').first()).toContainText('fogo −15%');

  // Hard opens only after the hunt's boss; Easy is always open.
  await expect(info.getByTestId('difficulty-hard')).toBeDisabled();
  await expect(info.getByTestId('difficulty-normal')).toHaveAttribute('aria-checked', 'true');
  await expect(info.getByTestId('map-hunt')).toBeDisabled();
  await info.getByTestId('difficulty-easy').click();
  await expect(info.getByTestId('difficulty-easy')).toHaveAttribute('aria-checked', 'true');
  await expect(info).toContainText('-20% de chance de item mágico');
  await info.getByTestId('map-hunt').click();

  expect((await state(page)).difficulty).toBe('easy');
  await page.getByTestId('hunt-name').click();
  await expect(page.getByTestId('hunt-forgotten_cemetery')).toContainText('Caçando aqui · Fácil', {
    timeout: 30_000,
  });
  expect(errors).toEqual([]);
});

/** Decision 169: a rule for a slotted skill, saved, summarized and kept after a reload. */
test('skill rules: a preset, a custom condition, and the rule survives a reload', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await createHero(page, 'Tático', 2);
  await page.evaluate(() => (window as unknown as Window).abismo.debugLevel(10));
  // Past the first minutes, the login calendar opens once a day.
  await page.getByTestId('login-claim').click();
  await expect(page.getByTestId('login-modal')).toBeHidden();

  await page.getByTestId('nav-skills').click();
  await page.getByRole('button', { name: 'Aprender Golpe pesado' }).click();
  await expect(page.getByTestId('slot-0')).toContainText('Golpe pesado');

  const rule = page.getByTestId('rule-heavy_strike');
  await expect(rule).toContainText('sempre que estiver pronta');
  await page.getByTestId('rule-edit-heavy_strike').click();
  await rule.getByRole('button', { name: 'Só em chefes' }).click();
  await rule.getByRole('button', { name: '+ condição' }).click();
  await rule.getByLabel('Valer quando forem verdade').selectOption('all');
  await rule.locator('.skill-rule-row').nth(1).getByLabel('%').fill('30');
  await page.getByTestId('rule-save-heavy_strike').click();
  await expect(rule).toContainText('só quando o alvo é um chefe e a vida está abaixo de 30%');

  expect((await state(page)).rules).toEqual({
    heavy_strike: {
      logic: 'all',
      conditions: [
        { kind: 'target', is: 'boss' },
        { kind: 'hero_hp', op: 'below', pct: 30 },
      ],
    },
  });

  // Settings save right away: the rule is still there after reloading the game.
  await page.waitForTimeout(1_000);
  await page.reload();
  await expect(page.locator('[data-testid="scene"] canvas').first()).toBeVisible();
  expect((await state(page)).rules).toHaveProperty('heavy_strike.conditions.length', 2);

  // "Usar sempre" removes the rule.
  await page.getByTestId('nav-skills').click();
  await page.getByTestId('rule-edit-heavy_strike').click();
  await page.getByTestId('rule-clear-heavy_strike').click();
  await expect(page.getByTestId('rule-heavy_strike')).toContainText('sempre que estiver pronta');
  expect((await state(page)).rules).toEqual({});
  expect(errors).toEqual([]);
});
