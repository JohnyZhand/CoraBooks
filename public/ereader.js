// CoraBooks EPUB reader: /epub?id=<id>
// Downloads the whole file (an EPUB is a zip, so it cannot be streamed page by page like a
// PDF), then renders it with epub.js: paginated, dark theme, chapters, font size, swipe and
// keyboard paging, position remembered per book.
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const els = {
    title: $('rTitle'), status: $('rStatus'), progress: $('rProgress'), fill: $('rProgressFill'),
    prev: $('rPrev'), next: $('rNext'), toc: $('rToc'), fontDown: $('rFontDown'), fontUp: $('rFontUp'), theme: $('rTheme'),
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
  let theme = localStorage.getItem('epub:theme') === 'night' ? 'night' : 'paper';
  let tocItems = []; // { label, href (spine href + fragment), file, frag }
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
      // Our own stylesheet is injected into every chapter document (now and as chapters load),
      // which applies instantly and reliably. It also normalises text sizes, because many
      // publishers size text in fixed pixels that epub.js's font-size setting cannot scale.
      rendition.hooks.content.register((contents) => applyThemeTo(contents.document));
      applyTheme();

      await book.ready;
      const saved = localStorage.getItem(posKey);
      await rendition.display(saved || undefined);
      if (saved) setStatus('Continuando donde lo dejaste', true); else setStatus('Listo', true);

      // Chapters: TOC hrefs are written relative to the nav document, which often differs from
      // how the spine names sections, so each entry is resolved to a spine section first.
      book.loaded.navigation.then(nav => {
        const items = [];
        (function walk(list, depth) { (list || []).forEach(it => { items.push({ depth, label: (it.label || '').trim(), raw: it.href || '' }); walk(it.subitems, depth + 1); }); })(nav.toc, 0);
        tocItems = items.map(it => {
          const [path, frag] = it.raw.split('#');
          const sec = resolveSection(path);
          return sec ? { label: (it.depth ? '  '.repeat(it.depth) + '· ' : '') + it.label, file: sec.href, frag: frag || '', href: sec.href + (frag ? '#' + frag : '') } : null;
        }).filter(Boolean);
        els.toc.innerHTML = '<option value="">Capítulos…</option>' + tocItems.map((it, i) => `<option value="${i}">${esc(it.label)}</option>`).join('');
        syncToc(rendition.currentLocation());
      }).catch((e) => console.warn('TOC failed', e));

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
  function resolveSection(path) {
    if (!path) return null;
    const clean = decodeURI(path).replace(/^(\.\.\/|\.\/)+/, '');
    const direct = book.spine.get(clean) || book.spine.get(path);
    if (direct) return direct;
    // fall back to matching the tail of the spine href ("text/ch01.xhtml" vs "OEBPS/text/ch01.xhtml")
    let found = null;
    book.spine.each(sec => { if (!found && sec.href && (sec.href === clean || sec.href.endsWith('/' + clean) || clean.endsWith('/' + sec.href))) found = sec; });
    if (!found) { const base = clean.split('/').pop(); book.spine.each(sec => { if (!found && sec.href && sec.href.split('/').pop() === base) found = sec; }); }
    return found;
  }
  function syncToc(loc) {
    if (!loc || !loc.start || !loc.start.href || !tocItems.length) return;
    const file = loc.start.href;
    const candidates = tocItems.map((it, i) => ({ it, i })).filter(c => c.it.file === file);
    if (!candidates.length) return;
    let pick = candidates[0];
    if (candidates.length > 1) {
      // several entries in this file: choose the last one whose anchor sits at or before the current page
      try {
        const contents = rendition.getContents()[0];
        const doc = contents && contents.document;
        const width = contents ? contents.width() : 0;
        for (const c of candidates) {
          if (!c.it.frag) { pick = c; continue; }
          const el = doc && doc.getElementById(c.it.frag);
          if (el && el.getBoundingClientRect().left < width) pick = c;
        }
      } catch (e) { /* keep the first */ }
    }
    els.toc.value = String(pick.i);
  }
  function applyTheme() {
    try { localStorage.setItem('epub:theme', theme); } catch (e) {}
    applyAll();
  }
  function onKey(e) {
    if (!rendition) return;
    if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') rendition.next();
    else if (e.key === 'ArrowLeft' || e.key === 'PageUp') rendition.prev();
  }
  function themeCss() {
    const night = theme === 'night';
    return [
      `html { font-size: ${fontSize}% !important; }`,
      `html, body { background: ${night ? '#15152a' : '#fbfbf8'} !important; }`,
      `body { font-size: 1rem !important; padding: 0 6px; ${night ? 'color: #d8d8ea !important;' : ''} }`,
      'p, li, dd, dt, td, th, blockquote, figcaption { font-size: 1rem !important; line-height: 1.6 !important; }',
      'h1 { font-size: 2em !important; } h2 { font-size: 1.6em !important; } h3 { font-size: 1.3em !important; } h4, h5, h6 { font-size: 1.1em !important; }',
      'sup, sub, small { font-size: 0.8em !important; }',
      night ? 'a { color: #a78bfa !important; }' : '',
      'img, svg, image { max-width: 100% !important; height: auto; }',
      'pre, code { white-space: pre-wrap; }',
    ].join('\n');
  }
  function applyThemeTo(doc) {
    if (!doc || !doc.head) return;
    let st = doc.getElementById('cb-theme');
    if (!st) { st = doc.createElement('style'); st.id = 'cb-theme'; doc.head.appendChild(st); }
    st.textContent = themeCss();
  }
  function applyAll() {
    if (rendition) rendition.getContents().forEach(c => applyThemeTo(c.document));
    els.viewer.classList.toggle('night', theme === 'night');
    els.theme.textContent = theme === 'night' ? '\u2600' : '\u263D';
  }
  let fontTimer = null;
  function applyFont() {
    try { localStorage.setItem('epub:fontSize', String(fontSize)); } catch (e) {}
    if (!rendition) return;
    // keep the reader's place: re-open the current position after the text reflows
    const loc = rendition.currentLocation();
    const cfi = loc && loc.start && loc.start.cfi;
    applyAll();
    clearTimeout(fontTimer);
    fontTimer = setTimeout(() => { if (cfi) rendition.display(cfi).catch(() => {}); }, 60);
    setStatus(`Letra ${fontSize}%`, true);
  }

  els.prev.addEventListener('click', () => rendition && rendition.prev());
  els.next.addEventListener('click', () => rendition && rendition.next());
  els.fontUp.addEventListener('click', () => { fontSize = Math.min(200, fontSize + 10); applyFont(); });
  els.fontDown.addEventListener('click', () => { fontSize = Math.max(60, fontSize - 10); applyFont(); });
  els.toc.addEventListener('change', () => {
    const it = tocItems[parseInt(els.toc.value, 10)];
    if (rendition && it) rendition.display(it.href).catch(() => rendition.display(it.file));
  });
  els.theme.addEventListener('click', () => { theme = theme === 'night' ? 'paper' : 'night'; applyTheme(); });
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
