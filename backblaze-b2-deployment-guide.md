# CoraBooks - Cloudflare Pages + Backblaze B2 Deployment Guide

This guide will help you deploy CoraBooks on Cloudflare Pages with Backblaze B2 storage for **completely free**, reliable file hosting without needing to provide payment information.

## Why Backblaze B2?

✅ **Truly Free** - No payment info required for free tier  
✅ **10GB Free Storage** - Same as other providers  
✅ **Generous Free Operations** - 2,500 downloads/day free  
✅ **$5/TB** - Cheapest if you exceed free tier  
✅ **Simple Setup** - No complex configurations  
✅ **Reliable** - Enterprise-grade infrastructure  
✅ **Private by Default** - Secure file storage without payment requirements  

## Prerequisites

1. **Cloudflare Account**: Sign up at [cloudflare.com](https://cloudflare.com) (free tier)
2. **Backblaze Account**: Sign up at [backblaze.com](https://backblaze.com) (free tier, no payment info needed)
3. **GitHub Account**: Your code should be in a GitHub repository
4. **Node.js**: Install from [nodejs.org](https://nodejs.org) for local development

## Step 1: Set Up Backblaze B2 Storage

### Create Backblaze Account
1. Go to [backblaze.com/b2](https://backblaze.com/b2)
2. Click **Sign Up** (No credit card required!)
3. Verify your email and complete account setup

### Create B2 Bucket
1. Log into Backblaze B2 Console
2. Go to **Buckets** → **Create a Bucket**
3. Choose settings:
   - **Bucket Name**: `corabooks-files` (must be globally unique, try adding random numbers if taken)
   - **Files in Bucket are**: `Private` (keeps your files secure and avoids payment requirements)
   - **Object Lock**: `Disabled`
4. Click **Create a Bucket**

### Generate Application Keys
1. In B2 Console, go to **App Keys**
2. Click **Add a New Application Key**
3. Settings:
   - **Name of Key**: `CoraBooks-API`
   - **Allow access to Bucket(s)**: Select your bucket (`corabooks-files`)
   - **Type of Access**: `Read and Write`
4. Click **Create New Key**
5. **SAVE THESE VALUES** (you won't see them again):
   - `keyID` 
   - `applicationKey`
   - `bucketId` (from the bucket details page)

## Step 2: Set Up Cloudflare KV Storage

### Create KV Namespace
1. In Cloudflare Dashboard, go to **Workers & Pages** → **KV**
2. Click **Create a namespace**
3. Name it `CORABOOKS_FILES`
4. Click **Add**
5. **Note the namespace ID** - you'll need it for wrangler.toml

## Step 3: Configure Your Project

### Install Wrangler CLI
```bash
npm install -g wrangler
```

### Authenticate Wrangler
```bash
wrangler login
```

### Update wrangler.toml
Edit `wrangler.toml` and replace the placeholder ID:

```toml
name = "corabooks"
compatibility_date = "2024-01-01"

[build]
command = "npm run build"
publish = "public"

[functions]
directory = "functions"

[[kv_namespaces]]
binding = "CORABOOKS_KV"
id = "YOUR_KV_NAMESPACE_ID_HERE"  # Replace with actual ID
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

In Cloudflare Dashboard, go to **Workers & Pages** → **Your Project** → **Settings** → **Environment variables**

Add these variables for **Production** and **Preview**:

| Variable Name | Value | Example |
|---------------|-------|---------|
| `B2_APPLICATION_KEY_ID` | Your B2 keyID | `001234567890abcdef000000` |
| `B2_APPLICATION_KEY` | Your B2 applicationKey | `K001abcdefghijklmnopqrstuv` |
| `B2_BUCKET_ID` | Your B2 bucketId | `12345abcdef67890` |
| `B2_BUCKET_NAME` | Your bucket name | `corabooks-files` |

### Add KV Binding
1. In the same settings page, go to **Functions**
2. Add **KV namespace bindings**:
   - Variable name: `CORABOOKS_KV`  
   - KV namespace: `CORABOOKS_FILES`

## Step 6: Test Your Deployment

1. Visit your Cloudflare Pages URL (e.g., `corabooks.pages.dev`)
2. Try uploading a small test file (under 1MB)
3. Verify the file appears in the browse section
4. Test downloading the file
5. Check your B2 bucket to see the uploaded file

## Free Tier Limits

### Backblaze B2 Free Tier:
- **Storage**: 10GB free
- **Downloads**: 1GB free per day (≈2,500 file downloads)
- **API Calls**: 2,500 free per day

### Cloudflare Free Tier:
- **Pages**: Unlimited static requests  
- **Functions**: 100K invocations/day
- **KV**: 100K reads + 1K writes/day

**Perfect for a class file sharing site!** 🎓

## Local Development

```bash
# Install dependencies
npm install

# Start local development server  
npm run dev:pages
```

## File Size Considerations

- **2GB per file limit** (set in the code)
- For very large files, consider:
  - Breaking into smaller chunks
  - Using compression (ZIP files)
  - Upgrading to B2 paid tier ($5/TB) if needed

## Security Features

✅ **Unique file names** - Prevents conflicts and guessing  
✅ **Secure API keys** - Stored as environment variables  
✅ **HTTPS encryption** - All transfers encrypted  
✅ **Access control** - Only your app can upload  
✅ **No direct file system access** - Sandboxed environment  

## Troubleshooting

### Upload Fails
- Check B2 API keys are correct in Cloudflare settings
- Verify bucket name matches exactly
- Ensure bucket has "Read and Write" permissions in API key settings

### Downloads Not Working  
- Check that file exists in B2 console
- Verify B2_BUCKET_NAME environment variable
- Ensure API key has download permissions
- Check Cloudflare Functions logs for authorization errors

### Functions Not Responding
- Check Functions tab in Cloudflare Pages for error logs
- Verify KV binding is set up correctly
- Ensure wrangler.toml has correct KV namespace ID

### "Payment Required" Error
- This shouldn't happen with our setup! B2 free tier doesn't require payment info
- Double-check you're using Backblaze B2, not AWS S3 or other services

## Cost Comparison

| Provider | Storage | Bandwidth | Payment Info Required |
|----------|---------|-----------|----------------------|
| **Backblaze B2** | 10GB free | 1GB/day free | ❌ **No** |
| Cloudflare R2 | 10GB free | No limits | ✅ **Yes** |
| AWS S3 | 5GB free | 15GB free | ✅ **Yes** |
| Google Cloud | 5GB free | 1GB free | ✅ **Yes** |

## Monitoring Usage

1. **B2 Console**: Check storage and bandwidth usage
2. **Cloudflare Analytics**: Monitor Pages visits and Functions usage
3. Set up alerts in both consoles if approaching limits

## Scaling Up

When you exceed free tiers:
- **B2**: $5/TB storage + $10/TB bandwidth (very affordable)
- **Cloudflare**: Function usage charges minimal for most sites

## Security Best Practices

1. **Rotate API keys** regularly (every 6 months)
2. **Monitor B2 access logs** for unusual activity  
3. **Use environment variables** - never hardcode credentials
4. **Set up bucket notifications** for large usage spikes
5. **Regular backups** - B2 is reliable but backup is always smart

Your CoraBooks site will now be available 24/7 with professional-grade reliability, completely free! 🚀📚