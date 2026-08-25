import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { unified, rehypeHeadingIds } from '@astrojs/markdown-remark';
import { gitdolTheme } from './src/lib/shiki-theme.mjs';
import { commentTransformer } from './src/lib/shiki-comments.mjs';
import { rehypeChrome } from './src/lib/rehype-chrome.mjs';
import { site } from './src/site.config.mjs';

export default defineConfig({
  site: site.url,
  trailingSlash: 'ignore',
  build: { format: 'directory' },
  integrations: [
    sitemap({
      filter: (page) => !page.includes('/admin'),
    }),
  ],
  markdown: {
    // 코드 상자와 제목 앵커를 hast 단계에서 붙이므로 remark/rehype 파이프라인을 쓴다
    processor: unified({
      // 제목 id를 먼저 붙여야 그 아래에서 # 앵커를 걸 수 있다
      rehypePlugins: [rehypeHeadingIds, rehypeChrome],
    }),
    shikiConfig: {
      theme: gitdolTheme,
      wrap: false,
      transformers: [commentTransformer()],
    },
  },
  image: {
    // 글 옆에 놓은 이미지를 그대로 최적화한다
    responsiveStyles: true,
  },
  vite: {
    build: { assetsInlineLimit: 0 },
  },
});
