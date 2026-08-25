import { access, mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createMarkdownProcessor, rehypeHeadingIds } from '@astrojs/markdown-remark';
import yaml from 'js-yaml';
import { gitdolTheme, ignoreLanguage } from '../src/lib/shiki-theme.mjs';
import { commentTransformer } from '../src/lib/shiki-comments.mjs';
import { rehypeChrome } from '../src/lib/rehype-chrome.mjs';
import { rehypeBookmarks } from '../src/lib/rehype-bookmarks.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const postsRoot = path.join(projectRoot, 'src', 'content', 'posts');
const apiPrefix = '/__gitdol-editor';
const maxJsonBytes = 28 * 1024 * 1024;
const allowedImageTypes = new Map([
  ['image/png', '.png'],
  ['image/jpeg', '.jpg'],
  ['image/gif', '.gif'],
  ['image/webp', '.webp'],
  ['image/avif', '.avif'],
  ['image/svg+xml', '.svg'],
]);
const imageContentTypes = new Map([...allowedImageTypes].map(([type, extension]) => [extension, type]));
imageContentTypes.set('.jpeg', 'image/jpeg');
let markdownProcessorPromise;

function getMarkdownProcessor() {
  markdownProcessorPromise ??= createMarkdownProcessor({
    rehypePlugins: [rehypeHeadingIds, rehypeBookmarks, rehypeChrome],
    shikiConfig: {
      theme: gitdolTheme,
      langs: [ignoreLanguage],
      wrap: false,
      transformers: [commentTransformer()],
    },
  });
  return markdownProcessorPromise;
}

function json(res, status, value) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(value));
}

function escapeAttribute(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function decodeAttribute(value) {
  return value
    .replaceAll('&#x22;', '"')
    .replaceAll('&#34;', '"')
    .replaceAll('&quot;', '"')
    .replaceAll('&#x27;', "'")
    .replaceAll('&#39;', "'")
    .replaceAll('&#x26;', '&')
    .replaceAll('&amp;', '&');
}

function previewImageHtml(html, slug) {
  return html.replace(/<img __ASTRO_IMAGE_="([^"]*)">/g, (original, encoded) => {
    try {
      const image = JSON.parse(decodeAttribute(encoded));
      const relative = String(image.src || '').replace(/^\.\//, '');
      const assetPath = relative.split('/').filter(Boolean).map(encodeURIComponent).join('/');
      if (!assetPath) return original;
      return `<img src="${apiPrefix}/posts/${encodeURIComponent(slug)}/assets/${assetPath}" alt="${escapeAttribute(image.alt)}" loading="lazy">`;
    } catch {
      return original;
    }
  });
}

function isLoopback(address = '') {
  return address === '127.0.0.1'
    || address === '::1'
    || address === '::ffff:127.0.0.1';
}

function requireSlug(value) {
  const slug = decodeURIComponent(value || '').normalize('NFC');
  if (!slug || slug === '.' || slug === '..' || slug.includes('/') || slug.includes('\\')) {
    throw new HttpError(400, '올바르지 않은 글 경로입니다.');
  }
  return slug;
}

function slugify(value) {
  return String(value || '')
    .normalize('NFC')
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || `new-post-${Date.now()}`;
}

function parseMarkdown(raw, filename) {
  const source = raw.replace(/^\uFEFF/, '');
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) {
    throw new HttpError(500, `${filename}의 frontmatter를 읽을 수 없습니다.`);
  }

  const data = yaml.load(match[1], { schema: yaml.JSON_SCHEMA }) || {};
  if (!data || Array.isArray(data) || typeof data !== 'object') {
    throw new HttpError(500, `${filename}의 frontmatter 형식이 올바르지 않습니다.`);
  }

  return {
    data,
    body: source.slice(match[0].length).replace(/^\r?\n/, ''),
  };
}

function serializeMarkdown(data, body = '') {
  const frontmatter = yaml.dump(data, {
    lineWidth: -1,
    noCompatMode: true,
    noRefs: true,
    sortKeys: false,
  }).trimEnd();
  return `---\n${frontmatter}\n---\n\n${String(body).replace(/^\r?\n/, '')}`;
}

async function readPost(slug) {
  const safeSlug = requireSlug(slug);
  const filename = path.join(postsRoot, safeSlug, 'index.md');
  const source = await readFile(filename, 'utf8').catch((error) => {
    if (error?.code === 'ENOENT') throw new HttpError(404, '글을 찾을 수 없습니다.');
    throw error;
  });
  return { slug: safeSlug, ...parseMarkdown(source, filename) };
}

async function listPosts() {
  const entries = await readdir(postsRoot, { withFileTypes: true });
  const posts = await Promise.all(entries
    .filter((entry) => entry.isDirectory())
    .map(async (entry) => {
      try {
        const post = await readPost(entry.name);
        return {
          slug: post.slug,
          title: String(post.data.title || post.slug),
          date: String(post.data.date || ''),
          draft: Boolean(post.data.draft),
          project: post.data.project || '',
          category: post.data.category || '',
        };
      } catch (error) {
        console.warn(`[local-editor] ${entry.name} 건너뜀:`, error.message);
        return null;
      }
    }));

  return posts
    .filter(Boolean)
    .sort((a, b) => b.date.localeCompare(a.date) || a.title.localeCompare(b.title, 'ko'));
}

async function readJson(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxJsonBytes) throw new HttpError(413, '업로드 파일이 너무 큽니다.');
    chunks.push(chunk);
  }

  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new HttpError(400, '요청 내용을 읽을 수 없습니다.');
  }
}

function cleanData(current, incoming) {
  const next = { ...current };
  const allowed = [
    'title', 'description', 'date', 'updated', 'project', 'category', 'tags',
    'draft', 'cover', 'legacyUrl',
  ];

  for (const key of allowed) {
    if (!(key in incoming)) continue;
    const value = incoming[key];
    if (value === null || (typeof value === 'string' && value.trim() === '')) {
      if (!['title', 'date', 'draft', 'tags'].includes(key)) delete next[key];
      continue;
    }
    next[key] = value;
  }

  next.title = String(next.title || '').trim();
  next.date = String(next.date || '').slice(0, 10);
  next.draft = Boolean(next.draft);
  next.tags = Array.isArray(next.tags)
    ? next.tags.map((tag) => String(tag).trim()).filter(Boolean)
    : [];

  if (!next.title) throw new HttpError(400, '제목을 입력해 주세요.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(next.date)) {
    throw new HttpError(400, '날짜는 YYYY-MM-DD 형식이어야 합니다.');
  }
  if (next.project && next.category) delete next.category;
  return next;
}

async function atomicWrite(filename, content) {
  const temporary = path.join(path.dirname(filename), `.index-${process.pid}-${Date.now()}.tmp`);
  await writeFile(temporary, content, 'utf8');
  await rename(temporary, filename);
}

async function uniqueSlug(requested) {
  const base = slugify(requested);
  let candidate = base;
  for (let index = 2; ; index += 1) {
    try {
      await access(path.join(postsRoot, candidate));
      candidate = `${base}-${index}`;
    } catch (error) {
      if (error?.code === 'ENOENT') return candidate;
      throw error;
    }
  }
}

function sanitizeImageName(name, extension) {
  const rawBase = path.basename(String(name || 'image'), path.extname(String(name || 'image')));
  const base = rawBase
    .normalize('NFC')
    .replace(/[^\p{L}\p{N}._-]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100) || 'image';
  return `${base}${extension}`;
}

async function uniqueFilename(directory, requested) {
  const extension = path.extname(requested);
  const base = path.basename(requested, extension);
  let candidate = requested;
  for (let index = 2; ; index += 1) {
    try {
      await access(path.join(directory, candidate));
      candidate = `${base}-${index}${extension}`;
    } catch (error) {
      if (error?.code === 'ENOENT') return candidate;
      throw error;
    }
  }
}

async function saveImage(slug, payload) {
  const safeSlug = requireSlug(slug);
  const directory = path.join(postsRoot, safeSlug);
  await access(path.join(directory, 'index.md')).catch(() => {
    throw new HttpError(404, '이미지를 넣을 글을 찾을 수 없습니다.');
  });

  const match = String(payload.dataUrl || '').match(/^data:([^;,]+);base64,([A-Za-z0-9+/=\r\n]+)$/);
  if (!match || !allowedImageTypes.has(match[1])) {
    throw new HttpError(400, 'PNG, JPG, GIF, WebP, AVIF, SVG 이미지만 넣을 수 있습니다.');
  }

  const buffer = Buffer.from(match[2], 'base64');
  if (!buffer.length || buffer.length > 20 * 1024 * 1024) {
    throw new HttpError(413, '이미지는 한 장당 20MB 이하여야 합니다.');
  }

  const filename = await uniqueFilename(
    directory,
    sanitizeImageName(payload.name, allowedImageTypes.get(match[1])),
  );
  await writeFile(path.join(directory, filename), buffer);
  return {
    name: filename,
    path: `./${filename}`,
    savedTo: path.relative(projectRoot, path.join(directory, filename)),
  };
}

async function renderPost(slug, payload) {
  const post = await readPost(slug);
  const body = typeof payload.body === 'string' ? payload.body : post.body;
  const processor = await getMarkdownProcessor();
  const result = await processor.render(body, {
    fileURL: pathToFileURL(path.join(postsRoot, post.slug, 'index.md')),
    frontmatter: post.data,
  });
  return {
    html: previewImageHtml(result.code, post.slug),
    headings: result.metadata.headings,
  };
}

async function serveImage(slug, pathParts, res) {
  const safeSlug = requireSlug(slug);
  const segments = pathParts.map((part) => requireSlug(part));
  if (!segments.length) throw new HttpError(404, '이미지를 찾을 수 없습니다.');
  const directory = path.join(postsRoot, safeSlug);
  const filename = path.resolve(directory, ...segments);
  if (!filename.startsWith(`${directory}${path.sep}`)) {
    throw new HttpError(400, '올바르지 않은 이미지 경로입니다.');
  }
  const extension = path.extname(filename).toLowerCase();
  const contentType = imageContentTypes.get(extension);
  if (!contentType) throw new HttpError(400, '미리보기에서 지원하지 않는 이미지 형식입니다.');
  const content = await readFile(filename).catch((error) => {
    if (error?.code === 'ENOENT') throw new HttpError(404, '이미지를 찾을 수 없습니다.');
    throw error;
  });
  res.statusCode = 200;
  res.setHeader('Content-Type', contentType);
  res.setHeader('Cache-Control', 'no-store');
  res.end(content);
}

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function handleRequest(req, res) {
  if (!isLoopback(req.socket.remoteAddress)) {
    throw new HttpError(403, '로컬 컴퓨터에서만 글을 편집할 수 있습니다.');
  }

  const url = new URL(req.url, 'http://localhost');
  const parts = url.pathname.slice(apiPrefix.length).split('/').filter(Boolean);

  if (req.method === 'GET' && parts[0] === 'health' && parts.length === 1) {
    return json(res, 200, { ok: true, postsRoot });
  }

  if (req.method === 'GET' && parts[0] === 'posts' && parts.length === 1) {
    return json(res, 200, { posts: await listPosts() });
  }

  if (req.method === 'GET' && parts[0] === 'posts' && parts.length === 2) {
    return json(res, 200, await readPost(parts[1]));
  }

  if (req.method === 'POST' && parts[0] === 'posts' && parts.length === 1) {
    const payload = await readJson(req);
    const title = String(payload.title || '').trim();
    if (!title) throw new HttpError(400, '새 글 제목을 입력해 주세요.');
    const slug = await uniqueSlug(payload.slug || title);
    const directory = path.join(postsRoot, slug);
    await mkdir(directory);
    const data = {
      title,
      date: new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' }),
      category: '메모',
      tags: [],
      draft: true,
    };
    await atomicWrite(path.join(directory, 'index.md'), serializeMarkdown(data, ''));
    return json(res, 201, { slug, data, body: '' });
  }

  if (req.method === 'PUT' && parts[0] === 'posts' && parts.length === 2) {
    const current = await readPost(parts[1]);
    const payload = await readJson(req);
    const data = cleanData(current.data, payload.data || {});
    const body = typeof payload.body === 'string' ? payload.body : current.body;
    const filename = path.join(postsRoot, current.slug, 'index.md');
    await atomicWrite(filename, serializeMarkdown(data, body));
    return json(res, 200, { slug: current.slug, data, body });
  }

  if (req.method === 'POST'
    && parts[0] === 'posts'
    && parts[2] === 'render'
    && parts.length === 3) {
    return json(res, 200, await renderPost(parts[1], await readJson(req)));
  }

  if (req.method === 'POST'
    && parts[0] === 'posts'
    && parts[2] === 'assets'
    && parts.length === 3) {
    const payload = await readJson(req);
    return json(res, 201, await saveImage(parts[1], payload));
  }

  if (req.method === 'GET'
    && parts[0] === 'posts'
    && parts[2] === 'assets'
    && parts.length >= 4) {
    return serveImage(parts[1], parts.slice(3), res);
  }

  throw new HttpError(404, '편집기 API 경로를 찾을 수 없습니다.');
}

export function localEditor() {
  return {
    name: 'gitdol-local-editor',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const pathname = new URL(req.url || '/', 'http://localhost').pathname;
        if (pathname === '/admin' || pathname === '/admin/') {
          req.url = `/admin/index.html${req.url?.includes('?') ? req.url.slice(req.url.indexOf('?')) : ''}`;
          return next();
        }
        if (!req.url?.startsWith(apiPrefix)) return next();
        handleRequest(req, res).catch((error) => {
          const status = error instanceof HttpError ? error.status : 500;
          if (status === 500) console.error('[local-editor]', error);
          if (!res.headersSent) json(res, status, { error: error.message || '편집 중 오류가 발생했습니다.' });
        });
      });
    },
  };
}
