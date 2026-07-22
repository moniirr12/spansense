// ============================================
// GLASS SCROLLBAR
// ============================================
(function(){
    const sb=document.getElementById('glassScrollbar'), th=document.getElementById('glassThumb');
    if(!sb||!th){console.warn('[Scrollbar] elements not found');return;}
    let drag=false, sy=0, sty=0;
    function m(){const st=window.scrollY||0,th=document.documentElement.scrollHeight,vh=window.innerHeight,dh=Math.max(1,th-vh),tr=sb.offsetHeight||1,r=vh/Math.max(1,th),h=Math.max(40,r*tr),mx=Math.max(0,tr-h);return{st,p:st/dh,tr,h,mx,dh}}
    function u(){const x=m();th.style.setProperty('height',x.h+'px','important');th.style.setProperty('top',(x.p*x.mx)+'px','important')}
    window.addEventListener('scroll',u,{passive:true});window.addEventListener('resize',u);
    th.addEventListener('mousedown',e=>{drag=true;sy=e.clientY;sty=m().p*m().mx;e.preventDefault()});
    sb.addEventListener('mousedown',e=>{if(e.target===th||th.contains(e.target))return;const r=sb.getBoundingClientRect(),y=e.clientY-r.top,x=m();window.scrollTo({top:Math.max(0,Math.min(1,y/x.tr))*x.dh,behavior:'smooth'})});
    window.addEventListener('mousemove',e=>{if(!drag)return;const x=m(),ny=sty+(e.clientY-sy),c=Math.max(0,Math.min(x.mx,ny));window.scrollTo(0,(c/Math.max(1,x.mx))*x.dh)});
    window.addEventListener('mouseup',()=>drag=false);
    new MutationObserver(()=>{clearTimeout(window._t);window._t=setTimeout(u,50)}).observe(document.body,{childList:true,subtree:true});
    u();[50,100,250,500,1000,2000].forEach(d=>setTimeout(u,d));
    window.updateGlassScrollbar=u;
})();

const API_BASE = window.location.hostname === 'localhost' 
    ? 'http://localhost:3000' 
    : 'https://spansense.onrender.com';

// ============================================
// DARK MODE TOGGLE
// ============================================
(function() {
    const toggleBtn = document.getElementById('nightModeToggle');
    if (!toggleBtn) return;

    toggleBtn.onclick = function() {
        document.body.classList.toggle('night-mode');
        if (document.body.classList.contains('night-mode')) {
            this.innerHTML = '<i class="fas fa-sun"></i>';
            localStorage.setItem('nightMode', 'on');
        } else {
            this.innerHTML = '<i class="fas fa-moon"></i>';
            localStorage.setItem('nightMode', 'off');
        }
    };

    const savedNightMode = localStorage.getItem('nightMode');
    const systemPrefersLight = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches;
    document.documentElement.classList.remove('nm-preload');
    if (savedNightMode === 'on' || (savedNightMode === null && !systemPrefersLight)) {
        document.body.classList.add('night-mode');
        toggleBtn.innerHTML = '<i class="fas fa-sun"></i>';
    }
})();

// ============================================
// GLOBAL VARIABLES
// ============================================
let currentIndex = 0;
let spanNumber = 0;
let spans = [];
let completed = [];
let responses = [];
let selectedInspectionType = null;
const inspectionDate = sessionStorage.getItem('inspectionDate'); 

let inspectionData = {
    structureId: null,
    structureName: null,
    inspectionDate: inspectionDate,
    inspectionType: null,
    inspectorName: null,
    totalSpans: 0,
    spans: [],
};

function inspectionTypeFullName(code) {
    switch (code) {
        case 'PI': return 'Principal';
        case 'GI': return 'General';
        case 'SI': return 'Safety';
        default: return '';
    }
}

function buildBridgeHeaderText(structureName, typeCode) {
    const typeName = inspectionTypeFullName(typeCode);
    return typeName ? `${structureName} ${typeName} Inspection` : `${structureName} Inspection`;
}

// DOM Elements
const progressBar = document.getElementById('progress');
const spanTabs = document.getElementById('span-tabs');
const formContent = document.getElementById('form-content');
const prevBtn = document.getElementById('prev-btn');
const nextBtn = document.getElementById('next-btn');
const inspectionTypeButtons = document.querySelectorAll('.inspection-type-btn');
const inspectorNameInput = document.getElementById('inspectorName');

// ============================================
// HELPER FUNCTIONS
// ============================================

// Toast notification
let _draftToastTimer = null;

function showDraftToast(message, isError = false) {
    const existing = document.getElementById('draftToast');
    if (existing) existing.remove();
    if (_draftToastTimer) { clearTimeout(_draftToastTimer); _draftToastTimer = null; }

    const isDark = document.body.classList.contains('night-mode');

    const toast = document.createElement('div');
    toast.id = 'draftToast';
    toast.style.cssText = `
        position: fixed;
        bottom: 28px;
        right: 28px;
        background: ${isDark ? '#232e34' : 'white'};
        border: 1px solid ${isDark ? '#2f3e45' : '#e9edf2'};
        border-left: 4px solid ${isError ? '#c47070' : '#5b8c8a'};
        padding: 14px 20px;
        border-radius: 16px;
        font-size: 0.82rem;
        font-weight: 500;
        color: ${isDark ? '#d4dfe3' : '#2c4a48'};
        z-index: 2000;
        box-shadow: 0 8px 24px rgba(0,0,0,${isDark ? '0.25' : '0.08'});
        display: flex;
        align-items: center;
        gap: 10px;
        opacity: 0;
        transform: translateY(10px);
        transition: opacity 0.25s ease, transform 0.25s ease;
    `;

    toast.innerHTML = `
        <i class="fas ${isError ? 'fa-exclamation-triangle' : 'fa-check-circle'}" style="color:${isError ? '#c47070' : '#5b8c8a'};font-size:1rem;flex-shrink:0;"></i>
        <span style="flex:1;">${message}</span>
        <span id="draftToastClose" style="cursor:pointer;font-size:1rem;color:${isDark ? '#8aa4ac' : '#8a9ba8'};margin-left:4px;line-height:1;">×</span>
    `;
    document.body.appendChild(toast);

    requestAnimationFrame(() => {
        toast.style.opacity = '1';
        toast.style.transform = 'translateY(0)';
    });

    function dismiss() {
        if (_draftToastTimer) { clearTimeout(_draftToastTimer); _draftToastTimer = null; }
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(10px)';
        setTimeout(() => toast.remove(), 300);
    }

    document.getElementById('draftToastClose').addEventListener('click', dismiss);
    if (!isError) _draftToastTimer = setTimeout(dismiss, 3000);
}

// Check for duplicate inspection dates
async function checkDuplicateInspectionDate(structureId, date, excludeCurrentDate = false, currentDate = null) {
    try {
        const response = await fetch(`${API_BASE}/api/inspection-dates/${structureId}`);
        if (!response.ok) {
            if (response.status === 404) return false;
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const dates = await response.json();
        
        // If in edit mode, exclude the current inspection's date from duplicate check
        if (excludeCurrentDate && currentDate) {
            return dates.some(inspection => inspection.date === date && inspection.date !== currentDate);
        }
        
        return dates.some(inspection => inspection.date === date);
    } catch (error) {
        console.error('Error checking duplicate dates:', error);
        return false;
    }
}

// ============================================
// DATE PICKER FUNCTION with VALIDATIONS
// ============================================
async function date() {
    const inspectionDateCell = document.getElementById("inspectionDate");
    if (!inspectionDateCell) return;

    const structureId = sessionStorage.getItem('structureId');
    const isEditMode = sessionStorage.getItem('inspectionMode') === 'edit';
    const currentEditDate = sessionStorage.getItem('inspectionDate');
    
    const input = document.createElement("input");
    input.type = "text";
    input.style.position = "absolute";
    input.style.left = inspectionDateCell.getBoundingClientRect().left + window.scrollX + "px";
    input.style.top = inspectionDateCell.getBoundingClientRect().top + window.scrollY + "px";
    input.style.width = inspectionDateCell.offsetWidth + "px";
    input.style.height = inspectionDateCell.offsetHeight + "px";
    input.style.opacity = "0";
    input.style.pointerEvents = "none";
    input.style.zIndex = "9999";
    document.body.appendChild(input);

    let dateUpdated = false;

    const picker = flatpickr(input, {
        dateFormat: "Y-m-d",
        defaultDate: sessionStorage.getItem('inspectionDate') || new Date(),
        maxDate: "today",
        onChange: async function(selectedDates, dateStr) {
            if (selectedDates.length > 0 && !dateUpdated) {
                const selectedDate = selectedDates[0];
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                
                // Check 1: Future date validation
                if (selectedDate > today) {
                    await showModal({
                        title: "Invalid Date",
                        message: "Cannot select a future date. Please select today or a past date.",
                        type: "warning",
                        confirmText: "OK"
                    });
                    picker.close();
                    return;
                }
                
                // Check 2: Duplicate inspection date for new inspection
                if (!isEditMode && structureId) {
                    const isDuplicate = await checkDuplicateInspectionDate(structureId, dateStr);
                    
                    if (isDuplicate) {
                        const confirmed = await showModal({
                            title: "Duplicate Inspection Date",
                            message: `An inspection already exists on ${dateStr}.\n\nDo you want to edit the existing inspection instead?`,
                            type: "warning",
                            confirmText: "Yes, Edit It",
                            cancelText: "No, Choose Another",
                            showCancel: true
                        });
                        
                        if (confirmed) {
                            sessionStorage.setItem('inspectionMode', 'edit');
                            sessionStorage.setItem('inspectionDate', dateStr);
                            sessionStorage.setItem('inspectionStructureNumber', structureId);
                            window.location.reload();
                        }
                        picker.close();
                        return;
                    }
                }
                
                // Check 3: For edit mode, check if trying to change to a date that already has another inspection
                if (isEditMode && structureId && currentEditDate !== dateStr) {
                    const isDuplicate = await checkDuplicateInspectionDate(structureId, dateStr, true, currentEditDate);
                    
                    if (isDuplicate) {
                        await showModal({
                            title: "Date Conflict",
                            message: `Another inspection already exists on ${dateStr}.\n\nCannot change to this date. Please choose a different date.`,
                            type: "error",
                            confirmText: "OK"
                        });
                        picker.close();
                        return;
                    }
                }
                
                // All validations passed
                dateUpdated = true;
                const isoDate = dateStr;
                sessionStorage.setItem('inspectionDate', isoDate);
                inspectionDateCell.innerText = formatDate(isoDate);
                if (window.inspectionData) window.inspectionData.inspectionDate = isoDate;
                if (typeof inspectionData !== 'undefined' && inspectionData !== window.inspectionData) {
                    inspectionData.inspectionDate = isoDate;
                }

                showDraftToast(`Inspection date set to ${formatDate(isoDate)}`);
            }
        },
        onClose: function() {
            setTimeout(() => { 
                picker.destroy(); 
                input.remove(); 
                dateUpdated = false; 
            }, 100);
        }
    });
    picker.open();
}

// ============================================
// SIDEBAR UPDATE FUNCTIONS
// ============================================

// Function to format date
function formatDate(dateString) {
    if (!dateString || dateString === 'Invalid Date') return '--';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '--';
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

// Function to update bridge status based on BCI data
function updateBridgeStatus(bridgeData) {
    const statusElement = document.getElementById('sidebarStatus');
    if (!statusElement) return;
    
    const bciAv = sessionStorage.getItem('bciAv');
    
    if (bciAv) {
        const av = parseFloat(bciAv);
        if (av >= 85) {
            statusElement.innerHTML = '<i class="fas fa-check-circle"></i> Good';
            statusElement.className = 'sidebar-status good';
        } else if (av >= 65) {
            statusElement.innerHTML = '<i class="fas fa-chart-line"></i> Fair';
            statusElement.className = 'sidebar-status fair';
        } else if (av >= 40) {
            statusElement.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Poor';
            statusElement.className = 'sidebar-status poor';
        } else {
            statusElement.innerHTML = '<i class="fas fa-times-circle"></i> Critical';
            statusElement.className = 'sidebar-status critical';
        }
    } else if (bridgeData && bridgeData.condition_state) {
        statusElement.innerHTML = `<i class="fas fa-info-circle"></i> ${bridgeData.condition_state}`;
    } else {
        statusElement.innerHTML = '<i class="fas fa-check-circle"></i> Good';
        statusElement.className = 'sidebar-status good';
    }
}

// Function to fetch BCI scores for a specific inspection
async function fetchBCIForInspection(bridgeId, inspectionDate) {
    try {
        const response = await fetch(`${API_BASE}/api/defectsbci?structureId=${bridgeId}&date=${inspectionDate}`);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        
        const data = await response.json();
        
        if (data && data.length > 0) {
            let totalAv = 0;
            let totalCrit = 0;
            let count = 0;
            
            data.forEach(span => {
                if (span.bci_av) {
                    totalAv += parseFloat(span.bci_av);
                    totalCrit += parseFloat(span.bci_crit || 0);
                    count++;
                }
            });
            
            if (count > 0) {
                const avgAv = totalAv / count;
                const avgCrit = totalCrit / count;
                
                const bciAvElement = document.getElementById('bciAvResult');
                const bciCritElement = document.getElementById('bciCritResult');
                
                if (bciAvElement) setBciValue(bciAvElement, avgAv);
                if (bciCritElement) setBciValue(bciCritElement, avgCrit);
                
                sessionStorage.setItem('bciAv', avgAv.toFixed(2));
                sessionStorage.setItem('bciCrit', avgCrit.toFixed(2));
            }
        }
    } catch (error) {
        console.error('Error fetching BCI data:', error);
    }
}

// Function to fetch the latest inspection date and BCI scores
async function fetchLatestInspectionDate(bridgeId) {
    try {
        const inspectionMode = sessionStorage.getItem('inspectionMode');
        const isEditMode = inspectionMode === 'edit';
        const currentInspectionDate = sessionStorage.getItem('inspectionDate');

        const response = await fetch(`${API_BASE}/api/inspection-dates/${bridgeId}`);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        
        const dates = await response.json();
        
        if (dates && dates.length > 0) {
            const latestDate = dates[0].date;
            const lastInspEl = document.getElementById('sidebarLastInsp');
            if (lastInspEl) {
                const isCurrentDate = latestDate === currentInspectionDate;
                const dateDisplay = formatDate(latestDate);
                lastInspEl.innerHTML = isCurrentDate
                    ? `${dateDisplay} <i class="fas fa-circle-check current-insp-icon" title="This is the inspection you're currently editing"></i>`
                    : dateDisplay;
            }

            if (isEditMode) {
                if (currentInspectionDate) {
                    await fetchBCIForInspection(bridgeId, currentInspectionDate);
                }
            } else {
                sessionStorage.removeItem('bciAv');
                sessionStorage.removeItem('bciCrit');

                const bciAvElement = document.getElementById('bciAvResult');
                const bciCritElement = document.getElementById('bciCritResult');
                if (bciAvElement) setBciValue(bciAvElement, 100);
                if (bciCritElement) setBciValue(bciCritElement, 100);
            }
        } else {
            const lastInspEl = document.getElementById('sidebarLastInsp');
            if (lastInspEl) lastInspEl.innerText = 'No inspections';
        }
    } catch (error) {
        console.error('Error fetching inspection dates:', error);
        const lastInspEl = document.getElementById('sidebarLastInsp');
        if (lastInspEl) lastInspEl.innerText = 'Error';
    }
}

// Function to fetch bridge data from database and update sidebar
async function fetchAndUpdateBridgeData(bridgeId) {
    try {
        
        const spanCountEl = document.getElementById('sidebarSpanCount');
        const lengthEl = document.getElementById('sidebarLength');
        const lastInspEl = document.getElementById('sidebarLastInsp');
        const builtYearEl = document.getElementById('sidebarBuiltYear');
        const bridgeNameEl = document.getElementById('sidebarBridgeName');
        const bridgeIdEl = document.getElementById('sidebarBridgeId');
        
        if (spanCountEl) spanCountEl.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        if (lengthEl) lengthEl.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        if (lastInspEl) lastInspEl.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        if (builtYearEl) builtYearEl.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        
        // no-store: inspection.html has no editing UI of its own and no way
        // to be told a save happened on inspection1.html - it only ever
        // learns about an edit via this fetch on its own page load, so it
        // can't afford to be handed a cached response from before that edit.
        const response = await fetch(`${API_BASE}/api/bridges/${bridgeId}`, { cache: 'no-store' });
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        
        const bridgeData = await response.json();

        // Drives which element list/BCI scoring config applies (Bridge,
        // Retaining wall, ...) - see inspection.js/bci.js.
        if (bridgeData.type) sessionStorage.setItem('structureType', bridgeData.type);

        if (spanCountEl) spanCountEl.innerText = bridgeData.span_number || bridgeData.total_spans || '--';
        
        if (lengthEl) {
            const length = bridgeData.length_metres || bridgeData.length || '--';
            lengthEl.innerText = length !== '--' ? `${length} m` : '--';
        }
        
        if (builtYearEl) {
            const builtYear = bridgeData.year_built || bridgeData.construction_year || bridgeData.built_year || '--';
            builtYearEl.innerText = builtYear !== '--' ? builtYear : '--';
        }
        
        if (bridgeNameEl && bridgeData.name) bridgeNameEl.innerText = bridgeData.name;
        if (bridgeIdEl && bridgeData.id) bridgeIdEl.innerText = `Bridge ID: ${bridgeData.id}`;

        populateBridgeInfoPanel(bridgeData);

        await fetchLatestInspectionDate(bridgeId);
        updateBridgeStatus(bridgeData);

        return bridgeData;
    } catch (error) {
        console.error('Error fetching bridge data:', error);
        if (document.getElementById('sidebarSpanCount')) document.getElementById('sidebarSpanCount').innerHTML = '--';
        if (document.getElementById('sidebarLength')) document.getElementById('sidebarLength').innerHTML = '--';
        if (document.getElementById('sidebarLastInsp')) document.getElementById('sidebarLastInsp').innerHTML = 'Error';
        if (document.getElementById('sidebarBuiltYear')) document.getElementById('sidebarBuiltYear').innerHTML = '--';
    }
}

// ============================================================
// SPAN INFO PANEL - view + edit of the handful of structure facts that
// don't fit the compact sidebar (description, spans, length, built year,
// material). Editing is possible but deliberately low-key: a small text
// link rather than a button (see .info-edit-link in inspection1.css), and
// saving requires confirming in a modal that spells out the consequence
// (this is the structure's real record, not just this inspection) - two
// small bits of friction so a casual click doesn't change shared data by
// accident, without blocking a genuine correction.
// ============================================================
let currentBridgeInfo = null;

function escapeHtml(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, function(c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
}

function bridgeInfoFacts(data) {
    return {
        spans: data.span_number || data.total_spans || '',
        length: data.length_metres || data.length || '',
        built: data.year_built || data.construction_year || data.built_year || '',
        material: [data.primary_material, data.secondary_material].filter(Boolean).join(' / ')
    };
}

function renderSpanInfoView(data) {
    const inner = document.getElementById('bridgeInfoPanelInner');
    if (!inner) return;
    const f = bridgeInfoFacts(data);
    const hasDesc = !!data.description;

    inner.innerHTML = `
        <div class="info-panel-title">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path></svg>
            Description
            <button type="button" class="info-edit-link" id="infoEditBtn">Edit</button>
        </div>
        <div class="info-panel-desc ${hasDesc ? '' : 'empty'}">${hasDesc ? escapeHtml(data.description) : 'No description recorded for this structure yet.'}</div>
        <div class="info-panel-facts">
            <div class="info-fact"><span class="fl">Spans</span><span class="fv">${escapeHtml(f.spans) || '--'}</span></div>
            <div class="info-fact"><span class="fl">Length</span><span class="fv">${f.length ? escapeHtml(f.length) + ' m' : '--'}</span></div>
            <div class="info-fact"><span class="fl">Built</span><span class="fv">${escapeHtml(f.built) || '--'}</span></div>
            <div class="info-fact"><span class="fl">Material</span><span class="fv">${escapeHtml(f.material) || '--'}</span></div>
        </div>
    `;
    const editBtn = document.getElementById('infoEditBtn');
    if (editBtn) editBtn.addEventListener('click', function() { renderSpanInfoEdit(data); });
}

function renderSpanInfoEdit(data) {
    const inner = document.getElementById('bridgeInfoPanelInner');
    if (!inner) return;
    const f = bridgeInfoFacts(data);

    inner.innerHTML = `
        <div class="info-panel-title">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path></svg>
            Description
        </div>
        <textarea class="info-edit-textarea" id="infoEditDesc" placeholder="Add a description for this structure…">${escapeHtml(data.description || '')}</textarea>
        <div class="info-panel-facts info-panel-facts-edit">
            <div class="info-fact"><span class="fl">Spans</span><input type="number" id="infoEditSpans" min="1" value="${escapeHtml(f.spans)}"></div>
            <div class="info-fact"><span class="fl">Length (m)</span><input type="number" id="infoEditLength" min="0" value="${escapeHtml(f.length)}"></div>
            <div class="info-fact"><span class="fl">Built</span><input type="number" id="infoEditBuilt" min="1000" max="2100" value="${escapeHtml(f.built)}"></div>
            <div class="info-fact"><span class="fl">Material</span><input type="text" id="infoEditMaterial" value="${escapeHtml(f.material)}"></div>
        </div>
        <div class="info-edit-actions">
            <button type="button" class="info-edit-cancel" id="infoEditCancel">Cancel</button>
            <button type="button" class="info-edit-save" id="infoEditSave">Save</button>
        </div>
    `;
    document.getElementById('infoEditCancel').addEventListener('click', function() { renderSpanInfoView(currentBridgeInfo); });
    document.getElementById('infoEditSave').addEventListener('click', onSaveSpanInfo);
}

async function onSaveSpanInfo() {
    const payload = {
        description: document.getElementById('infoEditDesc').value.trim() || null,
        span_number: parseInt(document.getElementById('infoEditSpans').value, 10) || null,
        length: parseInt(document.getElementById('infoEditLength').value, 10) || null,
        built_year: parseInt(document.getElementById('infoEditBuilt').value, 10) || null,
        material: document.getElementById('infoEditMaterial').value.trim() || null
    };

    const proceed = await showModal({
        title: 'Save changes to this structure?',
        message: `This updates the stored record for ${currentBridgeInfo.name || 'this structure'} and applies to every future inspection and report for it, not just this one.`,
        type: 'warning',
        confirmText: 'Save changes',
        cancelText: 'Keep editing',
        showCancel: true
    });
    if (!proceed) return;

    const saveBtn = document.getElementById('infoEditSave');
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving…';
    try {
        const res = await fetch(`${API_BASE}/api/bridges/${currentBridgeInfo.id}/info`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!res.ok) throw new Error('Save failed');

        currentBridgeInfo = Object.assign({}, currentBridgeInfo, {
            description: payload.description,
            span_number: payload.span_number,
            length: payload.length,
            built_year: payload.built_year,
            primary_material: payload.material,
            secondary_material: null
        });
        renderSpanInfoView(currentBridgeInfo);

        // The sidebar-card (Spans/Length/Built Year) is a separate one-time
        // render from fetchAndUpdateBridgeData() at page load - it has no
        // other way to find out this save happened, so without this it
        // stays stale on this same page until the next full reload.
        const spanCountEl = document.getElementById('sidebarSpanCount');
        const lengthEl = document.getElementById('sidebarLength');
        const builtYearEl = document.getElementById('sidebarBuiltYear');
        if (spanCountEl) spanCountEl.innerText = currentBridgeInfo.span_number || '--';
        if (lengthEl) lengthEl.innerText = currentBridgeInfo.length ? `${currentBridgeInfo.length} m` : '--';
        if (builtYearEl) builtYearEl.innerText = currentBridgeInfo.built_year || '--';
    } catch (err) {
        console.error('Error saving structure info:', err);
        await showModal({ title: 'Could not save', message: 'Something went wrong saving these changes. Please try again.', type: 'error' });
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save';
    }
}

function populateBridgeInfoPanel(bridgeData) {
    currentBridgeInfo = bridgeData;
    renderSpanInfoView(bridgeData);
}

const bridgeInfoTab = document.getElementById('bridgeInfoTab');
const bridgeInfoPanel = document.getElementById('bridgeInfoPanel');
if (bridgeInfoTab && bridgeInfoPanel) {
    renderSpanInfoView({});
    const toggleBridgeInfo = function() {
        const open = bridgeInfoPanel.classList.toggle('open');
        bridgeInfoTab.setAttribute('aria-expanded', open ? 'true' : 'false');
    };
    bridgeInfoTab.addEventListener('click', toggleBridgeInfo);
    bridgeInfoTab.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            toggleBridgeInfo();
        }
    });
}

// Function to load and replace the mock image with actual photo
async function loadBridgePhoto(bridgeId) {
    const mockImageDiv = document.querySelector('.mock-image');
    if (!mockImageDiv) {
        console.error('Mock image div not found');
        return;
    }
    
    
    try {
        mockImageDiv.innerHTML = `<i class="fas fa-spinner fa-spin"></i><span style="font-size: 0.7rem;">Loading photo...</span>`;
        
        if (!bridgeId || bridgeId === 'null' || bridgeId === 'undefined') throw new Error('Invalid bridge ID');
        
        const response = await fetch(`${API_BASE}/getBridgePhoto?bridgeId=${bridgeId}`);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        
        const data = await response.json();
        
        if (data.photo_url && data.photo_url !== 'null' && data.photo_url !== '') {
            mockImageDiv.innerHTML = `<img src="${data.photo_url}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 4px;" alt="Bridge Structure Photo">`;
            mockImageDiv.style.background = 'none';
            mockImageDiv.style.padding = '0';
        } else {
            mockImageDiv.innerHTML = `<i class="fas fa-bridge"></i><span style="font-size: 0.6rem;">No photo available</span>`;
        }
    } catch (error) {
        console.error('Error loading bridge photo:', error);
        mockImageDiv.innerHTML = `<i class="fas fa-exclamation-triangle"></i><span style="font-size: 0.6rem;">Error loading photo</span>`;
    }
}

// ============================================
// CORE FUNCTIONS
// ============================================

function populateInspectionForm(data) {
    
    inspectionData = {
        ...inspectionData,
        ...data,
        spans: (data.spans || []).map(span => ({
            ...span,
            elementsInspected: span.elementsInspected ?? null,
            photographsTaken: span.photographsTaken ?? null,
            comments: span.comments || ""
        }))
    };

    if (!responses || responses.length === 0) responses = [];
    
    const inspectorInput = document.getElementById('inspectorName');
    if (inspectorInput) inspectorInput.value = inspectionData.inspectorName || '';
    
    const dateElement = document.getElementById('inspectionDate');
    if (dateElement && inspectionData.inspectionDate) dateElement.innerText = formatDate(inspectionData.inspectionDate);
    
    document.querySelectorAll('.inspection-type-btn').forEach(btn => {
        if (btn.dataset.type === inspectionData.inspectionType) {
            btn.classList.add('selected');
        } else {
            btn.classList.remove('selected');
        }
    });

    if (inspectionData.spans && inspectionData.spans.length > 0) {
        spanNumber = inspectionData.totalSpans || inspectionData.spans.length;
        spans = inspectionData.spans.map(s => `Span ${s.spanNumber}`);
        completed = new Array(spans.length).fill(false);
        responses = new Array(spans.length).fill(null).map(() => ({
            inspection: null,
            photos: null,
            comments: ""
        }));
        
        inspectionData.spans.forEach((span, index) => {
            responses[index] = {
                inspection: span.elementsInspected,
                photos: span.photographsTaken,
                comments: span.comments || ""
            };
            if (span.elementsInspected !== null || span.photographsTaken !== null) completed[index] = true;
        });
    }

    renderSpanTabs();
    renderStep(currentIndex);
    updateProgress();
}

async function fetchSpans(bridgeId) {
    try {
        
        const sidebarSpanCount = document.getElementById('sidebarSpanCount');
        if (sidebarSpanCount) sidebarSpanCount.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        
        const response = await fetch(`${API_BASE}/get-spans?bridgeId=${bridgeId}`);
        if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
        
        const data = await response.json();
        
        if (data.error) {
            console.error('Error from server:', data.error);
            if (sidebarSpanCount) sidebarSpanCount.innerText = '--';
            return;
        }
        
        if (sidebarSpanCount && data.span_number) sidebarSpanCount.innerText = data.span_number;
        
        initializeNewLayout(data.span_number);
    } catch (error) {
        console.error('Error fetching spans:', error);
        const sidebarSpanCount = document.getElementById('sidebarSpanCount');
        if (sidebarSpanCount) sidebarSpanCount.innerText = '--';
    }
}

function initializeNewLayout(numberOfSpans) {
    spanNumber = numberOfSpans;
    spans = Array.from({ length: spanNumber }, (_, i) => `Span ${i + 1}`);
    completed = new Array(spans.length).fill(false);
    inspectionData.totalSpans = spanNumber;
    
    responses = new Array(spans.length).fill(null).map(() => ({
        inspection: null,
        photos: null,
        comments: ""
    }));
    
    inspectionData.spans = spans.map((span, index) => ({
        spanNumber: index + 1,
        elementsInspected: null,
        photographsTaken: null,
        comments: "",
        bciC: null,
        bciA: null
    }));
    
    renderSpanTabs();
    renderStep(currentIndex);
    updateButtons();
}

function renderSpanTabs() {
    if (!spanTabs) return;
    spanTabs.innerHTML = spans.map((span, index) => `
        <div class="span-tab ${index === currentIndex ? 'active' : ''} ${completed[index] ? 'completed' : ''}" onclick="setCurrentIndex(${index})">
            ${span}
        </div>
    `).join('');
}

function renderStep(index) {
    if (!formContent) return;
    const response = responses[index];
    formContent.innerHTML = `
        <div class="step ${index === currentIndex ? 'active' : ''}">
            <h2>${spans[index]}</h2>
            <div class="question">
                <p>All above ground elements inspected?</p>
                <div class="options">
                    <button class="inspection ${response.inspection === true ? 'selected' : ''}" onclick="handleResponse('inspection', ${index}, true)">Yes</button>
                    <button class="inspection ${response.inspection === false ? 'selected' : ''}" onclick="handleResponse('inspection', ${index}, false)">No</button>
                </div>
            </div>
            <div class="question">
                <p>Photographs?</p>
                <div class="options">
                    <button class="photos ${response.photos === true ? 'selected' : ''}" onclick="handleResponse('photos', ${index}, true)">Yes</button>
                    <button class="photos ${response.photos === false ? 'selected' : ''}" onclick="handleResponse('photos', ${index}, false)">No</button>
                </div>
            </div>
            <textarea id="comments-${index}" placeholder="Enter comments...">${response.comments || ''}</textarea>
            <div class="mark-complete">
                <button onclick="markComplete(${index})">${completed[index] ? 'Update' : 'Mark Complete'}</button>
            </div>
        </div>
    `;
}

function handleResponse(type, index, value) {
    const commentsTextarea = document.getElementById(`comments-${index}`);
    const currentComments = commentsTextarea ? commentsTextarea.value : responses[index].comments;
    
    responses[index] = { ...responses[index], [type]: value, comments: currentComments };
    
    if (type === 'inspection') inspectionData.spans[index].elementsInspected = value;
    else if (type === 'photos') inspectionData.spans[index].photographsTaken = value;
    
    inspectionData.spans[index].comments = currentComments;
    renderStep(index);
}

function setCurrentIndex(index) {
    if (currentIndex >= 0 && currentIndex < spans.length) {
        const commentsTextarea = document.getElementById(`comments-${currentIndex}`);
        if (commentsTextarea) {
            responses[currentIndex].comments = commentsTextarea.value;
            inspectionData.spans[currentIndex].comments = commentsTextarea.value;
        }
    }
    currentIndex = index;
    renderSpanTabs();
    renderStep(currentIndex);
    updateButtons();
}

function handleNext() { if (currentIndex < spans.length - 1) setCurrentIndex(currentIndex + 1); }
function handlePrev() { if (currentIndex > 0) setCurrentIndex(currentIndex - 1); }

function markComplete(index) {
    const commentsTextarea = document.getElementById(`comments-${index}`);
    if (commentsTextarea) {
        responses[index].comments = commentsTextarea.value;
        inspectionData.spans[index].comments = commentsTextarea.value;
    }
    completed[index] = true;
    updateProgress();
    renderSpanTabs();
    if (currentIndex < spans.length - 1) handleNext();
}

function updateProgress() {
    const progress = (completed.filter(Boolean).length / spans.length) * 100;
    if (progressBar) progressBar.style.width = `${progress}%`;
}

function updateButtons() {
    if (prevBtn) prevBtn.disabled = currentIndex === 0;
    if (nextBtn) nextBtn.disabled = currentIndex === spans.length - 1;
}

// ============================================
// NAVIGATION
// ============================================
async function navigateToNextPage() {
    if (typeof showModal !== 'function') {
        console.warn('Modal not ready, waiting...');
        await new Promise(resolve => setTimeout(resolve, 100));
        if (typeof showModal !== 'function') {
            alert('Please wait for page to fully load');
            return;
        }
    }
    
    const missingCriticalFields = [];
    if (!inspectionData.inspectionType) missingCriticalFields.push("Inspection Type");
    if (!inspectionData.inspectorName) missingCriticalFields.push("Inspector Name");
    if (!inspectionData.inspectionDate) missingCriticalFields.push("Inspection Date");

    if (missingCriticalFields.length > 0) {
        await showModal({
            title: "Cannot Proceed",
            message: "The following required fields are missing:\n\n" + missingCriticalFields.join("\n"),
            type: "error",
            confirmText: "Got it"
        });
        return;
    }

    const incompleteSpans = inspectionData.spans.filter(function(span, index) {
        return !completed[index] || span.elementsInspected === null || span.photographsTaken === null;
    }).length;

    if (incompleteSpans > 0) {
        var proceed = await showModal({
            title: "Incomplete Spans",
            message: incompleteSpans + " span(s) are incomplete.\n\nProceed anyway?",
            type: "warning",
            confirmText: "Proceed",
            cancelText: "Go Back",
            showCancel: true
        });
        if (!proceed) return;
    }

    sessionStorage.setItem('inspectionData', JSON.stringify(inspectionData));
    window.location.href = "../inspection/inspection.html";
}

// ============================================
// DOMContentLoaded MAIN LISTENER
// ============================================
document.addEventListener("DOMContentLoaded", function () {
    const structureId = sessionStorage.getItem('structureId');  
    const structureName = sessionStorage.getItem('structureName');
    const isEditMode = sessionStorage.getItem('inspectionMode') === 'edit';

    const saveDraftBtn = document.getElementById('saveDraftBtn');
    if (saveDraftBtn && window.location.pathname.includes('inspection1.html')) {
        saveDraftBtn.addEventListener('click', function() {
            const commentsTextarea = document.getElementById(`comments-${currentIndex}`);
            if (commentsTextarea) {
                responses[currentIndex].comments = commentsTextarea.value;
                inspectionData.spans[currentIndex].comments = commentsTextarea.value;
            }

            sessionStorage.setItem('inspectionData', JSON.stringify(inspectionData));
            showDraftToast('Draft saved successfully');
        });
    }

    const toBCI = document.getElementById('toBCI');
    if (toBCI) toBCI.addEventListener('click', navigateToNextPage);
    if (prevBtn) prevBtn.addEventListener('click', handlePrev);
    if (nextBtn) nextBtn.addEventListener('click', handleNext);

    if (inspectorNameInput) {
        inspectorNameInput.addEventListener('input', function() {
            inspectionData.inspectorName = this.value;
        });
    }

    inspectionTypeButtons.forEach(button => {
        button.addEventListener('click', () => {
            const selectedType = button.getAttribute('data-type');
            inspectionTypeButtons.forEach(btn => btn.classList.remove('selected'));
            button.classList.add('selected');
            inspectionData.inspectionType = selectedType;

            const headerEl = document.getElementById('bridgeHeader');
            if (headerEl && inspectionData.structureName) {
                headerEl.textContent = buildBridgeHeaderText(inspectionData.structureName, selectedType);
            }
        });
    });

    // SCENARIO 1: Restoring saved inspection data
    const savedInspectionData = sessionStorage.getItem('inspectionData');
    
    if (savedInspectionData) {
        try {
            const parsedData = JSON.parse(savedInspectionData);
            
            populateInspectionForm(parsedData);
            Object.assign(inspectionData, parsedData);
            
            if (structureId) {
                loadBridgePhoto(structureId);
                fetchAndUpdateBridgeData(structureId);
            }
            
            if (structureId && structureName) {
                document.getElementById('bridgeHeader').textContent = buildBridgeHeaderText(structureName, inspectionData.inspectionType);
                const sidebarBridgeName = document.getElementById('sidebarBridgeName');
                const sidebarBridgeId = document.getElementById('sidebarBridgeId');
                if (sidebarBridgeName) sidebarBridgeName.textContent = structureName;
                if (sidebarBridgeId) sidebarBridgeId.textContent = `STR #${structureId}`;
            }
            
            return;
        } catch (error) {
            console.error('Error restoring saved inspection data:', error);
        }
    }

    // SCENARIO 2: Edit mode
    if (isEditMode) {
        const inspectionStructureNumber = sessionStorage.getItem('inspectionStructureNumber');
        const inspectionDate = sessionStorage.getItem('inspectionDate');
        
        if (inspectionStructureNumber && inspectionDate) {
            fetch(`${API_BASE}/api/inspection/full?structure_id=${inspectionStructureNumber}&date=${inspectionDate}`)
                .then(response => response.json())
                .then(data => {
                    populateInspectionForm(data);
                    inspectionData.inspectionType = data.inspectionType;
                    const headerEl = document.getElementById('bridgeHeader');
                    if (headerEl && structureName) {
                        headerEl.textContent = buildBridgeHeaderText(structureName, data.inspectionType);
                    }
                })
                .catch(error => {
                    console.error('Failed to load inspection:', error);
                });
        }

        if (structureId) {
            loadBridgePhoto(structureId);
            fetchAndUpdateBridgeData(structureId);
        }
        if (structureId && structureName) {
            document.getElementById('bridgeHeader').textContent = `${structureName} Inspection`;
        }
        return;
    }

    // SCENARIO 3: New inspection

    // Most inspections are General Inspections carried out by whoever is
    // logged in, so default both instead of making that the first two
    // clicks/typing on every new inspection.
    const giButton = document.querySelector('.inspection-type-btn[data-type="GI"]');
    if (giButton) {
        inspectionTypeButtons.forEach(btn => btn.classList.remove('selected'));
        giButton.classList.add('selected');
        inspectionData.inspectionType = 'GI';
    }
    fetch(`${API_BASE}/api/me`)
        .then(response => response.ok ? response.json() : null)
        .then(user => {
            if (!user || !user.full_name || !inspectorNameInput || inspectorNameInput.value) return;
            inspectorNameInput.value = user.full_name;
            inspectionData.inspectorName = user.full_name;
        })
        .catch(() => {});

    // Most inspections are recorded the day they happen, so default the
    // date to today instead of making every inspection start with a click
    // into the calendar just to pick the obvious value.
    const todayDate = new Date();
    const todayISO = `${todayDate.getFullYear()}-${String(todayDate.getMonth() + 1).padStart(2, '0')}-${String(todayDate.getDate()).padStart(2, '0')}`;
    sessionStorage.setItem('inspectionDate', todayISO);
    inspectionData.inspectionDate = todayISO;
    const inspectionDateCell = document.getElementById('inspectionDate');
    if (inspectionDateCell) inspectionDateCell.innerText = formatDate(todayISO);

    // The default still needs the same duplicate check the manual date
    // picker runs — otherwise a second inspection started today for the
    // same structure would silently slip through uncaught.
    if (structureId) {
        (async () => {
            const isDuplicate = await checkDuplicateInspectionDate(structureId, todayISO);
            if (!isDuplicate) return;
            const confirmed = await showModal({
                title: "Duplicate Inspection Date",
                message: `An inspection already exists on ${todayISO}.\n\nDo you want to edit the existing inspection instead?`,
                type: "warning",
                confirmText: "Yes, Edit It",
                cancelText: "No, Choose Another",
                showCancel: true
            });
            if (confirmed) {
                sessionStorage.setItem('inspectionMode', 'edit');
                sessionStorage.setItem('inspectionStructureNumber', structureId);
                window.location.reload();
            }
        })();
    }

    if (structureId) {
        loadBridgePhoto(structureId);
        fetchAndUpdateBridgeData(structureId);
    }

    if (structureId && structureName) {
        document.getElementById('bridgeHeader').textContent = buildBridgeHeaderText(structureName, inspectionData.inspectionType);

        const sidebarBridgeName = document.getElementById('sidebarBridgeName');
        const sidebarBridgeId = document.getElementById('sidebarBridgeId');
        if (sidebarBridgeName) sidebarBridgeName.textContent = structureName;
        if (sidebarBridgeId) sidebarBridgeId.textContent = `STR #${structureId}`;

        fetchSpans(structureId);
    } else {
        document.getElementById('bridgeHeader').textContent = "No structure data found.";
    }
});

// Back button handler
document.addEventListener('DOMContentLoaded', function() {
    const backButton = document.getElementById('toIndex');
    if (backButton) {
        backButton.addEventListener('click', async function() {
            const confirmed = await showModal({
                title: "Leave Inspection?",
                message: "If you continue, you'll lose the progress on the inspection.\n\nAre you sure?",
                type: "warning",
                confirmText: "Leave",
                cancelText: "Stay",
                showCancel: true
            });
            
            if (confirmed) {
                // Preserve night mode preference across the clear (see accounts.html's confirmSignOut)
                const nightMode = localStorage.getItem('nightMode');
                localStorage.clear();
                if (nightMode) localStorage.setItem('nightMode', nightMode);
                sessionStorage.clear();
                window.location.href = "../map/map.html";
            }
        });
    }
});

// Initial render
renderSpanTabs();
renderStep(currentIndex);
updateButtons();

// Expose functions globally
window.fetchAndUpdateBridgeData = fetchAndUpdateBridgeData;
window.loadBridgePhoto = loadBridgePhoto;
window.updateBridgeStatus = updateBridgeStatus;
window.fetchLatestInspectionDate = fetchLatestInspectionDate;
window.formatDate = formatDate;
window.date = date;
window.handleResponse = handleResponse;
window.setCurrentIndex = setCurrentIndex;
window.markComplete = markComplete;
window.handleNext = handleNext;
window.handlePrev = handlePrev;
