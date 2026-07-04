// ============================================================
// ROW PREVIEW CLOUD
//
// Hovering (or clicking, for touch) an element row in the
// elements table pops up a small floating "cloud" showing that
// element's previous defects — a lighter, more ephemeral cousin
// of the .prev-defects-panel shown inside the edit modal. Same
// /api/previous-defects endpoint prevDefects.js and
// historicalCheck.js already use.
//
// Fetching and showing are deliberately decoupled: the request
// fires the instant the cursor lands on a row, but the cloud only
// reveals itself after DWELL_DELAY. That dwell time is what a
// normal fetch finishes in, so by the time it's shown there's
// no loading flash and no layout jump — and briefly passing over
// rows on the way to one you actually want doesn't paper the
// screen with clouds.
// ============================================================

(function () {
    const DWELL_DELAY = 1500;  // ms the cursor must rest on a row before the cloud shows
    const HIDE_DELAY = 180;    // grace period so moving onto the cloud itself doesn't dismiss it
    const MAX_SHOWN = 3;

    const cache = new Map(); // "structureId:elementNo" -> Promise<defects[]>
    let showTimer = null;
    let hideTimer = null;
    let activeRow = null;
    let pinned = false;
    let requestToken = 0;
    let shownDefects = []; // defects currently rendered in the cloud, indexable for the "use as template" action
    let lastPointer = { x: 0, y: 0 }; // most recent cursor position over the table, used to anchor the cloud

    function apiBase() {
        return window.location.origin.includes('localhost') ? 'http://localhost:3000' : window.location.origin;
    }

    function fmtDate(iso) {
        if (!iso) return '—';
        const d = new Date(iso);
        return isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    }

    function cloudEl() { return document.getElementById('rowPreviewCloud'); }

    function ensureCloud() {
        let el = cloudEl();
        if (el) return el;
        el = document.createElement('div');
        el.id = 'rowPreviewCloud';
        el.className = 'row-preview-cloud';
        el.innerHTML =
            '<div class="rpc-arrow"></div>' +
            '<div class="rpc-head">' +
                '<i class="fas fa-history"></i><span class="rpc-title" id="rpcTitle">Element</span>' +
                '<button type="button" class="rpc-add-btn" id="rpcAddBtn"><i class="fas fa-plus"></i> Add</button>' +
            '</div>' +
            '<div class="rpc-body" id="rpcBody"></div>';
        document.body.appendChild(el);
        el.addEventListener('mouseenter', function () { clearTimeout(hideTimer); });
        el.addEventListener('mouseleave', scheduleHide);

        document.getElementById('rpcAddBtn').addEventListener('click', function () {
            if (activeRow) addDefectFlow(activeRow, null);
        });
        document.getElementById('rpcBody').addEventListener('click', function (e) {
            const card = e.target.closest('.rpc-card');
            if (!card || !activeRow) return;
            const d = shownDefects[parseInt(card.dataset.index, 10)];
            if (d) addDefectFlow(activeRow, d);
        });
        return el;
    }

    // Opens the "Add Defect" form for this element — same shortcut as
    // expanding the row and clicking its own Add Defect button, just
    // reachable straight from the preview. When prevRecord is given (a
    // "use as template" click), pre-fills the form from that past entry
    // via prevDefects.js's own loader instead of leaving it blank.
    function addDefectFlow(row, prevRecord) {
        if (!row.classList.contains('expanded') && typeof window.toggleButtonRow === 'function') {
            window.toggleButtonRow(row);
        }
        const buttonRow = typeof window.findButtonRow === 'function' ? window.findButtonRow(row) : null;
        const addBtn = buttonRow && buttonRow.querySelector('.btn-add-defect');
        if (addBtn) {
            addBtn.click();
            if (prevRecord && typeof window.loadDefectFromPrev === 'function') {
                window.loadDefectFromPrev(prevRecord);
            }
        }
        hideCloud();
    }

    function buildMiniCard(d, i) {
        const defCode = d.defect_type + '.' + d.defect_number;
        const defName = (typeof defectNumberText !== 'undefined' && defectNumberText[d.defect_type] && defectNumberText[d.defect_type][d.defect_number]) || '';
        const display = defName ? (defCode + ' — ' + defName) : defCode;
        const sev = parseInt(d.severity, 10) || 1;
        const sevCls = sev <= 1 ? 'pb-s1' : sev === 2 ? 'pb-s2' : 'pb-s3';
        const works = d.works_required ? 'Y' : 'N';
        const worksCls = works === 'Y' ? 'pb-wy' : works === 'M' ? 'pb-wm' : 'pb-wn';
        const comment = (d.comments || '').trim();
        return '<div class="rpc-card" data-index="' + i + '">' +
            '<div class="rpc-card-top"><span class="rpc-code">' + display + '</span><span class="rpc-date">' + fmtDate(d.inspection_date) + '</span></div>' +
            '<div class="rpc-badges">' +
                '<span class="pb ' + sevCls + '">Sev ' + sev + '</span>' +
                '<span class="pb pb-e">Ext ' + (d.extent || '?') + '</span>' +
                '<span class="pb ' + worksCls + '">Works: ' + works + '</span>' +
            '</div>' +
            (comment ? '<div class="rpc-comment">' + comment.replace(/</g, '&lt;') + '</div>' : '') +
            '<div class="rpc-use-hint"><i class="fas fa-arrow-right"></i> Use as template</div>' +
        '</div>';
    }

    function renderBody(defects) {
        const body = document.getElementById('rpcBody');
        if (!body) return;
        if (!defects.length) {
            shownDefects = [];
            body.innerHTML = '<div class="rpc-empty"><i class="fas fa-inbox"></i><span>No previous defects for this element</span></div>';
            return;
        }
        const shown = defects.slice(0, MAX_SHOWN);
        shownDefects = shown;
        const rest = defects.length - shown.length;
        body.innerHTML = shown.map(buildMiniCard).join('') +
            (rest > 0 ? '<div class="rpc-more">+' + rest + ' more — open the row to see all</div>' : '');
    }

    function positionCloud(el, anchor) {
        // Anchored above/below the cursor position rather than the row's
        // center — rows run nearly the full table width, so "the row" isn't
        // a single point, but where the mouse actually is provides one, and
        // landing the cloud there reads as a direct response to the cursor.
        const cw = el.offsetWidth || 268;
        const ch = el.offsetHeight || 100;
        const gap = 16;
        const topGuard = 96; // clears the fixed navbar (body reserves 90px for it)

        let below = false;
        let top = anchor.y - gap - ch;
        if (top < topGuard) {
            top = anchor.y + gap;
            below = true;
        }
        top = Math.max(topGuard, Math.min(top, window.innerHeight - ch - 12));

        let left = anchor.x - cw / 2;
        left = Math.max(12, Math.min(left, window.innerWidth - cw - 12));

        el.style.left = left + 'px';
        el.style.top = top + 'px';
        el.classList.toggle('rpc-below', below);

        const arrowLeft = Math.max(16, Math.min(anchor.x - left, cw - 16));
        el.style.setProperty('--rpc-arrow-left', arrowLeft + 'px');
    }

    // Returns a cached promise, kicking off the request on first call for a
    // given element. Safe to call many times for the same row — later calls
    // just tap the same in-flight (or already-settled) promise.
    function fetchDefects(structureId, elementNo) {
        const key = structureId + ':' + elementNo;
        if (cache.has(key)) return cache.get(key);
        const currentDate = sessionStorage.getItem('inspectionDate');
        const promise = fetch(apiBase() + '/api/previous-defects?structureId=' + encodeURIComponent(structureId) + '&elementNo=' + encodeURIComponent(elementNo))
            .then(function (res) { return res.ok ? res.json() : []; })
            .catch(function () { return []; })
            .then(function (rows) {
                return currentDate
                    ? rows.filter(function (r) { return (r.inspection_date ? r.inspection_date.split('T')[0] : null) !== currentDate; })
                    : rows;
            });
        cache.set(key, promise);
        return promise;
    }

    // Fires the request without waiting on it — called the moment the
    // cursor lands on a row, well before the dwell timer decides to show
    // anything, so the data has a head start.
    function prefetch(row) {
        const structureId = sessionStorage.getItem('structureId');
        const elementNo = row && row.dataset.rowId;
        if (!structureId || !elementNo) return;
        fetchDefects(structureId, elementNo);
    }

    async function showFor(row) {
        const structureId = sessionStorage.getItem('structureId');
        const elementNo = row.dataset.rowId;
        if (!structureId || !elementNo) return;

        activeRow = row;
        const myToken = ++requestToken;
        const elName = row.querySelector('.description')?.textContent?.trim() || ('Element ' + elementNo);

        const el = ensureCloud();
        const anchor = { x: lastPointer.x, y: lastPointer.y }; // snapshot so a re-measure below doesn't drift if the mouse moved
        document.getElementById('rpcTitle').textContent = elementNo + ' · ' + elName;
        // Almost always already resolved by now — prefetch() kicked this off
        // as soon as the cursor arrived, and the dwell delay has been running
        // ever since. Only shows the spinner on a genuinely slow connection.
        const pending = fetchDefects(structureId, elementNo);
        document.getElementById('rpcBody').innerHTML = '<div class="rpc-loading"><i class="fas fa-spinner fa-spin"></i></div>';
        el.classList.add('rpc-visible');
        positionCloud(el, anchor);

        const defects = await pending;
        if (myToken !== requestToken) return; // user moved on before this resolved
        renderBody(defects);
        positionCloud(el, anchor); // re-measure now that content height changed
    }

    function scheduleShow(row) {
        clearTimeout(hideTimer);
        prefetch(row);
        if (row === activeRow && cloudEl()?.classList.contains('rpc-visible')) return;
        clearTimeout(showTimer);
        showTimer = setTimeout(function () { showFor(row); }, DWELL_DELAY);
    }

    function scheduleHide() {
        if (pinned) return;
        clearTimeout(showTimer);
        clearTimeout(hideTimer);
        hideTimer = setTimeout(hideCloud, HIDE_DELAY);
    }

    function hideCloud() {
        const el = cloudEl();
        if (el) el.classList.remove('rpc-visible');
        activeRow = null;
        pinned = false;
        requestToken++;
    }

    function inElementsTable(node) {
        return !!(node && node.closest && node.closest('#inspectionElementsTable'));
    }

    document.addEventListener('DOMContentLoaded', function () {
        const table = document.getElementById('inspectionElementsTable');
        if (!table) return;

        table.addEventListener('mousemove', function (e) {
            lastPointer = { x: e.clientX, y: e.clientY };
        });

        table.addEventListener('mouseover', function (e) {
            lastPointer = { x: e.clientX, y: e.clientY };
            if (pinned) return; // a clicked-open cloud holds until explicitly dismissed
            const row = e.target.closest('tr.main-row');
            if (row) scheduleShow(row);
        });

        table.addEventListener('mouseout', function (e) {
            const row = e.target.closest('tr.main-row');
            if (!row) return;
            if (e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest('.row-preview-cloud')) return;
            scheduleHide();
        });

        // Click (mainly for touch, where hover doesn't exist) pins the cloud
        // open on the same dwell timer, so it also gets the "load ahead of
        // reveal" benefit instead of popping straight to a spinner. This
        // fires alongside the existing row-expand click handler — it doesn't
        // interfere with it, it just also surfaces history.
        table.addEventListener('click', function (e) {
            const row = e.target.closest('tr.main-row');
            if (!row) return;
            lastPointer = { x: e.clientX, y: e.clientY };
            if (activeRow === row && cloudEl()?.classList.contains('rpc-visible')) {
                pinned = !pinned;
                if (!pinned) scheduleHide();
                return;
            }
            pinned = true;
            prefetch(row);
            clearTimeout(showTimer);
            showTimer = setTimeout(function () { showFor(row); }, DWELL_DELAY);
        });

        document.addEventListener('click', function (e) {
            if (!pinned) return;
            if (inElementsTable(e.target) || (e.target.closest && e.target.closest('.row-preview-cloud'))) return;
            hideCloud();
        });

        window.addEventListener('scroll', function () { if (activeRow) hideCloud(); }, true);
        window.addEventListener('resize', function () {
            const el = cloudEl();
            if (activeRow && el && el.classList.contains('rpc-visible')) positionCloud(el, lastPointer);
        });
    });
})();
