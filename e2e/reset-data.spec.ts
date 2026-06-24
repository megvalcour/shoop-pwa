import { test, expect } from './support/offlineModel';

test.describe('Reset all data', () => {
  test('confirming the reset clears lists but keeps the store catalog', async ({ page }) => {
    // Create a list so there is user data to wipe.
    await page.goto('/settings');
    await page.getByRole('button', { name: /new list/i }).click();
    await expect(page).toHaveURL(/\/lists\//);

    await page.goto('/settings');
    const card = page.locator('button').filter({ hasText: /Oxford.*-\s+\w+ \d+/ });
    await expect(card).toBeVisible();

    // Reset via the Danger Zone confirm dialog.
    await page.getByRole('button', { name: /reset all data/i }).click();
    await expect(page.getByRole('alertdialog', { name: /reset all data\?/i })).toBeVisible();
    await page.getByRole('button', { name: /^reset$/i }).click();

    await expect(page.getByRole('alertdialog')).not.toBeVisible();
    await expect(card).not.toBeVisible();
    await expect(page.getByText(/no lists yet/i)).toBeVisible();

    // Store catalog survived: the smart aisle add-item flow still works.
    await page.getByRole('button', { name: /new list/i }).click();
    await expect(page).toHaveURL(/\/lists\//);
    const input = page.getByPlaceholder(/add an item/i);
    await input.fill('Apples');
    await page.getByRole('button', { name: /^add$/i }).click();
    await expect(page.getByText('Apples', { exact: true })).toBeVisible();
  });

  test('cancelling the reset keeps user data', async ({ page }) => {
    await page.goto('/settings');
    await page.getByRole('button', { name: /new list/i }).click();
    await expect(page).toHaveURL(/\/lists\//);

    await page.goto('/settings');
    const card = page.locator('button').filter({ hasText: /Oxford.*-\s+\w+ \d+/ });
    await expect(card).toBeVisible();

    await page.getByRole('button', { name: /reset all data/i }).click();
    await expect(page.getByRole('alertdialog')).toBeVisible();
    await page.getByRole('button', { name: /^cancel$/i }).click();

    await expect(page.getByRole('alertdialog')).not.toBeVisible();
    await expect(card).toBeVisible();
  });
});
