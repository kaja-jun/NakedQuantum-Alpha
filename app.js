/* ==========================================================================
   NAKED QUANTUM: THE NERVOUS SYSTEM (app.js)
   ========================================================================== */

/* --- I. STATE & CONSTANTS --- */
const AKASHIC_URL = 'https://wandering-violet-964a.gazajar.workers.dev';
let cosmUserId = localStorage.getItem('nq_user_id') || crypto.randomUUID();
localStorage.setItem('nq_user_id', cosmUserId);

let db = null;
let currentMode = 'soup';
let currentFolderId = null;
let currentDiscourseId = null;
let breadcrumbPath = [{ id: null, name: '◈ Root' }];

let longPressTimer = null;
let mgmtId = null; // The ID of the item currently being managed

/* --- II. UTILS & HAPTICS --- */
function haptic(type = 'light') {
  try {
    if ('vibrate' in navigator) navigator.vibrate(type === 'heavy' ? 40 : 15);
  } catch (e) {}
}

const showToast = (msg) => {
  const t = document.getElementById('nq-toast');
  t.textContent = msg; t.style.opacity = "1";
  setTimeout(() => t.style.opacity = "0", 2000);
};

const showModeToast = (msg) => {
  const t = document.getElementById('mode-toast');
  t.textContent = msg; t.style.opacity = "1";
  setTimeout(() => t.style.opacity = "0", 1500);
};

function escHtml(str) {
  if (!str) return "";
  return String(str).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

/* --- III. FIREFLY ENGINE --- */
class FireflyManager {
  constructor() {
    this.canvas = document.getElementById('firefly-canvas');
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext('2d');
    this.particles = [];
    this.density = 10;
    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.animate();
  }
  resize() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }
  setDensity(len) {
    // 10 base fireflies, max 150 based on text length
    this.density = Math.min(150, 10 + Math.floor(len / 100));
  }
  animate() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    while (this.particles.length < this.density) {
      this.particles.push({
        x: Math.random() * this.canvas.width, y: Math.random() * this.canvas.height,
        size: Math.random() * 2 + 0.5, vx: (Math.random() - 0.5) * 0.3, vy: (Math.random() - 0.5) * 0.3,
        alpha: Math.random() * 0.5 + 0.2, pulse: Math.random() * 0.02 + 0.005
      });
    }
    if (this.particles.length > this.density) this.particles.splice(this.density);
    this.particles.forEach(p => {
      p.x += p.vx; p.y += p.vy; p.alpha += p.pulse;
      if (p.alpha > 0.7 || p.alpha < 0.1) p.pulse *= -1;
      if (p.x < 0) p.x = this.canvas.width; if (p.x > this.canvas.width) p.x = 0;
      if (p.y < 0) p.y = this.canvas.height; if (p.y > this.canvas.height) p.y = 0;
      this.ctx.beginPath(); this.ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      this.ctx.fillStyle = `rgba(200, 160, 80, ${p.alpha})`; this.ctx.fill();
    });
    requestAnimationFrame(() => this.animate());
  }
}
const fireflyManager = new FireflyManager();

/* --- IV. DATABASE --- */
async function initDB() {
  return new Promise((resolve) => {
    const req = indexedDB.open("NakedQuantumDB", 3);
    req.onupgradeneeded = (e) => {
      const d = e.target.result;
      const stores = ["folders", "discourses", "characters", "history"];
      stores.forEach(s => {
        if (!d.objectStoreNames.contains(s)) {
          const os = d.createObjectStore(s, { keyPath: "id", autoIncrement: (s === 'history') });
          if (s === 'discourses') os.createIndex("folder_id", "folder_id");
        }
      });
    };
    req.onsuccess = (e) => { db = e.target.result; resolve(db); };
  });
}

const dbCall = (store, method, ...args) => new Promise(r => {
  const tx = db.transaction(store, "readwrite");
  const req = tx.objectStore(store)[method](...args);
  req.onsuccess = () => r(req.result);
  req.onerror = () => r(null);
});

/* --- V. VIEW & MODE SWITCHING --- */
async function refresh() {
  if (currentMode === 'soup') await renderSoup();
  // else if sanctuary, renderSanctuary (Phase 2)
}

function switchView(viewId) {
  ['view-soup', 'view-sanctuary', 'view-void'].forEach(id => {
    document.getElementById(id).classList.add('hidden');
  });
  document.getElementById(viewId).classList.remove('hidden');
  
  // Only show FAB in Soup
  document.getElementById('fab-container').style.display = (viewId === 'view-soup') ? 'flex' : 'none';
}

const wordmark = document.getElementById('nq-wordmark');
let wordmarkPressTimer = null;

wordmark.addEventListener('touchstart', () => {
  wordmark.classList.add('pressing');
  wordmarkPressTimer = setTimeout(() => {
    wordmark.classList.remove('pressing');
    currentMode = currentMode === 'soup' ? 'sanctuary' : 'soup';
    switchView(currentMode === 'soup' ? 'view-soup' : 'view-sanctuary');
    updateHeaderActions();
    showModeToast(currentMode === 'soup' ? '✦ The Soup' : '◈ The Sanctuary');
    haptic('heavy');
    if (currentMode === 'soup') refresh();
  }, 600);
}, { passive: true });

wordmark.addEventListener('touchend', () => { wordmark.classList.remove('pressing'); clearTimeout(wordmarkPressTimer); });
wordmark.addEventListener('touchmove', () => { wordmark.classList.remove('pressing'); clearTimeout(wordmarkPressTimer); });

function updateHeaderActions() {
  const container = document.getElementById('header-actions');
  if (currentMode === 'soup') {
    container.innerHTML = `
      <button class="hdr-btn" id="btn-hdr-void" title="The Void">◌</button>
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

/* --- VI. THE SOUP (RENDERING) --- */
async function renderSoup() {
  const container = document.getElementById('soup-content');
  const breadcrumbs = document.getElementById('soup-breadcrumbs');
  
  // Render Breadcrumbs
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
      const arrow = document.createElement('span');
      arrow.className = 'breadcrumb-arrow';
      arrow.textContent = '▸';
      breadcrumbs.appendChild(arrow);
    }
  });

  const allFolders = await dbCall('folders', 'getAll') || [];
  const allDiscourses = await dbCall('discourses', 'getAll') || [];
  
  const folders = allFolders.filter(f => f.parent_id === currentFolderId);
  const activeDiscourses = allDiscourses.filter(d => !d.isDeleted && d.folder_id === currentFolderId);
  
  const fragments = activeDiscourses.filter(d => d.item_type !== 'spark');
  const sparks = activeDiscourses.filter(d => d.item_type === 'spark');

  container.innerHTML = '';
  let totalLen = 0;

  // Build Folders
  if (folders.length > 0) {
    container.innerHTML += `<div class="section-label">Folders</div><div class="cards-grid" id="folder-grid"></div>`;
    const grid = document.getElementById('folder-grid');
    folders.forEach(f => {
      const card = createCard('folder-card', '◈', f.name, 'Folder', () => {
        breadcrumbPath.push({ id: f.id, name: f.name });
        currentFolderId = f.id;
        refresh();
      }, f.id, 'folder');
      grid.appendChild(card);
    });
  }

  // Build Fragments
  if (fragments.length > 0) {
    container.innerHTML += `<div class="section-label">Fragments</div><div class="cards-grid" id="frag-grid"></div>`;
    const grid = document.getElementById('frag-grid');
    fragments.forEach(d => {
      totalLen += (d.raw_text || "").length;
      const card = createCard('fragment-card', '✦', d.title || 'Untitled', new Date(d.updated_at).toLocaleDateString(), () => openLighthouse(d.id), d.id, 'fragment');
      grid.appendChild(card);
    });
  }

  // Build Sparks
  if (sparks.length > 0) {
    container.innerHTML += `<div class="section-label" style="color:#a0d8a0;">Sparks</div><div class="cards-grid" id="spark-grid"></div>`;
    const grid = document.getElementById('spark-grid');
    sparks.forEach(s => {
      totalLen += (s.raw_text || "").length;
      const card = createCard('spark-card', '⚡', s.title || 'Quick Spark', new Date(s.updated_at).toLocaleDateString(), () => openLighthouse(s.id), s.id, 'fragment');
      grid.appendChild(card);
    });
  }

  if (!folders.length && !fragments.length && !sparks.length) {
    container.innerHTML = `<div class="placeholder-center"><h1>The Soup is Clear</h1><p>No presence found in this depth.</p></div>`;
  }
  
  fireflyManager.setDensity(totalLen);
}

function createCard(className, icon, title, meta, clickHandler, id, type) {
  const card = document.createElement('div');
  card.className = className;
  card.innerHTML = `<div class="card-icon">${icon}</div><div class="card-name">${escHtml(title)}</div><div class="card-meta">${meta}</div>`;
  
  card.onclick = (e) => {
    if (longPressTimer) clearTimeout(longPressTimer);
    clickHandler();
  };
  
  // Haptic Long Press
  card.oncontextmenu = (e) => { e.preventDefault(); return false; };
  card.addEventListener('touchstart', (e) => startLongPress(e, card, id, type), { passive: true });
  card.addEventListener('mousedown', (e) => startLongPress(e, card, id, type));
  card.addEventListener('touchend', cancelLongPress);
  card.addEventListener('touchmove', cancelLongPress);
  card.addEventListener('mouseup', cancelLongPress);
  card.addEventListener('mouseleave', cancelLongPress);
  
  return card;
}

/* --- VII. LONG PRESS & MANAGEMENT --- */
let longPressFired = false;
let lpCardElement = null;

function startLongPress(e, card, id, type) {
  longPressFired = false;
  lpCardElement = card;
  card.classList.add('long-pressing');
  longPressTimer = setTimeout(() => {
    longPressFired = true;
    mgmtId = id;
    haptic('heavy');
    card.classList.remove('long-pressing');
    openModal('modal-mgmt');
  }, 600);
}

function cancelLongPress() {
  if (longPressTimer) clearTimeout(longPressTimer);
  if (lpCardElement) lpCardElement.classList.remove('long-pressing');
  // Prevent click if long press fired
  if (longPressFired) {
    setTimeout(() => { longPressFired = false; }, 100);
  }
}

// Manage Actions
document.getElementById('btn-mgmt-rename').onclick = async () => {
  const store = mgmtId.startsWith('f_') ? 'folders' : 'discourses';
  const item = await dbCall(store, 'get', mgmtId);
  document.getElementById('input-rename').value = store === 'folders' ? item.name : item.title;
  openModal('modal-rename');
  document.getElementById('input-rename').focus();
};

document.getElementById('btn-confirm-rename').onclick = async () => {
  const newName = document.getElementById('input-rename').value.trim();
  if (!newName) return;
  const store = mgmtId.startsWith('f_') ? 'folders' : 'discourses';
  const item = await dbCall(store, 'get', mgmtId);
  if (store === 'folders') item.name = newName; else item.title = newName;
  await dbCall(store, 'put', item);
  closeModals(); refresh(); showToast("Renamed");
};

document.getElementById('btn-mgmt-delete').onclick = async () => {
  if(!confirm("Purge to the Void?")) return;
  const store = mgmtId.startsWith('f_') ? 'folders' : 'discourses';
  if (store === 'folders') {
    await dbCall('folders', 'delete', mgmtId); // Folders hard delete for now
  } else {
    // Soft Delete Fragments
    const item = await dbCall('discourses', 'get', mgmtId);
    item.isDeleted = true;
    item.deleted_at = Date.now();
    await dbCall('discourses', 'put', item);
  }
  closeModals(); refresh(); showToast("Sent to Void ◌");
};

document.getElementById('btn-mgmt-move').onclick = async () => {
  const sel = document.getElementById('move-parent-select');
  sel.innerHTML = '<option value="">◈ Root</option>';
  const folders = await dbCall('folders', 'getAll') || [];
  
  // Filter out self if moving a folder
  const validFolders = folders.filter(f => f.id !== mgmtId);
  
  validFolders.forEach(f => {
    const opt = document.createElement('option');
    opt.value = f.id;
    opt.textContent = f.name;
    sel.appendChild(opt);
  });
  openModal('modal-move');
};

document.getElementById('btn-confirm-move').onclick = async () => {
  const newParent = document.getElementById('move-parent-select').value || null;
  const store = mgmtId.startsWith('f_') ? 'folders' : 'discourses';
  const item = await dbCall(store, 'get', mgmtId);
  
  if (store === 'folders') item.parent_id = newParent;
  else item.folder_id = newParent;
  
  await dbCall(store, 'put', item);
  closeModals(); refresh(); showToast("Moved ▤");
};

/* --- VIII. THE VOID (SOFT DELETE) --- */
async function openVoid() {
  switchView('view-void');
  const surface = document.getElementById('void-surface');
  surface.innerHTML = '';
  
  const allDiscourses = await dbCall('discourses', 'getAll') || [];
  const deleted = allDiscourses.filter(d => d.isDeleted).sort((a,b) => b.deleted_at - a.deleted_at);
  
  if (deleted.length === 0) {
    surface.innerHTML = `<div class="placeholder-center"><h1>◌</h1><p>The Void is empty.</p></div>`;
    return;
  }
  
  deleted.forEach(d => {
    const el = document.createElement('div');
    el.className = 'void-item';
    el.innerHTML = `
      <div class="void-item-info">
        <div class="void-item-title">${escHtml(d.title || 'Untitled')}</div>
        <div class="void-item-date">Deleted ${new Date(d.deleted_at).toLocaleDateString()}</div>
      </div>
      <div class="void-item-actions">
        <button class="modal-btn secondary" style="padding:6px 12px; font-size:10px;" onclick="restoreItem('${d.id}')">↩</button>
        <button class="modal-btn danger" style="padding:6px 12px; font-size:10px; border:1px solid #8a3030;" onclick="purgeItem('${d.id}')">✕</button>
      </div>
    `;
    surface.appendChild(el);
  });
}

document.getElementById('btn-close-void').onclick = () => { switchView('view-soup'); refresh(); };

window.restoreItem = async (id) => {
  const item = await dbCall('discourses', 'get', id);
  item.isDeleted = false;
  await dbCall('discourses', 'put', item);
  showToast("Restored"); openVoid();
};

window.purgeItem = async (id) => {
  if(!confirm("Permanently erase?")) return;
  await dbCall('discourses', 'delete', id);
  showToast("Erased"); openVoid();
};

/* --- IX. THE SPARKS ENGINE (QUICK CAPTURE) --- */
document.getElementById('btn-fab-spark').onclick = async () => {
  const fSelect = document.getElementById('spark-folder');
  fSelect.innerHTML = '<option value="">◈ Current Folder</option><option value="__new__">+ New Folder...</option>';
  
  document.getElementById('spark-title').value = '';
  document.getElementById('spark-title').dataset.edited = 'false';
  document.getElementById('spark-body').value = '';
  document.getElementById('spark-new-folder-input').style.display = 'none';
  
  openModal('modal-spark');
  setTimeout(() => document.getElementById('spark-body').focus(), 100);
};

document.getElementById('spark-folder').onchange = (e) => {
  document.getElementById('spark-new-folder-input').style.display = (e.target.value === '__new__') ? 'block' : 'none';
};

// Auto Title Generation
document.getElementById('spark-title').oninput = () => document.getElementById('spark-title').dataset.edited = 'true';
document.getElementById('spark-body').oninput = (e) => {
  const titleEl = document.getElementById('spark-title');
  if (titleEl.dataset.edited === 'true') return;
  const words = (e.target.value || '').split(/\s+/).filter(Boolean).slice(0, 4).join(' ');
  titleEl.value = words;
};

document.getElementById('btn-confirm-spark').onclick = async () => {
  const text = document.getElementById('spark-body').value.trim();
  if (!text) return showToast("Spark is empty");
  
  let targetFolder = document.getElementById('spark-folder').value || currentFolderId;
  if (targetFolder === '__new__') {
    const fName = document.getElementById('spark-new-folder-input').value.trim();
    if (!fName) return showToast("Name the new folder");
    targetFolder = 'f_' + Date.now();
    await dbCall('folders', 'put', { id: targetFolder, name: fName, parent_id: currentFolderId, created_at: Date.now() });
  }

  const id = 's_' + Date.now();
  await dbCall('discourses', 'put', {
    id,
    title: document.getElementById('spark-title').value || "Quick Spark",
    raw_text: text,
    folder_id: targetFolder,
    item_type: 'spark',
    created_at: Date.now(),
    updated_at: Date.now()
  });

  closeModals(); refresh(); showToast("Spark Captured ⚡"); haptic('heavy');
};

/* --- X. LIGHTHOUSE EDITOR & FORMATTING --- */
document.getElementById('btn-fab-frag').onclick = () => {
  currentDiscourseId = 'd_' + Date.now();
  document.getElementById('lh-title').value = '';
  document.getElementById('lh-text').value = '';
  document.getElementById('lh-overlay').classList.add('active');
  setLhMode('write'); closeModals();
};

async function openLighthouse(id) {
  currentDiscourseId = id;
  const d = await dbCall('discourses', 'get', id);
  document.getElementById('lh-title').value = d.title || '';
  document.getElementById('lh-text').value = d.raw_text || '';
  document.getElementById('lh-overlay').classList.add('active');
  setLhMode('write');
}

function setLhMode(mode) {
  const ta = document.getElementById('lh-text');
  const view = document.getElementById('lh-view');
  const btnW = document.getElementById('btn-lh-write');
  const btnV = document.getElementById('btn-lh-view');
  
  if (mode === 'write') {
    ta.style.display = 'block'; view.style.display = 'none';
    btnW.classList.add('active'); btnV.classList.remove('active');
  } else {
    view.innerHTML = renderMarkdown(ta.value);
    ta.style.display = 'none'; view.style.display = 'block';
    btnW.classList.remove('active'); btnV.classList.add('active');
  }
}

document.getElementById('btn-lh-write').onclick = () => setLhMode('write');
document.getElementById('btn-lh-view').onclick = () => setLhMode('view');
document.getElementById('btn-lh-back').onclick = async () => {
  if (currentDiscourseId) {
    const d = await dbCall('discourses', 'get', currentDiscourseId) || {};
    await dbCall('discourses', 'put', {
      ...d,
      id: currentDiscourseId,
      title: document.getElementById('lh-title').value.trim() || 'Untitled',
      raw_text: document.getElementById('lh-text').value,
      folder_id: d.folder_id || currentFolderId,
      item_type: d.item_type || 'fragment',
      updated_at: Date.now()
    });
  }
  document.getElementById('lh-overlay').classList.remove('active');
  refresh();
};

/* Perfect Formatting Math */
document.querySelectorAll('.fmt-btn').forEach(btn => {
  btn.onclick = () => {
    const ta = document.getElementById('lh-text');
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const val = ta.value;
    const selected = val.slice(start, end);
    const before = val.slice(0, start);
    const after = val.slice(end);
    let res = '';
    let newCursorPos = 0;

    if (btn.dataset.wrap) {
      const tag = btn.dataset.wrap;
      res = tag + selected + tag;
      newCursorPos = selected ? start + res.length : start + tag.length;
    } else if (btn.dataset.block) {
      res = btn.dataset.block + selected + btn.dataset.end;
      newCursorPos = selected ? start + res.length : start + btn.dataset.block.length;
    } else if (btn.dataset.line) {
      const lineStart = before.lastIndexOf('\n') + 1;
      const prefix = val.slice(lineStart, start);
      if (prefix.startsWith(btn.dataset.line)) {
        ta.value = val.slice(0, lineStart) + prefix.slice(btn.dataset.line.length) + val.slice(start);
        newCursorPos = start - btn.dataset.line.length;
        ta.focus(); ta.setSelectionRange(newCursorPos, newCursorPos);
        return;
      }
      res = btn.dataset.line + selected;
      newCursorPos = start + btn.dataset.line.length + selected.length;
    } else if (btn.dataset.insert) {
      res = btn.dataset.insert;
      newCursorPos = start + res.length;
    }

    ta.value = before + res + after;
    ta.focus();
    ta.setSelectionRange(newCursorPos, newCursorPos);
  };
});

function renderMarkdown(raw) {
  if (!raw) return '<span style="opacity:0.5;font-style:italic;">Silence.</span>';
  return raw.replace(/```([\s\S]*?)```/g, '<pre style="background:var(--surface2);padding:10px;border-radius:8px;">$1</pre>')
            .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.+?)\*/g, '<em>$1</em>')
            .replace(/^# (.+)$/gm, '<h1 style="color:var(--accent);">$1</h1>')
            .replace(/^## (.+)$/gm, '<h2 style="color:var(--accent);">$1</h2>')
            .replace(/^> (.+)$/gm, '<blockquote style="border-left:2px solid var(--accent); padding-left:10px; color:var(--muted);">$1</blockquote>')
            .replace(/\n/g, '<br>');
}

/* --- XI. FAB FOLDER & OVERLAY HELPERS --- */
document.getElementById('btn-fab-folder').onclick = () => { openModal('modal-folder'); document.getElementById('input-folder-name').focus(); };

/* Search Logic */
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

/* Akashic Sync Dummy Function (To be expanded in Phase 3) */
async function syncAkashic() {
  showToast("Akashic Sync Initiated...");
  // Will pull/push payload via fetch() here
  setTimeout(() => showToast("Akashic Synced ◈"), 1000);
}

/* --- XII. MODAL CLOSE ATTACHMENTS --- */
document.getElementById('nq-overlay').onclick = closeModals;

/* --- XIII. BOOT SEQUENCE --- */
window.onload = () => {
  initDB().then(() => {
    updateHeaderActions();
    switchView('view-soup');
    refresh();
  });
};