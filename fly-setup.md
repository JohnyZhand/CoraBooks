# Fly.io Setup Instructions

## Why Fly.io?
- ✅ **Forever free tier** (no trial period)
- ✅ **No sleeping** - stays active 24/7
- ✅ **1GB persistent storage** for files
- ✅ **Global CDN** for fast downloads
- ✅ **Better than Railway for free users**

## Quick Setup:

### Step 1: Install Fly CLI
```bash
# Windows (run in PowerShell as Administrator)
powershell -Command "iwr https://fly.io/install.ps1 -useb | iex"

# Or download from: https://fly.io/docs/hands-on/install-flyctl/
```

### Step 2: Login and Setup
```bash
# Sign up (free)
fly auth signup

# Navigate to your project
cd /c/Users/luisg/CoraBooks

# Initialize fly app
fly launch
# Choose: 
# - App name: corabooks-yourname
# - Region: closest to your location
# - Postgres: NO (we use JSON file)
# - Deploy now: YES
```

### Step 3: That's it!
Your app will be live at: `https://corabooks-yourname.fly.dev`

## Advantages:
- ✅ **Truly free forever**
- ✅ **No trial limitations**  
- ✅ **Persistent storage** (files won't disappear)
- ✅ **2GB file uploads** work perfectly
- ✅ **Global accessibility**