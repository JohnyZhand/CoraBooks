// Streams the cover image from B2 if it exists
export async function onRequest(context) {
  const { env, params } = context;
  const fileId = params.id;
  try {
    const files = await env.CORABOOKS_KV.get('files', 'json') || [];
    const f = files.find(x => x.id === fileId);
    if (!f || !f.coverB2Name) return new Response('Not Found', { status: 404, headers: { 'Access-Control-Allow-Origin': '*' } });

    const b2KeyId = env.B2_APPLICATION_KEY_ID;
    const b2ApplicationKey = env.B2_APPLICATION_KEY;
    const b2BucketId = env.B2_BUCKET_ID;
    const b2BucketName = env.B2_BUCKET_NAME;
    if (!b2KeyId || !b2ApplicationKey || !b2BucketId || !b2BucketName) return new Response('Server config', { status: 500 });

    const authResp = await fetch('https://api.backblazeb2.com/b2api/v2/b2_authorize_account', {
      method: 'GET', headers: { 'Authorization': `Basic ${btoa(`${b2KeyId}:${b2ApplicationKey}`)}` }
    });
    if (!authResp.ok) return new Response('Auth failed', { status: 502 });
    const auth = await authResp.json();

    const b2Resp = await fetch(`${auth.downloadUrl}/file/${b2BucketName}/${encodeURIComponent(f.coverB2Name)}`, {
      headers: { 'Authorization': auth.authorizationToken }
    });
    if (!b2Resp.ok) return new Response('Not Found', { status: 404 });

    const headers = new Headers();
    headers.set('Access-Control-Allow-Origin', '*');
    headers.set('Content-Type', f.coverContentType || b2Resp.headers.get('Content-Type') || 'image/jpeg');
    const cc = b2Resp.headers.get('Cache-Control') || 'public, max-age=3600';
    headers.set('Cache-Control', cc);
    return new Response(b2Resp.body, { status: 200, headers });
  } catch (e) {
    return new Response('Error', { status: 500, headers: { 'Access-Control-Allow-Origin': '*' } });
  }
}
