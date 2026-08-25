import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import { allPosts, day, summary } from '../../lib/posts.mjs';
import { site, author } from '../../site.config.mjs';

/**
 * 글마다 공유용 이미지를 하나씩 굽는다 (1200×630).
 * 카카오톡·슬랙·트위터에 링크를 붙였을 때 보이는 그 카드다.
 */

const require = createRequire(import.meta.url);
const fontPath = (w: string) =>
  require.resolve(`pretendard/dist/public/static/alternative/Pretendard-${w}.ttf`);

const fonts = await Promise.all(
  [
    ['Regular', 400],
    ['SemiBold', 600],
    ['Bold', 700],
  ].map(async ([w, weight]) => ({
    name: 'Pretendard',
    data: await readFile(fontPath(w as string)),
    weight: weight as 400 | 600 | 700,
    style: 'normal' as const,
  })),
);

export async function getStaticPaths() {
  const posts = await allPosts();
  return [
    { params: { route: 'default' }, props: { post: null } },
    ...posts.map((post) => ({ params: { route: post.id }, props: { post } })),
  ];
}

const BG = '#08090c';
const ACC = '#d9bc90';

/** 프로필 사진을 카드 왼쪽 위에 박는다. 없으면 빈 원을 그린다. */
const avatar = await (async () => {
  if (!author.avatar) return null;
  try {
    const file = new URL(`../../../public${author.avatar}`, import.meta.url);
    const type = author.avatar.endsWith('.png') ? 'png' : 'jpeg';
    return `data:image/${type};base64,${(await readFile(file)).toString('base64')}`;
  } catch {
    return null;
  }
})();

const el = (type: string, props: Record<string, unknown>) => ({ type, props });

export async function GET({ props }: { props: { post: any } }) {
  const { post } = props;

  const title = post ? post.data.title : site.title;
  const lede = post ? summary(post, 96) : site.description;
  const where = post ? (post.data.project ?? post.data.category ?? '') : '';
  const when = post ? day(post.data.date) : '';

  const tree = el('div', {
    style: {
      width: '1200px', height: '630px', display: 'flex', flexDirection: 'column',
      justifyContent: 'space-between', padding: '76px 80px',
      backgroundColor: BG, fontFamily: 'Pretendard', color: '#eef1f6',
      backgroundImage:
        'radial-gradient(900px 420px at 78% -12%, rgba(150,170,214,0.10), rgba(8,9,12,0))',
    },
    children: [
      // 위 — 블로그 이름
      el('div', {
        style: { display: 'flex', alignItems: 'center', gap: '14px' },
        children: [
          avatar
            ? { type: 'img', props: { src: avatar, width: 40, height: 40, style: { borderRadius: '20px' } } }
            : el('div', {
                style: {
                  width: '34px', height: '34px', borderRadius: '17px',
                  backgroundColor: '#1c1f26', border: `2px solid ${ACC}`, display: 'flex',
                },
                children: [],
              }),
          el('div', {
            style: { fontSize: '25px', fontWeight: 700, letterSpacing: '-0.01em' },
            children: site.title,
          }),
          el('div', {
            style: { fontSize: '17px', color: '#6f7682', paddingTop: '5px' },
            children: site.latin,
          }),
        ],
      }),

      // 가운데 — 제목
      el('div', {
        style: { display: 'flex', flexDirection: 'column', gap: '26px' },
        children: [
          where
            ? el('div', {
                style: {
                  display: 'flex', alignSelf: 'flex-start', padding: '7px 16px',
                  borderRadius: '6px', border: `1px solid rgba(217,188,144,0.4)`,
                  color: ACC, fontSize: '20px', fontWeight: 600,
                },
                children: where,
              })
            : el('div', { style: { display: 'flex' }, children: [] }),
          el('div', {
            style: {
              display: 'flex', fontSize: title.length > 34 ? '54px' : '64px',
              fontWeight: 700, lineHeight: 1.34, letterSpacing: '-0.03em', color: '#f4f6fa',
            },
            children: title,
          }),
          lede
            ? el('div', {
                style: {
                  display: 'flex', fontSize: '24px', lineHeight: 1.6,
                  color: '#aab0bc', fontWeight: 400,
                },
                children: lede,
              })
            : el('div', { style: { display: 'flex' }, children: [] }),
        ],
      }),

      // 아래 — 글쓴이와 날짜
      el('div', {
        style: {
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          paddingTop: '28px', borderTop: '1px solid rgba(255,255,255,0.09)',
          fontSize: '21px', color: '#6f7682',
        },
        children: [
          el('div', { style: { display: 'flex' }, children: `${author.name} · ${author.role}` }),
          el('div', { style: { display: 'flex' }, children: when }),
        ],
      }),
    ],
  });

  const svg = await satori(tree as any, { width: 1200, height: 630, fonts });
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: 1200 } }).render().asPng();

  return new Response(png, {
    headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=31536000, immutable' },
  });
}
