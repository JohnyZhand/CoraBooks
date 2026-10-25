// Returns a B2 upload URL for a cover image and records the cover name in KV.
// Only allowed while the book is still pending (between /api/upload and /api/commit-upload),
// so nobody can replace the cover of a published book. Image extensions only.
import { COVER_EXTENSIONS, coverContentType, extensionOf, isAdmin } from '../../lib/files.js';
import { b2PresignPut, b2DeleteByName } from '../../lib/b2.js';

export async function onRequest(context) {
  const { env, request } = context;
  if (request.method === 'OPTIONS') return new Response(null, { status: 200, headers: cors() });
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: cors() });
  try {
    const { id, originalFilename } = await request.json();
    if (!id || !originalFilename) return json({ ok: false, message: 'Missing id or originalFilename' }, 400);
    const ext = extensionOf(originalFilename);
    if (!COVER_EXTENSIONS.includes(ext)) return json({ ok: false, message: 'Cover must be a JPG, PNG or WEBP image' }, 400);

    // Load file record
    const files = await env.CORABOOKS_KV.get('files', 'json') || [];
    const idx = files.findIndex(f => f.id === id);
    if (idx === -1) return json({ ok: false, message: 'File not found' }, 404);
    const admin = isAdmin(request, env);
    if (files[idx].ready === true && !admin) return json({ ok: false, message: 'Cover can only be set while the upload is pending' }, 403);

    // Cover filename tied to the file id. Admin replacements get a version stamp so the URL
    // (and therefore browser and edge caches) changes, and the previous file is removed.
    const previous = files[idx].coverB2Name;
    const coverName = admin && previous ? `${id}.cover.${Date.now().toString(36)}.${ext}` : `${id}.cover.${ext}`;
    if (admin && previous && previous !== coverName) {
      try { await b2DeleteByName(env, previous); } catch (e) { /* best effort */ }
    }

    // Presigned S3 PUT for exactly this cover name (1 hour)
    const uploadUrl = await b2PresignPut(env, coverName, 3600);

    // Save cover name on the record (does not mark ready)
    files[idx] = { ...files[idx], coverB2Name: coverName, coverContentType: coverContentType(coverName) };
    await env.CORABOOKS_KV.put('files', JSON.stringify(files));

    return json({ ok: true, uploadUrl, method: 'PUT', coverB2Name: coverName });
  } catch (e) {
    return json({ ok: false, message: e.message }, 500);
  }
}

function cors() { return { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }; }
function json(obj, status=200) { return new Response(JSON.stringify(obj), { status, headers: { ...cors(), 'Content-Type': 'application/json' } }); }
