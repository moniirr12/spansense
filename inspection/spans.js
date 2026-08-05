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
// The modal itself is populated and shown by saveSequence.js's own private
// showPostSaveModal() (called internally after the save animation finishes,
// so it always resolves to that file's closure-scoped version regardless of
// script load order). A second, window-exposed 3-arg version used to live
// here but nothing ever called it - removed as dead code.

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
    // Copy-once tracking (see markDefectAsCopied in inspection.js) is scoped
    // to one inspection draft, not the whole browser session.
    sessionStorage.removeItem('copiedDefectIds');
    window.location.href = '../inspection1/inspection1.html';
}

function viewReport(e) {
    e.preventDefault();
    // inspection-details.html never existed - that link fell through to the
    // server's SPA catch-all (app.get('*', ...) in server.js), which quietly
    // serves index.html for any unmatched path, so this looked exactly like
    // an unwanted redirect to the login page. generateSimplePDFReport is the
    // same real report generator dashboard.js/database.js's own
    // downloadReport() already use - structureId/structureName/inspectionDate
    // are set in sessionStorage from the moment this inspection was opened
    // (see map.js's marker click / inspection1.js's date picker).
    const structureId = sessionStorage.getItem('structureId');
    const structureName = sessionStorage.getItem('structureName');
    const inspectionDate = sessionStorage.getItem('inspectionDate');
    if (structureId && typeof window.generateSimplePDFReport === 'function') {
        const doc = { structure_id: structureId, structure_name: structureName || '', date: inspectionDate || '' };
        generateSimplePDFReport(doc, 'open');
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
                    .meta-label sub { text-transform: none; }
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
                            <div class="meta-label">BCI<sub>avg</sub></div>
                            <div class="meta-value" style="color:#5b8c8a;">${document.getElementById('bciAvResult')?.textContent || '100.00'}</div>
                        </div>
                        <div class="meta-item">
                            <div class="meta-label">BCI<sub>crit</sub></div>
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
            showAlertModal("Popup blocked. Please allow popups for this site.");
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

// Reads from the same sessionStorage 'defects' array saveChanges()/the Copy
// handler/quick actions all write to — the array that actually gets sent on
// save. (inspectionData.defects is a secondary, locate3d-position-only copy
// that some of those paths don't keep in sync, so it isn't reliable here.)
function getAllDefects() {
    const defects = JSON.parse(sessionStorage.getItem('defects') || '[]');
    return defects.map(defect => {
        let defectType = defect.defectType;
        let defectNumber = defect.defectNumber;
        if ((!defectType || !defectNumber) && defect.defectCombined && defect.defectCombined.includes('.')) {
            const parts = defect.defectCombined.split('.');
            defectType = parts[0];
            defectNumber = parts[1];
        }
        return {
            span: defect.spanNumber,
            elementNumber: defect.elementNumber,
            element: getElementDescriptionSafe(defect.elementNumber),
            defectId: defect.defectCombined,
            defectType: defectType,
            defectNumber: defectNumber,
            severity: defect.severity,
            extent: defect.extent,
            works: defect.works,
            priority: defect.priority,
            cost: defect.cost,
            comment: defect.comment,
            remedialWorks: defect.remedialWorks,
            isPrimary: defect.isPrimary === true
        };
    });
}

// "0.0" (No Defects) / "0.1" (Not Inspected) are element-status markers, not
// actual findings — reports/summaries should count and list them separately
// from real defects.
function isRealDefect(defect) {
    return defect.defectId !== '0.0' && defect.defectId !== '0.1';
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

// escapeHtml is defined identically in photo.js (loaded after this script),
// which is the copy that actually runs — see that file for the live implementation.

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
        const barIcon = document.getElementById('barIcon');
        const hasText = conclusionsSaved && conclusionsSaved.trim().length > 0;
        if (bar) {
            bar.classList.toggle('done', hasText);
        }
        if (barIcon) {
            barIcon.innerHTML = hasText ? '<i class="fas fa-check"></i>' : '<i class="fas fa-pen"></i>';
        }

        closeSplitModal();
        showToast('Conclusions saved successfully!', 'success');
    }
}

const DEFECT_NARRATION_VERBS = ['shows', 'exhibits', 'presents with', 'has developed', 'displays'];

// Turns one defect record into a readable sentence naming the element and
// finding, rather than just a code — e.g. "North girder shows rusting,
// rated severe, requiring remedial works."
function describeDefectSentence(defect, verbIndex) {
    const verb = DEFECT_NARRATION_VERBS[verbIndex % DEFECT_NARRATION_VERBS.length];
    const shortText = getDefectText(parseInt(defect.defectType), parseInt(defect.defectNumber));
    const defectText = (shortText || getFullDefectDescription(defect.defectType, defect.defectNumber, defect.defectId)).toLowerCase();
    const severityWord = getSeverityLabel(defect.severity).toLowerCase();
    const worksPhrase = defect.works === 'Y' ? ', requiring remedial works'
        : defect.works === 'M' ? ', recommended for ongoing monitoring'
        : '';
    const commentPhrase = defect.comment ? ` (noted: "${defect.comment.trim()}")` : '';
    return `${defect.element} ${verb} ${defectText}, rated ${severityWord}${worksPhrase}${commentPhrase}.`;
}

// Builds a plain-language draft from what's actually been recorded so far —
// describing the actual defects found, not just totals — as a starting
// point to edit, not a final answer.
function generateDraftConclusions() {
    const inspectionData = JSON.parse(sessionStorage.getItem('inspectionData') || '{}');
    const allDefects = getAllDefects();
    const realDefects = allDefects.filter(isRealDefect)
        .sort((a, b) => (parseInt(b.severity) || 0) - (parseInt(a.severity) || 0));
    const noDefectsCount = allDefects.filter(d => d.defectId === '0.0').length;
    const notInspectedCount = allDefects.filter(d => d.defectId === '0.1').length;
    const elementsChecked = new Set(allDefects.map(d => `${d.span}-${d.elementNumber}`)).size;

    const spansWithBci = (inspectionData.spans || []).filter(s => s.bciAv != null && s.bciCrit != null);
    const bciAv = spansWithBci.length
        ? spansWithBci.reduce((sum, s) => sum + parseFloat(s.bciAv), 0) / spansWithBci.length
        : parseFloat(document.getElementById('bciAvResult')?.textContent) || 100;
    const bciCrit = spansWithBci.length
        ? spansWithBci.reduce((sum, s) => sum + parseFloat(s.bciCrit), 0) / spansWithBci.length
        : parseFloat(document.getElementById('bciCritResult')?.textContent) || 100;
    const conditionLabel = bciAv >= 85 ? 'good' : bciAv >= 65 ? 'fair' : bciAv >= 40 ? 'poor' : 'critical';

    const paragraphs = [];
    paragraphs.push(`This inspection covered ${elementsChecked} element${elementsChecked === 1 ? '' : 's'}, of which ${noDefectsCount} showed no defects${notInspectedCount ? ` and ${notInspectedCount} could not be inspected` : ''}.`);

    if (realDefects.length === 0) {
        paragraphs.push('No defects were recorded during this inspection.');
    } else {
        // Describe the most severe defects individually; fold the rest into
        // one summary clause so the draft doesn't read as an endless list.
        const DESCRIBE_LIMIT = 4;
        const described = realDefects.slice(0, DESCRIBE_LIMIT);
        const remainder = realDefects.slice(DESCRIBE_LIMIT);

        paragraphs.push(described.map((d, i) => describeDefectSentence(d, i)).join(' '));

        if (remainder.length) {
            const remainderElements = [...new Set(remainder.map(d => d.element))];
            const elementList = remainderElements.length <= 3
                ? remainderElements.join(', ')
                : `${remainderElements.slice(0, 3).join(', ')} and other elements`;
            const remainderWorksCount = remainder.filter(d => d.works === 'Y').length;
            paragraphs.push(`A further ${remainder.length} lower-severity defect${remainder.length === 1 ? '' : 's'} ${remainder.length === 1 ? 'was' : 'were'} recorded, affecting ${elementList}${remainderWorksCount ? `, with ${remainderWorksCount} requiring remedial works` : ''}.`);
        }
    }

    paragraphs.push(`Overall structural condition is assessed as ${conditionLabel} (BCI avg ${bciAv.toFixed(2)}, BCI crit ${bciCrit.toFixed(2)}).`);

    return paragraphs.join(' ');
}

// Same facts generateDraftConclusions() gathers for its own template, just
// shaped for the Gemini prompt (see draftConclusionsWithGemini in
// geminiExtract.js) instead of being turned into paragraphs locally.
function buildConclusionsSummaryForGemini() {
    const inspectionData = JSON.parse(sessionStorage.getItem('inspectionData') || '{}');
    const allDefects = getAllDefects();
    const realDefects = allDefects.filter(isRealDefect)
        .sort((a, b) => (parseInt(b.severity) || 0) - (parseInt(a.severity) || 0));
    const noDefectsCount = allDefects.filter(d => d.defectId === '0.0').length;
    const notInspectedCount = allDefects.filter(d => d.defectId === '0.1').length;
    const elementsChecked = new Set(allDefects.map(d => `${d.span}-${d.elementNumber}`)).size;

    const spansWithBci = (inspectionData.spans || []).filter(s => s.bciAv != null && s.bciCrit != null);
    const bciAv = spansWithBci.length
        ? spansWithBci.reduce((sum, s) => sum + parseFloat(s.bciAv), 0) / spansWithBci.length
        : parseFloat(document.getElementById('bciAvResult')?.textContent) || 100;
    const bciCrit = spansWithBci.length
        ? spansWithBci.reduce((sum, s) => sum + parseFloat(s.bciCrit), 0) / spansWithBci.length
        : parseFloat(document.getElementById('bciCritResult')?.textContent) || 100;

    return {
        structureType: inspectionData.structureType || sessionStorage.getItem('structureType') || 'Bridge',
        elementsChecked, noDefectsCount, notInspectedCount,
        bciAv: Number(bciAv.toFixed(2)), bciCrit: Number(bciCrit.toFixed(2)),
        defects: realDefects.map(d => ({
            element: d.element,
            code: `${d.defectType}.${d.defectNumber}`,
            description: getDefectText(parseInt(d.defectType), parseInt(d.defectNumber)) || getFullDefectDescription(d.defectType, d.defectNumber, d.defectId),
            severity: d.severity,
            extent: d.extent,
            worksRequired: d.works,
            comment: d.comment || ''
        }))
    };
}

async function suggestDraftConclusions() {
    const textarea = document.getElementById('conclusionsText');
    if (!textarea) return;

    // Only ask if there's actually something of the user's to lose.
    if (textarea.value.trim().length > 0) {
        const confirmed = await showConfirmModal({
            title: 'Replace Conclusions?',
            message: "This will replace your current text with a suggested draft. You can still edit it afterwards.",
            type: 'warning',
            confirmText: 'Replace',
            cancelText: 'Keep Mine',
            showCancel: true
        });
        if (!confirmed) return;
    }

    const btn = document.querySelector('.btn-suggest-draft');
    const originalHtml = btn ? btn.innerHTML : '';
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Drafting…'; }

    try {
        const response = await fetch('/api/draft-conclusions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(buildConclusionsSummaryForGemini())
        });
        const result = await response.json();
        if (!response.ok || !result.success || !result.text) throw new Error(result.error || 'No draft returned');
        textarea.value = result.text;
    } catch (err) {
        console.warn('Gemini draft unavailable, using quick draft instead:', err.message);
        textarea.value = generateDraftConclusions();
        showToast('AI draft unavailable - used a quick draft instead.');
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = originalHtml; }
    }
}
// "Ask AI to adjust" - revises whatever's currently in the textarea (a
// Gemini draft, the local template, or something the inspector typed
// themselves - doesn't matter which) per a typed instruction, re-grounded
// in the same facts a fresh draft would use so a run of edits can't drift
// into inventing things. No local-template fallback here, since there's no
// rule-based equivalent of "make it shorter" - if this fails, the text is
// simply left as it was and the inspector can edit it by hand instead.
async function reviseDraftConclusions() {
    const textarea = document.getElementById('conclusionsText');
    const input = document.getElementById('conclusionsRefineInput');
    if (!textarea || !input) return;

    const instruction = input.value.trim();
    if (!instruction) return;
    if (!textarea.value.trim()) {
        showToast('Draft or write something first, then ask for changes.');
        return;
    }

    const btn = document.getElementById('refineConclusionsBtn');
    const originalHtml = btn ? btn.innerHTML : '';
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>'; }
    input.disabled = true;

    try {
        const response = await fetch('/api/draft-conclusions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                currentText: textarea.value,
                instruction,
                ...buildConclusionsSummaryForGemini()
            })
        });
        const result = await response.json();
        if (!response.ok || !result.success || !result.text) throw new Error(result.error || 'No revision returned');
        textarea.value = result.text;
        input.value = '';
    } catch (err) {
        console.error('Revise conclusions error:', err.message);
        showToast('Could not apply that change - try again in a moment.');
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = originalHtml; }
        input.disabled = false;
    }
}
window.generateDraftConclusions = generateDraftConclusions;
window.suggestDraftConclusions = suggestDraftConclusions;
window.reviseDraftConclusions = reviseDraftConclusions;

function showToast(message, type) {
    const toast = document.createElement('div');
    const bg = type === 'success' ? '#22c55e' : '#3d6b69';
    const fg = type === 'success' ? '#1a2428' : 'white';
    toast.style.cssText = `position:fixed;bottom:24px;right:24px;background:${bg};color:${fg};padding:12px 24px;border-radius:12px;font-size:0.85rem;font-weight:500;box-shadow:0 4px 20px rgba(0,0,0,0.3);z-index:10000;border:1px solid #5b8c8a;opacity:0;transition:opacity 0.3s;`;
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

// Close on backdrop click (clicking the dimmed area outside the panels).
const splitModalEl = document.getElementById('splitModal');
if (splitModalEl) {
    splitModalEl.addEventListener('click', function(e) {
        if (e.target === this) closeSplitModal();
    });
}

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
    showAlertModal(message);
}

// Preview Inspection — the actual full report format (pdfmake), built from
// this page's own live/unsaved sessionStorage state instead of a saved
// inspection_id. buildInspectionReportDocDefinition (test.js) is a pure
// function decoupled from fetching/DOM access - normally fed by
// generateSimplePDFReport's DB-driven wrapper (View Report on database.html),
// here it's fed directly from what's already sitting in sessionStorage.
// Two things make this possible before Save even runs: photos are uploaded
// to Supabase storage the moment they're picked (see photo.js), not at
// save time, and every span's real BCI (refreshBCIScores(), inspection.js)
// is already written back into inspectionData.spans[].bciAv/bciCrit as the
// user moves between spans. Appendix B (BCI Proforma) is intentionally left
// out for now (bciFormData: null) - see buildInspectionReportDocDefinition's
// own guard for that.
const previewButton = document.getElementById('previewInspection');
if (previewButton) {
  previewButton.addEventListener('click', async function() {
    // Open the tab synchronously, inside the click's user-gesture, so the
    // fetches/image loading below can't get flagged as a popup - pdfmake
    // navigates this same window to the finished PDF once it's ready.
    const previewWindow = window.open('', '_blank');
    if (!previewWindow) { showToast("Popup blocked. Please allow popups for this site."); return; }
    previewWindow.document.write('<!DOCTYPE html><title>Loading preview…</title><body style="font-family:Arial,sans-serif;padding:60px;color:#8a9ba8;">Loading report preview…</body>');
    previewWindow.document.close();

    try {
      showToast('Generating report preview...', 'info');

      const structureId = sessionStorage.getItem('structureId');
      const inspectionData = JSON.parse(sessionStorage.getItem('inspectionData') || '{}');
      const structureName = inspectionData.structureName || 'Bridge';
      const inspectionDate = inspectionData.inspectionDate || new Date().toISOString().slice(0, 10);

      const [bridgeData, nextDueData] = await Promise.all([
        fetch(`/api/bridges/${structureId}`, { cache: 'no-store' }).then(r => r.ok ? r.json() : {}).catch(() => ({})),
        fetch(`/api/inspection/next-due?structure_id=${structureId}&date=${inspectionDate}`).then(r => r.ok ? r.json() : null).catch(() => null)
      ]);

      // Same element numbering/category data the saved-inspection report
      // uses (test.js, hoisted to file scope there for this exact reuse).
      const allElementsList = ALL_ELEMENTS_LIST_BY_TYPE[bridgeData.type] || ALL_ELEMENTS_LIST_BY_TYPE.Bridge;
      const elementNameMap = {};
      allElementsList.forEach(el => { elementNameMap[el.elementNo] = el.name; });
      const getElementDesc = (defect) => elementNameMap[defect.elementNumber] || `Element ${defect.elementNumber}`;

      // Reading the raw stored array (not getAllDefects()'s renamed view) so
      // each defect keeps its own true photo-storage key alongside its short
      // "type.number" display code - see photo.js/inspection.js: defectId
      // here is a temp composite string (structureId_date_span_element_code),
      // while defectCombined is the "1.2"-style code the report expects as
      // its own defectId field. Same two-field mixup, opposite direction.
      const rawDefects = JSON.parse(sessionStorage.getItem('defects') || '[]');
      const realRawDefects = rawDefects.filter(d => d.defectCombined !== '0.0' && d.defectCombined !== '0.1');

      const defectsData = realRawDefects.map(d => ({
        // spanNumber/elementNumber are DOM dataset/sessionStorage strings on
        // the raw stored defect (mainRow.dataset.rowId, sessionStorage's
        // selectedSpan) - the report builder's element-matching (section 3)
        // does a strict === against allElementsList's numeric elementNo, same
        // as the real DB-backed path where these are genuine Postgres
        // integers. Left as strings, every defect would silently fail to
        // match its element and vanish from the report.
        spanNumber: parseInt(d.spanNumber, 10),
        elementNumber: parseInt(d.elementNumber, 10),
        defectId: d.defectCombined,
        defectType: d.defectType,
        defectNumber: d.defectNumber,
        severity: d.severity,
        extent: d.extent,
        worksRequired: d.works,
        remedialWorks: d.remedialWorks || '',
        priority: d.priority,
        cost: d.cost,
        comments: d.comment,
        isPrimary: d.isPrimary === true,
        element_description: elementNameMap[d.elementNumber] || `Element ${d.elementNumber}`,
        element_category: allElementsList.find(e => e.elementNo === parseInt(d.elementNumber, 10))?.category || 'Unknown'
      }));

      // Photos are already real, signed, directly-loadable Supabase URLs at
      // this point (photo.js's uploadPhotoNow sets server_url as soon as an
      // upload succeeds) - no DB round trip needed to include them here.
      const photoData = JSON.parse(sessionStorage.getItem('photoData') || '{}');
      const generalPhotos = (photoData['general'] || []).filter(p => p.server_url && !p.failed);
      const photosByDefect = {};
      realRawDefects.forEach(d => {
        const photos = (photoData[d.defectId] || []).filter(p => p.server_url && !p.failed);
        if (photos.length) photosByDefect[d.defectCombined] = photos;
      });

      const photosWithDataURLs = [];
      let photoCounter = 1;
      for (const photo of generalPhotos) {
        photosWithDataURLs.push({
          photo_description: photo.photo_description || 'General site photo',
          photoNumber: photoCounter++,
          photo_dataURL: await imageUrlToDataURL(photo.server_url)
        });
      }
      for (const [defectCode, photos] of Object.entries(photosByDefect)) {
        for (const photo of photos) {
          photosWithDataURLs.push({
            defectCode,
            photo_description: photo.photo_description,
            photoNumber: photoCounter++,
            photo_dataURL: await imageUrlToDataURL(photo.server_url)
          });
        }
      }
      function getPhotoNumbersForDefect(defectCode) {
        return photosWithDataURLs.filter(p => p.defectCode === defectCode).map(p => p.photoNumber);
      }

      let bridgePhotoDataURL = null;
      try {
        const photoRes = await fetch(`/getBridgePhoto?bridgeId=${structureId}`);
        if (photoRes.ok) {
          const pd = await photoRes.json();
          if (pd.photo_url) bridgePhotoDataURL = await imageUrlToDataURL(pd.photo_url);
        }
      } catch (err) { console.error('Preview: bridge photo failed to load', err); }

      let mapDataURL = null;
      if (bridgeData.latitude && bridgeData.longitude) {
        mapDataURL = await captureLocationMap(parseFloat(bridgeData.latitude), parseFloat(bridgeData.longitude), structureName);
      }

      // Overall BCI, averaged across spans the same way the conclusions
      // drafter already does (buildConclusionsSummaryForGemini above) -
      // reads the real per-span calculateBCI() results already sitting in
      // inspectionData.spans, not test.js's cruder severity-only fallback
      // (which only kicks in server-side when a much older saved inspection
      // predates the overall_bciave/overall_bcicrit columns entirely).
      const spansWithBci = (inspectionData.spans || []).filter(s => s.bciAv != null && s.bciCrit != null);
      const bciAv = spansWithBci.length
        ? spansWithBci.reduce((sum, s) => sum + parseFloat(s.bciAv), 0) / spansWithBci.length
        : parseFloat(document.getElementById('bciAvResult')?.textContent) || 100;
      const bciCrit = spansWithBci.length
        ? spansWithBci.reduce((sum, s) => sum + parseFloat(s.bciCrit), 0) / spansWithBci.length
        : parseFloat(document.getElementById('bciCritResult')?.textContent) || 100;
      const bciCategory = getBCICategory(bciAv);

      const spanNumbers = [...new Set(defectsData.map(d => d.spanNumber))].sort((a, b) => a - b);
      if (spanNumbers.length === 0) spanNumbers.push(1);
      const defectsBySpan = {};
      spanNumbers.forEach(span => { defectsBySpan[span] = defectsData.filter(d => d.spanNumber === span); });

      const docDefinition = buildInspectionReportDocDefinition({
        structureName, structureId, inspectionDate,
        bridgeData, inspectionData, defectsData,
        allElementsList, getElementDesc,
        photosWithDataURLs, getPhotoNumbersForDefect,
        bridgePhotoDataURL, mapDataURL,
        bciAv: Number(bciAv.toFixed(2)), bciCrit: Number(bciCrit.toFixed(2)), bciCategory,
        spanNumbers, defectsBySpan, nextDueData,
        bciFormData: null
      });

      const pdfGenerator = pdfMake.createPdf(docDefinition);
      if (previewWindow && !previewWindow.closed) {
        pdfGenerator.open({}, previewWindow);
      } else {
        pdfGenerator.open();
      }
    } catch (err) {
      console.error('Preview generation failed:', err);
      showToast(`Error generating preview: ${err.message}`, 'error');
      if (previewWindow && !previewWindow.closed) previewWindow.close();
    }
  });
}

document.getElementById("toInspection1").addEventListener("click", function() {
    window.location.href = "../inspection1/inspection1.html";
});

// ============================================
// ELEMENTS DATABASE
// ============================================

// Keyed by structure type (bridges.type) - must stay in sync with the
// `elements` DB table seeded by scripts/migrate-structure-types.js, since
// this is a synchronous mirror used where an async fetch isn't practical
// (Preview panel, locate3d.js defect labels).
const ELEMENTS_DB_BY_TYPE = {
    "Bridge": {
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
    },
    "Retaining wall": {
        1: { category: "Main Elements", description: "Foundations" },
        2: { category: "Main Elements", description: "Retaining wall: Primary" },
        3: { category: "Main Elements", description: "Retaining wall: Secondary" },
        4: { category: "Main Elements", description: "Parapet beam/plinth" },
        5: { category: "Durability Elements", description: "Drainage" },
        6: { category: "Durability Elements", description: "Movement/Expansion Joints" },
        7: { category: "Durability Elements", description: "Surface finishes: wall" },
        8: { category: "Durability Elements", description: "Surface finishes: handrail/parapet" },
        9: { category: "Safety Elements", description: "Handrail/parapets/safety fences" },
        10: { category: "Safety Elements", description: "Carriageway: Top of Wall" },
        11: { category: "Safety Elements", description: "Carriageway: Foot of Wall" },
        12: { category: "Safety Elements", description: "Footway/verge: Top of Wall" },
        13: { category: "Safety Elements", description: "Footway/verge: Foot of Wall" },
        14: { category: "Other Elements", description: "Embankment" },
        15: { category: "Other Elements", description: "Superstructure drainage" },
        16: { category: "Other Elements", description: "Invert/river bed" },
        17: { category: "Other Elements", description: "Aprons" },
        18: { category: "Ancillary Elements", description: "Signs" },
        19: { category: "Ancillary Elements", description: "Lighting" },
        20: { category: "Ancillary Elements", description: "Services" }
    },
    "Sign Gantry": {
        1: { category: "Main Elements", description: "Foundations" },
        2: { category: "Main Elements", description: "Truss/beams/cantilever" },
        3: { category: "Main Elements", description: "Transverse/horiz. bracing elements" },
        4: { category: "Main Elements", description: "Columns/supports/legs" },
        5: { category: "Durability Elements", description: "Surface finishes: truss/beams/cantilever" },
        6: { category: "Durability Elements", description: "Surface finishes: columns/supports/legs" },
        7: { category: "Durability Elements", description: "Surface finishes: other elements" },
        8: { category: "Safety Elements", description: "Access/walkway/deck" },
        9: { category: "Safety Elements", description: "Access ladder" },
        10: { category: "Safety Elements", description: "Handrails/guard rails" },
        11: { category: "Other Elements", description: "Base connections" },
        12: { category: "Other Elements", description: "Support to longitudinal connection" },
        13: { category: "Other Elements", description: "Sign and signal supports" },
        14: { category: "Ancillary Elements", description: "Signs/signals" },
        15: { category: "Ancillary Elements", description: "Lighting" },
        16: { category: "Ancillary Elements", description: "Services" }
    }
};

function getElementDescriptionSafe(elementNumber, structureType = sessionStorage.getItem('structureType') || 'Bridge') {
    const elementsDb = ELEMENTS_DB_BY_TYPE[structureType] || ELEMENTS_DB_BY_TYPE['Bridge'];
    const element = elementsDb[elementNumber];
    if (!element) {
        console.warn(`Element ${elementNumber} not found in database for structure type "${structureType}"`);
        return `Element ${elementNumber}`;
    }
    return element.description;
}

// Same lookup as getElementDescriptionSafe, but the category half - used by
// the Preview popup to group defects the same way the real generated report
// does (map/reportFull.html.js's own section 3), not by span alone.
function getElementCategorySafe(elementNumber, structureType = sessionStorage.getItem('structureType') || 'Bridge') {
    const elementsDb = ELEMENTS_DB_BY_TYPE[structureType] || ELEMENTS_DB_BY_TYPE['Bridge'];
    const element = elementsDb[elementNumber];
    return element ? element.category : 'Other Elements';
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

// ============================================================
// COMBINED DEFECT TYPE PICKER - replaces the old Element/No. dropdown pair
// with one searchable picker (same idea as Field's), still driving the same
// underlying #defectType/#defectNumber <select>s every other bit of this
// page's save/edit/guidance-panel logic already reads from.
// ============================================================
let defectTypeCatalog = null;
function getDefectTypeCatalog() {
    if (defectTypeCatalog) return defectTypeCatalog;
    const catalog = [];
    Object.keys(DEFECT_TYPE_MAP).forEach((type) => {
        const category = DEFECT_TYPE_MAP[type];
        const numbers = defectNumberText[type] || {};
        Object.keys(numbers).forEach((number) => {
            const name = numbers[number];
            catalog.push({
                type: String(type), number: String(number), code: `${type}.${number}`,
                category, name, search: `${category} ${name}`.toLowerCase()
            });
        });
    });
    defectTypeCatalog = catalog;
    return catalog;
}

function updateCombinedDefectLabel() {
    const typeEl = document.getElementById('defectType');
    const numEl = document.getElementById('defectNumber');
    const codeEl = document.getElementById('combinedDefectCode');
    const nameEl = document.getElementById('combinedDefectName');
    const catEl = document.getElementById('combinedDefectCat');
    if (!typeEl || !numEl || !codeEl || !nameEl || !catEl) return;
    const type = typeEl.value, number = numEl.value;
    const name = getDefectText(parseInt(type, 10), parseInt(number, 10));
    codeEl.textContent = `${type}.${number}`;
    nameEl.textContent = name || `Defect ${number}`;
    catEl.textContent = (typeof getDefectTypeName === 'function' && getDefectTypeName(parseInt(type, 10))) || '';
}
window.updateCombinedDefectLabel = updateCombinedDefectLabel;

function openDefectTypePicker() {
    const card = document.getElementById('combinedDefectTrigger')?.closest('.combined-card');
    const search = document.getElementById('defectTypePickerSearch');
    if (!card) return;
    card.classList.add('open');
    if (search) { search.value = ''; search.focus(); }
    renderDefectTypePicker('');
}
function closeDefectTypePicker() {
    document.getElementById('combinedDefectTrigger')?.closest('.combined-card')?.classList.remove('open');
}
function renderDefectTypePicker(query) {
    const list = document.getElementById('defectTypePickerList');
    if (!list) return;
    const q = query.trim().toLowerCase();
    const catalog = getDefectTypeCatalog();
    const matches = q ? catalog.filter((c) => c.search.includes(q)) : catalog;
    list.innerHTML = '';
    if (!matches.length) {
        list.innerHTML = '<p class="picker-empty">No matching defect types.</p>';
        return;
    }
    let lastCat = null;
    matches.forEach((c) => {
        if (c.category !== lastCat) {
            const catRow = document.createElement('div');
            catRow.className = 'picker-cat';
            catRow.textContent = c.category;
            list.appendChild(catRow);
            lastCat = c.category;
        }
        const row = document.createElement('div');
        row.className = 'picker-row';
        row.innerHTML = `<span class="code">${c.code}</span><span class="name">${escapeHtml(c.name)}</span>`;
        row.addEventListener('click', () => {
            const typeEl = document.getElementById('defectType');
            const numEl = document.getElementById('defectNumber');
            typeEl.value = c.type;
            typeEl.dispatchEvent(new Event('change', { bubbles: true }));
            // updateDefectNumbers() (run by the change event above) rebuilds
            // #defectNumber's options for the new type and defaults its
            // value to the first one - set the real number now that those
            // options exist, and dispatch change on it too so the severity
            // guidance panel (wired to #defectNumber's own change event)
            // syncs to the actual code picked, not the type's default first
            // option.
            numEl.value = c.number;
            numEl.dispatchEvent(new Event('change', { bubbles: true }));
            closeDefectTypePicker();
        });
        list.appendChild(row);
    });
}
document.addEventListener('DOMContentLoaded', () => {
    const trigger = document.getElementById('combinedDefectTrigger');
    trigger?.addEventListener('click', (e) => {
        e.stopPropagation();
        const card = trigger.closest('.combined-card');
        if (card?.classList.contains('open')) closeDefectTypePicker();
        else openDefectTypePicker();
    });
    document.getElementById('defectTypePickerClose')?.addEventListener('click', (e) => { e.stopPropagation(); closeDefectTypePicker(); });
    document.getElementById('defectTypePickerSearch')?.addEventListener('input', (e) => renderDefectTypePicker(e.target.value));
    document.addEventListener('click', (e) => {
        const card = document.getElementById('combinedDefectTrigger')?.closest('.combined-card');
        if (card && !card.contains(e.target)) card.classList.remove('open');
    });
    updateCombinedDefectLabel();
});

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
        dst.style.color = src.style.color;
      }
      // Mirror the band-background class too (see BCI_BAND_CLASSES in
      // bci.js) so the sticky sidebar's mini cards tint the same as the
      // main ones instead of staying permanently white.
      const srcCard = src && src.closest('.stat-card');
      const dstCard = dst && dst.closest('.stat-card');
      if (srcCard && dstCard && window.BCI_BAND_CLASSES) {
        window.BCI_BAND_CLASSES.forEach(c => dstCard.classList.remove(c));
        const band = window.BCI_BAND_CLASSES.find(c => srcCard.classList.contains(c));
        if (band) dstCard.classList.add(band);
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
    let top = theadRow.getBoundingClientRect().top + window.scrollY;

    // Both this rail and #bciStickySidebar (above) are independently
    // computed fixed-position elements sharing the same left gutter, so
    // without coordination they can end up close enough to visually clash —
    // how much room the header/stat cards take above the table varies with
    // bridge name length and viewport width, but the sidebar's settled
    // position doesn't. Read its actual settled box (not a duplicated
    // constant) and keep the rail clear of it.
    const bciSidebar = document.getElementById('bciStickySidebar');
    if (bciSidebar) {
      const cs = getComputedStyle(bciSidebar);
      const settledBottom = (parseFloat(cs.top) || 0) + (parseFloat(cs.marginTop) || 0) + bciSidebar.offsetHeight;
      top = Math.max(top, settledBottom + 24);
    }

    rail.style.top = top + 'px';
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

// Escape closes whichever modal is open, innermost first — the photo modal
// and the defect-entry modal (#modal) already handle their own Escape key,
// this covers the rest (locate3d nests on top of the conclusions modal, so
// it has to be checked before it).
document.addEventListener('keydown', function(e) {
    if (e.key !== 'Escape') return;
    const photoModal = document.getElementById('uploadModal-photo');
    if (photoModal && photoModal.style.display === 'flex') {
        if (typeof closePhotoModal === 'function') closePhotoModal();
        return;
    }
    const locate3dModal = document.getElementById('locate3dModal');
    if (locate3dModal && locate3dModal.classList.contains('active')) {
        closeLocate3dModal();
        return;
    }
    const splitModal = document.getElementById('splitModal');
    if (splitModal && splitModal.classList.contains('active')) {
        closeSplitModal();
        return;
    }
    const postSaveOverlay = document.getElementById('postSaveOverlay');
    if (postSaveOverlay && postSaveOverlay.classList.contains('active')) {
        closePostSaveModal();
    }
});
