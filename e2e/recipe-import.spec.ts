import { test, expect } from './support/offlineModel';
import type { Page } from './support/offlineModel';

// A representative recipe payload mirroring the `/api/import-recipe` 200 contract
// ({ title, ingredients: string[], sourceUrl }). Ingredients are raw strings as
// they arrive from JSON-LD; `normalizeIngredient` strips the leading quantity and
// unit, so the checklist renders the cleaned noun phrase (e.g. "all-purpose flour").
const RECIPE = {
  title: 'Chocolate Chip Cookies',
  ingredients: ['2 cups all-purpose flour', '1 tsp baking soda', '3 large eggs'],
  sourceUrl: 'https://example.com/recipe',
};

// Cleaned names the importer shows after normalization (and that land on the list).
const NORMALIZED_NAMES = ['all-purpose flour', 'baking soda', 'large eggs'];

const RECIPE_URL = 'https://example.com/recipe';

/**
 * Intercept the Cloudflare Pages Function so the suite never hits the network
 * (the function isn't running under `npm run dev`, and E2E must be deterministic
 * — per the task plan, the share intent itself can't be driven in Playwright, so
 * we cover the route + import flow with a mocked endpoint).
 */
async function mockImportEndpoint(
  page: Page,
  body: unknown = RECIPE,
  status = 200,
): Promise<void> {
  await page.route('**/api/import-recipe**', (route) =>
    route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify(body),
    }),
  );
}

test.describe('Recipe Import', () => {
  test('renders parsed ingredients and commits them to a new list', async ({ page }) => {
    await mockImportEndpoint(page);

    // Share Target Level 1 delivers a GET navigation with the URL as a query param.
    await page.goto(`/import?url=${encodeURIComponent(RECIPE_URL)}`);

    // Parsed ingredients render as a checklist, all checked by default.
    await expect(page.getByRole('heading', { name: 'Chocolate Chip Cookies' })).toBeVisible();
    for (const name of NORMALIZED_NAMES) {
      await expect(page.getByText(name, { exact: true })).toBeVisible();
    }

    // Default target is "New list"; commit all three.
    const commit = page.getByRole('button', { name: /add 3 items/i });
    await expect(commit).toBeEnabled();
    await commit.click();

    // Lands on the freshly created list's detail route with the items present.
    await expect(page).toHaveURL(/\/lists\/[0-9a-f-]{36}/);
    for (const name of NORMALIZED_NAMES) {
      await expect(page.getByText(name, { exact: true })).toBeVisible();
    }
  });

  test('unchecking an ingredient excludes it from the commit', async ({ page }) => {
    await mockImportEndpoint(page);
    await page.goto(`/import?url=${encodeURIComponent(RECIPE_URL)}`);

    await expect(page.getByText('baking soda', { exact: true })).toBeVisible();

    // Uncheck "baking soda" — the commit count drops and it should not land on the list.
    await page.getByText('baking soda', { exact: true }).click();

    const commit = page.getByRole('button', { name: /add 2 items/i });
    await expect(commit).toBeVisible();
    await commit.click();

    await expect(page).toHaveURL(/\/lists\/[0-9a-f-]{36}/);
    await expect(page.getByText('all-purpose flour', { exact: true })).toBeVisible();
    await expect(page.getByText('large eggs', { exact: true })).toBeVisible();
    await expect(page.getByText('baking soda', { exact: true })).not.toBeVisible();
  });

  test('manual-paste entry point imports a recipe with no shared URL', async ({ page }) => {
    await mockImportEndpoint(page);

    // No query params → the manual-paste empty state.
    await page.goto('/import');
    await expect(page.getByText(/import from a recipe/i)).toBeVisible();

    const input = page.getByRole('textbox', { name: /recipe url/i });
    await input.fill(RECIPE_URL);
    await page.getByRole('button', { name: /^import$/i }).click();

    // The same downstream importer renders the parsed ingredients.
    await expect(page.getByRole('heading', { name: 'Chocolate Chip Cookies' })).toBeVisible();
    await expect(page.getByText('all-purpose flour', { exact: true })).toBeVisible();
  });

  test('shows a clear error when the page has no recipe', async ({ page }) => {
    await mockImportEndpoint(page, { error: 'no_recipe' }, 422);
    await page.goto(`/import?url=${encodeURIComponent(RECIPE_URL)}`);

    await expect(page.getByText(/couldn’t find a recipe on that page/i)).toBeVisible();
  });
});
