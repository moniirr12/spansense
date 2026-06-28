// ============================================
// PHOTO MANAGEMENT SYSTEM - COMPLETE WORKING VERSION
// ============================================

// Styled stand-in for confirm() — same look/API as inspection1.html's
// showModal, scoped under #confirmModalOverlay so it doesn't collide with
// the existing #modal (defect-entry) open/close functions on this page.
function showConfirmModal(opts) {
    const overlay = document.getElementById('confirmModalOverlay');
    if (!overlay) return Promise.resolve(true);

    const iconBox = document.getElementById('confirmModalIcon');
    const titleBox = document.getElementById('confirmModalTitle');
    const msgBox = document.getElementById('confirmModalMessage');
    const actionsBox = document.getElementById('confirmModalActions');

    const type = opts.type || 'error';
    const confirmText = opts.confirmText || 'OK';
    const cancelText = opts.cancelText || 'Cancel';
    const showCancel = opts.showCancel || false;

    return new Promise((resolve) => {
        iconBox.className = 'modal-icon';
        if (type === 'warning' || type === 'success' || type === 'error') iconBox.classList.add(type);
        const iconMap = { error: 'fa-exclamation-circle', warning: 'fa-exclamation-triangle', success: 'fa-check-circle' };
        iconBox.innerHTML = `<i class="fas ${iconMap[type] || iconMap.error}"></i>`;

        titleBox.textContent = opts.title || '';
        msgBox.textContent = opts.message || '';

        let buttonsHTML = '';
        if (showCancel) buttonsHTML += `<button class="modal-btn secondary" id="confirmModalCancelBtn">${cancelText}</button>`;
        buttonsHTML += `<button class="modal-btn ${type === 'error' ? 'danger' : 'primary'}" id="confirmModalConfirmBtn">${confirmText}</button>`;
        actionsBox.innerHTML = buttonsHTML;

        const close = (result) => {
            overlay.classList.remove('active');
            document.removeEventListener('keydown', escHandler);
            resolve(result);
        };
        const escHandler = (e) => { if (e.key === 'Escape') close(false); };

        document.getElementById('confirmModalConfirmBtn').onclick = () => close(true);
        const cancelBtn = document.getElementById('confirmModalCancelBtn');
        if (cancelBtn) cancelBtn.onclick = () => close(false);

        overlay.classList.add('active');
        document.addEventListener('keydown', escHandler);
    });
}
window.showConfirmModal = showConfirmModal;
document.getElementById('confirmModalOverlay')?.addEventListener('click', (e) => {
    if (e.target.id === 'confirmModalOverlay') e.target.classList.remove('active');
});

// Styled stand-in for native alert() — single OK button, no cancel.
function showAlertModal(message, type, title) {
    const defaultTitles = { error: 'Error', warning: 'Warning', success: 'Success' };
    type = type || 'error';
    return showConfirmModal({
        title: title || defaultTitles[type] || 'Notice',
        message: message,
        type: type,
        confirmText: 'OK'
    });
}
window.showAlertModal = showAlertModal;

// Global photoData object
let photoData = JSON.parse(sessionStorage.getItem('photoData')) || {};

// ============================================
// OPEN PHOTO MODAL
// ============================================
function openPhotoModal(event) {
    const target = event.target;
    const expandableRow = target.closest("tr.expandable-row");
    const defectIdElement = expandableRow.querySelector(".defectId");

    if (!defectIdElement) {
        console.error("No defect ID found in row");
        return;
    }

    const defectId = defectIdElement.textContent;
    console.log("Opening photo modal for defect:", defectId);

    sessionStorage.setItem('currentDefectId', defectId);

    const modal = document.getElementById('uploadModal-photo');
    if (modal) {
        modal.style.display = "flex";
        loadDefectPhotos(defectId);
    }
}

// ============================================
// LOAD DEFECT PHOTOS (Main display function)
// ============================================
async function loadDefectPhotos(defectId) {
    const container = document.getElementById('previewContainer-photo');
    if (!container) return;
    
    container.innerHTML = '<div class="loading-spinner">Loading photos...</div>';
    
    try {
        // Get existing photos from sessionStorage first
        let existingPhotos = photoData[defectId] || [];
        
        // Get fresh photos from server
        const allServerPhotos = await getAllPhotosForCurrentInspection();
        const serverPhotosForDefect = allServerPhotos.filter(photo =>
            // defect_id comes back from Postgres as a number; defectId here is
            // always a string (read from the row's .defectId textContent) —
            // compare as strings so a real defect id still matches.
            String(photo.defect_id) === String(defectId) || String(photo.front_defectid) === String(defectId)
        );
        
        // Merge: Keep local photos that aren't yet uploaded
        const uploadedUrls = new Set(serverPhotosForDefect.map(p => p.photo_url));
        const pendingLocalPhotos = existingPhotos.filter(p => !p.photo_url || !uploadedUrls.has(p.photo_url));
        
        // Combine: server photos first, then pending local photos
        const mergedPhotos = [
            ...serverPhotosForDefect.map(p => ({
                ...p,
                source: 'server',
                preview_url: p.photo_url,
                photo_description: p.photo_description || '',
                isUploaded: true,
                photoId: p.id || p.photo_id
            })),
            ...pendingLocalPhotos.map(p => ({
                ...p,
                source: 'local',
                isUploaded: false
            }))
        ];
        
        // Update photoData for this defect
        photoData[defectId] = mergedPhotos;
        sessionStorage.setItem('photoData', JSON.stringify(photoData));
        
        container.innerHTML = '';
        
        // Create grid container
        const grid = document.createElement('div');
        grid.className = 'photo-grid';
        container.appendChild(grid);
        
        // Add Photos card
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.id = 'photoInput-photo';
        fileInput.accept = 'image/*';
        fileInput.multiple = true;
        fileInput.style.display = 'none';
        fileInput.onchange = () => handleNewPhotos(fileInput, defectId);
        
        const addCard = document.createElement('div');
        addCard.className = 'add-photo-card';
        addCard.innerHTML = `
            <div class="plus-sign">+</div>
            <div class="add-text">Add Photos</div>
        `;
        addCard.onclick = () => fileInput.click();
        grid.appendChild(addCard);
        container.appendChild(fileInput);
        
        // Display all merged photos
        mergedPhotos.forEach((photo, index) => {
            if (photo.isUploaded) {
                // Server photo - now editable
                addServerPhotoCard(grid, photo, defectId, index);
            } else {
                // Local pending photo
                addLocalPhotoCard(grid, photo, defectId, index);
            }
        });
        
    } catch (error) {
        console.error('Error loading photos:', error);
        container.innerHTML = '<div class="error-message">Error loading photos</div>';
    }
}

// ============================================
// HANDLE NEW PHOTOS — auto-uploads immediately, no separate Save step
// ============================================
function handleNewPhotos(fileInput, defectId) {
    const files = Array.from(fileInput.files).filter(f => f.type.startsWith('image/'));
    fileInput.value = '';
    if (!files.length) return;

    files.forEach((file) => {
        const reader = new FileReader();
        reader.onload = function(e) {
            const newPhoto = {
                clientId: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
                defect_id: defectId,
                preview_url: e.target.result,
                photo_description: "",
                file_name: file.name,
                file_size: file.size,
                file_type: file.type,
                file_object: file,
                source: 'local',
                uploading: true,
                display_order: photoData[defectId]?.length || 0
            };

            if (!photoData[defectId]) photoData[defectId] = [];
            photoData[defectId].push(newPhoto);
            sessionStorage.setItem('photoData', JSON.stringify(photoData));
            loadDefectPhotos(defectId);

            uploadPhotoNow(defectId, newPhoto.clientId);
        };
        reader.readAsDataURL(file);
    });
}

// ============================================
// AUTO-UPLOAD ONE PHOTO (fires as soon as it's added — no Save button)
// ============================================
async function uploadPhotoNow(defectId, clientId) {
    const bridgeId = sessionStorage.getItem('structureId');
    const inspectionDate = sessionStorage.getItem('inspectionDate');
    // Re-read from photoData (not a captured object reference) since
    // loadDefectPhotos() rebuilds the array on every render.
    const photo = (photoData[defectId] || []).find(p => p.clientId === clientId);
    if (!photo) return;

    // file_object doesn't survive a sessionStorage round-trip (e.g. a retry
    // after a page reload), so fall back to rebuilding it from the base64
    // preview, which does.
    const file = photo.file_object || (photo.preview_url && dataURLtoFile(photo.preview_url, photo.file_name, photo.file_type));
    if (!bridgeId || !inspectionDate || !file) {
        setPhotoUploadState(defectId, clientId, { uploading: false, failed: true });
        showToast('Missing required information — photo not saved');
        return;
    }

    const formData = new FormData();
    formData.append('defectId', defectId);
    formData.append('inspectionDate', inspectionDate);
    formData.append('photos', file);
    formData.append('descriptions[0]', photo.photo_description || '');
    formData.append('displayOrders[0]', photo.display_order ?? 0);

    try {
        const response = await fetch(`/api/bridges/${bridgeId}/inspection-photos`, {
            method: 'POST',
            body: formData
        });
        if (!response.ok) throw new Error('Upload failed');
        const result = await response.json();
        const uploaded = result.success && result.photos && result.photos[0];
        if (!uploaded) throw new Error('Upload failed');

        setPhotoUploadState(defectId, clientId, {
            photo_url: uploaded.url,
            server_url: uploaded.url,
            photoId: uploaded.id,
            id: uploaded.id,
            uploading: false,
            failed: false,
            file_object: undefined
        });
    } catch (error) {
        console.error('Upload error:', error);
        setPhotoUploadState(defectId, clientId, { uploading: false, failed: true });
        showToast('Upload failed — tap the photo to retry');
    }
}

// Patches the photoData entry matching clientId (wherever it currently sits
// in the array) and re-renders.
function setPhotoUploadState(defectId, clientId, patch) {
    const list = photoData[defectId] || [];
    const idx = list.findIndex(p => p.clientId === clientId);
    if (idx === -1) return;
    list[idx] = { ...list[idx], ...patch };
    sessionStorage.setItem('photoData', JSON.stringify(photoData));
    loadDefectPhotos(defectId);
}

function retryUpload(defectId, index) {
    const photo = (photoData[defectId] || [])[index];
    if (!photo || !photo.clientId) return;
    setPhotoUploadState(defectId, photo.clientId, { uploading: true, failed: false });
    uploadPhotoNow(defectId, photo.clientId);
}

// ============================================
// LOCAL PHOTO CARD — only ever in an "uploading" or "failed" state, since
// a successful upload immediately becomes a server card instead.
// ============================================
function addLocalPhotoCard(grid, photo, defectId, index) {
    const photoElement = document.createElement('div');
    photoElement.className = 'preview-item-photo';
    photoElement.setAttribute('data-index', index);

    const statusHtml = photo.uploading
        ? `<div class="photo-status uploading"><i class="fas fa-spinner fa-spin"></i> Saving...</div>`
        : photo.failed
            ? `<div class="photo-status failed" onclick="retryUpload('${defectId}', ${index})"><i class="fas fa-rotate-right"></i> Failed — tap to retry</div>`
            : '';

    photoElement.innerHTML = `
        ${!photo.uploading ? `<span class="remove-photo" onclick="removeLocalPhoto('${defectId}', ${index})">×</span>` : ''}
        <img src="${photo.preview_url}" alt="Preview">
        ${statusHtml}
        <textarea class="photo-description-input"
                  placeholder="Add description...">${escapeHtml(photo.photo_description || '')}</textarea>
    `;

    // This defect doesn't have a real database id yet (brand-new, not-yet-saved
    // defect) — there's no row to PATCH, so the caption just lives in
    // sessionStorage and gets sent along when the whole inspection is saved.
    const textarea = photoElement.querySelector('.photo-description-input');
    textarea.addEventListener('input', function() {
        if (photoData[defectId] && photoData[defectId][index]) {
            photoData[defectId][index].photo_description = this.value;
            sessionStorage.setItem('photoData', JSON.stringify(photoData));
        }
    });

    grid.appendChild(photoElement);
}

// ============================================
// REMOVE A LOCAL (NOT YET SAVED, OR FAILED) PHOTO — nothing's persisted
// yet, so no confirmation needed here.
// ============================================
function removeLocalPhoto(defectId, index) {
    if (photoData[defectId] && photoData[defectId][index]) {
        photoData[defectId].splice(index, 1);
        sessionStorage.setItem('photoData', JSON.stringify(photoData));
        loadDefectPhotos(defectId);
    }
}

// ============================================
// SERVER PHOTO CARD — already saved; description edits autosave (debounced
// PATCH) and removal asks for confirmation since it deletes a saved record.
// ============================================
function addServerPhotoCard(grid, photo, defectId, index) {
    const photoElement = document.createElement('div');
    photoElement.className = 'preview-item-photo';
    photoElement.setAttribute('data-index', index);
    photoElement.innerHTML = `
        <span class="remove-photo" onclick="removeServerPhoto('${defectId}', ${index})">×</span>
        <img src="${photo.preview_url}" alt="Photo">
        <textarea class="photo-description-input"
                  placeholder="Add description...">${escapeHtml(photo.photo_description || '')}</textarea>
    `;

    const textarea = photoElement.querySelector('.photo-description-input');
    let debounceTimer = null;
    textarea.addEventListener('input', function() {
        const value = this.value;
        if (photoData[defectId] && photoData[defectId][index]) {
            photoData[defectId][index].photo_description = value;
            sessionStorage.setItem('photoData', JSON.stringify(photoData));
        }
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => updateServerPhotoDescription(photo.photoId, value), 600);
    });

    grid.appendChild(photoElement);
}

async function updateServerPhotoDescription(photoId, description) {
    if (!photoId) return;
    try {
        const response = await fetch(`/api/inspection-photos/${photoId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ photo_description: description })
        });
        if (!response.ok) throw new Error('Failed to save description');
    } catch (error) {
        console.error('Failed to update photo description:', error);
        showToast('Could not save description');
    }
}

async function removeServerPhoto(defectId, index) {
    const photo = (photoData[defectId] || [])[index];
    if (!photo) return;

    const confirmed = await showConfirmModal({
        title: 'Remove Photo',
        message: 'This photo has already been saved. Remove it permanently?',
        type: 'warning',
        confirmText: 'Remove',
        cancelText: 'Keep',
        showCancel: true
    });
    if (!confirmed) return;

    try {
        const response = await fetch(`/api/inspection-photos/${photo.photoId}`, { method: 'DELETE' });
        if (!response.ok) throw new Error('Delete failed');
        photoData[defectId].splice(index, 1);
        sessionStorage.setItem('photoData', JSON.stringify(photoData));
        loadDefectPhotos(defectId);
    } catch (error) {
        console.error('Failed to remove photo:', error);
        showToast('Could not remove photo: ' + error.message);
    }
}

// ============================================
// GET ALL PHOTOS FOR CURRENT INSPECTION
// ============================================
async function getAllPhotosForCurrentInspection() {
    const bridgeId = sessionStorage.getItem('structureId');
    let inspectionDate = sessionStorage.getItem('inspectionDate');

    if (inspectionDate && !/^\d{4}-\d{2}-\d{2}$/.test(inspectionDate)) {
        inspectionDate = new Date(inspectionDate).toISOString().split('T')[0];
    }

    if (!bridgeId || !inspectionDate) {
        return [];
    }

    try {
        const apiUrl = new URL(`/api/bridges/${bridgeId}/inspection-photos`);
        apiUrl.searchParams.append('inspectionDate', inspectionDate);

        const response = await fetch(apiUrl.toString());
        if (!response.ok) throw new Error('Failed to fetch photos');

        const result = await response.json();
        
        if (!result.success || !result.photos) {
            return [];
        }

        return result.photos.map(p => ({
            ...p,
            source: 'server',
            preview_url: p.photo_url,
            defect_id: p.defect_id || p.front_defectid || 'unknown'
        }));
    } catch (error) {
        console.error('Error loading photos:', error);
        return [];
    }
}

// ============================================
// CLOSE PHOTO MODAL
// ============================================
function closePhotoModal() {
    // Photos auto-upload as soon as they're added (see uploadPhotoNow), so
    // there's never anything unsaved sitting around to warn about here.
    const modal = document.getElementById('uploadModal-photo');
    if (modal) modal.style.display = 'none';
    const container = document.getElementById('previewContainer-photo');
    if (container) container.innerHTML = '';
    const fileInput = document.getElementById('photoInput-photo');
    if (fileInput) fileInput.value = '';
}

// ============================================
// HELPER FUNCTIONS
// ============================================
function dataURLtoFile(dataURL, filename, type) {
    const arr = dataURL.split(',');
    const mime = arr[0].match(/:(.*?);/)[1];
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) u8arr[n] = bstr.charCodeAt(n);
    return new File([u8arr], filename, { type: type || mime });
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

// ============================================
// RENDER PHOTOS (Gallery view)
// ============================================
function renderPhotos(container, allPhotos) {
    container.innerHTML = '';
    
    if (!allPhotos?.length) {
        container.innerHTML = '<div class="no-photos">No photos found</div>';
        return;
    }

    const photosByDefect = allPhotos.reduce((acc, photo) => {
        (acc[photo.defect_id] = acc[photo.defect_id] || []).push(photo);
        return acc;
    }, {});

    Object.entries(photosByDefect).forEach(([defectId, photos]) => {
        const section = document.createElement('div');
        section.className = 'defect-photo-section';
        
        photos.forEach(photo => {
            section.innerHTML += `
                <div class="preview-item-photo">
                    <img src="${photo.preview_url}" loading="lazy">
                    <div class="photo-info">
                        <div class="photo-description">${escapeHtml(photo.photo_description || 'No description')}</div>
                        <div class="photo-meta ${photo.source}-photo">
                            ${photo.source === 'server' 
                                ? `Uploaded: ${photo.uploaded_at ? new Date(photo.uploaded_at).toLocaleString() : ''}`
                                : '(Not yet uploaded)'}
                        </div>
                    </div>
                </div>
            `;
        });
        
        container.appendChild(section);
    });
}

// ============================================
// OPEN GALLERY MODAL
// ============================================
async function openGalleryModal() {
    const modal = document.getElementById('uploadModal-photo');
    const container = document.getElementById('previewContainer-photo');
    
    if (!modal || !container) {
        console.error('Modal elements not found');
        return;
    }

    modal.style.display = "flex";
    container.innerHTML = '<div class="loading-spinner">Loading photos...</div>';

    try {
        const allPhotos = await getAllPhotosForCurrentInspection();
        renderPhotos(container, allPhotos);
    } catch (error) {
        console.error('Error:', error);
        container.innerHTML = '<div class="error-message">Error loading photos</div>';
    }
}

// ============================================
// RENDER DEFECT PHOTOS (Specific defect view)
// ============================================
function renderDefectPhotos(container, photos, defectId) {
    container.innerHTML = '';
    
    container.innerHTML = `
        <div class="defect-photo-header">
            <h3>Photos for Defect ${defectId}</h3>
            <div class="photo-actions">
                <button onclick="loadDefectPhotos('${defectId}')" class="normal-btn">
                    Refresh
                </button>
            </div>
        </div>
        <div class="photo-grid"></div>
    `;
    
    const grid = container.querySelector('.photo-grid');
    
    photos.forEach(photo => {
        const photoElement = document.createElement('div');
        photoElement.className = 'preview-item-photo';
        photoElement.innerHTML = `
            <img src="${photo.preview_url}" loading="lazy">
            <div class="photo-info">
                <div class="photo-description">${escapeHtml(photo.photo_description || 'No description')}</div>
                <div class="photo-meta ${photo.source}-photo">
                    ${photo.source === 'server' 
                        ? `Uploaded: ${photo.uploaded_at ? new Date(photo.uploaded_at).toLocaleString() : ''}`
                        : '(Not yet uploaded)'}
                </div>
            </div>
        `;
        grid.appendChild(photoElement);
    });
}

// ============================================
// MAKE FUNCTIONS GLOBAL
// ============================================
window.openPhotoModal = openPhotoModal;
window.closePhotoModal = closePhotoModal;
window.removeLocalPhoto = removeLocalPhoto;
window.removeServerPhoto = removeServerPhoto;
window.retryUpload = retryUpload;
window.loadDefectPhotos = loadDefectPhotos;
window.openGalleryModal = openGalleryModal;
