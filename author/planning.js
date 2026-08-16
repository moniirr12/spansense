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
       ACCESS METHOD - defaults from structure type (culverts flag confined
       space, sign gantries flag MEWP/overhead TM) but is a real per-
       structure field (bridges.access_method) a planner can view and
       override from the assign modal - a type-based guess isn't always
       right (e.g. a culvert too shallow to enter, or a bridge that in
       practice needs rope access), and there was previously no way to
       correct it. Saved straight to the bridge (PATCH, not part of the
       assignment) since it's a property of the structure, not the visit.
       --------------------------------------------------------- */
    function normType(t) { return (t || '').toLowerCase().replace(/\s+/g, '_'); }
    var ACCESS_METHOD = {
        standard: { label: 'Standard access', icon: 'fa-person-walking', warn: false },
        confined_space: { label: 'Confined space entry', icon: 'fa-triangle-exclamation', warn: true },
        mewp: { label: 'MEWP / overhead TM', icon: 'fa-truck-ramp-box', warn: true },
        rope_access: { label: 'Rope access', icon: 'fa-person-falling', warn: true },
        water: { label: 'Access over/through water', icon: 'fa-water', warn: true }
    };
    var ACCESS_METHOD_TYPE_DEFAULT = { culvert: 'confined_space', sign_gantry: 'mewp' };
    function accessMethodKeyFor(b) {
        return (b && b.access_method) || ACCESS_METHOD_TYPE_DEFAULT[normType(b && b.type)] || 'standard';
    }
    function accessMethodFor(b) { return ACCESS_METHOD[accessMethodKeyFor(b)] || ACCESS_METHOD.standard; }

    /* ---------------------------------------------------------
       BANK HOLIDAYS - gov.uk's public JSON, fetched once. england-and-wales
       covers the great majority of this app's structures; flagged on the
       agenda and in the assign modal so a planner sees it before double-
       booking someone's public holiday, not after.
       --------------------------------------------------------- */
    var bankHolidays = {}; // 'YYYY-MM-DD' -> title
    function loadBankHolidays() {
        return fetch('https://www.gov.uk/bank-holidays.json', { credentials: 'omit' })
            .then(function (r) { if (!r.ok) throw new Error('bank holidays request failed'); return r.json(); })
            .then(function (data) {
                var events = (data['england-and-wales'] && data['england-and-wales'].events) || [];
                events.forEach(function (e) { bankHolidays[e.date] = e.title; });
                renderHolidayStrip();
            })
            .catch(function () { /* flags just won't show - not worth blocking the page over */ });
    }
    // Always-visible, independent of anything being scheduled - the only
    // place bank holidays show without opening a specific assignment.
    function renderHolidayStrip() {
        var todayStr = new Date().toISOString().slice(0, 10);
        var upcoming = Object.keys(bankHolidays).filter(function (d) { return d >= todayStr; }).sort().slice(0, 6);
        var panel = document.getElementById('holidayPanel');
        if (!upcoming.length) { panel.style.display = 'none'; return; }
        document.getElementById('holidayStrip').innerHTML = upcoming.map(function (d) {
            var dLabel = new Date(d).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
            return '<div class="holiday-chip"><span class="hc-date">' + dLabel + '</span><span class="hc-title">' + escapeHtml(bankHolidays[d]) + '</span></div>';
        }).join('');
        panel.style.display = 'block';
    }

    /* ---------------------------------------------------------
       WEATHER (Beta) - Open-Meteo forecast, no key. Only fetched for
       assignments inside its ~16-day forecast horizon; cached per
       structure+date so re-rendering the agenda doesn't re-fetch. Wind/
       rain are what actually affect inspection safety (rope access, MEWP,
       working over water), so those are what's surfaced, not a generic
       "sunny/cloudy" summary.
       --------------------------------------------------------- */
    var WEATHER_HORIZON_DAYS = 15;
    var WEATHER_CODE = {
        0: { icon: 'fa-sun', label: 'Clear' }, 1: { icon: 'fa-cloud-sun', label: 'Mostly clear' },
        2: { icon: 'fa-cloud-sun', label: 'Partly cloudy' }, 3: { icon: 'fa-cloud', label: 'Overcast' },
        45: { icon: 'fa-smog', label: 'Fog' }, 48: { icon: 'fa-smog', label: 'Fog' },
        51: { icon: 'fa-cloud-rain', label: 'Light drizzle' }, 53: { icon: 'fa-cloud-rain', label: 'Drizzle' }, 55: { icon: 'fa-cloud-rain', label: 'Heavy drizzle' },
        61: { icon: 'fa-cloud-rain', label: 'Light rain' }, 63: { icon: 'fa-cloud-rain', label: 'Rain' }, 65: { icon: 'fa-cloud-showers-heavy', label: 'Heavy rain' },
        71: { icon: 'fa-snowflake', label: 'Light snow' }, 73: { icon: 'fa-snowflake', label: 'Snow' }, 75: { icon: 'fa-snowflake', label: 'Heavy snow' },
        80: { icon: 'fa-cloud-showers-heavy', label: 'Showers' }, 81: { icon: 'fa-cloud-showers-heavy', label: 'Showers' }, 82: { icon: 'fa-cloud-showers-heavy', label: 'Violent showers' },
        95: { icon: 'fa-cloud-bolt', label: 'Thunderstorm' }, 96: { icon: 'fa-cloud-bolt', label: 'Thunderstorm' }, 99: { icon: 'fa-cloud-bolt', label: 'Thunderstorm' }
    };
    var weatherCache = {}; // "lat,lon,date" -> Promise<{code,windKmh,precipMm}|null>
    function withinForecastWindow(dateStr) {
        var days = Math.round((new Date(dateStr) - new Date(new Date().toDateString())) / 86400000);
        return days >= 0 && days <= WEATHER_HORIZON_DAYS;
    }
    function fetchWeather(lat, lon, dateStr) {
        var key = lat + ',' + lon + ',' + dateStr;
        if (!weatherCache[key]) {
            var url = 'https://api.open-meteo.com/v1/forecast?latitude=' + lat + '&longitude=' + lon +
                '&daily=weathercode,windspeed_10m_max,precipitation_sum&timezone=auto&start_date=' + dateStr + '&end_date=' + dateStr;
            weatherCache[key] = fetch(url, { credentials: 'omit' })
                .then(function (r) { if (!r.ok) throw new Error('weather request failed'); return r.json(); })
                .then(function (data) {
                    if (!data.daily || !data.daily.time || !data.daily.time.length) return null;
                    return { code: data.daily.weathercode[0], windKmh: data.daily.windspeed_10m_max[0], precipMm: data.daily.precipitation_sum[0] };
                })
                .catch(function () { return null; });
        }
        return weatherCache[key];
    }
    function weatherChipHtml(w) {
        if (!w) return '';
        var wc = WEATHER_CODE[w.code] || { icon: 'fa-cloud', label: 'Forecast' };
        var sev = (w.windKmh >= 50 || w.precipMm >= 6) ? 'full' : (w.windKmh >= 35 || w.precipMm >= 2) ? 'partial' : '';
        return '<span class="tm-chip weather ' + sev + '" data-tip="' + escapeHtml(wc.label) + ' &middot; ' + Math.round(w.windKmh) + 'km/h wind &middot; ' + w.precipMm.toFixed(1) + 'mm rain">' +
            '<i class="fas ' + wc.icon + '"></i>' + Math.round(w.windKmh) + 'km/h wind<span class="beta-dot">&beta;</span></span>';
    }

    /* ---------------------------------------------------------
       FLOOD WARNINGS (Beta) - Environment Agency's real-time flood-
       monitoring API, no key. This is current-conditions data (not a
       forecast for the assignment date), so it's framed as a "worth
       checking closer to the day" nearby watch rather than a prediction -
       still useful for chronically flood-prone river/culvert sites.
       --------------------------------------------------------- */
    var floodCache = {}; // "lat,lon" -> Promise<count>
    function fetchFloodCount(lat, lon) {
        var key = lat + ',' + lon;
        if (!floodCache[key]) {
            var url = 'https://environment.data.gov.uk/flood-monitoring/id/floods?lat=' + lat + '&long=' + lon + '&dist=10';
            floodCache[key] = fetch(url, { credentials: 'omit' })
                .then(function (r) { if (!r.ok) throw new Error('flood request failed'); return r.json(); })
                .then(function (data) { return (data.items || []).length; })
                .catch(function () { return 0; });
        }
        return floodCache[key];
    }
    function floodChipHtml(count) {
        if (!count) return '';
        return '<span class="tm-chip full" data-tip="Environment Agency flood warning/alert active within 10km right now">' +
            '<i class="fas fa-water"></i>Flood watch nearby<span class="beta-dot">&beta;</span></span>';
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
            var am = accessMethodFor(b);
            var accessHtml = '<span class="ur-access' + (am.warn ? ' warn' : '') + '"><i class="fas ' + am.icon + '"></i>' + am.label + '</span>';
            return '<li class="unsched-row" data-bridge-id="' + b.id + '">' +
                '<div class="ur-name">' + escapeHtml(b.name) + '</div>' +
                '<div class="ur-sub">' + escapeHtml(b.client_name || 'Unknown client') + '</div>' +
                tagHtml + accessHtml +
                '<span class="ur-live" id="ur-live-' + b.id + '"></span>' +
                '</li>';
        }).join('');
        Array.prototype.forEach.call(list.querySelectorAll('.unsched-row'), function (row) {
            row.addEventListener('click', function () { openAssignModal({ bridgeId: Number(row.dataset.bridgeId) }); });
        });

        // Flood watch is real-time (not date-bound), so unlike weather it
        // can show here even before anything's scheduled - cached by
        // structure, same lookup the agenda uses.
        due.forEach(function (x) {
            var b = x.b;
            if (b.latitude == null || b.longitude == null) return;
            fetchFloodCount(b.latitude, b.longitude).then(function (count) {
                var el = document.getElementById('ur-live-' + b.id);
                if (el && count) el.innerHTML = '<span class="ur-access warn"><i class="fas fa-water"></i>Flood watch nearby<span class="beta-dot">&beta;</span></span>';
            });
        });
    }

    /* ---------------------------------------------------------
       AGENDA (every assignment, grouped by date)
       --------------------------------------------------------- */
    var LANE_LABEL = { none: null, partial: 'Partial closure', full: 'Full closure' };
    function renderAgenda() {
        document.getElementById('agendaCount').textContent = assignments.length ? assignments.length + ' scheduled' : '';
        renderCalendar();
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
            var holidayTitle = bankHolidays[date];
            var rows = byDate[date].map(function (a) {
                var b = bridgeById(a.bridge_id);
                var am = accessMethodFor(b);
                var chips = '<span class="tm-chip' + (am.warn ? ' partial' : '') + '"><i class="fas ' + am.icon + '"></i>' + am.label + '</span>';
                if (LANE_LABEL[a.tm_lane_closure]) chips += '<span class="tm-chip ' + a.tm_lane_closure + '">' + LANE_LABEL[a.tm_lane_closure] + '</span>';
                if (a.tm_night_inspection) chips += '<span class="tm-chip night">Night inspection</span>';
                if (holidayTitle) chips += '<span class="tm-chip partial" data-tip="' + escapeHtml(holidayTitle) + '"><i class="fas fa-calendar-day"></i>Bank holiday</span>';
                if (a.tm_site_location) chips += '<span class="tm-chip">' + escapeHtml(a.tm_site_location) + '</span>';
                return '<div class="agenda-row" data-assign-id="' + a.id + '">' +
                    '<div class="ar-avatar">' + initials(a.inspector_name || a.inspector_username) + '</div>' +
                    '<div class="ar-main">' +
                    '<div class="ar-title">' + escapeHtml(a.bridge_name) + '</div>' +
                    '<div class="ar-sub">' + escapeHtml(a.client_name || 'Unknown client') + ' &middot; ' + escapeHtml(a.inspector_name || a.inspector_username) + '</div>' +
                    '<div class="ar-tm">' + chips + '<span class="ar-live" id="ar-live-' + a.id + '"></span></div>' +
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

        // Weather + flood are fetched after the sync render, only for
        // assignments inside the forecast window, and injected into each
        // row's own placeholder once resolved - never blocks the agenda
        // from showing everything else immediately.
        assignments.forEach(function (a) {
            if (!withinForecastWindow(a.scheduled_date)) return;
            var b = bridgeById(a.bridge_id);
            if (!b || b.latitude == null || b.longitude == null) return;
            var liveEl = document.getElementById('ar-live-' + a.id);
            if (!liveEl) return;
            fetchWeather(b.latitude, b.longitude, a.scheduled_date.slice(0, 10)).then(function (w) {
                var el2 = document.getElementById('ar-live-' + a.id);
                if (el2) el2.insertAdjacentHTML('beforeend', weatherChipHtml(w));
            });
            fetchFloodCount(b.latitude, b.longitude).then(function (count) {
                var el2 = document.getElementById('ar-live-' + a.id);
                if (el2) el2.insertAdjacentHTML('beforeend', floodChipHtml(count));
            });
        });
    }

    /* ---------------------------------------------------------
       CALENDAR VIEW - same Programme data as the agenda, laid out as a
       month grid instead of a chronological list. Bank holidays get their
       own marker; each day's assignments show as small pills (clicking one
       opens the same edit modal as the list view's pencil icon). Kept in
       sync with the agenda for free - renderAgenda() calls this every time
       it re-renders, regardless of which view is currently showing, since
       it's all local data (no extra network calls) and cheap to keep
       current so switching views never shows stale data.
       --------------------------------------------------------- */
    var currentView = 'list';
    var calendarDate = new Date(); calendarDate.setDate(1);
    var WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

    function setView(view) {
        currentView = view;
        document.getElementById('agenda').style.display = view === 'list' ? 'block' : 'none';
        document.getElementById('calendarView').style.display = view === 'calendar' ? 'block' : 'none';
        document.getElementById('viewListBtn').classList.toggle('active', view === 'list');
        document.getElementById('viewCalendarBtn').classList.toggle('active', view === 'calendar');
    }
    document.getElementById('viewListBtn').addEventListener('click', function () { setView('list'); });
    document.getElementById('viewCalendarBtn').addEventListener('click', function () { setView('calendar'); });
    document.getElementById('calPrev').addEventListener('click', function () { calendarDate.setMonth(calendarDate.getMonth() - 1); renderCalendar(); });
    document.getElementById('calNext').addEventListener('click', function () { calendarDate.setMonth(calendarDate.getMonth() + 1); renderCalendar(); });
    document.getElementById('calToday').addEventListener('click', function () { calendarDate = new Date(); calendarDate.setDate(1); renderCalendar(); });

    function isoDate(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }

    function renderCalendar() {
        var year = calendarDate.getFullYear(), month = calendarDate.getMonth();
        document.getElementById('calMonthLabel').textContent = calendarDate.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

        var byDate = {};
        assignments.forEach(function (a) {
            var d = a.scheduled_date.slice(0, 10);
            (byDate[d] = byDate[d] || []).push(a);
        });

        var firstOfMonth = new Date(year, month, 1);
        var startOffset = (firstOfMonth.getDay() + 6) % 7; // Monday-start grid
        var gridStart = new Date(year, month, 1 - startOffset);
        var todayStr = isoDate(new Date());

        var html = WEEKDAY_LABELS.map(function (d) { return '<div class="cal-dow">' + d + '</div>'; }).join('');
        for (var i = 0; i < 42; i++) {
            var cellDate = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i);
            var dStr = isoDate(cellDate);
            var inMonth = cellDate.getMonth() === month;
            var dayAssignments = byDate[dStr] || [];
            var holidayTitle = bankHolidays[dStr];
            var pills = dayAssignments.slice(0, 3).map(function (a) {
                return '<div class="cal-pill" data-assign-id="' + a.id + '" data-tip="' + escapeHtml(a.bridge_name) + ' &middot; ' + escapeHtml(a.inspector_name || a.inspector_username) + '">' + escapeHtml(a.bridge_name) + '</div>';
            }).join('');
            var more = dayAssignments.length > 3 ? '<div class="cal-more">+' + (dayAssignments.length - 3) + ' more</div>' : '';
            html += '<div class="cal-cell' + (inMonth ? '' : ' other-month') + (dStr === todayStr ? ' today' : '') + '">' +
                '<div class="cal-cell-head"><span class="cal-day-num">' + cellDate.getDate() + '</span>' +
                (holidayTitle ? '<span class="cal-holiday" data-tip="' + escapeHtml(holidayTitle) + '"><i class="fas fa-calendar-day"></i></span>' : '') +
                '</div>' + pills + more + '</div>';
        }
        var grid = document.getElementById('calGrid');
        grid.innerHTML = html;
        Array.prototype.forEach.call(grid.querySelectorAll('.cal-pill'), function (pill) {
            pill.addEventListener('click', function () {
                var id = Number(pill.dataset.assignId);
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

        var accessSel = document.getElementById('fAccessMethod');
        var typeDefault = ACCESS_METHOD[ACCESS_METHOD_TYPE_DEFAULT[normType(b && b.type)] || 'standard'];
        accessSel.options[0].textContent = 'Auto (' + typeDefault.label + ')';
        accessSel.value = (b && b.access_method) || '';

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
        refreshAdvisories();
        modal.classList.add('show');
    }
    function closeAssignModal() { modal.classList.remove('show'); editingAssignmentId = null; }
    document.getElementById('assignModalClose').addEventListener('click', closeAssignModal);
    document.getElementById('cancelAssignBtn').addEventListener('click', closeAssignModal);
    modal.addEventListener('click', function (e) { if (e.target === modal) closeAssignModal(); });

    // Everything worth flagging before a planner commits to a date: an
    // inspector clash/leave (from the server), a bank holiday, and -
    // async, appended once resolved rather than delaying the sync checks -
    // the weather forecast and any nearby flood watch for that structure.
    // advisoryToken drops a stale async response if the date/inspector
    // changes again before it comes back.
    var advisoryToken = 0;
    function refreshAdvisories() {
        var inspectorId = document.getElementById('fInspector').value;
        var date = document.getElementById('fDate').value;
        var token = ++advisoryToken;
        var msgs = [];

        if (date && bankHolidays[date]) msgs.push(bankHolidays[date] + ' is a bank holiday.');

        function paint() {
            if (token !== advisoryToken) return;
            if (msgs.length) { conflictBanner.innerHTML = '<i class="fas fa-triangle-exclamation"></i> ' + msgs.join(' '); conflictBanner.classList.add('show'); }
            else conflictBanner.classList.remove('show');
        }

        if (!inspectorId || !date) { paint(); return; }
        fetch(API_BASE + '/api/author/assignments/conflicts?inspector_id=' + inspectorId + '&date=' + date)
            .then(function (r) { return r.json(); })
            .then(function (data) {
                if (token !== advisoryToken) return;
                var otherClashes = (data.clashes || []).filter(function (c) { return c.id !== editingAssignmentId; });
                if (data.onLeave) msgs.push((staffById(Number(inspectorId)) || {}).full_name + ' is marked as on leave that day' + (data.onLeave.reason ? ' (' + data.onLeave.reason + ')' : '') + '.');
                if (otherClashes.length) msgs.push('Already booked on ' + otherClashes.map(function (c) { return c.bridge_name; }).join(', ') + ' that day.');
                paint();
            })
            .catch(function () { paint(); });

        var b = bridgeById(Number(modal.dataset.bridgeId));
        if (b && b.latitude != null && b.longitude != null) {
            if (withinForecastWindow(date)) {
                fetchWeather(b.latitude, b.longitude, date).then(function (w) {
                    if (token !== advisoryToken || !w) return;
                    var wc = WEATHER_CODE[w.code] || { label: 'Forecast' };
                    if (w.windKmh >= 35 || w.precipMm >= 2) {
                        msgs.push('Forecast: ' + wc.label.toLowerCase() + ', ' + Math.round(w.windKmh) + 'km/h wind, ' + w.precipMm.toFixed(1) + 'mm rain.');
                        paint();
                    }
                });
            }
            fetchFloodCount(b.latitude, b.longitude).then(function (count) {
                if (token !== advisoryToken || !count) return;
                msgs.push('Environment Agency flood warning active within 10km of this structure right now.');
                paint();
            });
        }
    }
    document.getElementById('fInspector').addEventListener('change', refreshAdvisories);
    document.getElementById('fDate').addEventListener('change', refreshAdvisories);

    // Access method belongs to the structure, not this visit, so it saves
    // straight to the bridge as soon as it's changed rather than waiting
    // on Save/Cancel of the assignment - and everywhere else showing it
    // (Unscheduled, the agenda) is refreshed immediately to match.
    document.getElementById('fAccessMethod').addEventListener('change', function () {
        var bridgeId = Number(modal.dataset.bridgeId);
        var value = this.value;
        fetch(API_BASE + '/api/bridges/' + bridgeId + '/access-method', {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ accessMethod: value || null })
        })
            .then(function (r) { if (!r.ok) throw new Error('save failed'); })
            .then(function () {
                var b = bridgeById(bridgeId);
                if (b) b.access_method = value || null;
                renderUnscheduled();
                renderAgenda();
            })
            .catch(function (err) { console.error(err); alert('Could not save access method.'); });
    });

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
        loadAssignments(),
        loadBankHolidays()
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
