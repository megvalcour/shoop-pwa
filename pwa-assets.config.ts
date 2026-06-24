import { defineConfig, minimal2023Preset as preset } from '@vite-pwa/assets-generator/config';

export default defineConfig({
  headLinkOptions: {
    preset: '2023',
  },
  preset: {
    ...preset,
    maskable: {
      padding: 0.3,
      sizes: [512],
      resizeOptions: {
        background: '#084887',
      },
    },
  },
  images: ['public/favicon.svg'],
});
