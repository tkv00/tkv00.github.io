/**
 * 본문에 한 줄로 놓인 외부 링크를 북마크 카드로 바꾼다.
 * 문장 안의 링크와 목록 안의 참고 링크는 원래 인라인 링크 형태를 유지한다.
 */

const el = (tagName, properties = {}, children = []) => ({
  type: 'element', tagName, properties, children,
});
const txt = (value) => ({ type: 'text', value });

function textContent(node) {
  if (node?.type === 'text') return node.value || '';
  return (node?.children || []).map(textContent).join('');
}

function containsElement(node, tagName) {
  if (node?.type === 'element' && node.tagName === tagName) return true;
  return (node?.children || []).some((child) => containsElement(child, tagName));
}

function legacyDestination(value) {
  const text = String(value || '').trim();
  const boundary = text.lastIndexOf('](');
  if (boundary < 1 || !text.endsWith(')')) return null;

  const site = text.slice(0, boundary).trim();
  const destination = text.slice(boundary + 2, -1).trim();
  const match = destination.match(/^<?(https?:\/\/\S+?)>?(?:\s+(?:"([^"]*)"|'([^']*)'))?$/);
  if (!site || !match) return null;
  return { site, href: match[1], linkTitle: match[2] || match[3] || '' };
}

/** 티스토리 북마크가 빈 줄 때문에 세 문단으로 깨진 형태를 유효한 링크로 복구한다. */
function repairLegacyBookmarks(children) {
  const output = [];

  for (let index = 0; index < children.length; index += 1) {
    const start = children[index];
    const startText = textContent(start).trim();
    if (start?.type !== 'element' || start.tagName !== 'p'
      || !startText.startsWith('[') || startText.includes('](')) {
      output.push(start);
      continue;
    }

    const paragraphs = [];
    let endIndex = -1;
    let destination = null;
    for (let cursor = index + 1; cursor < Math.min(children.length, index + 10); cursor += 1) {
      const candidate = children[cursor];
      if (candidate.type === 'text' && !candidate.value.trim()) continue;
      if (candidate.type !== 'element' || candidate.tagName !== 'p') break;

      destination = legacyDestination(textContent(candidate));
      if (destination) {
        endIndex = cursor;
        break;
      }
      paragraphs.push(textContent(candidate).replace(/\s+/g, ' ').trim());
    }

    if (!destination || endIndex < 0) {
      output.push(start);
      continue;
    }

    const title = startText.slice(1).replace(/\s+/g, ' ').trim();
    const label = [title, ...paragraphs.filter(Boolean), destination.site].join('\n');
    const properties = { href: destination.href };
    if (destination.linkTitle) properties.title = destination.linkTitle;
    output.push(el('p', {}, [el('a', properties, [txt(label)])]));
    output.push(txt('\n'));
    index = endIndex;
  }

  return output;
}

function standaloneExternalLink(node) {
  if (node?.type !== 'element' || node.tagName !== 'p') return null;
  const meaningful = (node.children || []).filter((child) =>
    child.type !== 'text' || child.value.trim(),
  );
  if (meaningful.length !== 1) return null;

  const link = meaningful[0];
  if (link.type !== 'element' || link.tagName !== 'a' || containsElement(link, 'img')) return null;

  const href = String(link.properties?.href || '');
  let url;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  if (!['http:', 'https:'].includes(url.protocol)) return null;

  const lines = textContent(link)
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  if (!lines.length) return null;

  const host = url.hostname.replace(/^www\./, '');
  const last = lines.at(-1)?.toLowerCase();
  const hasSiteLabel = lines.length > 1
    && (last === host.toLowerCase() || last === url.hostname.toLowerCase());
  const title = lines[0];
  const description = lines.slice(1, hasSiteLabel ? -1 : undefined).join(' ');

  return {
    href,
    url,
    host,
    title,
    description,
    site: hasSiteLabel ? lines.at(-1) : host,
    score: lines.length * 1000 + description.length + title.length,
  };
}

function externalIcon() {
  return el('svg', {
    xmlns: 'http://www.w3.org/2000/svg', width: 15, height: 15, viewBox: '0 0 24 24',
    fill: 'none', stroke: 'currentColor', 'stroke-width': 1.7,
    'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true',
  }, [
    el('path', { d: 'M15 3h6v6' }),
    el('path', { d: 'M10 14 21 3' }),
    el('path', { d: 'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6' }),
  ]);
}

function bookmarkCard(bookmark) {
  const initial = bookmark.host.replace(/[^\p{L}\p{N}]/gu, '').charAt(0).toUpperCase() || '↗';
  const content = [
    el('strong', { class: 'bookmark-title' }, [txt(bookmark.title)]),
  ];
  if (bookmark.description) {
    content.push(el('span', { class: 'bookmark-description' }, [txt(bookmark.description)]));
  }
  content.push(el('span', { class: 'bookmark-site' }, [
    el('span', { class: 'bookmark-dot', 'aria-hidden': 'true' }, [txt(initial)]),
    txt(bookmark.site),
  ]));

  return el('a', {
    class: 'bookmark-card',
    href: bookmark.href,
    target: '_blank',
    rel: ['noopener', 'noreferrer'],
    'aria-label': `${bookmark.title} — ${bookmark.host} (새 창)`,
  }, [
    el('span', { class: 'bookmark-content' }, content),
    el('span', { class: 'bookmark-visual', 'aria-hidden': 'true' }, [
      el('span', { class: 'bookmark-monogram' }, [txt(initial)]),
      el('span', { class: 'bookmark-arrow' }, [externalIcon()]),
    ]),
  ]);
}

export function rehypeBookmarks() {
  return (tree) => {
    if (!Array.isArray(tree?.children)) return;

    tree.children = repairLegacyBookmarks(tree.children);
    const output = [];
    let previousBookmark = null;

    for (const child of tree.children) {
      const isWhitespace = child.type === 'text' && !child.value.trim();
      if (isWhitespace) {
        output.push(child);
        continue;
      }

      const bookmark = standaloneExternalLink(child);
      const onlyWhitespaceBetween = previousBookmark
        && output.slice(previousBookmark.index + 1).every((node) =>
          node.type === 'text' && !node.value.trim(),
        );

      if (bookmark && onlyWhitespaceBetween && bookmark.href === previousBookmark.href) {
        if (bookmark.score > previousBookmark.score) {
          output[previousBookmark.index] = bookmarkCard(bookmark);
          previousBookmark = { ...bookmark, index: previousBookmark.index };
        }
        continue;
      }

      if (bookmark) {
        const index = output.push(bookmarkCard(bookmark)) - 1;
        previousBookmark = { ...bookmark, index };
        continue;
      }

      output.push(child);
      previousBookmark = null;
    }

    tree.children = output;
  };
}
