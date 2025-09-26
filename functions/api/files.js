// Cloudflare Pages Function for file listings
// Replaces GET /api/files endpoint

export async function onRequest(context) {
  const { env, request } = context;
  
  try {
    // Get files metadata from KV storage (Cloudflare's database)
    const filesData = await env.CORABOOKS_KV.get('files', 'json') || [];
    
    return new Response(JSON.stringify(filesData), {
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