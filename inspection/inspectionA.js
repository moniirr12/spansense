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

  if (typeof updateDefectGuidancePanel === 'function') updateDefectGuidancePanel();
  if (typeof renderCustomSelect === 'function') {
      renderCustomSelect('defectType', 'defectTypeLabel', 'defectTypePanel', 'defectTypeDropdown');
      renderCustomSelect('defectNumber', 'defectNumberLabel', 'defectNumberPanel', 'defectNumberDropdown');
  }
}

// Add event listener to defectType dropdown
document.addEventListener('change', function(e) {
    if (e.target && e.target.id === 'defectType') {
        updateDefectNumbers();
    }
    if (e.target && e.target.id === 'defectNumber') {
        if (typeof updateDefectGuidancePanel === 'function') updateDefectGuidancePanel();
        if (typeof renderCustomSelect === 'function') {
            renderCustomSelect('defectNumber', 'defectNumberLabel', 'defectNumberPanel', 'defectNumberDropdown');
        }
    }
});

// Initialize defectNumber options on page load
document.addEventListener('DOMContentLoaded', updateDefectNumbers);

// Custom-styled stand-ins for the #defectType/#defectNumber <select>s — same
// idea as the inspection-date dropdown above: mirror the real select's
// <option>s into a styled floating panel and forward clicks back onto the
// real select, so the existing change-driven logic (updateDefectNumbers,
// the severity guidance panel, saveChanges reading .value, etc.) needs no
// changes at all.
function renderCustomSelect(selectId, labelId, panelId, wrapperId) {
    const select = document.getElementById(selectId);
    const label = document.getElementById(labelId);
    const panel = document.getElementById(panelId);
    if (!select || !label || !panel) return;

    panel.innerHTML = '';
    Array.from(select.options).forEach((option) => {
        const item = document.createElement('div');
        item.className = 'dd-item' + (option.selected ? ' active' : '');
        item.textContent = option.textContent;
        item.addEventListener('click', () => {
            select.value = option.value;
            // bubbles:true is required here — updateDefectNumbers() and the
            // severity guidance panel are wired via a delegated listener on
            // document, which a non-bubbling dispatched event never reaches
            // (only direct-on-element listeners would still fire).
            select.dispatchEvent(new Event('change', { bubbles: true }));
            const wrapper = document.getElementById(wrapperId);
            if (wrapper) wrapper.classList.remove('open');
        });
        panel.appendChild(item);
    });

    const selectedOption = select.options[select.selectedIndex];
    label.textContent = selectedOption ? selectedOption.textContent : '';
}

function setupCustomSelect(selectId, triggerId, labelId, panelId, wrapperId) {
    const wrapper = document.getElementById(wrapperId);
    const trigger = document.getElementById(triggerId);
    if (!wrapper || !trigger) return;

    trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        wrapper.classList.toggle('open');
    });
    document.addEventListener('click', (e) => {
        if (!wrapper.contains(e.target)) wrapper.classList.remove('open');
    });
    renderCustomSelect(selectId, labelId, panelId, wrapperId);
}

document.addEventListener('DOMContentLoaded', () => {
    setupCustomSelect('defectType', 'defectTypeTrigger', 'defectTypeLabel', 'defectTypePanel', 'defectTypeDropdown');
    setupCustomSelect('defectNumber', 'defectNumberTrigger', 'defectNumberLabel', 'defectNumberPanel', 'defectNumberDropdown');
});
window.renderCustomSelect = renderCustomSelect;

// Condensed, per-severity guidance — short prompts (not the full Inspection
// codes - Revision 2 wording) to help an inspector pick a severity while
// filling in the Add Defect modal. Keyed the same way as defectNumberText.
const SEVERITY_GUIDANCE = {
  1: {
    1: ["No rust", "Minor surface rust", "Moderate pitting", "Deep pits/perforations", "Disintegrated by corrosion"],
    2: ["No section loss", "Minor loss (<5%)", "Moderate loss (5-20%)", "Major loss (>20%)", "Collapsed/collapsing"],
    3: ["No damage", "Bolts loose, minor corrosion", "Bolts missing, moderate corrosion", "Structural bolts/rivets missing", "Failure from missing bolts/rivets"],
    4: ["No corrosion", "Slight weld corrosion", "Crack at weld toe", "Cracked weld, major corrosion", "Weld connection failure"],
  },
  2: {
    2: ["No spalls", "Minor spalls, links exposed", "Major spalls, bars exposed", "Deep spalls, pitting corrosion", "Collapsed"],
    3: ["Hairline cracks", "Cracks <0.3mm", "Cracks ~1mm, visible", "Wide/deep cracks >2mm", "Unable to function"],
    4: ["No damage", "Substandard duct grouting", "Cracks along duct", "Exposed prestressing cable", "Failed prestressing cables"],
    5: ["No delamination", "Early signs, rust staining", "Delamination, low flexure areas", "Delamination, high flexure areas", "Failure, delaminated bars"],
    6: ["No attack", "Slight cracking", "Moderate thaumasite/freeze-thaw", "Major thaumasite/freeze-thaw", "Failure from attack"],
  },
  3: {
    1: ["No deformation", "Minor deformation", "Moderate deformation", "Major deformation", "Collapsed"],
    2: ["Sound", "Minor deterioration", "Moderate-significant loss", "Poor, crumbling, loose bricks", "Collapsed"],
    3: ["No cracking", "Cracks hard to see", "Separation <25mm", "Separation >25mm", "Disintegrated"],
    4: ["No cracks", "Minor cracks <3mm", "Diagonal cracks >3mm", "Cracks breaking barrel <1m", "Barrel failure"],
    5: ["No cracks", "Minor hairline/shallow spalls", "Moderate cracks/crazing, deep spalls", "Major cracks/spalling", "Failure, structural cracks"],
    6: ["None missing", "Few missing, weathering", "Moderate loss", "Severe loss", "Failure, missing bricks"],
    7: ["None", "Minor bulging/leaning", "Moderate bulging/leaning", "Severe bulging/leaning", "Collapsed/non-functional"],
  },
  4: {
    1: ["Sound, slight weathering", "Normal weathering", "Spot chips, undercoat exposed", "Finish failed, substrate exposed", "All coats failed"],
  },
  5: {
    1: ["None", "Minor, no damage", "Causing structural damage", "Causing major damage", "Failure from vegetation"],
    2: ["None", "Low density, easily removed", "Significant, obscures inspection", "Inspection impossible", "Critical elements can't be inspected"],
  },
  6: {
    1: ["No settlement", "None visible, possible cracks", "Minor settlement", "Major settlement", "Collapse from settlement"],
    2: ["None", "None visible, possible cracks", "Minor movement", "Major movement", "Collapsed"],
    3: ["None", "None visible, possible cracks", "Minor sliding", "Major sliding", "Collapsed from sliding"],
    4: ["None", "None visible, possible cracks", "Minor rotation", "Major rotation", "Collapsed from rotation"],
    5: ["No scour", "Minor scour", "Moderate scour", "Major scour", "Dangerous scour/failure"],
    6: ["Unaffected", "Minor cracks", "Moderate cracks", "Major cracks/deformation", "Failure from faults"],
  },
  7: {
    1: ["No scour", "Minor scour", "Moderate scour", "Major scour", "Dangerous scour/failure"],
    2: ["None", "Slight flow disruption", "Significant disruption", "Severe disruption", "Failure from silting"],
  },
  8: {
    1: ["Fully functional", "<25% blocked", "25-50% blocked", ">50% blocked", "Totally blocked/broken"],
    2: ["No staining", "Minor staining", "Cleaning required", "Urgent cleaning required", "Urgent/frequent cleaning"],
    3: ["None", "Minor damage", "Structural damage", "Major damage", "Severe damage to elements"],
    4: ["No blockage", "Minor blockage", "Moderate blockage", "Major blockage", "Non-functioning"],
  },
  9: {
    1: ["Little/no wear", "Minor wear", "Moderate wear", "Major wear", "Dangerous"],
    2: ["None", "Minor crazing/tracking", "Moderate crazing/tracking", "Major crazing/tracking", "Complete break up"],
    3: ["Dense", "Poor texture", "Open texture", "Very open texture", "Dangerous"],
    4: ["Sound", "Cracks in top layer", "Top layer breached", "Deep cracks/potholes", "Top layer missing"],
    5: ["Not slippery", "Starting to slip", "Becoming slippery", "Slippery", "Dangerous"],
    6: ["No defects", "Trips <5mm", "Trips 5-10mm", "Trips 10-20mm", "Trips >20mm"],
  },
  10: {
    1: ["Sound", "Minor debonding", "Moderate debonding", "Major debonding", "Dangerous"],
    2: ["Sound", "Slight binder loss", "Aggregate loss 20-50mm", "Material loss, holes >50mm", "Missing"],
    3: ["Sound", "Minor tracking/flow", "Moderate tracking/flow", "Major tracking/flow", "Disintegrated"],
    4: ["Sound", "Minor cracking along nosing", "Moderate cracking, breakup", "Breakup of nosing", "Disintegrated"],
    5: ["Minor wear", "One bolt missing", "Numerous bolts missing", "Majority of bolts missing", "Failure, missing bolts"],
    6: ["Sound", "Loose/poor, seal dropped", "Sealant breached", "Sealant/strip missing", "Failure"],
    7: ["Sound", "Minor breakup", "Moderate breakup, debris", "Major breakup, debris", "Joint failure"],
    8: ["Sound", "Bolt sealer missing", "Fixings loose", "Fixings missing", "Failure, missing fixtures"],
    9: ["Sound", "Initiation of cracking/tearing", "Crack/tear <20% width", "Crack/tear 20-50% width", "Component failure"],
    10: ["Sound", "Minor surface cracking", "Moderate surface cracking", "Major surface cracking", "Failure"],
    11: ["Sound", "Minor cracking/breakup", "Moderate cracking/breakup", "Major cracking/breakup", "Disintegrated/missing"],
    12: ["No leakage", "Minor leakage", "Moderate leakage", "Major leakage, damage", "Open joint, major damage"],
  },
  11: {
    1: ["Sound, no deformation", "Minor subsidence/deformation", "Minor slip, slight cracking", "Major slip, major cracking", "Critical slip/settlement"],
  },
  12: {
    1: ["Negligible rusting", "Minor rusting", "Moderate rusting", "Major rusting", "Failed/seized by rust"],
    2: ["Correct position", "Minor offset", "Moderate offset/tilt", "Dislodged", "Off bearing/missing"],
    3: ["Correct position", "Slightly skewed", "At end of travel", "Beyond designed travel", "Sliding bearing failed"],
    4: ["No crazing", "External crazing", "External breakdown", "Major breakdown", "Complete breakdown"],
    5: ["Sound", "Minor deformation", "Moderate deformation", "Major deformation", "Seized by deformation"],
    6: ["Sound", "Minor cracks", "Moderate cracks/loose", "Splitting/deformation", "Disintegrated"],
  },
  13: {
    1: ["No damage", "Slight scoring/displacement", "Moderate displacement", "Severe displacement", "Knocked down/collapsing"],
  },
  14: {
    1: ["No seepage", "Minor seepage (dripping)", "Moderate seepage", "Major seepage, structural damage", "Non-functional, critical damage"],
    2: ["No seepage", "Damp, slight staining", "Wet surface, dripping", "Stalactites, structural damage", "Major damage from waterproofing"],
  },
  15: {
    1: ["Sound, no defects", "Minor cracking", "Moderate cracking, no displacement", "Major cracking/displacement", "Collapsed"],
  },
  16: {
    1: ["No damage", "Minor signs", "Moderate signs", "Major signs", "Disintegrated"],
    2: ["No section loss", "Minor loss (<5%)", "Moderate loss (5-20%)", "Major loss (>20%)", "Collapsed/collapsing"],
  },
};

// Refreshes the severity guidance panel next to the Add Defect modal so it
// always reflects the currently selected defect type/number, with the
// currently selected severity highlighted.
function updateDefectGuidancePanel() {
    const panel = document.getElementById('defectGuidancePanel');
    if (!panel) return;

    const typeEl = document.getElementById('defectType');
    const numberEl = document.getElementById('defectNumber');
    const severityEl = document.getElementById('severity');
    const type = typeEl ? typeEl.value : null;
    const number = numberEl ? numberEl.value : null;
    const currentSeverity = severityEl ? parseInt(severityEl.value) || 1 : 1;

    const guidance = (SEVERITY_GUIDANCE[type] || {})[number];
    const subtitleEl = document.getElementById('dgpSubtitle');
    const levelsEl = document.getElementById('dgpLevels');
    if (!levelsEl) return;

    if (subtitleEl) {
        const typeName = (defectNumberText[type] && defectNumberText[type][number])
            ? `${type}.${number} ${defectNumberText[type][number]}`
            : 'Select a defect type and number';
        subtitleEl.textContent = typeName;
    }

    if (!guidance) {
        levelsEl.innerHTML = '<div class="dgp-empty">No guidance available for this selection.</div>';
        return;
    }

    levelsEl.innerHTML = guidance.map((text, idx) => {
        const level = idx + 1;
        const activeClass = level === currentSeverity ? ' dgp-level-active' : '';
        return `
            <div class="dgp-level${activeClass}" data-level="${level}">
                <div class="dgp-level-num sev-${level}">${level}</div>
                <div class="dgp-level-text">${text}</div>
            </div>
        `;
    }).join('');
}
window.updateDefectGuidancePanel = updateDefectGuidancePanel;

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

// findAllExpandableRows, findButtonRow, addButtonRowForMainRow, and toggleButtonRow
// are defined in inspection.js (loaded after this script), which is the copy
// that actually runs — see that file for the live implementation (inspection.js's
// toggleButtonRow also adds animated row expand/collapse this copy lacked).

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
                    // Check if this defect already exists in session (avoid duplicates).
                    // Prefer matching on the real database id — it's the only thing
                    // that's reliable regardless of which load path got there first
                    // (e.g. loadDefectsFromAPI, which runs automatically on page load
                    // and is the only one that carries photos). Fall back to the
                    // loose field match for defects that don't have a db id yet.
                    const alreadyExists = existingDefects.some(existing =>
                        (defect.defectDbId != null && existing.defectDbId != null
                            ? String(existing.defectDbId) === String(defect.defectDbId)
                            : existing.elementNumber == element_no &&
                              existing.defectCombined === defect.def &&
                              existing.severity === defect.s?.toString() &&
                              existing.extent === defect.ex)
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

                    // This is comparison data from a different inspection date,
                    // not part of this inspection — it should never be selectable
                    // as the primary defect driving this element's score.
                    const comparisonPrimaryTag = expandableRow.querySelector('.primary-tag');
                    if (comparisonPrimaryTag) comparisonPrimaryTag.remove();

                    const populateField = (selector, value, defaultValue = '') => {
                        const el = expandableRow.querySelector(selector);
                        if (el) el.textContent = value || defaultValue;
                    };
                    
                    populateField(".addDefect", defect.def);
                    // Real DB defect id — without this, openPhotoModal() in photo.js
                    // has nothing to look the defect's photos up by.
                    populateField(".defectId", defect.defectDbId);
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
                        showAlertModal('Photo deleted successfully!', 'success');
                    } else {
                        showAlertModal('Failed to delete photo.');
                    }
                } catch (error) {
                    console.error('Error deleting photo:', error);
                    showAlertModal('An error occurred while deleting the photo.');
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
                showAlertModal('Photo uploaded successfully!', 'success');
                fetchPhotos();
                photoUploadForm.reset();
            } else {
                showAlertModal('Failed to upload photo.');
            }
        } catch (error) {
            console.error('Error uploading photo:', error);
            showAlertModal('An error occurred while uploading the photo.');
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

// Make key functions available globally (findAllExpandableRows, findButtonRow,
// addButtonRowForMainRow, and toggleButtonRow are declared in inspection.js,
// loaded next — as plain top-level function declarations they're already on
// window once that script runs, so they don't need re-exporting here).
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

    // Severity guidance only makes sense while picking a defect type/number.
    var guidancePanel = document.getElementById('defectGuidancePanel');
    if (guidancePanel) {
        guidancePanel.style.display = state === 'defect' ? 'flex' : 'none';
        if (state === 'defect' && typeof updateDefectGuidancePanel === 'function') {
            updateDefectGuidancePanel();
        }
    }

    // Defect-nav arrows only apply to the "defect" segment - hide them for
    // No Defects/Not Inspected, and re-show (if there's more than one
    // defect on this element) when switching back.
    if (typeof updateDefectNavControl === 'function') {
        if (state === 'defect') {
            updateDefectNavControl();
        } else {
            var navControl = document.getElementById('defectNavControl');
            if (navControl) navControl.style.display = 'none';
        }
    }

    // Write to BOTH keys so nothing gets out of sync
    var modal = document.getElementById('modal');
    if (modal) {
        modal.dataset.modalState = state;
        modal.dataset.ofState = state;
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
