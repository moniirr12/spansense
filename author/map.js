// ============================================
// spanSense - Author Map
// Loads as an ordinary browsable structure map - click a marker/row to open
// the same structure detail modal core map.html uses (see bcirep.js,
// loaded before this file). "Plan a route" switches it into selection mode
// to multi-select structures and order them into an inspection route.
// Reuses map.js's own condition-band thresholds/colors and marker icon
// language so this reads as the same product's map, not a new one.
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
       MOBILE SIDEBAR TOGGLE - see the button's own comment in
       author/map.html for why this needs to exist at all.
       --------------------------------------------------------- */
    var mobileSidebarToggle = document.getElementById('mobileSidebarToggle');
    var sidebarEl = document.getElementById('sidebar');
    if (mobileSidebarToggle && sidebarEl) {
        mobileSidebarToggle.addEventListener('click', function (e) {
            e.stopPropagation();
            sidebarEl.classList.toggle('expanded');
        });
        // Tapping a nav link or filter closes it back up; tapping anywhere
        // else outside the open sidebar does too.
        document.addEventListener('click', function (e) {
            if (sidebarEl.classList.contains('expanded') && !sidebarEl.contains(e.target) && e.target !== mobileSidebarToggle) {
                sidebarEl.classList.remove('expanded');
            }
        });
        sidebarEl.querySelectorAll('a[href$=".html"]').forEach(function (link) {
            link.addEventListener('click', function () { sidebarEl.classList.remove('expanded'); });
        });
    }

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
    // bcirep.js's updateBridgeModalData() calls bciTier() expecting it to be
    // global (that's how map.js exposes its own copy) - this one is scoped
    // inside this file's IIFE, so it needs an explicit window export.
    window.bciTier = bciTier;

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

    // Browse-mode click opens the same structure detail modal core
    // map.html uses (see #bridgeModal in author/map.html and bcirep.js,
    // loaded before this file) - not just a short popup, so a consultancy
    // user gets the real photo/BCI/quick-info/New Inspection actions.
    function fetchBridgePhoto(bridgeId) {
        fetch(API_BASE + '/getBridgePhoto?bridgeId=' + bridgeId)
            .then(function (r) { if (!r.ok) throw new Error('Network response was not ok'); return r.json(); })
            .then(function (data) {
                var img = document.getElementById('bridgePhoto');
                if (img && data.photo_url) img.src = data.photo_url;
            })
            .catch(function (err) { console.error('Error fetching bridge photo:', err); });
    }
    function openStructureModal(s) {
        sessionStorage.setItem('structureId', s.id);
        sessionStorage.setItem('structureName', s.name);
        sessionStorage.setItem('structureType', s.type);
        var modal = document.getElementById('bridgeModal');
        if (modal) modal.style.display = 'block';
        updateModalTitle(); // bcirep.js - reads sessionStorage, fills in the modal
        fetchBridgePhoto(s.id);
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
        types: new Set(TYPES.map(function (t) { return t.id; })),
        bands: new Set(BANDS.map(function (b) { return b.id; })),
        selected: []
    };
    var today = new Date();

    function passesFilter(s) {
        if (!state.types.has(s.type)) return false;
        if (!state.bands.has(bciTier(s.bci_av).band)) return false;
        return true;
    }

    document.getElementById('autoSelectBtn').addEventListener('click', function () {
        STRUCTURES.filter(passesFilter).filter(function (s) { return s.dueMonths <= 0; }).forEach(function (s) {
            if (state.selected.indexOf(s.id) === -1) state.selected.push(s.id);
        });
        renderAll();
    });

    document.getElementById('exportBtn').addEventListener('click', exportRouteCsv);

    /* ---------------------------------------------------------
       SIDEBAR - View > Type > Condition, same submenu-toggle pattern and
       type/condition checkboxes as core map/map.js's rebuildMarkersFromFilter,
       wired here to this file's own passesFilter/state instead of rebuilding
       Leaflet layers from scratch on every change.
       --------------------------------------------------------- */
    function wireSubmenuToggle(linkId, submenuId) {
        var link = document.getElementById(linkId);
        if (!link) return;
        link.addEventListener('click', function (e) {
            e.preventDefault();
            var submenu = document.getElementById(submenuId);
            if (submenu) submenu.classList.toggle('active');
        });
    }
    wireSubmenuToggle('viewLink', 'viewOptions');
    wireSubmenuToggle('typeLink', 'typeOptions');
    wireSubmenuToggle('conditionLink', 'conditionOptions');

    // core's "Good / Very Good" checkbox covers both of this file's separate
    // 'good'/'excellent' bands (see BANDS above); "uninspected" has no band
    // of its own in bciTier() (a null BCI already reads as 'fair' there -
    // pre-existing behavior, not new here), so it rides along with 'fair'.
    var CONDITION_CHECKBOX_TO_BANDS = { good: ['good', 'excellent'], fair: ['fair'], poor: ['poor'], critical: ['critical'], uninspected: ['fair'] };

    document.querySelectorAll('#typeOptions input[name="structureType"]').forEach(function (cb) {
        cb.addEventListener('change', function () {
            if (cb.checked) state.types.add(cb.value); else state.types.delete(cb.value);
            renderAll();
        });
    });
    document.querySelectorAll('#conditionOptions input[name="conditionFilter"]').forEach(function (cb) {
        cb.addEventListener('change', function () {
            (CONDITION_CHECKBOX_TO_BANDS[cb.value] || []).forEach(function (band) {
                if (cb.checked) state.bands.add(band); else state.bands.delete(band);
            });
            renderAll();
        });
    });

    /* ---------------------------------------------------------
       MAP (Leaflet) - same tile choices as map.js
       --------------------------------------------------------- */
    var map = L.map('routeMap', { zoomControl: false }).setView([54.0, -2.0], 6);
    // 'topright', matching core map/map.html - map.css gives the real
    // Leaflet zoom control a 100px top margin there specifically to clear
    // this app's floating navbar. An earlier version of this page also
    // guessed that exact same 100px/20px offset for a hand-built toolbar
    // div, which put it in the literal same box as this control with zoom
    // rendering on top - every click silently swallowed. Letting the
    // route-toggle/select-tools controls below be genuine Leaflet controls
    // too (not another guessed fixed div) means they stack under this
    // automatically and that class of bug can't happen again.
    L.control.zoom({ position: 'topright' }).addTo(map);
    L.control.scale({ metric: true, imperial: false, position: 'bottomleft' }).addTo(map);

    var openStreetMap = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);
    var satelliteMap = L.tileLayer('https://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', {
        maxZoom: 20, subdomains: ['mt0', 'mt1', 'mt2', 'mt3'], attribution: '&copy; Google Maps'
    });
    // Same CARTO dark basemap as core map/map.js - was missing here simply
    // because this page's layer switcher was never given a third option.
    var darkMap = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
    });
    // The "type of map" selector - core's own native Leaflet layer switcher,
    // not a custom satellite-only button, so it gets map.css's real styling
    // and stacks under zoom for free.
    L.control.layers({ 'Street': openStreetMap, 'Satellite': satelliteMap, 'Dark Mode': darkMap }, null, { position: 'topright' }).addTo(map);

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
            marker.on('click', function () {
                if (routeMode) { toggleSelect(s.id); return; }
                openStructureModal(s);
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
    toolPointer.addEventListener('click', function (e) { e.preventDefault(); setBoxSelectMode(false); });
    toolBox.addEventListener('click', function (e) { e.preventDefault(); setBoxSelectMode(!boxSelectMode); });
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
    var routeBodyEl = document.getElementById('routeBody');
    var autoSelectBtn = document.getElementById('autoSelectBtn');
    var exportBtn = document.getElementById('exportBtn');
    var mapSummaryEl = document.getElementById('mapSummary');
    var mapHintEl = document.getElementById('mapHint');

    // The route-rail panel (author/map.html) is always docked under the
    // layer switcher now - only its body (box-select tools, summary,
    // itinerary) expands/collapses here, so it reads as one div "opening
    // up" rather than a separate toggle plus a disconnected panel.
    function setRouteMode(on) {
        routeMode = on;
        routeModeBtn.classList.toggle('active', on);
        routeModeBtn.setAttribute('data-tip', on ? 'Exit route mode' : 'Plan a route');
        routeBodyEl.style.display = on ? 'flex' : 'none';
        autoSelectBtn.disabled = !on;
        exportBtn.disabled = !on;
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

    function renderAll() { renderPins(); renderRoute(); }

    /* ---------------------------------------------------------
       STRUCTURE DETAIL MODAL - close button + New Inspection, same
       behavior as map.js's fixModalCloseButtons()/addInspection handler.
       --------------------------------------------------------- */
    var bridgeModalEl = document.getElementById('bridgeModal');
    if (bridgeModalEl) {
        var modalCloseBtn = bridgeModalEl.querySelector('.close');
        if (modalCloseBtn) modalCloseBtn.addEventListener('click', function () { bridgeModalEl.style.display = 'none'; });
        bridgeModalEl.addEventListener('click', function (e) { if (e.target === bridgeModalEl) bridgeModalEl.style.display = 'none'; });
    }
    var addInspectionBtn = document.getElementById('addInspection');
    if (addInspectionBtn) {
        addInspectionBtn.addEventListener('click', function () {
            // Same stale-session cleanup as map.js's own handler - without
            // this, leftover defects/photos from whatever inspection was
            // last open get picked up by inspection.js's session restore.
            ['inspectionMode', 'inspectionData', 'inspectionDate', 'inspectionStructureNumber',
             'defects', 'photoData', 'selectedSpan', 'copiedDefectIds'].forEach(function (k) { sessionStorage.removeItem(k); });
            window.location.href = '../inspection1/inspection1.html';
        });
    }

    /* ---------------------------------------------------------
       LOAD DATA
       --------------------------------------------------------- */
    var fuse = null;
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
            fuse = new Fuse(STRUCTURES, { keys: ['name', 'location', 'id'], threshold: 0.3 });
            initMarkers();
            renderAll();
        })
        .catch(function (err) {
            console.error('Author map: failed to load /api/bridges', err);
        });

    /* ---------------------------------------------------------
       NAVBAR SEARCH - same Fuse-powered jump-to-structure dropdown as
       core map/map.js's, using this file's own STRUCTURES/fuse instead of
       core's bridgeData.
       --------------------------------------------------------- */
    var searchInput = document.getElementById('searchInput');
    var searchResults = document.getElementById('searchResults');
    if (searchInput && searchResults) {
        searchInput.addEventListener('input', function () {
            var query = searchInput.value.trim();
            if (!query || !fuse) { searchResults.style.display = 'none'; return; }
            var results = fuse.search(query).slice(0, 5);
            searchResults.innerHTML = results.map(function (r) {
                return '<div data-lat="' + r.item.latitude + '" data-lng="' + r.item.longitude + '">' + r.item.id + ' - ' + r.item.name + '</div>';
            }).join('');
            searchResults.style.display = results.length ? 'block' : 'none';
        });
        searchResults.addEventListener('click', function (e) {
            if (e.target.tagName === 'DIV') {
                var lat = parseFloat(e.target.getAttribute('data-lat'));
                var lng = parseFloat(e.target.getAttribute('data-lng'));
                map.setView([lat, lng], 15);
                searchResults.style.display = 'none';
                searchInput.value = '';
            }
        });
        document.addEventListener('click', function (e) {
            if (!searchResults.contains(e.target) && e.target !== searchInput) searchResults.style.display = 'none';
        });
    }

    /* ---------------------------------------------------------
       CHAT - same widget/logic as core map/map.js's (local keyword FAQ,
       falling through to POST /api/chat for anything it doesn't confidently
       match). Self-contained: no author-specific data dependency.
       --------------------------------------------------------- */
    (function () {
        var chatToggle = document.querySelector('.chat-toggle');
        var chatBox = document.querySelector('.chat-box');
        var chatClose = document.querySelector('.chat-close');

        function openChat() {
            chatBox.classList.add('active');
            chatToggle.style.setProperty('display', 'none', 'important');
        }
        function closeChat() {
            chatBox.classList.remove('active');
            chatToggle.style.removeProperty('display');
        }
        if (chatToggle && chatBox) chatToggle.addEventListener('click', openChat);
        if (chatClose && chatBox) chatClose.addEventListener('click', closeChat);
        if (chatBox && chatToggle) {
            document.addEventListener('click', function (e) {
                if (chatBox.classList.contains('active') && !chatBox.contains(e.target) && !chatToggle.contains(e.target)) closeChat();
            });
            document.addEventListener('keydown', function (e) {
                if (e.key === 'Escape' && chatBox.classList.contains('active')) closeChat();
            });
        }

        var greetingEl = document.getElementById('chatGreeting');
        if (greetingEl) {
            var setGreeting = function (name) { greetingEl.textContent = 'Hello ' + name + ', how can I help you today?'; };
            try {
                var cached = JSON.parse(localStorage.getItem('spansenseUserGreetingCache') || 'null');
                if (cached && cached.displayName) setGreeting(cached.displayName);
            } catch (e) { /* malformed cache - the /api/me fetch below will fix it */ }
            fetch(API_BASE + '/api/me')
                .then(function (res) { return res.ok ? res.json() : null; })
                .then(function (data) {
                    var fullName = data && (data.full_name || data.username);
                    if (fullName) setGreeting(fullName.trim().split(/\s+/)[0]);
                })
                .catch(function (err) { console.error('Chat greeting: failed to load profile', err); });
        }

        var chatInput = document.querySelector('.chat-input input');
        var chatSend = document.querySelector('.chat-send');
        var CHAT_FAQ = [
            { keywords: ['inspection', 'start', 'new inspection', 'run', 'begin'],
              answer: 'To run a new inspection: click a structure marker on the map, then "New Inspection" on its card. Step 1 sets the inspection type (GI/PI/SI), date and inspector; step 2 walks through each element so you can log defects.' },
            { keywords: ['defect', 'severity', 'extent', 'add defect'],
              answer: 'When logging a defect, set Severity (1 Minor to 5 Emergency) and Extent (A isolated to E extensive). A live BCI impact preview shows how your change affects the score before you save, and a Severity Guide explains what separates each level.' },
            { keywords: ['bci avg', 'bci crit', 'vs crit', 'vs avg', 'difference between avg', 'difference between crit', 'difference between bci'],
              answer: "BCI avg is the condition across every inspected element, weighted by importance. BCI crit is narrower: it's based only on a fixed set of critical elements (like main girders or bearings) for that structure type, so a defect on a minor element won't move it." },
            { keywords: ['map', 'search', 'find structure', 'marker'],
              answer: 'Use the search bar at the top of the Map to jump to a structure by name, or the sidebar filters to narrow by type or condition. Click any marker to open its structure card.' },
            { keywords: ['report', 'export', 'pdf', 'proforma', 'download'],
              answer: 'You can generate an inspection PDF or BCI Proforma from the structure card once it has inspections recorded.' },
            { keywords: ['plan', 'schedule', 'gantt', 'due', 'calendar'],
              answer: 'Planning shows every client\'s due/overdue structures alongside your programme, and lets you assign an inspector, date and any traffic-management details for each visit.' },
            { keywords: ['dashboard', 'pending review', 'overview'],
              answer: 'The Dashboard gives a per-client view: structures managed, overdue/due-soon counts, report status, and recent activity across all your clients.' },
            { keywords: ['account', 'password', 'night mode', 'dark mode', 'profile'],
              answer: 'Open Account from any navbar to update your profile or change your password. Night mode can be toggled from the moon icon on any page and your choice is remembered.' },
            { keywords: ['help', 'contact', 'support', 'stuck'],
              answer: "If this doesn't cover it, use Contact Us from any navbar and someone will get back to you." }
        ];
        var CHAT_FALLBACK = "I'm not sure about that yet. Try asking about inspections, BCI scores, the map, planning, reports, or your account.";

        function findChatAnswer(userText) {
            var text = userText.toLowerCase();
            var best = null, bestScore = 0;
            CHAT_FAQ.forEach(function (entry) {
                var score = 0;
                entry.keywords.forEach(function (kw) {
                    var matched = kw.indexOf(' ') > -1
                        ? text.indexOf(kw) > -1
                        : new RegExp('\\b' + kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b').test(text);
                    if (matched) score++;
                });
                if (score > bestScore) { bestScore = score; best = entry; }
            });
            return best ? best.answer : CHAT_FALLBACK;
        }
        function appendChatMessage(role, text) {
            var messageDiv = document.createElement('div');
            messageDiv.classList.add('message', role);
            messageDiv.textContent = text;
            var messagesContainer = document.querySelector('.chat-messages');
            if (!messagesContainer) return messageDiv;
            messagesContainer.appendChild(messageDiv);
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
            return messageDiv;
        }
        function sendChatMessage() {
            if (!chatInput) return;
            var message = chatInput.value.trim();
            if (!message) return;
            appendChatMessage('user', message);
            chatInput.value = '';
            var localAnswer = findChatAnswer(message);
            if (localAnswer !== CHAT_FALLBACK) {
                setTimeout(function () { appendChatMessage('bot', localAnswer); }, 400);
                return;
            }
            var typingEl = appendChatMessage('bot', '…');
            fetch(API_BASE + '/api/chat', {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: message })
            })
                .then(function (r) { return r.json().then(function (data) { return { ok: r.ok, data: data }; }); })
                .then(function (res) { typingEl.textContent = (res.ok && res.data.answer) ? res.data.answer : CHAT_FALLBACK; })
                .catch(function () { typingEl.textContent = CHAT_FALLBACK; });
        }
        if (chatSend && chatInput) {
            chatSend.addEventListener('click', sendChatMessage);
            chatInput.addEventListener('keypress', function (e) { if (e.key === 'Enter') sendChatMessage(); });
        }
    })();
})();
