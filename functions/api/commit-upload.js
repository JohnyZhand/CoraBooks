// Marks a pending file as ready after verifying it exists in B2
export async function onRequest(context) {
  const { env, request } = context;
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: cors() });
  }
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: cors() });
  }
  try {
    const { id } = await request.json();
    if (!id) return json({ ok: false, message: 'Missing id' }, 400);

    const files = await env.CORABOOKS_KV.get('files', 'json') || [];
    const idx = files.findIndex(f => f.id === id);
    if (idx === -1) return json({ ok: false, message: 'Not found' }, 404);
    const file = files[idx];

    // If already ready, just return
    if (file.ready) return json({ ok: true, already: true });

    // Verify existence in B2 by listing the exact file name
    const auth = await b2Auth(env);
    const listRes = await fetch(`${auth.apiUrl}/b2api/v2/b2_list_file_names`, {
      method: 'POST', headers: {
        'Authorization': auth.authorizationToken,
        'Content-Type': 'application/json'
      }, body: JSON.stringify({ bucketId: env.B2_BUCKET_ID, startFileName: file.b2FileName, maxFileCount: 1 })
    });
    const listData = await listRes.json();
    const listed = listRes.ok ? (listData.files?.[0] || null) : null;
    const exists = !!listed && listed.fileName === file.b2FileName;

    // If the file does not exist in B2 at commit time, treat it as a failed upload and delete metadata
    if (!exists) {
      files.splice(idx, 1);
      await env.CORABOOKS_KV.put('files', JSON.stringify(files));
      return json({ ok: false, cleaned: true, reason: 'not_found' }, 410);
    }

    // Verify size matches what the client reported
    const b2Size = listed.contentLength ?? listed.size; // different B2 APIs may return either
    if (typeof b2Size === 'number' && typeof file.size === 'number' && b2Size !== file.size) {
      // Delete the incorrect file from B2 and remove metadata
      try {
        await fetch(`${auth.apiUrl}/b2api/v2/b2_delete_file_version`, {
          method: 'POST',
          headers: { 'Authorization': auth.authorizationToken, 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileId: listed.fileId, fileName: listed.fileName })
        });
      } catch (e) { /* best-effort */ }
      files.splice(idx, 1);
      await env.CORABOOKS_KV.put('files', JSON.stringify(files));
      return json({ ok: false, cleaned: true, reason: 'size_mismatch' }, 422);
    }

    // Looks good; mark ready
    files[idx] = { ...file, ready: true };
    await env.CORABOOKS_KV.put('files', JSON.stringify(files));
    return json({ ok: true });
  } catch (e) {
    return json({ ok: false, message: e.message }, 500);
  }
}

function cors() {
  return { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
}
function json(obj, status = 200) { return new Response(JSON.stringify(obj), { status, headers: { ...cors(), 'Content-Type': 'application/json' } }); }
async function b2Auth(env) {
  const r = await fetch('https://api.backblazeb2.com/b2api/v2/b2_authorize_account', { headers: { Authorization: `Basic ${btoa(env.B2_APPLICATION_KEY_ID+":"+env.B2_APPLICATION_KEY)}` } });
  if (!r.ok) throw new Error('B2 auth failed');
  return await r.json();
}