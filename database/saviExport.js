/* ============================================================
   SAVI EXPORT - WORKBOOK GENERATOR
   ============================================================
   Populates SAVI v1.10's Elements tab (only) from spanSense's own
   condition data, by editing a copy of SAVI's real blank .xlsm
   template directly at the XML level - not regenerating the
   workbook through a spreadsheet library. SAVI is a locked macro
   workbook full of live formulas, hidden reference/calculation
   sheets and a VBA project; round-tripping it through a library
   that fully re-parses and rewrites the file risks silently
   dropping features that library doesn't understand (confirmed:
   even openpyxl warns it can't preserve this file's conditional
   formatting / data validation extensions on save). Editing only
   the Elements worksheet's own XML, and nothing else in the zip,
   guarantees everything else in the workbook is untouched.

   Template capacity: SAVI's blank Elements tab ships with exactly
   100 pre-built data rows (5-104), each already wired with the
   template's own per-row formulas (columns N, Z, AA). This exporter
   only ever adds values into those existing rows/cells - it never
   invents new rows or formulas - so 100 element-condition rows is a
   hard cap per export.
   ============================================================ */
(function (global) {
    'use strict';

    var TEMPLATE_URL = 'savi-template/savi-v110-blank.xlsm';
    var ELEMENTS_SHEET_PATH = 'xl/worksheets/sheet6.xml';
    var WORKBOOK_PATH = 'xl/workbook.xml';
    var MAX_ROWS = 100; // SAVI's blank template's pre-built Elements rows (5-104)
    var JSZIP_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';

    function loadScript(src) {
        return new Promise(function (resolve, reject) {
            if (document.querySelector('script[src="' + src + '"]')) { resolve(); return; }
            var s = document.createElement('script');
            s.src = src;
            s.onload = resolve;
            s.onerror = function () { reject(new Error('Failed to load ' + src)); };
            document.head.appendChild(s);
        });
    }

    async function ensureJSZip() {
        if (typeof JSZip === 'undefined') await loadScript(JSZIP_CDN);
        if (typeof JSZip === 'undefined') throw new Error('JSZip failed to load');
    }

    function escapeXml(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    // Fetch each selected structure's latest defects + primary span material,
    // and reduce them to one "worst condition per element" row each - the
    // same shape SAVI's Elements tab wants (one row per structure+element).
    async function fetchElementRows(bridges, apiBase) {
        var rows = [];
        var skippedNoMapping = 0;

        for (var i = 0; i < bridges.length; i++) {
            var b = bridges[i];
            var materialCode = null;
            try {
                var spansResp = await fetch(apiBase + '/api/bridges/' + b.id + '/spans', { credentials: 'include' });
                if (spansResp.ok) {
                    var spans = await spansResp.json();
                    if (spans && spans.length) materialCode = spans[0].primaryMaterialCode;
                }
            } catch (e) { /* material stays unmapped for this structure */ }
            var materialType = SaviMapping.saviMaterialType(materialCode);

            var defectsResp = await fetch(apiBase + '/api/latest-defects?structureId=' + b.id, { credentials: 'include' });
            if (!defectsResp.ok) continue;
            var data = await defectsResp.json();
            var defects = data.defects || [];

            var worstByElement = {};
            defects.forEach(function (d) {
                var code = SaviMapping.toSaviCondition(d.severity, d.extent);
                if (!code) return;
                var ecs = SaviMapping.SAVI_CONDITION_ECS[code];
                var existing = worstByElement[d.element_no];
                if (!existing || ecs > existing.ecs) {
                    worstByElement[d.element_no] = { code: code, ecs: ecs };
                }
            });

            Object.keys(worstByElement).forEach(function (elementNo) {
                var elementName = SaviMapping.saviElementName(b.type, parseInt(elementNo, 10));
                if (!elementName) { skippedNoMapping++; return; }
                rows.push({
                    structureId: b.id,
                    structureLabel: b.name || ('Structure ' + b.id),
                    elementName: elementName,
                    materialType: materialType,
                    condition: worstByElement[elementNo].code
                });
            });
        }

        return { rows: rows, skippedNoMapping: skippedNoMapping };
    }

    function buildElementsRowXml(rowIndex, saviElementId, row) {
        // rowIndex is the SAVI sheet row number (5..104); saviElementId is
        // the value written into column A ("Element ID in this SAVI
        // model"), which is just the row's 1-based position in the list.
        var cells = '<c r="A' + rowIndex + '"><v>' + saviElementId + '</v></c>';
        cells += '<c r="B' + rowIndex + '" t="inlineStr"><is><t>' + escapeXml(row.structureId) + '</t></is></c>';
        cells += '<c r="C' + rowIndex + '" t="inlineStr"><is><t>' + escapeXml(row.elementName) + '</t></is></c>';
        if (row.materialType) {
            cells += '<c r="D' + rowIndex + '" t="inlineStr"><is><t>' + escapeXml(row.materialType) + '</t></is></c>';
        }
        cells += '<c r="E' + rowIndex + '" t="inlineStr"><is><t>' + escapeXml(row.condition) + '</t></is></c>';
        return cells;
    }

    async function patchTemplate(rows) {
        await ensureJSZip();

        var templateResp = await fetch(TEMPLATE_URL);
        if (!templateResp.ok) throw new Error('Could not load SAVI template (' + templateResp.status + ')');
        var templateBuffer = await templateResp.arrayBuffer();

        var zip = await JSZip.loadAsync(templateBuffer);

        var sheetFile = zip.file(ELEMENTS_SHEET_PATH);
        if (!sheetFile) throw new Error('SAVI template is missing the Elements sheet - template may be corrupt');
        var sheetXml = await sheetFile.async('string');

        var used = rows.slice(0, MAX_ROWS);
        used.forEach(function (row, i) {
            var sheetRow = 5 + i; // Elements tab data starts at row 5 (row 4 is the header)
            var cellsXml = buildElementsRowXml(sheetRow, i + 1, row);
            var rowOpenTagRe = new RegExp('(<row r="' + sheetRow + '"[^>]*>)');
            if (!rowOpenTagRe.test(sheetXml)) {
                throw new Error('SAVI template row ' + sheetRow + ' not found - template may be a different version');
            }
            sheetXml = sheetXml.replace(rowOpenTagRe, '$1' + cellsXml);
        });

        zip.file(ELEMENTS_SHEET_PATH, sheetXml);

        // Force Excel to recalculate every formula on open, so the new
        // Elements values immediately flow through to the sheets that
        // reference them, regardless of the template's stale calc chain.
        var workbookFile = zip.file(WORKBOOK_PATH);
        var workbookXml = await workbookFile.async('string');
        workbookXml = workbookXml.replace(/<calcPr([^/]*)\/>/, function (m, attrs) {
            return attrs.indexOf('fullCalcOnLoad') >= 0 ? m : '<calcPr' + attrs + ' fullCalcOnLoad="1"/>';
        });
        zip.file(WORKBOOK_PATH, workbookXml);

        return zip.generateAsync({
            type: 'blob',
            mimeType: 'application/vnd.ms-excel.sheet.macroEnabled.12',
            compression: 'DEFLATE'
        });
    }

    function downloadBlob(blob, filename) {
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    }

    async function build(bridges, apiBase) {
        var fetched = await fetchElementRows(bridges, apiBase);
        if (fetched.rows.length === 0) {
            throw new Error('None of the selected structures have condition data that maps to a SAVI element - nothing to export');
        }
        var blob = await patchTemplate(fetched.rows);
        var ts = new Date().toISOString().slice(0, 10);
        downloadBlob(blob, 'spansense-savi-export-' + ts + '.xlsm');
        return {
            totalRows: fetched.rows.length,
            writtenRows: Math.min(fetched.rows.length, MAX_ROWS),
            truncated: fetched.rows.length > MAX_ROWS,
            skippedNoMapping: fetched.skippedNoMapping
        };
    }

    global.SaviExport = {
        MAX_ROWS: MAX_ROWS,
        fetchElementRows: fetchElementRows,
        build: build
    };
})(window);
