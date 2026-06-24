import { test, expect } from './support/offlineModel';

// Creates a fresh empty list via the UI and lands on its detail route.
async function createEmptyList(page: Parameters<Parameters<typeof test>[1]>[0]['page']) {
  await page.goto('/settings');
  await page.getByRole('button', { name: /new list/i }).click();
  await expect(page).toHaveURL(/\/lists\/[0-9a-f-]{36}/);
}

test.describe('List Builder UX', () => {
  test('rapid add keeps focus in the input, clears it, and renders every item', async ({
    page,
  }) => {
    await createEmptyList(page);

    const input = page.getByPlaceholder(/add an item/i);
    await input.click();

    const names = ['Milk', 'Bread', 'Eggs', 'Bananas'];
    for (const name of names) {
      await input.fill(name);
      await input.press('Enter');
      // Focus is retained and the field clears immediately — "type → Enter → keep typing".
      await expect(input).toBeFocused();
      await expect(input).toHaveValue('');
    }

    for (const name of names) {
      await expect(page.getByText(name, { exact: true })).toBeVisible();
    }
  });

  test('the page stays interactive while the model loads', async ({ page }) => {
    await createEmptyList(page);

    const input = page.getByPlaceholder(/add an item/i);

    // The first add primes the model. With inference off the main thread, the
    // input must remain interactive and accept further adds immediately.
    await input.fill('Apples');
    await input.press('Enter');
    await expect(input).toHaveValue('');
    await expect(input).toBeEnabled();

    await input.fill('Cereal');
    await input.press('Enter');
    await expect(input).toHaveValue('');

    await expect(page.getByText('Apples', { exact: true })).toBeVisible();
    await expect(page.getByText('Cereal', { exact: true })).toBeVisible();
  });
});
