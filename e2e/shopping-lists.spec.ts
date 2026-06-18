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

test.describe('AddItemForm', () => {
  test('renders input and submit button on list detail page', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /new list/i }).click();
    await expect(page).toHaveURL(/\/lists\//);

    await expect(page.getByPlaceholder(/add an item/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /^add$/i })).toBeVisible();
  });

  test('submitting an item clears the input', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /new list/i }).click();
    await expect(page).toHaveURL(/\/lists\//);

    const input = page.getByPlaceholder(/add an item/i);
    await input.fill('Apples');
    await page.getByRole('button', { name: /^add$/i }).click();

    // Wait for isPending to clear (input re-enabled) before asserting value cleared by onSuccess
    await expect(input).toBeEnabled();
    await expect(input).toHaveValue('');
  });

  test('deleting an item removes it from the list', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /new list/i }).click();
    await expect(page).toHaveURL(/\/lists\//);

    const input = page.getByPlaceholder(/add an item/i);
    await input.fill('Bananas');
    await page.getByRole('button', { name: /^add$/i }).click();
    await expect(input).toBeEnabled();

    await expect(page.getByText('Bananas')).toBeVisible();

    await page.getByRole('button', { name: /delete item/i }).click();

    await expect(page.getByText('Bananas')).not.toBeVisible();
    await expect(page.getByText(/no items yet/i)).toBeVisible();
  });
});
