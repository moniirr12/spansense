/**
 * reportFull.docx.js
 * Builds a real .docx version of the full narrative inspection report
 * (the same one test.js's generateSimplePDFReport produces as a PDF) -
 * cover page, clickable table of contents, structure details, location
 * map, per-element defect narrative (with numbered sections and clickable
 * photo cross-references), conclusions/remedial works, and a photo
 * appendix. Deliberately does NOT include the BCI Proforma appendix.
 * Guarded to prevent double-declaration errors.
 */

if (typeof buildFullInspectionReportDocx === 'undefined') {

// SpanSense brand palette / body copy matches bciProforma.pdfmake.js's and
// test.js's own PDF styling (sectionHeader #2c3e44, subsectionHeader
// #5b8c8a, Roboto - pdfMake's default font, same one used across the app's
// PDFs) so the Word version reads as the same report, not a generic one.
var REPORT_FONT = 'Roboto';
var REPORT_COLORS = {
    text: '2C3E44',
    heading: '2C3E44',
    subheading: '5B8C8A',
    muted: '888888',
    link: '2563EB',
};

// Same per-structure-type element/category list as test.js's
// generateSimplePDFReport (kept separate since it uses report-numbering
// ("3.x") rather than the BCI Proforma's ("4.x") element list).
var REPORT_ELEMENTS_BY_TYPE = {
    Bridge: [
        { category: 'Deck Elements', elementNo: 1, name: 'Primary deck element' },
        { category: 'Deck Elements', elementNo: 2, name: 'Transverse beams' },
        { category: 'Deck Elements', elementNo: 3, name: 'Secondary deck element' },
        { category: 'Deck Elements', elementNo: 4, name: 'Half joints' },
        { category: 'Deck Elements', elementNo: 5, name: 'Tie beam/rod' },
        { category: 'Deck Elements', elementNo: 6, name: 'Parapet beam or cantilever' },
        { category: 'Deck Elements', elementNo: 7, name: 'Deck bracing' },
        { category: 'Load-bearing Substructure', elementNo: 8,  name: 'Foundations' },
        { category: 'Load-bearing Substructure', elementNo: 9,  name: 'Abutments (incl. arch springing)' },
        { category: 'Load-bearing Substructure', elementNo: 10, name: 'Spandrel wall/head wall' },
        { category: 'Load-bearing Substructure', elementNo: 11, name: 'Pier/column' },
        { category: 'Load-bearing Substructure', elementNo: 12, name: 'Cross-head/capping beam' },
        { category: 'Load-bearing Substructure', elementNo: 13, name: 'Bearings' },
        { category: 'Load-bearing Substructure', elementNo: 14, name: 'Bearing plinth/shelf' },
        { category: 'Durability Elements', elementNo: 15, name: 'Superstructure drainage' },
        { category: 'Durability Elements', elementNo: 16, name: 'Substructure drainage' },
        { category: 'Durability Elements', elementNo: 17, name: 'Waterproofing' },
        { category: 'Durability Elements', elementNo: 18, name: 'Movement/expansion joints' },
        { category: 'Durability Elements', elementNo: 19, name: 'Finishes: deck elements' },
        { category: 'Durability Elements', elementNo: 20, name: 'Finishes: substructure elements' },
        { category: 'Durability Elements', elementNo: 21, name: 'Finishes: parapets/safety fences' },
        { category: 'Safety Elements', elementNo: 22, name: 'Access/walkways/gantries' },
        { category: 'Safety Elements', elementNo: 23, name: 'Handrail/parapets/safety fences' },
        { category: 'Safety Elements', elementNo: 24, name: 'Carriageway surfacing' },
        { category: 'Safety Elements', elementNo: 25, name: 'Footway/verge/footbridge surfacing' },
        { category: 'Other Bridge Elements', elementNo: 26, name: 'Invert/river bed' },
        { category: 'Other Bridge Elements', elementNo: 27, name: 'Aprons' },
        { category: 'Other Bridge Elements', elementNo: 28, name: 'Fenders/cutwaters/collision prot.' },
        { category: 'Other Bridge Elements', elementNo: 29, name: 'River training works' },
        { category: 'Other Bridge Elements', elementNo: 30, name: 'Revetment/batter paving' },
        { category: 'Other Bridge Elements', elementNo: 31, name: 'Wing walls' },
        { category: 'Other Bridge Elements', elementNo: 32, name: 'Retaining walls' },
        { category: 'Other Bridge Elements', elementNo: 33, name: 'Embankments' },
        { category: 'Other Bridge Elements', elementNo: 34, name: 'Machinery' },
        { category: 'Ancillary Elements', elementNo: 35, name: 'Approach rails/barriers/walls' },
        { category: 'Ancillary Elements', elementNo: 36, name: 'Signs' },
        { category: 'Ancillary Elements', elementNo: 37, name: 'Lighting' },
        { category: 'Ancillary Elements', elementNo: 38, name: 'Services' },
    ],
    'Retaining wall': [
        { category: 'Main Elements', elementNo: 1, name: 'Foundations' },
        { category: 'Main Elements', elementNo: 2, name: 'Retaining wall: Primary' },
        { category: 'Main Elements', elementNo: 3, name: 'Retaining wall: Secondary' },
        { category: 'Main Elements', elementNo: 4, name: 'Parapet beam/plinth' },
        { category: 'Durability Elements', elementNo: 5, name: 'Drainage' },
        { category: 'Durability Elements', elementNo: 6, name: 'Movement/Expansion Joints' },
        { category: 'Durability Elements', elementNo: 7, name: 'Surface finishes: wall' },
        { category: 'Durability Elements', elementNo: 8, name: 'Surface finishes: handrail/parapet' },
        { category: 'Safety Elements', elementNo: 9,  name: 'Handrail/parapets/safety fences' },
        { category: 'Safety Elements', elementNo: 10, name: 'Carriageway: Top of Wall' },
        { category: 'Safety Elements', elementNo: 11, name: 'Carriageway: Foot of Wall' },
        { category: 'Safety Elements', elementNo: 12, name: 'Footway/verge: Top of Wall' },
        { category: 'Safety Elements', elementNo: 13, name: 'Footway/verge: Foot of Wall' },
        { category: 'Other Elements', elementNo: 14, name: 'Embankment' },
        { category: 'Other Elements', elementNo: 15, name: 'Superstructure drainage' },
        { category: 'Other Elements', elementNo: 16, name: 'Invert/river bed' },
        { category: 'Other Elements', elementNo: 17, name: 'Aprons' },
        { category: 'Ancillary Elements', elementNo: 18, name: 'Signs' },
        { category: 'Ancillary Elements', elementNo: 19, name: 'Lighting' },
        { category: 'Ancillary Elements', elementNo: 20, name: 'Services' },
    ],
    'Sign Gantry': [
        { category: 'Main Elements', elementNo: 1, name: 'Foundations' },
        { category: 'Main Elements', elementNo: 2, name: 'Truss/beams/cantilever' },
        { category: 'Main Elements', elementNo: 3, name: 'Transverse/horiz. bracing elements' },
        { category: 'Main Elements', elementNo: 4, name: 'Columns/supports/legs' },
        { category: 'Durability Elements', elementNo: 5, name: 'Surface finishes: truss/beams/cantilever' },
        { category: 'Durability Elements', elementNo: 6, name: 'Surface finishes: columns/supports/legs' },
        { category: 'Durability Elements', elementNo: 7, name: 'Surface finishes: other elements' },
        { category: 'Safety Elements', elementNo: 8,  name: 'Access/walkway/deck' },
        { category: 'Safety Elements', elementNo: 9,  name: 'Access ladder' },
        { category: 'Safety Elements', elementNo: 10, name: 'Handrails/guard rails' },
        { category: 'Other Elements', elementNo: 11, name: 'Base connections' },
        { category: 'Other Elements', elementNo: 12, name: 'Support to longitudinal connection' },
        { category: 'Other Elements', elementNo: 13, name: 'Sign and signal supports' },
        { category: 'Ancillary Elements', elementNo: 14, name: 'Signs/signals' },
        { category: 'Ancillary Elements', elementNo: 15, name: 'Lighting' },
        { category: 'Ancillary Elements', elementNo: 16, name: 'Services' },
    ]
};

// ── Document-wide style overrides: without these, Word's built-in Heading
// styles render in its own default blue/Calibri theme instead of SpanSense's. ──
function reportDocStyles(d) {
    return {
        default: {
            document: { run: { font: REPORT_FONT, size: 18, color: REPORT_COLORS.text } },
            heading1: { run: { font: REPORT_FONT, size: 26, bold: true, color: REPORT_COLORS.heading } },
            heading2: { run: { font: REPORT_FONT, size: 22, bold: true, color: REPORT_COLORS.subheading } },
            heading3: { run: { font: REPORT_FONT, size: 20, bold: true, color: REPORT_COLORS.subheading } },
        }
    };
}

// A heading that's also a jump target - wraps the text in a Bookmark so a
// Table of Contents (or a photo cross-reference) can link straight to it.
function bookmarkedHeading(d, text, level, bookmarkId) {
    return new d.Paragraph({
        heading: level,
        spacing: { before: 240, after: 120 },
        children: [new d.Bookmark({ id: bookmarkId, children: [new d.TextRun({ text: text })] })]
    });
}

function reportPara(d, text, opts) {
    opts = opts || {};
    return new d.Paragraph({
        alignment: opts.alignment,
        spacing: { after: opts.after != null ? opts.after : 120 },
        children: [new d.TextRun({ text: text != null ? String(text) : '', italics: !!opts.italics, bold: !!opts.bold, color: opts.color, size: opts.size || 18 })]
    });
}

// One clickable line in the manually-built Table of Contents.
function tocEntry(d, text, bookmarkId, indent) {
    return new d.Paragraph({
        indent: indent ? { left: indent } : undefined,
        spacing: { after: 80 },
        children: [new d.InternalHyperlink({
            anchor: bookmarkId,
            children: [new d.TextRun({ text: text, color: REPORT_COLORS.link, underline: { type: 'single' }, size: indent ? 18 : 20 })]
        })]
    });
}

// Inline "(Photo N)" link, jumping to that photo's bookmark in Appendix A.
function photoLinkRun(d, photoNum) {
    return new d.InternalHyperlink({
        anchor: 'photo-' + photoNum,
        children: [new d.TextRun({ text: '(Photo ' + photoNum + ')', color: REPORT_COLORS.link, underline: { type: 'single' }, size: 18 })]
    });
}

function kvTable(d, pairs) {
    return new d.Table({
        width: { size: 100, type: d.WidthType.PERCENTAGE },
        rows: pairs.map(function(pair) {
            return new d.TableRow({
                children: [
                    new d.TableCell({
                        width: { size: 30, type: d.WidthType.PERCENTAGE },
                        children: [new d.Paragraph({ children: [new d.TextRun({ text: pair[0], bold: true, size: 18 })] })]
                    }),
                    new d.TableCell({
                        width: { size: 70, type: d.WidthType.PERCENTAGE },
                        children: [new d.Paragraph({ children: [new d.TextRun({ text: pair[1] != null ? String(pair[1]) : '', size: 18 })] })]
                    })
                ]
            });
        })
    });
}

// docx's ImageRun requires an explicit `type` (jpg/png/gif/bmp) - it uses it
// to name the embedded media file, so an unrecognised data URL MIME type
// would otherwise silently produce a corrupt (extensionless) image entry.
function imageTypeFromDataUrl(dataUrl) {
    var m = /^data:image\/(\w+)/i.exec(dataUrl);
    var subtype = m ? m[1].toLowerCase() : '';
    if (subtype === 'jpeg') return 'jpg';
    if (['jpg', 'png', 'gif', 'bmp'].includes(subtype)) return subtype;
    return 'png';
}

function imageParagraph(d, dataUrl, maxWidthPx) {
    if (!dataUrl) return null;
    // Word wants explicit pixel dimensions - default to a plausible photo
    // aspect ratio since we don't decode the image ourselves client-side.
    var width = maxWidthPx || 450;
    var height = Math.round(width * 0.62);
    return new d.Paragraph({
        alignment: d.AlignmentType.CENTER,
        spacing: { after: 200 },
        children: [new d.ImageRun({ data: dataUrl, type: imageTypeFromDataUrl(dataUrl), transformation: { width: width, height: height } })]
    });
}

function priorityTable(d, defects, getElementDesc) {
    var rows = [new d.TableRow({
        tableHeader: true,
        children: [
            new d.TableCell({ width: { size: 15, type: d.WidthType.PERCENTAGE }, shading: { fill: 'F2F2F2' }, children: [new d.Paragraph({ children: [new d.TextRun({ text: 'Location', bold: true, size: 18 })] })] }),
            new d.TableCell({ width: { size: 35, type: d.WidthType.PERCENTAGE }, shading: { fill: 'F2F2F2' }, children: [new d.Paragraph({ children: [new d.TextRun({ text: 'Element', bold: true, size: 18 })] })] }),
            new d.TableCell({ width: { size: 50, type: d.WidthType.PERCENTAGE }, shading: { fill: 'F2F2F2' }, children: [new d.Paragraph({ children: [new d.TextRun({ text: 'Remedial Works', bold: true, size: 18 })] })] }),
        ]
    })];
    defects.forEach(function(def) {
        rows.push(new d.TableRow({
            children: [
                new d.TableCell({ children: [new d.Paragraph({ children: [new d.TextRun({ text: 'Span ' + def.spanNumber, size: 18 })] })] }),
                new d.TableCell({ children: [new d.Paragraph({ children: [new d.TextRun({ text: getElementDesc(def), size: 18 })] })] }),
                new d.TableCell({ children: [new d.Paragraph({ children: [new d.TextRun({ text: def.remedialWorks || def.remedial_works || '', size: 18 })] })] }),
            ]
        }));
    });
    return new d.Table({ width: { size: 100, type: d.WidthType.PERCENTAGE }, rows: rows });
}

async function buildFullInspectionReportDocx(doc) {
    var d = window.docx;
    if (!d) throw new Error('docx library not loaded');

    var structureId = doc.structure_id;
    var structureName = doc.structure_name;
    var inspectionDate = doc.date;

    var bridgeData = await fetch(API_BASE + '/api/bridges/' + structureId).then(function(r) { return r.json(); }).catch(function() { return {}; });
    var inspectionData = await fetch(API_BASE + '/api/inspection/full?structure_id=' + structureId + '&date=' + inspectionDate)
        .then(function(r) { return r.ok ? r.json() : {}; }).catch(function() { return {}; });
    var photosResponse = await fetch(API_BASE + '/api/bridges/' + structureId + '/inspection-photos?inspectionDate=' + encodeURIComponent(inspectionDate))
        .then(function(r) { return r.ok ? r.json() : { success: false, photos: [] }; }).catch(function() { return { success: false, photos: [] }; });

    var defectsData = inspectionData.defects || [];
    var allPhotos = photosResponse.success ? photosResponse.photos : [];

    var allElementsList = REPORT_ELEMENTS_BY_TYPE[bridgeData.type] || REPORT_ELEMENTS_BY_TYPE.Bridge;
    var elementNameMap = {};
    allElementsList.forEach(function(el) { elementNameMap[el.elementNo] = el.name; });
    function getElementDesc(def) { return elementNameMap[def.elementNumber] || ('Element ' + def.elementNumber); }

    // Category order + numbering ("3.1", "3.2", ...) derived from the list
    // itself, so it stays correct for Bridge/Retaining wall/Sign Gantry
    // without hand-maintaining separate numbering tables.
    var categoriesInOrder = [];
    allElementsList.forEach(function(el) { if (categoriesInOrder.indexOf(el.category) === -1) categoriesInOrder.push(el.category); });
    var categoryBookmarkId = {};
    categoriesInOrder.forEach(function(cat, idx) { categoryBookmarkId[cat] = 'section3_' + (idx + 1); });

    // Bridge cover photo
    var bridgePhotoDataURL = null;
    var photoMeta = await fetch(API_BASE + '/getBridgePhoto?bridgeId=' + structureId).then(function(r) { return r.ok ? r.json() : null; }).catch(function() { return null; });
    if (photoMeta && photoMeta.photo_url) {
        bridgePhotoDataURL = await imageUrlToDataURL(photoMeta.photo_url);
    }

    // Location map snapshot (reuses test.js's Leaflet+html2canvas helper)
    var mapDataURL = null;
    if (bridgeData.latitude && bridgeData.longitude) {
        mapDataURL = await captureLocationMap(parseFloat(bridgeData.latitude) || null, parseFloat(bridgeData.longitude) || null, structureName);
    }

    // Defect photos, numbered the same way as the PDF appendix
    var photosByDefect = {};
    var photoNumberCounter = 0;
    allPhotos.forEach(function(photo) {
        photoNumberCounter++;
        var defectCode = null;
        if (photo.defect_id != null) {
            var matched = defectsData.find(function(dd) { return dd.defectDbId === photo.defect_id; });
            if (matched) defectCode = matched.defectId;
        }
        if (!defectCode && photo.front_defectid) {
            var parts = String(photo.front_defectid).split('_');
            defectCode = parts[parts.length - 1];
        }
        if (!defectCode) return;
        if (!photosByDefect[defectCode]) photosByDefect[defectCode] = [];
        photosByDefect[defectCode].push({ photo_url: photo.photo_url, photo_description: photo.photo_description, photoNumber: photoNumberCounter });
    });
    function getPhotoNumbersForDefect(defectCode) {
        return (photosByDefect[defectCode] || []).map(function(p) { return p.photoNumber; });
    }

    var photosWithDataURLs = [];
    for (var code in photosByDefect) {
        for (var i = 0; i < photosByDefect[code].length; i++) {
            var photo = photosByDefect[code][i];
            var dataURL = await imageUrlToDataURL(photo.photo_url);
            photosWithDataURLs.push({ photo_description: photo.photo_description, photoNumber: photo.photoNumber, dataURL: dataURL });
        }
    }
    photosWithDataURLs.sort(function(a, b) { return a.photoNumber - b.photoNumber; });

    var spanNumbers = Array.from(new Set(defectsData.map(function(dd) { return dd.spanNumber; }))).sort(function(a, b) { return a - b; });
    if (spanNumbers.length === 0) spanNumbers.push(1);
    var severityCounts = {};
    [1, 2, 3, 4, 5].forEach(function(n) { severityCounts[n] = defectsData.filter(function(dd) { return dd.severity === n; }).length; });

    var children = [];

    // ── COVER PAGE ──
    children.push(new d.Paragraph({ alignment: d.AlignmentType.CENTER, spacing: { before: 1600 }, children: [new d.TextRun({ text: 'SPANSENSE', bold: true, size: 40, color: REPORT_COLORS.subheading })] }));
    children.push(new d.Paragraph({ alignment: d.AlignmentType.CENTER, spacing: { after: 400 }, children: [new d.TextRun({ text: 'BRIDGE INSPECTION REPORT', bold: true, size: 32, color: REPORT_COLORS.heading })] }));
    children.push(new d.Paragraph({ alignment: d.AlignmentType.CENTER, spacing: { after: 100 }, children: [new d.TextRun({ text: structureName, bold: true, size: 28 })] }));
    children.push(new d.Paragraph({ alignment: d.AlignmentType.CENTER, spacing: { after: 400 }, children: [new d.TextRun({ text: 'Structure ID: ' + structureId, size: 20, color: REPORT_COLORS.muted })] }));
    if (bridgePhotoDataURL) { var coverImg = imageParagraph(d, bridgePhotoDataURL, 400); if (coverImg) children.push(coverImg); }
    children.push(reportPara(d, 'Inspection Date: ' + formatDate(inspectionDate), { alignment: d.AlignmentType.CENTER }));
    children.push(reportPara(d, 'Report Generated: ' + new Date().toLocaleDateString(), { alignment: d.AlignmentType.CENTER }));

    // ── TABLE OF CONTENTS ── (built manually, as clickable links to bookmarks
    // below - a native Word TOC field only populates after the user manually
    // updates it, so it reads as "missing" until then; this is always visible.)
    children.push(new d.Paragraph({ children: [], pageBreakBefore: true }));
    children.push(new d.Paragraph({ heading: d.HeadingLevel.HEADING_1, spacing: { after: 200 }, children: [new d.TextRun({ text: 'Table of Contents' })] }));
    children.push(tocEntry(d, '1. Structure Details', 'section1'));
    children.push(tocEntry(d, '1.1 Structure Description', 'section1_1', 360));
    children.push(tocEntry(d, '1.2 Coordinates', 'section1_2', 360));
    if (mapDataURL) children.push(tocEntry(d, '1.3 Location Map', 'section1_3', 360));
    children.push(tocEntry(d, '2. Inspection Details', 'section2'));
    children.push(tocEntry(d, '2.1 Span Details & BCI Scores', 'section2_1', 360));
    children.push(tocEntry(d, '3. Description of Defects', 'section3'));
    categoriesInOrder.forEach(function(cat, idx) {
        children.push(tocEntry(d, '3.' + (idx + 1) + ' ' + cat, categoryBookmarkId[cat], 360));
    });
    children.push(tocEntry(d, '4. Conclusions and Recommendations', 'section4'));
    children.push(tocEntry(d, '4.1 Conclusions', 'section4_1', 360));
    children.push(tocEntry(d, '4.2 Recommended Remedial Works', 'section4_2', 360));
    children.push(tocEntry(d, '4.3 Next Inspection', 'section4_3', 360));
    children.push(tocEntry(d, 'Appendix A: Photographs', 'appendixA'));

    // ── SECTION 1: STRUCTURE DETAILS ──
    children.push(new d.Paragraph({ children: [], pageBreakBefore: true }));
    children.push(bookmarkedHeading(d, '1. Structure Details', d.HeadingLevel.HEADING_1, 'section1'));
    children.push(kvTable(d, [
        ['Structure Name:', structureName],
        ['Structure Number:', structureId],
        ['Date of Construction:', bridgeData.year_built || 'Unknown'],
        ['Crosses:', bridgeData.crosses || 'Not specified'],
        ['Carries:', bridgeData.carries || 'Not specified'],
        ['Location:', bridgeData.location || 'Not specified'],
    ]));

    children.push(bookmarkedHeading(d, '1.1 Structure Description', d.HeadingLevel.HEADING_2, 'section1_1'));
    children.push(reportPara(d, bridgeData.description || 'No structural description available for this bridge.'));

    children.push(bookmarkedHeading(d, '1.2 Coordinates', d.HeadingLevel.HEADING_2, 'section1_2'));
    children.push(kvTable(d, [
        ['Easting:', bridgeData.easting || bridgeData.ose || 'N/A'],
        ['Northing:', bridgeData.northing || bridgeData.osn || 'N/A'],
        ['Latitude:', bridgeData.latitude ? Number(bridgeData.latitude).toFixed(6) : 'N/A'],
        ['Longitude:', bridgeData.longitude ? Number(bridgeData.longitude).toFixed(6) : 'N/A'],
    ]));

    if (mapDataURL) {
        children.push(bookmarkedHeading(d, '1.3 Location Map', d.HeadingLevel.HEADING_2, 'section1_3'));
        var mapImg = imageParagraph(d, mapDataURL, 400);
        if (mapImg) children.push(mapImg);
    }

    // ── SECTION 2: INSPECTION DETAILS ──
    children.push(new d.Paragraph({ children: [], pageBreakBefore: true }));
    children.push(bookmarkedHeading(d, '2. Inspection Details', d.HeadingLevel.HEADING_1, 'section2'));
    children.push(kvTable(d, [
        ['Inspector Name:', inspectionData.inspectorName || 'Not recorded'],
        ['Inspection Type:', inspectionData.inspectionType || 'N/A'],
        ['Inspection Date:', inspectionData.inspectionDate ? formatDate(inspectionData.inspectionDate) : 'N/A'],
        ['Total Spans:', inspectionData.totalSpans || 'N/A'],
    ]));

    if (inspectionData.spans && inspectionData.spans.length > 0) {
        children.push(bookmarkedHeading(d, '2.1 Span Details & BCI Scores', d.HeadingLevel.HEADING_2, 'section2_1'));
        inspectionData.spans.forEach(function(span) {
            var spanDefects = defectsData.filter(function(dd) { return dd.spanNumber === span.spanNumber; });
            var spanScores = spanDefects.map(function(dd) { return dd.severity || 0; });
            var spanBciAv = span.bciAv != null ? parseFloat(span.bciAv) : null;
            var spanBciCrit = span.bciCrit != null ? parseFloat(span.bciCrit) : null;
            if (spanBciAv == null && spanScores.length > 0) {
                var avgScore = spanScores.reduce(function(a, b) { return a + b; }, 0) / spanScores.length;
                spanBciAv = Math.round(Math.max(0, Math.min(100, 100 - avgScore * 8)));
                spanBciCrit = Math.round(Math.max(0, Math.min(100, 100 - Math.max.apply(null, spanScores) * 12)));
            } else if (spanBciAv == null) { spanBciAv = 100; spanBciCrit = 100; }

            children.push(reportPara(d, 'Span ' + span.spanNumber, { bold: true, size: 24, after: 100 }));
            children.push(new d.Table({
                width: { size: 100, type: d.WidthType.PERCENTAGE },
                rows: [new d.TableRow({ children: [
                    new d.TableCell({ width: { size: 34, type: d.WidthType.PERCENTAGE }, children: [
                        reportPara(d, 'BCI Average', { alignment: d.AlignmentType.CENTER, bold: true, size: 16, color: REPORT_COLORS.muted, after: 40 }),
                        reportPara(d, String(spanBciAv), { alignment: d.AlignmentType.CENTER, bold: true, size: 32 })
                    ] }),
                    new d.TableCell({ width: { size: 33, type: d.WidthType.PERCENTAGE }, children: [
                        reportPara(d, 'BCI Critical', { alignment: d.AlignmentType.CENTER, bold: true, size: 16, color: REPORT_COLORS.muted, after: 40 }),
                        reportPara(d, String(spanBciCrit), { alignment: d.AlignmentType.CENTER, bold: true, size: 32, color: 'DC2626' })
                    ] }),
                    new d.TableCell({ width: { size: 33, type: d.WidthType.PERCENTAGE }, children: [
                        reportPara(d, 'Defects', { alignment: d.AlignmentType.CENTER, bold: true, size: 16, color: REPORT_COLORS.muted, after: 40 }),
                        reportPara(d, String(spanDefects.length), { alignment: d.AlignmentType.CENTER, bold: true, size: 32, color: REPORT_COLORS.subheading })
                    ] }),
                ] })]
            }));
            if (span.comments) {
                children.push(reportPara(d, 'Comments:', { bold: true, size: 16, color: REPORT_COLORS.muted, after: 40 }));
                children.push(reportPara(d, span.comments, { italics: true, color: '4A5B6E' }));
            }
        });
    }

    // ── SECTION 3: DESCRIPTION OF DEFECTS ──
    children.push(new d.Paragraph({ children: [], pageBreakBefore: true }));
    children.push(bookmarkedHeading(d, '3. Description of Defects', d.HeadingLevel.HEADING_1, 'section3'));
    spanNumbers.forEach(function(spanNum) {
        children.push(reportPara(d, 'Span ' + spanNum, { bold: true, size: 22, after: 100 }));
        var currentCategory = '';
        var catIdx = 0;
        var elIdxInCat = 0;
        allElementsList.forEach(function(el) {
            if (el.category !== currentCategory) {
                currentCategory = el.category;
                catIdx += 1;
                elIdxInCat = 0;
                children.push(bookmarkedHeading(d, '3.' + catIdx + ' ' + currentCategory, d.HeadingLevel.HEADING_3, categoryBookmarkId[currentCategory]));
            }
            elIdxInCat += 1;
            children.push(reportPara(d, '3.' + catIdx + '.' + elIdxInCat + ' ' + el.name, { bold: true, after: 40 }));

            var elementDefects = defectsData.filter(function(dd) { return dd.elementNumber === el.elementNo && dd.spanNumber === spanNum; });
            if (elementDefects.length === 0) {
                children.push(reportPara(d, 'No defects recorded', { italics: true, color: REPORT_COLORS.muted, size: 18 }));
            } else {
                elementDefects.forEach(function(def) {
                    children.push(reportPara(d, def.defectId + '. Severity: ' + (def.severity || '?') + '. Extent: ' + (def.extent || '?'), { size: 18, after: 40 }));
                    var comment = def.comments && def.comments !== 'Add' ? def.comments.trim() : '';
                    var photoNums = getPhotoNumbersForDefect(def.defectId);
                    if (comment || photoNums.length > 0) {
                        var runs = [];
                        if (comment) runs.push(new d.TextRun({ text: comment, size: 18 }));
                        photoNums.forEach(function(n, idx) {
                            if (comment || idx > 0) runs.push(new d.TextRun({ text: ' ', size: 18 }));
                            runs.push(photoLinkRun(d, n));
                        });
                        children.push(new d.Paragraph({ children: runs, spacing: { after: 120 } }));
                    }
                });
            }
        });
    });

    // ── SECTION 4: CONCLUSIONS AND RECOMMENDATIONS ──
    children.push(new d.Paragraph({ children: [], pageBreakBefore: true }));
    children.push(bookmarkedHeading(d, '4. Conclusions and Recommendations', d.HeadingLevel.HEADING_1, 'section4'));
    children.push(bookmarkedHeading(d, '4.1 Conclusions', d.HeadingLevel.HEADING_2, 'section4_1'));
    children.push(reportPara(d, (inspectionData.conclusions || '').trim() || 'No conclusions provided for this inspection.'));

    children.push(bookmarkedHeading(d, '4.2 Recommended Remedial Works', d.HeadingLevel.HEADING_2, 'section4_2'));
    var defectsWithRemedial = defectsData.filter(function(dd) {
        var remedial = dd.remedialWorks || dd.remedial_works;
        return remedial && remedial.trim().length > 0 && remedial !== 'Add';
    });
    if (defectsWithRemedial.length === 0) {
        children.push(reportPara(d, 'No specific remedial works recorded for this inspection.', { italics: true, color: REPORT_COLORS.muted }));
    } else {
        [
            { label: 'HIGH PRIORITY', code: 'H', color: 'DC2626' },
            { label: 'MEDIUM PRIORITY', code: 'M', color: 'F97316' },
            { label: 'LOW PRIORITY', code: 'L', color: '22C55E' },
        ].forEach(function(tier) {
            var tierDefects = defectsWithRemedial.filter(function(dd) { return dd.priority === tier.code; });
            if (tierDefects.length === 0) return;
            children.push(reportPara(d, tier.label, { bold: true, color: tier.color, size: 20, after: 100 }));
            children.push(priorityTable(d, tierDefects, getElementDesc));
            children.push(reportPara(d, '', { after: 100 }));
        });
    }

    children.push(bookmarkedHeading(d, '4.3 Next Inspection', d.HeadingLevel.HEADING_2, 'section4_3'));
    var highSeverity = severityCounts[5] + severityCounts[4];
    var nextInspText = highSeverity > 0
        ? 'It is recommended that the next general inspection be carried out within 6 months.\n\nNote: Interim safety inspections should be conducted monthly due to identified severe/critical defects.'
        : severityCounts[3] > 0
        ? 'It is recommended that the next general inspection be carried out within 12 months.'
        : defectsData.length > 0
        ? 'It is recommended that the next general inspection be carried out within 24 months.'
        : 'It is recommended that the next general inspection be carried out within 24-36 months.';
    children.push(reportPara(d, nextInspText, { color: highSeverity > 0 ? 'DC2626' : REPORT_COLORS.heading }));

    // ── APPENDIX A: PHOTOGRAPHS ──
    children.push(new d.Paragraph({ children: [], pageBreakBefore: true }));
    children.push(bookmarkedHeading(d, 'Appendix A: Photographs', d.HeadingLevel.HEADING_1, 'appendixA'));
    if (photosWithDataURLs.length === 0) {
        children.push(reportPara(d, 'No photographs available for this inspection.', { italics: true, color: REPORT_COLORS.muted, alignment: d.AlignmentType.CENTER }));
    } else {
        children.push(reportPara(d, 'The following pages contain photographic documentation of identified defects.', { italics: true, color: REPORT_COLORS.muted, alignment: d.AlignmentType.CENTER }));
        photosWithDataURLs.forEach(function(photo) {
            if (photo.dataURL) {
                var img = imageParagraph(d, photo.dataURL, 400);
                if (img) children.push(img);
            } else {
                children.push(reportPara(d, '[Image not available]', { italics: true, color: REPORT_COLORS.muted, alignment: d.AlignmentType.CENTER }));
            }
            children.push(new d.Paragraph({
                alignment: d.AlignmentType.CENTER,
                spacing: { after: 200 },
                children: [new d.Bookmark({
                    id: 'photo-' + photo.photoNumber,
                    children: [new d.TextRun({ text: 'Photo ' + photo.photoNumber + ': ' + (photo.photo_description || ''), bold: true })]
                })]
            }));
        });
    }

    return new d.Document({
        styles: reportDocStyles(d),
        sections: [{ properties: {}, children: children }]
    });
}

window.buildFullInspectionReportDocx = buildFullInspectionReportDocx;

} // end guard: typeof buildFullInspectionReportDocx === 'undefined'
