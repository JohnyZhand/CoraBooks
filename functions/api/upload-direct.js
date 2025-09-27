// Cloudflare Pages Function for handling file uploads through our server to B2
// This bypasses CORS issues by proxying the upload

export async function onRequest(context) {
  const { env, request } = context;
  
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
  }

  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    // Get the file data and metadata from the multipart form
    const formData = await request.formData();
    const file = formData.get('file');
    const fileName = formData.get('fileName');
    const b2FileName = formData.get('b2FileName');
    const uploadUrl = formData.get('uploadUrl');
    const authToken = formData.get('authToken');

    if (!file || !fileName || !b2FileName || !uploadUrl || !authToken) {
      return new Response(JSON.stringify({ 
        message: 'Missing required fields' 
      }), { status: 400 });
    }

    console.log('Proxying upload to B2:', {
      fileName: b2FileName,
      fileSize: file.size,
      uploadUrl: uploadUrl.substring(0, 50) + '...'
    });

    // Create the upload request to B2
    const uploadHeaders = {
      'Authorization': authToken,
      'X-Bz-File-Name': encodeURIComponent(b2FileName),
      'Content-Type': file.type || 'b2/x-auto',
      'X-Bz-Content-Sha1': 'unverified'
    };

    // Upload to B2 through our server
    const b2Response = await fetch(uploadUrl, {
      method: 'POST',
      headers: uploadHeaders,
      body: file.stream()
    });

    if (!b2Response.ok) {
      const errorText = await b2Response.text();
      console.error('B2 upload failed:', b2Response.status, errorText);
      throw new Error(`B2 upload failed: ${b2Response.status} ${errorText}`);
    }

    const b2Result = await b2Response.json();
    console.log('B2 upload successful:', b2Result.fileName);

    return new Response(JSON.stringify({
      success: true,
      message: 'File uploaded successfully',
      b2Result
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });

  } catch (error) {
    console.error('Upload proxy error:', error);
    return new Response(JSON.stringify({ 
      success: false,
      message: 'Upload failed: ' + error.message
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }
}