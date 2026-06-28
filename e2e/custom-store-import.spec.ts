import { test, expect } from './support/offlineModel';

// A small AI-shaped store JSON: two aisles, one numbered, one named.
const STORE_JSON = JSON.stringify({
  name: 'Corner Market — Testville',
  address: '12 Test Lane',
  aisles: [
    { number: '1', label: 'Produce', items: ['banana', 'spinach', 'avocado'] },
    { label: 'Bakery', items: ['bread', 'bagel'] },
  ],
});

test.describe('Custom store via JSON import', () => {
  test('adds a store from pasted JSON and shows its aisles on the detail page', async ({ page }) => {
    await page.goto('/settings');

    // Entry point lives beneath the store list.
    await expect(page.getByRole('heading', { name: 'Your Stores' })).toBeVisible();
    await page.getByRole('link', { name: /add a store/i }).click();
    await expect(page).toHaveURL('/stores/new');

    await expect(page.getByRole('heading', { name: 'Add a store' })).toBeVisible();

    // Paste the JSON; a preview appears.
    await page.getByRole('textbox', { name: 'Store JSON', exact: true }).fill(STORE_JSON);
    // Scope to the preview card; the pasted name/address also live in the textarea.
    await expect(page.getByText('Corner Market — Testville', { exact: true })).toBeVisible();
    await expect(page.getByText('12 Test Lane', { exact: true })).toBeVisible();
    await expect(page.getByText(/2 aisles · 5 example items/)).toBeVisible();

    // Create it → lands on the new store's detail page with both aisles.
    await page.getByRole('button', { name: 'Add store' }).click();
    await expect(page).toHaveURL(/\/stores\/[0-9a-f-]{36}/);

    const main = page.getByRole('main');
    await expect(page.getByRole('heading', { name: 'Corner Market — Testville' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Aisles' })).toBeVisible();
    await expect(main.getByText('Produce', { exact: true })).toBeVisible();
    await expect(main.getByText('Bakery', { exact: true })).toBeVisible();

    // It now appears in the Your Stores list.
    await page.goto('/settings');
    await expect(page.getByRole('button', { name: 'Corner Market — Testville' })).toBeVisible();
  });

  test('shows a validation error for malformed JSON and no add button', async ({ page }) => {
    await page.goto('/stores/new');
    await page.getByRole('textbox', { name: 'Store JSON', exact: true }).fill('{ not json ');
    await expect(page.getByText(/valid json/i)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add store' })).toHaveCount(0);
  });
});
