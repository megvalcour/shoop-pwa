import { test, expect, type Page, type Locator } from './support/offlineModel';

// Two seeded catalog items and the General Store sections they map into (per
// src/assets/aisles/general.json). The General Store uses named sections
// (non-numeric `number`), so formatAisleLabel renders just the label.
const SEED_ITEMS = [
  {
    id: '7f547b35-7272-4997-b447-f2cce7a136df',
    name: 'Air Freshener',
    generalSection: 'Household & Cleaning',
  },
  {
    id: '59aa4f35-6abf-41f3-8249-1e818f2c29b0',
    name: 'Aluminum Foil',
    generalSection: 'Paper & Plastic Goods',
  },
];

// Reads the visible aisle order from the reorder-handle labels ("Reorder <label>").
async function sectionOrder(page: Page): Promise<string[]> {
  return page
    .getByRole('button', { name: /^Reorder / })
    .evaluateAll((els) =>
      els.map((el) => el.getAttribute('aria-label')?.replace(/^Reorder /, '') ?? ''),
    );
}

// dnd-kit's PointerSensor activates after an 8px move, then tracks subsequent
// moves — a single dragTo isn't enough, so step the pointer manually.
async function dragHandleTo(page: Page, handle: Locator, targetY: number) {
  const box = await handle.boundingBox();
  if (!box) throw new Error('handle has no bounding box');
  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX, startY + 12, { steps: 5 });
  await page.mouse.move(startX, targetY, { steps: 12 });
  await page.mouse.up();
}

// Seed a shopping list with pre-located catalog items so grouping is
// deterministic without the WASM model.
async function seedList(page: Page): Promise<string> {
  await page.goto('/');
  await expect(page.getByRole('button', { name: /new list/i })).toBeVisible();

  return page.evaluate(async (seedItems) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      // Open without a version so the helper attaches to whatever schema
      // version the app just created; pinning a number breaks on DB_VERSION bumps.
      const req = indexedDB.open('shoop');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const id = crypto.randomUUID();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(['shopping_lists', 'list_items'], 'readwrite');
      tx.objectStore('shopping_lists').add({
        id,
        name: 'Bucket Test',
        created_at: new Date().toISOString(),
      });
      for (const item of seedItems) {
        tx.objectStore('list_items').add({
          id: crypto.randomUUID(),
          list_id: id,
          item_id: item.id,
          quantity: 1,
          unit: '',
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
}

test.describe('General Store', () => {
  test('appears under Your Stores with a logo and opens its sections', async ({ page }) => {
    await page.goto('/settings');

    await expect(page.getByRole('heading', { name: 'Your Stores' })).toBeVisible();
    const entry = page.getByRole('button', { name: 'General Store' });
    await expect(entry).toBeVisible();
    // The icon fallback badge is accessible by the store name (no PNG ships).
    await expect(entry.getByRole('img', { name: 'General Store' })).toBeVisible();

    await entry.click();
    await expect(page).toHaveURL(/\/stores\/[0-9a-f-]{36}/);

    const main = page.getByRole('main');
    await expect(page.getByRole('heading', { name: 'General Store' })).toBeVisible();
    await expect(main.getByText("Any ol' store")).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Aisles' })).toBeVisible();
    await expect(main.getByText('Produce', { exact: true })).toBeVisible();
    await expect(main.getByText('Other', { exact: true })).toBeVisible();
  });

  test('reorders its sections and persists across reload', async ({ page }) => {
    await page.goto('/settings');
    await page.getByRole('button', { name: 'General Store' }).click();
    await expect(page.getByRole('heading', { name: 'Aisles' })).toBeVisible();

    const initial = await sectionOrder(page);
    expect(initial.length).toBe(21);

    const firstHandle = page.getByRole('button', { name: `Reorder ${initial[0]}` });
    const secondHandle = page.getByRole('button', { name: `Reorder ${initial[1]}` });
    const secondBox = await secondHandle.boundingBox();
    if (!secondBox) throw new Error('second handle has no bounding box');
    await dragHandleTo(page, firstHandle, secondBox.y + secondBox.height + 4);

    await expect
      .poll(async () => (await sectionOrder(page)).slice(0, 2))
      .toEqual([initial[1], initial[0]]);
    const afterDrag = await sectionOrder(page);

    await page.reload();
    await expect(page.getByRole('heading', { name: 'Aisles' })).toBeVisible();
    await expect.poll(async () => sectionOrder(page)).toEqual(afterDrag);
  });

  test('re-aisles list items into its sections when active, surviving reload', async ({ page }) => {
    const listId = await seedList(page);
    await page.goto(`/lists/${listId}`);
    await expect(page.getByText(SEED_ITEMS[0].name)).toBeVisible();

    // Switch the active store to the General Store via the header switcher.
    await page.getByRole('button', { name: 'Switch store' }).click();
    await expect(page.getByText('Switch store')).toBeVisible();
    await page.getByRole('button', { name: /General Store/ }).click();

    // Each item buckets into its General Store section: the row's aisle badge
    // (scoped to the item's listitem) names the section, unambiguously proving
    // the re-aisle.
    for (const item of SEED_ITEMS) {
      await expect(
        page
          .getByRole('listitem')
          .filter({ hasText: item.name })
          .getByRole('button', { name: `Change aisle: ${item.generalSection}` }),
      ).toBeVisible();
    }

    // The active-store choice and re-aisling survive a reload.
    await page.reload();
    await expect(page.getByText(SEED_ITEMS[0].name)).toBeVisible();
    for (const item of SEED_ITEMS) {
      await expect(
        page
          .getByRole('listitem')
          .filter({ hasText: item.name })
          .getByRole('button', { name: `Change aisle: ${item.generalSection}` }),
      ).toBeVisible();
    }
  });
});
