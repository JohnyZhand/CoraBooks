// Admin-only: update a book's curated metadata (and optionally its display title).
// PUT /api/admin/books/:id  with header x-admin-key and JSON body { meta: {...}, filename?: string }
import { sanitizeMeta } from '../../../../lib/meta.js';

export async function onRequest(context) {
  const { env, request, params } = context;
  if (request.method === 'OPTIONS') return new Response(null, { status: 200, headers: cors() });
  if (request.method !== 'PUT' && request.method !== 'PATCH') {
    return new Response('Method not allowed', { status: 405, headers: cors() });
  }

  const provided = request.headers.get('x-admin-key');
  const expected = env.ADMIN_API_KEY;
  if (!expected) return json({ ok: false, message: 'Server admin key not set' }, 500);
  if (!provided || provided !== expected) return json({ ok: false, message: 'Unauthorized' }, 401);

  try {
    const body = await request.json().catch(() => ({}));
    const files = await env.CORABOOKS_KV.get('files', 'json') || [];
    const idx = files.findIndex(f => f && f.id === params.id);
    if (idx === -1) return json({ ok: false, message: 'Not found' }, 404);

    const file = { ...files[idx] };
    if (typeof body.filename === 'string' && body.filename.trim()) {
      file.filename = body.filename.replace(/\s+/g, ' ').trim().slice(0, 200);
    }
    if ('meta' in body) {
      const meta = sanitizeMeta(body.meta);
      if (meta) file.meta = meta; else delete file.meta;
    }
    file.metaUpdatedAt = new Date().toISOString();

    files[idx] = file;
    await env.CORABOOKS_KV.put('files', JSON.stringify(files));
    return json({ ok: true, file });
  } catch (e) {
    return json({ ok: false, message: e.message }, 500);
  }
}

function cors() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'PUT, PATCH, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Key',
  };
}
function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { ...cors(), 'Content-Type': 'application/json' } });
}
