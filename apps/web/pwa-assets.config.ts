import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config';

const brand = '#0d9488';

export default defineConfig({
  headLinkOptions: { preset: '2023' },
  preset: {
    ...minimal2023Preset,
    maskable: { ...minimal2023Preset.maskable, sizes: [192, 512], resizeOptions: { background: brand } },
    apple: { ...minimal2023Preset.apple, resizeOptions: { background: brand } },
  },
  images: ['public/pwa-icon.svg'],
});
