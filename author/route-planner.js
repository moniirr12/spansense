// ============================================
// spanSense - Author - Route Planner
// Loads as an ordinary browsable structure map (click a marker/row for an
// info popup); "Plan a route" switches it into selection mode to multi-
// select structures and order them into an inspection route. Reuses
// map.js's own condition-band thresholds/colors and marker icon language
// so this reads as the same product's map, not a new one.
// API_BASE / formatDate come from ../test.js (loaded before this file).
// ============================================
(function () {
    'use strict';

    /* ---------------------------------------------------------
       NIGHT MODE TOGGLE - same pattern as author.js
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
       TYPE / CONDITION-BAND DEFINITIONS
       Kept identical to map.js (map/map.js) so a structure reads the
       same colour/icon on both pages.
       --------------------------------------------------------- */
    var TYPES = [
        { id: 'bridge', label: 'Bridges' },
        { id: 'footbridge', label: 'Footbridges' },
        { id: 'culvert', label: 'Culverts' },
        { id: 'retaining_wall', label: 'Retaining Wall' },
        { id: 'sign_gantry', label: 'Sign Gantry' }
    ];
    var BANDS = [
        { id: 'excellent', label: 'Very good', color: '#22c55e' },
        { id: 'good', label: 'Good', color: '#84cc16' },
        { id: 'fair', label: 'Fair', color: '#eab308' },
        { id: 'poor', label: 'Poor', color: '#f97316' },
        { id: 'critical', label: 'Very poor', color: '#ef4444' }
    ];
    var BAND_MAP = {}; BANDS.forEach(function (b) { BAND_MAP[b.id] = b; });

    function bciTier(bci) {
        if (bci === null || bci === undefined) return { band: 'fair', label: 'Fair', color: '#9aa8c2' };
        if (bci >= 90) return { band: 'excellent', label: 'Very Good', color: '#22c55e' };
        if (bci >= 80) return { band: 'good', label: 'Good', color: '#84cc16' };
        if (bci >= 65) return { band: 'fair', label: 'Fair', color: '#eab308' };
        if (bci >= 40) return { band: 'poor', label: 'Poor', color: '#f97316' };
        return { band: 'critical', label: 'Very Poor', color: '#ef4444' };
    }

    var typeIcons = {
        bridge: function (sz) { return '<svg viewBox="0 0 20 20" width="' + sz + '" height="' + sz + '" stroke="white" stroke-linecap="round" stroke-linejoin="round" fill="none" stroke-width="1.9"><line x1="2" y1="6" x2="18" y2="6"/><line x1="5" y1="6" x2="5" y2="13"/><line x1="10" y1="6" x2="10" y2="13"/><line x1="15" y1="6" x2="15" y2="13"/><path d="M1 16 Q5 13.5 9 16 T17 16"/></svg>'; },
        footbridge: function (sz) { return '<i class="fas fa-person-walking" style="color:white;font-size:' + sz + 'px;"></i>'; },
        culvert: function (sz) { return '<svg viewBox="0 0 20 20" width="' + sz + '" height="' + sz + '" stroke="white" stroke-linecap="round" fill="none" stroke-width="1.9"><circle cx="10" cy="10" r="7"/><circle cx="10" cy="10" r="3"/><line x1="3" y1="17" x2="17" y2="17"/></svg>'; },
        retaining_wall: function (sz) { return '<svg viewBox="0 0 20 20" width="' + sz + '" height="' + sz + '" stroke="white" stroke-linecap="round" stroke-linejoin="round" fill="none" stroke-width="1.9"><rect x="2" y="5" width="16" height="11" rx="1.5"/><line x1="2" y1="10.5" x2="18" y2="10.5"/><line x1="7" y1="5" x2="7" y2="10.5"/><line x1="13" y1="10.5" x2="13" y2="16"/></svg>'; },
        sign_gantry: function (sz) { return '<i class="fas fa-sign" style="color:white;font-size:' + sz + 'px;"></i>'; }
    };
    var typeFill = {
        bridge: '#2c645c', footbridge: '#4f9088', culvert: '#c79a4b',
        retaining_wall: '#9b4f4f', sign_gantry: '#7a6fb0'
    };
    function typeLabel(id) { var t = TYPES.filter(function (t) { return t.id === id; })[0]; return t ? t.label : id; }

    // Browse-mode click popup - short info card, same fields as map.js's
    // marker popup, shown until route mode takes over marker clicks.
    function popupHtml(s) {
        var tier = bciTier(s.bci_av);
        return '<b>' + s.name + '</b><br>' +
            (s.location ? 'Location: ' + s.location + '<br>' : '') +
            'Type: ' + typeLabel(s.type) + '<br>' +
            'Condition: <span style="color:' + tier.color + ';font-weight:700;">' + tier.label + '</span>' +
            (s.bci_av != null ? ' (' + Math.round(s.bci_av) + ')' : '');
    }

    /* ---------------------------------------------------------
       DUE-DATE LOGIC
       Same 2yr default / override rules as planning.html's
       getGiCycleYears()/getNextInspectionOverride() - simplified here to
       "when's the next inspection due", which is all a route needs.
       --------------------------------------------------------- */
    function getGiCycleYears(b) {
        var v = b && b.gi_cycle_years;
        return (v && v > 0) ? v : 2;
    }
    function nextDueDate(b) {
        if (b.next_inspection_override) return new Date(b.next_inspection_override);
        if (!b.last_inspected) return null;
        var d = new Date(b.last_inspected);
        d.setFullYear(d.getFullYear() + getGiCycleYears(b));
        return d;
    }
    // Months until due (negative = overdue). Never-inspected structures
    // have no due date to compute from - treated as most urgent (-999)
    // since "we don't know, so assume it needs attention" is the safer
    // default for a planning tool.
    function dueMonthsFor(b, today) {
        var d = nextDueDate(b);
        if (!d) return -999;
        return Math.round((d - today) / (1000 * 60 * 60 * 24 * 30.44));
    }
    function dueTag(due) {
        if (due <= -999) return '<span class="sr-due overdue">never inspected</span>';
        if (due < 0) return '<span class="sr-due overdue">' + Math.abs(due) + 'mo overdue</span>';
        if (due <= 3) return '<span class="sr-due soon">due ' + (due <= 0 ? 'this month' : 'in ' + due + 'mo') + '</span>';
        return '';
    }

    /* ---------------------------------------------------------
       DISTANCE - great-circle (haversine), km. No routing engine is
       wired up, so this is straight-line, same caveat shown in the UI.
       --------------------------------------------------------- */
    function haversineKm(a, b) {
        var R = 6371;
        var dLat = (b.latitude - a.latitude) * Math.PI / 180;
        var dLon = (b.longitude - a.longitude) * Math.PI / 180;
        var la1 = a.latitude * Math.PI / 180, la2 = b.latitude * Math.PI / 180;
        var x = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
        return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
    }
    var AVG_SPEED_KMH = 42;
    var MIN_PER_STOP = 9;
    function fmtTime(mins) {
        var h = Math.floor(mins / 60), m = Math.round(mins % 60);
        return h + 'h ' + String(m).padStart(2, '0') + 'm';
    }

    /* ---------------------------------------------------------
       STATE
       --------------------------------------------------------- */
    var STRUCTURES = [], byId = {};
    var routeMode = false;
    var state = {
        search: '',
        types: new Set(TYPES.map(function (t) { return t.id; })),
        bands: new Set(BANDS.map(function (b) { return b.id; })),
        dueSoon: false,
        selected: []
    };
    var today = new Date();

    function passesFilter(s) {
        if (state.search) {
            var q = state.search;
            var hay = (s.name + ' ' + (s.location || '')).toLowerCase();
            if (hay.indexOf(q) === -1) return false;
        }
        if (!state.types.has(s.type)) return false;
        if (!state.bands.has(bciTier(s.bci_av).band)) return false;
        if (state.dueSoon && s.dueMonths > 3) return false;
        return true;
    }

    /* ---------------------------------------------------------
       FILTER CHIPS
       --------------------------------------------------------- */
    var typeChipsEl = document.getElementById('typeChips');
    TYPES.forEach(function (t) {
        var el = document.createElement('div');
        el.className = 'chip on'; el.dataset.type = t.id;
        el.innerHTML = '<span class="sw"></span>' + t.label;
        el.addEventListener('click', function () {
            if (state.types.has(t.id)) { state.types.delete(t.id); el.classList.remove('on'); }
            else { state.types.add(t.id); el.classList.add('on'); }
            renderAll();
        });
        typeChipsEl.appendChild(el);
    });

    var bandChipsEl = document.getElementById('bandChips');
    BANDS.forEach(function (b) {
        var el = document.createElement('div');
        el.className = 'chip on'; el.dataset.band = b.id;
        el.innerHTML = '<span class="sw" style="background:' + b.color + '"></span>' + b.label;
        el.addEventListener('click', function () {
            if (state.bands.has(b.id)) { state.bands.delete(b.id); el.classList.remove('on'); }
            else { state.bands.add(b.id); el.classList.add('on'); }
            renderAll();
        });
        bandChipsEl.appendChild(el);
    });

    var dueToggle = document.getElementById('dueToggle');
    dueToggle.addEventListener('click', function () {
        state.dueSoon = !state.dueSoon;
        dueToggle.classList.toggle('on', state.dueSoon);
        dueToggle.setAttribute('aria-checked', String(state.dueSoon));
        renderAll();
    });
    dueToggle.addEventListener('keydown', function (e) { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); dueToggle.click(); } });

    document.getElementById('searchInput').addEventListener('input', function (e) {
        state.search = e.target.value.trim().toLowerCase();
        renderAll();
    });

    document.getElementById('resetFilters').addEventListener('click', function () {
        state.search = ''; document.getElementById('searchInput').value = '';
        state.types = new Set(TYPES.map(function (t) { return t.id; }));
        state.bands = new Set(BANDS.map(function (b) { return b.id; }));
        state.dueSoon = false;
        dueToggle.classList.remove('on'); dueToggle.setAttribute('aria-checked', 'false');
        typeChipsEl.querySelectorAll('.chip').forEach(function (c) { c.classList.add('on'); });
        bandChipsEl.querySelectorAll('.chip').forEach(function (c) { c.classList.add('on'); });
        renderAll();
    });

    document.getElementById('autoSelectBtn').addEventListener('click', function () {
        STRUCTURES.filter(passesFilter).filter(function (s) { return s.dueMonths <= 0; }).forEach(function (s) {
            if (state.selected.indexOf(s.id) === -1) state.selected.push(s.id);
        });
        renderAll();
    });

    document.getElementById('exportBtn').addEventListener('click', exportRouteCsv);

    /* ---------------------------------------------------------
       STRUCTURE LIST
       --------------------------------------------------------- */
    var listEl = document.getElementById('structList');
    var countEl = document.getElementById('listCount');
    var checkSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>';

    function renderList() {
        var visible = STRUCTURES.filter(passesFilter);
        countEl.textContent = visible.length + ' of ' + STRUCTURES.length + ' structures';
        listEl.innerHTML = '';
        if (!visible.length) {
            listEl.innerHTML = '<div class="empty-list">No structures match these filters.</div>';
            return;
        }
        visible.forEach(function (s) {
            var tier = bciTier(s.bci_av);
            var li = document.createElement('li');
            li.className = 'struct-row' + (routeMode && state.selected.indexOf(s.id) > -1 ? ' selected' : '');
            li.innerHTML =
                '<div class="chk">' + checkSvg + '</div>' +
                '<div class="band-dot" style="background:' + tier.color + '"></div>' +
                '<div class="sr-main"><div class="sr-name">' + s.name + '</div><div class="sr-sub">' + (s.location || typeLabel(s.type)) + ' · ' + typeLabel(s.type) + '</div></div>' +
                dueTag(s.dueMonths);
            li.addEventListener('click', function () {
                if (routeMode) { toggleSelect(s.id); return; }
                map.setView([s.latitude, s.longitude], 15);
                var m = markerById[s.id];
                if (m) m.openPopup();
            });
            listEl.appendChild(li);
        });
    }

    /* ---------------------------------------------------------
       MAP (Leaflet) - same tile choices as map.js
       --------------------------------------------------------- */
    var map = L.map('routeMap', { zoomControl: false }).setView([54.0, -2.0], 6);
    L.control.zoom({ position: 'topright' }).addTo(map);
    L.control.scale({ metric: true, imperial: false, position: 'bottomleft' }).addTo(map);

    var openStreetMap = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);
    var satelliteMap = L.tileLayer('https://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', {
        maxZoom: 20, subdomains: ['mt0', 'mt1', 'mt2', 'mt3'], attribution: '&copy; Google Maps'
    });
    var onSatellite = false;
    document.getElementById('toolSat').addEventListener('click', function (e) {
        onSatellite = !onSatellite;
        if (onSatellite) { map.removeLayer(openStreetMap); satelliteMap.addTo(map); }
        else { map.removeLayer(satelliteMap); openStreetMap.addTo(map); }
        e.currentTarget.classList.toggle('active', onSatellite);
    });

    var markersLayer = L.layerGroup().addTo(map);
    var markerById = {};
    var routeLine = L.polyline([], { color: '#2c5a57', weight: 2.6, dashArray: '1 8', lineCap: 'round' }).addTo(map);

    function pinIcon(s, selIdx) {
        if (selIdx > -1) {
            return L.divIcon({ html: '<div class="rp-pin-num">' + (selIdx + 1) + '</div>', iconSize: [26, 26], iconAnchor: [13, 13], popupAnchor: [0, -13], className: '' });
        }
        var fill = typeFill[s.type] || '#2c645c';
        var ring = bciTier(s.bci_av).color;
        var svgHtml = (typeIcons[s.type] || typeIcons.bridge)(15);
        return L.divIcon({
            html: '<div style="width:32px;height:32px;border-radius:50%;background:' + fill + ';border:2.5px solid ' + ring + ';box-shadow:0 2px 8px rgba(0,0,0,0.22);display:flex;align-items:center;justify-content:center;cursor:pointer;">' + svgHtml + '</div>',
            iconSize: [32, 32], iconAnchor: [16, 16], popupAnchor: [0, -16], className: ''
        });
    }

    function renderPins() {
        Object.keys(markerById).forEach(function (id) {
            var s = byId[id];
            var m = markerById[id];
            // Numbered route badges are route-mode-only - a leftover
            // selection shouldn't make browse mode look mid-route.
            var selIdx = routeMode ? state.selected.indexOf(s.id) : -1;
            m.setIcon(pinIcon(s, selIdx));
            m.setOpacity(passesFilter(s) ? 1 : 0.28);
            m.setZIndexOffset(selIdx > -1 ? 1000 : 0);
        });
    }

    function initMarkers() {
        STRUCTURES.forEach(function (s) {
            var marker = L.marker([s.latitude, s.longitude], { icon: pinIcon(s, -1) });
            marker.bindTooltip(s.name, { direction: 'top', offset: [0, -14] });
            marker.bindPopup(popupHtml(s), { closeButton: false });
            // bindPopup wires its own click-to-open handler - remove it so
            // click behavior can be driven manually by routeMode below.
            marker.off('click');
            marker.on('click', function () {
                if (routeMode) { toggleSelect(s.id); return; }
                marker.openPopup();
            });
            marker.addTo(markersLayer);
            markerById[s.id] = marker;
        });
        if (STRUCTURES.length) {
            var bounds = L.latLngBounds(STRUCTURES.map(function (s) { return [s.latitude, s.longitude]; }));
            map.fitBounds(bounds, { padding: [40, 40] });
        }
    }

    /* ---------- Box-select tool ---------- */
    var boxSelectMode = false;
    var toolPointer = document.getElementById('toolPointer');
    var toolBox = document.getElementById('toolBox');
    toolPointer.addEventListener('click', function () { setBoxSelectMode(false); });
    toolBox.addEventListener('click', function () { setBoxSelectMode(!boxSelectMode); });
    function setBoxSelectMode(on) {
        boxSelectMode = on;
        toolBox.classList.toggle('active', on);
        toolPointer.classList.toggle('active', !on);
        if (on) map.dragging.disable(); else map.dragging.enable();
    }

    var boxStart = null, boxRectEl = null;
    var mapContainer = map.getContainer();
    mapContainer.addEventListener('mousedown', function (e) {
        if (!boxSelectMode) return;
        boxStart = { x: e.clientX, y: e.clientY };
        boxRectEl = document.createElement('div');
        boxRectEl.className = 'box-select-rect';
        document.getElementById('mapStage').appendChild(boxRectEl);
        updateBoxRect(e.clientX, e.clientY);
    });
    window.addEventListener('mousemove', function (e) {
        if (!boxSelectMode || !boxStart) return;
        updateBoxRect(e.clientX, e.clientY);
    });
    window.addEventListener('mouseup', function (e) {
        if (!boxSelectMode || !boxStart) return;
        var rect = boxRectEl.getBoundingClientRect();
        if (boxRectEl.parentNode) boxRectEl.parentNode.removeChild(boxRectEl);
        boxStart = null; boxRectEl = null;
        if (rect.width < 4 && rect.height < 4) return; // treat as a click, not a drag
        STRUCTURES.filter(passesFilter).forEach(function (s) {
            var pt = map.latLngToContainerPoint([s.latitude, s.longitude]);
            var stageRect = document.getElementById('mapStage').getBoundingClientRect();
            var screenX = stageRect.left + pt.x, screenY = stageRect.top + pt.y;
            if (screenX >= rect.left && screenX <= rect.right && screenY >= rect.top && screenY <= rect.bottom) {
                if (state.selected.indexOf(s.id) === -1) state.selected.push(s.id);
            }
        });
        renderAll();
    });
    function updateBoxRect(curX, curY) {
        var stageRect = document.getElementById('mapStage').getBoundingClientRect();
        var x1 = Math.min(boxStart.x, curX), x2 = Math.max(boxStart.x, curX);
        var y1 = Math.min(boxStart.y, curY), y2 = Math.max(boxStart.y, curY);
        boxRectEl.style.left = (x1 - stageRect.left) + 'px';
        boxRectEl.style.top = (y1 - stageRect.top) + 'px';
        boxRectEl.style.width = (x2 - x1) + 'px';
        boxRectEl.style.height = (y2 - y1) + 'px';
    }

    /* ---------------------------------------------------------
       BROWSE / ROUTE MODE TOGGLE
       Page loads as a plain browsable map (click = popup). "Plan a route"
       switches marker/list clicks over to selection and reveals the route-
       building UI; everything selection-related stays hidden until then.
       --------------------------------------------------------- */
    var routeModeBtn = document.getElementById('routeModeBtn');
    var routeRailEl = document.getElementById('routeRail');
    var selectToolsEl = document.getElementById('selectTools');
    var mapSummaryEl = document.getElementById('mapSummary');
    var mapHintEl = document.getElementById('mapHint');

    function setRouteMode(on) {
        routeMode = on;
        routeModeBtn.innerHTML = on
            ? '<i class="fas fa-xmark"></i>&nbsp;Exit route mode'
            : '<i class="fas fa-route"></i>&nbsp;Plan a route';
        routeRailEl.style.display = on ? 'flex' : 'none';
        selectToolsEl.style.display = on ? 'flex' : 'none';
        mapSummaryEl.style.display = on ? 'flex' : 'none';
        mapHintEl.style.display = on ? 'block' : 'none';
        if (!on) setBoxSelectMode(false);
        map.closePopup();
        renderPins();
    }
    routeModeBtn.addEventListener('click', function () { setRouteMode(!routeMode); });
    setRouteMode(false);

    /* ---------------------------------------------------------
       SELECTION + ROUTE
       --------------------------------------------------------- */
    function toggleSelect(id) {
        var idx = state.selected.indexOf(id);
        if (idx > -1) state.selected.splice(idx, 1);
        else state.selected.push(id);
        renderAll();
    }

    var routeListEl = document.getElementById('routeList');
    var optimizeBtn = document.getElementById('optimizeBtn');
    var clearBtn = document.getElementById('clearBtn');
    var dragIndex = null;

    function renderRoute() {
        var n = state.selected.length;
        optimizeBtn.disabled = n < 3;
        clearBtn.disabled = n === 0;

        var totalKm = 0, legs = [];
        for (var i = 1; i < n; i++) {
            var d = haversineKm(byId[state.selected[i - 1]], byId[state.selected[i]]);
            legs.push(d); totalKm += d;
        }
        var totalMin = (totalKm / AVG_SPEED_KMH) * 60 + n * MIN_PER_STOP;

        document.getElementById('rsFigure').innerHTML = totalKm.toFixed(1) + '<small>km total</small>';
        document.getElementById('rsStops').textContent = n;
        document.getElementById('rsTime').textContent = n ? fmtTime(totalMin) : '0h 00m';
        document.getElementById('chipCount').textContent = n;
        document.getElementById('chipDist').textContent = totalKm.toFixed(1);
        document.getElementById('chipTime').textContent = n ? fmtTime(totalMin) : '0h 00m';

        routeLine.setLatLngs(state.selected.map(function (id) { var s = byId[id]; return [s.latitude, s.longitude]; }));

        routeListEl.innerHTML = '';
        if (!n) {
            routeListEl.innerHTML =
                '<div class="route-empty">' +
                '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 20l-5.447-2.724A1 1 0 0 1 3 16.382V5.618a1 1 0 0 1 1.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0 0 21 18.382V7.618a1 1 0 0 0-.553-.894L15 4m0 13V4m0 0L9 7"/></svg>' +
                '<p>Select structures from the list or map to start planning a route.</p></div>';
            return;
        }
        state.selected.forEach(function (id, i) {
            var s = byId[id];
            var li = document.createElement('li');
            li.className = 'route-item';
            li.draggable = true;
            li.dataset.index = i;
            var legText = i === 0 ? 'Start' : legs[i - 1].toFixed(1) + ' km from previous stop';
            li.innerHTML =
                '<span class="ri-handle"><svg viewBox="0 0 24 24" fill="currentColor"><circle cx="8" cy="6" r="1.5"/><circle cx="8" cy="12" r="1.5"/><circle cx="8" cy="18" r="1.5"/><circle cx="16" cy="6" r="1.5"/><circle cx="16" cy="12" r="1.5"/><circle cx="16" cy="18" r="1.5"/></svg></span>' +
                '<span class="ri-num">' + (i + 1) + '</span>' +
                '<span class="ri-main"><div class="ri-name">' + s.name + '</div><div class="ri-leg">' + legText + '</div></span>' +
                '<button class="ri-remove" aria-label="Remove ' + s.name + '"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg></button>';
            li.querySelector('.ri-remove').addEventListener('click', function (ev) { ev.stopPropagation(); toggleSelect(id); });
            addDrag(li);
            routeListEl.appendChild(li);
        });
    }

    function addDrag(li) {
        li.addEventListener('dragstart', function () { dragIndex = Number(li.dataset.index); li.classList.add('dragging'); });
        li.addEventListener('dragend', function () { li.classList.remove('dragging'); });
        li.addEventListener('dragover', function (e) { e.preventDefault(); });
        li.addEventListener('drop', function (e) {
            e.preventDefault();
            var dropIndex = Number(li.dataset.index);
            if (dragIndex === null || dragIndex === dropIndex) return;
            var moved = state.selected.splice(dragIndex, 1)[0];
            state.selected.splice(dropIndex, 0, moved);
            dragIndex = null;
            renderAll();
        });
    }

    optimizeBtn.addEventListener('click', function () {
        if (state.selected.length < 3) return;
        var remaining = state.selected.slice(1);
        var ordered = [state.selected[0]];
        while (remaining.length) {
            var last = byId[ordered[ordered.length - 1]];
            remaining.sort(function (a, b) { return haversineKm(last, byId[a]) - haversineKm(last, byId[b]); });
            ordered.push(remaining.shift());
        }
        state.selected = ordered;
        renderAll();
    });

    clearBtn.addEventListener('click', function () { state.selected = []; renderAll(); });

    function exportRouteCsv() {
        if (!state.selected.length) return;
        var rows = [['Order', 'Name', 'Location', 'Type', 'Latitude', 'Longitude', 'Leg (km)', 'Running total (km)']];
        var running = 0;
        state.selected.forEach(function (id, i) {
            var s = byId[id];
            var leg = i === 0 ? 0 : haversineKm(byId[state.selected[i - 1]], s);
            running += leg;
            rows.push([i + 1, s.name, s.location || '', typeLabel(s.type), s.latitude, s.longitude, leg.toFixed(1), running.toFixed(1)]);
        });
        var csv = rows.map(function (r) {
            return r.map(function (v) { return '"' + String(v).replace(/"/g, '""') + '"'; }).join(',');
        }).join('\n');
        var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'spansense-route-' + new Date().toISOString().slice(0, 10) + '.csv';
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
    }

    function renderAll() { renderList(); renderPins(); renderRoute(); }

    /* ---------------------------------------------------------
       LOAD DATA
       --------------------------------------------------------- */
    fetch(API_BASE + '/api/bridges')
        .then(function (r) { if (!r.ok) throw new Error('Network response was not ok'); return r.json(); })
        .then(function (data) {
            STRUCTURES = data
                .filter(function (b) { return b.latitude != null && b.longitude != null; })
                .map(function (b) {
                    b.type = (b.type || '').toLowerCase().replace(/\s+/g, '_');
                    b.dueMonths = dueMonthsFor(b, today);
                    return b;
                });
            byId = {}; STRUCTURES.forEach(function (s) { byId[s.id] = s; });
            initMarkers();
            renderAll();
        })
        .catch(function (err) {
            countEl.textContent = 'Could not load structures';
            console.error('Route planner: failed to load /api/bridges', err);
        });
})();
