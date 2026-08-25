import { COMMENT_COLOR } from './shiki-theme.mjs';

/**
 * 주석을 예쁘게 만드는 shiki 트랜스포머.
 *
 * 하는 일은 클래스를 붙이는 것뿐이고, 실제 효과는 global.css 가 그린다.
 *   .tok-c        인라인 주석 토큰          (뒤에 붙는 // 설명)
 *   .l-c          한 줄 전체가 주석인 줄
 *   .cal .cal-*   [!포인트] 같은 표식이 붙은 콜아웃 줄
 *
 * 표식 문법:  // [!포인트] 여기가 핵심이다
 *   포인트 point  |  주의 warn caution  |  팁 tip  |  참고 note info
 */

const KIND = {
  '포인트': 'point', 'point': 'point', '핵심': 'point',
  '주의': 'warn', 'warn': 'warn', 'caution': 'warn', '경고': 'warn',
  '팁': 'tip', 'tip': 'tip', '꿀팁': 'tip',
  '참고': 'note', 'note': 'note', 'info': 'note', '메모': 'note',
};

const MARKER = /\[!\s*([^\]\s]+)\s*\]/;

const isComment = (token) =>
  typeof token?.color === 'string' && token.color.toUpperCase() === COMMENT_COLOR.toUpperCase();

const addClass = (node, ...names) => {
  const cur = node.properties.class;
  const list = Array.isArray(cur) ? cur.slice() : cur ? String(cur).split(/\s+/) : [];
  for (const n of names) if (n && !list.includes(n)) list.push(n);
  node.properties.class = list.join(' ');
};

export function commentTransformer() {
  return {
    name: 'gitdol:comments',

    // 개별 주석 토큰 — 코드 뒤에 붙는 설명까지 잡힌다
    span(node, _line, _col, _lineEl, token) {
      if (!isComment(token)) return;
      addClass(node, 'tok-c');
      // 인라인 style 을 걷어내야 CSS 가 색과 기울임을 마음대로 바꿀 수 있다
      delete node.properties.style;
    },

    // 줄 전체가 주석이면 한 덩어리로 다룬다
    line(node, lineNumber) {
      const tokens = this.tokens?.[lineNumber - 1] ?? [];
      const meaningful = tokens.filter((t) => String(t.content ?? '').trim() !== '');
      if (meaningful.length === 0 || !meaningful.every(isComment)) return;

      addClass(node, 'l-c');

      const text = tokens.map((t) => t.content ?? '').join('');
      const hit = text.match(MARKER);
      if (!hit) return;

      const kind = KIND[hit[1]] ?? KIND[hit[1]?.toLowerCase()] ?? 'note';
      addClass(node, 'cal', `cal-${kind}`);

      // 콜아웃 줄에서는 주석 기호와 표식을 지운다. 아이콘과 상자가 대신 말한다.
      const texts = [];
      const collect = (n) => {
        if (n.type === 'text') texts.push(n);
        else (n.children ?? []).forEach(collect);
      };
      collect(node);

      const clean = texts
        .map((t) => t.value)
        .join('')
        .replace(/^\s*(?:\/{2,}|#+|--+|\/\*+|\*+|;+|<!--)\s*/, '') // 주석 기호
        .replace(MARKER, '')                                       // [!표식]
        .replace(/\s*(?:\*\/|-->)\s*$/, '')                        // 닫는 기호
        .replace(/^\s*:?\s*/, '')                                  // 남은 콜론
        .trim();

      texts.forEach((t, i) => { t.value = i === 0 ? clean : ''; });
    },

    pre(node) {
      addClass(node, 'gitdol-code');
      // ```java title="ChurnRateTest.java" 처럼 적은 값을 상자 제목으로 넘긴다
      const raw = this.options?.meta?.__raw ?? '';
      const t = raw.match(/title\s*=\s*"([^"]+)"|title\s*=\s*'([^']+)'/);
      if (t) node.properties['data-title'] = t[1] ?? t[2];
      if (this.options?.lang) node.properties['data-lang'] = this.options.lang;
    },
  };
}
