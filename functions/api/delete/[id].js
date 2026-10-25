// Admin-only: delete a book. Removes the file and its cover from B2 (all versions),
// then drops the record from KV. The KV record is removed even if B2 cleanup fails.
import { b2DeleteByName } from '../../../lib/b2.js';
import { isAdmin } from '../../../lib/files.js';

export async function onRequest(context) {
  const { env, request, params } = context;

  if (request.method === 'OPTIONS') return new Response(null, { status: 200, headers: cors() });
  if (request.method !== 'DELETE') return new Response('Method not allowed', { status: 405, headers: cors() });

  if (!env.ADMIN_API_KEY) return json({ message: 'Server admin key not set' }, 500);
  if (!isAdmin(request, env)) return json({ message: 'Unauthorized' }, 401);

  try {
    const filesData = await env.CORABOOKS_KV.get('files', 'json') || [];
    const fileIndex = filesData.findIndex(f => f && f.id === params.id);
    if (fileIndex === -1) return json({ message: 'File not found' }, 404);
    const fileToDelete = filesData[fileIndex];

    let deleted = { file: 0, cover: 0 };
    try { deleted.file = await b2DeleteByName(env, fileToDelete.b2FileName); } catch (e) { console.warn('B2 file delete failed', e); }
    try { deleted.cover = await b2DeleteByName(env, fileToDelete.coverB2Name); } catch (e) { console.warn('B2 cover delete failed', e); }
    try { if (fileToDelete.coverSmallB2Name) deleted.cover += await b2DeleteByName(env, fileToDelete.coverSmallB2Name); } catch (e) { /* best effort */ }

    filesData.splice(fileIndex, 1);
    await env.CORABOOKS_KV.put('files', JSON.stringify(filesData));


    return json({ message: 'File deleted successfully', deleted });
  } catch (error) {
    console.error('Error deleting file:', error);
    return json({ message: 'Failed to delete file: ' + error.message }, 500);
  }
}

function cors() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Key',
  };
}
function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { ...cors(), 'Content-Type': 'application/json' } });
}
