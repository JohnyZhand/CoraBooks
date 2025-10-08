// Admin-only endpoint to clean up stale or broken uploads.
// - Removes KV entries where ready !== true and older than a threshold
// - Verifies presence/size in B2; if missing or mismatched, deletes the B2 file (if exists) and removes KV entry
// - Returns a summary of actions
export async function onRequest(context) {
  const { env, request } = context;

  // CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: cors() });
  }
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: cors() });
  }

  // Admin auth
  const provided = request.headers.get('x-admin-key');
  const expected = env.ADMIN_API_KEY;
  if (!expected || !provided || provided !== expected) {
    return json({ ok: false, message: 'Unauthorized' }, 401);
  }

  try {
    const now = Date.now();
    const maxAgeMs = 6 * 60 * 60 * 1000; // 6 hours default threshold for pending items
    const { thresholdMs } = await safeJson(request);
    const ageLimit = typeof thresholdMs === 'number' && thresholdMs > 0 ? thresholdMs : maxAgeMs;

    const files = await env.CORABOOKS_KV.get('files', 'json') || [];
    if (!Array.isArray(files) || files.length === 0) return json({ ok: true, scanned: 0, removed: 0, deletedFromB2: 0 });

    // Authorize once with B2
    const auth = await b2Auth(env);

    let scanned = 0, removed = 0, deletedFromB2 = 0, kept = 0;
    const keep = [];

    for (const f of files) {
      scanned++;
      try {
        // Keep any ready entries
        if (f?.ready === true || typeof f?.ready === 'undefined') { keep.push(f); kept++; continue; }
        // Skip very recent pending items
        const uploadedAtMs = (f?.uploadedAt ? Date.parse(f.uploadedAt) : NaN);
        if (!Number.isNaN(uploadedAtMs) && (now - uploadedAtMs) < ageLimit) { keep.push(f); kept++; continue; }
        // Verify presence
        const listed = await listOne(auth, env.B2_BUCKET_ID, f?.b2FileName);
        if (!listed) {
          // Missing in B2: drop KV
          removed++;
          continue;
        }
        // Check size match
        const b2Size = listed.contentLength ?? listed.size;
        if (typeof b2Size === 'number' && typeof f.size === 'number' && b2Size !== f.size) {
          // Delete B2 version
          try {
            await b2Delete(auth, listed.fileId, listed.fileName);
            deletedFromB2++;
          } catch (e) { /* best-effort */ }
          removed++;
          continue;
        }
        // At this point it's present and size matches. It might be stuck pending: promote to ready.
        keep.push({ ...f, ready: true });
      } catch (e) {
        // On unexpected error, keep the entry for safety
        keep.push(f);
      }
    }

    await env.CORABOOKS_KV.put('files', JSON.stringify(keep));
    return json({ ok: true, scanned, kept, removed, deletedFromB2 });
  } catch (e) {
    return json({ ok: false, message: e.message }, 500);
  }
}

function cors() {
  return { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Key', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
}
function json(obj, status = 200) { return new Response(JSON.stringify(obj), { status, headers: { ...cors(), 'Content-Type': 'application/json' } }); }
async function safeJson(request) { try { return await request.json(); } catch { return {}; } }
async function b2Auth(env) {
  const r = await fetch('https://api.backblazeb2.com/b2api/v2/b2_authorize_account', { headers: { Authorization: `Basic ${btoa(env.B2_APPLICATION_KEY_ID+":"+env.B2_APPLICATION_KEY)}` } });
  if (!r.ok) throw new Error('B2 auth failed');
  return await r.json();
}
async function listOne(auth, bucketId, fileName) {
  if (!fileName) return null;
  const res = await fetch(`${auth.apiUrl}/b2api/v2/b2_list_file_names`, {
    method: 'POST', headers: { 'Authorization': auth.authorizationToken, 'Content-Type': 'application/json' },
    body: JSON.stringify({ bucketId, startFileName: fileName, maxFileCount: 1 })
  });
  if (!res.ok) return null;
  const data = await res.json();
  const item = data.files?.[0];
  if (item && item.fileName === fileName) return item;
  return null;
}
async function b2Delete(auth, fileId, fileName) {
  return fetch(`${auth.apiUrl}/b2api/v2/b2_delete_file_version`, {
    method: 'POST', headers: { 'Authorization': auth.authorizationToken, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileId, fileName })
  });
}
