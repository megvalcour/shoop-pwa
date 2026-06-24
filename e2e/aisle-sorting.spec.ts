import { test, expect, type Page, type Locator } from './support/offlineModel';

// Reads the current visual order of aisles from their reorder-handle labels
// ("Reorder <label>"), which mirror the on-screen card order.
async function aisleOrder(page: Page): Promise<string[]> {
  const names = await page.getByRole('button', { name: /^Reorder / }).evaluateAll((els) =>
    els.map((el) => el.getAttribute('aria-label')?.replace(/^Reorder /, '') ?? ''),
  );
  return names;
}

// dnd-kit's PointerSensor activates after an 8px move, then tracks subsequent
// moves — so a single dragTo isn't enough; we step the pointer manually.
async function dragHandleTo(page: Page, handle: Locator, targetY: number) {
  const box = await handle.boundingBox();
  if (!box) throw new Error('handle has no bounding box');
  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  // Cross the activation threshold first.
  await page.mouse.move(startX, startY + 12, { steps: 5 });
  await page.mouse.move(startX, targetY, { steps: 12 });
  await page.mouse.up();
}

test.describe('Aisle drag-and-drop sorting', () => {
  test('reorders aisles and persists across reload', async ({ page }) => {
    await page.goto('/settings');
    await page.getByRole('button', { name: 'Oxford Market Basket #62' }).click();
    await expect(page).toHaveURL(/\/stores\/[0-9a-f-]{36}/);
    await expect(page.getByRole('heading', { name: 'Aisles' })).toBeVisible();

    const initial = await aisleOrder(page);
    expect(initial.length).toBeGreaterThan(1);

    // Drag the first aisle down past the second.
    const firstHandle = page.getByRole('button', { name: `Reorder ${initial[0]}` });
    const secondHandle = page.getByRole('button', { name: `Reorder ${initial[1]}` });
    const secondBox = await secondHandle.boundingBox();
    if (!secondBox) throw new Error('second handle has no bounding box');
    await dragHandleTo(page, firstHandle, secondBox.y + secondBox.height + 4);

    // The first two aisles have swapped.
    await expect
      .poll(async () => (await aisleOrder(page)).slice(0, 2))
      .toEqual([initial[1], initial[0]]);

    const afterDrag = await aisleOrder(page);

    // Reload — the new order must survive (proves sort_order was persisted).
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Aisles' })).toBeVisible();
    await expect.poll(async () => aisleOrder(page)).toEqual(afterDrag);
  });
});
