#!/bin/bash

# CoraBooks GitHub Setup Script
echo "🚀 Setting up CoraBooks for deployment..."

# Initialize git repository
git init

# Add all files
git add .

# Create initial commit
git commit -m "Initial CoraBooks commit - Ready for deployment

- Modern purple-themed file sharing platform
- Support for large PDFs (77MB+)
- Clean card-based interface
- Upload and download functionality
- Preview support for PDFs"

echo "✅ Git repository initialized!"
echo ""
echo "📋 Next steps:"
echo "1. Create a new repository on GitHub.com"
echo "2. Copy the repository URL"
echo "3. Run: git remote add origin YOUR_REPO_URL"
echo "4. Run: git push -u origin main"
echo "5. Deploy to DigitalOcean App Platform!"
echo ""
echo "🌐 Recommended hosting: DigitalOcean App Platform ($5/month)"
echo "💡 Alternative: Render.com (Free tier available)"