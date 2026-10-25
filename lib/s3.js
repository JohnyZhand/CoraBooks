// AWS Signature Version 4 presigned URLs, used with Backblaze B2's S3-compatible API.
//
// A presigned PUT is bound to one bucket + key, one HTTP method and an expiry, so handing it
// to the browser lets it upload exactly that object and nothing else. (B2's native
// b2_get_upload_url token, by contrast, allows uploading to any name in the bucket.)
//
// Query-string auth, path-style URL, payload unsigned (the standard presigned-URL form).

const enc = new TextEncoder();

function hex(buf) {
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}
async function sha256Hex(str) {
  return hex(await crypto.subtle.digest('SHA-256', enc.encode(str)));
}
async function hmac(key, data) {
  const k = await crypto.subtle.importKey('raw', key instanceof Uint8Array ? key : enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode(data)));
}
// RFC 3986 encoding as SigV4 wants it ('/' kept only when encoding a path)
function uriEncode(str, isPath) {
  return encodeURIComponent(str)
    .replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase())
    .replace(/%2F/g, isPath ? '/' : '%2F');
}
function amzDate(d) {
  return d.toISOString().replace(/[:-]|\.\d{3}/g, '');
}

/**
 * Builds a presigned URL.
 * @param {object} p
 * @param {string} p.method       'PUT' | 'GET' ...
 * @param {string} p.endpoint     e.g. 'https://s3.us-west-004.backblazeb2.com'
 * @param {string} p.region       e.g. 'us-west-004'
 * @param {string} p.bucket       bucket name (path-style: /bucket/key)
 * @param {string} p.key          object key
 * @param {string} p.accessKeyId  B2 keyID
 * @param {string} p.secretKey    B2 applicationKey
 * @param {number} p.expires      seconds, max 604800
 * @param {Date}   [p.now]
 * @param {string} [p.service]    default 's3'
 */
export async function presign(p) {
  const now = p.now || new Date();
  const datetime = amzDate(now);
  const date = datetime.slice(0, 8);
  const service = p.service || 's3';
  const scope = `${date}/${p.region}/${service}/aws4_request`;
  const url = new URL(p.endpoint);
  const host = url.host;
  const canonicalUri = (url.pathname.replace(/\/$/, '') + '/' + (p.bucket ? uriEncode(p.bucket, false) + '/' : '') + uriEncode(p.key, true));

  const params = {
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': `${p.accessKeyId}/${scope}`,
    'X-Amz-Date': datetime,
    'X-Amz-Expires': String(p.expires),
    'X-Amz-SignedHeaders': 'host',
  };
  const canonicalQuery = Object.keys(params).sort()
    .map(k => `${uriEncode(k, false)}=${uriEncode(params[k], false)}`).join('&');

  const canonicalRequest = [
    p.method, canonicalUri, canonicalQuery,
    `host:${host}\n`,        // canonical headers (each ends with \n)
    'host',                   // signed headers
    'UNSIGNED-PAYLOAD',
  ].join('\n');

  const stringToSign = ['AWS4-HMAC-SHA256', datetime, scope, await sha256Hex(canonicalRequest)].join('\n');

  const kDate = await hmac('AWS4' + p.secretKey, date);
  const kRegion = await hmac(kDate, p.region);
  const kService = await hmac(kRegion, service);
  const kSigning = await hmac(kService, 'aws4_request');
  const signature = hex(await hmac(kSigning, stringToSign));

  return `${url.origin}${canonicalUri}?${canonicalQuery}&X-Amz-Signature=${signature}`;
}

// B2's S3 endpoint looks like https://s3.us-west-004.backblazeb2.com -> region us-west-004
export function regionFromEndpoint(endpoint) {
  const m = String(endpoint || '').match(/^https?:\/\/s3\.([a-z0-9-]+)\.backblazeb2\.com/i);
  return m ? m[1] : null;
}
