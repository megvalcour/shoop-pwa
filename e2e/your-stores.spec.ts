import { test, expect } from './support/offlineModel';

const CUSTOM_STORE_JSON = JSON.stringify({
  name: 'Deletable Mart — Testville',
  address: '99 Remove Road',
  aisles: [
    { number: '1', label: 'Produce', items: ['banana', 'spinach'] },
    { label: 'Bakery', items: ['bread'] },
  ],
});

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

  test('deletes a user-added store and removes it from the list, sparing bundled stores', async ({
    page,
  }) => {
    // Import a custom store via the JSON flow.
    await page.goto('/stores/new');
    await page.getByRole('textbox', { name: 'Store JSON', exact: true }).fill(CUSTOM_STORE_JSON);
    await page.getByRole('button', { name: 'Add store' }).click();
    await expect(page).toHaveURL(/\/stores\/[0-9a-f-]{36}/);
    await expect(
      page.getByRole('heading', { name: 'Deletable Mart — Testville' }),
    ).toBeVisible();

    // It appears in Your Stores; bundled Oxford has no delete affordance.
    await page.goto('/settings');
    await expect(page.getByRole('button', { name: 'Deletable Mart — Testville' })).toBeVisible();
    await page.getByRole('button', { name: 'Oxford Market Basket #62' }).click();
    await expect(page).toHaveURL(/\/stores\/[0-9a-f-]{36}/);
    await expect(page.getByRole('button', { name: 'Delete store' })).toHaveCount(0);

    // Open the user store and delete it via the confirm dialog.
    await page.goto('/settings');
    await page.getByRole('button', { name: 'Deletable Mart — Testville' }).click();
    await expect(page).toHaveURL(/\/stores\/[0-9a-f-]{36}/);
    await page.getByRole('button', { name: 'Delete store' }).click();

    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Delete' }).click();

    // Lands back on Settings with the store gone and bundled stores intact.
    await expect(page).toHaveURL('/settings');
    await expect(page.getByRole('button', { name: 'Deletable Mart — Testville' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Oxford Market Basket #62' })).toBeVisible();
  });
});
