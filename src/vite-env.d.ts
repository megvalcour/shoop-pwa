/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/react" />

interface ImportMetaEnv {
  /**
   * Shared recipe-import token sent as `X-Shoop-Import` to
   * `/api/import-recipe` (ADR-0019). Must match the `IMPORT_TOKEN` bound to the
   * Cloudflare Pages project. Not a real secret — it ships in the client bundle.
   */
  readonly VITE_IMPORT_TOKEN?: string;
  /**
   * Shared nutrition token sent as `X-Shoop-Nutrition` to `/api/nutrition`
   * (ADR-0027). Must match the `NUTRITION_TOKEN` bound to the Cloudflare Pages
   * project. Not a real secret — it ships in the client bundle.
   */
  readonly VITE_NUTRITION_TOKEN?: string;
}
