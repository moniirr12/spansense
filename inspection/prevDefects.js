(function() {
    const INITIAL_COUNT = 3;
    let _allDefects = [];
    let _collapsed = false;

    function apiBase() {
        return window.location.origin.includes('localhost') ? 'http://localhost:3000' : window.location.origin;
    }

    function panel()     { return document.getElementById('prevDefectsPanel'); }
    function list()      { return document.getElementById('prevList'); }
    function footer()    { return document.getElementById('prevFooter'); }
    function chipCount() { return document.getElementById('prevChipCount'); }

    // ── Format inspection date ──
    function fmtDate(iso) {
        if (!iso) return '—';
        const d = new Date(iso);
        return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    }

    // ── Build a single card HTML ──
    function buildCard(d, index) {
        const defCode  = `${d.defect_type}.${d.defect_number}`;
        const defName  = (typeof defectNumberText !== 'undefined' && defectNumberText[d.defect_type]?.[d.defect_number]) || '';
        const display  = defName ? `${defCode} — ${defName}` : defCode;
        const sev      = parseInt(d.severity) || 1;
        const sevCls   = sev <= 1 ? 'pb-s1' : sev === 2 ? 'pb-s2' : 'pb-s3';
        const works    = d.works_required ? 'Y' : 'N';
        const worksCls = works === 'Y' ? 'pb-wy' : works === 'M' ? 'pb-wm' : 'pb-wn';
        const comment  = (d.comments || '').trim();
        return `<div class="prev-card" data-index="${index}">
            <div class="prev-card-top">
                <span class="prev-code">${display}</span>
                <span class="prev-date">${fmtDate(d.inspection_date)}</span>
            </div>
            <div class="prev-badges">
                <span class="pb ${sevCls}">Sev ${sev}</span>
                <span class="pb pb-e">Ext ${d.extent || '?'}</span>
                <span class="pb ${worksCls}">Works: ${works}</span>
            </div>
            ${comment ? `<div class="prev-comment">${comment}</div>` : ''}
            <div class="prev-hint"><i class="fas fa-arrow-right"></i> Click to load</div>
        </div>`;
    }

    // ── Attach click listeners to all rendered cards ──
    function attachCardListeners() {
        const p = panel(); if (!p) return;
        p.querySelectorAll('.prev-card').forEach(card => {
            card.addEventListener('click', () => {
                p.querySelectorAll('.prev-card').forEach(c => {
                    c.classList.remove('prev-selected');
                    const h = c.querySelector('.prev-hint');
                    if (h) h.innerHTML = '<i class="fas fa-arrow-right"></i> Click to load';
                });
                card.classList.add('prev-selected');
                const h = card.querySelector('.prev-hint');
                if (h) h.innerHTML = '<i class="fas fa-check-circle"></i> Loaded into form';
                const d = _allDefects[parseInt(card.dataset.index)];
                if (d) loadDefectFromPrev(d);
            });
        });
    }

    // ── Render defects into the panel ──
    function renderDefects(defects) {
        _allDefects = defects;
        const p = panel(); if (!p) return;
        chipCount().textContent = defects.length;

        if (defects.length === 0) {
            list().innerHTML = '<div class="prev-empty"><i class="fas fa-inbox"></i><p>No previous defects<br>for this element</p></div>';
            footer().style.display = 'none';
            return;
        }

        const visible = defects.slice(0, INITIAL_COUNT);
        list().innerHTML = visible.map((d, i) => buildCard(d, i)).join('');

        const remaining = defects.length - INITIAL_COUNT;
        if (remaining > 0) {
            footer().style.display = '';
            document.getElementById('prevLoadMoreBtn').innerHTML =
                `<i class="fas fa-chevron-down"></i> Load ${remaining} more defect${remaining === 1 ? '' : 's'}`;
        } else {
            footer().style.display = 'none';
        }
        attachCardListeners();
    }

    // ── Open the panel for a given element number ──
    function openPrevPanel(elementNo) {
        const p = panel(); if (!p) return;
        const structureId = sessionStorage.getItem('structureId');
        if (!structureId || !elementNo) { p.style.display = 'none'; return; }

        // Start collapsed — user can click the panel or the chevron to expand
        _collapsed = true;
        p.classList.add('prev-collapsed');
        const icon = document.getElementById('prevCollapseIcon');
        if (icon) icon.className = 'fas fa-chevron-right';
        const btn0 = document.getElementById('prevCollapseBtn');
        if (btn0) btn0.title = 'Expand';

        // Update chip header
        document.getElementById('prevChipNum').textContent = elementNo;
        const mainRow = document.querySelector(`tr.main-row[data-row-id="${elementNo}"]`);
        const elName = mainRow?.querySelector('.description')?.textContent?.trim() || `Element ${elementNo}`;
        document.getElementById('prevChipName').textContent = elName;
        document.getElementById('prevHdrSub').textContent = `Element ${elementNo} — ${elName.split(' ').slice(0,3).join(' ')}`;

        // Show with loading state
        p.style.display = 'flex';
        list().innerHTML = '<div class="prev-loading"><i class="fas fa-spinner fa-spin"></i></div>';
        footer().style.display = 'none';

        const currentDate = sessionStorage.getItem('inspectionDate');
        fetch(`${apiBase()}/api/previous-defects?structureId=${encodeURIComponent(structureId)}&elementNo=${encodeURIComponent(elementNo)}`)
            .then(r => r.ok ? r.json() : [])
            .catch(() => [])
            .then(rows => {
                // exclude rows from the current inspection date
                const filtered = currentDate
                    ? rows.filter(r => {
                        const d = r.inspection_date ? r.inspection_date.split('T')[0] : null;
                        return d !== currentDate;
                    })
                    : rows;
                renderDefects(filtered);
            });
    }

    // ── Fill the form from a previous defect ──
    function loadDefectFromPrev(d) {
        // element type + number
        const typeEl = document.getElementById('defectType');
        const numEl  = document.getElementById('defectNumber');
        if (typeEl) {
            typeEl.value = String(d.defect_type);
            typeEl.dispatchEvent(new Event('change', { bubbles: true }));
        }
        // let number dropdown rebuild, then set value
        setTimeout(() => {
            if (numEl) {
                numEl.value = String(d.defect_number);
                numEl.dispatchEvent(new Event('change', { bubbles: true }));
            }
            if (typeof renderCustomSelect === 'function') {
                renderCustomSelect('defectType',   'defectTypeLabel',   'defectTypePanel',   'defectTypeDropdown');
                renderCustomSelect('defectNumber',  'defectNumberLabel', 'defectNumberPanel', 'defectNumberDropdown');
            }
        }, 30);

        // severity, extent, works
        const fields = { severity: String(d.severity || 1), extent: d.extent || 'A', works: d.works_required ? 'Y' : 'N' };
        Object.entries(fields).forEach(([id, val]) => {
            const el = document.getElementById(id);
            if (el) { el.value = val; el.dispatchEvent(new Event('change', { bubbles: true })); }
        });

        // works detail
        const cost     = document.getElementById('cost');
        const priority = document.getElementById('priority');
        const remedial = document.getElementById('remedialWorks');
        const comment  = document.getElementById('comment');
        if (priority) priority.value = d.priority || '';
        if (cost)     cost.value     = d.cost     || '';
        if (remedial) remedial.value = d.remedial_works || '';
        if (comment)  comment.value  = d.comments || '';

        // "From [date]" badge
        const badge = document.getElementById('prevLoadedBadge');
        if (badge) {
            badge.style.display = 'inline-flex';
            badge.querySelector('.prev-badge-date').textContent = 'From ' + fmtDate(d.inspection_date);
        }

        // re-sync steppers + guidance
        setTimeout(() => {
            if (typeof initSteppers          === 'function') initSteppers();
            if (typeof updateDefectGuidancePanel === 'function') updateDefectGuidancePanel();
        }, 60);
    }

    // ── Close the panel ──
    function closePrevPanel() {
        const p = panel(); if (p) p.style.display = 'none';
        const badge = document.getElementById('prevLoadedBadge');
        if (badge) badge.style.display = 'none';
    }

    // ── Wire up after DOM ready ──
    document.addEventListener('DOMContentLoaded', () => {

        // Collapse toggle button
        document.getElementById('prevCollapseBtn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            const p = panel(); if (!p) return;
            _collapsed = !_collapsed;
            p.classList.toggle('prev-collapsed', _collapsed);
            const icon = document.getElementById('prevCollapseIcon');
            if (icon) icon.className = _collapsed ? 'fas fa-chevron-right' : 'fas fa-chevron-left';
            document.getElementById('prevCollapseBtn').title = _collapsed ? 'Expand' : 'Collapse';
        });

        // Click anywhere on the collapsed panel to expand it
        document.getElementById('prevDefectsPanel')?.addEventListener('click', () => {
            if (!_collapsed) return;
            const p = panel(); if (!p) return;
            _collapsed = false;
            p.classList.remove('prev-collapsed');
            const icon = document.getElementById('prevCollapseIcon');
            if (icon) icon.className = 'fas fa-chevron-left';
            const btn = document.getElementById('prevCollapseBtn');
            if (btn) btn.title = 'Collapse';
        });

        // Load more
        document.getElementById('prevLoadMoreBtn')?.addEventListener('click', () => {
            const remaining = _allDefects.slice(INITIAL_COUNT);
            list().innerHTML += remaining.map((d, i) => buildCard(d, INITIAL_COUNT + i)).join('');
            footer().style.display = 'none';
            attachCardListeners();
        });

        // Wrap openModal to trigger panel
        const _origOpen = window.openModal;
        window.openModal = function(isEditMode, preferredState) {
            if (_origOpen) _origOpen.apply(this, arguments);
            const state = preferredState || 'defect';
            if (state === 'defect') {
                // get element number from currentRow
                const elNo = (typeof currentRow !== 'undefined' && currentRow)
                    ? (currentRow.dataset?.rowId || currentRow.querySelector?.('.itemno')?.textContent?.trim())
                    : null;
                if (elNo) openPrevPanel(elNo);
                else closePrevPanel();
            } else {
                closePrevPanel();
            }
        };

        // Wrap closeModal to hide panel
        const _origClose = window.closeModal;
        window.closeModal = function() {
            if (_origClose) _origClose.apply(this, arguments);
            closePrevPanel();
        };
    });
})();
