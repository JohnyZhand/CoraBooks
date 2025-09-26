# Local Network Setup Guide

## Option 1: Local Network Access (Free, Your Computer)

### Setup Steps:

1. **Find your local IP address**:
   ```bash
   # Windows
   ipconfig | grep "IPv4"
   # Usually something like 192.168.1.100
   ```

2. **Start your server**:
   ```bash
   cd /c/Users/luisg/CoraBooks
   PORT=3000 node server.js
   ```

3. **Share with others**:
   - Your app: `http://YOUR_IP:3000`
   - Example: `http://192.168.1.100:3000`
   - Works for anyone on same WiFi/network

### Pros:
- ✅ **Completely free**
- ✅ **No file size limits**
- ✅ **No time limits**
- ✅ **Full control**
- ✅ **Fast uploads**

### Cons:
- ❌ Only works when your computer is on
- ❌ Only accessible on same network (school/home WiFi)
- ❌ Not accessible from internet

## Option 2: Ngrok (Make Local Globally Accessible)

### Setup:
1. **Install ngrok**: https://ngrok.com/download
2. **Start your app**: `node server.js`
3. **In new terminal**: `ngrok http 3000`
4. **Share the URL**: `https://abc123.ngrok.io`

### Pros:
- ✅ **Globally accessible**
- ✅ **Free tier available**
- ✅ **No file limits**

### Cons:
- ❌ URL changes each time (unless paid)
- ❌ Computer must stay on