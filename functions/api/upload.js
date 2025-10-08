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
  const { filename, originalFilename, contentType, size } = await request.json();
    
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
  // Determine extension from the user's actual file name to avoid encoding issues
  const sourceName = (originalFilename || filename || '').toString();
  const dotIdx = sourceName.lastIndexOf('.');
  const fileExtension = dotIdx > -1 ? sourceName.substring(dotIdx + 1) : 'bin';
  const uniqueFilename = `${fileId}.${fileExtension}`;
    
    // Get Backblaze B2 credentials from environment
    const b2KeyId = env.B2_APPLICATION_KEY_ID;
    const b2ApplicationKey = env.B2_APPLICATION_KEY;
    const b2BucketId = env.B2_BUCKET_ID;
    
    console.log('Environment variables check:', {
      B2_APPLICATION_KEY_ID: b2KeyId ? `${b2KeyId.substring(0, 10)}...` : 'MISSING',
      B2_APPLICATION_KEY: b2ApplicationKey ? `${b2ApplicationKey.substring(0, 10)}...` : 'MISSING',
      B2_BUCKET_ID: b2BucketId ? `${b2BucketId.substring(0, 10)}...` : 'MISSING',
      allEnvKeys: Object.keys(env)
    });
    
    if (!b2KeyId || !b2ApplicationKey || !b2BucketId) {
      throw new Error(`Backblaze B2 credentials not configured. Missing: ${!b2KeyId ? 'KEY_ID ' : ''}${!b2ApplicationKey ? 'APP_KEY ' : ''}${!b2BucketId ? 'BUCKET_ID' : ''}`);
    }

    // Step 1: Authorize with B2
    console.log('B2 Credentials check:', {
      hasKeyId: !!b2KeyId,
      hasAppKey: !!b2ApplicationKey,
      hasBucketId: !!b2BucketId,
      keyIdLength: b2KeyId?.length,
      appKeyLength: b2ApplicationKey?.length,
      keyIdPrefix: b2KeyId ? b2KeyId.substring(0, 8) : 'MISSING',
      appKeyPrefix: b2ApplicationKey ? b2ApplicationKey.substring(0, 8) : 'MISSING'
    });

    // Create the auth string
    const authString = `${b2KeyId}:${b2ApplicationKey}`;
    const base64Auth = btoa(authString);
    console.log('Auth details:', {
      authStringLength: authString.length,
      base64AuthLength: base64Auth.length,
      base64Prefix: base64Auth.substring(0, 20)
    });

    const authResponse = await fetch('https://api.backblazeb2.com/b2api/v2/b2_authorize_account', {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${base64Auth}`
      }
    });

    if (!authResponse.ok) {
      const errorText = await authResponse.text();
      console.error('B2 Auth Error:', authResponse.status, errorText);
      throw new Error(`Failed to authorize with Backblaze B2: ${authResponse.status} ${errorText}`);
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
      filename: filename, // display name from the form
      originalName: originalFilename || filename,
      contentType: contentType || 'application/octet-stream',
      size: size,
      uploadedAt: new Date().toISOString(),
      b2FileName: uniqueFilename,
      ready: false
    };

    // Get existing files and add new one
    const existingFiles = await env.CORABOOKS_KV.get('files', 'json') || [];
    existingFiles.push(fileMetadata);
    await env.CORABOOKS_KV.put('files', JSON.stringify(existingFiles));

    console.log('Upload URL generated successfully for:', uniqueFilename);

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
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
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
}/* Secrets updated Fri, Sep 26, 2025  7:40:46 PM */
