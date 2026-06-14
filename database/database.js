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
            { id: 'bciav',    label: 'BCI Av',          key: 'overall_bciave', checked: true },
            { id: 'bcicrit',  label: 'BCI Crit',        key: 'overall_bcicrit',checked: true },
            { id: 'type',     label: 'Type',            key: 'inspection_type',checked: true },
            { id: 'tspans',   label: 'Total spans',     key: 'total_spans',    checked: false },
        ],
        reports: [
            { id: 'id',       label: 'Report ID',       key: 'id',             checked: true },
            { id: 'sid',      label: 'Structure ID',    key: 'structure_id',   checked: true },
            { id: 'bridge',   label: 'Bridge',          key: 'bridge',         checked: true },
            { id: 'type',     label: 'Type',            key: 'type',           checked: true },
            { id: 'generated',label: 'Generated',       key: 'generated',      checked: true },
            { id: 'size',     label: 'Size',            key: 'size',           checked: true },
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
        if (localStorage.getItem('nightMode') === 'on') {
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
    function rebuildBridgesTable() {
        var tbody = document.getElementById('tableBody');
        var rowsHtml = '';

        if (bridgesData.length === 0) {
            rowsHtml = '<tr><td colspan="9" style="text-align:center;padding:40px;color:#8a9ba8;">' +
                '<i class="fas fa-database" style="font-size:2rem;margin-bottom:12px;display:block;"></i>' +
                'No bridges found</td></tr>';
        } else {
            var filteredData = bridgesData;
            if (currentFilter !== 'all') {
                var filterType = currentFilter.replace(/_/g, ' ');
                filteredData = bridgesData.filter(function(bridge) {
                    return bridge.type && bridge.type.toLowerCase() === filterType.toLowerCase();
                });
            }

            if (sortState.column && sortState.column !== '') {
                sortData(filteredData, sortState.column);
            } else {
                filteredData.sort(function(a, b) {
                    var nameA = (a.name || '').toLowerCase();
                    var nameB = (b.name || '').toLowerCase();
                    if (nameA !== nameB) return nameA.localeCompare(nameB);
                    return (parseInt(a.id) || 0) - (parseInt(b.id) || 0);
                });
            }

            filteredData.forEach(function(row) {
                var lat = row.latitude ? parseFloat(row.latitude).toFixed(6) : '--';
                var lon = row.longitude ? parseFloat(row.longitude).toFixed(6) : '--';
                var typeMap = {
                    'bridge': 'Bridge', 'footbridge': 'Footbridge',
                    'retaining_wall': 'Retaining Wall', 'culvert': 'Culvert',
                    'tunnel': 'Tunnel', 'viaduct': 'Viaduct'
                };
                var typeLabel = typeMap[(row.type || '').toLowerCase()] ||
                    (row.type ? row.type.charAt(0).toUpperCase() + row.type.slice(1).replace(/_/g, ' ') : '--');

                rowsHtml += '<tr>' +
                    '<td class="col-check"><input type="checkbox" class="row-check" data-id="' + row.id + '"></td>' +
                    '<td><strong>' + (row.id || '--') + '</strong></td>' +
                    '<td>' + (row.name || '--') + '</td>' +
                    '<td>' + lat + '°, ' + lon + '°</td>' +
                    '<td>' + typeLabel + '</td>' +
                    '<td>' + (row.built_year || '--') + '</td>' +
                    '<td>' + (row.span_number || '0') + '</td>' +
                    '<td>' + formatDate(row.last_inspected) + '</td>' +
                    '<td></td>' +
                '</tr>';
            });
        }

        tbody.innerHTML = rowsHtml;
        var total = currentFilter !== 'all' ? filteredData.length : bridgesData.length;
        document.querySelector('.selection-info').innerHTML =
            '<strong>0</strong> of <strong>' + total + '</strong> records selected';
        bindCheckboxEvents();
    }

    // ============================================
    // SORT STATE
    // ============================================
    var sortState = { column: null, direction: 'asc' };

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
                { label: 'Coordinates', sortable: false },
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
                { label: 'BCI Av', sortable: true, key: 'overall_bciave' },
                { label: 'BCI Crit', sortable: true, key: 'overall_bcicrit' },
                { label: 'Type', sortable: false },
                { label: 'Total Spans', sortable: false }
            ],
            reports: [
                { label: 'Report ID', sortable: true, key: 'id' },
                { label: 'Structure ID', sortable: true, key: 'structure_id' },
                { label: 'Bridge', sortable: true, key: 'bridge' },
                { label: 'Type', sortable: false },
                { label: 'Generated', sortable: false },
                { label: 'Size', sortable: true, key: 'size' }
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
        html += '<th></th></tr>';
        thead.innerHTML = html;
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
            if (key === 'size') { valA = parseSizeToKB(valA); valB = parseSizeToKB(valB); }
            else if (key === 'id') { valA = parseID(valA); valB = parseID(valB); }
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

    function parseSizeToKB(s) {
        if (!s) return 0;
        var m = String(s).match(/^([\d.]+)\s*(KB|MB)$/i);
        if (!m) return 0;
        return m[2].toUpperCase() === 'MB' ? parseFloat(m[1]) * 1024 : parseFloat(m[1]);
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
    var filteredInspectionsData = [];
    var filteredReportsData = [];

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
        
        // Filter data
        filteredInspectionsData = inspectionsData.filter(function(row) {
            if (currentFilter === 'all') return true;
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
            rowsHtml = '<tr><td colspan="12" style="text-align:center;padding:40px;color:#8a9ba8;">' +
                '<i class="fas fa-database" style="font-size:2rem;margin-bottom:12px;display:block;"></i>' +
                'No inspections found</td></tr>';
        } else {
            displayData.forEach(function(row) {
                var typeMap = { 'PI': 'Principal Inspection', 'GI': 'General Inspection', 'SI': 'Superficial Inspection' };
                var typeLabel = typeMap[row.inspection_type] || row.inspection_type || 'Inspection';
                var bciAv   = row.overall_bciave   != null ? Math.round(parseFloat(row.overall_bciave))   : '--';
                var bciCrit = row.overall_bcicrit  != null ? Math.round(parseFloat(row.overall_bcicrit))  : '--';

                rowsHtml += '<tr>' +
                    '<td class="col-check"><input type="checkbox" class="row-check" data-id="' + row.id + '"></td>' +
                    '<td><strong>' + (row.id || '--') + '</strong></td>' +
                    '<td>' + (row.structure_id || '--') + '</td>' +
                    '<td>' + (row.structure_name || '--') + '</td>' +
                    '<td>' + (row.inspector_name || '--') + '</td>' +
                    '<td>' + formatDate(row.inspection_date) + '</td>' +
                    '<td><span style="color:#5b8c8a;font-weight:600;">' + bciAv + '</span></td>' +
                    '<td><span style="color:#e8a87c;font-weight:600;">' + bciCrit + '</span></td>' +
                    '<td><span class="status-badge completed"><i class="fas fa-check-circle"></i> ' + typeLabel + '</span></td>' +
                    '<td>' + (row.total_spans || '0') + '</td>' +
                    '<td></td>' +
                '</tr>';
            });
        }

        tbody.innerHTML = rowsHtml;
        
        // Add pagination controls
        addPaginationControls(totalPages, totalRecords, 'inspections');
        
        document.querySelector('.selection-info').innerHTML =
            '<strong>0</strong> of <strong>' + totalRecords + '</strong> records selected';
        bindCheckboxEvents();
    }

    // ============================================
    // REPORTS TABLE
    // ============================================
    async function fetchReports() {
        try {
            showLoading(true);
            var res = await fetch(API_BASE + '/api/reports');
            if (!res.ok) { buildReportsFromInspections(); return; }
            reportsData = await res.json();
            if (currentCategory === 'reports') rebuildReportsTable();
            showToast('Loaded ' + reportsData.length + ' reports', 'success');
        } catch (err) {
            buildReportsFromInspections();
        } finally {
            showLoading(false);
        }
    }

    function buildReportsFromInspections() {
        reportsData = inspectionsData.map(function(inspection) {
            var bciAv   = inspection.overall_bciave   != null ? Math.round(parseFloat(inspection.overall_bciave))  : null;
            var bciCrit = inspection.overall_bcicrit  != null ? Math.round(parseFloat(inspection.overall_bcicrit)) : null;
            var status  = 'Ready';
            if (bciAv !== null && bciAv < 40) status = 'Critical';
            else if (bciAv !== null && bciAv < 65) status = 'Urgent';

            var spanCount = inspection.total_spans || 1;
            var estSizeKB = Math.round(spanCount * 35 + 2 * 35);
            var sizeStr   = estSizeKB < 1024 ? estSizeKB + ' KB' : (estSizeKB / 1024).toFixed(1) + ' MB';

            var rawType     = inspection.inspection_type || 'GI';
            var displayType = rawType === 'PI' ? 'Principal' : rawType === 'SI' ? 'Superficial' : 'General';

            return {
                id: 'RPT-' + inspection.id,
                inspection_id: inspection.id,
                structure_id: inspection.structure_id,
                bridge: inspection.structure_name || '--',
                type: rawType,
                display_type: displayType,
                generated: inspection.inspection_date || '--',
                size: sizeStr,
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
        
        // Filter data
        filteredReportsData = reportsData.filter(function(row) {
            if (currentFilter === 'all') return true;
            return row.type === currentFilter;
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
            rowsHtml = '<tr><td colspan="9" style="text-align:center;padding:40px;color:#8a9ba8;">' +
                '<i class="fas fa-file-alt" style="font-size:2rem;margin-bottom:12px;display:block;"></i>' +
                'No reports found.</td></tr>';
        } else {
            displayData.forEach(function(row) {
                rowsHtml += '<tr>' +
                    '<td class="col-check"><input type="checkbox" class="row-check" data-id="' + row.id + '"></td>' +
                    '<td><strong>' + (row.id || '--') + '</strong></td>' +
                    '<td>' + (row.structure_id || '--') + '</td>' +
                    '<td>' + (row.bridge || '--') + '</td>' +
                    '<td><span class="status-badge ' +
                        (row.type === 'PI' ? 'active' : row.type === 'GI' ? 'completed' : 'monitoring') + '">' +
                        (row.display_type || '--') + '</span></td>' +
                    '<td>' + formatDate(row.generated) + '</td>' +
                    '<td>' + (row.size || '--') + '</td>' +
                    '<td><div class="row-actions">' +
                        '<button title="Generate BCI Proforma" onclick="generateReport(' + row.inspection_id + ')" class="btn-report"><i class="fas fa-file-pdf"></i></button>' +
                        '<button title="View Report" onclick="viewInspection(' + row.inspection_id + ')"><i class="fas fa-eye"></i></button>' +
                        '<button title="Download Report" onclick="downloadReport(' + row.inspection_id + ')"><i class="fas fa-download"></i></button>' +
                    '</div></td>' +
                '</tr>';
            });
        }


        tbody.innerHTML = rowsHtml;
        
        // Add pagination controls
        addPaginationControls(totalPages, totalRecords, 'reports');
        
        document.querySelector('.selection-info').innerHTML =
            '<strong>0</strong> of <strong>' + totalRecords + '</strong> records selected';
        bindCheckboxEvents();
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
        if (currentCategory === 'inspections') {
            rebuildInspectionsTable();
        } else if (currentCategory === 'reports') {
            rebuildReportsTable();
        }
    };

    window.changeRowsPerPage = function(rows) {
        rowsPerPage = parseInt(rows);
        currentPage = 1;
        if (currentCategory === 'inspections') {
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
                { id: 'culvert', icon: 'fa-water', label: 'Culverts', color: '#f97316' }
            ],
            inspections: [
                { id: 'all', icon: 'fa-check', label: 'All Inspections' },
                { id: 'GI', icon: 'fa-chart-line', label: 'General (GI)', color: '#8ab4b0' },
                { id: 'PI', icon: 'fa-building', label: 'Principal (PI)', color: '#5b8c8a' },
                { id: 'SI', icon: 'fa-eye', label: 'Superficial (SI)', color: '#eab308' }
            ],
            reports: [
                { id: 'all', icon: 'fa-check', label: 'All Reports' },
                { id: 'GI', icon: 'fa-chart-line', label: 'General (GI)', color: '#8ab4b0' },
                { id: 'PI', icon: 'fa-building', label: 'Principal (PI)', color: '#5b8c8a' },
                { id: 'SI', icon: 'fa-eye', label: 'Superficial (SI)', color: '#eab308' }
            ]
        };
        (filters[cat] || filters.bridges).forEach(function(f, i) {
            var btn = document.createElement('button');
            btn.className = 'filter-chip' + (i === 0 ? ' active' : '');
            btn.onclick = function() { window.setFilter(this, f.id); };
            btn.innerHTML = '<i class="fas ' + f.icon + '"' + (f.color ? ' style="color:' + f.color + '"' : '') + '></i> ' + f.label;
            filtersBar.appendChild(btn);
        });

        // Update formats
        var formatContainer = document.getElementById('formatOptions');
        formatContainer.innerHTML = '';
        var formats = {
            bridges:      [{ id:'csv',icon:'fa-file-csv',label:'CSV' },{ id:'json',icon:'fa-file-code',label:'JSON' },{ id:'xml',icon:'fa-file-code',label:'XML' }],
            inspections:  [{ id:'csv',icon:'fa-file-csv',label:'CSV' },{ id:'xlsx',icon:'fa-file-excel',label:'Excel' },{ id:'pdf',icon:'fa-file-pdf',label:'PDF' }],
            reports:      [{ id:'pdf',icon:'fa-file-pdf',label:'PDF' },{ id:'docx',icon:'fa-file-word',label:'DOCX' }]
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

        showToast('Switched to ' + cat.charAt(0).toUpperCase() + cat.slice(1), 'info');
    };

    // Add CSS for pagination controls
    var paginationStyles = document.createElement('style');
    paginationStyles.textContent = `
        /* Pagination Styles */
        .pagination-container {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 16px 24px;
            background: white;
            border-top: 1px solid #eef2f6;
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
            background: #232e34;
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
            showToast('Loaded ' + bridgesData.length + ' bridges', 'success');
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
            showToast('Loaded ' + inspectionsData.length + ' inspections', 'success');
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
                { id: 'culvert', icon: 'fa-water', label: 'Culverts', color: '#f97316' }
            ],
            inspections: [
                { id: 'all', icon: 'fa-check', label: 'All Inspections' },
                { id: 'GI', icon: 'fa-chart-line', label: 'General (GI)', color: '#8ab4b0' },
                { id: 'PI', icon: 'fa-building', label: 'Principal (PI)', color: '#5b8c8a' },
                { id: 'SI', icon: 'fa-eye', label: 'Superficial (SI)', color: '#eab308' }
            ],
            reports: [
                { id: 'all', icon: 'fa-check', label: 'All Reports' },
                { id: 'GI', icon: 'fa-chart-line', label: 'General (GI)', color: '#8ab4b0' },
                { id: 'PI', icon: 'fa-building', label: 'Principal (PI)', color: '#5b8c8a' },
                { id: 'SI', icon: 'fa-eye', label: 'Superficial (SI)', color: '#eab308' }
            ]
        };
        (filters[cat] || filters.bridges).forEach(function(f, i) {
            var btn = document.createElement('button');
            btn.className = 'filter-chip' + (i === 0 ? ' active' : '');
            btn.onclick = function() { window.setFilter(this, f.id); };
            btn.innerHTML = '<i class="fas ' + f.icon + '"' + (f.color ? ' style="color:' + f.color + '"' : '') + '></i> ' + f.label;
            filtersBar.appendChild(btn);
        });

        // Update formats
        var formatContainer = document.getElementById('formatOptions');
        formatContainer.innerHTML = '';
        var formats = {
            bridges:      [{ id:'csv',icon:'fa-file-csv',label:'CSV' },{ id:'json',icon:'fa-file-code',label:'JSON' },{ id:'xml',icon:'fa-file-code',label:'XML' }],
            inspections:  [{ id:'csv',icon:'fa-file-csv',label:'CSV' },{ id:'xlsx',icon:'fa-file-excel',label:'Excel' },{ id:'pdf',icon:'fa-file-pdf',label:'PDF' }],
            reports:      [{ id:'pdf',icon:'fa-file-pdf',label:'PDF' },{ id:'docx',icon:'fa-file-word',label:'DOCX' }]
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

        showToast('Switched to ' + cat.charAt(0).toUpperCase() + cat.slice(1), 'info');
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
                document.querySelectorAll('.row-check').forEach(function(cb) { cb.checked = checked; });
                updateSelectionCount();
            });
        }
        document.querySelectorAll('.row-check').forEach(function(cb) {
            cb.removeEventListener('change', updateSelectionCount);
            cb.addEventListener('change', updateSelectionCount);
        });
    }

    function updateSelectionCount() {
        var count = document.querySelectorAll('.row-check:checked').length;
        var total = currentCategory === 'bridges' ? bridgesData.length :
                    currentCategory === 'inspections' ? inspectionsData.length : reportsData.length;
        document.querySelector('.selection-info').innerHTML =
            '<strong>' + count + '</strong> of <strong>' + total + '</strong> records selected';
    }

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
        var selectedCheckboxes = document.querySelectorAll('.row-check:checked');
        if (selectedCheckboxes.length === 0) {
            showToast('Please select at least one record to export', 'error');
            return;
        }

        var selectedIds = [];
        selectedCheckboxes.forEach(function(cb) {
            var id = cb.getAttribute('data-id');
            if (id) selectedIds.push(id);
        });

        var checkedCols = getCheckedCols();
        if (checkedCols.length === 0) {
            showToast('Please select at least one column to export', 'error');
            return;
        }

        var format = document.querySelector('.format-btn.active').getAttribute('data-format').toLowerCase();
        var overlay = document.getElementById('progressOverlay');
        var fill    = document.getElementById('progressFill');
        var percent = document.getElementById('progressPercent');
        var text    = document.getElementById('progressText');

        text.textContent = 'Exporting ' + selectedIds.length + ' records to ' + format.toUpperCase() + '...';
        overlay.classList.add('active');

        try {
            var exportData = [];
            if (currentCategory === 'bridges') {
                exportData = bridgesData.filter(function(b) { return selectedIds.includes(String(b.id)); });
            } else if (currentCategory === 'inspections') {
                exportData = inspectionsData.filter(function(i) { return selectedIds.includes(String(i.id)); });
            } else if (currentCategory === 'reports') {
                exportData = reportsData.filter(function(r) { return selectedIds.includes(String(r.id)); });
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
                        text.textContent = 'Generating PDF ' + (i + 1) + ' of ' + exportData.length + '...';
                        await generateReport(exportData[i].inspection_id);
                        await new Promise(function(r) { setTimeout(r, 300); });
                    }
                } else {
                    await exportToPDF(exportData, checkedCols);
                }
            } else if (format === 'docx') {
                showToast('DOCX export coming soon', 'info');
            }

            fill.style.width = '100%';
            percent.textContent = '100%';

            setTimeout(function() {
                overlay.classList.remove('active');
                showToast(selectedIds.length + ' records exported to ' + format.toUpperCase(), 'success');
                fill.style.width = '0%';
                percent.textContent = '';
                addActivity(selectedIds.length, format.toUpperCase());
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
    window.viewInspection = async function(id) {
        var inspection = inspectionsData.find(function(i) { return i.id === id; });
        if (!inspection) { showToast('Inspection not found', 'error'); return; }
        sessionStorage.setItem('structureId', inspection.structure_id || '');
        sessionStorage.setItem('structureName', inspection.structure_name || '');
        var doc = { structure_id: inspection.structure_id || '', structure_name: inspection.structure_name || '', date: inspection.inspection_date || '' };
        await generateSimplePDFReport(doc, 'open');
    };

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
                content: [].concat(
                    buildBCIProformaContent(bciFormData),
                    buildBCIPage2Content(bciFormData)
                ),
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
    renderColPicker();
    fetchBridges();
    // Pre-fetch inspections in background so counts appear quickly
    fetchInspections();

})();

document.getElementById('toIndex').addEventListener('click', function() {
    window.location.href = '../map/map.html';
});
