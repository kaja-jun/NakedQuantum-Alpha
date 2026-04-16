/* ==========================================================================
   NAKED QUANTUM: THE ATOMIC NERVOUS SYSTEM (app.js)
   ========================================================================== */

/* --- 1. GLOBAL STATE --- */
const AKASHIC_URL = 'https://wandering-violet-964a.gazajar.workers.dev';
let nqUserId = localStorage.getItem('nq_user_id') || crypto.randomUUID();
localStorage.setItem('nq_user_id', nqUserId);

let db = null;
let currentMode = 'soup';
let currentFolderId = null;
let currentDiscourseId = null;
let mgmtId = null;
let breadcrumbPath = [{ id: null, name: '◈ Root' }];

/* --- 2. FIREFLY ENGINE --- */
class FireflyManager {
  constructor() {
    this.canvas = document.getElementById('firefly-canvas');
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext('2d');
    this.particles = [];
    this.density = 20;
    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.animate();
  }
  resize() { 
    this.canvas.width = window.innerWidth; 
    this.canvas.height = window.innerHeight; 
  }
  setDensity(len) { 
    this.density = Math.min(100, 15 + Math.floor((len || 0) / 200)); 
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

/* --- 3. DATABASE (VER 4) --- */
async function initDB() {
  return new Promise((resolve) => {
    const req = indexedDB.open("NakedQuantumDB", 4);
    req.onupgradeneeded = (e) => {
      const d = e.target.result;
      ["folders", "discourses", "characters", "history"].forEach(s => {
        if (!d.objectStoreNames.contains(s)) {
          const os = d.createObjectStore(s, { keyPath: "id", autoIncrement: (s === 'history') });
          if (s === 'discourses') os.createIndex("folder_id", "folder_id", { unique: false });
        }
      });
    };
    req.onsuccess = (e) => { db = e.target.result; resolve(db); };
    req.onerror = () => resolve(null);
  });
}

const dbCall = (store, method, ...args) => new Promise(r => {
  if (!db) return r(null);
  const tx = db.transaction(store, "readwrite");
  const req = tx.objectStore(store)[method](...args);
  req.onsuccess = () => r(req.result);
  req.onerror = () => r(null);
});

/* --- 4. NAVIGATION & MODES --- */
const showToast = (msg) => {
  const t = document.getElementById('nq-toast');
  if(!t) return;
  t.textContent = msg; t.style.opacity = "1";
  clearTimeout(t._timer); t._timer = setTimeout(() => { t.style.opacity = "0"; }, 2000);
};

function switchView(viewId) {
  ['view-soup', 'view-sanctuary', 'view-void'].forEach(id => {
    document.getElementById(id).classList.add('hidden');
  });
  document.getElementById(viewId).classList.remove('hidden');
  document.getElementById('fab-container').style.display = (viewId === 'view-soup') ? 'flex' : 'none';
}

/* --- 5. THE SOUP (LISTING) --- */
async function renderSoup() {
  const container = document.getElementById('soup-content');
  const breadcrumbs = document.getElementById('soup-breadcrumbs');
  if (!container || !breadcrumbs) return;

  // Breadcrumbs
  breadcrumbs.innerHTML = '';
  breadcrumbPath.forEach((seg, idx) => {
    const btn = document.createElement('span');
    btn.className = idx === breadcrumbPath.length - 1 ? 'breadcrumb-current' : 'breadcrumb-item';
    btn.textContent = seg.name;
    btn.onclick = () => {
      breadcrumbPath = breadcrumbPath.slice(0, idx + 1);
      currentFolderId = breadcrumbPath[breadcrumbPath.length - 1].id;
      renderSoup();
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
    container.innerHTML += `<div class="section-label">Folders</div><div class="cards-grid" id="folder-grid"></div>`;
    const grid = document.getElementById('folder-grid');
    folders.forEach(f => grid.appendChild(createCard('folder-card', '◈', f.name, 'Folder', f.id, 'folder')));
  }

  if (fragments.length > 0) {
    container.innerHTML += `<div class="section-label">Fragments</div><div class="cards-grid" id="frag-grid"></div>`;
    const grid = document.getElementById('frag-grid');
    fragments.forEach(d => {
      totalLen += (d.raw_text || "").length;
      grid.appendChild(createCard('fragment-card', '✦', d.title || 'Untitled', new Date(d.updated_at).toLocaleDateString(), d.id, 'fragment'));
    });
  }

  if (sparks.length > 0) {
    container.innerHTML += `<div class="section-label" style="color:#a0d8a0;">Sparks</div><div class="cards-grid" id="spark-grid"></div>`;
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

/* --- 6. ATOMIC INTERACTION LOGIC --- */
function createCard(className, icon, title, meta, id, type) {
  const card = document.createElement('div');
  card.className = className;
  card.innerHTML = `<div class="card-icon">${icon}</div><div class="card-name">${escHtml(title)}</div><div class="card-meta">${meta}</div>`;
  
  let timer = null;
  let isLongPress = false;

  card.oncontextmenu = (e) => { e.preventDefault(); return false; };

  const start = () => {
    isLongPress = false;
    card.classList.add('long-pressing');
    timer = setTimeout(() => {
      isLongPress = true;
      mgmtId = id; 
      if ('vibrate' in navigator) navigator.vibrate(30);
      card.classList.remove('long-pressing');
      openModal('modal-mgmt');
    }, 700);
  };

  const end = (e) => {
    clearTimeout(timer);
    card.classList.remove('long-pressing');
    if (!isLongPress) {
      if (type === 'folder') {
        breadcrumbPath.push({ id, name: title }); currentFolderId = id; renderSoup();
      } else {
        openLighthouse(id);
      }
    }
    isLongPress = false;
  };

  card.addEventListener('touchstart', start, { passive: true });
  card.addEventListener('touchend', end);
  card.addEventListener('touchmove', () => { clearTimeout(timer); card.classList.remove('long-pressing'); });
  card.onmousedown = start;
  card.onmouseup = end;

  return card;
}

/* --- 7. MODALS & MANAGEMENT --- */
function closeModals() {
  document.getElementById('nq-overlay').classList.remove('active');
  document.querySelectorAll('.modal').forEach(m => m.classList.remove('visible'));
  document.getElementById('fab-main').classList.remove('open');
  document.getElementById('fab-menu').classList.remove('open');
}

function openModal(id) {
  closeModals();
  document.getElementById('nq-overlay').classList.add('active');
  document.getElementById(id).classList.add('visible');
}

document.getElementById('nq-overlay').onclick = closeModals;

// Management Actions
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
  await dbCall(store, 'put', item); closeModals(); renderSoup();
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
  await dbCall(store, 'put', item); closeModals(); renderSoup();
};

document.getElementById('btn-mgmt-delete').onclick = async () => {
  if(!confirm("Send to the Void?")) return;
  const store = mgmtId.startsWith('f_') ? 'folders' : 'discourses';
  if (store === 'folders') await dbCall('folders', 'delete', mgmtId);
  else {
    const item = await dbCall('discourses', 'get', mgmtId);
    item.isDeleted = true; item.deleted_at = Date.now();
    await dbCall('discourses', 'put', item);
  }
  closeModals(); renderSoup();
};

/* --- 8. THE SOUP TOOLS (VOID, SEARCH, SPARKS) --- */
async function openVoid() {
  switchView('view-void');
  const surface = document.getElementById('void-surface');
  surface.innerHTML = '';
  const deleted = (await dbCall('discourses', 'getAll') || []).filter(d => d.isDeleted);
  if (!deleted.length) { surface.innerHTML = '<div class="placeholder-center"><h1>◌</h1><p>The Void is empty.</p></div>'; return; }
  deleted.forEach(d => {
    const el = document.createElement('div'); el.className = 'soup-item';
    el.innerHTML = `<div class="soup-item-info"><div class="soup-item-name" style="text-decoration:line-through;opacity:0.5;">${escHtml(d.title)}</div></div>
      <button class="hdr-btn" onclick="restoreItem('${d.id}')">↩</button>
      <button class="hdr-btn" style="color:var(--danger);" onclick="purgeItem('${d.id}')">✕</button>`;
    surface.appendChild(el);
  });
}

document.getElementById('btn-close-void').onclick = () => { switchView('view-soup'); renderSoup(); };
window.restoreItem = async (id) => { const item = await dbCall('discourses', 'get', id); item.isDeleted = false; await dbCall('discourses', 'put', item); openVoid(); };
window.purgeItem = async (id) => { if(confirm("Erase?")) { await dbCall('discourses', 'delete', id); openVoid(); } };

// Search
document.getElementById('input-search').oninput = async (e) => {
  const q = e.target.value.toLowerCase();
  const results = document.getElementById('search-results');
  if (!q) { results.innerHTML = ''; return; }
  const folders = (await dbCall('folders', 'getAll') || []).filter(f => f.name.toLowerCase().includes(q));
  const discourses = (await dbCall('discourses', 'getAll') || []).filter(d => !d.isDeleted && ((d.title || '').toLowerCase().includes(q) || (d.raw_text || '').toLowerCase().includes(q)));
  results.innerHTML = [
    ...folders.map(f => `<div class="soup-item" onclick="enterFolder('${f.id}');closeModals()"><div class="soup-item-icon">◈</div><div class="soup-item-name">${escHtml(f.name)}</div></div>`),
    ...discourses.map(d => `<div class="soup-item" onclick="openLighthouse('${d.id}');closeModals()"><div class="soup-item-icon">${d.item_type==='spark'?'⚡':'✦'}</div><div class="soup-item-name">${escHtml(d.title || 'Untitled')}</div></div>`)
  ].join('');
};

/* --- 9. SPARKS & FAB --- */
document.getElementById('fab-main').onclick = () => {
  document.getElementById('fab-main').classList.toggle('open');
  document.getElementById('fab-menu').classList.toggle('open');
};

document.getElementById('btn-fab-folder').onclick = () => { openModal('modal-folder'); setTimeout(()=>document.getElementById('input-folder-name').focus(), 100); };

document.getElementById('btn-confirm-folder').onclick = async () => {
  const name = document.getElementById('input-folder-name').value.trim();
  if(name) { await dbCall('folders', 'put', { id: 'f_'+Date.now(), name, parent_id: currentFolderId, updated_at: Date.now() }); closeModals(); renderSoup(); }
};

document.getElementById('btn-fab-spark').onclick = async () => {
  const sel = document.getElementById('spark-folder');
  sel.innerHTML = '<option value="">◈ Current Folder</option>';
  const folders = await dbCall('folders', 'getAll') || [];
  folders.forEach(f => { const opt = document.createElement('option'); opt.value = f.id; opt.textContent = f.name; sel.appendChild(opt); });
  document.getElementById('spark-title').value = ''; document.getElementById('spark-body').value = '';
  openModal('modal-spark');
  setTimeout(()=>document.getElementById('spark-body').focus(), 120);
};

document.getElementById('btn-confirm-spark').onclick = async () => {
  const text = document.getElementById('spark-body').value.trim();
  if(!text) return;
  const title = document.getElementById('spark-title').value || text.split(/\s+/).slice(0,4).join(' ');
  await dbCall('discourses', 'put', { id: 's_'+Date.now(), title, raw_text: text, folder_id: document.getElementById('spark-folder').value || currentFolderId, item_type: 'spark', updated_at: Date.now() });
  closeModals(); renderSoup();
};

/* --- 10. LIGHTHOUSE EDITOR --- */
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
    await dbCall('discourses', 'put', { id: currentDiscourseId, title, raw_text: text, folder_id: currentFolderId, item_type: currentDiscourseId.startsWith('s_') ? 'spark' : 'fragment', updated_at: Date.now() });
  }
  document.getElementById('lh-overlay').classList.remove('active'); renderSoup();
};

/* Formatting Toolbar Math */
document.querySelectorAll('.fmt-btn').forEach(btn => {
  btn.onclick = () => {
    const ta = document.getElementById('lh-text');
    const start = ta.selectionStart, end = ta.selectionEnd, val = ta.value, selected = val.slice(start, end);
    let res = '', newPos = 0;
    if (btn.dataset.wrap) { 
      const tag = btn.dataset.wrap; res = tag + selected + tag; 
      newPos = selected ? start + res.length : start + tag.length; 
    }
    else if (btn.dataset.block) { 
      res = btn.dataset.block + selected + btn.dataset.end; 
      newPos = selected ? start + res.length : start + btn.dataset.block.length; 
    }
    else if (btn.dataset.line) { 
      const tag = btn.dataset.line; 
      res = tag + selected; newPos = start + tag.length + selected.length; 
    }
    else if (btn.dataset.insert) { res = btn.dataset.insert; newPos = start + res.length; }
    ta.value = val.slice(0, start) + res + val.slice(end);
    ta.focus(); ta.setSelectionRange(newPos, newPos);
  };
});

function renderMarkdown(raw) {
  if(!raw) return "Silence.";
  return raw.replace(/```([\s\S]*?)```/g, '<pre style="background:#111;padding:10px;border-radius:8px;overflow-x:auto;">$1</pre>')
            .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.+?)\*/g, '<em>$1</em>')
            .replace(/^# (.+)$/gm, '<h1 style="color:var(--accent);">$1</h1>')
            .replace(/^> (.+)$/gm, '<blockquote style="border-left:2px solid var(--accent);padding-left:10px;color:var(--muted);">$1</blockquote>')
            .replace(/\n/g, '<br>');
}

/* --- 11. BOOT SEQUENCE --- */
const wordmark = document.getElementById('nq-wordmark');
let wordmarkPressTimer = null;
wordmark.addEventListener('touchstart', () => {
  wordmark.classList.add('pressing');
  wordmarkPressTimer = setTimeout(() => {
    wordmark.classList.remove('pressing');
    currentMode = currentMode === 'soup' ? 'sanctuary' : 'soup';
    switchView(currentMode === 'soup' ? 'view-soup' : 'view-sanctuary');
    updateHeaderActions();
    if (currentMode === 'soup') renderSoup();
    if ('vibrate' in navigator) navigator.vibrate(40);
  }, 600);
}, { passive: true });
wordmark.addEventListener('touchend', () => { wordmark.classList.remove('pressing'); clearTimeout(wordmarkPressTimer); });

function updateHeaderActions() {
  const container = document.getElementById('header-actions');
  if (currentMode === 'soup') {
    container.innerHTML = `<button class="hdr-btn" id="btn-hdr-void">◌</button><button class="hdr-btn" id="btn-hdr-search">⌖</button><button class="hdr-btn" id="btn-hdr-sync">∞</button>`;
    document.getElementById('btn-hdr-void').onclick = openVoid;
    document.getElementById('btn-hdr-search').onclick = () => openModal('modal-search');
  } else {
    container.innerHTML = `<button class="hdr-btn">⚙</button>`;
  }
}

window.onload = () => {
  initDB().then(() => {
    updateHeaderActions();
    switchView('view-soup');
    renderSoup();
  });
};