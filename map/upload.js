// DOM elements
const modal = document.getElementById('fileExplorerModal');
const docsBtn = document.getElementById('docs');
const closeModalBtn = document.querySelector('.close-modal');
const backBtn = document.getElementById('backBtn');
const toast = document.getElementById('toast');

// State variables
let currentStructureId = null;
let currentPath = ['root'];
let currentFolder = { children: [] };

// Initialize file explorer
function initFileExplorer(structureId) {
    currentStructureId = structureId;
    currentPath = ['root'];
    loadFolderContents();
    updateDocModalTitle();
}

// Global state
let currentFolderId = null;
let selectedItem = null;
let isFolderView = false;

// DOM elements
const fileList = document.getElementById('fileList');
const breadcrumbs = document.getElementById('breadcrumbs');
const newFolderBtn = document.getElementById('newFolderBtn');
const uploadBtn = document.getElementById('uploadBtn');
const deleteBtn = document.getElementById('deleteBtn');
const folderForm = document.getElementById('folderForm');
const folderName = document.getElementById('folderName');
const createFolderBtn = document.getElementById('createFolderBtn');
const cancelFolderBtn = document.getElementById('cancelFolderBtn');
const fileInput = document.getElementById('fileInput');
const viewToggleBtn = document.getElementById('viewToggleBtn');

// Initialize the explorer
function initializeFileExplorer() {
    loadFolderContents();
    
    // Event listeners
    newFolderBtn.addEventListener('click', showFolderForm);
    uploadBtn.addEventListener('click', () => fileInput.click());
    deleteBtn.addEventListener('click', deleteSelectedItem);
    createFolderBtn.addEventListener('click', createFolder);
    cancelFolderBtn.addEventListener('click', hideFolderForm);
    fileInput.addEventListener('change', uploadFile);
    viewToggleBtn.addEventListener('click', toggleView);
    
    // Modal control
    docsBtn.addEventListener('click', () => {
        const structureId = sessionStorage.getItem('structureId');
        if (structureId) {
            initFileExplorer(structureId);
            modal.style.display = 'flex';
            document.body.style.overflow = 'hidden';
        } else {
            showToast('No structure selected');
        }
    });

    closeModalBtn.addEventListener('click', () => {
        modal.style.display = 'none';
        document.body.style.overflow = 'auto';
    });

    window.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.style.display = 'none';
            document.body.style.overflow = 'auto';
        }
    });
}

// Call initialization when DOM is loaded
document.addEventListener('DOMContentLoaded', initializeFileExplorer);

// Add these new functions
function toggleView() {
    isFolderView = !isFolderView;
    viewToggleBtn.innerHTML = isFolderView
        ? '<i class="fas fa-list"></i> List View'
        : '<i class="fas fa-th-large"></i> Folder View';
    refreshView();
}

function refreshView() {
    const currentItems = Array.from(fileList.children)
        .filter(li => li.classList.contains('folder-item') || 
                    li.classList.contains('file-item'));
    
    fileList.innerHTML = '';
    
    if (isFolderView) {
        fileList.classList.add('folder-view');
    } else {
        fileList.classList.remove('folder-view');
    }
    
    currentItems.forEach(item => fileList.appendChild(item));

}

// Load folder contents
async function loadFolderContents(folderId = null) {
    try {
        currentFolderId = folderId;
        
        // Fetch both folders and files in parallel
        const [folders, files] = await Promise.all([
            fetchFolders(folderId),
            fetchFiles(folderId)
        ]);
        
        renderBreadcrumbs(folderId);
        renderContents(folders, files);
        
    } catch (error) {
        console.error('Error loading contents:', error);
        fileList.innerHTML = '<li>Error loading contents</li>';
    }
}

// Fetch folders from API
// Fetch folders for current structure
async function fetchFolders(parentId = null) {
    try {
        const url = parentId 
            ? `http://localhost:3000/api/bridges/${currentStructureId}/folders?parentId=${parentId}`
            : `http://localhost:3000/api/bridges/${currentStructureId}/folders`;
        
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Server returned ${response.status}: ${response.statusText}`);
        }
        return await response.json();
    } catch (error) {
        console.error('Error fetching folders:', error);
        throw error;
    }
}

// Fetch files from API
// Fetch files for current structure
async function fetchFiles(folderId = null) {
    try {
        const url = folderId 
            ? `http://localhost:3000/api/bridges/${currentStructureId}/files?folderId=${folderId}`
            : `http://localhost:3000/api/bridges/${currentStructureId}/files`;
        
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Server returned ${response.status}: ${response.statusText}`);
        }
        return await response.json();
    } catch (error) {
        console.error('Error fetching files:', error);
        throw error;
    }
}

// Fetch folder path
// Get folder path hierarchy
async function fetchFolderPath(folderId) {
    try {
        const response = await fetch(`http://localhost:3000/api/bridges/${currentStructureId}/folders/${folderId}/path`);
        if (!response.ok) {
            throw new Error(`Server returned ${response.status}: ${response.statusText}`);
        }
        return await response.json();
    } catch (error) {
        console.error('Error fetching folder path:', error);
        throw error;
    }
}

// Render breadcrumbs
async function renderBreadcrumbs(folderId) {
    breadcrumbs.innerHTML = '';
    
    // Home breadcrumb (always shown)
    const homeCrumb = document.createElement('span');
    homeCrumb.className = 'breadcrumb';
    homeCrumb.textContent = 'Home';
    homeCrumb.addEventListener('click', () => loadFolderContents(null));
    breadcrumbs.appendChild(homeCrumb);
    
    if (folderId) {
        try {
            const path = await fetchFolderPath(folderId);
            
            // Reverse the array to get proper hierarchy
            const properOrder = [...path].reverse();
            
            properOrder.forEach(folder => {
                // Add separator
                const separator = document.createElement('span');
                separator.textContent = ' › ';
                separator.className = 'breadcrumb-separator';
                breadcrumbs.appendChild(separator);
                
                // Add folder crumb
                const crumb = document.createElement('span');
                crumb.className = 'breadcrumb';
                crumb.textContent = folder.name;
                crumb.addEventListener('click', () => loadFolderContents(folder.id));
                breadcrumbs.appendChild(crumb);
            });
        } catch (error) {
            console.error('Error rendering breadcrumbs:', error);
        }
    }
}

function createBreadcrumbSeparator() {
    const separator = document.createElement('span');
    separator.textContent = ' › ';
    return separator;
}


// Render folders and files
function renderContents(folders, files) {
    fileList.innerHTML = '';

    if (isFolderView) {
        fileList.classList.add('folder-view');
    } else {
        fileList.classList.remove('folder-view');
    }
    
    // Sort folders alphabetically (A-Z)
    folders.sort((a, b) => a.name.localeCompare(b.name));
    
    // Sort files alphabetically (A-Z)
    files.sort((a, b) => a.name.localeCompare(b.name));
    
    // Add sorted folders first
    folders.forEach(folder => {
        const li = document.createElement('li');
        li.className = 'folder-item';
        li.dataset.id = folder.id;
        li.dataset.type = 'folder';
        li.innerHTML = `
            <span class="file-icon">📁</span>
            <span>${folder.name}</span>
        `;
        
        li.addEventListener('click', () => selectItem(li));
        li.addEventListener('dblclick', () => loadFolderContents(folder.id));
        
        fileList.appendChild(li);
    });
    
    // Add sorted files
    files.forEach(file => {
        const li = document.createElement('li');
        li.className = 'file-item';
        li.dataset.id = file.id;
        li.dataset.type = 'file';
        li.innerHTML = `
            <span class="file-icon">${getFileIcon(file.name)}</span>
            <span>${file.name}</span>
        `;
        
        li.addEventListener('click', () => selectItem(li));
        li.addEventListener('dblclick', () => openFile(file));
        
        fileList.appendChild(li);
    });
    
    // Add "Add New" option
    const addNew = document.createElement('li');
    addNew.className = `file-item add-new ${isFolderView ? 'folder-view-item' : ''}`;
    addNew.textContent = '+ Add New File';
    addNew.addEventListener('click', () => fileInput.click());
    fileList.appendChild(addNew);
}

// Get appropriate icon for file type
function getFileIcon(filename) {
    const extension = filename.split('.').pop().toLowerCase();
    const icons = {
        pdf: '📄',
        doc: '📝', docx: '📝',
        xls: '📊', xlsx: '📊',
        jpg: '🖼️', jpeg: '🖼️', png: '🖼️', gif: '🖼️',
        zip: '🗄️', rar: '🗄️',
        default: '📄'
    };
    return icons[extension] || icons.default;
}

// Select an item
function selectItem(element) {
    // Clear previous selection
    document.querySelectorAll('.file-item, .folder-item').forEach(item => {
        item.style.backgroundColor = '';
    });
    
    // Set new selection
    element.style.backgroundColor = '#e3f2fd';
    selectedItem = {
        id: element.dataset.id,
        type: element.dataset.type
    };
    
    // Enable delete button
    deleteBtn.disabled = false;
}

// Open a file
function openFile(file) {
    window.open(file.filepath, '_blank');
}

// Show folder creation form
function showFolderForm() {
    folderForm.style.display = 'block';
    folderName.focus();
}

// Hide folder creation form
function hideFolderForm() {
    folderForm.style.display = 'none';
    folderName.value = '';
}

// Create a new folder
async function createFolder() {
    const name = folderName.value.trim();
    if (!name) return;

    try {
        const response = await fetch(`http://localhost:3000/api/bridges/${currentStructureId}/folders`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name,
                parent_id: currentFolderId || null
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to create folder');
        }

        hideFolderForm();
        loadFolderContents(currentFolderId);
    } catch (error) {
        console.error('Error creating folder:', error);
        alert(`Error: ${error.message}`);
    }
}

// Upload a file
async function uploadFile() {
  const file = fileInput.files[0];
  if (!file) return;

  const formData = new FormData();
  formData.append('file', file);
  if (currentFolderId) {
    formData.append('folderId', currentFolderId);
  }

  try {
    const response = await fetch(`http://localhost:3000/api/bridges/${currentStructureId}/files`, {
      method: 'POST',
      body: formData,
      // Don't set Content-Type manually - let browser set it with boundary
      headers: {
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || `Upload failed (${response.status})`);
    }

    const result = await response.json();
    console.log('Upload success:', result);
    loadFolderContents(currentFolderId);
  } catch (error) {
    console.error('Upload error:', error);
    alert(`Upload failed: ${error.message}`);
  } finally {
    fileInput.value = '';
  }
}


// Delete selected item
async function deleteSelectedItem() {
    if (!selectedItem || !confirm('Are you sure you want to delete this item?')) {
        return;
    }

    try {
        const endpoint = selectedItem.type === 'folder'
            ? `http://localhost:3000/api/bridges/${currentStructureId}/folders/${selectedItem.id}`
            : `http://localhost:3000/api/bridges/${currentStructureId}/files/${selectedItem.id}`;

        const response = await fetch(endpoint, {
            method: 'DELETE',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            }
        });

        // First check if response is JSON
        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
            const text = await response.text();
            throw new Error(text || 'Server returned non-JSON response');
        }

        const result = await response.json();
        
        if (!response.ok) {
            throw new Error(result.error || 'Deletion failed');
        }

        // Success case
        selectedItem = null;
        deleteBtn.disabled = true;
        loadFolderContents(currentFolderId);
        
    } catch (error) {
        console.error('Deletion error:', error);
        // Extract clean error message from possible HTML response
        const errorMsg = error.message.startsWith('<!DOCTYPE') 
            ? 'Server error - please check console'
            : error.message;
        alert(`Deletion failed: ${errorMsg}`);
    }
}



// Update modal title
function updateDocModalTitle() {
    const structureName = sessionStorage.getItem('structureName') || 'Untitled Structure';
    const structureId = sessionStorage.getItem('structureId') || '';
    document.getElementById('explorerTitle').textContent = 
        `Documents - ${structureName} (#${structureId})`;
}



// Modal control
docsBtn.addEventListener('click', () => {
    const structureId = sessionStorage.getItem('structureId');
    if (structureId) {
        initFileExplorer(structureId);
        modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
        const bridgeModal = document.getElementById('bridgeModal');
        if (bridgeModal) bridgeModal.style.display = 'none';
    } else {
        showToast('No structure selected');
    }
});

// REPLACE WITH (both occurrences — there are two, at top and bottom):
closeModalBtn.addEventListener('click', () => {
    modal.style.display = 'none';
    document.body.style.overflow = 'auto';
    const bridgeModal = document.getElementById('bridgeModal');
    if (bridgeModal) bridgeModal.style.display = 'flex';
});

window.addEventListener('click', (e) => {
    if (e.target === modal) {
        modal.style.display = 'none';
        document.body.style.overflow = 'auto';
        const bridgeModal = document.getElementById('bridgeModal');
        if (bridgeModal) bridgeModal.style.display = 'flex';
    }
});