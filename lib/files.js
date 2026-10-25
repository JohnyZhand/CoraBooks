// Small shared helpers for the Pages Functions: content types derived from file names
// (never from the client), input caps, and a timing-safe key comparison.

const BOOK_TYPES = {
  pdf: 'application/pdf',
  epub: 'application/epub+zip',
  mobi: 'application/x-mobipocket-ebook',
};
const COVER_TYPES = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

export function extensionOf(name) {
  const s = String(name || '');
  const i = s.lastIndexOf('.');
  return i > -1 ? s.slice(i + 1).toLowerCase() : '';
}

export const BOOK_EXTENSIONS = Object.keys(BOOK_TYPES);
export const COVER_EXTENSIONS = Object.keys(COVER_TYPES);

// Content type for a stored book, by its stored file name. Unknown -> octet-stream.
export function bookContentType(name) {
  return BOOK_TYPES[extensionOf(name)] || 'application/octet-stream';
}
// Content type for a stored cover; null when the extension is not an allowed image type.
export function coverContentType(name) {
  return COVER_TYPES[extensionOf(name)] || null;
}

export function capString(v, max) {
  return typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

// Constant-time string comparison for the admin key.
export function safeEqual(a, b) {
  const x = String(a || ''), y = String(b || '');
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return diff === 0;
}

export function isAdmin(request, env) {
  const expected = env.ADMIN_API_KEY;
  const provided = request.headers.get('x-admin-key');
  return !!expected && !!provided && safeEqual(provided, expected);
}
