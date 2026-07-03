// ============================================================
// LIVE BCI IMPACT PREVIEW (floating panel next to the Add Defect modal)
//
// Shows "91.20 -> 84.60" in a panel stacked above the Severity Guide panel,
// updating as Severity/Extent change, using the exact same calculateBCI()
// engine bci.js uses for the real score (see bci.js) — this is a preview
// only, nothing is written to the table/session until Save.
//
// Severity/extent can change two ways: a real click on a stepper button
// (handled entirely inside inspection.js's own closure, calling its local
// setSeverityStepper/setExtentStepper — NOT window.*) or keyboardNav.js
// calling window.setSeverityStepper/setExtentStepper directly. Both paths
// are hooked below so the preview stays in sync regardless of input method.
// ============================================================

(function () {
    function readCurrentTableState() {
        const mainRows = document.querySelectorAll('#inspectionElementsTable tbody tr.main-row');
        const severityValues = [], extentValues = [], itemNumbers = [];
        mainRows.forEach(row => {
            const itemno = row.querySelector('.itemno')?.textContent.trim() || 0;
            const severity = row.querySelector('.severity')?.textContent.trim() || 0;
            const extent = row.querySelector('.extent')?.textContent.trim() || 0;
            itemNumbers.push(parseInt(itemno, 10));
            severityValues.push(parseInt(severity, 10) || 0);
            extentValues.push(extent || 0);
        });
        return { severityValues, extentValues, itemNumbers };
    }

    function getEditingItemNumber() {
        let mainRow = null;
        if (typeof currentExpandableRow !== 'undefined' && currentExpandableRow?.classList?.contains('expandable-row')) {
            mainRow = typeof findMainRow === 'function' ? findMainRow(currentExpandableRow) : null;
        } else if (typeof currentRow !== 'undefined' && currentRow) {
            mainRow = currentRow.classList?.contains('main-row') ? currentRow : (typeof findMainRow === 'function' ? findMainRow(currentRow) : null);
        }
        return mainRow ? parseInt(mainRow.dataset.rowId, 10) : null;
    }

    function hidePreview() {
        const panel = document.getElementById('bciImpactPanel');
        if (panel) panel.style.display = 'none';
    }

    function updateBciPreview() {
        const panel = document.getElementById('bciImpactPanel');
        if (!panel) return;

        const modal = document.getElementById('modal');
        if (!modal || !modal.classList.contains('active')) return hidePreview();

        const modalState = (typeof window.getModalState === 'function') ? window.getModalState() : 'defect';
        if (modalState !== 'defect') return hidePreview();

        if (typeof window.calculateBCI !== 'function') return hidePreview();

        const itemNo = getEditingItemNumber();
        if (!itemNo) return hidePreview();

        const sevEl = document.getElementById('severity');
        const extEl = document.getElementById('extent');
        if (!sevEl || !extEl) return hidePreview();

        const structureType = sessionStorage.getItem('structureType') || 'Bridge';
        const state = readCurrentTableState();
        const idx = state.itemNumbers.indexOf(itemNo);
        if (idx === -1) return hidePreview();

        const before = window.calculateBCI(state.severityValues, state.extentValues, state.itemNumbers, structureType);

        const previewSeverity = state.severityValues.slice();
        const previewExtent = state.extentValues.slice();
        previewSeverity[idx] = parseInt(sevEl.value, 10) || 0;
        previewExtent[idx] = extEl.value || 0;
        const after = window.calculateBCI(previewSeverity, previewExtent, state.itemNumbers, structureType);

        const beforeEl = document.getElementById('bciPreviewBefore');
        const afterEl = document.getElementById('bciPreviewAfter');
        if (beforeEl) beforeEl.textContent = before.bciAv.toFixed(2);
        if (afterEl) afterEl.textContent = after.bciAv.toFixed(2);

        panel.classList.remove('worse', 'better');
        const delta = after.bciAv - before.bciAv;
        if (delta < -0.005) panel.classList.add('worse');
        else if (delta > 0.005) panel.classList.add('better');

        panel.style.display = 'flex';
    }

    document.addEventListener('DOMContentLoaded', function () {
        // A real click on a stepper button is handled entirely inside
        // inspection.js's own closure (it calls its local setSeverityStepper/
        // setExtentStepper, not window.*), so wrapping window.* alone never
        // sees it. Listening for the click directly — after inspection.js's
        // own listener, since both are registered on the same element and
        // fire in registration order — catches it once the value's updated.
        ['severityStepperCard', 'extentStepperCard'].forEach(function (id) {
            document.getElementById(id)?.addEventListener('click', function (e) {
                if (e.target.closest('.stepper-step')) updateBciPreview();
            });
        });

        // Wrap the stepper setters too, so keyboardNav.js calling
        // window.setSeverityStepper/setExtentStepper directly still updates
        // the preview (that path never fires a click event at all).
        ['setSeverityStepper', 'setExtentStepper'].forEach(function (name) {
            const original = window[name];
            if (typeof original !== 'function') return;
            window[name] = function () {
                original.apply(this, arguments);
                updateBciPreview();
            };
        });

        // Recompute whenever the modal opens (covers both new defects and edits).
        const originalOpenModal = window.openModal;
        if (typeof originalOpenModal === 'function') {
            window.openModal = function () {
                originalOpenModal.apply(this, arguments);
                setTimeout(updateBciPreview, 80);
            };
        }

        const originalCloseModal = window.closeModal;
        if (typeof originalCloseModal === 'function') {
            window.closeModal = function () {
                originalCloseModal.apply(this, arguments);
                hidePreview();
            };
        }
    });
})();
