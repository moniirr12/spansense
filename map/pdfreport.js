// Wait for the jsPDF library to be fully loaded before using it
document.addEventListener('DOMContentLoaded', function() {
    // Get the jsPDF constructor from the global scope
    const { jsPDF } = window.jspdf;
    
    // Set default font settings for the entire report
    const DEFAULT_FONT = 'helvetica';
    const DEFAULT_FONT_SIZE = 10;
    const TITLE_FONT_SIZE = 14;
    const SUBTITLE_FONT_SIZE = 12;
    const HEADING_FONT_SIZE = 11;
    
    // A4 page dimensions (mm)
    const PAGE_HEIGHT = 297;
    const PAGE_WIDTH = 210;
    const MARGIN_TOP = 20;
    const MARGIN_BOTTOM = 20;
    const CONTENT_BOTTOM = PAGE_HEIGHT - MARGIN_BOTTOM;

    // Helper: check if we need a new page
    function checkPageBreak(pdfDoc, currentY, requiredSpace = 10) {
        if (currentY + requiredSpace > CONTENT_BOTTOM) {
            pdfDoc.addPage();
            return MARGIN_TOP;
        }
        return currentY;
    }

    // Helper: Get the current page number (1-indexed)
    function getCurrentPage(pdfDoc) {
        return pdfDoc.internal.getCurrentPageInfo().pageNumber;
    }

    // Function to generate a PDF report for a bridge structure using jsPDF
    async function generatePDFReport(doc) {
        try {
            const structureId = sessionStorage.getItem('structureId');
            const structureName = sessionStorage.getItem('structureName');
            const inspectionDate = doc.date;
            
            console.log('=== PDF GENERATION START ===');
            console.log('Structure:', structureName, 'ID:', structureId, 'Date:', inspectionDate);
            
            if (!structureId || !structureName || !doc.date) {
                throw new Error('Missing structure information or inspection date');
            }

            const pdfDoc = new jsPDF({
                orientation: "portrait",
                unit: "mm",
                format: "a4"
            });

            pdfDoc.setFont(DEFAULT_FONT);
            pdfDoc.setFontSize(DEFAULT_FONT_SIZE);

            // Fetch all data
            const [bridgePhoto, bridgeData, fullInspectionData, photosResponse, bciFormData] = await Promise.all([
                fetch(`http://localhost:3000/getBridgePhoto?bridgeId=${structureId}`)
                    .then(res => res.json()).catch(() => ({ photo_url: '' })),
                fetch(`http://localhost:3000/api/bridges/${structureId}`)
                    .then(res => res.json()).catch(() => ({})),
                fetch(`http://localhost:3000/api/inspection/full?structure_id=${structureId}&date=${inspectionDate}`)
                    .then(res => res.ok ? res.json() : null).catch(() => null),
                fetch(`http://localhost:3000/api/bridges/${structureId}/inspection-photos?inspectionDate=${encodeURIComponent(inspectionDate)}`)
                    .then(res => res.ok ? res.json() : { success: false, photos: [] }).catch(() => ({ success: false, photos: [] })),
                generateBCIFormForPDF(doc)
            ]);

            const inspectionData = fullInspectionData || {};
            const defectsData = fullInspectionData?.defects || [];
            const allPhotos = photosResponse.success ? photosResponse.photos : [];
            
            // Build photosByDefect - extract defect code from front_defectid
            const photosByDefect = {};
            
            console.log('Processing photos:', allPhotos.length);
            
            let globalPhotoCounter = 0;

            allPhotos.forEach(photo => {
                globalPhotoCounter++;
                const photoNumber = globalPhotoCounter;
                
                const frontDefectId = photo.front_defectid || photo.front_defectid;
                
                if (frontDefectId) {
                    const parts = frontDefectId.split('_');
                    const defectCode = parts[parts.length - 1];
                    
                    if (!photosByDefect[defectCode]) {
                        photosByDefect[defectCode] = [];
                    }
                    
                    photosByDefect[defectCode].push({
                        photo_url: photo.photo_url,
                        photo_description: photo.photo_description,
                        defect_code: defectCode,
                        photoNumber: photoNumber  // ← ADD THIS
                    });
                }
            });

            console.log('Photos by defect:', Object.keys(photosByDefect));

            const pageNumbers = {};
            const photoPageNumbers = {};

            // Page 1: Cover Page
            addCoverPage(pdfDoc, structureName, structureId, inspectionDate, bridgePhoto);
            pageNumbers.cover = 1;
            
            // Page 2: Table of Contents placeholder
            pdfDoc.addPage();
            pageNumbers.toc = 2;
            
            let currentPage = 2;
            
            // SECTION 2: Structure Details
            pageNumbers.structure = currentPage + 1;
            await addStructureDetailsWithMap(pdfDoc, structureName, structureId, bridgeData);
            currentPage = getCurrentPage(pdfDoc);
            
            // SECTION 3: Inspection Details
            pageNumbers.inspection = currentPage + 1;
            addInspectionDetails(pdfDoc, inspectionData);
            currentPage = getCurrentPage(pdfDoc);
            
            // SECTION 4: Defects Summary - Pass photosByDefect
            pageNumbers.defects = currentPage + 1;
            addDefectsSummary(pdfDoc, defectsData, inspectionData.spans, photosByDefect);
            currentPage = getCurrentPage(pdfDoc);
            
            // SECTION 5: Conclusions
            pageNumbers.conclusions = currentPage + 1;
            addConclusionsAndRecommendations(pdfDoc, defectsData, inspectionData);
            currentPage = getCurrentPage(pdfDoc);
            
            // Appendix A: BCI Form
            pageNumbers.bci = currentPage + 1;
            await addBCIForm(pdfDoc, bciFormData);
            currentPage = getCurrentPage(pdfDoc);
            
            // Appendix B: Photographs
            pageNumbers.photos = currentPage + 1;
            await addPhotographs(pdfDoc, photosByDefect);
            currentPage = getCurrentPage(pdfDoc);

            console.log('Final page numbers:', pageNumbers);

            // Add Table of Contents
            pdfDoc.setPage(pageNumbers.toc);
            addTableOfContentsWithLinks(pdfDoc, pageNumbers);

            const filename = `${structureName.replace(/[^a-z0-9]/gi, '_')}_Inspection_Report.pdf`;
            pdfDoc.save(filename);
            console.log('=== PDF GENERATION COMPLETE ===');

        } catch (error) {
            console.error('PDF generation failed:', error);
            alert(`Error: ${error.message}`);
        }
    }

    function addTableOfContentsWithLinks(pdfDoc, pageNumbers) {
        pdfDoc.setFont(DEFAULT_FONT);
        pdfDoc.setFontSize(12);
        pdfDoc.setFont('helvetica', 'bold');
        pdfDoc.text('Table of Contents', 105, 30, { align: 'center' });
        
        pdfDoc.setFontSize(DEFAULT_FONT_SIZE);
        pdfDoc.setFont('helvetica', 'normal');
        
        const sections = [
            { title: "2. Structure Details", page: pageNumbers.structure },
            { title: "3. Inspection Details", page: pageNumbers.inspection },
            { title: "4. Defects Descriptions", page: pageNumbers.defects },
            { title: "5. Conclusions and Recommendations", page: pageNumbers.conclusions },
            { title: "Appendix A: BCI Proforma", page: pageNumbers.bci },
            { title: "Appendix B: Photographs", page: pageNumbers.photos }
        ];
        
        let y = 50;
        sections.forEach(section => {
            if (section.page && section.page > 0) {
                pdfDoc.setTextColor(0, 102, 204);
                pdfDoc.textWithLink(section.title, 30, y, { pageNumber: section.page });
                pdfDoc.setTextColor(0, 0, 0);
                pdfDoc.text(`${section.page}`, 180, y);
            } else {
                pdfDoc.setTextColor(150, 150, 150);
                pdfDoc.text(section.title, 30, y);
                pdfDoc.text('--', 180, y);
            }
            y += 10;
        });
        
        pdfDoc.setTextColor(0, 0, 0);
    }

    // UPDATED addDefectsSummary with photo linking
    function addDefectsSummary(pdfDoc, defectsData, spansData, photosByDefect) {
        // Start fresh on new page
        pdfDoc.addPage();
        
        pdfDoc.setFont(DEFAULT_FONT);
        pdfDoc.setFontSize(TITLE_FONT_SIZE);
        pdfDoc.setFont('helvetica', 'bold');
        pdfDoc.text('4 Description of Defects', 20, 30);
        pdfDoc.setFont(DEFAULT_FONT);
        pdfDoc.setFontSize(DEFAULT_FONT_SIZE);
        pdfDoc.setFont('helvetica', 'normal');
        
        const allElementsList = [
            { category: "Deck Elements", mainNumber: "4.1", subNumber: "4.1.1", name: "Primary deck element (Table G.4)", elementNo: 1 },
            { category: "Deck Elements", mainNumber: "4.1", subNumber: "4.1.2", name: "Secondary deck elements - Transverse beams", elementNo: 2 },
            { category: "Deck Elements", mainNumber: "4.1", subNumber: "4.1.3", name: "Elements from table G.5", elementNo: 3 },
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
        ];
        
        // Helper function to get photo numbers for a defect
        function getPhotoNumbersForDefect(defectCode) {
            if (!photosByDefect) return [];
            const photos = photosByDefect[defectCode];
            if (!photos || photos.length === 0) return [];
            const numbers = photos.map(p => p.photoNumber).filter(n => n !== undefined);
            return numbers.sort((a, b) => a - b);
        }
        
        // Helper function to get photo count for a defect
        function getPhotoCountForDefect(defectCode) {
            if (!photosByDefect) return 0;
            const photos = photosByDefect[defectCode];
            return photos ? photos.length : 0;
        }
        
        const getDefectsForElement = (elementNo, spanNumber) => {
            return defectsData.filter(d => d.elementNumber === elementNo && d.spanNumber === spanNumber);
        };
        
        let spanNumbers = [];
        if (spansData && spansData.length > 0) {
            spanNumbers = spansData.map(s => s.spanNumber).sort((a, b) => a - b);
        }
        
        if (spanNumbers.length === 0) spanNumbers = [1];
        
        let y = 45;
        let totalDefectsFound = 0;
        
        for (const spanNum of spanNumbers) {
            y = checkPageBreak(pdfDoc, y, 15);
            
            pdfDoc.setFont(DEFAULT_FONT);
            pdfDoc.setFontSize(SUBTITLE_FONT_SIZE);
            pdfDoc.setFont('helvetica', 'bold');
            pdfDoc.text(`Span ${spanNum}`, 20, y);
            y += 10;
            
            let currentMainNumber = '';
            
            for (const element of allElementsList) {
                if (element.mainNumber !== currentMainNumber) {
                    currentMainNumber = element.mainNumber;
                    
                    y = checkPageBreak(pdfDoc, y, 15);
                    
                    pdfDoc.setFont(DEFAULT_FONT);
                    pdfDoc.setFontSize(HEADING_FONT_SIZE);
                    pdfDoc.setFont('helvetica', 'bold');
                    pdfDoc.text(`${element.mainNumber} ${element.category}`, 25, y);
                    y += 8;
                }
                
                const elementDefects = getDefectsForElement(element.elementNo, spanNum);
                const hasDefects = elementDefects.length > 0;
                if (hasDefects) totalDefectsFound += elementDefects.length;
                
                y = checkPageBreak(pdfDoc, y, 15);
                
                pdfDoc.setFont(DEFAULT_FONT);
                pdfDoc.setFontSize(HEADING_FONT_SIZE);
                pdfDoc.setFont('helvetica', 'bold');
                pdfDoc.text(`${element.subNumber} ${element.name}`, 30, y);
                y += 6;
                
                if (hasDefects) {
                    elementDefects.forEach((defect, idx) => {
                        y = checkPageBreak(pdfDoc, y, 15);
                        
                        pdfDoc.setFont(DEFAULT_FONT);
                        pdfDoc.setFontSize(DEFAULT_FONT_SIZE);
                        pdfDoc.setFont('helvetica', 'normal');
                        
                        // Get photo numbers for this defect
                        const defectId = defect.defectId || `${defect.defect_type}.${defect.defect_number}`;
                        const photoNumbers = getPhotoNumbersForDefect(defectId);
                        const photoCount = photoNumbers.length;
                        
                        let photoText = '';
                        if (photoCount === 1) {
                            photoText = ` (Photo ${photoNumbers[0]})`;
                        } else if (photoCount > 1) {
                            photoText = ` (Photos ${photoNumbers.join(', ')})`;
                        }
                        
                        // Format the defect line
                        let defectLine = `${defect.defectId || 'Unknown'}. Severity: ${defect.severity || '?'}. Extent: ${defect.extent || '?'}`;
                        pdfDoc.text(defectLine, 35, y);
                        y += 5;
                        
                        // Handle comments
                        if (defect.comments && defect.comments !== 'Add' && defect.comments.trim() !== '') {
                            const commentText = `${defect.comments}${photoText}`;
                            const wrapped = pdfDoc.splitTextToSize(commentText, 140);
                            y = checkPageBreak(pdfDoc, y, wrapped.length * 4 + 2);
                            pdfDoc.text(wrapped, 35, y);
                            y += (wrapped.length * 4);
                        } else if (photoCount > 0) {
                            // If no comment but has photos, just show the photo reference
                            y = checkPageBreak(pdfDoc, y, 8);
                            pdfDoc.text(photoText.trim(), 35, y);
                            y += 5;
                        }
                        
                        if (idx < elementDefects.length - 1) y += 3;
                    });
                } else {
                    pdfDoc.setFont(DEFAULT_FONT);
                    pdfDoc.setFontSize(DEFAULT_FONT_SIZE);
                    pdfDoc.setFont('helvetica', 'italic');
                    pdfDoc.text('  No defects recorded', 35, y);
                    y += 4;
                }
                y += 6;
            }
            y += 10;
        }
        console.log(`Total defects rendered: ${totalDefectsFound}`);
    }

    async function addStructureDetailsWithMap(pdfDoc, structureName, structureId, bridgeData) {
        // Reset font to default for this section
        pdfDoc.setFont(DEFAULT_FONT);
        pdfDoc.setFontSize(DEFAULT_FONT_SIZE);
        
        pdfDoc.setFont(DEFAULT_FONT);
        pdfDoc.setFontSize(TITLE_FONT_SIZE);
        pdfDoc.setFont('helvetica', 'bold');
        pdfDoc.text('2 Details of Structure', 20, 30);

        pdfDoc.setFont(DEFAULT_FONT);
        pdfDoc.setFontSize(SUBTITLE_FONT_SIZE);
        pdfDoc.setFont('helvetica', 'bold');
        pdfDoc.text('2.1 General Details', 20, 40);

        pdfDoc.setFont(DEFAULT_FONT);
        pdfDoc.setFontSize(DEFAULT_FONT_SIZE);
        pdfDoc.setFont('helvetica', 'normal');

        // Structure details
        const structureDetails = [
            ['Structure Name:', structureName],
            ['Structure Number:', structureId],
            ['Date of Construction:', bridgeData.year_built || 'Unknown'],
            ['Crosses:', bridgeData.crosses || 'Not specified'],
            ['Carries:', bridgeData.carries || 'Not specified']
        ];

        let y = 50;
        structureDetails.forEach(row => {
            pdfDoc.text(row[0], 25, y);
            pdfDoc.text(row[1], 70, y);
            y += 8;
        });

        // Location
        pdfDoc.setFont(DEFAULT_FONT);
        pdfDoc.setFontSize(SUBTITLE_FONT_SIZE);
        pdfDoc.setFont('helvetica', 'bold');
        pdfDoc.text('2.2 Location', 20, y + 10);
        
        pdfDoc.setFont(DEFAULT_FONT);
        pdfDoc.setFontSize(DEFAULT_FONT_SIZE);
        pdfDoc.setFont('helvetica', 'normal');
        pdfDoc.text(
            `The structure provides vehicular access across ${bridgeData.crosses || 'a watercourse'} in ${bridgeData.location || 'the specified location'}.`,
            25,
            y + 20,
            { maxWidth: 160 }
        );

        // Grid reference
        pdfDoc.text('Grid Reference:', 20, y + 35);
        pdfDoc.text(bridgeData.grid_reference || 'Not available', 25, y + 45);

        // Coordinates
        const coordinates = [
            ['Easting:', bridgeData.easting || 'N/A', 'Northing:', bridgeData.northing || 'N/A'],
            ['Latitude:', bridgeData.latitude ? bridgeData.latitude.toFixed(6) : 'N/A',
            'Longitude:', bridgeData.longitude ? bridgeData.longitude.toFixed(6) : 'N/A']
        ];

        y += 55;
        coordinates.forEach(row => {
            pdfDoc.text(row[0], 25, y);
            pdfDoc.text(row[1], 45, y);
            pdfDoc.text(row[2], 100, y);
            pdfDoc.text(row[3], 120, y);
            y += 8;
        });

        if (y > 150) {
            pdfDoc.addPage();
            y = 20;
        }

        // ---------- HIDDEN MAP SECTION (Screenshot approach) ----------
        async function captureHiddenMap(lat, lng, locationName) {
            // Create hidden container if it doesn't exist
            let hiddenContainer = document.getElementById('hiddenMapContainer');
            if (!hiddenContainer) {
                hiddenContainer = document.createElement('div');
                hiddenContainer.id = 'hiddenMapContainer';
                hiddenContainer.style.position = 'absolute';
                hiddenContainer.style.left = '-9999px';
                hiddenContainer.style.width = '640px';
                hiddenContainer.style.height = '400px';
                document.body.appendChild(hiddenContainer);
            }
            
            // Clear previous map
            hiddenContainer.innerHTML = '<div id="tempMap" style="width: 640px; height: 400px;"></div>';
            
            // Create map
            const map = L.map('tempMap').setView([lat, lng], 15);
            
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '&copy; OpenStreetMap contributors'
            }).addTo(map);
            
            L.marker([lat, lng]).addTo(map).bindPopup(`<b>${locationName}</b>`);
            
            // Wait for tiles to load
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // Capture the map
            const mapElement = document.getElementById('tempMap');
            const canvas = await html2canvas(mapElement, {
                scale: 2,
                backgroundColor: '#ffffff',
                useCORS: true,
                logging: false
            });
            
            // Clean up
            map.remove();
            hiddenContainer.innerHTML = '';
            
            return canvas.toDataURL('image/png');
        }

        if (bridgeData.latitude && bridgeData.longitude) {
            const lat = bridgeData.latitude;
            const lng = bridgeData.longitude;

            y += 15;
            pdfDoc.setFont(DEFAULT_FONT);
            pdfDoc.setFontSize(SUBTITLE_FONT_SIZE);
            pdfDoc.setFont('helvetica', 'bold');
            pdfDoc.text('2.3 Location Diagram', 20, y);
            y += 10;

            const diagramX = 25;
            const diagramY = y;
            const diagramWidth = 160;
            const diagramHeight = 90;

            let mapLoaded = false;

            try {
                // Capture hidden map
                console.log('Capturing hidden map for:', lat, lng);
                const mapImageData = await captureHiddenMap(lat, lng, structureName);
                
                pdfDoc.addImage(mapImageData, 'PNG', diagramX, diagramY, diagramWidth, diagramHeight);
                mapLoaded = true;
                console.log('Hidden map captured successfully');

            } catch (err) {
                console.warn('Hidden map failed to capture:', err.message);
                mapLoaded = false;
                
                // FALLBACK: Draw a simple professional diagram
                pdfDoc.setDrawColor(200, 200, 200);
                pdfDoc.setFillColor(248, 248, 248);
                pdfDoc.rect(diagramX, diagramY, diagramWidth, diagramHeight, 'FD');

                // Draw simple grid
                pdfDoc.setDrawColor(220, 220, 220);
                pdfDoc.setLineWidth(0.3);
                pdfDoc.line(diagramX + 20, diagramY + 15, diagramX + diagramWidth - 20, diagramY + 15);
                pdfDoc.line(diagramX + 20, diagramY + diagramHeight - 15, diagramX + diagramWidth - 20, diagramY + diagramHeight - 15);
                pdfDoc.line(diagramX + 15, diagramY + 20, diagramX + 15, diagramY + diagramHeight - 20);
                pdfDoc.line(diagramX + diagramWidth - 15, diagramY + 20, diagramX + diagramWidth - 15, diagramY + diagramHeight - 20);

                // Draw road/river crossing
                pdfDoc.setDrawColor(100, 100, 100);
                pdfDoc.setLineWidth(1);
                pdfDoc.line(diagramX + 15, diagramY + diagramHeight - 25, diagramX + diagramWidth - 15, diagramY + diagramHeight - 25);
                pdfDoc.line(diagramX + diagramWidth / 2, diagramY + 15, diagramX + diagramWidth / 2, diagramY + diagramHeight - 15);

                // Draw structure (dashed line)
                pdfDoc.setDrawColor(220, 53, 69);
                pdfDoc.setLineWidth(1.5);
                pdfDoc.setLineDashPattern([3, 3], 0);
                pdfDoc.line(diagramX + diagramWidth / 2 - 20, diagramY + diagramHeight - 25, diagramX + diagramWidth / 2 + 20, diagramY + diagramHeight - 25);
                pdfDoc.setLineDashPattern([], 0);

                // Location marker
                pdfDoc.setDrawColor(220, 53, 69);
                pdfDoc.setFillColor(220, 53, 69);
                pdfDoc.circle(diagramX + diagramWidth / 2, diagramY + diagramHeight / 2 - 5, 5, 'FD');
                pdfDoc.setFillColor(255, 255, 255);
                pdfDoc.circle(diagramX + diagramWidth / 2, diagramY + diagramHeight / 2 - 5, 2, 'F');

                // Labels
                pdfDoc.setFontSize(7);
                pdfDoc.setTextColor(100, 100, 100);
                pdfDoc.text('Road/River', diagramX + diagramWidth - 35, diagramY + diagramHeight - 20);
                pdfDoc.text('Structure', diagramX + diagramWidth / 2 - 12, diagramY + diagramHeight / 2 - 15);
                pdfDoc.text(`${lat.toFixed(4)}°, ${lng.toFixed(4)}°`, diagramX + diagramWidth / 2 - 22, diagramY + diagramHeight / 2 + 8);
                pdfDoc.setTextColor(0, 0, 0);

                // North Compass
                const compassX = diagramX + diagramWidth - 18;
                const compassY = diagramY + 18;
                pdfDoc.setFillColor(255, 255, 255);
                pdfDoc.setDrawColor(100, 100, 100);
                pdfDoc.circle(compassX, compassY, 8, 'FD');
                pdfDoc.setFillColor(220, 53, 69);
                pdfDoc.triangle(compassX, compassY - 6, compassX - 2.5, compassY, compassX + 2.5, compassY, 'F');
                pdfDoc.setFontSize(7);
                pdfDoc.setFont('helvetica', 'bold');
                pdfDoc.text('N', compassX - 2, compassY - 10);

                // Scale bar
                const scaleX = diagramX + 10;
                const scaleY = diagramY + diagramHeight - 10;
                pdfDoc.setDrawColor(0, 0, 0);
                pdfDoc.setLineWidth(0.8);
                pdfDoc.line(scaleX, scaleY, scaleX + 35, scaleY);
                pdfDoc.line(scaleX, scaleY - 2, scaleX, scaleY + 2);
                pdfDoc.line(scaleX + 35, scaleY - 2, scaleX + 35, scaleY + 2);
                pdfDoc.setFontSize(7);
                pdfDoc.text('0', scaleX - 3, scaleY + 5);
                pdfDoc.text('~100m', scaleX + 28, scaleY + 5);
            }

            // Border around the map/diagram
            pdfDoc.setDrawColor(100, 100, 100);
            pdfDoc.rect(diagramX, diagramY, diagramWidth, diagramHeight);

            y += diagramHeight + 8;

            if (!mapLoaded) {
                y += 7;
                pdfDoc.setFontSize(8);
                pdfDoc.setTextColor(150, 150, 150);
                pdfDoc.text('Note: Live map unavailable, diagram shows approximate location', diagramX, y);
                pdfDoc.setTextColor(0, 0, 0);
            }

            y += 15;

        } else {
            // No coordinates available
            y += 15;
            pdfDoc.setFont(DEFAULT_FONT);
            pdfDoc.setFontSize(SUBTITLE_FONT_SIZE);
            pdfDoc.setFont('helvetica', 'bold');
            pdfDoc.text('2.3 Location Diagram', 20, y);
            y += 10;
            pdfDoc.setFontSize(DEFAULT_FONT_SIZE);
            pdfDoc.setTextColor(150, 150, 150);
            pdfDoc.text('Location coordinates not available for map generation', 25, y);
            pdfDoc.setTextColor(0, 0, 0);
            y += 60;
        }
        // REMOVED: return y; (was here with dead code after it)
        // REMOVED: pdfDoc.addPage(); (was dead code after return)
    }

    function addCoverPage(pdfDoc, structureName, structureId, inspectionDate, bridgePhoto) {
        pdfDoc.setFont(DEFAULT_FONT);
        pdfDoc.setFontSize(20);
        pdfDoc.setFont('helvetica', 'bold');
        pdfDoc.text(`Bridge Inspection Report`, 105, 30, { align: 'center' });
        
        pdfDoc.setFontSize(16);
        pdfDoc.text(structureName, 105, 45, { align: 'center' });
        
        pdfDoc.setFontSize(14);
        pdfDoc.text(`Structure ID: ${structureId}`, 105, 55, { align: 'center' });
        
        if (bridgePhoto.photo_url) {
            try {
                const img = new Image();
                img.src = bridgePhoto.photo_url;
                pdfDoc.addImage(img, 'JPEG', 30, 70, 150, 100);
            } catch (e) {
                pdfDoc.text('Bridge photo not available', 105, 100, { align: 'center' });
            }
        }
        
        pdfDoc.setFontSize(DEFAULT_FONT_SIZE);
        pdfDoc.text(`Inspection Date: ${inspectionDate}`, 105, 190, { align: 'center' });
        pdfDoc.text(`Report Generated: ${new Date().toLocaleDateString()}`, 105, 200, { align: 'center' });
        
        pdfDoc.addPage();
    }

    function addInspectionDetails(pdfDoc, inspectionData) {
        // Start fresh on new page
        pdfDoc.addPage();
        
        let y = 30;
        
        pdfDoc.setFont(DEFAULT_FONT);
        pdfDoc.setFontSize(TITLE_FONT_SIZE);
        pdfDoc.setFont('helvetica', 'bold');
        pdfDoc.text('3 Inspection Details', 20, y);
        y += 10;
        
        pdfDoc.setFont(DEFAULT_FONT);
        pdfDoc.setFontSize(DEFAULT_FONT_SIZE);
        pdfDoc.setFont('helvetica', 'normal');
        
        if (inspectionData && inspectionData.inspectorName) {
            const inspectionDetails = [
                ['Inspector Name:', inspectionData.inspectorName],
                ['Inspection Type:', inspectionData.inspectionType || 'N/A'],
                ['Inspection Date:', inspectionData.inspectionDate || 'N/A'],
                ['Total Spans:', inspectionData.totalSpans || 'N/A']
            ];
            
            inspectionDetails.forEach(row => {
                pdfDoc.text(row[0], 25, y);
                pdfDoc.text(row[1].toString(), 70, y);
                y += 8;
            });
            
            if (inspectionData.spans && inspectionData.spans.length > 0) {
                pdfDoc.setFont(DEFAULT_FONT);
                pdfDoc.setFontSize(HEADING_FONT_SIZE);
                pdfDoc.setFont('helvetica', 'bold');
                pdfDoc.text('Span Details:', 20, y + 10);
                pdfDoc.setFont(DEFAULT_FONT);
                pdfDoc.setFontSize(DEFAULT_FONT_SIZE);
                pdfDoc.setFont('helvetica', 'normal');
                y += 20;
                
                inspectionData.spans.forEach(span => {
                    y = checkPageBreak(pdfDoc, y, 20);
                    pdfDoc.text(`Span ${span.spanNumber}:`, 25, y);
                    pdfDoc.text(`Elements Inspected: ${span.elementsInspected ? 'Yes' : 'No'}`, 70, y);
                    y += 6;
                    if (span.comments) {
                        const wrapped = pdfDoc.splitTextToSize(`Comments: ${span.comments}`, 120);
                        pdfDoc.text(wrapped, 70, y);
                        y += (wrapped.length * 4);
                    }
                    y += 4;
                });
            }
        } else {
            pdfDoc.text('No inspection details available', 25, y);
        }
    }

    function addConclusionsAndRecommendations(pdfDoc, defectsData, inspectionData) {
        // Start fresh on new page
        pdfDoc.addPage();
        
        pdfDoc.setFont(DEFAULT_FONT);
        pdfDoc.setFontSize(TITLE_FONT_SIZE);
        pdfDoc.setFont('helvetica', 'bold');
        pdfDoc.text('5 Conclusions and Recommendations', 20, 30);
        
        let y = 45;
        
        // 5.1 Conclusions
        pdfDoc.setFont(DEFAULT_FONT);
        pdfDoc.setFontSize(SUBTITLE_FONT_SIZE);
        pdfDoc.setFont('helvetica', 'bold');
        pdfDoc.text('5.1 Conclusions', 20, y);
        y += 8;
        
        pdfDoc.setFont(DEFAULT_FONT);
        pdfDoc.setFontSize(DEFAULT_FONT_SIZE);
        pdfDoc.setFont('helvetica', 'normal');
        
        if (inspectionData.conclusions && inspectionData.conclusions.trim().length > 0) {
            const conclusionsText = pdfDoc.splitTextToSize(inspectionData.conclusions, 160);
            y = checkPageBreak(pdfDoc, y, conclusionsText.length * 5 + 10);
            pdfDoc.text(conclusionsText, 25, y);
            y += (conclusionsText.length * 5) + 10;
        } else {
            pdfDoc.setTextColor(150, 150, 150);
            pdfDoc.text('No conclusions provided for this inspection.', 25, y);
            pdfDoc.setTextColor(0, 0, 0);
            y += 10;
        }
        
        // 5.2 Recommendations
        y = checkPageBreak(pdfDoc, y, 15);
        
        pdfDoc.setFont(DEFAULT_FONT);
        pdfDoc.setFontSize(SUBTITLE_FONT_SIZE);
        pdfDoc.setFont('helvetica', 'bold');
        pdfDoc.text('5.2 Recommended Remedial Works', 20, y);
        y += 10;
        
        // Filter defects that have remedialWorks
        const defectsWithRemedialWorks = defectsData.filter(d => {
            const remedial = d.remedialWorks || d.remedial_works;
            return remedial && remedial.trim().length > 0 && remedial !== 'Add';
        });
        
        if (defectsWithRemedialWorks.length === 0) {
            pdfDoc.setFont(DEFAULT_FONT);
            pdfDoc.setFontSize(DEFAULT_FONT_SIZE);
            pdfDoc.setFont('helvetica', 'italic');
            pdfDoc.setTextColor(150, 150, 150);
            pdfDoc.text('No specific remedial works recorded for this inspection.', 25, y);
            pdfDoc.setTextColor(0, 0, 0);
            y += 10;
        } else {
            // Group by span
            const recommendationsBySpan = {};
            
            defectsWithRemedialWorks.forEach(defect => {
                const spanNum = defect.spanNumber;
                if (!recommendationsBySpan[spanNum]) {
                    recommendationsBySpan[spanNum] = [];
                }
                
                const defectCode = defect.defectId || `${defect.defect_type}.${defect.defect_number}`;
                const remedialText = defect.remedialWorks || defect.remedial_works;
                
                let costDisplay = '';
                if (defect.cost && parseFloat(defect.cost) > 0) {
                    costDisplay = `£${parseFloat(defect.cost).toFixed(2)}`;
                } else {
                    costDisplay = '-';
                }
                
                // Map priority to full text
                let priorityText = '';
                if (defect.priority === 'H') priorityText = 'High';
                else if (defect.priority === 'M') priorityText = 'Medium';
                else if (defect.priority === 'L') priorityText = 'Low';
                else priorityText = defect.priority || '-';
                
                recommendationsBySpan[spanNum].push({
                    elementNo: defect.elementNumber,
                    defectCode: defectCode,
                    defectDescription: defect.element_description || '-',
                    priority: priorityText,
                    cost: costDisplay,
                    remedialWorks: remedialText
                });
            });
            
            // Sort spans
            const sortedSpans = Object.keys(recommendationsBySpan).sort((a, b) => Number(a) - Number(b));
            
            for (const spanNum of sortedSpans) {
                const recommendations = recommendationsBySpan[spanNum];
                
                y = checkPageBreak(pdfDoc, y, 40);
                
                // Span header with better spacing
                pdfDoc.setFont(DEFAULT_FONT);
                pdfDoc.setFontSize(HEADING_FONT_SIZE);
                pdfDoc.setFont('helvetica', 'bold');
                pdfDoc.setTextColor(44, 62, 68);
                pdfDoc.text(`Span ${spanNum}`, 20, y);
                y += 10;
                pdfDoc.setTextColor(0, 0, 0);
                
                // Prepare table data - wrap long text
                const tableData = recommendations.map(rec => {
                    // Wrap remedial works text
                    const wrappedRemedial = pdfDoc.splitTextToSize(rec.remedialWorks, 55);
                    return [
                        rec.elementNo.toString(),
                        rec.defectCode,
                        rec.defectDescription,
                        rec.priority,
                        wrappedRemedial,
                        rec.cost
                    ];
                });
                
                // Improved table with proper column widths and font sizes
                pdfDoc.autoTable({
                    startY: y,
                    head: [['Element', 'Defect', 'Description', 'Priority', 'Remedial Works', 'Cost']],
                    body: tableData,
                    theme: 'grid',
                    styles: {
                        fontSize: 9,  // Slightly larger font
                        cellPadding: 4,
                        lineColor: [0, 0, 0],
                        lineWidth: 0.2,
                        textColor: [0, 0, 0],
                        valign: 'middle'
                    },
                    headStyles: {
                        fontStyle: 'bold',
                        fillColor: [240, 240, 240],
                        textColor: [0, 0, 0],
                        halign: 'center',
                        fontSize: 9
                    },
                    alternateRowStyles: {
                        fillColor: [248, 248, 248]
                    },
                    columnStyles: {
                        0: { cellWidth: 18, halign: 'center' },      // Element
                        1: { cellWidth: 25, halign: 'center' },      // Defect
                        2: { cellWidth: 35 },                         // Description
                        3: { cellWidth: 18, halign: 'center' },      // Priority
                        4: { cellWidth: 65 },                         // Remedial Works
                        5: { cellWidth: 25, halign: 'right' }         // Cost
                    },
                    margin: { left: 20, right: 20 },
                    didDrawPage: function(data) {
                        y = data.cursor.y;
                    }
                });
                
                y += 8;
            }
        }
        
        // 5.3 Next Inspection
        y = checkPageBreak(pdfDoc, y, 20);
        
        pdfDoc.setFont(DEFAULT_FONT);
        pdfDoc.setFontSize(SUBTITLE_FONT_SIZE);
        pdfDoc.setFont('helvetica', 'bold');
        pdfDoc.text('5.3 Next Inspection', 20, y);
        y += 8;
        
        pdfDoc.setFont(DEFAULT_FONT);
        pdfDoc.setFontSize(DEFAULT_FONT_SIZE);
        pdfDoc.setFont('helvetica', 'normal');
        
        const severityCounts = {
            1: defectsData.filter(d => d.severity === 1).length,
            2: defectsData.filter(d => d.severity === 2).length,
            3: defectsData.filter(d => d.severity === 3).length,
            4: defectsData.filter(d => d.severity === 4).length,
            5: defectsData.filter(d => d.severity === 5).length
        };
        
        const totalDefects = defectsData.length;
        
        let nextInspectionInterval = '';
        if (severityCounts[5] > 0 || severityCounts[4] > 0) {
            nextInspectionInterval = 'within 6 months';
        } else if (severityCounts[3] > 0) {
            nextInspectionInterval = 'within 12 months';
        } else if (totalDefects > 0) {
            nextInspectionInterval = 'within 24 months';
        } else {
            nextInspectionInterval = 'within 24-36 months';
        }
        
        pdfDoc.text(`It is recommended that the next general inspection be carried out ${nextInspectionInterval}.`, 25, y);
        y += 10;
        
        if (severityCounts[5] > 0 || severityCounts[4] > 0) {
            pdfDoc.setTextColor(220, 53, 69);
            const warningText = pdfDoc.splitTextToSize('Note: Interim safety inspections should be conducted monthly due to identified severe/critical defects.', 160);
            y = checkPageBreak(pdfDoc, y, warningText.length * 5);
            pdfDoc.text(warningText, 25, y);
            pdfDoc.setTextColor(0, 0, 0);
        }
    }
    
    async function addBCIForm(pdfDoc, bciFormData) {
        // BCI form is complex - keeping its own formatting
        try {
            const { structureName, structureId, bridgeData, totalSpans, spansData, worksRequired } = bciFormData;
            
            // Start fresh on new page
            pdfDoc.addPage();
            
            pdfDoc.setFontSize(14);
            pdfDoc.setFont('helvetica', 'bold');
            pdfDoc.text('Appendix A: BCI Proforma', 105, 20, { align: 'center' });
            
            const elementsResponse = await fetch('http://localhost:3000/api/elements');
            if (!elementsResponse.ok) throw new Error('Failed to fetch elements');
            const elements = await elementsResponse.json();
            
            const pageHeight = 297;
            const pageWidth = 210;
            const tableHeight = pageHeight * 0.85;
            const tableWidth = pageWidth * 0.9;
            const leftMargin = (pageWidth - tableWidth) / 2;
            const topMargin = 15;
            
            for (let spanNum = 1; spanNum <= totalSpans; spanNum++) {
                const spanData = spansData.find(s => s.span_number == spanNum);
                const spanDefects = spanData?.defects || [];
                const spanElements = elements.filter(el => el.span_number == null || el.span_number == spanNum);
                const combinedData = combineData(spanElements, spanDefects);
                const spanWorks = worksRequired.worksRequired?.filter(w => w.spanNumber == spanNum) || [];
                
                const inspectorName = spanData?.inspector_name || 'Monir Khan';
                const bciCrit = spanData?.bci_crit || '100';
                const bciAv = spanData?.bci_av || '100';
                const inspectionDate = spanData?.inspection_date || '2025-07-10';
                const photo = spanData?.photographs_taken ? 'Yes' : 'Yes';
                const inspected = spanData?.elements_inspected ? 'Yes' : 'Yes';
                const comments = spanData?.comments || '';
                
                const mergePattern = [7, 7, 7, 4, 9, 4];
                const groupLabels = ["Deck Elements", "Load-bearing Substructure", "Durability Elements", "Safety Elements", "Other Bridge Elements", "Ancillary Elements"];
                
                // Page 1
                pdfDoc.addPage();
                
                const headerRows = [
                    [{content: 'Superficial', colSpan: 2}, {content: 'General', colSpan: 2}, {content: 'Principal', colSpan: 2}, {content: 'Special', colSpan: 2}, {content: 'Form', colSpan: 2}],
                    [{content: `Inspector: ${inspectorName}`, colSpan: 3}, {content: `Date: ${inspectionDate}`, colSpan: 2}, {content: 'Next inspection:', colSpan: 2}, {content: 'Road Ref:', colSpan: 3}],
                    [{content: `Bridge name: ${structureName}`, colSpan: 4}, {content: `Bridge Ref: ${structureId}`, colSpan: 2}, {content: 'Bridge code', rowSpan: 4, styles: {valign: 'middle', halign: 'center', fontStyle: 'bold'}}, {content: `Primary deck form: ${bridgeData.primary_form || '11'}`, colSpan: 3}],
                    [{content: `Map Ref: ${bridgeData.latitude?.toFixed(3) || '53.708'}, ${bridgeData.longitude?.toFixed(3) || '-0.449'}`, colSpan: 2}, {content: `OSE: ${bridgeData.OSE || '502462'}`, colSpan: 2}, {content: `OSN: ${bridgeData.OSN || '424569'}`, colSpan: 2}, {content: `Primary deck material: ${bridgeData.primary_material || 'E'}`, colSpan: 3}],
                    [{content: `Span: ${spanNum} of ${totalSpans}`, colSpan: 2}, {content: `Span Width (m): ${bridgeData.span || '1410'}`, colSpan: 2}, {content: `Span Length (m): ${bridgeData.length || '2220'}`, colSpan: 2}, {content: `Secondary deck form: ${bridgeData.secondary_form || '26'}`, colSpan: 3}],
                    [{content: `All above ground elements inspected: ${inspected}`, colSpan: 4}, {content: `Photograph: ${photo}`, colSpan: 2}, {content: `Secondary deck material: ${bridgeData.secondary_material || 'B'}`, colSpan: 3}],
                    [{content: `BCI crit: ${bciCrit}  BCI ave: ${bciAv}`, colSpan: 10, styles: {fontStyle: 'bold'}}],
                    [{content: 'Set', styles: {halign: 'center', fontStyle: 'bold'}}, {content: 'No', styles: {halign: 'center', fontStyle: 'bold'}}, {content: 'Description', styles: {halign: 'center', fontStyle: 'bold'}}, {content: 'S', styles: {halign: 'center', fontStyle: 'bold'}}, {content: 'Ex', styles: {halign: 'center', fontStyle: 'bold'}}, {content: 'Def', styles: {halign: 'center', fontStyle: 'bold'}}, {content: 'W', styles: {halign: 'center', fontStyle: 'bold'}}, {content: 'P', styles: {halign: 'center', fontStyle: 'bold'}}, {content: 'Cost', styles: {halign: 'center', fontStyle: 'bold'}}, {content: 'Comments', styles: {halign: 'center', fontStyle: 'bold'}}]
                ];
                
                let currentGroupIndex = 0;
                let rowsInCurrentGroup = 0;
                const defectRows = [];

                combinedData.forEach((item, index) => {
                    if (rowsInCurrentGroup === 0) {
                        rowsInCurrentGroup = mergePattern[currentGroupIndex];
                        const defDisplay = item.def === '-' ? '-' : (item.defN ? `${item.def}.${item.defN}` : item.def);
                        defectRows.push([
                            {content: groupLabels[currentGroupIndex], rowSpan: mergePattern[currentGroupIndex], styles: {valign: 'middle', halign: 'center', fontStyle: 'bold'}},
                            item.element_number, item.description, item.s, item.ex, defDisplay, item.w, item.p, item.cost, item.comments_remarks
                        ]);
                        currentGroupIndex++;
                        rowsInCurrentGroup--;
                    } else {
                        const defDisplay = item.def === '-' ? '-' : (item.defN ? `${item.def}.${item.defN}` : item.def);
                        defectRows.push([item.element_number, item.description, item.s, item.ex, defDisplay, item.w, item.p, item.cost, item.comments_remarks]);
                        rowsInCurrentGroup--;
                    }
                });
                
                const footerRow = [{content: 'S - severity, Ex - extent, Def - defect, W - work required, P - work priority, Cost - cost of work.', colSpan: 10, styles: {halign: 'center', fontSize: 6}}];
                const allRows = [...headerRows, ...defectRows, footerRow];
                const totalRows = allRows.length;
                const calculatedRowHeight = tableHeight / totalRows;
                
                pdfDoc.autoTable({
                    startY: topMargin,
                    body: allRows,
                    theme: 'grid',
                    styles: { fontSize: 6.5, cellPadding: 0.5, lineColor: [0, 0, 0], lineWidth: 0.1, minCellHeight: calculatedRowHeight },
                    columnStyles: {
                        0: { cellWidth: tableWidth * 0.056 }, 1: { cellWidth: tableWidth * 0.056 }, 2: { cellWidth: tableWidth * 0.32 },
                        3: { cellWidth: tableWidth * 0.042 }, 4: { cellWidth: tableWidth * 0.042 }, 5: { cellWidth: tableWidth * 0.056 },
                        6: { cellWidth: tableWidth * 0.042 }, 7: { cellWidth: tableWidth * 0.042 }, 8: { cellWidth: tableWidth * 0.067 },
                        9: { cellWidth: tableWidth * 0.277 }
                    },
                    margin: { left: leftMargin, right: leftMargin }
                });
                
                // Page 2
                pdfDoc.addPage();
                
                const multipleDefects = spanDefects.filter(d => d.defect_no > 1);
                const page2Rows = [];
                
                page2Rows.push([{content: 'MULTIPLE DEFECTS', colSpan: 11, styles: {halign: 'center', fontStyle: 'bold', fontSize: 10}}]);
                page2Rows.push([
                    {content: 'Element No.', rowSpan: 2}, {content: 'Defect 1', colSpan: 3, styles: {halign: 'center', fontStyle: 'bold'}},
                    {content: 'Defect 2', colSpan: 3, styles: {halign: 'center', fontStyle: 'bold'}}, {content: 'Defect 3', colSpan: 3, styles: {halign: 'center', fontStyle: 'bold'}},
                    {content: 'Comments', rowSpan: 2}
                ]);
                page2Rows.push([
                    {content: 'S', styles: {halign: 'center'}}, {content: 'Ex', styles: {halign: 'center'}}, {content: 'Def', styles: {halign: 'center'}},
                    {content: 'S', styles: {halign: 'center'}}, {content: 'Ex', styles: {halign: 'center'}}, {content: 'Def', styles: {halign: 'center'}},
                    {content: 'S', styles: {halign: 'center'}}, {content: 'Ex', styles: {halign: 'center'}}, {content: 'Def', styles: {halign: 'center'}}
                ]);
                
                for (let i = 4; i <= 8; i++) {
                    const defect = multipleDefects.find(d => d.element_no == i);
                    page2Rows.push([
                        i.toString(), defect?.s || '', defect?.ex || '', defect ? `${defect.def}.${defect.defN}` : '',
                        '', '', '', '', '', '', defect?.comments_remarks || ''
                    ]);
                }
                
                page2Rows.push([{content: "INSPECTOR'S COMMENTS", colSpan: 11, styles: {halign: 'center', fontStyle: 'bold', fontSize: 10}}]);
                page2Rows.push([{content: comments || '', colSpan: 11, styles: {minCellHeight: 80}}]);
                page2Rows.push([
                    {content: 'Name:', colSpan: 1}, {content: inspectorName, colSpan: 3}, {content: 'Signed:', colSpan: 1},
                    {content: inspectorName, colSpan: 3}, {content: 'Date:', colSpan: 1}, {content: inspectionDate, colSpan: 2}
                ]);
                
                page2Rows.push([{content: "ENGINEER'S COMMENTS", colSpan: 11, styles: {halign: 'center', fontStyle: 'bold', fontSize: 10}}]);
                page2Rows.push([{content: '', colSpan: 11, styles: {minCellHeight: 80}}]);
                page2Rows.push([
                    {content: 'Name:', colSpan: 1}, {content: '[Insert name]', colSpan: 3}, {content: 'Signed:', colSpan: 1},
                    {content: '[Insert sign]', colSpan: 3}, {content: 'Date:', colSpan: 1}, {content: inspectionDate, colSpan: 2}
                ]);
                
                page2Rows.push([{content: `WORK REQUIRED - SPAN ${spanNum}`, colSpan: 11, styles: {halign: 'center', fontStyle: 'bold', fontSize: 10}}]);
                page2Rows.push([
                    {content: 'Ref.', colSpan: 1, styles: {halign: 'center', fontStyle: 'bold'}}, {content: 'Suggested Remedial Work', colSpan: 6, styles: {halign: 'center', fontStyle: 'bold'}},
                    {content: 'Priority', colSpan: 1, styles: {halign: 'center', fontStyle: 'bold'}}, {content: 'Estimated Cost', colSpan: 2, styles: {halign: 'center', fontStyle: 'bold'}},
                    {content: 'Action', colSpan: 1, styles: {halign: 'center', fontStyle: 'bold'}}
                ]);
                
                for (let i = 0; i < 5; i++) {
                    const work = spanWorks[i];
                    page2Rows.push([
                        (i + 1).toString(), {content: work?.remedialWorks || '', colSpan: 6}, work?.priority || '',
                        {content: work?.cost === 'Not specified' ? '' : (work?.cost || ''), colSpan: 2}, work?.worksRequired === 'Y' ? '✓' : work?.worksRequired === 'M' ? '?' : ''
                    ]);
                }
                
                pdfDoc.autoTable({
                    startY: topMargin,
                    body: page2Rows,
                    theme: 'grid',
                    styles: { fontSize: 7, cellPadding: 1, lineColor: [0, 0, 0], lineWidth: 0.1 },
                    margin: { left: leftMargin, right: leftMargin }
                });
            }
        } catch (error) {
            console.error('Error adding BCI form:', error);
            pdfDoc.setFontSize(10);
            pdfDoc.text('Error generating BCI form content', 20, 40);
        }
    }

    window.addBCIForm = addBCIForm;

    function combineData(elements, defects) {
        return elements.map(element => {
            const defect = defects.find(d => d.element_no === element.element_number);
            return {
                ...element,
                s: defect?.s || '-',
                ex: defect?.ex || '-',
                def: defect?.def || '-',
                defN: defect?.defN || '-',
                w: defect?.w || '-',
                p: defect?.p || '-',
                cost: defect?.cost || '',
                comments_remarks: defect?.comments_remarks || ''
            };
        });
    }

    async function addPhotographs(pdfDoc, photosByDefect) {
    try {
        // ============================================
        // PAGE 1: APPENDIX B TITLE PAGE (SEPARATE)
        // ============================================
        pdfDoc.addPage();
        
        pdfDoc.setFontSize(14);
        pdfDoc.setFont('helvetica', 'bold');
        pdfDoc.text('Appendix B: Photographs', 105, 20, { align: 'center' });
        
        if (!photosByDefect || Object.keys(photosByDefect).length === 0) {
            pdfDoc.setFontSize(12);
            pdfDoc.text('No photographs available for this inspection', 105, 40, { align: 'center' });
            return;
        }

        // Collect all photos
        const allPhotos = [];
        for (const [defectCode, photos] of Object.entries(photosByDefect)) {
            for (const photo of photos) {
                allPhotos.push({
                    ...photo,
                    defectCode: defectCode
                });
            }
        }

        let photoCounter = 1;
        
        // Page dimensions
        const pageWidth = 210;
        const pageCenter = pageWidth / 2;  // 105mm
        
        // Photo size
        const photoWidth = 120;
        const photoHeight = 90;
        const verticalGap = 25;  // Gap between top and bottom photo
        
        // Calculate Y positions
        const topPhotoY = 40;
        const bottomPhotoY = topPhotoY + photoHeight + verticalGap;
        
        for (let i = 0; i < allPhotos.length; i += 2) {
            // Add new page for each pair
            pdfDoc.addPage();
           
            // TOP PHOTO
            const topPhoto = allPhotos[i];
            if (topPhoto && topPhoto.photo_url) {
                try {
                    const img = new Image();
                    img.crossOrigin = "Anonymous";
                    await new Promise((resolve, reject) => {
                        img.onload = resolve;
                        img.onerror = reject;
                        img.src = topPhoto.photo_url;
                    });
                    
                    // Add top photo centered
                    const topX = pageCenter - (photoWidth / 2);
                    pdfDoc.addImage(img, 'JPEG', topX, topPhotoY, photoWidth, photoHeight);
                    
                    // Caption for top photo
                    const defectInfo = topPhoto.defectCode ? `Defect ${topPhoto.defectCode}` : '';
                    const desc = topPhoto.photo_description || '';
                    const caption = `Photo ${photoCounter}: ${defectInfo} ${desc}`.trim();
                    pdfDoc.setFontSize(8);
                    pdfDoc.setFont('helvetica', 'normal');
                    
                    const wrappedCaption = pdfDoc.splitTextToSize(caption, photoWidth);
                    const captionY = topPhotoY + photoHeight + 5;
                    
                    for (let lineIdx = 0; lineIdx < wrappedCaption.length; lineIdx++) {
                        pdfDoc.text(wrappedCaption[lineIdx], pageCenter, captionY + (lineIdx * 4), { align: 'center' });
                    }
                    
                    photoCounter++;
                } catch (e) {
                    console.error('Error loading top photo:', e);
                    pdfDoc.setFontSize(8);
                    pdfDoc.text(`Photo ${photoCounter}: [Image not available]`, pageCenter, topPhotoY + (photoHeight / 2), { align: 'center' });
                    photoCounter++;
                }
            }
            
            // BOTTOM PHOTO
            if (i + 1 < allPhotos.length) {
                const bottomPhoto = allPhotos[i + 1];
                if (bottomPhoto && bottomPhoto.photo_url) {
                    try {
                        const img2 = new Image();
                        img2.crossOrigin = "Anonymous";
                        await new Promise((resolve, reject) => {
                            img2.onload = resolve;
                            img2.onerror = reject;
                            img2.src = bottomPhoto.photo_url;
                        });
                        
                        // Add bottom photo centered
                        const bottomX = pageCenter - (photoWidth / 2);
                        pdfDoc.addImage(img2, 'JPEG', bottomX, bottomPhotoY, photoWidth, photoHeight);
                        
                        // Caption for bottom photo
                        const defectInfo2 = bottomPhoto.defectCode ? `Defect ${bottomPhoto.defectCode}` : '';
                        const desc2 = bottomPhoto.photo_description || '';
                        const caption2 = `Photo ${photoCounter}: ${defectInfo2} ${desc2}`.trim();
                        pdfDoc.setFontSize(8);
                        
                        const wrappedCaption2 = pdfDoc.splitTextToSize(caption2, photoWidth);
                        const caption2Y = bottomPhotoY + photoHeight + 5;
                        
                        for (let lineIdx = 0; lineIdx < wrappedCaption2.length; lineIdx++) {
                            pdfDoc.text(wrappedCaption2[lineIdx], pageCenter, caption2Y + (lineIdx * 4), { align: 'center' });
                        }
                        
                        photoCounter++;
                    } catch (e) {
                        console.error('Error loading bottom photo:', e);
                        pdfDoc.setFontSize(8);
                        pdfDoc.text(`Photo ${photoCounter}: [Image not available]`, pageCenter, bottomPhotoY + (photoHeight / 2), { align: 'center' });
                        photoCounter++;
                    }
                }
            }
        }
    } catch (error) {
        console.error('Error adding photographs:', error);
        pdfDoc.setFontSize(10);
        pdfDoc.text('Error generating photographs content', 20, 40);
    }
}

    async function generateBCIFormForPDF(doc) {
        try {
            const structureId = sessionStorage.getItem('structureId');
            const structureName = sessionStorage.getItem('structureName');
            const inspectionDate = doc.date;
            
            if (!structureId || !structureName) throw new Error('Missing structure information');

            const bridgeResponse = await fetch(`http://localhost:3000/api/bridges/${structureId}`);
            if (!bridgeResponse.ok) throw new Error('Failed to fetch bridge data');
            const bridge = await bridgeResponse.json();
            const totalSpans = bridge.span_number || 1;

            const defectsResponse = await fetch(`http://localhost:3000/api/defectsbci?structureId=${structureId}&date=${inspectionDate}`);
            if (!defectsResponse.ok) throw new Error('Failed to fetch defects');
            const allSpansWithDefects = await defectsResponse.json();

            const worksResponse = await fetch(`http://localhost:3000/api/worksrequired?structureId=${structureId}&date=${inspectionDate}`);
            if (!worksResponse.ok) throw new Error('Failed to fetch works required');
            const worksRequired = await worksResponse.json();

            return { structureName, structureId, bridgeData: bridge, totalSpans, spansData: allSpansWithDefects, worksRequired };
        } catch (error) {
            console.error('BCI form generation failed:', error);
            return { error: error.message };
        }
    }
    
    window.generatePDFReport = generatePDFReport;
});