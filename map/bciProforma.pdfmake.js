/**
 * bciProforma.pdfmake.js  (v10 - Working colSpan Version)
 * Guarded to prevent double-declaration errors
 */

if (typeof buildBCIProformaContent === 'undefined') {

// ─── Colours ─────────────────────────────────────────────────────────────────
// Teal-tinted greys (spanSense's accent is #5b8c8a) instead of the flat
// neutral greys this proforma used before, at the same lightness/contrast
// levels so the header/section hierarchy still reads the same.
var BCI_COLORS = {
    headerBg:  '#c3d9d6',
    sectionBg: '#dbe9e7',
    titleBg:   '#1e3432',
    footerBg:  '#dbe9e7',
    white:     '#ffffff',
    black:     '#000000',
    priorityH: '#dc2626',
    priorityM: '#f97316',
    priorityL: '#16a34a',
};

// ─── BCI elements, per structure type ────────────────────────────────────────
var BCI_ELEMENTS_BY_TYPE = {
    Bridge: [
        { no: 1,  desc: 'Primary deck element' },
        { no: 2,  desc: 'Transverse beams' },
        { no: 3,  desc: 'Secondary deck element' },
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
// vs a Bridge's - ends up visibly shorter). 0.95 (up from an original 0.967
// - which sounds like a decrease, but the *actual* rendered height used to
// fall well short of that 0.967 target too, see PAGE1_FIXED_ROWS_HEIGHT
// below) leaves a real, tested buffer under the 761.89pt usable A4 height
// (841.89 minus 40pt top+bottom margins) once centeredTable's own 8pt top
// margin is accounted for - 0.99 was tried first and overflowed the
// footer row onto its own extra page.
var PAGE_TARGET_HEIGHT = (841 - 80) * 0.95;

// Page 1's 8 header/info rows + 1 footer row, at their natural (unstretched)
// 1.5pt padding, and the natural height of one data row's text alone with
// padding removed - both measured the same way as PAGE_TARGET_HEIGHT above
// (render + measure), used to size the *data* rows (elements + spare) so
// the whole table reaches PAGE_TARGET_HEIGHT regardless of element count.
// PAGE1_FIXED_ROWS_HEIGHT was last measured before the element-description
// and "(Table G.x)"-label text was shortened elsewhere in this file; with
// those rows now wrapping less, they render far shorter than 164 assumed,
// which was silently starving every data row's padding (that's what was
// behind the large empty gap under the table) - re-measured at ~107.4.
var PAGE1_FIXED_ROWS_HEIGHT = 107.5;
// Re-measured alongside PAGE1_FIXED_ROWS_HEIGHT above - was also stale (had
// been 10.627), confirmed via a direct test render with padding hardcoded
// to a known value and measuring the resulting row height back out.
var PAGE1_DATA_TEXT_HEIGHT = 8.7;

// A4 usable width with 40pt margins = 515pt. Table is 375pt by base design,
// scaled up 15% then another 10% per request (474.4pt, still under the
// 515pt usable width, so centering still leaves margin on both sides).
var PW = 375 * 1.15 * 1.10;

// 20 column widths
// Element Description (cols 2-6) widened at the expense of Comments/Remarks
// (cols 14-19, still by far the widest column group at 0.14 each for 17-18) -
// col 16 (the rotated "Bridge code" cell) is left untouched since its box
// height/width was tuned by hand against this exact value.
var COL_WIDTHS = [
    PW * 0.04, PW * 0.04, PW * 0.052, PW * 0.052, PW * 0.052,
    PW * 0.052, PW * 0.052, PW * 0.04, PW * 0.04, PW * 0.04,
    PW * 0.04, PW * 0.04, PW * 0.04, PW * 0.04, PW * 0.04,
    PW * 0.04, PW * 0.04, PW * 0.11,  PW * 0.11,  PW * 0.04
];
var TABLE_WIDTH = COL_WIDTHS.reduce(function(a, b) { return a + b; }, 0);

// Tables are narrower than the usable page width (515pt) by design, so
// pdfmake's default left-alignment leaves them sitting off-centre - flank
// with two equal auto-stretching columns to centre the fixed-width table.
// Centers the table by computing its left margin directly, rather than
// flanking it with two equal '*'-width columns - that trick only centers
// correctly if the middle column's declared width (TABLE_WIDTH, the sum of
// COL_WIDTHS) exactly equals the table's true rendered width, but pdfmake
// draws the 21 vertical gridlines (20 columns) at extra width beyond the
// column sum, so the table was consistently wider than TABLE_WIDTH and
// bled into the right-hand flanking column - visually shifting it right.
// PAGE_USABLE_WIDTH/TABLE_BORDER_OVERHEAD below were tuned by rendering and
// measuring, same as the height constants.
var PAGE_USABLE_WIDTH = 515.28; // A4 width (595.28pt) minus 40pt left+right margins
var TABLE_BORDER_OVERHEAD = 21 * 1.1; // 21 vertical gridlines, empirically ~1.1pt of width each once rendered
function centeredTable(tableDef) {
    var trueWidth = TABLE_WIDTH + TABLE_BORDER_OVERHEAD;
    var sideMargin = Math.max(0, (PAGE_USABLE_WIDTH - trueWidth) / 2);
    return {
        margin: [sideMargin, 8, 0, 0],
        table: tableDef.table,
        layout: tableDef.layout
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

// pdfmake table cells can't rotate plain text, so vertical labels ("Set"
// column, "Bridge code") are drawn as a rotated canvas image instead.
// Rendered as a canvas raster rather than an inline SVG (the previous
// approach) - pdfMake's bundled svg-to-pdfkit was found to leak coordinate-
// space state *between separate createPdf() calls in the same page
// session*: the 2nd+ BCI Proforma generated without a page reload had these
// labels' clip rect and transform silently replaced with the full A4 page
// width and a zero offset, corrupting/offsetting the text (diagnosed by
// diffing the actual PDF content streams of two consecutive generations).
// A canvas image never touches that library code path, so it can't inherit
// stale state from a previous render. It also sidesteps the old dominant-
// baseline-vs-alphabetic-baseline inconsistency across PDF renderers
// (pdf.js vs PDFium/Acrobat) that the SVG version had to work around by
// hand - canvas's textBaseline is reliable, so no pre-shift hack is needed.
function rotatedLabel(text, w, h, fontSize, allowWrap) {
    fontSize = fontSize || 6.5;
    var scale = 4; // supersample so the raster stays crisp when zoomed/printed
    var canvas = document.createElement('canvas');
    canvas.width = w * scale;
    canvas.height = h * scale;
    var ctx = canvas.getContext('2d');
    ctx.scale(scale, scale);
    ctx.translate(w / 2, h / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold ' + fontSize + 'pt Helvetica, Arial, sans-serif';
    ctx.fillStyle = '#000000';

    // Long "Set" column labels ("Load-bearing Substructure", "Other Bridge
    // Elements"...) don't fit as one rotated line in every group's h (some
    // rowSpans are as short as ~42pt) - wrap onto a 2nd parallel rotated
    // line rather than letting the single line overflow/clip past the cell.
    // Two lines still fit within this column's existing w (~19pt: two ~6pt-
    // tall lines plus gaps), so this needed a code change, not a wider
    // column. Opt-in (setCell only) - the "Bridge code" label stays as a
    // single line as before.
    var maxLineLength = h - 4;
    if (!allowWrap || ctx.measureText(text).width <= maxLineLength) {
        ctx.fillText(text, 0, 0);
    } else {
        var words = text.split(' ');
        var line1 = words[0];
        var i = 1;
        for (; i < words.length; i++) {
            var candidate = line1 + ' ' + words[i];
            if (ctx.measureText(candidate).width > maxLineLength) break;
            line1 = candidate;
        }
        var line2 = words.slice(i).join(' ');
        var lineGap = fontSize * 1.35;
        ctx.fillText(line1, 0, -lineGap / 2);
        ctx.fillText(line2, 0, lineGap / 2);
    }
    return { image: canvas.toDataURL('image/png'), fit: [w, h] };
}

function setCell(label, rowSpan, rowHeightTarget, rowPad) {
    var w = COL_WIDTHS[0];
    // This cell gets rowPad top+bottom padding once (not per spanned row)
    // around its content, so leave room for that plus a small margin. The
    // per-row "- 2" safety margin (not just a single flat one) matters here:
    // any leftover overshoot in a rowSpan cell gets absorbed entirely into
    // the *last* spanned row rather than spread evenly, so on a 9-row group
    // a flat margin that looks fine on a 4-row group still visibly stretches
    // that group's last row (elements 7/14/21/25/34/38/42 - each the last
    // row of its "Set" group - showed exactly this before this was per-row).
    var h = Math.max(10, rowSpan * (rowHeightTarget - 2) - 2 * rowPad - 2);
    return Object.assign(
        { rowSpan: rowSpan, alignment: 'center', fillColor: BCI_COLORS.sectionBg },
        rotatedLabel(label, w, h, 6, true)
    );
}

// Left-aligned (the pdfmake default) text cells get a one-space left margin,
// as literal text rather than cell padding - page1Layout/page2Layout
// deliberately zero out paddingLeft on the narrow columns to avoid a pdfmake
// column-offset drift bug (see their comments below), so padding isn't an
// option here. Centered/right-aligned cells and rotated (svg) labels are
// left untouched since they don't start flush against the left border.
function padCellText(c) {
    if (!c || c.alignment === 'center' || c.alignment === 'right' || c.svg) return c;
    if (typeof c.text === 'string') {
        if (c.text !== '') c.text = ' ' + c.text;
    } else if (Array.isArray(c.text) && c.text.length && typeof c.text[0].text === 'string' && c.text[0].text !== '') {
        c.text[0].text = ' ' + c.text[0].text;
    }
    return c;
}
function padTableBody(tableBody) {
    tableBody.forEach(function(row) { row.forEach(padCellText); });
    return tableBody;
}

// ─────────────────────────────────────────────────────────────────────────────
//  PAGE 1
// ─────────────────────────────────────────────────────────────────────────────
// `singleSpanIdx`, when given, builds only that one span's page instead of
// every span - used by buildBCIProformaFullContent below to interleave page
// 1/page 2 per span (span1 p1, span1 p2, span2 p1, span2 p2, ...) instead of
// all page 1s followed by all page 2s. The page-break-before logic further
// down (`if (spanIdx > 0) ...`) already does the right thing unchanged: with
// a single span requested, spanIdx *is* singleSpanIdx, so it only skips the
// break when that span is the very first page of the whole document.
function buildBCIProformaContent(bciFormData, singleSpanIdx) {
    var content = [];
    if (!bciFormData || bciFormData.error) {
        content.push({ text: 'BCI data unavailable: ' + (bciFormData && bciFormData.error ? bciFormData.error : ''), italics: true, color: '#888' });
        return content;
    }

    var structureName = bciFormData.structureName || '';
    var structureId = bciFormData.structureId || '';
    var bridgeData = bciFormData.bridgeData || {};
    var totalSpans = bciFormData.totalSpans || 1;
    var spanRangeStart = singleSpanIdx != null ? singleSpanIdx : 0;
    var spanRangeEnd = singleSpanIdx != null ? singleSpanIdx + 1 : totalSpans;
    var spansData = bciFormData.spansData || [];
    var proformaConfig = getBCIProformaConfig(bridgeData.type || 'Bridge');
    var BCI_ELEMENTS = proformaConfig.elements;
    var BCI_GROUPS = proformaConfig.groups;
    var BCI_SPARE = proformaConfig.spare;

    for (var spanIdx = spanRangeStart; spanIdx < spanRangeEnd; spanIdx++) {
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
        // Number(...).toFixed(2), not String(...) - bci_crit/bci_av often
        // arrive as float division results (e.g. 28.080000000000013), and
        // printing that straight to the PDF looked like a calculation bug.
        var bciCrit    = spanData.bci_crit != null && !isNaN(Number(spanData.bci_crit)) ? Number(spanData.bci_crit).toFixed(2) : '—';
        var bciAv      = spanData.bci_av != null && !isNaN(Number(spanData.bci_av)) ? Number(spanData.bci_av).toFixed(2) : '—';
        var bridgeCode = bridgeData.bridge_code || '';
        var inspType   = spanData.inspection_type || '';

        if (spanIdx > 0) content.push({ text: '', pageBreak: 'before' });

        var tableBody = [];

        // Ticks the inspection type this span's report is for (SI/GI/PI).
        // Drawn as an SVG path rather than a "✓" character - pdfmake's
        // embedded font subset is missing that glyph (renders as a tofu
        // box, same as the pre-existing ✓ used in the Action column
        // further down).
        function inspTypeHeader(label, code) {
            if (inspType !== code) {
                return { text: label, colSpan: 3, bold: true, fontSize: 7,
                         alignment: 'center', fillColor: BCI_COLORS.headerBg };
            }
            return {
                colSpan: 3, fillColor: BCI_COLORS.headerBg,
                columns: [
                    { width: '*', text: '' },
                    { width: 'auto', text: label, bold: true, fontSize: 7 },
                    { width: 3, text: '' },
                    { width: 8, margin: [0, 1, 0, 0],
                      svg: '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8" viewBox="0 0 24 24">' +
                           '<path d="M3 13 L9 19 L21 5" stroke="#1a7a3c" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>' +
                           '</svg>' },
                    { width: '*', text: '' }
                ]
            };
        }

        // ROW 1: Superficial(3) | General(3) | Principal(3) | Forms(11) = 20
        tableBody.push([
            inspTypeHeader('Superficial', 'SI'),
            { text: '' }, { text: '' },
            inspTypeHeader('General', 'GI'),
            { text: '' }, { text: '' },
            inspTypeHeader('Principal', 'PI'),
            { text: '' }, { text: '' },
            { text: 'Number of construction forms in bridge/span*: 1', colSpan: 11, fontSize: 7, fillColor: BCI_COLORS.headerBg },
            { text: '' }, { text: '' }, { text: '' }, { text: '' }, { text: '' }, { text: '' }, { text: '' }, { text: '' }, { text: '' }, { text: '' }
        ]);

        // ROW 2: Inspector(5) | Date(5) | Next(7) | Road(3) = 20
        // Next inspection needs more room than Road Ref to keep its (longer)
        // date + type text on one line - Road Ref values are typically short.
        tableBody.push([
            lv('Inspector: ', inspector, { colSpan: 5 }),
            { text: '' }, { text: '' }, { text: '' }, { text: '' },
            lv('Date: ', date, { colSpan: 5 }),
            { text: '' }, { text: '' }, { text: '' }, { text: '' },
            lv('Next inspection: ', nextInsp, { colSpan: 7 }),
            { text: '' }, { text: '' }, { text: '' }, { text: '' }, { text: '' }, { text: '' },
            lv('Road Ref: ', roadRef, { colSpan: 3 }),
            { text: '' }, { text: '' }
        ]);

        // ROW 3: BridgeName(10) | BridgeRef(6) | BridgeCode(1) | PrimaryForm(3) = 20
        tableBody.push([
            lv('Bridge name: ', structureName, { colSpan: 10 }),
            { text: '' }, { text: '' }, { text: '' }, { text: '' }, { text: '' }, { text: '' }, { text: '' }, { text: '' }, { text: '' },
            lv('Bridge Ref: ', structureId, { colSpan: 6 }),
            { text: '' }, { text: '' }, { text: '' }, { text: '' }, { text: '' },
            Object.assign(
                { rowSpan: 4, alignment: 'center', fillColor: BCI_COLORS.sectionBg },
                // Spans ROW3-ROW6, which aren't part of the data-row stretch
                // system, so there's no computed target height to reuse here
                // - PAGE1_FIXED_ROWS_HEIGHT/9 (used previously) averages in
                // the much taller header/column-header rows and overshoots
                // rows 3-6's real height, forcing the last of them to grow;
                // 44 was tuned by rendering and measuring those 4 rows
                // directly (same approach as PAGE1_DATA_TEXT_HEIGHT above).
                rotatedLabel(' Bridge code ' + bridgeCode, COL_WIDTHS[16], 44, 6)
            ),
            lv('Primary deck form: ', primForm, { colSpan: 3 }),
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
            lv('Primary deck material: ', primMat, { colSpan: 3 }),
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
            lv('Secondary deck form: ', secForm, { colSpan: 3 }),
            { text: '' }, { text: '' }
        ]);

        // ROW 6: AllInspected(10) | Photos(6) | BLANK(1) | SecMat(3) = 20
        tableBody.push([
            lv('All above ground elements inspected: ', inspected, { colSpan: 10 }),
            { text: '' }, { text: '' }, { text: '' }, { text: '' }, { text: '' }, { text: '' }, { text: '' }, { text: '' }, { text: '' },
            lv('Photographs: ', photos, { colSpan: 6 }),
            { text: '' }, { text: '' }, { text: '' }, { text: '' }, { text: '' },
            { text: '' },
            lv('Secondary deck material: ', secMat, { colSpan: 3 }),
            { text: '' }, { text: '' }
        ]);

        // ROW 7: BCI Scores
        tableBody.push([
            {
                text: [
                    { text: 'BCI', bold: true }, { text: 'crit', bold: true, sub: {}, fontSize: 6 }, { text: ': ', bold: true }, { text: bciCrit },
                    { text: '    |    BCI', bold: true }, { text: 'avg', bold: true, sub: {}, fontSize: 6 }, { text: ': ', bold: true }, { text: bciAv }
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

        // Target height of one data row - needed up-front (not just for page1Layout's
        // padding below) so the rotated "Set" column labels can be sized to their
        // rowSpan before those rows are built.
        var dataRowCount = BCI_ELEMENTS.length + BCI_SPARE.length;
        var dataRowFirstIdx = 8;
        var dataRowLastIdx = dataRowFirstIdx + dataRowCount - 1;
        var dataRowHeightTarget = (PAGE_TARGET_HEIGHT - PAGE1_FIXED_ROWS_HEIGHT) / dataRowCount;
        var dataRowPad = Math.max(1.5, (dataRowHeightTarget - PAGE1_DATA_TEXT_HEIGHT) / 2);

        // ========== DATA ROWS ==========
        var elIdx = 0;
        BCI_GROUPS.forEach(function(group) {
            var groupEls = BCI_ELEMENTS.slice(elIdx, elIdx + group.count);
            elIdx += group.count;

            groupEls.forEach(function(el, idxInGroup) {
                var d = defByEl[el.no] || {};
                var hasMulti = defects.filter(function(x) { return (x.element_no != null ? x.element_no : x.elementNumber) === el.no; }).length > 1;

                // "No Defects" and "Not Inspected" (Option F segmented control - see
                // setModalSegment/saveChanges in inspectionA.js) are both saved as
                // defect_type '0', distinguished only by defect_number ('0' vs '1').
                // NOTE: the API aliases this column "defn" (lowercase) - Postgres
                // folds unquoted SQL aliases to lowercase, so `d.defN` here was
                // always undefined and silently fell through to the plain-def-type
                // branch below, e.g. showing "1" instead of "1.1", or "0" instead
                // of blank/"NI" for the special states.
                var isNoDefect     = d.def === '0' && d.defn === '0';
                var isNotInspected = d.def === '0' && d.defn === '1';

                var defDisplay = '-';
                if (isNoDefect) defDisplay = '';
                else if (isNotInspected) defDisplay = 'NI';
                else if (d.def && d.defn) defDisplay = d.def + '.' + d.defn;
                else if (d.def) defDisplay = String(d.def);

                var comments = hasMulti ? 'See multiple defects table' : (d.comments_remarks && d.comments_remarks !== '-' ? d.comments_remarks : '');

                var dataRow = [];

                if (idxInGroup === 0) {
                    dataRow.push(setCell(group.label, group.count, dataRowHeightTarget, dataRowPad));
                } else {
                    dataRow.push({ text: '' });
                }

                dataRow.push({ text: String(el.no), alignment: 'center', fontSize: 7 });
                dataRow.push({ text: el.desc, colSpan: 5, fontSize: 7 });
                dataRow.push({ text: '' });
                dataRow.push({ text: '' });
                dataRow.push({ text: '' });
                dataRow.push({ text: '' });
                dataRow.push({ text: isNotInspected ? '' : String(d.s != null ? d.s : '-'), alignment: 'center', fontSize: 7 });
                dataRow.push({ text: isNotInspected ? '' : String(d.ex != null ? d.ex : '-'), alignment: 'center', fontSize: 7 });
                dataRow.push({ text: defDisplay, alignment: 'center', fontSize: 7 });
                // Priority/cost only mean anything when works are actually
                // required - 'M' (possibly) and 'N' (no) shouldn't carry a
                // priority or cost over here either, matching the narrative
                // PDF report's own worksRequired === 'Y' gate for cost.
                var worksNotRequired = isNotInspected || d.w !== 'Y';
                dataRow.push({ text: isNotInspected ? '' : String(d.w != null ? d.w : '-'), alignment: 'center', fontSize: 7 });
                dataRow.push({ text: worksNotRequired ? '' : String(d.p != null ? d.p : '-'), alignment: 'center', fontSize: 7 });
                dataRow.push({ text: worksNotRequired ? '' : String(d.cost != null ? d.cost : ''), colSpan: 2, alignment: 'right', fontSize: 7 });
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
                spareRow.push(setCell('Others', BCI_SPARE.length, dataRowHeightTarget, dataRowPad));
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
            // .slice() - pdfMake's table layout mutates a table's `widths`
            // array in place, replacing each plain number with an internal
            // {width, _minWidth, _maxWidth, _calcWidth} measurement object
            // once it lays the table out. Handing it the shared COL_WIDTHS
            // array directly (as this did before) meant the *first* BCI
            // Proforma rendered in a page session permanently corrupted that
            // module-level constant for every later render: rotatedLabel's
            // `w` (read from COL_WIDTHS[0] elsewhere) silently became one of
            // those objects, `w * scale` went NaN, and a NaN canvas.width
            // clamps to 0 - a 0x0 canvas's toDataURL() is exactly the
            // `'data:,'` pdfMake choked on, and before that, string-
            // concatenating that object into the old SVG's width attribute
            // is what silently produced the offset/oversized "Set" column
            // labels. A fresh array per render can't leak into the next one.
            table: { widths: COL_WIDTHS.slice(), body: padTableBody(tableBody) },
            layout: page1Layout,
        }));
    }

    return content;
}

// See buildBCIProformaContent's comment above re: singleSpanIdx - this
// function already puts a pageBreak before every span unconditionally
// (right below), which is exactly right for both the legacy (all page 2s
// back-to-back) and interleaved (one span's page 2 right after its page 1)
// arrangements, so nothing else here needs to change for it.
function buildBCIPage2Content(bciFormData, singleSpanIdx) {
    var content = [];

    if (!bciFormData || bciFormData.error) {
        content.push({ text: 'BCI data unavailable: ' + (bciFormData && bciFormData.error ? bciFormData.error : ''), italics: true, color: '#888' });
        return content;
    }

    var totalSpans = bciFormData.totalSpans || 1;
    var spanRangeStart = singleSpanIdx != null ? singleSpanIdx : 0;
    var spanRangeEnd = singleSpanIdx != null ? singleSpanIdx + 1 : totalSpans;
    var spansData = bciFormData.spansData || [];
    var worksRequired = bciFormData.worksRequired || {};

    // Same per-structure-type element/spare counts page 1 uses, so this
    // page's "Multiple Defects"/"Work Required" content rows come out at
    // the exact same height as page 1's element rows (same fontSize:7,
    // same PAGE1_DATA_TEXT_HEIGHT baseline) instead of their own fixed,
    // unrelated 18*1.05 value.
    var page2ProformaConfig = getBCIProformaConfig((bciFormData.bridgeData && bciFormData.bridgeData.type) || 'Bridge');
    var page1DataRowCount = page2ProformaConfig.elements.length + page2ProformaConfig.spare.length;
    var page1DataRowHeightTarget = (PAGE_TARGET_HEIGHT - PAGE1_FIXED_ROWS_HEIGHT) / page1DataRowCount;

    var USABLE_PT       = PAGE_TARGET_HEIGHT;
    var MULTI_ROW_COUNT = 5;
    var WORK_ROW_COUNT  = 6;
    var TOTAL_ROWS      = 23;
    var COMMENT_ROWS    = 2;
    var TEXT_H          = PAGE1_DATA_TEXT_HEIGHT;
    var DATA_ROW_H      = page1DataRowHeightTarget;
    var FIXED_ROWS      = TOTAL_ROWS - COMMENT_ROWS;
    var FIXED_TOTAL     = FIXED_ROWS * DATA_ROW_H;
    // Whatever's left over (rather than more content rows) goes entirely
    // into the two comment boxes below, split evenly so they're always
    // the same height as each other regardless of how that leftover varies.
    var COMMENT_H       = (USABLE_PT - FIXED_TOTAL) / COMMENT_ROWS;
    var commentPad = Math.max(1.5, (COMMENT_H  - TEXT_H) / 2);
    // Unlike page 1's data rows (always at least a "-" placeholder), the 5
    // blank Multiple Defects rows and 6 blank Work Required rows start out
    // with genuinely empty cells - near-zero natural content height - so
    // reaching DATA_ROW_H needs padding sized off the empty case
    // (DATA_ROW_H / 2) for *those specific rows only*; the section/column
    // header rows around them do have real (bold, similar to page 1's "-")
    // text, so they keep the TEXT_H-based padding, matching the FIXED_TOTAL
    // budget's assumption that every one of the 21 non-comment rows reaches
    // DATA_ROW_H on its own rather than compounding on top of real content.
    var dataPad      = Math.max(1.5, (DATA_ROW_H - TEXT_H) / 2);
    var dataPadBlank = Math.max(1.5, DATA_ROW_H / 2);
    var COMMENT_ROW_INDICES = new Set([9, 12]);
    var BLANK_ROW_INDICES = new Set([3, 4, 5, 6, 7, 16, 17, 18, 19, 20, 21]);

    for (var spanIdx = spanRangeStart; spanIdx < spanRangeEnd; spanIdx++) {
        var spanNum   = spanIdx + 1;
        var spanData  = (spansData || []).find(function(s) { return Number(s.span_number) === spanNum; }) || {};
        var defects   = spanData.defects || [];
        var spanWorks = (worksRequired.worksRequired || []).filter(function(w) { return Number(w.spanNumber) === spanNum; });

        var inspector = spanData.inspector_name  || '';
        var date      = spanData.inspection_date ? formatDate(spanData.inspection_date) : '';
        var comments  = spanData.comments        || '';
        var engineerName     = spanData.reviewed_by || '';
        var engineerComments = spanData.engineer_comments || '';
        var engineerDate = spanData.reviewed_at ? formatDate(spanData.reviewed_at) : '';

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
            var fmtDef = function(d) { return !d.def ? '' : d.defn ? d.def + '.' + d.defn : String(d.def); };
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
            { text: engineerComments, colSpan: 20, fontSize: 7 },
            ...Array(19).fill({ text: '' })
        ]);

        tableBody.push([
            lv('Name: ', engineerName, { colSpan: 7 }),
            { text: '' }, { text: '' }, { text: '' }, { text: '' }, { text: '' }, { text: '' },
            { text: [{ text: 'Signed: ', bold: true }, { text: engineerName, italics: true }], colSpan: 8, fontSize: 7 },
            { text: '' }, { text: '' }, { text: '' }, { text: '' }, { text: '' }, { text: '' }, { text: '' },
            lv('Date: ', engineerDate, { colSpan: 5 }),
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
            // Same 'Y'-only gate as the page 1 data grid - 'M' (possibly)
            // and 'N' (no) shouldn't carry a priority or cost either.
            var worksNotRequired = w.worksRequired !== 'Y';
            var priority = worksNotRequired ? '' : (w.priority || '');
            var cost     = worksNotRequired ? '' : ((w.cost && w.cost !== 'Not specified') ? w.cost : '');
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
            paddingTop:    function(rowIndex) { return COMMENT_ROW_INDICES.has(rowIndex) ? commentPad : BLANK_ROW_INDICES.has(rowIndex) ? dataPadBlank : dataPad; },
            paddingBottom: function(rowIndex) { return COMMENT_ROW_INDICES.has(rowIndex) ? commentPad : BLANK_ROW_INDICES.has(rowIndex) ? dataPadBlank : dataPad; },
        };

        content.push(centeredTable({
            // .slice() - pdfMake's table layout mutates a table's `widths`
            // array in place, replacing each plain number with an internal
            // {width, _minWidth, _maxWidth, _calcWidth} measurement object
            // once it lays the table out. Handing it the shared COL_WIDTHS
            // array directly (as this did before) meant the *first* BCI
            // Proforma rendered in a page session permanently corrupted that
            // module-level constant for every later render: rotatedLabel's
            // `w` (read from COL_WIDTHS[0] elsewhere) silently became one of
            // those objects, `w * scale` went NaN, and a NaN canvas.width
            // clamps to 0 - a 0x0 canvas's toDataURL() is exactly the
            // `'data:,'` pdfMake choked on, and before that, string-
            // concatenating that object into the old SVG's width attribute
            // is what silently produced the offset/oversized "Set" column
            // labels. A fresh array per render can't leak into the next one.
            table: { widths: COL_WIDTHS.slice(), body: padTableBody(tableBody) },
            layout: page2Layout,
        }));
    }

    return content;
}

// Combined page order per span: span1 page1, span1 page2, span2 page1,
// span2 page2, ... instead of every span's page 1 followed by every span's
// page 2. Prefer this over concatenating buildBCIProformaContent(data) and
// buildBCIPage2Content(data) separately when a structure has multiple spans.
function buildBCIProformaFullContent(bciFormData) {
    var totalSpans = (bciFormData && bciFormData.totalSpans) || 1;
    var content = [];
    for (var spanIdx = 0; spanIdx < totalSpans; spanIdx++) {
        content = content.concat(buildBCIProformaContent(bciFormData, spanIdx));
        content = content.concat(buildBCIPage2Content(bciFormData, spanIdx));
    }
    return content;
}

// ─── Expose globally ─────────────────────────────────────────────────────────
window.buildBCIProformaContent = buildBCIProformaContent;
window.buildBCIPage2Content = buildBCIPage2Content;
window.buildBCIProformaFullContent = buildBCIProformaFullContent;

} // end guard: typeof buildBCIProformaContent === 'undefined'