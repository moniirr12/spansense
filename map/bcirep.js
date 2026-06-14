// BCI Form Generator - extracted as a standalone function
async function generateBCIForm(doc) {
    try {
        // 1. Get structure info
        const structureId = sessionStorage.getItem('structureId');
        const structureName = sessionStorage.getItem('structureName');
        const inspectionDate = doc.date;
        
        if (!structureId || !structureName) {
            throw new Error('Missing structure information');
        }

        // 2. Fetch bridge data to get span count
        const bridgeResponse = await fetch(`/api/bridges/${structureId}`);
        if (!bridgeResponse.ok) throw new Error('Failed to fetch bridge data');
        const bridge = await bridgeResponse.json();
        const totalSpans = bridge.span_number || 1;

        // 3. Fetch ALL defects for this structure and date
        const defectsResponse = await fetch(
            `/api/defectsbci?structureId=${structureId}&date=${inspectionDate}`
        );
        if (!defectsResponse.ok) throw new Error('Failed to fetch defects');
        const allSpansWithDefects = await defectsResponse.json();

        // 4. Fetch defects for works required
        const worksResponse = await fetch(
            `/api/worksrequired?structureId=${structureId}&date=${inspectionDate}`
        );
        if (!worksResponse.ok) throw new Error('Failed to fetch works required');
        const worksRequired = await worksResponse.json();

        // 5. Helper function to calculate remaining height
        function calculateRemainingHeight(totalRows, maxDefectsRows = 5, maxWorkRows = 6) {
            // Fixed rows always present on second page
            const fixedRows = 12; // Headers + inspector + engineer sections + footer
            const totalFixedHeight = fixedRows * 25; // Approximate pixels per row
            const availableHeight = 800 - totalFixedHeight; // Approximate page height
            
            // Calculate how many rows we can show
            const defectsRows = Math.min(maxDefectsRows, 8);
            const workRows = Math.min(maxWorkRows, 10);
            
            return {
                defectsRows: defectsRows,
                workRows: workRows,
                inspectorHeight: 120,
                engineerHeight: 120
            };
        }

        // 6. Helper function to generate multiple defects rows
        function generateMultipleDefectsDynamic(spanDefects, targetRows) {
            // Group defects by element number
            const defectsByElement = {};
            spanDefects.forEach(defect => {
                if (!defectsByElement[defect.element_no]) {
                    defectsByElement[defect.element_no] = [];
                }
                defectsByElement[defect.element_no].push(defect);
            });

            // Get elements with multiple defects (defect_no > 1)
            const elementsWithMultipleDefects = Object.keys(defectsByElement).filter(
                elementNo => defectsByElement[elementNo].length > 1
            );

            // Use target rows for consistent height
            const rowsToShow = targetRows;
            
            let html = '';
            
            for (let i = 0; i < rowsToShow; i++) {
                if (i < elementsWithMultipleDefects.length) {
                    const elementNo = elementsWithMultipleDefects[i];
                    const defects = defectsByElement[elementNo];
                    
                    // Sort defects by defect_no
                    defects.sort((a, b) => a.defect_no - b.defect_no);
                    
                    // Get defect details (up to 3)
                    const defect1 = defects.find(d => d.defect_no === 1) || {};
                    const defect2 = defects.find(d => d.defect_no === 2) || {};
                    const defect3 = defects.find(d => d.defect_no === 3) || {};
                    
                    // Format defect codes
                    const defectCode1 = (defect1.def && defect1.defN) ? `${defect1.def}.${defect1.defN}` : (defect1.def || '');
                    const defectCode2 = (defect2.def && defect2.defN) ? `${defect2.def}.${defect2.defN}` : (defect2.def || '');
                    const defectCode3 = (defect3.def && defect3.defN) ? `${defect3.def}.${defect3.defN}` : (defect3.def || '');
                    
                    // Collect all comments with simple labels
                    const commentsList = [];
                    if (defect1.comments_remarks && defect1.comments_remarks !== '-') {
                        commentsList.push(`Defect 1: ${defect1.comments_remarks}`);
                    }
                    if (defect2.comments_remarks && defect2.comments_remarks !== '-') {
                        commentsList.push(`Defect 2: ${defect2.comments_remarks}`);
                    }
                    if (defect3.comments_remarks && defect3.comments_remarks !== '-') {
                        commentsList.push(`Defect 3: ${defect3.comments_remarks}`);
                    }
                    const combinedComments = commentsList.join('; ');
                    
                    html += `
                        <tr>
                            <td colspan="2" style="border: 1px solid black; text-align: center; height: 35px;">${elementNo}</td>
                            <td style="border: 1px solid black; text-align: center;">${defect1.s || ''}</td>
                            <td style="border: 1px solid black; text-align: center;">${defect1.ex || ''}</td>
                            <td style="border: 1px solid black; text-align: center;">${defectCode1}</td>
                            <td style="border: 1px solid black; text-align: center;">${defect2.s || ''}</td>
                            <td style="border: 1px solid black; text-align: center;">${defect2.ex || ''}</td>
                            <td style="border: 1px solid black; text-align: center;">${defectCode2}</td>
                            <td style="border: 1px solid black; text-align: center;">${defect3.s || ''}</td>
                            <td style="border: 1px solid black; text-align: center;">${defect3.ex || ''}</td>
                            <td style="border: 1px solid black; text-align: center;">${defectCode3}</td>
                            <td colspan="7" style="border: 1px solid black;">${combinedComments || ''}</td>
                        </tr>
                    `;
                } else {
                    // Empty row to fill space
                    html += `
                        <tr>
                            <td colspan="2" style="border: 1px solid black; height: 35px;">&nbsp;</td>
                            <td style="border: 1px solid black;">&nbsp;</td>
                            <td style="border: 1px solid black;">&nbsp;</td>
                            <td style="border: 1px solid black;">&nbsp;</td>
                            <td style="border: 1px solid black;">&nbsp;</td>
                            <td style="border: 1px solid black;">&nbsp;</td>
                            <td style="border: 1px solid black;">&nbsp;</td>
                            <td style="border: 1px solid black;">&nbsp;</td>
                            <td style="border: 1px solid black;">&nbsp;</td>
                            <td style="border: 1px solid black;">&nbsp;</td>
                            <td colspan="7" style="border: 1px solid black;">&nbsp;</td>
                        </tr>
                    `;
                }
            }
            
            return html;
        }

        // 7. Helper function to generate work required rows
        function generateWorkRequiredRowsDynamic(spanWorks, targetRowCount) {
            const rowsToShow = targetRowCount;
            let html = '';
            
            for (let i = 0; i < rowsToShow; i++) {
                if (i < spanWorks.length) {
                    const work = spanWorks[i];
                    html += `
                        <tr>
                            <td colspan="2" style="border: 1px solid black; text-align: center; height: 35px;">${i + 1}</td>
                            <td colspan="9" style="border: 1px solid black;">${work.remedialWorks || work.remedial_works || ''}</td>
                            <td colspan="3" style="border: 1px solid black; text-align: center;">${work.priority || 'M'}</td>
                            <td colspan="2" style="border: 1px solid black; text-align: right;">${work.cost && work.cost !== 'Not specified' ? work.cost : ''}</td>
                            <td colspan="2" style="border: 1px solid black; text-align: center;">${work.worksRequired === 'Y' ? '✓' : (work.worksRequired === 'M' ? '?' : '')}</td>
                        </tr>
                    `;
                } else {
                    // Empty row to fill space
                    html += `
                        <tr>
                            <td colspan="2" style="border: 1px solid black; height: 35px;">&nbsp;</td>
                            <td colspan="9" style="border: 1px solid black;">&nbsp;</td>
                            <td colspan="3" style="border: 1px solid black;">&nbsp;</td>
                            <td colspan="2" style="border: 1px solid black;">&nbsp;</td>
                            <td colspan="2" style="border: 1px solid black;">&nbsp;</td>
                        </tr>
                    `;
                }
            }
            
            return html;
        }

        // 8. Create BCI window
        const bciWindow = window.open("", "BCI Report", "width=1200,height=800,scrollbars=yes");
        if (!bciWindow) {
            throw new Error('Popup window was blocked. Please allow popups for this site.');
        }

        // 9. Generate HTML header
        let htmlContent = `
            <html>
                <head>
                    <title>BCI Report - ${structureName}</title>
                    <style>
                        body {
                            font-family: Arial, sans-serif;
                            margin: 20px;
                        }
                        .span-section {
                            margin-bottom: 50px;
                            page-break-after: always;
                        }
                        .span-header {
                            font-size: 24px;
                            margin: 20px 0;
                            color: #2c3e50;
                            border-bottom: 2px solid #3498db;
                            padding-bottom: 10px;
                        }
                        .fixed-table {
                            width: 100%;
                            border-collapse: collapse;
                            margin-bottom: 0px;
                            table-layout: fixed;
                            font-size: 0.9em;
                        }
                        .variable-table {
                            width: 100%;
                            border-collapse: collapse;
                            margin-bottom: 10px;
                            table-layout: auto;
                            font-size: 0.9em;
                        }
                        th, td {
                            border: 1px solid black;
                            padding: 4px;
                            text-align: left;
                        }
                        th {
                            background-color: #f2f2f2;
                        }
                        .vertical-text {
                            writing-mode: vertical-rl;
                            transform: rotate(180deg);
                            text-align: center;
                            font-weight: bold;
                        }
                        .bci-results {
                            justify-content: center;
                            align-items: center;
                            gap: 50px;
                            margin-top: 0px;
                            font-size: 1.0em;
                        }
                        .bci-table {
                            width: 100%;
                            border-collapse: collapse;
                            margin-bottom: 0px;
                            table-layout: fixed;
                            font-size: 0.9em;
                            padding: 5px;
                            text-align: center;
                        }
                    </style>
                </head>
                <body>
                    <h1>BCI Report - ${structureName}</h1>
                    <h2>Inspection Date: ${inspectionDate}</h2>
        `;

        // 10. Add content for each span
        for (let spanNum = 1; spanNum <= totalSpans; spanNum++) {
            // Find data for this span
            const spanData = allSpansWithDefects.find(s => s.span_number == spanNum);
            const spanDefects = spanData?.defects || [];

            // Get elements
            const elementsResponse = await fetch('/api/elements');
            if (!elementsResponse.ok) throw new Error('Failed to fetch elements');
            const elements = await elementsResponse.json();
            const spanElements = elements.filter(el => 
                el.span_number == null || el.span_number == spanNum
            );

            if (spanElements.length > 0 || spanDefects.length > 0) {
                const combinedData = combineData(spanElements, spanDefects);
                
                const inspectorName = spanData?.inspector_name || 'Not Recorded';
                const bciCrit = spanData?.bci_crit || 'N/A';
                const bciAv = spanData?.bci_av || 'N/A';
                const comments = spanData?.comments || 'N/A';

                // Filter works for current span only
                const spanWorks = worksRequired.worksRequired?.filter(item => 
                    item.spanNumber == spanNum
                ) || [];

                const photo = spanData?.photographs_taken !== undefined 
                    ? (spanData.photographs_taken ? 'Yes' : 'No') 
                    : 'N/A';
                    
                const inspected = spanData?.elements_inspected !== undefined 
                    ? (spanData.elements_inspected ? 'Yes' : 'No') 
                    : 'N/A';

                // Fixed row counts for consistent page height
                const targetDefectsRows = 5;
                const targetWorkRows = 6;

                htmlContent += `
                    <div class="span-section">
                        <div class="span-header">Span ${spanNum}</div>
                        <div class="fixed-values">
                            <table class="fixed-table">
                                <tr>
                                    <td colspan="3">Superficial</td>
                                    <td colspan="3">General</td>
                                    <td colspan="3">Principal</td>
                                    <td colspan="3">Special</td>
                                    <td colspan="12">Form</td>
                                </tr>
                                <tr>
                                    <td colspan="6">Inspector: ${inspectorName}</td>
                                    <td colspan="4">Date: ${inspectionDate}</td>
                                    <td colspan="6">Next inspection: </td>
                                    <td colspan="8">Road Ref: </td>
                                </tr>
                                <tr>
                                    <td colspan="10">Bridge name: ${structureName}</td>
                                    <td colspan="6">Bridge Ref: ${structureId}</td>
                                    <td rowspan="4" colspan="1" class="vertical-text">Bridge code</td>
                                    <td colspan="7"><div style="display: flex; justify-content: space-between;"><span>Primary deck form</span><span>${bridge.primary_form || 'N/A'}</span></div></td>
                                </tr>
                                <tr>
                                    <td colspan="5">Map Ref: ${bridge.latitude?.toFixed(3) || 'N/A'}, ${bridge.longitude?.toFixed(3) || 'N/A'}</td>
                                    <td colspan="5">OSE: ${bridge.OSE || 'N/A'}</td>
                                    <td colspan="7">OSN: ${bridge.OSN || 'N/A'}</td>
                                    <td colspan="7"><div style="display: flex; justify-content: space-between;"><span>Primary deck material</span><span>${bridge.primary_material || 'N/A'}</span></div></td>
                                </tr>
                                <tr>
                                    <td colspan="4">Span: ${spanNum} of ${totalSpans}</td>
                                    <td colspan="6">Span Width (m): ${bridge.span || 'N/A'}</td>
                                    <td colspan="6">Span Length (m): ${bridge.length || 'N/A'}</td>
                                    <td colspan="7"><div style="display: flex; justify-content: space-between;"><span>Secondary deck form</span><span>${bridge.secondary_form || 'N/A'}</span></div></td>
                                </tr>
                                <tr>
                                    <td colspan="10">All above ground elements inspected: ${inspected}</td>
                                    <td colspan="6">Photograph: ${photo}</td>
                                    <td colspan="7"><div style="display: flex; justify-content: space-between;"><span>Secondary deck material</span><span>${bridge.secondary_material || 'N/A'}</span></div></td>
                                </tr>
                            </table>
                        </div>
                        <div class="bci-results">
                            <table class="bci-table">
                                <tr>
                                    <td><strong>BCI crit</strong>: ${bciCrit} <strong>BCI ave</strong>: ${bciAv}</td>
                                </tr>
                            </table>
                        </div>
                        <table class="variable-table">
                            <thead>
                                <tr>
                                    <th>Set</th>
                                    <th>No</th>
                                    <th>Description</th>
                                    <th>S</th>
                                    <th>Ex</th>
                                    <th>Def</th>
                                    <th>W</th>
                                    <th>P</th>
                                    <th>Cost</th>
                                    <th>Comments</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${generateBCITableRows(combinedData, spanDefects)}
                            </tbody>
                        </table>
                    </div>
                `;

                // Add SECOND PAGE with FIXED HEIGHT to match first page
                htmlContent += `
                <div class="span-section">
                    <div class="span-header">Span ${spanNum} - Notes</div>
                    
                    <table style="width: 100%; border-collapse: collapse; border: 1px solid black; font-size: 0.9em;">
                        <colgroup>
                            <col style="width: 3.4%;">
                            <col style="width: 15.5%;">
                            <col style="width: 4.4%;">
                            <col style="width: 4.4%;">
                            <col style="width: 4.4%;">
                            <col style="width: 4.4%;">
                            <col style="width: 4.4%;">
                            <col style="width: 4.4%;">
                            <col style="width: 4.4%;">
                            <col style="width: 4.4%;">
                            <col style="width: 4.4%;">
                            <col style="width: 2.0%;">
                            <col style="width: 2.0%;">
                            <col style="width: 2.0%;">
                            <col style="width: 2.0%;">
                            <col style="width: 10.4%;">
                            <col style="width: 9.0%;">
                            <col style="width: 13.7%;">
                        </colgroup>

                        <thead>
                            <tr>
                                <td colspan="18" style="text-align: center; font-weight: bold; border: 1px solid black;">MULTIPLE DEFECTS</td>
                            </tr>
                            <tr>
                                <td colspan="2" rowspan="2" style="text-align: center; font-weight: bold; border: 1px solid black;">Element No.</td>
                                <td colspan="3" style="text-align: center; font-weight: bold; border: 1px solid black;">Defect 1</td>
                                <td colspan="3" style="text-align: center; font-weight: bold; border: 1px solid black;">Defect 2</td>
                                <td colspan="3" style="text-align: center; font-weight: bold; border: 1px solid black;">Defect 3</td>
                                <td colspan="7" rowspan="2" style="text-align: center; font-weight: bold; border: 1px solid black;">Comments</td>
                            </tr>
                            <tr>
                                <td style="text-align: center; font-weight: bold; border: 1px solid black;">S</td>
                                <td style="text-align: center; font-weight: bold; border: 1px solid black;">Ex</td>
                                <td style="text-align: center; font-weight: bold; border: 1px solid black;">Def</td>
                                <td style="text-align: center; font-weight: bold; border: 1px solid black;">S</td>
                                <td style="text-align: center; font-weight: bold; border: 1px solid black;">Ex</td>
                                <td style="text-align: center; font-weight: bold; border: 1px solid black;">Def</td>
                                <td style="text-align: center; font-weight: bold; border: 1px solid black;">S</td>
                                <td style="text-align: center; font-weight: bold; border: 1px solid black;">Ex</td>
                                <td style="text-align: center; font-weight: bold; border: 1px solid black;">Def</td>
                            </tr>
                        </thead>

                        <tbody>
                            ${generateMultipleDefectsDynamic(spanDefects, targetDefectsRows)}

                            <tr>
                                <td colspan="18" style="text-align: center; font-weight: bold; border: 1px solid black;">INSPECTOR'S COMMENTS</td>
                            </tr>
                            <tr>
                                <td colspan="18" style="border: 1px solid black; height: 100px;">${comments}</td>
                            </tr>
                            <tr>
                                <td colspan="2" style="border: 1px solid black;">Name:</td>
                                <td colspan="5" style="border: 1px solid black;">${inspectorName}</td>
                                <td colspan="2" style="border: 1px solid black;">Signed:</td>
                                <td colspan="6" style="border: 1px solid black;">${inspectorName}</td>
                                <td colspan="1" style="border: 1px solid black;">Date:</td>
                                <td colspan="2" style="border: 1px solid black;">${inspectionDate}</td>
                            </tr>

                            <tr>
                                <td colspan="18" style="text-align: center; font-weight: bold; border: 1px solid black;">ENGINEER'S COMMENTS</td>
                            </tr>
                            <tr>
                                <td colspan="18" style="border: 1px solid black; height: 100px;"></td>
                            </tr>
                            <tr>
                                <td colspan="2" style="border: 1px solid black;">Name:</td>
                                <td colspan="5" style="border: 1px solid black;">[Insert name]</td>
                                <td colspan="2" style="border: 1px solid black;">Signed:</td>
                                <td colspan="6" style="border: 1px solid black;">[Insert sign]</td>
                                <td colspan="1" style="border: 1px solid black;">Date:</td>
                                <td colspan="2" style="border: 1px solid black;">${inspectionDate}</td>
                            </tr>

                            <tr>
                                <td colspan="18" style="text-align: center; font-weight: bold; border: 1px solid black;">
                                    WORK REQUIRED - SPAN ${spanNum}
                                </td>
                            </tr>
                            <tr>
                                <td colspan="2" style="text-align: center; border: 1px solid black;">Ref.</td>
                                <td colspan="9" style="text-align: center; border: 1px solid black;">Suggested Remedial Work</td>
                                <td colspan="3" style="text-align: center; border: 1px solid black;">Priority</td>
                                <td colspan="2" style="text-align: center; border: 1px solid black;">Estimated Cost</td>
                                <td colspan="2" style="text-align: center; border: 1px solid black;">Action</td>
                            </tr>
                            ${generateWorkRequiredRowsDynamic(spanWorks, targetWorkRows)}

                            <tr>
                                <td colspan="2" style="border: 1px solid black;">Name:</td>
                                <td colspan="5" style="border: 1px solid black;">${inspectorName}</td>
                                <td colspan="2" style="border: 1px solid black;">Signed:</td>
                                <td colspan="6" style="border: 1px solid black;">${inspectorName}</td>
                                <td colspan="1" style="border: 1px solid black;">Date:</td>
                                <td colspan="2" style="border: 1px solid black;">${inspectionDate}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            `;
            }
        }

        // 11. Close HTML and write to window
        htmlContent += `</body></html>`;
        
        bciWindow.document.open();
        bciWindow.document.write(htmlContent);
        bciWindow.document.close();
        bciWindow.focus();

    } catch (error) {
        console.error('BCI generation failed:', error);
        alert(`Error: ${error.message}`);
    }
}

// Updated combineData function - ensures defect codes are properly formatted as "6.1" not "6.1.1"
function combineData(elements, defects) {
    return elements.map(element => {
        const defect = defects.find(defect => 
            defect.element_no === element.element_number
        );
        
        // Format defect code as "type.number" (e.g., "6.1") - NOT "6.1.1"
        let defDisplay = '-';
        if (defect && defect.def && defect.defN) {
            defDisplay = `${defect.def}.${defect.defN}`;
        } else if (defect && defect.def) {
            defDisplay = defect.def;
        }

        return {
            ...element,
            inspection_date: defect ? defect.inspection_date : '-',
            s: defect ? defect.s : '-',
            ex: defect ? defect.ex : '-',
            def: defDisplay,
            defN: defect ? defect.defN : '-',
            w: defect ? defect.w : '-',
            p: defect ? defect.p : '-',
            cost: defect ? defect.cost : '',
            comments_remarks: defect ? defect.comments_remarks : '-',
            bci_crit: defect ? defect.bci_crit : '-',
            bci_av: defect ? defect.bci_av : '-'
        };
    });
}

// Updated generateBCITableRows - only shows "See multiple defects table"
function generateBCITableRows(data, spanDefects) {
    // Group defects by element number to identify which have multiple defects
    const defectsByElement = {};
    if (spanDefects) {
        spanDefects.forEach(defect => {
            if (!defectsByElement[defect.element_no]) {
                defectsByElement[defect.element_no] = [];
            }
            defectsByElement[defect.element_no].push(defect);
        });
    }

    let rows = "";
    const mergePattern = [7, 7, 7, 4, 9, 4];
    let currentPatternIndex = 0;
    let rowsRemainingInCurrentGroup = 0;
    let groupLabel = "";
    const groupLabels = [
        "Deck Elements",
        "Load-bearing Substructure",
        "Durability Elements",
        "Safety Elements",
        "Other Bridge Elements",
        "Ancillary Elements"
    ];

    data.forEach((item, index) => {
        if (rowsRemainingInCurrentGroup === 0) {
            rowsRemainingInCurrentGroup = mergePattern[currentPatternIndex];
            groupLabel = groupLabels[currentPatternIndex];
            currentPatternIndex++;
        }

        let defDisplay;
        if (item.def === undefined || item.def === null || item.def === '-') {
            defDisplay = '-';
        } else {
            defDisplay = item.def;
        }

        // Check if this element has multiple defects
        const hasMultipleDefects = defectsByElement[item.element_number] && 
                                   defectsByElement[item.element_number].length > 1;
        
        // ONLY show "See multiple defects table" - nothing else
        let commentsValue = '';
        if (hasMultipleDefects) {
            commentsValue = 'See multiple defects table';
        } else {
            const originalComment = item.comments_remarks || '';
            commentsValue = (originalComment === '-' || originalComment === '') ? '-' : originalComment;
        }

        const isFirstRowOfGroup = rowsRemainingInCurrentGroup === mergePattern[currentPatternIndex - 1];
        
        rows += `
            <tr>
                ${isFirstRowOfGroup ? `
                <td rowspan="${mergePattern[currentPatternIndex - 1]}" class="set-cell">
                    <div class="vertical-text">${groupLabel}</div>
                </td>
                ` : ''}
                <td>${item.element_number}</td>
                <td>${item.description}</td>
                <td>${item.s}</td>
                <td>${item.ex}</td>
                <td>${defDisplay}</td>
                <td>${item.w}</td>
                <td>${item.p}</td>
                <td>${item.cost}</td>
                <td>${commentsValue}</td>
            </tr>
        `;

        rowsRemainingInCurrentGroup--;
        
        if (currentPatternIndex === mergePattern.length && rowsRemainingInCurrentGroup === 0) {
            currentPatternIndex = 0;
        }
    });

    return rows;
}

// Simplified createActionButtons function
function createActionButtons(doc) {
    const actionsCell = document.createElement('td');
  
    // Edit Button
    const editButton = document.createElement('button');
    editButton.textContent = 'Edit';
    editButton.classList.add('normal-btn');
    editButton.title = 'Edit Report';
    editButton.onclick = function () {
        sessionStorage.setItem('inspectionStructureNumber', doc.structure_id);
        sessionStorage.setItem('inspectionDate', doc.date);
        sessionStorage.setItem('inspectionMode', 'edit');
        window.open('../inspection1/inspection1.html', '_blank');
    };
    actionsCell.appendChild(editButton);


    // NEW: Report Button
    const simpleReportButton = document.createElement('button');
    simpleReportButton.textContent = 'Report';
    simpleReportButton.classList.add('simple-report-button');
    simpleReportButton.title = 'Generate Report';
    simpleReportButton.addEventListener('click', async function(e) {
        e.stopPropagation();
        await generateSimplePDFReport(doc);
    });
    actionsCell.appendChild(simpleReportButton);




    // Create BCI button
    const bciButton = document.createElement('button');
    bciButton.textContent = 'BCI';
    bciButton.classList.add('bci-button');
    bciButton.addEventListener('click', async function() {
        await generateBCIForm(doc);
    });
    actionsCell.appendChild(bciButton);
  
    return actionsCell;
}









// Replace your existing updateBridgeModalData with this:
async function updateBridgeModalData(structureId) {
    console.log('Updating bridge modal for structure:', structureId);
    
    try {
        // Use the SAME endpoint that works in the Previous Inspections modal
        const response = await fetch(`/api/previousInspections?structureId=${structureId}`);
        const data = await response.json();
        
        if (data.documents && data.documents.length > 0) {
            // Sort by date - newest first (same as Previous Inspections modal)
            const sortedDocs = [...data.documents].sort((a, b) => {
                return new Date(b.date) - new Date(a.date);
            });
            
            const latestDoc = sortedDocs[0];
            console.log('Latest inspection:', latestDoc);
            console.log('BCI Av:', latestDoc.bci_av);
            console.log('BCI Crit:', latestDoc.bci_crit);
            console.log('Date:', latestDoc.date);
            
            // Update Last Inspected Date
            const lastInspectedElement = document.getElementById('lastInspected');
            if (lastInspectedElement && latestDoc.date) {
                let formattedDate = latestDoc.date;
                try {
                    const date = new Date(latestDoc.date);
                    if (!isNaN(date.getTime())) {
                        formattedDate = date.toLocaleDateString('en-GB', { 
                            month: 'short', 
                            year: 'numeric' 
                        });
                    }
                } catch(e) {
                    console.error('Date parsing error:', e);
                }
                lastInspectedElement.textContent = formattedDate;
                console.log('Date set to:', formattedDate);
            }
            
            // Update BCI Score - SAME logic as Previous Inspections modal
            const bciScoreElement = document.getElementById('bciScore');
            if (bciScoreElement && latestDoc.bci_av !== null && latestDoc.bci_av !== undefined) {
                const bciValue = Math.round(parseFloat(latestDoc.bci_av));
                console.log('BCI Value:', bciValue);
                
                let category = '';
                let color = '';
                
                if (bciValue >= 90) {
                    category = 'Excellent';
                    color = '#22c55e';
                } else if (bciValue >= 80) {
                    category = 'Good';
                    color = '#8ab4b0';
                } else if (bciValue >= 65) {
                    category = 'Fair';
                    color = '#eab308';
                } else if (bciValue >= 40) {
                    category = 'Poor';
                    color = '#f97316';
                } else {
                    category = 'Critical';
                    color = '#dc2626';
                }
                
                bciScoreElement.innerHTML = `${bciValue} - ${category}`;
                bciScoreElement.style.color = color;
                console.log('BCI set to:', bciScoreElement.innerHTML);
            } else if (bciScoreElement) {
                console.log('No bci_av found in latest inspection');
                bciScoreElement.innerHTML = 'No data - Pending';
                bciScoreElement.style.color = '#8a9ba8';
            }
        } else {
            console.log('No inspections found for bridge:', structureId);
            // No inspections found - show pending state
            const bciScoreElement = document.getElementById('bciScore');
            const lastInspectedElement = document.getElementById('lastInspected');
            
            if (bciScoreElement) {
                bciScoreElement.innerHTML = 'No data - Pending';
                bciScoreElement.style.color = '#8a9ba8';
            }
            if (lastInspectedElement) {
                lastInspectedElement.textContent = 'Not inspected';
            }
        }
    } catch (error) {
        console.error('Error fetching bridge data:', error);
        const bciScoreElement = document.getElementById('bciScore');
        const lastInspectedElement = document.getElementById('lastInspected');
        
        if (bciScoreElement) {
            bciScoreElement.innerHTML = 'Error loading data';
            bciScoreElement.style.color = '#dc2626';
        }
        if (lastInspectedElement) {
            lastInspectedElement.textContent = 'Unavailable';
        }
    }
}

// Function to get initials from bridge name
function getBridgeInitials(bridgeName) {
    if (!bridgeName) return '??';
    
    // Split by spaces and get first letters
    const words = bridgeName.trim().split(/\s+/);
    
    if (words.length === 1) {
        // Single word - take first two letters
        return words[0].substring(0, 2).toUpperCase();
    } else {
        // Multiple words - take first letter of first two words
        const firstInitial = words[0].charAt(0);
        const secondInitial = words[1].charAt(0);
        return (firstInitial + secondInitial).toUpperCase();
    }
}

// Update the modal title and avatar
function updateModalTitle() {
    const structureName = sessionStorage.getItem('structureName');
    const structureId = sessionStorage.getItem('structureId');
    const modalTitle = document.getElementById('modalTitle');
    const modalBridgeAvatar = document.getElementById('modalBridgeAvatar');
    const assetIdSpan = document.getElementById('assetId');
    const bridgeIdSpan = document.getElementById('bridgeId'); // For the structure ID in header
    
    // Update title
    if (modalTitle) {
        modalTitle.textContent = structureName || 'Unknown Bridge';
    }
    
    // Update avatar with bridge initials
    if (modalBridgeAvatar && structureName) {
        modalBridgeAvatar.textContent = getBridgeInitials(structureName);
    }
    
    // Update structure ID in bridge modal
    if (assetIdSpan && structureId) {
        assetIdSpan.textContent = structureId;
    }
    
    // Update structure ID in the header (if using the documents modal style header)
    if (bridgeIdSpan && structureId) {
        bridgeIdSpan.textContent = structureId;
    }
    
    // Update subtitle (old style, keep for compatibility)
    const subtitle = document.querySelector('.bridge-subtitle');
    if (subtitle && structureId) {
        subtitle.textContent = `Asset ID: ${structureId}`;
    }
    
    // Also update the bridge name in the documents modal
    const bridgeNameElement = document.getElementById('bridgeName');
    if (bridgeNameElement && structureName) {
        bridgeNameElement.textContent = structureName;
    }
    
    // Update the avatar in documents modal as well
    const docsModalAvatar = document.querySelector('#documentsModal .bridge-avatar');
    if (docsModalAvatar && structureName) {
        docsModalAvatar.textContent = getBridgeInitials(structureName);
    }
    
    // Update the structure ID in documents modal
    const docsBridgeId = document.querySelector('#documentsModal #bridgeId');
    if (docsBridgeId && structureId) {
        docsBridgeId.textContent = structureId;
    }
    
    // Fetch and display latest inspection data
    if (structureId) {
        updateBridgeModalData(structureId);
    }
}

window.generateSimplePDFReport = generatePDFReport; // ← add this line
