#!/usr/bin/env node
/**
 * 티스토리 → 깃돌 이사 도구
 *
 *   node scripts/migrate-tistory.mjs backup.xml
 *   node scripts/migrate-tistory.mjs --local /path/to/tistory-export
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

import { mkdir, readFile, writeFile, access, copyFile, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { XMLParser } from 'fast-xml-parser';
import TurndownService from 'turndown';
import * as parse5 from 'parse5';
import { detectCodeLanguage } from './code-language.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'src/content/posts');

const args = process.argv.slice(2);
const DRY = args.includes('--dry');
const FORCE = args.includes('--force');
const urlIdx = args.indexOf('--url');
const scanIdx = args.indexOf('--scan');
const localIdx = args.indexOf('--local');
const valueAfter = (flag, index) => (index !== -1 ? args[index + 1] : null);
const SITE = valueAfter('--url', urlIdx);
const LOCAL = valueAfter('--local', localIdx);
const scanValue = valueAfter('--scan', scanIdx);
const parsedScan = Number(scanValue);
const MAX_SCAN = Number.isInteger(parsedScan) && parsedScan > 0 ? parsedScan : 120;

// 옵션의 값(--url 뒤의 주소, --scan 뒤의 숫자)은 XML 파일 후보에서 제외한다.
const XML = args.find((a, i) =>
  !a.startsWith('--') &&
  (urlIdx === -1 || i !== urlIdx + 1) &&
  (scanIdx === -1 || i !== scanIdx + 1) &&
  (localIdx === -1 || i !== localIdx + 1),
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
    const text = (code.textContent ?? '').replace(/\n+$/, '');
    const declaredLanguage = (cls.match(/language-([\w+#-]+)/)
      || cls.match(/\b(java|kotlin|js|ts|python|sql|bash|shell|yaml|json|xml|html|css)\b/i)
      || [, ''])[1];
    const language = declaredLanguage && !/^(?:plain)?text$/i.test(declaredLanguage)
      ? declaredLanguage.toLowerCase()
      : detectCodeLanguage(text);
    return `\n\n\`\`\`${language}\n${text}\n\`\`\`\n\n`;
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

// 기본 Turndown은 표의 셀 경계를 없앤다. 원문의 행/열을 GFM 표로 보존한다.
td.addRule('table', {
  filter: 'table',
  replacement: (_content, node) => {
    const descendants = (root, names, out = []) => {
      for (const child of root.childNodes ?? []) {
        if (names.includes(String(child.nodeName).toLowerCase())) out.push(child);
        descendants(child, names, out);
      }
      return out;
    };
    const rows = descendants(node, ['tr'])
      .map((row) => descendants(row, ['th', 'td'])
        .map((cell) => String(cell.textContent ?? '')
          .replace(/\s*\n\s*/g, '<br>')
          .replace(/\|/g, '\\|')
          .trim()))
      .filter((row) => row.length);
    if (!rows.length) return '';

    const width = Math.max(...rows.map((row) => row.length));
    const padded = rows.map((row) => [...row, ...Array(width - row.length).fill('')]);
    const lines = [
      `| ${padded[0].join(' | ')} |`,
      `| ${Array(width).fill('---').join(' | ')} |`,
      ...padded.slice(1).map((row) => `| ${row.join(' | ')} |`),
    ];
    return `\n\n${lines.join('\n')}\n\n`;
  },
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

const yamlString = (s) => JSON.stringify(String(s ?? ''));

/** 티스토리 날짜(초 단위 타임스탬프 또는 문자열)를 YYYY-MM-DD 로. */
function toDate(v) {
  if (v == null) return new Date().toISOString().slice(0, 10);
  // 로컬 내보내기의 `YYYY-MM-DD HH:mm:ss`는 한국 현지 시각이다.
  // Date로 다시 해석하면 자정 무렵 글이 UTC 기준 전날로 밀린다.
  const localDate = String(v).match(/^(\d{4}-\d{2}-\d{2})(?:\s|$)/);
  if (localDate) return localDate[1];
  const n = Number(v);
  const d = Number.isFinite(n) && n > 1e8 ? new Date(n * (n > 1e12 ? 1 : 1000)) : new Date(v);
  return Number.isNaN(d.getTime())
    ? new Date().toISOString().slice(0, 10)
    : d.toISOString().slice(0, 10);
}

/* ── 이미지 내려받기 ─────────────────────────────────────── */
let downloaded = 0;
let failed = 0;

function imageExtension(buffer, source) {
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buffer[0] === 0xff && buffer[1] === 0xd8) return 'jpg';
  if (buffer.subarray(0, 6).toString('ascii').startsWith('GIF8')) return 'gif';
  if (buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') return 'webp';
  if (buffer.subarray(4, 12).toString('ascii').includes('ftyp')) return 'avif';
  if (/^\s*<svg[\s>]/i.test(buffer.subarray(0, 512).toString('utf8'))) return 'svg';
  const ext = path.extname(source).slice(1).toLowerCase();
  return /^[a-z0-9]{1,8}$/.test(ext) ? ext : 'bin';
}

/** 로컬 티스토리 내보내기에 포함된 이미지와 첨부파일을 글 폴더로 복사한다. */
async function grabLocalAssets(html, sourceDir, targetDir) {
  const refs = [
    ...html.matchAll(/<img[^>]+src=["']([^"']+)["']/gi),
    ...html.matchAll(/<a[^>]+href=["']([^"']+)["']/gi),
  ].map((match) => match[1]);
  const map = new Map();
  let index = 0;

  for (const raw of refs) {
    if (map.has(raw) || /^(?:https?:|\/\/|data:|#)/i.test(raw)) continue;

    let decoded;
    try { decoded = decodeURIComponent(raw.split(/[?#]/)[0]); }
    catch { decoded = raw.split(/[?#]/)[0]; }

    const source = path.resolve(sourceDir, decoded);
    const relative = path.relative(sourceDir, source);
    if (relative.startsWith('..') || path.isAbsolute(relative) || !existsSync(source)) continue;
    if (!(await stat(source)).isFile()) continue;

    index += 1;
    const buffer = await readFile(source);
    const isImage = /<img[^>]+src=["']/.test(html.slice(Math.max(0, html.indexOf(raw) - 100), html.indexOf(raw) + raw.length));
    const ext = isImage ? imageExtension(buffer, source) : (path.extname(source).slice(1).toLowerCase() || 'bin');
    const base = slugify(path.basename(source, path.extname(source)), index).slice(0, 48) || (isImage ? 'image' : 'file');
    const name = `${String(index).padStart(2, '0')}-${base}.${ext}`;

    if (!DRY) await copyFile(source, path.join(targetDir, name));
    map.set(raw, `./${name}`);
    downloaded += 1;
  }
  return map;
}

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
  const slug = existingSlugs.get(String(post.id ?? '')) ?? slugify(post.title, post.id ?? index);
  const dir = path.join(OUT, slug);

  if (!FORCE && existsSync(path.join(dir, 'index.md'))) {
    log(`  · 건너뜀 (이미 있음) ${slug}`);
    return false;
  }
  if (!DRY) await mkdir(dir, { recursive: true });

  // 1) 이미지와 첨부파일을 먼저 옮기고 본문의 주소를 바꿔치기한다
  const map = post.localDir
    ? await grabLocalAssets(post.html, post.localDir, dir)
    : await grabImages(post.html, dir);
  let html = post.html;
  for (const [from, to] of map) {
    html = html.split(from).join(to);
  }

  // 2) 마크다운으로
  let body = td.turndown(html)
    .replace(/(?:&nbsp;|&#160;)/gi, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  // 3) 프론트매터
  const rawCat = String(post.category ?? '').split('/').filter(Boolean).pop() ?? '';
  const cat = rawCat === 'WelathTracker' ? 'WealthTracker' : rawCat;
  const isProject = /^(Holliverse|Shoot-Pointer|WealthTracker|Vero|Qampus|TR1L)$/i.test(cat);
  const fm = [
    '---',
    `title: ${yamlString(post.title)}`,
    post.description ? `description: ${yamlString(post.description)}` : null,
    `date: ${toDate(post.date)}`,
    isProject ? `project: ${cat}` : cat ? `category: ${cat}` : null,
    post.tags?.length ? `tags: [${post.tags.map(yamlString).join(', ')}]` : null,
    post.url ? `legacyUrl: ${yamlString(post.url)}` : null,
    '---',
  ].filter(Boolean).join('\n');

  if (!DRY) await writeFile(path.join(dir, 'index.md'), `${fm}\n\n${body}\n`, 'utf8');
  log(`  ✓ ${slug}  (이미지 ${map.size}장, ${body.length}자)`);
  return true;
}

const nodeText = (node) => node?.nodeName === '#text'
  ? node.value
  : (node?.childNodes ?? []).map(nodeText).join('');

const attr = (node, name) => node?.attrs?.find((item) => item.name === name)?.value ?? '';

function findNode(node, predicate) {
  if (predicate(node)) return node;
  for (const child of node?.childNodes ?? []) {
    const found = findNode(child, predicate);
    if (found) return found;
  }
  return null;
}

const hasClass = (node, name) => attr(node, 'class').split(/\s+/).includes(name);

// 티스토리 로컬 내보내기가 아래 이모지를 물음표로 치환한다.
// 현재 공개된 원문과 대조해 확인한 값이며, 이후 재이사할 때도 같은 손상이 반복되지 않게 한다.
const exportTextFixes = {
  4: [['?100명의', '📈100명의'], ['?500명의', '📈500명의']],
  15: [['? 테스트 코드 보기', '👇 테스트 코드 보기'], ['?Optimistic Lock', '🚨Optimistic Lock']],
  16: [['?ElasticSearch란?', '🧠ElasticSearch란?'], ['‼️왜 saveAll()은 거북이 달리기인가?‼️', '‼️왜 saveAll()은 거북이 달리기인가🐢‼️']],
  17: [['?전체 코드 보기', '👇전체 코드 보기'], ['48.89%?', '48.89%🔺'], ['55.76%?', '55.76%🔺'], ['63.03%?', '63.03%🔺'], ['55.89%?', '55.89%🔺']],
  18: [['?기존 docker-compose.yml 파일', '👇기존 docker-compose.yml 파일'], ['?삭제할 docker-compose.yml', '👇삭제할 docker-compose.yml']],
  19: [['? 1. 디스크 읽기 방식', '📘 1. 디스크 읽기 방식'], ['랜덤 I/O의 비중 ?', '랜덤 I/O의 비중 🔼'], ['? 2. 인덱스', '📘 2. 인덱스'], ['? 3. 기본 데이터 처리', '📘 3. 기본 데이터 처리'], ['? 4. 고급 최적화', '📘 4. 고급 최적화']],
  20: [['? 1. 트랜잭션', '📘 1. 트랜잭션'], ['? 2. 격리수준', '📘 2. 격리수준'], ['???', '🚨🚨🚨'], ['? 3. 잠금', '📘 3. 잠금']],
  21: [['? 1. 인덱스의 장단점', '📘 1. 인덱스의 장단점'], ['? 2. 인덱스 자료구조', '📘 2. 인덱스 자료구조'], ['? 3. 인덱스를 이용하여 데이터 읽는 방법', '📘 3. 인덱스를 이용하여 데이터 읽는 방법'], ['? 4. 인덱스의 가용성과 효율성', '📘 4. 인덱스의 가용성과 효율성'], ['작업 범위 결정 조건 ?', '작업 범위 결정 조건 🔼'], ['쿼리 처리 성능 ?', '쿼리 처리 성능 🔼'], ['? 5. 다양한 인덱스', '📘 5. 다양한 인덱스']],
  23: [['? 1. 테이블 액세스 최소화', '📘 1. 테이블 액세스 최소화'], ['? 2. 인덱스 스캔 효율화', '📘 2. 인덱스 스캔 효율화']],
  24: [['? "굳이 이벤트 스토밍을?"', '🤔 "굳이 이벤트 스토밍을?"'], ['? "Aggregate가 곧 Bounded Context인가?"', '🤯 "Aggregate가 곧 Bounded Context인가?"'], ['? "불완전한 데이터는 어디에 머물러야 하는가?"', '🤯 "불완전한 데이터는 어디에 머물러야 하는가?"'], ['?참고자료', '📋참고자료']],
  25: [['? 1. JVM의 개념', '📘 1. JVM의 개념'], ['?JVM은 OS에 종속적인가?', '💡JVM은 OS에 종속적인가?'], ['?JAVA 소스 코드를 컴파일하면', '💡JAVA 소스 코드를 컴파일하면'], ['? 2. JVM 동작 방식', '📘 2. JVM 동작 방식']],
  26: [['? 1. Call By Value VS Call By Reference', '📘 1. Call By Value VS Call By Reference'], ['? 2. 얕은 복사 VS 깊은 복사', '📘 2. 얕은 복사 VS 깊은 복사'], ['? 3. 제너릭', '📘 3. 제너릭'], ['? 4. Object', '📘 4. Object'], ['? 5. String', '📘 5. String'], ['?NPE?', '🚨NPE🚨'], ['? 6. 블변', '📘 6. 블변'], ['? 7. 리플랙션', '📘 7. 리플랙션']],
  27: [['? 1. 힙 영역', '📘 1. 힙 영역'], ['?2. GC', '📘2. GC']],
  41: [['?작업 내용', '📝작업 내용']],
};

const singletonFixes = { 11: '🚨', 15: '✅', 16: '🚨', 21: '❌', 23: '🚨', 24: '💡', 27: '👇' };

function repairExportText(node, id) {
  if (node?.nodeName === '#text') {
    if (node.value.trim() === '?' && singletonFixes[id]) {
      node.value = node.value.replace('?', singletonFixes[id]);
    }
    for (const [from, to] of exportTextFixes[id] ?? []) {
      node.value = node.value.split(from).join(to);
    }
    if (id === 24) {
      node.value = node.value.replace(/\?\s+(?="불완전한 데이터는 어디에 머물러야 하는가\?")/, '🤯 ');
    }
    return;
  }
  for (const child of node?.childNodes ?? []) repairExportText(child, id);
}

/** 티스토리의 폴더형 로컬 내보내기(글 번호/글.html)를 읽는다. */
async function fromLocal(root) {
  const entries = (await readdir(root, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && /^\d+$/.test(entry.name))
    .sort((a, b) => Number(a.name) - Number(b.name));
  const posts = [];

  for (const entry of entries) {
    const dir = path.join(root, entry.name);
    const file = (await readdir(dir)).find((name) => name.toLowerCase().endsWith('.html'));
    if (!file) { warn(`${entry.name}번 글에 HTML 파일이 없습니다.`); continue; }

    const document = parse5.parse(await readFile(path.join(dir, file), 'utf8'));
    repairExportText(document, Number(entry.name));
    const contents = findNode(document, (node) => hasClass(node, 'contents_style'));
    const titleNode = findNode(document, (node) => node.nodeName === 'h2' && hasClass(node, 'title-article'))
      ?? findNode(document, (node) => node.nodeName === 'title');
    const categoryNode = findNode(document, (node) => node.nodeName === 'p' && hasClass(node, 'category'));
    const dateNode = findNode(document, (node) => node.nodeName === 'p' && hasClass(node, 'date'));
    const tagsNode = findNode(document, (node) => hasClass(node, 'tags'));

    if (!contents) { warn(`${entry.name}번 글에서 본문을 찾지 못했습니다.`); continue; }
    const tags = nodeText(tagsNode).trim()
      .split(/\s+(?=#)/)
      .map((tag) => tag.replace(/^#/, '').trim())
      .filter(Boolean);
    posts.push({
      id: entry.name,
      title: nodeText(titleNode).trim() || `제목 없음 ${entry.name}`,
      html: parse5.serialize(contents),
      date: nodeText(dateNode).trim(),
      category: nodeText(categoryNode).trim(),
      tags,
      url: `https://codekim3570.tistory.com/${entry.name}`,
      localDir: dir,
    });
  }
  return posts;
}

/** 제목을 고쳐도 기존 글 주소가 바뀌지 않도록 글 번호 → 현재 슬러그를 만든다. */
const existingSlugs = new Map();
async function loadExistingSlugs() {
  if (!existsSync(OUT)) return;
  for (const entry of await readdir(OUT, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const file = path.join(OUT, entry.name, 'index.md');
    if (!existsSync(file)) continue;
    const match = (await readFile(file, 'utf8')).match(/legacyUrl:\s*["']?https:\/\/codekim3570\.tistory\.com\/(\d+)/);
    if (match) existingSlugs.set(match[1], entry.name);
  }
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
  if (!XML && !SITE && !LOCAL) {
    console.error(`
사용법
  node scripts/migrate-tistory.mjs backup.xml
  node scripts/migrate-tistory.mjs --local /path/to/tistory-export [--force]
  node scripts/migrate-tistory.mjs --url https://codekim3570.tistory.com [--scan 200]

  --dry     파일을 쓰지 않고 무엇이 옮겨질지만 보여줍니다.
  --force   이미 옮긴 글도 원본 기준으로 다시 만듭니다.

백업 파일은 티스토리 관리자 → 설정 → 데이터 관리 → 블로그 데이터 내보내기 에서 받습니다.
`);
    process.exit(1);
  }

  log(`\n티스토리 글을 옮깁니다${DRY ? ' (확인만)' : ''}\n`);
  await loadExistingSlugs();

  let posts;
  if (LOCAL) {
    await access(LOCAL);
    log(`  로컬 백업: ${LOCAL}`);
    posts = await fromLocal(LOCAL);
  } else if (XML) {
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
