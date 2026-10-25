// Shared Backblaze B2 helpers for the Pages Functions.
//
// b2_authorize_account tokens are valid for 24 h, so we cache one in KV for a few
// hours instead of re-authorizing on every request. That matters for the reader,
// which issues dozens of small range requests per book.

const KV_KEY = 'b2:auth';
const CACHE_SECONDS = 6 * 60 * 60;

export async function b2Authorize(env) {
  const r = await fetch('https://api.backblazeb2.com/b2api/v2/b2_authorize_account', {
    headers: { Authorization: `Basic ${btoa(`${env.B2_APPLICATION_KEY_ID}:${env.B2_APPLICATION_KEY}`)}` },
  });
  if (!r.ok) throw new Error(`B2 auth failed: ${r.status}`);
  const data = await r.json();
  return { apiUrl: data.apiUrl, downloadUrl: data.downloadUrl, authorizationToken: data.authorizationToken };
}

// Returns { apiUrl, downloadUrl, authorizationToken }, from KV when fresh.
// Pass force=true after a 401/403 from B2 to discard the cached token.
export async function getB2Auth(env, force = false) {
  if (!force) {
    try {
      const cached = await env.CORABOOKS_KV.get(KV_KEY, 'json');
      if (cached && cached.authorizationToken && cached.expiresAt > Date.now() + 60_000) return cached;
    } catch (e) { /* fall through to a fresh authorization */ }
  }
  const auth = await b2Authorize(env);
  const record = { ...auth, expiresAt: Date.now() + CACHE_SECONDS * 1000 };
  try {
    await env.CORABOOKS_KV.put(KV_KEY, JSON.stringify(record), { expirationTtl: CACHE_SECONDS });
  } catch (e) { /* caching is best-effort */ }
  return record;
}

// Fetches a file from the private bucket with the account token. Retries once with
// a fresh token if B2 rejects the cached one.
export async function b2DownloadByName(env, fileName, extraHeaders = {}) {
  let auth = await getB2Auth(env);
  const doFetch = (a) => fetch(`${a.downloadUrl}/file/${env.B2_BUCKET_NAME}/${encodeURIComponent(fileName)}`, {
    headers: { Authorization: a.authorizationToken, ...extraHeaders },
  });
  let resp = await doFetch(auth);
  if (resp.status === 401 || resp.status === 403) {
    auth = await getB2Auth(env, true);
    resp = await doFetch(auth);
  }
  return resp;
}

// Deletes every version of a file by name (best effort). Returns how many versions were removed.
export async function b2DeleteByName(env, fileName) {
  if (!fileName) return 0;
  const auth = await getB2Auth(env);
  let removed = 0;
  for (let round = 0; round < 10; round++) {
    const res = await fetch(`${auth.apiUrl}/b2api/v2/b2_list_file_versions`, {
      method: 'POST',
      headers: { Authorization: auth.authorizationToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({ bucketId: env.B2_BUCKET_ID, startFileName: fileName, prefix: fileName, maxFileCount: 100 }),
    });
    if (!res.ok) break;
    const data = await res.json();
    const versions = (data.files || []).filter(f => f.fileName === fileName);
    if (!versions.length) break;
    for (const v of versions) {
      const del = await fetch(`${auth.apiUrl}/b2api/v2/b2_delete_file_version`, {
        method: 'POST',
        headers: { Authorization: auth.authorizationToken, 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileId: v.fileId, fileName: v.fileName }),
      });
      if (del.ok) removed++;
    }
    if (versions.length < 100) break;
  }
  return removed;
}
