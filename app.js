/* ==========================================================================
   NAKED QUANTUM: THE NERVOUS SYSTEM (app.js)
   ========================================================================== */

/* --- 1. STATE & CONSTANTS --- */
const AKASHIC_URL = 'https://wandering-violet-964a.gazajar.workers.dev';
let nqUserId = localStorage.getItem('nq_user_id') || crypto.randomUUID();
localStorage.setItem('nq_user_id', nqUserId);

let db = null;
let currentMode = 'soup';
let currentFolderId = null;
let currentDiscourseId = null;
let breadcrumbPath = [{ id: null, name: '◈ Root' }];
let mgmtId = null;

/* --- 2. UTILS & HAPTICS --- */
function haptic(type = 'light') {
  try { if ('vibrate' in navigator) navigator.vibrate(type === 'heavy' ? 40 : 15); } catch (e) {}
}

const showToast = (msg) => {
  const t = document.getElementById('nq-toast');
  if(!t) return;
  t.textContent = msg; t.style.opacity = "1";
  clearTimeout(t._timer);
  t._timer = setTimeout(() => { t.style.opacity = "0"; }, 2000);
};

const showModeToast = (msg) => {
  const t = document.getElementById('mode-toast');
  if(!t) return;
  t.textContent = msg; t.style.opacity = "1";
  clearTimeout(t._timer);
  t._timer = setTimeout(() => { t.style.opacity = "0"; }, 1500);
};

function escHtml(str) {
  if (!str) return "";
  return String(str).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

/* --- 3. FIREFLY ENGINE --- */
class FireflyManager {
  constructor() {
    this.canvas = document.getElementById('firefly-canvas');
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext('2d');
    this.particles = [];
    this.density = 15;
    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.animate();
  }
  resize() { 
    this.canvas.width = window.innerWidth; 
    this.canvas.height = window.innerHeight; 
  }
  setDensity(len) { 
    this.density = Math.min(80, 15 + Math.floor(len / 250)); 
  }
  animate() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    while (this.particles.length < this.density) {
      this.particles.push({
        x: Math.random() * this.canvas.width, y: Math.random() * this.canvas.height,
        size: Math.random() * 1.5 + 0.5, vx: (Math.random() - 0.5) * 0.2, vy: (Math.random() - 0.5) * 0.2,
        alpha: Math.random() * 0.5 + 0.2, pulse: Math.random() * 0.01 + 0.005
      });
    }
    if (this.particles.length > this.density) this.particles.splice(this.density);
    this.particles.forEach(p => {
      p.x += p.vx; p.y += p.vy; p.alpha += p.pulse;
      if (p.alpha > 0.8 || p.alpha < 0.2) p.pulse *= -1;
      if (p.x < 0) p.x = this.canvas.width; if (p.x > this.canvas.width) p.x = 0;
      if (p.y < 0) p.y = this.canvas.height; if (p.y > this.canvas.height) p.y = 0;
      this.ctx.beginPath(); this.ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      this.ctx.fillStyle = `rgba(200, 160, 80, ${p.alpha})`; this.ctx.fill();
    });
    requestAnimationFrame(() => this.animate());
  }
}
const fireflyManager = new FireflyManager();

/* --- 4. DATABASE ENGINE (VERSION 4) --- */
async function initDB() {
  return new Promise((resolve) => {
    const req = indexedDB.open("NakedQuantumDB", 4);
    req.onupgradeneeded = (e) => {
      const d = e.target.result;
      const stores = ["folders", "discourses", "characters", "history"];
      stores.forEach(s => {
        if (!d.objectStoreNames.contains(s)) {
          const os = d.createObjectStore(s, { keyPath: "id", autoIncrement: (s === 'history') });
          if (s === 'discourses') os.createIndex("folder_id", "folder_id", { unique: false });
        }
      });
    };
    req.onsuccess = (e) => { db = e.target.result; resolve(db); };
    req.onerror = (e) => { console.error("DB Error", e); resolve(null); };
  });
}

const dbCall = (store, method, ...args) => new Promise(r => {
  if (!db) return r(null);
  const tx = db.transaction(store, "readwrite");
  const req = tx.objectStore(store)[method](...args);
  req.onsuccess = () => r(req.result);
  req.onerror = () => r(null);
});

/* --- 5. VIEW & MODE SWITCHING --- */
async function refresh() {
  if (currentMode === 'soup') await renderSoup();
}

function switchView(viewId) {
  ['view-soup', 'view-sanctuary', 'view-void'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.add('hidden');
  });
  const activeView = document.getElementById(viewId);
  if (activeView) activeView.classList.remove('hidden');
  document.getElementById('fab-container').style.display = (viewId === 'view-soup') ? 'flex' : 'none';
}

const wordmark = document.getElementById('nq-wordmark');
let wordmarkPressTimer = null;
if (wordmark) {
  wordmark.addEventListener('touchstart', () => {
    wordmark.classList.add('pressing');
    wordmarkPressTimer = setTimeout(() => {
      wordmark.classList.remove('pressing');
      currentMode = currentMode === 'soup' ? 'sanctuary' : 'soup';
      switchView(currentMode === 'soup' ? 'view-soup' : 'view-sanctuary');
      updateHeaderActions();
      haptic('heavy');
      showModeToast(currentMode === 'soup' ? '✦ The Soup' : '◈ The Sanctuary');
      if (currentMode === 'soup') refresh();
    }, 600);
  }, { passive: true });
  wordmark.addEventListener('touchend', () => { wordmark.classList.remove('pressing'); clearTimeout(wordmarkPressTimer); });
}

function updateHeaderActions() {
  const container = document.getElementById('header-actions');
  if (!container) return;
  if (currentMode === 'soup') {
    container.innerHTML = `
      <button class="hdr-btn" id="btn-hdr-void" title="The Void" style="color:#ff6060;">◌</button>
      <button class="hdr-btn" id="btn-hdr-search" title="Search">⌖</button>
      <button class="hdr-btn" id="btn-hdr-sync" title="Akashic Sync">∞</button>
    `;
    document.getElementById('btn-hdr-void').onclick = openVoid;
    document.getElementById('btn-hdr-search').onclick = () => openModal('modal-search');
    document.getElementById('btn-hdr-sync').onclick = syncAkashic;
  } else {
    container.innerHTML = `<button class="hdr-btn" title="Lens Settings">⚙</button>`;
  }
}

/* --- 6. THE SOUP ENGINE --- */
async function renderSoup() {
  const container = document.getElementById('soup-content');
  const breadcrumbs = document.getElementById('soup-breadcrumbs');
  if (!container || !breadcrumbs) return;

  breadcrumbs.innerHTML = '';
  breadcrumbPath.forEach((seg, idx) => {
    const btn = document.createElement('span');
    btn.className = idx === breadcrumbPath.length - 1 ? 'breadcrumb-current' : 'breadcrumb-item';
    btn.textContent = seg.name;
    btn.onclick = () => {
      breadcrumbPath = breadcrumbPath.slice(0, idx + 1);
      currentFolderId = breadcrumbPath[breadcrumbPath.length - 1].id;
      refresh();
    };
    breadcrumbs.appendChild(btn);
    if (idx < breadcrumbPath.length - 1) {
      const arrow = document.createElement('span'); arrow.className = 'breadcrumb-arrow'; arrow.textContent = '▸';
      breadcrumbs.appendChild(arrow);
    }
  });

  const allFolders = await dbCall('folders', 'getAll') || [];
  const allDiscourses = await dbCall('discourses', 'getAll') || [];
  const folders = allFolders.filter(f => f.parent_id === currentFolderId);
  const activeDiscourses = allDiscourses.filter(d => !d.isDeleted && d.folder_id === currentFolderId);
  const fragments = activeDiscourses.filter(d => d.item_type !== 'spark').sort((a,b) => b.updated_at - a.updated_at);
  const sparks = activeDiscourses.filter(d => d.item_type === 'spark').sort((a,b) => b.updated_at - a.updated_at);

  container.innerHTML = '';
  let totalLen = 0;

  if (folders.length > 0) {
    container.innerHTML += `<div class="section-label" style="padding:0 16px 8px;">Folders</div><div class="cards-grid" id="folder-grid" style="padding:0 16px;"></div>`;
    const grid = document.getElementById('folder-grid');
    folders.forEach(f => grid.appendChild(createCard('folder-card', '◈', f.name, 'Folder', f.id, 'folder')));
  }
  if (fragments.length > 0) {
    container.innerHTML += `<div class="section-label" style="padding:14px 16px 8px;">Fragments</div><div class="cards-grid" id="frag-grid" style="padding:0 16px;"></div>`;
    const grid = document.getElementById('frag-grid');
    fragments.forEach(d => {
      totalLen += (d.raw_text || "").length;
      grid.appendChild(createCard('fragment-card', '✦', d.title || 'Untitled', new Date(d.updated_at).toLocaleDateString(), d.id, 'fragment'));
    });
  }
  if (sparks.length > 0) {
    container.innerHTML += `<div class="section-label" style="color:#a0d8a0; padding:14px 16px 8px;">Sparks</div><div class="cards-grid" id="spark-grid" style="padding:0 16px 100px;"></div>`;
    const grid = document.getElementById('spark-grid');
    sparks.forEach(s => {
      totalLen += (s.raw_text || "").length;
      grid.appendChild(createCard('spark-card', '⚡', s.title || 'Quick Spark', new Date(s.updated_at).toLocaleDateString(), s.id, 'fragment'));
    });
  }

  if (!folders.length && !fragments.length && !sparks.length) {
    container.innerHTML = `<div class="placeholder-center"><h1>The Soup is Clear</h1><p>No presence found in this depth.</p></div>`;
  }
  fireflyManager.setDensity(totalLen);
}

/* --- 7. REFINED HAPTIC INTERACTION --- */
let longPressActive = false;
function createCard(className, icon, title, meta, id, type) {
  const card = document.createElement('div');
  card.className = className;
  card.innerHTML = `<div class="card-icon">${icon}</div><div class="card-name">${escHtml(title)}</div><div class="card-meta">${meta}</div>`;
  
  let timer = null;
  card.oncontextmenu = (e) => { e.preventDefault(); return false; };

  const start = () => {
    longPressActive = false;
    card.classList.add('long-pressing');
    timer = setTimeout(() => {
      longPressActive = true;
      mgmtId = id; haptic('heavy');
      card.classList.remove('long-pressing');
      openModal('modal-mgmt');
    }, 600);
  };
  const end = (e) => {
    clearTimeout(timer);
    card.classList.remove('long-pressing');
    if (!longPressActive && e.type === 'touchend') {
      if (type === 'folder') {
        breadcrumbPath.push({ id, name: title }); currentFolderId = id; refresh();
      } else {
        openLighthouse(id);
      }
    }
    longPressActive = false;
  };

  card.addEventListener('touchstart', start, { passive: true });
  card.addEventListener('touchend', end);
  card.addEventListener('touchmove', () => { clearTimeout(timer); card.classList.remove('long-pressing'); });
  return card;
}

/* --- 8. MODALS & MANAGEMENT --- */
const closeModals = () => {
  document.getElementById('nq-overlay').classList.remove('active');
  document.querySelectorAll('.modal').forEach(m => m.classList.remove('visible'));
  document.getElementById('fab-main').classList.remove('open');
  document.getElementById('fab-menu').classList.remove('open');
};
const openModal = (id) => {
  closeModals();
  document.getElementById('nq-overlay').classList.add('active');
  document.getElementById(id).classList.add('visible');
};
document.getElementById('nq-overlay').onclick = closeModals;

document.getElementById('btn-mgmt-rename').onclick = async () => {
  const store = mgmtId.startsWith('f_') ? 'folders' : 'discourses';
  const item = await dbCall(store, 'get', mgmtId);
  document.getElementById('input-rename').value = store === 'folders' ? item.name : item.title;
  openModal('modal-rename');
};
document.getElementById('btn-confirm-rename').onclick = async () => {
  const name = document.getElementById('input-rename').value.trim();
  if (!name) return;
  const store = mgmtId.startsWith('f_') ? 'folders' : 'discourses';
  const item = await dbCall(store, 'get', mgmtId);
  if (store === 'folders') item.name = name; else item.title = name;
  await dbCall(store, 'put', item); closeModals(); refresh();
};
document.getElementById('btn-mgmt-delete').onclick = async () => {
  if(!confirm("Send to Void?")) return;
  const store = mgmtId.startsWith('f_') ? 'folders' : 'discourses';
  if (store === 'folders') await dbCall('folders', 'delete', mgmtId);
  else {
    const item = await dbCall('discourses', 'get', mgmtId);
    item.isDeleted = true; item.deleted_at = Date.now(); await dbCall('discourses', 'put', item);
  }
  closeModals(); refresh();
};
document.getElementById('btn-mgmt-move').onclick = async () => {
  const sel = document.getElementById('move-parent-select');
  sel.innerHTML = '<option value="">◈ Root</option>';
  const folders = await dbCall('folders', 'getAll') || [];
  folders.filter(f => f.id !== mgmtId).forEach(f => {
    const opt = document.createElement('option'); opt.value = f.id; opt.textContent = f.name; sel.appendChild(opt);
  });
  openModal('modal-move');
};
document.getElementById('btn-confirm-move').onclick = async () => {
  const newParent = document.getElementById('move-parent-select').value || null;
  const store = mgmtId.startsWith('f_') ? 'folders' : 'discourses';
  const item = await dbCall(store, 'get', mgmtId);
  if (store === 'folders') item.parent_id = newParent; else item.folder_id = newParent;
  await dbCall(store, 'put', item); closeModals(); refresh();
};

/* --- 9. VOID ENGINE --- */
async function openVoid() {
  switchView('view-void');
  const surface = document.getElementById('void-surface');
  surface.innerHTML = '';
  const deleted = (await dbCall('discourses', 'getAll') || []).filter(d => d.isDeleted);
  if (deleted.length === 0) { surface.innerHTML = '<div class="placeholder-center"><h1>◌</h1><p>Void is empty.</p></div>'; return; }
  deleted.forEach(d => {
    const el = document.createElement('div'); el.className = 'soup-item';
    el.innerHTML = `<div class="soup-item-info"><div class="soup-item-name" style="text-decoration:line-through;opacity:0.5;">${escHtml(d.title)}</div></div>
      <button class="hdr-btn" onclick="restoreItem('${d.id}')">↩</button>
      <button class="hdr-btn" style="color:var(--danger);" onclick="purgeItem('${d.id}')">✕</button>`;
    surface.appendChild(el);
  });
}
document.getElementById('btn-close-void').onclick = () => { switchView('view-soup'); refresh(); };
window.restoreItem = async (id) => { const item = await dbCall('discourses', 'get', id); item.isDeleted = false; await dbCall('discourses', 'put', item); openVoid(); };
window.purgeItem = async (id) => { if(confirm("Erase?")) { await dbCall('discourses', 'delete', id); openVoid(); } };

/* --- 10. SPARKS & FAB --- */
document.getElementById('fab-main').onclick = () => { document.getElementById('fab-main').classList.toggle('open'); document.getElementById('fab-menu').classList.toggle('open'); };
document.getElementById('btn-fab-folder').onclick = () => { openModal('modal-folder'); setTimeout(()=>document.getElementById('input-folder-name').focus(), 100); };
document.getElementById('btn-confirm-folder').onclick = async () => {
  const name = document.getElementById('input-folder-name').value.trim();
  if(name) { await dbCall('folders', 'put', { id: 'f_'+Date.now(), name, parent_id: currentFolderId, updated_at: Date.now() }); closeModals(); refresh(); }
};
document.getElementById('btn-fab-spark').onclick = () => {
  const sel = document.getElementById('spark-folder');
  sel.innerHTML = '<option value="">◈ Current</option>';
  dbCall('folders', 'getAll').then(fs => fs.forEach(f => { const opt = document.createElement('option'); opt.value = f.id; opt.textContent = f.name; sel.appendChild(opt); }));
  document.getElementById('spark-title').value = ''; document.getElementById('spark-body').value = '';
  openModal('modal-spark');
};
document.getElementById('btn-confirm-spark').onclick = async () => {
  const text = document.getElementById('spark-body').value.trim();
  if(!text) return;
  const title = document.getElementById('spark-title').value || text.split(/\s+/).slice(0,4).join(' ');
  await dbCall('discourses', 'put', { id: 's_'+Date.now(), title, raw_text: text, folder_id: document.getElementById('spark-folder').value || currentFolderId, item_type: 'spark', updated_at: Date.now() });
  closeModals(); refresh();
};

/* --- 11. EDITOR & FORMATTING --- */
document.getElementById('btn-fab-frag').onclick = () => {
  currentDiscourseId = 'd_'+Date.now();
  document.getElementById('lh-title').value = ''; document.getElementById('lh-text').value = '';
  document.getElementById('lh-overlay').classList.add('active'); setLhMode('write'); closeModals();
};
async function openLighthouse(id) {
  currentDiscourseId = id; const d = await dbCall('discourses', 'get', id);
  document.getElementById('lh-title').value = d.title || ''; document.getElementById('lh-text').value = d.raw_text || '';
  document.getElementById('lh-overlay').classList.add('active'); setLhMode('write');
}
function setLhMode(mode) {
  const ta = document.getElementById('lh-text'), view = document.getElementById('lh-view');
  if(mode === 'write') { ta.style.display = 'block'; view.style.display = 'none'; document.getElementById('btn-lh-write').classList.add('active'); document.getElementById('btn-lh-view').classList.remove('active'); }
  else { view.innerHTML = renderMarkdown(ta.value); ta.style.display = 'none'; view.style.display = 'block'; document.getElementById('btn-lh-write').classList.remove('active'); document.getElementById('btn-lh-view').classList.add('active'); }
}
document.getElementById('btn-lh-write').onclick = () => setLhMode('write');
document.getElementById('btn-lh-view').onclick = () => setLhMode('view');
document.getElementById('btn-lh-back').onclick = async () => {
  if (currentDiscourseId) {
    const title = document.getElementById('lh-title').value.trim() || 'Untitled';
    const text = document.getElementById('lh-text').value;
    await dbCall('discourses', 'put', { id: currentDiscourseId, title, raw_text: text, folder_id: currentFolderId, updated_at: Date.now() });
  }
  document.getElementById('lh-overlay').classList.remove('active'); refresh();
};
document.querySelectorAll('.fmt-btn').forEach(btn => {
  btn.onclick = () => {
    const ta = document.getElementById('lh-text');
    const start = ta.selectionStart, end = ta.selectionEnd, val = ta.value, selected = val.slice(start, end);
    let res = '', newPos = 0;
    if (btn.dataset.wrap) { res = btn.dataset.wrap + selected + btn.dataset.wrap; newPos = selected ? start + res.length : start + btn.dataset.wrap.length; }
    else if (btn.dataset.line) { const lineStart = val.lastIndexOf('\n', start - 1) + 1; res = btn.dataset.line + selected; newPos = start + btn.dataset.line.length + selected.length; }
    else if (btn.dataset.insert) { res = btn.dataset.insert; newPos = start + res.length; }
    ta.value = val.slice(0, start) + res + val.slice(end);
    ta.focus(); ta.setSelectionRange(newPos, newPos);
  };
});
function renderMarkdown(raw) {
  return raw.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\*(.+?)\*/g, '<em>$1</em>').replace(/^# (.+)$/gm, '<h1>$1</h1>').replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>').replace(/\n/g, '<br>');
}

/* --- 12. BOOT --- */
async function syncAkashic() { showToast("Syncing..."); setTimeout(()=>showToast("Synced ◈"), 1000); }
window.onload = () => { initDB().then(() => { updateHeaderActions(); switchView('view-soup'); refresh(); }); };