import { test, expect } from './support/offlineModel';

test.describe('Eat tab — profile capture + computed targets', () => {
  test('set up a profile, see computed targets, and persist across reload', async ({ page }) => {
    await page.goto('/eat');

    // The shell carries the green Eat sub-theme (ADR-0028 — light assertion;
    // navigation.spec covers the theme switch in depth).
    await expect(page.locator('div.flex.flex-col.h-svh')).toHaveAttribute('data-theme', 'eat');

    // Empty state: no profile yet → a set-up CTA, no targets.
    const setUp = page.getByRole('button', { name: /set up your profile/i });
    await expect(setUp).toBeVisible();
    await expect(page.getByText('Energy', { exact: true })).toHaveCount(0);

    // Open the form (imperial default) and fill it.
    await setUp.click();
    await page.getByLabel('Age').fill('30');
    await page.getByLabel('Weight').fill('154');
    await page.getByLabel('Height (feet)').fill('5');
    await page.getByLabel('Height (inches)').fill('9');
    await page.getByLabel('Activity level').selectOption('moderate');

    await page.getByRole('button', { name: /save profile/i }).click();

    // Targets appear: energy + at least one macro + one micro.
    await expect(page.getByText('Energy', { exact: true })).toBeVisible();
    await expect(page.getByText('Protein', { exact: true })).toBeVisible();
    await expect(page.getByText('Calcium', { exact: true })).toBeVisible();
    // The summary + edit affordance replace the set-up CTA.
    await expect(page.getByRole('button', { name: /^edit$/i })).toBeVisible();
    await expect(setUp).toHaveCount(0);

    // Reload: the profile survived in `preferences`, so targets still render.
    await page.reload();
    await expect(page.getByText('Energy', { exact: true })).toBeVisible();
    await expect(page.getByText('Calcium', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /set up your profile/i })).toHaveCount(0);
  });
});
