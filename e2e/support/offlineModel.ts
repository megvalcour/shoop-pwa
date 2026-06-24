import { test as base, expect } from '@playwright/test';
export type { Page, Locator, BrowserContext } from '@playwright/test';

// Abort all HuggingFace model network requests so the worker falls through its
// graceful error path deterministically — no ~80 MB download, no CI flake.
export const test = base.extend<object>({
  page: async ({ page }, use) => {
    await page.route(/huggingface\.co|hf\.co|cdn-lfs/, (route) => route.abort());
    // eslint-disable-next-line react-hooks/rules-of-hooks
    await use(page);
  },
});

export { expect };
