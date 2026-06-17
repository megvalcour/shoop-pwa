import { test, expect } from '@playwright/test';

test.describe('Bottom nav navigation', () => {
  test('/ — Weekly tab is active, others are not', async ({ page }) => {
    await page.goto('/');
    const weeklyLink = page.getByRole('link', { name: /weekly/i });
    const defaultLink = page.getByRole('link', { name: /default list/i });
    const settingsLink = page.getByRole('link', { name: /settings/i });

    await expect(weeklyLink).toHaveClass(/text-accent/);
    await expect(defaultLink).not.toHaveClass(/text-accent/);
    await expect(settingsLink).not.toHaveClass(/text-accent/);
  });

  test('clicking Default List tab navigates to /default-list and activates that tab', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: /default list/i }).click();
    await expect(page).toHaveURL('/default-list');
    await expect(page.getByRole('link', { name: /default list/i })).toHaveClass(/text-accent/);
    await expect(page.getByRole('link', { name: /weekly/i })).not.toHaveClass(/text-accent/);
  });

  test('clicking Settings tab navigates to /settings and activates that tab', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: /settings/i }).click();
    await expect(page).toHaveURL('/settings');
    await expect(page.getByRole('link', { name: /settings/i })).toHaveClass(/text-accent/);
    await expect(page.getByRole('link', { name: /weekly/i })).not.toHaveClass(/text-accent/);
  });

  test('clicking Weekly tab from Settings returns to / and activates Weekly', async ({ page }) => {
    await page.goto('/settings');
    await page.getByRole('link', { name: /weekly/i }).click();
    await expect(page).toHaveURL('/');
    await expect(page.getByRole('link', { name: /weekly/i })).toHaveClass(/text-accent/);
  });

  test('direct navigation to /settings highlights Settings tab without clicking', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.getByRole('link', { name: /settings/i })).toHaveClass(/text-accent/);
    await expect(page.getByRole('link', { name: /weekly/i })).not.toHaveClass(/text-accent/);
  });
});
