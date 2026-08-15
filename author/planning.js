// ============================================
// spanSense - Author Planning
// Unscheduled due/overdue structures on the left, the whole programme
// (every scheduled assignment, every client) as one chronological agenda
// on the right, plus simple day-level staff availability. Assign = pick an
// inspector + date + TM details; conflicts (leave or a same-day clash) are
// surfaced as a warning, not a hard block - a planner may deliberately
// double-book a short job.
// ============================================
(function () {
    'use strict';

    var API_BASE = window.location.origin.includes('localhost')
        ? 'http://localhost:3000'
        : window.location.origin;

    /* ---------------------------------------------------------
       NIGHT MODE TOGGLE
       --------------------------------------------------------- */
    var toggleBtn = document.getElementById('nightToggle');
    toggleBtn.innerHTML = document.body.classList.contains('night-mode') ? '<i class="fas fa-sun"></i>' : '<i class="fas fa-moon"></i>';
    toggleBtn.addEventListener('click', function () {
        document.body.classList.toggle('night-mode');
        if (document.body.classList.contains('night-mode')) {
            toggleBtn.innerHTML = '<i class="fas fa-sun"></i>';
            localStorage.setItem('nightMode', 'on');
        } else {
            toggleBtn.innerHTML = '<i class="fas fa-moon"></i>';
            localStorage.setItem('nightMode', 'off');
        }
    });

    function escapeHtml(v) {
        if (v == null) return '';
        return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
    function initials(name) {
        if (!name) return '??';
        var words = name.trim().split(/\s+/);
        return words.length === 1 ? words[0].slice(0, 2).toUpperCase() : (words[0][0] + words[1][0]).toUpperCase();
    }
    function fmtDate(d) {
        return new Date(d).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    }

    /* ---------------------------------------------------------
       DUE-DATE LOGIC - same 2yr/6yr default as map.js/planning.html
       --------------------------------------------------------- */
    function getGiCycleYears(b) { var v = b && b.gi_cycle_years; return (v && v > 0) ? v : 2; }
    function dueMonths(b, today) {
        if (b.next_inspection_override) return Math.round((new Date(b.next_inspection_override) - today) / (1000 * 60 * 60 * 24 * 30.44));
        if (!b.last_inspected) return -999;
        var d = new Date(b.last_inspected);
        d.setFullYear(d.getFullYear() + getGiCycleYears(b));
        return Math.round((d - today) / (1000 * 60 * 60 * 24 * 30.44));
    }

    /* ---------------------------------------------------------
       STATE
       --------------------------------------------------------- */
    var bridges = [], staff = [], leave = [], assignments = [];
    var editingAssignmentId = null;

    function bridgeById(id) { return bridges.filter(function (b) { return b.id === id; })[0]; }
    function staffById(id) { return staff.filter(function (s) { return s.id === id; })[0]; }

    /* ---------------------------------------------------------
       UNSCHEDULED LIST
       --------------------------------------------------------- */
    function renderUnscheduled() {
        var today = new Date();
        var scheduledBridgeIds = {};
        assignments.forEach(function (a) { scheduledBridgeIds[a.bridge_id] = true; });

        var due = bridges
            .filter(function (b) { return b.client_id != null && !scheduledBridgeIds[b.id]; })
            .map(function (b) { return { b: b, due: dueMonths(b, today) }; })
            .filter(function (x) { return x.due <= 3; })
            .sort(function (a, c) { return a.due - c.due; });

        document.getElementById('unschedCount').textContent = due.length;
        var list = document.getElementById('unschedList');
        if (!due.length) {
            list.innerHTML = '<li class="empty-state"><i class="fas fa-circle-check"></i>Nothing unscheduled - every due structure has a date.</li>';
            return;
        }
        list.innerHTML = due.map(function (x) {
            var b = x.b;
            var tagHtml = x.due <= -999
                ? '<span class="ur-due overdue">never inspected</span>'
                : x.due < 0
                    ? '<span class="ur-due overdue">' + Math.abs(x.due) + 'mo overdue</span>'
                    : '<span class="ur-due soon">due ' + (x.due <= 0 ? 'this month' : 'in ' + x.due + 'mo') + '</span>';
            return '<li class="unsched-row" data-bridge-id="' + b.id + '">' +
                '<div class="ur-name">' + escapeHtml(b.name) + '</div>' +
                '<div class="ur-sub">' + escapeHtml(b.client_name || 'Unknown client') + '</div>' +
                tagHtml +
                '</li>';
        }).join('');
        Array.prototype.forEach.call(list.querySelectorAll('.unsched-row'), function (row) {
            row.addEventListener('click', function () { openAssignModal({ bridgeId: Number(row.dataset.bridgeId) }); });
        });
    }

    /* ---------------------------------------------------------
       AGENDA (every assignment, grouped by date)
       --------------------------------------------------------- */
    var LANE_LABEL = { none: null, partial: 'Partial closure', full: 'Full closure' };
    function renderAgenda() {
        document.getElementById('agendaCount').textContent = assignments.length ? assignments.length + ' scheduled' : '';
        var el = document.getElementById('agenda');
        if (!assignments.length) {
            el.innerHTML = '<div class="empty-state"><i class="fas fa-route"></i>Nothing scheduled yet. Pick something from Unscheduled to get started.</div>';
            return;
        }
        var byDate = {};
        var order = [];
        assignments.slice().sort(function (a, b) { return a.scheduled_date.localeCompare(b.scheduled_date); }).forEach(function (a) {
            if (!byDate[a.scheduled_date]) { byDate[a.scheduled_date] = []; order.push(a.scheduled_date); }
            byDate[a.scheduled_date].push(a);
        });
        el.innerHTML = order.map(function (date) {
            var rows = byDate[date].map(function (a) {
                var chips = '';
                if (LANE_LABEL[a.tm_lane_closure]) chips += '<span class="tm-chip ' + a.tm_lane_closure + '">' + LANE_LABEL[a.tm_lane_closure] + '</span>';
                if (a.tm_night_inspection) chips += '<span class="tm-chip night">Night inspection</span>';
                if (a.tm_site_location) chips += '<span class="tm-chip">' + escapeHtml(a.tm_site_location) + '</span>';
                return '<div class="agenda-row" data-assign-id="' + a.id + '">' +
                    '<div class="ar-avatar">' + initials(a.inspector_name || a.inspector_username) + '</div>' +
                    '<div class="ar-main">' +
                    '<div class="ar-title">' + escapeHtml(a.bridge_name) + '</div>' +
                    '<div class="ar-sub">' + escapeHtml(a.client_name || 'Unknown client') + ' &middot; ' + escapeHtml(a.inspector_name || a.inspector_username) + '</div>' +
                    (chips ? '<div class="ar-tm">' + chips + '</div>' : '') +
                    '</div>' +
                    '<div class="ar-actions">' +
                    '<button class="icon-btn edit-assign" data-tip="Edit"><i class="fas fa-pen"></i></button>' +
                    '</div>' +
                    '</div>';
            }).join('');
            return '<div class="agenda-group"><div class="agenda-date">' + fmtDate(date) + '</div>' + rows + '</div>';
        }).join('');
        Array.prototype.forEach.call(el.querySelectorAll('.edit-assign'), function (btn) {
            btn.addEventListener('click', function (e) {
                e.stopPropagation();
                var id = Number(btn.closest('.agenda-row').dataset.assignId);
                var a = assignments.filter(function (x) { return x.id === id; })[0];
                if (a) openAssignModal({ assignment: a });
            });
        });
    }

    /* ---------------------------------------------------------
       STAFF AVAILABILITY
       --------------------------------------------------------- */
    function renderStaff() {
        var list = document.getElementById('staffList');
        if (!staff.length) {
            list.innerHTML = '<li class="empty-state">No inspectors/engineers in this organisation yet.</li>';
            return;
        }
        list.innerHTML = staff.map(function (s) {
            var mine = leave.filter(function (l) { return l.user_id === s.id; });
            var tags = mine.map(function (l) {
                var d = new Date(l.leave_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
                return '<span class="leave-tag">' + d + (l.reason ? ' &middot; ' + escapeHtml(l.reason) : '') +
                    '<button class="remove-leave" data-leave-id="' + l.id + '"><i class="fas fa-xmark"></i></button></span>';
            }).join('');
            return '<li class="staff-row"><div><div class="sr-name">' + escapeHtml(s.full_name || s.username) + '</div>' +
                (tags ? '<div class="sr-leave">' + tags + '</div>' : '<div class="sr-leave">No leave booked</div>') +
                '</div></li>';
        }).join('');
        Array.prototype.forEach.call(list.querySelectorAll('.remove-leave'), function (btn) {
            btn.addEventListener('click', function () {
                fetch(API_BASE + '/api/author/staff-leave/' + btn.dataset.leaveId, { method: 'DELETE' })
                    .then(function () { return loadLeave(); })
                    .then(function () { renderStaff(); });
            });
        });

        var sel = document.getElementById('leaveStaffSelect');
        sel.innerHTML = staff.map(function (s) { return '<option value="' + s.id + '">' + escapeHtml(s.full_name || s.username) + '</option>'; }).join('');
    }

    document.getElementById('addLeaveBtn').addEventListener('click', function () {
        var userId = document.getElementById('leaveStaffSelect').value;
        var date = document.getElementById('leaveDateInput').value;
        if (!userId || !date) return;
        fetch(API_BASE + '/api/author/staff-leave', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: Number(userId), leave_date: date })
        })
            .then(function () { document.getElementById('leaveDateInput').value = ''; return loadLeave(); })
            .then(function () { renderStaff(); });
    });

    /* ---------------------------------------------------------
       ASSIGN MODAL
       --------------------------------------------------------- */
    var modal = document.getElementById('assignModal');
    var conflictBanner = document.getElementById('conflictBanner');

    function openAssignModal(opts) {
        var isEdit = !!opts.assignment;
        editingAssignmentId = isEdit ? opts.assignment.id : null;
        var bridgeId = isEdit ? opts.assignment.bridge_id : opts.bridgeId;
        var b = bridgeById(bridgeId);

        document.getElementById('assignModalTitle').textContent = isEdit ? 'Edit assignment' : 'Schedule inspection';
        document.getElementById('assignModalSub').textContent = (b ? b.name : 'Structure') + (b && b.client_name ? ' · ' + b.client_name : '');
        document.getElementById('deleteAssignBtn').style.display = isEdit ? 'inline-flex' : 'none';

        var inspSel = document.getElementById('fInspector');
        inspSel.innerHTML = staff.map(function (s) { return '<option value="' + s.id + '">' + escapeHtml(s.full_name || s.username) + '</option>'; }).join('');

        if (isEdit) {
            var a = opts.assignment;
            inspSel.value = a.inspector_id;
            document.getElementById('fDate').value = a.scheduled_date.slice(0, 10);
            document.getElementById('fLaneClosure').value = a.tm_lane_closure || 'none';
            document.getElementById('fNight').checked = !!a.tm_night_inspection;
            document.getElementById('fSiteLocation').value = a.tm_site_location || '';
            document.getElementById('fNotes').value = a.notes || '';
        } else {
            document.getElementById('fDate').value = '';
            document.getElementById('fLaneClosure').value = 'none';
            document.getElementById('fNight').checked = false;
            document.getElementById('fSiteLocation').value = '';
            document.getElementById('fNotes').value = '';
        }
        modal.dataset.bridgeId = bridgeId;
        conflictBanner.classList.remove('show');
        checkConflict();
        modal.classList.add('show');
    }
    function closeAssignModal() { modal.classList.remove('show'); editingAssignmentId = null; }
    document.getElementById('assignModalClose').addEventListener('click', closeAssignModal);
    document.getElementById('cancelAssignBtn').addEventListener('click', closeAssignModal);
    modal.addEventListener('click', function (e) { if (e.target === modal) closeAssignModal(); });

    function checkConflict() {
        var inspectorId = document.getElementById('fInspector').value;
        var date = document.getElementById('fDate').value;
        if (!inspectorId || !date) { conflictBanner.classList.remove('show'); return; }
        fetch(API_BASE + '/api/author/assignments/conflicts?inspector_id=' + inspectorId + '&date=' + date)
            .then(function (r) { return r.json(); })
            .then(function (data) {
                var otherClashes = (data.clashes || []).filter(function (c) { return c.id !== editingAssignmentId; });
                var msgs = [];
                if (data.onLeave) msgs.push((staffById(Number(inspectorId)) || {}).full_name + ' is marked as on leave that day' + (data.onLeave.reason ? ' (' + data.onLeave.reason + ')' : '') + '.');
                if (otherClashes.length) msgs.push('Already booked on ' + otherClashes.map(function (c) { return c.bridge_name; }).join(', ') + ' that day.');
                if (msgs.length) { conflictBanner.innerHTML = '<i class="fas fa-triangle-exclamation"></i> ' + msgs.join(' '); conflictBanner.classList.add('show'); }
                else conflictBanner.classList.remove('show');
            })
            .catch(function () { conflictBanner.classList.remove('show'); });
    }
    document.getElementById('fInspector').addEventListener('change', checkConflict);
    document.getElementById('fDate').addEventListener('change', checkConflict);

    document.getElementById('saveAssignBtn').addEventListener('click', function () {
        var date = document.getElementById('fDate').value;
        if (!date) { document.getElementById('fDate').focus(); return; }
        var payload = {
            bridge_id: Number(modal.dataset.bridgeId),
            inspector_id: Number(document.getElementById('fInspector').value),
            scheduled_date: date,
            tm_lane_closure: document.getElementById('fLaneClosure').value,
            tm_night_inspection: document.getElementById('fNight').checked,
            tm_site_location: document.getElementById('fSiteLocation').value.trim(),
            notes: document.getElementById('fNotes').value.trim()
        };
        var url = API_BASE + '/api/author/assignments' + (editingAssignmentId ? '/' + editingAssignmentId : '');
        var method = editingAssignmentId ? 'PATCH' : 'POST';
        fetch(url, { method: method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
            .then(function (r) { if (!r.ok) throw new Error('save failed'); return r.json(); })
            .then(function () { closeAssignModal(); return loadAssignments(); })
            .then(function () { renderAgenda(); renderUnscheduled(); })
            .catch(function (err) { console.error(err); alert('Could not save this assignment.'); });
    });

    document.getElementById('deleteAssignBtn').addEventListener('click', function () {
        if (!editingAssignmentId) return;
        fetch(API_BASE + '/api/author/assignments/' + editingAssignmentId, { method: 'DELETE' })
            .then(function () { closeAssignModal(); return loadAssignments(); })
            .then(function () { renderAgenda(); renderUnscheduled(); });
    });

    /* ---------------------------------------------------------
       LOAD DATA
       --------------------------------------------------------- */
    function loadAssignments() { return fetch(API_BASE + '/api/author/assignments').then(function (r) { return r.json(); }).then(function (d) { assignments = d; }); }
    function loadLeave() { return fetch(API_BASE + '/api/author/staff-leave').then(function (r) { return r.json(); }).then(function (d) { leave = d; }); }

    Promise.all([
        fetch(API_BASE + '/api/bridges').then(function (r) { return r.json(); }),
        fetch(API_BASE + '/api/author/clients').then(function (r) { return r.json(); }),
        fetch(API_BASE + '/api/author/staff').then(function (r) { return r.json(); }),
        loadLeave(),
        loadAssignments()
    ]).then(function (results) {
        var allBridges = results[0], clients = results[1];
        staff = results[2];
        var clientNameById = {};
        clients.forEach(function (c) { clientNameById[c.id] = c.name; });
        bridges = allBridges
            .filter(function (b) { return b.client_id != null; })
            .map(function (b) { b.client_name = clientNameById[b.client_id]; return b; });

        renderUnscheduled();
        renderAgenda();
        renderStaff();
    }).catch(function (err) {
        console.error('Author planning: failed to load data', err);
        document.getElementById('unschedList').innerHTML = '<li class="empty-state">Could not load data.</li>';
        document.getElementById('agenda').innerHTML = '<div class="empty-state">Could not load data.</div>';
    });
})();
