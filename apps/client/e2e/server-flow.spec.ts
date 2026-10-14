import { expect, test } from '@playwright/test';

/**
 * Against the real server: sign up → create a hero → mine copper (simulated on the server and
 * mirrored by the client) → reload and keep going → sell-to-shop resync → log out.
 */
test('sign up, create a hero, mine on the server and resume after a reload', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const tag = Math.random().toString(36).slice(2, 8);

  await page.goto('/');
  await page.getByLabel('Email').fill(`e2e_${tag}@example.com`);
  await page.getByLabel('Senha').fill('senha muito segura');
  await page.getByRole('button', { name: 'Criar conta' }).first().click();

  await expect(page.getByRole('heading', { name: 'Crie seu herói' })).toBeVisible();
  await expect(page.locator('.hero-preview canvas')).toBeVisible();
  await page.getByLabel('Nome').fill(`E2e ${tag}`);
  await page.getByRole('button', { name: 'Cor 3' }).nth(2).click();
  await page.getByRole('button', { name: 'Começar a aventura' }).click();

  await expect(page.getByTestId('scene').locator('canvas')).toBeVisible();
  await expect(page.locator('.bank-item', { hasText: 'Picareta de bronze' })).toBeVisible();
  await page.getByRole('button', { name: 'Começar' }).first().click();
  await expect(page.getByRole('heading', { name: 'Minerar cobre' })).toBeVisible();
  // Server-authoritative: the first ore appears after 5 ticks (+1 tick render delay).
  const ore = page.locator('.bank-item', { hasText: 'Minério de cobre' });
  await expect(ore).toBeVisible({ timeout: 8_000 });

  // Smelting without tin: the button is disabled and the reason is shown (section 11.3).
  await page.getByRole('button', { name: /^Forja/ }).click();
  const smelt = page.locator('.action', { hasText: 'Fundir barra de bronze' });
  await expect(smelt.getByText('Falta Minério de estanho')).toBeVisible();
  await expect(smelt.getByRole('button', { name: 'Começar' })).toBeDisabled();

  // Reload: the session cookie keeps us in, and the server-side slot kept mining.
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Minerar cobre' })).toBeVisible();
  const before = Number((await ore.locator('.bank-qty').textContent())?.replace(/\D/g, ''));
  await expect
    .poll(async () => Number((await ore.locator('.bank-qty').textContent())?.replace(/\D/g, '')), {
      timeout: 8_000,
    })
    .toBeGreaterThan(before);

  await page.getByRole('button', { name: 'Sair' }).click();
  await expect(page.getByRole('button', { name: 'Criar conta' }).first()).toBeVisible();
  expect(errors).toEqual([]);
});
