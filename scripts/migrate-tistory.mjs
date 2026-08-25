#!/usr/bin/env node
/**
 * 티스토리 → 깃돌 이사 도구
 *
 *   node scripts/migrate-tistory.mjs backup.xml
 *   node scripts/migrate-tistory.mjs --url https://codekim3570.tistory.com
 *   node scripts/migrate-tistory.mjs backup.xml --dry     (파일을 쓰지 않고 확인만)
 *
 * 백업 XML 은 티스토리 관리자 → 설정 → 데이터 관리 → 블로그 데이터 내보내기 에서 받는다.
 * 백업 쪽이 훨씬 정확하다. 주소만 주면 RSS와 글 페이지를 긁어서 최선을 다한다.
 *
 * 하는 일
 *   1. 글 하나당 폴더 하나를 만든다      src/content/posts/<슬러그>/
 *   2. 본문 HTML 을 마크다운으로 바꾼다
 *   3. 본문에 걸린 이미지를 전부 내려받아 글 옆에 둔다
 *   4. 본문의 이미지 경로를 ./파일명 으로 바꾼다
 *   5. 제목·날짜·카테고리·태그를 프론트매터로 옮긴다
 */

import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { XMLParser } from 'fast-xml-parser';
import TurndownService from 'turndown';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'src/content/posts');

const args = process.argv.slice(2);
const DRY = args.includes('--dry');
const urlIdx = args.indexOf('--url');
const scanIdx = args.indexOf('--scan');
const valueAfter = (flag, index) => (index !== -1 ? args[index + 1] : null);
const SITE = valueAfter('--url', urlIdx);
const scanValue = valueAfter('--scan', scanIdx);
const parsedScan = Number(scanValue);
const MAX_SCAN = Number.isInteger(parsedScan) && parsedScan > 0 ? parsedScan : 120;

// 옵션의 값(--url 뒤의 주소, --scan 뒤의 숫자)은 XML 파일 후보에서 제외한다.
const XML = args.find((a, i) =>
  !a.startsWith('--') &&
  (urlIdx === -1 || i !== urlIdx + 1) &&
  (scanIdx === -1 || i !== scanIdx + 1),
);

const log = (...a) => console.log(...a);
const warn = (...a) => console.warn('  ⚠', ...a);

/* ── 마크다운 변환기 ─────────────────────────────────────── */
const td = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  bulletListMarker: '-',
  emDelimiter: '*',
});

// 티스토리 코드 블록은 <pre><code class="language-java"> 또는 그냥 <pre> 로 온다
td.addRule('codeblock', {
  filter: (node) => node.nodeName === 'PRE',
  replacement: (_content, node) => {
    const code = node.querySelector?.('code') ?? node;
    const cls = String(code.getAttribute?.('class') ?? '');
    const lang = (cls.match(/language-([\w+#-]+)/) || cls.match(/\b(java|kotlin|js|ts|python|sql|bash|shell|yaml|json|xml|html|css)\b/i) || [, ''])[1];
    const text = (code.textContent ?? '').replace(/\n+$/, '');
    return `\n\n\`\`\`${lang.toLowerCase()}\n${text}\n\`\`\`\n\n`;
  },
});

// 티스토리가 감싸는 figure/figcaption 을 살린다
td.addRule('figure', {
  filter: (node) => node.nodeName === 'FIGURE',
  replacement: (content) => `\n\n${content.trim()}\n\n`,
});

// 빈 문단과 &nbsp; 덩어리를 지운다
td.addRule('emptyP', {
  filter: (node) => node.nodeName === 'P' && !node.textContent.replace(/ |\s/g, '') && !node.querySelector?.('img'),
  replacement: () => '',
});

/* ── 문자열 도구 ─────────────────────────────────────────── */

/** 제목을 주소로 쓸 수 있는 모양으로 바꾼다. 한글은 그대로 둔다. */
function slugify(title, fallback) {
  const s = String(title ?? '')
    .normalize('NFC')
    .replace(/[’'"“”`]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 80);
  return s || `post-${fallback}`;
}

const esc = (s) => String(s ?? '').replace(/"/g, '\\"');

/** 티스토리 날짜(초 단위 타임스탬프 또는 문자열)를 YYYY-MM-DD 로. */
function toDate(v) {
  if (v == null) return new Date().toISOString().slice(0, 10);
  const n = Number(v);
  const d = Number.isFinite(n) && n > 1e8 ? new Date(n * (n > 1e12 ? 1 : 1000)) : new Date(v);
  return Number.isNaN(d.getTime())
    ? new Date().toISOString().slice(0, 10)
    : d.toISOString().slice(0, 10);
}

/* ── 이미지 내려받기 ─────────────────────────────────────── */
let downloaded = 0;
let failed = 0;

async function grabImages(html, dir) {
  const urls = [...html.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)].map((m) => m[1]);
  const map = new Map();
  let i = 0;

  for (const raw of urls) {
    if (map.has(raw)) continue;
    const src = raw.startsWith('//') ? `https:${raw}` : raw;
    if (!/^https?:/i.test(src)) continue;

    i += 1;
    const guessed = decodeURIComponent(src.split('?')[0].split('/').pop() ?? '');
    const ext = (guessed.match(/\.(png|jpe?g|gif|webp|avif|svg)$/i) || [, 'png'])[1].toLowerCase();
    const name = `${String(i).padStart(2, '0')}-${slugify(guessed.replace(/\.[^.]+$/, ''), i).slice(0, 40) || 'image'}.${ext}`;

    if (DRY) { map.set(raw, `./${name}`); continue; }

    try {
      const res = await fetch(src, {
        headers: { 'user-agent': 'Mozilla/5.0', referer: SITE ?? 'https://www.tistory.com/' },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await writeFile(path.join(dir, name), Buffer.from(await res.arrayBuffer()));
      map.set(raw, `./${name}`);
      downloaded += 1;
    } catch (e) {
      warn(`이미지 실패 ${src} — ${e.message}`);
      map.set(raw, src); // 실패하면 원래 주소를 그대로 둔다
      failed += 1;
    }
  }
  return map;
}

/* ── 글 하나 저장 ────────────────────────────────────────── */
async function writePost(post, index) {
  const slug = slugify(post.title, post.id ?? index);
  const dir = path.join(OUT, slug);

  if (existsSync(path.join(dir, 'index.md'))) {
    log(`  · 건너뜀 (이미 있음) ${slug}`);
    return false;
  }
  if (!DRY) await mkdir(dir, { recursive: true });

  // 1) 이미지를 먼저 내려받고 본문의 주소를 바꿔치기한다
  const map = await grabImages(post.html, dir);
  let html = post.html;
  for (const [from, to] of map) {
    html = html.split(from).join(to);
  }

  // 2) 마크다운으로
  let body = td.turndown(html).replace(/\n{3,}/g, '\n\n').trim();

  // 3) 프론트매터
  const cat = post.category ?? '';
  const isProject = /^(Holliverse|Shoot-Pointer|WealthTracker|Vero|Qampus|TR1L)$/i.test(cat);
  const fm = [
    '---',
    `title: "${esc(post.title)}"`,
    post.description ? `description: "${esc(post.description)}"` : null,
    `date: ${toDate(post.date)}`,
    isProject ? `project: ${cat}` : cat ? `category: ${cat}` : null,
    post.tags?.length ? `tags: [${post.tags.map((t) => `"${esc(t)}"`).join(', ')}]` : null,
    post.url ? `legacyUrl: "${post.url}"` : null,
    '---',
    '',
  ].filter(Boolean).join('\n');

  if (!DRY) await writeFile(path.join(dir, 'index.md'), `${fm}${body}\n`, 'utf8');
  log(`  ✓ ${slug}  (이미지 ${map.size}장, ${body.length}자)`);
  return true;
}

/* ── 백업 XML 읽기 ───────────────────────────────────────── */
async function fromXml(file) {
  const xml = await readFile(file, 'utf8');
  const parsed = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@',
    cdataPropName: '__cdata',
    parseTagValue: false,
    trimValues: true,
  }).parse(xml);

  // 티스토리 백업은 <blog><post>… 구조다. 혹시 모르니 넓게 훑는다.
  const dig = (node, out = []) => {
    if (!node || typeof node !== 'object') return out;
    for (const [k, v] of Object.entries(node)) {
      if (k.toLowerCase() === 'post') out.push(...(Array.isArray(v) ? v : [v]));
      else if (typeof v === 'object') dig(v, out);
    }
    return out;
  };

  const val = (v) => (v && typeof v === 'object' ? (v.__cdata ?? v['#text'] ?? '') : (v ?? ''));

  return dig(parsed).map((p, i) => {
    const tags = []
      .concat(p.tag ?? p.tags?.tag ?? [])
      .map(val)
      .filter(Boolean);
    return {
      id: val(p.id) || i,
      title: val(p.title) || `제목 없음 ${i + 1}`,
      html: val(p.content) || '',
      date: val(p.published) || val(p.date) || val(p.created),
      category: val(p.category),
      tags,
      url: val(p.link) || val(p.url) || '',
    };
  });
}

/* ── 주소로 긁기 (백업이 없을 때) ────────────────────────── */
async function fromSite(base) {
  const origin = base.replace(/\/+$/, '');
  const seen = new Set();
  const posts = [];

  const get = async (u) => {
    const r = await fetch(u, { headers: { 'user-agent': 'Mozilla/5.0' } });
    if (!r.ok) throw new Error(`HTTP ${r.status} ${u}`);
    return r.text();
  };

  // 1) RSS 로 최근 글을, 2) 글 번호를 훑어 나머지를 찾는다
  try {
    const rss = await get(`${origin}/rss`);
    for (const m of rss.matchAll(/<link>([^<]*\/\d+)<\/link>/g)) seen.add(m[1].trim());
  } catch (e) {
    warn(`RSS 실패 — ${e.message}`);
  }

  for (let n = 1; n <= MAX_SCAN; n++) seen.add(`${origin}/${n}`);

  log(`  주소 후보 ${seen.size}개를 확인합니다…`);

  for (const url of seen) {
    let html;
    try {
      html = await get(url);
    } catch {
      continue;
    }

    const title =
      (html.match(/<meta\s+property=["']og:title["']\s+content=["']([^"']+)["']/i) || [])[1] ??
      (html.match(/<title>([^<]+)<\/title>/i) || [])[1];
    if (!title) continue;

    const body =
      (html.match(/<div class="tt_article_useless_p_margin[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/i) || [])[1] ??
      (html.match(/<div[^>]+class="[^"]*\bcontents_style\b[^"]*"[^>]*>([\s\S]*?)<\/div>/i) || [])[1];
    if (!body || body.replace(/<[^>]+>/g, '').trim().length < 40) continue;

    posts.push({
      id: url.split('/').pop(),
      title: title.replace(/\s*[|·-]\s*[^|·-]*$/, '').trim(),
      html: body,
      date:
        (html.match(/<meta\s+property=["']article:published_time["']\s+content=["']([^"']+)["']/i) || [])[1] ??
        (html.match(/datetime=["']([\d-]{10})/i) || [])[1],
      category: (html.match(/<meta\s+property=["']article:section["']\s+content=["']([^"']+)["']/i) || [])[1] ?? '',
      tags: [...html.matchAll(/<meta\s+property=["']article:tag["']\s+content=["']([^"']+)["']/gi)].map((m) => m[1]),
      url,
    });
    log(`  · 찾음 ${url} — ${title.slice(0, 40)}`);
  }
  return posts;
}

/* ── 실행 ────────────────────────────────────────────────── */
(async () => {
  if (!XML && !SITE) {
    console.error(`
사용법
  node scripts/migrate-tistory.mjs backup.xml
  node scripts/migrate-tistory.mjs --url https://codekim3570.tistory.com [--scan 200]

  --dry   파일을 쓰지 않고 무엇이 옮겨질지만 보여줍니다.

백업 파일은 티스토리 관리자 → 설정 → 데이터 관리 → 블로그 데이터 내보내기 에서 받습니다.
`);
    process.exit(1);
  }

  log(`\n티스토리 글을 옮깁니다${DRY ? ' (확인만)' : ''}\n`);

  let posts;
  if (XML) {
    await access(XML);
    log(`  백업 파일: ${XML}`);
    posts = await fromXml(XML);
  } else {
    log(`  블로그 주소: ${SITE}`);
    posts = await fromSite(SITE);
  }

  posts = posts.filter((p) => p.html && p.html.trim().length > 0);
  log(`  글 ${posts.length}편을 찾았습니다\n`);

  if (!DRY) await mkdir(OUT, { recursive: true });

  let made = 0;
  for (const [i, p] of posts.entries()) {
    try {
      if (await writePost(p, i)) made += 1;
    } catch (e) {
      warn(`${p.title} — ${e.message}`);
    }
  }

  log(`\n끝났습니다. 새 글 ${made}편, 이미지 ${downloaded}장${failed ? `, 실패 ${failed}장` : ''}.`);
  log(`\n확인:  npm run dev\n`);
})();
