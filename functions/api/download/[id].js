// Cloudflare Pages Function for file downloads from Backblaze B2
// Replaces GET /api/download/:id endpoint

export async function onRequest(context) {
  const { env, request, params } = context;
  
  try {
    const fileId = params.id;
    
    // Get file metadata from KV
    const filesData = await env.CORABOOKS_KV.get('files', 'json') || [];
    const fileInfo = filesData.find(f => f.id === fileId);
    
    if (!fileInfo) {
      return new Response('File not found', { 
        status: 404,
        headers: {
          'Access-Control-Allow-Origin': '*',
        }
      });
    }

    // Get Backblaze B2 credentials from environment
    const b2KeyId = env.B2_APPLICATION_KEY_ID;
    const b2ApplicationKey = env.B2_APPLICATION_KEY;
    const b2BucketName = env.B2_BUCKET_NAME;
    
    if (!b2KeyId || !b2ApplicationKey || !b2BucketName) {
      throw new Error('Backblaze B2 credentials not configured');
    }

    // Step 1: Authorize with B2
    const authResponse = await fetch('https://api.backblazeb2.com/b2api/v2/b2_authorize_account', {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${btoa(`${b2KeyId}:${b2ApplicationKey}`)}`
      }
    });

    if (!authResponse.ok) {
      throw new Error('Failed to authorize with Backblaze B2');
    }

    const authData = await authResponse.json();

    // Step 2: Get file info by name to ensure it exists
    const getFileInfoResponse = await fetch(`${authData.apiUrl}/b2api/v2/b2_list_file_names`, {
      method: 'POST',
      headers: {
        'Authorization': authData.authorizationToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        bucketId: env.B2_BUCKET_ID,
        startFileName: fileInfo.b2FileName,
        maxFileCount: 1
      })
    });

    if (!getFileInfoResponse.ok) {
      console.error('Failed to get file info from B2');
      return new Response('File not found in storage', { status: 404 });
    }

    const fileListData = await getFileInfoResponse.json();
    
    if (!fileListData.files || fileListData.files.length === 0 || fileListData.files[0].fileName !== fileInfo.b2FileName) {
      console.error('File not found in B2:', fileInfo.b2FileName);
      return new Response('File not found in storage', { status: 404 });
    }

    // Step 3: Generate download authorization for private bucket
    const getDownloadAuthResponse = await fetch(`${authData.apiUrl}/b2api/v2/b2_get_download_authorization`, {
      method: 'POST',
      headers: {
        'Authorization': authData.authorizationToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        bucketId: env.B2_BUCKET_ID,
        fileNamePrefix: fileInfo.b2FileName,
        validDurationInSeconds: 3600 // 1 hour
      })
    });

    if (!getDownloadAuthResponse.ok) {
      console.error('Failed to get download authorization');
      return new Response('Failed to authorize download', { status: 500 });
    }

  const downloadAuthData = await getDownloadAuthResponse.json();

  // IMPORTANT: The B2 file name in the URL path MUST be percent-encoded,
  // including commas and other special characters, otherwise B2 returns
  // "Bad character in percent-encoded string" errors.
  const encodedB2Name = encodeURIComponent(fileInfo.b2FileName);

  // Friendly display name; choose disposition based on query param
  const url = new URL(request.url);
  const inline = url.searchParams.get('inline') === '1' || url.searchParams.get('disposition') === 'inline';
    // Build a friendly filename with extension
    let friendlyName = fileInfo.originalName || fileInfo.filename || fileInfo.b2FileName;
    if (!/\.[A-Za-z0-9]{2,8}$/.test(friendlyName || '')) {
      const b2Ext = (fileInfo.b2FileName || '').split('.').pop();
      if (b2Ext) friendlyName = `${friendlyName}.${b2Ext}`;
    }
    const dispositionType = inline ? 'inline' : 'attachment';
    // Build RFC 5987 compliant Content-Disposition with ASCII fallback
    const asciiFallback = (friendlyName || 'download')
      .replace(/[\\/:*?"<>|]/g, '-')
      .replace(/[^\x20-\x7E]/g, '')
      .trim() || 'download';
    const utf8Encoded = encodeURIComponent(friendlyName).replace(/['()]/g, escape).replace(/\*/g, '%2A');
    const contentDisposition = `${dispositionType}; filename="${asciiFallback}"; filename*=UTF-8''${utf8Encoded}`;

    // Proxy the file from B2 with Authorization header so browsers don't prompt for credentials.
    const range = request.headers.get('Range');
    const b2Resp = await fetch(`${authData.downloadUrl}/file/${b2BucketName}/${encodedB2Name}`, {
      method: 'GET',
      headers: {
        'Authorization': downloadAuthData.authorizationToken,
        ...(range ? { 'Range': range } : {}),
      }
    });

    if (!b2Resp.ok && b2Resp.status !== 206) {
      const txt = await b2Resp.text();
      console.error('B2 download failed', b2Resp.status, txt);
      return new Response('Failed to fetch file from storage', { status: 502, headers: corsHeaders() });
    }

    // Prepare response headers
    const headers = new Headers();
    headers.set('Access-Control-Allow-Origin', '*');
    headers.set('Accept-Ranges', b2Resp.headers.get('Accept-Ranges') || 'bytes');
  const ct = fileInfo.contentType || b2Resp.headers.get('Content-Type') || 'application/octet-stream';
  headers.set('Content-Type', ct);
    const cr = b2Resp.headers.get('Content-Range');
    if (cr) headers.set('Content-Range', cr);
    const len = b2Resp.headers.get('Content-Length');
    if (len) headers.set('Content-Length', len);
  headers.set('Content-Disposition', contentDisposition);
    const etag = b2Resp.headers.get('ETag');
    if (etag) headers.set('ETag', etag);
    const lm = b2Resp.headers.get('Last-Modified');
    if (lm) headers.set('Last-Modified', lm);

    return new Response(b2Resp.body, { status: b2Resp.status, headers });

  } catch (error) {
    console.error('Error downloading file:', error);
    return new Response('Failed to download file: ' + error.message, { 
      status: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
      }
    });
  }
}