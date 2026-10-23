import { expect, test, type Page } from '@playwright/test';

type Abismo = {
  abismo: {
    state: { lifetime: { kills: bigint } };
    link: { replica: { stats: Record<string, number> } };
  };
};

const kills = (page: Page) =>
  page.evaluate(() => Number((window as unknown as Abismo).abismo.state.lifetime.kills));
const stats = (page: Page) =>
  page.evaluate(() => (window as unknown as Abismo).abismo.link.replica.stats);

/**
 * Fase 1 acceptance (docs/plan-fase-1.md): play as a guest, link an e-mail, sign in on another
 * device and find the same hero; the first device is told the account was opened elsewhere.
 * Editing the browser's own storage changes nothing: online, the hero is the server's.
 */
test('online: guest, hero, linked e-mail, and the same hero on another device', async ({
  browser,
}) => {
  const email = `e2e-${crypto.randomUUID()}@example.com`;
  const password = 'senha-forte-123';
  const device = async () => {
    const context = await browser.newContext({ locale: 'pt-BR' });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    return { page, errors };
  };

  const phone = await device();
  await phone.page.goto('/?online=1');
  await phone.page.getByTestId('auth-guest').click();
  await phone.page.getByTestId('hero-name').fill('Viajante Online');
  await phone.page.getByTestId('create-hero').click();
  await expect(phone.page.locator('[data-testid="scene"] canvas').first()).toBeVisible();
  await phone.page.getByTestId('tip-ok').click();
  if (!(await phone.page.getByTestId('event-log').isVisible()))
    await phone.page.getByTestId('nav-log').click();
  await expect(phone.page.getByTestId('event-log')).toContainText('derrotado!', {
    timeout: 60_000,
  });

  // The replica agrees with the server: checkpoints (tick 0, then every 30 s) compared and matched.
  await expect
    .poll(async () => (await stats(phone.page)).checkpointsVerified, { timeout: 60_000 })
    .toBeGreaterThan(1);
  expect(await stats(phone.page)).toMatchObject({
    resyncs: 0,
    checkpointMismatches: 0,
    lateIntents: 0,
  });

  // Link an e-mail to the guest account (Options → Account).
  await phone.page.getByTestId('nav-settings').click();
  await expect(phone.page.getByTestId('account')).toContainText('Conta de convidado');
  await phone.page.getByTestId('link-email').fill(email);
  await phone.page.getByTestId('link-password').fill(password);
  await phone.page.getByTestId('link-submit').click();
  await expect(phone.page.getByTestId('account')).toContainText(email);
  await phone.page.getByRole('button', { name: 'Fechar' }).last().click();
  const before = await kills(phone.page);
  expect(before).toBeGreaterThan(0);

  // Wiping the browser's local data changes nothing on the server.
  await phone.page.evaluate(() => indexedDB.deleteDatabase('keyval-store'));

  const pc = await device();
  await pc.page.goto('/?online=1');
  await pc.page.getByTestId('auth-login').click();
  await pc.page.getByTestId('auth-email').fill(email);
  await pc.page.getByTestId('auth-password').fill(password);
  await pc.page.getByTestId('auth-submit').click();
  await expect(pc.page.locator('[data-testid="scene"] canvas').first()).toBeVisible();
  await expect(pc.page.getByText('Viajante Online').first()).toBeVisible();
  expect(await kills(pc.page)).toBeGreaterThanOrEqual(before);
  await expect(phone.page.getByTestId('net-taken')).toBeVisible();

  expect(phone.errors).toEqual([]);
  expect(pc.errors).toEqual([]);
});

test('online: a wrong password is refused', async ({ page }) => {
  await page.goto('/?online=1');
  await page.getByTestId('auth-login').click();
  await page.getByTestId('auth-email').fill(`nobody-${crypto.randomUUID()}@example.com`);
  await page.getByTestId('auth-password').fill('qualquer-coisa');
  await page.getByTestId('auth-submit').click();
  await expect(page.getByRole('alert')).toContainText('E-mail ou senha errados.');
});

test('online: the hero played on this device is brought into a new account', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  // A local (offline) hero first, as before the server existed.
  await page.goto('/?speed=4');
  await page.getByTestId('hero-name').fill('Veterano Local');
  await page.getByTestId('create-hero').click();
  await page.getByTestId('tip-ok').click();
  // Let the autosave (every 5 s) write the local hero, then go online.
  await page.waitForTimeout(6_000);
  await page.goto('/?online=1');
  await page.getByTestId('auth-guest').click();
  await expect(page.getByTestId('import')).toContainText('Veterano Local');
  await page.getByTestId('import-bring').click();
  await expect(page.locator('[data-testid="scene"] canvas').first()).toBeVisible();
  await expect(page.getByText('Veterano Local').first()).toBeVisible();
  expect(
    await page.evaluate(() =>
      Boolean((window as unknown as { abismo: { link: unknown } }).abismo.link),
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});

test('online: download the data and delete the account', async ({ page }) => {
  await page.goto('/?online=1');
  await expect(page.getByTestId('auth')).toContainText('Privacidade');
  await page.getByTestId('auth-guest').click();
  await page.getByTestId('hero-name').fill('Passageiro');
  await page.getByTestId('create-hero').click();
  await page.getByTestId('tip-ok').click();
  await page.getByTestId('nav-settings').click();
  const download = page.waitForEvent('download');
  await page.getByTestId('export-data').click();
  expect((await download).suggestedFilename()).toBe('abismo-dados.json');
  await page.getByTestId('delete-account').click();
  await page.getByTestId('delete-confirm').click();
  // Back to the first screen: the session and the account are gone.
  await expect(page.getByTestId('auth')).toBeVisible();
});
