// Streams a book's cover image from B2.
// Edge cache is checked first, keyed by book id only, so cache hits cost no KV read.
// Covers are set once per id while the upload is pending and never change afterwards.
import { b2DownloadByName } from '../../../lib/b2.js';
import { coverContentType } from '../../../lib/files.js';

export async function onRequest(context) {
  const { env, params, request } = context;
  const fileId = params.id;
  const cors = { 'Access-Control-Allow-Origin': '*' };
  if (!/^[\w-]{1,64}$/.test(fileId || '')) return new Response('Not Found', { status: 404, headers: cors });

  // ?v= is the cover's version (part of its stored name); a replaced cover gets a new URL,
  // so each version can be cached for a year.
  const url = new URL(request.url);
  const version = (url.searchParams.get('v') || '').replace(/[^\w.-]/g, '').slice(0, 40);
  const small = url.searchParams.get('s') === 'sm';
  const cache = caches.default;
  const cacheKey = new Request(`https://cache.internal/cover/${fileId}/${version || 'v0'}${small ? '/sm' : ''}`, { method: 'GET' });
  try {
    const cached = await cache.match(cacheKey);
    if (cached) return cached;
  } catch (e) { /* cache is best-effort */ }

  try {
    const files = await env.CORABOOKS_KV.get('files', 'json') || [];
    const f = files.find(x => x && x.id === fileId);
    if (!f || !f.coverB2Name) return new Response('Not Found', { status: 404, headers: cors });
    if (!env.B2_APPLICATION_KEY_ID || !env.B2_APPLICATION_KEY || !env.B2_BUCKET_NAME) return new Response('Server config', { status: 500 });

    // Type comes from the stored cover name; anything that is not an image is refused
    const name = small && f.coverSmallB2Name ? f.coverSmallB2Name : f.coverB2Name;
    const type = coverContentType(name);
    if (!type) return new Response('Not Found', { status: 404, headers: cors });

    const b2Resp = await b2DownloadByName(env, name);
    if (!b2Resp.ok) return new Response('Not Found', { status: 404, headers: cors });

    const headers = new Headers(cors);
    headers.set('Content-Type', type);
    headers.set('X-Content-Type-Options', 'nosniff');
    headers.set('Content-Disposition', 'inline');
    headers.set('Cache-Control', version ? 'public, max-age=31536000, immutable' : 'public, max-age=86400');
    const resp = new Response(b2Resp.body, { status: 200, headers });
    try { context.waitUntil(cache.put(cacheKey, resp.clone())); } catch (e) { /* best-effort */ }
    return resp;
  } catch (e) {
    return new Response('Error', { status: 500, headers: cors });
  }
}
