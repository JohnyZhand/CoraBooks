// Cloudflare Pages Function: registers a pending book and returns a presigned S3 PUT URL
// (bound to that book's object name) for the browser to upload straight to Backblaze B2.

import { v4 as uuidv4 } from 'uuid';
import { sanitizeMeta } from '../../lib/meta.js';
import { BOOK_EXTENSIONS, bookContentType, capString } from '../../lib/files.js';
import { b2PresignPut } from '../../lib/b2.js';

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
  const body = await request.json();
  // Everything below comes from the browser: cap it, and never trust its content type
  const filename = capString(body.filename, 200);
  const originalFilename = capString(body.originalFilename, 255);
  const description = body.description;
  const meta = body.meta;
  const size = Number(body.size);
  if (!Number.isFinite(size) || size <= 0) {
    return new Response(JSON.stringify({ message: 'Invalid file size' }), { status: 400, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
  }
  // Optional curated metadata gathered in the browser (PDF info + Google Books lookup)
  const cleanMeta = sanitizeMeta(meta);
  // Optional free-text description shown on the book card (trimmed, capped)
  const cleanDescription = typeof description === 'string' ? description.trim().slice(0, 1000) : '';
    
    // Enforce allowed file types: PDF, EPUB, MOBI
    const allowedExt = BOOK_EXTENSIONS;
    const sourceName = (originalFilename || filename || '').toString();
    const dotIdx0 = sourceName.lastIndexOf('.');
    const reqExt = dotIdx0 > -1 ? sourceName.substring(dotIdx0 + 1).toLowerCase() : '';
    if (!allowedExt.includes(reqExt)) {
      return new Response(JSON.stringify({ 
        message: 'Only PDF, EPUB, and MOBI files are allowed.' 
      }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }
    
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
  // Determine extension from the user's actual file name (we already validated allowed types)
  const dotIdx = sourceName.lastIndexOf('.');
  const fileExtension = dotIdx > -1 ? sourceName.substring(dotIdx + 1).toLowerCase() : reqExt || 'pdf';
  const uniqueFilename = `${fileId}.${fileExtension}`;
    
    if (!env.B2_APPLICATION_KEY_ID || !env.B2_APPLICATION_KEY || !env.B2_BUCKET_NAME) {
      throw new Error('Backblaze B2 credentials not configured');
    }

    // Presigned S3 PUT bound to this one object name (1 hour). Replaces the native
    // b2_get_upload_url token, which allowed uploading to any name in the bucket.
    const uploadUrl = await b2PresignPut(env, uniqueFilename, 3600);

    // Store file metadata
    const fileMetadata = {
      id: fileId,
      filename: filename, // display name from the form
      originalName: originalFilename || filename,
      description: cleanDescription,
      ...(cleanMeta ? { meta: cleanMeta } : {}),
      contentType: bookContentType(uniqueFilename),
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
      uploadUrl,
      method: 'PUT',
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
