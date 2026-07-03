// ============================================================
// LIVE BCI IMPACT PREVIEW (Add Defect modal)
//
// Shows "BCI Average: 91.20 -> 84.60" inside the modal's Scores section,
// updating as Severity/Extent change, using the exact same calculateBCI()
// engine bci.js uses for the real score (see bci.js) — this is a preview
// only, nothing is written to the table/session until Save.
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
        const row = document.getElementById('bciPreviewRow');
        if (row) row.style.display = 'none';
    }

    function updateBciPreview() {
        const row = document.getElementById('bciPreviewRow');
        if (!row) return;

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

        row.classList.remove('worse', 'better');
        const delta = after.bciAv - before.bciAv;
        if (delta < -0.005) row.classList.add('worse');
        else if (delta > 0.005) row.classList.add('better');

        row.style.display = 'flex';
    }

    document.addEventListener('DOMContentLoaded', function () {
        // Wrap the stepper setters (bci.js/inspection.js's global exports) so the
        // preview recomputes on every change, whether it came from a click or
        // from keyboardNav.js calling these directly.
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
