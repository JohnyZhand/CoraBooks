// CoraBooks home page: shelf, search, upload with metadata. (Admin lives in admin.js)
/* global CB, JSZip, pdfjsLib */
let files = [];
let pendingMeta = null;   // metadata gathered for the file being uploaded
let pendingCover = null;  // first-page JPEG rendered when the file was chosen (PDFs)

// PDF.js and JSZip (~420 KB) are only needed on the upload screen, so they load on demand.
const LIB_PDFJS = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js';
const LIB_PDFJS_WORKER = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
const LIB_JSZIP = 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js';
const libPromises = {};
function loadScript(src) {
  if (!libPromises[src]) {
    libPromises[src] = new Promise((resolve, reject) => {
      const el = document.createElement('script');
      el.src = src; el.async = true;
      el.onload = resolve; el.onerror = () => { delete libPromises[src]; reject(new Error('No se pudo cargar ' + src)); };
      document.head.appendChild(el);
    });
  }
  return libPromises[src];
}
async function ensureUploadLibs() {
  await Promise.all([loadScript(LIB_PDFJS), loadScript(LIB_JSZIP)]);
  if (window.pdfjsLib && !pdfjsLib.GlobalWorkerOptions.workerSrc) pdfjsLib.GlobalWorkerOptions.workerSrc = LIB_PDFJS_WORKER;
}

document.addEventListener('DOMContentLoaded', function () {
  loadFiles();
  setupEventListeners();
  // Deep links like /#upload or /#about open that section once, then the hash is removed
  // from the address bar so a refresh always comes back to the library.
  const hash = (location.hash || '').replace('#', '');
  if (['upload', 'recursos', 'about'].includes(hash)) {
    showSection(hash);
    history.replaceState(null, '', location.pathname + location.search);
  }
});

function setupEventListeners() {
  const uploadForm = document.getElementById('uploadForm');
  if (uploadForm) uploadForm.addEventListener('submit', handleFileUpload);
  const fileInput = document.getElementById('file');
  if (fileInput) fileInput.addEventListener('change', onFileChosen);
  const resetBtn = document.getElementById('resetBtn');
  if (resetBtn) resetBtn.addEventListener('click', () => { pendingMeta = null; pendingCover = null; hideMetaPreview(); });
  const search = document.getElementById('searchInput');
  if (search) search.addEventListener('input', () => renderShelf());
}

// ----- Navigation -----
function showSection(sectionName) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.section === sectionName));
  const target = document.getElementById(sectionName + '-section');
  if (target) target.classList.add('active');
  if (sectionName === 'browse') loadFiles();
  if (sectionName === 'upload') ensureUploadLibs().catch(() => {});
  // ASCII cat: hidden on the upload screen, visible everywhere else (as before)
  const asciiCat = document.getElementById('asciiCat');
  if (asciiCat) asciiCat.style.display = sectionName === 'upload' ? 'none' : '';
  window.scrollTo({ top: 0, behavior: 'auto' });
}

// ----- Shelf -----
async function loadFiles() {
  const loading = document.getElementById('loading');
  if (loading) loading.style.display = 'flex';
  try {
    const response = await fetch('/api/files');
    if (!response.ok) throw new Error('bad status');
    files = await response.json();
    files.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
    const count = document.getElementById('bookCount');
    if (count) count.textContent = String(files.length);
    renderShelf();
  } catch (error) {
    console.error('Error loading files:', error);
    displayError('No se pudieron cargar los libros. Intenta de nuevo en un rato.');
  } finally {
    if (loading) loading.style.display = 'none';
  }
}

function searchText(file) {
  const m = file.meta || {};
  return [CB.bookTitle(file), CB.bookAuthor(file), file.filename, file.originalName, m.publisher, (m.subjects || []).join(' '), m.year]
    .filter(Boolean).join(' ').toLowerCase();
}

function renderShelf() {
  const list = document.getElementById('files-list');
  if (!list) return;
  const q = (document.getElementById('searchInput')?.value || '').trim().toLowerCase();
  const terms = q.split(/\s+/).filter(Boolean);
  const shown = terms.length ? files.filter(f => { const t = searchText(f); return terms.every(term => t.includes(term)); }) : files;

  const count = document.getElementById('resultCount');
  if (count) count.textContent = terms.length ? `${shown.length} / ${files.length} libros` : `${files.length} libros`;

  if (!shown.length) {
    list.innerHTML = `<div class="empty">${files.length ? 'Nada con ese nombre. Prueba otra palabra.' : 'Todavía no hay libros. Sube el primero.'}</div>`;
    return;
  }
  list.innerHTML = shown.map(file => {
    const title = CB.bookTitle(file), author = CB.bookAuthor(file), fmt = CB.bookFormat(file);
    const coverSrc = CB.coverUrl(file) || (file.meta && file.meta.coverUrl) || '';
    const i = shown.indexOf(file);
    return `
      <a class="tile" href="/book?id=${encodeURIComponent(file.id)}" title="${CB.escapeHtml(title)}">
        <div class="tile-cover${coverSrc ? '' : ' nocover'}">
          <img src="${CB.escapeHtml(coverSrc)}" alt="" width="480" height="720" loading="${i < 8 ? 'eager' : 'lazy'}"${i < 2 ? ' fetchpriority="high"' : ''} onerror="this.parentElement.classList.add('nocover')" />
          <div class="fallback">${fmt}</div>
          <span class="tile-fmt">${fmt}</span>
        </div>
        <div class="tile-title">${CB.escapeHtml(title)}</div>
        ${author ? `<div class="tile-author">${CB.escapeHtml(author)}</div>` : ''}
      </a>`;
  }).join('');
}

function displayError(message) {
  const list = document.getElementById('files-list');
  if (list) list.innerHTML = `<div class="empty" style="color:var(--err)">${CB.escapeHtml(message)}</div>`;
}

// ----- Upload: metadata gathering -----
async function onFileChosen(e) {
  const file = e.target.files[0];
  if (!file) return;
  pendingMeta = null; pendingCover = null;
  const parsed = CB.parseFilename(file.name);
  setIfEmpty('fileName', parsed.title);
  setIfEmpty('author', parsed.author);
  setIfEmpty('edition', parsed.edition);
  setIfEmpty('year', parsed.year);

  showMetaPreview('Leyendo el archivo…');
  let pdfInfo = null;
  if (/\.pdf$/i.test(file.name)) {
    try {
      await ensureUploadLibs();
      pdfInfo = await CB.readPdfInfo(file, { thumbnail: 720 }); // one read: metadata, page count and cover
      if (pdfInfo && pdfInfo.thumbnail) pendingCover = pdfInfo.thumbnail; // { blob, ext }
    } catch (err) { console.warn('pdf info failed', err); }
    if (pdfInfo) {
      if (pdfInfo.title && isSparse(parsed.title)) setValue('fileName', pdfInfo.title);
      if (pdfInfo.author) setIfEmpty('author', pdfInfo.author);
    }
  }

  showMetaPreview('Buscando el libro en el catálogo…');
  const title = getValue('fileName'), author = getValue('author');
  let found = null;
  try { found = await CB.lookupBook({ title, author, isbn: parsed.isbn }); } catch (err) { console.warn('lookup failed', err); }

  pendingMeta = {
    title, author,
    edition: getValue('edition'), year: getValue('year') || null,
    pages: pdfInfo ? pdfInfo.pages : null,
    isbn: parsed.isbn,
  };
  if (found) {
    if (!pendingMeta.author && found.author) { pendingMeta.author = found.author; setValue('author', found.author); }
    if (!pendingMeta.year && found.year) { pendingMeta.year = found.year; setValue('year', found.year); }
    Object.assign(pendingMeta, {
      publisher: found.publisher, language: found.language,
      isbn: pendingMeta.isbn.length ? pendingMeta.isbn : found.isbn,
      description: found.description, subjects: found.subjects,
      source: found.source, sourceId: found.sourceId, coverUrl: found.coverUrl,
    });
    const bits = [found.author && `autor <b>${CB.escapeHtml(found.author)}</b>`, found.year && `año <b>${found.year}</b>`,
      found.publisher && `editorial <b>${CB.escapeHtml(found.publisher)}</b>`, pendingMeta.pages && `<b>${pendingMeta.pages}</b> páginas`,
      found.description && 'sinopsis'].filter(Boolean).join(' · ');
    showMetaPreview(`Encontrado en ${found.source} como <b>${CB.escapeHtml(found.title)}</b>: ${bits}. Si no es el libro correcto, corrige el título y el autor arriba.`, true);
  } else {
    showMetaPreview(pendingMeta.pages ? `No apareció en el catálogo. Se guardará con <b>${pendingMeta.pages}</b> páginas y los datos de arriba.` : 'No apareció en el catálogo. Se guardará con los datos de arriba.');
  }
}

function isSparse(t) { return !t || t.split(/\s+/).length < 2; }
function getValue(id) { return (document.getElementById(id)?.value || '').trim(); }
function setValue(id, v) { const el = document.getElementById(id); if (el && v !== undefined && v !== null && v !== '') el.value = v; }
function setIfEmpty(id, v) { const el = document.getElementById(id); if (el && !el.value && v) el.value = v; }
function showMetaPreview(html, ok) { const box = document.getElementById('metaPreview'); if (!box) return; box.innerHTML = html; box.classList.remove('hidden'); box.classList.toggle('ok', !!ok); }
function hideMetaPreview() { const box = document.getElementById('metaPreview'); if (box) box.classList.add('hidden'); }

// ----- Upload: transfer (unchanged flow: URL from /api/upload, direct PUT to B2, cover, commit) -----
async function handleFileUpload(e) {
  e.preventDefault();
  const fileInput = document.getElementById('file');
  const fileName = getValue('fileName');
  const description = getValue('description');
  const file = fileInput.files[0];

  if (!file) { showNotification('error', 'Falta el archivo', 'Escoge un archivo para subir'); return; }
  const allowed = ['pdf', 'epub', 'mobi'];
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  if (!allowed.includes(ext)) { showNotification('error', 'Formato no permitido', 'Solo PDF, EPUB y MOBI.'); return; }
  const maxSize = 2 * 1024 * 1024 * 1024;
  if (file.size > maxSize) { showNotification('error', 'Archivo muy grande', `Pesa ${CB.formatSize(file.size)} y el máximo es 2 GB.`); return; }

  // Final metadata = what the form says now, plus catalog extras gathered earlier
  const meta = { ...(pendingMeta || {}), title: fileName, author: getValue('author'), edition: getValue('edition'), year: getValue('year') || null };

  const progressContainer = document.getElementById('uploadProgress');
  const progressFill = progressContainer.querySelector('.progress-fill');
  const progressPercentage = progressContainer.querySelector('.progress-percentage');
  const progressLabel = progressContainer.querySelector('.progress-label');
  progressContainer.querySelector('.file-name').textContent = file.name;
  progressContainer.querySelector('.file-size').textContent = CB.formatSize(file.size);
  progressContainer.classList.remove('hidden');
  progressLabel.textContent = 'Pidiendo URL de subida…';
  progressPercentage.textContent = '0%';
  progressFill.style.width = '0%';
  const submitBtn = document.getElementById('uploadBtn');
  const originalText = submitBtn.textContent;
  submitBtn.textContent = 'Subiendo…';
  submitBtn.disabled = true;

  try {
    const uploadResponse = await fetch('/api/upload', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename: fileName || file.name, originalFilename: file.name, description, meta, contentType: file.type || 'application/octet-stream', size: file.size }),
    });
    if (!uploadResponse.ok) { const err = await uploadResponse.json().catch(() => ({})); throw new Error(err.message || 'No se pudo pedir la URL de subida'); }
    const { uploadUrl, fileName: b2FileName, fileId } = await uploadResponse.json();
    progressFill.style.width = '10%'; progressPercentage.textContent = '10%';
    progressLabel.textContent = 'Subiendo a Backblaze B2…';

    const uploadResult = await uploadPresigned(uploadUrl, file, (p) => {
      const pct = Math.round(10 + p * 0.8);
      progressFill.style.width = `${pct}%`; progressPercentage.textContent = `${pct}%`;
    });
    if (!uploadResult.success) throw new Error(uploadResult.message || 'La subida al almacenamiento falló');

    progressFill.style.width = '100%'; progressPercentage.textContent = '100%';
    progressLabel.textContent = '¡Subida completa!';

    // Cover: the first PDF page rendered when the file was chosen, or the EPUB's cover image
    try {
      let cover = pendingCover; // { blob, ext }
      if (!cover) {
        await ensureUploadLibs();
        let raw = null;
        if (/\.pdf$/i.test(file.name) && window.pdfjsLib) { progressLabel.textContent = 'Generando portada…'; raw = await generatePdfThumbnail(file, 720); }
        else if (/\.epub$/i.test(file.name) && window.JSZip) { progressLabel.textContent = 'Extrayendo portada del EPUB…'; raw = await extractEpubCover(file); }
        if (raw) cover = await CB.encodeCover(raw); // resized + WebP when possible
      }
      if (cover && cover.blob) {
        const cuRes = await fetch('/api/cover-upload', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: fileId, originalFilename: 'cover.' + cover.ext }),
        });
        if (cuRes.ok) {
          const cu = await cuRes.json();
          const coverFile = new File([cover.blob], 'cover.' + cover.ext, { type: cover.blob.type });
          const cr = await uploadPresigned(cu.uploadUrl, coverFile, () => {});
          if (!cr.success) console.warn('Cover upload failed:', cr.message);
        }
      }
    } catch (err) { console.warn('Cover generation skipped:', err); }

    // Commit: the server checks the file really landed in B2 with the right size. If it did not,
    // the record is discarded server-side and the upload must be reported as failed.
    progressLabel.textContent = 'Verificando el archivo…';
    const commitRes = await fetch('/api/commit-upload', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: fileId }) });
    const commit = await commitRes.json().catch(() => ({}));
    if (!commitRes.ok || commit.ok === false) {
      const why = commit.reason === 'size_mismatch' ? 'El archivo llegó incompleto al servidor.'
        : commit.reason === 'not_found' ? 'El archivo no llegó al servidor.'
        : (commit.message || 'No se pudo confirmar la subida.');
      throw new Error(why + ' Inténtalo de nuevo, preferiblemente con una conexión estable.');
    }

    showNotification('success', '¡Libro subido!', `${fileName || file.name} ya está en la biblioteca`);
    setTimeout(() => progressContainer.classList.add('hidden'), 2000);
    e.target.reset();
    pendingMeta = null; pendingCover = null; hideMetaPreview();
    await loadFiles();
    showSection('browse');
  } catch (error) {
    console.error('Upload error:', error);
    progressLabel.textContent = 'La subida falló';
    progressFill.style.background = 'var(--err)';
    showNotification('error', 'No se pudo subir', error.message || 'Error de red');
    setTimeout(() => { progressContainer.classList.add('hidden'); progressFill.style.background = ''; }, 3000);
  } finally {
    submitBtn.textContent = originalText;
    submitBtn.disabled = false;
  }
}

// Upload straight to Backblaze B2 with a presigned S3 PUT URL (bound to one object name).
// Needs the bucket's CORS rule to allow s3_put from this origin.
function uploadPresigned(uploadUrl, file, progressCallback) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.upload.addEventListener('progress', (ev) => { if (ev.lengthComputable) progressCallback((ev.loaded / ev.total) * 100); });
    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve({ success: true });
      else { console.error('B2 upload failed:', xhr.status, xhr.responseText); resolve({ success: false, message: `La subida falló (${xhr.status})` }); }
    });
    xhr.addEventListener('error', () => reject(new Error('Error de red durante la subida (si pasa siempre, falta la regla CORS del bucket)')));
    xhr.addEventListener('timeout', () => reject(new Error('La subida tardó demasiado')));
    xhr.open('PUT', uploadUrl);
    xhr.timeout = 60 * 60 * 1000;
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    xhr.send(file);
  });
}

// First-page JPEG thumbnail of a PDF via PDF.js
async function generatePdfThumbnail(file, maxDimension = 400) {
  try {
    if (!window.pdfjsLib) return null;
    const data = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data }).promise;
    const page = await pdf.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const scale = Math.max(1, maxDimension / Math.max(base.width, base.height));
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(viewport.width); canvas.height = Math.floor(viewport.height);
    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
    return await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.85));
  } catch (err) { console.warn('PDF thumbnail generation failed:', err); return null; }
}

// Cover image from an EPUB (file named *cover* or the one referenced in content.opf)
async function extractEpubCover(epubFile) {
  try {
    if (!window.JSZip) return null;
    const zip = await JSZip.loadAsync(await epubFile.arrayBuffer());
    const imageExt = ['jpg', 'jpeg', 'png', 'gif', 'webp'];
    const candidates = [];
    zip.forEach((path) => { const l = path.toLowerCase(); if (imageExt.some(x => l.endsWith('.' + x)) && l.includes('cover')) candidates.push(path); });
    if (candidates.length) { candidates.sort((a, b) => a.split('/').length - b.split('/').length); return await zip.file(candidates[0]).async('blob'); }
    const opfPath = Object.keys(zip.files).find(p => p.toLowerCase().endsWith('.opf'));
    if (opfPath) {
      const opf = await zip.file(opfPath).async('text');
      const coverId = opf.match(/<meta[^>]+name=["']cover["'][^>]*content=["']([^"']+)["']/i);
      if (coverId) {
        const item = opf.match(new RegExp(`<item[^>]+id=["']${coverId[1]}["'][^>]*href=["']([^"']+)["']`, 'i'));
        if (item) {
          const baseDir = opfPath.split('/').slice(0, -1).join('/');
          const full = (baseDir ? `${baseDir}/${item[1]}` : item[1]).replace(/\\/g, '/');
          if (zip.file(full)) return await zip.file(full).async('blob');
        }
      }
    }
  } catch (err) { console.warn('extractEpubCover failed', err); }
  return null;
}

// ----- Notifications -----
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
