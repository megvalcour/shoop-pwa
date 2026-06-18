import { test, expect } from '@playwright/test';

// Known items from the seeded oxford-62.json data; aisle_id is already set.
const SEED_ITEMS = [
  {
    id: '7f547b35-7272-4997-b447-f2cce7a136df',
    name: 'Air Freshener',
    aisle_id: '0c4387cb-b0d9-4d7c-af00-6b440d9c5416',
    aisleLabel: 'Cleaning & Laundry',
    aisleNumber: '15',
  },
  {
    id: '59aa4f35-6abf-41f3-8249-1e818f2c29b0',
    name: 'Aluminum Foil',
    aisle_id: 'a16fd91e-d733-4206-abac-a2f0039afcd5',
    aisleLabel: 'Household Supplies',
    aisleNumber: '12',
  },
];

// Seed a shopping list with pre-classified items so grouping assertions are deterministic
// (no need to wait for the WASM model to classify).
async function seedList(page: Parameters<Parameters<typeof test>[1]>[0]['page']) {
  // Navigate first so the app boots and seeds the base store/aisles/items.
  await page.goto('/');
  await expect(page.getByRole('button', { name: /new list/i })).toBeVisible();

  const listId = await page.evaluate(async (seedItems) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('shoop', 2);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });

    const id = crypto.randomUUID();

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(['shopping_lists', 'list_items'], 'readwrite');
      tx.objectStore('shopping_lists').add({
        id,
        name: 'Aisle E2E Test',
        created_at: new Date().toISOString(),
      });
      for (const item of seedItems) {
        tx.objectStore('list_items').add({
          id: crypto.randomUUID(),
          list_id: id,
          item_id: item.id,
          quantity: 1,
          checked: false,
          added_from_default: false,
          created_at: Date.now(),
        });
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });

    return id;
  }, SEED_ITEMS);

  await page.goto(`/lists/${listId}`);
  // Wait for the list to render
  await expect(page.getByText(SEED_ITEMS[0].name)).toBeVisible();
  return listId;
}

test.describe('Smart Aisle Location', () => {
  test('aisle group headers render for pre-classified items', async ({ page }) => {
    await seedList(page);

    await expect(page.getByText('Aisle 15 — Cleaning & Laundry')).toBeVisible();
    await expect(page.getByText('Air Freshener')).toBeVisible();

    await expect(page.getByText('Aisle 12 — Household Supplies')).toBeVisible();
    await expect(page.getByText('Aluminum Foil')).toBeVisible();
  });

  test('checked items appear in Done section', async ({ page }) => {
    await seedList(page);

    // Check the first item
    await page.getByText(SEED_ITEMS[0].name).click();

    await expect(page.getByText('Done')).toBeVisible();
    // The checked item should still be visible, just in the Done section
    await expect(page.getByText(SEED_ITEMS[0].name)).toBeVisible();
  });

  test('tapping the aisle badge opens the AislePickerSheet', async ({ page }) => {
    await seedList(page);

    // Tap the aisle badge on the first seeded item
    const aisleButton = page.getByRole('button', {
      name: new RegExp(`Change aisle: ${SEED_ITEMS[0].aisleLabel}`, 'i'),
    });
    await expect(aisleButton).toBeVisible();
    await aisleButton.click();

    await expect(page.getByText('Choose aisle')).toBeVisible();
  });

  test('selecting a different aisle from the sheet updates the badge', async ({ page }) => {
    await seedList(page);

    // Open the aisle picker for the first item (Aisle 15)
    const badgeButton = page.getByRole('button', {
      name: /Change aisle: Cleaning & Laundry/i,
    });
    await badgeButton.click();
    await expect(page.getByText('Choose aisle')).toBeVisible();

    // Select Household Supplies (Aisle 12) instead
    await page.getByText('Aisle 12 — Household Supplies').click();

    // The sheet should close and the badge should update
    await expect(page.getByText('Choose aisle')).not.toBeVisible();
    await expect(
      page.getByRole('button', { name: /Change aisle: Household Supplies/i }),
    ).toBeVisible();
  });

  test('adding a new item via the form shows it in the list', async ({ page }) => {
    await seedList(page);

    const input = page.getByPlaceholder(/add an item/i);
    await input.fill('Cereal');
    await page.getByRole('button', { name: /^add$/i }).click();

    // Input clears on success
    await expect(input).toHaveValue('');

    // The new item appears somewhere in the list (aisle placement is non-deterministic)
    await expect(page.getByText('Cereal')).toBeVisible();
  });
});
