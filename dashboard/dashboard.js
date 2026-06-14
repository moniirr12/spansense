let criticalBridgesCount = 0;


const API_BASE = window.location.hostname === 'localhost' 
    ? 'http://localhost:3000' 
    : 'https://spansense.onrender.com';

document.addEventListener('DOMContentLoaded', function () {
    fetchBridgeCount();
    fetchTypeDistribution();
    fetchBCIDistribution();
    fetchConditionDistribution();
    fetchCriticalBridges();
    
    const changePageButton = document.getElementById('toHome');
    if (changePageButton) {
        changePageButton.addEventListener('click', function () {
            window.location.href = "../map/map.html";
        });
    }
});


(function(){
    const sb=document.getElementById('glassScrollbar'), th=document.getElementById('glassThumb');
    if(!sb||!th){console.warn('[Scrollbar] elements not found');return;}
    let drag=false, sy=0, sty=0;
    function m(){const st=window.scrollY||0,th=document.documentElement.scrollHeight,vh=window.innerHeight,dh=Math.max(1,th-vh),tr=sb.offsetHeight||1,r=vh/Math.max(1,th),h=Math.max(40,r*tr),mx=Math.max(0,tr-h);return{st,p:st/dh,tr,h,mx,dh}}
    function u(){const x=m();th.style.setProperty('height',x.h+'px','important');th.style.setProperty('top',(x.p*x.mx)+'px','important')}
    window.addEventListener('scroll',u,{passive:true});window.addEventListener('resize',u);
    th.addEventListener('mousedown',e=>{drag=true;sy=e.clientY;sty=m().p*m().mx;e.preventDefault()});
    sb.addEventListener('mousedown',e=>{if(e.target===th||th.contains(e.target))return;const r=sb.getBoundingClientRect(),y=e.clientY-r.top,x=m();window.scrollTo({top:Math.max(0,Math.min(1,y/x.tr))*x.dh,behavior:'smooth'})});
    window.addEventListener('mousemove',e=>{if(!drag)return;const x=m(),ny=sty+(e.clientY-sy),c=Math.max(0,Math.min(x.mx,ny));window.scrollTo(0,(c/Math.max(1,x.mx))*x.dh)});
    window.addEventListener('mouseup',()=>drag=false);
    new MutationObserver(()=>{clearTimeout(window._t);window._t=setTimeout(u,50)}).observe(document.body,{childList:true,subtree:true});
    u();[50,100,250,500,1000,2000].forEach(d=>setTimeout(u,d));
    window.updateGlassScrollbar=u;
})();

let conditionDistributionChart = null;
let typeChart = null;
let bciHistogramChart = null;

// Fetch total bridges count from your backend API
async function fetchBridgeCount() {
  const countElement = document.getElementById('bridge-count');
  
  try {
    countElement.textContent = 'Loading...';
    const response = await fetch(API_BASE + '/api/debug/count-test');
    
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    
    const data = await response.json();
    console.log('Full API response:', data); // Debug the complete response

    if (data.success && data.bridge_count !== undefined) {
      countElement.textContent = data.bridge_count;
    } else {
      throw new Error('Invalid response format');
    }
    
  } catch (error) {
    console.error('Fetch error:', error);
    countElement.textContent = 'Error';
    countElement.className = 'error';
    setTimeout(fetchBridgeCount, 3000); // Retry after 3 seconds
  }
}

// Initial fetch when page loads


async function fetchTypeDistribution() {
  try {
    const response = await fetch(API_BASE + '/api/bridges/type-distribution');
    
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    
    const result = await response.json();

      console.log('BCI API response:', result);
    
    if (result.success && result.data) {
      renderPieChart(result.data);
    } else {
      throw new Error('Invalid response format');
    }
  } catch (error) {
    console.error('Error fetching type distribution:', error);
    // Show error to user or retry
  }
}

function renderPieChart(typeData) {
  const ctx = document.getElementById('typeChart').getContext('2d');
  
  // Prepare data
  const labels = typeData.map(item => item.type || 'Unknown');
  const counts = typeData.map(item => item.count);
  
  // Colors for each type
  const backgroundColors = [
    'rgba(54, 162, 235, 0.7)',  // bridge - blue
    'rgba(75, 192, 192, 0.7)',  // footbridge - green
    'rgba(255, 159, 64, 0.7)',  // retaining wall - orange
    'rgba(153, 102, 255, 0.7)'  // any others - purple
  ];
  
  new Chart(ctx, {
    type: 'pie',
    data: {
      labels: labels,
      datasets: [{
        data: counts,
        backgroundColor: backgroundColors,
        borderWidth: 1
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: {
          position: 'bottom',
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              const label = context.label || '';
              const value = context.raw || 0;
              const total = context.dataset.data.reduce((a, b) => a + b, 0);
              const percentage = Math.round((value / total) * 100);
              return `${label}: ${value} (${percentage}%)`;
            }
          }
        }
      }
    }
  });
}


// Fetch BCI distribution data
async function fetchBCIDistribution() {
    try {
        const response = await fetch(API_BASE + '/api/bci-distribution', {
            credentials: 'include'
        });
        
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        
        const result = await response.json();
        
        if (result.success && result.data) {
            renderBCIHistogram(result.data);
        }
    } catch (error) {
        console.error('Error fetching BCI distribution:', error);
    }
}

// Fetch condition distribution over time
async function fetchConditionDistribution() {
    try {
        const response = await fetch(API_BASE + '/api/condition-distribution', {
            credentials: 'include'
        });
        
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        
        const result = await response.json();
        
        if (result.success && result.data) {
            renderConditionDistributionChart(result.data);
        }
    } catch (error) {
        console.error('Error fetching condition distribution:', error);
    }
}

// Render BCI histogram
function renderBCIHistogram(data) {
    const ctx = document.getElementById('bciHistogramChart').getContext('2d');
    
    const labels = data.map(item => item.bci_range);
    const counts = data.map(item => item.count);
    
    const labelMap = {
        '0-39': '0-39\n(Very Poor)',
        '40-49': '40-64\n(Poor)',
        '65-79': '65-79\n(Fair)',
        '80-89': '80-89\n(Good)',
        '90-100': '90-100\n(Very Good)'
    };
    
    const colors = ['#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16', '#22c55e'];
    
    new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels.map(l => labelMap[l]),
            datasets: [{
                label: 'Number of Bridges',
                data: counts,
                backgroundColor: colors,
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            aspectRatio: 2,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const total = context.dataset.data.reduce((a, b) => a + b, 0);
                            const pct = total > 0 ? ((context.parsed.y / total) * 100).toFixed(1) : 0;
                            return `${context.parsed.y} bridges (${pct}%)`;
                        }
                    }
                }
            },
            scales: {
                y: { beginAtZero: true, title: { display: true, text: 'Number of Bridges' } },
                x: { grid: { display: false } }
            }
        }
    });
}

// Render condition distribution over time
function renderConditionDistributionChart(data) {
    const canvas = document.getElementById('conditionDistributionChart');
    if (!canvas) {
        console.error('Canvas element conditionDistributionChart not found');
        return;
    }
    
    // ✅ Set explicit canvas dimensions for better visibility
    canvas.width = 800;
    canvas.height = 500;
    canvas.style.width = '100%';
    canvas.style.height = 'auto';
    
    if (conditionDistributionChart && typeof conditionDistributionChart.destroy === 'function') {
        conditionDistributionChart.destroy();
        conditionDistributionChart = null;
    }
    
    if (!data || !Array.isArray(data) || data.length === 0) {
        console.warn('No condition distribution data received:', data);
        const ctx = canvas.getContext('2d');
        conditionDistributionChart = new Chart(ctx, {
            type: 'bar',
            data: { 
                labels: ['No Data'], 
                datasets: [{ 
                    label: 'No inspection data available', 
                    data: [0], 
                    backgroundColor: '#cbd5e1' 
                }] 
            },
            options: { 
                responsive: true, 
                maintainAspectRatio: true, 
                plugins: { legend: { display: false } } 
            }
        });
        return;
    }
    
    const ctx = canvas.getContext('2d');
    
    // Filter out null period entries
    const filteredData = data.filter(item => item.period !== null);
    const labels = filteredData.map(item => item.period.toString());
    
    console.log('Condition distribution labels (years):', labels);
    
    // Calculate max value for Y-axis
    const allValues = [];
    filteredData.forEach(d => {
        allValues.push(d.very_good || 0);
        allValues.push(d.good || 0);
        allValues.push(d.fair || 0);
        allValues.push(d.poor || 0);
        allValues.push(d.very_poor || 0);
    });
    const maxValue = Math.max(...allValues, 10);
    
    conditionDistributionChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                { label: 'Excellent (90-100)', data: filteredData.map(d => d.very_good || 0), backgroundColor: '#22c55e' },
                { label: 'Good (80-89)', data: filteredData.map(d => d.good || 0), backgroundColor: '#84cc16' },
                { label: 'Fair (65-79)', data: filteredData.map(d => d.fair || 0), backgroundColor: '#eab308' },
                { label: 'Poor (40-64)', data: filteredData.map(d => d.poor || 0), backgroundColor: '#f97316' },
                { label: 'Critical (0-39)', data: filteredData.map(d => d.very_poor || 0), backgroundColor: '#ef4444' }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: { 
                    position: 'bottom', 
                    labels: { font: { size: 11 }, padding: 10, usePointStyle: true, boxWidth: 10 } 
                },
                tooltip: { 
                    mode: 'index',
                    callbacks: {
                        label: function(context) {
                            const label = context.dataset.label || '';
                            const value = context.raw || 0;
                            return `${label}: ${value}`;
                        }
                    }
                }
            },
            scales: {
                x: { 
                    title: { display: true, text: 'Year', font: { weight: 'bold' } }, 
                    grid: { display: false },
                    ticks: {
                        autoSkip: true,
                        maxRotation: 45,
                        minRotation: 45
                    }
                },
                y: { 
                    beginAtZero: true,
                    max: Math.ceil(maxValue * 1.1),
                    title: { display: true, text: 'Number of Bridges', font: { weight: 'bold' } },
                    ticks: {
                        stepSize: Math.ceil(maxValue / 5) || 2,
                        precision: 0
                    }
                }
            }
        }
    });
}

// Update DOMContentLoaded to fetch all chart data

(function() {
    const toggleBtn = document.getElementById('nightModeToggle');
    if (!toggleBtn) {
        console.log('Dark mode button not found');
        return;
    }
    
    // Toggle function
    toggleBtn.onclick = function(e) {
        e.preventDefault();
        document.body.classList.toggle('night-mode');
        
        if (document.body.classList.contains('night-mode')) {
            this.innerHTML = '<i class="fas fa-sun"></i>';
            localStorage.setItem('nightMode', 'on');
            console.log('Dark mode ON');
        } else {
            this.innerHTML = '<i class="fas fa-moon"></i>';
            localStorage.setItem('nightMode', 'off');
            console.log('Dark mode OFF');
        }
    };
    
    // Load saved preference
    if (localStorage.getItem('nightMode') === 'on') {
        document.body.classList.add('night-mode');
        toggleBtn.innerHTML = '<i class="fas fa-sun"></i>';
        console.log('Restored dark mode from storage');
    }
})();


async function fetchCriticalBridges() {
    try {
        const response = await fetch(API_BASE + '/api/dashboard/critical-bridges', {
            credentials: 'include'
        });

        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

        const result = await response.json();

        if (result.success && result.data) {
            criticalBridgesCount = result.data.length;  // Store the count
            updateHighRiskMetric(criticalBridgesCount);  // Update the card
            renderCriticalBridges(result.data);
        }
    } catch (error) {
        console.error('Error fetching critical bridges:', error);
        document.getElementById('critical-bridges-body').innerHTML = `
            <div class="row">
                <div style="color: var(--text-muted); font-size: 0.8rem;">Could not load data.</div>
            </div>`;
    }
}

function updateHighRiskMetric(count) {
    const metricValue = document.querySelector('.metric-icon-red').closest('.metric').querySelector('h3');
    if (metricValue) {
        metricValue.textContent = count;
    }
}

function renderCriticalBridges(data) {
    const tbody = document.getElementById('critical-bridges-body');

    if (!data.length) {
        tbody.innerHTML = `
            <div class="row">
                <div style="color: var(--text-muted); font-size: 0.8rem;">No bridges below BCI 55.</div>
            </div>`;
        return;
    }

    tbody.innerHTML = data.map(bridge => {
        const bci = bridge.overall_bciave !== null ? Math.round(bridge.overall_bciave) : '—';
        const isCritical = bridge.overall_bciave < 40;
        const badgeClass = isCritical ? 'risk-critical' : 'risk-high';
        const badgeLabel = isCritical ? 'Critical' : 'High';

        // Use template literals properly with ${} interpolation
        // Escape quotes in the onclick by using backticks or different quote styles
        return `
            <div class="row">
                <div>
                    <span class="bridge-id">${bridge.structure_id}</span>
                    <span class="bridge-location">${bridge.structure_name}</span>
                </div>
                <div><span class="risk-badge ${badgeClass}">${badgeLabel} · ${bci}</span></div>
                <div>${formatDate(bridge.inspection_date)}</div>
                <div>
                    <button class="action-btn download-btn" onclick="downloadReport('${bridge.structure_id}', '${bridge.structure_name.replace(/'/g, "\\'")}', '${bridge.inspection_date}')">
                        <i class="fas fa-download"></i> Report
                    </button>
                </div>
            </div>`;
    }).join('');
}

function formatDate(dateString) {
    if (!dateString) return '—';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return dateString;
    return date.toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
    });
}


window.downloadReport = async function downloadReport(structureId, structureName, inspectionDate) {
    var doc = {
        structure_id: String(structureId),
        structure_name: structureName || 'Structure ' + structureId,
        date: inspectionDate
    };

    if (typeof window.generateSimplePDFReport === 'function') {
        await generateSimplePDFReport(doc, 'open');
    } else {
        console.error('Report generator not loaded.');
        alert('Report generator not available.');
    }
}
