import { test, expect } from './support/offlineModel';

test.describe('Bottom nav navigation', () => {
  test('/ — Shop, Eat, and Settings tabs are present, no Default List tab', async ({ page }) => {
    await page.goto('/');
    const shopLink = page.getByRole('link', { name: /shop/i });
    const eatLink = page.getByRole('link', { name: /eat/i });
    const settingsLink = page.getByRole('link', { name: /settings/i });

    await expect(shopLink).toBeVisible();
    await expect(eatLink).toBeVisible();
    await expect(settingsLink).toBeVisible();
    await expect(page.getByRole('link', { name: /default list/i })).not.toBeVisible();
  });

  test('/ — Shop tab is active on /', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('link', { name: /shop/i })).toHaveClass(/text-accent/);
    await expect(page.getByRole('link', { name: /eat/i })).not.toHaveClass(/text-accent/);
    await expect(page.getByRole('link', { name: /settings/i })).not.toHaveClass(/text-accent/);
  });

  test('clicking Eat tab navigates to /eat and activates that tab', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: /eat/i }).click();
    await expect(page).toHaveURL('/eat');
    await expect(page.getByRole('link', { name: /eat/i })).toHaveClass(/text-accent/);
    await expect(page.getByRole('link', { name: /shop/i })).not.toHaveClass(/text-accent/);
    await expect(page.getByRole('link', { name: /settings/i })).not.toHaveClass(/text-accent/);
  });

  test('leaving Eat de-activates the Eat tab', async ({ page }) => {
    await page.goto('/eat');
    await expect(page.getByRole('link', { name: /eat/i })).toHaveClass(/text-accent/);
    await page.getByRole('link', { name: /settings/i }).click();
    await expect(page).toHaveURL('/settings');
    await expect(page.getByRole('link', { name: /eat/i })).not.toHaveClass(/text-accent/);
  });

  test('direct navigation to /eat highlights the Eat tab', async ({ page }) => {
    await page.goto('/eat');
    await expect(page.getByRole('link', { name: /eat/i })).toHaveClass(/text-accent/);
    await expect(page.getByRole('link', { name: /shop/i })).not.toHaveClass(/text-accent/);
    await expect(page.getByRole('link', { name: /settings/i })).not.toHaveClass(/text-accent/);
  });

  test('shell carries data-theme="eat" only under /eat', async ({ page }) => {
    const shellRoot = page.locator('div.flex.flex-col.h-svh');

    await page.goto('/eat');
    await expect(shellRoot).toHaveAttribute('data-theme', 'eat');

    await page.getByRole('link', { name: /settings/i }).click();
    await expect(page).toHaveURL('/settings');
    await expect(shellRoot).not.toHaveAttribute('data-theme');

    await page.getByRole('link', { name: /shop/i }).click();
    await expect(shellRoot).not.toHaveAttribute('data-theme');
  });

  test('clicking Settings tab navigates to /settings and activates that tab', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: /settings/i }).click();
    await expect(page).toHaveURL('/settings');
    await expect(page.getByRole('link', { name: /settings/i })).toHaveClass(/text-accent/);
    await expect(page.getByRole('link', { name: /shop/i })).not.toHaveClass(/text-accent/);
  });

  test('clicking Shop tab from Settings returns to / and activates Shop', async ({ page }) => {
    await page.goto('/settings');
    await page.getByRole('link', { name: /shop/i }).click();
    await expect(page).toHaveURL('/');
    await expect(page.getByRole('link', { name: /shop/i })).toHaveClass(/text-accent/);
  });

  test('direct navigation to /settings highlights Settings tab', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.getByRole('link', { name: /settings/i })).toHaveClass(/text-accent/);
    await expect(page.getByRole('link', { name: /shop/i })).not.toHaveClass(/text-accent/);
  });

  test('navigating to / redirects to /lists/:id when a list exists', async ({ page }) => {
    await page.goto('/settings');
    await page.getByRole('button', { name: /new list/i }).click();
    await expect(page).toHaveURL(/\/lists\/[0-9a-f-]{36}/);

    await page.goto('/');
    await expect(page).toHaveURL(/\/lists\/[0-9a-f-]{36}/);
  });

  test('Shop tab is active when URL is /lists/:id', async ({ page }) => {
    await page.goto('/settings');
    await page.getByRole('button', { name: /new list/i }).click();
    await expect(page).toHaveURL(/\/lists\/[0-9a-f-]{36}/);

    await expect(page.getByRole('link', { name: /shop/i })).toHaveClass(/text-accent/);
    await expect(page.getByRole('link', { name: /settings/i })).not.toHaveClass(/text-accent/);
  });
});
