# CoraBooks - Terminal-Style File Repository

A dark, terminal-inspired file sharing website for class resources with a purple aesthetic theme.

## Features

- 🌙 **Dark Terminal Theme**: Old-school terminal look with purple highlights instead of green
- 📄 **File Upload**: Upload PDFs, documents, and other educational materials
- 🖼️ **Cover Images**: Optional cover images for files
- 👁️ **PDF Preview**: View PDFs directly in the browser before downloading
- 📱 **Responsive Design**: Works on desktop and mobile devices
- 💾 **Simple Storage**: Uses JSON file for metadata (easily upgradeable to database)

## Quick Start

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Start the Server**
   ```bash
   npm start
   ```
   
   Or for development with auto-restart:
   ```bash
   npm run dev
   ```

3. **Open in Browser**
   Navigate to `http://localhost:3000`

## File Structure

```
CoraBooks/
├── public/           # Frontend files
│   ├── index.html    # Main HTML file
│   ├── style.css     # Terminal-style CSS
│   └── script.js     # Frontend JavaScript
├── uploads/          # File storage
│   ├── files/        # Uploaded documents
│   └── covers/       # Cover images
├── data/             # Data storage
│   └── files.json    # File metadata
├── server.js         # Backend server
└── package.json      # Dependencies
```

## Usage

### Uploading Files

1. Click "[2] Upload New File" in the terminal menu
2. Fill in the file details:
   - **FILE_NAME**: Display name for the file
   - **DESCRIPTION**: Brief description of the content
   - **FILE_PATH**: Select the file to upload
   - **COVER_IMAGE**: Optional cover image
3. Click "> execute upload.sh"

### Browsing Files

1. Click "[1] Browse Files" to see all uploaded files
2. Click on any file card to preview (PDFs open in modal)
3. Use "> download" to download files

### Supported File Types

- **Documents**: PDF, DOC, DOCX, TXT
- **Presentations**: PPT, PPTX  
- **Spreadsheets**: XLS, XLSX
- **Cover Images**: JPG, PNG, GIF, etc.

## Configuration

### File Size Limits
- Maximum file size: 50MB (configurable in server.js)

### Storage Options

Currently using JSON file for simplicity. For production or larger scale:

**Option 1: Keep JSON (Recommended for small to medium use)**
- Simple setup, no additional dependencies
- Good for hundreds of files
- Easy backup and migration

**Option 2: Upgrade to Database**
- For thousands of files or multiple users
- Consider SQLite (simple) or PostgreSQL/MySQL (production)
- Better for search and filtering features

### Environment Variables

Create a `.env` file for configuration:

```env
PORT=3000
MAX_FILE_SIZE=50000000
UPLOAD_PATH=./uploads
DATA_PATH=./data/files.json
```

## API Endpoints

- `GET /api/files` - Get all files
- `POST /api/upload` - Upload new file
- `GET /api/download/:fileId` - Download file
- `DELETE /api/files/:fileId` - Delete file
- `GET /api/health` - Server health check

## Customization

### Changing Colors
Edit `public/style.css` and modify CSS custom properties:
- `--primary-color: #9945ff` (Main purple)
- `--secondary-color: #b19cd9` (Light purple)
- `--background: #0a0a0a` (Dark background)

### Adding New File Types
Edit the `fileFilter` in `server.js` to add more MIME types.

## Security Notes

For production deployment:
1. Add authentication/authorization
2. Implement file scanning for malware
3. Add rate limiting
4. Use HTTPS
5. Validate file content, not just extensions

## Troubleshooting

### Common Issues

1. **"Cannot find module" errors**
   ```bash
   npm install
   ```

2. **Permission errors on file upload**
   - Check folder permissions for `uploads/` directory
   - Ensure Node.js can write to the upload directories

3. **Files not displaying**
   - Check browser console for JavaScript errors
   - Verify server is running on correct port
   - Check `data/files.json` exists and is valid JSON

4. **PDF preview not working**
   - Ensure browser supports embedded PDFs
   - Check file was uploaded correctly to `uploads/files/`

## License

MIT License - Feel free to modify and use for your educational needs.

## Support

This is a simple educational project. For issues or questions, check:
1. Browser console for errors
2. Server logs for backend issues
3. File permissions in upload directories