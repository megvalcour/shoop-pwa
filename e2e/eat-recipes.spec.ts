import { test, expect } from './support/offlineModel';
import type { Page } from './support/offlineModel';

/**
 * Eat tab Phase 3 — persisted recipes. Covers the two entry points end-to-end:
 * (a) import → "Save as recipe" → library → detail; (b) manual add → edit →
 * delete; plus a mid-flow reload to prove the recipes persist in IndexedDB.
 * Reuses the existing `/api/import-recipe` mock from the import suite.
 */

const RECIPE = {
  title: 'Chocolate Chip Cookies',
  ingredients: ['2 cups all-purpose flour', '1 tsp baking soda', '3 large eggs'],
  sourceUrl: 'https://example.com/recipe',
};

const RECIPE_URL = 'https://example.com/recipe';

async function mockImportEndpoint(page: Page): Promise<void> {
  await page.route('**/api/import-recipe**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(RECIPE),
    }),
  );
}

test.describe('Eat tab — persisted recipes', () => {
  test('imports a recipe, saves it, and opens it from the Eat library', async ({ page }) => {
    await mockImportEndpoint(page);
    await page.goto(`/import?url=${encodeURIComponent(RECIPE_URL)}`);

    await expect(page.getByRole('heading', { name: 'Chocolate Chip Cookies' })).toBeVisible();

    // Choose the "Save as recipe" destination, accept the default servings, save.
    await page.getByRole('button', { name: 'Save as recipe' }).click();
    await expect(page.getByLabel('Servings')).toHaveValue('4');
    await page.getByRole('button', { name: 'Save recipe' }).click();

    // Lands on the recipe detail with its title, servings, and ingredients.
    await expect(page).toHaveURL(/\/eat\/recipes\/[0-9a-f-]{36}/);
    await expect(page.getByRole('heading', { name: 'Chocolate Chip Cookies' })).toBeVisible();
    await expect(page.getByText('4 servings', { exact: true })).toBeVisible();
    await expect(page.getByText('All-purpose flour', { exact: true })).toBeVisible();

    // Reload mid-flow: the recipe persisted in IndexedDB.
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Chocolate Chip Cookies' })).toBeVisible();

    // Back on the Eat landing, the library shows the saved recipe.
    await page.getByRole('link', { name: 'Eat' }).click();
    await expect(page).toHaveURL(/\/eat$/);
    await expect(page.getByRole('button', { name: 'Chocolate Chip Cookies' })).toBeVisible();
    await expect(page.getByText(/4 servings · 3 ingredients/i)).toBeVisible();
  });

  test('adds a recipe by hand, edits it, then deletes it', async ({ page }) => {
    await page.goto('/eat');

    // The shell carries the green Eat sub-theme (ADR-0028 — light assertion).
    await expect(page.locator('div.flex.flex-col.h-svh')).toHaveAttribute('data-theme', 'eat');

    // Empty state → manual add.
    await expect(page.getByText(/no recipes yet/i)).toBeVisible();
    await page.getByRole('button', { name: /add a recipe/i }).click();
    await expect(page).toHaveURL(/\/eat\/recipes\/new$/);

    await page.getByLabel('Title').fill('Weeknight Chili');
    await page.getByLabel('Servings').fill('6');
    await page.getByLabel('Ingredient 1', { exact: true }).fill('2 cups black beans');
    // The parser pre-filled the quantity/unit from the typed line.
    await expect(page.getByLabel('Quantity for ingredient 1')).toHaveValue('2');
    await expect(page.getByLabel('Unit for ingredient 1')).toHaveValue('cups');

    await page.getByRole('button', { name: /add ingredient/i }).click();
    await page.getByLabel('Ingredient 2', { exact: true }).fill('1 lb ground beef');

    await page.getByRole('button', { name: /save recipe/i }).click();

    // Detail for the new recipe.
    await expect(page).toHaveURL(/\/eat\/recipes\/[0-9a-f-]{36}/);
    await expect(page.getByRole('heading', { name: 'Weeknight Chili' })).toBeVisible();
    await expect(page.getByText('Black beans', { exact: true })).toBeVisible();
    await expect(page.getByText('Ground beef', { exact: true })).toBeVisible();

    // Edit: change the title.
    await page.getByRole('button', { name: /^Edit$/ }).click();
    await expect(page).toHaveURL(/\/eat\/recipes\/[0-9a-f-]{36}\/edit$/);
    await page.getByLabel('Title').fill('Sunday Chili');
    await page.getByRole('button', { name: /save recipe/i }).click();

    await expect(page.getByRole('heading', { name: 'Sunday Chili' })).toBeVisible();

    // It appears in the library under the new title after a reload (persistence).
    await page.reload();
    await page.getByRole('link', { name: 'Eat' }).click();
    await expect(page.getByRole('button', { name: 'Sunday Chili' })).toBeVisible();

    // Delete from the detail, confirm, and it's gone.
    await page.getByRole('button', { name: 'Sunday Chili' }).click();
    await page.getByRole('button', { name: /delete recipe: sunday chili/i }).click();
    await page.getByRole('button', { name: /^Delete$/ }).click();

    await expect(page).toHaveURL(/\/eat$/);
    await expect(page.getByText(/no recipes yet/i)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sunday Chili' })).toHaveCount(0);
  });
});
