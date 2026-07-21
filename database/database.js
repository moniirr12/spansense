/* ============================================
   SPANSENSE - DATABASE EXPORT PAGE SCRIPTS
   ============================================ */

(function(){
    const sb=document.getElementById('glassScrollbar'), th=document.getElementById('glassThumb');
    if(!sb||!th){console.warn('[Scrollbar] elements not found');return;}
    let drag=false, sy=0, sty=0;
    function m(){const st=window.scrollY||0,th=document.documentElement.scrollHeight,vh=window.innerHeight,dh=Math.max(1,th-vh),tr=sb.offsetHeight||1,r=vh/Math.max(1,th),h=Math.max(40,r*tr),mx=Math.max(0,tr-h);return{st,p:st/dh,tr,h,mx,dh}}
    function u(){const x=m();th.style.setProperty('height',x.h+'px','important');th.style.setProperty('top',(x.p*x.mx)+'px','important')}
    window.addEventListener('scroll',u,{passive:true});window.addEventListener('resize',u);
    th.addEventListener('mousedown',e=>{drag=true;sy=e.clientY;sty=m().p*m().mx;e.preventDefault()});
    sb.addEventListener('mousedown',e=>{if(e.target===th||th.contains(e.target))return;const r=sb.getBoundingClientRect(),y=e.clientY-r.top,x=m();window.scrollTo({top:Math.max(0,Math.min(1,y/x.tr))*x.dh,behavior:'smooth'})});
    window.addEventListener('mousemove',e=>{if(!drag)return;const x=m(),ny=sty+(e.clientY-sy),c=Math.max(0,Math.min(x.mx,ny));window.scrollTo(0,(c/Math.max(1,x.mx))*x.dh)});
    window.addEventListener('mouseup',()=>drag=false);
    new MutationObserver(()=>{clearTimeout(window._t);window._t=setTimeout(u,50)}).observe(document.body,{childList:true,subtree:true});
    u();[50,100,250,500,1000,2000].forEach(d=>setTimeout(u,d));
    window.updateGlassScrollbar=u;
})();


(function() {
    'use strict';

    var API_BASE = window.location.hostname === 'localhost' 
    ? 'http://localhost:3000' 
    : 'https://spansense.onrender.com';
    var currentCategory = 'bridges';
    var currentFilter = 'all';
    var bridgesData = [];
    var inspectionsData = [];
    var reportsData = [];

    // ============================================
    // COLUMN DEFINITIONS PER CATEGORY
    // ============================================
    var COLUMN_DEFS = {
        bridges: [
            { id: 'id',       label: 'Bridge ID',       key: 'id',             checked: true },
            { id: 'name',     label: 'Structure name',  key: 'name',           checked: true },
            { id: 'coords',   label: 'Coordinates',     key: '_coords',        checked: true },
            { id: 'type',     label: 'Type',            key: 'type',           checked: true },
            { id: 'year',     label: 'Year built',      key: 'built_year',     checked: true },
            { id: 'spans',    label: 'Spans',           key: 'span_number',    checked: true },
            { id: 'last',     label: 'Last inspected',  key: 'last_inspected', checked: true },
        ],
        inspections: [
            { id: 'id',       label: 'Insp. ID',        key: 'id',             checked: true },
            { id: 'sid',      label: 'Structure ID',    key: 'structure_id',   checked: true },
            { id: 'name',     label: 'Bridge',          key: 'structure_name', checked: true },
            { id: 'inspector',label: 'Inspector',       key: 'inspector_name', checked: true },
            { id: 'date',     label: 'Date',            key: 'inspection_date',checked: true },
            { id: 'bciav',    label: 'BCI<sub>avg</sub>',  key: 'overall_bciave', checked: true },
            { id: 'bcicrit',  label: 'BCI<sub>crit</sub>', key: 'overall_bcicrit',checked: true },
            { id: 'type',     label: 'Type',            key: 'inspection_type',checked: true },
            { id: 'tspans',   label: 'Total spans',     key: 'total_spans',    checked: false },
            { id: 'source',   label: 'Source',          key: 'source',        checked: false },
        ],
        reports: [
            { id: 'id',       label: 'Report ID',       key: 'id',             checked: true },
            { id: 'sid',      label: 'Structure ID',    key: 'structure_id',   checked: true },
            { id: 'bridge',   label: 'Bridge',          key: 'bridge',         checked: true },
            { id: 'type',     label: 'Type',            key: 'type',           checked: true },
            { id: 'generated',label: 'Generated',       key: 'generated',      checked: true },
            { id: 'defects',  label: 'Defects',         key: 'defect_count',   checked: true },
        ]
    };

    // Active column state (mutable copy per category switch)
    var activeColumns = deepCloneCols(COLUMN_DEFS.bridges);

    function deepCloneCols(defs) {
        return defs.map(function(c) { return Object.assign({}, c); });
    }

    // ============================================
    // COLUMN PICKER RENDER
    // ============================================
    function renderColPicker() {
        var grid = document.getElementById('colPickerGrid');
        var hint = document.getElementById('colPickerHint');
        if (!grid) return;

        grid.innerHTML = activeColumns.map(function(col) {
            return '<div class="col-chip ' + (col.checked ? 'checked' : '') + '" onclick="toggleColumn(\'' + col.id + '\')">' +
                '<input type="checkbox" ' + (col.checked ? 'checked' : '') + '>' +
                '<label>' + col.label + '</label>' +
            '</div>';
        }).join('');

        var n = activeColumns.filter(function(c) { return c.checked; }).length;
        if (hint) hint.textContent = n + ' of ' + activeColumns.length + ' columns selected';
    }

    window.toggleColumn = function(id) {
        var col = activeColumns.find(function(c) { return c.id === id; });
        if (col) col.checked = !col.checked;
        renderColPicker();
    };

    window.setAllColumns = function(val) {
        activeColumns.forEach(function(c) { c.checked = val; });
        renderColPicker();
    };

    // Returns only the checked column definitions
    function getCheckedCols() {
        return activeColumns.filter(function(c) { return c.checked; });
    }

    // ============================================
    // CARD COUNT UPDATERS
    // ============================================
    function updateCardCount(category, count) {
        var el = document.getElementById(category + '-count');
        if (el) el.textContent = count.toLocaleString() + ' records';
    }

    // ============================================
    // NIGHT MODE
    // ============================================
    var toggleBtn = document.getElementById('nightModeToggle');
    if (toggleBtn) {
        toggleBtn.onclick = function() {
            document.body.classList.toggle('night-mode');
            if (document.body.classList.contains('night-mode')) {
                this.innerHTML = '<i class="fas fa-sun"></i>';
                localStorage.setItem('nightMode', 'on');
            } else {
                this.innerHTML = '<i class="fas fa-moon"></i>';
                localStorage.setItem('nightMode', 'off');
            }
        };
        var savedNightMode = localStorage.getItem('nightMode');
        var systemPrefersLight = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches;
        document.documentElement.classList.remove('nm-preload');
        if (savedNightMode === 'on' || (savedNightMode === null && !systemPrefersLight)) {
            document.body.classList.add('night-mode');
            toggleBtn.innerHTML = '<i class="fas fa-sun"></i>';
        }
    }

    // ============================================
    // LOADING OVERLAY
    // ============================================
    function showLoading(show) {
        var overlay = document.getElementById('progressOverlay');
        if (show) {
            overlay.classList.add('active');
            document.getElementById('progressText').textContent = 'Loading data...';
            document.getElementById('progressFill').style.width = '60%';
            document.getElementById('progressPercent').textContent = '';
        } else {
            overlay.classList.remove('active');
            document.getElementById('progressFill').style.width = '0%';
        }
    }

    // ============================================
    // BRIDGES TABLE
    // ============================================
    // Colors/icons matching the map's own per-type marker circles (see
    // typeFill/typeIcons in map/map.js). Footbridge/sign_gantry keep their
    // own FontAwesome glyphs here since those already read clearly at this
    // size; bridge/culvert/retaining_wall reuse the map's own hand-drawn
    // SVGs (via svgIcons below, which takes priority over the `icon` field
    // here) so those three match the map exactly - fa-bridge in particular
    // is a Pro-only glyph and renders blank on the free FontAwesome CDN.
    var typeCircleMeta = {
        bridge:         { color: '#2c645c', icon: 'fa-bridge' },
        footbridge:     { color: '#4f9088', icon: 'fa-person-walking' },
        retaining_wall: { color: '#9b4f4f', icon: 'fa-wall' },
        culvert:        { color: '#c79a4b', icon: 'fa-water' },
        sign_gantry:    { color: '#7a6fb0', icon: 'fa-sign' },
        tunnel:         { color: '#2c645c', icon: 'fa-road' },
        viaduct:        { color: '#2c645c', icon: 'fa-road' }
    };

    // Same path data as typeIcons.culvert/retaining_wall in map/map.js, just
    // using currentColor instead of a hardcoded white stroke so the same
    // markup works both on a colored circle badge (table rows) and a plain
    // colored chip icon (filters).
    var svgIcons = {
        bridge: function(sz, color) {
            return '<svg viewBox="0 0 20 20" width="' + sz + '" height="' + sz + '" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" fill="none" stroke-width="1.9"' +
                (color ? ' style="color:' + color + '"' : '') +
                '><line x1="2" y1="6" x2="18" y2="6"/><line x1="5" y1="6" x2="5" y2="13"/><line x1="10" y1="6" x2="10" y2="13"/><line x1="15" y1="6" x2="15" y2="13"/><path d="M1 16 Q5 13.5 9 16 T17 16"/></svg>';
        },
        culvert: function(sz, color) {
            return '<svg viewBox="0 0 20 20" width="' + sz + '" height="' + sz + '" stroke="currentColor" stroke-linecap="round" fill="none" stroke-width="1.9"' +
                (color ? ' style="color:' + color + '"' : '') +
                '><circle cx="10" cy="10" r="7"/><circle cx="10" cy="10" r="3"/><line x1="3" y1="17" x2="17" y2="17"/></svg>';
        },
        retaining_wall: function(sz, color) {
            return '<svg viewBox="0 0 20 20" width="' + sz + '" height="' + sz + '" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" fill="none" stroke-width="1.9"' +
                (color ? ' style="color:' + color + '"' : '') +
                '><rect x="2" y="5" width="16" height="11" rx="1.5"/><line x1="2" y1="10.5" x2="18" y2="10.5"/><line x1="7" y1="5" x2="7" y2="10.5"/><line x1="13" y1="10.5" x2="13" y2="16"/></svg>';
        }
    };

    // Same colors/icons already used for the GI/PI/SI filter chips (see the
    // inspections/reports entries in the filter-chip definitions below).
    var inspectionTypeCircleMeta = {
        GI: { color: '#8ab4b0', icon: 'fa-chart-line', label: 'General' },
        PI: { color: '#5b8c8a', icon: 'fa-building',   label: 'Principal' },
        SI: { color: '#eab308', icon: 'fa-eye',        label: 'Safety' }
    };

    function rebuildBridgesTable() {
        var tbody = document.getElementById('tableBody');
        document.getElementById('dataTable').classList.add('card-rows');
        var rowsHtml = '';

        filteredBridgesData = bridgesData;
        if (currentFilter !== 'all') {
            var filterType = currentFilter.replace(/_/g, ' ');
            filteredBridgesData = filteredBridgesData.filter(function(bridge) {
                return bridge.type && bridge.type.toLowerCase() === filterType.toLowerCase();
            });
        }
        if (yearRange.from != null || yearRange.to != null) {
            filteredBridgesData = filteredBridgesData.filter(function(bridge) {
                var y = parseInt(bridge.built_year);
                if (isNaN(y)) return false;
                if (yearRange.from != null && y < yearRange.from) return false;
                if (yearRange.to != null && y > yearRange.to) return false;
                return true;
            });
        }

        if (sortState.column && sortState.column !== '') {
            sortData(filteredBridgesData, sortState.column);
        } else {
            filteredBridgesData.sort(function(a, b) {
                var nameA = (a.name || '').toLowerCase();
                var nameB = (b.name || '').toLowerCase();
                if (nameA !== nameB) return nameA.localeCompare(nameB);
                return (parseInt(a.id) || 0) - (parseInt(b.id) || 0);
            });
        }

        var totalRecords = filteredBridgesData.length;
        var totalPages = Math.ceil(totalRecords / rowsPerPage);

        // Ensure current page is valid
        if (currentPage > totalPages && totalPages > 0) currentPage = totalPages;
        if (currentPage < 1) currentPage = 1;

        var startIndex = (currentPage - 1) * rowsPerPage;
        var endIndex = Math.min(startIndex + rowsPerPage, totalRecords);
        var displayData = filteredBridgesData.slice(startIndex, endIndex);

        if (totalRecords === 0) {
            rowsHtml = '<tr><td colspan="7" style="text-align:center;padding:40px;color:#8a9ba8;">' +
                '<i class="fas fa-database" style="font-size:2rem;margin-bottom:12px;display:block;"></i>' +
                'No bridges found</td></tr>';
        } else {
            displayData.forEach(function(row) {
                var lat = row.latitude ? parseFloat(row.latitude).toFixed(6) : '--';
                var lon = row.longitude ? parseFloat(row.longitude).toFixed(6) : '--';
                var typeMap = {
                    'bridge': 'Bridge', 'footbridge': 'Footbridge',
                    'retaining_wall': 'Retaining Wall', 'culvert': 'Culvert',
                    'tunnel': 'Tunnel', 'viaduct': 'Viaduct', 'sign_gantry': 'Sign Gantry'
                };
                var typeLabel = typeMap[(row.type || '').toLowerCase()] ||
                    (row.type ? row.type.charAt(0).toUpperCase() + row.type.slice(1).replace(/_/g, ' ') : '--');
                var typeKey = (row.type || '').toLowerCase().replace(/\s+/g, '_');
                var typeMeta = typeCircleMeta[typeKey] || typeCircleMeta.bridge;
                var typeIconHtml = svgIcons[typeKey] ? svgIcons[typeKey](13) : '<i class="fas ' + typeMeta.icon + '"></i>';
                var isChecked = selectedIds.bridges.has(String(row.id)) ? ' checked' : '';

                rowsHtml += '<tr>' +
                    '<td class="col-check"><input type="checkbox" class="row-check" data-id="' + row.id + '"' + isChecked + '></td>' +
                    '<td><strong>' + (row.id || '--') + '</strong></td>' +
                    '<td class="bridge-name">' + (row.name || '--') +
                        '<span class="meta">' + lat + '°, ' + lon + '°</span></td>' +
                    '<td><span class="type-circle" style="background:' + typeMeta.color + '">' + typeIconHtml + '</span>' + typeLabel + '</td>' +
                    '<td>' + (row.built_year || '--') + '</td>' +
                    '<td>' + (row.span_number || '0') + '</td>' +
                    '<td>' + formatDate(row.last_inspected) + '</td>' +
                '</tr>';
            });
        }

        tbody.innerHTML = rowsHtml;
        addPaginationControls(totalPages, totalRecords, 'bridges');
        bindCheckboxEvents();
        updateSelectionCount();
    }

    // ============================================
    // SORT STATE
    // ============================================
    var sortState = { column: null, direction: 'asc' };

    // ============================================
    // RANGE FILTERS (Bridges: built year, Reports: generated date)
    // ============================================
    var yearRange = { from: null, to: null };
    var reportDateRange = { from: null, to: null };

    window.applyYearRange = function() {
        var f = document.getElementById('yearFrom').value;
        var t = document.getElementById('yearTo').value;
        yearRange.from = f !== '' ? parseInt(f) : null;
        yearRange.to = t !== '' ? parseInt(t) : null;
        rebuildBridgesTable();
    };

    window.clearYearRange = function() {
        document.getElementById('yearFrom').value = '';
        document.getElementById('yearTo').value = '';
        yearRange = { from: null, to: null };
        rebuildBridgesTable();
    };

    window.applyReportDateRange = function() {
        var f = document.getElementById('reportDateFrom').value;
        var t = document.getElementById('reportDateTo').value;
        reportDateRange.from = f || null;
        reportDateRange.to = t || null;
        currentPage = 1;
        rebuildReportsTable();
    };

    window.clearReportDateRange = function() {
        document.getElementById('reportDateFrom').value = '';
        document.getElementById('reportDateTo').value = '';
        reportDateRange = { from: null, to: null };
        currentPage = 1;
        rebuildReportsTable();
    };

    window.resetSort = function() {
        sortState.column = null;
        sortState.direction = 'asc';
        if (currentCategory === 'bridges') rebuildBridgesTable();
        else if (currentCategory === 'inspections') rebuildInspectionsTable();
        else if (currentCategory === 'reports') rebuildReportsTable();
        updateTableColumns(currentCategory);
    };

    function updateTableColumns(cat) {
        var thead = document.getElementById('tableHead');
        var columns = {
            bridges: [
                { label: 'Bridge ID', sortable: true, key: 'id' },
                { label: 'Structure Name', sortable: true, key: 'name' },
                { label: 'Type', sortable: false },
                { label: 'Year Built', sortable: false },
                { label: 'Spans', sortable: false },
                { label: 'Last Inspected', sortable: false }
            ],
            inspections: [
                { label: 'Inspection ID', sortable: true, key: 'id' },
                { label: 'Structure ID', sortable: true, key: 'structure_id' },
                { label: 'Bridge', sortable: true, key: 'structure_name' },
                { label: 'Inspector', sortable: false },
                { label: 'Date', sortable: false },
                { label: 'BCI<sub>avg</sub>', sortable: true, key: 'overall_bciave' },
                { label: 'BCI<sub>crit</sub>', sortable: true, key: 'overall_bcicrit' },
                { label: 'Type', sortable: false },
                { label: 'Total Spans', sortable: false },
                { label: 'Source', sortable: false }
            ],
            reports: [
                { label: 'Report ID', sortable: true, key: 'id' },
                { label: 'Structure ID', sortable: true, key: 'structure_id' },
                { label: 'Bridge', sortable: true, key: 'bridge' },
                { label: 'Type', sortable: false },
                { label: 'Generated', sortable: false },
                { label: 'Defects', sortable: true, key: 'defect_count' }
            ]
        };

        var html = '<tr><th class="col-check"><input type="checkbox" id="selectAll"></th>';
        (columns[cat] || []).forEach(function(col) {
            if (col.sortable) {
                var activeClass = sortState.column === col.key ? ' active' : '';
                var icon = sortState.column === col.key
                    ? (sortState.direction === 'asc' ? '↑' : '↓') : '↕';
                html += '<th class="sortable' + activeClass + '" onclick="sortTable(\'' + col.key + '\')">' +
                    col.label + ' <span class="sort-icon">' + icon + '</span></th>';
            } else {
                html += '<th>' + col.label + '</th>';
            }
        });
        // Only Reports has real per-row action buttons (Bridges and
        // Inspections have no actions column), so only it gets a trailing
        // header cell.
        if (cat === 'reports') html += '<th></th>';
        html += '</tr>';
        thead.innerHTML = html;
        // This replaces the header - including the #selectAll checkbox - with
        // a brand new node, orphaning whatever listener rebuildXTable() had
        // just attached to the old one via bindCheckboxEvents(). Every caller
        // here runs updateTableColumns() after rebuildXTable(), so re-bind
        // here too rather than relying on call order at each site.
        bindCheckboxEvents();
    }

    window.sortTable = function(columnKey) {
        if (sortState.column === columnKey) {
            sortState.direction = sortState.direction === 'asc' ? 'desc' : 'asc';
        } else {
            sortState.column = columnKey;
            sortState.direction = 'asc';
        }
        if (currentCategory === 'bridges') { sortData(bridgesData, columnKey); rebuildBridgesTable(); }
        else if (currentCategory === 'inspections') { sortData(inspectionsData, columnKey); rebuildInspectionsTable(); }
        else if (currentCategory === 'reports') { sortData(reportsData, columnKey); rebuildReportsTable(); }
        updateTableColumns(currentCategory);
    };

    function sortData(dataArray, key) {
        dataArray.sort(function(a, b) {
            var valA = a[key], valB = b[key];
            if (key === 'id') { valA = parseID(valA); valB = parseID(valB); }
            else if (key === 'overall_bciave' || key === 'overall_bcicrit') {
                valA = parseFloat(valA) || 0; valB = parseFloat(valB) || 0;
            }
            if (valA == null && valB == null) return 0;
            if (valA == null) return 1;
            if (valB == null) return -1;
            var cmp = 0;
            if (typeof valA === 'string' && typeof valB === 'string') {
                cmp = valA.toLowerCase().localeCompare(valB.toLowerCase());
            } else if (typeof valA === 'number' && typeof valB === 'number') {
                cmp = valA - valB;
            } else {
                cmp = String(valA).localeCompare(String(valB));
            }
            return sortState.direction === 'asc' ? cmp : -cmp;
        });
    }

    function parseID(id) {
        if (typeof id === 'number') return id;
        var m = String(id).match(/\d+/);
        return m ? parseInt(m[0]) : 0;
    }


    // ============================================
    // PAGINATION STATE
    // ============================================
    var currentPage = 1;
    var rowsPerPage = 20;
    var filteredBridgesData = [];
    var filteredInspectionsData = [];
    var filteredReportsData = [];

    // ============================================
    // SELECTION STATE - one Set of checked record IDs per category, kept
    // across pages (and across category switches) rather than only reading
    // whatever .row-check boxes happen to be in the DOM, which only ever
    // covers the current page - see bindCheckboxEvents()/startExport().
    // ============================================
    var selectedIds = { bridges: new Set(), inspections: new Set(), reports: new Set() };

    // ============================================
    // INSPECTIONS TABLE (with pagination)

       function formatDate(dateString) {
          if (!dateString) return '--';
          const date = new Date(dateString);
          if (isNaN(date.getTime())) return dateString;
          return date.toLocaleDateString('en-GB', {
              day: 'numeric',
              month: 'short',
              year: 'numeric'
          });
      }

    // ============================================
    function rebuildInspectionsTable() {
        var tbody = document.getElementById('tableBody');
        document.getElementById('dataTable').classList.add('card-rows');

        // Filter data
        filteredInspectionsData = inspectionsData.filter(function(row) {
            if (currentFilter === 'all') return true;
            if (currentFilter === 'src-field') return row.source === 'field';
            if (currentFilter === 'src-desktop') return (row.source || 'desktop') === 'desktop';
            return row.inspection_type === currentFilter;
        });

        // Sort data
        if (sortState.column && sortState.column !== '') {
            sortData(filteredInspectionsData, sortState.column);
        } else {
            filteredInspectionsData.sort(function(a, b) {
                return (parseInt(b.id) || 0) - (parseInt(a.id) || 0); // Show newest first
            });
        }

        var totalRecords = filteredInspectionsData.length;
        var totalPages = Math.ceil(totalRecords / rowsPerPage);
        
        // Ensure current page is valid
        if (currentPage > totalPages && totalPages > 0) currentPage = totalPages;
        if (currentPage < 1) currentPage = 1;
        
        var startIndex = (currentPage - 1) * rowsPerPage;
        var endIndex = Math.min(startIndex + rowsPerPage, totalRecords);
        var displayData = filteredInspectionsData.slice(startIndex, endIndex);
        
        var rowsHtml = '';

        if (totalRecords === 0) {
            rowsHtml = '<tr><td colspan="11" style="text-align:center;padding:40px;color:#8a9ba8;">' +
                '<i class="fas fa-database" style="font-size:2rem;margin-bottom:12px;display:block;"></i>' +
                'No inspections found</td></tr>';
        } else {
            displayData.forEach(function(row) {
                var typeMeta = inspectionTypeCircleMeta[row.inspection_type] || inspectionTypeCircleMeta.GI;
                var bciAv   = row.overall_bciave   != null ? Math.round(parseFloat(row.overall_bciave))   : '--';
                var bciCrit = row.overall_bcicrit  != null ? Math.round(parseFloat(row.overall_bcicrit))  : '--';
                var isChecked = selectedIds.inspections.has(String(row.id)) ? ' checked' : '';
                var isField = row.source === 'field';
                var sourceBadge = '<span style="display:inline-flex;align-items:center;gap:5px;font-size:11.5px;font-weight:600;padding:3px 9px;border-radius:20px;' +
                    (isField ? 'background:#eef4f2;color:#5b8c8a;' : 'background:#f1f3f5;color:#6a7c8e;') + '">' +
                    '<i class="fas ' + (isField ? 'fa-mobile-screen-button' : 'fa-desktop') + '"></i>' +
                    (isField ? 'Field' : 'Desktop') + '</span>';

                rowsHtml += '<tr>' +
                    '<td class="col-check"><input type="checkbox" class="row-check" data-id="' + row.id + '"' + isChecked + '></td>' +
                    '<td><strong>' + (row.id || '--') + '</strong></td>' +
                    '<td>' + (row.structure_id || '--') + '</td>' +
                    '<td>' + (row.structure_name || '--') + '</td>' +
                    '<td>' + (row.inspector_name || '--') + '</td>' +
                    '<td>' + formatDate(row.inspection_date) + '</td>' +
                    '<td><span style="color:#5b8c8a;font-weight:600;">' + bciAv + '</span></td>' +
                    '<td><span style="color:#e8a87c;font-weight:600;">' + bciCrit + '</span></td>' +
                    '<td><span class="type-circle" style="background:' + typeMeta.color + '"><i class="fas ' + typeMeta.icon + '"></i></span>' + typeMeta.label + '</td>' +
                    '<td>' + (row.total_spans || '0') + '</td>' +
                    '<td>' + sourceBadge + '</td>' +
                '</tr>';
            });
        }

        tbody.innerHTML = rowsHtml;

        // Add pagination controls
        addPaginationControls(totalPages, totalRecords, 'inspections');

        bindCheckboxEvents();
        updateSelectionCount();
    }

    // ============================================
    // REPORTS TABLE
    // ============================================
    // There's no standalone "reports" record on the server - a report is
    // just an inspection presented differently, so every call site below
    // builds this straight from inspectionsData. (A fetchReports() used to
    // sit here trying GET /api/reports first, which was never implemented
    // server-side and always fell through to the SPA catch-all - a 200
    // response with index.html's body, not JSON - so it silently threw and
    // fell back to this same function anyway. It was also never actually
    // called from anywhere, so removed rather than fixed.)
    function buildReportsFromInspections() {
        reportsData = inspectionsData.map(function(inspection) {
            var bciAv   = inspection.overall_bciave   != null ? Math.round(parseFloat(inspection.overall_bciave))  : null;
            var bciCrit = inspection.overall_bcicrit  != null ? Math.round(parseFloat(inspection.overall_bcicrit)) : null;
            var status  = 'Ready';
            if (bciAv !== null && bciAv < 40) status = 'Critical';
            else if (bciAv !== null && bciAv < 65) status = 'Urgent';

            var rawType     = inspection.inspection_type || 'GI';
            var displayType = rawType === 'PI' ? 'Principal' : rawType === 'SI' ? 'Safety' : 'General';

            return {
                id: 'RPT-' + inspection.id,
                inspection_id: inspection.id,
                structure_id: inspection.structure_id,
                bridge: inspection.structure_name || '--',
                type: rawType,
                display_type: displayType,
                generated: inspection.inspection_date || '--',
                defect_count: inspection.defect_count != null ? Number(inspection.defect_count) : 0,
                status: status,
                overall_bciave: bciAv,
                overall_bcicrit: bciCrit
            };
        });

        // Update reports card count
        updateCardCount('reports', reportsData.length);

        if (currentCategory === 'reports') rebuildReportsTable();
    }

    // ============================================
    // REPORTS TABLE (with pagination)
    // ============================================
    function rebuildReportsTable() {
        var tbody = document.getElementById('tableBody');
        document.getElementById('dataTable').classList.add('card-rows');

        // Filter data
        filteredReportsData = reportsData.filter(function(row) {
            if (currentFilter !== 'all' && row.type !== currentFilter) return false;
            if (reportDateRange.from || reportDateRange.to) {
                var d = new Date(row.generated);
                if (isNaN(d.getTime())) return false;
                if (reportDateRange.from && d < new Date(reportDateRange.from)) return false;
                if (reportDateRange.to && d > new Date(reportDateRange.to + 'T23:59:59')) return false;
            }
            return true;
        });

        // Sort data
        if (sortState.column) {
            sortData(filteredReportsData, sortState.column);
        } else {
            // Sort by generated date (newest first) if no sort applied
            filteredReportsData.sort(function(a, b) {
                return (b.generated || '').localeCompare(a.generated || '');
            });
        }

        var totalRecords = filteredReportsData.length;
        var totalPages = Math.ceil(totalRecords / rowsPerPage);
        
        // Ensure current page is valid
        if (currentPage > totalPages && totalPages > 0) currentPage = totalPages;
        if (currentPage < 1) currentPage = 1;
        
        var startIndex = (currentPage - 1) * rowsPerPage;
        var endIndex = Math.min(startIndex + rowsPerPage, totalRecords);
        var displayData = filteredReportsData.slice(startIndex, endIndex);
        
        var rowsHtml = '';

        if (totalRecords === 0) {
            rowsHtml = '<tr><td colspan="8" style="text-align:center;padding:40px;color:#8a9ba8;">' +
                '<i class="fas fa-file-alt" style="font-size:2rem;margin-bottom:12px;display:block;"></i>' +
                'No reports found.</td></tr>';
        } else {
            displayData.forEach(function(row) {
                var typeMeta = inspectionTypeCircleMeta[row.type] || inspectionTypeCircleMeta.GI;
                var isChecked = selectedIds.reports.has(String(row.id)) ? ' checked' : '';
                rowsHtml += '<tr>' +
                    '<td class="col-check"><input type="checkbox" class="row-check" data-id="' + row.id + '"' + isChecked + '></td>' +
                    '<td><strong>' + (row.id || '--') + '</strong></td>' +
                    '<td>' + (row.structure_id || '--') + '</td>' +
                    '<td>' + (row.bridge || '--') + '</td>' +
                    '<td><span class="type-circle" style="background:' + typeMeta.color + '"><i class="fas ' + typeMeta.icon + '"></i></span>' + (row.display_type || '--') + '</td>' +
                    '<td>' + formatDate(row.generated) + '</td>' +
                    '<td>' + (row.defect_count != null ? row.defect_count : '--') + '</td>' +
                    '<td><div class="row-actions">' +
                        '<button title="Generate BCI Proforma" onclick="generateReport(' + row.inspection_id + ')" class="btn-report"><i class="fas fa-file-invoice"></i></button>' +
                        '<button title="Download Report (Word)" onclick="generateReportDocx(' + row.inspection_id + ')"><i class="fas fa-file-word"></i></button>' +
                        '<button title="Download Report" onclick="downloadReport(' + row.inspection_id + ')"><i class="fas fa-file-pdf"></i></button>' +
                    '</div></td>' +
                '</tr>';
            });
        }


        tbody.innerHTML = rowsHtml;

        // Add pagination controls
        addPaginationControls(totalPages, totalRecords, 'reports');

        bindCheckboxEvents();
        updateSelectionCount();
    }

    // ============================================
    // PAGINATION CONTROLS
    // ============================================
    function addPaginationControls(totalPages, totalRecords, tableType) {
        var tableWrap = document.querySelector('.data-table-wrap');
        var existingPagination = document.querySelector('.pagination-container');
        if (existingPagination) existingPagination.remove();
        
        if (totalPages <= 1) return;
        
        var paginationHtml = '<div class="pagination-container">' +
            '<div class="pagination-info">' +
                'Showing <strong>' + ((currentPage - 1) * rowsPerPage + 1) + '</strong> - ' +
                '<strong>' + Math.min(currentPage * rowsPerPage, totalRecords) + '</strong> of ' +
                '<strong>' + totalRecords + '</strong> records' +
            '</div>' +
            '<div class="pagination-controls">';
        
        // First button
        paginationHtml += '<button class="pagination-btn" onclick="goToPage(1)" ' + (currentPage === 1 ? 'disabled' : '') + '>' +
            '<i class="fas fa-angle-double-left"></i>' +
        '</button>';
        
        // Previous button
        paginationHtml += '<button class="pagination-btn" onclick="goToPage(' + (currentPage - 1) + ')" ' + (currentPage === 1 ? 'disabled' : '') + '>' +
            '<i class="fas fa-angle-left"></i>' +
        '</button>';
        
        // Page numbers
        var startPage = Math.max(1, currentPage - 2);
        var endPage = Math.min(totalPages, currentPage + 2);
        
        if (startPage > 1) {
            paginationHtml += '<button class="pagination-btn" onclick="goToPage(1)">1</button>';
            if (startPage > 2) paginationHtml += '<span class="pagination-ellipsis">...</span>';
        }
        
        for (var i = startPage; i <= endPage; i++) {
            paginationHtml += '<button class="pagination-btn ' + (i === currentPage ? 'active' : '') + '" onclick="goToPage(' + i + ')">' + i + '</button>';
        }
        
        if (endPage < totalPages) {
            if (endPage < totalPages - 1) paginationHtml += '<span class="pagination-ellipsis">...</span>';
            paginationHtml += '<button class="pagination-btn" onclick="goToPage(' + totalPages + ')">' + totalPages + '</button>';
        }
        
        // Next button
        paginationHtml += '<button class="pagination-btn" onclick="goToPage(' + (currentPage + 1) + ')" ' + (currentPage === totalPages ? 'disabled' : '') + '>' +
            '<i class="fas fa-angle-right"></i>' +
        '</button>';
        
        // Last button
        paginationHtml += '<button class="pagination-btn" onclick="goToPage(' + totalPages + ')" ' + (currentPage === totalPages ? 'disabled' : '') + '>' +
            '<i class="fas fa-angle-double-right"></i>' +
        '</button>';
        
        // Rows per page selector
        paginationHtml += '<div class="pagination-rows-selector">' +
            '<span>Rows per page:</span>' +
            '<select onchange="changeRowsPerPage(this.value)">' +
                '<option value="10" ' + (rowsPerPage === 10 ? 'selected' : '') + '>10</option>' +
                '<option value="20" ' + (rowsPerPage === 20 ? 'selected' : '') + '>20</option>' +
                '<option value="50" ' + (rowsPerPage === 50 ? 'selected' : '') + '>50</option>' +
                '<option value="100" ' + (rowsPerPage === 100 ? 'selected' : '') + '>100</option>' +
            '</select>' +
        '</div>';
        
        paginationHtml += '</div></div>';
        
        tableWrap.insertAdjacentHTML('afterend', paginationHtml);
    }

    // ============================================
    // PAGINATION FUNCTIONS
    // ============================================
    window.goToPage = function(page) {
        currentPage = page;
        if (currentCategory === 'bridges') {
            rebuildBridgesTable();
        } else if (currentCategory === 'inspections') {
            rebuildInspectionsTable();
        } else if (currentCategory === 'reports') {
            rebuildReportsTable();
        }
    };

    window.changeRowsPerPage = function(rows) {
        rowsPerPage = parseInt(rows);
        currentPage = 1;
        if (currentCategory === 'bridges') {
            rebuildBridgesTable();
        } else if (currentCategory === 'inspections') {
            rebuildInspectionsTable();
        } else if (currentCategory === 'reports') {
            rebuildReportsTable();
        }
    };

    // ============================================
    // Reset pagination when filter changes
    // ============================================
    // Modify the existing setFilter function to reset pagination
    var originalSetFilter = window.setFilter;
    window.setFilter = function(btn, filterId) {
        currentFilter = filterId;
        currentPage = 1; // Reset to first page
        document.querySelectorAll('.filter-chip').forEach(function(b) { b.classList.remove('active'); });
        btn.classList.add('active');
        if (currentCategory === 'bridges') rebuildBridgesTable();
        else if (currentCategory === 'inspections') rebuildInspectionsTable();
        else if (currentCategory === 'reports') rebuildReportsTable();
    };

    // Modify selectCategory to reset pagination
    var originalSelectCategory = window.selectCategory;
    window.selectCategory = function(cat) {
        currentCategory = cat;
        currentFilter = 'all';
        currentPage = 1; // Reset pagination
        rowsPerPage = 20; // Reset rows per page
        
        // Rest of existing selectCategory code...
        document.querySelectorAll('.export-card').forEach(function(card) { card.classList.remove('active'); });
        var activeCard = document.querySelector('.export-card[data-category="' + cat + '"]');
        if (activeCard) activeCard.classList.add('active');

        var titles = { bridges: 'Bridge Records', inspections: 'Inspection Records', reports: 'Report Files' };
        document.getElementById('panelTitle').innerHTML = '<i class="fas fa-list-check"></i> ' + titles[cat];

        // Switch active column definitions
        activeColumns = deepCloneCols(COLUMN_DEFS[cat] || COLUMN_DEFS.bridges);
        renderColPicker();

        // Rebuild filters bar
        var filtersBar = document.getElementById('filtersBar');
        filtersBar.innerHTML = '';
        var filters = {
            bridges: [
                { id: 'all', icon: 'fa-check', label: 'All Structures' },
                { id: 'bridge', icon: 'fa-bridge', label: 'Bridges', color: '#5b8c8a' },
                { id: 'footbridge', icon: 'fa-person-walking', label: 'Footbridges', color: '#8ab4b0' },
                { id: 'retaining_wall', icon: 'fa-wall', label: 'Retaining Walls', color: '#eab308' },
                { id: 'culvert', icon: 'fa-water', label: 'Culverts', color: '#f97316' },
                { id: 'sign_gantry', icon: 'fa-sign', label: 'Sign Gantries', color: '#7c6fc4' }
            ],
            inspections: [
                { id: 'all', icon: 'fa-check', label: 'All Inspections' },
                { id: 'GI', icon: 'fa-chart-line', label: 'General (GI)', color: '#8ab4b0' },
                { id: 'PI', icon: 'fa-building', label: 'Principal (PI)', color: '#5b8c8a' },
                { id: 'SI', icon: 'fa-eye', label: 'Safety (SI)', color: '#eab308' },
                { id: 'src-field', icon: 'fa-mobile-screen-button', label: 'From Field', color: '#5b8c8a' },
                { id: 'src-desktop', icon: 'fa-desktop', label: 'From Desktop', color: '#6a7c8e' }
            ],
            reports: [
                { id: 'all', icon: 'fa-check', label: 'All Reports' },
                { id: 'GI', icon: 'fa-chart-line', label: 'General (GI)', color: '#8ab4b0' },
                { id: 'PI', icon: 'fa-building', label: 'Principal (PI)', color: '#5b8c8a' },
                { id: 'SI', icon: 'fa-eye', label: 'Safety (SI)', color: '#eab308' }
            ]
        };
        (filters[cat] || filters.bridges).forEach(function(f, i) {
            var btn = document.createElement('button');
            btn.className = 'filter-chip' + (i === 0 ? ' active' : '');
            btn.onclick = function() { window.setFilter(this, f.id); };
            var iconHtml = svgIcons[f.id] ? svgIcons[f.id](13, f.color) : '<i class="fas ' + f.icon + '"' + (f.color ? ' style="color:' + f.color + '"' : '') + '></i>';
            btn.innerHTML = iconHtml + ' ' + f.label;
            filtersBar.appendChild(btn);
        });

        // Update formats
        var formatContainer = document.getElementById('formatOptions');
        formatContainer.innerHTML = '';
        var formats = {
            bridges:      [{ id:'csv',icon:'fa-file-csv',label:'CSV' },{ id:'json',icon:'fa-file-code',label:'JSON' },{ id:'xml',icon:'fa-file-code',label:'XML' }],
            inspections:  [{ id:'csv',icon:'fa-file-csv',label:'CSV' },{ id:'xlsx',icon:'fa-file-excel',label:'Excel' },{ id:'pdf',icon:'fa-file-pdf',label:'PDF' }],
            reports:      [{ id:'bci_pdf',icon:'fa-file-invoice',label:'BCI PDF' },{ id:'docx',icon:'fa-file-word',label:'Word Report' },{ id:'pdf',icon:'fa-file-pdf',label:'PDF Report' }]
        };
        (formats[cat] || formats.bridges).forEach(function(fmt, i) {
            var btn = document.createElement('button');
            btn.className = 'format-btn' + (i === 0 ? ' active' : '');
            btn.setAttribute('data-format', fmt.id);
            btn.onclick = function() { window.selectFormat(this); };
            btn.innerHTML = '<i class="fas ' + fmt.icon + '"></i> ' + fmt.label;
            formatContainer.appendChild(btn);
        });

        updateTableColumns(cat);
        sortState = { column: null, direction: 'asc' };

        if (cat === 'bridges') {
            if (bridgesData.length === 0) fetchBridges();
            else { rebuildBridgesTable(); updateTableColumns('bridges'); }
        } else if (cat === 'inspections') {
            if (inspectionsData.length === 0) fetchInspections();
            else { rebuildInspectionsTable(); updateTableColumns('inspections'); }
        } else if (cat === 'reports') {
            if (reportsData.length > 0) { rebuildReportsTable(); updateTableColumns('reports'); }
            else if (inspectionsData.length > 0) { buildReportsFromInspections(); updateTableColumns('reports'); }
            else { fetchInspections().then(function() { buildReportsFromInspections(); updateTableColumns('reports'); }); }
        }
    };

    // Add CSS for pagination controls
    var paginationStyles = document.createElement('style');
    paginationStyles.textContent = `
        /* Pagination Styles - sits directly on the page background like the
           rest of this page (see .export-panel above), not in its own boxed
           panel; just a hairline divider from the table above it. */
        .pagination-container {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 16px 0;
            border-top: 1px solid #e2e8f0;
            flex-wrap: wrap;
            gap: 16px;
        }
        
        .pagination-info {
            font-size: 0.8rem;
            color: #8a9ba8;
        }
        
        .pagination-info strong {
            color: #2c4a48;
            font-weight: 600;
        }
        
        .pagination-controls {
            display: flex;
            align-items: center;
            gap: 6px;
            flex-wrap: wrap;
        }
        
        .pagination-btn {
            min-width: 34px;
            height: 34px;
            padding: 0 8px;
            border-radius: 8px;
            border: 1px solid #e2e8f0;
            background: white;
            color: #6a7c8e;
            font-size: 0.8rem;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.2s;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            font-family: inherit;
        }
        
        .pagination-btn:hover:not(:disabled) {
            background: #eef4f2;
            border-color: #8ab4b0;
            color: #5b8c8a;
        }
        
        .pagination-btn.active {
            background: #5b8c8a;
            border-color: #5b8c8a;
            color: white;
        }
        
        .pagination-btn:disabled {
            opacity: 0.4;
            cursor: not-allowed;
        }
        
        .pagination-ellipsis {
            padding: 0 4px;
            color: #8a9ba8;
        }
        
        .pagination-rows-selector {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-left: 12px;
            padding-left: 12px;
            border-left: 1px solid #eef2f6;
        }
        
        .pagination-rows-selector span {
            font-size: 0.75rem;
            color: #8a9ba8;
        }
        
        .pagination-rows-selector select {
            padding: 6px 10px;
            border-radius: 8px;
            border: 1px solid #e2e8f0;
            background: white;
            font-size: 0.75rem;
            font-family: inherit;
            color: #2c4a48;
            cursor: pointer;
        }
        
        /* Night mode pagination */
        .night-mode .pagination-container {
            border-top-color: #2f3e45;
        }
        
        .night-mode .pagination-info {
            color: #8aa4ac;
        }
        
        .night-mode .pagination-info strong {
            color: #d4dfe3;
        }
        
        .night-mode .pagination-btn {
            background: #1e2a2f;
            border-color: #3a4b53;
            color: #9ab0b8;
        }
        
        .night-mode .pagination-btn:hover:not(:disabled) {
            background: #2f4a48;
            border-color: #6e9c98;
            color: #8ab4b0;
        }
        
        .night-mode .pagination-btn.active {
            background: #5b8c8a;
            border-color: #5b8c8a;
            color: white;
        }
        
        .night-mode .pagination-rows-selector {
            border-left-color: #2f3e45;
        }
        
        .night-mode .pagination-rows-selector select {
            background: #1e2a2f;
            border-color: #3a4b53;
            color: #c5d3d9;
        }
        
        @media (max-width: 768px) {
            .pagination-container {
                flex-direction: column;
                align-items: stretch;
            }
            
            .pagination-controls {
                justify-content: center;
            }
            
            .pagination-rows-selector {
                justify-content: center;
                border-left: none;
                margin-left: 0;
                padding-left: 0;
            }
        }
    `;
    document.head.appendChild(paginationStyles);

    // ============================================
    // FETCH BRIDGES
    // ============================================
    async function fetchBridges() {
        try {
            showLoading(true);
            var res = await fetch(API_BASE + '/api/bridges');
            if (!res.ok) throw new Error('Failed to fetch bridges');
            bridgesData = await res.json();
            updateCardCount('bridges', bridgesData.length);
            if (currentCategory === 'bridges') { rebuildBridgesTable(); updateTableColumns('bridges'); }
        } catch (err) {
            showToast('Error loading bridges: ' + err.message, 'error');
        } finally {
            showLoading(false);
        }
    }

    // ============================================
    // FETCH INSPECTIONS
    // ============================================
    async function fetchInspections() {
        try {
            showLoading(true);
            var res = await fetch(API_BASE + '/api/inspections');
            if (!res.ok) throw new Error('Failed to fetch inspections');
            inspectionsData = await res.json();
            updateCardCount('inspections', inspectionsData.length);
            if (currentCategory === 'inspections') { rebuildInspectionsTable(); updateTableColumns('inspections'); }
            // Always rebuild reports so the card count stays current regardless of active tab
            buildReportsFromInspections();
            if (currentCategory === 'reports') { updateTableColumns('reports'); }
        } catch (err) {
            showToast('Error loading inspections: ' + err.message, 'error');
        } finally {
            showLoading(false);
        }
    }

    // ============================================
    // FILTER
    // ============================================
    window.setFilter = function(btn, filterId) {
        currentFilter = filterId;
        document.querySelectorAll('.filter-chip').forEach(function(b) { b.classList.remove('active'); });
        btn.classList.add('active');
        if (currentCategory === 'bridges') rebuildBridgesTable();
        else if (currentCategory === 'inspections') rebuildInspectionsTable();
        else if (currentCategory === 'reports') rebuildReportsTable();
    };

    window.selectFormat = function(btn) {
        document.querySelectorAll('.format-btn').forEach(function(b) { b.classList.remove('active'); });
        btn.classList.add('active');
    };

    // ============================================
    // CATEGORY SELECTION
    // ============================================
    window.selectCategory = function(cat) {
        currentCategory = cat;
        currentFilter   = 'all';

        document.querySelectorAll('.export-card').forEach(function(card) { card.classList.remove('active'); });
        var activeCard = document.querySelector('.export-card[data-category="' + cat + '"]');
        if (activeCard) activeCard.classList.add('active');

        var titles = { bridges: 'Bridge Records', inspections: 'Inspection Records', reports: 'Report Files' };
        document.getElementById('panelTitle').innerHTML = '<i class="fas fa-list-check"></i> ' + titles[cat];

        // Switch active column definitions (still drives which fields get
        // exported even on categories where the picker itself is hidden)
        activeColumns = deepCloneCols(COLUMN_DEFS[cat] || COLUMN_DEFS.bridges);

        // Right panel: column picker only earns its space on Inspections
        // (9 fields, one optional). Bridges/Reports get a more useful range
        // filter instead of a picker with nothing worth hiding.
        var rightTitle = document.getElementById('rightPanelTitle');
        var colGrid = document.getElementById('colPickerGrid');
        var colFooter = document.getElementById('colPickerFooter');
        var yearFilter = document.getElementById('yearRangeFilter');
        var reportFilter = document.getElementById('reportDateRangeFilter');

        yearRange = { from: null, to: null };
        reportDateRange = { from: null, to: null };
        document.getElementById('yearFrom').value = '';
        document.getElementById('yearTo').value = '';
        document.getElementById('reportDateFrom').value = '';
        document.getElementById('reportDateTo').value = '';

        if (cat === 'inspections') {
            rightTitle.innerHTML = '<i class="fas fa-columns"></i> Column Visibility';
            colGrid.style.display = '';
            colFooter.style.display = '';
            yearFilter.style.display = 'none';
            reportFilter.style.display = 'none';
            renderColPicker();
        } else if (cat === 'bridges') {
            rightTitle.innerHTML = '<i class="fas fa-calendar-alt"></i> Built Year Range';
            colGrid.style.display = 'none';
            colFooter.style.display = 'none';
            yearFilter.style.display = 'flex';
            reportFilter.style.display = 'none';
        } else if (cat === 'reports') {
            rightTitle.innerHTML = '<i class="fas fa-calendar-alt"></i> Date Range';
            colGrid.style.display = 'none';
            colFooter.style.display = 'none';
            yearFilter.style.display = 'none';
            reportFilter.style.display = 'flex';
        }

        // Rebuild filters bar
        var filtersBar = document.getElementById('filtersBar');
        filtersBar.innerHTML = '';
        var filters = {
            bridges: [
                { id: 'all', icon: 'fa-check', label: 'All Structures' },
                { id: 'bridge', icon: 'fa-bridge', label: 'Bridges', color: '#5b8c8a' },
                { id: 'footbridge', icon: 'fa-person-walking', label: 'Footbridges', color: '#8ab4b0' },
                { id: 'retaining_wall', icon: 'fa-wall', label: 'Retaining Walls', color: '#eab308' },
                { id: 'culvert', icon: 'fa-water', label: 'Culverts', color: '#f97316' },
                { id: 'sign_gantry', icon: 'fa-sign', label: 'Sign Gantries', color: '#7c6fc4' }
            ],
            inspections: [
                { id: 'all', icon: 'fa-check', label: 'All Inspections' },
                { id: 'GI', icon: 'fa-chart-line', label: 'General (GI)', color: '#8ab4b0' },
                { id: 'PI', icon: 'fa-building', label: 'Principal (PI)', color: '#5b8c8a' },
                { id: 'SI', icon: 'fa-eye', label: 'Safety (SI)', color: '#eab308' },
                { id: 'src-field', icon: 'fa-mobile-screen-button', label: 'From Field', color: '#5b8c8a' },
                { id: 'src-desktop', icon: 'fa-desktop', label: 'From Desktop', color: '#6a7c8e' }
            ],
            reports: [
                { id: 'all', icon: 'fa-check', label: 'All Reports' },
                { id: 'GI', icon: 'fa-chart-line', label: 'General (GI)', color: '#8ab4b0' },
                { id: 'PI', icon: 'fa-building', label: 'Principal (PI)', color: '#5b8c8a' },
                { id: 'SI', icon: 'fa-eye', label: 'Safety (SI)', color: '#eab308' }
            ]
        };
        (filters[cat] || filters.bridges).forEach(function(f, i) {
            var btn = document.createElement('button');
            btn.className = 'filter-chip' + (i === 0 ? ' active' : '');
            btn.onclick = function() { window.setFilter(this, f.id); };
            var iconHtml = svgIcons[f.id] ? svgIcons[f.id](13, f.color) : '<i class="fas ' + f.icon + '"' + (f.color ? ' style="color:' + f.color + '"' : '') + '></i>';
            btn.innerHTML = iconHtml + ' ' + f.label;
            filtersBar.appendChild(btn);
        });

        // Update formats
        var formatContainer = document.getElementById('formatOptions');
        formatContainer.innerHTML = '';
        var formats = {
            bridges:      [{ id:'csv',icon:'fa-file-csv',label:'CSV' },{ id:'json',icon:'fa-file-code',label:'JSON' },{ id:'xml',icon:'fa-file-code',label:'XML' }],
            inspections:  [{ id:'csv',icon:'fa-file-csv',label:'CSV' },{ id:'xlsx',icon:'fa-file-excel',label:'Excel' },{ id:'pdf',icon:'fa-file-pdf',label:'PDF' }],
            reports:      [{ id:'bci_pdf',icon:'fa-file-invoice',label:'BCI PDF' },{ id:'docx',icon:'fa-file-word',label:'Word Report' },{ id:'pdf',icon:'fa-file-pdf',label:'PDF Report' }]
        };
        (formats[cat] || formats.bridges).forEach(function(fmt, i) {
            var btn = document.createElement('button');
            btn.className = 'format-btn' + (i === 0 ? ' active' : '');
            btn.setAttribute('data-format', fmt.id);
            btn.onclick = function() { window.selectFormat(this); };
            btn.innerHTML = '<i class="fas ' + fmt.icon + '"></i> ' + fmt.label;
            formatContainer.appendChild(btn);
        });

        updateTableColumns(cat);
        sortState = { column: null, direction: 'asc' };

        if (cat === 'bridges') {
            if (bridgesData.length === 0) fetchBridges();
            else { rebuildBridgesTable(); updateTableColumns('bridges'); }
        } else if (cat === 'inspections') {
            if (inspectionsData.length === 0) fetchInspections();
            else { rebuildInspectionsTable(); updateTableColumns('inspections'); }
        } else if (cat === 'reports') {
            if (reportsData.length > 0) { rebuildReportsTable(); updateTableColumns('reports'); }
            else if (inspectionsData.length > 0) { buildReportsFromInspections(); updateTableColumns('reports'); }
            else { fetchInspections().then(function() { buildReportsFromInspections(); updateTableColumns('reports'); }); }
        }
    };

    // ============================================
    // CHECKBOXES
    // ============================================
    function bindCheckboxEvents() {
        var selectAll = document.getElementById('selectAll');
        if (selectAll) {
            var newSA = selectAll.cloneNode(true);
            selectAll.parentNode.replaceChild(newSA, selectAll);
            newSA.addEventListener('change', function() {
                var checked = this.checked;
                var ids = selectedIds[currentCategory];
                document.querySelectorAll('.row-check').forEach(function(cb) {
                    cb.checked = checked;
                    var id = cb.getAttribute('data-id');
                    if (checked) ids.add(id); else ids.delete(id);
                });
                updateSelectionCount();
            });
        }
        document.querySelectorAll('.row-check').forEach(function(cb) {
            cb.removeEventListener('change', onRowCheckChange);
            cb.addEventListener('change', onRowCheckChange);
        });
        syncSelectAllState();
    }

    // A checked/unchecked row - updates the persistent per-category Set
    // (not just this box) so the selection survives paging away and back.
    function onRowCheckChange() {
        var id = this.getAttribute('data-id');
        if (this.checked) selectedIds[currentCategory].add(id);
        else selectedIds[currentCategory].delete(id);
        updateSelectionCount();
    }

    // The header checkbox can only ever toggle the current page's rows, so
    // reflect that honestly: checked when every visible row is selected,
    // indeterminate when only some are, rather than claiming an all-or-
    // nothing state that isn't true once other pages have selections too.
    function syncSelectAllState() {
        var selectAll = document.getElementById('selectAll');
        if (!selectAll) return;
        var boxes = document.querySelectorAll('.row-check');
        var checkedCount = document.querySelectorAll('.row-check:checked').length;
        selectAll.checked = boxes.length > 0 && checkedCount === boxes.length;
        selectAll.indeterminate = checkedCount > 0 && checkedCount < boxes.length;
    }

    function currentFilteredData() {
        return currentCategory === 'bridges' ? filteredBridgesData :
               currentCategory === 'inspections' ? filteredInspectionsData : filteredReportsData;
    }

    function updateSelectionCount() {
        var count = selectedIds[currentCategory].size;
        var total = currentCategory === 'bridges' ? bridgesData.length :
                    currentCategory === 'inspections' ? inspectionsData.length : reportsData.length;
        var filteredTotal = currentFilteredData().length;
        var html = '<strong>' + count + '</strong> of <strong>' + total + '</strong> records selected';

        // .row-check only ever exists in the DOM for the current page, so
        // checking "select all" there can only reach rowsPerPage records -
        // once that happens and more pages match the filter, offer to
        // extend the selection to everything matching it.
        var pageBoxes = document.querySelectorAll('.row-check');
        var pageChecked = document.querySelectorAll('.row-check:checked').length;
        if (filteredTotal > rowsPerPage && pageBoxes.length > 0 && pageChecked === pageBoxes.length && count < filteredTotal) {
            html += ' &nbsp;<a href="#" class="selection-action" onclick="selectAllFiltered(); return false;">' +
                'Select all ' + filteredTotal + ' matching records</a>';
        }
        if (count > 0) {
            html += ' &nbsp;<a href="#" class="selection-action" onclick="clearSelection(); return false;">Clear</a>';
        }
        document.querySelector('.selection-info').innerHTML = html;
        syncSelectAllState();
    }

    // Extends the selection beyond the current page to every record
    // matching the active filter/search, not just the rowsPerPage visible.
    window.selectAllFiltered = function() {
        var ids = selectedIds[currentCategory];
        currentFilteredData().forEach(function(item) { ids.add(String(item.id)); });
        document.querySelectorAll('.row-check').forEach(function(cb) { cb.checked = true; });
        updateSelectionCount();
    };

    window.clearSelection = function() {
        selectedIds[currentCategory].clear();
        document.querySelectorAll('.row-check').forEach(function(cb) { cb.checked = false; });
        updateSelectionCount();
    };

    // ============================================
    // EXPORT — shared helpers
    // ============================================

    // Build a row array using only checked columns
    // Special key '_coords' synthesises lat/lon into one cell
    function buildExportRow(item, checkedCols) {
        return checkedCols.map(function(col) {
            if (col.key === '_coords') {
                var lat = item.latitude  ? parseFloat(item.latitude).toFixed(6)  : '';
                var lon = item.longitude ? parseFloat(item.longitude).toFixed(6) : '';
                return lat && lon ? lat + ', ' + lon : '--';
            }
            var val = item[col.key];
            return val !== null && val !== undefined ? val : '';
        });
    }

    function buildExportHeaders(checkedCols) {
        return checkedCols.map(function(c) { return c.label; });
    }

    // ============================================
    // START EXPORT
    // ============================================
    window.startExport = async function() {
        // The persistent per-category Set (not just whatever .row-check
        // boxes are on the current page) - see selectAllFiltered() above.
        var exportIds = Array.from(selectedIds[currentCategory]);
        if (exportIds.length === 0) {
            showToast('Please select at least one record to export', 'error');
            return;
        }

        var checkedCols = getCheckedCols();
        if (checkedCols.length === 0) {
            showToast('Please select at least one column to export', 'error');
            return;
        }

        var format = document.querySelector('.format-btn.active').getAttribute('data-format').toLowerCase();
        var formatLabels = { bci_pdf: 'BCI PDF', pdf: 'PDF', docx: 'DOCX', csv: 'CSV', json: 'JSON', xml: 'XML', xlsx: 'Excel' };
        var formatLabel = formatLabels[format] || format.toUpperCase();
        var overlay = document.getElementById('progressOverlay');
        var fill    = document.getElementById('progressFill');
        var percent = document.getElementById('progressPercent');
        var text    = document.getElementById('progressText');

        text.textContent = 'Exporting ' + exportIds.length + ' records to ' + formatLabel + '...';
        overlay.classList.add('active');

        try {
            var exportData = [];
            if (currentCategory === 'bridges') {
                exportData = bridgesData.filter(function(b) { return exportIds.includes(String(b.id)); });
            } else if (currentCategory === 'inspections') {
                exportData = inspectionsData.filter(function(i) { return exportIds.includes(String(i.id)); });
            } else if (currentCategory === 'reports') {
                exportData = reportsData.filter(function(r) { return exportIds.includes(String(r.id)); });
            }

            for (var p = 0; p <= 100; p += 20) {
                await new Promise(function(r) { setTimeout(r, 80); });
                fill.style.width = p + '%';
                percent.textContent = p + '%';
            }

            if (format === 'csv')        exportToCSV(exportData, checkedCols);
            else if (format === 'json')  exportToJSON(exportData, checkedCols);
            else if (format === 'xml')   exportToXML(exportData, checkedCols);
            else if (format === 'xlsx')  await exportToExcel(exportData, checkedCols);
            else if (format === 'pdf') {
                if (currentCategory === 'reports') {
                    for (var i = 0; i < exportData.length; i++) {
                        text.textContent = 'Generating PDF report ' + (i + 1) + ' of ' + exportData.length + '...';
                        await downloadReport(exportData[i].inspection_id);
                        await new Promise(function(r) { setTimeout(r, 300); });
                    }
                } else {
                    await exportToPDF(exportData, checkedCols);
                }
            } else if (format === 'bci_pdf') {
                if (currentCategory === 'reports') {
                    for (var k = 0; k < exportData.length; k++) {
                        text.textContent = 'Generating BCI Proforma ' + (k + 1) + ' of ' + exportData.length + '...';
                        await generateReport(exportData[k].inspection_id);
                        await new Promise(function(r) { setTimeout(r, 300); });
                    }
                } else {
                    showToast('BCI PDF export is only available for Reports', 'info');
                }
            } else if (format === 'docx') {
                if (currentCategory === 'reports') {
                    for (var j = 0; j < exportData.length; j++) {
                        text.textContent = 'Generating Word report ' + (j + 1) + ' of ' + exportData.length + '...';
                        await generateReportDocx(exportData[j].inspection_id);
                        await new Promise(function(r) { setTimeout(r, 300); });
                    }
                } else {
                    showToast('DOCX export is only available for Reports', 'info');
                }
            }

            fill.style.width = '100%';
            percent.textContent = '100%';

            setTimeout(function() {
                overlay.classList.remove('active');
                showToast(exportIds.length + ' records exported to ' + formatLabel, 'success');
                fill.style.width = '0%';
                percent.textContent = '';
                addActivity(exportIds.length, formatLabel);
            }, 500);

        } catch (error) {
            console.error('Export error:', error);
            overlay.classList.remove('active');
            showToast('Export failed: ' + error.message, 'error');
        }
    };

    // ============================================
    // EXPORT TO CSV
    // ============================================
    function exportToCSV(data, checkedCols) {
        if (!data || data.length === 0) return;
        var headers = buildExportHeaders(checkedCols);
        var rows    = data.map(function(item) { return buildExportRow(item, checkedCols); });

        var csv = headers.join(',') + '\n';
        rows.forEach(function(row) {
            csv += row.map(function(cell) {
                var s = String(cell);
                if (s.includes(',') || s.includes('"') || s.includes('\n')) {
                    return '"' + s.replace(/"/g, '""') + '"';
                }
                return s;
            }).join(',') + '\n';
        });

        downloadBlob(csv, 'text/csv;charset=utf-8;', currentCategory + '_export_' + ts() + '.csv');
    }

    // ============================================
    // EXPORT TO JSON
    // ============================================
    function exportToJSON(data, checkedCols) {
        // Build objects with only the selected columns
        var exportObj = {
            category: currentCategory,
            exportDate: new Date().toISOString(),
            columns: buildExportHeaders(checkedCols),
            count: data.length,
            data: data.map(function(item) {
                var obj = {};
                checkedCols.forEach(function(col) {
                    obj[col.id] = col.key === '_coords'
                        ? (item.latitude || '') + ', ' + (item.longitude || '')
                        : (item[col.key] !== undefined ? item[col.key] : null);
                });
                return obj;
            })
        };
        downloadBlob(JSON.stringify(exportObj, null, 2), 'application/json',
            currentCategory + '_export_' + ts() + '.json');
    }

    // ============================================
    // EXPORT TO XML
    // ============================================
    function exportToXML(data, checkedCols) {
        var xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
        xml += '<records category="' + currentCategory + '" exportDate="' + new Date().toISOString() + '" count="' + data.length + '">\n';
        data.forEach(function(item) {
            xml += '  <record>\n';
            checkedCols.forEach(function(col) {
                var val = col.key === '_coords'
                    ? (item.latitude || '') + ', ' + (item.longitude || '')
                    : (item[col.key] !== undefined ? item[col.key] : '');
                xml += '    <' + col.id + '>' + String(val).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') + '</' + col.id + '>\n';
            });
            xml += '  </record>\n';
        });
        xml += '</records>';
        downloadBlob(xml, 'application/xml', currentCategory + '_export_' + ts() + '.xml');
    }

    // ============================================
    // EXPORT TO EXCEL
    // ============================================
    async function exportToExcel(data, checkedCols) {
        if (typeof XLSX === 'undefined') {
            await loadScript('https://cdn.sheetjs.com/xlsx-0.20.2/package/dist/xlsx.full.min.js');
        }
        var wsData = [buildExportHeaders(checkedCols)];
        data.forEach(function(item) { wsData.push(buildExportRow(item, checkedCols)); });
        var ws = XLSX.utils.aoa_to_sheet(wsData);
        var wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, currentCategory);
        XLSX.writeFile(wb, currentCategory + '_export_' + ts() + '.xlsx');
    }

    // ============================================
    // EXPORT TO PDF (table)
    // ============================================
    async function exportToPDF(data, checkedCols) {
        if (typeof window.jspdf === 'undefined') {
            await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
        }
        if (typeof window.jspdf?.autoTable === 'undefined') {
            await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.28/jspdf.plugin.autotable.min.js');
        }
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF('landscape');
        doc.setFontSize(16);
        doc.text(currentCategory.toUpperCase() + ' Export', 14, 15);
        doc.setFontSize(10);
        doc.text('Generated: ' + new Date().toLocaleString(), 14, 25);
        doc.text('Records: ' + data.length, 14, 32);
        doc.autoTable({
            head: [buildExportHeaders(checkedCols)],
            body: data.map(function(item) { return buildExportRow(item, checkedCols); }),
            startY: 40,
            styles: { fontSize: 8, cellPadding: 2 },
            headStyles: { fillColor: [91, 140, 138], textColor: [255, 255, 255] },
            alternateRowStyles: { fillColor: [245, 247, 251] }
        });
        doc.save(currentCategory + '_export_' + ts() + '.pdf');
    }

    // ============================================
    // HELPERS
    // ============================================
    function ts() { return new Date().toISOString().slice(0, 19).replace(/:/g, '-'); }

    function downloadBlob(content, mimeType, filename) {
        var blob = new Blob([content], { type: mimeType });
        var url  = URL.createObjectURL(blob);
        var a    = document.createElement('a');
        a.href   = url;
        a.setAttribute('download', filename);
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    function loadScript(src) {
        return new Promise(function(resolve, reject) {
            var s  = document.createElement('script');
            s.src  = src;
            s.onload  = resolve;
            s.onerror = reject;
            document.head.appendChild(s);
        });
    }

    function addActivity(count, format) {
        var list = document.getElementById('activityList');
        var item = document.createElement('div');
        item.className = 'activity-item';
        var catTitle = currentCategory === 'bridges' ? 'Bridge Records' :
                       currentCategory === 'inspections' ? 'Inspection Records' : 'Report Files';
        item.innerHTML =
            '<div class="activity-icon success"><i class="fas fa-check"></i></div>' +
            '<div class="activity-content">' +
                '<div class="activity-title">' + catTitle + ' exported to ' + format + '</div>' +
                '<div class="activity-meta">' + count + ' records &bull; Just now</div>' +
            '</div>' +
            '<div class="activity-time">Just now</div>';
        list.insertBefore(item, list.firstChild);
    }

    // ============================================
    // REPORT ACTIONS (unchanged logic)
    // ============================================
    window.generateReport = async function(inspectionId) {
        var inspection = inspectionsData.find(function(i) { return i.id === inspectionId; });
        if (!inspection) { showToast('Inspection not found', 'error'); return; }

        var overlay = document.getElementById('progressOverlay');
        var fill    = document.getElementById('progressFill');
        var percent = document.getElementById('progressPercent');
        var text    = document.getElementById('progressText');

        text.textContent = 'Generating BCI Proforma for ' + (inspection.structure_name || inspectionId) + '...';
        overlay.classList.add('active');
        fill.style.width = '10%';

        try {
            var structureId    = inspection.structure_id || '';
            var inspectionDate = inspection.inspection_date || '';

            // ✅ Fetch real bridge data
            var bridgeRes = await fetch(API_BASE + '/api/bridges/' + structureId);
            if (!bridgeRes.ok) throw new Error('Failed to fetch bridge data');
            var bridge = await bridgeRes.json();
            var totalSpans = bridge.span_number || inspection.total_spans || 1;

            fill.style.width = '30%';

            // ✅ Fetch real defects
            var defectsRes = await fetch(
                API_BASE + '/api/defectsbci?structureId=' + structureId + '&date=' + inspectionDate
            );
            if (!defectsRes.ok) throw new Error('Failed to fetch defects');
            var spansData = await defectsRes.json();

            fill.style.width = '50%';

            // ✅ Fetch real works required
            var worksRes = await fetch(
                API_BASE + '/api/worksrequired?structureId=' + structureId + '&date=' + inspectionDate
            );
            if (!worksRes.ok) throw new Error('Failed to fetch works required');
            var worksRequired = await worksRes.json();

            fill.style.width = '70%';

            // ✅ Build proper bciFormData with real data
            var bciFormData = {
                structureName:  inspection.structure_name || '',
                structureId:    structureId,
                bridgeData:     bridge,
                totalSpans:     totalSpans,
                spansData:      spansData,
                worksRequired:  worksRequired
            };

            if (typeof pdfMake === 'undefined' || typeof buildBCIProformaContent !== 'function') {
                throw new Error('PDF libraries not loaded. Please refresh the page.');
            }

            fill.style.width = '85%';

            var docDef = {
                pageSize: 'A4',
                pageMargins: [40, 40, 40, 40],
                content: buildBCIProformaFullContent(bciFormData),
                defaultStyle: { font: 'Roboto' }
            };

            var fileName = 'BCI_Proforma_' + structureId + '_' + inspectionDate + '.pdf';
            pdfMake.createPdf(docDef).download(fileName);

            fill.style.width = '100%';
            percent.textContent = '100%';

            setTimeout(function() {
                overlay.classList.remove('active');
                showToast('BCI Proforma generated: ' + fileName, 'success');
                fill.style.width = '0%';
                percent.textContent = '';
                addActivity(1, 'BCI Proforma');
            }, 500);

        } catch (error) {
            console.error('BCI generation error:', error);
            overlay.classList.remove('active');
            showToast('Report generation failed: ' + error.message, 'error');
            fill.style.width = '0%';
            percent.textContent = '';
        }
    };

    // ============================================
    // GENERATE REPORT (DOCX) - full narrative report (structure details,
    // location map, per-element defect descriptions, conclusions/remedial
    // works, photo appendix). Deliberately excludes the BCI Proforma grid.
    // ============================================
    window.generateReportDocx = async function(inspectionId) {
        var inspection = inspectionsData.find(function(i) { return i.id === inspectionId; });
        if (!inspection) { showToast('Inspection not found', 'error'); return; }

        var overlay = document.getElementById('progressOverlay');
        var fill    = document.getElementById('progressFill');
        var percent = document.getElementById('progressPercent');
        var text    = document.getElementById('progressText');

        text.textContent = 'Generating Word report for ' + (inspection.structure_name || inspectionId) + '...';
        overlay.classList.add('active');
        fill.style.width = '10%';

        try {
            if (typeof window.docx === 'undefined') {
                await loadScript('https://cdn.jsdelivr.net/npm/docx@9.7.1/dist/index.iife.js');
            }
            if (typeof buildFullInspectionReportDocx !== 'function') {
                throw new Error('DOCX generator not loaded. Please refresh the page.');
            }

            fill.style.width = '25%';

            var docInfo = {
                structure_id: inspection.structure_id || '',
                structure_name: inspection.structure_name || '',
                date: inspection.inspection_date || ''
            };

            var wordDoc = await buildFullInspectionReportDocx(docInfo);
            fill.style.width = '85%';

            var blob = await window.docx.Packer.toBlob(wordDoc);
            fill.style.width = '95%';

            var fileName = (inspection.structure_name || 'Report').replace(/[^a-z0-9]/gi, '_') + '_Inspection_Report_' + inspection.inspection_date + '.docx';
            var url = URL.createObjectURL(blob);
            var a = document.createElement('a');
            a.href = url;
            a.setAttribute('download', fileName);
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            fill.style.width = '100%';
            percent.textContent = '100%';

            setTimeout(function() {
                overlay.classList.remove('active');
                showToast('Word report generated: ' + fileName, 'success');
                fill.style.width = '0%';
                percent.textContent = '';
                addActivity(1, 'Inspection Report (Word)');
            }, 500);

        } catch (error) {
            console.error('DOCX generation error:', error);
            overlay.classList.remove('active');
            showToast('Word report generation failed: ' + error.message, 'error');
            fill.style.width = '0%';
            percent.textContent = '';
        }
    };

    window.downloadReport = async function(inspectionId) {
        var inspection = inspectionsData.find(function(i) { return i.id === inspectionId; });
        if (!inspection) { showToast('Inspection not found', 'error'); return; }
        if (typeof window.generateSimplePDFReport !== 'function') { showToast('Report generator not loaded.', 'error'); return; }
        var overlay = document.getElementById('progressOverlay');
        var fill    = document.getElementById('progressFill');
        var percent = document.getElementById('progressPercent');
        var text    = document.getElementById('progressText');
        text.textContent = 'Downloading report for ' + (inspection.structure_name || inspectionId) + '...';
        overlay.classList.add('active'); fill.style.width = '30%';
        try {
            sessionStorage.setItem('structureId', inspection.structure_id || '');
            sessionStorage.setItem('structureName', inspection.structure_name || '');
            var doc = { structure_id: inspection.structure_id || '', structure_name: inspection.structure_name || '', date: inspection.inspection_date || '' };
            fill.style.width = '60%';
            await window.generateSimplePDFReport(doc, 'download');
            fill.style.width = '100%'; percent.textContent = '100%';
            setTimeout(function() { overlay.classList.remove('active'); showToast('Report downloaded', 'success'); fill.style.width = '0%'; percent.textContent = ''; addActivity(1, 'PDF Download'); }, 500);
        } catch (error) {
            overlay.classList.remove('active');
            showToast('Download failed: ' + error.message, 'error');
            fill.style.width = '0%'; percent.textContent = '';
        }
    };

    window.refreshData = function() {
        var btn = document.querySelector('.btn-icon[title="Refresh"] i');
        if (btn) btn.classList.add('fa-spin');
        var done = function() { if (btn) btn.classList.remove('fa-spin'); };
        if (currentCategory === 'bridges') fetchBridges().then(done);
        else if (currentCategory === 'inspections') fetchInspections().then(done);
        else fetchInspections().then(function() { buildReportsFromInspections(); done(); });
    };

    // ============================================
    // TOAST
    // ============================================
    function showToast(message, type) {
        var container = document.getElementById('toastContainer');
        var toast = document.createElement('div');
        toast.className = 'toast';
        var iconMap = { success: 'check', error: 'times', info: 'info' };
        var icon = iconMap[type] || 'info';
        toast.innerHTML =
            '<div class="toast-icon ' + type + '"><i class="fas fa-' + icon + '"></i></div>' +
            '<div class="toast-content">' +
                '<div class="toast-title">' + (type.charAt(0).toUpperCase() + type.slice(1)) + '</div>' +
                '<div class="toast-msg">' + message + '</div>' +
            '</div>' +
            '<button class="toast-close" onclick="this.parentElement.remove()"><i class="fas fa-times"></i></button>';
        container.appendChild(toast);
        setTimeout(function() { toast.classList.add('show'); }, 10);
        setTimeout(function() { toast.classList.remove('show'); setTimeout(function() { toast.remove(); }, 400); }, 4000);
    }

    // ============================================
    // INIT
    // ============================================
    bindCheckboxEvents();
    activeColumns = deepCloneCols(COLUMN_DEFS.bridges);
    // Default category is Bridges, which uses the year-range filter, not the column picker
    document.getElementById('rightPanelTitle').innerHTML = '<i class="fas fa-calendar-alt"></i> Built Year Range';
    document.getElementById('colPickerGrid').style.display = 'none';
    document.getElementById('colPickerFooter').style.display = 'none';
    document.getElementById('yearRangeFilter').style.display = 'flex';
    fetchBridges();
    // Pre-fetch inspections in background so counts appear quickly
    fetchInspections();

})();
