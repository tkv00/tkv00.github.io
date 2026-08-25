import { getCollection } from 'astro:content';

/** 발행된 글만, 최신순으로. */
export async function allPosts() {
  const posts = await getCollection('posts', ({ data }) => !data.draft || import.meta.env.DEV);
  return posts.sort((a, b) => b.data.date.getTime() - a.data.date.getTime());
}

/** 앞뒤 글. 목록이 최신순이라 이전 글은 인덱스가 하나 뒤다. */
export function neighbors(posts, id) {
  const i = posts.findIndex((p) => p.id === id);
  return { prev: posts[i + 1] ?? null, next: posts[i - 1] ?? null };
}

export const href = (post) => `/posts/${post.id}`;

const fmt = new Intl.DateTimeFormat('ko-KR', {
  year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Asia/Seoul',
});

/** 2026.05.29 */
export const day = (d) => fmt.format(d).replace(/\.\s?/g, '.').replace(/\.$/, '');

/**
 * 읽는 데 걸리는 시간.
 * 한글 기술글은 분당 450자쯤 읽히고, 코드 블록은 눈이 더 오래 머문다.
 */
export function minutes(body = '') {
  const code = [...body.matchAll(/```[\s\S]*?```/g)].map((m) => m[0]).join('');
  const prose = body.replace(/```[\s\S]*?```/g, '');
  const n = prose.replace(/\s/g, '').length / 450 + code.split('\n').length / 22;
  return Math.max(1, Math.round(n));
}

/** 설명이 비어 있으면 본문 첫 문단에서 뽑아 쓴다. */
export function summary(post, len = 150) {
  if (post.data.description) return post.data.description;
  const t = (post.body ?? '')
    .replace(/^---[\s\S]*?---/, '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[#>*_`|-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return t.length > len ? t.slice(0, len).trimEnd() + '…' : t;
}

/** 태그 + 프로젝트 + 카테고리를 한 바구니에 담아 센다. */
export function tagCloud(posts) {
  const m = new Map();
  for (const p of posts) {
    for (const t of [...p.data.tags, p.data.project, p.data.category].filter(Boolean)) {
      m.set(t, (m.get(t) ?? 0) + 1);
    }
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ko'));
}

export const hasTag = (post, tag) =>
  [...post.data.tags, post.data.project, post.data.category].filter(Boolean).includes(tag);
