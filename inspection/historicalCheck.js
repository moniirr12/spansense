// ============================================================
// HISTORICAL ANOMALY CHECK (Add Defect / No Defects, on Save)
//
// If an element's severity is dropping sharply compared to what was last
// recorded for it (e.g. Severe last time, No Defects this time), pause and
// ask the inspector to confirm before saving — catches the common mistake
// of picking the wrong severity/extent, or a genuine improvement worth a
// second look. Not applied to "Not Inspected", since that isn't a claim
// about current condition. Uses the same /api/previous-defects endpoint
// prevDefects.js already calls, and the app's existing showConfirmModal.
// ============================================================

(function () {
    const SEVERITY_DROP_THRESHOLD = 2; // e.g. 4 -> 1, or 3 -> 1

    function apiBase() {
        return window.location.origin.includes('localhost') ? 'http://localhost:3000' : window.location.origin;
    }

    function getEditingItemNumber() {
        let mainRow = null;
        if (typeof currentExpandableRow !== 'undefined' && currentExpandableRow?.classList?.contains('expandable-row')) {
            mainRow = typeof findMainRow === 'function' ? findMainRow(currentExpandableRow) : null;
        } else if (typeof currentRow !== 'undefined' && currentRow) {
            mainRow = currentRow.classList?.contains('main-row') ? currentRow : (typeof findMainRow === 'function' ? findMainRow(currentRow) : null);
        }
        return mainRow;
    }

    // Most recent previous inspection's worst-recorded severity for this
    // element (excluding the current inspection date), or null if none.
    async function fetchLastRecordedSeverity(structureId, elementNo) {
        const currentDate = sessionStorage.getItem('inspectionDate');
        let rows;
        try {
            const res = await fetch(`${apiBase()}/api/previous-defects?structureId=${encodeURIComponent(structureId)}&elementNo=${encodeURIComponent(elementNo)}`);
            rows = res.ok ? await res.json() : [];
        } catch (e) {
            return null;
        }
        const filtered = (rows || []).filter(r => {
            const d = r.inspection_date ? r.inspection_date.split('T')[0] : null;
            return d && d !== currentDate;
        });
        if (!filtered.length) return null;

        const mostRecentDate = filtered.reduce((latest, r) => {
            const d = r.inspection_date.split('T')[0];
            return !latest || d > latest ? d : latest;
        }, null);

        const sameDate = filtered.filter(r => r.inspection_date.split('T')[0] === mostRecentDate);
        const worstSeverity = Math.max(...sameDate.map(r => parseInt(r.severity, 10) || 1));
        return { severity: worstSeverity, date: mostRecentDate };
    }

    function getPendingSeverity() {
        const modalState = (typeof window.getModalState === 'function') ? window.getModalState() : 'defect';
        if (modalState === 'defect') {
            const sevEl = document.getElementById('severity');
            return sevEl ? parseInt(sevEl.value, 10) || 1 : 1;
        }
        if (modalState === 'no-defects') return 1; // forced Severity 1 / Extent A
        return null; // 'not-inspected' isn't a condition claim — skip the check
    }

    function fmtDate(iso) {
        const d = new Date(iso);
        return isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    }

    // Returns true if the save should proceed.
    async function confirmIfAnomalous() {
        const mainRow = getEditingItemNumber();
        const structureId = sessionStorage.getItem('structureId');
        if (!mainRow || !structureId) return true;

        const pendingSeverity = getPendingSeverity();
        if (pendingSeverity === null) return true;

        const elementNo = mainRow.dataset.rowId;
        const last = await fetchLastRecordedSeverity(structureId, elementNo);
        if (!last) return true;

        if (last.severity - pendingSeverity < SEVERITY_DROP_THRESHOLD) return true;

        const elName = mainRow.querySelector('.description')?.textContent?.trim() || `Element ${elementNo}`;
        const prevLabel = (typeof getSeverityLabel === 'function') ? getSeverityLabel(last.severity) : `Level ${last.severity}`;
        const newLabel = (typeof getSeverityLabel === 'function') ? getSeverityLabel(pendingSeverity) : `Level ${pendingSeverity}`;

        if (typeof window.showConfirmModal !== 'function') return true;

        return await window.showConfirmModal({
            title: 'Condition improved a lot — sure?',
            message: `${elName} was rated Severity ${last.severity} (${prevLabel}) on ${fmtDate(last.date)}. `
                + `You're now recording Severity ${pendingSeverity} (${newLabel}). Continue if that's correct.`,
            type: 'warning',
            confirmText: 'Yes, continue',
            cancelText: 'Let me check',
            showCancel: true
        });
    }

    document.addEventListener('DOMContentLoaded', function () {
        const originalSaveChanges = window.saveChanges;
        if (typeof originalSaveChanges !== 'function') return;
        window.saveChanges = async function () {
            const proceed = await confirmIfAnomalous();
            if (!proceed) return;
            return originalSaveChanges.apply(this, arguments);
        };
    });
})();
