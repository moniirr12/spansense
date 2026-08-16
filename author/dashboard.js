// ============================================
// spanSense - Author Dashboard
// Per-client rollup (structures, overdue/due-soon, report status) and a
// recent-activity feed, from GET /api/author/dashboard.
// ============================================
(function () {
    'use strict';

    var API_BASE = window.location.origin.includes('localhost')
        ? 'http://localhost:3000'
        : window.location.origin;

    /* ---------------------------------------------------------
       NIGHT MODE TOGGLE - same pattern as author/map.js
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

    /* ---------------------------------------------------------
       ADD STRUCTURE - same "go there, come back" trip as author/map.js's
       own addStructureBtn, reusing addStructure.html rather than
       rebuilding it here. authorAddStructure tells that form to show its
       Client picker.
       --------------------------------------------------------- */
    document.getElementById('navAddStructureBtn').addEventListener('click', function (e) {
        e.preventDefault();
        sessionStorage.setItem('addStructureReturnTo', window.location.href);
        sessionStorage.setItem('authorAddStructure', '1');
        window.location.href = 'addStructure.html';
    });

    function escapeHtml(v) {
        if (v == null) return '';
        return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function renderStats(clients) {
        var totalStructures = 0, totalOverdue = 0, totalSoon = 0;
        clients.forEach(function (c) {
            totalStructures += c.structureCount;
            totalOverdue += c.overdueCount;
            totalSoon += c.dueSoonCount;
        });
        document.getElementById('statClients').textContent = clients.length;
        document.getElementById('statStructures').textContent = totalStructures;
        document.getElementById('statOverdue').textContent = totalOverdue;
        document.getElementById('statSoon').textContent = totalSoon;
    }

    function renderClients(clients) {
        var grid = document.getElementById('clientGrid');
        document.getElementById('clientCount').textContent = clients.length + (clients.length === 1 ? ' client' : ' clients');

        if (!clients.length) {
            grid.innerHTML = '<div class="panel empty-state" style="grid-column:1/-1;"><i class="fas fa-users"></i>No clients yet. Client management is coming to Author soon.</div>';
            return;
        }

        grid.innerHTML = clients.map(function (c) {
            var badges = '';
            if (c.overdueCount > 0) badges += '<span class="badge overdue">' + c.overdueCount + ' overdue</span>';
            if (c.dueSoonCount > 0) badges += '<span class="badge soon">' + c.dueSoonCount + ' due soon</span>';
            if (c.overdueCount === 0 && c.dueSoonCount === 0 && c.structureCount > 0) badges += '<span class="badge ok">On schedule</span>';

            var r = c.reports;
            var total = r.submitted + r.approved + r.rejected;
            var reportsBar = '';
            if (total > 0) {
                reportsBar =
                    '<div class="cc-reports">' +
                    (r.submitted ? '<span class="submitted" style="flex:' + r.submitted + '"></span>' : '') +
                    (r.approved ? '<span class="approved" style="flex:' + r.approved + '"></span>' : '') +
                    (r.rejected ? '<span class="rejected" style="flex:' + r.rejected + '"></span>' : '') +
                    '</div>' +
                    '<div class="cc-legend">' +
                    '<span><span class="dot submitted"></span>' + r.submitted + ' awaiting review</span>' +
                    '<span><span class="dot approved"></span>' + r.approved + ' approved</span>' +
                    (r.rejected ? '<span><span class="dot rejected"></span>' + r.rejected + ' rejected</span>' : '') +
                    '</div>';
            } else {
                reportsBar = '<div class="cc-legend">No inspections recorded yet</div>';
            }

            return '<div class="panel client-card">' +
                '<div class="cc-head"><div class="cc-name">' + escapeHtml(c.name) + '</div><div class="cc-count">' + c.structureCount + ' structure' + (c.structureCount === 1 ? '' : 's') + '</div></div>' +
                '<div class="cc-badges">' + (badges || '<span class="badge ok">No structures yet</span>') + '</div>' +
                reportsBar +
                '</div>';
        }).join('');
    }

    var STATUS_ICON = { submitted: 'fa-hourglass-half', approved: 'fa-circle-check', rejected: 'fa-circle-exclamation' };
    function renderActivity(activity) {
        var list = document.getElementById('activityList');
        if (!activity.length) {
            list.innerHTML = '<li class="empty-state"><i class="fas fa-clock-rotate-left"></i>No inspection activity yet across your clients.</li>';
            return;
        }
        list.innerHTML = activity.map(function (a) {
            var status = (a.status || 'submitted').toLowerCase();
            var icon = STATUS_ICON[status] || 'fa-file-alt';
            var dateStr = a.inspection_date ? new Date(a.inspection_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Undated';
            return '<li class="activity-row">' +
                '<div class="ar-icon"><i class="fas ' + icon + '"></i></div>' +
                '<div class="ar-main">' +
                '<div class="ar-title">' + escapeHtml(a.structure_name || 'Structure #' + a.structure_id) + ' &middot; ' + escapeHtml(a.inspection_type || 'Inspection') + '</div>' +
                '<div class="ar-sub">' + escapeHtml(a.client_name) + ' &middot; ' + dateStr + (a.inspector_name ? ' &middot; ' + escapeHtml(a.inspector_name) : '') + '</div>' +
                '</div>' +
                '<span class="ar-status ' + status + '">' + status + '</span>' +
                '</li>';
        }).join('');
    }

    fetch(API_BASE + '/api/author/dashboard')
        .then(function (r) { if (!r.ok) throw new Error('Network response was not ok'); return r.json(); })
        .then(function (data) {
            renderStats(data.clients);
            renderClients(data.clients);
            renderActivity(data.activity);
        })
        .catch(function (err) {
            console.error('Author dashboard: failed to load /api/author/dashboard', err);
            document.getElementById('clientGrid').innerHTML = '<div class="panel empty-state" style="grid-column:1/-1;">Could not load dashboard data.</div>';
            document.getElementById('activityList').innerHTML = '<li class="empty-state">Could not load activity.</li>';
        });
})();
