// ============================================
// INITIALIZATION
// ============================================
document.addEventListener('DOMContentLoaded', function() {
  console.log("DOM fully loaded - starting initialization");
  
  let inspectionData;
  try {
      const data = sessionStorage.getItem('inspectionData');
      if (!data) throw new Error("No inspection data found");
      inspectionData = JSON.parse(data);
      console.log("Successfully loaded inspection data:", inspectionData);
      
      if (inspectionData.spans && Array.isArray(inspectionData.spans)) {
        inspectionData.spans.forEach(span => {
          span.defects = span.defects || [];
        });
      } else {
        console.warn("No spans found in inspection data");
        inspectionData.spans = [];
      }
      
      window.inspectionData = inspectionData;
      initializeSpanButtons(inspectionData);
      
  } catch (error) {
      console.error("Initialization error:", error);
      showError("Missing inspection data. Please start over.");
  }
});

// ============================================
// LANDSCAPE POST-SAVE MODAL
// ============================================

function showPostSaveModal(inspectionData, defects, isEditMode) {
    const overlay = document.getElementById('postSaveOverlay');
    if (!overlay) {
        console.error('Post-save modal overlay not found');
        return;
    }

    // Populate data
    const bridgeNameEl = document.getElementById('psBridgeName');
    const dateEl = document.getElementById('psDate');
    const spansEl = document.getElementById('psSpanCount');
    const defectsEl = document.getElementById('psDefectCount');
    const bciAvEl = document.getElementById('psBciAv');
    const bciCritEl = document.getElementById('psBciCrit');

    if (bridgeNameEl) bridgeNameEl.textContent = inspectionData.structureName || 'Unknown Bridge';
    
    if (dateEl) {
        const d = inspectionData.inspectionDate ? new Date(inspectionData.inspectionDate) : new Date();
        dateEl.textContent = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    }
    
    if (spansEl) spansEl.textContent = (inspectionData.spans?.length || 0) + ' inspected';
    if (defectsEl) defectsEl.textContent = defects.length + ' recorded';
    
    if (bciAvEl) {
        const bciAv = document.getElementById('bciAvResult')?.textContent || '100.00';
        bciAvEl.textContent = bciAv;
    }
    
    if (bciCritEl) {
        const bciCrit = document.getElementById('bciCritResult')?.textContent || '100.00';
        bciCritEl.textContent = bciCrit;
    }

    // Store mode for action handlers
    overlay.dataset.isEditMode = isEditMode ? 'true' : 'false';

    overlay.classList.add('active');
    document.body.style.overflow = 'hidden';
}

// ---------- ACTION HANDLERS ----------

function goHome(e) {
    e.preventDefault();
    window.location.href = '../map/map.html';
}

function newInspection(e) {
    e.preventDefault();
    sessionStorage.removeItem('inspectionData');
    sessionStorage.removeItem('defects');
    sessionStorage.removeItem('photoData');
    sessionStorage.removeItem('selectedSpan');
    sessionStorage.removeItem('inspectionMode');
    window.location.href = '../inspection1/inspection1.html';
}

function viewReport(e) {
    e.preventDefault();
    const inspectionId = sessionStorage.getItem('lastSavedInspectionId');
    if (inspectionId) {
        window.location.href = `inspection-details.html?id=${inspectionId}`;
    } else {
        // Fallback: show inline preview
        const inspectionData = JSON.parse(sessionStorage.getItem('inspectionData') || '{}');
        const defects = JSON.parse(sessionStorage.getItem('defects') || '[]');
        
        // Build defects table rows safely
        let defectsRows = '';
        for (let i = 0; i < defects.length; i++) {
            const d = defects[i];
            defectsRows += `
                <tr>
                    <td>${d.spanNumber || '-'}</td>
                    <td>${d.elementNumber || '-'}</td>
                    <td>${d.defectCombined || '-'}</td>
                    <td>${d.severity || '-'}</td>
                    <td>${d.extent || '-'}</td>
                    <td>${d.works || '-'}</td>
                </tr>
            `;
        }
        
        let previewContent = `
            <!DOCTYPE html>
            <html>
            <head>
                <title>Inspection Report — ${inspectionData.structureName || 'Bridge'}</title>
                <style>
                    body { font-family: 'Inter', sans-serif; padding: 40px; background: #f5f7fb; color: #2c3e44; }
                    .container { max-width: 900px; margin: 0 auto; background: white; padding: 40px; border-radius: 24px; }
                    h1 { color: #2c5a57; border-bottom: 2px solid #8ab4b0; padding-bottom: 16px; }
                    .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin: 24px 0; }
                    .meta-item { background: #f8fafc; padding: 16px; border-radius: 14px; }
                    .meta-label { font-size: 0.7rem; color: #8a9ba8; text-transform: uppercase; font-weight: 600; }
                    .meta-value { font-size: 1.2rem; font-weight: 700; color: #2c4a48; margin-top: 4px; }
                    table { width: 100%; border-collapse: collapse; margin-top: 24px; }
                    th { background: #f8fafc; padding: 12px; text-align: left; font-size: 0.75rem; text-transform: uppercase; color: #8a9ba8; }
                    td { padding: 12px; border-bottom: 1px solid #e9edf2; font-size: 0.85rem; }
                    tr:hover td { background: #f8fafc; }
                </style>
            </head>
            <body>
                <div class="container">
                    <h1>${inspectionData.structureName || 'Bridge Inspection'}</h1>
                    <div class="meta">
                        <div class="meta-item">
                            <div class="meta-label">Inspection Date</div>
                            <div class="meta-value">${inspectionData.inspectionDate ? formatDate(inspectionData.inspectionDate) : 'N/A'}</div>
                        </div>
                        <div class="meta-item">
                            <div class="meta-label">Total Defects</div>
                            <div class="meta-value">${defects.length}</div>
                        </div>
                        <div class="meta-item">
                            <div class="meta-label">BCI Average</div>
                            <div class="meta-value" style="color:#5b8c8a;">${document.getElementById('bciAvResult')?.textContent || '100.00'}</div>
                        </div>
                        <div class="meta-item">
                            <div class="meta-label">BCI Critical</div>
                            <div class="meta-value" style="color:#e8a87c;">${document.getElementById('bciCritResult')?.textContent || '100.00'}</div>
                        </div>
                    </div>
                    <h2>Defects Summary</h2>
                    <table>
                        <thead>
                            <tr>
                                <th>Span</th><th>Element</th><th>Defect</th><th>Severity</th><th>Extent</th><th>Works</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${defectsRows}
                        </tbody>
                    </table>
                </div>
            </body>
            </html>
        `;
        
        const previewWindow = window.open('', '_blank');
        if (previewWindow) {
            previewWindow.document.write(previewContent);
            previewWindow.document.close();
        } else {
            alert("Popup blocked. Please allow popups for this site.");
        }
    }
}

function closePostSaveModal() {
    const overlay = document.getElementById('postSaveOverlay');
    if (overlay) {
        overlay.classList.remove('active');
        document.body.style.overflow = '';
    }
}

// Make globally available
window.goHome = goHome;
window.newInspection = newInspection;
window.viewReport = viewReport;
window.closePostSaveModal = closePostSaveModal;
window.showPostSaveModal = showPostSaveModal;

// ============================================
// HELPER FUNCTIONS
// ============================================

function getDefectDescription(defectId, defectType, defectNumber) {
    if (defectId && defectId.includes('.')) {
        const [type, number] = defectId.split('.');
        const defectTypeNum = parseInt(type);
        const defectNum = parseInt(number);
        
        if (defectNumberText[defectTypeNum] && defectNumberText[defectTypeNum][defectNum]) {
            return defectNumberText[defectTypeNum][defectNum];
        }
    }
    
    if (defectType && defectNumber) {
        const defectTypeNum = parseInt(defectType);
        const defectNum = parseInt(defectNumber);
        
        if (defectNumberText[defectTypeNum] && defectNumberText[defectTypeNum][defectNum]) {
            return defectNumberText[defectTypeNum][defectNum];
        }
    }
    
    return defectId || `Defect ${defectType}.${defectNumber}`;
}

function getAllDefects() {
    const all = [];
    const inspectionData = JSON.parse(sessionStorage.getItem('inspectionData') || '{}');
    
    if (inspectionData.defects && Array.isArray(inspectionData.defects)) {
        inspectionData.defects.forEach(defect => {
            let defectType = defect.defectType;
            let defectNumber = defect.defectNumber;
            
            if ((!defectType || !defectNumber) && defect.defectId && defect.defectId.includes('.')) {
                const parts = defect.defectId.split('.');
                defectType = parts[0];
                defectNumber = parts[1];
            }
            
            all.push({
                span: defect.spanNumber,
                elementNumber: defect.elementNumber,
                element: defect.elementDescription || `Element ${defect.elementNumber}`,
                defectId: defect.defectId,
                defectType: defectType,
                defectNumber: defectNumber,
                severity: defect.severity,
                extent: defect.extent,
                works: defect.worksRequired,
                priority: defect.priority,
                cost: defect.cost,
                comment: defect.comments,
                remedialWorks: defect.remedialWorks
            });
        });
    }
    
    return all;
}

function renderDefectsSummary() {
    const container = document.getElementById('splitDefectsList');
    if (!container) return;
    
    const defects = getAllDefects();
    const countSpan = document.getElementById('splitDefectCount');
    if (countSpan) countSpan.innerText = defects.length;
    
    if (!defects || defects.length === 0) {
        container.innerHTML = '<div class="empty-defects-message">No defects recorded yet.</div>';
        return;
    }
    
    let html = '';
    defects.forEach((def) => {
        const fullDefectDescription = getFullDefectDescription(def.defectType, def.defectNumber, def.defectId);
        const combinedDefect = `${def.defectType}.${def.defectNumber ? def.defectNumber : ''}`;
        const elementNumber = def.elementNumber || def.element_no;
        const elementDescription = getElementDescriptionSafe(elementNumber);
        
        html += `
            <div class="defect-card-item">
                <div class="defect-location">
                    Span ${def.span} · ${escapeHtml(elementDescription)}
                </div>
                <div class="defect-description" style="font-size: 0.75rem;">${def.severity || 'N/A'}${def.extent || 'N/A'}. (${escapeHtml(combinedDefect)}) ${escapeHtml(fullDefectDescription)}</div>
                <div class="defect-meta" style="font-size: 0.80rem;">
                    ${def.works && def.works !== 'N' ? `<span> Works required</span>` : ''}
                </div>
                ${def.comment ? `<div class="defect-comment-preview" style="font-style: italic;">${escapeHtml(def.comment.substring(0, 60))}${def.comment.length > 60 ? '...' : ''}</div>` : ''}
            </div>
        `;
    });
    container.innerHTML = html;
}

function getSeverityLabel(severity) {
    const severityMap = {
        1: 'Minor',
        2: 'Moderate',
        3: 'Severe',
        4: 'Critical',
        5: 'Emergency'
    };
    return severityMap[severity] || `Level ${severity}`;
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

function refreshDefectsSummary() {
    const modal = document.getElementById('splitModal');
    if (modal && modal.classList.contains('active')) {
        renderDefectsSummary();
    }
}

function openSplitModal() {
    const conclusionsTextarea = document.getElementById('conclusionsText');
    if (conclusionsTextarea) {
        const inspectionData = JSON.parse(sessionStorage.getItem('inspectionData') || '{}');
        const savedConclusions = inspectionData.conclusions || '';
        conclusionsTextarea.value = savedConclusions;
        conclusionsSaved = savedConclusions;
    }
    renderDefectsSummary();
    document.getElementById('splitModal').classList.add('active');
    document.body.style.overflow = 'hidden';
    document.body.classList.add('modal-open');
}

function closeSplitModal() {
    document.getElementById('splitModal').classList.remove('active');
    document.body.style.overflow = '';
    document.body.classList.remove('modal-open');
}

function saveConclusions() {
    const conclusionsTextarea = document.getElementById('conclusionsText');
    if (conclusionsTextarea) {
        conclusionsSaved = conclusionsTextarea.value;
        const inspectionData = JSON.parse(sessionStorage.getItem('inspectionData') || '{}');
        if (inspectionData) {
            inspectionData.conclusions = conclusionsSaved;
            sessionStorage.setItem('inspectionData', JSON.stringify(inspectionData));
        }
        
        const bar = document.getElementById('conclusionsBar');
        if (bar) {
            if (conclusionsSaved && conclusionsSaved.trim().length > 0) {
                bar.classList.add('done');
            } else {
                bar.classList.remove('done');
            }
        }
        
        closeSplitModal();
    }
}

function showToast(message) {
    const toast = document.createElement('div');
    toast.style.cssText = 'position:fixed;bottom:24px;right:24px;background:#3d6b69;color:white;padding:12px 24px;border-radius:12px;font-size:0.85rem;font-weight:500;box-shadow:0 4px 20px rgba(0,0,0,0.3);z-index:10000;border:1px solid #5b8c8a;opacity:0;transition:opacity 0.3s;';
    toast.textContent = message;
    document.body.appendChild(toast);
    requestAnimationFrame(() => { toast.style.opacity = '1'; });
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 2500);
}

window.openSplitModal = openSplitModal;
window.closeSplitModal = closeSplitModal;
window.saveConclusions = saveConclusions;
window.renderDefectsSummary = renderDefectsSummary;

const structureId = sessionStorage.getItem('structureId');
const structureName = sessionStorage.getItem('structureName');

if (structureId) {
    let inspectionData = JSON.parse(sessionStorage.getItem('inspectionData')) || {};
    inspectionData.structureId = structureId;
    inspectionData.structureName = structureName || '';
    sessionStorage.setItem('inspectionData', JSON.stringify(inspectionData));
}

// ============================================
// SPAN BUTTONS
// ============================================

function initializeSpanButtons(inspectionData) {
  const spanTogglesContainer = document.querySelector('.span-toggles');
  if (!spanTogglesContainer) {
    console.error("Span toggles container not found");
    return;
  }
  
  spanTogglesContainer.innerHTML = '';
  
  if (inspectionData.spans && inspectionData.spans.length > 0) {
    inspectionData.spans.forEach(span => {
        const button = createSpanButton(span);
        spanTogglesContainer.appendChild(button);
    });
    
    activateDefaultSpan(inspectionData);
  } else {
    console.warn("No spans to create buttons for");
  }
}

function createSpanButton(span) {
  const btn = document.createElement('button');
  btn.className = 'span-toggle';
  btn.textContent = `Span ${span.spanNumber}`;
  btn.dataset.spanNumber = span.spanNumber;
  
  btn.addEventListener('click', handleSpanButtonClick);
  return btn;
}

function handleSpanButtonClick(event) {
  const clickedButton = event.currentTarget;
  const spanNumber = clickedButton.dataset.spanNumber;
  
  updateActiveButtonState(clickedButton);
  sessionStorage.setItem('selectedSpan', spanNumber);
  updateSpanTitle(spanNumber);
  
  if (typeof loadInspectionElements === 'function') {
    loadInspectionElements();
  }
  
  const inspectionDates = document.getElementById('inspectionDates');
  if (inspectionDates && inspectionDates.value) {
    inspectionDates.dispatchEvent(new Event('change'));
  }
  
  if (typeof refreshBCIScores === 'function') {
    setTimeout(() => {
      refreshBCIScores();
    }, 100);
  }
}

function updateActiveButtonState(activeButton) {
  document.querySelectorAll('.span-toggle').forEach(btn => {
      btn.classList.remove('active');
  });
  activeButton.classList.add('active');
}

function updateSpanTitle(spanNumber) {
  const titleElement = document.getElementById('current-span-title');
  if (titleElement) {
      titleElement.textContent = `Span ${spanNumber} Elements`;
  }
}

function activateDefaultSpan(inspectionData) {
  const selectedSpan = sessionStorage.getItem('selectedSpan') || 
                      (inspectionData.spans[0] ? inspectionData.spans[0].spanNumber : null);
  
  if (selectedSpan) {
      const defaultButton = document.querySelector(`.span-toggle[data-span-number="${selectedSpan}"]`);
      if (defaultButton) {
          defaultButton.click();
      } else if (inspectionData.spans[0]) {
        const firstButton = document.querySelector('.span-toggle');
        if (firstButton) firstButton.click();
      }
  }
}

function showError(message) {
    alert(message);
}

// Preview Inspection
const previewButton = document.getElementById('previewInspection');
if (previewButton) {
  previewButton.addEventListener('click', function() {
    const inspectionData = JSON.parse(sessionStorage.getItem('inspectionData')) || {};
    const defects = JSON.parse(sessionStorage.getItem('defects')) || [];
    const photoData = JSON.parse(sessionStorage.getItem('photoData')) || {};
    
    let previewContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Inspection Preview</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; }
          h1 { color: #333; }
          .container { max-width: 900px; margin: 0 auto; }
          pre { background: #f5f5f5; padding: 15px; border-radius: 5px; overflow-x: auto; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>${inspectionData.structureName || 'Structure'} Inspection</h1>
          <p><strong>Date:</strong> ${inspectionData.inspectionDate ? formatDate(inspectionData.inspectionDate) : 'N/A'}</p>
          <h2>Inspection Details</h2>
          <pre>${JSON.stringify(inspectionData, null, 2)}</pre>
          <h2>All Defects (${defects.length})</h2>
          <pre>${JSON.stringify(defects, null, 2)}</pre>
          <h2>All Photos (${Object.keys(photoData).length})</h2>
          <pre>${JSON.stringify(photoData, null, 2)}</pre>
        </div>
      </body>
      </html>
    `;
    
    const previewWindow = window.open('', '_blank');
    if (previewWindow) {
      previewWindow.document.write(previewContent);
      previewWindow.document.close();
    } else {
      alert("Popup blocked. Please allow popups for this site.");
    }
  });
}

document.getElementById("toInspection1").addEventListener("click", function() {
    window.location.href = "../inspection1/inspection1.html";
});

// ============================================
// ELEMENTS DATABASE
// ============================================

const ELEMENTS_DB = {
    1: { category: "Deck Elements", description: "Primary deck element" },
    2: { category: "Deck Elements", description: "Secondary deck elements - Transverse beams" },
    3: { category: "Deck Elements", description: "Secondary deck elements - Others" },
    4: { category: "Deck Elements", description: "Half joints" },
    5: { category: "Deck Elements", description: "Tie beam/rod" },
    6: { category: "Deck Elements", description: "Parapet beam or cantilever" },
    7: { category: "Deck Elements", description: "Deck bracing" },
    8: { category: "Load-bearing Substructure", description: "Foundations" },
    9: { category: "Load-bearing Substructure", description: "Abutments (incl. arch springing)" },
    10: { category: "Load-bearing Substructure", description: "Spandrel wall/head wall" },
    11: { category: "Load-bearing Substructure", description: "Pier/column" },
    12: { category: "Load-bearing Substructure", description: "Cross-head/capping beam" },
    13: { category: "Load-bearing Substructure", description: "Bearings" },
    14: { category: "Load-bearing Substructure", description: "Bearing plinth/shelf" },
    15: { category: "Durability Elements", description: "Superstructure drainage" },
    16: { category: "Durability Elements", description: "Substructure drainage" },
    17: { category: "Durability Elements", description: "Waterproofing" },
    18: { category: "Durability Elements", description: "Movement/expansion joints" },
    19: { category: "Durability Elements", description: "Finishes: deck elements" },
    20: { category: "Durability Elements", description: "Finishes: substructure elements" },
    21: { category: "Durability Elements", description: "Finishes: parapets/safety fences" },
    22: { category: "Safety Elements", description: "Access/walkways/gantries" },
    23: { category: "Safety Elements", description: "Handrail/parapets/safety fences" },
    24: { category: "Safety Elements", description: "Carriageway surfacing" },
    25: { category: "Safety Elements", description: "Footway/verge/footbridge surfacing" },
    26: { category: "Other Bridge Elements", description: "Invert/river bed" },
    27: { category: "Other Bridge Elements", description: "Aprons" },
    28: { category: "Other Bridge Elements", description: "Fenders/cutwaters/collision prot." },
    29: { category: "Other Bridge Elements", description: "River training works" },
    30: { category: "Other Bridge Elements", description: "Revetment/batter paving" },
    31: { category: "Other Bridge Elements", description: "Wing walls" },
    32: { category: "Other Bridge Elements", description: "Retaining walls" },
    33: { category: "Other Bridge Elements", description: "Embankments" },
    34: { category: "Other Bridge Elements", description: "Machinery" },
    35: { category: "Ancillary Elements", description: "Approach rails/barriers/walls" },
    36: { category: "Ancillary Elements", description: "Signs" },
    37: { category: "Ancillary Elements", description: "Lighting" },
    38: { category: "Ancillary Elements", description: "Services" }
};

function getElementDescriptionSafe(elementNumber) {
    const element = ELEMENTS_DB[elementNumber];
    if (!element) {
        console.warn(`Element ${elementNumber} not found in database`);
        return `Element ${elementNumber}`;
    }
    return element.description;
}

const DEFECT_TYPE_MAP = {
    1: "Metalwork",
    2: "RC & prestressed concrete",
    3: "Masonry, brickwork & MC",
    4: "Paintwork & coatings",
    5: "Vegetation",
    6: "Foundation",
    7: "Invert, apron & riverbed",
    8: "Drainage",
    9: "Surfacing",
    10: "Expansion joints",
    11: "Embankments",
    12: "Bearings",
    13: "Impact damage",
    14: "Waterproofing",
    15: "Stone slab bridges",
    16: "Timber"
};

function getDefectTypeName(defectType) {
    return DEFECT_TYPE_MAP[defectType] || `Type ${defectType}`;
}

function getFullDefectDescription(defectType, defectNumber, defectId) {
    if (defectId && defectId.includes('.')) {
        const [type, number] = defectId.split('.');
        const typeName = getDefectTypeName(parseInt(type));
        const defectText = getDefectText(parseInt(type), parseInt(number));
        
        if (defectText) {
            return `${typeName} - ${defectText}`;
        }
        return `${typeName} - Defect ${number}`;
    }
    
    if (defectType && defectNumber) {
        const typeName = getDefectTypeName(parseInt(defectType));
        const defectText = getDefectText(parseInt(defectType), parseInt(defectNumber));
        
        if (defectText) {
            return `${typeName}, ${defectText}`;
        }
        return `${typeName}, Defect ${defectNumber}`;
    }
    
    return `Defect ${defectId || 'Unknown'}`;
}

function getDefectText(defectType, defectNumber) {
    if (defectNumberText[defectType] && defectNumberText[defectType][defectNumber]) {
        return defectNumberText[defectType][defectNumber];
    }
    return null;
}

function injectRetrievedRibbon(row) {
    const grid = row.querySelector('.aligned-grid');
    if (!grid) return;
    
    const existing = grid.querySelector('.retrieved-ribbon');
    if (existing) existing.remove();
    
    const ribbon = document.createElement('div');
    ribbon.className = 'retrieved-ribbon';
    ribbon.innerHTML = '<i class="fas fa-lock"></i> Retrieved';
    grid.insertBefore(ribbon, grid.firstChild);
}

// ============================================
// BCI STICKY SIDEBAR
// ============================================

(function() {
  const sidebar = document.getElementById('bciStickySidebar');
  const originalCards = document.querySelector('.stats-three-cards');
  if (!sidebar || !originalCards) return;

  let ticking = false;
  const NAVBAR_HEIGHT = 70;

  function syncValues() {
    const pairs = [
      ['bciAvResult',   'bciAvSidebar'],
      ['bciCritResult', 'bciCritSidebar']
    ];
    pairs.forEach(([srcId, dstId]) => {
      const src = document.getElementById(srcId);
      const dst = document.getElementById(dstId);
      if (src && dst && src.textContent !== dst.textContent) {
        dst.textContent = src.textContent;
      }
    });
  }

  ['bciAvResult', 'bciCritResult'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      new MutationObserver(syncValues).observe(el, {
        childList: true, characterData: true, subtree: true
      });
    }
  });

  function positionSidebar() {
      const table = document.querySelector('#inspectionElementsTable')
                || document.querySelector('.inspection-table-wrapper')
                || document.querySelector('table');

      if (table) {
        const tableRect = table.getBoundingClientRect();
        const sidebarWidth = sidebar.offsetWidth;
        const gapWidth = tableRect.left;
        const leftPos = (gapWidth / 2) - (sidebarWidth / 2);
        sidebar.style.left = `${Math.max(8, leftPos)}px`;
      }

      sidebar.style.top = `${NAVBAR_HEIGHT + (NAVBAR_HEIGHT / 2)}px`;
  }

  function handleScroll() {
      const rect = originalCards.getBoundingClientRect();
      const triggerPoint = NAVBAR_HEIGHT + 20;
      const EXTRA_OFFSET = NAVBAR_HEIGHT / 2;
      const SPEED = 1.5;

      const scrolledPast = triggerPoint - rect.top;

      if (scrolledPast <= 0) {
          sidebar.style.opacity = '0';
          sidebar.style.transform = `translateY(${-200 - EXTRA_OFFSET}px)`;
          sidebar.classList.remove('visible');
          return;
      }

      const maxTravel = 200 + EXTRA_OFFSET;
      const travel = Math.min(scrolledPast * SPEED, maxTravel);
      const sidebarY = (-200 - EXTRA_OFFSET) + travel;
      const opacity  = Math.min(1, scrolledPast / 90);

      sidebar.style.transform = `translateY(${sidebarY}px)`;
      sidebar.style.opacity = opacity;
      sidebar.classList.add('visible');

      syncValues();
  }

  window.addEventListener('scroll', () => {
    if (!ticking) {
      requestAnimationFrame(() => {
        positionSidebar();
        handleScroll();
        ticking = false;
      });
      ticking = true;
    }
  }, { passive: true });

  window.addEventListener('resize', positionSidebar);

  const EXTRA_OFFSET = NAVBAR_HEIGHT / 2;
  sidebar.style.opacity = '0';
  sidebar.style.transform = `translateY(${-200 - EXTRA_OFFSET}px)`;
  sidebar.style.pointerEvents = 'none';

  positionSidebar();
  syncValues();
})();

// ============================================
// LEFT FLOATING RAIL — align with table header
// ============================================
(function() {
  const rail = document.querySelector('.left-floating-rail');
  const mainEl = document.querySelector('.inspection-main');
  if (!rail || !mainEl) return;

  function positionLeftRail() {
    const theadRow = document.querySelector('#inspectionElementsTable thead tr');
    if (!theadRow) return;
    // rail is position:fixed, so its "top" is viewport-relative and must stay
    // constant regardless of scroll position. getBoundingClientRect().top is
    // relative to the CURRENT scroll, so add scrollY back to recover the
    // table's position as if scrolled to the very top — otherwise, expanding
    // a row further down the page (which resizes .inspection-main and
    // re-fires this via the ResizeObserver) would compute a tiny/negative
    // value and snap the rail to the top of (or off) the viewport.
    rail.style.top = (theadRow.getBoundingClientRect().top + window.scrollY) + 'px';
  }

  positionLeftRail();
  window.addEventListener('resize', positionLeftRail);

  // Bridge name/stats load asynchronously and can change the height of
  // everything above the table — re-measure whenever that shifts the
  // main column's size instead of guessing a fixed delay.
  if (typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(positionLeftRail).observe(mainEl);
  }
})();

// Make functions globally available
window.initializeSpanButtons = initializeSpanButtons;
window.handleSpanButtonClick = handleSpanButtonClick;
window.getElementDescriptionSafe = getElementDescriptionSafe;
window.refreshBCIScores = refreshBCIScores;
