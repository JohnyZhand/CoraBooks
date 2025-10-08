// Minimal KV updater to attach metadata like coverB2Name after upload
export async function onRequest(context) {
  const { request } = context;
  if (request.method === 'OPTIONS') return new Response(null, { status: 200, headers: cors() });
  // Legacy endpoint: deprecated in favor of commit-upload and cover-upload flows
  return json({ message: 'update endpoint is deprecated. Use the new commit/cover flows.' }, 410);
}

function cors() {
  return { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' };
}
function json(obj, status = 200) { return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json', ...cors() } }); }
