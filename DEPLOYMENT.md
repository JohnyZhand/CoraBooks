# CoraBooks Deployment Guide

## DigitalOcean App Platform Setup (Recommended - $5/month)

### Step 1: Prepare Your Code
Already done! Your project is ready to deploy.

### Step 2: Create DigitalOcean Account
1. Go to https://cloud.digitalocean.com/
2. Sign up (get $200 free credit with student email!)
3. Verify your account

### Step 3: Deploy from GitHub
1. Push your code to GitHub first
2. In DigitalOcean, click "Create App"
3. Connect your GitHub repository
4. Choose "CoraBooks" repository
5. DigitalOcean will auto-detect it's a Node.js app

### Step 4: Configure App Settings
```yaml
# These settings will be auto-configured:
name: corabooks
services:
- name: web
  source_dir: /
  github:
    repo: your-username/CoraBooks
    branch: main
  run_command: npm start
  environment_slug: node-js
  instance_count: 1
  instance_size_slug: basic-xxs
```

### Estimated Monthly Cost: $5
- Handles unlimited file uploads
- Persistent storage included
- Custom domain support
- Automatic SSL certificates

## Alternative: Render.com (Free Option)

### Pros:
- Completely free tier
- Easy deployment
- Good performance

### Cons:
- Files may be deleted after 30 days of inactivity
- Limited to 100GB total storage on free tier

### Setup:
1. Go to render.com
2. Connect GitHub repository  
3. Deploy as "Web Service"
4. Done!

## VPS Option (Most Flexible)

### Monthly Cost: $4-6
### Setup with Docker:
```bash
# On any VPS
docker run -d -p 80:3000 -v /data:/app/uploads corabooks
```

## Recommendation:
**Start with DigitalOcean App Platform** - it's only $5/month, handles large files perfectly, and is incredibly reliable for student access.