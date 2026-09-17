const CONFIG = {
  owner: 'mosen6266-netizen', repo: 'MS111', branch: 'main',
  dataPath: 'data/bookmarks.json', vaultPath: 'data/vault.json',
  publicUrl: 'https://ms111-bookmarks.mosen6266.chatgpt.site/'
};

const DEFAULT_TAXONOMY = {
  categories: ['常用', '工作', '学习', '工具', '美国', '德国'],
  tags: ['AI', '效率', '开发', '邮箱', '美国', '德国']
};
const COUNTRIES = {
  global: { flag: '🌐', label: '全球/其他' },
  us: { flag: '🇺🇸', label: '美国' },
  de: { flag: '🇩🇪', label: '德国' }
};

const state = {
  data: { version: 2, updatedAt: null, bookmarks: [], taxonomy: structuredClone(DEFAULT_TAXONOMY) },
  dataSha: null,
  token: sessionStorage.getItem('ms111_token') || localStorage.getItem('ms111_token') || '',
  isAdmin: false, mode: 'bookmarks', category: '全部', country: 'all', query: '', sort: 'custom',
  view: localStorage.getItem('ms111_view') || 'grid',
  visits: JSON.parse(localStorage.getItem('ms111_visits') || '{}'),
  revealedNotes: new Set(),
  vault: { locked: true, exists: false, sha: null, payload: null, passphrase: '', data: { version: 1, updatedAt: null, notes: [] }, salt: null }
};

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const el = {
  body: document.body, grid: $('#bookmarkGrid'), empty: $('#emptyState'), emptyCopy: $('#emptyCopy'),
  nav: $('#categoryNav'), countryNav: $('#countryNav'), search: $('#searchInput'), sort: $('#sortSelect'),
  total: $('#totalCount'), categories: $('#categoryCount'), updated: $('#updatedText'), title: $('#sectionTitle'), sync: $('#syncStatus'),
  bookmarkSection: $('#bookmarkSection'), vaultSection: $('#vaultSection'), bookmarkFilters: $('#bookmarkFilters'),
  vaultGate: $('#vaultGate'), vaultGrid: $('#vaultGrid'), vaultEmpty: $('#vaultEmpty'),
  loginDialog: $('#loginDialog'), editDialog: $('#editDialog'), editForm: $('#editForm'),
  taxonomyDialog: $('#taxonomyDialog'), vaultDialog: $('#vaultDialog'), noteDialog: $('#noteDialog'),
  panel: $('#adminPanel'), backdrop: $('#panelBackdrop'), toast: $('#toastRegion')
};

document.addEventListener('DOMContentLoaded', init);

async function init() {
  bindEvents();
  applyTheme(localStorage.getItem('ms111_theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
  setView(state.view);
  await loadData();
  if (state.token) await validateToken(state.token, true);
  registerWebMcpTools();
}

function bindEvents() {
  $('#themeBtn').addEventListener('click', toggleTheme);
  $('#shareBtn').addEventListener('click', copyPublicLink);
  $('#copyPublicBtn').addEventListener('click', copyPublicLink);
  $('#adminBtn').addEventListener('click', () => state.isAdmin ? openPanel() : el.loginDialog.showModal());
  $('#addBtn').addEventListener('click', () => openEdit());
  $('#emptyAddBtn').addEventListener('click', () => openEdit());
  $('#bookmarkTabBtn').addEventListener('click', () => switchMode('bookmarks'));
  $('#vaultTabBtn').addEventListener('click', () => switchMode('vault'));
  $('#openVaultBtn').addEventListener('click', () => { closePanel(); switchMode('vault'); });
  $('#unlockVaultBtn').addEventListener('click', openVaultDialog);
  $('#lockVaultBtn').addEventListener('click', () => lockVault());
  $('#addNoteBtn').addEventListener('click', () => openNoteEdit());
  $('#vaultEmptyAddBtn').addEventListener('click', () => openNoteEdit());
  $('#vaultForm').addEventListener('submit', handleVaultUnlock);
  $('#noteForm').addEventListener('submit', handleSaveNote);
  $('#manageTaxonomyBtn').addEventListener('click', openTaxonomyManager);
  $('#addCategoryBtn').addEventListener('click', () => addTaxonomy('categories'));
  $('#addTagBtn').addEventListener('click', () => addTaxonomy('tags'));
  el.search.addEventListener('input', event => { state.query = event.target.value.trim().toLowerCase(); render(); });
  el.sort.addEventListener('change', event => { state.sort = event.target.value; render(); });
  $('#gridViewBtn').addEventListener('click', () => setView('grid'));
  $('#listViewBtn').addEventListener('click', () => setView('list'));
  $('#loginForm').addEventListener('submit', handleLogin);
  el.editForm.addEventListener('submit', handleSaveBookmark);
  $$('[data-close]').forEach(button => button.addEventListener('click', () => $('#' + button.dataset.close).close()));
  $('#closePanelBtn').addEventListener('click', closePanel);
  el.backdrop.addEventListener('click', closePanel);
  $('#logoutBtn').addEventListener('click', logout);
  $('#refreshBtn').addEventListener('click', async () => { await loadData(true); if (state.isAdmin) await refreshVaultMeta(); toast('已同步最新数据'); });
  $('#exportBtn').addEventListener('click', exportData);
  $('#importBtn').addEventListener('click', () => $('#importFile').click());
  $('#importFile').addEventListener('change', importData);
  document.addEventListener('keydown', event => {
    if (event.key === '/' && !['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) { event.preventDefault(); el.search.focus(); }
    if (event.key.toLowerCase() === 'n' && state.isAdmin && !['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) state.mode === 'vault' ? openNoteEdit() : openEdit();
    if (event.key === 'Escape') closePanel();
  });
}

function ensureDataShape(data) {
  data.version = 2;
  data.bookmarks = Array.isArray(data.bookmarks) ? data.bookmarks : [];
  data.taxonomy = data.taxonomy || {};
  for (const key of ['categories', 'tags']) {
    const values = key === 'categories' ? data.bookmarks.map(item => item.category).filter(Boolean) : data.bookmarks.flatMap(item => Array.isArray(item.tags) ? item.tags : []);
    data.taxonomy[key] = [...new Set([...(data.taxonomy[key] || []), ...DEFAULT_TAXONOMY[key], ...values])];
  }
  data.bookmarks = data.bookmarks.map(item => ({ ...item, country: item.country || inferCountry(item) }));
  return data;
}

async function loadData(showBusy = false) {
  if (showBusy) el.sync.textContent = '正在同步…';
  try {
    const url = `https://raw.githubusercontent.com/${CONFIG.owner}/${CONFIG.repo}/${CONFIG.branch}/${CONFIG.dataPath}?t=${Date.now()}`;
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) throw new Error('无法读取收藏数据');
    state.data = ensureDataShape(await response.json());
    el.sync.textContent = '已同步最新收藏';
    render();
    if (state.isAdmin) await refreshDataSha();
  } catch (error) { el.sync.textContent = '同步暂时失败'; toast(error.message, 'error'); render(); }
}

function render() {
  const vaultMode = state.mode === 'vault' && state.isAdmin;
  el.bookmarkSection.hidden = vaultMode;
  el.bookmarkFilters.hidden = vaultMode;
  el.vaultSection.hidden = !vaultMode;
  $('#bookmarkTabBtn').classList.toggle('active', !vaultMode);
  $('#vaultTabBtn').classList.toggle('active', vaultMode);
  el.search.placeholder = vaultMode ? '搜索私密文本名称、分类或标签…' : '搜索名称、网址、描述或标签…';
  el.sort.hidden = vaultMode;
  $('#gridViewBtn').hidden = vaultMode;
  $('#listViewBtn').hidden = vaultMode;
  renderStats();
  renderCategoryOptions();
  if (vaultMode) return renderVault();
  const bookmarks = getVisibleBookmarks();
  renderCategories(); renderCountries();
  el.title.textContent = state.category === '全部' ? '全部收藏' : taxonomyLabel(state.category);
  el.grid.innerHTML = '';
  bookmarks.forEach(bookmark => el.grid.appendChild(createCard(bookmark)));
  el.empty.hidden = bookmarks.length > 0;
  el.grid.hidden = bookmarks.length === 0;
  el.emptyCopy.textContent = state.data.bookmarks.length ? '换个关键词、分类或地区试试。' : '管理员可以从这里开始建立收藏。';
}

function getVisibleBookmarks() {
  let items = [...state.data.bookmarks];
  if (state.category !== '全部') items = items.filter(item => (item.category || '未分类') === state.category);
  if (state.country !== 'all') items = items.filter(item => (item.country || inferCountry(item)) === state.country);
  if (state.query) items = items.filter(item => [item.title, item.url, item.description, item.category, countryInfo(item.country).label, ...(item.tags || [])].join(' ').toLowerCase().includes(state.query));
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
  if (state.mode === 'vault' && state.isAdmin) {
    const notes = state.vault.locked ? [] : state.vault.data.notes;
    el.total.textContent = state.vault.locked ? '🔒' : notes.length;
    el.categories.textContent = state.vault.locked ? '—' : new Set(notes.map(note => note.category || '未分类')).size;
    el.updated.textContent = state.vault.locked ? '已锁定' : formatRelativeDate(state.vault.data.updatedAt);
    return;
  }
  el.total.textContent = state.data.bookmarks.length;
  el.categories.textContent = new Set(state.data.bookmarks.map(item => item.category || '未分类')).size;
  el.updated.textContent = formatRelativeDate(state.data.updatedAt);
}

function renderCategories() {
  const counts = state.data.bookmarks.reduce((acc, item) => { const name = item.category || '未分类'; acc[name] = (acc[name] || 0) + 1; return acc; }, {});
  const categories = ['全部', ...new Set([...(state.data.taxonomy.categories || []), ...Object.keys(counts)])];
  el.nav.innerHTML = '';
  categories.forEach(category => {
    const button = document.createElement('button');
    button.className = 'category-chip' + (state.category === category ? ' active' : '');
    button.innerHTML = `${escapeHtml(category === '全部' ? '全部分类' : taxonomyLabel(category))} <b>${category === '全部' ? state.data.bookmarks.length : (counts[category] || 0)}</b>`;
    button.addEventListener('click', () => { state.category = category; render(); });
    el.nav.appendChild(button);
  });
}

function renderCountries() {
  const counts = state.data.bookmarks.reduce((acc, item) => { const id = item.country || inferCountry(item); acc[id] = (acc[id] || 0) + 1; return acc; }, {});
  const items = [{ id: 'all', flag: '◎', label: '全部地区', count: state.data.bookmarks.length }, ...Object.entries(COUNTRIES).map(([id, info]) => ({ id, ...info, count: counts[id] || 0 }))];
  el.countryNav.innerHTML = '';
  items.forEach(item => {
    const button = document.createElement('button');
    button.className = 'country-chip' + (state.country === item.id ? ' active' : '');
    button.innerHTML = `<span>${item.flag}</span> ${escapeHtml(item.label)} <b>${item.count}</b>`;
    button.addEventListener('click', () => { state.country = item.id; render(); });
    el.countryNav.appendChild(button);
  });
}

function renderCategoryOptions() {
  $('#categoryOptions').innerHTML = (state.data.taxonomy.categories || []).map(name => `<option value="${escapeAttr(name)}">${escapeHtml(taxonomyLabel(name))}</option>`).join('');
}

function createCard(bookmark) {
  const card = document.createElement('article');
  card.className = 'bookmark-card';
  card.style.setProperty('--card-accent', colorFor(bookmark.category || bookmark.title));
  const domain = getDomain(bookmark.url);
  const country = countryInfo(bookmark.country || inferCountry(bookmark));
  const tags = (bookmark.tags || []).slice(0, 4).map(tag => `<span class="tag">${escapeHtml(taxonomyLabel(tag))}</span>`).join('');
  card.innerHTML = `<div class="card-admin"><button data-action="edit" title="编辑">✎</button><button data-action="delete" title="删除">×</button></div>
    <div class="card-top"><img class="favicon" src="https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64" alt="" loading="lazy"><div class="card-badges">${bookmark.pinned ? '<span class="pin">★</span>' : ''}<span class="country-badge" title="${country.label}">${country.flag} ${country.label}</span><span class="category-badge">${escapeHtml(taxonomyLabel(bookmark.category || '未分类'))}</span></div></div>
    <h3>${escapeHtml(bookmark.title)}</h3><span class="domain">${escapeHtml(domain)}</span><p class="description">${escapeHtml(bookmark.description || '点击访问这个网站')}</p>
    <div class="card-bottom"><div class="tag-list">${tags}</div><button class="copy-url-btn" data-action="copy" title="复制网址">⧉ 复制网址</button><span class="visit-arrow">↗</span></div>`;
  const image = card.querySelector('img');
  image.addEventListener('error', () => { const fallback = document.createElement('span'); fallback.className = 'favicon-fallback'; fallback.textContent = (bookmark.title || '?').charAt(0).toUpperCase(); image.replaceWith(fallback); });
  card.addEventListener('click', event => {
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (action === 'copy') return copyText(bookmark.url, '网址已复制');
    if (action === 'edit') return openEdit(bookmark);
    if (action === 'delete') return deleteBookmark(bookmark);
    state.visits[bookmark.id] = (state.visits[bookmark.id] || 0) + 1;
    localStorage.setItem('ms111_visits', JSON.stringify(state.visits));
    window.open(bookmark.url, '_blank', 'noopener,noreferrer');
  });
  card.tabIndex = 0; card.setAttribute('role', 'link'); card.setAttribute('aria-label', `打开 ${bookmark.title}`);
  card.addEventListener('keydown', event => { if (event.key === 'Enter') card.click(); });
  return card;
}

async function handleLogin(event) {
  event.preventDefault();
  const token = $('#tokenInput').value.trim();
  if (!token) return;
  const button = $('#verifyBtn'); setBusy(button, true, '正在验证…');
  const ok = await validateToken(token, false); setBusy(button, false, '验证并进入');
  if (ok) {
    const storage = $('#rememberToken').checked ? localStorage : sessionStorage;
    localStorage.removeItem('ms111_token'); sessionStorage.removeItem('ms111_token'); storage.setItem('ms111_token', token);
    el.loginDialog.close(); $('#tokenInput').value = ''; openPanel();
  }
}

async function validateToken(token, silent = false) {
  try {
    const response = await githubFetch('/user', {}, token);
    if (!response.ok) throw new Error('令牌无效或已过期');
    const user = await response.json();
    if (user.login.toLowerCase() !== CONFIG.owner.toLowerCase()) throw new Error(`此令牌属于 ${user.login}，不是仓库所有者`);
    state.token = token; state.isAdmin = true; el.body.classList.add('is-admin');
    $('#adminBtn').textContent = '管理面板'; $('#adminUser').textContent = '@' + user.login;
    await Promise.all([refreshDataSha(), refreshVaultMeta()]); render();
    if (!silent) toast('身份验证成功，已进入管理模式');
    return true;
  } catch (error) { logout(false); if (!silent) toast(error.message, 'error'); return false; }
}

async function refreshDataSha() {
  const response = await githubFetch(`/repos/${CONFIG.owner}/${CONFIG.repo}/contents/${CONFIG.dataPath}?ref=${CONFIG.branch}`);
  if (!response.ok) throw new Error('无法获取数据文件版本');
  state.dataSha = (await response.json()).sha;
}

function openEdit(bookmark = null) {
  if (!state.isAdmin) return el.loginDialog.showModal();
  el.editForm.reset(); $('#bookmarkId').value = bookmark?.id || '';
  $('#editKicker').textContent = bookmark ? 'EDIT BOOKMARK' : 'NEW BOOKMARK'; $('#editTitle').textContent = bookmark ? '编辑网址' : '添加网址';
  $('#urlInput').value = bookmark?.url || ''; $('#titleInput').value = bookmark?.title || '';
  $('#categoryInput').value = bookmark?.category || (state.category === '全部' ? '' : state.category);
  $('#countryInput').value = bookmark?.country || inferCountry(bookmark || {});
  $('#descriptionInput').value = bookmark?.description || ''; $('#tagsInput').value = (bookmark?.tags || []).join(', '); $('#pinnedInput').checked = Boolean(bookmark?.pinned);
  el.editDialog.showModal(); setTimeout(() => (bookmark ? $('#titleInput') : $('#urlInput')).focus(), 50);
}

async function handleSaveBookmark(event) {
  event.preventDefault();
  const id = $('#bookmarkId').value; let url;
  try { url = normalizeUrl($('#urlInput').value); } catch (error) { return toast(error.message, 'error'); }
  const existing = state.data.bookmarks.find(item => item.id === id);
  const bookmark = {
    id: id || crypto.randomUUID(), title: $('#titleInput').value.trim(), url,
    category: $('#categoryInput').value.trim() || '未分类', country: $('#countryInput').value,
    description: $('#descriptionInput').value.trim(), tags: $('#tagsInput').value.split(/[,，]/).map(tag => tag.trim()).filter(Boolean).slice(0, 10),
    pinned: $('#pinnedInput').checked, order: existing?.order ?? state.data.bookmarks.length,
    createdAt: existing?.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString()
  };
  const next = structuredClone(state.data);
  next.taxonomy.categories = [...new Set([...next.taxonomy.categories, bookmark.category])]; next.taxonomy.tags = [...new Set([...next.taxonomy.tags, ...bookmark.tags])];
  next.bookmarks = existing ? next.bookmarks.map(item => item.id === id ? bookmark : item) : [...next.bookmarks, bookmark];
  const button = $('#saveBtn'); setBusy(button, true, '正在保存…');
  const ok = await saveData(next, existing ? `更新网址：${bookmark.title}` : `添加网址：${bookmark.title}`); setBusy(button, false, '保存网址');
  if (ok) { el.editDialog.close(); toast(existing ? '网址已更新' : '网址已添加'); }
}

async function deleteBookmark(bookmark) {
  if (!state.isAdmin || !confirm(`确定删除“${bookmark.title}”吗？此操作会同步给所有访客。`)) return;
  const next = structuredClone(state.data); next.bookmarks = next.bookmarks.filter(item => item.id !== bookmark.id);
  if (await saveData(next, `删除网址：${bookmark.title}`)) toast('网址已删除');
}

async function saveData(nextData, message) {
  nextData.updatedAt = new Date().toISOString();
  try {
    if (!state.dataSha) await refreshDataSha();
    const response = await githubFetch(`/repos/${CONFIG.owner}/${CONFIG.repo}/contents/${CONFIG.dataPath}`, { method: 'PUT', body: JSON.stringify({ message, content: utf8ToBase64(JSON.stringify(nextData, null, 2) + '\n'), sha: state.dataSha, branch: CONFIG.branch }) });
    if (response.status === 409) { await loadData(true); throw new Error('数据刚被更新，请重试刚才的操作'); }
    if (!response.ok) { const detail = await response.json().catch(() => ({})); throw new Error(detail.message || '保存失败，请检查令牌权限'); }
    const result = await response.json(); state.data = ensureDataShape(nextData); state.dataSha = result.content.sha; el.sync.textContent = '更改已同步'; render(); return true;
  } catch (error) { toast(error.message, 'error'); return false; }
}

function openTaxonomyManager() { if (!state.isAdmin) return; closePanel(); renderTaxonomyManager(); el.taxonomyDialog.showModal(); }
function renderTaxonomyManager() { renderTaxonomyList('categories', $('#categoryManagerList')); renderTaxonomyList('tags', $('#tagManagerList')); }
function renderTaxonomyList(type, container) {
  container.innerHTML = '';
  state.data.taxonomy[type].forEach((value, index) => {
    const row = document.createElement('div'); row.className = 'taxonomy-row';
    row.innerHTML = `<span class="taxonomy-flag">${flagForText(value) || '•'}</span><input type="text" value="${escapeAttr(value)}"><button title="保存修改">✓</button><button class="danger" title="删除">×</button>`;
    const input = row.querySelector('input'), buttons = row.querySelectorAll('button');
    buttons[0].addEventListener('click', () => renameTaxonomy(type, index, input.value.trim())); buttons[1].addEventListener('click', () => deleteTaxonomy(type, index)); container.appendChild(row);
  });
}
async function addTaxonomy(type) {
  const input = type === 'categories' ? $('#newCategoryInput') : $('#newTagInput'), value = input.value.trim();
  if (!value) return;
  if (state.data.taxonomy[type].some(item => item.toLowerCase() === value.toLowerCase())) return toast('这个名称已经存在', 'error');
  const next = structuredClone(state.data); next.taxonomy[type].push(value);
  if (await saveData(next, `添加${type === 'categories' ? '分类' : '标签'}：${value}`)) { input.value = ''; renderTaxonomyManager(); toast('已添加'); }
}
async function renameTaxonomy(type, index, value) {
  if (!value) return toast('名称不能为空', 'error');
  const oldValue = state.data.taxonomy[type][index]; if (oldValue === value) return toast('名称没有变化');
  if (state.data.taxonomy[type].some((item, i) => i !== index && item.toLowerCase() === value.toLowerCase())) return toast('这个名称已经存在', 'error');
  const next = structuredClone(state.data); next.taxonomy[type][index] = value;
  if (type === 'categories') next.bookmarks.forEach(item => { if (item.category === oldValue) item.category = value; });
  else next.bookmarks.forEach(item => { item.tags = (item.tags || []).map(tag => tag === oldValue ? value : tag); });
  if (await saveData(next, `将${type === 'categories' ? '分类' : '标签'}“${oldValue}”改为“${value}”`)) { renderTaxonomyManager(); toast('名称已更新'); }
}
async function deleteTaxonomy(type, index) {
  const value = state.data.taxonomy[type][index];
  if (!confirm(`确定删除“${value}”吗？已有网址中的这个${type === 'categories' ? '分类会改为未分类' : '标签也会移除'}。`)) return;
  const next = structuredClone(state.data); next.taxonomy[type].splice(index, 1);
  if (type === 'categories') next.bookmarks.forEach(item => { if (item.category === value) item.category = '未分类'; });
  else next.bookmarks.forEach(item => { item.tags = (item.tags || []).filter(tag => tag !== value); });
  if (await saveData(next, `删除${type === 'categories' ? '分类' : '标签'}：${value}`)) { renderTaxonomyManager(); toast('已删除'); }
}

async function refreshVaultMeta() {
  const response = await githubFetch(`/repos/${CONFIG.owner}/${CONFIG.repo}/contents/${CONFIG.vaultPath}?ref=${CONFIG.branch}`);
  if (response.status === 404) { state.vault.exists = false; state.vault.sha = null; state.vault.payload = null; return; }
  if (!response.ok) throw new Error('无法读取私密文本文件');
  const file = await response.json(); state.vault.exists = true; state.vault.sha = file.sha; state.vault.payload = JSON.parse(base64ToUtf8(file.content.replace(/\s/g, '')));
}
function switchMode(mode) { if (mode === 'vault' && !state.isAdmin) return el.loginDialog.showModal(); state.mode = mode; state.query = ''; el.search.value = ''; render(); }
function openVaultDialog() {
  if (!state.isAdmin) return el.loginDialog.showModal();
  $('#vaultForm').reset(); const exists = state.vault.exists;
  $('#vaultDialogTitle').textContent = exists ? '解锁私密文本' : '创建加密文本库';
  $('#vaultDialogCopy').textContent = exists ? '输入主密码以解密私密文本。主密码只保留在当前页面内。' : '设置一个独立主密码。私密文本会在浏览器中加密后再保存。';
  $('#vaultConfirmLabel').hidden = exists; $('#vaultPasswordConfirm').required = !exists; $('#unlockSubmitBtn').textContent = exists ? '解锁' : '创建并解锁';
  el.vaultDialog.showModal(); setTimeout(() => $('#vaultPasswordInput').focus(), 50);
}
async function handleVaultUnlock(event) {
  event.preventDefault(); const password = $('#vaultPasswordInput').value;
  if (password.length < 8) return toast('主密码至少需要 8 个字符', 'error');
  const button = $('#unlockSubmitBtn'); setBusy(button, true, state.vault.exists ? '正在解密…' : '正在创建…');
  try {
    if (state.vault.exists) { state.vault.data = await decryptVault(state.vault.payload, password); if (!Array.isArray(state.vault.data.notes)) throw new Error('格式错误'); state.vault.salt = base64ToBytes(state.vault.payload.salt); }
    else { if (password !== $('#vaultPasswordConfirm').value) throw new Error('两次输入的主密码不一致'); state.vault.data = { version: 1, updatedAt: new Date().toISOString(), notes: [] }; state.vault.salt = crypto.getRandomValues(new Uint8Array(16)); }
    state.vault.passphrase = password; state.vault.locked = false;
    if (!state.vault.exists && !(await saveVault('创建加密文本库'))) throw new Error('加密文本库创建失败');
    el.vaultDialog.close(); render(); toast('私密文本已解锁');
  } catch (error) { state.vault.passphrase = ''; state.vault.locked = true; toast(state.vault.exists ? '无法解锁：请检查主密码' : error.message, 'error'); }
  finally { setBusy(button, false, state.vault.exists ? '解锁' : '创建并解锁'); }
}
function renderVault() {
  const locked = state.vault.locked; el.vaultGate.hidden = !locked; el.vaultGrid.hidden = locked; $('#lockVaultBtn').hidden = locked; $('#addNoteBtn').hidden = locked; el.vaultEmpty.hidden = true;
  if (locked) return;
  const notes = getVisibleNotes(); el.vaultGrid.innerHTML = ''; notes.forEach(note => el.vaultGrid.appendChild(createNoteCard(note)));
  el.vaultGrid.hidden = notes.length === 0; el.vaultEmpty.hidden = notes.length > 0;
}
function getVisibleNotes() {
  let notes = [...state.vault.data.notes];
  if (state.query) notes = notes.filter(note => [note.title, note.type, note.category, note.remark, countryInfo(note.country).label, ...(note.tags || [])].join(' ').toLowerCase().includes(state.query));
  return notes.sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
}
function createNoteCard(note) {
  const card = document.createElement('article'); card.className = 'note-card';
  const country = countryInfo(note.country), hidden = note.type === '密码' && !state.revealedNotes.has(note.id), value = hidden ? '••••••••••••' : note.value;
  const tags = (note.tags || []).map(tag => `<span class="tag">${escapeHtml(taxonomyLabel(tag))}</span>`).join('');
  card.innerHTML = `<div class="note-card-top"><span class="note-type">${escapeHtml(note.type)}</span><span class="country-badge">${country.flag} ${country.label}</span></div><h3>${escapeHtml(note.title)}</h3><pre class="secret-value ${hidden ? 'masked' : ''}">${escapeHtml(value)}</pre>${note.remark ? `<p>${escapeHtml(note.remark)}</p>` : ''}<div class="tag-list">${tags}</div><div class="note-actions">${note.type === '密码' ? `<button data-action="reveal">${hidden ? '显示' : '隐藏'}</button>` : ''}<button class="copy-note" data-action="copy">⧉ 复制</button><button data-action="edit">编辑</button><button class="danger" data-action="delete">删除</button></div>`;
  card.addEventListener('click', event => {
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (action === 'copy') return copyText(note.value, '内容已复制');
    if (action === 'reveal') { state.revealedNotes.has(note.id) ? state.revealedNotes.delete(note.id) : state.revealedNotes.add(note.id); return renderVault(); }
    if (action === 'edit') return openNoteEdit(note); if (action === 'delete') return deleteNote(note);
  });
  return card;
}
function openNoteEdit(note = null) {
  if (state.vault.locked) return openVaultDialog();
  $('#noteForm').reset(); $('#noteId').value = note?.id || ''; $('#noteDialogTitle').textContent = note ? '编辑私密文本' : '添加私密文本';
  $('#noteTitleInput').value = note?.title || ''; $('#noteTypeInput').value = note?.type || '账号'; $('#noteValueInput').value = note?.value || '';
  $('#noteCategoryInput').value = note?.category || ''; $('#noteCountryInput').value = note?.country || 'global'; $('#noteTagsInput').value = (note?.tags || []).join(', '); $('#noteRemarkInput').value = note?.remark || '';
  el.noteDialog.showModal();
}
async function handleSaveNote(event) {
  event.preventDefault(); const id = $('#noteId').value, existing = state.vault.data.notes.find(note => note.id === id);
  const note = { id: id || crypto.randomUUID(), title: $('#noteTitleInput').value.trim(), type: $('#noteTypeInput').value, value: $('#noteValueInput').value, category: $('#noteCategoryInput').value.trim() || '未分类', country: $('#noteCountryInput').value, tags: $('#noteTagsInput').value.split(/[,，]/).map(tag => tag.trim()).filter(Boolean).slice(0, 10), remark: $('#noteRemarkInput').value.trim(), createdAt: existing?.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() };
  const previous = structuredClone(state.vault.data); state.vault.data.notes = existing ? state.vault.data.notes.map(item => item.id === id ? note : item) : [...state.vault.data.notes, note];
  const button = $('#saveNoteBtn'); setBusy(button, true, '正在加密保存…'); const ok = await saveVault(existing ? `更新私密文本：${note.title}` : `添加私密文本：${note.title}`); setBusy(button, false, '加密保存');
  if (ok) { el.noteDialog.close(); render(); toast(existing ? '私密文本已更新' : '私密文本已加密保存'); } else state.vault.data = previous;
}
async function deleteNote(note) {
  if (!confirm(`确定删除“${note.title}”吗？删除后无法恢复。`)) return;
  const previous = structuredClone(state.vault.data); state.vault.data.notes = state.vault.data.notes.filter(item => item.id !== note.id);
  if (await saveVault(`删除私密文本：${note.title}`)) { render(); toast('私密文本已删除'); } else state.vault.data = previous;
}
async function saveVault(message) {
  try {
    state.vault.data.updatedAt = new Date().toISOString(); const payload = await encryptVault(state.vault.data, state.vault.passphrase, state.vault.salt);
    const body = { message, content: utf8ToBase64(JSON.stringify(payload, null, 2) + '\n'), branch: CONFIG.branch }; if (state.vault.sha) body.sha = state.vault.sha;
    const response = await githubFetch(`/repos/${CONFIG.owner}/${CONFIG.repo}/contents/${CONFIG.vaultPath}`, { method: 'PUT', body: JSON.stringify(body) });
    if (response.status === 409) { await refreshVaultMeta(); throw new Error('私密文本刚被更新，请重新解锁后再试'); }
    if (!response.ok) { const detail = await response.json().catch(() => ({})); throw new Error(detail.message || '私密文本保存失败'); }
    const result = await response.json(); state.vault.sha = result.content.sha; state.vault.exists = true; state.vault.payload = payload; el.sync.textContent = '私密文本已加密同步'; renderStats(); return true;
  } catch (error) { toast(error.message, 'error'); return false; }
}
async function encryptVault(data, password, salt) {
  const useSalt = salt || crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12)), key = await deriveVaultKey(password, useSalt);
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(data)));
  return { version: 1, algorithm: 'AES-GCM', kdf: 'PBKDF2-SHA256', iterations: 250000, salt: bytesToBase64(useSalt), iv: bytesToBase64(iv), ciphertext: bytesToBase64(new Uint8Array(ciphertext)) };
}
async function decryptVault(payload, password) {
  if (!payload || payload.algorithm !== 'AES-GCM') throw new Error('不支持的加密格式');
  const salt = base64ToBytes(payload.salt), iv = base64ToBytes(payload.iv), ciphertext = base64ToBytes(payload.ciphertext), key = await deriveVaultKey(password, salt, payload.iterations || 250000);
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext); return JSON.parse(new TextDecoder().decode(plaintext));
}
async function deriveVaultKey(password, salt, iterations = 250000) {
  const baseKey = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, baseKey, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
function lockVault(showMessage = true) {
  state.vault.locked = true; state.vault.passphrase = ''; state.vault.data = { version: 1, updatedAt: null, notes: [] }; state.vault.salt = null; state.revealedNotes.clear(); render();
  if (showMessage) toast('私密文本已锁定');
}

async function importData(event) {
  const file = event.target.files[0]; event.target.value = ''; if (!file) return;
  try {
    const text = await file.text(); let imported = [];
    if (/\.json$/i.test(file.name)) { const parsed = JSON.parse(text); imported = Array.isArray(parsed) ? parsed : parsed.bookmarks; if (!Array.isArray(imported)) throw new Error('JSON 中没有 bookmarks 数组'); }
    else { const doc = new DOMParser().parseFromString(text, 'text/html'); imported = [...doc.querySelectorAll('a[href]')].map((a, index) => ({ title: a.textContent.trim() || getDomain(a.href), url: a.href, category: '浏览器导入', country: 'global', description: '', tags: ['导入'], order: state.data.bookmarks.length + index })); }
    const now = new Date().toISOString(); imported = imported.filter(item => { try { normalizeUrl(item.url); return true; } catch { return false; } }).map((item, index) => ({ id: item.id || crypto.randomUUID(), title: item.title || getDomain(item.url), url: normalizeUrl(item.url), category: item.category || '导入收藏', country: item.country || inferCountry(item), description: item.description || '', tags: Array.isArray(item.tags) ? item.tags : [], pinned: Boolean(item.pinned), order: state.data.bookmarks.length + index, createdAt: item.createdAt || now, updatedAt: now }));
    const existingUrls = new Set(state.data.bookmarks.map(item => item.url.replace(/\/$/, ''))), unique = imported.filter(item => !existingUrls.has(item.url.replace(/\/$/, '')));
    if (!unique.length) throw new Error('没有发现可导入的新网址'); if (!confirm(`将导入 ${unique.length} 个新网址，是否继续？`)) return;
    const next = structuredClone(state.data); next.bookmarks.push(...unique); if (await saveData(next, `批量导入 ${unique.length} 个网址`)) toast(`成功导入 ${unique.length} 个网址`);
  } catch (error) { toast('导入失败：' + error.message, 'error'); }
}
function exportData() {
  const blob = new Blob([JSON.stringify(state.data, null, 2)], { type: 'application/json' }), link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `MS111-bookmarks-${new Date().toISOString().slice(0, 10)}.json`; link.click(); URL.revokeObjectURL(link.href); toast('备份已下载');
}

function registerWebMcpTools() {
  const context = document.modelContext; if (!context?.registerTool) return;
  const register = tool => { try { void Promise.resolve(context.registerTool(tool)).catch(() => {}); } catch (_) {} };
  register({ name: 'search_bookmarks', title: '搜索网址收藏', description: '按名称、网址、描述、地区、分类或标签搜索公开收藏，并同步更新页面结果。', inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'], additionalProperties: false }, annotations: { readOnlyHint: false, untrustedContentHint: true }, execute(input) { if (!input || typeof input.query !== 'string') throw new Error('query 必须是字符串'); state.query = input.query.trim().toLowerCase(); el.search.value = input.query.trim(); switchMode('bookmarks'); return { query: input.query.trim(), resultCount: getVisibleBookmarks().length }; } });
  register({ name: 'list_bookmarks', title: '读取网址收藏', description: '读取当前公开网址收藏，可按分类或国家筛选；不会读取私密文本。', inputSchema: { type: 'object', properties: { category: { type: 'string' }, country: { type: 'string', enum: ['global', 'us', 'de'] } }, additionalProperties: false }, annotations: { readOnlyHint: true, untrustedContentHint: true }, execute(input = {}) { const items = state.data.bookmarks.filter(item => (!input.category || item.category === input.category) && (!input.country || item.country === input.country)).map(({ id, title, url, category, country, description, tags, pinned }) => ({ id, title, url, category, country, description, tags, pinned })); return { count: items.length, bookmarks: items }; } });
}

function openPanel() { el.panel.classList.add('open'); el.panel.setAttribute('aria-hidden', 'false'); el.backdrop.hidden = false; }
function closePanel() { el.panel.classList.remove('open'); el.panel.setAttribute('aria-hidden', 'true'); el.backdrop.hidden = true; }
function logout(showMessage = true) {
  lockVault(false); state.token = ''; state.isAdmin = false; state.dataSha = null; state.mode = 'bookmarks'; localStorage.removeItem('ms111_token'); sessionStorage.removeItem('ms111_token'); el.body.classList.remove('is-admin'); $('#adminBtn').textContent = '管理收藏'; closePanel(); render(); if (showMessage) toast('已安全退出管理模式');
}
function setView(view) { state.view = view; localStorage.setItem('ms111_view', view); el.grid.classList.toggle('list-view', view === 'list'); $('#gridViewBtn').classList.toggle('active', view === 'grid'); $('#listViewBtn').classList.toggle('active', view === 'list'); }
function toggleTheme() { applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'); }
function applyTheme(theme) { document.documentElement.dataset.theme = theme; localStorage.setItem('ms111_theme', theme); }
async function copyPublicLink() { await copyText(location.hostname.includes('github.io') ? location.origin + location.pathname : CONFIG.publicUrl, '公开链接已复制'); }
async function copyText(value, message) {
  try { await navigator.clipboard.writeText(value); toast(message); }
  catch { const area = document.createElement('textarea'); area.value = value; area.style.position = 'fixed'; area.style.opacity = '0'; document.body.appendChild(area); area.select(); document.execCommand('copy'); area.remove(); toast(message); }
}
function githubFetch(path, options = {}, token = state.token) { return fetch('https://api.github.com' + path, { ...options, headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(options.headers || {}) } }); }
function normalizeUrl(value) { let input = value.trim(); if (!/^https?:\/\//i.test(input)) input = 'https://' + input; const parsed = new URL(input); if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('只支持 http 或 https 网址'); return parsed.href; }
function inferCountry(item = {}) { const text = [item.category, ...(item.tags || [])].join(' ').toLowerCase(); if (/美国|usa|united states|\bus\b/.test(text)) return 'us'; if (/德国|germany|deutschland|\bde\b/.test(text)) return 'de'; return 'global'; }
function countryInfo(id) { return COUNTRIES[id] || COUNTRIES.global; }
function flagForText(value = '') { const country = inferCountry({ category: value }); return country === 'global' ? '' : COUNTRIES[country].flag; }
function taxonomyLabel(value = '') { const flag = flagForText(value); return flag && !value.includes(flag) ? `${flag} ${value}` : value; }
function getDomain(url) { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; } }
function formatRelativeDate(date) { if (!date) return '—'; const diff = Date.now() - new Date(date).getTime(); if (diff < 60000) return '刚刚'; if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`; if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`; if (diff < 604800000) return `${Math.floor(diff / 86400000)} 天前`; return new Date(date).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' }); }
function colorFor(value = '') { const colors = ['#df5c35', '#bddb51', '#65a5a1', '#e4a53b', '#9b84cc', '#e57e91']; let hash = 0; for (const char of value) hash = char.charCodeAt(0) + ((hash << 5) - hash); return colors[Math.abs(hash) % colors.length]; }
function utf8ToBase64(value) { return bytesToBase64(new TextEncoder().encode(value)); }
function base64ToUtf8(value) { return new TextDecoder().decode(base64ToBytes(value)); }
function bytesToBase64(bytes) { let binary = ''; bytes.forEach(byte => binary += String.fromCharCode(byte)); return btoa(binary); }
function base64ToBytes(value) { const binary = atob(value); return Uint8Array.from(binary, char => char.charCodeAt(0)); }
function escapeHtml(value = '') { const div = document.createElement('div'); div.textContent = String(value); return div.innerHTML; }
function escapeAttr(value = '') { return escapeHtml(value).replace(/"/g, '&quot;'); }
function setBusy(button, busy, text) { button.disabled = busy; button.textContent = text; }
function toast(message, type = '') { const node = document.createElement('div'); node.className = `toast ${type}`; node.textContent = message; el.toast.appendChild(node); setTimeout(() => node.remove(), 3400); }
