// Cloudflare Pages Function for file listings
// Replaces GET /api/files endpoint

export async function onRequest(context) {
  const { env, request } = context;
  
  try {
    // Get files metadata from KV storage (Cloudflare's database)
  const filesData = await env.CORABOOKS_KV.get('files', 'json') || [];
  // Only list files that are marked ready; keep legacy items (no ready flag)
  const onlyReady = filesData.filter(f => f && (f.ready === true || typeof f.ready === 'undefined'));
    return new Response(JSON.stringify(onlyReady), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
  } catch (error) {
    console.error('Error loading files:', error);
    return new Response(JSON.stringify({ message: 'Failed to load files' }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }
}