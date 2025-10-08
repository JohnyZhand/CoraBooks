// Returns a B2 upload URL for a cover image and records the cover name in KV
export async function onRequest(context) {
  const { env, request } = context;
  if (request.method === 'OPTIONS') return new Response(null, { status: 200, headers: cors() });
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: cors() });
  try {
    const { id, originalFilename, contentType } = await request.json();
    if (!id || !originalFilename) return json({ ok: false, message: 'Missing id or originalFilename' }, 400);

    // Load file record
    const files = await env.CORABOOKS_KV.get('files', 'json') || [];
    const idx = files.findIndex(f => f.id === id);
    if (idx === -1) return json({ ok: false, message: 'File not found' }, 404);

    // Build a cover filename tied to the file id
    const ext = (originalFilename.split('.').pop() || 'jpg').toLowerCase();
    const coverName = `${id}.cover.${ext}`;

    // Authorize and get upload URL
    const auth = await b2Auth(env);
    const upRes = await fetch(`${auth.apiUrl}/b2api/v2/b2_get_upload_url`, {
      method: 'POST', headers: { 'Authorization': auth.authorizationToken, 'Content-Type': 'application/json' }, body: JSON.stringify({ bucketId: env.B2_BUCKET_ID })
    });
    if (!upRes.ok) return json({ ok: false, message: 'Failed to get cover upload URL' }, 500);
    const up = await upRes.json();

    // Save cover name on the record (does not mark ready)
    files[idx] = { ...files[idx], coverB2Name: coverName, coverContentType: contentType || 'image/jpeg' };
    await env.CORABOOKS_KV.put('files', JSON.stringify(files));

    return json({ ok: true, uploadUrl: up.uploadUrl, authorizationToken: up.authorizationToken, coverB2Name: coverName });
  } catch (e) {
    return json({ ok: false, message: e.message }, 500);
  }
}

function cors() { return { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }; }
function json(obj, status=200) { return new Response(JSON.stringify(obj), { status, headers: { ...cors(), 'Content-Type': 'application/json' } }); }
async function b2Auth(env) {
  const r = await fetch('https://api.backblazeb2.com/b2api/v2/b2_authorize_account', { headers: { Authorization: `Basic ${btoa(env.B2_APPLICATION_KEY_ID+":"+env.B2_APPLICATION_KEY)}` } });
  if (!r.ok) throw new Error('B2 auth failed');
  return await r.json();
}
