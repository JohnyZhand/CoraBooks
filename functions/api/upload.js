// Cloudflare Pages Function for generating Backblaze B2 upload URLs
// Replaces POST /api/upload endpoint

import { v4 as uuidv4 } from 'uuid';

export async function onRequest(context) {
  const { env, request } = context;
  
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    const { filename, size } = await request.json();
    
    // Validate file size (2GB limit)
    const maxSize = 2 * 1024 * 1024 * 1024; // 2GB in bytes
    if (size > maxSize) {
      return new Response(JSON.stringify({ 
        message: 'File too large. Maximum size is 2GB.' 
      }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    // Generate unique filename
    const fileId = uuidv4();
    const fileExtension = filename.split('.').pop();
    const uniqueFilename = `${fileId}.${fileExtension}`;
    
    // Get Backblaze B2 credentials from environment
    const b2KeyId = env.B2_APPLICATION_KEY_ID;
    const b2ApplicationKey = env.B2_APPLICATION_KEY;
    const b2BucketId = env.B2_BUCKET_ID;
    
    if (!b2KeyId || !b2ApplicationKey || !b2BucketId) {
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

    // Step 2: Get upload URL
    const uploadUrlResponse = await fetch(`${authData.apiUrl}/b2api/v2/b2_get_upload_url`, {
      method: 'POST',
      headers: {
        'Authorization': authData.authorizationToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        bucketId: b2BucketId
      })
    });

    if (!uploadUrlResponse.ok) {
      throw new Error('Failed to get B2 upload URL');
    }

    const uploadData = await uploadUrlResponse.json();

    // Store file metadata
    const fileMetadata = {
      id: fileId,
      filename: filename,
      size: size,
      uploadedAt: new Date().toISOString(),
      b2FileName: uniqueFilename,
    };

    // Get existing files and add new one
    const existingFiles = await env.CORABOOKS_KV.get('files', 'json') || [];
    existingFiles.push(fileMetadata);
    await env.CORABOOKS_KV.put('files', JSON.stringify(existingFiles));

    return new Response(JSON.stringify({
      uploadUrl: uploadData.uploadUrl,
      authorizationToken: uploadData.authorizationToken,
      fileName: uniqueFilename,
      fileId: fileId,
      message: 'Upload URL generated successfully'
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });

  } catch (error) {
    console.error('Error generating upload URL:', error);
    return new Response(JSON.stringify({ 
      message: 'Failed to generate upload URL: ' + error.message
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }
}