import { test, expect } from './support/offlineModel';
import type { Page } from './support/offlineModel';

// A representative recipe payload mirroring the `/api/import-recipe` 200 contract
// ({ title, ingredients: string[], sourceUrl }). Ingredients are raw strings as
// they arrive from JSON-LD; `normalizeIngredient` discards the leading measure
// run entirely (no quantity/unit capture, ADR-0021), sentence-cases the name, and
// lifts a leading size descriptor into a parenthetical (e.g. "3 large eggs" →
// "Eggs (large)"). Imported items land at the default ×1 like any manual add.
const RECIPE = {
  title: 'Chocolate Chip Cookies',
  ingredients: ['2 cups all-purpose flour', '1 tsp baking soda', '3 large eggs'],
  sourceUrl: 'https://example.com/recipe',
};

// Cleaned catalog names that land on the list after normalization. On the review
// screen these are also the row labels (no quantity prefix), with the raw line
// beneath as the mistranslation guard.
const LIST_NAMES = ['All-purpose flour', 'Baking soda', 'Eggs (large)'];

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

    // Parsed ingredients render as a checklist, all checked by default. Each row
    // shows the cleaned name (no quantity prefix); the raw line stays beneath as
    // the mistranslation guard.
    await expect(page.getByRole('heading', { name: 'Chocolate Chip Cookies' })).toBeVisible();
    for (const name of LIST_NAMES) {
      await expect(page.getByText(name, { exact: true })).toBeVisible();
    }
    // The size-descriptor row reads "Eggs (large)" with its raw line beneath.
    await expect(page.getByText('3 large eggs', { exact: true })).toBeVisible();

    // Set a unit on the eggs row to prove the optional per-row unit control
    // carries through to the committed item.
    await page.getByLabel('Unit for Eggs (large)').fill('dozen');

    // Default target is "New list"; commit all three.
    const commit = page.getByRole('button', { name: /add 3 items/i });
    await expect(commit).toBeEnabled();
    await commit.click();

    // Lands on the freshly created list's detail route with the items present.
    await expect(page).toHaveURL(/\/lists\/[0-9a-f-]{36}/);
    for (const name of LIST_NAMES) {
      await expect(page.getByText(name, { exact: true })).toBeVisible();
    }
    // No quantity was captured: items land at the default ×1. The unit set on the
    // eggs row shows as "1 dozen"; the others have no unit and read "×1".
    await expect(page.getByText('1 dozen', { exact: true })).toBeVisible();
    await expect(page.getByText('×1', { exact: true }).first()).toBeVisible();
  });

  test('unchecking an ingredient excludes it from the commit', async ({ page }) => {
    await mockImportEndpoint(page);
    await page.goto(`/import?url=${encodeURIComponent(RECIPE_URL)}`);

    await expect(page.getByText('Baking soda', { exact: true })).toBeVisible();

    // Uncheck "Baking soda" — the commit count drops and it should not land on the list.
    await page.getByText('Baking soda', { exact: true }).click();

    const commit = page.getByRole('button', { name: /add 2 items/i });
    await expect(commit).toBeVisible();
    await commit.click();

    await expect(page).toHaveURL(/\/lists\/[0-9a-f-]{36}/);
    await expect(page.getByText('All-purpose flour', { exact: true })).toBeVisible();
    await expect(page.getByText('Eggs (large)', { exact: true })).toBeVisible();
    await expect(page.getByText('Baking soda', { exact: true })).not.toBeVisible();
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
    await expect(page.getByText('All-purpose flour', { exact: true })).toBeVisible();
  });

  test('shows a clear error when the page has no recipe', async ({ page }) => {
    await mockImportEndpoint(page, { error: 'no_recipe' }, 422);
    await page.goto(`/import?url=${encodeURIComponent(RECIPE_URL)}`);

    await expect(page.getByText(/couldn’t find a recipe on that page/i)).toBeVisible();
  });

  // Regression: imported ingredients used to sit under "Uncategorized" forever and
  // only started categorizing once the user manually added another item (the only
  // path that primed the matcher). The fix auto-primes the matcher on mount when
  // the active store has unlocated items, so the import itself triggers it.
  //
  // The model network is normally aborted by the offline-model fixture, which lets
  // the worker fail fast — too fast to observe the loading window deterministically.
  // Here we override that route to *hold* the model request so the matcher stays in
  // its `loading` state, giving a stable "Categorizing…" window to assert against.
  // (`status: 'loading'` is set synchronously on the main thread the instant the
  // matcher primes, so its presence proves auto-prime fired — with the Add-item
  // field never touched.)
  test('imported items auto-categorize without any manual add', async ({ page }) => {
    // Hold the model fetch open (overrides the fixture's abort) so the matcher
    // stays in `loading` rather than failing fast.
    await page.route(/huggingface\.co|hf\.co|cdn-lfs/, () => {
      /* intentionally never resolved — keep the request pending */
    });
    await mockImportEndpoint(page);

    await page.goto(`/import?url=${encodeURIComponent(RECIPE_URL)}`);
    const commit = page.getByRole('button', { name: /add 3 items/i });
    await expect(commit).toBeEnabled();
    await commit.click();

    // On the new list, the matcher auto-primes (no manual add): the imported items
    // surface under "Categorizing…", never flashing under "Uncategorized".
    await expect(page).toHaveURL(/\/lists\/[0-9a-f-]{36}/);
    await expect(page.getByText('Categorizing…')).toBeVisible();
    for (const name of LIST_NAMES) {
      await expect(page.getByText(name, { exact: true })).toBeVisible();
    }
    await expect(page.getByText('Uncategorized')).toHaveCount(0);

    // The Add-item field was never interacted with — it is still empty.
    await expect(page.getByPlaceholder(/add an item/i)).toHaveValue('');
  });
});
