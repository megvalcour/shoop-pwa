import { test, expect } from '@playwright/test';

test.describe('Shopping Lists', () => {
  test('shows empty state on first visit to /', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText(/no lists yet/i)).toBeVisible();
  });

  test('FAB at / creates a new list and navigates to detail', async ({ page }) => {
    await page.goto('/');
    const fab = page.getByRole('button', { name: /new list/i });
    await expect(fab).toBeVisible();
    await fab.click();

    await expect(page).toHaveURL(/\/lists\/[0-9a-f-]{36}/);
  });

  test('FAB at /settings creates a new list and navigates to detail', async ({ page }) => {
    await page.goto('/settings');
    const fab = page.getByRole('button', { name: /new list/i });
    await expect(fab).toBeVisible();
    await fab.click();

    await expect(page).toHaveURL(/\/lists\/[0-9a-f-]{36}/);
  });

  test('list card appears on /settings after creation', async ({ page }) => {
    await page.goto('/settings');
    await page.getByRole('button', { name: /new list/i }).click();
    await expect(page).toHaveURL(/\/lists\//);

    await page.goto('/settings');
    const card = page.locator('button').filter({ hasText: /Oxford.*-\s+\w+ \d+/ });
    await expect(card).toBeVisible();
  });

  test('clicking a list card on /settings navigates to its detail route', async ({ page }) => {
    await page.goto('/settings');
    await page.getByRole('button', { name: /new list/i }).click();
    await expect(page).toHaveURL(/\/lists\//);

    await page.goto('/settings');
    const card = page.locator('button').filter({ hasText: /Oxford.*-\s+\w+ \d+/ });
    await card.click();
    await expect(page).toHaveURL(/\/lists\/[0-9a-f-]{36}/);
  });

  test('deleting a list from /settings removes its card after confirmation', async ({ page }) => {
    await page.goto('/settings');
    await page.getByRole('button', { name: /new list/i }).click();
    await expect(page).toHaveURL(/\/lists\//);

    await page.goto('/settings');
    const card = page.locator('button').filter({ hasText: /Oxford.*-\s+\w+ \d+/ });
    await expect(card).toBeVisible();

    await page.getByRole('button', { name: /delete list:/i }).click();
    await expect(page.getByRole('alertdialog')).toBeVisible();
    await page.getByRole('button', { name: /^delete$/i }).click();

    await expect(page.getByRole('alertdialog')).not.toBeVisible();
    await expect(card).not.toBeVisible();
    await expect(page.getByText(/no lists yet/i)).toBeVisible();
  });

  test('renaming the title on the detail screen persists across reload', async ({ page }) => {
    await page.goto('/settings');
    await page.getByRole('button', { name: /new list/i }).click();
    await expect(page).toHaveURL(/\/lists\/[0-9a-f-]{36}/);

    await page.getByRole('button', { name: /^rename:/i }).click();
    const titleInput = page.getByRole('textbox', { name: /list name/i });
    await titleInput.fill('My Renamed List');
    await titleInput.press('Enter');

    await expect(page.getByRole('button', { name: 'Rename: My Renamed List' })).toBeVisible();

    await page.reload();
    await expect(page.getByRole('button', { name: 'Rename: My Renamed List' })).toBeVisible();
  });

  test('cancelling the delete confirmation keeps the list', async ({ page }) => {
    await page.goto('/settings');
    await page.getByRole('button', { name: /new list/i }).click();
    await expect(page).toHaveURL(/\/lists\//);

    await page.goto('/settings');
    const card = page.locator('button').filter({ hasText: /Oxford.*-\s+\w+ \d+/ });
    await expect(card).toBeVisible();

    await page.getByRole('button', { name: /delete list:/i }).click();
    await expect(page.getByRole('alertdialog')).toBeVisible();
    await page.getByRole('button', { name: /^cancel$/i }).click();

    await expect(page.getByRole('alertdialog')).not.toBeVisible();
    await expect(card).toBeVisible();
  });
});

test.describe('Item check-off', () => {
  test('checking an item moves it to the bottom and applies line-through', async ({ page }) => {
    await page.goto('/settings');
    await page.getByRole('button', { name: /new list/i }).click();
    await expect(page).toHaveURL(/\/lists\//);

    const input = page.getByPlaceholder(/add an item/i);
    await input.fill('Apples');
    await page.getByRole('button', { name: /^add$/i }).click();
    await expect(input).toBeEnabled();

    await input.fill('Bread');
    await page.getByRole('button', { name: /^add$/i }).click();
    await expect(input).toBeEnabled();

    await expect(page.getByText('Apples', { exact: true })).toBeVisible();
    await expect(page.getByText('Bread', { exact: true })).toBeVisible();

    await page.getByText('Apples', { exact: true }).click();

    const items = page.locator('ul li');
    await expect(items.nth(0)).toHaveText(/Bread/);

    const applesSpan = page.getByText('Apples', { exact: true });
    await expect(applesSpan).toHaveClass(/line-through/);
  });

  test('unchecking a checked item moves it back to the top and removes strikethrough', async ({ page }) => {
    await page.goto('/settings');
    await page.getByRole('button', { name: /new list/i }).click();
    await expect(page).toHaveURL(/\/lists\//);

    const input = page.getByPlaceholder(/add an item/i);
    await input.fill('Apples');
    await page.getByRole('button', { name: /^add$/i }).click();
    await expect(input).toBeEnabled();

    await input.fill('Bread');
    await page.getByRole('button', { name: /^add$/i }).click();
    await expect(input).toBeEnabled();

    await page.getByText('Apples', { exact: true }).click();
    const items = page.locator('ul li');
    await expect(items.nth(1)).toHaveText(/Apples/);

    await page.getByText('Apples', { exact: true }).click();
    // Apples is unchecked and back in the aisle-sorted unchecked group
    await expect(page.getByText('Apples', { exact: true })).toBeVisible();
    await expect(page.getByText('Apples', { exact: true })).not.toHaveClass(/line-through/);
  });
});

test.describe('AddItemForm', () => {
  test('renders input and submit button on list detail page', async ({ page }) => {
    await page.goto('/settings');
    await page.getByRole('button', { name: /new list/i }).click();
    await expect(page).toHaveURL(/\/lists\//);

    await expect(page.getByPlaceholder(/add an item/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /^add$/i })).toBeVisible();
  });

  test('submitting an item clears the input', async ({ page }) => {
    await page.goto('/settings');
    await page.getByRole('button', { name: /new list/i }).click();
    await expect(page).toHaveURL(/\/lists\//);

    const input = page.getByPlaceholder(/add an item/i);
    await input.fill('Apples');
    await page.getByRole('button', { name: /^add$/i }).click();

    await expect(input).toBeEnabled();
    await expect(input).toHaveValue('');
  });

  test('deleting an item removes it from the list', async ({ page }) => {
    await page.goto('/settings');
    await page.getByRole('button', { name: /new list/i }).click();
    await expect(page).toHaveURL(/\/lists\//);

    const input = page.getByPlaceholder(/add an item/i);
    await input.fill('Bananas');
    await page.getByRole('button', { name: /^add$/i }).click();
    await expect(input).toBeEnabled();

    await expect(page.getByText('Bananas')).toBeVisible();

    await page.getByRole('button', { name: /delete item/i }).click();

    await expect(page.getByText('Bananas')).not.toBeVisible();
    await expect(page.getByText(/no items yet/i)).toBeVisible();
  });
});
