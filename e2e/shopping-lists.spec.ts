import { test, expect } from '@playwright/test';

test.describe('Shopping Lists', () => {
  test('shows empty state on first visit', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText(/no lists yet/i)).toBeVisible();
  });

  test('FAB creates a new list and navigates to detail', async ({ page }) => {
    await page.goto('/');
    const fab = page.getByRole('button', { name: /new list/i });
    await expect(fab).toBeVisible();
    await fab.click();

    await expect(page).toHaveURL(/\/lists\/[0-9a-f-]{36}/);
    await page.goBack();

    const card = page.locator('button').filter({ hasText: /Oxford.*-\s+\w+ \d+/ });
    await expect(card).toBeVisible();
  });

  test('clicking a list card navigates to its detail route', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /new list/i }).click();
    await expect(page).toHaveURL(/\/lists\//);
    await page.goBack();

    const card = page.locator('button').filter({ hasText: /Oxford/ });
    await card.click();
    await expect(page).toHaveURL(/\/lists\/[0-9a-f-]{36}/);
  });
});
