// Simple admin auth check; requires x-admin-key header matching env.ADMIN_API_KEY
export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: corsHeaders(),
    });
  }

  if (request.method !== 'GET') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders() });
  }

  const headerKey = request.headers.get('x-admin-key');
  const adminKey = env.ADMIN_API_KEY;

  if (!adminKey) {
    return new Response(JSON.stringify({ ok: false, message: 'Server admin key not set' }), { status: 500, headers: jsonCors() });
  }

  if (!headerKey || headerKey !== adminKey) {
    return new Response(JSON.stringify({ ok: false }), { status: 401, headers: jsonCors() });
  }

  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: jsonCors() });
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Key',
  };
}

function jsonCors() {
  return { ...corsHeaders(), 'Content-Type': 'application/json' };
}
