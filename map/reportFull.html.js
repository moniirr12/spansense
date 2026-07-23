/**
 * reportFull.html.js
 * Builds an HTML version of the full narrative inspection report (the same
 * content test.js's generateSimplePDFReport turns into a PDF) styled after
 * the spanSense report redesign - cover gradient, teal accent palette,
 * card-based defect layout, proportional priority bar. Cover, table of
 * contents, structure details, inspection summary/BCI, per-element defect
 * descriptions, conclusions/remedial works and a photo appendix.
 * Deliberately excludes the BCI Proforma - that stays the existing
 * pdfmake-generated appendix (see map/bciProforma.pdfmake.js), unchanged.
 *
 * Depends on globals already defined by test.js when loaded on the same
 * page: API_BASE, formatDate, imageUrlToDataURL, captureLocationMap.
 */

if (typeof buildFullInspectionReportHtml === 'undefined') {

var HTML_REPORT_COLORS = {
    ink: '#1e3432', body: '#3d4a4f', muted: '#8a9ba8', accent: '#5b8c8a', accentSoft: '#8ab4b0',
    accentTint: '#eef4f2', hairline: '#e2e8e7', surfaceSunken: '#f7fbfa',
    priH: '#dc2626', priHBg: '#fdecea', priM: '#b45309', priMBg: '#fdf1e2', priL: '#15803d', priLBg: '#eaf6ed',
    cover1: '#0e1c19', cover2: '#1c322f', cover3: '#2c4a48', cover4: '#40685f',
    coverMuted: '#a9cfcb', coverMuted2: '#c9d6d4'
};

// Same per-structure-type element/category list as test.js's
// generateSimplePDFReport / reportFull.docx.js (kept separate per that
// file's own precedent, rather than shared, since each report format numbers
// and paginates elements slightly differently).
var HTML_REPORT_ELEMENTS_BY_TYPE = {
    Bridge: [
        { category: 'Deck Elements', subNumber: '4.1.1', name: 'Primary deck element', elementNo: 1 },
        { category: 'Deck Elements', subNumber: '4.1.2', name: 'Transverse beams', elementNo: 2 },
        { category: 'Deck Elements', subNumber: '4.1.3', name: 'Secondary deck element', elementNo: 3 },
        { category: 'Deck Elements', subNumber: '4.1.4', name: 'Half joints', elementNo: 4 },
        { category: 'Deck Elements', subNumber: '4.1.5', name: 'Tie beam/rod', elementNo: 5 },
        { category: 'Deck Elements', subNumber: '4.1.6', name: 'Parapet beam or cantilever', elementNo: 6 },
        { category: 'Deck Elements', subNumber: '4.1.7', name: 'Deck bracing', elementNo: 7 },
        { category: 'Load-bearing Substructure', subNumber: '4.2.1', name: 'Foundations', elementNo: 8 },
        { category: 'Load-bearing Substructure', subNumber: '4.2.2', name: 'Abutments (incl. arch springing)', elementNo: 9 },
        { category: 'Load-bearing Substructure', subNumber: '4.2.3', name: 'Spandrel wall/head wall', elementNo: 10 },
        { category: 'Load-bearing Substructure', subNumber: '4.2.4', name: 'Pier/column', elementNo: 11 },
        { category: 'Load-bearing Substructure', subNumber: '4.2.5', name: 'Cross-head/capping beam', elementNo: 12 },
        { category: 'Load-bearing Substructure', subNumber: '4.2.6', name: 'Bearings', elementNo: 13 },
        { category: 'Load-bearing Substructure', subNumber: '4.2.7', name: 'Bearing plinth/shelf', elementNo: 14 },
        { category: 'Durability Elements', subNumber: '4.3.1', name: 'Superstructure drainage', elementNo: 15 },
        { category: 'Durability Elements', subNumber: '4.3.2', name: 'Substructure drainage', elementNo: 16 },
        { category: 'Durability Elements', subNumber: '4.3.3', name: 'Waterproofing', elementNo: 17 },
        { category: 'Durability Elements', subNumber: '4.3.4', name: 'Movement/expansion joints', elementNo: 18 },
        { category: 'Durability Elements', subNumber: '4.3.5', name: 'Finishes: deck elements', elementNo: 19 },
        { category: 'Durability Elements', subNumber: '4.3.6', name: 'Finishes: substructure elements', elementNo: 20 },
        { category: 'Durability Elements', subNumber: '4.3.7', name: 'Finishes: parapets/safety fences', elementNo: 21 },
        { category: 'Safety Elements', subNumber: '4.4.1', name: 'Access/walkways/gantries', elementNo: 22 },
        { category: 'Safety Elements', subNumber: '4.4.2', name: 'Handrail/parapets/safety fences', elementNo: 23 },
        { category: 'Safety Elements', subNumber: '4.4.3', name: 'Carriageway surfacing', elementNo: 24 },
        { category: 'Safety Elements', subNumber: '4.4.4', name: 'Footway/verge/footbridge surfacing', elementNo: 25 },
        { category: 'Other Bridge Elements', subNumber: '4.5.1', name: 'Invert/river bed', elementNo: 26 },
        { category: 'Other Bridge Elements', subNumber: '4.5.2', name: 'Aprons', elementNo: 27 },
        { category: 'Other Bridge Elements', subNumber: '4.5.3', name: 'Fenders/cutwaters/collision prot.', elementNo: 28 },
        { category: 'Other Bridge Elements', subNumber: '4.5.4', name: 'River training works', elementNo: 29 },
        { category: 'Other Bridge Elements', subNumber: '4.5.5', name: 'Revetment/batter paving', elementNo: 30 },
        { category: 'Other Bridge Elements', subNumber: '4.5.6', name: 'Wing walls', elementNo: 31 },
        { category: 'Other Bridge Elements', subNumber: '4.5.7', name: 'Retaining walls', elementNo: 32 },
        { category: 'Other Bridge Elements', subNumber: '4.5.8', name: 'Embankments', elementNo: 33 },
        { category: 'Other Bridge Elements', subNumber: '4.5.9', name: 'Machinery', elementNo: 34 },
        { category: 'Ancillary Elements', subNumber: '4.6.1', name: 'Approach rails/barriers/walls', elementNo: 35 },
        { category: 'Ancillary Elements', subNumber: '4.6.2', name: 'Signs', elementNo: 36 },
        { category: 'Ancillary Elements', subNumber: '4.6.3', name: 'Lighting', elementNo: 37 },
        { category: 'Ancillary Elements', subNumber: '4.6.4', name: 'Services', elementNo: 38 }
    ],
    'Retaining wall': [
        { category: 'Main Elements', subNumber: '4.1.1', name: 'Foundations', elementNo: 1 },
        { category: 'Main Elements', subNumber: '4.1.2', name: 'Retaining wall: Primary', elementNo: 2 },
        { category: 'Main Elements', subNumber: '4.1.3', name: 'Retaining wall: Secondary', elementNo: 3 },
        { category: 'Main Elements', subNumber: '4.1.4', name: 'Parapet beam/plinth', elementNo: 4 },
        { category: 'Durability Elements', subNumber: '4.2.1', name: 'Drainage', elementNo: 5 },
        { category: 'Durability Elements', subNumber: '4.2.2', name: 'Movement/Expansion Joints', elementNo: 6 },
        { category: 'Durability Elements', subNumber: '4.2.3', name: 'Surface finishes: wall', elementNo: 7 },
        { category: 'Durability Elements', subNumber: '4.2.4', name: 'Surface finishes: handrail/parapet', elementNo: 8 },
        { category: 'Safety Elements', subNumber: '4.3.1', name: 'Handrail/parapets/safety fences', elementNo: 9 },
        { category: 'Safety Elements', subNumber: '4.3.2', name: 'Carriageway: Top of Wall', elementNo: 10 },
        { category: 'Safety Elements', subNumber: '4.3.3', name: 'Carriageway: Foot of Wall', elementNo: 11 },
        { category: 'Safety Elements', subNumber: '4.3.4', name: 'Footway/verge: Top of Wall', elementNo: 12 },
        { category: 'Safety Elements', subNumber: '4.3.5', name: 'Footway/verge: Foot of Wall', elementNo: 13 },
        { category: 'Other Elements', subNumber: '4.4.1', name: 'Embankment', elementNo: 14 },
        { category: 'Other Elements', subNumber: '4.4.2', name: 'Superstructure drainage', elementNo: 15 },
        { category: 'Other Elements', subNumber: '4.4.3', name: 'Invert/river bed', elementNo: 16 },
        { category: 'Other Elements', subNumber: '4.4.4', name: 'Aprons', elementNo: 17 },
        { category: 'Ancillary Elements', subNumber: '4.5.1', name: 'Signs', elementNo: 18 },
        { category: 'Ancillary Elements', subNumber: '4.5.2', name: 'Lighting', elementNo: 19 },
        { category: 'Ancillary Elements', subNumber: '4.5.3', name: 'Services', elementNo: 20 }
    ],
    'Sign Gantry': [
        { category: 'Main Elements', subNumber: '4.1.1', name: 'Foundations', elementNo: 1 },
        { category: 'Main Elements', subNumber: '4.1.2', name: 'Truss/beams/cantilever', elementNo: 2 },
        { category: 'Main Elements', subNumber: '4.1.3', name: 'Transverse/horiz. bracing elements', elementNo: 3 },
        { category: 'Main Elements', subNumber: '4.1.4', name: 'Columns/supports/legs', elementNo: 4 },
        { category: 'Durability Elements', subNumber: '4.2.1', name: 'Surface finishes: truss/beams/cantilever', elementNo: 5 },
        { category: 'Durability Elements', subNumber: '4.2.2', name: 'Surface finishes: columns/supports/legs', elementNo: 6 },
        { category: 'Durability Elements', subNumber: '4.2.3', name: 'Surface finishes: other elements', elementNo: 7 },
        { category: 'Safety Elements', subNumber: '4.3.1', name: 'Access/walkway/deck', elementNo: 8 },
        { category: 'Safety Elements', subNumber: '4.3.2', name: 'Access ladder', elementNo: 9 },
        { category: 'Safety Elements', subNumber: '4.3.3', name: 'Handrails/guard rails', elementNo: 10 },
        { category: 'Other Elements', subNumber: '4.4.1', name: 'Base connections', elementNo: 11 },
        { category: 'Other Elements', subNumber: '4.4.2', name: 'Support to longitudinal connection', elementNo: 12 },
        { category: 'Other Elements', subNumber: '4.4.3', name: 'Sign and signal supports', elementNo: 13 },
        { category: 'Ancillary Elements', subNumber: '4.5.1', name: 'Signs/signals', elementNo: 14 },
        { category: 'Ancillary Elements', subNumber: '4.5.2', name: 'Lighting', elementNo: 15 },
        { category: 'Ancillary Elements', subNumber: '4.5.3', name: 'Services', elementNo: 16 }
    ]
};

// Same defect type/number -> label map as test.js/inspectionA.js's
// defectNumberText - duplicated here for the same reason test.js's own copy
// is: this report never loads inspectionA.js.
var HTML_DEFECT_TYPE_LABEL = {
    1: { 1: 'Rusting', 2: 'Section loss', 3: 'Rusting or damage to bolts', 4: 'Damage to weld' },
    2: { 2: 'Spalling', 3: 'Cracking', 4: 'Prestressing damage', 5: 'Delamination', 6: 'Freeze thaw' },
    3: { 1: 'Deformation', 2: 'Pointing', 3: 'Arch ring damage', 4: 'Arch barrel crack', 5: 'Cracking', 6: 'Section loss', 7: 'Bulging or leaning' },
    4: { 1: 'Coating damage' },
    5: { 1: 'Structural damage', 2: 'Inspection obstruction' },
    6: { 1: 'Settlement', 2: 'Differential movement', 3: 'Sliding', 4: 'Rotation', 5: 'Scour', 6: 'Foundation faults' },
    7: { 1: 'Scour', 2: 'Vegetation or silt' },
    8: { 1: 'Blockage', 2: 'Causing stains', 3: 'Structural damage', 4: 'Weep hole blockage' },
    9: { 1: 'Wear and weathering', 2: 'Crazing, tracking & fretting', 3: 'Poor texture', 4: 'Cracking', 5: 'Slippery', 6: 'Cracked flagged surfacing' },
    10: { 1: 'Asphaltic plug debonding', 2: 'Asphaltic plug material loss', 3: 'Asphaltic plug tracking', 4: 'Cracking along nosing', 5: 'Elastomeric and others missing bolts', 6: 'Elastomeric and others sealant breached', 7: 'Elastomeric and others road breaking', 8: 'Elastomeric and others loose fixings', 9: 'Elastomeric and others component damage', 10: 'Buried joint cracking', 11: 'Buried joint sealant damage', 12: 'Joint leakage' },
    11: { 1: 'Deformation or settlement' },
    12: { 1: 'Rusting', 2: 'Offset or dislodged', 3: 'Sliding', 4: 'Crazing', 5: 'Sliding plate damage', 6: 'Bearing damage' },
    13: { 1: 'Impact' },
    14: { 1: 'Non structural damage', 2: 'Structural damage' },
    15: { 1: 'Cracking or displacement' },
    16: { 1: 'Damage', 2: 'Section loss' }
};
var HTML_SEVERITY_LABEL = { 1: 'Minor', 2: 'Moderate', 3: 'Severe', 4: 'Critical', 5: 'Emergency' };

function htmlDefectTypeLabel(defectType, defectNumber) {
    var byType = HTML_DEFECT_TYPE_LABEL[Number(defectType)];
    return (byType && byType[Number(defectNumber)]) || null;
}
function htmlSeverityLabel(sev) { return HTML_SEVERITY_LABEL[Number(sev)] || null; }
function htmlBCICategory(score) {
    if (score >= 90) return { text: 'Very Good', band: 'vgood' };
    if (score >= 80) return { text: 'Good', band: 'good' };
    if (score >= 65) return { text: 'Fair', band: 'fair' };
    if (score >= 40) return { text: 'Poor', band: 'poor' };
    return { text: 'Critical', band: 'critical' };
}
function htmlPriorityClass(p) { return p === 'H' ? 'pri-h' : p === 'M' ? 'pri-m' : p === 'L' ? 'pri-l' : 'neutral'; }

// Escapes any DB-sourced string dropped into the report markup (bridge
// description, defect comments, remedial text, conclusions...) - this is
// built with string concatenation, not a templating engine with built-in
// escaping, so this is the only thing standing between a stray "<" in a
// comment and broken/injected markup.
function esc(v) {
    if (v == null) return '';
    return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function nl2br(v) { return esc(v).replace(/\n/g, '<br>'); }

function htmlKvTable(pairs) {
    return '<table class="kv">' + pairs.map(function (p) {
        return '<tr><td class="k">' + esc(p[0]) + '</td><td class="v">' + (p[1] != null && p[1] !== '' ? esc(p[1]) : '&mdash;') + '</td></tr>';
    }).join('') + '</table>';
}

function htmlSectionHeading(num, title) {
    return '<div class="sec-head"><h2><span class="sec-num">' + esc(num) + '</span>' + esc(title) + '</h2></div>';
}
function htmlSubhead(text) { return '<h3 class="subhead">' + esc(text) + '</h3>'; }

function htmlCallout(text, danger) {
    return '<div class="callout' + (danger ? ' danger' : '') + '">' + nl2br(text) + '</div>';
}

function htmlBciStatCell(label, value, valueClass, tag) {
    return '<div class="bci-cell' + (valueClass ? ' ' + valueClass : '') + '">' +
        '<div class="lbl">' + esc(label) + '</div>' +
        '<div class="val">' + esc(value) + '</div>' +
        (tag ? '<span class="tag">' + esc(tag) + '</span>' : '') +
        '</div>';
}

var BCI_BANDS = [
    { label: 'Critical', lo: 0, hi: 39 }, { label: 'Poor', lo: 40, hi: 64 }, { label: 'Fair', lo: 65, hi: 79 },
    { label: 'Good', lo: 80, hi: 89 }, { label: 'Very good', lo: 90, hi: 100 }
];
function htmlBandStrip(score) {
    return '<div class="band-strip">' + BCI_BANDS.map(function (b) {
        var active = score >= b.lo && score <= b.hi;
        return '<div class="band' + (active ? ' active' : '') + '">' + b.label + '</div>';
    }).join('') + '</div>';
}

function htmlPriorityMix(counts) {
    var total = counts.H + counts.M + counts.L;
    if (total === 0) return '<p class="no-defect">No defects requiring works were recorded for this inspection.</p>';
    var segs = [
        { n: counts.H, cls: 'h', label: 'High' },
        { n: counts.M, cls: 'm', label: 'Medium' },
        { n: counts.L, cls: 'l', label: 'Low' }
    ].filter(function (s) { return s.n > 0; });
    var bar = '<div class="pmix">' + segs.map(function (s) {
        return '<div class="' + s.cls + '" style="flex:' + s.n + '">' + s.n + ' ' + s.label + '</div>';
    }).join('') + '</div>';
    var legend = '<div class="pmix-legend">' + [
        ['h', 'High · ' + counts.H], ['m', 'Medium · ' + counts.M], ['l', 'Low · ' + counts.L]
    ].map(function (l) { return '<span><span class="dot ' + l[0] + '"></span>' + l[1] + '</span>'; }).join('') + '</div>';
    return bar + legend;
}

function htmlClearElementsTable(items) {
    return '<table class="elist"><tbody>' + items.map(function (it) {
        return '<tr class="elist-row"><td class="en">' + it.no + '</td><td class="nm">' + esc(it.name) + '</td><td class="st"><span class="chip ok">No defects</span></td></tr>';
    }).join('') + '</tbody></table>';
}

function htmlDefectCard(d, photoNumbers) {
    var parts = String(d.defectId || '').split('.');
    var typeLabel = htmlDefectTypeLabel(parts[0], parts[1]);
    var heading = esc(d.defectId) + (typeLabel ? ' &middot; ' + esc(typeLabel.toUpperCase()) : '');
    var priCls = htmlPriorityClass(d.priority);
    var sevText = htmlSeverityLabel(d.severity) || (d.severity ? ('Level ' + d.severity) : '—');
    var worksRequired = d.worksRequired === 'Y' ? 'Yes' : d.worksRequired === 'M' ? 'Possibly' : 'No';
    var cost = d.cost != null ? parseFloat(d.cost) : NaN;

    var facts = '<div class="defect-facts">' +
        '<span>Severity: <b>' + esc(sevText) + '</b></span>' +
        '<span>Extent: <b>' + esc(d.extent || '—') + '</b></span>' +
        '<span>Works required: <b>' + esc(worksRequired) + '</b></span>' +
        ((d.worksRequired === 'Y' && !isNaN(cost) && cost > 0) ? '<span>Est. cost: <b>&pound;' + cost.toLocaleString() + '</b></span>' : '') +
        '</div>';

    var comment = (d.comments && d.comments !== 'Add') ? d.comments.trim() : '';
    var commentHtml = '';
    if (comment || (photoNumbers && photoNumbers.length)) {
        commentHtml = '<p class="defect-comment">' +
            (comment ? '&ldquo;' + esc(comment) + '&rdquo; ' : '') +
            (photoNumbers || []).map(function (n) { return '<a class="photo-link" href="#photo-' + n + '">(Photo ' + n + ')</a>'; }).join(' ') +
            '</p>';
    }

    var remedial = (d.remedialWorks || d.remedial_works || '').trim();
    var remedialHtml = remedial ? '<div class="defect-remedial"><b>Remedial works &mdash; </b>' + esc(remedial) + '</div>' : '';

    return '<div class="defect">' +
        '<div class="defect-top">' +
        '<span class="defect-id">' + heading + '</span>' +
        '<span class="chip ' + priCls + '">Priority ' + esc(d.priority || '—') + '</span>' +
        '</div>' + facts + commentHtml + remedialHtml +
        '</div>';
}

async function buildFullInspectionReportHtml(doc) {
    var structureId = doc.structure_id;
    var structureName = doc.structure_name;
    var inspectionDate = doc.date;
    if (!structureId || !structureName || !inspectionDate) throw new Error('Missing inspection information');

    var results = await Promise.all([
        fetch(API_BASE + '/api/bridges/' + structureId).then(function (r) { return r.json(); }).catch(function () { return {}; }),
        fetch(API_BASE + '/api/inspection/full?structure_id=' + structureId + '&date=' + inspectionDate).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }),
        fetch(API_BASE + '/api/bridges/' + structureId + '/inspection-photos?inspectionDate=' + encodeURIComponent(inspectionDate)).then(function (r) { return r.ok ? r.json() : { success: false, photos: [] }; }).catch(function () { return { success: false, photos: [] }; }),
        fetch(API_BASE + '/api/inspection/next-due?structure_id=' + structureId + '&date=' + inspectionDate).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; })
    ]);
    var bridgeData = results[0], fullInspectionData = results[1] || {}, photosResponse = results[2], nextDueData = results[3];
    var inspectionData = fullInspectionData || {};
    var defectsData = fullInspectionData.defects || [];
    var allPhotos = photosResponse.success ? photosResponse.photos : [];

    var allElementsList = HTML_REPORT_ELEMENTS_BY_TYPE[bridgeData.type] || HTML_REPORT_ELEMENTS_BY_TYPE.Bridge;
    var elementNameMap = {};
    allElementsList.forEach(function (el) { elementNameMap[el.elementNo] = el.name; });
    function getElementDesc(def) { return elementNameMap[def.elementNumber] || ('Element ' + def.elementNumber); }

    var categoriesInOrder = [];
    allElementsList.forEach(function (el) { if (categoriesInOrder.indexOf(el.category) === -1) categoriesInOrder.push(el.category); });

    // Bridge cover photo
    var bridgePhotoDataURL = null;
    var photoMeta = await fetch(API_BASE + '/getBridgePhoto?bridgeId=' + structureId).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
    if (photoMeta && photoMeta.photo_url) bridgePhotoDataURL = await imageUrlToDataURL(photoMeta.photo_url);

    var mapDataURL = null;
    if (bridgeData.latitude && bridgeData.longitude) {
        mapDataURL = await captureLocationMap(parseFloat(bridgeData.latitude) || null, parseFloat(bridgeData.longitude) || null, structureName);
    }

    // Photos, numbered/matched to defects the same way as the PDF/docx appendix
    var photosByDefect = {};
    var photoCounter = 0;
    allPhotos.forEach(function (photo) {
        var defectCode = null;
        if (photo.defect_id != null) {
            var matched = defectsData.find(function (dd) { return dd.defectDbId === photo.defect_id; });
            if (matched) defectCode = matched.defectId;
        }
        if (!defectCode && photo.front_defectid) {
            var parts = String(photo.front_defectid).split('_');
            defectCode = parts[parts.length - 1];
        }
        // No defectCode either means this couldn't be matched to a defect, or
        // (since /api/bridges/:structureId/inspection-photos also returns
        // general site photos now) it's a general photo, which doesn't belong
        // in this per-defect appendix at all - skip before bumping the
        // counter so the visible photo numbers stay contiguous.
        if (!defectCode) return;
        photoCounter++;
        if (!photosByDefect[defectCode]) photosByDefect[defectCode] = [];
        photosByDefect[defectCode].push({ photo_url: photo.photo_url, photo_description: photo.photo_description, photoNumber: photoCounter });
    });
    function getPhotoNumbersForDefect(defectCode) { return (photosByDefect[defectCode] || []).map(function (p) { return p.photoNumber; }); }

    var photosWithDataURLs = [];
    for (var code in photosByDefect) {
        for (var i = 0; i < photosByDefect[code].length; i++) {
            var photo = photosByDefect[code][i];
            var dataURL = await imageUrlToDataURL(photo.photo_url);
            photosWithDataURLs.push({ photo_description: photo.photo_description, photoNumber: photo.photoNumber, dataURL: dataURL });
        }
    }
    photosWithDataURLs.sort(function (a, b) { return a.photoNumber - b.photoNumber; });

    // BCI (same fallback-estimate logic as test.js/reportFull.docx.js - the
    // stored overallBciave/overallBcicrit is authoritative when present)
    function calculateBCI(scores) {
        if (!scores || scores.length === 0) return { bciAv: 100, bciCrit: 100 };
        var avg = scores.reduce(function (a, b) { return a + b; }, 0) / scores.length;
        return {
            bciAv: Math.round(Math.max(0, Math.min(100, 100 - avg * 8))),
            bciCrit: Math.round(Math.max(0, Math.min(100, 100 - Math.max.apply(null, scores) * 12)))
        };
    }
    var severityScores = defectsData.map(function (d) { return Number(d.severity) || 0; });
    var localBci = calculateBCI(severityScores);
    var bciAv = inspectionData.overallBciave != null ? parseFloat(inspectionData.overallBciave) : localBci.bciAv;
    var bciCrit = inspectionData.overallBcicrit != null ? parseFloat(inspectionData.overallBcicrit) : localBci.bciCrit;
    var bciCategory = htmlBCICategory(bciAv);

    var spanNumbers = Array.from(new Set(defectsData.map(function (d) { return d.spanNumber; }))).sort(function (a, b) { return a - b; });
    if (spanNumbers.length === 0) spanNumbers.push(1);
    var defectsBySpan = {};
    spanNumbers.forEach(function (span) { defectsBySpan[span] = defectsData.filter(function (d) { return d.spanNumber === span; }); });

    // ---------- COVER ----------
    var metaParts = [
        'Structure ' + structureId,
        bridgeData.location || null,
        inspectionData.inspectorName ? ('Inspector: ' + inspectionData.inspectorName) : null,
        'Report generated ' + new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    ].filter(Boolean);

    var coverHtml = '<div class="page cover">' +
        '<div class="brand">SPANSENSE</div>' +
        '<div class="kicker">Structure Inspection Report</div>' +
        '<h1>' + esc(structureName) + '</h1>' +
        '<div class="sub">' + esc(inspectionData.inspectionType || 'GI') + ' Inspection &nbsp;&middot;&nbsp; ' + esc(formatDate(inspectionDate)) + '</div>' +
        (bridgePhotoDataURL ? '<div class="photo"><img src="' + bridgePhotoDataURL + '" alt=""></div>' : '') +
        '<div class="badge-row">' +
        '<span class="badge">BCI avg <strong>' + Number(bciAv).toFixed(2) + '</strong></span>' +
        '<span class="badge">BCI crit <strong>' + Number(bciCrit).toFixed(2) + '</strong></span>' +
        '<span class="badge">Condition: <strong>' + esc(bciCategory.text) + '</strong></span>' +
        '</div>' +
        '<div class="meta">' + metaParts.map(function (t) { return '<span>' + esc(t) + '</span>'; }).join('') + '</div>' +
        '</div>';

    // ---------- TOC ----------
    var tocRows = [
        ['1', 'Structure Details', 'section1'],
        ['1.1', 'Description', 'section1_1'],
        ['1.2', 'Location & Coordinates', 'section1_2'],
        ['2', 'Inspection Summary', 'section2'],
        ['2.1', 'Condition Score (BCI)', 'section2_1'],
        ['2.2', 'Defects by Priority', 'section2_2'],
        ['3', 'Description of Defects', 'section3']
    ];
    categoriesInOrder.forEach(function (cat, idx) { tocRows.push(['3.' + (idx + 1), cat, 'section3_' + (idx + 1)]); });
    tocRows.push(['4', 'Conclusions & Remedial Works', 'section4']);
    tocRows.push(['4.1', 'Conclusions', 'section4_1']);
    tocRows.push(['4.2', 'Recommended Remedial Works', 'section4_2']);
    tocRows.push(['4.3', 'Next Inspection', 'section4_3']);
    tocRows.push(['A', 'Appendix A: Photographs', 'appendixA']);

    var tocHtml = '<div class="page toc">' +
        '<h1>Contents</h1>' +
        '<div class="toc-intro">' + esc(structureName) + ' &middot; Structure ' + esc(structureId) + '</div>' +
        tocRows.map(function (r) {
            var isSub = r[0].indexOf('.') !== -1;
            return '<a class="toc-row' + (isSub ? ' sub' : '') + '" href="#' + r[2] + '">' +
                '<span class="toc-num">' + r[0] + '</span>' +
                '<span class="toc-title' + (isSub ? ' sub' : '') + '">' + r[1] + '</span>' +
                '</a>';
        }).join('') +
        '</div>';

    // ---------- SECTION 1: STRUCTURE DETAILS ----------
    var spanCount = bridgeData.span_number || 1;
    var section1Html = '<div class="page">' +
        '<a id="section1"></a>' + htmlSectionHeading('1', 'Structure Details') +
        htmlKvTable([
            ['Structure name', structureName],
            ['Structure ID', structureId],
            ['Type', bridgeData.type || 'Bridge'],
            ['Location', bridgeData.location || 'Not specified'],
            ['Date of construction', bridgeData.built_year || 'Unknown'],
            ['Span / length', spanCount + (spanCount > 1 ? ' spans' : ' span') + (bridgeData.length ? ('   ·   ' + bridgeData.length + ' m') : '')]
        ]) +
        '<a id="section1_1"></a>' + htmlSubhead('1.1 Description') +
        '<p class="body-text">' + nl2br(bridgeData.description || 'No structural description available for this bridge.') + '</p>' +
        '<a id="section1_2"></a>' + htmlSubhead('1.2 Location & Coordinates') +
        htmlKvTable([
            ['Latitude / Longitude', (bridgeData.latitude && bridgeData.longitude) ? (Number(bridgeData.latitude).toFixed(6) + ', ' + Number(bridgeData.longitude).toFixed(6)) : 'N/A'],
            ['Easting / Northing', (bridgeData.easting || bridgeData.ose || 'N/A') + ' / ' + (bridgeData.northing || bridgeData.osn || 'N/A')]
        ]) +
        (mapDataURL ? '<div class="map-card"><img src="' + mapDataURL + '" alt=""></div><p class="cap-text">Structure location map</p>' : '') +
        '</div>';

    // ---------- SECTION 2: INSPECTION SUMMARY ----------
    var section2Body = '<a id="section2"></a>' + htmlSectionHeading('2', 'Inspection Summary') +
        htmlKvTable([
            ['Inspection type', inspectionData.inspectionType || 'N/A'],
            ['Inspector', inspectionData.inspectorName || 'Not recorded'],
            ['Inspection date', inspectionData.inspectionDate ? formatDate(inspectionData.inspectionDate) : formatDate(inspectionDate)],
            ['Total spans', inspectionData.totalSpans || spanNumbers.length || 'N/A']
        ]) +
        '<a id="section2_1"></a>' + htmlSubhead('2.1 Condition Score (BCI)');

    var spansList = (inspectionData.spans && inspectionData.spans.length) ? inspectionData.spans : spanNumbers.map(function (n) { return { spanNumber: n }; });
    spansList.forEach(function (span, idx) {
        var spanNum = span.spanNumber;
        var spanDefects = defectsBySpan[spanNum] || [];
        var spanBciAv = span.bciAv != null ? parseFloat(span.bciAv) : null;
        var spanBciCrit = span.bciCrit != null ? parseFloat(span.bciCrit) : null;
        if (spanBciAv == null) {
            var scores = spanDefects.map(function (d) { return Number(d.severity) || 0; });
            if (scores.length) {
                var r = calculateBCI(scores);
                spanBciAv = r.bciAv; spanBciCrit = r.bciCrit;
            } else { spanBciAv = 100; spanBciCrit = 100; }
        }
        var spanCat = htmlBCICategory(spanBciAv);
        var spanCritCat = htmlBCICategory(spanBciCrit);
        if (spansList.length > 1) section2Body += '<div class="span-label">Span ' + esc(spanNum) + '</div>';
        section2Body += '<div class="bci-strip">' +
            htmlBciStatCell('BCI Average', spanBciAv.toFixed(2), 'accent', spanCat.text) +
            htmlBciStatCell('BCI Critical', spanBciCrit.toFixed(2), null, spanCritCat.text) +
            htmlBciStatCell('Defects Recorded', String(spanDefects.length)) +
            '</div>' + htmlBandStrip(spanBciAv);
        if (span.comments) section2Body += '<p class="span-comment"><b>Comments</b><br>' + nl2br(span.comments) + '</p>';
    });

    section2Body += '<a id="section2_2"></a>' + htmlSubhead('2.2 Defects by Priority') +
        htmlPriorityMix({
            H: defectsData.filter(function (d) { return d.priority === 'H'; }).length,
            M: defectsData.filter(function (d) { return d.priority === 'M'; }).length,
            L: defectsData.filter(function (d) { return d.priority === 'L'; }).length
        });
    var section2Html = '<div class="page">' + section2Body + '</div>';

    // ---------- SECTION 3: DESCRIPTION OF DEFECTS ----------
    var section3Html = '<div class="page"><a id="section3"></a>' + htmlSectionHeading('3', 'Description of Defects') +
        '<p class="lede">Every inspected element is listed below by category; the ones with a recorded defect are detailed in full.</p>';
    spanNumbers.forEach(function (spanNum, spanIdx) {
        if (spanIdx > 0) section3Html += '</div><div class="page">';
        if (spanNumbers.length > 1) section3Html += '<div class="span-label">Span ' + esc(spanNum) + '</div>';

        var currentCategory = null, catIdx = 0, pending = [];
        function flush() { if (pending.length) { section3Html += htmlClearElementsTable(pending); pending = []; } }

        allElementsList.forEach(function (el) {
            if (el.category !== currentCategory) {
                flush();
                currentCategory = el.category;
                catIdx += 1;
                section3Html += (spanIdx === 0 ? ('<a id="section3_' + catIdx + '"></a>') : '') + htmlSubhead('3.' + catIdx + ' ' + currentCategory);
            }
            var elDefects = defectsData.filter(function (d) { return d.elementNumber === el.elementNo && d.spanNumber === spanNum; });
            if (elDefects.length === 0) {
                pending.push({ no: el.elementNo, name: el.name });
            } else {
                flush();
                section3Html += '<h4 class="elhead">' + el.subNumber.replace('4.', '3.') + ' ' + esc(el.name) + '</h4>';
                elDefects.forEach(function (d) { section3Html += htmlDefectCard(d, getPhotoNumbersForDefect(d.defectId)); });
            }
        });
        flush();
    });
    section3Html += '</div>';

    // ---------- SECTION 4: CONCLUSIONS & REMEDIAL WORKS ----------
    var section4Html = '<div class="page"><a id="section4"></a>' + htmlSectionHeading('4', 'Conclusions & Remedial Works') +
        '<a id="section4_1"></a>' + htmlSubhead('4.1 Conclusions') +
        '<p class="body-text">' + nl2br((inspectionData.conclusions || '').trim() || 'No conclusions provided for this inspection.') + '</p>' +
        '<a id="section4_2"></a>' + htmlSubhead('4.2 Recommended Remedial Works');

    var defectsWithRemedial = defectsData.filter(function (d) {
        var r = d.remedialWorks || d.remedial_works;
        return r && r.trim().length > 0 && r !== 'Add';
    });
    if (!defectsWithRemedial.length) {
        section4Html += '<p class="no-defect">No specific remedial works recorded for this inspection.</p>';
    } else {
        var priorityRank = { H: 0, M: 1, L: 2 };
        var sorted = defectsWithRemedial.slice().sort(function (a, b) { return (priorityRank[a.priority] != null ? priorityRank[a.priority] : 3) - (priorityRank[b.priority] != null ? priorityRank[b.priority] : 3); });
        var totalCost = 0;
        var rowsHtml = sorted.map(function (d, i) {
            var cost = d.cost != null ? parseFloat(d.cost) : NaN;
            if (!isNaN(cost)) totalCost += cost;
            return '<tr>' +
                '<td>' + (i + 1) + '</td>' +
                '<td>' + esc(getElementDesc(d)) + '</td>' +
                '<td>' + esc(d.remedialWorks || d.remedial_works) + '</td>' +
                '<td class="center"><span class="chip ' + htmlPriorityClass(d.priority) + '">' + esc(d.priority || '—') + '</span></td>' +
                '<td class="num">' + ((!isNaN(cost) && cost > 0) ? ('&pound;' + cost.toLocaleString()) : '&mdash;') + '</td>' +
                '</tr>';
        }).join('');
        section4Html += '<table class="works"><thead><tr><th>Ref</th><th>Element</th><th>Remedial Works</th><th class="center">Priority</th><th class="num">Cost</th></tr></thead><tbody>' +
            rowsHtml +
            '<tr><td colspan="3" class="total-label">Total estimated cost</td><td></td><td class="num total-value">&pound;' + totalCost.toLocaleString() + '</td></tr>' +
            '</tbody></table>';
    }

    section4Html += '<a id="section4_3"></a>' + htmlSubhead('4.3 Next Inspection');
    var scheduleLine;
    if (nextDueData && nextDueData.date) {
        var formatted = new Date(nextDueData.date).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
        scheduleLine = 'The next inspection (' + nextDueData.type + ') is scheduled for ' + formatted + ", in line with this structure's inspection cycle.";
    } else {
        scheduleLine = "This structure has no inspection cycle configured, so the next due date can't be calculated automatically.";
    }
    section4Html += htmlCallout(scheduleLine) + '</div>';

    // ---------- APPENDIX A: PHOTOGRAPHIC RECORD ----------
    // The heading gets its own page - photos always start on a fresh page
    // after it, rather than sharing a page with whatever fits below the lede.
    var appendixAHtml = '<div class="page"><a id="appendixA"></a>' + htmlSectionHeading('A', 'Appendix A: Photographs') +
        '<p class="lede">Site photographs referenced against the defects in Section 3.</p>';
    if (!photosWithDataURLs.length) {
        appendixAHtml += '</div><div class="page"><p class="no-defect" style="text-align:center;">No photographs available for this inspection.</p></div>';
    } else {
        appendixAHtml += '</div>';
        photosWithDataURLs.forEach(function (photo, i) {
            if (i % 2 === 0) appendixAHtml += (i > 0 ? '</div>' : '') + '<div class="page">';
            appendixAHtml += '<a id="photo-' + photo.photoNumber + '"></a>' +
                '<div class="photo-card">' +
                (photo.dataURL ? '<img src="' + photo.dataURL + '" alt="">' : '<div class="photo-ph"><span>Image not available</span></div>') +
                '<div class="photo-cap"><b>Photo ' + photo.photoNumber + '</b>' + esc(photo.photo_description || '') + '</div>' +
                '</div>';
        });
        appendixAHtml += '</div>';
    }

    var pageBody = coverHtml + tocHtml + section1Html + section2Html + section3Html + section4Html + appendixAHtml;

    return '<!doctype html><html><head><meta charset="utf-8">' +
        '<title>' + esc(structureName) + ' · Inspection Report</title>' +
        '<style>' + HTML_REPORT_STYLE + '</style>' +
        '</head><body>' +
        '<div class="toolbar no-print"><span>' + esc(structureName) + ' &middot; ' + esc(formatDate(inspectionDate)) + '</span>' +
        '<button onclick="window.print()">Print / Save as PDF</button></div>' +
        '<div class="pages">' + pageBody + '</div>' +
        '</body></html>';
}

var HTML_REPORT_STYLE = '\
:root{\
  --ink:' + HTML_REPORT_COLORS.ink + ';--body:' + HTML_REPORT_COLORS.body + ';--muted:' + HTML_REPORT_COLORS.muted + ';\
  --accent:' + HTML_REPORT_COLORS.accent + ';--accent-soft:' + HTML_REPORT_COLORS.accentSoft + ';--accent-tint:' + HTML_REPORT_COLORS.accentTint + ';\
  --hairline:' + HTML_REPORT_COLORS.hairline + ';--surface:#ffffff;--surface-sunken:' + HTML_REPORT_COLORS.surfaceSunken + ';\
  --pri-h:' + HTML_REPORT_COLORS.priH + ';--pri-h-bg:' + HTML_REPORT_COLORS.priHBg + ';--pri-m:' + HTML_REPORT_COLORS.priM + ';--pri-m-bg:' + HTML_REPORT_COLORS.priMBg + ';\
  --pri-l:' + HTML_REPORT_COLORS.priL + ';--pri-l-bg:' + HTML_REPORT_COLORS.priLBg + ';\
  --cover-1:' + HTML_REPORT_COLORS.cover1 + ';--cover-2:' + HTML_REPORT_COLORS.cover2 + ';--cover-3:' + HTML_REPORT_COLORS.cover3 + ';--cover-4:' + HTML_REPORT_COLORS.cover4 + ';\
  --cover-muted:' + HTML_REPORT_COLORS.coverMuted + ';--cover-muted2:' + HTML_REPORT_COLORS.coverMuted2 + ';\
}\
*{box-sizing:border-box;}\
html,body{margin:0;background:#dde7e5;font-family:-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;}\
.toolbar{position:fixed;top:0;left:0;right:0;z-index:10;display:flex;align-items:center;justify-content:space-between;\
  padding:12px 22px;background:var(--ink);color:#fff;font-size:13px;box-shadow:0 2px 10px rgba(0,0,0,.2);}\
.toolbar button{background:var(--accent);color:#fff;border:none;border-radius:5px;padding:8px 16px;font-size:12.5px;font-weight:700;cursor:pointer;}\
.toolbar button:hover{background:var(--accent-soft);}\
.pages{display:flex;flex-direction:column;align-items:center;gap:26px;padding:74px 20px 60px;}\
.page{width:210mm;max-width:100%;min-height:297mm;padding:20mm 22mm;background:var(--surface);color:var(--body);\
  position:relative;box-shadow:0 8px 30px rgba(14,28,25,.16);font-size:13px;line-height:1.55;}\
h1,h2,h3,h4,p{margin:0;}\
.cover{background:linear-gradient(155deg,var(--cover-1) 0%,var(--cover-2) 42%,var(--cover-3) 72%,var(--cover-4) 100%);color:#fff;display:flex;flex-direction:column;}\
.cover .brand{font-size:12px;font-weight:800;letter-spacing:.16em;color:var(--cover-muted);margin-top:30px;}\
.cover .kicker{margin-top:30px;font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:rgba(255,255,255,.55);}\
.cover h1{margin:10px 0 6px;font-size:40px;font-weight:800;letter-spacing:-.02em;line-height:1.08;}\
.cover .sub{font-size:14px;color:rgba(255,255,255,.72);}\
.cover .photo{margin-top:26px;border-radius:3px;overflow:hidden;box-shadow:0 14px 34px rgba(0,0,0,.35);}\
.cover .photo img{width:100%;display:block;}\
.cover .badge-row{margin-top:22px;display:flex;gap:10px;flex-wrap:wrap;}\
.cover .badge{background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.16);border-radius:20px;padding:5px 14px;font-size:11px;font-weight:600;color:rgba(255,255,255,.85);}\
.cover .badge strong{color:#fff;}\
.cover .meta{margin-top:auto;padding-top:26px;display:flex;gap:22px;flex-wrap:wrap;font-size:10.5px;color:rgba(255,255,255,.5);border-top:1px solid rgba(255,255,255,.14);}\
.toc h1{font-size:25px;font-weight:800;color:var(--ink);margin-bottom:4px;}\
.toc-intro{font-size:12.5px;color:var(--muted);margin-bottom:20px;}\
.toc-row{display:flex;align-items:baseline;gap:14px;padding:9px 0;border-bottom:1px solid var(--hairline);text-decoration:none;}\
.toc-row.sub{padding:4px 0 4px 20px;}\
.toc-num{font-size:12px;font-weight:800;color:var(--accent);min-width:24px;}\
.toc-title{flex:1;font-size:13.5px;color:var(--ink);}\
.toc-title.sub{font-size:12px;color:#5b6c70;}\
.sec-head{margin-bottom:20px;}\
.sec-head h2{margin:0;font-size:20px;font-weight:800;color:var(--ink);border-left:4px solid var(--accent);padding-left:13px;line-height:1.3;}\
.sec-num{color:var(--accent);margin-right:8px;}\
.lede{display:block;margin:9px 0 0 17px;color:#56666a;font-size:12px;line-height:1.55;max-width:440px;font-style:italic;}\
.subhead{font-size:12px;font-weight:800;letter-spacing:.03em;text-transform:uppercase;color:var(--accent);margin:22px 0 10px;}\
.elhead{font-size:13.5px;font-weight:700;color:var(--ink);margin:16px 0 6px;}\
.body-text{color:var(--body);font-size:12.5px;line-height:1.6;margin-bottom:9px;}\
.span-label{font-weight:700;font-size:11.5px;color:var(--ink);margin:18px 0 8px;}\
.span-comment{font-size:9.5px;color:var(--body);margin:0 0 8px;}\
table.kv{width:100%;border-collapse:collapse;margin-bottom:13px;}\
table.kv td{padding:7px 0;font-size:12.5px;border-bottom:1px solid var(--hairline);vertical-align:top;}\
table.kv td.k{width:38%;color:var(--muted);font-weight:600;}\
table.kv td.v{color:var(--ink);font-weight:600;}\
.map-card{border:1px solid var(--hairline);border-radius:4px;overflow:hidden;margin-top:4px;}\
.map-card img{width:100%;display:block;}\
.cap-text{font-size:10.5px;color:var(--muted);text-align:center;margin-top:7px;font-style:italic;}\
.bci-strip{display:flex;gap:14px;margin:6px 0 12px;}\
.bci-cell{flex:1;background:var(--surface-sunken);border:1px solid var(--hairline);border-radius:4px;padding:14px 16px;break-inside:avoid;page-break-inside:avoid;}\
.bci-cell .lbl{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);margin-bottom:6px;}\
.bci-cell .val{font-size:26px;font-weight:800;color:var(--ink);}\
.bci-cell.accent{background:var(--accent-tint);}\
.bci-cell.accent .val{color:var(--accent);}\
.bci-cell .tag{display:inline-block;margin-top:6px;font-size:10.5px;font-weight:700;color:var(--accent);background:rgba(91,140,138,.14);padding:2px 9px;border-radius:10px;}\
.band-strip{display:flex;gap:6px;margin:4px 0 18px;}\
.band{flex:1;text-align:center;padding:8px 4px;border-radius:4px;font-size:9.5px;font-weight:700;color:#9fb0ab;background:var(--surface-sunken);border:1px solid var(--hairline);}\
.band.active{background:var(--ink);color:#fff;border-color:var(--ink);}\
.pmix{display:flex;height:26px;border-radius:4px;overflow:hidden;margin:8px 0 10px;}\
.pmix>div{display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:#fff;}\
.pmix .h{background:var(--pri-h);}.pmix .m{background:var(--pri-m);}.pmix .l{background:var(--pri-l);}\
.pmix-legend{display:flex;gap:18px;font-size:11px;color:var(--body);}\
.pmix-legend .dot{display:inline-block;width:8px;height:8px;border-radius:2px;margin-right:6px;}\
.dot.h{background:var(--pri-h);}.dot.m{background:var(--pri-m);}.dot.l{background:var(--pri-l);}\
table.elist{width:100%;border-collapse:collapse;margin-bottom:8px;}\
.elist-row td{padding:6px 0;font-size:11px;border-bottom:1px solid var(--hairline);}\
.elist-row .en{color:var(--muted);width:24px;text-align:right;}\
.elist-row .nm{color:var(--body);padding-left:9px;}\
.elist-row .st{text-align:right;}\
.chip{font-size:9.5px;font-weight:700;padding:2px 9px;border-radius:9px;white-space:nowrap;}\
.chip.ok{color:#9fb0ab;background:var(--surface-sunken);}\
.chip.pri-h{color:var(--pri-h);background:var(--pri-h-bg);}\
.chip.pri-m{color:var(--pri-m);background:var(--pri-m-bg);}\
.chip.pri-l{color:var(--pri-l);background:var(--pri-l-bg);}\
.chip.neutral{color:var(--accent);background:var(--accent-tint);}\
.defect{border:1px solid var(--hairline);border-radius:4px;padding:12px 14px;margin-bottom:10px;break-inside:avoid;page-break-inside:avoid;}\
.defect-top{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:6px;}\
.defect-id{font-size:10.5px;font-weight:800;color:var(--muted);letter-spacing:.03em;}\
.defect-facts{display:flex;gap:16px;font-size:10.5px;color:var(--muted);margin-bottom:7px;flex-wrap:wrap;}\
.defect-facts b{color:var(--ink);}\
.defect-comment{font-size:12px;color:var(--body);font-style:italic;margin-bottom:4px;}\
.photo-link{color:var(--accent);text-decoration:underline;font-style:normal;}\
.defect-remedial{font-size:11.5px;color:var(--body);background:var(--surface-sunken);border-left:3px solid var(--accent);padding:7px 10px;border-radius:0 3px 3px 0;}\
.defect-remedial b{color:var(--ink);}\
.no-defect{font-size:11.5px;color:var(--muted);font-style:italic;}\
table.works{width:100%;border-collapse:collapse;margin-top:4px;}\
table.works th{text-align:left;font-size:9.5px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:#6b8685;background:var(--surface-sunken);padding:8px 10px;}\
table.works td{padding:9px 10px;font-size:11.5px;color:var(--body);border-bottom:1px solid var(--hairline);vertical-align:top;}\
table.works th.center,table.works td.center{text-align:center;}\
table.works th.num,table.works td.num{text-align:right;}\
table.works .total-label{font-weight:700;color:var(--ink);text-align:right;border-bottom:none;}\
table.works .total-value{font-weight:700;color:var(--ink);border-bottom:none;}\
.callout{background:var(--accent-tint);border-left:4px solid var(--accent);border-radius:0 4px 4px 0;padding:11px 15px;font-size:12px;color:#2c4a48;line-height:1.55;margin-top:6px;}\
.callout.danger{background:var(--pri-h-bg);border-left-color:var(--pri-h);color:#7a1f1f;}\
.photo-card{border:1px solid var(--hairline);border-radius:4px;overflow:hidden;margin-bottom:22px;break-inside:avoid;page-break-inside:avoid;}\
.photo-card img{width:100%;max-height:140mm;object-fit:contain;background:#f2f5f4;display:block;}\
.photo-ph{min-height:220px;display:flex;align-items:center;justify-content:center;color:var(--muted);background:linear-gradient(135deg,#dce8e6,#eef4f2);}\
.photo-cap{padding:9px 12px;font-size:11px;color:var(--body);border-top:1px solid var(--hairline);}\
.photo-cap b{color:var(--ink);margin-right:6px;}\
@media print{\
  .no-print{display:none!important;}\
  html,body{background:#fff;}\
  .pages{padding:0;gap:0;}\
  .page{box-shadow:none;margin:0 auto;page-break-after:always;}\
  .page:last-child{page-break-after:auto;}\
  @page{size:A4;margin:0;}\
}';

async function downloadFullInspectionReportHtml(doc) {
    var html = await buildFullInspectionReportHtml(doc);
    var blob = new Blob([html], { type: 'text/html' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = (doc.structure_name || 'Report').replace(/[^a-z0-9]/gi, '_') + '_Inspection_Report_' + doc.date + '.html';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

window.buildFullInspectionReportHtml = buildFullInspectionReportHtml;
window.downloadFullInspectionReportHtml = downloadFullInspectionReportHtml;

}
