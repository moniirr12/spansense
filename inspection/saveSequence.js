// ============================================
// SPANSENSE — SAVE SEQUENCE & LANDSCAPE MODAL
// ============================================

(function() {
    'use strict';

    // ---------- CONFIG ----------
    const SAVE_DURATION = 2500; // ms
    const STEPS = [
        { detail: 'Validating data...',      delay: 0 },
        { detail: 'Uploading defects...',      delay: 400 },
        { detail: 'Processing photos...',      delay: 800 },
        { detail: 'Updating BCI scores...',    delay: 1300 },
        { detail: 'Finalizing...',           delay: 1800 },
    ];

    // ---------- DOM REFS ----------
    const overlay       = document.getElementById('saveOverlay');
    const savingState   = document.getElementById('savingState');
    const successFlash  = document.getElementById('successFlash');
    const progressFill  = document.getElementById('progressFill');
    const detailText    = document.getElementById('saveDetailText');
    const postOverlay   = document.getElementById('postSaveOverlay');

    // ---------- STATE ----------
    let saveTimeout = null;
    let isSaving = false;

    // ---------- PUBLIC API ----------
    window.SpanSenseSave = {
        start,
        reset,
        isActive: () => isSaving
    };

    // ---------- SAVE FLOW ----------
    function start() {
        if (isSaving) return;
        isSaving = true;
        reset();

        // Show overlay
        overlay.classList.remove('hidden');
        savingState.style.display = 'block';
        successFlash.style.display = 'none';

        // Animate progress bar
        progressFill.style.animation = 'none';
        progressFill.offsetHeight; // force reflow
        progressFill.style.animation = `progressFill ${SAVE_DURATION}ms cubic-bezier(0.4, 0, 0.2, 1) forwards`;

        // Step through messages
        STEPS.forEach(step => {
            saveTimeout = setTimeout(() => {
                if (detailText) detailText.textContent = step.detail;
            }, step.delay);
        });

        // Success at end
        saveTimeout = setTimeout(() => {
            savingState.style.display = 'none';
            successFlash.style.display = 'block';

            // Fade out overlay, then show modal
            setTimeout(() => {
                overlay.classList.add('hidden');
                setTimeout(() => {
                    showPostSaveModal();
                    isSaving = false;
                }, 250);
            }, 600);

        }, SAVE_DURATION);
    }

    function reset() {
        clearTimeout(saveTimeout);
        if (overlay) overlay.classList.add('hidden');
        if (postOverlay) postOverlay.classList.remove('active');
        if (document.body) document.body.style.overflow = '';
        isSaving = false;
    }

    // ---------- POST-SAVE MODAL ----------
    function showPostSaveModal() {
        populateSummary();
        postOverlay.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    function populateSummary() {
        const inspectionData = JSON.parse(sessionStorage.getItem('inspectionData') || '{}');
        const defects = JSON.parse(sessionStorage.getItem('defects') || '[]');

        const bridgeNameEl = document.getElementById('psBridgeName');
        if (bridgeNameEl) bridgeNameEl.textContent = inspectionData.structureName || 'Unknown Bridge';

        const dateEl = document.getElementById('psDate');
        if (dateEl) {
            const d = inspectionData.inspectionDate ? new Date(inspectionData.inspectionDate) : new Date();
            dateEl.textContent = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
        }

        const spansEl = document.getElementById('psSpanCount');
        if (spansEl) spansEl.textContent = (inspectionData.spans?.length || 0) + ' inspected';

        const defectsEl = document.getElementById('psDefectCount');
        if (defectsEl) defectsEl.textContent = defects.length + ' recorded';

        const bciAvEl = document.getElementById('psBciAv');
        if (bciAvEl) {
            const bciAv = document.getElementById('bciAvResult')?.textContent || '100.00';
            bciAvEl.textContent = bciAv;
        }

        const bciCritEl = document.getElementById('psBciCrit');
        if (bciCritEl) {
            const bciCrit = document.getElementById('bciCritResult')?.textContent || '100.00';
            bciCritEl.textContent = bciCrit;
        }
    }

    // ---------- ACTION HANDLERS ----------
    // goHome/newInspection/viewReport (post-save modal buttons) live in
    // spans.js, not here - it loads after this file so its definitions are
    // the ones that actually run; keeping a second copy here was dead code.

    // ---------- SAVE BUTTON CLICK HANDLER ----------
    function attachSaveHandler() {
        const saveBtn = document.getElementById('saveInspection');
        if (!saveBtn) {
            console.error('Save button #saveInspection not found');
            return false;
        }
        
        // Remove any existing listeners by cloning (clean slate)
        const cleanBtn = saveBtn.cloneNode(true);
        cleanBtn.type = 'button';
        saveBtn.parentNode.replaceChild(cleanBtn, saveBtn);
        
        cleanBtn.addEventListener('click', async function(e) {
            e.preventDefault();
            e.stopPropagation();
            
            if (isSaving) {
                console.log('Save already in progress');
                return;
            }
            
            // Start animation
            start();
            
            // Do the actual save
            try {
                const inspectionData = JSON.parse(sessionStorage.getItem('inspectionData')) || {};
                const defects = JSON.parse(sessionStorage.getItem('defects')) || [];
                const isEditMode = sessionStorage.getItem('inspectionMode') === 'edit';
                let photoData = JSON.parse(sessionStorage.getItem('photoData')) || {};

                if (!inspectionData.structureId) {
                    throw new Error("Missing structure information. Please start over.");
                }
                
                if (defects.length === 0) {
                    const confirmSave = confirm("No defects have been added. Do you want to save the inspection anyway?");
                    if (!confirmSave) {
                        reset();
                        return;
                    }
                }
                
                const payload = {
                    inspection: {
                        structure_id: inspectionData.structureId,
                        structure_name: inspectionData.structureName,
                        inspection_date: inspectionData.inspectionDate,
                        inspection_type: inspectionData.inspectionType,
                        inspector_name: inspectionData.inspectorName,
                        total_spans: inspectionData.totalSpans,
                        conclusions: inspectionData.conclusions || '',
                        spans: (inspectionData.spans || []).map(span => ({
                            spanNumber: Number(span.spanNumber),
                            elementsInspected: Boolean(span.elementsInspected),
                            photographsTaken: Boolean(span.photographsTaken),
                            bciAv: span.bciAv || '100.00',
                            bciCrit: span.bciCrit || '100.00',
                            comments: span.comments || ''
                        }))
                    },
                    defects: defects.map(defect => {
                        // 3D location (locate3d.js) lives in the separate
                        // inspectionData.defects array, keyed by timestamp —
                        // merge it in here rather than threading it through
                        // this page's own defects store.
                        const located = (inspectionData.defects || []).find(d => d.timestamp === defect.timestamp);
                        const hasLocation = located && located.x != null && located.y != null && located.z != null;
                        return {
                            spanNumber: Number(defect.spanNumber),
                            elementNumber: Number(defect.elementNumber),
                            defectType: defect.defectType,
                            defectNumber: defect.defectNumber,
                            severity: defect.severity,
                            extent: defect.extent,
                            worksRequired: defect.works || '',
                            priority: defect.priority || 'M',
                            cost: defect.cost || 0,
                            comments: defect.comment || '',
                            remedial_works: defect.remedialWorks || '',
                            timestamp: defect.timestamp || new Date().toISOString(),
                            posX: hasLocation ? located.x : null,
                            posY: hasLocation ? located.y : null,
                            posZ: hasLocation ? located.z : null,
                            isPrimary: defect.isPrimary === true
                        };
                    }),
                    photoData: photoData
                };

                let inspectionId;
                
                if (isEditMode) {
                    const findResponse = await fetch('/find-inspection-id', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            structure_id: inspectionData.structureId,
                            inspection_date: inspectionData.inspectionDate
                        })
                    });
                    const findResult = await findResponse.json();
                    if (!findResponse.ok) throw new Error(findResult.message || "Failed to find inspection");
                    inspectionId = findResult.inspectionId;
                    payload.inspectionId = inspectionId;
                }

                const endpoint = isEditMode ? '/update-inspection' : '/save-inspection';
                const response = await fetch(endpoint, {
                    method: isEditMode ? 'PUT' : 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                const result = await response.json();
                if (!response.ok) throw new Error(result.message || `Failed to ${isEditMode ? 'update' : 'save'} inspection`);

                if (result.inspectionId || inspectionId) {
                    sessionStorage.setItem('lastSavedInspectionId', result.inspectionId || inspectionId);
                }
                
                console.log(`Inspection ${isEditMode ? 'updated' : 'saved'} successfully!`);
                
            } catch (error) {
                console.error("Save error:", error);
                await showAlertModal(`Save failed: ${error.message}`);
                reset();
            }
        });
        
        console.log('Save button attached to SpanSenseSave');
        return true;
    }

    // Attach handler immediately or on DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', attachSaveHandler);
    } else {
        attachSaveHandler();
    }

})();
