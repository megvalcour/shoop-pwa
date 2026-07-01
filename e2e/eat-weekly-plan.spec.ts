import { test, expect } from './support/offlineModel';
import type { Page } from './support/offlineModel';

/**
 * Eat tab Phase 5 — weekly plan & scoring. Drives the whole loop against a mocked
 * `/api/nutrition` (the function isn't running under the dev server; the embedding
 * model is aborted by the offline-model fixture, so the rerank falls back to the
 * FDC top hit — deterministic):
 *   - set up a profile (targets) + save & enrich a recipe;
 *   - add it to a day with planned servings → day score rings + weekly summary;
 *   - change servings → still scored; reload with the endpoint dead → plan + score
 *     persist offline; remove it → the day empties.
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
        : [{ fdcId: '1', description: 'Onions, raw', dataType: 'Foundation' }];
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

/** Fill the profile form so the plan has daily targets to score against. */
async function setUpProfile(page: Page): Promise<void> {
  await page.goto('/eat');
  await page.getByRole('button', { name: /set up your profile/i }).click();
  await page.getByLabel('Age').fill('30');
  await page.getByLabel('Weight').fill('154');
  await page.getByLabel('Height (feet)').fill('5');
  await page.getByLabel('Height (inches)').fill('9');
  await page.getByLabel('Activity level').selectOption('moderate');
  await page.getByRole('button', { name: /save profile/i }).click();
  await expect(page.getByText('Energy', { exact: true })).toBeVisible();
}

/** Add a two-ingredient recipe by hand, then enrich it on its detail page. */
async function createAndEnrichRecipe(page: Page): Promise<void> {
  await page.goto('/eat');
  await page.getByRole('button', { name: /add a recipe/i }).click();
  await page.getByLabel('Title').fill('Veggie Bowl');
  await page.getByLabel('Servings').fill('2');
  await page.getByLabel('Ingredient 1', { exact: true }).fill('1 cup onion');
  await page.getByRole('button', { name: /add ingredient/i }).click();
  await page.getByLabel('Ingredient 2', { exact: true }).fill('2 cloves garlic');
  await page.getByRole('button', { name: /save recipe/i }).click();
  await expect(page).toHaveURL(/\/eat\/recipes\/[0-9a-f-]{36}/);

  await page.getByRole('button', { name: 'Match ingredients' }).click();
  await expect(page.getByText('2 of 2 matched')).toBeVisible();
}

/** The Weekly Plan day card for a given day label (the DayColumn `<section>`). */
function dayCard(page: Page, label: string) {
  return page
    .getByRole('heading', { name: label, exact: true, level: 3 })
    .locator('xpath=ancestor::section[1]');
}

test.describe('Eat tab — weekly plan & scoring', () => {
  test('plans a day, scores it, persists offline, and updates on change', async ({ page }) => {
    await mockNutritionEndpoint(page);
    await setUpProfile(page);
    await createAndEnrichRecipe(page);

    // Back to the Eat landing — the Weekly Plan section now has a 7-day grid.
    await page.goto('/eat');
    await expect(page.getByRole('heading', { name: 'Weekly Plan' })).toBeVisible();
    const monday = dayCard(page, 'Monday');
    await expect(monday.getByText(/nothing planned/i)).toBeVisible();

    // Add the recipe to Monday with planned servings.
    await monday.getByRole('button', { name: /add a recipe to monday/i }).click();
    const sheet = page.getByRole('dialog', { name: /add to monday/i });
    await expect(sheet).toBeVisible();
    await sheet.getByText('Veggie Bowl').click();
    await sheet.getByRole('button', { name: /add to monday/i }).click();

    // The day now lists the recipe and shows score rings; the weekly summary appears.
    await expect(monday.getByText('Veggie Bowl')).toBeVisible();
    await expect(monday.getByRole('img', { name: /^Energy:/ })).toBeVisible();
    await expect(page.getByText(/typical day this week/i)).toBeVisible();
    await expect(page.getByRole('img', { name: /^Protein:/ }).first()).toBeVisible();

    // The day heading links to a read-only detail view with the FULL panel — a
    // micro readout (Potassium) the compact week card doesn't surface.
    await monday.getByRole('button', { name: /view monday details/i }).click();
    await expect(page).toHaveURL(/\/eat\/plan\/mon$/);
    await expect(page.getByRole('heading', { name: 'Monday', level: 1 })).toBeVisible();
    await expect(page.getByText('Veggie Bowl')).toBeVisible();
    await expect(page.getByRole('img', { name: /^Potassium:/ })).toBeVisible();
    await page.goBack();
    await expect(page.getByRole('heading', { name: 'Weekly Plan' })).toBeVisible();

    // Increase planned servings — the plan stays scored (read recomputes).
    await monday.getByRole('button', { name: /increase servings for veggie bowl/i }).click();
    await expect(monday.getByLabel('3 servings')).toBeVisible();
    await expect(monday.getByRole('img', { name: /^Energy:/ })).toBeVisible();

    // Kill the endpoint and reload: the read path is network-free, so the planned,
    // scored week persists offline.
    await page.route('**/api/nutrition**', (route) => route.abort());
    await page.reload();
    const mondayAfter = dayCard(page, 'Monday');
    await expect(mondayAfter.getByText('Veggie Bowl')).toBeVisible();
    await expect(mondayAfter.getByLabel('3 servings')).toBeVisible();
    await expect(mondayAfter.getByRole('img', { name: /^Energy:/ })).toBeVisible();

    // Remove it — the day empties again.
    await mondayAfter.getByRole('button', { name: /remove veggie bowl from monday/i }).click();
    await expect(mondayAfter.getByText(/nothing planned/i)).toBeVisible();
    await expect(page.getByText(/typical day this week/i)).toHaveCount(0);
  });
});
