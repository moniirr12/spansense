// Mapping of item numbers to their importance levels
const importanceMapping = {
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
  };
  
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
  function calculateBCI(severityValues, extentValues, itemNumbers) {
    let bcsValues = [];
    let eifValues = []; // Array to store EIF values
    let eciValues = []; // Array to store ECI values with item numbers
  
    itemNumbers.forEach((itemno, index) => {
        const severity = severityValues[index] || 0; // Default to 0 if missing
        const extent = extentValues[index] || 0; // Default to 0 if missing
        const sPlusEx = `${severity}${extent}`; // Combine Severity and Extent
  
        // Calculate ECS (Element Condition Score) based on S+Ex
        const ecs = calculateECS(sPlusEx);
  
        // Get the importance level for the element
        const importance = importanceMapping[itemno] || "Medium"; // Default to "Medium" if not found
  
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
    });
  
    // Calculate BCIav and BCIcrit
    const bciAv = calculateBCIAv(bcsValues, eifValues); // Pass eifValues to calculateBCIAv
    const bciCrit = calculateBCICrit(eciValues); // Pass eciValues to calculateBCICrit
  
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
  
    function calculateBCICrit(eciValues) {
        // Define the specific elements to consider (critical elements)
        const specificElements = [1, 2, 3, 4, 11, 12];
    
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
    const { bciAv, bciCrit } = calculateBCI(severityValues, extentValues, itemNumbers);
  
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
                        ${generateBCITableRows(severityValues, extentValues, itemNumbers, descriptions)}
                    </tbody>
                </table>
            </body>
        </html>
    `);
  
    bciWindow.document.close();
  });
  
  // Helper function to generate table rows for the BCI form
  function generateBCITableRows(severityValues, extentValues, itemNumbers, descriptions) {
    let rows = "";
    for (let i = 0; i < itemNumbers.length; i++) {
        const severity = severityValues[i] || 0; // Default to 0 if missing
        const extent = extentValues[i] || 0; // Default to 0 if missing
        const sPlusEx = `${severity}${extent}`;
        const ecs = calculateECS(sPlusEx);
        const importance = importanceMapping[itemNumbers[i]] || "Medium";
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
  








// Tweens a BCI score element's displayed number instead of snapping straight
// to the new value, so edits to defects don't make the score jump abruptly.
const bciTweenFrames = new WeakMap();
function setBciValue(el, value) {
    if (!el) return;
    const target = parseFloat(value);
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
  const { bciAv, bciCrit } = calculateBCI(severityValues, extentValues, itemNumbers);

  // Update the BCI score fields in the DOM
  setBciValue(document.getElementById("bciAvResult"), bciAv);
  setBciValue(document.getElementById("bciCritResult"), bciCrit);

  // Return the values so they can be used elsewhere
  return { bciAv, bciCrit };
}