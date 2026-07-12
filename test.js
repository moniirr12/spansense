
// Matches database.js's resolution: bare relative fetches below resolve
// against whatever origin happens to be serving this file (e.g. Live
// Server on 127.0.0.1:5500), which has no /api/* routes of its own.
var API_BASE = (window.location.hostname === 'localhost')
    ? 'http://localhost:3000'
    : 'https://spansense.onrender.com';

// Formats raw ISO/SQL date strings (e.g. "2026-11-07T00:00:00.000Z") into the
// "7 Nov 2026" style used elsewhere in the app (Dashboard, Database table, sidebar).
function formatDate(dateString) {
    if (!dateString) return '--';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return dateString;
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

// Helper function to convert image URL to dataURL
async function imageUrlToDataURL(url) {
    return new Promise((resolve) => {
        if (!url) {
            resolve(null);
            return;
        }
        if (url.startsWith('data:')) {
            resolve(url);
            return;
        }
        const img = new Image();
        img.crossOrigin = "Anonymous";
        img.onload = function() {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);
            resolve(canvas.toDataURL('image/jpeg', 0.7));
        };
        img.onerror = function() {
            console.warn('Could not load image:', url);
            resolve(null);
        };
        img.src = url;
    });
}

// Capture location map
//
// The whole body runs inside a try/catch, not just the setTimeout portion:
// this used to be `new Promise(async (resolve) => {...})` with no reject and
// no surrounding try/catch. The Promise constructor doesn't observe the
// return value (or rejection) of an async executor - it only cares about
// explicit resolve()/reject() calls - so *any* throw anywhere in here
// (L.map() on a missing container, a tile layer error, html2canvas hitting a
// CORS-tainted canvas from the OSM tiles, etc.) became an unhandled
// rejection on a detached promise nothing awaits, and resolve() was never
// called. That hung the entire report generation forever instead of just
// dropping the location map image, which is what actually broke "View
// Report" in database.html.
async function captureLocationMap(lat, lng, locationName) {
    return new Promise((resolve) => {
        if (!lat || !lng) {
            resolve(null);
            return;
        }

        let map = null;
        let hiddenContainer = null;
        let settled = false;

        function finish(result) {
            if (settled) return;
            settled = true;
            try { if (map) map.remove(); } catch (e) {}
            if (hiddenContainer) hiddenContainer.innerHTML = '';
            resolve(result);
        }

        function capture() {
            const mapElement = document.getElementById('tempMap');
            html2canvas(mapElement, {
                scale: 2,
                backgroundColor: '#ffffff',
                useCORS: true,
                logging: false
            }).then((canvas) => finish(canvas.toDataURL('image/png')))
              .catch((err) => { console.warn('Could not capture location map:', err); finish(null); });
        }

        try {
            hiddenContainer = document.getElementById('hiddenMapContainer');
            if (!hiddenContainer) {
                hiddenContainer = document.createElement('div');
                hiddenContainer.id = 'hiddenMapContainer';
                hiddenContainer.style.position = 'absolute';
                hiddenContainer.style.left = '-9999px';
                hiddenContainer.style.top = '-9999px';
                hiddenContainer.style.width = '800px';
                hiddenContainer.style.height = '500px';
                document.body.appendChild(hiddenContainer);
            }

            hiddenContainer.innerHTML = '<div id="tempMap" style="width: 100%; height: 100%;"></div>';

            // Create map with zoom control removed
            map = L.map('tempMap', {
                zoomControl: false  // This removes the zoom buttons (+/-)
            }).setView([lat, lng], 14);

            // tile.openstreetmap.org sends no Access-Control-Allow-Origin
            // header, so html2canvas's canvas ends up tainted and silently
            // draws every tile blank (marker/controls still show fine, since
            // those aren't cross-origin images) - this is the actual cause
            // of "the location map is blank", not a load-timing issue.
            // CARTO's basemap tiles are served with CORS enabled, so switch
            // to those for this hidden capture-only map.
            const tileLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
                attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
                crossOrigin: true
            }).addTo(map);

            L.marker([lat, lng]).addTo(map).bindPopup(`<b>${locationName}</b>`);

            // Add a custom north symbol
            const NorthControl = L.Control.extend({
                options: {
                    position: 'topright'
                },
                onAdd: function(map) {
                    const container = L.DomUtil.create('div', 'north-symbol');
                    container.innerHTML = '↑<br>N';
                    container.style.backgroundColor = 'rgba(255, 255, 255, 0.9)';
                    container.style.padding = '5px 8px';
                    container.style.fontSize = '14px';
                    container.style.fontWeight = 'bold';
                    container.style.color = '#333';
                    container.style.borderRadius = '4px';
                    container.style.boxShadow = '0 2px 5px rgba(0,0,0,0.2)';
                    container.style.textAlign = 'center';
                    container.style.lineHeight = '1.2';
                    container.style.fontFamily = 'Arial, sans-serif';
                    container.style.border = '1px solid #ccc';
                    return container;
                }
            });

            map.addControl(new NorthControl());

            // Capture once the tile layer actually reports every visible tile
            // loaded, instead of a blind fixed delay - on a slower connection
            // the old 1500ms wait could fire before OSM's tiles finished
            // painting, silently baking a blank grey map into the report. A
            // safety-net timeout still covers the case where 'load' never
            // fires (e.g. the tile server is unreachable).
            let captured = false;
            tileLayer.on('load', () => {
                if (captured) return;
                captured = true;
                setTimeout(capture, 200); // let the paint settle
            });
            setTimeout(() => { if (!captured) { captured = true; capture(); } }, 4000);
        } catch (err) {
            console.warn('Could not set up location map:', err);
            finish(null);
        }
    });
}

// ─── Report design tokens ──────────────────────────────────────────────────
// Same spanSense brand palette as bciProforma.pdfmake.js / reportFull.docx.js
// (accent teal #5b8c8a, ink #1e3432) plus the cover gradient and priority
// colours from the spansenseUserGuideFull.html design this report follows.
const NARR_COLORS = {
    ink: '#1e3432',
    body: '#3d4a4f',
    muted: '#8a9ba8',
    accent: '#5b8c8a',
    accentSoft: '#8ab4b0',
    accentTint: '#eef4f2',
    hairline: '#e2e8e7',
    surfaceSunken: '#f7fbfa',
    priH: '#dc2626', priHBg: '#fdecea',
    priM: '#b45309', priMBg: '#fdf1e2',
    priL: '#15803d', priLBg: '#eaf6ed',
    cover1: '#0e1c19', cover2: '#1c322f', cover3: '#2c4a48', cover4: '#40685f',
    coverMuted: '#a9cfcb', coverMuted2: '#c9d6d4'
};

// Ported from inspection/inspectionA.js's defectNumberText - same defect
// type/number -> human label mapping used when logging a defect in the
// inspection wizard. Duplicated here (rather than shared) since this report
// renders from map.html/database.html, which never load inspectionA.js.
const DEFECT_TYPE_LABEL = {
    1: { 1: "Rusting", 2: "Section loss", 3: "Rusting or damage to bolts", 4: "Damage to weld" },
    2: { 2: "Spalling", 3: "Cracking", 4: "Prestressing damage", 5: "Delamination", 6: "Freeze thaw" },
    3: { 1: "Deformation", 2: "Pointing", 3: "Arch ring damage", 4: "Arch barrel crack", 5: "Cracking", 6: "Section loss", 7: "Bulging or leaning" },
    4: { 1: "Coating damage" },
    5: { 1: "Structural damage", 2: "Inspection obstruction" },
    6: { 1: "Settlement", 2: "Differential movement", 3: "Sliding", 4: "Rotation", 5: "Scour", 6: "Foundation faults" },
    7: { 1: "Scour", 2: "Vegetation or silt" },
    8: { 1: "Blockage", 2: "Causing stains", 3: "Structural damage", 4: "Weep hole blockage" },
    9: { 1: "Wear and weathering", 2: "Crazing, tracking & fretting", 3: "Poor texture", 4: "Cracking", 5: "Slippery", 6: "Cracked flagged surfacing" },
    10: { 1: "Asphaltic plug debonding", 2: "Asphaltic plug material loss", 3: "Asphaltic plug tracking", 4: "Cracking along nosing", 5: "Elastomeric and others missing bolts", 6: "Elastomeric and others sealant breached", 7: "Elastomeric and others road breaking", 8: "Elastomeric and others loose fixings", 9: "Elastomeric and others component damage", 10: "Buried joint cracking", 11: "Buried joint sealant damage", 12: "Joint leakage" },
    11: { 1: "Deformation or settlement" },
    12: { 1: "Rusting", 2: "Offset or dislodged", 3: "Sliding", 4: "Crazing", 5: "Sliding plate damage", 6: "Bearing damage" },
    13: { 1: "Impact" },
    14: { 1: "Non structural damage", 2: "Structural damage" },
    15: { 1: "Cracking or displacement" },
    16: { 1: "Damage", 2: "Section loss" }
};

// Same severity wording as inspection/spans.js's getSeverityLabel.
const SEVERITY_LABEL = { 1: 'Minor', 2: 'Moderate', 3: 'Severe', 4: 'Critical', 5: 'Emergency' };

function defectTypeLabel(defectType, defectNumber) {
    const byType = DEFECT_TYPE_LABEL[Number(defectType)];
    return (byType && byType[Number(defectNumber)]) || null;
}

function severityLabel(sev) {
    return SEVERITY_LABEL[Number(sev)] || null;
}

function getBCICategory(score) {
    if (score >= 90) return { text: 'Very Good', color: '#22c55e' };
    if (score >= 80) return { text: 'Good', color: NARR_COLORS.accentSoft };
    if (score >= 65) return { text: 'Fair', color: '#eab308' };
    if (score >= 40) return { text: 'Poor', color: '#f97316' };
    return { text: 'Critical', color: '#dc2626' };
}

function priorityColors(p) {
    if (p === 'H') return { bg: NARR_COLORS.priHBg, fg: NARR_COLORS.priH };
    if (p === 'M') return { bg: NARR_COLORS.priMBg, fg: NARR_COLORS.priM };
    if (p === 'L') return { bg: NARR_COLORS.priLBg, fg: NARR_COLORS.priL };
    return { bg: NARR_COLORS.surfaceSunken, fg: NARR_COLORS.muted };
}

// ─── pdfmake building blocks shared across the report's sections ──────────
// A small filled rectangle used as a "chip" (BCI badge, priority tag, status
// pill) - pdfmake has no border-radius for text/tables, so every chip in
// this report is square-cornered by design rather than attempting one-off
// SVG roundrects per chip.
function reportChip(text, bg, fg, opts) {
    opts = opts || {};
    return {
        width: 'auto',
        table: { body: [[{ text: text, fontSize: opts.fontSize || 9, bold: true, color: fg || 'white', alignment: 'center' }]] },
        layout: {
            fillColor: function () { return bg; },
            hLineWidth: function () { return 0; },
            vLineWidth: function () { return 0; },
            paddingLeft: function () { return opts.padX || 10; },
            paddingRight: function () { return opts.padX || 10; },
            paddingTop: function () { return opts.padY || 4; },
            paddingBottom: function () { return opts.padY || 4; }
        },
        margin: opts.margin || [0, 0, 0, 0]
    };
}

// Label/value table - hairline between rows only, no vertical borders,
// label muted, value bold ink. Same look as every kv table in the design.
function narrKvTable(pairs) {
    return {
        table: {
            widths: ['38%', '62%'],
            body: pairs.map(function (p) {
                return [
                    { text: p[0], color: NARR_COLORS.muted, bold: true, fontSize: 9.5 },
                    { text: p[1] != null && p[1] !== '' ? String(p[1]) : '—', color: NARR_COLORS.ink, bold: true, fontSize: 9.5 }
                ];
            })
        },
        layout: {
            hLineWidth: function (i, node) { return (i === 0 || i === node.table.body.length) ? 0 : 0.5; },
            vLineWidth: function () { return 0; },
            hLineColor: function () { return NARR_COLORS.hairline; },
            paddingLeft: function () { return 0; },
            paddingRight: function () { return 0; },
            paddingTop: function () { return 7; },
            paddingBottom: function () { return 7; }
        },
        margin: [0, 0, 0, 13]
    };
}

// Section heading ("3   Description of Defects") - registers itself with
// pdfmake's built-in toc feature (tocItem/tocStyle) so the Contents page
// gets real, always-correct page numbers instead of the old report's
// hand-typed (and easily stale) ones.
function sectionHeading(num, title, id) {
    return {
        text: [
            { text: num + '    ', color: NARR_COLORS.accent, bold: true },
            { text: title, color: NARR_COLORS.ink, bold: true }
        ],
        fontSize: 19,
        id: id,
        tocItem: true,
        tocStyle: 'tocMain',
        margin: [0, 0, 0, 14]
    };
}

function subhead(text, id) {
    const o = { text: text, bold: true, fontSize: 12.5, color: NARR_COLORS.accent, margin: [0, 20, 0, 9] };
    if (id) {
        o.id = id;
        o.tocItem = true;
        o.tocStyle = 'tocSub';
        o.tocMargin = [14, 0, 0, 0];
    }
    return o;
}

// Tinted, left-accented note box (next-inspection notice, "no remedial
// works recorded", etc.) - same shape as the design's .callout.
function callout(text, opts) {
    opts = opts || {};
    return {
        table: { widths: ['*'], body: [[{ text: text, fontSize: 9.5, lineHeight: 1.35, color: opts.color || '#2c4a48', margin: [12, 10, 12, 10] }]] },
        layout: {
            fillColor: function () { return opts.bg || NARR_COLORS.accentTint; },
            hLineWidth: function () { return 0; },
            vLineWidth: function (i) { return i === 0 ? 3 : 0; },
            vLineColor: function () { return opts.accent || NARR_COLORS.accent; },
            paddingLeft: function () { return 0; },
            paddingRight: function () { return 0; },
            paddingTop: function () { return 0; },
            paddingBottom: function () { return 0; }
        },
        margin: [0, 6, 0, 13]
    };
}

// Bordered box wrapping a single defect's detail (id/type, priority chip,
// facts row, comment, remedial callout) - the design's .defect card.
function defectCard(rows) {
    return {
        table: { widths: ['*'], body: [[{ stack: rows, margin: [13, 11, 13, 11] }]] },
        layout: {
            hLineWidth: function () { return 0.75; },
            vLineWidth: function () { return 0.75; },
            hLineColor: function () { return NARR_COLORS.hairline; },
            vLineColor: function () { return NARR_COLORS.hairline; },
            paddingLeft: function () { return 0; },
            paddingRight: function () { return 0; },
            paddingTop: function () { return 0; },
            paddingBottom: function () { return 0; }
        },
        margin: [0, 6, 0, 11]
    };
}

// A run of consecutive no-defect elements, batched into one hairline-rowed
// table (No / Name / "No defects") instead of one card each - keeps the
// element-by-element checklist honest (every element is accounted for)
// without one paragraph per clear element.
function clearElementsTable(items) {
    return {
        table: {
            widths: [20, '*', 62],
            body: items.map(function (it) {
                return [
                    { text: String(it.no), fontSize: 9.5, color: NARR_COLORS.muted, alignment: 'right' },
                    { text: it.name, fontSize: 9.5, color: '#5b6c70' },
                    { text: 'No defects', fontSize: 8, bold: true, color: '#9fb0ab', alignment: 'right' }
                ];
            })
        },
        layout: {
            hLineWidth: function () { return 0.5; },
            vLineWidth: function () { return 0; },
            hLineColor: function () { return NARR_COLORS.hairline; },
            paddingLeft: function (i) { return i === 1 ? 9 : 0; },
            paddingRight: function (i) { return i === 0 ? 9 : 0; },
            paddingTop: function () { return 6; },
            paddingBottom: function () { return 6; }
        },
        margin: [0, 0, 0, 8]
    };
}

function buildDefectCardContent(d, photoNumbers) {
    // /api/inspection/full only sends the combined "type.number" defectId
    // (see server.js), not separate defect_type/defect_number fields.
    const [defType, defNum] = String(d.defectId || '').split('.');
    const typeLabel = defectTypeLabel(defType, defNum);
    const defectHeading = d.defectId + (typeLabel ? '   ·   ' + typeLabel.toUpperCase() : '');
    const pri = priorityColors(d.priority);
    const sevText = severityLabel(d.severity) || (d.severity ? ('Level ' + d.severity) : '—');
    const worksRequired = d.worksRequired === 'Y' ? 'Yes' : d.worksRequired === 'M' ? 'Possibly' : 'No';

    const facts = [
        { width: 'auto', text: [{ text: 'Severity: ', color: NARR_COLORS.muted }, { text: sevText, bold: true, color: NARR_COLORS.ink }], fontSize: 9.5 },
        { width: 'auto', text: [{ text: 'Extent: ', color: NARR_COLORS.muted }, { text: d.extent || '—', bold: true, color: NARR_COLORS.ink }], fontSize: 9.5 },
        { width: 'auto', text: [{ text: 'Works required: ', color: NARR_COLORS.muted }, { text: worksRequired, bold: true, color: NARR_COLORS.ink }], fontSize: 9.5 }
    ];
    const cost = d.cost != null ? parseFloat(d.cost) : NaN;
    if (d.worksRequired === 'Y' && !isNaN(cost) && cost > 0) {
        facts.push({ width: 'auto', text: [{ text: 'Est. cost: ', color: NARR_COLORS.muted }, { text: '£' + cost.toLocaleString(), bold: true, color: NARR_COLORS.ink }], fontSize: 9.5 });
    }

    const rows = [
        {
            columns: [
                { width: '*', text: defectHeading, fontSize: 9, bold: true, color: NARR_COLORS.muted },
                reportChip('Priority ' + (d.priority || '—'), pri.bg, pri.fg)
            ],
            columnGap: 8,
            margin: [0, 0, 0, 8]
        },
        { columns: facts, columnGap: 18, margin: [0, 0, 0, 8] }
    ];

    const comment = (d.comments && d.comments !== 'Add') ? d.comments.trim() : '';
    if (comment || (photoNumbers && photoNumbers.length)) {
        const commentRuns = [];
        if (comment) commentRuns.push({ text: '“' + comment + '”', italics: true, color: NARR_COLORS.body });
        (photoNumbers || []).forEach(function (n, idx) {
            if (comment || idx > 0) commentRuns.push({ text: ' ' });
            commentRuns.push({ text: '(Photo ' + n + ')', color: NARR_COLORS.accent, decoration: 'underline', linkToDestination: 'photo-' + n });
        });
        rows.push({ text: commentRuns, fontSize: 9.5, lineHeight: 1.3, margin: [0, 0, 0, 0] });
    }

    const remedial = (d.remedialWorks || d.remedial_works || '').trim();
    if (remedial) {
        rows.push({
            table: { widths: ['*'], body: [[{ text: [{ text: 'Remedial works — ', bold: true, color: NARR_COLORS.ink }, { text: remedial, color: NARR_COLORS.body }], fontSize: 9.5, lineHeight: 1.3, margin: [10, 8, 10, 8] }]] },
            layout: {
                fillColor: function () { return NARR_COLORS.surfaceSunken; },
                hLineWidth: function () { return 0; },
                vLineWidth: function (i) { return i === 0 ? 2.5 : 0; },
                vLineColor: function () { return NARR_COLORS.accent; },
                paddingLeft: function () { return 0; }, paddingRight: function () { return 0; },
                paddingTop: function () { return 0; }, paddingBottom: function () { return 0; }
            },
            margin: [0, comment ? 8 : 0, 0, 0]
        });
    }

    return rows;
}






async function generateSimplePDFReport(doc, mode = 'download', targetWindow = null) {
    try {
        const structureId = doc.structure_id;
        const structureName = doc.structure_name;
        const inspectionDate = doc.date;
        
        console.log('=== SIMPLE REPORT GENERATION START ===');
        console.log('Structure:', structureName, 'ID:', structureId, 'Date:', inspectionDate);
        
        if (!structureId || !structureName || !inspectionDate) {
            throw new Error('Missing inspection information');
        }

        showToast('Generating report...', 'info');

        // FIRST: Fetch all data
        const [bridgeData, fullInspectionData, photosResponse, bciFormData, nextDueData] = await Promise.all([
            fetch(`${API_BASE}/api/bridges/${structureId}`).then(res => res.json()).catch(() => ({})),
            fetch(`${API_BASE}/api/inspection/full?structure_id=${structureId}&date=${inspectionDate}`).then(res => res.ok ? res.json() : null).catch(() => null),
            fetch(`${API_BASE}/api/bridges/${structureId}/inspection-photos?inspectionDate=${encodeURIComponent(inspectionDate)}`).then(res => res.ok ? res.json() : { success: false, photos: [] }).catch(() => ({ success: false, photos: [] })),
            generateBCIFormForPDF(doc),
            fetch(`${API_BASE}/api/inspection/next-due?structure_id=${structureId}&date=${inspectionDate}`).then(res => res.ok ? res.json() : null).catch(() => null)
        ]);

        console.log('Bridge data received:', bridgeData);

        const inspectionData = fullInspectionData || {};
        let defectsData = fullInspectionData?.defects || []; // DEFINE defectsData HERE
        const allPhotos = photosResponse.success ? photosResponse.photos : [];

        // Debug: Check defects data
        console.log('=== DEFECTS DATA DEBUG ===');
        console.log('Total defects:', defectsData.length);
        defectsData.forEach((defect, idx) => {
            console.log(`Defect ${idx + 1}:`, {
                defectId: defect.defectId,
                elementNumber: defect.elementNumber,
                hasElementNumber: !!defect.elementNumber,
                priority: defect.priority,
                remedialWorks: defect.remedialWorks || defect.remedial_works
            });
        });

        // SECOND: Define all elements list (after defectsData is defined)
        const ALL_ELEMENTS_LIST_BY_TYPE = {
            Bridge: [
                { category: "Deck Elements", mainNumber: "4.1", subNumber: "4.1.1", name: "Primary deck element", elementNo: 1 },
                { category: "Deck Elements", mainNumber: "4.1", subNumber: "4.1.2", name: "Transverse beams", elementNo: 2 },
                { category: "Deck Elements", mainNumber: "4.1", subNumber: "4.1.3", name: "Secondary deck element", elementNo: 3 },
                { category: "Deck Elements", mainNumber: "4.1", subNumber: "4.1.4", name: "Half joints", elementNo: 4 },
                { category: "Deck Elements", mainNumber: "4.1", subNumber: "4.1.5", name: "Tie beam/rod", elementNo: 5 },
                { category: "Deck Elements", mainNumber: "4.1", subNumber: "4.1.6", name: "Parapet beam or cantilever", elementNo: 6 },
                { category: "Deck Elements", mainNumber: "4.1", subNumber: "4.1.7", name: "Deck bracing", elementNo: 7 },
                { category: "Load-bearing Substructure", mainNumber: "4.2", subNumber: "4.2.1", name: "Foundations", elementNo: 8 },
                { category: "Load-bearing Substructure", mainNumber: "4.2", subNumber: "4.2.2", name: "Abutments (incl. arch springing)", elementNo: 9 },
                { category: "Load-bearing Substructure", mainNumber: "4.2", subNumber: "4.2.3", name: "Spandrel wall/head wall", elementNo: 10 },
                { category: "Load-bearing Substructure", mainNumber: "4.2", subNumber: "4.2.4", name: "Pier/column", elementNo: 11 },
                { category: "Load-bearing Substructure", mainNumber: "4.2", subNumber: "4.2.5", name: "Cross-head/capping beam", elementNo: 12 },
                { category: "Load-bearing Substructure", mainNumber: "4.2", subNumber: "4.2.6", name: "Bearings", elementNo: 13 },
                { category: "Load-bearing Substructure", mainNumber: "4.2", subNumber: "4.2.7", name: "Bearing plinth/shelf", elementNo: 14 },
                { category: "Durability Elements", mainNumber: "4.3", subNumber: "4.3.1", name: "Superstructure drainage", elementNo: 15 },
                { category: "Durability Elements", mainNumber: "4.3", subNumber: "4.3.2", name: "Substructure drainage", elementNo: 16 },
                { category: "Durability Elements", mainNumber: "4.3", subNumber: "4.3.3", name: "Waterproofing", elementNo: 17 },
                { category: "Durability Elements", mainNumber: "4.3", subNumber: "4.3.4", name: "Movement/expansion joints", elementNo: 18 },
                { category: "Durability Elements", mainNumber: "4.3", subNumber: "4.3.5", name: "Finishes: deck elements", elementNo: 19 },
                { category: "Durability Elements", mainNumber: "4.3", subNumber: "4.3.6", name: "Finishes: substructure elements", elementNo: 20 },
                { category: "Durability Elements", mainNumber: "4.3", subNumber: "4.3.7", name: "Finishes: parapets/safety fences", elementNo: 21 },
                { category: "Safety Elements", mainNumber: "4.4", subNumber: "4.4.1", name: "Access/walkways/gantries", elementNo: 22 },
                { category: "Safety Elements", mainNumber: "4.4", subNumber: "4.4.2", name: "Handrail/parapets/safety fences", elementNo: 23 },
                { category: "Safety Elements", mainNumber: "4.4", subNumber: "4.4.3", name: "Carriageway surfacing", elementNo: 24 },
                { category: "Safety Elements", mainNumber: "4.4", subNumber: "4.4.4", name: "Footway/verge/footbridge surfacing", elementNo: 25 },
                { category: "Other Bridge Elements", mainNumber: "4.5", subNumber: "4.5.1", name: "Invert/river bed", elementNo: 26 },
                { category: "Other Bridge Elements", mainNumber: "4.5", subNumber: "4.5.2", name: "Aprons", elementNo: 27 },
                { category: "Other Bridge Elements", mainNumber: "4.5", subNumber: "4.5.3", name: "Fenders/cutwaters/collision prot.", elementNo: 28 },
                { category: "Other Bridge Elements", mainNumber: "4.5", subNumber: "4.5.4", name: "River training works", elementNo: 29 },
                { category: "Other Bridge Elements", mainNumber: "4.5", subNumber: "4.5.5", name: "Revetment/batter paving", elementNo: 30 },
                { category: "Other Bridge Elements", mainNumber: "4.5", subNumber: "4.5.6", name: "Wing walls", elementNo: 31 },
                { category: "Other Bridge Elements", mainNumber: "4.5", subNumber: "4.5.7", name: "Retaining walls", elementNo: 32 },
                { category: "Other Bridge Elements", mainNumber: "4.5", subNumber: "4.5.8", name: "Embankments", elementNo: 33 },
                { category: "Other Bridge Elements", mainNumber: "4.5", subNumber: "4.5.9", name: "Machinery", elementNo: 34 },
                { category: "Ancillary Elements", mainNumber: "4.6", subNumber: "4.6.1", name: "Approach rails/barriers/walls", elementNo: 35 },
                { category: "Ancillary Elements", mainNumber: "4.6", subNumber: "4.6.2", name: "Signs", elementNo: 36 },
                { category: "Ancillary Elements", mainNumber: "4.6", subNumber: "4.6.3", name: "Lighting", elementNo: 37 },
                { category: "Ancillary Elements", mainNumber: "4.6", subNumber: "4.6.4", name: "Services", elementNo: 38 }
            ],
            "Retaining wall": [
                { category: "Main Elements", mainNumber: "4.1", subNumber: "4.1.1", name: "Foundations", elementNo: 1 },
                { category: "Main Elements", mainNumber: "4.1", subNumber: "4.1.2", name: "Retaining wall: Primary", elementNo: 2 },
                { category: "Main Elements", mainNumber: "4.1", subNumber: "4.1.3", name: "Retaining wall: Secondary", elementNo: 3 },
                { category: "Main Elements", mainNumber: "4.1", subNumber: "4.1.4", name: "Parapet beam/plinth", elementNo: 4 },
                { category: "Durability Elements", mainNumber: "4.2", subNumber: "4.2.1", name: "Drainage", elementNo: 5 },
                { category: "Durability Elements", mainNumber: "4.2", subNumber: "4.2.2", name: "Movement/Expansion Joints", elementNo: 6 },
                { category: "Durability Elements", mainNumber: "4.2", subNumber: "4.2.3", name: "Surface finishes: wall", elementNo: 7 },
                { category: "Durability Elements", mainNumber: "4.2", subNumber: "4.2.4", name: "Surface finishes: handrail/parapet", elementNo: 8 },
                { category: "Safety Elements", mainNumber: "4.3", subNumber: "4.3.1", name: "Handrail/parapets/safety fences", elementNo: 9 },
                { category: "Safety Elements", mainNumber: "4.3", subNumber: "4.3.2", name: "Carriageway: Top of Wall", elementNo: 10 },
                { category: "Safety Elements", mainNumber: "4.3", subNumber: "4.3.3", name: "Carriageway: Foot of Wall", elementNo: 11 },
                { category: "Safety Elements", mainNumber: "4.3", subNumber: "4.3.4", name: "Footway/verge: Top of Wall", elementNo: 12 },
                { category: "Safety Elements", mainNumber: "4.3", subNumber: "4.3.5", name: "Footway/verge: Foot of Wall", elementNo: 13 },
                { category: "Other Elements", mainNumber: "4.4", subNumber: "4.4.1", name: "Embankment", elementNo: 14 },
                { category: "Other Elements", mainNumber: "4.4", subNumber: "4.4.2", name: "Superstructure drainage", elementNo: 15 },
                { category: "Other Elements", mainNumber: "4.4", subNumber: "4.4.3", name: "Invert/river bed", elementNo: 16 },
                { category: "Other Elements", mainNumber: "4.4", subNumber: "4.4.4", name: "Aprons", elementNo: 17 },
                { category: "Ancillary Elements", mainNumber: "4.5", subNumber: "4.5.1", name: "Signs", elementNo: 18 },
                { category: "Ancillary Elements", mainNumber: "4.5", subNumber: "4.5.2", name: "Lighting", elementNo: 19 },
                { category: "Ancillary Elements", mainNumber: "4.5", subNumber: "4.5.3", name: "Services", elementNo: 20 }
            ],
            "Sign Gantry": [
                { category: "Main Elements", mainNumber: "4.1", subNumber: "4.1.1", name: "Foundations", elementNo: 1 },
                { category: "Main Elements", mainNumber: "4.1", subNumber: "4.1.2", name: "Truss/beams/cantilever", elementNo: 2 },
                { category: "Main Elements", mainNumber: "4.1", subNumber: "4.1.3", name: "Transverse/horiz. bracing elements", elementNo: 3 },
                { category: "Main Elements", mainNumber: "4.1", subNumber: "4.1.4", name: "Columns/supports/legs", elementNo: 4 },
                { category: "Durability Elements", mainNumber: "4.2", subNumber: "4.2.1", name: "Surface finishes: truss/beams/cantilever", elementNo: 5 },
                { category: "Durability Elements", mainNumber: "4.2", subNumber: "4.2.2", name: "Surface finishes: columns/supports/legs", elementNo: 6 },
                { category: "Durability Elements", mainNumber: "4.2", subNumber: "4.2.3", name: "Surface finishes: other elements", elementNo: 7 },
                { category: "Safety Elements", mainNumber: "4.3", subNumber: "4.3.1", name: "Access/walkway/deck", elementNo: 8 },
                { category: "Safety Elements", mainNumber: "4.3", subNumber: "4.3.2", name: "Access ladder", elementNo: 9 },
                { category: "Safety Elements", mainNumber: "4.3", subNumber: "4.3.3", name: "Handrails/guard rails", elementNo: 10 },
                { category: "Other Elements", mainNumber: "4.4", subNumber: "4.4.1", name: "Base connections", elementNo: 11 },
                { category: "Other Elements", mainNumber: "4.4", subNumber: "4.4.2", name: "Support to longitudinal connection", elementNo: 12 },
                { category: "Other Elements", mainNumber: "4.4", subNumber: "4.4.3", name: "Sign and signal supports", elementNo: 13 },
                { category: "Ancillary Elements", mainNumber: "4.5", subNumber: "4.5.1", name: "Signs/signals", elementNo: 14 },
                { category: "Ancillary Elements", mainNumber: "4.5", subNumber: "4.5.2", name: "Lighting", elementNo: 15 },
                { category: "Ancillary Elements", mainNumber: "4.5", subNumber: "4.5.3", name: "Services", elementNo: 16 }
            ]
        };
        const allElementsList = ALL_ELEMENTS_LIST_BY_TYPE[bridgeData.type] || ALL_ELEMENTS_LIST_BY_TYPE.Bridge;

        // Create lookup map from elementNo to name
        const elementNameMap = {};
        allElementsList.forEach(element => {
            elementNameMap[element.elementNo] = element.name;
        });

        // THIRD: Enrich defects with element descriptions (using the map)
        defectsData = defectsData.map(defect => {
            const elementDescription = elementNameMap[defect.elementNumber] || `Element ${defect.elementNumber}`;
            const category = allElementsList.find(e => e.elementNo === defect.elementNumber)?.category || 'Unknown';
            
            console.log(`Mapping element ${defect.elementNumber} -> "${elementDescription}"`);
            
            return {
                ...defect,
                element_description: elementDescription,
                element_category: category
            };
        });

        // Build photosByDefect
        const photosByDefect = {};
        let globalPhotoCounter = 0;
        
        allPhotos.forEach(photo => {
            globalPhotoCounter++;
            const photoNumber = globalPhotoCounter;

            // front_defectid (a temp key) is only set for photos queued
            // before the inspection was saved, via /save-inspection's bulk
            // insert. Photos uploaded straight to an already-saved defect
            // (e.g. editing an existing inspection) only get a real numeric
            // defect_id, so relying on front_defectid alone silently dropped
            // those from the appendix - match by defect_id first instead.
            let defectCode = null;
            if (photo.defect_id != null) {
                const matchedDefect = defectsData.find(d => d.defectDbId === photo.defect_id);
                if (matchedDefect) defectCode = matchedDefect.defectId;
            }
            if (!defectCode && photo.front_defectid) {
                const parts = photo.front_defectid.split('_');
                defectCode = parts[parts.length - 1];
            }

            if (defectCode) {
                if (!photosByDefect[defectCode]) {
                    photosByDefect[defectCode] = [];
                }

                photosByDefect[defectCode].push({
                    photo_url: photo.photo_url,
                    photo_description: photo.photo_description,
                    defect_code: defectCode,
                    photoNumber: photoNumber
                });
            }
        });

        // Get bridge photo
        let bridgePhotoDataURL = null;
        const photoResponse = await fetch(`${API_BASE}/getBridgePhoto?bridgeId=${structureId}`).catch(() => ({}));
        if (photoResponse.ok) {
            const photoData = await photoResponse.json();
            if (photoData.photo_url) {
                bridgePhotoDataURL = await imageUrlToDataURL(photoData.photo_url);
            }
        }

        // Capture location map
        let mapDataURL = null;
        if (bridgeData.latitude && bridgeData.longitude) {
            mapDataURL = await captureLocationMap(
                parseFloat(bridgeData.latitude) || null,
                parseFloat(bridgeData.longitude) || null,
                structureName
            );
        }

        // Load all defect photos
        const photosWithDataURLs = [];
        let photoCounter = 1;
        for (const [defectCode, photos] of Object.entries(photosByDefect)) {
            for (const photo of photos) {
                const dataURL = await imageUrlToDataURL(photo.photo_url);
                photosWithDataURLs.push({
                    ...photo,
                    defectCode: defectCode,
                    photoNumber: photoCounter++,
                    photo_dataURL: dataURL
                });
            }
        }

        // Helper to get photo numbers for a defect
        function getPhotoNumbersForDefect(defectCode) {
            return photosWithDataURLs
                .filter(p => p.defectCode === defectCode)
                .map(p => p.photoNumber);
        }

        // Calculate BCI scores (fallback only - overallBciave/overallBcicrit
        // below is the authoritative, already-stored value for this
        // inspection; this local estimate is a last resort for older
        // inspections saved before those columns existed).
        function calculateBCI(scores) {
            if (!scores || scores.length === 0) return { bciAv: 100, bciCrit: 100 };
            const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
            const bciAv = Math.max(0, Math.min(100, 100 - (avgScore * 8)));
            const bciCrit = Math.max(0, Math.min(100, 100 - (Math.max(...scores) * 12)));
            return { bciAv: Math.round(bciAv), bciCrit: Math.round(bciCrit) };
        }

        // severity is text ('1'-'5') over the wire, not a number - without
        // Number() here `.reduce((a,b) => a+b)` string-concatenates instead
        // of summing, and `* 8`/`* 12` below then multiplies a garbled
        // string, well off the real BCI.
        const severityScores = defectsData.map(d => Number(d.severity) || 0);
        const localBci = calculateBCI(severityScores);
        const bciAv = inspectionData.overallBciave != null ? parseFloat(inspectionData.overallBciave) : localBci.bciAv;
        const bciCrit = inspectionData.overallBcicrit != null ? parseFloat(inspectionData.overallBcicrit) : localBci.bciCrit;

        // severity comes back from the API as text ('1'-'5'), not a number -
        // Number(d.severity) here (this used to be a strict === 5 etc. that
        // could never match a string, so "Next Inspection" never noticed
        // severe/critical defects).
        const severityCounts = {
            5: defectsData.filter(d => Number(d.severity) === 5).length,
            4: defectsData.filter(d => Number(d.severity) === 4).length,
            3: defectsData.filter(d => Number(d.severity) === 3).length,
            2: defectsData.filter(d => Number(d.severity) === 2).length,
            1: defectsData.filter(d => Number(d.severity) === 1).length
        };

        // Get unique span numbers
        const spanNumbers = [...new Set(defectsData.map(d => d.spanNumber))].sort((a, b) => a - b);
        if (spanNumbers.length === 0) spanNumbers.push(1);

        // Group defects by span
        const defectsBySpan = {};
        spanNumbers.forEach(span => {
            defectsBySpan[span] = defectsData.filter(d => d.spanNumber === span);
        });

        // Helper function for Remedial Works (uses the lookup map)
        const getElementDesc = (defect) => {
            return elementNameMap[defect.elementNumber] || `Element ${defect.elementNumber}`;
        };

        const bciCategory = getBCICategory(bciAv);

        // buildInspectionReportDocDefinition takes only plain data (no fetch/DOM
        // access) so it can be exercised outside the browser - see the bottom of
        // this file for the window.* export.
        const docDefinition = buildInspectionReportDocDefinition({
            structureName, structureId, inspectionDate,
            bridgeData, inspectionData, defectsData,
            allElementsList, elementNameMap, getElementDesc,
            photosByDefect, photosWithDataURLs, getPhotoNumbersForDefect,
            bridgePhotoDataURL, mapDataURL,
            bciAv, bciCrit, bciCategory, severityCounts,
            spanNumbers, defectsBySpan, nextDueData, bciFormData
        });

        const pdfGenerator = pdfMake.createPdf(docDefinition);
                        const fileName = `${structureName.replace(/[^a-z0-9]/gi, '_')}_Inspection_Report_${inspectionDate}.pdf`;
                        
                        if (mode === 'download') {
                            pdfGenerator.download(fileName);
                            showToast('Report generated successfully!', 'success');
                            return null;
                        } else if (mode === 'blob') {
                            return new Promise((resolve, reject) => {
                                pdfGenerator.getBlob(function(blob) {
                                    resolve(blob);
                                }, reject);
                            });
                        } else if (mode === 'open') {
                            // pdfmake's own window.open() call lands here only after several
                            // awaited fetches, so it's no longer inside the click's call stack
                            // and browsers block it as a popup. Callers that want 'open' mode
                            // should open a blank window synchronously on the click itself and
                            // pass it in here - pdfmake reuses it instead of opening a new one.
                            if (targetWindow && !targetWindow.closed) {
                                pdfGenerator.open({}, targetWindow);
                            } else {
                                pdfGenerator.open();
                            }
                            showToast('Report opened in new tab', 'success');
                            return null;
                        }

                    } catch (error) {
                        console.error('Simple report generation failed:', error);
                        showToast(`Error: ${error.message}`, 'error');
                        if (targetWindow && !targetWindow.closed) targetWindow.close();
                    }
}

// Pure pdfmake docDefinition builder for the narrative inspection report -
// no fetch/DOM/sessionStorage access, so it can run outside the browser
// (see window.buildInspectionReportDocDefinition export at the bottom of
// this file). generateSimplePDFReport above does all the data-fetching and
// hands the result straight to this function.
function buildInspectionReportDocDefinition(ctx) {
    const {
        structureName, structureId, inspectionDate,
        bridgeData, inspectionData, defectsData,
        allElementsList, getElementDesc,
        photosWithDataURLs, getPhotoNumbersForDefect,
        bridgePhotoDataURL, mapDataURL,
        bciAv, bciCrit, bciCategory, severityCounts,
        spanNumbers, defectsBySpan, nextDueData, bciFormData
    } = ctx;

    const RC = NARR_COLORS;

    // ---------- COVER ----------
    const metaParts = [
        'Structure ' + structureId,
        bridgeData.location || null,
        inspectionData.inspectorName ? ('Inspector: ' + inspectionData.inspectorName) : null,
        'Report generated ' + new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    ].filter(Boolean);

    const coverContent = [
        { text: 'SPANSENSE', fontSize: 13, bold: true, color: RC.coverMuted, margin: [0, 66, 0, 0] },
        { text: 'STRUCTURE INSPECTION REPORT', fontSize: 10, bold: true, color: RC.coverMuted2, margin: [0, 8, 0, 0] },
        { text: structureName, fontSize: 40, bold: true, color: 'white', margin: [0, 12, 0, 5] },
        { text: `${inspectionData.inspectionType || 'GI'} Inspection   ·   ${formatDate(inspectionDate)}`, fontSize: 13, color: RC.coverMuted2, margin: [0, 0, 0, 24] },
        ...(bridgePhotoDataURL ? [{ image: bridgePhotoDataURL, width: 460, alignment: 'center', margin: [0, 0, 0, 22] }] : []),
        {
            columns: [
                reportChip('BCI avg  ' + Number(bciAv).toFixed(2), RC.cover3, 'white', { fontSize: 9.5 }),
                reportChip('BCI crit  ' + Number(bciCrit).toFixed(2), RC.cover3, 'white', { fontSize: 9.5, margin: [10, 0, 0, 0] }),
                reportChip('Condition: ' + bciCategory.text, RC.cover3, 'white', { fontSize: 9.5, margin: [10, 0, 0, 0] }),
                { width: '*', text: '' }
            ],
            margin: [0, 0, 0, 44]
        },
        {
            columns: metaParts.map((t, i) => ({ width: 'auto', text: t, fontSize: 10, color: RC.coverMuted2, margin: i > 0 ? [18, 0, 0, 0] : [0, 0, 0, 0] })).concat([{ width: '*', text: '' }]),
            margin: [0, 28, 0, 0]
        }
    ];

    // ---------- TOC ----------
    const categoriesInOrder = [];
    allElementsList.forEach(el => { if (!categoriesInOrder.includes(el.category)) categoriesInOrder.push(el.category); });

    const tocContent = [
        { text: '', pageBreak: 'before' },
        {
            toc: {
                title: {
                    stack: [
                        { text: 'Contents', fontSize: 25, bold: true, color: RC.ink, margin: [0, 0, 0, 4] },
                        { text: structureName + '   ·   Structure ' + structureId, fontSize: 10.5, color: RC.muted, margin: [0, 0, 0, 20] }
                    ]
                }
            }
        }
    ];

    // ---------- SECTION 1: STRUCTURE DETAILS ----------
    const spanCount = bridgeData.span_number || 1;
    const section1 = [
        { text: '', pageBreak: 'before' },
        sectionHeading('1', 'Structure Details', 'section1'),
        narrKvTable([
            ['Structure name', structureName],
            ['Structure ID', structureId],
            ['Type', bridgeData.type || 'Bridge'],
            ['Location', bridgeData.location || 'Not specified'],
            ['Date of construction', bridgeData.built_year || 'Unknown'],
            ['Span / length', spanCount + (spanCount > 1 ? ' spans' : ' span') + (bridgeData.length ? `   ·   ${bridgeData.length} m` : '')]
        ]),
        subhead('1.1 Description', 'section1_1'),
        { text: bridgeData.description || 'No structural description available for this bridge.', fontSize: 9.5, lineHeight: 1.4, color: RC.body, margin: [0, 0, 0, 13] },
        subhead('1.2 Location & Coordinates', 'section1_2'),
        narrKvTable([
            ['Latitude / Longitude', (bridgeData.latitude && bridgeData.longitude) ? `${Number(bridgeData.latitude).toFixed(6)}, ${Number(bridgeData.longitude).toFixed(6)}` : 'N/A'],
            ['Easting / Northing', `${bridgeData.easting || bridgeData.ose || 'N/A'} / ${bridgeData.northing || bridgeData.osn || 'N/A'}`]
        ]),
        ...(mapDataURL ? [
            { image: mapDataURL, width: 475, alignment: 'center', margin: [0, 4, 0, 5] },
            { text: 'Structure location map', italics: true, fontSize: 9.5, color: RC.muted, alignment: 'center', margin: [0, 0, 0, 10] }
        ] : [])
    ];

    // ---------- SECTION 2: INSPECTION SUMMARY ----------
    const bandDefs = [
        { label: 'Critical', lo: 0, hi: 39 }, { label: 'Poor', lo: 40, hi: 64 }, { label: 'Fair', lo: 65, hi: 79 },
        { label: 'Good', lo: 80, hi: 89 }, { label: 'Very good', lo: 90, hi: 100 }
    ];
    function bciBandStrip(score) {
        return {
            columns: bandDefs.map(b => {
                const active = score >= b.lo && score <= b.hi;
                return {
                    width: '*',
                    table: { widths: ['*'], body: [[{ text: b.label, fontSize: 8.5, bold: true, alignment: 'center', color: active ? 'white' : '#9fb0ab' }]] },
                    layout: {
                        fillColor: () => active ? RC.ink : RC.surfaceSunken,
                        hLineWidth: () => 0.5, vLineWidth: () => 0.5, hLineColor: () => RC.hairline, vLineColor: () => RC.hairline,
                        paddingLeft: () => 4, paddingRight: () => 4, paddingTop: () => 7, paddingBottom: () => 7
                    }
                };
            }),
            columnGap: 5,
            margin: [0, 8, 0, 15]
        };
    }
    function bciStatCell(label, value, fillColor, valueColor, tag) {
        return {
            width: '*',
            table: {
                widths: ['*'],
                body: [[{
                    stack: [
                        { text: label, fontSize: 9, bold: true, color: RC.muted, margin: [0, 0, 0, 6] },
                        { text: value, fontSize: 25, bold: true, color: valueColor },
                        ...(tag ? [reportChip(tag, RC.surfaceSunken, RC.body, { fontSize: 9, margin: [0, 7, 0, 0] })] : [])
                    ]
                }]]
            },
            layout: {
                fillColor: () => fillColor,
                hLineWidth: () => 0.5, vLineWidth: () => 0.5, hLineColor: () => RC.hairline, vLineColor: () => RC.hairline,
                paddingLeft: () => 13, paddingRight: () => 13, paddingTop: () => 13, paddingBottom: () => 13
            }
        };
    }

    const section2 = [
        { text: '', pageBreak: 'before' },
        sectionHeading('2', 'Inspection Summary', 'section2'),
        narrKvTable([
            ['Inspection type', inspectionData.inspectionType || 'N/A'],
            ['Inspector', inspectionData.inspectorName || 'Not recorded'],
            ['Inspection date', inspectionData.inspectionDate ? formatDate(inspectionData.inspectionDate) : formatDate(inspectionDate)],
            ['Total spans', inspectionData.totalSpans || spanNumbers.length || 'N/A']
        ]),
        subhead('2.1 Condition Score (BCI)', 'section2_1')
    ];

    const spansList = (inspectionData.spans && inspectionData.spans.length) ? inspectionData.spans : spanNumbers.map(n => ({ spanNumber: n }));
    spansList.forEach((span, idx) => {
        const spanNum = span.spanNumber;
        const spanDefects = defectsBySpan[spanNum] || [];
        let spanBciAv = span.bciAv != null ? parseFloat(span.bciAv) : null;
        let spanBciCrit = span.bciCrit != null ? parseFloat(span.bciCrit) : null;
        if (spanBciAv == null) {
            const scores = spanDefects.map(d => Number(d.severity) || 0);
            if (scores.length) {
                const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
                spanBciAv = Math.round(Math.max(0, Math.min(100, 100 - avg * 8)));
                spanBciCrit = Math.round(Math.max(0, Math.min(100, 100 - Math.max(...scores) * 12)));
            } else {
                spanBciAv = 100; spanBciCrit = 100;
            }
        }
        const spanCat = getBCICategory(spanBciAv);

        if (spansList.length > 1) section2.push({ text: 'Span ' + spanNum, bold: true, fontSize: 11.5, color: RC.ink, margin: [0, idx === 0 ? 0 : 18, 0, 8] });

        section2.push({
            columns: [
                bciStatCell('BCI Average', spanBciAv.toFixed(2), RC.accentTint, RC.accent, spanCat.text),
                bciStatCell('BCI Critical', spanBciCrit.toFixed(2), RC.surfaceSunken, RC.ink),
                bciStatCell('Defects Recorded', String(spanDefects.length), RC.surfaceSunken, RC.ink)
            ],
            columnGap: 12
        });
        section2.push(bciBandStrip(spanBciAv));

        if (span.comments) {
            section2.push({ text: 'Comments', bold: true, fontSize: 8.5, color: RC.muted, margin: [0, 0, 0, 3] });
            section2.push({ text: span.comments, italics: true, fontSize: 9.5, lineHeight: 1.35, color: RC.body, margin: [0, 0, 0, 8] });
        }
    });

    section2.push(subhead('2.2 Defects by Priority', 'section2_2'));
    const allCounts = {
        H: defectsData.filter(d => d.priority === 'H').length,
        M: defectsData.filter(d => d.priority === 'M').length,
        L: defectsData.filter(d => d.priority === 'L').length
    };
    if (allCounts.H + allCounts.M + allCounts.L === 0) {
        section2.push({ text: 'No defects requiring works were recorded for this inspection.', italics: true, fontSize: 9.5, color: RC.muted });
    } else {
        // pdfmake's columns only understand a bare '*' (share remaining
        // space equally) - a weighted "N*" is not a thing it parses, so the
        // proportional widths here have to be real point values computed
        // by hand instead.
        const total = allCounts.H + allCounts.M + allCounts.L;
        const barWidth = 495;
        const segments = [
            { count: allCounts.H, label: 'High', color: RC.priH },
            { count: allCounts.M, label: 'Medium', color: RC.priM },
            { count: allCounts.L, label: 'Low', color: RC.priL }
        ].filter(s => s.count > 0);
        const barCells = segments.map((s, i) => {
            const isLast = i === segments.length - 1;
            const w = isLast ? (barWidth - segments.slice(0, i).reduce((sum, x) => sum + Math.round(barWidth * x.count / total), 0)) : Math.round(barWidth * s.count / total);
            return {
                width: w,
                table: { widths: ['*'], body: [[{ text: s.count + ' ' + s.label, fontSize: 9, bold: true, color: 'white', alignment: 'center' }]] },
                layout: { fillColor: () => s.color, hLineWidth: () => 0, vLineWidth: () => 0, paddingTop: () => 7, paddingBottom: () => 7 }
            };
        });
        section2.push({ columns: barCells, columnGap: 2, margin: [0, 5, 0, 0] });
    }

    // ---------- SECTION 3: DESCRIPTION OF DEFECTS ----------
    const section3 = [
        { text: '', pageBreak: 'before' },
        sectionHeading('3', 'Description of Defects', 'section3'),
        { text: 'Every inspected element is listed below by category; the ones with a recorded defect are detailed in full.', fontSize: 9.5, lineHeight: 1.3, italics: true, color: RC.muted, margin: [0, 0, 0, 15] }
    ];

    spanNumbers.forEach((spanNum, spanIdx) => {
        if (spanIdx > 0) section3.push({ text: '', pageBreak: 'before' });
        if (spanNumbers.length > 1) section3.push({ text: 'Span ' + spanNum, bold: true, fontSize: 11.5, color: RC.ink, margin: [0, spanIdx === 0 ? 0 : 8, 0, 10] });

        let currentCategory = null;
        let catIdx = 0;
        let pending = [];
        const flush = () => { if (pending.length) { section3.push(clearElementsTable(pending)); pending = []; } };

        allElementsList.forEach(el => {
            if (el.category !== currentCategory) {
                flush();
                currentCategory = el.category;
                catIdx += 1;
                section3.push(subhead('3.' + catIdx + ' ' + currentCategory, spanIdx === 0 ? ('section3_' + catIdx) : undefined));
            }
            const elDefects = defectsData.filter(d => d.elementNumber === el.elementNo && d.spanNumber === spanNum);
            if (elDefects.length === 0) {
                pending.push({ no: el.elementNo, name: el.name });
            } else {
                flush();
                section3.push({ text: el.subNumber.replace('4.', '3.') + ' ' + el.name, bold: true, fontSize: 10.5, color: RC.ink, margin: [0, 12, 0, 6] });
                elDefects.forEach(d => { section3.push(defectCard(buildDefectCardContent(d, getPhotoNumbersForDefect(d.defectId)))); });
            }
        });
        flush();
    });

    // ---------- SECTION 4: CONCLUSIONS & REMEDIAL WORKS ----------
    const section4 = [
        { text: '', pageBreak: 'before' },
        sectionHeading('4', 'Conclusions & Remedial Works', 'section4'),
        subhead('4.1 Conclusions', 'section4_1'),
        { text: (inspectionData.conclusions || '').trim() || 'No conclusions provided for this inspection.', fontSize: 9.5, lineHeight: 1.4, color: RC.body, margin: [0, 0, 0, 14] },
        subhead('4.2 Recommended Remedial Works', 'section4_2')
    ];

    const defectsWithRemedial = defectsData.filter(d => {
        const r = d.remedialWorks || d.remedial_works;
        return r && r.trim().length > 0 && r !== 'Add';
    });
    if (!defectsWithRemedial.length) {
        section4.push({ text: 'No specific remedial works recorded for this inspection.', italics: true, color: RC.muted, fontSize: 9.5, margin: [0, 0, 0, 10] });
    } else {
        const priorityRank = { H: 0, M: 1, L: 2 };
        const sorted = defectsWithRemedial.slice().sort((a, b) => (priorityRank[a.priority] ?? 3) - (priorityRank[b.priority] ?? 3));
        let totalCost = 0;
        const rows = [[
            { text: 'Ref', bold: true, fontSize: 8.5, color: RC.accent, fillColor: RC.surfaceSunken },
            { text: 'Element', bold: true, fontSize: 8.5, color: RC.accent, fillColor: RC.surfaceSunken },
            { text: 'Remedial Works', bold: true, fontSize: 8.5, color: RC.accent, fillColor: RC.surfaceSunken },
            { text: 'Priority', bold: true, fontSize: 8.5, color: RC.accent, fillColor: RC.surfaceSunken, alignment: 'center' },
            { text: 'Cost', bold: true, fontSize: 8.5, color: RC.accent, fillColor: RC.surfaceSunken, alignment: 'right' }
        ]];
        sorted.forEach((d, i) => {
            const cost = d.cost != null ? parseFloat(d.cost) : NaN;
            if (!isNaN(cost)) totalCost += cost;
            const pri = priorityColors(d.priority);
            rows.push([
                { text: String(i + 1), fontSize: 9.5 },
                { text: getElementDesc(d), fontSize: 9.5 },
                { text: d.remedialWorks || d.remedial_works, fontSize: 9.5, lineHeight: 1.25 },
                { text: d.priority || '—', fontSize: 9, bold: true, color: pri.fg, fillColor: pri.bg, alignment: 'center' },
                { text: (!isNaN(cost) && cost > 0) ? ('£' + cost.toLocaleString()) : '—', fontSize: 9.5, alignment: 'right' }
            ]);
        });
        rows.push([
            { text: '', border: [false, false, false, false] },
            { text: '', border: [false, false, false, false] },
            { text: 'Total estimated cost', bold: true, fontSize: 9.5, color: RC.ink, border: [false, false, false, false] },
            { text: '', border: [false, false, false, false] },
            { text: '£' + totalCost.toLocaleString(), bold: true, fontSize: 9.5, alignment: 'right', border: [false, false, false, false] }
        ]);
        section4.push({
            table: { widths: [22, 100, '*', 52, 58], body: rows },
            layout: {
                hLineWidth: (i, node) => (i === 0 || i === 1 || i === node.table.body.length - 1) ? 0.75 : 0.5,
                vLineWidth: () => 0,
                hLineColor: () => RC.hairline,
                paddingLeft: () => 5, paddingRight: () => 5, paddingTop: () => 7, paddingBottom: () => 7
            },
            margin: [0, 0, 0, 15]
        });
    }

    section4.push(subhead('4.3 Next Inspection', 'section4_3'));
    const highSeverity = (severityCounts[5] || 0) + (severityCounts[4] || 0);
    let scheduleLine;
    if (nextDueData && nextDueData.date) {
        const formatted = new Date(nextDueData.date).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
        scheduleLine = `The next inspection (${nextDueData.type}) is scheduled for ${formatted}, in line with this structure's inspection cycle.`;
    } else {
        scheduleLine = "This structure has no inspection cycle configured, so the next due date can't be calculated automatically.";
    }
    const noteText = scheduleLine + (highSeverity > 0 ? '\n\nInterim safety inspections should be conducted monthly due to identified severe or critical defects.' : '');
    section4.push(callout(noteText, highSeverity > 0 ? { bg: '#fdecea', color: '#7a1f1f', accent: RC.priH } : { bg: RC.accentTint, color: '#2c4a48', accent: RC.accent }));

    // ---------- APPENDIX A: PHOTOGRAPHIC RECORD ----------
    // Two large photos per page (top half / bottom half), one page-break
    // per pair, rather than the old fixed 450pt-wide thumbnails.
    const appendixA = [
        { text: '', pageBreak: 'before' },
        sectionHeading('A', 'Appendix A — Photographic Record', 'appendixA'),
        { text: 'Site photographs referenced against the defects in Section 3.', fontSize: 9.5, italics: true, color: RC.muted, margin: [0, 0, 0, 16] }
    ];
    if (!photosWithDataURLs.length) {
        appendixA.push({ text: 'No photographs available for this inspection.', italics: true, color: RC.muted, alignment: 'center' });
    } else {
        photosWithDataURLs.forEach((photo, i) => {
            appendixA.push({ text: ' ', id: 'photo-' + photo.photoNumber, fontSize: 1 });
            if (photo.photo_dataURL) {
                appendixA.push({ image: photo.photo_dataURL, fit: [475, 320], alignment: 'center', margin: [0, 0, 0, 10] });
            } else {
                appendixA.push({ text: '[Image not available]', alignment: 'center', italics: true, color: RC.muted, margin: [0, 120, 0, 10] });
            }
            appendixA.push({
                text: [{ text: 'Photo ' + photo.photoNumber + '   ', bold: true, color: RC.ink }, { text: photo.photo_description || '', color: RC.body }],
                fontSize: 9.5, alignment: 'center', margin: [0, 0, 0, 26]
            });
            if ((i + 1) % 2 === 0 && i < photosWithDataURLs.length - 1) appendixA.push({ text: '', pageBreak: 'after' });
        });
    }

    // ---------- APPENDIX B: BCI PROFORMA ----------
    // Unchanged, regulatory format - reuses the existing generator as-is
    // rather than re-skinning it (see map/bciProforma.pdfmake.js).
    const appendixB = [
        { text: '', pageBreak: 'before' },
        sectionHeading('B', 'Appendix B — BCI Proforma', 'appendixB'),
        { text: 'Highways Agency element checklist, generated from the same inspection data above.', fontSize: 9.5, italics: true, color: RC.muted, margin: [0, 0, 0, 10] },
        { text: '', pageBreak: 'after' }
    ];
    if (typeof buildBCIProformaContent === 'function' && typeof buildBCIPage2Content === 'function') {
        appendixB.push(...buildBCIProformaContent(bciFormData));
        appendixB.push(...buildBCIPage2Content(bciFormData));
    }

    return {
        pageSize: 'A4',
        pageMargins: [40, 42, 40, 42],
        background: function (currentPage, pageSize) {
            if (currentPage !== 1) return null;
            const w = pageSize.width, h = pageSize.height;
            return {
                svg: '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h + '">' +
                    '<defs><linearGradient id="cover" x1="0%" y1="0%" x2="100%" y2="100%">' +
                    '<stop offset="0%" stop-color="' + RC.cover1 + '"/>' +
                    '<stop offset="45%" stop-color="' + RC.cover2 + '"/>' +
                    '<stop offset="72%" stop-color="' + RC.cover3 + '"/>' +
                    '<stop offset="100%" stop-color="' + RC.cover4 + '"/>' +
                    '</linearGradient></defs>' +
                    '<rect width="' + w + '" height="' + h + '" fill="url(#cover)"/></svg>'
            };
        },
        header: function (currentPage, pageCount) {
            if (currentPage <= 2) return null;
            return {
                columns: [
                    { text: structureName, alignment: 'left', fontSize: 8.5, color: RC.muted },
                    { text: 'Inspection Report', alignment: 'center', fontSize: 8.5, color: RC.muted },
                    { text: `Page ${currentPage} of ${pageCount}`, alignment: 'right', fontSize: 8.5, color: RC.muted }
                ],
                margin: [40, 18, 40, 0]
            };
        },
        footer: function (currentPage) {
            if (currentPage <= 2) return null;
            return { text: `spanSense · Generated ${new Date().toLocaleDateString('en-GB')}`, alignment: 'center', fontSize: 7.5, color: RC.muted, margin: [0, 0, 0, 16] };
        },
        content: [].concat(coverContent, tocContent, section1, section2, section3, section4, appendixA, appendixB),
        styles: {
            tocMain: { fontSize: 11.5, bold: true, color: RC.ink },
            tocSub: { fontSize: 9.5, color: '#5b6c70' }
        },
        // lineHeight deliberately NOT set here - bciProforma.pdfmake.js's
        // Appendix B tables (concatenated into this same content array,
        // untouched) hand-tune every row's padding against pdfmake's
        // default lineHeight of 1; inheriting anything else from this
        // defaultStyle would blow its row-height math up across pages.
        // Sections 1-4 get their own generous lineHeight per text node
        // instead (see subhead/callout/buildDefectCardContent etc. above).
        defaultStyle: { font: 'Roboto', fontSize: 9.5, color: RC.body }
    };
}

async function generateBCIFormForPDF(doc) {
    try {
        const structureId = sessionStorage.getItem('structureId');
        const structureName = sessionStorage.getItem('structureName');
        const inspectionDate = doc.date;
        
        if (!structureId || !structureName) throw new Error('Missing structure information');

        const bridgeResponse = await fetch(`${API_BASE}/api/bridges/${structureId}`);
        if (!bridgeResponse.ok) throw new Error('Failed to fetch bridge data');
        const bridge = await bridgeResponse.json();
        const totalSpans = bridge.span_number || 1;

        const defectsResponse = await fetch(`${API_BASE}/api/defectsbci?structureId=${structureId}&date=${inspectionDate}`);
        if (!defectsResponse.ok) throw new Error('Failed to fetch defects');
        const allSpansWithDefects = await defectsResponse.json();

        const worksResponse = await fetch(`${API_BASE}/api/worksrequired?structureId=${structureId}&date=${inspectionDate}`);
        if (!worksResponse.ok) throw new Error('Failed to fetch works required');
        const worksRequired = await worksResponse.json();

        return { structureName, structureId, bridgeData: bridge, totalSpans, spansData: allSpansWithDefects, worksRequired };
    } catch (error) {
        console.error('BCI form generation failed:', error);
        return { error: error.message };
    }
}

function showToast(message, type) {
    let toast = document.getElementById('customToast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'customToast';
        toast.style.cssText = `
            position: fixed;
            bottom: 24px;
            left: 50%;
            transform: translateX(-50%);
            background: #1a2428;
            color: white;
            padding: 10px 20px;
            border-radius: 30px;
            font-size: 0.85rem;
            z-index: 2000;
            display: none;
            animation: fadeInUp 0.3s ease;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        `;
        document.body.appendChild(toast);
    }
    
    toast.textContent = message;
    toast.style.display = 'block';
    toast.style.background = type === 'success' ? '#22c55e' : type === 'error' ? '#dc2626' : '#1a2428';
    toast.style.color = type === 'success' ? '#1a2428' : 'white';
    
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => {
            toast.style.display = 'none';
            toast.style.opacity = '';
        }, 300);
    }, 3000);
}

window.generateSimplePDFReport = generateSimplePDFReport;
window.buildInspectionReportDocDefinition = buildInspectionReportDocDefinition;

// buildBCIProformaContent used to be duplicated here - a stale snapshot
// that, because this file loads after bciProforma.pdfmake.js on map.html,
// was silently shadowing (and overriding) the real, maintained version and
// every fix made to it. Removed; the live implementation is in
// map/bciProforma.pdfmake.js, which already defines it globally.