import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

/**
 * 글 하나 = 폴더 하나.
 *
 *   src/content/posts/
 *     llm-assisted-test-1/
 *       index.md          ← 글
 *       pit-score.png     ← 이미지를 그냥 옆에 둔다
 *
 * 본문에서는 ![설명](./pit-score.png) 처럼 상대경로로 쓰면 끝.
 * 경로를 따로 맞출 일도, /public 에 복사할 일도 없다.
 */
const posts = defineCollection({
  loader: glob({ pattern: '**/[^_]*.{md,mdx}', base: './src/content/posts' }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      description: z.string().default(''),
      date: z.coerce.date(),
      updated: z.coerce.date().optional(),
      project: z.string().optional(),
      category: z.string().optional(),
      tags: z.array(z.string()).default([]),
      cover: image().optional(),
      draft: z.boolean().default(false),
      /** 티스토리에서 넘어온 글의 원래 주소. 정규 URL 정리에 쓴다. */
      legacyUrl: z.string().optional(),
    }),
});

export const collections = { posts };
