# Fly.io Deployment Guide

## Why Fly.io?
- ✅ **No sleeping** (apps stay active)
- ✅ **Generous free tier** (160GB-hours/month)
- ✅ **Persistent storage** included
- ✅ **Better for large uploads** than Render

## Quick Setup:

1. **Install Fly CLI**:
   ```bash
   # Windows (PowerShell as Admin)
   iwr https://fly.io/install.ps1 -useb | iex
   ```

2. **Login**:
   ```bash
   fly auth signup
   ```

3. **In your CoraBooks directory**:
   ```bash
   fly launch
   # Follow the prompts, choose a name like "corabooks-yourname"
   ```

4. **Deploy**:
   ```bash
   fly deploy
   ```

## Your app will be available at:
`https://corabooks-yourname.fly.dev`

## Configuration (automatically created):
- Dockerfile: ✅ Already exists in your project
- fly.toml: ✅ Generated automatically

## Advantages:
- ✅ **24/7 uptime** (no sleeping)
- ✅ **Large file support**
- ✅ **Fast global CDN**
- ✅ **Persistent volumes** for file storage