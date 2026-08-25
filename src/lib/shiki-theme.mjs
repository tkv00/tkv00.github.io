/**
 * 깃돌 코드 테마.
 * 주석 색(#5C6472)은 어디에도 중복해서 쓰지 않는다 —
 * shiki-comments.mjs 가 이 값 하나로 주석 토큰을 찾아내기 때문이다.
 */
export const COMMENT_COLOR = '#5C6472';

// Shiki에는 ignore 파일 문법이 내장되어 있지 않아 직접 등록한다.
// 하나의 문법을 .gitignore와 .dockerignore가 함께 사용한다.
export const ignoreLanguage = {
  name: 'ignore',
  displayName: 'Ignore file',
  aliases: ['gitignore', 'dockerignore'],
  scopeName: 'source.ignore',
  patterns: [
    { match: '^\\s*#.*$', name: 'comment.line.number-sign.ignore' },
    { match: '^\\s*!', name: 'keyword.operator.negation.ignore' },
    { match: '\\*\\*?|\\?', name: 'keyword.operator.wildcard.ignore' },
    { match: '/$', name: 'punctuation.separator.directory.ignore' },
  ],
};

export const gitdolTheme = {
  name: 'gitdol',
  type: 'dark',
  colors: {
    'editor.background': '#0d0f13',
    'editor.foreground': '#c3c9d4',
  },
  settings: [
    { settings: { background: '#0d0f13', foreground: '#c3c9d4' } },

    { scope: ['comment', 'punctuation.definition.comment', 'string.comment'],
      settings: { foreground: COMMENT_COLOR, fontStyle: 'italic' } },

    { scope: ['keyword', 'storage', 'storage.type', 'keyword.control', 'keyword.operator.new',
              'keyword.operator.expression', 'variable.language', 'constant.language'],
      settings: { foreground: '#cdaef0' } },

    { scope: ['string', 'string.quoted', 'punctuation.definition.string', 'meta.jsx.children'],
      settings: { foreground: '#a8d9a0' } },

    { scope: ['constant.numeric', 'constant.character', 'constant.other',
              'keyword.other.unit', 'support.constant'],
      settings: { foreground: '#e8ab7c' } },

    { scope: ['entity.name.function', 'support.function', 'meta.function-call.generic',
              'variable.function'],
      settings: { foreground: '#d9bc90' } },

    { scope: ['entity.name.type', 'entity.name.class', 'support.type', 'support.class',
              'entity.other.inherited-class', 'storage.type.annotation', 'meta.annotation'],
      settings: { foreground: '#84acdd' } },

    { scope: ['variable', 'variable.other', 'meta.definition.variable', 'variable.parameter'],
      settings: { foreground: '#c3c9d4' } },

    { scope: ['variable.other.property', 'meta.object-literal.key', 'support.type.property-name',
              'entity.name.tag.yaml'],
      settings: { foreground: '#9fc7d8' } },

    { scope: ['entity.name.tag', 'punctuation.definition.tag'],
      settings: { foreground: '#e4907f' } },

    { scope: ['entity.other.attribute-name'],
      settings: { foreground: '#d9bc90' } },

    { scope: ['punctuation', 'meta.brace', 'keyword.operator'],
      settings: { foreground: '#8b93a1' } },

    { scope: ['markup.inserted', 'meta.diff.header.to-file'],
      settings: { foreground: '#86c9a6' } },
    { scope: ['markup.deleted', 'meta.diff.header.from-file'],
      settings: { foreground: '#d98d8d' } },

    { scope: ['invalid', 'invalid.illegal'], settings: { foreground: '#d98d8d' } },
  ],
};
