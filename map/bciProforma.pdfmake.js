/**
 * bciProforma.pdfmake.js  (v10 - Working colSpan Version)
 * Guarded to prevent double-declaration errors
 */

if (typeof buildBCIProformaContent === 'undefined') {

// ─── Colours ─────────────────────────────────────────────────────────────────
var BCI_COLORS = {
    headerBg:  '#bfbfbf',
    sectionBg: '#d9d9d9',
    titleBg:   '#1a3a5c',
    footerBg:  '#d9d9d9',
    white:     '#ffffff',
    black:     '#000000',
    priorityH: '#dc2626',
    priorityM: '#f97316',
    priorityL: '#16a34a',
};

// ─── 38 BCI elements ─────────────────────────────────────────────────────────
var BCI_ELEMENTS = [
    { no: 1,  desc: 'Primary deck element (Table G.4)' },
    { no: 2,  desc: 'Secondary deck elements - Transverse beams' },
    { no: 3,  desc: 'Elements from table G.5' },
    { no: 4,  desc: 'Half joints' },
    { no: 5,  desc: 'Tie beam/rod' },
    { no: 6,  desc: 'Parapet beam or cantilever' },
    { no: 7,  desc: 'Deck bracing' },
    { no: 8,  desc: 'Foundations' },
    { no: 9,  desc: 'Abutments (incl. arch springing)' },
    { no: 10, desc: 'Spandrel wall/head wall' },
    { no: 11, desc: 'Pier/column' },
    { no: 12, desc: 'Cross-head/capping beam' },
    { no: 13, desc: 'Bearings' },
    { no: 14, desc: 'Bearing plinth/shelf' },
    { no: 15, desc: 'Superstructure drainage' },
    { no: 16, desc: 'Substructure drainage' },
    { no: 17, desc: 'Waterproofing' },
    { no: 18, desc: 'Movement/expansion joints' },
    { no: 19, desc: 'Finishes: deck elements' },
    { no: 20, desc: 'Finishes: substructure elements' },
    { no: 21, desc: 'Finishes: parapets/safety fences' },
    { no: 22, desc: 'Access/walkways/gantries' },
    { no: 23, desc: 'Handrail/parapets/safety fences' },
    { no: 24, desc: 'Carriageway surfacing' },
    { no: 25, desc: 'Footway/verge/footbridge surfacing' },
    { no: 26, desc: 'Invert/river bed' },
    { no: 27, desc: 'Aprons' },
    { no: 28, desc: 'Fenders/cutwaters/collision prot.' },
    { no: 29, desc: 'River training works' },
    { no: 30, desc: 'Revetment/batter paving' },
    { no: 31, desc: 'Wing walls' },
    { no: 32, desc: 'Retaining walls' },
    { no: 33, desc: 'Embankments' },
    { no: 34, desc: 'Machinery' },
    { no: 35, desc: 'Approach rails/barriers/walls' },
    { no: 36, desc: 'Signs' },
    { no: 37, desc: 'Lighting' },
    { no: 38, desc: 'Services' },
];

var BCI_GROUPS = [
    { label: 'Deck Elements',             count: 7 },
    { label: 'Load-bearing Substructure', count: 7 },
    { label: 'Durability Elements',       count: 7 },
    { label: 'Safety Elements',           count: 4 },
    { label: 'Other Bridge Elements',     count: 9 },
    { label: 'Ancillary Elements',        count: 4 },
];
var BCI_SPARE = [39, 40, 41, 42];

// ─── Table layout ───────────────────────────────────────────────────────────
var GRID_LAYOUT = {
    hLineWidth:    () => 0.5,
    vLineWidth:    () => 0.5,
    hLineColor:    () => '#000000',
    vLineColor:    () => '#000000',
    paddingTop:    () => 1.5,
    paddingBottom: () => 1.5,
    paddingLeft:   () => 2,
    paddingRight:  () => 2,
};

// A4 usable width with 40pt margins = 515pt
var PW = 375;

// 20 column widths
var COL_WIDTHS = [
    PW * 0.04, PW * 0.04, PW * 0.04, PW * 0.04, PW * 0.04,
    PW * 0.04, PW * 0.04, PW * 0.04, PW * 0.04, PW * 0.04,
    PW * 0.04, PW * 0.04, PW * 0.04, PW * 0.04, PW * 0.04,
    PW * 0.04, PW * 0.04, PW * 0.14,  PW * 0.14,  PW * 0.04
];

// ─── Helper function to create a row ─────────────────────────────────────────
function createRow(cells) {
    var row = [];
    for (var i = 0; i < cells.length; i++) {
        row.push(cells[i]);
    }
    return row;
}

function emptyCells(count) {
    var cells = [];
    for (var i = 0; i < count; i++) cells.push({ text: '' });
    return cells;
}

function hdr(text, extra) {
    extra = extra || {};
    return { text: text, bold: true, fontSize: 7, alignment: 'center',
             fillColor: BCI_COLORS.headerBg, ...extra };
}

function cell(text, extra) {
    extra = extra || {};
    return { text: text != null ? text : '', fontSize: 7, ...extra };
}

function setCell(label, rowSpan) {
    return {
        text: label, rowSpan: rowSpan, bold: true, fontSize: 6.5,
        alignment: 'center', fillColor: BCI_COLORS.sectionBg,
        margin: [0, 4, 0, 4],
    };
}

// ─────────────────────────────────────────────────────────────────────────────
//  PAGE 1
// ─────────────────────────────────────────────────────────────────────────────
function buildBCIProformaContent(bciFormData) {
    var content = [];
    if (!bciFormData || bciFormData.error) {
        content.push({ text: 'BCI data unavailable: ' + (bciFormData && bciFormData.error ? bciFormData.error : ''), italics: true, color: '#888' });
        return content;
    }

    var structureName = bciFormData.structureName || '';
    var structureId = bciFormData.structureId || '';
    var bridgeData = bciFormData.bridgeData || {};
    var totalSpans = bciFormData.totalSpans || 1;
    var spansData = bciFormData.spansData || [];

    for (var spanIdx = 0; spanIdx < totalSpans; spanIdx++) {
        var spanNum  = spanIdx + 1;
        var spanData = (spansData || []).find(function(s) { return Number(s.span_number) === spanNum; }) || {};
        var defects  = spanData.defects || [];
        var defByEl  = {};
        defects.forEach(function(d) { defByEl[d.element_no != null ? d.element_no : d.elementNumber] = d; });

        var inspector  = spanData.inspector_name  || '';
        var date       = spanData.inspection_date || '';
        var nextInsp   = spanData.next_inspection || '';
        var roadRef    = bridgeData.road_ref || bridgeData.location || '';
        var mapRef     = bridgeData.grid_reference || (bridgeData.latitude && bridgeData.longitude ? '' + Number(bridgeData.latitude).toFixed(3) + ', ' + Number(bridgeData.longitude).toFixed(3) : '');
        var osE        = bridgeData.easting  || bridgeData.OSE || '';
        var osN        = bridgeData.northing || bridgeData.OSN || '';
        var primForm   = bridgeData.primary_form || bridgeData.primaryForm || '';
        var primMat    = bridgeData.primary_material || bridgeData.primaryMaterial || '';
        var secForm    = bridgeData.secondary_form || bridgeData.secondaryForm || '';
        var secMat     = bridgeData.secondary_material || bridgeData.secondaryMaterial || '';
        var spanW      = bridgeData.span_width || bridgeData.span || '';
        var spanL      = bridgeData.span_length || bridgeData.length || '';
        var inspected  = spanData.elements_inspected !== false ? 'Yes' : 'No';
        var photos     = spanData.photographs_taken !== false ? 'Yes' : 'No';
        var bciCrit    = spanData.bci_crit != null ? String(spanData.bci_crit) : '—';
        var bciAv      = spanData.bci_av != null ? String(spanData.bci_av) : '—';
        var bridgeCode = bridgeData.bridge_code || '';

        if (spanIdx > 0) content.push({ text: '', pageBreak: 'before' });

        var tableBody = [];

        // ROW 1: Superficial(3) | General(3) | Principal(3) | Special(3) | Forms(8) = 20
        tableBody.push([
            { text: 'Superficial', colSpan: 3, bold: true, fontSize: 7, alignment: 'center', fillColor: BCI_COLORS.headerBg },
            { text: '' }, { text: '' },
            { text: 'General', colSpan: 3, bold: true, fontSize: 7, alignment: 'center', fillColor: BCI_COLORS.headerBg },
            { text: '' }, { text: '' },
            { text: 'Principal', colSpan: 3, bold: true, fontSize: 7, alignment: 'center', fillColor: BCI_COLORS.headerBg },
            { text: '' }, { text: '' },
            { text: 'Special', colSpan: 3, bold: true, fontSize: 7, alignment: 'center', fillColor: BCI_COLORS.headerBg },
            { text: '' }, { text: '' },
            { text: 'Number of construction forms in bridge/span*: 1', colSpan: 8, fontSize: 7, fillColor: BCI_COLORS.headerBg },
            { text: '' }, { text: '' }, { text: '' }, { text: '' }, { text: '' }, { text: '' }, { text: '' }
        ]);

        // ROW 2: Inspector(5) | Date(5) | Next(5) | Road(5) = 20
        tableBody.push([
            { text: 'Inspector: ' + inspector, colSpan: 5, fontSize: 7, bold: true },
            { text: '' }, { text: '' }, { text: '' }, { text: '' },
            { text: 'Date: ' + date, colSpan: 5, fontSize: 7, bold: true },
            { text: '' }, { text: '' }, { text: '' }, { text: '' },
            { text: 'Next inspection: ' + nextInsp, colSpan: 5, fontSize: 7, bold: true },
            { text: '' }, { text: '' }, { text: '' }, { text: '' },
            { text: 'Road Ref: ' + roadRef, colSpan: 5, fontSize: 7, bold: true },
            { text: '' }, { text: '' }, { text: '' }, { text: '' }
        ]);

        // ROW 3: BridgeName(10) | BridgeRef(6) | BridgeCode(1) | PrimaryForm(3) = 20
        tableBody.push([
            { text: 'Bridge name: ' + structureName, colSpan: 10, fontSize: 7, bold: true },
            { text: '' }, { text: '' }, { text: '' }, { text: '' }, { text: '' }, { text: '' }, { text: '' }, { text: '' }, { text: '' },
            { text: 'Bridge Ref: ' + structureId, colSpan: 6, fontSize: 7, bold: true },
            { text: '' }, { text: '' }, { text: '' }, { text: '' }, { text: '' },
            { text: 'Bridge\ncode\n' + bridgeCode, rowSpan: 4, bold: true, fontSize: 6.5, alignment: 'center', fillColor: BCI_COLORS.sectionBg },
            { text: 'Primary deck form (Table G.4): ' + primForm, colSpan: 3, fontSize: 7, bold: true, alignment: 'right' },
            { text: '' }, { text: '' }
        ]);

        // ROW 4: MapRef(5) | OSE(5) | OSN(6) | BLANK(1) | PrimaryMat(3) = 20
        tableBody.push([
            { text: 'Map Ref: ' + mapRef, colSpan: 5, fontSize: 7, bold: true },
            { text: '' }, { text: '' }, { text: '' }, { text: '' },
            { text: 'OSE: ' + osE, colSpan: 5, fontSize: 7, bold: true },
            { text: '' }, { text: '' }, { text: '' }, { text: '' },
            { text: 'OSN: ' + osN, colSpan: 6, fontSize: 7, bold: true },
            { text: '' }, { text: '' }, { text: '' }, { text: '' }, { text: '' },
            { text: '' },
            { text: 'Primary deck material (Table G.6): ' + primMat, colSpan: 3, fontSize: 7, bold: true, alignment: 'right' },
            { text: '' }, { text: '' }
        ]);

        // ROW 5: Span(4) | SpanW(6) | SpanL(6) | BLANK(1) | SecForm(3) = 20
        tableBody.push([
            { text: 'Span: ' + spanNum + ' of ' + totalSpans, colSpan: 4, fontSize: 7, bold: true },
            { text: '' }, { text: '' }, { text: '' },
            { text: 'Span Width (m): ' + spanW, colSpan: 6, fontSize: 7, bold: true },
            { text: '' }, { text: '' }, { text: '' }, { text: '' }, { text: '' },
            { text: 'Span Length (m): ' + spanL, colSpan: 6, fontSize: 7, bold: true },
            { text: '' }, { text: '' }, { text: '' }, { text: '' }, { text: '' },
            { text: '' },
            { text: 'Secondary deck form (Table G.5): ' + secForm, colSpan: 3, fontSize: 7, bold: true, alignment: 'right' },
            { text: '' }, { text: '' }
        ]);

        // ROW 6: AllInspected(10) | Photos(6) | BLANK(1) | SecMat(3) = 20
        tableBody.push([
            { text: 'All above ground elements inspected: ' + inspected, colSpan: 10, fontSize: 7, bold: true },
            { text: '' }, { text: '' }, { text: '' }, { text: '' }, { text: '' }, { text: '' }, { text: '' }, { text: '' }, { text: '' },
            { text: 'Photographs: ' + photos, colSpan: 6, fontSize: 7, bold: true },
            { text: '' }, { text: '' }, { text: '' }, { text: '' }, { text: '' },
            { text: '' },
            { text: 'Secondary deck material (Table G.6): ' + secMat, colSpan: 3, fontSize: 7, bold: true, alignment: 'right' },
            { text: '' }, { text: '' }
        ]);

        // ROW 7: BCI Scores
        tableBody.push([
            { text: 'BCI crit: ' + bciCrit + '    |    BCI ave: ' + bciAv, colSpan: 20, bold: true, fontSize: 8, alignment: 'center' },
            { text: '' }, { text: '' }, { text: '' }, { text: '' }, { text: '' }, { text: '' }, { text: '' }, { text: '' }, { text: '' },
            { text: '' }, { text: '' }, { text: '' }, { text: '' }, { text: '' }, { text: '' }, { text: '' }, { text: '' }, { text: '' }, { text: '' }
        ]);

        // ROW 8: Data Table Header
        tableBody.push([
            { text: 'Set', bold: true, fontSize: 7, alignment: 'center', fillColor: BCI_COLORS.headerBg },
            { text: 'No', bold: true, fontSize: 7, alignment: 'center', fillColor: BCI_COLORS.headerBg },
            { text: 'Element Description', colSpan: 5, bold: true, fontSize: 7, alignment: 'center', fillColor: BCI_COLORS.headerBg },
            { text: '' }, { text: '' }, { text: '' }, { text: '' },
            { text: 'S', bold: true, fontSize: 7, alignment: 'center', fillColor: BCI_COLORS.headerBg },
            { text: 'Ex', bold: true, fontSize: 7, alignment: 'center', fillColor: BCI_COLORS.headerBg },
            { text: 'Def', bold: true, fontSize: 7, alignment: 'center', fillColor: BCI_COLORS.headerBg },
            { text: 'W', bold: true, fontSize: 7, alignment: 'center', fillColor: BCI_COLORS.headerBg },
            { text: 'P', bold: true, fontSize: 7, alignment: 'center', fillColor: BCI_COLORS.headerBg },
            { text: 'Cost', colSpan: 2, bold: true, fontSize: 7, alignment: 'center', fillColor: BCI_COLORS.headerBg },
            { text: '' },
            { text: 'Comments / Remarks', colSpan: 6, bold: true, fontSize: 7, alignment: 'center', fillColor: BCI_COLORS.headerBg },
            { text: '' }, { text: '' }, { text: '' }, { text: '' }, { text: '' }
        ]);

        // ========== DATA ROWS ==========
        var elIdx = 0;
        BCI_GROUPS.forEach(function(group) {
            var groupEls = BCI_ELEMENTS.slice(elIdx, elIdx + group.count);
            elIdx += group.count;

            groupEls.forEach(function(el, idxInGroup) {
                var d = defByEl[el.no] || {};
                var hasMulti = defects.filter(function(x) { return (x.element_no != null ? x.element_no : x.elementNumber) === el.no; }).length > 1;

                var defDisplay = '-';
                if (d.def && d.defN) defDisplay = d.def + '.' + d.defN;
                else if (d.def) defDisplay = String(d.def);

                var comments = hasMulti ? 'See multiple defects table' : (d.comments_remarks && d.comments_remarks !== '-' ? d.comments_remarks : '-');

                var dataRow = [];

                if (idxInGroup === 0) {
                    dataRow.push(setCell(group.label, group.count));
                } else {
                    dataRow.push({ text: '' });
                }

                dataRow.push({ text: String(el.no), alignment: 'center', fontSize: 7 });
                dataRow.push({ text: el.desc, colSpan: 5, fontSize: 7 });
                dataRow.push({ text: '' });
                dataRow.push({ text: '' });
                dataRow.push({ text: '' });
                dataRow.push({ text: '' });
                dataRow.push({ text: String(d.s != null ? d.s : '-'), alignment: 'center', fontSize: 7 });
                dataRow.push({ text: String(d.ex != null ? d.ex : '-'), alignment: 'center', fontSize: 7 });
                dataRow.push({ text: defDisplay, alignment: 'center', fontSize: 7 });
                dataRow.push({ text: String(d.w != null ? d.w : '-'), alignment: 'center', fontSize: 7 });
                dataRow.push({ text: String(d.p != null ? d.p : '-'), alignment: 'center', fontSize: 7 });
                dataRow.push({ text: String(d.cost != null ? d.cost : ''), colSpan: 2, alignment: 'right', fontSize: 7 });
                dataRow.push({ text: '' });
                dataRow.push({ text: comments, colSpan: 6, fontSize: 6.5 });
                dataRow.push({ text: '' });
                dataRow.push({ text: '' });
                dataRow.push({ text: '' });
                dataRow.push({ text: '' });
                dataRow.push({ text: '' });

                tableBody.push(dataRow);
            });
        });

        // Spare rows (39-42)
        BCI_SPARE.forEach(function(no, i) {
            var spareRow = [];

            if (i === 0) {
                spareRow.push(setCell('Spare', BCI_SPARE.length));
            } else {
                spareRow.push({ text: '' });
            }

            spareRow.push({ text: String(no), alignment: 'center', fontSize: 7 });
            spareRow.push({ text: '', colSpan: 5, fontSize: 7 });
            spareRow.push({ text: '' });
            spareRow.push({ text: '' });
            spareRow.push({ text: '' });
            spareRow.push({ text: '' });
            spareRow.push({ text: '-', alignment: 'center', fontSize: 7 });
            spareRow.push({ text: '-', alignment: 'center', fontSize: 7 });
            spareRow.push({ text: '-', alignment: 'center', fontSize: 7 });
            spareRow.push({ text: '-', alignment: 'center', fontSize: 7 });
            spareRow.push({ text: '-', alignment: 'center', fontSize: 7 });
            spareRow.push({ text: '', colSpan: 2, alignment: 'right', fontSize: 7 });
            spareRow.push({ text: '' });
            spareRow.push({ text: '', colSpan: 6, fontSize: 6.5 });
            spareRow.push({ text: '' });
            spareRow.push({ text: '' });
            spareRow.push({ text: '' });
            spareRow.push({ text: '' });
            spareRow.push({ text: '' });

            tableBody.push(spareRow);
        });

        // Footer Row
        tableBody.push([
            { text: 'S - severity, Ex - extent, Def - defect, W - work required, P - work priority, Cost - cost of work.',
              colSpan: 20, fontSize: 6.5, bold: true, alignment: 'center', fillColor: BCI_COLORS.footerBg },
            { text: '' }, { text: '' }, { text: '' }, { text: '' }, { text: '' }, { text: '' }, { text: '' }, { text: '' }, { text: '' },
            { text: '' }, { text: '' }, { text: '' }, { text: '' }, { text: '' }, { text: '' }, { text: '' }, { text: '' }, { text: '' }, { text: '' }
        ]);

        content.push({
            margin: [0, 8, 0, 0],
            table: {
                widths: COL_WIDTHS,
                body: tableBody,
            },
            layout: GRID_LAYOUT,
        });
    }

    return content;
}

function buildBCIPage2Content(bciFormData) {
    var content = [];

    if (!bciFormData || bciFormData.error) {
        content.push({ text: 'BCI data unavailable: ' + (bciFormData && bciFormData.error ? bciFormData.error : ''), italics: true, color: '#888' });
        return content;
    }

    var totalSpans = bciFormData.totalSpans || 1;
    var spansData = bciFormData.spansData || [];
    var worksRequired = bciFormData.worksRequired || {};

    var USABLE_PT       = (841 - 80) * 0.90;
    var MULTI_ROW_COUNT = 5;
    var WORK_ROW_COUNT  = 6;
    var TOTAL_ROWS      = 23;
    var COMMENT_ROWS    = 2;
    var TEXT_H          = 7 * 1.2;
    var DATA_ROW_H      = 18 * 1.05;
    var FIXED_ROWS      = TOTAL_ROWS - COMMENT_ROWS;
    var FIXED_TOTAL     = FIXED_ROWS * DATA_ROW_H;
    var COMMENT_H       = (USABLE_PT - FIXED_TOTAL) / COMMENT_ROWS;
    var dataPad    = Math.max(1.5, (DATA_ROW_H - TEXT_H) / 2);
    var commentPad = Math.max(1.5, (COMMENT_H  - TEXT_H) / 2);
    var COMMENT_ROW_INDICES = new Set([9, 12]);

    for (var spanIdx = 0; spanIdx < totalSpans; spanIdx++) {
        var spanNum   = spanIdx + 1;
        var spanData  = (spansData || []).find(function(s) { return Number(s.span_number) === spanNum; }) || {};
        var defects   = spanData.defects || [];
        var spanWorks = (worksRequired.worksRequired || []).filter(function(w) { return Number(w.spanNumber) === spanNum; });

        var inspector = spanData.inspector_name  || '';
        var date      = spanData.inspection_date ? formatDate(spanData.inspection_date) : '';
        var comments  = spanData.comments        || '';

        content.push({ text: '', pageBreak: 'before' });

        var tableBody = [];

        // SECTION 1: MULTIPLE DEFECTS
        tableBody.push([
            { text: 'MULTIPLE DEFECTS', colSpan: 20, bold: true, fontSize: 7,
              alignment: 'center', fillColor: BCI_COLORS.headerBg },
            ...Array(19).fill({ text: '' })
        ]);

        tableBody.push([
            { text: 'Element\nNo.', colSpan: 2, rowSpan: 2, bold: true, fontSize: 7,
              alignment: 'center', fillColor: BCI_COLORS.headerBg },
            { text: '' },
            { text: 'Defect 1', colSpan: 3, bold: true, fontSize: 7, alignment: 'center', fillColor: BCI_COLORS.headerBg },
            { text: '' }, { text: '' },
            { text: 'Defect 2', colSpan: 3, bold: true, fontSize: 7, alignment: 'center', fillColor: BCI_COLORS.headerBg },
            { text: '' }, { text: '' },
            { text: 'Defect 3', colSpan: 3, bold: true, fontSize: 7, alignment: 'center', fillColor: BCI_COLORS.headerBg },
            { text: '' }, { text: '' },
            { text: 'Comments / Remarks', colSpan: 9, rowSpan: 2, bold: true, fontSize: 7,
              alignment: 'center', fillColor: BCI_COLORS.headerBg },
            { text: '' }, { text: '' }, { text: '' }, { text: '' },
            { text: '' }, { text: '' }, { text: '' }, { text: '' }
        ]);

        tableBody.push([
            { text: '' }, { text: '' },
            { text: 'S',   bold: true, fontSize: 7, alignment: 'center', fillColor: BCI_COLORS.headerBg },
            { text: 'Ex',  bold: true, fontSize: 7, alignment: 'center', fillColor: BCI_COLORS.headerBg },
            { text: 'Def', bold: true, fontSize: 7, alignment: 'center', fillColor: BCI_COLORS.headerBg },
            { text: 'S',   bold: true, fontSize: 7, alignment: 'center', fillColor: BCI_COLORS.headerBg },
            { text: 'Ex',  bold: true, fontSize: 7, alignment: 'center', fillColor: BCI_COLORS.headerBg },
            { text: 'Def', bold: true, fontSize: 7, alignment: 'center', fillColor: BCI_COLORS.headerBg },
            { text: 'S',   bold: true, fontSize: 7, alignment: 'center', fillColor: BCI_COLORS.headerBg },
            { text: 'Ex',  bold: true, fontSize: 7, alignment: 'center', fillColor: BCI_COLORS.headerBg },
            { text: 'Def', bold: true, fontSize: 7, alignment: 'center', fillColor: BCI_COLORS.headerBg },
            { text: '' }, { text: '' }, { text: '' }, { text: '' },
            { text: '' }, { text: '' }, { text: '' }, { text: '' }, { text: '' }
        ]);

        var defByEl = {};
        defects.forEach(function(d) {
            var k = d.element_no != null ? d.element_no : d.elementNumber;
            if (!defByEl[k]) defByEl[k] = [];
            defByEl[k].push(d);
        });
        var multiEls = Object.keys(defByEl)
            .filter(function(k) { return defByEl[k].length > 1; })
            .map(Number).sort(function(a, b) { return a - b; });

        for (var i = 0; i < MULTI_ROW_COUNT; i++) {
            var elNo   = multiEls[i] != null ? multiEls[i] : null;
            var elDefs = elNo !== null ? defByEl[elNo].slice(0, 3) : [];
            var getD   = function(idx) { return elDefs[idx] || {}; };
            var fmtDef = function(d) { return !d.def ? '' : d.defN ? d.def + '.' + d.defN : String(d.def); };
            var combined = elDefs
                .map(function(d, idx) { return (d.comments_remarks && d.comments_remarks !== '-') ? 'D' + (idx+1) + ': ' + d.comments_remarks : ''; })
                .filter(Boolean).join('; ');
            var d1 = getD(0), d2 = getD(1), d3 = getD(2);

            tableBody.push([
                { text: elNo !== null ? String(elNo) : '', colSpan: 2, fontSize: 7, alignment: 'center' },
                { text: '' },
                { text: String(d1.s  != null ? d1.s : ''), fontSize: 7, alignment: 'center' },
                { text: String(d1.ex != null ? d1.ex : ''), fontSize: 7, alignment: 'center' },
                { text: fmtDef(d1),          fontSize: 7, alignment: 'center' },
                { text: String(d2.s  != null ? d2.s : ''), fontSize: 7, alignment: 'center' },
                { text: String(d2.ex != null ? d2.ex : ''), fontSize: 7, alignment: 'center' },
                { text: fmtDef(d2),          fontSize: 7, alignment: 'center' },
                { text: String(d3.s  != null ? d3.s : ''), fontSize: 7, alignment: 'center' },
                { text: String(d3.ex != null ? d3.ex : ''), fontSize: 7, alignment: 'center' },
                { text: fmtDef(d3),          fontSize: 7, alignment: 'center' },
                { text: combined, colSpan: 9, fontSize: 6.5 },
                { text: '' }, { text: '' }, { text: '' }, { text: '' },
                { text: '' }, { text: '' }, { text: '' }, { text: '' }
            ]);
        }

        // SECTION 2: INSPECTOR'S COMMENTS
        tableBody.push([
            { text: "INSPECTOR'S COMMENTS", colSpan: 20, bold: true, fontSize: 7,
              alignment: 'center', fillColor: BCI_COLORS.sectionBg },
            ...Array(19).fill({ text: '' })
        ]);

        tableBody.push([
            { text: comments, colSpan: 20, fontSize: 7 },
            ...Array(19).fill({ text: '' })
        ]);

        tableBody.push([
            { text: 'Name:',   colSpan: 2,  bold: true, fontSize: 7 }, { text: '' },
            { text: inspector, colSpan: 5,  fontSize: 7 },
            { text: '' }, { text: '' }, { text: '' }, { text: '' },
            { text: 'Signed:', colSpan: 2,  bold: true, fontSize: 7 }, { text: '' },
            { text: '',        colSpan: 6,  fontSize: 7 },
            { text: '' }, { text: '' }, { text: '' }, { text: '' }, { text: '' },
            { text: 'Date:',   colSpan: 1,  bold: true, fontSize: 7 },
            { text: date,      colSpan: 4,  fontSize: 7 },
            { text: '' }, { text: '' }, { text: '' }
        ]);

        // SECTION 3: ENGINEER'S COMMENTS
        tableBody.push([
            { text: "ENGINEER'S COMMENTS", colSpan: 20, bold: true, fontSize: 7,
              alignment: 'center', fillColor: BCI_COLORS.sectionBg },
            ...Array(19).fill({ text: '' })
        ]);

        tableBody.push([
            { text: '', colSpan: 20, fontSize: 7 },
            ...Array(19).fill({ text: '' })
        ]);

        tableBody.push([
            { text: 'Name:',         colSpan: 2,  bold: true, fontSize: 7 }, { text: '' },
            { text: '[Insert name]', colSpan: 5,  fontSize: 7 },
            { text: '' }, { text: '' }, { text: '' }, { text: '' },
            { text: 'Signed:',       colSpan: 2,  bold: true, fontSize: 7 }, { text: '' },
            { text: '',              colSpan: 6,  fontSize: 7 },
            { text: '' }, { text: '' }, { text: '' }, { text: '' }, { text: '' },
            { text: 'Date:',         colSpan: 1,  bold: true, fontSize: 7 },
            { text: date,            colSpan: 4,  fontSize: 7 },
            { text: '' }, { text: '' }, { text: '' }
        ]);

        // SECTION 4: WORK REQUIRED
        tableBody.push([
            { text: 'WORK REQUIRED — SPAN ' + spanNum, colSpan: 20, bold: true, fontSize: 7,
              alignment: 'center', fillColor: BCI_COLORS.sectionBg },
            ...Array(19).fill({ text: '' })
        ]);

        tableBody.push([
            { text: 'Ref.',                    colSpan: 2,  bold: true, fontSize: 7, alignment: 'center', fillColor: BCI_COLORS.headerBg },
            { text: '' },
            { text: 'Suggested Remedial Work', colSpan: 10, bold: true, fontSize: 7, alignment: 'center', fillColor: BCI_COLORS.headerBg },
            { text: '' }, { text: '' }, { text: '' }, { text: '' },
            { text: '' }, { text: '' }, { text: '' }, { text: '' }, { text: '' },
            { text: 'Priority',                colSpan: 2,  bold: true, fontSize: 7, alignment: 'center', fillColor: BCI_COLORS.headerBg },
            { text: '' },
            { text: 'Estimated Cost',          colSpan: 3,  bold: true, fontSize: 7, alignment: 'center', fillColor: BCI_COLORS.headerBg },
            { text: '' }, { text: '' },
            { text: 'Action',                  colSpan: 3,  bold: true, fontSize: 7, alignment: 'center', fillColor: BCI_COLORS.headerBg },
            { text: '' }, { text: '' }
        ]);

        for (var i = 0; i < WORK_ROW_COUNT; i++) {
            var w        = spanWorks[i] || {};
            var remedial = w.remedialWorks || w.remedial_works || '';
            var priority = w.priority || '';
            var cost     = (w.cost && w.cost !== 'Not specified') ? w.cost : '';
            var action   = w.worksRequired === 'Y' ? '✓' : (w.worksRequired === 'M' ? '?' : '');
            var pColor   = priority === 'H' ? BCI_COLORS.priorityH
                           : priority === 'M' ? BCI_COLORS.priorityM
                           : priority === 'L' ? BCI_COLORS.priorityL : null;

            tableBody.push([
                { text: i < spanWorks.length ? String(i + 1) : '', colSpan: 2, fontSize: 7, alignment: 'center' },
                { text: '' },
                { text: remedial, colSpan: 10, fontSize: 6.5 },
                { text: '' }, { text: '' }, { text: '' }, { text: '' },
                { text: '' }, { text: '' }, { text: '' }, { text: '' }, { text: '' },
                { text: priority, colSpan: 2, fontSize: 7, alignment: 'center',
                  ...(pColor ? { color: BCI_COLORS.white, fillColor: pColor, bold: true } : {}) },
                { text: '' },
                { text: cost,   colSpan: 3, fontSize: 7, alignment: 'right' },
                { text: '' }, { text: '' },
                { text: action, colSpan: 3, fontSize: 7, alignment: 'center' },
                { text: '' }, { text: '' }
            ]);
        }

        tableBody.push([
            { text: 'Name:',   colSpan: 2,  bold: true, fontSize: 7 }, { text: '' },
            { text: inspector, colSpan: 5,  fontSize: 7 },
            { text: '' }, { text: '' }, { text: '' }, { text: '' },
            { text: 'Signed:', colSpan: 2,  bold: true, fontSize: 7 }, { text: '' },
            { text: '',        colSpan: 6,  fontSize: 7 },
            { text: '' }, { text: '' }, { text: '' }, { text: '' }, { text: '' },
            { text: 'Date:',   colSpan: 1,  bold: true, fontSize: 7 },
            { text: date,      colSpan: 4,  fontSize: 7 },
            { text: '' }, { text: '' }, { text: '' }
        ]);

        var page2Layout = {
            hLineWidth:    function() { return 0.5; },
            vLineWidth:    function() { return 0.5; },
            hLineColor:    function() { return '#000000'; },
            vLineColor:    function() { return '#000000'; },
            paddingLeft:   function() { return 2; },
            paddingRight:  function() { return 2; },
            paddingTop:    function(rowIndex) { return COMMENT_ROW_INDICES.has(rowIndex) ? commentPad : dataPad; },
            paddingBottom: function(rowIndex) { return COMMENT_ROW_INDICES.has(rowIndex) ? commentPad : dataPad; },
        };

        content.push({
            margin: [0, 8, 0, 0],
            table: { widths: COL_WIDTHS, body: tableBody },
            layout: page2Layout,
        });
    }

    return content;
}

// ─── Expose globally ─────────────────────────────────────────────────────────
window.buildBCIProformaContent = buildBCIProformaContent;
window.buildBCIPage2Content = buildBCIPage2Content;

} // end guard: typeof buildBCIProformaContent === 'undefined'