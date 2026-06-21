import { test, expect } from '@playwright/test';

test.describe('Your Stores settings section', () => {
  test('lists the seeded store and opens its detail view', async ({ page }) => {
    await page.goto('/settings');

    await expect(page.getByRole('heading', { name: 'Your Stores' })).toBeVisible();
    const entry = page.getByRole('button', { name: 'Oxford Market Basket #62' });
    await expect(entry).toBeVisible();

    await entry.click();
    await expect(page).toHaveURL(/\/stores\/[0-9a-f-]{36}/);

    // Detail view shows the store header and at least one aisle card.
    const main = page.getByRole('main');
    await expect(page.getByRole('heading', { name: 'Oxford Market Basket #62' })).toBeVisible();
    await expect(main.getByText('95 Sutton Avenue, Oxford, MA 01540')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Aisles' })).toBeVisible();
    await expect(main.getByText('Produce', { exact: true })).toBeVisible();

    // Settings tab stays highlighted while viewing a store.
    await expect(page.getByRole('link', { name: /settings/i })).toHaveClass(/text-accent/);
    await expect(page.getByRole('link', { name: /shop/i })).not.toHaveClass(/text-accent/);

    // Back navigation returns to Settings.
    await page.goBack();
    await expect(page).toHaveURL('/settings');
    await expect(page.getByRole('heading', { name: 'Your Stores' })).toBeVisible();
  });
});
