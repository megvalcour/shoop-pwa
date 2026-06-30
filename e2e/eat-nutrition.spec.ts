import { test, expect } from './support/offlineModel';
import type { Page } from './support/offlineModel';

/**
 * Eat tab Phase 4 — nutrition enrichment. Covers the lazy enrich flow end-to-end
 * against a mocked `/api/nutrition` (the function isn't running under the dev
 * server, and the embedding model is aborted by the offline-model fixture, so the
 * rerank falls back to the FDC top hit — deterministic):
 *   - add a recipe → open detail → "Match ingredients" → per-serving panel appears;
 *   - reload with the endpoint unreachable → nutrition persists offline;
 *   - re-pick a low-confidence match → the rollup updates.
 */

interface Panel {
  fdc_id: string;
  description: string;
  per100g: Record<string, number>;
  foodPortions?: Array<{ unit: string; gramWeight: number; amount: number }>;
}

function panel(fdc_id: string, description: string, energyKcal: number, portions?: Panel['foodPortions']): Panel {
  return {
    fdc_id,
    description,
    per100g: {
      energyKcal,
      protein: 2,
      fat: 0.2,
      carbs: 9,
      fiber: 1.7,
      sodium: 4,
      calcium: 23,
      iron: 0.2,
      potassium: 146,
      vitaminC: 7,
      vitaminD: 0,
    },
    ...(portions ? { foodPortions: portions } : {}),
  };
}

const PANELS: Record<string, Panel> = {
  '1': panel('1', 'Onions, raw', 40, [{ unit: 'cup', gramWeight: 160, amount: 1 }]),
  '2': panel('2', 'Onion rings', 400),
  '3': panel('3', 'Garlic, raw', 149, [{ unit: 'clove', gramWeight: 3, amount: 1 }]),
};

async function mockNutritionEndpoint(page: Page): Promise<void> {
  await page.route('**/api/nutrition**', (route) => {
    const url = new URL(route.request().url());
    const op = url.searchParams.get('op');
    if (op === 'search') {
      const q = url.searchParams.get('q') ?? '';
      const candidates = q.includes('garlic')
        ? [{ fdcId: '3', description: 'Garlic, raw', dataType: 'SR Legacy' }]
        : [
            { fdcId: '1', description: 'Onions, raw', dataType: 'Foundation' },
            { fdcId: '2', description: 'Onion rings', dataType: 'Branded' },
          ];
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ candidates }),
      });
    }
    if (op === 'detail') {
      const fdcId = url.searchParams.get('fdcId') ?? '';
      const found = PANELS[fdcId];
      return found
        ? route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(found) })
        : route.fulfill({ status: 422, contentType: 'application/json', body: '{"error":"no_match"}' });
    }
    return route.fulfill({ status: 400, contentType: 'application/json', body: '{"error":"invalid_query"}' });
  });
}

/** Add a two-ingredient recipe by hand and land on its detail. */
async function createRecipe(page: Page): Promise<void> {
  await page.goto('/eat');
  await page.getByRole('button', { name: /add a recipe/i }).click();
  await page.getByLabel('Title').fill('Veggie Bowl');
  await page.getByLabel('Servings').fill('2');
  await page.getByLabel('Ingredient 1', { exact: true }).fill('1 cup onion');
  await page.getByRole('button', { name: /add ingredient/i }).click();
  await page.getByLabel('Ingredient 2', { exact: true }).fill('2 cloves garlic');
  await page.getByRole('button', { name: /save recipe/i }).click();
  await expect(page).toHaveURL(/\/eat\/recipes\/[0-9a-f-]{36}/);
  await expect(page.getByRole('heading', { name: 'Veggie Bowl' })).toBeVisible();
}

test.describe('Eat tab — nutrition enrichment', () => {
  test('enriches a recipe, persists offline, and re-picks a match', async ({ page }) => {
    await mockNutritionEndpoint(page);
    await createRecipe(page);

    // Before enrichment: the section invites a match, with an action.
    await expect(page.getByText(/Match this recipe’s ingredients/)).toBeVisible();
    const matchButton = page.getByRole('button', { name: 'Match ingredients' });
    await expect(matchButton).toBeVisible();
    await matchButton.click();

    // After enrichment: both ingredients matched, panel + toggle shown.
    await expect(page.getByText('2 of 2 matched')).toBeVisible();
    await expect(page.getByText('Matched to Onions, raw')).toBeVisible();
    await expect(page.getByText('Matched to Garlic, raw')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Per serving' })).toBeVisible();
    await expect(page.getByText('Energy')).toBeVisible();

    // The whole-recipe toggle re-scales the panel.
    await page.getByRole('button', { name: 'Whole recipe' }).click();
    await expect(page.getByRole('button', { name: 'Whole recipe' })).toBeVisible();

    // Cut the endpoint and reload: the read path is network-free, so the persisted
    // nutrition still renders (offline-capable after one enrichment).
    await page.route('**/api/nutrition**', (route) => route.abort());
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Veggie Bowl' })).toBeVisible();
    await expect(page.getByText('2 of 2 matched')).toBeVisible();
    await expect(page.getByText('Matched to Onions, raw')).toBeVisible();

    // Restore the endpoint and re-pick the onion match → the row updates.
    await page.unroute('**/api/nutrition**');
    await mockNutritionEndpoint(page);

    const onionRow = page.locator('li', { hasText: 'Onions, raw' });
    await onionRow.getByRole('button', { name: 'Change' }).click();

    await expect(page.getByRole('dialog', { name: /Match .onion./ })).toBeVisible();
    await page.getByText('Onion rings', { exact: true }).click();

    await expect(page.getByText('Matched to Onion rings')).toBeVisible();
    await expect(page.getByText('Matched to Onions, raw')).toHaveCount(0);
  });
});
