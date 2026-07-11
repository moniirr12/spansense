
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

            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '&copy; OpenStreetMap contributors'
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
        } catch (err) {
            console.warn('Could not set up location map:', err);
            if (map) { try { map.remove(); } catch (e) {} }
            if (hiddenContainer) hiddenContainer.innerHTML = '';
            resolve(null);
            return;
        }

        setTimeout(async () => {
            try {
                const mapElement = document.getElementById('tempMap');
                const canvas = await html2canvas(mapElement, {
                    scale: 2,
                    backgroundColor: '#ffffff',
                    useCORS: true,
                    logging: false
                });
                resolve(canvas.toDataURL('image/png'));
            } catch (err) {
                console.warn('Could not capture location map:', err);
                resolve(null);
            } finally {
                try { map.remove(); } catch (e) {}
                hiddenContainer.innerHTML = '';
            }
        }, 1500);
    });
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

        // Calculate BCI scores
        function calculateBCI(scores) {
            if (!scores || scores.length === 0) return { bciAv: 100, bciCrit: 100 };
            const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
            const bciAv = Math.max(0, Math.min(100, 100 - (avgScore * 8)));
            const bciCrit = Math.max(0, Math.min(100, 100 - (Math.max(...scores) * 12)));
            return { bciAv: Math.round(bciAv), bciCrit: Math.round(bciCrit) };
        }

        const severityScores = defectsData.map(d => d.severity || 0);
        const { bciAv, bciCrit } = calculateBCI(severityScores);
        
        function getBCICategory(score) {
            if (score >= 90) return { text: 'Very Good', color: '#22c55e' };
            if (score >= 80) return { text: 'Good', color: '#8ab4b0' };
            if (score >= 65) return { text: 'Fair', color: '#eab308' };
            if (score >= 40) return { text: 'Poor', color: '#f97316' };
            return { text: 'Critical', color: '#dc2626' };
        }
        
        const bciCategory = getBCICategory(bciAv);
        
        const severityCounts = {
            5: defectsData.filter(d => d.severity === 5).length,
            4: defectsData.filter(d => d.severity === 4).length,
            3: defectsData.filter(d => d.severity === 3).length,
            2: defectsData.filter(d => d.severity === 2).length,
            1: defectsData.filter(d => d.severity === 1).length
        };

        // Get unique span numbers
        const spanNumbers = [...new Set(defectsData.map(d => d.spanNumber))].sort((a, b) => a - b);
        if (spanNumbers.length === 0) spanNumbers.push(1);

        // Group defects by span
        const defectsBySpan = {};
        spanNumbers.forEach(span => {
            defectsBySpan[span] = defectsData.filter(d => d.spanNumber === span);
        });

        // Page width for calculations
        const pageWidth = 595;
        const photoWidth = pageWidth * 0.7;
        const mapWidth = pageWidth * 0.65;

        // Helper function for Remedial Works (uses the lookup map)
        const getElementDesc = (defect) => {
            return elementNameMap[defect.elementNumber] || `Element ${defect.elementNumber}`;
        };

        // Build Section 4 content
        const buildSection4Content = () => {
            const content = [];
            
            for (const spanNum of spanNumbers) {
                content.push({
                    text: `Span ${spanNum}`,
                    style: 'subsectionHeader',
                    margin: [0, 15, 0, 8]
                });
                
                let currentMainNumber = '';
                
                for (const element of allElementsList) {
                    if (element.mainNumber !== currentMainNumber) {
                        currentMainNumber = element.mainNumber;
                        // Map mainNumber to ID
                        let categoryId = '';
                        switch(currentMainNumber) {
                            case '3.1': categoryId = 'section3_1'; break;
                            case '3.2': categoryId = 'section3_2'; break;
                            case '3.3': categoryId = 'section3_3'; break;
                            case '3.4': categoryId = 'section3_4'; break;
                            case '3.5': categoryId = 'section3_5'; break;
                            case '3.6': categoryId = 'section3_6'; break;
                        }
                        content.push({
                            text: `${element.mainNumber.replace('4', '3')} ${element.category}`,  // Changes 4.1 to 3.1
                            style: 'subsectionHeader',
                            margin: [10, 12, 0, 6],
                            fontSize: 11,
                            id: categoryId  // Add this for TOC linking
                        });
                    }
                    
                    const elementDefects = defectsData.filter(d => 
                        d.elementNumber === element.elementNo && d.spanNumber === spanNum
                    );
                    
                    content.push({
                        text: `${element.subNumber.replace('4.', '3.')} ${element.name}`,
                        bold: true,
                        margin: [20, 6, 0, 3],
                        fontSize: 10
                    });
                    
                    if (elementDefects.length === 0) {
                        content.push({
                            text: '  No defects recorded',
                            italics: true,
                            color: '#888',
                            margin: [30, 2, 0, 6],
                            fontSize: 9
                        });
                    } else {
                        for (let idx = 0; idx < elementDefects.length; idx++) {
                            const defect = elementDefects[idx];
                            const defectId = defect.defectId || `${defect.defect_type}.${defect.defect_number}`;
                            const photoNumbers = getPhotoNumbersForDefect(defectId);
                            const comment = defect.comments && defect.comments !== 'Add' ? defect.comments.trim() : '';
                            
                            content.push({
                                text: `${defectId}. Severity: ${defect.severity || '?'}. Extent: ${defect.extent || '?'}`,
                                margin: [30, 4, 0, 2],
                                fontSize: 9
                            });
                            
                            if (comment || photoNumbers.length > 0) {
                                const commentElements = [];
                                if (comment) commentElements.push({ text: comment });
                                if (photoNumbers.length > 0) {
                                    if (comment) commentElements.push({ text: ' ' });
                                    const photoTexts = photoNumbers.map(num => `(Photo ${num})`);
                                    commentElements.push({
                                        text: photoTexts.join(' '),
                                        color: 'blue',
                                        decoration: 'underline',
                                        linkToDestination: `photo-${photoNumbers[0]}`
                                    });
                                }
                                content.push({
                                    text: commentElements,
                                    margin: [40, 1, 0, 6],
                                    fontSize: 9
                                });
                            } else {
                                content.push({ text: '', margin: [0, 0, 0, 4] });
                            }
                        }
                    }
                }
            }
            return content;
        };

        // Build document definition
        const docDefinition = {
            pageSize: 'A4',
            pageMargins: [60, 50, 60, 50],
            

            header: function(currentPage, pageCount, pageSize) {
                if (currentPage === 1) return null;
                return {
                    columns: [
                        { text: `${structureName}`, alignment: 'left', fontSize: 8, color: '#888' },
                        { text: `Inspection Report`, alignment: 'center', fontSize: 8, color: '#888' },
                        { text: `Page ${currentPage} of ${pageCount}`, alignment: 'right', fontSize: 8, color: '#888' }
                    ],
                    margin: [40, 10, 40, 0]
                };
            },
            
            footer: function(currentPage, pageCount) {
                if (currentPage === 1) return null;
                return {
                    text: `Generated: ${new Date().toLocaleDateString()} | spanSense Asset Management System`,
                    alignment: 'center',
                    fontSize: 7,
                    color: '#aaa',
                    margin: [0, 0, 0, 10]
                };
            },
            
            content: [
                // COVER PAGE
                {
                    columns: [
                        {
                            width: '*',
                            stack: [
                                { text: 'SPANSENSE', fontSize: 20, bold: true, color: '#5b8c8a', alignment: 'center' },
                                { text: 'BRIDGE INSPECTION REPORT', fontSize: 16, bold: true, color: '#2c3e44', alignment: 'center', margin: [0, 10, 0, 0] }
                            ]
                        }
                    ],
                    margin: [0, 80, 0, 0]
                },
                {
                    text: structureName,
                    fontSize: 14,
                    bold: true,
                    color: '#2c3e44',
                    alignment: 'center',
                    margin: [0, 20, 0, 5]
                },
                {
                    text: `Structure ID: ${structureId}`,
                    fontSize: 10,
                    color: '#888',
                    alignment: 'center',
                    margin: [0, 0, 0, 25]
                },
                ...(bridgePhotoDataURL ? [{
                    image: bridgePhotoDataURL,
                    width: photoWidth,
                    alignment: 'center',
                    margin: [0, 0, 0, 25]
                }] : []),
                {
                    text: `Inspection Date: ${formatDate(inspectionDate)}`,
                    fontSize: 10,
                    alignment: 'center',
                    margin: [0, 0, 0, 5]
                },
                {
                    text: `Report Generated: ${new Date().toLocaleDateString()}`,
                    fontSize: 10,
                    alignment: 'center'
                },
                

                





















                // TABLE OF CONTENTS - With proper margins and indentation
                { text: '', pageBreak: 'before' },
                {
                    text: 'Table of Contents',
                    style: 'tocTitle',
                    alignment: 'center',
                    margin: [0, 0, 0, 25]
                },
                // Add a container with the same left margin as report body
                {
                    margin: [0, 0, 0, 0],  // This will inherit page margins
                    stack: [
                        // Section 1
                        {
                            columns: [
                                { text: '1. Structure Details', linkToDestination: 'section1', fontSize: 11 },
                                { text: '2', alignment: 'right', fontSize: 11, color: '#666', linkToDestination: 'section1' }
                            ],
                            margin: [0, 5, 0, 2]
                        },
                        {
                            columns: [
                                { text: '     1.1 Structure Description', linkToDestination: 'section1_1', fontSize: 10, color: '#555' },
                                { text: '3', alignment: 'right', fontSize: 10, color: '#666', linkToDestination: 'section1_1' }
                            ],
                            margin: [0, 2, 0, 2]
                        },
                        {
                            columns: [
                                { text: '     1.2 Coordinates', linkToDestination: 'section1_2', fontSize: 10, color: '#555' },
                                { text: '3', alignment: 'right', fontSize: 10, color: '#666', linkToDestination: 'section1_2' }
                            ],
                            margin: [0, 2, 0, 2]
                        },
                        {
                            columns: [
                                { text: '     1.3 Location Map', linkToDestination: 'section1_3', fontSize: 10, color: '#555' },
                                { text: '3', alignment: 'right', fontSize: 10, color: '#666', linkToDestination: 'section1_3' }
                            ],
                            margin: [0, 2, 0, 8]
                        },
                        
                        // Section 2
                        {
                            columns: [
                                { text: '2. Inspection Details', linkToDestination: 'section2', fontSize: 11 },
                                { text: '4', alignment: 'right', fontSize: 11, color: '#666', linkToDestination: 'section2' }
                            ],
                            margin: [0, 5, 0, 2]
                        },
                        {
                            columns: [
                                { text: '     2.1 Span Details & BCI Scores', linkToDestination: 'section2', fontSize: 10, color: '#555' },
                                { text: '4', alignment: 'right', fontSize: 10, color: '#666', linkToDestination: 'section2' }
                            ],
                            margin: [0, 2, 0, 8]
                        },
                        
                        // Section 3
                        {
                            columns: [
                                { text: '3. Description of Defects', linkToDestination: 'section3', fontSize: 11 },
                                { text: '6', alignment: 'right', fontSize: 11, color: '#666', linkToDestination: 'section3' }
                            ],
                            margin: [0, 5, 0, 2]
                        },
                        {
                            columns: [
                                { text: '     3.1 Deck Elements', linkToDestination: 'section3_1', fontSize: 10, color: '#555' },
                                { text: '6', alignment: 'right', fontSize: 10, color: '#666', linkToDestination: 'section3_1' }
                            ],
                            margin: [0, 2, 0, 2]
                        },
                        {
                            columns: [
                                { text: '     3.2 Load-bearing Substructure', linkToDestination: 'section3_2', fontSize: 10, color: '#555' },
                                { text: '7', alignment: 'right', fontSize: 10, color: '#666', linkToDestination: 'section3_2' }
                            ],
                            margin: [0, 2, 0, 2]
                        },
                        {
                            columns: [
                                { text: '     3.3 Durability Elements', linkToDestination: 'section3_3', fontSize: 10, color: '#555' },
                                { text: '8', alignment: 'right', fontSize: 10, color: '#666', linkToDestination: 'section3_3' }
                            ],
                            margin: [0, 2, 0, 2]
                        },
                        {
                            columns: [
                                { text: '     3.4 Safety Elements', linkToDestination: 'section3_4', fontSize: 10, color: '#555' },
                                { text: '9', alignment: 'right', fontSize: 10, color: '#666', linkToDestination: 'section3_4' }
                            ],
                            margin: [0, 2, 0, 2]
                        },
                        {
                            columns: [
                                { text: '     3.5 Other Bridge Elements', linkToDestination: 'section3_5', fontSize: 10, color: '#555' },
                                { text: '10', alignment: 'right', fontSize: 10, color: '#666', linkToDestination: 'section3_5' }
                            ],
                            margin: [0, 2, 0, 2]
                        },
                        {
                            columns: [
                                { text: '     3.6 Ancillary Elements', linkToDestination: 'section3_6', fontSize: 10, color: '#555' },
                                { text: '11', alignment: 'right', fontSize: 10, color: '#666', linkToDestination: 'section3_6' }
                            ],
                            margin: [0, 2, 0, 8]
                        },
                        
                        // Section 4
                        {
                            columns: [
                                { text: '4. Conclusions and Recommendations', linkToDestination: 'section4', fontSize: 11 },
                                { text: '12', alignment: 'right', fontSize: 11, color: '#666', linkToDestination: 'section4' }
                            ],
                            margin: [0, 5, 0, 2]
                        },
                        {
                            columns: [
                                { text: '     4.1 Conclusions', linkToDestination: 'section4_1', fontSize: 10, color: '#555' },
                                { text: '12', alignment: 'right', fontSize: 10, color: '#666', linkToDestination: 'section4_1' }
                            ],
                            margin: [0, 2, 0, 2]
                        },
                        {
                            columns: [
                                { text: '     4.2 Recommended Remedial Works', linkToDestination: 'section4_2', fontSize: 10, color: '#555' },
                                { text: '12', alignment: 'right', fontSize: 10, color: '#666', linkToDestination: 'section4_2' }
                            ],
                            margin: [0, 2, 0, 2]
                        },
                        {
                            columns: [
                                { text: '     4.3 Next Inspection', linkToDestination: 'section4_3', fontSize: 10, color: '#555' },
                                { text: '13', alignment: 'right', fontSize: 10, color: '#666', linkToDestination: 'section4_3' }
                            ],
                            margin: [0, 2, 0, 15]
                        },
                        
                        // Appendices
                        {
                            columns: [
                                { text: 'Appendix A: Photographs', linkToDestination: 'appendixA', fontSize: 11 },
                                { text: '14', alignment: 'right', fontSize: 11, color: '#666', linkToDestination: 'appendixA' }
                            ],
                            margin: [0, 5, 0, 5]
                        },
                        {
                            columns: [
                                { text: 'Appendix B: BCI Proforma', linkToDestination: 'appendixB', fontSize: 11 },
                                { text: '16', alignment: 'right', fontSize: 11, color: '#666', linkToDestination: 'appendixB' }
                            ],
                            margin: [0, 5, 0, 5]
                        }
                    ]
                },



            // SECTION 1: STRUCTURE DETAILS
            { text: '', pageBreak: 'before' },
            { text: '1. Structure Details', style: 'sectionHeader', margin: [0, 0, 0, 15], id: 'section1' },
            {
                table: {
                    widths: ['30%', '70%'],
                    body: [
                        ['Structure Name:', structureName],
                        ['Structure Number:', structureId],
                        ['Date of Construction:', bridgeData.year_built || 'Unknown'],
                        ['Crosses:', bridgeData.crosses || 'Not specified'],
                        ['Carries:', bridgeData.carries || 'Not specified'],
                        ['Location:', bridgeData.location || 'Not specified']
                    ]
                },
                layout: 'lightHorizontalLines',
                margin: [0, 0, 0, 15]
            },
            // NEW: 1.1 Structure Description
            {
                text: '1.1 Structure Description',
                style: 'subsectionHeader',
                margin: [0, 0, 0, 8]
            },
            {
                text: bridgeData.description || 'No structural description available for this bridge.',
                margin: [15, 0, 0, 15],
                fontSize: 9
            },
            // UPDATED: 1.2 Coordinates (was 1.1)
            {
                text: '1.2 Coordinates',
                style: 'subsectionHeader',
                margin: [0, 0, 0, 8]
            },
            {
                table: {
                    widths: ['20%', '30%', '20%', '30%'],
                    body: [
                        ['Easting:', bridgeData.easting || bridgeData.ose || 'N/A', 'Northing:', bridgeData.northing || bridgeData.osn || 'N/A'],
                        ['Latitude:', (parseFloat(bridgeData.latitude) || 0).toFixed(6) || 'N/A', 'Longitude:', (parseFloat(bridgeData.longitude) || 0).toFixed(6) || 'N/A']
                    ]
                },
                layout: 'noBorders',
                margin: [0, 0, 0, 15]
            },
                ...(mapDataURL ? [
                    { text: '1.3 Location Map', style: 'subsectionHeader', margin: [0, 10, 0, 10], id: 'section1_3' },  // Fixed id
                    { image: mapDataURL, width: mapWidth, alignment: 'center', margin: [0, 0, 0, 15] }
                ] : []),
                                
                








            // SECTION 2: INSPECTION DETAILS (with per-span BCI scores)
            { text: '', pageBreak: 'before' },
            { text: '2. Inspection Details', style: 'sectionHeader', margin: [0, 0, 0, 15], id: 'section2' },
            {
                table: {
                    widths: ['30%', '70%'],
                    body: [
                        ['Inspector Name:', inspectionData.inspectorName || 'Not recorded'],
                        ['Inspection Type:', inspectionData.inspectionType || 'N/A'],
                        ['Inspection Date:', inspectionData.inspectionDate ? formatDate(inspectionData.inspectionDate) : 'N/A'],
                        ['Total Spans:', inspectionData.totalSpans || 'N/A']
                    ]
                },
                layout: 'lightHorizontalLines'
            },

            ...(inspectionData.spans?.length > 0 ? [{
                text: '2.1 Span Details & BCI Scores',
                style: 'subsectionHeader',
                margin: [0, 15, 0, 10]
            }] : []),

            ...(inspectionData.spans ? inspectionData.spans.map(span => {
                // Calculate span BCI if not provided
                const spanDefects = defectsData.filter(d => d.spanNumber === span.spanNumber);
                const spanScores = spanDefects.map(d => d.severity || 0);
                
                let spanBciAv = span.bciAv ? parseFloat(span.bciAv) : null;
                let spanBciCrit = span.bciCrit ? parseFloat(span.bciCrit) : null;
                
                if (spanBciAv === null && spanScores.length > 0) {
                    const avgScore = spanScores.reduce((a, b) => a + b, 0) / spanScores.length;
                    spanBciAv = Math.max(0, Math.min(100, 100 - (avgScore * 8)));
                    spanBciCrit = Math.max(0, Math.min(100, 100 - (Math.max(...spanScores) * 12)));
                    spanBciAv = Math.round(spanBciAv);
                    spanBciCrit = Math.round(spanBciCrit);
                } else if (spanBciAv === null) {
                    spanBciAv = 100;
                    spanBciCrit = 100;
                }
                
                const getSpanBCIColor = (score) => {
                    if (score >= 90) return '#22c55e';
                    if (score >= 80) return '#8ab4b0';
                    if (score >= 65) return '#eab308';
                    if (score >= 40) return '#f97316';
                    return '#dc2626';
                };
                
                return {
                    stack: [
                        { text: `Span ${span.spanNumber}`, bold: true, fontSize: 12, margin: [0, 5, 0, 10], color: '#2c3e44' },
                        {
                            columns: [
                                {
                                    width: '*',
                                    stack: [
                                        { text: [
                                            { text: 'BCI', bold: true, fontSize: 8, color: '#888' },
                                            { text: 'avg', bold: true, fontSize: 6, color: '#888', sub: {} }
                                        ], alignment: 'center' },
                                        { text: spanBciAv.toString(), fontSize: 28, bold: true, color: getSpanBCIColor(spanBciAv), alignment: 'center' }
                                    ]
                                },
                                {
                                    width: '*',
                                    stack: [
                                        { text: [
                                            { text: 'BCI', bold: true, fontSize: 8, color: '#888' },
                                            { text: 'crit', bold: true, fontSize: 6, color: '#888', sub: {} }
                                        ], alignment: 'center' },
                                        { text: spanBciCrit.toString(), fontSize: 28, bold: true, color: '#dc2626', alignment: 'center' }
                                    ]
                                },
                                {
                                    width: '*',
                                    stack: [
                                        { text: 'Defects', bold: true, fontSize: 8, color: '#888', alignment: 'center' },
                                        { text: spanDefects.length.toString(), fontSize: 28, bold: true, color: '#5b8c8a', alignment: 'center' }
                                    ]
                                }
                            ],
                            margin: [0, 0, 0, 8]
                        },
                        ...(span.comments ? [{
                            text: 'Comments:', bold: true, fontSize: 8, color: '#888', margin: [0, 8, 0, 2]
                        }, {
                            text: span.comments, fontSize: 9, italics: true, margin: [10, 0, 0, 8], color: '#4a5b6e'
                        }] : []),
                        { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 0.5, lineColor: '#ddd' }], margin: [0, 5, 0, 5] }
                    ]
                }
            }) : []),


                
                // SECTION 3: DESCRIPTION OF DEFECTS
                { text: '', pageBreak: 'before' },
                { text: '3. Description of Defects', style: 'sectionHeader', margin: [0, 0, 0, 15], id: 'section4' },
                ...buildSection4Content(),
                
                // SECTION 4: CONCLUSIONS AND RECOMMENDATIONS
                { text: '', pageBreak: 'before' },
                { text: '4. Conclusions and Recommendations', style: 'sectionHeader', margin: [0, 0, 0, 15], id: 'section5' },
                {
                    text: '4.1 Conclusions',
                    style: 'subsectionHeader',
                    margin: [0, 0, 0, 10],
                    id: 'section5_1'
                },
                {
                    text: inspectionData.conclusions?.trim() || 'No conclusions provided for this inspection.',
                    margin: [15, 0, 0, 15]
                },
                
                // 4.2 Remedial works
                {
                    text: '4.2 Recommended Remedial Works',
                    style: 'subsectionHeader',
                    margin: [0, 0, 0, 10],
                    id: 'section5_2'
                },
                ...(() => {
                    const defectsWithRemedial = defectsData.filter(d => {
                        const remedial = d.remedialWorks || d.remedial_works;
                        return remedial && remedial.trim().length > 0 && remedial !== 'Add';
                    });
                    
                    if (defectsWithRemedial.length === 0) {
                        return [{
                            text: 'No specific remedial works recorded for this inspection.',
                            italics: true,
                            color: '#888',
                            margin: [15, 5, 0, 15]
                        }];
                    }
                    
                    const highPriority = defectsWithRemedial.filter(d => d.priority === 'H');
                    const mediumPriority = defectsWithRemedial.filter(d => d.priority === 'M');
                    const lowPriority = defectsWithRemedial.filter(d => d.priority === 'L');
                    
                    const sections = [];
                    
                    if (highPriority.length > 0) {
                        sections.push(
                            { text: '🔴 HIGH PRIORITY', bold: true, fontSize: 10, color: '#dc2626', margin: [0, 10, 0, 8] },
                            {
                                table: {
                                    widths: ['15%', '35%', '50%'],
                                    body: [
                                        [
                                            { text: 'Location', bold: true, fillColor: '#fef2f2' },
                                            { text: 'Element', bold: true, fillColor: '#fef2f2' },
                                            { text: 'Remedial Works', bold: true, fillColor: '#fef2f2' }
                                        ],
                                        ...highPriority.map(d => [
                                            `Span ${d.spanNumber}`,
                                            getElementDesc(d),
                                            (d.remedialWorks || d.remedial_works)
                                        ])
                                    ]
                                },
                                layout: 'lightHorizontalLines',
                                margin: [0, 0, 0, 15]
                            }
                        );
                    }
                    
                    if (mediumPriority.length > 0) {
                        sections.push(
                            { text: '🟠 MEDIUM PRIORITY', bold: true, fontSize: 10, color: '#f97316', margin: [0, 10, 0, 8] },
                            {
                                table: {
                                    widths: ['15%', '35%', '50%'],
                                    body: [
                                        [
                                            { text: 'Location', bold: true, fillColor: '#fff7ed' },
                                            { text: 'Element', bold: true, fillColor: '#fff7ed' },
                                            { text: 'Remedial Works', bold: true, fillColor: '#fff7ed' }
                                        ],
                                        ...mediumPriority.map(d => [
                                            `Span ${d.spanNumber}`,
                                            getElementDesc(d),
                                            (d.remedialWorks || d.remedial_works)
                                        ])
                                    ]
                                },
                                layout: 'lightHorizontalLines',
                                margin: [0, 0, 0, 15]
                            }
                        );
                    }
                    
                    if (lowPriority.length > 0) {
                        sections.push(
                            { text: '🟢 LOW PRIORITY', bold: true, fontSize: 10, color: '#22c55e', margin: [0, 10, 0, 8] },
                            {
                                table: {
                                    widths: ['15%', '35%', '50%'],
                                    body: [
                                        [
                                            { text: 'Location', bold: true, fillColor: '#f0fdf4' },
                                            { text: 'Element', bold: true, fillColor: '#f0fdf4' },
                                            { text: 'Remedial Works', bold: true, fillColor: '#f0fdf4' }
                                        ],
                                        ...lowPriority.map(d => [
                                            `Span ${d.spanNumber}`,
                                            getElementDesc(d),
                                            (d.remedialWorks || d.remedial_works)
                                        ])
                                    ]
                                },
                                layout: 'lightHorizontalLines',
                                margin: [0, 0, 0, 15]
                            }
                        );
                    }
                    
                    return sections;
                })(),
                
                {
                    text: '4.3 Next Inspection',
                    style: 'subsectionHeader',
                    margin: [0, 0, 0, 10],
                    id: 'section5_3'
                },
                {
                    text: (() => {
                        const highSeverity = severityCounts[5] + severityCounts[4];
                        let scheduleLine;
                        if (nextDueData && nextDueData.date) {
                            const formatted = new Date(nextDueData.date).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
                            scheduleLine = `The next inspection (${nextDueData.type}) is scheduled for ${formatted}, in line with this structure's inspection cycle.`;
                        } else {
                            scheduleLine = 'The next inspection date could not be determined from this structure\'s inspection history.';
                        }
                        if (highSeverity > 0) return scheduleLine + '\n\nNote: Interim safety inspections should be conducted monthly due to identified severe/critical defects.';
                        return scheduleLine;
                    })(),
                    color: (severityCounts[5] + severityCounts[4]) > 0 ? '#dc2626' : '#2c3e44',
                    margin: [15, 0, 0, 15]
                },
                
                
                // APPENDIX A: PHOTOGRAPHS
                { text: '', pageBreak: 'before' },
                { text: 'Appendix A: Photographs', style: 'sectionHeader', alignment: 'center', margin: [0, 40, 0, 10], id: 'appendixA' },
                {
                    text: 'The following pages contain photographic documentation of identified defects.',
                    alignment: 'center',
                    fontSize: 9,
                    color: '#888',
                    margin: [0, 0, 0, 20]
                },
                { text: '', pageBreak: 'after' },

                ...(() => {
                    if (photosWithDataURLs.length === 0) {
                        return [{
                            text: 'No photographs available for this inspection.',
                            italics: true,
                            color: '#888',
                            alignment: 'center'
                        }];
                    }
                    
                    const photoContent = [];
                    for (let i = 0; i < photosWithDataURLs.length; i++) {
                        const photo = photosWithDataURLs[i];
                        
                        // Add a tiny invisible anchor (1pt height)
                        photoContent.push({
                            text: ' ',
                            id: `photo-${photo.photoNumber}`,
                            margin: [0, 0, 0, 0],
                            fontSize: 1
                        });
                        
                        if (photo.photo_dataURL) {
                            photoContent.push({
                                image: photo.photo_dataURL,
                                width: 450,
                                alignment: 'center',
                                margin: [0, 0, 0, 15]
                            });
                        } else {
                            photoContent.push({
                                text: '[Image not available]',
                                alignment: 'center',
                                italics: true,
                                color: '#888',
                                margin: [0, 0, 0, 20]
                            });
                        }

                        // Updated caption: 'Photo X: [comment]'
                        photoContent.push({
                            text: `Photo ${photo.photoNumber}: ${photo.photo_description ? `${photo.photo_description}` : ''}`,
                            style: 'photoCaption',
                            alignment: 'center',
                            margin: [0, 5, 0, 10]
                        });
                        
                        if ((i + 1) % 2 === 0 && i < photosWithDataURLs.length - 1) {
                            photoContent.push({ text: '', pageBreak: 'after' });
                        }
                    }
                    return photoContent;
                })(),
                

// APPENDIX B: BCI PROFORMA - Generated with jsPDF
{ text: '', pageBreak: 'before' },
{ text: 'Appendix B: BCI Proforma', style: 'sectionHeader', alignment: 'center', margin: [0, 40, 0, 10], id: 'appendixB' },
{
    text: 'Bridge Condition Index (BCI) Assessment Form',
    fontSize: 9,
    alignment: 'center',
    margin: [0, 0, 0, 20],
    italics: true,
    color: '#888'
},
{
    alignment: 'center',
    margin: [0, 10, 0, 20],
    stack: [
        {
            text: 'Generate BCI Proforma',
            alignment: 'center',
            color: 'white',
            fillColor: '#1a3a5c',
            margin: [0, 0, 0, 0],
            fontSize: 11,
            bold: true,
            decoration: 'underline',
            link: '#',
            onclick: 'generateBCIProformaSeparately()'
        }
    ]
},
                { text: '', pageBreak: 'after' },

                // Dynamic BCI Proforma content
                ...buildBCIProformaContent(bciFormData),   // Page 1: main pro-forma table
                ...buildBCIPage2Content(bciFormData),       // Page 2: multiple defects + work required
                            ],
                            
                            styles: {                
                                sectionHeader: {
                                    fontSize: 14,
                                    bold: true,
                                    color: '#2c3e44'
                                },
                                tocTitle: {
                                    fontSize: 18,
                                    bold: true,
                                    color: '#2c3e44'
                                },
                                subsectionHeader: {
                                    fontSize: 12,
                                    bold: true,
                                    color: '#5b8c8a'
                                },
                                photoCaption: {
                                    fontSize: 10,
                                    bold: true,
                                    color: '#2c3e44'
                                },
                                tocItem: {
                                    fontSize: 11,
                                    bold: true,
                                    margin: [0, 5, 0, 2],
                                    color: '#2c3e44'
                                },
                                tocSubItem: {
                                    fontSize: 10,
                                    margin: [15, 2, 0, 2],
                                    color: '#555'
                                }
                            },
                            
                            defaultStyle: {
                                fontSize: 9,
                                color: '#2c3e44'
                            }
                        };
                        
                        // At the very end, replace the download call with:
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


// buildBCIProformaContent used to be duplicated here - a stale snapshot
// that, because this file loads after bciProforma.pdfmake.js on map.html,
// was silently shadowing (and overriding) the real, maintained version and
// every fix made to it. Removed; the live implementation is in
// map/bciProforma.pdfmake.js, which already defines it globally.

// Standalone BCI Proforma generator using jsPDF
async function generateBCIProformaSeparately() {
    try {
        const structureId = sessionStorage.getItem('structureId');
        const structureName = sessionStorage.getItem('structureName');
        const inspectionDate = doc?.date || new Date().toISOString().split('T')[0];
        
        if (!structureId || !structureName) {
            showToast('Missing structure information', 'error');
            return;
        }

        showToast('Generating BCI Proforma...', 'info');
        
        // Create a temporary doc object
        const tempDoc = {
            structure_id: structureId,
            structure_name: structureName,
            date: inspectionDate
        };
        
        // Get the BCI form data
        const bciFormData = await generateBCIFormForPDF(tempDoc);
        
        // Generate using jsPDF
        const { jsPDF } = window.jspdf;
        const pdfDoc = new jsPDF({
            orientation: "portrait",
            unit: "mm",
            format: "a4"
        });
        
        // Save the PDF
        pdfDoc.save(`${structureName.replace(/[^a-z0-9]/gi, '_')}_BCI_Proforma_${inspectionDate}.pdf`);
        showToast('BCI Proforma generated successfully!', 'success');
        
    } catch (error) {
        console.error('BCI Proforma generation failed:', error);
        showToast(`Error: ${error.message}`, 'error');
    }
}


// Make BCI functions available globally
window.generateBCIProformaSeparately = generateBCIProformaSeparately;