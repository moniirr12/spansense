// ============================================
// NOTES PANEL - sticky right-hand bar, separate from Conclusions.
// A running, multi-entry log (inspection_notes) rather than a single edited
// field - entries come from Field's Notes tab (source 'field') or from here
// (source 'core'), never merged into inspections.conclusions.
//
// Before the inspection has a real id (a brand-new one, still unsaved), a
// note has nowhere to POST to yet - it's queued in sessionStorage's
// 'queuedNotes' and travels with the very first /save-inspection call (see
// saveSequence.js). Once an id exists (editing an existing/Field-sourced
// inspection - see loadDefectsFromAPI in inspection.js), new notes post live
// via POST /api/inspections/:id/notes instead.
// ============================================
(function () {
    function getInspectionId() {
        const data = JSON.parse(sessionStorage.getItem('inspectionData') || '{}');
        return data.id || null;
    }
    function getSavedNotes() {
        const data = JSON.parse(sessionStorage.getItem('inspectionData') || '{}');
        return data.notes || [];
    }
    function getQueuedNotes() {
        return JSON.parse(sessionStorage.getItem('queuedNotes') || '[]');
    }
    function setQueuedNotes(notes) {
        sessionStorage.setItem('queuedNotes', JSON.stringify(notes));
    }

    function timeAgo(iso) {
        if (!iso) return '';
        const then = new Date(iso);
        const diffMin = Math.round((Date.now() - then.getTime()) / 60000);
        if (diffMin < 1) return 'Just now';
        if (diffMin < 60) return `${diffMin}m ago`;
        const diffHr = Math.round(diffMin / 60);
        if (diffHr < 24) return `${diffHr}h ago`;
        return then.toLocaleDateString(undefined, { day: '2-digit', month: 'short' });
    }

    function noteCardHTML(note) {
        const src = note.source === 'field' ? 'field' : 'core';
        const srcLabel = src === 'field' ? 'Field' : 'Core';
        const author = note.author || (note.pending ? 'You' : '');
        const meta = note.pending ? 'Will save with inspection' : timeAgo(note.created_at);
        return `
            <div class="note-card${note.pending ? ' note-pending' : ''}">
                <div class="note-top">
                    <span class="note-src note-src-${src}">${srcLabel}</span>
                    <span class="note-meta">${meta}</span>
                </div>
                <div class="note-text"></div>
                ${author ? `<div class="note-author">${author}</div>` : ''}
            </div>`;
    }

    function renderNotesList() {
        const list = document.getElementById('notesList');
        const sub = document.getElementById('notesPanelSub');
        const badge = document.getElementById('notesBadge');
        if (!list) return;

        const saved = getSavedNotes();
        const queued = getInspectionId() ? [] : getQueuedNotes().map(n => ({ ...n, pending: true }));
        const all = [...queued, ...saved];

        if (!all.length) {
            list.innerHTML = '<p class="notes-empty">No notes yet. Add one below.</p>';
        } else {
            list.innerHTML = all.map(noteCardHTML).join('');
            // .note-text set via textContent, not innerHTML, so a note
            // can't inject markup into the page.
            list.querySelectorAll('.note-card').forEach((el, i) => {
                el.querySelector('.note-text').textContent = all[i].text;
            });
        }

        const fieldCount = all.filter(n => n.source === 'field').length;
        sub.textContent = all.length
            ? `${all.length} note${all.length === 1 ? '' : 's'}${fieldCount ? ` · ${fieldCount} from Field` : ''}`
            : 'No notes yet';

        if (badge) {
            if (all.length) { badge.textContent = String(all.length); badge.hidden = false; }
            else { badge.hidden = true; }
        }
    }
    window.renderNotesList = renderNotesList;

    const NotesPanel = {
        open() {
            renderNotesList();
            document.getElementById('notesPanel').classList.add('open');
            document.getElementById('notesTab').classList.add('hide');
        },
        close() {
            document.getElementById('notesPanel').classList.remove('open');
            document.getElementById('notesTab').classList.remove('hide');
        },
        async addNote() {
            const input = document.getElementById('notesAddInput');
            const btn = document.getElementById('notesAddBtn');
            const text = input.value.trim();
            if (!text) return;

            const inspectionId = getInspectionId();
            btn.disabled = true;
            try {
                if (inspectionId) {
                    const response = await fetch(`/api/inspections/${inspectionId}/notes`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ text, source: 'core' })
                    });
                    const result = await response.json();
                    if (!response.ok || !result.success) throw new Error(result.error || 'Failed to add note');
                    const data = JSON.parse(sessionStorage.getItem('inspectionData') || '{}');
                    data.notes = [result.note, ...(data.notes || [])];
                    sessionStorage.setItem('inspectionData', JSON.stringify(data));
                } else {
                    setQueuedNotes([{ text, source: 'core' }, ...getQueuedNotes()]);
                }
                input.value = '';
                renderNotesList();
            } catch (err) {
                console.error('Add note error:', err);
                if (typeof showAlertModal === 'function') showAlertModal('Could not add note: ' + err.message);
                else alert('Could not add note: ' + err.message);
            } finally {
                btn.disabled = input.value.trim().length === 0;
            }
        }
    };
    window.NotesPanel = NotesPanel;

    document.addEventListener('DOMContentLoaded', () => {
        const input = document.getElementById('notesAddInput');
        const btn = document.getElementById('notesAddBtn');
        if (input && btn) {
            input.addEventListener('input', () => { btn.disabled = input.value.trim().length === 0; });
        }
        renderNotesList();
    });
})();
