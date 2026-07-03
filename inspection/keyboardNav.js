// ============================================================
// KEYBOARD-DRIVEN ELEMENT LOGGING (laptop workflow)
//
// Row browsing (table visible, no modal open):
//   Up/Down   move the active-row highlight
//   Enter     expand/collapse the active row
//   D         open "Add Defect" for the active row
//   N         open "No Defects" quick-confirm for the active row
//   I         open "Not Inspected" quick-confirm for the active row
//
// Quick-confirm box (No Defects / Not Inspected comment):
//   Enter     confirm (Shift+Enter for a newline instead)
//   Escape    cancel
//
// Add Defect modal:
//   1-5       set Severity
//   A-E       set Extent
//   Enter     save (Ctrl/Cmd+Enter works even while typing in Comment)
//
// Everything here dispatches real .click() calls on the existing buttons
// rather than reimplementing their behaviour, so it can't drift out of
// sync with the click-driven flow the rest of inspection.js owns.
// ============================================================

(function () {
    const ACTIVE_CLASS = 'kbd-active-row';

    function isTypingTarget(el) {
        if (!el) return false;
        const tag = el.tagName;
        return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
    }

    function getMainRows() {
        return Array.from(document.querySelectorAll('#inspectionElementsTable tbody tr.main-row'))
            .filter(row => row.style.display !== 'none');
    }

    function getActiveRow() {
        return document.querySelector('#inspectionElementsTable tbody tr.main-row.' + ACTIVE_CLASS);
    }

    function setActiveRow(row) {
        const current = getActiveRow();
        if (current) current.classList.remove(ACTIVE_CLASS);
        if (row) {
            row.classList.add(ACTIVE_CLASS);
            row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
    }

    function moveActiveRow(delta) {
        const rows = getMainRows();
        if (!rows.length) return;
        const current = getActiveRow();
        let idx = current ? rows.indexOf(current) : -1;
        idx = Math.max(0, Math.min(rows.length - 1, idx + delta));
        setActiveRow(rows[idx]);
    }

    function findButtonRowFor(mainRow) {
        // Button row is a later sibling, inserted right after the main row
        // (see addButtonRowForMainRow in inspection.js).
        let sibling = mainRow.nextElementSibling;
        while (sibling && !sibling.classList.contains('main-row')) {
            if (sibling.classList.contains('button-row')) return sibling;
            sibling = sibling.nextElementSibling;
        }
        return null;
    }

    function ensureExpanded(mainRow) {
        if (!mainRow.classList.contains('expanded')) {
            mainRow.click();
        }
        return findButtonRowFor(mainRow);
    }

    function isModalOpen() {
        const modal = document.getElementById('modal');
        return !!(modal && modal.classList.contains('active'));
    }

    document.addEventListener('keydown', function (e) {
        // --- Inside the Add Defect modal ---
        if (isModalOpen()) {
            const modalState = (typeof window.getModalState === 'function') ? window.getModalState() : 'defect';

            // Ctrl/Cmd+Enter saves from anywhere, including the comment textarea.
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                document.getElementById('modalSaveBtn')?.click();
                return;
            }

            if (isTypingTarget(document.activeElement)) return;

            if (e.key === 'Enter') {
                e.preventDefault();
                document.getElementById('modalSaveBtn')?.click();
                return;
            }

            if (modalState === 'defect') {
                if (/^[1-5]$/.test(e.key) && typeof window.setSeverityStepper === 'function') {
                    e.preventDefault();
                    window.setSeverityStepper(parseInt(e.key, 10));
                    return;
                }
                if (/^[a-eA-E]$/.test(e.key) && typeof window.setExtentStepper === 'function') {
                    e.preventDefault();
                    window.setExtentStepper(e.key.toUpperCase());
                    return;
                }
            }
            return;
        }

        // --- Inside a "No Defects" / "Not Inspected" quick-confirm box ---
        const activeQuickBox = document.activeElement?.closest('.quick-confirm-box');
        if (activeQuickBox && document.activeElement.classList.contains('quick-confirm-comment')) {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                activeQuickBox.querySelector('.quick-confirm-confirm')?.click();
                return;
            }
            if (e.key === 'Escape') {
                e.preventDefault();
                activeQuickBox.querySelector('.quick-confirm-cancel')?.click();
                return;
            }
            return;
        }

        // --- Row browsing (table has focus, nothing else does) ---
        if (isTypingTarget(document.activeElement)) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            moveActiveRow(1);
            return;
        }
        if (e.key === 'ArrowUp') {
            e.preventDefault();
            moveActiveRow(-1);
            return;
        }

        const activeRow = getActiveRow();
        if (!activeRow) return;

        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            activeRow.click();
            return;
        }

        if (e.key.toLowerCase() === 'd') {
            e.preventDefault();
            const buttonRow = ensureExpanded(activeRow);
            buttonRow?.querySelector('.btn-add-defect')?.click();
            return;
        }
        if (e.key.toLowerCase() === 'n') {
            e.preventDefault();
            const buttonRow = ensureExpanded(activeRow);
            buttonRow?.querySelector('.btn-no-defects')?.click();
            return;
        }
        if (e.key.toLowerCase() === 'i') {
            e.preventDefault();
            const buttonRow = ensureExpanded(activeRow);
            buttonRow?.querySelector('.btn-not-inspected')?.click();
            return;
        }
    });

    document.addEventListener('DOMContentLoaded', function () {
        // Start the highlight on the first row once the table has content.
        const observer = new MutationObserver(function () {
            if (!getActiveRow() && getMainRows().length) {
                setActiveRow(getMainRows()[0]);
            }
        });
        const tbody = document.querySelector('#inspectionElementsTable tbody');
        if (tbody) observer.observe(tbody, { childList: true });

        // Clicking a row (mouse) moves the active-row highlight there too, so
        // keyboard navigation picks up from wherever you last clicked.
        document.getElementById('inspectionElementsTable')?.addEventListener('click', function (e) {
            const mainRow = e.target.closest('tr.main-row');
            if (mainRow) setActiveRow(mainRow);
        });
    });
})();
