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

// ─── BCI elements, per structure type ────────────────────────────────────────
var BCI_ELEMENTS_BY_TYPE = {
    Bridge: [
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
    ],
    'Retaining wall': [
        { no: 1,  desc: 'Foundations' },
        { no: 2,  desc: 'Retaining wall: Primary' },
        { no: 3,  desc: 'Retaining wall: Secondary' },
        { no: 4,  desc: 'Parapet beam/plinth' },
        { no: 5,  desc: 'Drainage' },
        { no: 6,  desc: 'Movement/Expansion Joints' },
        { no: 7,  desc: 'Surface finishes: wall' },
        { no: 8,  desc: 'Surface finishes: handrail/parapet' },
        { no: 9,  desc: 'Handrail/parapets/safety fences' },
        { no: 10, desc: 'Carriageway: Top of Wall' },
        { no: 11, desc: 'Carriageway: Foot of Wall' },
        { no: 12, desc: 'Footway/verge: Top of Wall' },
        { no: 13, desc: 'Footway/verge: Foot of Wall' },
        { no: 14, desc: 'Embankment' },
        { no: 15, desc: 'Superstructure drainage' },
        { no: 16, desc: 'Invert/river bed' },
        { no: 17, desc: 'Aprons' },
        { no: 18, desc: 'Signs' },
        { no: 19, desc: 'Lighting' },
        { no: 20, desc: 'Services' },
    ],
    // Per Highways Agency Guidance Document for Performance Measurement of
    // Highway Structures, Part B1, Table 11 - the "Additional HA Element"
    // (Road Restraint System) sits outside the numbered list and is left
    // out, same treatment as Anchoring System was for Retaining wall.
    'Sign Gantry': [
        { no: 1,  desc: 'Foundations' },
        { no: 2,  desc: 'Truss/beams/cantilever' },
        { no: 3,  desc: 'Transverse/horiz. bracing elements' },
        { no: 4,  desc: 'Columns/supports/legs' },
        { no: 5,  desc: 'Surface finishes: truss/beams/cantilever' },
        { no: 6,  desc: 'Surface finishes: columns/supports/legs' },
        { no: 7,  desc: 'Surface finishes: other elements' },
        { no: 8,  desc: 'Access/walkway/deck' },
        { no: 9,  desc: 'Access ladder' },
        { no: 10, desc: 'Handrails/guard rails' },
        { no: 11, desc: 'Base connections' },
        { no: 12, desc: 'Support to longitudinal connection' },
        { no: 13, desc: 'Sign and signal supports' },
        { no: 14, desc: 'Signs/signals' },
        { no: 15, desc: 'Lighting' },
        { no: 16, desc: 'Services' },
    ]
};

var BCI_GROUPS_BY_TYPE = {
    Bridge: [
        { label: 'Deck Elements',             count: 7 },
        { label: 'Load-bearing Substructure', count: 7 },
        { label: 'Durability Elements',       count: 7 },
        { label: 'Safety Elements',           count: 4 },
        { label: 'Other Bridge Elements',     count: 9 },
        { label: 'Ancillary Elements',        count: 4 },
    ],
    'Retaining wall': [
        { label: 'Main Elements',       count: 4 },
        { label: 'Durability Elements', count: 4 },
        { label: 'Safety Elements',     count: 5 },
        { label: 'Other Elements',      count: 4 },
        { label: 'Ancillary Elements',  count: 3 },
    ],
    'Sign Gantry': [
        { label: 'Main Elements',       count: 4 },
        { label: 'Durability Elements', count: 3 },
        { label: 'Safety Elements',     count: 3 },
        { label: 'Other Elements',      count: 3 },
        { label: 'Ancillary Elements',  count: 3 },
    ]
};

var BCI_SPARE_BY_TYPE = {
    Bridge: [39, 40, 41, 42],
    'Retaining wall': [],
    'Sign Gantry': []
};

function getBCIProformaConfig(structureType) {
    return {
        elements: BCI_ELEMENTS_BY_TYPE[structureType] || BCI_ELEMENTS_BY_TYPE.Bridge,
        groups: BCI_GROUPS_BY_TYPE[structureType] || BCI_GROUPS_BY_TYPE.Bridge,
        spare: BCI_SPARE_BY_TYPE[structureType] || BCI_SPARE_BY_TYPE.Bridge
    };
}

// ─── Table layout ───────────────────────────────────────────────────────────
var GRID_LAYOUT = {
    hLineWidth:    () => 0.5,
    vLineWidth:    () => 0.5,
    hLineColor:    () => '#000000',
    vLineColor:    () => '#000000',
    paddingTop:    () => 1.5,
    paddingBottom: () => 1.5,
    paddingLeft:   () => 0.5,
    paddingRight:  () => 0.5,
};

// Shared so page 1 and page 2's tables stretch to the exact same total
// height regardless of how many rows each one naturally has (otherwise
// whichever has fewer/shorter rows - e.g. a Retaining Wall's element list
// vs a Bridge's - ends up visibly shorter). The 0.967 factor was tuned by
// actually rendering and measuring the PDF, not derived analytically -
// pdfmake's real row heights don't quite match a simple text+padding model.
var PAGE_TARGET_HEIGHT = (841 - 80) * 0.967;

// Page 1's 8 header/info rows + 1 footer row, at their natural (unstretched)
// 1.5pt padding, and the natural height of one data row's text alone with
// padding removed - both measured the same way as PAGE_TARGET_HEIGHT above
// (render + measure), used to size the *data* rows (elements + spare) so
// the whole table reaches PAGE_TARGET_HEIGHT regardless of element count.
var PAGE1_FIXED_ROWS_HEIGHT = 164;
var PAGE1_DATA_TEXT_HEIGHT = 10.627;

// A4 usable width with 40pt margins = 515pt. Table is 375pt by base design,
// scaled up 15% per request (still well under the 515pt usable width, so
// centering still leaves margin on both sides).
var PW = 375 * 1.15;

// 20 column widths
var COL_WIDTHS = [
    PW * 0.04, PW * 0.04, PW * 0.04, PW * 0.04, PW * 0.04,
    PW * 0.04, PW * 0.04, PW * 0.04, PW * 0.04, PW * 0.04,
    PW * 0.04, PW * 0.04, PW * 0.04, PW * 0.04, PW * 0.04,
    PW * 0.04, PW * 0.04, PW * 0.14,  PW * 0.14,  PW * 0.04
];
var TABLE_WIDTH = COL_WIDTHS.reduce(function(a, b) { return a + b; }, 0);

// Tables are narrower than the usable page width (515pt) by design, so
// pdfmake's default left-alignment leaves them sitting off-centre - flank
// with two equal auto-stretching columns to centre the fixed-width table.
function centeredTable(tableDef) {
    return {
        margin: [0, 8, 0, 0],
        columns: [
            { width: '*', text: '' },
            { width: TABLE_WIDTH, table: tableDef.table, layout: tableDef.layout },
            { width: '*', text: '' }
        ]
    };
}

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

// "Label: value" cell with only the label bold - the retrieved value
// (inspector name, date, etc.) renders at normal weight.
function lv(label, value, extra) {
    extra = extra || {};
    return {
        text: [
            { text: label, bold: true },
            { text: value != null ? String(value) : '' }
        ],
        fontSize: 7,
        ...extra
    };
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
    var proformaConfig = getBCIProformaConfig(bridgeData.type || 'Bridge');
    var BCI_ELEMENTS = proformaConfig.elements;
    var BCI_GROUPS = proformaConfig.groups;
    var BCI_SPARE = proformaConfig.spare;

    for (var spanIdx = 0; spanIdx < totalSpans; spanIdx++) {
        var spanNum  = spanIdx + 1;
        var spanData = (spansData || []).find(function(s) { return Number(s.span_number) === spanNum; }) || {};
        var defects  = spanData.defects || [];
        // Only the primary defect counts toward the main table when an
        // element has more than one (see setAsPrimaryDefect in inspection.js)
        // — fall back to whichever came first if none is flagged primary.
        var defByEl  = {};
        defects.forEach(function(d) {
            var k = d.element_no != null ? d.element_no : d.elementNumber;
            if (!defByEl[k] || d.is_primary) defByEl[k] = d;
        });

        var inspector  = spanData.inspector_name  || '';
        var date       = spanData.inspection_date
            ? new Date(spanData.inspection_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
            : '';
        var nextInsp   = spanData.next_inspection || '';
        var roadRef    = bridgeData.road_ref || bridgeData.location || '';
        var mapRef     = bridgeData.grid_reference || (bridgeData.latitude && bridgeData.longitude ? '' + Number(bridgeData.latitude).toFixed(3) + ', ' + Number(bridgeData.longitude).toFixed(3) : '');
        var osE        = bridgeData.easting  || bridgeData.ose || '';
        var osN        = bridgeData.northing || bridgeData.osn || '';
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
            lv('Inspector: ', inspector, { colSpan: 5 }),
            { text: '' }, { text: '' }, { text: '' }, { text: '' },
            lv('Date: ', date, { colSpan: 5 }),
            { text: '' }, { text: '' }, { text: '' }, { text: '' },
            lv('Next inspection: ', nextInsp, { colSpan: 5 }),
            { text: '' }, { text: '' }, { text: '' }, { text: '' },
            lv('Road Ref: ', roadRef, { colSpan: 5 }),
            { text: '' }, { text: '' }, { text: '' }, { text: '' }
        ]);

        // ROW 3: BridgeName(10) | BridgeRef(6) | BridgeCode(1) | PrimaryForm(3) = 20
        tableBody.push([
            lv('Bridge name: ', structureName, { colSpan: 10 }),
            { text: '' }, { text: '' }, { text: '' }, { text: '' }, { text: '' }, { text: '' }, { text: '' }, { text: '' }, { text: '' },
            lv('Bridge Ref: ', structureId, { colSpan: 6 }),
            { text: '' }, { text: '' }, { text: '' }, { text: '' }, { text: '' },
            { text: [{ text: 'Bridge\ncode\n', bold: true }, { text: String(bridgeCode) }],
              rowSpan: 4, fontSize: 6.5, alignment: 'center', fillColor: BCI_COLORS.sectionBg },
            lv('Primary deck form (Table G.4): ', primForm, { colSpan: 3 }),
            { text: '' }, { text: '' }
        ]);

        // ROW 4: MapRef(5) | OSE(5) | OSN(6) | BLANK(1) | PrimaryMat(3) = 20
        tableBody.push([
            lv('Map Ref: ', mapRef, { colSpan: 5 }),
            { text: '' }, { text: '' }, { text: '' }, { text: '' },
            lv('OSE: ', osE, { colSpan: 5 }),
            { text: '' }, { text: '' }, { text: '' }, { text: '' },
            lv('OSN: ', osN, { colSpan: 6 }),
            { text: '' }, { text: '' }, { text: '' }, { text: '' }, { text: '' },
            { text: '' },
            lv('Primary deck material (Table G.6): ', primMat, { colSpan: 3 }),
            { text: '' }, { text: '' }
        ]);

        // ROW 5: Span(4) | SpanW(6) | SpanL(6) | BLANK(1) | SecForm(3) = 20
        tableBody.push([
            lv('Span: ', spanNum + ' of ' + totalSpans, { colSpan: 4 }),
            { text: '' }, { text: '' }, { text: '' },
            lv('Span Width (m): ', spanW, { colSpan: 6 }),
            { text: '' }, { text: '' }, { text: '' }, { text: '' }, { text: '' },
            lv('Span Length (m): ', spanL, { colSpan: 6 }),
            { text: '' }, { text: '' }, { text: '' }, { text: '' }, { text: '' },
            { text: '' },
            lv('Secondary deck form (Table G.5): ', secForm, { colSpan: 3 }),
            { text: '' }, { text: '' }
        ]);

        // ROW 6: AllInspected(10) | Photos(6) | BLANK(1) | SecMat(3) = 20
        tableBody.push([
            lv('All above ground elements inspected: ', inspected, { colSpan: 10 }),
            { text: '' }, { text: '' }, { text: '' }, { text: '' }, { text: '' }, { text: '' }, { text: '' }, { text: '' }, { text: '' },
            lv('Photographs: ', photos, { colSpan: 6 }),
            { text: '' }, { text: '' }, { text: '' }, { text: '' }, { text: '' },
            { text: '' },
            lv('Secondary deck material (Table G.6): ', secMat, { colSpan: 3 }),
            { text: '' }, { text: '' }
        ]);

        // ROW 7: BCI Scores
        tableBody.push([
            {
                text: [
                    { text: 'BCI crit: ', bold: true }, { text: bciCrit },
                    { text: '    |    BCI ave: ', bold: true }, { text: bciAv }
                ],
                colSpan: 20, fontSize: 8, alignment: 'center'
            },
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

        // Stretch the data rows (elements + spare - rows 8 through the row
        // before the footer) so the table reaches the same total height as
        // page 2's, regardless of how many elements this structure type has.
        var dataRowCount = BCI_ELEMENTS.length + BCI_SPARE.length;
        var dataRowFirstIdx = 8;
        var dataRowLastIdx = dataRowFirstIdx + dataRowCount - 1;
        var dataRowHeightTarget = (PAGE_TARGET_HEIGHT - PAGE1_FIXED_ROWS_HEIGHT) / dataRowCount;
        var dataRowPad = Math.max(1.5, (dataRowHeightTarget - PAGE1_DATA_TEXT_HEIGHT) / 2);
        var page1Layout = {
            hLineWidth:    function() { return 0.5; },
            vLineWidth:    function() { return 0.5; },
            hLineColor:    function() { return '#000000'; },
            vLineColor:    function() { return '#000000'; },
            // pdfmake (0.2.7) accumulates paddingLeft+paddingRight into the
            // x-offset of every column after the first, per preceding
            // column - with 17 narrow columns before the wide label columns
            // (17-19), normal 2pt padding compounds into ~70-90pt of drift,
            // pushing "Primary deck form..."-style text well past the
            // table's right edge. Zero padding on the narrow columns keeps
            // that drift to a few pt; the wide columns keep normal padding.
            paddingLeft:   function(i) { return i < 17 ? 0 : 2; },
            paddingRight:  function(i) { return i < 17 ? 0 : 2; },
            paddingTop:    function(i) { return (i >= dataRowFirstIdx && i <= dataRowLastIdx) ? dataRowPad : 1.5; },
            paddingBottom: function(i) { return (i >= dataRowFirstIdx && i <= dataRowLastIdx) ? dataRowPad : 1.5; },
        };

        content.push(centeredTable({
            table: { widths: COL_WIDTHS, body: tableBody },
            layout: page1Layout,
        }));
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

    var USABLE_PT       = PAGE_TARGET_HEIGHT;
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
        // Primary defect always shown first (Defect 1) among the up to 3
        // listed per element.
        Object.keys(defByEl).forEach(function(k) {
            defByEl[k].sort(function(a, b) { return (b.is_primary ? 1 : 0) - (a.is_primary ? 1 : 0); });
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
            lv('Name: ', inspector, { colSpan: 7 }),
            { text: '' }, { text: '' }, { text: '' }, { text: '' }, { text: '' }, { text: '' },
            { text: [{ text: 'Signed: ', bold: true }, { text: inspector, italics: true }], colSpan: 8, fontSize: 7 },
            { text: '' }, { text: '' }, { text: '' }, { text: '' }, { text: '' }, { text: '' }, { text: '' },
            lv('Date: ', date, { colSpan: 5 }),
            { text: '' }, { text: '' }, { text: '' }, { text: '' }
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
            lv('Name: ', '', { colSpan: 7 }),
            { text: '' }, { text: '' }, { text: '' }, { text: '' }, { text: '' }, { text: '' },
            { text: 'Signed: ', bold: true, colSpan: 8, fontSize: 7 },
            { text: '' }, { text: '' }, { text: '' }, { text: '' }, { text: '' }, { text: '' }, { text: '' },
            lv('Date: ', date, { colSpan: 5 }),
            { text: '' }, { text: '' }, { text: '' }, { text: '' }
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
            lv('Name: ', inspector, { colSpan: 7 }),
            { text: '' }, { text: '' }, { text: '' }, { text: '' }, { text: '' }, { text: '' },
            { text: [{ text: 'Signed: ', bold: true }, { text: inspector, italics: true }], colSpan: 8, fontSize: 7 },
            { text: '' }, { text: '' }, { text: '' }, { text: '' }, { text: '' }, { text: '' }, { text: '' },
            lv('Date: ', date, { colSpan: 5 }),
            { text: '' }, { text: '' }, { text: '' }, { text: '' }
        ]);

        var page2Layout = {
            hLineWidth:    function() { return 0.5; },
            vLineWidth:    function() { return 0.5; },
            hLineColor:    function() { return '#000000'; },
            vLineColor:    function() { return '#000000'; },
            // See page1Layout's comment - same pdfmake column-offset quirk,
            // same fix.
            paddingLeft:   function(i) { return i < 17 ? 0 : 2; },
            paddingRight:  function(i) { return i < 17 ? 0 : 2; },
            paddingTop:    function(rowIndex) { return COMMENT_ROW_INDICES.has(rowIndex) ? commentPad : dataPad; },
            paddingBottom: function(rowIndex) { return COMMENT_ROW_INDICES.has(rowIndex) ? commentPad : dataPad; },
        };

        content.push(centeredTable({
            table: { widths: COL_WIDTHS, body: tableBody },
            layout: page2Layout,
        }));
    }

    return content;
}

// ─── Expose globally ─────────────────────────────────────────────────────────
window.buildBCIProformaContent = buildBCIProformaContent;
window.buildBCIPage2Content = buildBCIPage2Content;

} // end guard: typeof buildBCIProformaContent === 'undefined'