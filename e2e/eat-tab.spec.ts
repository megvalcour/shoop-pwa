import { test, expect } from './support/offlineModel';

// The shell root is the outermost AppShell <div> (StoreHeader + main + nav live
// under it). ADR-0028 puts the `data-theme="eat"` attribute here so the green
// sub-theme reaches the chrome too. Locate it via its stable layout classes.
const SHELL_ROOT = 'div.flex.flex-col.h-svh';

test.describe('Eat tab — section-scoped green theme', () => {
  test('shell root carries data-theme="eat" on /eat', async ({ page }) => {
    await page.goto('/eat');
    await expect(page.locator(SHELL_ROOT)).toHaveAttribute('data-theme', 'eat');
  });

  test('shell root has no data-theme on / and /settings', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator(SHELL_ROOT)).not.toHaveAttribute('data-theme', /.*/);

    await page.goto('/settings');
    await expect(page.locator(SHELL_ROOT)).not.toHaveAttribute('data-theme', /.*/);
  });

  test('the green theme applies and reverts as you navigate', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator(SHELL_ROOT)).not.toHaveAttribute('data-theme', /.*/);

    await page.getByRole('link', { name: /eat/i }).click();
    await expect(page.locator(SHELL_ROOT)).toHaveAttribute('data-theme', 'eat');

    await page.getByRole('link', { name: /shop/i }).click();
    await expect(page.locator(SHELL_ROOT)).not.toHaveAttribute('data-theme', /.*/);
  });

  test('the Eat landing renders its coming-soon sections', async ({ page }) => {
    await page.goto('/eat');
    await expect(page.getByRole('heading', { name: /plan your week/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /^profile$/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /^recipes$/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /^weekly plan$/i })).toBeVisible();
  });
});
