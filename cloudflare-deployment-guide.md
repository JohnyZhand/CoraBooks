# CoraBooks - Cloudflare Pages + R2 Deployment Guide

This guide will help you deploy CoraBooks on Cloudflare Pages with R2 storage for free, reliable file hosting.

## Prerequisites

1. **Cloudflare Account**: Sign up at [cloudflare.com](https://cloudflare.com) (free tier is sufficient)
2. **GitHub Account**: Your code should be in a GitHub repository
3. **Node.js**: Install from [nodejs.org](https://nodejs.org) for local development

## Step 1: Set Up R2 Storage

### Create R2 Bucket
1. Log in to Cloudflare Dashboard
2. Go to **R2 Object Storage** in the sidebar
3. Click **Create bucket**
4. Name it `corabooks-files`
5. Choose a region close to your users
6. Click **Create bucket**

### Get R2 API Token
1. In Cloudflare Dashboard, go to **My Profile** → **API Tokens**
2. Click **Create Token**
3. Use **Custom token** template
4. Set permissions:
   - **Account** → `Cloudflare R2:Edit`
   - **Zone Resources** → `Include All zones`
5. Click **Continue to summary** → **Create Token**
6. **SAVE THIS TOKEN** - you'll need it later

## Step 2: Set Up KV Storage

### Create KV Namespace
1. In Cloudflare Dashboard, go to **Workers & Pages** → **KV**
2. Click **Create a namespace**
3. Name it `CORABOOKS_FILES`
4. Click **Add**
5. **Note the namespace ID** - you'll need it for wrangler.toml

## Step 3: Configure Wrangler

### Install Wrangler CLI
```bash
npm install -g wrangler
```

### Authenticate Wrangler
```bash
wrangler login
```

### Update wrangler.toml
Edit `wrangler.toml` and replace the placeholder IDs:

```toml
name = "corabooks"
compatibility_date = "2024-01-01"

[build]
command = "npm run build"
publish = "public"

[[r2_buckets]]
binding = "CORABOOKS_R2"
bucket_name = "corabooks-files"

[[kv_namespaces]]
binding = "CORABOOKS_KV"
id = "YOUR_KV_NAMESPACE_ID_HERE"
```

## Step 4: Deploy to Cloudflare Pages

### Option A: GitHub Integration (Recommended)
1. Push your code to GitHub
2. In Cloudflare Dashboard, go to **Workers & Pages**
3. Click **Create application** → **Pages** → **Connect to Git**
4. Select your repository
5. Set build settings:
   - **Build command**: `npm run build`
   - **Build output directory**: `public`
6. Click **Save and Deploy**

### Option B: Direct Upload
```bash
# Build the project
npm run build

# Deploy with Wrangler
wrangler pages deploy public --project-name corabooks
```

## Step 5: Configure Environment Variables

### Set up bindings in Cloudflare Dashboard:
1. Go to **Workers & Pages** → **Your Project** → **Settings** → **Functions**
2. Add **R2 bucket bindings**:
   - Variable name: `CORABOOKS_R2`
   - R2 bucket: `corabooks-files`
3. Add **KV namespace bindings**:
   - Variable name: `CORABOOKS_KV`  
   - KV namespace: `CORABOOKS_FILES`

## Step 6: Test Your Deployment

1. Visit your Cloudflare Pages URL (e.g., `corabooks.pages.dev`)
2. Try uploading a small file
3. Verify the file appears in the browse section
4. Test downloading the file

## Features You Get

✅ **Free hosting** - Cloudflare Pages free tier  
✅ **100GB storage** - R2 free tier (10GB/month operations)  
✅ **Global CDN** - Files served from edge locations worldwide  
✅ **No sleep mode** - Always available, unlike Heroku/Railway  
✅ **2GB file uploads** - Large file support  
✅ **Custom domain** - Add your own domain for free  
✅ **SSL certificate** - Automatic HTTPS  
✅ **DDoS protection** - Built-in security  

## Local Development

```bash
# Install dependencies
npm install

# Start local development server
npm run dev:pages
```

This will start Wrangler's local dev server with R2 and KV bindings.

## Troubleshooting

### Functions not working
- Check that your Functions are in the `functions/` directory
- Verify API routes match the file structure (e.g., `/api/files` → `functions/api/files.js`)

### R2 uploads failing
- Verify R2 bucket binding in Cloudflare Dashboard
- Check that CORS is properly configured for your domain
- Ensure presigned URL generation is working

### KV storage issues
- Verify KV namespace binding
- Check that the namespace ID in `wrangler.toml` is correct

### Build failures
- Make sure `uuid` dependency is installed
- Check that all Functions export `onRequest` properly

## Cost Estimates (Free Tier Limits)

- **R2 Storage**: 10GB free
- **R2 Operations**: 1M Class A, 10M Class B operations/month
- **Pages**: Unlimited static requests
- **Functions**: 100K function invocations/day

For a class file sharing site, you should stay well within free limits!

## Security Notes

- Files are stored securely in R2 with presigned URLs
- No direct file system access
- Built-in DDoS protection
- Automatic SSL/TLS encryption

## Next Steps

Once deployed, you can:
1. Add a custom domain in Pages settings
2. Set up usage monitoring
3. Configure caching rules for better performance
4. Add file type restrictions if needed

Your CoraBooks site will now be available 24/7 with professional-grade reliability! 🚀