document.addEventListener("DOMContentLoaded", function () {
    const structureId = sessionStorage.getItem('structureId');  
    const structureName = sessionStorage.getItem('structureName');
    
    // Get inspectionType from inspectionData object
    const inspectionData = JSON.parse(sessionStorage.getItem('inspectionData') || '{}');
    const inspectionType = inspectionData.inspectionType;
    
    console.log('Retrieved inspectionType:', inspectionType); // Should log "GI"

    if (structureId && structureName) {
        let headerText = `${structureName} (Bridge #${structureId})`;
        
        if (inspectionType === 'PI') {
            headerText = `${structureName} Principal Inspection`;
        } else if (inspectionType === 'GI') {
            headerText = `${structureName} General Inspection`;
        } else if (inspectionType === 'SI') {
            headerText = `${structureName} Safety Inspection`;
        }
        
        document.getElementById('bridgeHeader').textContent = headerText;
        console.log('Header set to:', headerText);

        // Store structureId in a hidden form field
        const structureIdInput = document.createElement('input');
        structureIdInput.type = 'hidden';
        structureIdInput.name = 'structureId';
        structureIdInput.value = structureId;
        const inspectionForm = document.getElementById('inspectionForm');
        if (inspectionForm) {
            inspectionForm.appendChild(structureIdInput);
        }

    } else {
        document.getElementById('bridgeHeader').textContent = "No structure data found.";
    }
});

// Define the mapping of defectType to defectNumber options
const defectMapping = {
  1: [1, 2, 3, 4],
  2: [2, 3, 4, 5, 6],
  3: [1, 2, 3, 4, 5, 6, 7],
  4: [1],
  5: [1, 2],
  6: [1, 2, 3, 4, 5, 6],
  7: [1, 2],
  8: [1, 2, 3, 4],
  9: [1, 2, 3, 4, 5, 6],
  10: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  11: [1],
  12: [1, 2, 3, 4, 5, 6],
  13: [1],
  14: [1, 2],
  15: [1],
  16: [1, 2],
};

// Define the text to display for each defectNumber based on defectType
const defectNumberText = {
  1: {
    1: "Rusting",
    2: "Section loss",
    3: "Rusting or damage to bolts",
    4: "Damage to weld",
  },
  2: {
    2: "Spalling",
    3: "Cracking",
    4: "Prestressing damage",
    5: "Delamination",
    6: "Freeze thaw",
  },
  3: {
    1: "Deformation",
    2: "Pointing",
    3: "Arch ring damage",
    4: "Arch barrel crack",
    5: "Cracking",
    6: "Section loss",
    7: "Bulging or leaning",
  },
  4: {
    1: "Coating damage",
  },
  5: {
    1: "Structural damage",
    2: "Inspection obstruction",
  },
  6: {
    1: "Settlement",
    2: "Differential movement",
    3: "Sliding",
    4: "Rotation",
    5: "Scour",
    6: "Foundation falts",
  },
  7: {
    1: "Scour",
    2: "Vegetation or silt",
  },
  8: {
    1: "Blockage",
    2: "Causing stains",
    3: "Structural damage",
    4: "Weep hole blockage",
  },
  9: {
    1: "Wear and weathering",
    2: "Crazing, tracking & fretting",
    3: "Poor texture",
    4: "Cracking",
    5: "Slippery",
    6: "Cracked flagged surfacing"
  },
  10: {
    1: "Asphaltic plug debonding",
    2: "Asphaltic plug material loss",
    3: "Asphaltic plug tracking",
    4: "Cracking along nosing",
    5: "Elastomeric and others missing bolts",
    6: "Elastomeric and others dealant breached",
    7: "Elastomeric and others road breaking",
    8: "Elastomeric and others loose fixings",
    9: "Elastomeric and others component damage",
    10: "Buried joint cracking",
    11: "Buried joint sealant damage",
    12: "Joint leakage"
  },
  11: {
    1: "Deformation or settlement",
  },
  12: {
    1: "Rusting",
    2: "Offset or disloged",
    3: "Sliding",
    4: "Crazing",
    5: "Sliding plate damage",
    6: "Bearing damage",
  },
  13: {
    1: "Impact",
  },
  14: {
    1: "Non structural damage",
    2: "Structural damage",
  },
  15: {
    1: "Craking or displacement",
  },
  16: {
    1: "Damage",
    2: "Section loss",
  },
};

// Function to update defectNumber options based on selected defectType
function updateDefectNumbers() {
  const defectType = document.getElementById('defectType').value;
  const defectNumberSelect = document.getElementById('defectNumber');

  // Clear existing options
  defectNumberSelect.innerHTML = '';

  // Add new options based on the selected defectType
  defectMapping[defectType].forEach(number => {
      const option = document.createElement('option');
      option.value = number;
      option.textContent = `${number} ${defectNumberText[defectType][number]}`;
      defectNumberSelect.appendChild(option);
  });
}

// Add event listener to defectType dropdown
document.addEventListener('change', function(e) {
    if (e.target && e.target.id === 'defectType') {
        updateDefectNumbers();
    }
});

// Initialize defectNumber options on page load
document.addEventListener('DOMContentLoaded', updateDefectNumbers);

// Function to update extent options based on selected severity
function updateExtentOptions() {
    const severity = document.getElementById('severity').value;
    const extentSelect = document.getElementById('extent');

    const extentOptions = Array.from(extentSelect.options);

    extentOptions.forEach(option => {
        if (severity === '1') {
            option.disabled = option.value !== 'A';
        } else {
            option.disabled = option.value === 'A';
        }
    });

    if (extentSelect.options[extentSelect.selectedIndex].disabled) {
        extentSelect.value = extentOptions.find(option => !option.disabled).value;
    }
}

// Add event listener to severity dropdown
const severityElement = document.getElementById('severity');
if (severityElement) {
    severityElement.addEventListener('change', updateExtentOptions);
}

// Initialize extent options on page load
document.addEventListener('DOMContentLoaded', updateExtentOptions);

// Track the current view state
let showOnlyNonEmptyRows = false;

// Helper function to find all expandable rows under a main row
function findAllExpandableRows(mainRow) {
    const expandableRows = [];
    let sibling = mainRow.nextElementSibling;

    while (sibling && !sibling.classList.contains("main-row")) {
        if (sibling.classList.contains("expandable-row")) {
            expandableRows.push(sibling);
        }
        sibling = sibling.nextElementSibling;
    }
    return expandableRows;
}

// Helper function to find the button row
function findButtonRow(mainRow) {
    let sibling = mainRow.nextElementSibling;
    while (sibling && !sibling.classList.contains("main-row")) {
        if (sibling.classList.contains("button-row")) {
            return sibling;
        }
        sibling = sibling.nextElementSibling;
    }
    return null;
}

// Helper function to add button row for a main row
function addButtonRowForMainRow(mainRow) {
    // Check if button row already exists
    let buttonRow = findButtonRow(mainRow);
    
    if (!buttonRow) {
        const template = document.getElementById("templateButtonRow");
        if (!template) {
            console.error("Template 'templateButtonRow' not found");
            return null;
        }
        
        const clone = template.content.cloneNode(true);
        buttonRow = clone.querySelector("tr.button-row");
        
        if (!buttonRow) {
            console.error("Button row not found in template");
            return null;
        }
        
        // Find insertion position (after all expandable rows)
        let insertAfter = mainRow;
        let nextRow = mainRow.nextElementSibling;
        
        while (nextRow && !nextRow.classList.contains("main-row")) {
            insertAfter = nextRow;
            nextRow = nextRow.nextElementSibling;
        }
        
        // Insert the button row
        insertAfter.parentNode.insertBefore(buttonRow, insertAfter.nextSibling);
        buttonRow.style.display = "none"; // Initially hidden
        console.log("Button row added for main row:", mainRow.dataset.rowId);
    }
    
    return buttonRow;
}

// Function to expand and collapse rows
function toggleButtonRow(row) {
    console.log("toggleButtonRow called for row:", row);

    // Collapse all other open rows
    const allRows = document.querySelectorAll("#inspectionElementsTable tbody tr.main-row");
    allRows.forEach((otherRow) => {
        if (otherRow !== row && otherRow.classList.contains("expanded")) {
            otherRow.classList.remove("expanded");
            const otherButtonRow = findButtonRow(otherRow);
            if (otherButtonRow) {
                otherButtonRow.style.display = "none";
            }
            const otherExpandableRows = findAllExpandableRows(otherRow);
            otherExpandableRows.forEach((expandableRow) => {
                expandableRow.style.display = "none";
            });
        }
    });

    // Toggle the clicked row
    if (row.classList.contains("expanded")) {
        console.log("Row is expanded. Collapsing...");
        row.classList.remove("expanded");
        const buttonRow = findButtonRow(row);
        if (buttonRow) {
            console.log("Hiding button row:", buttonRow);
            buttonRow.style.display = "none";
        }
        const expandableRows = findAllExpandableRows(row);
        expandableRows.forEach((expandableRow) => {
            expandableRow.style.display = "none";
        });
    } else {
        console.log("Row is not expanded. Expanding...");
        row.classList.add("expanded");

        // Find or create the button row
        let buttonRow = findButtonRow(row);
        if (!buttonRow) {
            buttonRow = addButtonRowForMainRow(row);
        }
        
        if (buttonRow) {
            buttonRow.style.display = "table-row";
        }

        // Show expandable rows
        const expandableRows = findAllExpandableRows(row);
        expandableRows.forEach((expandableRow) => {
            expandableRow.style.display = "table-row";
        });
    }
}

// retrieve inspection date
document.addEventListener("DOMContentLoaded", function () {
    const inspectionDate = sessionStorage.getItem("inspectionDate");
    const displayDateElement = document.getElementById("displayDate");
    if (inspectionDate && displayDateElement) {
        console.log("Retrieved inspection date:", inspectionDate);
        displayDateElement.textContent = inspectionDate;
    } else {
        console.log("No inspection date found in sessionStorage.");
    }
});

// Simple date dropdown populator
// Simple date dropdown populator
async function loadInspectionDates() {
    const structureId = sessionStorage.getItem('structureId');
    const dropdown = document.getElementById('inspectionDates');
    
    if (!structureId || !dropdown) return;
    
    try {
        const response = await fetch(`/api/inspection-dates/${structureId}`);
        const data = await response.json();
        
        console.log('API Response:', data);
        
        dropdown.innerHTML = '<option value="">Select inspection date</option>';
        
        if (data && data.length > 0) {
            // Check if data is an array of strings (dates only)
            if (typeof data[0] === 'string') {
                // Handle array of strings format
                for (const date of data) {
                    const option = document.createElement('option');
                    option.value = date;
                    
                    // Fetch inspection type for each date
                    try {
                        const detailResponse = await fetch(`/api/inspection/full?structure_id=${structureId}&date=${date}`);
                        const inspectionData = await detailResponse.json();
                        const inspectionType = inspectionData?.inspectionType || '';
                        
                        let typeLabel = '';
                        switch(inspectionType) {
                            case 'GI': typeLabel = 'General'; break;
                            case 'PI': typeLabel = 'Principal'; break;
                            case 'SI': typeLabel = 'Superficial'; break;
                            default: typeLabel = inspectionType || 'Inspection';
                        }
                        
                        option.textContent = `${formatDate(date)} - ${typeLabel}`;
                    } catch (error) {
                        console.error(`Failed to fetch type for ${date}:`, error);
                        option.textContent = `${formatDate(date)} - Inspection`;
                    }
                    
                    dropdown.appendChild(option);
                }
            } 
            // Handle array of objects format
            else {
                for (const inspection of data) {
                    const option = document.createElement('option');
                    option.value = inspection.date || inspection.inspection_date;
                    
                    let typeLabel = '';
                    const type = inspection.type || inspection.inspection_type;
                    switch(type) {
                        case 'GI': typeLabel = 'General'; break;
                        case 'PI': typeLabel = 'Principal'; break;
                        case 'SI': typeLabel = 'Superficial'; break;
                        default: typeLabel = type || 'Inspection';
                    }
                    
                    option.textContent = `${formatDate(option.value)} - ${typeLabel}`;
                    dropdown.appendChild(option);
                }
            }
        } else {
            dropdown.innerHTML = '<option value="" disabled>No previous inspections found</option>';
        }
    } catch (error) {
        console.error('Failed to load inspections:', error);
        dropdown.innerHTML = '<option value="" disabled>Error loading inspections</option>';
    }

    renderCustomDateDropdown();
}

// Custom-styled stand-in for the #inspectionDates <select> (native option lists
// can't be themed/dark-moded). Mirrors the select's <option>s into a styled
// panel and forwards selection back onto the real select so existing
// population/change-event code above keeps working unchanged.
function renderCustomDateDropdown() {
    const select = document.getElementById('inspectionDates');
    const trigger = document.getElementById('inspectionDatesTrigger');
    const label = document.getElementById('inspectionDatesLabel');
    const panel = document.getElementById('inspectionDatesPanel');
    if (!select || !trigger || !label || !panel) return;

    panel.innerHTML = '';
    Array.from(select.options).forEach((option) => {
        const isPlaceholder = option.value === '' && !option.disabled;

        const item = document.createElement('div');
        item.className = 'ddt-item' + (option.disabled ? ' disabled' : '') + (option.selected ? ' active' : '') + (isPlaceholder ? ' placeholder' : '');
        item.textContent = option.textContent;
        if (!option.disabled) {
            item.addEventListener('click', () => {
                select.value = option.value;
                select.dispatchEvent(new Event('change'));
                renderCustomDateDropdown();
                closeCustomDateDropdown();
            });
        }
        panel.appendChild(item);
    });

    const selectedOption = select.options[select.selectedIndex];
    const hasRealSelection = selectedOption && selectedOption.value !== '';
    label.textContent = hasRealSelection ? selectedOption.textContent : 'Select inspection date';
    label.classList.toggle('placeholder', !hasRealSelection);
}

function closeCustomDateDropdown() {
    const wrapper = document.getElementById('inspectionDatesDropdown');
    if (wrapper) wrapper.classList.remove('open');
}

document.addEventListener('DOMContentLoaded', () => {
    const wrapper = document.getElementById('inspectionDatesDropdown');
    const trigger = document.getElementById('inspectionDatesTrigger');
    if (!wrapper || !trigger) return;

    trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        wrapper.classList.toggle('open');
    });
    document.addEventListener('click', (e) => {
        if (!wrapper.contains(e.target)) closeCustomDateDropdown();
    });
    renderCustomDateDropdown();
});

// Call it when page loads
document.addEventListener("DOMContentLoaded", loadInspectionDates);

// Function for the date dropdown to populate the table
const inspectionDatesElement = document.getElementById('inspectionDates');
if (inspectionDatesElement) {
    inspectionDatesElement.addEventListener('change', async (e) => {
        const date = e.target.value;
        const structureId = sessionStorage.getItem('structureId');
        const selectedSpan = sessionStorage.getItem('selectedSpan');
        const tableBody = document.querySelector('#inspectionElementsTable tbody');
        
        console.log('Loading defects with:', { date, structureId, selectedSpan });

        if (!date || !structureId) {
            console.log('No date or structureId - loading basic elements');
            if (typeof loadInspectionElements === 'function') {
                await loadInspectionElements();
            }
            const jsonDefectContent = document.getElementById('jsonDefectContent');
            if (jsonDefectContent) {
                jsonDefectContent.textContent = 'Select an inspection date to view defects';
            }
            return;
        }

        // Preserve existing data - only reset historical flags
        if (tableBody) {
            const allMainRows = tableBody.querySelectorAll('tr.main-row');
            allMainRows.forEach(mainRow => {
                mainRow.style.backgroundColor = '';
                mainRow._isHistorical = false;
            });
        }
        
        // Only clear historical defect rows, NOT all expandable rows
        document.querySelectorAll('.retrieved-defect').forEach(row => row.remove());

        try {
            const jsonDefectContent = document.getElementById('jsonDefectContent');
            if (jsonDefectContent) {
                jsonDefectContent.textContent = 'Loading defects...';
            }
            console.log('Fetching defects from API...');
            
            const response = await fetch(
                `/api/defects-by-date?structure_number=${structureId}&date=${date}`
            );
            
            if (!response.ok) {
                throw new Error(`HTTP error! Status: ${response.status}`);
            }

            const historicalDefects = await response.json();
            let defectsArray = Array.isArray(historicalDefects) ? historicalDefects : [];

            // FILTER DEFECTS BY SELECTED SPAN
            if (selectedSpan) {
                defectsArray = defectsArray.filter(defect => {
                    const hasSpan = defect.hasOwnProperty('span_number');
                    if (!hasSpan) return false;
                    return defect.span_number.toString() === selectedSpan.toString();
                });
            }

            // Display raw JSON
            if (jsonDefectContent) {
                jsonDefectContent.textContent = JSON.stringify(defectsArray, null, 2);
            }

            // Group historical defects by element_no
            const defectsByElement = defectsArray.reduce((acc, defect) => {
                const elementNo = defect.element_no || defect.elementNumber;
                if (elementNo) {
                    if (!acc[elementNo]) acc[elementNo] = [];
                    acc[elementNo].push(defect);
                }
                return acc;
            }, {});

            // Load base table if needed
            if (tableBody && tableBody.querySelectorAll('tr.main-row').length === 0) {
                console.log('Loading base table elements');
                if (typeof loadInspectionElements === 'function') {
                    await loadInspectionElements();
                }
            }

            // Get existing defects from session to avoid duplicates
            const existingDefects = JSON.parse(sessionStorage.getItem('defects')) || [];
            
            // Track which main rows got new historical defects
            const affectedMainRows = new Set();

            // Merge historical data into table rows (without clearing existing)
            Object.entries(defectsByElement).forEach(([element_no, defects]) => {
                const mainRow = tableBody ? tableBody.querySelector(`tr[data-row-id="${element_no}"]`) : null;
                if (!mainRow) return;

                console.log(`Adding ${defects.length} historical defects for element ${element_no}`);
                
                defects.forEach((defect) => {
                    // Check if this defect already exists in session (avoid duplicates)
                    const alreadyExists = existingDefects.some(existing => 
                        existing.elementNumber == element_no && 
                        existing.defectCombined === defect.def &&
                        existing.severity === defect.s?.toString() &&
                        existing.extent === defect.ex
                    );
                    
                    if (alreadyExists) {
                        console.log(`Skipping duplicate defect`);
                        return;
                    }
                    
                    const template = document.getElementById("templateRow");
                    if (!template) return;
                    
                    const clone = template.content.cloneNode(true);
                    const expandableRow = clone.querySelector("tr.expandable-row");
                    if (!expandableRow) return;

                    expandableRow.classList.add("retrieved-defect");
                    
                    const populateField = (selector, value, defaultValue = '') => {
                        const el = expandableRow.querySelector(selector);
                        if (el) el.textContent = value || defaultValue;
                    };
                    
                    populateField(".addDefect", defect.def);
                    const sevEl = expandableRow.querySelector(".addSeverity");
                    if (sevEl) sevEl.innerHTML = severityBadgeHTML(defect.s);
                    const extEl = expandableRow.querySelector(".addExtent");
                    if (extEl) extEl.innerHTML = extentBadgeHTML(defect.ex);
                    populateField(".addWorks", defect.w, 'No');
                    populateField(".addPriority", defect.p);
                    populateField(".addCost", defect.cost);
                    populateField(".addComment", defect.comments_remarks);
                    populateField(".addRemedialWorks", defect.remedial_works);

                    // NEW: Update conditional fields based on Works value
                    const worksCell = expandableRow.querySelector('.addWorks');
                    if (worksCell) {
                        updateConditionalFieldsFromWorksCell(worksCell, defect.w || 'No');
                    }
                    
                    if (defect.timestamp) {
                        expandableRow.dataset.timestamp = defect.timestamp;
                    }

                    // Insert historical defects AFTER existing expandable rows
                    let insertAfter = mainRow;
                    let sibling = mainRow.nextElementSibling;
                    while (sibling && !sibling.classList.contains("main-row")) {
                        insertAfter = sibling;
                        sibling = sibling.nextElementSibling;
                    }
                    
                    insertAfter.parentNode.insertBefore(expandableRow, insertAfter.nextSibling);
                    expandableRow.style.display = "none";
                    affectedMainRows.add(mainRow);
                });

                mainRow.style.backgroundColor = '#f8f9fa';
                mainRow._isHistorical = true;
                
                // Update main row summary
                if (typeof updateMainRow === 'function') {
                    updateMainRow(mainRow);
                }
            });

            // Ensure button rows exist for affected main rows
            if (typeof addButtonRowForMainRow === 'function') {
                affectedMainRows.forEach(mainRow => {
                    addButtonRowForMainRow(mainRow);
                });
            }

            // Refresh BCI scores after loading historical defects
            if (typeof refreshBCIScores === 'function') {
                refreshBCIScores();
            } else if (defectsArray.length > 0 && typeof updateBCIScores === 'function') {
                const firstDefect = defectsArray[0];
                updateBCIScores(firstDefect.bci_av, firstDefect.bci_crit);
            }

            console.log('Historical defects merged successfully');

            // NEW: Refresh all conditional fields after loading
            refreshAllConditionalFields();

        } catch (error) {
            console.error('Error loading defects:', error);
            const jsonDefectContent = document.getElementById('jsonDefectContent');
            if (jsonDefectContent) {
                jsonDefectContent.textContent = `Error: ${error.message.includes('HTTP error') 
                    ? "Failed to load from server" 
                    : "Error processing data"}`;
            }
        }
    });
}

// Photo Modal Functions
document.addEventListener("DOMContentLoaded", function () {
    const photoModal = document.getElementById("photoModal");
    const closeModalBtn = photoModal?.querySelector(".close");
    const modalElement = document.getElementById("modalElement");
    const modalStructure = document.getElementById("modalStructure");
  
    const structureId = sessionStorage.getItem('structureId');  
    const structureName = sessionStorage.getItem('structureName');
  
    function openPhotoModal() {
        if (structureId && structureName) {
            if (modalElement) modalElement.textContent = structureName;
            const structureInfo = `${structureName} (#${structureId})`;
            if (modalStructure) modalStructure.textContent = structureInfo;
            if (photoModal) photoModal.style.display = "block";
        } else {
            console.error("No structure data found in sessionStorage.");
        }
    }
  
    function closePhotoModal() {
        if (photoModal) photoModal.style.display = "none";
    }
  
    const inspectionTable = document.getElementById("inspectionElementsTable");
    if (inspectionTable) {
        inspectionTable.addEventListener("click", function (event) {
            const target = event.target;
            if (target.closest("button[title='View']")) {
                openPhotoModal();
            }
        });
    }
  
    if (closeModalBtn) closeModalBtn.addEventListener("click", closePhotoModal);
  
    window.addEventListener("click", function (event) {
        if (event.target === photoModal) {
            closePhotoModal();
        }
    });
});

const photoInput = document.getElementById('photoInput');
if (photoInput) {
    photoInput.addEventListener('change', function() {
        const fileName = this.files[0] ? this.files[0].name : 'No file chosen';
        const fileNameSpan = document.querySelector('.file-name');
        if (fileNameSpan) fileNameSpan.textContent = fileName;
    });
}

function openPhoModal() {
    const modal = document.getElementById('photoModal');
    if (modal) {
        modal.style.display = 'block';
        fetchPhotos();
    }
}

function closePhoModal() {
    const modal = document.getElementById('photoModal');
    if (modal) modal.style.display = 'none';
}

async function fetchPhotos() {
    try {
        const response = await fetch('/photos');
        const photos = await response.json();
        const photosContainer = document.getElementById('photos-container');
        if (!photosContainer) return;
        photosContainer.innerHTML = '';

        photos.forEach(photo => {
            const imgContainer = document.createElement('div');
            imgContainer.style.position = 'relative';
            imgContainer.style.display = 'inline-block';
            imgContainer.style.margin = '10px';

            const img = document.createElement('img');
            img.src = photo.filepath;
            img.style.width = '200px';

            const description = document.createElement('p');
            description.textContent = photo.description || 'No description';
            description.style.textAlign = 'center';

            const deleteButton = document.createElement('button');
            deleteButton.textContent = '×';
            deleteButton.style.position = 'absolute';
            deleteButton.style.top = '0';
            deleteButton.style.right = '0';
            deleteButton.style.background = 'red';
            deleteButton.style.color = 'white';
            deleteButton.style.border = 'none';
            deleteButton.style.borderRadius = '50%';
            deleteButton.style.cursor = 'pointer';
            deleteButton.style.padding = '5px 10px';
            deleteButton.style.fontSize = '16px';

            deleteButton.addEventListener('click', async () => {
                try {
                    const deleteResponse = await fetch(`/delete-photo/${photo.id}`, {
                        method: 'DELETE',
                    });
                    if (deleteResponse.ok) {
                        imgContainer.remove();
                        alert('Photo deleted successfully!');
                    } else {
                        alert('Failed to delete photo.');
                    }
                } catch (error) {
                    console.error('Error deleting photo:', error);
                    alert('An error occurred while deleting the photo.');
                }
            });

            imgContainer.appendChild(img);
            imgContainer.appendChild(description);
            imgContainer.appendChild(deleteButton);
            photosContainer.appendChild(imgContainer);
        });
    } catch (error) {
        console.error('Error fetching photos:', error);
    }
}

const photoUploadForm = document.getElementById('photoUploadForm');
if (photoUploadForm) {
    photoUploadForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData();
        const fileInput = document.getElementById('photoInput');
        const descriptionInput = document.getElementById('photoDescription');
        if (!fileInput?.files[0]) return;
        
        formData.append('photo', fileInput.files[0]);
        formData.append('description', descriptionInput?.value || '');
        
        try {
            const response = await fetch('/upload', {
                method: 'POST',
                body: formData,
            });
            if (response.ok) {
                alert('Photo uploaded successfully!');
                fetchPhotos();
                photoUploadForm.reset();
            } else {
                alert('Failed to upload photo.');
            }
        } catch (error) {
            console.error('Error uploading photo:', error);
            alert('An error occurred while uploading the photo.');
        }
    });
}

const closeButton = document.querySelector('.close');
if (closeButton) {
    closeButton.addEventListener('click', closePhoModal);
}

window.onclick = function (event) {
    const modal = document.getElementById('photoModal');
    if (event.target === modal) {
        closePhoModal();
    }
};

// Function to toggle between showing only non-empty rows or all rows
function view() {
    showOnlyNonEmptyRows = !showOnlyNonEmptyRows;
    console.log('showOnlyNonEmptyRows is now:', showOnlyNonEmptyRows);
    updateTableVisibility();
}

function updateTableVisibility() {
    const tableBody = document.querySelector("#inspectionElementsTable tbody");
    if (!tableBody) return;
    
    const rows = tableBody.querySelectorAll("tr");

    rows.forEach(row => {
        if (row.classList.contains("main-row")) {
            const expandableRows = findAllExpandableRows(row);
            const hasAnyDefects = expandableRows.length > 0;
            const severity = row.querySelector(".severity")?.textContent.trim() || "";
            const extent = row.querySelector(".extent")?.textContent.trim() || "";
            const hasValues = severity !== "" || extent !== "";
            const isEmpty = !hasAnyDefects && !hasValues;

            if (showOnlyNonEmptyRows) {
                row.style.display = isEmpty ? "none" : "";
            } else {
                row.style.display = "";
            }

            if (row.classList.contains("expanded")) {
                const expandableRowsList = findAllExpandableRows(row);
                expandableRowsList.forEach(expandableRow => {
                    expandableRow.style.display = showOnlyNonEmptyRows && row.style.display === "none" ? "none" : "table-row";
                });
            }
        }
    });

    const button = document.getElementById('rowFilterToggle');
    const icon = document.getElementById('rowFilterIcon');
    if (button) {
        button.classList.toggle('active', showOnlyNonEmptyRows);
        button.title = showOnlyNonEmptyRows ? 'Show all rows' : 'Hide empty rows';
        if (icon) icon.className = showOnlyNonEmptyRows ? 'fas fa-filter-circle-xmark' : 'fas fa-filter';
    } else {
        console.warn('Row filter toggle button not found');
    }
}

// Make key functions available globally
window.findAllExpandableRows = findAllExpandableRows;
window.findButtonRow = findButtonRow;
window.addButtonRowForMainRow = addButtonRowForMainRow;
window.toggleButtonRow = toggleButtonRow;
window.updateTableVisibility = updateTableVisibility;
window.view = view;





// ============================================
// OPTION F — SEGMENTED CONTROL LOGIC
// ============================================

window.setModalSegment = function(btn, state) {
    document.querySelectorAll('.of-segment').forEach(function(s) {
        s.classList.remove('of-active');
    });
    btn.classList.add('of-active');

    var defectPanel       = document.getElementById('of-defect-panel');
    var noDefectsPanel    = document.getElementById('of-no-defects-panel');
    var notInspectedPanel = document.getElementById('of-not-inspected-panel');

    defectPanel.style.display       = 'none';
    noDefectsPanel.style.display    = 'none';
    notInspectedPanel.style.display = 'none';

    if (state === 'defect') {
        defectPanel.style.display = 'block';
    } else if (state === 'no-defects') {
        noDefectsPanel.style.display = 'block';
    } else {
        notInspectedPanel.style.display = 'block';
    }

    // Write to BOTH keys so nothing gets out of sync
    var modal = document.getElementById('modal');
    if (modal) {
        modal.dataset.modalState = state;
        modal.dataset.ofState = state;
    }
};

// ===== HOOK INTO openModal =====
var originalOpenModal = window.openModal;
window.openModal = function(isEditMode, preferredState) {
    // Call original first
    if (originalOpenModal) originalOpenModal.apply(this, arguments);

    // Only auto-init steppers for NEW defects (not edit) and only for defect state
    if (!isEditMode || preferredState === 'defect') {
        requestAnimationFrame(function() {
            initSteppers();
        });
    }
};

// Hook saveChanges to handle the two special states
(function() {
    var _origSave = window.saveChanges;
    window.saveChanges = function() {
        var modal = document.getElementById('modal');
        var state = modal ? (modal.dataset.modalState || modal.dataset.ofState || 'defect') : 'defect';

        if (state === 'no-defects') {
            var commentVal = document.getElementById('of-no-defects-comment').value;
            document.getElementById('severity').value = '1';
            document.getElementById('extent').value   = 'A';
            document.getElementById('works').value    = 'N';
            document.getElementById('comment').value  = commentVal;
            document.getElementById('priority').value = '';
            document.getElementById('cost').value     = '';
            document.getElementById('remedialWorks').value = '';
            document.getElementById('defectType').value = '0';
            document.getElementById('defectNumber').value = '0';
        } else if (state === 'not-inspected') {
            var reasonVal = document.getElementById('of-not-inspected-comment').value;
            document.getElementById('severity').value = '1';
            document.getElementById('extent').value   = 'A';
            document.getElementById('works').value    = 'N';
            document.getElementById('comment').value  = reasonVal ? '[Not Inspected] ' + reasonVal : '[Not Inspected]';
            document.getElementById('priority').value = '';
            document.getElementById('cost').value     = '';
            document.getElementById('remedialWorks').value = '';
            document.getElementById('defectType').value = '0';
            document.getElementById('defectNumber').value = '1';
        }

        if (_origSave) _origSave.apply(this, arguments);
    };
})();
