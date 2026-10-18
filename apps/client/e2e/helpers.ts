import { expect, type Page } from '@playwright/test';

/** Creates a hero on a fresh browser profile and waits for the hunt to start. */
export async function createHero(page: Page, name = 'Teste', speed = 6) {
  await page.goto(`/?speed=${speed}`);
  await page.getByTestId('hero-name').fill(name);
  await page.getByTestId('create-hero').click();
  await expect(page.locator('[data-testid="scene"] canvas')).toBeVisible();
  // The elder's welcome (first ten minutes).
  await page.getByTestId('tip-ok').click();
  // On phones the log window starts closed: open it from the top menu.
  if (!(await page.getByTestId('event-log').isVisible())) await page.getByTestId('nav-log').click();
  await expect(page.getByTestId('event-log')).toContainText('Caçada: Cemitério Esquecido');
}

/** Waits until the backpack has at least one item (12% drop chance per kill). */
export async function waitForLoot(page: Page) {
  await expect(page.getByTestId('backpack-button')).not.toContainText(' 0/40', { timeout: 90_000 });
}
