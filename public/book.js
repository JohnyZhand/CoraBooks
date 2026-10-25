// Book detail page: /book?id=<id>
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const id = new URLSearchParams(location.search).get('id');

  // Same ASCII cat as the home page, fetched from it so there is one source of truth
  fetch('/').then(r => r.text()).then(html => {
    const m = html.match(/<pre id="asciiCat">([\s\S]*?)<\/pre>/);
    if (m) $('asciiCat').textContent = m[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  }).catch(() => {});

  if (!id) return notFound();

  fetch('/api/files').then(r => r.ok ? r.json() : []).then(list => {
    const f = Array.isArray(list) ? list.find(x => x.id === id) : null;
    if (!f) return notFound();
    render(f);
  }).catch(notFound);

  function notFound() {
    $('loading').style.display = 'none';
    $('notFound').classList.remove('hidden');
  }

  function render(f) {
    const CB = window.CB;
    const meta = f.meta || {};
    const parsed = CB.parseFilename(f.filename || f.originalName || '');
    const title = CB.bookTitle(f);
    const author = CB.bookAuthor(f);
    const fmt = CB.bookFormat(f);

    document.title = `${title} - CoraBooks`;
    $('title').textContent = title;
    $('author').textContent = author;
    $('author').classList.toggle('hidden', !author);

    // Cover: ours first, online cover as a fallback
    const cover = $('cover'), img = $('coverImg');
    $('coverFallback').textContent = fmt;
    img.alt = `Portada de ${title}`;
    img.onerror = () => {
      if (meta.coverUrl && img.src !== meta.coverUrl) { img.src = meta.coverUrl; return; }
      cover.classList.add('nocover');
    };
    img.src = f.coverB2Name ? `/api/cover/${f.id}` : (meta.coverUrl || '');
    if (!f.coverB2Name && !meta.coverUrl) cover.classList.add('nocover');

    $('stripFmt').textContent = `FILE // ${fmt}`;
    $('stripSize').textContent = CB.formatSize(f.size);

    // Actions
    const readable = fmt === 'PDF' || fmt === 'EPUB';
    $('readBtn').href = (fmt === 'EPUB' ? '/epub?id=' : '/reader?id=') + encodeURIComponent(f.id);
    $('readBtn').classList.toggle('hidden', !readable);
    $('downloadBtn').href = `/api/download/${encodeURIComponent(f.id)}`;
    if (!readable) $('downloadBtn').classList.add('btn-primary');

    // Spec sheet: only rows we actually have data for
    const rows = [];
    const edition = meta.edition || parsed.edition;
    const year = meta.year || parsed.year;
    if (edition || year) rows.push(['Edición', [edition, year].filter(Boolean).join(' · ')]);
    if (meta.publisher) rows.push(['Editorial', meta.publisher]);
    if (meta.pages) rows.push(['Páginas', String(meta.pages)]);
    if (meta.language) rows.push(['Idioma', CB.languageName(meta.language)]);
    const isbn = (meta.isbn && meta.isbn.length) ? meta.isbn : parsed.isbn;
    if (isbn && isbn.length) rows.push(['ISBN', isbn.slice(0, 2).join(', ')]);
    rows.push(['Formato', fmt]);
    rows.push(['Tamaño', CB.formatSize(f.size)]);
    rows.push(['Subido', CB.formatDate(f.uploadedAt)]);
    $('spec').innerHTML = rows.map(([k, v]) =>
      `<div class="spec-row"><dt>${CB.escapeHtml(k)}</dt><dd>${CB.escapeHtml(v)}</dd></div>`).join('');

    // Synopsis from the catalog lookup
    if (meta.description) {
      $('synopsisPanel').classList.remove('hidden');
      const p = $('synopsis');
      p.textContent = meta.description;
      requestAnimationFrame(() => {
        if (p.scrollHeight > p.clientHeight + 4) {
          const btn = $('readMore');
          btn.classList.remove('hidden');
          btn.addEventListener('click', () => {
            const open = p.classList.toggle('clamped');
            btn.textContent = open ? '[ leer más ]' : '[ leer menos ]';
          });
        }
      });
      $('tags').innerHTML = (meta.subjects || []).slice(0, 8).map(s => `<span class="tag">${CB.escapeHtml(s)}</span>`).join('');
      if (meta.source) $('source').textContent = `Datos del catálogo: ${meta.source}`;
    } else if (meta.subjects && meta.subjects.length) {
      $('synopsisPanel').classList.remove('hidden');
      $('synopsis').classList.add('hidden');
      $('tags').innerHTML = meta.subjects.slice(0, 8).map(s => `<span class="tag">${CB.escapeHtml(s)}</span>`).join('');
      if (meta.source) $('source').textContent = `Datos del catálogo: ${meta.source}`;
    }

    // Uploader's note
    if (f.description && f.description.trim()) {
      $('notePanel').classList.remove('hidden');
      $('note').textContent = f.description.trim();
    }

    $('loading').style.display = 'none';
    $('bookView').classList.remove('hidden');
  }
})();
