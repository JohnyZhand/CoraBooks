// Cloudflare Pages Function: streams a book from Backblaze B2.
//
// - Supports HTTP Range requests (used by the in-site reader to fetch only the pages
//   being viewed) and `?inline=1` (Content-Disposition inline instead of attachment).
// - Full downloads of files up to 512 MB are stored in the Cloudflare edge cache for an
//   hour; later full or range requests for the same file are served from the edge.
// - B2 authorization is cached in KV (see lib/b2.js), so a request costs one B2 call.

import { b2DownloadByName } from '../../../lib/b2.js';
import { bookContentType } from '../../../lib/files.js';

const MAX_CACHE_BYTES = 512 * 1024 * 1024;

export async function onRequest(context) {
  const { env, request, params } = context;

  try {
    const fileId = params.id;
    const filesData = await env.CORABOOKS_KV.get('files', 'json') || [];
    const fileInfo = filesData.find(f => f.id === fileId);
    if (!fileInfo) return text('File not found', 404);

    if (!env.B2_APPLICATION_KEY_ID || !env.B2_APPLICATION_KEY || !env.B2_BUCKET_NAME) {
      throw new Error('Backblaze B2 credentials not configured');
    }

    const url = new URL(request.url);
    const inline = url.searchParams.get('inline') === '1' || url.searchParams.get('disposition') === 'inline';
    const range = request.headers.get('Range');
    const contentDisposition = buildContentDisposition(fileInfo, inline);

    // Edge cache key: one entry per stored file, independent of inline/attachment
    const cache = caches.default;
    const cacheKeyUrl = new URL(request.url);
    cacheKeyUrl.pathname = `/__download-cache/${fileInfo.id}`;
    cacheKeyUrl.search = `?v=${encodeURIComponent(fileInfo.b2FileName)}`;
    const cacheKey = new Request(cacheKeyUrl.toString(), { method: 'GET', headers: range ? { Range: range } : {} });

    // 1) Serve from the edge cache when possible. Cloudflare answers a Range request
    //    against a cached full body with a 206; anything else means fetch from B2.
    try {
      const cached = await cache.match(cacheKey);
      if (cached && (range ? cached.status === 206 : cached.status === 200)) {
        const headers = new Headers(cached.headers);
        headers.set('Content-Disposition', contentDisposition);
        headers.set('Access-Control-Allow-Origin', '*');
        headers.set('X-CoraBooks-Cache', 'hit');
        return new Response(cached.body, { status: cached.status, headers });
      }
    } catch (e) { /* cache is best-effort */ }

    // 2) Fetch from B2 (with Range passthrough)
    const b2Resp = await b2DownloadByName(env, fileInfo.b2FileName, range ? { Range: range } : {});

    if (b2Resp.status === 404) return text('File not found in storage', 404);
    if (!b2Resp.ok && b2Resp.status !== 206) {
      const txt = await b2Resp.text().catch(() => '');
      console.error('B2 download failed', b2Resp.status, txt);
      return text('Failed to fetch file from storage', 502);
    }

    const headers = new Headers();
    headers.set('Access-Control-Allow-Origin', '*');
    headers.set('Accept-Ranges', 'bytes');
    // Type comes from the stored file name, never from what the uploader claimed
    headers.set('Content-Type', bookContentType(fileInfo.b2FileName));
    headers.set('X-Content-Type-Options', 'nosniff');
    headers.set('Content-Disposition', contentDisposition);
    for (const h of ['Content-Range', 'Content-Length', 'ETag', 'Last-Modified']) {
      const v = b2Resp.headers.get(h);
      if (v) headers.set(h, v);
    }
    headers.set('X-CoraBooks-Cache', 'miss');

    const response = new Response(b2Resp.body, { status: b2Resp.status, headers });

    // 3) Populate the edge cache from full, non-inline downloads of files up to 512 MB.
    //    Inline/range requests (the reader) are skipped: PDF.js aborts its first full
    //    request after reading the headers, and filling the cache from that would pull
    //    the whole file out of B2 for nothing.
    try {
      const size = Number(b2Resp.headers.get('Content-Length') || fileInfo.size || 0);
      if (!range && !inline && b2Resp.status === 200 && size > 0 && size <= MAX_CACHE_BYTES) {
        headers.set('Cache-Control', 'public, max-age=3600, immutable');
        const cacheable = new Response(response.clone().body, { status: 200, headers });
        context.waitUntil(cache.put(new Request(cacheKeyUrl.toString(), { method: 'GET' }), cacheable));
      }
    } catch (e) { /* best-effort */ }

    return response;
  } catch (error) {
    console.error('Error downloading file:', error);
    return text('Failed to download file: ' + error.message, 500);
  }
}

function buildContentDisposition(fileInfo, inline) {
  let friendlyName = fileInfo.originalName || fileInfo.filename || fileInfo.b2FileName;
  if (!/\.[A-Za-z0-9]{2,8}$/.test(friendlyName || '')) {
    const b2Ext = (fileInfo.b2FileName || '').split('.').pop();
    if (b2Ext) friendlyName = `${friendlyName}.${b2Ext}`;
  }
  const asciiFallback = (friendlyName || 'download')
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/[^\x20-\x7E]/g, '')
    .trim() || 'download';
  const utf8Encoded = encodeURIComponent(friendlyName).replace(/['()]/g, escape).replace(/\*/g, '%2A');
  return `${inline ? 'inline' : 'attachment'}; filename="${asciiFallback}"; filename*=UTF-8''${utf8Encoded}`;
}

function text(body, status) {
  return new Response(body, { status, headers: { 'Access-Control-Allow-Origin': '*' } });
}
