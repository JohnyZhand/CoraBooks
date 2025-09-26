// Global variables
let currentFile = null;
let files = [];

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    loadFiles();
    setupEventListeners();
});

// Setup event listeners
function setupEventListeners() {
    // Upload form
    const uploadForm = document.getElementById('uploadForm');
    if (uploadForm) {
        uploadForm.addEventListener('submit', handleFileUpload);
    }

    // File inputs for preview
    const fileInput = document.getElementById('file');
    const coverInput = document.getElementById('coverImage');
    
    if (fileInput) {
        fileInput.addEventListener('change', previewSelectedFile);
    }
    
    if (coverInput) {
        coverInput.addEventListener('change', previewCoverImage);
    }
}

// Navigation functions
function showSection(sectionName) {
    // Hide all sections
    const sections = document.querySelectorAll('.section');
    sections.forEach(section => section.classList.remove('active'));

    // Remove active class from all menu buttons
    const buttons = document.querySelectorAll('.nav-btn');
    buttons.forEach(btn => btn.classList.remove('active'));

    // Show selected section
    const targetSection = document.getElementById(sectionName + '-section');
    if (targetSection) {
        targetSection.classList.add('active');
    }

    // Add active class to clicked button
    const activeButton = Array.from(buttons).find(btn => 
        btn.textContent.toLowerCase().includes(sectionName.toLowerCase())
    );
    if (activeButton) {
        activeButton.classList.add('active');
    }

    // Reload files if browsing
    if (sectionName === 'browse') {
        loadFiles();
    }
}

// Load files from server
async function loadFiles() {
    const loading = document.getElementById('loading');
    const filesList = document.getElementById('files-list');
    
    if (loading) loading.style.display = 'block';
    if (filesList) filesList.innerHTML = '';

    try {
        const response = await fetch('/api/files');
        if (response.ok) {
            files = await response.json();
            displayFiles(files);
        } else {
            console.error('Failed to load files');
            displayError('Failed to load files from server');
        }
    } catch (error) {
        console.error('Error loading files:', error);
        displayError('Error connecting to server');
    } finally {
        if (loading) loading.style.display = 'none';
    }
}

// Display files in grid
function displayFiles(filesToShow) {
    const filesList = document.getElementById('files-list');
    if (!filesList) return;

    if (filesToShow.length === 0) {
        filesList.innerHTML = `
            <div style="grid-column: 1 / -1; text-align: center; margin: 40px 0; color: var(--text-secondary);">
                <p>No books found. Upload some books to get started!</p>
            </div>
        `;
        return;
    }

    filesList.innerHTML = filesToShow.map(file => `
        <div class="book-card" onclick="previewFile('${file.id}')">
            <div class="book-cover">
                ${file.coverImage ? 
                    `<img src="/uploads/covers/${file.coverImage}" alt="${file.name}">` : 
                    `<div class="book-icon">${getFileIcon(file.originalName)}</div>`
                }
            </div>
            <div class="book-info">
                <div class="book-title">${escapeHtml(file.name)}</div>
                <div class="book-description">${escapeHtml(file.description)}</div>
                <div class="book-actions">
                    <button class="btn btn-outline" onclick="event.stopPropagation(); previewFile('${file.id}')">
                        Preview
                    </button>
                    <button class="btn btn-purple" onclick="event.stopPropagation(); downloadFile('${file.id}')">
                        Download
                    </button>
                </div>
            </div>
        </div>
    `).join('');
}

// Get file icon based on extension
function getFileIcon(filename) {
    const extension = filename.split('.').pop().toLowerCase();
    const icons = {
        'pdf': '📄',
        'epub': '📖',
        'mobi': '📚',
        'doc': '📝',
        'docx': '📝',
        'txt': '📃',
        'ppt': '📊',
        'pptx': '📊',
        'xls': '📈',
        'xlsx': '📈'
    };
    return icons[extension] || '📁';
}

// Handle file upload with progress tracking
async function handleFileUpload(e) {
    e.preventDefault();
    
    const formData = new FormData();
    const fileInput = document.getElementById('file');
    const fileName = document.getElementById('fileName').value;
    const description = document.getElementById('description').value;
    const coverImage = document.getElementById('coverImage').files[0];
    const file = fileInput.files[0];

    if (!file) {
        showNotification('error', 'Please select a file', 'You must choose a file to upload');
        return;
    }

    // Check file size (500MB limit)
    const maxSize = 500 * 1024 * 1024; // 500MB in bytes
    if (file.size > maxSize) {
        const fileSize = formatFileSize(file.size);
        showNotification('error', 'File too large', `File size (${fileSize}) exceeds the 500MB limit. Please compress or split the file.`);
        return;
    }

    // Initialize progress tracking
    const progressContainer = document.getElementById('uploadProgress');
    const progressFill = progressContainer.querySelector('.progress-fill');
    const progressPercentage = progressContainer.querySelector('.progress-percentage');
    const progressLabel = progressContainer.querySelector('.progress-label');
    const fileNameSpan = progressContainer.querySelector('.file-name');
    const fileSizeSpan = progressContainer.querySelector('.file-size');
    const submitBtn = document.getElementById('uploadBtn');

    // Setup progress display
    progressContainer.classList.remove('hidden');
    fileNameSpan.textContent = file.name;
    fileSizeSpan.textContent = formatFileSize(file.size);
    progressLabel.textContent = 'Preparing upload...';
    progressPercentage.textContent = '0%';
    progressFill.style.width = '0%';

    // Disable submit button
    const originalText = submitBtn.textContent;
    submitBtn.textContent = 'Uploading...';
    submitBtn.disabled = true;

    formData.append('file', file);
    formData.append('fileName', fileName);
    formData.append('description', description);
    
    if (coverImage) {
        formData.append('coverImage', coverImage);
    }

    try {
        // Create XMLHttpRequest for progress tracking
        const response = await uploadWithProgress(formData, (progress) => {
            const percentage = Math.round(progress);
            progressFill.style.width = `${percentage}%`;
            progressPercentage.textContent = `${percentage}%`;
            progressLabel.textContent = percentage < 100 ? 'Uploading...' : 'Processing...';
        });

        if (response.success) {
            // Final progress state
            progressFill.style.width = '100%';
            progressPercentage.textContent = '100%';
            progressLabel.textContent = 'Upload complete!';
            
            // Show success notification
            showNotification('success', 'Upload Successful!', `${fileName} has been uploaded successfully`);
            
            // Hide progress after delay
            setTimeout(() => {
                progressContainer.classList.add('hidden');
            }, 2000);
            
            // Reset form and reload files
            e.target.reset();
            loadFiles();
            
            // Switch to browse section
            showSection('browse');
        } else {
            throw new Error(response.message || 'Upload failed');
        }
    } catch (error) {
        console.error('Upload error:', error);
        progressLabel.textContent = 'Upload failed';
        progressFill.style.background = '#ef4444';
        showNotification('error', 'Upload Failed', error.message || 'Network error occurred');
        
        // Hide progress after delay
        setTimeout(() => {
            progressContainer.classList.add('hidden');
            progressFill.style.background = '';
        }, 3000);
    } finally {
        submitBtn.textContent = originalText;
        submitBtn.disabled = false;
    }
}

// Upload with progress tracking using XMLHttpRequest
function uploadWithProgress(formData, progressCallback) {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();

        xhr.upload.addEventListener('progress', (e) => {
            if (e.lengthComputable) {
                const progress = (e.loaded / e.total) * 100;
                progressCallback(progress);
            }
        });

        xhr.addEventListener('load', () => {
            try {
                if (xhr.status >= 200 && xhr.status < 300) {
                    const response = JSON.parse(xhr.responseText);
                    resolve({ success: true, data: response });
                } else {
                    const error = JSON.parse(xhr.responseText);
                    resolve({ success: false, message: error.message });
                }
            } catch (e) {
                reject(new Error('Invalid server response'));
            }
        });

        xhr.addEventListener('error', () => {
            reject(new Error('Network error'));
        });

        xhr.addEventListener('timeout', () => {
            reject(new Error('Upload timeout'));
        });

        xhr.open('POST', '/api/upload');
        xhr.timeout = 300000; // 5 minutes timeout
        xhr.send(formData);
    });
}

// Preview selected file before upload
function previewSelectedFile(e) {
    const file = e.target.files[0];
    if (!file) return;

    const fileName = document.getElementById('fileName');
    if (fileName && !fileName.value) {
        fileName.value = file.name.replace(/\.[^/.]+$/, ""); // Remove extension
    }
}

// Preview cover image
function previewCoverImage(e) {
    const file = e.target.files[0];
    if (!file) return;

    // You could add a preview here if needed
    console.log('Cover image selected:', file.name);
}

// Preview file in modal
async function previewFile(fileId) {
    const file = files.find(f => f.id === fileId);
    if (!file) return;

    currentFile = file;
    
    const modal = document.getElementById('previewModal');
    const previewFileName = document.getElementById('previewFileName');
    const downloadFileName = document.getElementById('downloadFileName');
    const pdfViewer = document.getElementById('pdfViewer');

    previewFileName.textContent = file.originalName;
    downloadFileName.textContent = file.originalName;

    // Check if it's a PDF for preview
    const fileExtension = file.originalName.toLowerCase();
    if (fileExtension.endsWith('.pdf')) {
        pdfViewer.src = `/uploads/files/${file.filename}`;
        pdfViewer.style.display = 'block';
    } else if (fileExtension.endsWith('.epub') || fileExtension.endsWith('.mobi')) {
        // For EPUB/MOBI files, show a message instead of trying to preview
        pdfViewer.style.display = 'none';
        pdfViewer.src = '';
        const modalBody = document.querySelector('.modal-body');
        modalBody.innerHTML = `
            <div style="text-align: center; padding: 2rem; color: var(--text-secondary);">
                <div style="font-size: 4rem; margin-bottom: 1rem;">📖</div>
                <h3 style="color: var(--primary-purple); margin-bottom: 1rem;">eBook File</h3>
                <p>This is an ${fileExtension.includes('.epub') ? 'EPUB' : 'MOBI'} eBook file.</p>
                <p><strong>File size:</strong> ${(file.size / 1024 / 1024).toFixed(2)} MB</p>
                
                <div style="background: var(--card-bg); border: 1px solid var(--border-color); border-radius: 0.5rem; padding: 1.5rem; margin: 1.5rem 0; text-align: left;">
                    <h4 style="color: var(--primary-purple); margin-bottom: 1rem; text-align: center;">📱 Need an eBook Reader?</h4>
                    
                    <div style="margin-bottom: 1rem;">
                        <strong style="color: var(--text-primary);">📱 Android Users:</strong><br>
                        <a href="https://play.google.com/store/apps/details?id=com.google.android.apps.books&hl=en_US" 
                           target="_blank" 
                           style="color: var(--primary-purple); text-decoration: none;">
                           Google Play Books →
                        </a>
                    </div>
                    
                    <div style="margin-bottom: 1rem;">
                        <strong style="color: var(--text-primary);">🍎 iPhone/iPad Users:</strong><br>
                        <a href="https://apps.apple.com/us/app/apple-books/id364709193" 
                           target="_blank" 
                           style="color: var(--primary-purple); text-decoration: none;">
                           Apple Books →
                        </a>
                    </div>
                    
                    <div>
                        <strong style="color: var(--text-primary);">💻 PC/Web Users:</strong><br>
                        <a href="https://epub-reader.online/" 
                           target="_blank" 
                           style="color: var(--primary-purple); text-decoration: none;">
                           Online EPUB Reader →
                        </a>
                    </div>
                </div>
                
                <p style="font-size: 0.875rem; margin-top: 1rem;">
                    Download the file and open it with any of the apps above to start reading!
                </p>
            </div>
        `;
    } else {
        pdfViewer.style.display = 'none';
        pdfViewer.src = '';
    }

    modal.style.display = 'block';
}

// Download file
async function downloadFile(fileId) {
    const file = fileId ? files.find(f => f.id === fileId) : currentFile;
    if (!file) return;

    try {
        // Create download link
        const link = document.createElement('a');
        link.href = `/api/download/${file.id}`;
        link.download = file.originalName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        showMessage(`✓ Downloading ${file.originalName}...`, 'success');
    } catch (error) {
        console.error('Download error:', error);
        showMessage('✗ Download failed', 'error');
    }
}

// Close preview modal
function closePreview() {
    const modal = document.getElementById('previewModal');
    modal.style.display = 'none';
    currentFile = null;
}

// Show modern notification messages
function showMessage(message, type = 'info') {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${type}`;
    messageDiv.textContent = message;
    
    document.body.appendChild(messageDiv);
    
    // Trigger animation
    setTimeout(() => messageDiv.classList.add('show'), 100);
    
    // Auto remove after 4 seconds
    setTimeout(() => {
        messageDiv.classList.remove('show');
        setTimeout(() => {
            if (messageDiv.parentNode) {
                messageDiv.parentNode.removeChild(messageDiv);
            }
        }, 300);
    }, 4000);
}

// Modern notification system
function showNotification(type, title, message) {
    const container = document.getElementById('notificationContainer');
    if (!container) return;

    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    
    const icons = {
        success: '✅',
        error: '❌',
        info: 'ℹ️',
        warning: '⚠️'
    };

    notification.innerHTML = `
        <div class="notification-icon">${icons[type] || icons.info}</div>
        <div class="notification-content">
            <div class="notification-title">${title}</div>
            <div class="notification-message">${message}</div>
        </div>
        <button class="notification-close" onclick="removeNotification(this.parentElement)">×</button>
    `;

    container.appendChild(notification);

    // Auto remove after 5 seconds
    setTimeout(() => {
        removeNotification(notification);
    }, 5000);
}

function removeNotification(notification) {
    if (!notification || !notification.parentElement) return;
    
    notification.classList.add('removing');
    setTimeout(() => {
        if (notification.parentElement) {
            notification.parentElement.removeChild(notification);
        }
    }, 300);
}

// Format file size for display
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Display error message
function displayError(message) {
    const filesList = document.getElementById('files-list');
    if (filesList) {
        filesList.innerHTML = `
            <div class="terminal-line" style="grid-column: 1 / -1; text-align: center; margin: 40px 0;">
                <span class="output" style="color: #ef4444;">Error: ${escapeHtml(message)}</span>
            </div>
        `;
    }
}

// Utility function to escape HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Close modal when clicking outside
window.onclick = function(event) {
    const modal = document.getElementById('previewModal');
    if (event.target === modal) {
        closePreview();
    }
}

// Add some terminal easter eggs
document.addEventListener('keydown', function(e) {
    // Konami code or other terminal commands could go here
    if (e.key === 'F12') {
        console.log('🚀 CoraBooks Terminal v1.0');
        console.log('📁 File repository system loaded');
        console.log('💜 Purple terminal theme active');
    }
});