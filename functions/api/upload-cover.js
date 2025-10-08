// Returns a B2 upload URL/token for uploading a cover image for an existing file
export async function onRequest(context) {
  const { env, request } = context;
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders() });
  }
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders() });
  }
  try {
    const { fileId, ext, contentType, size } = await request.json();
    if (!fileId) return json({ message: 'fileId is required' }, 400);

    const files = await env.CORABOOKS_KV.get('files', 'json') || [];
    const i = files.findIndex(f => f.id === fileId);
    if (i === -1) return json({ message: 'File not found' }, 404);

    const b2KeyId = env.B2_APPLICATION_KEY_ID;
    const b2ApplicationKey = env.B2_APPLICATION_KEY;
    const b2BucketId = env.B2_BUCKET_ID;
    if (!b2KeyId || !b2ApplicationKey || !b2BucketId) {
      return json({ message: 'B2 credentials not configured' }, 500);
    }

    const authResp = await fetch('https://api.backblazeb2.com/b2api/v2/b2_authorize_account', {
      method: 'GET',
      headers: { 'Authorization': `Basic ${btoa(`${b2KeyId}:${b2ApplicationKey}`)}` }
    });
    if (!authResp.ok) {
      const t = await authResp.text();
      return json({ message: `B2 auth failed: ${authResp.status} ${t}` }, 502);
    }
    const auth = await authResp.json();

    const uploadUrlResp = await fetch(`${auth.apiUrl}/b2api/v2/b2_get_upload_url`, {
      method: 'POST',
      headers: { 'Authorization': auth.authorizationToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({ bucketId: b2BucketId })
    });
    if (!uploadUrlResp.ok) return json({ message: 'Failed to get B2 upload URL' }, 502);
    const up = await uploadUrlResp.json();

    const safeExt = (ext || '').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
    const coverB2Name = `${fileId}-cover.${safeExt}`;

    return json({
      uploadUrl: up.uploadUrl,
      authorizationToken: up.authorizationToken,
      coverB2Name,
      contentType: contentType || 'image/jpeg',
      size
    });
  } catch (e) {
    return json({ message: e.message || 'Unexpected error' }, 500);
  }
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}
function json(obj, status = 200) { return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json', ...corsHeaders() } }); }
