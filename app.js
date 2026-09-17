const CONFIG = {
  owner: 'mosen6266-netizen',
  repo: 'MS111',
  branch: 'main',
  dataPath: 'data/bookmarks.json',
  publicUrl: 'https://ms111-bookmarks.arcane-hare-0207.chatgpt.site/'
};

const state = {
  data: { version: 1, updatedAt: null, bookmarks: [] },
  dataSha: null,
  token: sessionStorage.getItem('ms111_token') || localStorage.getItem('ms111_token') || '',
  isAdmin: false,
  category: '全部',
  query: '',
  sort: 'custom',
  view: localStorage.getItem('ms111_view') || 'grid',
  visits: JSON.parse(localStorage.getItem('ms111_visits') || '{}')
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const el = {
  body: document.body,
  grid: $('#bookmarkGrid'), empty: $('#emptyState'), emptyCopy: $('#emptyCopy'),
  nav: $('#categoryNav'), search: $('#searchInput'), sort: $('#sortSelect'),
  total: $('#totalCount'), categories: $('#categoryCount'), updated: $('#updatedText'),
  title: $('#sectionTitle'), sync: $('#syncStatus'),
  loginDialog: $('#loginDialog'), editDialog: $('#editDialog'), editForm: $('#editForm'),
  panel: $('#adminPanel'), backdrop: $('#panelBackdrop'), toast: $('#toastRegion')
};

document.addEventListener('DOMContentLoaded', init);

async function init() {
  bindEvents();
  applyTheme(localStorage.getItem('ms111_theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
  setView(state.view);
  await loadData();
  if (state.token) await validateToken(state.token, true);
}

function bindEvents() {
  $('#themeBtn').addEventListener('click', toggleTheme);
  $('#shareBtn').addEventListener('click', copyPublicLink);
  $('#copyPublicBtn').addEventListener('click', copyPublicLink);
  $('#adminBtn').addEventListener('click', () => state.isAdmin ? openPanel() : el.loginDialog.showModal());
  $('#addBtn').addEventListener('click', () => openEdit());
  $('#emptyAddBtn').addEventListener('click', () => openEdit());
  el.search.addEventListener('input', e => { state.query = e.target.value.trim().toLowerCase(); render(); });
  el.sort.addEventListener('change', e => { state.sort = e.target.value; render(); });
  $('#gridViewBtn').addEventListener('click', () => setView('grid'));
  $('#listViewBtn').addEventListener('click', () => setView('list'));
  $('#loginForm').addEventListener('submit', handleLogin);
  el.editForm.addEventListener('submit', handleSaveBookmark);
  $$('[data-close]').forEach(btn => btn.addEventListener('click', () => $('#' + btn.dataset.close).close()));
  $('#closePanelBtn').addEventListener('click', closePanel);
  el.backdrop.addEventListener('click', closePanel);
  $('#logoutBtn').addEventListener('click', logout);
  $('#refreshBtn').addEventListener('click', async () => { await loadData(true); toast('已同步最新数据'); });
  $('#exportBtn').addEventListener('click', exportData);
  $('#importBtn').addEventListener('click', () => $('#importFile').click());
  $('#importFile').addEventListener('change', importData);
  document.addEventListener('keydown', e => {
    if (e.key === '/' && !['INPUT','TEXTAREA'].includes(document.activeElement.tagName)) { e.preventDefault(); el.search.focus(); }
    if (e.key.toLowerCase() === 'n' && state.isAdmin && !['INPUT','TEXTAREA'].includes(document.activeElement.tagName)) openEdit();
    if (e.key === 'Escape') closePanel();
  });
}

async function loadData(showBusy = false) {
  if (showBusy) el.sync.textContent = '正在同步…';
  try {
    const rawUrl = `https://raw.githubusercontent.com/${CONFIG.owner}/${CONFIG.repo}/${CONFIG.branch}/${CONFIG.dataPath}?t=${Date.now()}`;
    const response = await fetch(rawUrl, { cache: 'no-store' });
    if (!response.ok) throw new Error('无法读取收藏数据');
    const data = await response.json();
    if (!Array.isArray(data.bookmarks)) throw new Error('数据格式不正确');
    state.data = data;
    el.sync.textContent = '已同步最新收藏';
    render();
    if (state.isAdmin) await refreshDataSha();
  } catch (error) {
    el.sync.textContent = '同步暂时失败';
    toast(error.message, 'error');
    render();
  }
}

function render() {
  const bookmarks = getVisibleBookmarks();
  renderStats();
  renderCategories();
  renderCategoryOptions();
  el.title.textContent = state.category === '全部' ? '全部收藏' : state.category;
  el.grid.innerHTML = '';
  bookmarks.forEach((bookmark, index) => el.grid.appendChild(createCard(bookmark, index)));
  el.empty.hidden = bookmarks.length > 0;
  el.grid.hidden = bookmarks.length === 0;
  el.emptyCopy.textContent = state.data.bookmarks.length ? '换个关键词或分类试试。' : '管理员可以从这里开始建立收藏。';
}

function getVisibleBookmarks() {
  let items = [...state.data.bookmarks];
  if (state.category !== '全部') items = items.filter(item => (item.category || '未分类') === state.category);
  if (state.query) items = items.filter(item => [item.title, item.url, item.description, item.category, ...(item.tags || [])].join(' ').toLowerCase().includes(state.query));
  items.sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || sortItems(a, b));
  return items;
}

function sortItems(a, b) {
  if (state.sort === 'newest') return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
  if (state.sort === 'az') return (a.title || '').localeCompare(b.title || '', 'zh-CN');
  if (state.sort === 'popular') return (state.visits[b.id] || 0) - (state.visits[a.id] || 0);
  return (a.order ?? 9999) - (b.order ?? 9999);
}

function renderStats() {
  const categories = new Set(state.data.bookmarks.map(b => b.category || '未分类'));
  el.total.textContent = state.data.bookmarks.length;
  el.categories.textContent = categories.size;
  el.updated.textContent = formatRelativeDate(state.data.updatedAt);
}

function renderCategories() {
  const counts = state.data.bookmarks.reduce((acc, b) => { const c = b.category || '未分类'; acc[c] = (acc[c] || 0) + 1; return acc; }, {});
  const categories = ['全部', ...Object.keys(counts).sort((a,b) => a.localeCompare(b, 'zh-CN'))];
  el.nav.innerHTML = '';
  categories.forEach(category => {
    const button = document.createElement('button');
    button.className = 'category-chip' + (state.category === category ? ' active' : '');
    button.innerHTML = `${escapeHtml(category)} <b>${category === '全部' ? state.data.bookmarks.length : counts[category]}</b>`;
    button.addEventListener('click', () => { state.category = category; render(); });
    el.nav.appendChild(button);
  });
}

function renderCategoryOptions() {
  const options = [...new Set(state.data.bookmarks.map(b => b.category).filter(Boolean))];
  $('#categoryOptions').innerHTML = options.map(c => `<option value="${escapeAttr(c)}">`).join('');
}

function createCard(bookmark) {
  const article = document.createElement('article');
  article.className = 'bookmark-card';
  article.style.setProperty('--card-accent', colorFor(bookmark.category || bookmark.title));
  const domain = getDomain(bookmark.url);
  const tags = (bookmark.tags || []).slice(0, 3).map(t => `<span class="tag">${escapeHtml(t)}</span>`).join('');
  article.innerHTML = `
    <div class="card-admin">
      <button data-action="edit" title="编辑" aria-label="编辑 ${escapeAttr(bookmark.title)}">✎</button>
      <button data-action="delete" title="删除" aria-label="删除 ${escapeAttr(bookmark.title)}">×</button>
    </div>
    <div class="card-top">
      <img class="favicon" src="https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64" alt="" loading="lazy">
      <div class="card-badges">${bookmark.pinned ? '<span class="pin" title="已置顶">★</span>' : ''}<span class="category-badge">${escapeHtml(bookmark.category || '未分类')}</span></div>
    </div>
    <h3>${escapeHtml(bookmark.title)}</h3>
    <span class="domain">${escapeHtml(domain)}</span>
    <p class="description">${escapeHtml(bookmark.description || '点击访问这个网站')}</p>
    <div class="card-bottom"><div class="tag-list">${tags}</div><span class="visit-arrow">↗</span></div>`;
  const image = article.querySelector('img');
  image.addEventListener('error', () => {
    const fallback = document.createElement('span');
    fallback.className = 'favicon-fallback'; fallback.textContent = (bookmark.title || '?').charAt(0).toUpperCase();
    image.replaceWith(fallback);
  });
  article.addEventListener('click', e => {
    const action = e.target.closest('[data-action]')?.dataset.action;
    if (action === 'edit') return openEdit(bookmark);
    if (action === 'delete') return deleteBookmark(bookmark);
    state.visits[bookmark.id] = (state.visits[bookmark.id] || 0) + 1;
    localStorage.setItem('ms111_visits', JSON.stringify(state.visits));
    window.open(bookmark.url, '_blank', 'noopener,noreferrer');
  });
  article.tabIndex = 0;
  article.setAttribute('role', 'link');
  article.setAttribute('aria-label', `打开 ${bookmark.title}`);
  article.addEventListener('keydown', e => { if (e.key === 'Enter') article.click(); });
  return article;
}

async function handleLogin(event) {
  event.preventDefault();
  const token = $('#tokenInput').value.trim();
  if (!token) return;
  const button = $('#verifyBtn');
  setBusy(button, true, '正在验证…');
  const ok = await validateToken(token, false);
  setBusy(button, false, '验证并进入');
  if (ok) {
    const storage = $('#rememberToken').checked ? localStorage : sessionStorage;
    localStorage.removeItem('ms111_token'); sessionStorage.removeItem('ms111_token');
    storage.setItem('ms111_token', token);
    el.loginDialog.close(); $('#tokenInput').value = '';
    openPanel();
  }
}

async function validateToken(token, silent = false) {
  try {
    const response = await githubFetch('/user', {}, token);
    if (!response.ok) throw new Error('令牌无效或已过期');
    const user = await response.json();
    if (user.login.toLowerCase() !== CONFIG.owner.toLowerCase()) throw new Error(`此令牌属于 ${user.login}，不是仓库所有者`);
    state.token = token; state.isAdmin = true;
    el.body.classList.add('is-admin');
    $('#adminBtn').textContent = '管理面板';
    $('#adminUser').textContent = '@' + user.login;
    await refreshDataSha();
    if (!silent) toast('身份验证成功，已进入管理模式');
    return true;
  } catch (error) {
    logout(false);
    if (!silent) toast(error.message, 'error');
    return false;
  }
}

async function refreshDataSha() {
  const response = await githubFetch(`/repos/${CONFIG.owner}/${CONFIG.repo}/contents/${CONFIG.dataPath}?ref=${CONFIG.branch}`);
  if (!response.ok) throw new Error('无法获取数据文件版本');
  const file = await response.json(); state.dataSha = file.sha;
}

function openEdit(bookmark = null) {
  if (!state.isAdmin) return el.loginDialog.showModal();
  el.editForm.reset();
  $('#bookmarkId').value = bookmark?.id || '';
  $('#editKicker').textContent = bookmark ? 'EDIT BOOKMARK' : 'NEW BOOKMARK';
  $('#editTitle').textContent = bookmark ? '编辑网址' : '添加网址';
  $('#urlInput').value = bookmark?.url || '';
  $('#titleInput').value = bookmark?.title || '';
  $('#categoryInput').value = bookmark?.category || (state.category === '全部' ? '' : state.category);
  $('#descriptionInput').value = bookmark?.description || '';
  $('#tagsInput').value = (bookmark?.tags || []).join(', ');
  $('#pinnedInput').checked = Boolean(bookmark?.pinned);
  el.editDialog.showModal();
  setTimeout(() => (bookmark ? $('#titleInput') : $('#urlInput')).focus(), 50);
}

async function handleSaveBookmark(event) {
  event.preventDefault();
  const id = $('#bookmarkId').value;
  let url;
  try { url = normalizeUrl($('#urlInput').value); } catch (error) { return toast(error.message, 'error'); }
  const existing = state.data.bookmarks.find(b => b.id === id);
  const bookmark = {
    id: id || crypto.randomUUID(),
    title: $('#titleInput').value.trim(),
    url,
    category: $('#categoryInput').value.trim() || '未分类',
    description: $('#descriptionInput').value.trim(),
    tags: $('#tagsInput').value.split(/[,，]/).map(t => t.trim()).filter(Boolean).slice(0, 10),
    pinned: $('#pinnedInput').checked,
    order: existing?.order ?? state.data.bookmarks.length,
    createdAt: existing?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  const next = structuredClone(state.data);
  if (existing) next.bookmarks = next.bookmarks.map(b => b.id === id ? bookmark : b);
  else next.bookmarks.push(bookmark);
  const button = $('#saveBtn'); setBusy(button, true, '正在保存…');
  const ok = await saveData(next, existing ? `更新网址：${bookmark.title}` : `添加网址：${bookmark.title}`);
  setBusy(button, false, '保存网址');
  if (ok) { el.editDialog.close(); toast(existing ? '网址已更新' : '网址已添加'); }
}

async function deleteBookmark(bookmark) {
  if (!state.isAdmin || !confirm(`确定删除“${bookmark.title}”吗？此操作会同步给所有访客。`)) return;
  const next = structuredClone(state.data);
  next.bookmarks = next.bookmarks.filter(b => b.id !== bookmark.id);
  if (await saveData(next, `删除网址：${bookmark.title}`)) toast('网址已删除');
}

async function saveData(nextData, message) {
  nextData.updatedAt = new Date().toISOString();
  try {
    if (!state.dataSha) await refreshDataSha();
    const response = await githubFetch(`/repos/${CONFIG.owner}/${CONFIG.repo}/contents/${CONFIG.dataPath}`, {
      method: 'PUT',
      body: JSON.stringify({ message, content: utf8ToBase64(JSON.stringify(nextData, null, 2) + '\n'), sha: state.dataSha, branch: CONFIG.branch })
    });
    if (response.status === 409) { await loadData(true); throw new Error('数据刚被更新，请重试刚才的操作'); }
    if (!response.ok) { const detail = await response.json().catch(() => ({})); throw new Error(detail.message || '保存失败，请检查令牌的 Contents 写入权限'); }
    const result = await response.json();
    state.data = nextData; state.dataSha = result.content.sha;
    el.sync.textContent = '更改已同步'; render();
    return true;
  } catch (error) { toast(error.message, 'error'); return false; }
}

async function importData(event) {
  const file = event.target.files[0]; event.target.value = '';
  if (!file) return;
  try {
    const text = await file.text();
    let imported = [];
    if (/\.json$/i.test(file.name)) {
      const parsed = JSON.parse(text); imported = Array.isArray(parsed) ? parsed : parsed.bookmarks;
      if (!Array.isArray(imported)) throw new Error('JSON 中没有 bookmarks 数组');
    } else {
      const doc = new DOMParser().parseFromString(text, 'text/html');
      imported = [...doc.querySelectorAll('a[href]')].map((a, index) => ({ title: a.textContent.trim() || getDomain(a.href), url: a.href, category: '浏览器导入', description: '', tags: ['导入'], order: state.data.bookmarks.length + index }));
    }
    const now = new Date().toISOString();
    imported = imported.filter(item => { try { normalizeUrl(item.url); return true; } catch { return false; } }).map((item, index) => ({
      id: item.id || crypto.randomUUID(), title: item.title || getDomain(item.url), url: normalizeUrl(item.url), category: item.category || '导入收藏',
      description: item.description || '', tags: Array.isArray(item.tags) ? item.tags : [], pinned: Boolean(item.pinned),
      order: state.data.bookmarks.length + index, createdAt: item.createdAt || now, updatedAt: now
    }));
    const existingUrls = new Set(state.data.bookmarks.map(b => b.url.replace(/\/$/, '')));
    const unique = imported.filter(b => !existingUrls.has(b.url.replace(/\/$/, '')));
    if (!unique.length) throw new Error('没有发现可导入的新网址');
    if (!confirm(`将导入 ${unique.length} 个新网址，是否继续？`)) return;
    const next = structuredClone(state.data); next.bookmarks.push(...unique);
    if (await saveData(next, `批量导入 ${unique.length} 个网址`)) toast(`成功导入 ${unique.length} 个网址`);
  } catch (error) { toast('导入失败：' + error.message, 'error'); }
}

function exportData() {
  const blob = new Blob([JSON.stringify(state.data, null, 2)], { type: 'application/json' });
  const link = document.createElement('a'); link.href = URL.createObjectURL(blob);
  link.download = `MS111-bookmarks-${new Date().toISOString().slice(0,10)}.json`; link.click();
  URL.revokeObjectURL(link.href); toast('备份已下载');
}

function openPanel() { el.panel.classList.add('open'); el.panel.setAttribute('aria-hidden', 'false'); el.backdrop.hidden = false; }
function closePanel() { el.panel.classList.remove('open'); el.panel.setAttribute('aria-hidden', 'true'); el.backdrop.hidden = true; }
function logout(showMessage = true) {
  state.token = ''; state.isAdmin = false; state.dataSha = null;
  localStorage.removeItem('ms111_token'); sessionStorage.removeItem('ms111_token');
  el.body.classList.remove('is-admin'); $('#adminBtn').textContent = '管理收藏'; closePanel(); render();
  if (showMessage) toast('已安全退出管理模式');
}

function setView(view) {
  state.view = view; localStorage.setItem('ms111_view', view);
  el.grid.classList.toggle('list-view', view === 'list');
  $('#gridViewBtn').classList.toggle('active', view === 'grid');
  $('#listViewBtn').classList.toggle('active', view === 'list');
}
function toggleTheme() { applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'); }
function applyTheme(theme) { document.documentElement.dataset.theme = theme; localStorage.setItem('ms111_theme', theme); }
async function copyPublicLink() {
  const url = location.hostname.includes('github.io') ? location.origin + location.pathname : CONFIG.publicUrl;
  try { await navigator.clipboard.writeText(url); toast('公开链接已复制'); } catch { prompt('复制下面的公开链接：', url); }
}
function githubFetch(path, options = {}, token = state.token) {
  return fetch('https://api.github.com' + path, { ...options, headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(options.headers || {}) } });
}
function normalizeUrl(value) {
  let input = value.trim(); if (!/^https?:\/\//i.test(input)) input = 'https://' + input;
  const parsed = new URL(input); if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('只支持 http 或 https 网址'); return parsed.href;
}
function getDomain(url) { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; } }
function formatRelativeDate(date) {
  if (!date) return '—'; const diff = Date.now() - new Date(date).getTime();
  if (diff < 60000) return '刚刚'; if (diff < 3600000) return `${Math.floor(diff/60000)} 分钟前`;
  if (diff < 86400000) return `${Math.floor(diff/3600000)} 小时前`;
  if (diff < 604800000) return `${Math.floor(diff/86400000)} 天前`;
  return new Date(date).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
}
function colorFor(value = '') { const colors = ['#df5c35','#bddb51','#65a5a1','#e4a53b','#9b84cc','#e57e91']; let hash = 0; for (const c of value) hash = c.charCodeAt(0) + ((hash << 5) - hash); return colors[Math.abs(hash) % colors.length]; }
function utf8ToBase64(value) { const bytes = new TextEncoder().encode(value); let binary = ''; bytes.forEach(b => binary += String.fromCharCode(b)); return btoa(binary); }
function escapeHtml(value = '') { const d = document.createElement('div'); d.textContent = String(value); return d.innerHTML; }
function escapeAttr(value = '') { return escapeHtml(value).replace(/"/g, '&quot;'); }
function setBusy(button, busy, text) { button.disabled = busy; button.textContent = text; }
function toast(message, type = '') { const node = document.createElement('div'); node.className = `toast ${type}`; node.textContent = message; el.toast.appendChild(node); setTimeout(() => node.remove(), 3400); }
