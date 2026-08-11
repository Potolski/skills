// @ts-check
import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://skills.solana.com',
  output: 'static',
  trailingSlash: 'never',
  build: {
    format: 'file',
    inlineStylesheets: 'auto',
  },
  markdown: {
    shikiConfig: {
      theme: 'github-dark-default',
      wrap: false,
    },
    rehypePlugins: [(await import('./src/lib/rehype-github-links.mjs')).default],
  },
});
