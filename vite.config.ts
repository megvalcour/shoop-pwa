import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

const pkg = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf-8'),
) as { version: string };

// https://vitejs.dev/config/
export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_DATE__: JSON.stringify(new Date().toISOString()),
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'prompt',
      // Registration is owned by usePwaUpdate (PwaUpdateProvider) so there is a
      // single registration point; don't let the plugin auto-inject a second one.
      injectRegister: false,

      pwaAssets: {
        disabled: false,
        config: true,
      },

      manifest: {
        name: 'Shoop',
        short_name: 'Shoop',
        description: 'Grocery store shopping application',
        theme_color: '#084887',
        share_target: {
          action: '/import',
          method: 'GET',
          enctype: 'application/x-www-form-urlencoded',
          params: { title: 'title', text: 'text', url: 'url' },
        },
      },

      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
      },

      devOptions: {
        enabled: false,
        navigateFallback: 'index.html',
        suppressWarnings: true,
        type: 'module',
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    globals: true,
    environment: 'happy-dom',
    include: ['src/**/*.test.ts?(x)', 'scripts/**/*.test.ts?(x)', 'functions/**/*.test.ts?(x)'],
    setupFiles: ['./src/test-setup.ts'],
    // Only active when run with `--coverage`. The CI `coverage` job reads
    // coverage/coverage-summary.json and publishes total.lines.pct to a
    // gist-backed shields.io badge. @vitest/coverage-v8 is already a devDep.
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      reportsDirectory: './coverage',
    },
    alias: {
      // The virtual module only exists during dev/build; alias it to a stub so
      // it resolves under Vitest (individual tests vi.mock it for behaviour).
      'virtual:pwa-register/react': path.resolve(__dirname, './src/test/pwaRegisterStub.ts'),
    },
  },
});
