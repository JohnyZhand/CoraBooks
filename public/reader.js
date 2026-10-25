// CoraBooks reader: opens a book with PDF.js using HTTP range requests, so only the
// pages being viewed are fetched. Even a 900 MB book shows its first page in seconds.
(function () {
  'use strict';

  const PDFJS_CDN = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/';
  const CHUNK = 1024 * 1024;        // 1 MB per range request
  const RENDER_MARGIN = '900px';    // start rendering pages this far outside the viewport
  const MAX_SCALE = 4, MIN_SCALE = 0.4;
  const TOOLBAR_H = 52;

  const $ = (id) => document.getElementById(id);
  const els = {
    title: $('rTitle'), pages: $('rPages'), status: $('rStatus'),
    page: $('rPage'), total: $('rTotal'), prev: $('rPrev'), next: $('rNext'),
    zoomIn: $('rZoomIn'), zoomOut: $('rZoomOut'), fit: $('rFit'), download: $('rDownload'),
    error: $('rError'), errorMsg: $('rErrorMsg'), errorDownload: $('rErrorDownload'),
  };

  const id = new URLSearchParams(location.search).get('id');
  if (!id || !/^[\w-]+$/.test(id)) { fail('Falta el id del libro en el enlace.'); return; }

  const fileUrl = '/api/download/' + encodeURIComponent(id) + '?inline=1';
  els.download.href = '/api/download/' + encodeURIComponent(id);
  const bookLink = $('rBookLink'); if (bookLink) bookLink.href = '/book?id=' + encodeURIComponent(id);
  els.errorDownload.href = els.download.href;

  if (!window.pdfjsLib) { fail('No se pudo cargar el visor de PDF. Revisa tu conexión y recarga la página.'); return; }
  pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_CDN + 'build/pdf.worker.min.js';

  let pdf = null;
  let scale = 1;               // CSS pixels per PDF point
  let fitWidth = true;
  let basePage = null;         // page 1 viewport at scale 1, used for placeholder sizes
  const wraps = [];            // page wrappers, index 0 = page 1
  const renderTasks = new Map();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  let observer = null;
  let currentPage = 1;
  let restoring = false;
  let statusTimer = null;

  // Title and file info (best effort; the PDF opens regardless)
  fetch('/api/files').then(function (r) { return r.ok ? r.json() : []; }).then(function (list) {
    const f = Array.isArray(list) ? list.find(function (x) { return x.id === id; }) : null;
    if (f && /\.epub$/i.test(f.b2FileName || '')) { location.replace('/epub?id=' + encodeURIComponent(id)); return; }
    if (f) {
      els.title.textContent = (f.meta && f.meta.title) || f.filename || f.originalName || 'Libro';
      document.title = els.title.textContent + ' - CoraBooks';
    }
  }).catch(function () {});

  setStatus('Abriendo el libro…');
  const task = pdfjsLib.getDocument({
    url: fileUrl,
    rangeChunkSize: CHUNK,
    disableAutoFetch: true,   // only fetch what is being viewed
    disableStream: true,      // use range requests instead of streaming the whole file
    standardFontDataUrl: PDFJS_CDN + 'standard_fonts/',
    cMapUrl: PDFJS_CDN + 'cmaps/', cMapPacked: true,
  });

  task.promise.then(async function (doc) {
    pdf = doc;
    const p1 = await pdf.getPage(1);
    basePage = p1.getViewport({ scale: 1 });
    els.total.textContent = '/ ' + pdf.numPages;
    els.page.max = String(pdf.numPages);
    if (els.title.textContent === 'Cargando…') els.title.textContent = 'Libro';
    layout();
    restoreLastPage();
    setStatus(pdf.numPages + ' páginas', true);
  }).catch(function (e) {
    console.error('Reader error:', e);
    const msg = (e && e.name === 'MissingPDFException') ? 'El archivo no se encontró en el servidor.'
      : (e && e.name === 'InvalidPDFException') ? 'El archivo no parece ser un PDF válido.'
      : 'Hubo un problema abriendo el libro. Intenta de nuevo más tarde o descárgalo.';
    fail(msg);
  });

  // ----- Layout & rendering -----
  function availableWidth() {
    return Math.max(280, Math.min(els.pages.clientWidth - 16, 1400));
  }

  function computeScale() {
    if (fitWidth && basePage) scale = clamp(availableWidth() / basePage.width, MIN_SCALE, MAX_SCALE);
  }

  function layout() {
    computeScale();
    cancelAllRenders();
    if (observer) observer.disconnect();
    els.pages.innerHTML = '';
    wraps.length = 0;

    const w = Math.floor(basePage.width * scale), h = Math.floor(basePage.height * scale);
    const frag = document.createDocumentFragment();
    for (let n = 1; n <= pdf.numPages; n++) {
      const wrap = document.createElement('div');
      wrap.className = 'rpagewrap loading';
      wrap.dataset.num = String(n);
      wrap.style.width = w + 'px';
      wrap.style.height = h + 'px';
      frag.appendChild(wrap);
      wraps.push(wrap);
    }
    els.pages.appendChild(frag);

    observer = new IntersectionObserver(onIntersect, { root: null, rootMargin: RENDER_MARGIN, threshold: 0 });
    wraps.forEach(function (el) { observer.observe(el); });
  }

  function onIntersect(entries) {
    for (const entry of entries) {
      const wrap = entry.target;
      const n = Number(wrap.dataset.num);
      if (entry.isIntersecting) renderPage(n, wrap);
      else releasePage(n, wrap);
    }
  }

  async function renderPage(n, wrap) {
    if (wrap.dataset.rendered === String(scale) || renderTasks.has(n)) return;
    try {
      const page = await pdf.getPage(n);
      if (wraps[n - 1] !== wrap) return; // layout changed meanwhile
      const viewport = page.getViewport({ scale: scale });
      wrap.style.width = Math.floor(viewport.width) + 'px';
      wrap.style.height = Math.floor(viewport.height) + 'px';

      const canvas = document.createElement('canvas');
      canvas.width = Math.floor(viewport.width * dpr);
      canvas.height = Math.floor(viewport.height * dpr);
      const ctx = canvas.getContext('2d', { alpha: false });
      const rt = page.render({
        canvasContext: ctx, viewport: viewport,
        transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : null,
      });
      renderTasks.set(n, rt);
      await rt.promise;
      renderTasks.delete(n);
      if (wraps[n - 1] !== wrap) return;
      wrap.replaceChildren(canvas);
      wrap.classList.remove('loading');
      wrap.dataset.rendered = String(scale);
    } catch (e) {
      renderTasks.delete(n);
      if (e && e.name === 'RenderingCancelledException') return;
      console.warn('Page render failed', n, e);
      wrap.classList.remove('loading');
      wrap.textContent = 'No se pudo mostrar la página ' + n;
      wrap.style.color = '#333';
      wrap.style.padding = '1rem';
    }
  }

  // Free memory for pages far from the viewport (matters for 1,000+ page books)
  function releasePage(n, wrap) {
    const rt = renderTasks.get(n);
    if (rt) { rt.cancel(); renderTasks.delete(n); }
    if (wrap.dataset.rendered) {
      wrap.replaceChildren();
      wrap.classList.add('loading');
      delete wrap.dataset.rendered;
    }
  }

  function cancelAllRenders() {
    renderTasks.forEach(function (rt) { rt.cancel(); });
    renderTasks.clear();
  }

  function rerenderAtScale(newScale) {
    scale = clamp(newScale, MIN_SCALE, MAX_SCALE);
    const target = currentPage;
    layout();
    goToPage(target, true);
  }

  // ----- Navigation -----
  function goToPage(n, instant) {
    if (!pdf) return;
    n = clamp(Math.round(n) || 1, 1, pdf.numPages);
    const wrap = wraps[n - 1];
    if (!wrap) return;
    const top = wrap.getBoundingClientRect().top + window.scrollY - TOOLBAR_H - 12;
    window.scrollTo({ top: top, behavior: instant ? 'auto' : 'smooth' });
    currentPage = n;
    els.page.value = String(n);
  }

  function updateCurrentPage() {
    if (!wraps.length) return;
    const probeY = TOOLBAR_H + 24;
    // Binary search for the page under the toolbar line
    let lo = 0, hi = wraps.length - 1, best = 0;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const r = wraps[mid].getBoundingClientRect();
      if (r.top <= probeY) { best = mid; lo = mid + 1; } else { hi = mid - 1; }
    }
    const n = best + 1;
    if (n !== currentPage) {
      currentPage = n;
      if (document.activeElement !== els.page) els.page.value = String(n);
      saveLastPage();
    }
  }

  function saveLastPage() {
    if (restoring) return;
    try { localStorage.setItem('reader:' + id + ':page', String(currentPage)); } catch (e) {}
  }

  function restoreLastPage() {
    let saved = 1;
    try { saved = parseInt(localStorage.getItem('reader:' + id + ':page') || '1', 10) || 1; } catch (e) {}
    if (saved > 1 && saved <= pdf.numPages) {
      restoring = true;
      goToPage(saved, true);
      setTimeout(function () { restoring = false; }, 500);
      setStatus('Continuando en la página ' + saved, true);
    }
  }

  // ----- UI wiring -----
  els.prev.addEventListener('click', function () { goToPage(currentPage - 1); });
  els.next.addEventListener('click', function () { goToPage(currentPage + 1); });
  els.page.addEventListener('change', function () { goToPage(Number(els.page.value)); });
  els.page.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { goToPage(Number(els.page.value)); els.page.blur(); }
  });
  els.zoomIn.addEventListener('click', function () { fitWidth = false; rerenderAtScale(scale * 1.25); });
  els.zoomOut.addEventListener('click', function () { fitWidth = false; rerenderAtScale(scale / 1.25); });
  els.fit.addEventListener('click', function () { fitWidth = true; rerenderAtScale(scale); });

  document.addEventListener('keydown', function (e) {
    if (e.target === els.page) return;
    if (e.key === 'ArrowRight' || e.key === 'PageDown') { e.preventDefault(); goToPage(currentPage + 1); }
    else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); goToPage(currentPage - 1); }
    else if ((e.ctrlKey || e.metaKey) && (e.key === '=' || e.key === '+')) { e.preventDefault(); els.zoomIn.click(); }
    else if ((e.ctrlKey || e.metaKey) && e.key === '-') { e.preventDefault(); els.zoomOut.click(); }
  });

  let scrollTimer = null;
  window.addEventListener('scroll', function () {
    if (scrollTimer) return;
    scrollTimer = setTimeout(function () { scrollTimer = null; updateCurrentPage(); }, 80);
  }, { passive: true });

  let resizeTimer = null;
  window.addEventListener('resize', function () {
    if (!pdf || !fitWidth) return;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () { rerenderAtScale(scale); }, 200);
  });

  // ----- Helpers -----
  function setStatus(text, autoHide) {
    els.status.textContent = text;
    els.status.classList.remove('fade');
    clearTimeout(statusTimer);
    if (autoHide) statusTimer = setTimeout(function () { els.status.classList.add('fade'); }, 2500);
  }
  function fail(msg) {
    els.errorMsg.textContent = msg;
    els.error.classList.remove('hidden');
    els.status.classList.add('fade');
  }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
})();
