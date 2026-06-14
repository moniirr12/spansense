// ============================================
// PHOTO MANAGEMENT SYSTEM - COMPLETE WORKING VERSION
// ============================================

// Global photoData object
let photoData = JSON.parse(sessionStorage.getItem('photoData')) || {};

// Save Photos button listener
const savePhotosBtn = document.getElementById('savePhotosBtn');
if (savePhotosBtn) {
    savePhotosBtn.addEventListener('click', async function(e) {
        e.preventDefault();
        await savePhotos();
    });
}

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
            photo.defect_id === defectId || photo.front_defectid === defectId
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
// HANDLE NEW PHOTOS
// ============================================
function handleNewPhotos(fileInput, defectId) {
    if (!fileInput.files.length) return;
    
    Array.from(fileInput.files).forEach((file) => {
        if (!file.type.startsWith('image/')) return;
        
        const reader = new FileReader();
        reader.onload = function(e) {
            const newPhoto = {
                defect_id: defectId,
                preview_url: e.target.result,
                photo_description: "",
                file_name: file.name,
                file_size: file.size,
                file_type: file.type,
                file_object: file,
                source: 'local',
                display_order: photoData[defectId]?.length || 0
            };
            
            if (!photoData[defectId]) photoData[defectId] = [];
            photoData[defectId].push(newPhoto);
            sessionStorage.setItem('photoData', JSON.stringify(photoData));
            
            loadDefectPhotos(defectId);
        };
        reader.readAsDataURL(file);
    });
    
    fileInput.value = '';
}

// ============================================
// ADD LOCAL PHOTO CARD (Editable)
// ============================================
function addLocalPhotoCard(grid, photo, defectId, index) {
    const photoElement = document.createElement('div');
    photoElement.className = 'preview-item-photo';
    photoElement.setAttribute('data-index', index);
    photoElement.innerHTML = `
        <span class="remove-photo" onclick="removeLocalPhoto('${defectId}', ${index})">×</span>
        <img src="${photo.preview_url}" alt="Preview">
        <textarea class="photo-description-input" 
                  placeholder="Add description...">${escapeHtml(photo.photo_description || '')}</textarea>
    `;
    
    // Add event listener to the textarea
    const textarea = photoElement.querySelector('.photo-description-input');
    textarea.addEventListener('input', function() {
        updateLocalPhotoDescription(defectId, index, this.value);
    });
    
    grid.appendChild(photoElement);
}

// ============================================
// UPDATE LOCAL PHOTO DESCRIPTION
// ============================================
function updateLocalPhotoDescription(defectId, index, description) {
    console.log(`Updating photo ${index} description:`, description);
    
    if (photoData[defectId] && photoData[defectId][index]) {
        photoData[defectId][index].photo_description = description;
        sessionStorage.setItem('photoData', JSON.stringify(photoData));
        console.log(`✅ Updated photo ${index} description saved to sessionStorage`);
    } else {
        console.error(`Photo not found at index ${index} for defect ${defectId}`);
    }
}

// ============================================
// REMOVE LOCAL PHOTO
// ============================================
function removeLocalPhoto(defectId, index) {
    if (confirm('Remove this photo?')) {
        if (photoData[defectId] && photoData[defectId][index]) {
            photoData[defectId].splice(index, 1);
            sessionStorage.setItem('photoData', JSON.stringify(photoData));
            loadDefectPhotos(defectId);
        }
    }
}

// ============================================
// SAVE PHOTOS TO SERVER
// ============================================
async function savePhotos() {
    const defectId = sessionStorage.getItem('currentDefectId');
    const bridgeId = sessionStorage.getItem('structureId');
    const inspectionDate = sessionStorage.getItem('inspectionDate');

    if (!defectId || !bridgeId || !inspectionDate) {
        alert('Missing required information');
        return;
    }

    if (!photoData[defectId] || !photoData[defectId].length) {
        alert('No photos to upload');
        return;
    }

    const photosToUpload = photoData[defectId].filter(photo => !photo.photo_url);
    
    if (!photosToUpload.length) {
        alert('All photos are already uploaded');
        return;
    }

    const formData = new FormData();
    formData.append('defectId', defectId);
    formData.append('inspectionDate', inspectionDate);

    photosToUpload.forEach((photo, index) => {
        const file = photo.file_object || dataURLtoFile(photo.preview_url, photo.file_name, photo.file_type);
        formData.append('photos', file);
        formData.append(`descriptions[${index}]`, photo.photo_description || '');
        formData.append(`displayOrders[${index}]`, photo.display_order ?? index);
    });

    try {
        const response = await fetch(`/api/bridges/${bridgeId}/inspection-photos`, {
            method: 'POST',
            body: formData
        });

        if (!response.ok) throw new Error('Upload failed');

        const result = await response.json();

        if (result.success && result.photos) {
            let uploadIndex = 0;
            photoData[defectId].forEach((photo, i) => {
                if (!photo.photo_url && uploadIndex < result.photos.length) {
                    photoData[defectId][i] = {
                        ...photo,
                        photo_url: result.photos[uploadIndex].url,
                        preview_url: photo.preview_url,
                        server_url: result.photos[uploadIndex].url,
                        id: result.photos[uploadIndex].id,
                        file_object: undefined
                    };
                    uploadIndex++;
                }
            });
            
            sessionStorage.setItem('photoData', JSON.stringify(photoData));
            alert('Photos uploaded successfully!');
            loadDefectPhotos(defectId);
        }
    } catch (error) {
        console.error('Upload error:', error);
        alert('Upload failed: ' + error.message);
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
    const shouldProceed = confirm("If you proceed to cancel, all progress will be lost. Continue?");
    if (shouldProceed) {
        const modal = document.getElementById('uploadModal-photo');
        if (modal) modal.style.display = 'none';
        const container = document.getElementById('previewContainer-photo');
        if (container) container.innerHTML = '';
        const fileInput = document.getElementById('photoInput-photo');
        if (fileInput) fileInput.value = '';
    }
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
window.savePhotos = savePhotos;
window.removeLocalPhoto = removeLocalPhoto;
window.updateLocalPhotoDescription = updateLocalPhotoDescription;
window.loadDefectPhotos = loadDefectPhotos;
window.openGalleryModal = openGalleryModal;
