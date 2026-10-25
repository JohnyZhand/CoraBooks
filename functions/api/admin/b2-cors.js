// Admin-only: read or set the B2 bucket's CORS rules so the browser can PUT to presigned S3
// URLs (and keep using the native download API). GET returns the current rules; POST applies
// the rules CoraBooks needs. Requires a B2 key with the writeBuckets capability for POST.
import { getB2Auth } from '../../../lib/b2.js';
import { isAdmin } from '../../../lib/files.js';

export async function onRequest(context) {
  const { env, request } = context;
  if (request.method === 'OPTIONS') return new Response(null, { status: 200, headers: cors() });
  if (!env.ADMIN_API_KEY) return json({ ok: false, message: 'Server admin key not set' }, 500);
  if (!isAdmin(request, env)) return json({ ok: false, message: 'Unauthorized' }, 401);

  try {
    const auth = await getB2Auth(env, true);
    const origin = new URL(request.url).origin;
    const wanted = [{
      corsRuleName: 'corabooks-uploads',
      allowedOrigins: [origin, 'https://corabooks.pages.dev'].filter((v, i, a) => a.indexOf(v) === i),
      allowedHeaders: ['*'],
      exposeHeaders: ['etag', 'x-amz-request-id', 'x-bz-file-id', 'x-bz-content-sha1'],
      allowedOperations: ['s3_put', 's3_get', 's3_head', 'b2_download_file_by_name', 'b2_download_file_by_id', 'b2_upload_file'],
      maxAgeSeconds: 86400,
    }];

    if (request.method === 'GET') {
      const r = await fetch(`${auth.apiUrl}/b2api/v2/b2_list_buckets`, {
        method: 'POST', headers: { Authorization: auth.authorizationToken, 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId: auth.accountId, bucketId: env.B2_BUCKET_ID }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) return json({ ok: false, message: `B2 ${r.status}: ${data.message || data.code || 'list failed'}`, s3ApiUrl: auth.s3ApiUrl }, 502);
      const bucket = (data.buckets || [])[0] || null;
      return json({ ok: true, s3ApiUrl: auth.s3ApiUrl, bucketName: bucket && bucket.bucketName, corsRules: bucket ? bucket.corsRules : null, wanted });
    }

    if (request.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: cors() });
    const r = await fetch(`${auth.apiUrl}/b2api/v2/b2_update_bucket`, {
      method: 'POST', headers: { Authorization: auth.authorizationToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({ accountId: auth.accountId, bucketId: env.B2_BUCKET_ID, corsRules: wanted }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      return json({ ok: false, message: `B2 ${r.status}: ${data.message || data.code || 'update failed'}`, hint: r.status === 401
        ? 'The B2 application key in Cloudflare lacks the writeBuckets capability. Set the CORS rule in the Backblaze web console instead (see scripts/Set-B2Cors.ps1 for the exact rule).'
        : '' }, 502);
    }
    return json({ ok: true, corsRules: data.corsRules, s3ApiUrl: auth.s3ApiUrl });
  } catch (e) {
    return json({ ok: false, message: e.message }, 500);
  }
}

function cors() {
  return { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Key' };
}
function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { ...cors(), 'Content-Type': 'application/json' } });
}
