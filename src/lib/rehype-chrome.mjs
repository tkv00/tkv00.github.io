/**
 * 마크다운을 HTML로 바꾼 뒤에 손보는 작업 두 가지.
 *
 *  1. 코드 블록을 파일명 + 복사 버튼이 달린 상자로 감싼다
 *  2. h2 / h3 에 # 앵커를 붙인다 (마우스를 올리면 나타난다)
 *
 * 외부 의존성 없이 트리를 직접 걷는다.
 */

const el = (tagName, properties = {}, children = []) => ({
  type: 'element', tagName, properties, children,
});
const txt = (value) => ({ type: 'text', value });

const svg = (d, extra = {}) =>
  el('svg', {
    xmlns: 'http://www.w3.org/2000/svg', width: 13, height: 13, viewBox: '0 0 24 24',
    fill: 'none', stroke: 'currentColor', 'stroke-width': 1.7,
    'stroke-linecap': 'round', 'stroke-linejoin': 'round', ...extra,
  }, d.map((path) => el('path', { d: path })));

const hasClass = (node, name) =>
  String(node?.properties?.class ?? '').split(/\s+/).includes(name);

function codebox(pre) {
  const title = pre.properties['data-title'];
  const lang = pre.properties['data-lang'];
  delete pre.properties['data-title'];
  delete pre.properties['data-lang'];

  const label = title || (lang ? String(lang).toUpperCase() : '');

  const bar = el('div', { class: 'bar' }, [
    el('span', { class: 'name' }, [txt(label)]),
    el('button', { type: 'button', 'data-copy': '', 'aria-label': '코드 복사' }, [
      el('svg', {
        xmlns: 'http://www.w3.org/2000/svg', width: 13, height: 13, viewBox: '0 0 24 24',
        fill: 'none', stroke: 'currentColor', 'stroke-width': 1.7,
      }, [
        el('rect', { x: 9, y: 9, width: 11, height: 11, rx: 2 }),
        el('path', { d: 'M5 15V5h10' }),
      ]),
      el('span', {}, [txt('복사')]),
    ]),
  ]);

  return el('div', { class: 'codebox' }, [bar, pre]);
}

function anchor(heading) {
  const id = heading.properties?.id;
  if (!id) return;
  if (heading.children.some((c) => hasClass(c, 'anchor'))) return;
  heading.children.unshift(
    el('a', { class: 'anchor', href: `#${id}`, 'aria-hidden': 'true', tabindex: -1 }, [txt('#')])
  );
}

export function rehypeChrome() {
  return (tree) => {
    const walk = (node) => {
      if (!node || !Array.isArray(node.children)) return;

      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i];
        if (child.type !== 'element') continue;

        if (child.tagName === 'pre' && hasClass(child, 'gitdol-code') && !hasClass(node, 'codebox')) {
          node.children[i] = codebox(child);
          continue; // 감싼 상자 안은 더 볼 것이 없다
        }

        if (child.tagName === 'h2' || child.tagName === 'h3') anchor(child);

        walk(child);
      }
    };
    walk(tree);
  };
}
