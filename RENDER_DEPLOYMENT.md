# 🆓 Render.com Deployment Guide - CoraBooks

## Step 1: Prepare GitHub Repository

```bash
# Initialize git (run these commands in your CoraBooks folder)
git init
git add .
git commit -m "CoraBooks - Ready for free deployment on Render.com"
```

## Step 2: Create GitHub Repository
1. Go to github.com
2. Click "New repository" 
3. Name it "CoraBooks"
4. Make it public (required for free Render.com)
5. Don't initialize with README (you already have files)

## Step 3: Push Your Code
```bash
# Replace YOUR_USERNAME with your GitHub username
git remote add origin https://github.com/YOUR_USERNAME/CoraBooks.git
git branch -M main
git push -u origin main
```

## Step 4: Deploy on Render.com
1. Go to **render.com**
2. Sign up with your GitHub account
3. Click **"New Web Service"**
4. Connect your **CoraBooks** repository
5. Use these settings:
   - **Name:** corabooks
   - **Branch:** main
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** Free

## Step 5: Configure Environment (Optional)
Add these environment variables in Render dashboard:
- `NODE_ENV` = `production`
- `MAX_FILE_SIZE` = `104857600` (100MB)

## 🎉 Result:
Your app will be live at: `https://corabooks-abc123.onrender.com`

## 📱 **Student Experience:**
- **First visit of the day:** 30-second loading (app waking up)
- **All other visits:** Instant access
- **Downloads:** Fast and reliable
- **Uploads:** Work perfectly for your 77MB+ PDFs

## 📊 **Monitoring Usage:**
- Check your Render dashboard for monthly hours used
- Typical educational usage: 200-400 hours/month (well under 750 limit)

## 🔄 **Auto-Updates:**
Every time you push changes to GitHub, Render automatically redeploys your app!

## 💡 **Pro Tips:**
1. **Share the URL with students** - bookmark it!
2. **Test uploads** with a large PDF first
3. **Monitor usage** in first month to see actual consumption
4. **If needed later**, upgrade to Render Pro ($7/month) for unlimited hours

**This free solution is actually perfect for your class file sharing needs!** 🚀