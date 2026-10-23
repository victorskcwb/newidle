import { expect, test } from '@playwright/test';

/**
 * Online mode (decision 173, `?online=1` in development): the hero lives on the server. A
 * second device with the same account takes over and finds the same hero; the first device is
 * told the account was opened elsewhere.
 */
test('online: create a hero, play, and continue on another device', async ({ browser }) => {
  const account = crypto.randomUUID();
  const device = async () => {
    const context = await browser.newContext({ locale: 'pt-BR' });
    await context.addInitScript((id) => localStorage.setItem('abismo.devAccount', id), account);
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    return { page, errors };
  };

  const phone = await device();
  await phone.page.goto('/?online=1');
  await phone.page.getByTestId('hero-name').fill('Viajante Online');
  await phone.page.getByTestId('create-hero').click();
  await expect(phone.page.locator('[data-testid="scene"] canvas').first()).toBeVisible();
  await phone.page.getByTestId('tip-ok').click();
  if (!(await phone.page.getByTestId('event-log').isVisible()))
    await phone.page.getByTestId('nav-log').click();
  await expect(phone.page.getByTestId('event-log')).toContainText('derrotado!', {
    timeout: 60_000,
  });
  const kills = await phone.page.evaluate(() =>
    Number(
      (window as unknown as { abismo: { state: { lifetime: { kills: bigint } } } }).abismo.state
        .lifetime.kills,
    ),
  );
  expect(kills).toBeGreaterThan(0);

  // The replica agrees with the server: checkpoints (tick 0, then every 30 s) compared and matched.
  const stats = () =>
    phone.page.evaluate(
      () =>
        (
          window as unknown as {
            abismo: { link: { replica: { stats: Record<string, number> } } };
          }
        ).abismo.link.replica.stats,
    );
  await expect
    .poll(async () => (await stats()).checkpointsVerified, { timeout: 60_000 })
    .toBeGreaterThan(1);
  expect(await stats()).toMatchObject({ resyncs: 0, checkpointMismatches: 0, lateIntents: 0 });

  // Editing the browser's own save changes nothing: online, the hero is the server's.
  await phone.page.evaluate(() => indexedDB.deleteDatabase('keyval-store'));

  const pc = await device();
  await pc.page.goto('/?online=1');
  await expect(pc.page.locator('[data-testid="scene"] canvas').first()).toBeVisible();
  await expect(pc.page.getByText('Viajante Online').first()).toBeVisible();
  const pcKills = await pc.page.evaluate(() =>
    Number(
      (window as unknown as { abismo: { state: { lifetime: { kills: bigint } } } }).abismo.state
        .lifetime.kills,
    ),
  );
  expect(pcKills).toBeGreaterThanOrEqual(kills);
  await expect(phone.page.getByTestId('net-taken')).toBeVisible();

  expect(phone.errors).toEqual([]);
  expect(pc.errors).toEqual([]);
});
