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
  setTimeout(() => t.style.opacity = "0", 2000);
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
    this.density = 10;
    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.animate();
  }
  resize() { this.canvas.width = window.innerWidth; this.canvas.height = window.innerHeight; }
  setDensity(len) { this.density = Math.min(150, 10 + Math.floor(len / 100)); }
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

/* --- 4. DATABASE ENGINE --- */
async function initDB() {
  return new Promise((resolve) => {
    const req = indexedDB.open("NakedQuantumDB", 1);
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

/* --- 5. VIEW & MODE SWITCHING --- */
function switchView(viewId) {
  ['view-soup', 'view-sanctuary', 'view-void'].forEach(id => {
    document.getElementById(id).classList.add('hidden');
  });
  document.getElementById(viewId).classList.remove('hidden');
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
    haptic('heavy');
    const t = document.getElementById('mode-toast');
    t.textContent = currentMode === 'soup' ? '✦ The Soup' : '◈ The Sanctuary';
    t.style.opacity = "1"; setTimeout(() => t.style.opacity = "0", 1500);
    if (currentMode === 'soup') renderSoup();
  }, 600);
}, { passive: true });
wordmark.addEventListener('touchend', () => { wordmark.classList.remove('pressing'); clearTimeout(wordmarkPressTimer); });

function updateHeaderActions() {
  const container = document.getElementById('header-actions');
  if (currentMode === 'soup') {
    container.innerHTML = `
      <button class="hdr-btn" id="btn-hdr-void" title="The Void">◌</button>
      <button class="hdr-btn" id="btn-hdr-search" title="Search">⌖</button>
      <button class="hdr-btn" id="btn-hdr-sync" title="Akashic Sync">∞</button>
    `;
    document.getElementById('btn-hdr-void').onclick = openVoid;
    document.getElementById('btn-hdr-search').onclick = () => { closeModals(); document.getElementById('nq-overlay').classList.add('active'); document.getElementById('modal-search').classList.add('visible'); };
    document.getElementById('btn-hdr-sync').onclick = syncAkashic;
  } else {
    container.innerHTML = `<button class="hdr-btn" title="Lens Settings">⚙</button>`;
  }
}

/* --- 6. THE SOUP ENGINE (RENDERER) --- */
async function renderSoup() {
  if (currentMode !== 'soup') return;
  const container = document.getElementById('soup-content');
  const breadcrumbs = document.getElementById('soup-breadcrumbs');
  
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

/* --- 7. PERFECT HAPTIC LONG-PRESS --- */
function createCard(className, icon, title, meta, id, type) {
  const card = document.createElement('div');
  card.className = className;
  card.innerHTML = `<div class="card-icon">${icon}</div><div class="card-name">${escHtml(title)}</div><div class="card-meta">${meta}</div>`;
  
  let lpTimer = null;
  let isLongPress = false;

  card.oncontextmenu = (e) => { e.preventDefault(); return false; };
  
  card.addEventListener('touchstart', (e) => {
    isLongPress = false;
    card.style.transform = 'scale(0.96)';
    lpTimer = setTimeout(() => {
      isLongPress = true;
      mgmtId = id;
      haptic('heavy');
      card.style.transform = 'none';
      closeModals();
      document.getElementById('nq-overlay').classList.add('active');
      document.getElementById('modal-mgmt').classList.add('visible');
    }, 600);
  }, { passive: true });

  const cancelTouch = () => { clearTimeout(lpTimer); card.style.transform = 'none'; };
  card.addEventListener('touchend', cancelTouch);
  card.addEventListener('touchmove', cancelTouch);
  card.addEventListener('touchcancel', cancelTouch);

  card.onclick = (e) => {
    if (isLongPress) { e.preventDefault(); return; }
    if (type === 'folder') {
      breadcrumbPath.push({ id, name: title }); currentFolderId = id; renderSoup();
    } else {
      openLighthouse(id);
    }
  };
  return card;
}

/* --- 8. MANAGEMENT & MOVE LOGIC --- */
document.getElementById('btn-mgmt-rename').onclick = async () => {
  const store = mgmtId.startsWith('f_') ? 'folders' : 'discourses';
  const item = await dbCall(store, 'get', mgmtId);
  document.getElementById('input-rename').value = store === 'folders' ? item.name : item.title;
  closeModals();
  document.getElementById('nq-overlay').classList.add('active');
  document.getElementById('modal-rename').classList.add('visible');
};

document.getElementById('btn-confirm-rename').onclick = async () => {
  const newName = document.getElementById('input-rename').value.trim();
  if (!newName) return;
  const store = mgmtId.startsWith('f_') ? 'folders' : 'discourses';
  const item = await dbCall(store, 'get', mgmtId);
  if (store === 'folders') item.name = newName; else item.title = newName;
  await dbCall(store, 'put', item);
  closeModals(); renderSoup();
};

document.getElementById('btn-mgmt-move').onclick = async () => {
  const sel = document.getElementById('move-parent-select');
  sel.innerHTML = '<option value="">◈ Root</option>';
  const folders = await dbCall('folders', 'getAll') || [];
  
  folders.filter(f => f.id !== mgmtId).forEach(f => {
    const opt = document.createElement('option');
    opt.value = f.id; opt.textContent = f.name;
    sel.appendChild(opt);
  });
  closeModals();
  document.getElementById('nq-overlay').classList.add('active');
  document.getElementById('modal-move').classList.add('visible');
};

document.getElementById('btn-confirm-move').onclick = async () => {
  const newParent = document.getElementById('move-parent-select').value || null;
  const store = mgmtId.startsWith('f_') ? 'folders' : 'discourses';
  const item = await dbCall(store, 'get', mgmtId);
  if (store === 'folders') item.parent_id = newParent; else item.folder_id = newParent;
  await dbCall(store, 'put', item);
  closeModals(); renderSoup(); showToast("Moved ▤");
};

document.getElementById('btn-mgmt-delete').onclick = async () => {
  const store = mgmtId.startsWith('f_') ? 'folders' : 'discourses';
  if (store === 'folders') {
    if(confirm("Purge folder permanently?")) await dbCall('folders', 'delete', mgmtId);
  } else {
    const item = await dbCall('discourses', 'get', mgmtId);
    item.isDeleted = true; item.deleted_at = Date.now();
    await dbCall('discourses', 'put', item);
    showToast("Sent to Void ◌");
  }
  closeModals(); renderSoup();
};

/* --- 9. THE VOID ENGINE --- */
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
    el.className = 'soup-item';
    el.innerHTML = `
      <div class="soup-item-icon" style="color:#ff6060;">✕</div>
      <div class="soup-item-info">
        <div class="soup-item-name" style="text-decoration:line-through; opacity:0.6;">${escHtml(d.title || 'Untitled')}</div>
        <div class="soup-item-meta">Deleted ${new Date(d.deleted_at).toLocaleDateString()}</div>
      </div>
      <button style="background:var(--surface2); color:var(--accent); border:1px solid var(--border); padding:6px 12px; border-radius:6px; font-weight:bold; margin-right:8px;" onclick="restoreItem('${d.id}')">↩</button>
      <button style="background:var(--surface2); color:#ff6060; border:1px solid var(--danger); padding:6px 12px; border-radius:6px; font-weight:bold;" onclick="purgeItem('${d.id}')">✕</button>
    `;
    surface.appendChild(el);
  });
}

document.getElementById('btn-close-void').onclick = () => { switchView('view-soup'); renderSoup(); };
window.restoreItem = async (id) => { const item = await dbCall('discourses', 'get', id); item.isDeleted = false; await dbCall('discourses', 'put', item); openVoid(); };
window.purgeItem = async (id) => { if(confirm("Erase completely?")) { await dbCall('discourses', 'delete', id); openVoid(); } };

/* --- 10. SPARKS ENGINE (QUICK CAPTURE) --- */
document.getElementById('btn-fab-spark').onclick = async () => {
  const fSelect = document.getElementById('spark-folder');
  fSelect.innerHTML = '<option value="">◈ Current Folder</option><option value="__new__">+ New Folder...</option>';
  
  const folders = await dbCall('folders', 'getAll') || [];
  folders.forEach(f => {
    if(f.id !== currentFolderId) {
      const opt = document.createElement('option'); opt.value = f.id; opt.textContent = f.name; fSelect.appendChild(opt);
    }
  });

  document.getElementById('spark-title').value = '';
  document.getElementById('spark-title').dataset.edited = 'false';
  document.getElementById('spark-body').value = '';
  document.getElementById('spark-new-folder-input').style.display = 'none';
  
  closeModals();
  document.getElementById('nq-overlay').classList.add('active');
  document.getElementById('modal-spark').classList.add('visible');
  setTimeout(() => document.getElementById('spark-body').focus(), 100);
};

document.getElementById('spark-folder').onchange = (e) => {
  document.getElementById('spark-new-folder-input').style.display = (e.target.value === '__new__') ? 'block' : 'none';
};

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

  await dbCall('discourses', 'put', {
    id: 's_' + Date.now(),
    title: document.getElementById('spark-title').value || "Quick Spark",
    raw_text: text,
    folder_id: targetFolder,
    item_type: 'spark',
    created_at: Date.now(),
    updated_at: Date.now()
  });

  closeModals(); renderSoup(); showToast("Spark Captured ⚡"); haptic('heavy');
};

/* --- 11. LIGHTHOUSE EDITOR & MATH FORMATTING --- */
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
  renderSoup();
};

/* The Precise Cursor Math */
document.querySelectorAll('.fmt-btn').forEach(btn => {
  btn.onclick = () => {
    const ta = document.getElementById('lh-text');
    const start = ta.selectionStart, end = ta.selectionEnd;
    const val = ta.value, selected = val.slice(start, end);
    let res = '', newPos = 0;

    if (btn.dataset.wrap) {
      const tag = btn.dataset.wrap;
      res = tag + selected + tag;
      newPos = selected ? start + res.length : start + tag.length;
    } else if (btn.dataset.block) {
      res = btn.dataset.block + selected + btn.dataset.end;
      newPos = selected ? start + res.length : start + btn.dataset.block.length;
    } else if (btn.dataset.line) {
      const tag = btn.dataset.line;
      const lineStart = val.lastIndexOf('\n', start - 1) + 1;
      const prefix = val.slice(lineStart, start);
      if (prefix.startsWith(tag)) {
        ta.value = val.slice(0, lineStart) + prefix.slice(tag.length) + val.slice(start);
        newPos = start - tag.length;
        ta.focus(); ta.setSelectionRange(newPos, newPos);
        return;
      }
      res = tag + selected;
      newPos = start + tag.length + selected.length;
    } else if (btn.dataset.insert) {
      res = btn.dataset.insert;
      newPos = start + res.length;
    }

    ta.value = val.slice(0, start) + res + val.slice(end);
    ta.focus();
    ta.setSelectionRange(newPos, newPos);
  };
});

function renderMarkdown(raw) {
  if (!raw) return '<span style="opacity:0.5;font-style:italic;">Silence.</span>';
  return raw.replace(/```([\s\S]*?)```/g, '<pre style="background:var(--surface2);padding:10px;border-radius:8px;overflow-x:auto;">$1</pre>')
            .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.+?)\*/g, '<em>$1</em>')
            .replace(/^# (.+)$/gm, '<h1 style="color:var(--accent);">$1</h1>')
            .replace(/^## (.+)$/gm, '<h2 style="color:var(--accent);">$1</h2>')
            .replace(/^> (.+)$/gm, '<blockquote style="border-left:2px solid var(--accent); padding-left:10px; color:var(--muted);">$1</blockquote>')
            .replace(/\n/g, '<br>');
}

/* --- XII. MODAL LOGIC & SEARCH --- */
function closeModals() {
  document.getElementById('nq-overlay').classList.remove('active');
  document.querySelectorAll('.modal').forEach(m => m.classList.remove('visible'));
  document.getElementById('fab-main').classList.remove('open');
  document.getElementById('fab-menu').classList.remove('open');
}

const openModal = (id) => {
  closeModals();
  document.getElementById('nq-overlay').classList.add('active');
  document.getElementById(id).classList.add('visible');
};

document.getElementById('fab-main').onclick = () => {
  document.getElementById('fab-main').classList.toggle('open');
  document.getElementById('fab-menu').classList.toggle('open');
};
document.getElementById('btn-fab-folder').onclick = () => { openModal('modal-folder'); document.getElementById('input-folder-name').focus(); };
document.getElementById('btn-confirm-folder').onclick = async () => {
  const name = document.getElementById('input-folder-name').value.trim();
  if (!name) return;
  await dbCall('folders', 'put', { id: 'f_' + Date.now(), name, parent_id: currentFolderId, created_at: Date.now() });
  document.getElementById('input-folder-name').value = '';
  closeModals(); renderSoup();
};

document.getElementById('input-search').oninput = async (e) => {
  const q = e.target.value.toLowerCase();
  const results = document.getElementById('search-results');
  if (!q) { results.innerHTML = ''; return; }
  const folders = (await dbCall('folders', 'getAll') || []).filter(f => f.name.toLowerCase().includes(q));
  const discourses = (await dbCall('discourses', 'getAll') || []).filter(d => !d.isDeleted && ((d.title || '').toLowerCase().includes(q) || (d.raw_text || '').toLowerCase().includes(q)));
  
  results.innerHTML = [
    ...folders.map(f => `<div class="soup-item" style="border:1px solid var(--border);border-radius:8px;margin-bottom:8px;" onclick="enterFolder('${f.id}');closeModals()"><div class="soup-item-icon">◈</div><div class="soup-item-name">${escHtml(f.name)}</div></div>`),
    ...discourses.map(d => `<div class="soup-item" style="border:1px solid var(--border);border-radius:8px;margin-bottom:8px;" onclick="openLighthouse('${d.id}');closeModals()"><div class="soup-item-icon">${d.item_type==='spark'?'⚡':'✦'}</div><div class="soup-item-name">${escHtml(d.title || 'Untitled')}</div></div>`)
  ].join('');
};

/* --- XIII. AKASHIC SYNC --- */
async function syncAkashic() {
  showToast("Akashic Sync Initiated...");
  try {
    const payload = {
      version: "NakedQuantum", exported_at: new Date().toISOString(),
      folders: await dbCall('folders', 'getAll'),
      discourses: await dbCall('discourses', 'getAll')
    };
    const res = await fetch(`${AKASHIC_URL}/backup`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: nqUserId, data: JSON.stringify(payload) })
    });
    if (res.ok) setTimeout(() => showToast("Akashic Synced ◈"), 800);
    else throw new Error("Sync Failed");
  } catch (e) {
    setTimeout(() => showToast("Abyss Offline"), 800);
  }
}

/* --- XIV. BOOT SEQUENCE --- */
window.onload = () => {
  initDB().then(() => {
    updateHeaderActions();
    switchView('view-soup');
    renderSoup();
  });
};