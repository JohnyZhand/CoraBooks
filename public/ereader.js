// CoraBooks EPUB reader: /epub?id=<id>
// Downloads the whole file (an EPUB is a zip, so it cannot be streamed page by page like a
// PDF), then renders it with epub.js: paginated, dark theme, chapters, font size, swipe and
// keyboard paging, position remembered per book.
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const els = {
    title: $('rTitle'), status: $('rStatus'), progress: $('rProgress'), fill: $('rProgressFill'),
    prev: $('rPrev'), next: $('rNext'), toc: $('rToc'), fontDown: $('rFontDown'), fontUp: $('rFontUp'),
    download: $('rDownload'), bookLink: $('rBookLink'), viewer: $('viewer'), foot: $('rFoot'),
    error: $('rError'), errorMsg: $('rErrorMsg'), errorDownload: $('rErrorDownload'),
  };

  const id = new URLSearchParams(location.search).get('id');
  if (!id || !/^[\w-]+$/.test(id)) { fail('Falta el id del libro en el enlace.'); return; }
  const fileUrl = '/api/download/' + encodeURIComponent(id) + '?inline=1';
  els.download.href = '/api/download/' + encodeURIComponent(id);
  els.errorDownload.href = els.download.href;
  els.bookLink.href = '/book?id=' + encodeURIComponent(id);

  if (!window.ePub || !window.JSZip) { fail('No se pudo cargar el visor de EPUB. Revisa tu conexión y recarga la página.'); return; }

  let book = null, rendition = null;
  let fontSize = parseInt(localStorage.getItem('epub:fontSize') || '100', 10) || 100;
  const posKey = 'epub:' + id + ':cfi';
  let statusTimer = null;

  // Title from the catalog (best effort)
  fetch('/api/files').then(r => r.ok ? r.json() : []).then(list => {
    const f = Array.isArray(list) ? list.find(x => x.id === id) : null;
    if (f) {
      const t = (f.meta && f.meta.title) || f.filename || 'Libro';
      els.title.textContent = t;
      document.title = t + ' - CoraBooks';
    }
  }).catch(() => {});

  // ----- Download with progress -----
  async function download(url) {
    const res = await fetch(url);
    if (res.status === 404) throw Object.assign(new Error('missing'), { code: 'missing' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const total = parseInt(res.headers.get('Content-Length') || '0', 10);
    if (!res.body) return await res.arrayBuffer();
    const reader = res.body.getReader();
    const chunks = []; let received = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value); received += value.length;
      const pct = total ? Math.round(received / total * 100) : 0;
      els.fill.style.width = (total ? pct : 30) + '%';
      setStatus(total ? `Descargando el libro… ${pct}% (${mb(received)} de ${mb(total)} MB)` : `Descargando el libro… ${mb(received)} MB`);
    }
    const out = new Uint8Array(received); let off = 0;
    for (const c of chunks) { out.set(c, off); off += c.length; }
    return out.buffer;
  }
  const mb = (b) => (b / 1048576).toFixed(b > 10485760 ? 0 : 1);

  // ----- Open & render -----
  (async () => {
    try {
      const data = await download(fileUrl);
      els.progress.classList.add('done');
      setStatus('Abriendo el libro…');

      book = ePub(data);
      const narrow = window.innerWidth < 700;
      rendition = book.renderTo(els.viewer, {
        width: '100%', height: '100%', flow: 'paginated', spread: narrow ? 'none' : 'auto', minSpreadWidth: 900,
        allowScriptedContent: false,
      });
      rendition.themes.register('cb', {
        'html, body': { background: '#0e0e1c !important', color: '#d8d8ea !important' },
        'body': { 'line-height': '1.6', padding: '0 4px' },
        'p, div, span, li, td, th, h1, h2, h3, h4, h5, h6': { color: '#d8d8ea' },
        'a, a *': { color: '#a78bfa !important' },
        'img, svg, image': { 'max-width': '100% !important', height: 'auto' },
        'pre, code': { 'white-space': 'pre-wrap' },
      });
      rendition.themes.select('cb');
      applyFont();

      await book.ready;
      const saved = localStorage.getItem(posKey);
      await rendition.display(saved || undefined);
      if (saved) setStatus('Continuando donde lo dejaste', true); else setStatus('Listo', true);

      // Chapters
      book.loaded.navigation.then(nav => {
        const items = [];
        (function walk(list, depth) { (list || []).forEach(it => { items.push({ label: (depth ? '  '.repeat(depth) + '· ' : '') + (it.label || '').trim(), href: it.href }); walk(it.subitems, depth + 1); }); })(nav.toc, 0);
        els.toc.innerHTML = '<option value="">Capítulos…</option>' + items.map(it => `<option value="${esc(it.href)}">${esc(it.label)}</option>`).join('');
      }).catch(() => {});

      // Percentage through the book (computed in the background; big books take a moment)
      book.locations.generate(1200).then(() => updateFoot(rendition.currentLocation())).catch(() => {});

      rendition.on('relocated', (loc) => {
        try { if (loc && loc.start && loc.start.cfi) localStorage.setItem(posKey, loc.start.cfi); } catch (e) {}
        updateFoot(loc);
        syncToc(loc);
      });
      rendition.on('keyup', onKey);
      document.addEventListener('keyup', onKey);
      // Swipe inside the chapter iframe
      rendition.hooks.content.register((contents) => {
        let x0 = null, y0 = null;
        const doc = contents.document;
        doc.addEventListener('touchstart', (e) => { const t = e.changedTouches[0]; x0 = t.clientX; y0 = t.clientY; }, { passive: true });
        doc.addEventListener('touchend', (e) => {
          if (x0 === null) return;
          const t = e.changedTouches[0]; const dx = t.clientX - x0, dy = t.clientY - y0; x0 = y0 = null;
          if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) { if (dx < 0) rendition.next(); else rendition.prev(); }
        }, { passive: true });
      });
    } catch (e) {
      console.error('EPUB reader error:', e);
      fail(e && e.code === 'missing' ? 'El archivo no se encontró en el servidor.'
        : /zip|central directory|epub|container|opf/i.test(String(e && e.message)) ? 'El archivo no parece ser un EPUB válido.'
        : 'Hubo un problema abriendo el libro. Intenta de nuevo más tarde o descárgalo.');
    }
  })();

  function updateFoot(loc) {
    if (!loc || !loc.start) return;
    const bits = [];
    if (book.locations && book.locations.length()) {
      const pct = Math.round((book.locations.percentageFromCfi(loc.start.cfi) || 0) * 100);
      bits.push(pct + '%');
    }
    if (loc.start.displayed && loc.start.displayed.total) bits.push(`pág. ${loc.start.displayed.page} de ${loc.start.displayed.total} del capítulo`);
    els.foot.textContent = bits.join(' · ');
  }
  function syncToc(loc) {
    if (!loc || !loc.start || !loc.start.href) return;
    const opts = Array.from(els.toc.options);
    const match = opts.find(o => o.value && (o.value === loc.start.href || o.value.split('#')[0] === loc.start.href));
    if (match) els.toc.value = match.value;
  }
  function onKey(e) {
    if (!rendition) return;
    if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') rendition.next();
    else if (e.key === 'ArrowLeft' || e.key === 'PageUp') rendition.prev();
  }
  function applyFont() {
    if (rendition) rendition.themes.fontSize(fontSize + '%');
    try { localStorage.setItem('epub:fontSize', String(fontSize)); } catch (e) {}
  }

  els.prev.addEventListener('click', () => rendition && rendition.prev());
  els.next.addEventListener('click', () => rendition && rendition.next());
  els.fontUp.addEventListener('click', () => { fontSize = Math.min(200, fontSize + 10); applyFont(); });
  els.fontDown.addEventListener('click', () => { fontSize = Math.max(60, fontSize - 10); applyFont(); });
  els.toc.addEventListener('change', () => { if (rendition && els.toc.value) rendition.display(els.toc.value); });
  let resizeTimer = null;
  window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => { if (rendition) rendition.resize(); }, 200); });

  function setStatus(text, autoHide) {
    els.status.textContent = text;
    els.status.classList.remove('fade');
    clearTimeout(statusTimer);
    if (autoHide) statusTimer = setTimeout(() => els.status.classList.add('fade'), 2500);
  }
  function fail(msg) {
    els.errorMsg.textContent = msg;
    els.error.classList.remove('hidden');
    els.status.classList.add('fade');
    els.progress.classList.add('done');
  }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'); }
})();
