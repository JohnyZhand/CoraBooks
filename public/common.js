// Shared helpers for CoraBooks pages: title cleanup, metadata lookup, formatting.
// Loaded by index, the book page and the admin editor. No build step; plain globals.
(function (global) {
  'use strict';

  const SMALL_WORDS = new Set(['a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'from', 'in', 'into', 'nor', 'of', 'on', 'or', 'the', 'to', 'vs', 'with',
    'y', 'e', 'o', 'u', 'de', 'del', 'la', 'las', 'el', 'los', 'un', 'una', 'unos', 'unas', 'en', 'con', 'por', 'para', 'al', 'lo']);
  const WORD_ORDINALS = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10, eleventh: 11, twelfth: 12,
    primera: 1, segunda: 2, tercera: 3, cuarta: 4, quinta: 5, sexta: 6, septima: 7, séptima: 7, octava: 8, novena: 9, decima: 10, décima: 10 };
  const PUBLISHER_NAMES = "pearson(?: education)?|cengage(?: learning)?(?: custom)?|mc\\s?graw[- ]?hill(?: education)?|elsevier|wiley|springer|oxford university press|cambridge university press|w\\.?\\s?h\\.?\\s?freeman|worth publishers|sinauer|routledge|macmillan(?: learning)?|w\\.?\\s?w\\.?\\s?norton|norton|sage|penguin|random house|harpercollins|houghton mifflin|jones\\s?&\\s?bartlett|lippincott|thieme|saunders|mosby|garland science|crc press|academic press|prentice hall|addison[- ]wesley|o'reilly|bloomsbury|cold spring harbor(?: laboratory press)?|planeta|anagrama|alfaguara|santillana|limusa|trillas|paidós|paidos|editorial médica panamericana";
  const PUBLISHERS = new RegExp("(?:[-–—,:|]\\s*|\\s+)(" + PUBLISHER_NAMES + ")\\s*$", 'i');
  const PUBLISHER_WORDS = /\b(press|publishing|publishers|learning|education|custom|harbor|south-western|cengage|pearson|elsevier|wiley|springer|hill|norton|freeman|macmillan)\b/i;
  const CREDENTIALS = /\b(MBBS|MD|PhD|Ph\.D\.?|DSc|FRCP|FRS|FACS|RN|MSc|BSc|DDS|Dr\.?)\b\.?/g;
  const PLACEHOLDER_AUTHORS = /^(author|authors|unknown|anonymous|anónimo|various|varios|etc\.?|n\/a|none)$/i;
  // Capitalised words that mean "this is a title (or a publisher), not a person"
  const TITLE_WORDS = /\b(the|series|manual|laboratory|laboratorio|introduction|introducci[oó]n|principles|principios|biology|biolog[ií]a|chemistry|qu[ií]mica|physics|f[ií]sica|edition|edici[oó]n|guide|gu[ií]a|book|handbook|analysis|an[aá]lisis|methods|m[eé]todos|theory|teor[ií]a|approach|science|ciencia|engineering|mathematics|matem[aá]ticas|statistics|estad[ií]stica|economics|econom[ií]a|management|psychology|psicolog[ií]a|communication|development|desarrollo|writing|reading|language|teaching|learning|education|educaci[oó]n|educativa|microbiology|microbiolog[ií]a|anatomy|anatom[ií]a|physiology|genetics|gen[eé]tica|organic|org[aá]nica|essential|fundamental|integrated|applied|practical|advanced|modern|contemporary|human|humano|cell|cellular|molecular|medical|m[eé]dica|business|survey|bundle|loose-leaf|version|student|students|solution|answer|office|word|course|lessons?|complete|perspectives|issues|understanding|calculus|algebra|accounting|virology|immunology|zoology|biochemistry|phonetics|phonology|resource|classroom|instruction|technology|success|premium|conversation|english|spanish|ilustrada|navigator|updated|press|publishing|publishers|custom|university|college|harbor|inc|ltd|llc|group|hill|cengage|pearson|elsevier|wiley|springer|south-western|atoms|first|experience|developmental|technical|approaches|practice|trigonometry|precalculus|keyboarding|processing|texts|modeling|mentor|steps|like|this|real-world|creating|maximum|achievement|library|z-library|revised|international|global|volume|vol|part|chapter|australia|america|europe)\b/i;

  function titleCase(s, keepAcronyms = true) {
    return s.split(/\s+/).map((w, i) => {
      if (!w) return w;
      const lower = w.toLowerCase();
      if (i > 0 && SMALL_WORDS.has(lower)) return lower;
      if (keepAcronyms && /^[A-Z0-9&.-]{2,6}$/.test(w) && /[A-Z]/.test(w)) return w; // ISE, MGMT, 3D
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    }).join(' ');
  }

  const isInitial = (w) => /^[A-ZÁÉÍÓÚÑ]\.?$/.test(w);
  const isCapWord = (w) => /^(?:[A-ZÁÉÍÓÚÑ][\wáéíóúñ'’.-]*|de|del|la|van|von|der|da|di|y)$/.test(w);

  // "Jane Doe", "J. R. R. Tolkien", "Hickman, Jr.", "Doe, Jane" — one person
  function looksLikePersonName(s) {
    let t = s.replace(CREDENTIALS, '').replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim().replace(/,\s*(jr|sr|ii|iii)\.?$/i, '');
    const swap = t.match(/^([^,]+),\s*([^,]+)$/);
    if (swap) t = `${swap[2]} ${swap[1]}`;
    const words = t.split(/\s+/).filter(Boolean);
    if (words.length < 1 || words.length > 5 || /\d/.test(t) || TITLE_WORDS.test(t)) return false;
    if (words.length === 1 && !/^(jr|sr|ii|iii)\.?$/i.test(t)) return false;
    return words.every(isCapWord);
  }

  // "Michael J. F. Barresi Scott F. Gilbert" -> ["Michael J. F. Barresi", "Scott F. Gilbert"]
  function splitGluedNames(s) {
    const tokens = s.split(/\s+/).filter(Boolean);
    const groups = []; let cur = [];
    for (let i = 0; i < tokens.length; i++) {
      cur.push(tokens[i]);
      const next = tokens[i + 1];
      const closed = cur.length >= 2 && !isInitial(tokens[i]) && cur.some(isInitial) && next && !isInitial(next);
      if (closed) { groups.push(cur.join(' ')); cur = []; }
    }
    if (cur.length) groups.push(cur.join(' '));
    return groups;
  }

  // "A. One, B. Two and C. Three" or "One, A.; Two, B." or "A. One B. Two" — a list of people (mostly)
  function looksLikeNameList(s) {
    const clean = s.replace(CREDENTIALS, '').replace(/\([^)]*\)/g, ' ').replace(/,?\s*\b(19[5-9]\d|20[0-4]\d)-?\b/g, '').replace(/\s+/g, ' ').trim();
    if (!clean || /\b(edition|edici[oó]n|version|volume|chapter|lessons?)\b/i.test(clean)) return false;
    const pieces = nameListPieces(clean);
    if (!pieces.length) return false;
    const ok = pieces.filter(looksLikePersonName).length;
    return ok >= 1 && ok / pieces.length >= 0.6;
  }
  function nameListPieces(clean) {
    // "Last, First; Last, First" — split on semicolons only, keep the comma pairs together
    const commaPairs = /;/.test(clean) || /^[A-ZÁÉÍÓÚÑ][\wáéíóúñ'’.-]+,\s*[A-ZÁÉÍÓÚÑ][\wáéíóúñ'’.-]*(?:\s+[A-Z]\.?)*$/.test(clean);
    let pieces = (commaPairs ? clean.split(/\s*(?:;|\band\b|\by\b|&)\s*/i) : clean.split(/\s*(?:,|;|:|\band\b|\by\b|&)\s*/i)).map(p => p.trim()).filter(Boolean);
    if (pieces.length === 1 && pieces[0].split(' ').length > 5) pieces = splitGluedNames(pieces[0]);
    return pieces;
  }
  // Normalises an author string: "Burdge, Julia; Overby, Jason" -> "Julia Burdge, Jason Overby"
  function normalizeAuthorList(a) {
    const clean = String(a || '').replace(CREDENTIALS, '').replace(/,?\s*\b(19[5-9]\d|20[0-4]\d)\b-?(?=\s|,|;|$)/g, '').replace(/\s+/g, ' ').trim();
    if (!clean) return '';
    const pieces = nameListPieces(clean).map(p => {
      const swap = p.match(/^([^,()]+),\s*([^,]+)$/);
      return swap && !/\b(jr|sr|ii|iii)\b/i.test(swap[2]) ? `${swap[2].trim()} ${swap[1].trim()}` : p;
    });
    return pieces.join(', ');
  }

  // Turns a sloppy upload name into { title, author, edition, year, isbn, publisher } (all best effort).
  function parseFilename(name) {
    const out = { title: '', author: '', edition: '', year: null, isbn: [], publisher: '' };
    let s = String(name || '').replace(/\.(pdf|epub|mobi)$/i, '').trim();
    if (!s) return out;

    // underscores first: after an initial they are dots ("Diane E_ Papalia"), before a space a lost
    // colon ("Genetics_ Analysis"), between words plain spaces
    s = s.replace(/\b([A-Z])_(?=\s)/g, '$1.').replace(/_\s+/g, ': ').replace(/_/g, ' ');
    // kebab-case names (still no spaces at all) -> spaces
    if (!/\s/.test(s) && /-/.test(s)) s = s.replace(/-+/g, ' ');
    // libgen "-4nbsped-" marker
    s = s.replace(/\s*-?(\d+)nbsped-?\s*/i, (m, ed) => { out.edition = ordinalEdition(ed); return ' '; });
    // ISBNs anywhere (and libgen's trailing md5 hash)
    s = s.replace(/\b(97[89][\d-]{10,16}|\d{9}[\dX])\b/g, (m) => {
      const clean = m.replace(/-/g, '');
      if (clean.length === 10 || clean.length === 13) out.isbn.push(clean.toUpperCase());
      return ' ';
    }).replace(/\b[0-9a-f]{32}\b/gi, ' ');
    s = s.replace(/\s*•\s*/g, ': ').replace(/\s+/g, ' ');
    // noise: "(PDF)", "PDF ebook", "EPUB VERSION, usar con: https://...", "copy", leading "(12)", credentials
    s = s.replace(/\((pdf|epub|mobi)\)/ig, ' ').replace(/[\s–-]*\b(pdf|epub|mobi)?\s*e-?books?\b/ig, ' ')
      .replace(/\b(pdf|epub|mobi)\s+version\b/ig, ' ').replace(/,?\s*usar con:?.*$/i, ' ').replace(/https?:\/\/\S+/g, ' ')
      .replace(/\bcopy\b/ig, ' ').replace(/^\s*[\(\[]\d+[\)\]]\s*/, '').replace(CREDENTIALS, ' ').replace(/\s+/g, ' ').trim();
    // unbalanced trailing "(" fragment (truncated names like "Cell Biology (Thomas D")
    if ((s.match(/\(/g) || []).length > (s.match(/\)/g) || []).length) s = s.replace(/\s*\([^)]*$/, '');

    // trailing parentheticals, possibly several: "(2023, 13th Edition) (Author etc.)"
    let guard = 0;
    while (guard++ < 4) {
      const m = s.match(/\(([^()]*)\)\s*$/);
      if (!m) break;
      const inner = m[1].trim();
      if (/\betc\.?$/i.test(inner) || looksLikeNameList(inner)) {
        if (!out.author) out.author = inner.replace(/\s*etc\.?$/i, '');
      } else {
        grabEditionYear(inner, out, false);
      }
      s = s.slice(0, m.index).trim();
    }

    // trailing year then trailing publisher ("... Immunology Elsevier 2021")
    s = s.replace(/[\s,(-]*\b(19[5-9]\d|20[0-4]\d)\b[\s,)-]*$/, (m, y) => { if (!out.year) out.year = parseInt(y, 10); return ' '; }).trim();
    s = s.replace(PUBLISHERS, (m, pub) => { out.publisher = out.publisher || titleCase(pub.replace(/\s+/g, ' ')); return ' '; }).trim();

    // "Title by Author, Author" / "Título de Autor" at the end
    const by = s.match(/^(.*?)\s+(?:by|de)\s+([^:]+)$/i);
    if (by && looksLikeNameList(by[2]) && by[1].split(/\s+/).length >= 2) {
      s = by[1].replace(/\s+boo(k)?$/i, '');
      if (!out.author) out.author = by[2];
    }

    // libgen segments: "Title -- Author -- Edition, Year -- Publisher"
    let parts = s.split(/\s+--\s+/);
    if (parts.length >= 2) {
      out.title = parts[0];
      const run = out.author ? null : trailingNameRun(out.title);
      if (run && nameListPieces(run.names).length >= 2) { out.author = run.names; out.title = run.rest; }
      parts.slice(1).forEach(p => {
        if (!out.author && looksLikeNameList(p)) { out.author = p; return; }
        grabEditionYear(p, out, false);
        const pm = p.match(PUBLISHERS);
        if (pm && !out.publisher) out.publisher = titleCase(pm[1].replace(/\s+/g, ' ').trim());
        else if (!out.publisher && p.split(' ').length <= 4 && PUBLISHER_WORDS.test(p) && !/\d/.test(p)) out.publisher = titleCase(p.trim());
      });
    } else {
      parts = s.split(/\s+[-–—]\s+/);
      const first = parts[0], last = parts[parts.length - 1];
      if (parts.length >= 2 && looksLikeNameList(first) && !looksLikeNameList(last)) {
        out.author = out.author || first;
        out.title = parts.slice(1).join(' - ');
      } else if (parts.length >= 2 && looksLikeNameList(last)) {
        out.author = out.author || last;
        out.title = parts.slice(0, -1).join(' - ');
      } else {
        out.title = s;
      }
      // the title segment may still carry a publisher: "Microbiology: A Laboratory Manual-Pearson"
      out.title = out.title.replace(PUBLISHERS, (m, pub) => { out.publisher = out.publisher || titleCase(pub.replace(/\s+/g, ' ')); return ' '; }).trim();
    }

    // names glued to the title: trailing ("Desarrollo humano Diane E. Papalia; Gabriela Martorell")
    // or leading ("Abul K. Abbas Andrew H. Lichtman Cellular and Molecular Immunology")
    if (!out.author) {
      const run = trailingNameRun(out.title) || leadingNameRun(out.title);
      if (run) { out.author = run.names; out.title = run.rest; }
    }
    // an author segment that starts with title words: "Organic Chemistry William Brown, Eric Anslyn"
    if (out.author && !looksLikePersonName(nameListPieces(out.author)[0] || '')) {
      const run = trailingNameRun(out.author);
      if (run) out.author = run.names;
    }

    grabEditionYear(out.title, out, true);
    if (out.author) out.author = out.author.replace(/:\s/g, ', ');
    out.title = cleanupTitle(out.title);
    out.author = cleanupAuthor(normalizeAuthorList(out.author));
    if (PLACEHOLDER_AUTHORS.test(out.author)) out.author = '';
    return out;
  }

  // Finds "First Last; First M. Last" at the end of a title with at least two words before it.
  function trailingNameRun(title) {
    const tokens = title.split(' ').filter(Boolean);
    for (let i = 2; i < tokens.length - 1; i++) {
      if (!isCapWord(tokens[i]) || /[a-z]/.test(tokens[i].charAt(0))) continue;
      const rest = tokens.slice(0, i).join(' ');
      const tail = tokens.slice(i).join(' ');
      const pieces = nameListPieces(tail.replace(CREDENTIALS, ''));
      if (!pieces.length || !pieces.every(looksLikePersonName)) continue;
      const hasInitial = /\b[A-Z]\.\s/.test(tail);
      if (pieces.length >= 2 || (pieces.length === 1 && tail.split(' ').length >= 3 && hasInitial)) {
        if (rest.split(' ').length >= 2) return { names: tail, rest: rest.replace(/[\s,;:]+$/, '') };
      }
    }
    return null;
  }
  // Names at the start of a title, ending where the first "title word" begins.
  function leadingNameRun(title) {
    const tokens = title.split(' ').filter(Boolean);
    let j = tokens.findIndex((t, idx) => idx >= 2 && TITLE_WORDS.test(t));
    if (j < 2) return null;
    const head = tokens.slice(0, j);
    if (!head.every(isCapWord) || head.filter(isInitial).length < 1) return null;
    const groups = splitGluedNames(head.join(' '));
    if (!groups.every(looksLikePersonName)) return null;
    const rest = tokens.slice(j).join(' ');
    if (rest.split(' ').length < 2) return null;
    return { names: groups.join(', '), rest };
  }

  function ordinalEdition(n) {
    const i = parseInt(n, 10);
    if (!i || i > 60) return '';
    const suffix = (i % 10 === 1 && i !== 11) ? 'st' : (i % 10 === 2 && i !== 12) ? 'nd' : (i % 10 === 3 && i !== 13) ? 'rd' : 'th';
    return `${i}${suffix} ed.`;
  }

  // Pulls "15th edition", "Fourth Edition", "12ma edición", "6ED", "2e", "(2024)" out of a string; optionally strips them.
  function grabEditionYear(str, out, strip) {
    let s = str;
    const edRe = /\b(\d{1,2})\s*(?:st|nd|rd|th|ma|ra|da|ta|va|na|era|nda|ª|°)?\s*(?:ed\.?|edition|edici[oó]n)\b\.?/i;
    const wordRe = new RegExp('\\b(' + Object.keys(WORD_ORDINALS).join('|') + ')\\s+(?:ed\\.?|edition|edici[oó]n)\\b\\.?', 'i');
    const shortRe = /\b(\d{1,2})e\b/i;                 // "Precalculus 2e"
    const bareRe = /\b(\d{1,2})(?:st|nd|rd|th)\b(?=\s*(?:$|\+|,|\)|-|–))/i; // "Biology 4th", "10th +"
    let m;
    if ((m = s.match(edRe)) && !out.edition) out.edition = ordinalEdition(m[1]);
    if ((m = s.match(wordRe)) && !out.edition) out.edition = ordinalEdition(WORD_ORDINALS[m[1].toLowerCase()]);
    if ((m = s.match(shortRe)) && !out.edition) out.edition = ordinalEdition(m[1]);
    if ((m = s.match(bareRe)) && !out.edition) out.edition = ordinalEdition(m[1]);
    const y = s.match(/\b(19[5-9]\d|20[0-4]\d)\b(?!-)/); // "1953-" is a birth year, skip it
    if (y && !out.year) out.year = parseInt(y[1], 10);
    if (strip) {
      s = s.replace(edRe, ' ').replace(wordRe, ' ').replace(shortRe, ' ').replace(bareRe, ' ');
      s = s.replace(/[\s,(-]*\b(19[5-9]\d|20[0-4]\d)\b[\s,)-]*$/, ' ');
      s = s.replace(/\s*\+\s*$/, '').replace(/^(\S+\s+\S+.*?)\s+book$/i, '$1');
      out.title = s;
    }
  }

  function cleanupTitle(t) {
    let s = String(t || '').replace(/\s+/g, ' ').replace(/\s+([,:;])/g, '$1').replace(/^[\s,;:\-–—]+|[\s,;:\-–—]+$/g, '').trim();
    s = s.replace(/\s*[-–—]\s*$/, '').replace(/\(\s*\)/g, '').replace(/\s+/g, ' ').trim();
    if (!s) return '';
    const letters = s.replace(/[^A-Za-zÁÉÍÓÚÑáéíóúñ]/g, '');
    const upper = (letters.match(/[A-ZÁÉÍÓÚÑ]/g) || []).length;
    if (letters && (upper === 0 || upper === letters.length || upper / letters.length > 0.8)) s = titleCase(s);
    else s = s.charAt(0).toUpperCase() + s.slice(1);
    return s;
  }

  function cleanupAuthor(a) {
    let s = String(a || '').replace(/\s+/g, ' ').replace(/\s*;\s*/g, ', ').replace(/\s*,\s*/g, ', ').replace(/(,\s*)+/g, ', ').trim();
    s = s.replace(/^[,\s-]+|[,\s-]+$/g, '');
    if (!s) return '';
    const letters = s.replace(/[^A-Za-zÁÉÍÓÚÑáéíóúñ]/g, '');
    const upper = (letters.match(/[A-ZÁÉÍÓÚÑ]/g) || []).length;
    if (letters && (upper === 0 || upper === letters.length)) s = titleCase(s, false);
    return s;
  }

  // ----- Display helpers -----
  function bookTitle(file) {
    const m = file && file.meta;
    if (m && m.title) return m.title;
    const p = parseFilename(file.filename || file.originalName || '');
    return p.title || file.filename || 'Libro';
  }
  function bookAuthor(file) {
    const m = file && file.meta;
    if (m && m.author) return m.author;
    return parseFilename(file.filename || file.originalName || '').author || '';
  }
  function bookFormat(file) {
    const n = (file.b2FileName || file.originalName || file.filename || '').toLowerCase();
    if (n.endsWith('.epub')) return 'EPUB';
    if (n.endsWith('.mobi')) return 'MOBI';
    return 'PDF';
  }
  function isPdf(file) { return bookFormat(file) === 'PDF'; }

  function formatSize(bytes) {
    if (!bytes) return '0 B';
    const k = 1024, sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
    return parseFloat((bytes / Math.pow(k, i)).toFixed(i >= 2 ? 1 : 0)) + ' ' + sizes[i];
  }
  function formatDate(iso) {
    const d = new Date(iso);
    if (isNaN(d)) return '';
    return d.toLocaleDateString('es-PR', { year: 'numeric', month: 'short', day: 'numeric' });
  }
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text == null ? '' : String(text);
    return div.innerHTML;
  }
  const LANG_NAMES = { en: 'Inglés', es: 'Español', eng: 'Inglés', spa: 'Español', fr: 'Francés', fre: 'Francés', de: 'Alemán', ger: 'Alemán', pt: 'Portugués', por: 'Portugués', it: 'Italiano', ita: 'Italiano' };
  function languageName(code) { return LANG_NAMES[(code || '').toLowerCase()] || (code || '').toUpperCase(); }

  // ----- Online lookup: Open Library first (no key, generous), Google Books as a fallback -----
  async function lookupBook({ title, author, isbn }) {
    const tries = [];
    if (isbn && isbn.length) tries.push(() => openLibrary({ isbn: isbn[0] }));
    if (title) tries.push(() => openLibrary({ title, author: author ? firstAuthor(author) : '' }));
    if (title && author) tries.push(() => openLibrary({ title }));
    if (isbn && isbn.length) tries.push(() => googleBooks(`isbn:${isbn[0]}`));
    if (title) tries.push(() => googleBooks(`intitle:${quote(title)}${author ? ' inauthor:' + quote(firstAuthor(author)) : ''}`));
    for (const t of tries) {
      try { const r = await t(); if (r) return r; } catch (e) { console.warn('lookup step failed', e); }
    }
    return null;
  }
  function quote(s) { return '"' + String(s).replace(/"/g, '') + '"'; }
  function firstAuthor(a) { return String(a).split(/,|;| and | y /i)[0].trim(); }

  async function googleBooks(q) {
    const url = 'https://www.googleapis.com/books/v1/volumes?maxResults=3&printType=books&q=' + encodeURIComponent(q);
    const r = await fetch(url);
    if (!r.ok) return null;
    const d = await r.json();
    const item = (d.items || []).find(i => i.volumeInfo && i.volumeInfo.title);
    if (!item) return null;
    const v = item.volumeInfo;
    const isbn = (v.industryIdentifiers || []).map(x => x.identifier).filter(x => /^\d{9}[\dX]$|^\d{13}$/.test(x));
    return {
      title: v.subtitle ? `${v.title}: ${v.subtitle}` : v.title,
      author: (v.authors || []).join(', '),
      year: v.publishedDate ? parseInt(String(v.publishedDate).slice(0, 4), 10) : null,
      publisher: v.publisher || '',
      pages: v.pageCount || null,
      language: v.language || '',
      isbn,
      description: stripTags(v.description || ''),
      subjects: (v.categories || []).slice(0, 10),
      coverUrl: v.imageLinks && v.imageLinks.thumbnail ? String(v.imageLinks.thumbnail).replace(/^http:/, 'https:') : '',
      source: 'Google Books',
      sourceId: item.id,
    };
  }

  async function openLibrary({ title, author, isbn }) {
    const params = new URLSearchParams({ limit: '3', fields: 'key,title,subtitle,author_name,first_publish_year,number_of_pages_median,isbn,publisher,language,subject,cover_i' });
    if (isbn) params.set('isbn', isbn); else { params.set('title', title); if (author) params.set('author', author); }
    const r = await fetch('https://openlibrary.org/search.json?' + params.toString());
    if (!r.ok) return null;
    const d = await r.json();
    const doc = (d.docs || [])[0];
    if (!doc) return null;
    let description = '';
    try {
      const w = await fetch('https://openlibrary.org' + doc.key + '.json').then(x => x.ok ? x.json() : null);
      if (w && w.description) description = typeof w.description === 'string' ? w.description : (w.description.value || '');
    } catch (e) { /* optional */ }
    return {
      title: doc.subtitle ? `${doc.title}: ${doc.subtitle}` : doc.title,
      author: (doc.author_name || []).slice(0, 4).join(', '),
      year: doc.first_publish_year || null,
      publisher: (doc.publisher || [])[0] || '',
      pages: doc.number_of_pages_median || null,
      language: (doc.language || [])[0] || '',
      isbn: (doc.isbn || []).filter(x => /^\d{13}$|^\d{9}[\dX]$/.test(x)).slice(0, 3),
      description: stripTags(description),
      subjects: (doc.subject || []).slice(0, 10),
      coverUrl: doc.cover_i ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg` : '',
      source: 'Open Library',
      sourceId: doc.key,
    };
  }
  function stripTags(s) { return String(s).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(); }

  // ----- Cover images -----
  const COVER_W = 480, COVER_H = 720; // 2:3; a 240x360 variant is made for small tiles

  // Resizes an image (Blob or canvas) to the cover size and encodes it as WebP when the
  // browser can, otherwise JPEG. Returns { blob, ext }. opts: { width, height, quality }.
  async function encodeCover(source, opts) {
    const W = (opts && opts.width) || COVER_W, H = (opts && opts.height) || COVER_H, Q = (opts && opts.quality) || 0.8;
    let canvas;
    if (source instanceof HTMLCanvasElement) canvas = source;
    else {
      const bmp = await createImageBitmap(source);
      canvas = document.createElement('canvas');
      canvas.width = bmp.width; canvas.height = bmp.height;
      canvas.getContext('2d').drawImage(bmp, 0, 0);
      bmp.close && bmp.close();
    }
    const scale = Math.min(1, W / canvas.width, H / canvas.height);
    if (scale < 1) {
      const c2 = document.createElement('canvas');
      c2.width = Math.round(canvas.width * scale); c2.height = Math.round(canvas.height * scale);
      const ctx = c2.getContext('2d');
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(canvas, 0, 0, c2.width, c2.height);
      canvas = c2;
    }
    const toBlob = (type, q) => new Promise(res => canvas.toBlob(res, type, q));
    let blob = await toBlob('image/webp', Q);
    if (blob && blob.type === 'image/webp') return { blob, ext: 'webp' };
    blob = await toBlob('image/jpeg', Math.min(0.9, Q + 0.05));
    return { blob, ext: 'jpg' };
  }

  // Cover URL for a record; the version keeps browser and edge caches honest when a cover is replaced.
  // size 'sm' returns the 240x360 variant when the record has one (else '').
  function coverUrl(file, size) {
    if (!file || !file.coverB2Name) return '';
    if (size === 'sm' && !file.coverSmallB2Name) return '';
    const v = encodeURIComponent(file.coverB2Name.replace(file.id + '.cover.', ''));
    return '/api/cover/' + encodeURIComponent(file.id) + '?v=' + v + (size === 'sm' ? '&s=sm' : '');
  }

  // Reads page count and the PDF's own Title/Author. Accepts a File or a URL; with a URL only
  // small byte ranges are fetched, so this is cheap even for a 900 MB book. With
  // { thumbnail: maxDimension } it also renders page 1 to a JPEG Blob from the same read,
  // so a local file is only loaded into memory once.
  async function readPdfInfo(source, options) {
    if (!global.pdfjsLib) return null;
    const opts = source instanceof Blob
      ? { data: await source.arrayBuffer() }
      : { url: source, rangeChunkSize: 256 * 1024, disableAutoFetch: true, disableStream: true };
    const task = global.pdfjsLib.getDocument(opts);
    try {
      const pdf = await task.promise;
      let info = {};
      try { info = (await pdf.getMetadata()).info || {}; } catch (e) { /* optional */ }
      const title = cleanPdfString(info.Title), author = cleanPdfString(info.Author);
      const out = { pages: pdf.numPages, title: /^(untitled|microsoft word|document\d*|\.indd|.*\.(doc|docx|indd|qxd|pdf))$/i.test(title) ? '' : title, author, thumbnail: null };
      if (options && options.thumbnail) {
        try {
          const page = await pdf.getPage(1);
          const base = page.getViewport({ scale: 1 });
          const scale = Math.max(1, options.thumbnail / Math.max(base.width, base.height));
          const viewport = page.getViewport({ scale });
          const canvas = document.createElement('canvas');
          canvas.width = Math.floor(viewport.width); canvas.height = Math.floor(viewport.height);
          await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
          out.thumbnail = await encodeCover(canvas); // { blob, ext }
        } catch (e) { console.warn('PDF thumbnail failed', e); }
      }
      return out;
    } finally {
      try { task.destroy(); } catch (e) { /* ignore */ }
    }
  }
  function cleanPdfString(s) {
    if (!s || typeof s !== 'string') return '';
    const t = s.replace(/\s+/g, ' ').trim();
    return t.length > 2 && t.length < 200 ? t : '';
  }

  global.CB = { parseFilename, titleCase, bookTitle, bookAuthor, bookFormat, isPdf, formatSize, formatDate, escapeHtml, languageName, lookupBook, readPdfInfo, encodeCover, coverUrl };
})(window);
