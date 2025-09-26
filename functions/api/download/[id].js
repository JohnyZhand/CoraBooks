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

    // Step 2: Generate authorized download URL for private bucket
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
      // Fallback to basic download URL if authorization fails
      const downloadUrl = `${authData.downloadUrl}/file/${b2BucketName}/${fileInfo.b2FileName}`;
      return Response.redirect(downloadUrl, 302);
    }

    const downloadAuthData = await getDownloadAuthResponse.json();
    
    // Generate authorized download URL
    const authorizedDownloadUrl = `${authData.downloadUrl}/file/${b2BucketName}/${fileInfo.b2FileName}?Authorization=${downloadAuthData.authorizationToken}`;
    
    return Response.redirect(authorizedDownloadUrl, 302);

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