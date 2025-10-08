// Minimal KV updater to attach metadata like coverB2Name after upload
export async function onRequest(context) {
  const { env, request, params } = context;
  if (request.method === 'OPTIONS') return new Response(null, { status: 200, headers: cors() });
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: cors() });
  const id = params.id;
  try {
    const body = await request.json();
    const files = await env.CORABOOKS_KV.get('files', 'json') || [];
    const i = files.findIndex(f => f.id === id);
    if (i === -1) return json({ message: 'Not found' }, 404);
    files[i] = { ...files[i], ...body };
    await env.CORABOOKS_KV.put('files', JSON.stringify(files));
    return json({ ok: true, file: files[i] });
  } catch (e) {
    return json({ message: e.message || 'Update failed' }, 500);
  }
}

function cors() {
  return { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' };
}
function json(obj, status = 200) { return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json', ...cors() } }); }
