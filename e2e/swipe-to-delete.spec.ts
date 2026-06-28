import { test, expect } from './support/offlineModel';

/**
 * The in-motion shopping list deletes rows via a hand-rolled swipe-left gesture
 * (ADR-0022). The accessible button path is covered in shopping-lists.spec.ts;
 * here we exercise the gesture itself.
 */
test.describe('Swipe to delete', () => {
  async function newListWithItem(page: import('./support/offlineModel').Page, name: string) {
    await page.goto('/settings');
    await page.getByRole('button', { name: /new list/i }).click();
    await expect(page).toHaveURL(/\/lists\//);

    const input = page.getByPlaceholder(/add an item/i);
    await input.fill(name);
    await page.getByRole('button', { name: /^add$/i }).click();
    await expect(input).toBeEnabled();
    await expect(page.getByText(name)).toBeVisible();
    // A freshly-added row first renders under "Categorizing…", then the
    // background classifier re-buckets it into another aisle group — which
    // remounts the SwipeableRow. A gesture driven before that settle is lost to
    // the mid-drag remount (the same remount hazard noted in
    // shopping-lists.spec.ts). The classifier is offline in e2e, so the row
    // settles into "Uncategorized" with a "Categorize" affordance; wait for it.
    await expect(page.getByRole('button', { name: /categorize item/i })).toBeVisible();
  }

  test('swiping a row left past the threshold removes it', async ({ page }) => {
    await newListWithItem(page, 'Bananas');

    const row = page.getByText('Bananas');
    const box = await row.boundingBox();
    if (!box) throw new Error('row not visible');

    const y = box.y + box.height / 2;
    // Drag from the right edge well past the delete threshold (>120px) to the left.
    await page.mouse.move(box.x + box.width - 12, y);
    await page.mouse.down();
    await page.mouse.move(box.x - 200, y, { steps: 12 });
    await page.mouse.up();

    await expect(page.getByText('Bananas')).not.toBeVisible();
    await expect(page.getByText(/no items yet/i)).toBeVisible();
  });

  test('a short drag does not delete the row', async ({ page }) => {
    await newListWithItem(page, 'Apples');

    const row = page.getByText('Apples');
    const box = await row.boundingBox();
    if (!box) throw new Error('row not visible');

    const y = box.y + box.height / 2;
    // A small left nudge (under the threshold) should snap back, not delete.
    await page.mouse.move(box.x + box.width - 12, y);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width - 50, y, { steps: 6 });
    await page.mouse.up();

    await expect(page.getByText('Apples')).toBeVisible();
  });
});
