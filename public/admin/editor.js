const apiBase = '/__gitdol-editor';
const $ = (selector) => document.querySelector(selector);
const imageMimeByExtension = new Map([
  ['png', 'image/png'], ['jpg', 'image/jpeg'], ['jpeg', 'image/jpeg'],
  ['gif', 'image/gif'], ['webp', 'image/webp'], ['avif', 'image/avif'], ['svg', 'image/svg+xml'],
]);

const elements = {
  app: $('#app'),
  list: $('#post-list'),
  count: $('#post-count'),
  search: $('#search'),
  editor: $('#editor'),
  empty: $('#empty-state'),
  slug: $('#post-slug'),
  title: $('#title'),
  description: $('#description'),
  date: $('#date'),
  project: $('#project'),
  category: $('#category'),
  tags: $('#tags'),
  draft: $('#draft'),
  body: $('#body'),
  metaSummary: $('#meta-summary'),
  save: $('#save'),
  saveState: $('#save-state'),
  openPreview: $('#open-preview'),
  preview: $('#preview'),
  previewLoading: $('#preview-loading'),
  previewTime: $('#preview-time'),
  dialog: $('#new-dialog'),
  newForm: $('#new-form'),
  newTitle: $('#new-title'),
  newSlug: $('#new-slug'),
  editorPane: $('.editor-pane'),
  dropZone: $('#drop-zone'),
  imageInput: $('#image-input'),
  toast: $('#toast'),
  fatal: $('#fatal'),
  fatalMessage: $('#fatal-message'),
};

const state = {
  posts: [],
  current: null,
  dirty: false,
  saving: false,
  editVersion: 0,
  saveTimer: null,
  renderTimer: null,
  renderVersion: 0,
  toastTimer: null,
  dragDepth: 0,
};

async function api(path, options = {}) {
  const response = await fetch(`${apiBase}${path}`, {
    cache: 'no-store',
    headers: options.body ? { 'Content-Type': 'application/json' } : undefined,
    ...options,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `요청에 실패했습니다 (${response.status})`);
  return payload;
}

function escapeText(value) {
  const span = document.createElement('span');
  span.textContent = value;
  return span.innerHTML;
}

function setSaveState(kind, message) {
  elements.saveState.className = `save-state ${kind}`;
  elements.saveState.lastElementChild.textContent = message;
}

function showToast(message, isError = false) {
  clearTimeout(state.toastTimer);
  elements.toast.textContent = message;
  elements.toast.className = `toast show${isError ? ' error' : ''}`;
  state.toastTimer = setTimeout(() => { elements.toast.className = 'toast'; }, 3200);
}

function renderList() {
  const query = elements.search.value.trim().toLocaleLowerCase('ko');
  const posts = state.posts.filter((post) => !query
    || post.title.toLocaleLowerCase('ko').includes(query)
    || post.slug.toLocaleLowerCase('ko').includes(query));

  elements.count.textContent = String(state.posts.length);
  if (!posts.length) {
    elements.list.innerHTML = `<div class="no-results">${query ? '검색 결과가 없습니다.' : '아직 작성한 글이 없습니다.'}</div>`;
    return;
  }

  elements.list.innerHTML = posts.map((post) => `
    <button class="post-item${post.slug === state.current?.slug ? ' active' : ''}" type="button" data-slug="${escapeText(post.slug)}">
      <strong>${escapeText(post.title)}</strong>
      <div><span>${escapeText(post.date || '날짜 없음')}</span>${post.draft ? '<span class="draft-badge">초안</span>' : ''}</div>
    </button>
  `).join('');
}

function setSelect(select, value = '') {
  const normalized = String(value || '');
  if (normalized && ![...select.options].some((option) => option.value === normalized)) {
    select.add(new Option(normalized, normalized));
  }
  select.value = normalized;
}

function resizeDescription() {
  elements.description.style.height = 'auto';
  elements.description.style.height = `${Math.max(28, elements.description.scrollHeight)}px`;
}

function updateMetaSummary() {
  const group = elements.project.value || elements.category.value || '분류 없음';
  const status = elements.draft.checked ? '초안' : '발행';
  elements.metaSummary.textContent = `${elements.date.value} · ${group} · ${status}`;
}

function fillEditor(post) {
  const data = post.data || {};
  state.current = post;
  state.dirty = false;
  state.editVersion += 1;
  elements.slug.textContent = post.slug;
  elements.title.value = data.title || '';
  elements.description.value = data.description || '';
  elements.date.value = String(data.date || '').slice(0, 10);
  setSelect(elements.project, data.project);
  setSelect(elements.category, data.category);
  elements.tags.value = Array.isArray(data.tags) ? data.tags.join(', ') : '';
  elements.draft.checked = Boolean(data.draft);
  elements.body.value = post.body || '';
  elements.empty.hidden = true;
  elements.editor.hidden = false;
  elements.save.disabled = false;
  elements.openPreview.disabled = false;
  resizeDescription();
  updateMetaSummary();
  renderList();
  setSaveState('saved', '파일과 연결됨');
  reloadPreview();
}

function collectPost() {
  return {
    data: {
      title: elements.title.value.trim(),
      description: elements.description.value.trim() || null,
      date: elements.date.value,
      project: elements.project.value || null,
      category: elements.category.value || null,
      tags: elements.tags.value.split(',').map((tag) => tag.trim()).filter(Boolean),
      draft: elements.draft.checked,
    },
    body: elements.body.value,
  };
}

function markDirty() {
  if (!state.current) return;
  state.dirty = true;
  state.editVersion += 1;
  setSaveState('dirty', '저장 대기 중');
  mirrorPreviewMeta();
  scheduleLivePreview();
  clearTimeout(state.saveTimer);
  state.saveTimer = setTimeout(() => saveCurrent(true), 900);
}

async function saveCurrent(silent = false) {
  clearTimeout(state.saveTimer);
  if (!state.current || state.saving || !state.dirty) return;
  if (!elements.title.value.trim()) {
    setSaveState('error', '제목이 필요합니다');
    if (!silent) elements.title.focus();
    return;
  }

  const slug = state.current.slug;
  const version = state.editVersion;
  const payload = collectPost();
  state.saving = true;
  setSaveState('saving', '파일에 저장 중');
  try {
    const saved = await api(`/posts/${encodeURIComponent(slug)}`, {
      method: 'PUT', body: JSON.stringify(payload),
    });
    if (state.current?.slug !== slug) return;
    state.current = saved;
    const listPost = state.posts.find((post) => post.slug === slug);
    if (listPost) Object.assign(listPost, {
      title: saved.data.title,
      date: saved.data.date,
      draft: saved.data.draft,
      project: saved.data.project || '',
      category: saved.data.category || '',
    });
    if (state.editVersion === version) {
      state.dirty = false;
      const time = new Intl.DateTimeFormat('ko-KR', { hour: '2-digit', minute: '2-digit' }).format(new Date());
      setSaveState('saved', `${time} 파일에 저장됨`);
    } else {
      setSaveState('dirty', '새 변경 내용 저장 대기 중');
      state.saveTimer = setTimeout(() => saveCurrent(true), 500);
    }
    renderList();
    scheduleLivePreview(0);
    if (!silent) showToast('글 파일에 저장했습니다.');
  } catch (error) {
    setSaveState('error', '저장 실패');
    showToast(error.message, true);
  } finally {
    state.saving = false;
  }
}

async function selectPost(slug) {
  if (slug === state.current?.slug) return;
  if (state.dirty) await saveCurrent(true);
  setSaveState('saving', '글 불러오는 중');
  try {
    fillEditor(await api(`/posts/${encodeURIComponent(slug)}`));
  } catch (error) {
    setSaveState('error', '불러오기 실패');
    showToast(error.message, true);
  }
}

function previewUrl() {
  if (!state.current) return '';
  return `/posts/${encodeURIComponent(state.current.slug)}?editor=1&t=${Date.now()}`;
}

function reloadPreview() {
  const url = previewUrl();
  if (!url) return;
  elements.previewLoading.classList.remove('hidden');
  elements.preview.src = url;
}

function previewDocument() {
  try { return elements.preview.contentDocument; } catch { return null; }
}

function formatPreviewDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return value.replaceAll('-', '.');
}

function mirrorPreviewMeta() {
  const doc = previewDocument();
  if (!doc?.body) return;
  const heading = doc.querySelector('.head h1');
  if (heading) heading.textContent = elements.title.value || '제목 없음';

  let lede = doc.querySelector('.head .lede');
  const description = elements.description.value.trim();
  if (description && !lede) {
    lede = doc.createElement('p');
    lede.className = 'lede';
    heading?.insertAdjacentElement('afterend', lede);
  }
  if (lede) {
    lede.textContent = description;
    lede.hidden = !description;
  }

  const date = doc.querySelector('.facts > span:first-child');
  if (date) date.textContent = formatPreviewDate(elements.date.value);

  const tags = elements.tags.value.split(',').map((tag) => tag.trim()).filter(Boolean);
  let tagBox = doc.querySelector('.head .tags');
  if (tags.length && !tagBox) {
    tagBox = doc.createElement('div');
    tagBox.className = 'tags';
    doc.querySelector('.head')?.append(tagBox);
  }
  if (tagBox) {
    tagBox.replaceChildren(...tags.map((tag) => {
      const item = doc.createElement('span');
      item.className = 'tag';
      item.textContent = tag;
      return item;
    }));
    tagBox.hidden = !tags.length;
  }
}

function updatePreviewToc(doc, headings) {
  const items = headings.filter((heading) => heading.depth === 2 || heading.depth === 3);
  let toc = doc.querySelector('.article > .toc');
  if (items.length <= 1) {
    toc?.remove();
    return;
  }
  if (!toc) {
    toc = doc.createElement('nav');
    toc.className = 'toc';
    toc.setAttribute('aria-label', '목차');
    doc.querySelector('.article')?.append(toc);
  }
  const label = doc.createElement('h2');
  label.textContent = '목차';
  toc.replaceChildren(label, ...items.map((heading) => {
    const link = doc.createElement('a');
    link.href = `#${heading.slug}`;
    if (heading.depth === 3) link.className = 'd3';
    link.append(doc.createElement('i'), doc.createTextNode(heading.text));
    return link;
  }));
}

async function renderLivePreview(version) {
  if (!state.current || !previewDocument()?.querySelector('.prose')) return;
  const slug = state.current.slug;
  try {
    const rendered = await api(`/posts/${encodeURIComponent(slug)}/render`, {
      method: 'POST',
      body: JSON.stringify({ body: elements.body.value }),
    });
    if (version !== state.renderVersion || slug !== state.current?.slug) return;
    const doc = previewDocument();
    const prose = doc?.querySelector('.prose');
    if (!prose) return;
    prose.innerHTML = rendered.html;
    updatePreviewToc(doc, rendered.headings || []);
    mirrorPreviewMeta();
    elements.previewTime.textContent = '실시간 반영됨';
  } catch (error) {
    if (version === state.renderVersion) elements.previewTime.textContent = `미리보기 오류: ${error.message}`;
  }
}

function scheduleLivePreview(delay = 120) {
  clearTimeout(state.renderTimer);
  const version = ++state.renderVersion;
  elements.previewTime.textContent = '입력 반영 중…';
  state.renderTimer = setTimeout(() => renderLivePreview(version), delay);
}

function openNewDialog() {
  elements.newForm.reset();
  elements.dialog.showModal();
  setTimeout(() => elements.newTitle.focus(), 20);
}

async function createPost(event) {
  event.preventDefault();
  const title = elements.newTitle.value.trim();
  if (!title) return;
  const submit = elements.newForm.querySelector('[type=submit]');
  submit.disabled = true;
  try {
    if (state.dirty) await saveCurrent(true);
    const post = await api('/posts', {
      method: 'POST',
      body: JSON.stringify({ title, slug: elements.newSlug.value.trim() }),
    });
    elements.dialog.close();
    state.posts.unshift({
      slug: post.slug, title: post.data.title, date: post.data.date,
      draft: true, project: '', category: post.data.category || '',
    });
    fillEditor(post);
    elements.body.focus();
    showToast('새 초안 글을 만들었습니다.');
  } catch (error) {
    showToast(error.message, true);
  } finally {
    submit.disabled = false;
  }
}

function insertAtCursor(text, replaceSelection = true) {
  const textarea = elements.body;
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  textarea.setRangeText(text, start, end, replaceSelection ? 'end' : 'preserve');
  textarea.focus();
  markDirty();
}

function applyToolbar(button) {
  const textarea = elements.body;
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const selected = textarea.value.slice(start, end);
  if (button.dataset.wrap) {
    const wrap = button.dataset.wrap;
    textarea.setRangeText(`${wrap}${selected || '텍스트'}${wrap}`, start, end, 'select');
  } else if (button.dataset.prefix) {
    const lineStart = textarea.value.lastIndexOf('\n', start - 1) + 1;
    textarea.setRangeText(button.dataset.prefix, lineStart, lineStart, 'end');
  }
  textarea.focus();
  markDirty();
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error(`${file.name} 파일을 읽지 못했습니다.`));
    reader.readAsDataURL(file);
  });
}

function imageMime(file) {
  if (file.type.startsWith('image/')) return file.type;
  return imageMimeByExtension.get(file.name.split('.').pop()?.toLowerCase()) || '';
}

async function uploadImages(fileList) {
  if (!state.current) return;
  const files = [...fileList].filter(imageMime);
  if (!files.length) {
    showToast('이미지 파일만 넣을 수 있습니다.', true);
    return;
  }

  setSaveState('saving', `이미지 ${files.length}장 저장 중`);
  try {
    const markdown = [];
    const destinations = [];
    for (const file of files) {
      const dataUrl = String(await fileToDataUrl(file)).replace(/^data:[^;,]+/, `data:${imageMime(file)}`);
      const uploaded = await api(`/posts/${encodeURIComponent(state.current.slug)}/assets`, {
        method: 'POST',
        body: JSON.stringify({ name: file.name, dataUrl }),
      });
      const alt = uploaded.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ');
      markdown.push(`![${alt}](${uploaded.path})`);
      destinations.push(uploaded.savedTo);
    }
    const before = elements.body.value.slice(0, elements.body.selectionStart);
    const spacer = before && !before.endsWith('\n\n') ? (before.endsWith('\n') ? '\n' : '\n\n') : '';
    insertAtCursor(`${spacer}${markdown.join('\n\n')}\n\n`);
    showToast(`이미지 ${files.length}장을 ${destinations.join(', ')}에 저장했습니다.`);
    await saveCurrent(true);
  } catch (error) {
    setSaveState('error', '이미지 저장 실패');
    showToast(error.message, true);
  } finally {
    elements.imageInput.value = '';
  }
}

function handleBodyKeydown(event) {
  if (event.key === 'Tab') {
    event.preventDefault();
    insertAtCursor('  ');
  }
}

async function boot() {
  if (!['localhost', '127.0.0.1', '::1'].includes(location.hostname)) {
    elements.fatal.hidden = false;
    elements.fatalMessage.textContent = '이 편집기는 파일을 직접 저장하므로 배포된 사이트에서는 열리지 않습니다.';
    return;
  }

  try {
    await api('/health');
    const result = await api('/posts');
    state.posts = result.posts;
    renderList();
    elements.app.setAttribute('aria-busy', 'false');
    setSaveState('', state.posts.length ? '글을 선택하세요' : '새 글을 만드세요');
    if (state.posts.length) await selectPost(state.posts[0].slug);
  } catch (error) {
    elements.fatal.hidden = false;
    elements.fatalMessage.textContent = error.message;
  }
}

elements.search.addEventListener('input', renderList);
elements.list.addEventListener('click', (event) => {
  const item = event.target.closest('[data-slug]');
  if (item) selectPost(item.dataset.slug);
});
$('#new-post').addEventListener('click', openNewDialog);
$('#empty-new-post').addEventListener('click', openNewDialog);
$('#cancel-new').addEventListener('click', () => elements.dialog.close());
elements.newForm.addEventListener('submit', createPost);
elements.save.addEventListener('click', () => saveCurrent(false));
elements.openPreview.addEventListener('click', () => window.open(previewUrl(), '_blank', 'noopener'));
elements.preview.addEventListener('load', () => {
  // 글 페이지는 정적 경로이므로 iframe 안에서 편집에 불필요한 외곽 UI만 걷어낸다.
  // 본문 DOM과 스타일은 실제 블로그의 것을 그대로 사용한다.
  try {
    const previewDocument = elements.preview.contentDocument;
    previewDocument.body.classList.add('editor-preview');
    previewDocument.querySelectorAll('.sky, .rail, .top, .pn, .comments, .foot').forEach((node) => node.remove());
  } catch { /* 같은 localhost 안에서는 접근 가능하다. */ }
  elements.previewLoading.classList.add('hidden');
  mirrorPreviewMeta();
  scheduleLivePreview(0);
});

elements.editor.addEventListener('input', (event) => {
  if (event.target === elements.description) resizeDescription();
  updateMetaSummary();
  markDirty();
});
elements.project.addEventListener('change', () => {
  if (elements.project.value) elements.category.value = '';
  updateMetaSummary();
});
elements.category.addEventListener('change', () => {
  if (elements.category.value) elements.project.value = '';
  updateMetaSummary();
});
elements.body.addEventListener('keydown', handleBodyKeydown);
elements.body.addEventListener('paste', (event) => {
  const images = [...event.clipboardData.files].filter(imageMime);
  if (images.length) {
    event.preventDefault();
    uploadImages(images);
  }
});

document.querySelectorAll('.tool-button[data-wrap], .tool-button[data-prefix]').forEach((button) => {
  button.addEventListener('click', () => applyToolbar(button));
});
$('#pick-image').addEventListener('click', () => elements.imageInput.click());
elements.imageInput.addEventListener('change', () => uploadImages(elements.imageInput.files));

elements.editorPane.addEventListener('dragenter', (event) => {
  event.preventDefault();
  state.dragDepth += 1;
  elements.editorPane.classList.add('dragging');
});
elements.editorPane.addEventListener('dragover', (event) => event.preventDefault());
elements.editorPane.addEventListener('dragleave', (event) => {
  event.preventDefault();
  state.dragDepth = Math.max(0, state.dragDepth - 1);
  if (!state.dragDepth) elements.editorPane.classList.remove('dragging');
});
elements.editorPane.addEventListener('drop', (event) => {
  event.preventDefault();
  state.dragDepth = 0;
  elements.editorPane.classList.remove('dragging');
  uploadImages(event.dataTransfer.files);
});

document.addEventListener('dragover', (event) => {
  if ([...event.dataTransfer.types].includes('Files')) event.preventDefault();
});
document.addEventListener('drop', (event) => {
  if (![...event.dataTransfer.files].length || elements.editorPane.contains(event.target)) return;
  event.preventDefault();
  showToast('이미지를 가운데 글 편집 영역에 놓아 주세요.', true);
});

window.addEventListener('keydown', (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
    event.preventDefault();
    saveCurrent(false);
  }
});
window.addEventListener('beforeunload', (event) => {
  if (state.dirty || state.saving) event.preventDefault();
});

boot();
