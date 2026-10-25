// CoraBooks admin dashboard (/admin). Not linked from the site; every action needs the admin key,
// which the server checks on each request.
/* global CB, pdfjsLib */
let files = [];
let adminKey = null;

document.addEventListener('DOMContentLoaded', function () {
  adminKey = localStorage.getItem('ADMIN_KEY') || null;
  const adminSearch = document.getElementById('adminSearch');
  if (adminSearch) adminSearch.addEventListener('input', () => renderAdminList());
  document.getElementById('adminKeyInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') adminLogin(); });
  initAdmin();
});

async function loadFiles() {
  const response = await fetch('/api/files');
  files = response.ok ? await response.json() : [];
  files.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
  const count = document.getElementById('bookCount');
  if (count) count.textContent = String(files.length);
}

function searchText(file) {
  const m = file.meta || {};
  return [CB.bookTitle(file), CB.bookAuthor(file), file.filename, file.originalName, m.publisher, (m.subjects || []).join(' '), m.year]
    .filter(Boolean).join(' ').toLowerCase();
}

function showNotification(type, title, message) {
  const container = document.getElementById('notificationContainer');
  if (!container) return;
  const n = document.createElement('div');
  n.className = `notification ${type}`;
  const icons = { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️' };
  n.innerHTML = `<div class="notification-icon">${icons[type] || icons.info}</div>
    <div class="notification-content"><div class="notification-title">${CB.escapeHtml(title)}</div><div class="notification-message">${CB.escapeHtml(message)}</div></div>
    <button class="notification-close" onclick="removeNotification(this.parentElement)">×</button>`;
  container.appendChild(n);
  setTimeout(() => removeNotification(n), 5000);
}
function removeNotification(n) {
  if (!n || !n.parentElement) return;
  n.classList.add('removing');
  setTimeout(() => { if (n.parentElement) n.parentElement.removeChild(n); }, 300);
}

// ===== Admin =====
async function initAdmin() {
  const status = document.getElementById('adminStatus');
  const tools = document.getElementById('adminTools');
  if (!status) return;
  if (adminKey) {
    const ok = await verifyAdminKey(adminKey);
    status.textContent = ok ? 'Unlocked' : 'Locked (invalid key)';
    tools.classList.toggle('hidden', !ok);
    if (ok) await loadAdminFiles();
  } else {
    status.textContent = 'Locked';
    tools.classList.add('hidden');
  }
  document.getElementById('adminLoginBtn').onclick = adminLogin;
  document.getElementById('adminLogoutBtn').onclick = adminLogout;
  document.getElementById('adminCleanupBtn').onclick = adminCleanup;
  document.getElementById('adminEnrichBtn').onclick = adminEnrichAll;
  document.getElementById('adminCorsBtn').onclick = adminSetCors;
}

// Applies the bucket CORS rule that presigned S3 uploads need. Reports what B2 says.
async function adminSetCors() {
  if (!adminKey) return;
  const btn = document.getElementById('adminCorsBtn');
  const out = document.getElementById('adminCleanupResult');
  btn.disabled = true; out.textContent = 'Aplicando regla CORS en el bucket…';
  try {
    const res = await fetch('/api/admin/b2-cors', { method: 'POST', headers: { 'x-admin-key': adminKey } });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      out.textContent = `No se pudo: ${data.message || res.status}. ${data.hint || ''}`;
      showNotification('error', 'CORS no aplicado', data.message || `HTTP ${res.status}`);
      return;
    }
    const rule = (data.corsRules || [])[0] || {};
    out.textContent = `CORS listo en ${data.s3ApiUrl || 'B2'}: operaciones ${(rule.allowedOperations || []).join(', ')} para ${(rule.allowedOrigins || []).join(', ')}. Tarda ~1 min en aplicar.`;
    showNotification('success', 'CORS aplicado', 'Las subidas con URL firmada ya pueden funcionar');
  } catch (e) {
    out.textContent = 'Error: ' + e.message;
  } finally { btn.disabled = false; }
}

async function adminLogin() {
  const key = (document.getElementById('adminKeyInput').value || '').trim();
  const status = document.getElementById('adminStatus');
  if (!key) { status.textContent = 'Enter a key'; return; }
  const ok = await verifyAdminKey(key);
  if (ok) {
    adminKey = key; localStorage.setItem('ADMIN_KEY', key);
    status.textContent = 'Unlocked';
    document.getElementById('adminTools').classList.remove('hidden');
    await loadAdminFiles();
  } else {
    status.textContent = 'Invalid key';
    document.getElementById('adminTools').classList.add('hidden');
  }
}

function adminLogout() {
  adminKey = null; localStorage.removeItem('ADMIN_KEY');
  document.getElementById('adminStatus').textContent = 'Locked';
  document.getElementById('adminTools').classList.add('hidden');
  document.getElementById('adminFilesGrid').innerHTML = '';
}

async function verifyAdminKey(key) {
  try {
    const res = await fetch('/api/admin/status', { headers: { 'x-admin-key': key } });
    if (!res.ok) return false;
    return !!(await res.json()).ok;
  } catch (e) { return false; }
}

async function adminCleanup() {
  if (!adminKey) return;
  const btn = document.getElementById('adminCleanupBtn');
  const resBox = document.getElementById('adminCleanupResult');
  const hours = parseInt(document.getElementById('cleanupThreshold').value || '6', 10);
  const body = hours > 0 ? { thresholdMs: hours * 3600 * 1000 } : {};
  btn.disabled = true; resBox.textContent = 'Running cleanup…';
  try {
    const res = await fetch('/api/admin/cleanup-pending', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || 'Unknown error');
    resBox.textContent = `Scanned ${data.scanned ?? 0} · kept ${data.kept ?? 0} · removed ${data.removed ?? 0} · deleted from B2 ${data.deletedFromB2 ?? 0}`;
    await loadAdminFiles();
  } catch (e) {
    showNotification('error', 'Cleanup failed', e.message);
    resBox.textContent = 'Cleanup failed';
  } finally { btn.disabled = false; }
}

async function loadAdminFiles() {
  await loadFiles();
  renderAdminList();
}

function renderAdminList() {
  const grid = document.getElementById('adminFilesGrid');
  if (!grid) return;
  const q = (document.getElementById('adminSearch')?.value || '').trim().toLowerCase();
  const shown = q ? files.filter(f => searchText(f).includes(q)) : files;
  grid.innerHTML = shown.map(f => {
    const m = f.meta || {};
    const has = !!(m.title || m.author);
    return `<div class="arow" id="arow-${f.id}">
      <img src="${f.coverB2Name ? `/api/cover/${f.id}` : ''}" alt="" onerror="this.style.visibility='hidden'" />
      <div>
        <div class="t">${CB.escapeHtml(CB.bookTitle(f))}</div>
        <div class="s">${CB.escapeHtml(CB.bookAuthor(f) || 'sin autor')} · ${CB.formatSize(f.size)} · ${CB.formatDate(f.uploadedAt)} · ${has ? '<span class="ok">datos ✓</span>' : '<span class="no">sin datos</span>'}${m.pages ? ` · ${m.pages} págs` : ''}</div>
        <div class="s" style="opacity:.7">archivo: ${CB.escapeHtml(f.filename)}</div>
      </div>
      <div class="acts">
        <button class="btn btn-sm" onclick="adminEdit('${f.id}')">Editar</button>
        <button class="btn btn-sm btn-danger" onclick="adminDelete('${f.id}')">Borrar</button>
      </div>
    </div>`;
  }).join('') || '<div class="muted">Nada que mostrar.</div>';
}

function adminEdit(id) {
  const f = files.find(x => x.id === id);
  const row = document.getElementById('arow-' + id);
  if (!f || !row) return;
  if (row.querySelector('.aeditor')) { row.querySelector('.aeditor').remove(); row.classList.remove('editing'); return; }
  const m = f.meta || {};
  const parsed = CB.parseFilename(f.filename || '');
  const v = (x) => CB.escapeHtml(x == null ? '' : x);
  const ed = document.createElement('div');
  ed.className = 'aeditor';
  ed.innerHTML = `
    <div class="form-grid">
      <div class="field"><label>Título</label><input data-k="title" value="${v(m.title || parsed.title)}" maxlength="200" /></div>
      <div class="field"><label>Autor</label><input data-k="author" value="${v(m.author || parsed.author)}" maxlength="200" /></div>
      <div class="field"><label>Edición</label><input data-k="edition" value="${v(m.edition || parsed.edition)}" maxlength="60" /></div>
      <div class="field"><label>Año</label><input data-k="year" type="number" value="${v(m.year || parsed.year || '')}" /></div>
      <div class="field"><label>Editorial</label><input data-k="publisher" value="${v(m.publisher)}" maxlength="120" /></div>
      <div class="field"><label>Páginas</label><input data-k="pages" type="number" value="${v(m.pages || '')}" /></div>
      <div class="field"><label>Idioma (en, es…)</label><input data-k="language" value="${v(m.language)}" maxlength="20" /></div>
      <div class="field"><label>ISBN (separados por coma)</label><input data-k="isbn" value="${v((m.isbn || parsed.isbn || []).join(', '))}" /></div>
      <div class="field full"><label>Materias (separadas por coma)</label><input data-k="subjects" value="${v((m.subjects || []).join(', '))}" /></div>
      <div class="field full"><label>Sinopsis</label><textarea data-k="description">${v(m.description)}</textarea></div>
    </div>
    <div class="form-actions">
      <button class="btn btn-primary btn-sm" type="button" data-act="save">Guardar</button>
      <button class="btn btn-sm" type="button" data-act="lookup">Buscar datos</button>
      <button class="btn btn-sm btn-ghost" type="button" data-act="cancel">Cancelar</button>
      <span class="muted" data-role="status" style="align-self:center"></span>
    </div>`;
  row.appendChild(ed);
  row.classList.add('editing');
  const status = ed.querySelector('[data-role=status]');
  const get = (k) => ed.querySelector(`[data-k=${k}]`).value.trim();
  const set = (k, val) => { if (val !== undefined && val !== null && val !== '') ed.querySelector(`[data-k=${k}]`).value = Array.isArray(val) ? val.join(', ') : val; };
  let extra = { source: m.source, sourceId: m.sourceId, coverUrl: m.coverUrl };

  ed.querySelector('[data-act=cancel]').onclick = () => { ed.remove(); row.classList.remove('editing'); };
  ed.querySelector('[data-act=lookup]').onclick = async () => {
    status.textContent = 'Buscando…';
    try {
      const found = await enrichOne(f, { title: get('title'), author: get('author'), isbn: get('isbn').split(',').map(s => s.trim()).filter(Boolean) });
      if (!found) { status.textContent = 'No se encontró nada.'; return; }
      ['author', 'year', 'publisher', 'pages', 'language'].forEach(k => { if (!get(k)) set(k, found[k]); });
      if (!get('isbn')) set('isbn', found.isbn);
      if (!get('subjects')) set('subjects', found.subjects);
      if (!get('description')) set('description', found.description);
      extra = { source: found.source, sourceId: found.sourceId, coverUrl: found.coverUrl };
      status.textContent = `Encontrado en ${found.source}: ${found.title}`;
    } catch (e) { status.textContent = 'Error buscando: ' + e.message; }
  };
  ed.querySelector('[data-act=save]').onclick = async () => {
    status.textContent = 'Guardando…';
    const meta = {
      title: get('title'), author: get('author'), edition: get('edition'), year: get('year') || null, publisher: get('publisher'),
      pages: get('pages') || null, language: get('language'), isbn: get('isbn').split(',').map(s => s.trim()).filter(Boolean),
      subjects: get('subjects').split(',').map(s => s.trim()).filter(Boolean), description: get('description'), ...extra,
    };
    try {
      await adminSaveMeta(f.id, meta);
      status.textContent = 'Guardado ✓';
      await loadAdminFiles();
    } catch (e) { status.textContent = 'Error: ' + e.message; }
  };
}

async function adminSaveMeta(id, meta) {
  const res = await fetch(`/api/admin/books/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey }, body: JSON.stringify({ meta }) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) throw new Error(data.message || `HTTP ${res.status}`);
  return data.file;
}

// Looks a book up (PDF info for pages + catalog for the rest). Returns merged suggestion or null.
async function enrichOne(f, hint) {
  const parsed = CB.parseFilename(f.filename || '');
  const title = (hint && hint.title) || parsed.title;
  const author = (hint && hint.author) || parsed.author;
  const isbn = (hint && hint.isbn && hint.isbn.length) ? hint.isbn : parsed.isbn;
  let pdfInfo = null;
  if (CB.isPdf(f)) {
    try { pdfInfo = await CB.readPdfInfo(`/api/download/${f.id}?inline=1`); } catch (e) { /* optional */ }
  }
  let found = null;
  try { found = await CB.lookupBook({ title, author, isbn }); } catch (e) { /* optional */ }
  if (!found && !pdfInfo) return null;
  return {
    title: (found && found.title) || title,
    author: (found && found.author) || author || (pdfInfo && pdfInfo.author) || '',
    year: (found && found.year) || parsed.year || null,
    publisher: found ? found.publisher : '',
    pages: (pdfInfo && pdfInfo.pages) || (found && found.pages) || null,
    language: found ? found.language : '',
    isbn: isbn.length ? isbn : (found ? found.isbn : []),
    subjects: found ? found.subjects : [],
    description: found ? found.description : '',
    source: found ? found.source : '', sourceId: found ? found.sourceId : '', coverUrl: found ? found.coverUrl : '',
  };
}

// Fills metadata for every book that has none, saving each result. The admin can fix any mistakes afterwards.
async function adminEnrichAll() {
  if (!adminKey) return;
  const btn = document.getElementById('adminEnrichBtn');
  const out = document.getElementById('adminCleanupResult');
  const todo = files.filter(f => !(f.meta && (f.meta.title || f.meta.author)));
  if (!todo.length) { out.textContent = 'Todos los libros ya tienen datos.'; return; }
  if (!confirm(`Buscar datos para ${todo.length} libros sin ficha? Tarda ~1-2 segundos por libro.`)) return;
  btn.disabled = true;
  let done = 0, hits = 0;
  for (const f of todo) {
    done++;
    out.textContent = `Procesando ${done}/${todo.length}: ${CB.bookTitle(f)}`;
    try {
      const parsed = CB.parseFilename(f.filename || '');
      const found = await enrichOne(f);
      const meta = found || { title: parsed.title, author: parsed.author, edition: parsed.edition, year: parsed.year, isbn: parsed.isbn };
      if (!meta.edition && parsed.edition) meta.edition = parsed.edition;
      // Keep the cleaned filename title unless the catalog title is clearly the same book
      if (found && !sameBook(parsed.title, found.title)) meta.title = parsed.title;
      await adminSaveMeta(f.id, meta);
      if (found) hits++;
    } catch (e) { console.warn('enrich failed for', f.id, e); }
    await new Promise(r => setTimeout(r, 400));
  }
  out.textContent = `Listo: ${done} procesados, ${hits} encontrados en el catálogo. Revisa los títulos con "Editar".`;
  btn.disabled = false;
  await loadAdminFiles();
}

// Cheap similarity check so a wrong catalog hit does not rename a book
function sameBook(a, b) {
  const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9áéíóúñ ]/g, ' ').split(/\s+/).filter(w => w.length > 2);
  const A = new Set(norm(a)), B = new Set(norm(b));
  if (!A.size || !B.size) return false;
  let common = 0; A.forEach(w => { if (B.has(w)) common++; });
  return common / Math.min(A.size, B.size) >= 0.6;
}

async function adminDelete(id) {
  if (!adminKey) return;
  const f = files.find(x => x.id === id);
  if (!confirm(`Borrar "${f ? CB.bookTitle(f) : id}"? Esto no se puede deshacer.`)) return;
  try {
    const res = await fetch(`/api/delete/${id}`, { method: 'DELETE', headers: { 'x-admin-key': adminKey } });
    if (!res.ok) { showNotification('error', 'No se pudo borrar', await res.text()); return; }
    showNotification('success', 'Borrado', 'El libro fue eliminado');
    await loadAdminFiles();
  } catch (e) { showNotification('error', 'No se pudo borrar', e.message); }
}
