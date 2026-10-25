// Book metadata shared by the upload and admin endpoints.
//
// A file record may carry a `meta` object with curated details (title, author,
// year, pages, ISBN, description...). It is filled from the PDF's own metadata
// and from a Google Books / Open Library lookup done in the browser, then
// reviewed by whoever uploads or by the admin. Everything is optional.

const STR = (v, max) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');
const INT = (v, min, max) => {
  const n = typeof v === 'number' ? v : parseInt(String(v || ''), 10);
  return Number.isFinite(n) && n >= min && n <= max ? Math.round(n) : null;
};
const LIST = (v, max, each) => (Array.isArray(v) ? v.map(x => STR(x, each)).filter(Boolean).slice(0, max) : []);

export const META_FIELDS = ['title', 'author', 'edition', 'year', 'publisher', 'pages', 'language', 'isbn', 'description', 'subjects', 'source', 'sourceId', 'coverUrl'];

// Returns a clean meta object, or null when nothing useful was provided.
export function sanitizeMeta(input) {
  if (!input || typeof input !== 'object') return null;
  const m = {
    title: STR(input.title, 200),
    author: STR(input.author, 200),
    edition: STR(input.edition, 60),
    year: INT(input.year, 1400, 2100),
    publisher: STR(input.publisher, 120),
    pages: INT(input.pages, 1, 100000),
    language: STR(input.language, 20).toLowerCase(),
    isbn: LIST(input.isbn, 5, 20).map(s => s.replace(/[^0-9Xx]/g, '').toUpperCase()).filter(s => s.length === 10 || s.length === 13),
    description: STR(input.description, 2000),
    subjects: LIST(input.subjects, 10, 60),
    source: STR(input.source, 30),
    sourceId: STR(input.sourceId, 80),
    coverUrl: STR(input.coverUrl, 300),
  };
  if (m.coverUrl && !/^https:\/\//.test(m.coverUrl)) m.coverUrl = '';
  // Drop empty values so the stored record stays small
  for (const k of Object.keys(m)) {
    const v = m[k];
    if (v === null || v === '' || (Array.isArray(v) && v.length === 0)) delete m[k];
  }
  return Object.keys(m).length ? m : null;
}
