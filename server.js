const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Serve uploaded files
app.use('/uploads', express.static('uploads'));

// Storage configuration for multer
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        if (file.fieldname === 'coverImage') {
            cb(null, 'uploads/covers/');
        } else {
            cb(null, 'uploads/files/');
        }
    },
    filename: function (req, file, cb) {
        // Generate unique filename while preserving extension
        const uniqueName = uuidv4() + path.extname(file.originalname);
        cb(null, uniqueName);
    }
});

const upload = multer({ 
    storage: storage,
    limits: {
        fileSize: 50 * 1024 * 1024 // 50MB limit
    },
    fileFilter: function (req, file, cb) {
        if (file.fieldname === 'coverImage') {
            // Accept only image files for cover
            if (file.mimetype.startsWith('image/')) {
                cb(null, true);
            } else {
                cb(new Error('Cover image must be an image file'));
            }
        } else {
            // Accept common document types
            const allowedTypes = [
                'application/pdf',
                'application/msword',
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                'text/plain',
                'application/vnd.ms-powerpoint',
                'application/vnd.openxmlformats-officedocument.presentationml.presentation',
                'application/vnd.ms-excel',
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            ];
            
            if (allowedTypes.includes(file.mimetype)) {
                cb(null, true);
            } else {
                cb(new Error('File type not supported. Please upload PDF, DOC, DOCX, TXT, PPT, PPTX, XLS, or XLSX files.'));
            }
        }
    }
});

// Database functions (using JSON file for simplicity)
const DATA_FILE = './data/files.json';

async function loadFiles() {
    try {
        const data = await fs.readFile(DATA_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        // If file doesn't exist, return empty array
        return [];
    }
}

async function saveFiles(files) {
    await fs.writeFile(DATA_FILE, JSON.stringify(files, null, 2));
}

// API Routes

// Get all files
app.get('/api/files', async (req, res) => {
    try {
        const files = await loadFiles();
        res.json(files);
    } catch (error) {
        console.error('Error loading files:', error);
        res.status(500).json({ message: 'Failed to load files' });
    }
});

// Upload new file
app.post('/api/upload', upload.fields([
    { name: 'file', maxCount: 1 },
    { name: 'coverImage', maxCount: 1 }
]), async (req, res) => {
    try {
        const { fileName, description } = req.body;
        
        if (!req.files || !req.files.file || !req.files.file[0]) {
            return res.status(400).json({ message: 'No file uploaded' });
        }

        const uploadedFile = req.files.file[0];
        const coverImage = req.files.coverImage ? req.files.coverImage[0] : null;

        // Create file metadata
        const fileData = {
            id: uuidv4(),
            name: fileName,
            description: description,
            originalName: uploadedFile.originalname,
            filename: uploadedFile.filename,
            size: uploadedFile.size,
            mimetype: uploadedFile.mimetype,
            coverImage: coverImage ? coverImage.filename : null,
            uploadDate: new Date().toISOString()
        };

        // Load existing files and add new one
        const files = await loadFiles();
        files.push(fileData);
        await saveFiles(files);

        console.log(`File uploaded: ${fileName} (${uploadedFile.originalname})`);
        res.json({ message: 'File uploaded successfully', file: fileData });

    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ message: error.message || 'Upload failed' });
    }
});

// Download file
app.get('/api/download/:fileId', async (req, res) => {
    try {
        const { fileId } = req.params;
        const files = await loadFiles();
        const file = files.find(f => f.id === fileId);

        if (!file) {
            return res.status(404).json({ message: 'File not found' });
        }

        const filePath = path.join(__dirname, 'uploads', 'files', file.filename);
        
        // Check if file exists
        try {
            await fs.access(filePath);
        } catch (error) {
            return res.status(404).json({ message: 'File not found on disk' });
        }

        // Set appropriate headers for download
        res.setHeader('Content-Disposition', `attachment; filename="${file.originalName}"`);
        res.setHeader('Content-Type', file.mimetype);
        
        // Send file
        res.sendFile(filePath);

        console.log(`File downloaded: ${file.originalName}`);

    } catch (error) {
        console.error('Download error:', error);
        res.status(500).json({ message: 'Download failed' });
    }
});

// Delete file (optional admin function)
app.delete('/api/files/:fileId', async (req, res) => {
    try {
        const { fileId } = req.params;
        const files = await loadFiles();
        const fileIndex = files.findIndex(f => f.id === fileId);

        if (fileIndex === -1) {
            return res.status(404).json({ message: 'File not found' });
        }

        const file = files[fileIndex];

        // Delete physical files
        try {
            await fs.unlink(path.join(__dirname, 'uploads', 'files', file.filename));
            if (file.coverImage) {
                await fs.unlink(path.join(__dirname, 'uploads', 'covers', file.coverImage));
            }
        } catch (error) {
            console.warn('Error deleting physical files:', error);
        }

        // Remove from database
        files.splice(fileIndex, 1);
        await saveFiles(files);

        console.log(`File deleted: ${file.originalName}`);
        res.json({ message: 'File deleted successfully' });

    } catch (error) {
        console.error('Delete error:', error);
        res.status(500).json({ message: 'Delete failed' });
    }
});

// Health check
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

// Serve main page for all routes (SPA behavior)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error handling middleware
app.use((error, req, res, next) => {
    console.error('Server error:', error);
    
    if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ message: 'File too large. Maximum size is 50MB.' });
        }
        return res.status(400).json({ message: error.message });
    }
    
    res.status(500).json({ message: 'Internal server error' });
});

// Start server
app.listen(PORT, () => {
    console.log('🚀 CoraBooks Server Starting...');
    console.log(`📡 Server running on http://localhost:${PORT}`);
    console.log('💜 Terminal-style file repository loaded');
    console.log('📁 Upload directory: ./uploads/');
    console.log('💾 Data file: ./data/files.json');
    console.log('=====================================');
});

module.exports = app;