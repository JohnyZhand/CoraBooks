// Cloudflare Pages Function for deleting files from Backblaze B2
// Replaces DELETE /api/delete/:id endpoint

export async function onRequest(context) {
  const { env, request, params } = context;
  
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  if (request.method !== 'DELETE') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    const fileId = params.id;
    
    // Get existing files from KV
    const filesData = await env.CORABOOKS_KV.get('files', 'json') || [];
    const fileIndex = filesData.findIndex(f => f.id === fileId);
    
    if (fileIndex === -1) {
      return new Response(JSON.stringify({ message: 'File not found' }), {
        status: 404,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    const fileToDelete = filesData[fileIndex];
    
    // Get Backblaze B2 credentials from environment
    const b2KeyId = env.B2_APPLICATION_KEY_ID;
    const b2ApplicationKey = env.B2_APPLICATION_KEY;
    
    if (!b2KeyId || !b2ApplicationKey) {
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

    // Step 2: Get file info to get file ID
    const listResponse = await fetch(`${authData.apiUrl}/b2api/v2/b2_list_file_names`, {
      method: 'POST',
      headers: {
        'Authorization': authData.authorizationToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        bucketId: env.B2_BUCKET_ID,
        startFileName: fileToDelete.b2FileName,
        maxFileCount: 1
      })
    });

    if (listResponse.ok) {
      const listData = await listResponse.json();
      const file = listData.files.find(f => f.fileName === fileToDelete.b2FileName);
      
      if (file) {
        // Step 3: Delete file from B2
        const deleteResponse = await fetch(`${authData.apiUrl}/b2api/v2/b2_delete_file_version`, {
          method: 'POST',
          headers: {
            'Authorization': authData.authorizationToken,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            fileId: file.fileId,
            fileName: file.fileName
          })
        });

        if (!deleteResponse.ok) {
          console.warn('Failed to delete file from B2, but continuing with metadata cleanup');
        }
      }
    }
    
    // Remove from metadata (always do this, even if B2 delete failed)
    filesData.splice(fileIndex, 1);
    await env.CORABOOKS_KV.put('files', JSON.stringify(filesData));

    return new Response(JSON.stringify({ 
      message: 'File deleted successfully' 
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });

  } catch (error) {
    console.error('Error deleting file:', error);
    return new Response(JSON.stringify({ 
      message: 'Failed to delete file: ' + error.message
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }
}