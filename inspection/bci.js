// Per-structure-type BCI scoring config. Each type defines which item
// numbers map to which importance level, which item numbers count as
// "critical" for BCIcrit, and which item numbers count toward the BCIav
// average (ancillary elements like Signs/Lighting/Services are excluded
// from BCIav in the real proformas for every type).
//
// Bridge values are unchanged from before this file became type-aware -
// verified item-by-item against a real "Bridge 1 BCI Pro Forma".
// Retaining wall values verified against 3 real completed retaining-wall
// proformas (Structure 11, GCC Structure 18, Structure 8).
const STRUCTURE_TYPE_CONFIG = {
  "Bridge": {
    importanceMapping: {
      1: "Very High",
      2: "High",
      3: "Very High",
      4: "Very High",
      5: "High",
      6: "High",
      7: "High",
      8: "High",
      9: "High",
      10: "High",
      11: "Very High",
      12: "Very High",
      13: "High",
      14: "Medium",
      15: "Medium",
      16: "Medium",
      17: "Medium",
      18: "High",
      19: "Medium",
      20: "Medium",
      21: "Medium",
      22: "Medium",
      23: "High",
      24: "Medium",
      25: "Low",
      26: "Medium",
      27: "Medium",
      28: "Medium",
      29: "Medium",
      30: "Low",
      31: "Medium",
      32: "Medium",
      33: "Low",
      34: "Medium"
    },
    // Primary deck element, secondary deck elements (x2), half joints,
    // pier/column, cross-head/capping beam.
    criticalElements: [1, 2, 3, 4, 11, 12],
    // Items 1-34 (Ancillary Elements 35-38 - Approach rails/Signs/
    // Lighting/Services - are excluded from BCIav in the real proforma).
    bciAvIncludedElements: Array.from({ length: 34 }, (_, i) => i + 1)
  },
  "Retaining wall": {
    importanceMapping: {
      1: "High",       // Foundations
      2: "Very High",  // Retaining wall: Primary
      3: "Very High",  // Retaining wall: Secondary
      4: "High",       // Parapet beam/plinth
      5: "Medium",     // Drainage
      6: "Medium",     // Movement/Expansion Joints
      7: "Medium",     // Surface finishes: wall
      8: "Medium",     // Surface finishes: handrail/parapet
      9: "High",       // Handrail/parapets/safety fences
      10: "Low",       // Carriageway: Top of Wall
      11: "Low",       // Carriageway: Foot of Wall
      12: "Low",       // Footway/verge: Top of Wall
      13: "Low",       // Footway/verge: Foot of Wall
      14: "Low",       // Embankment
      15: "Low",       // Superstructure drainage
      16: "Medium",    // Invert/river bed
      17: "Medium"     // Aprons
      // 18 (Signs), 19 (Lighting), 20 (Services): ancillary, no importance assigned.
    },
    // Foundations + Retaining wall Primary/Secondary.
    criticalElements: [1, 2, 3],
    // Items 1-17. Excludes ancillary 18-20.
    bciAvIncludedElements: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17]
  },
  // Per Highways Agency Guidance Document for Performance Measurement of
  // Highway Structures, Part B1, Table 11. No real completed Sign Gantry
  // proforma was available to validate against (unlike Bridge/Retaining
  // wall above), so criticalElements follows Section 4.6's documented rule
  // exactly - "SCSCrit is based on only those elements which have a Very
  // High importance classification" - rather than the +1 exception pattern
  // seen in the other two types.
  "Sign Gantry": {
    importanceMapping: {
      1: "High",       // Foundations
      2: "Very High",  // Truss/beams/cantilever
      3: "Very High",  // Transverse/horiz. bracing elements
      4: "Very High",  // Columns/supports/legs
      5: "Medium",     // Surface finishes: truss/beams/cantilever
      6: "Medium",     // Surface finishes: columns/supports/legs
      7: "Low",        // Surface finishes: other elements
      8: "High",       // Access/walkway/deck
      9: "High",       // Access ladder
      10: "High",      // Handrails/guard rails
      11: "Very High", // Base connections
      12: "Very High", // Support to longitudinal connection
      13: "Medium"     // Sign and signal supports
      // 14 (Signs/signals), 15 (Lighting), 16 (Services): ancillary, no importance assigned.
    },
    criticalElements: [2, 3, 4, 11, 12],
    // Items 1-13. Excludes ancillary 14-16.
    bciAvIncludedElements: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]
  }
};

function getStructureConfig(structureType) {
  return STRUCTURE_TYPE_CONFIG[structureType] || STRUCTURE_TYPE_CONFIG["Bridge"];
}

  // Mapping of S+Ex combinations to ECS values
  const ecsMapping = {
    "1A": 1.0,
    "2B": 2.0,
    "2C": 2.1,
    "2D": 2.3,
    "2E": 2.7,
    "3B": 3.0,
    "3C": 3.1,
    "3D": 3.3,
    "3E": 3.7,
    "4B": 4.0,
    "4C": 4.1,
    "4D": 4.3,
    "4E": 4.7,
    "5B": 5.0,
    "5C": 5.0,
    "5D": 5.0,
    "5E": 5.0
  };

  // Function to calculate BCI scores
  function calculateBCI(severityValues, extentValues, itemNumbers, structureType = "Bridge") {
    const config = getStructureConfig(structureType);
    let bcsValues = [];
    let eifValues = []; // Array to store EIF values
    let eciValues = []; // Array to store ECI values with item numbers
    let bciAvBcsValues = []; // Subset of bcsValues feeding BCIav (ancillary elements excluded)
    let bciAvEifValues = []; // Subset of eifValues feeding BCIav (ancillary elements excluded)

    itemNumbers.forEach((itemno, index) => {
        const severity = severityValues[index] || 0; // Default to 0 if missing
        const extent = extentValues[index] || 0; // Default to 0 if missing
        const sPlusEx = `${severity}${extent}`; // Combine Severity and Extent

        // Calculate ECS (Element Condition Score) based on S+Ex
        const ecs = calculateECS(sPlusEx);

        // Get the importance level for the element
        const importance = config.importanceMapping[itemno] || "Medium"; // Default to "Medium" if not found

        // Calculate ECF (Element Condition Factor) based on importance
        const ecf = calculateECF(importance, ecs);

        // Calculate ECI (Element Condition Index)
        const eci = calculateECI(ecs, ecf);
        eciValues.push({ itemno, eci }); // Store ECI value with item number

        // Calculate EIF (Element Importance Factor)
        const eif = calculateEIF(importance, severity); // Pass both importance and severity
        eifValues.push(eif); // Store EIF value

        // Calculate BCS (Bridge Condition Score)
        const bcs = eci * eif;
        bcsValues.push(bcs); // Store BCS value

        if (config.bciAvIncludedElements.includes(itemno)) {
            bciAvBcsValues.push(bcs);
            bciAvEifValues.push(eif);
        }
    });

    // Calculate BCIav and BCIcrit
    const bciAv = calculateBCIAv(bciAvBcsValues, bciAvEifValues);
    const bciCrit = calculateBCICrit(eciValues, structureType);

    return { bciAv, bciCrit };
  }

  // Function to calculate ECS based on S+Ex
  function calculateECS(sPlusEx) {
    if (sPlusEx === "00") return 0; // If S+Ex is "00", return 0
    // Look up the ECS value from the mapping
    // Default to 0.0 if the S+Ex combination is not found
    return ecsMapping[sPlusEx] || 0.0;
  }

  function calculateECF(importance, ecs) {
    if (importance === "Very High") return 0;
    if (importance === "High") return 0.3 - ((ecs - 1) * (0.3 / 4));
    if (importance === "Medium") return 0.6 - ((ecs - 1) * (0.6 / 4));
    if (importance === "Low") return 1.2 - ((ecs - 1) * (1.2 / 4));
    return 0;
  }

  function calculateECI(ecs, ecf) {
    return ecs - ecf >= 1 ? ecs - ecf : 1;
  }

  function calculateEIF(importance, severity) {
    if (severity === 0) return 0; // If severity is 0, EIF is also 0
    else if (importance === "Very High") return 2;
    else if (importance === "High") return 1.5;
    else if (importance === "Medium") return 1.2;
    else if (importance === "Low") return 1;
    else return 0; // Default case
  }

  function calculateBCIAv(bcsValues, eifValues) {
    const bcsSum = bcsValues.reduce((sum, bcs) => sum + bcs, 0); // Sum all BCS values
    const eifSum = eifValues.reduce((sum, eif) => sum + eif, 0); // Sum all EIF values
    const bcsAvg = bcsSum / eifSum; // Calculate bcsAvg as bcsSum / eifSum
    return 100 - 2 * ((bcsAvg ** 2) + (6.5 * bcsAvg) - 7.5); // Calculate BCIav
  }

    function calculateBCICrit(eciValues, structureType = "Bridge") {
        // Critical elements vary by structure type (see STRUCTURE_TYPE_CONFIG).
        const specificElements = getStructureConfig(structureType).criticalElements;

        // Filter eciValues to include only the specified elements
        const filteredEciValues = eciValues
        .filter(item => specificElements.includes(item.itemno)) // Filter by item number
        .map(item => item.eci); // Extract ECI values

        // ✅ FIX: If no critical elements have defects, return 100 (perfect condition)
        if (filteredEciValues.length === 0) {
            return 100.00;
        }

        // Calculate the maximum ECI value from the filtered list
        const eciMax = Math.max(...filteredEciValues);

        // Calculate BCIcrit
        return 100 - 2 * ((eciMax ** 2) + (6.5 * eciMax) - 7.5);
    }

  // Event listener for the button
  document.getElementById("showArrayButton")?.addEventListener("click", function () {
    const tableBody = document.querySelector("#inspectionElementsTable tbody");
    const rows = tableBody.querySelectorAll("tr.main-row"); // Select rows with the class "main-row"
    const severityValues = [];
    const extentValues = [];
    const itemNumbers = [];
    const descriptions = [];

    // Extract data from the table
    rows.forEach(row => {
        const itemno = row.querySelector(".itemno")?.textContent.trim() || null;
        const description = row.querySelector(".description")?.textContent.trim() || "N/A";
        const severity = row.querySelector(".severity")?.textContent.trim() || 0; // Default to 0 if missing
        const extent = row.querySelector(".extent")?.textContent.trim() || 0; // Default to 0 if missing

        itemNumbers.push(parseInt(itemno, 10) || 0); // Default to 0 if missing
        descriptions.push(description);
        severityValues.push(parseInt(severity, 10));
        extentValues.push(extent);
    });

    // Calculate BCI scores
    const structureType = sessionStorage.getItem('structureType') || 'Bridge';
    const { bciAv, bciCrit } = calculateBCI(severityValues, extentValues, itemNumbers, structureType);

    // Open a new window
    const bciWindow = window.open("", "BCI Form", "width=800,height=600");

    // Write the BCI form to the new window
    bciWindow.document.write(`
        <html>
            <head>
                <title>Bridge Condition Indicator (BCI)</title>
                <style>
                    body {
                        font-family: Arial, sans-serif;
                        margin: 20px;
                    }
                    table {
                        width: 100%;
                        border-collapse: collapse;
                        margin-bottom: 20px;
                    }
                    th, td {
                        border: 1px solid #ddd;
                        padding: 8px;
                        text-align: left;
                    }
                    th {
                        background-color: #f4f4f4;
                    }
                    .bci-results {
                        margin-top: 20px;
                        font-size: 1.2em;
                    }
                </style>
            </head>
            <body>
                <h2>Bridge Condition Indicator (BCI)</h2>
                <div class="bci-results">
                    <p><strong>BCI Average:</strong> ${bciAv.toFixed(2)}</p>
                    <p><strong>BCI Critical:</strong> ${bciCrit.toFixed(2)}</p>
                </div>
                <table>
                    <thead>
                        <tr>
                            <th>Set</th>
                            <th>No</th>
                            <th>Element Description</th>
                            <th>S</th>
                            <th>Ex</th>
                            <th>S+Ex</th>
                            <th>ECS</th>
                            <th>Element Importance</th>
                            <th>ECF</th>
                            <th>ECI</th>
                            <th>EIF</th>
                            <th>BCS</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${generateBCITableRows(severityValues, extentValues, itemNumbers, descriptions, structureType)}
                    </tbody>
                </table>
            </body>
        </html>
    `);

    bciWindow.document.close();
  });

  // Helper function to generate table rows for the BCI form
  function generateBCITableRows(severityValues, extentValues, itemNumbers, descriptions, structureType = "Bridge") {
    const config = getStructureConfig(structureType);
    let rows = "";
    for (let i = 0; i < itemNumbers.length; i++) {
        const severity = severityValues[i] || 0; // Default to 0 if missing
        const extent = extentValues[i] || 0; // Default to 0 if missing
        const sPlusEx = `${severity}${extent}`;
        const ecs = calculateECS(sPlusEx);
        const importance = config.importanceMapping[itemNumbers[i]] || "Medium";
        const ecf = calculateECF(importance, ecs);
        const eci = calculateECI(ecs, ecf);
        const eif = calculateEIF(importance, severity);
        const bcs = eci * eif;

        rows += `
            <tr>
                <td>${descriptions[i]}</td>
                <td>${itemNumbers[i]}</td>
                <td>${descriptions[i]}</td>
                <td>${severity}</td>
                <td>${extent}</td>
                <td>${sPlusEx}</td>
                <td>${ecs.toFixed(2)}</td>
                <td>${importance}</td>
                <td>${ecf.toFixed(2)}</td>
                <td>${eci.toFixed(2)}</td>
                <td>${eif.toFixed(2)}</td>
                <td>${bcs.toFixed(2)}</td>
            </tr>
        `;
    }
    return rows;
}





// Colour bands matching the severity/status palette used elsewhere in the
// app (sev-1..4 and the no-defects/not-inspected greens/ambers), with
// brighter night-mode variants for contrast against the dark card background.
function getBciColor(value) {
    const isDark = document.body.classList.contains('night-mode');
    if (value >= 85) return isDark ? '#8ab4b0' : '#2d7a6e';   // good
    if (value >= 65) return isDark ? '#d4a84a' : '#BA7517';   // fair
    if (value >= 40) return isDark ? '#e8a0a0' : '#c47070';   // poor
    return isDark ? '#e07070' : '#c0392b';                    // critical
}

// Same bands as getBciColor, as a card-background class instead of a text
// colour - see .stat-card.bci-band-* in inspection.css. spans.js's sidebar
// sync mirrors this class onto the sticky sidebar's copy of the card too.
const BCI_BAND_CLASSES = ['bci-band-good', 'bci-band-fair', 'bci-band-poor', 'bci-band-critical'];
window.BCI_BAND_CLASSES = BCI_BAND_CLASSES;
function getBciBandClass(value) {
    if (value >= 85) return 'bci-band-good';
    if (value >= 65) return 'bci-band-fair';
    if (value >= 40) return 'bci-band-poor';
    return 'bci-band-critical';
}

// Tweens a BCI score element's displayed number instead of snapping straight
// to the new value, so edits to defects don't make the score jump abruptly.
const bciTweenFrames = new WeakMap();
function setBciValue(el, value) {
    if (!el) return;
    el.classList.remove('stat-loading');
    const target = parseFloat(value);
    el.style.color = getBciColor(target);
    const card = el.closest('.stat-card');
    if (card) {
        BCI_BAND_CLASSES.forEach(c => card.classList.remove(c));
        card.classList.add(getBciBandClass(target));
    }
    const current = parseFloat(el.textContent);
    if (isNaN(current) || Math.abs(target - current) < 0.005) {
        el.textContent = target.toFixed(2);
        return;
    }

    const pending = bciTweenFrames.get(el);
    if (pending) cancelAnimationFrame(pending);

    const duration = 450;
    const start = performance.now();
    function step(now) {
        const t = Math.min(1, (now - start) / duration);
        const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
        el.textContent = (current + (target - current) * eased).toFixed(2);
        if (t < 1) {
            bciTweenFrames.set(el, requestAnimationFrame(step));
        } else {
            bciTweenFrames.delete(el);
        }
    }
    bciTweenFrames.set(el, requestAnimationFrame(step));
}
window.setBciValue = setBciValue;

function updateBCIScores() {
  // Get all main rows
  const mainRows = document.querySelectorAll("#inspectionElementsTable tbody tr.main-row");

  // Arrays to store severity, extent, and item numbers
  const severityValues = [];
  const extentValues = [];
  const itemNumbers = [];

  // Extract data from the table
  mainRows.forEach((row) => {
    const itemno = row.querySelector(".itemno")?.textContent.trim() || 0;
    const severity = row.querySelector(".severity")?.textContent.trim() || 0;
    const extent = row.querySelector(".extent")?.textContent.trim() || 0;

    itemNumbers.push(parseInt(itemno, 10));
    severityValues.push(parseInt(severity, 10));
    extentValues.push(extent);
  });

  // Calculate BCI scores
  const structureType = sessionStorage.getItem('structureType') || 'Bridge';
  const { bciAv, bciCrit } = calculateBCI(severityValues, extentValues, itemNumbers, structureType);

  // Update the BCI score fields in the DOM
  setBciValue(document.getElementById("bciAvResult"), bciAv);
  setBciValue(document.getElementById("bciCritResult"), bciCrit);

  // Return the values so they can be used elsewhere
  return { bciAv, bciCrit };
}

// Export the function
module.exports = updateBCIScores;
