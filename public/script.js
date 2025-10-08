// Global variables
let currentFile = null;
let files = [];
let adminKey = null;

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    loadFiles();
    setupEventListeners();
    // Admin: restore key if present
    adminKey = localStorage.getItem('ADMIN_KEY') || null;
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
    if (sectionName === 'admin') {
        initAdmin();
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
                ${file.coverUrl ? `<img src="${file.coverUrl}" alt="${escapeHtml(file.filename)} cover" onerror="this.remove()" />` : `<div class="book-icon">${getFileIcon(file.filename)}</div>`}
            </div>
            <div class="book-info">
                <div class="book-title">${escapeHtml(file.filename)}</div>
                <div class="book-meta">
                    <span class="file-size">${formatFileSize(file.size)}</span>
                    <span class="upload-date">${new Date(file.uploadedAt).toLocaleDateString()}</span>
                </div>
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

// Handle file upload with progress tracking (Cloudflare R2 direct upload)
async function handleFileUpload(e) {
    e.preventDefault();
    
    const fileInput = document.getElementById('file');
    const fileName = document.getElementById('fileName').value;
    const description = document.getElementById('description').value;
    const file = fileInput.files[0];

    if (!file) {
        showNotification('error', 'Please select a file', 'You must choose a file to upload');
        return;
    }

    // Check file size (2GB limit)
    const maxSize = 2 * 1024 * 1024 * 1024; // 2GB in bytes
    if (file.size > maxSize) {
        const fileSize = formatFileSize(file.size);
        showNotification('error', 'File too large', `File size (${fileSize}) exceeds the 2GB limit. Please compress or split the file.`);
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
    progressLabel.textContent = 'Requesting upload URL...';
    progressPercentage.textContent = '0%';
    progressFill.style.width = '0%';

    // Disable submit button
    const originalText = submitBtn.textContent;
    submitBtn.textContent = 'Uploading...';
    submitBtn.disabled = true;

    try {
        // Step 1: Get presigned upload URL from Cloudflare Function
        progressLabel.textContent = 'Getting upload URL...';
        const uploadResponse = await fetch('/api/upload', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                filename: fileName || file.name,
                originalFilename: file.name,
                contentType: file.type || 'application/octet-stream',
                size: file.size
            })
        });

        if (!uploadResponse.ok) {
            const error = await uploadResponse.json();
            throw new Error(error.message || 'Failed to get upload URL');
        }

        const { uploadUrl, authorizationToken, fileName: b2FileName, fileId } = await uploadResponse.json();
        progressFill.style.width = '10%';
        progressPercentage.textContent = '10%';

        // Step 2: Upload directly to Backblaze B2 using presigned URL
        progressLabel.textContent = 'Uploading to Backblaze B2...';
        
        const uploadResult = await uploadDirectToB2(uploadUrl, authorizationToken, b2FileName, file, (progress) => {
            // Scale progress from 10% to 90%
            const scaledProgress = 10 + (progress * 0.8);
            const percentage = Math.round(scaledProgress);
            progressFill.style.width = `${percentage}%`;
            progressPercentage.textContent = `${percentage}%`;
        });

        if (uploadResult.success) {
            // Final progress state
            progressFill.style.width = '100%';
            progressPercentage.textContent = '100%';
            progressLabel.textContent = 'Upload complete!';
            
            // If a cover image was selected, upload it now
            if (coverInput && coverInput.files && coverInput.files[0]) {
                try {
                    const cover = coverInput.files[0];
                    const ext = (cover.name.split('.').pop() || 'jpg').toLowerCase();
                    const coverReq = await fetch('/api/upload-cover', {
                        method: 'POST', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ fileId, ext, contentType: cover.type || 'image/jpeg', size: cover.size })
                    });
                    if (coverReq.ok) {
                        const { uploadUrl: cUrl, authorizationToken: cTok, coverB2Name, contentType } = await coverReq.json();
                        await uploadDirectToB2(cUrl, cTok, coverB2Name, cover, () => {});
                        // Save cover info for the file so grid can render it
                        await fetch(`/api/update/${fileId}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ coverB2Name, coverContentType: contentType }) });
                    }
                } catch (e) { console.warn('Cover upload skipped:', e.message); }
            }

            // Show success notification
            showNotification('success', 'Upload Successful!', `${fileName || file.name} has been uploaded successfully`);
            
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
            throw new Error(uploadResult.message || 'Upload to storage failed');
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

// Direct upload to Backblaze B2 using the uploadUrl (requires proper B2 CORS rules)
function uploadDirectToB2(uploadUrl, authorizationToken, fileName, file, progressCallback) {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();

        xhr.upload.addEventListener('progress', (e) => {
            if (e.lengthComputable) {
                const progress = (e.loaded / e.total) * 100;
                progressCallback(progress);
            }
        });

        xhr.addEventListener('load', () => {
            console.log('B2 Upload response:', {
                status: xhr.status,
                statusText: xhr.statusText,
                responseText: xhr.responseText
            });

            if (xhr.status >= 200 && xhr.status < 300) {
                resolve({ success: true });
            } else {
                console.error('B2 Upload failed:', xhr.status, xhr.statusText, xhr.responseText);
                resolve({ success: false, message: `Upload failed with status ${xhr.status}: ${xhr.statusText}` });
            }
        });

        xhr.addEventListener('error', (e) => {
            console.error('Network error during B2 upload:', e);
            reject(new Error('Network error during upload'));
        });

        xhr.addEventListener('timeout', () => {
            reject(new Error('Upload timeout'));
        });

        xhr.open('POST', uploadUrl);
        xhr.timeout = 60 * 60 * 1000; // 60 minutes for very large files

    // B2 headers (order and values matter)
        xhr.setRequestHeader('Authorization', authorizationToken);
        xhr.setRequestHeader('X-Bz-File-Name', encodeURIComponent(fileName));
        xhr.setRequestHeader('Content-Type', file.type || 'b2/x-auto');
    // Use do_not_verify to skip hashing in the browser (avoids heavy SHA-1 for large files)
    xhr.setRequestHeader('X-Bz-Content-Sha1', 'do_not_verify');
        // Do NOT set Content-Length: browser sets it automatically

        xhr.send(file);
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

    previewFileName.textContent = file.filename;
    downloadFileName.textContent = file.filename;

    const modalBody = document.querySelector('.modal-body');
    const fileExtension = file.filename.toLowerCase();

    if (fileExtension.endsWith('.pdf')) {
        // Render inline PDF preview using the API (proxies auth so no prompt)
        const src = `/api/download/${file.id}?inline=1`;
        modalBody.innerHTML = `<embed id="pdfViewer" src="${src}" type="application/pdf" width="100%" height="500px">`;
    } else {
        let fileTypeIcon = '📄';
        let fileTypeName = 'Document';
        if (fileExtension.endsWith('.epub')) { fileTypeIcon = '📖'; fileTypeName = 'EPUB eBook'; }
        else if (fileExtension.endsWith('.mobi')) { fileTypeIcon = '📚'; fileTypeName = 'MOBI eBook'; }
        modalBody.innerHTML = `
            <div style="text-align: center; padding: 2rem; color: var(--text-secondary);">
                <div style="font-size: 4rem; margin-bottom: 1rem;">${fileTypeIcon}</div>
                <h3 style="color: var(--primary-purple); margin-bottom: 1rem;">${fileTypeName}</h3>
                <p><strong>File name:</strong> ${file.filename}</p>
                <p><strong>File size:</strong> ${formatFileSize(file.size)}</p>
                <p><strong>Uploaded:</strong> ${new Date(file.uploadedAt).toLocaleDateString()}</p>
            </div>`;
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
        // Fallback to stored filename if originalName is absent
        link.download = file.originalName || file.filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        showMessage(`✓ Downloading ${file.originalName || file.filename}...`, 'success');
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

// ===== Admin dashboard logic =====
async function initAdmin() {
    const status = document.getElementById('adminStatus');
    if (!status) return; // admin section not on this page
    if (adminKey) {
        const ok = await verifyAdminKey(adminKey);
        status.textContent = ok ? 'Unlocked' : 'Locked (invalid key)';
        if (ok) await loadAdminFiles();
    } else {
        status.textContent = 'Locked';
    }
    const loginBtn = document.getElementById('adminLoginBtn');
    const logoutBtn = document.getElementById('adminLogoutBtn');
    if (loginBtn) loginBtn.onclick = adminLogin;
    if (logoutBtn) logoutBtn.onclick = adminLogout;
}

async function adminLogin() {
    const input = document.getElementById('adminKeyInput');
    const status = document.getElementById('adminStatus');
    const key = (input?.value || '').trim();
    if (!key) { if (status) status.textContent = 'Enter a key'; return; }
    const ok = await verifyAdminKey(key);
    if (ok) {
        adminKey = key;
        localStorage.setItem('ADMIN_KEY', key);
        if (status) status.textContent = 'Unlocked';
        await loadAdminFiles();
    } else {
        if (status) status.textContent = 'Invalid key';
    }
}

function adminLogout() {
    const status = document.getElementById('adminStatus');
    adminKey = null;
    localStorage.removeItem('ADMIN_KEY');
    if (status) status.textContent = 'Locked';
    const grid = document.getElementById('adminFilesGrid');
    if (grid) grid.innerHTML = '';
}

async function verifyAdminKey(key) {
    try {
        const res = await fetch('/api/admin/status', { headers: { 'x-admin-key': key } });
        if (!res.ok) return false;
        const data = await res.json();
        return !!data.ok;
    } catch (e) { return false; }
}

async function loadAdminFiles() {
    const grid = document.getElementById('adminFilesGrid');
    if (!grid) return;
    await loadFiles();
    grid.innerHTML = '';
    files.forEach(f => {
        const card = document.createElement('div');
        card.className = 'book-card';
        card.innerHTML = `
            <div class="book-cover"><div class="book-icon">📁</div></div>
            <div class="book-info">
                <div class="book-title">${escapeHtml(f.filename)}</div>
                <div class="book-meta">${formatFileSize(f.size)} • ${new Date(f.uploadedAt).toLocaleDateString()}</div>
                <div class="book-actions">
                    <button class="btn btn-outline" data-id="${f.id}">Preview</button>
                    <button class="btn btn-purple" data-del-id="${f.id}">Delete</button>
                </div>
            </div>`;
        card.querySelector('[data-del-id]')?.addEventListener('click', () => adminDelete(f.id));
        card.querySelector('[data-id]')?.addEventListener('click', () => previewFile(f.id));
        grid.appendChild(card);
    });
}

async function adminDelete(id) {
    if (!adminKey) { showNotification('error', 'Unauthorized', 'Unlock admin first'); return; }
    if (!confirm('Delete this file?')) return;
    try {
        const res = await fetch(`/api/delete/${id}`, { method: 'DELETE', headers: { 'x-admin-key': adminKey } });
        if (!res.ok) {
            const t = await res.text();
            showNotification('error', 'Delete failed', t || 'Unknown error');
            return;
        }
        showNotification('success', 'Deleted', 'File removed');
        await loadAdminFiles();
    } catch (e) {
        showNotification('error', 'Delete failed', e.message);
    }
}