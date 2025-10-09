// Global variables
// Removed preview state; only tracking files and admin key now
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
    
    if (fileInput) {
        fileInput.addEventListener('change', previewSelectedFile);
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
        <div class="book-card">
            <div class="book-cover">
                <img src="/api/cover/${file.id}" alt="${escapeHtml(file.filename)} cover" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" />
                <div class="book-icon" style="display:none">${getFileIcon(file.filename)}</div>
            </div>
            <div class="book-info">
                <div class="book-title">${escapeHtml(file.filename)}</div>
                <div class="book-meta">
                    <span class="file-size">${formatFileSize(file.size)}</span>
                    <span class="upload-date">${new Date(file.uploadedAt).toLocaleDateString()}</span>
                </div>
                <div class="book-actions">
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

    // Restrict file types client-side: only PDF, EPUB, MOBI
    const allowed = ['pdf', 'epub', 'mobi'];
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    if (!allowed.includes(ext)) {
        showNotification('error', 'Unsupported file type', 'Only PDF, EPUB, and MOBI files are allowed.');
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
            
            // Auto-generate a cover from the first page of the PDF (if PDF.js is available)
            try {
                const isPdf = (file.type && file.type.toLowerCase().includes('pdf')) || /\.pdf$/i.test(file.name);
                if (isPdf && typeof window !== 'undefined' && window['pdfjsLib']) {
                    progressLabel.textContent = 'Generating cover thumbnail...';
                    const thumbBlob = await generatePdfThumbnail(file, 600); // larger to look crisp in grid
                    if (thumbBlob) {
                        const cuRes = await fetch('/api/cover-upload', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                id: fileId,
                                originalFilename: (fileName || file.name).replace(/\.[^./]+$/, '') + '.jpg',
                                contentType: 'image/jpeg'
                            })
                        });
                        if (cuRes.ok) {
                            const cu = await cuRes.json();
                            // Wrap blob in a File-like for content-type
                            const coverFile = new File([thumbBlob], cu.coverB2Name.split('/').pop() || 'cover.jpg', { type: 'image/jpeg' });
                            await uploadDirectToB2(cu.uploadUrl, cu.authorizationToken, cu.coverB2Name, coverFile, () => {});
                        }
                    }
                } else if (/\.epub$/i.test(file.name) && typeof window !== 'undefined' && window.JSZip) {
                    try {
                        progressLabel.textContent = 'Extracting EPUB cover...';
                        const coverBlob = await extractEpubCover(file);
                        if (coverBlob) {
                            const cuRes = await fetch('/api/cover-upload', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    id: fileId,
                                    originalFilename: (fileName || file.name).replace(/\.[^./]+$/, '') + '.jpg',
                                    contentType: 'image/jpeg'
                                })
                            });
                            if (cuRes.ok) {
                                const cu = await cuRes.json();
                                const coverFile = new File([coverBlob], cu.coverB2Name.split('/').pop() || 'cover.jpg', { type: 'image/jpeg' });
                                await uploadDirectToB2(cu.uploadUrl, cu.authorizationToken, cu.coverB2Name, coverFile, () => {});
                            }
                        }
                    } catch (epErr) { console.warn('EPUB cover extraction failed:', epErr); }
                }
            } catch (e) { console.warn('Auto cover generation skipped:', e); }

            // Mark the file as ready so it appears in Browse
            try {
                await fetch('/api/commit-upload', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id: fileId })
                });
            } catch (e) { console.warn('Commit failed:', e); }

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
// Note: On mobile networks, large uploads can be slow or flaky. Consider slicing to B2 Large File API
// for resumable/chunked uploads if we need better reliability for >100MB files.
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

// Generate a thumbnail image (JPEG) from the first page of a PDF File using PDF.js
// Returns a Blob or null on failure
async function generatePdfThumbnail(file, maxDimension = 400) {
    try {
        if (!window['pdfjsLib']) return null;
        const pdfjsLib = window['pdfjsLib'];
        // workerSrc should be set in index.html; if not, try a safe default
        if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
            // This path must match where pdf.worker.js is hosted in your app
            pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js';
        }

        const data = await file.arrayBuffer();
        const loadingTask = pdfjsLib.getDocument({ data });
        const pdf = await loadingTask.promise;
        const page = await pdf.getPage(1);

        // Base viewport at scale 1, then compute scale to fit maxDimension
        const baseViewport = page.getViewport({ scale: 1 });
        const longestSide = Math.max(baseViewport.width, baseViewport.height);
        const scale = Math.max(1, maxDimension / longestSide);
        const viewport = page.getViewport({ scale });

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);

        await page.render({ canvasContext: ctx, viewport }).promise;

        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.85));
        return blob || null;
    } catch (err) {
        console.warn('PDF thumbnail generation failed:', err);
        return null;
    }
}

// Download file
async function downloadFile(fileId) {
    const file = fileId ? files.find(f => f.id === fileId) : null;
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

// Preview removed; closePreview no longer needed

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
// Removed modal click handler (preview removed)

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
    const controls = document.getElementById('adminCleanupControls');
    if (!status) return; // admin section not on this page
    if (adminKey) {
        const ok = await verifyAdminKey(adminKey);
        status.textContent = ok ? 'Unlocked' : 'Locked (invalid key)';
        if (controls) controls.classList.toggle('hidden', !ok);
        if (ok) await loadAdminFiles();
    } else {
        status.textContent = 'Locked';
        if (controls) controls.classList.add('hidden');
    }
    const loginBtn = document.getElementById('adminLoginBtn');
    const logoutBtn = document.getElementById('adminLogoutBtn');
    const cleanupBtn = document.getElementById('adminCleanupBtn');
    if (loginBtn) loginBtn.onclick = adminLogin;
    if (logoutBtn) logoutBtn.onclick = adminLogout;
    if (cleanupBtn) cleanupBtn.onclick = adminCleanup;
}

async function adminLogin() {
    const input = document.getElementById('adminKeyInput');
    const status = document.getElementById('adminStatus');
    const controls = document.getElementById('adminCleanupControls');
    const key = (input?.value || '').trim();
    if (!key) { if (status) status.textContent = 'Enter a key'; return; }
    const ok = await verifyAdminKey(key);
    if (ok) {
        adminKey = key;
        localStorage.setItem('ADMIN_KEY', key);
        if (status) status.textContent = 'Unlocked';
        if (controls) controls.classList.remove('hidden');
        await loadAdminFiles();
    } else {
        if (status) status.textContent = 'Invalid key';
        if (controls) controls.classList.add('hidden');
    }
}

function adminLogout() {
    const status = document.getElementById('adminStatus');
    const controls = document.getElementById('adminCleanupControls');
    adminKey = null;
    localStorage.removeItem('ADMIN_KEY');
    if (status) status.textContent = 'Locked';
    if (controls) controls.classList.add('hidden');
    const grid = document.getElementById('adminFilesGrid');
    if (grid) grid.innerHTML = '';
}

async function adminCleanup() {
    if (!adminKey) { showNotification('error', 'Unauthorized', 'Unlock admin first'); return; }
    const btn = document.getElementById('adminCleanupBtn');
    const resBox = document.getElementById('adminCleanupResult');
    const thresholdInput = document.getElementById('cleanupThreshold');
    const hours = parseInt(thresholdInput?.value || '6', 10);
    const thresholdMs = Number.isFinite(hours) && hours > 0 ? hours * 60 * 60 * 1000 : undefined;
    const body = thresholdMs ? { thresholdMs } : {};
    const original = btn?.textContent;
    if (btn) { btn.disabled = true; btn.textContent = 'Cleaning…'; }
    if (resBox) { resBox.textContent = 'Running cleanup…'; }
    try {
        const res = await fetch('/api/admin/cleanup-pending', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
            body: JSON.stringify(body)
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            showNotification('error', 'Cleanup failed', data.message || 'Unknown error');
            if (resBox) resBox.textContent = 'Cleanup failed';
            return;
        }
        if (resBox) {
            resBox.textContent = `Scanned: ${data.scanned ?? 0} • Kept: ${data.kept ?? 0} • Removed: ${data.removed ?? 0} • Deleted from B2: ${data.deletedFromB2 ?? 0}`;
        }
        showNotification('success', 'Cleanup complete', 'Pending items cleaned');
        await loadAdminFiles();
    } catch (e) {
        showNotification('error', 'Cleanup failed', e.message || 'Network error');
        if (resBox) resBox.textContent = 'Cleanup failed';
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = original || 'Cleanup Pending'; }
    }
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
                    <button class="btn btn-purple" data-del-id="${f.id}">Delete</button>
                </div>
            </div>`;
    card.querySelector('[data-del-id]')?.addEventListener('click', () => adminDelete(f.id));
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

// Extract cover image from an EPUB file (tries common paths and metadata). Returns Blob or null.
async function extractEpubCover(epubFile) {
    try {
        if (!window.JSZip) return null;
        const arrayBuffer = await epubFile.arrayBuffer();
        const zip = await JSZip.loadAsync(arrayBuffer);
        // Strategy: 1) look for images with 'cover' in filename 2) parse content.opf for meta cover id
        const imageExtensions = ['jpg','jpeg','png','gif','webp'];
        let candidateFiles = [];
        zip.forEach((relativePath, file) => {
            const lower = relativePath.toLowerCase();
            if (imageExtensions.some(ext => lower.endsWith('.'+ext)) && lower.includes('cover')) {
                candidateFiles.push(relativePath);
            }
        });
        if (candidateFiles.length > 0) {
            // Pick the smallest path depth (likely primary cover)
            candidateFiles.sort((a,b)=>a.split('/').length - b.split('/').length);
            const coverData = await zip.file(candidateFiles[0]).async('blob');
            return coverData;
        }
        // Fallback: parse package file (content.opf or *.opf) to locate manifest item with id referenced by meta name="cover"
        const opfPath = Object.keys(zip.files).find(p=>p.toLowerCase().endsWith('.opf'));
        if (opfPath) {
            const opfText = await zip.file(opfPath).async('text');
            const coverIdMatch = opfText.match(/<meta[^>]+name=["']cover["'][^>]*content=["']([^"']+)["']/i);
            if (coverIdMatch) {
                const coverId = coverIdMatch[1];
                const itemMatch = opfText.match(new RegExp(`<item[^>]+id=["']${coverId}["'][^>]*href=["']([^"']+)["']`, 'i'));
                if (itemMatch) {
                    let href = itemMatch[1];
                    // Resolve relative to opfPath
                    const baseDir = opfPath.split('/').slice(0,-1).join('/');
                    let fullPath = baseDir ? `${baseDir}/${href}` : href;
                    fullPath = fullPath.replace(/\\/g,'/');
                    if (zip.file(fullPath)) {
                        return await zip.file(fullPath).async('blob');
                    }
                }
            }
        }
    } catch (e) {
        console.warn('extractEpubCover failed', e);
    }
    return null;
}