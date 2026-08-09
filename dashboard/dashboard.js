let criticalBridgesCount = 0;


var API_BASE = window.location.hostname === 'localhost'
    ? 'http://localhost:3000'
    : 'https://spansense.onrender.com';

document.addEventListener('DOMContentLoaded', function () {
    fetchBridgeCount();
    fetchTypeDistribution();
    fetchAvgBciByType();
    fetchBCIDistribution();
    fetchConditionDistribution();
    fetchCriticalBridges();
    fetchBciSummary();
    fetchRecentActivity();
    fetchDeteriorationForecast();
    initBciChartToggle();
    checkSessionAndInitReview();

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

let bciChartInstance = null;
let bciDistributionData = null;
let conditionDistributionData = null;
let activeBciView = 'current';

function initBciChartToggle() {
    const buttons = document.querySelectorAll('.chart-toggle-btn');
    buttons.forEach(btn => {
        btn.addEventListener('click', function () {
            buttons.forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            activeBciView = this.dataset.view;
            renderActiveBciChart();
        });
    });
}

function renderActiveBciChart() {
    if (activeBciView === 'trend') {
        if (conditionDistributionData) renderConditionDistributionChart(conditionDistributionData);
    } else {
        if (bciDistributionData) renderBCIHistogram(bciDistributionData);
    }
}

// Fetch total bridges count from your backend API
async function fetchBridgeCount() {
  const countElement = document.getElementById('bridge-count');
  
  try {
    countElement.textContent = 'Loading...';
    const response = await fetch(API_BASE + '/api/debug/count-test');
    
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    
    const data = await response.json();

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

    
    if (result.success && result.data) {
      renderTypeBarChart(result.data);
    } else {
      throw new Error('Invalid response format');
    }
  } catch (error) {
    console.error('Error fetching type distribution:', error);
    // Show error to user or retry
  }
}

// Structure-type identity colours - same swatch as the map's own per-type
// markers (see typeFill in map/map.js), so "Bridges" is always this colour
// on every chart, instead of whatever a sort-order index happened to land on.
const TYPE_COLORS = {
  bridge: '#2c645c',
  footbridge: '#4f9088',
  culvert: '#c79a4b',
  retaining_wall: '#9b4f4f',
  sign_gantry: '#7a6fb0'
};
const TYPE_LABELS = {
  bridge: 'Bridge',
  footbridge: 'Footbridge',
  culvert: 'Culvert',
  retaining_wall: 'Retaining Wall',
  sign_gantry: 'Sign Gantry'
};
function typeKey(type) { return (type || '').toLowerCase().replace(/\s+/g, '_'); }
function typeColor(type) { return TYPE_COLORS[typeKey(type)] || '#5b8c8a'; }
function typeLabel(type) { return TYPE_LABELS[typeKey(type)] || (type || 'Unknown'); }

// Draws each bar's value just past its end in muted ink - never the bar's
// own colour, so it stays legible against every band. Chart.js has no
// built-in data-label support; this is a small plugin instead of pulling in
// the chartjs-plugin-datalabels dependency for one label per chart.
const barEndLabelPlugin = {
  id: 'barEndLabel',
  afterDatasetsDraw(chart) {
    const { ctx } = chart;
    const isNight = document.body.classList.contains('night-mode');
    ctx.save();
    ctx.font = '600 11px Inter, -apple-system, sans-serif';
    ctx.fillStyle = isNight ? '#9ab0b8' : '#55676c';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    chart.getDatasetMeta(0).data.forEach((bar, i) => {
      const value = chart.data.datasets[0].data[i];
      if (value == null) return;
      ctx.fillText(Math.round(value), bar.x + 8, bar.y);
    });
    ctx.restore();
  }
};

// Renders Chart.js's tooltip as a styled HTML element (see .chart-tooltip in
// dashboard.css) instead of the plain canvas-drawn default, matching the
// tooltip already shipped on twinView's BCI trend chart rather than every
// chart having its own generic look. Needs .chart-body (the canvas's parent)
// to be position:relative, which dashboard.css sets.
function externalTooltipHandler(context) {
  const { chart, tooltip } = context;
  let el = chart.canvas.parentNode.querySelector('.chart-tooltip');
  if (!el) {
    el = document.createElement('div');
    el.className = 'chart-tooltip';
    chart.canvas.parentNode.appendChild(el);
  }
  if (tooltip.opacity === 0) {
    el.style.opacity = '0';
    return;
  }
  const title = (tooltip.title || []).join(' ');
  const body = tooltip.body ? tooltip.body.map(b => b.lines.join(' ')).join('<br>') : '';
  el.innerHTML = (title ? '<b>' + title + '</b>' : '') + body;
  el.style.opacity = '1';
  el.style.left = chart.canvas.offsetLeft + tooltip.caretX + 'px';
  el.style.top = chart.canvas.offsetTop + tooltip.caretY + 'px';
}

function renderTypeBarChart(typeData) {
  const ctx = document.getElementById('typeChart').getContext('2d');

  // Sort by count descending so the most common type reads first.
  const sorted = [...typeData].sort((a, b) => b.count - a.count);
  const labels = sorted.map(item => typeLabel(item.type));
  const counts = sorted.map(item => item.count);
  const colors = sorted.map(item => typeColor(item.type));

  new Chart(ctx, {
    type: 'bar',
    plugins: [barEndLabelPlugin],
    data: {
      labels: labels,
      datasets: [{
        label: 'Structures',
        data: counts,
        backgroundColor: colors,
        borderWidth: 0,
        borderRadius: 6,
        barPercentage: 0.7,
        categoryPercentage: 0.75
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: true,
      aspectRatio: 1.4,
      layout: { padding: { right: 30 } },
      plugins: {
        legend: { display: false },
        tooltip: {
          enabled: false,
          external: externalTooltipHandler,
          callbacks: {
            title: (items) => items[0]?.label || '',
            label: function(context) {
              const value = context.raw || 0;
              const total = context.dataset.data.reduce((a, b) => a + b, 0);
              const percentage = total > 0 ? Math.round((value / total) * 100) : 0;
              return `${value} structures (${percentage}%)`;
            }
          }
        }
      },
      scales: {
        x: { beginAtZero: true, ticks: { precision: 0 }, title: { display: true, text: 'Number of Structures' } },
        y: { grid: { display: false } }
      }
    }
  });
}

let avgBciByTypeChartInstance = null;

async function fetchAvgBciByType() {
  try {
    const response = await fetch(API_BASE + '/api/dashboard/avg-bci-by-type', {
      credentials: 'include'
    });

    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

    const result = await response.json();

    if (result.success && result.data) {
      renderAvgBciByTypeChart(result.data);
    }
  } catch (error) {
    console.error('Error fetching average BCI by type:', error);
  }
}

function renderAvgBciByTypeChart(typeData) {
  if (avgBciByTypeChartInstance) {
    avgBciByTypeChartInstance.destroy();
    avgBciByTypeChartInstance = null;
  }

  const ctx = document.getElementById('avgBciByTypeChart').getContext('2d');

  const sorted = [...typeData].sort((a, b) => b.avg_bci - a.avg_bci);
  const labels = sorted.map(item => typeLabel(item.type));
  const values = sorted.map(item => item.avg_bci);
  // Coloured by condition band (bciTier), not by type identity - the value
  // being plotted here is a condition score, so colour should say "how good
  // is this score" rather than "which type is this" (typeColor is for the
  // Asset Inventory chart above, where the value itself is just a count).
  const colors = values.map(v => bciTier(v).color);

  avgBciByTypeChartInstance = new Chart(ctx, {
    type: 'bar',
    plugins: [barEndLabelPlugin],
    data: {
      labels: labels,
      datasets: [{
        label: 'Average BCI',
        data: values,
        backgroundColor: colors,
        borderWidth: 0,
        borderRadius: 6,
        barPercentage: 0.7,
        categoryPercentage: 0.75
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: true,
      aspectRatio: 1.4,
      layout: { padding: { right: 30 } },
      plugins: {
        legend: { display: false },
        tooltip: {
          enabled: false,
          external: externalTooltipHandler,
          callbacks: {
            title: (items) => items[0]?.label || '',
            label: function(context) { return `Average BCI: ${context.raw}`; }
          }
        }
      },
      scales: {
        x: { beginAtZero: true, max: 100, title: { display: true, text: 'Average BCI' } },
        y: { grid: { display: false } }
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
            bciDistributionData = result.data;
            renderActiveBciChart();
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
            conditionDistributionData = result.data;
            renderActiveBciChart();
        }
    } catch (error) {
        console.error('Error fetching condition distribution:', error);
    }
}

// Render BCI histogram
function renderBCIHistogram(data) {
    if (bciChartInstance) {
        bciChartInstance.destroy();
        bciChartInstance = null;
    }

    const ctx = document.getElementById('bciHistogramChart').getContext('2d');

    const labels = data.map(item => item.bci_range);
    const counts = data.map(item => item.count);

    // Band names are explained once by the shared .bci-legend below the
    // chart, so the axis just needs the bare numeric ranges here.
    const labelMap = {
        '0-39': '0-39',
        '40-64': '40-64',
        '65-79': '65-79',
        '80-89': '80-89',
        '90-100': '90-100'
    };

    // Same 5-band semantic palette used by the condition-over-time chart.
    const colors = ['#ef4444', '#f97316', '#eab308', '#84cc16', '#22c55e'];

    bciChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels.map(l => labelMap[l]),
            datasets: [{
                label: 'Number of Bridges',
                data: counts,
                backgroundColor: colors,
                borderWidth: 0,
                borderRadius: 6
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
                            const pct = total > 0 ? Math.round((context.parsed.y / total) * 100) : 0;
                            return `${context.parsed.y} (${pct}%)`;
                        }
                    }
                }
            },
            scales: {
                y: { beginAtZero: true, ticks: { precision: 0 }, title: { display: true, text: 'Number of Bridges' } },
                x: { grid: { display: false } }
            }
        }
    });
}

// Render condition distribution over time
function renderConditionDistributionChart(data) {
    const canvas = document.getElementById('bciHistogramChart');
    if (!canvas) {
        console.error('Canvas element bciHistogramChart not found');
        return;
    }

    if (bciChartInstance) {
        bciChartInstance.destroy();
        bciChartInstance = null;
    }

    if (!data || !Array.isArray(data) || data.length === 0) {
        console.warn('No condition distribution data received:', data);
        const ctx = canvas.getContext('2d');
        bciChartInstance = new Chart(ctx, {
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
    
    bciChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                { label: 'Very Good (90-100)', data: filteredData.map(d => d.very_good || 0), backgroundColor: '#22c55e', borderRadius: 4 },
                { label: 'Good (80-89)', data: filteredData.map(d => d.good || 0), backgroundColor: '#84cc16', borderRadius: 4 },
                { label: 'Fair (65-79)', data: filteredData.map(d => d.fair || 0), backgroundColor: '#eab308', borderRadius: 4 },
                { label: 'Poor (40-64)', data: filteredData.map(d => d.poor || 0), backgroundColor: '#f97316', borderRadius: 4 },
                { label: 'Very Poor (0-39)', data: filteredData.map(d => d.very_poor || 0), backgroundColor: '#ef4444', borderRadius: 4 }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: { display: false },
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
        return;
    }
    
    // Toggle function
    toggleBtn.onclick = function(e) {
        e.preventDefault();
        document.body.classList.toggle('night-mode');
        
        if (document.body.classList.contains('night-mode')) {
            this.innerHTML = '<i class="fas fa-sun"></i>';
            localStorage.setItem('nightMode', 'on');
        } else {
            this.innerHTML = '<i class="fas fa-moon"></i>';
            localStorage.setItem('nightMode', 'off');
        }
    };
    
    // Load saved preference, defaulting to dark unless the system explicitly prefers light
    const savedNightMode = localStorage.getItem('nightMode');
    const systemPrefersLight = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches;

    // The preload snippet in <head> forces a dark background to avoid a flash;
    // now that the real theme is decided, drop it so the background can't stay dark once night-mode is removed.
    document.documentElement.classList.remove('nm-preload');

    if (savedNightMode === 'on' || (savedNightMode === null && !systemPrefersLight)) {
        document.body.classList.add('night-mode');
        toggleBtn.innerHTML = '<i class="fas fa-sun"></i>';
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
            <tr><td colspan="4" style="color: var(--text-muted); font-size: 0.8rem;">Could not load data.</td></tr>`;
    }
}

function updateHighRiskMetric(count) {
    const metricValue = document.querySelector('.metric-icon-red').closest('.metric').querySelector('h3');
    if (metricValue) {
        metricValue.textContent = count;
    }
}

async function fetchBciSummary() {
    const avgEl = document.getElementById('avgBciMetricValue');
    const critEl = document.getElementById('criticalBciMetricValue');
    try {
        const response = await fetch(API_BASE + '/api/dashboard/bci-summary', { credentials: 'include' });
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const result = await response.json();
        if (result.success) {
            if (avgEl) avgEl.textContent = result.avgBci !== null ? Math.round(result.avgBci) : '—';
            if (critEl) critEl.textContent = result.avgBciCrit !== null ? Math.round(result.avgBciCrit) : '—';
        }
    } catch (error) {
        console.error('Error fetching BCI summary:', error);
        if (avgEl) avgEl.textContent = '—';
        if (critEl) critEl.textContent = '—';
    }
}

// Every metric card jumps to the section it summarizes on click.
window.scrollToDashboardSection = function scrollToDashboardSection(id) {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

function renderCriticalBridges(data) {
    const tbody = document.getElementById('critical-bridges-body');

    if (!data.length) {
        tbody.innerHTML = `
            <tr><td colspan="4" style="color: var(--text-muted); font-size: 0.8rem;">No structures below BCI avg 40.</td></tr>`;
        return;
    }

    // Every row here is already BCI avg < 40, i.e. the Very Poor band on its
    // own (see the BCI Score Distribution legend) - no Poor/Very Poor split
    // to make here now that the list itself is scoped to just that band.
    tbody.innerHTML = data.map(bridge => {
        const bci = bridge.overall_bciave !== null ? Math.round(bridge.overall_bciave) : '—';

        return `
            <tr>
                <td>
                    <span class="bridge-id">${bridge.structure_id}</span>
                    <span class="bridge-location">${bridge.structure_name}</span>
                </td>
                <td><span class="risk-badge risk-critical">Very Poor · ${bci}</span></td>
                <td>${formatDate(bridge.inspection_date)}</td>
                <td>
                    <button class="action-btn download-btn" onclick="downloadReport('${bridge.structure_id}', '${bridge.structure_name.replace(/'/g, "\\'")}', '${bridge.inspection_date}')">
                        <i class="fas fa-download"></i> Report
                    </button>
                </td>
            </tr>`;
    }).join('');
}

/* ============================================================
   DETERIORATION FORECAST — "Heading Toward Very Poor"
   Same BCI-avg/40 threshold as the Very Poor list above, just
   forward-looking: fetches all three granularities up front (the
   portfolio is small enough that this is cheaper than a round-trip per
   toggle click) and fcSwitch just flips which pre-rendered view is shown.
   ============================================================ */
let fcStructureRows = []; // full unfiltered list, so search can re-render instantly with no round trip
const FC_PAGE_SIZE = 5;
let fcVisibleCount = FC_PAGE_SIZE;

async function fetchDeteriorationForecast() {
    const fail = () => {
        document.getElementById('fc-structures-body').innerHTML =
            `<tr><td colspan="4" style="color: var(--text-muted); font-size: 0.8rem;">Could not load data.</td></tr>`;
        document.getElementById('fc-category-body').innerHTML =
            `<tr><td colspan="5" style="color: var(--text-muted); font-size: 0.8rem;">Could not load data.</td></tr>`;
        document.getElementById('fc-portfolio-body').textContent = 'Could not load data.';
    };
    try {
        const [structures, category, portfolio] = await Promise.all([
            fetch(API_BASE + '/api/dashboard/deterioration-forecast?granularity=structures', { credentials: 'include' }).then(r => r.json()),
            fetch(API_BASE + '/api/dashboard/deterioration-forecast?granularity=category', { credentials: 'include' }).then(r => r.json()),
            fetch(API_BASE + '/api/dashboard/deterioration-forecast?granularity=portfolio', { credentials: 'include' }).then(r => r.json())
        ]);
        fcStructureRows = structures.rows || [];
        renderForecastStructures(fcStructureRows);
        renderForecastCategory(category.rows || []);
        renderForecastPortfolio((portfolio.rows || [])[0] || null, portfolio.withinYears);
    } catch (error) {
        console.error('Error fetching deterioration forecast:', error);
        fail();
    }
}

function fcFilteredStructureRows() {
    const term = (document.getElementById('fcStructureSearch')?.value || '').trim().toLowerCase();
    return term ? fcStructureRows.filter(r => r.structureName.toLowerCase().includes(term)) : fcStructureRows;
}

document.getElementById('fcStructureSearch')?.addEventListener('input', function () {
    fcVisibleCount = FC_PAGE_SIZE; // a new search is a new list - start from the top again
    renderForecastStructures(fcFilteredStructureRows());
});

window.fcShowMoreStructures = function () {
    fcVisibleCount += FC_PAGE_SIZE;
    renderForecastStructures(fcFilteredStructureRows());
};

function formatForecastMonth(yyyymm) {
    if (!yyyymm) return '—';
    const [y, m] = yyyymm.split('-').map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
}

// Shared across the structures/category/portfolio tables - one rendering
// rule per status regardless of which granularity produced the row.
function fcStatusCell(row) {
    if (row.status === 'projected') {
        const soon = row.yearsToThreshold <= 2;
        const yrLabel = row.yearsToThreshold === 1 ? '1 yr' : `${row.yearsToThreshold} yrs`;
        return `<div class="fc-when${soon ? ' fc-soon' : ''}"><div class="date">${formatForecastMonth(row.projectedCrossingDate)}</div><div class="rel">in ${yrLabel}</div></div>`;
    }
    const labels = {
        beyond_horizon: 'Beyond 5-yr horizon',
        no_decline: 'No decline detected',
        already_critical: 'Already below threshold',
        insufficient_history: 'Insufficient history'
    };
    const cls = row.status === 'already_critical' ? 'fc-status fc-status-crit' : 'fc-status';
    return `<span class="${cls}">${labels[row.status] || row.status}</span>`;
}

// Solid line through the row's real BCI-avg readings; a dashed continuation
// past the last one for anything with a fitted decline (projected/beyond
// horizon) - to the actual crossing point for 'projected', or a flat +5y
// extrapolation for 'beyond_horizon' so there's still something to see even
// though it doesn't reach the threshold. No dashed segment otherwise -
// 'no_decline' has nothing to extrapolate toward.
function renderSparkline(series, row, width, height) {
    width = width || 72; height = height || 26;
    if (!series || series.length < 2) return '';
    const padX = 3, padY = 3;
    const YEAR_MS = 365.25 * 24 * 60 * 60 * 1000;
    const pts = series.map(p => ({ t: new Date(p.t).getTime(), v: p.v }));
    const last = pts[pts.length - 1];

    let extra = null;
    if (row.slopePerYear != null && (row.status === 'projected' || row.status === 'beyond_horizon')) {
        if (row.status === 'projected' && row.projectedCrossingDate) {
            extra = { t: new Date(row.projectedCrossingDate + '-01').getTime(), v: 40 };
        } else {
            extra = { t: last.t + 5 * YEAR_MS, v: last.v + row.slopePerYear * 5 };
        }
    }

    let minV = Math.min(...pts.map(p => p.v), extra ? extra.v : Infinity);
    let maxV = Math.max(...pts.map(p => p.v), extra ? extra.v : -Infinity);
    minV = Math.max(0, minV - 3); maxV = Math.min(100, maxV + 3);
    if (maxV - minV < 6) { minV = Math.max(0, minV - 3); maxV = Math.min(100, maxV + 3); }

    const minT = pts[0].t, maxT = extra ? extra.t : last.t;
    const spanT = Math.max(1, maxT - minT);
    const x = t => padX + ((t - minT) / spanT) * (width - padX * 2);
    const y = v => height - padY - ((Math.max(minV, Math.min(maxV, v)) - minV) / (maxV - minV)) * (height - padY * 2);

    let svg = `<svg class="fc-spark" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`;
    svg += `<polyline points="${pts.map(p => `${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ')}" fill="none" stroke="#5b8c8a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`;
    if (extra) {
        const dashColor = row.status === 'projected' ? '#c0392b' : '#c28b5a';
        svg += `<polyline points="${x(last.t).toFixed(1)},${y(last.v).toFixed(1)} ${x(extra.t).toFixed(1)},${y(extra.v).toFixed(1)}" fill="none" stroke="${dashColor}" stroke-width="2" stroke-linecap="round" stroke-dasharray="3 3"/>`;
        svg += `<circle cx="${x(extra.t).toFixed(1)}" cy="${y(extra.v).toFixed(1)}" r="2.6" fill="none" stroke="${dashColor}" stroke-width="1.6"/>`;
    }
    svg += `<circle cx="${x(last.t).toFixed(1)}" cy="${y(last.v).toFixed(1)}" r="2.4" fill="#5b8c8a"/>`;
    svg += '</svg>';
    return svg;
}

function renderForecastStructures(rows) {
    const tbody = document.getElementById('fc-structures-body');
    const moreWrap = document.getElementById('fc-structures-more');
    if (!rows.length) {
        tbody.innerHTML = `<tr><td colspan="4" style="color: var(--text-muted); font-size: 0.8rem;">Nothing trending toward Very Poor right now.</td></tr>`;
        if (moreWrap) moreWrap.innerHTML = '';
        return;
    }
    const visible = rows.slice(0, fcVisibleCount);
    tbody.innerHTML = visible.map(r => `
        <tr>
            <td>
                <span class="bridge-name">${r.structureName}</span>
                <span class="bridge-location">${r.type} · ${r.dataPoints} inspections since ${r.historySince}</span>
            </td>
            <td>${renderSparkline(r.series, r)}</td>
            <td class="bridge-id">${r.currentBciAve}</td>
            <td>${fcStatusCell(r)}</td>
        </tr>`).join('');

    if (moreWrap) {
        const remaining = rows.length - visible.length;
        moreWrap.innerHTML = remaining > 0
            ? `<button type="button" class="action-btn download-btn" onclick="fcShowMoreStructures()">Show ${Math.min(FC_PAGE_SIZE, remaining)} more <span class="fc-more-count">(${remaining} left)</span></button>`
            : '';
    }
}

function renderForecastCategory(rows) {
    const tbody = document.getElementById('fc-category-body');
    if (!rows.length) {
        tbody.innerHTML = `<tr><td colspan="5" style="color: var(--text-muted); font-size: 0.8rem;">Not enough history yet.</td></tr>`;
        return;
    }
    tbody.innerHTML = rows.map(r => `
        <tr>
            <td><span class="bridge-name">${r.type}</span></td>
            <td>${renderSparkline(r.series, r)}</td>
            <td class="bridge-id">${r.structureCount}</td>
            <td class="bridge-id">${r.avgBciAve ?? '—'}</td>
            <td>${fcStatusCell(r)}</td>
        </tr>`).join('');
}

// Full-width chart for the whole-stock view: one averaged line (not the
// per-type tangle the sparkline mechanism would produce) with the min/max
// spread per year as a shaded band behind it, same visual convention as
// twin.js's own BCI trend chart (viewBox + width:100% so the time axis
// stretches to fill the card, true height otherwise) - bigger than a row
// sparkline on purpose, since this is the single most important line on
// the page, not one row among many.
function renderPortfolioChart(row) {
    const series = row.series || [];
    if (series.length < 2) return '<div class="fc-chart-empty">Not enough history yet to chart.</div>';
    const W = 600, H = 170, padX = 8, padY = 14, padBottom = 26;
    const YEAR_MS = 365.25 * 24 * 60 * 60 * 1000;
    const pts = series.map(p => ({ t: new Date(p.t).getTime(), v: p.v, min: p.min ?? p.v, max: p.max ?? p.v }));
    const last = pts[pts.length - 1];

    let extra = null;
    if (row.slopePerYear != null && (row.status === 'projected' || row.status === 'beyond_horizon')) {
        extra = (row.status === 'projected' && row.projectedCrossingDate)
            ? { t: new Date(row.projectedCrossingDate + '-01').getTime(), v: 40 }
            : { t: last.t + 5 * YEAR_MS, v: last.v + row.slopePerYear * 5 };
    }

    const allV = pts.flatMap(p => [p.min, p.max]).concat(extra ? [extra.v] : [], [40]);
    let minV = Math.max(0, Math.min(...allV) - 4), maxV = Math.min(100, Math.max(...allV) + 4);
    const minT = pts[0].t, maxT = extra ? extra.t : last.t;
    const spanT = Math.max(1, maxT - minT);
    const x = t => padX + ((t - minT) / spanT) * (W - padX * 2);
    const y = v => (H - padBottom) - padY - ((Math.max(minV, Math.min(maxV, v)) - minV) / (maxV - minV)) * (H - padBottom - padY * 2);

    const bandTop = pts.map(p => `${x(p.t).toFixed(1)},${y(p.max).toFixed(1)}`);
    const bandBottom = pts.slice().reverse().map(p => `${x(p.t).toFixed(1)},${y(p.min).toFixed(1)}`);
    const avgLine = pts.map(p => `${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');

    const thresholdY = y(40).toFixed(1);
    let svg = `<svg class="fc-portfolio-svg" viewBox="0 0 ${W} ${H}" width="100%" height="${H}" preserveAspectRatio="none">`;
    svg += `<line x1="${padX}" y1="${thresholdY}" x2="${W - padX}" y2="${thresholdY}" class="fc-threshold-line"/>`;
    svg += `<text x="${padX}" y="${thresholdY - 4}" class="fc-threshold-label">Very Poor · 40</text>`;
    svg += `<polygon points="${bandTop.join(' ')} ${bandBottom.join(' ')}" class="fc-band"/>`;
    svg += `<polyline points="${avgLine}" class="fc-avg-line"/>`;
    pts.forEach(p => { svg += `<circle cx="${x(p.t).toFixed(1)}" cy="${y(p.v).toFixed(1)}" r="2.6" class="fc-avg-dot"/>`; });
    if (extra) {
        const dashCls = row.status === 'projected' ? 'fc-ext-line-soon' : 'fc-ext-line';
        svg += `<polyline points="${x(last.t).toFixed(1)},${y(last.v).toFixed(1)} ${x(extra.t).toFixed(1)},${y(extra.v).toFixed(1)}" class="${dashCls}"/>`;
        svg += `<circle cx="${x(extra.t).toFixed(1)}" cy="${y(extra.v).toFixed(1)}" r="3.4" class="${dashCls}-dot"/>`;
    }
    const rightLabel = extra
        ? (row.status === 'projected' ? formatForecastMonth(row.projectedCrossingDate) : new Date(extra.t).getFullYear() + ' (proj.)')
        : new Date(maxT).getFullYear();
    svg += `<text x="${x(minT).toFixed(1)}" y="${H - 8}" class="fc-year-label">${new Date(minT).getFullYear()}</text>`;
    svg += `<text x="${x(maxT).toFixed(1)}" y="${H - 8}" text-anchor="end" class="fc-year-label">${rightLabel}</text>`;
    svg += '</svg>';
    return svg;
}

function renderForecastPortfolio(row, withinYears) {
    const el = document.getElementById('fc-portfolio-body');
    if (!row) {
        el.textContent = 'Not enough history yet.';
        return;
    }
    const chart = renderPortfolioChart(row);
    const isProjected = row.status === 'projected';
    const labels = {
        beyond_horizon: `Beyond the ${withinYears}-year horizon at the current rate`,
        no_decline: 'No portfolio-wide decline detected',
        already_critical: 'Portfolio average is already below 40',
        insufficient_history: 'Not enough history yet'
    };
    el.innerHTML = `
        <div class="fc-portfolio-card">
            <div class="fc-portfolio-graph">${chart}</div>
            <div class="fc-portfolio-stats">
                <div class="fc-portfolio-stat">
                    <div class="h-label">Portfolio BCI avg · ${row.structureCount} structures</div>
                    <div class="h-value-lg">${row.avgBciAve ?? '—'}<span>now</span></div>
                </div>
                <div class="fc-portfolio-stat fc-portfolio-stat-end">
                    <div class="h-label">Projected crossing</div>
                    <div class="h-value-lg${isProjected ? ' fc-crit' : ''}">${isProjected ? formatForecastMonth(row.projectedCrossingDate) : '—'}</div>
                    <div class="h-sub">${isProjected ? `crosses 40 in ${row.yearsToThreshold} yrs` : (labels[row.status] || row.status)}</div>
                </div>
            </div>
        </div>`;
}

window.fcSwitch = function fcSwitch(view, btn) {
    document.querySelectorAll('#forecastSection .fc-view').forEach(el => el.classList.remove('active'));
    document.getElementById('fcView-' + view).classList.add('active');
    btn.parentElement.querySelectorAll('.chart-toggle-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
};

async function fetchRecentActivity() {
    try {
        const response = await fetch(API_BASE + '/api/dashboard/recent-activity', {
            credentials: 'include'
        });

        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

        const result = await response.json();

        if (result.success && result.data) {
            renderRecentActivity(result.data);
        }
    } catch (error) {
        console.error('Error fetching recent activity:', error);
        document.getElementById('recent-activity-list').innerHTML = `
            <div class="activity-item">
                <div style="color: var(--text-muted); font-size: 0.8rem;">Could not load data.</div>
            </div>`;
    }
}

function renderRecentActivity(data) {
    const list = document.getElementById('recent-activity-list');

    if (!data.length) {
        list.innerHTML = `
            <div class="activity-item">
                <div style="color: var(--text-muted); font-size: 0.8rem;">No recent inspections.</div>
            </div>`;
        return;
    }

    list.innerHTML = data.map(item => {
        const bci = item.overall_bciave !== null ? Math.round(item.overall_bciave) : '—';
        const tier = bciTier(item.overall_bciave);
        const initials = getInitials(item.inspector_name);
        const inspector = item.inspector_name || 'Unknown';
        const statusBadge = reviewStatusBadge(item.status);

        return `
            <div class="activity-item">
                <div class="activity-avatar activity-avatar-${tier.avatarColor}">${initials}</div>
                <div class="activity-content">
                    <div class="activity-title">${item.structure_name || 'Structure ' + item.structure_id}</div>
                    <div class="activity-meta">${inspector} &nbsp;·&nbsp; ${formatRelativeTime(item.created_at)}</div>
                </div>
                <span class="activity-bci bci-${tier.band}">${bci}</span>
                <span class="activity-status ${statusBadge.cls}">${statusBadge.label}</span>
            </div>`;
    }).join('');
}

// Maps the real review-workflow status onto the existing activity-status
// badge classes (status-completed/status-in-progress/status-overdue were
// already defined in dashboard.css but unused before this).
function reviewStatusBadge(status) {
    if (status === 'approved') return { cls: 'status-completed', label: 'Approved' };
    if (status === 'rejected') return { cls: 'status-overdue', label: 'Rejected' };
    return { cls: 'status-in-progress', label: 'Pending' };
}

function bciTier(bciAve) {
    if (bciAve === null || bciAve === undefined) return { band: 'fair', avatarColor: 'blue', color: '#eab308' };
    if (bciAve >= 90) return { band: 'excellent', avatarColor: 'green', color: '#22c55e' };
    if (bciAve >= 80) return { band: 'good', avatarColor: 'green', color: '#84cc16' };
    if (bciAve >= 65) return { band: 'fair', avatarColor: 'blue', color: '#eab308' };
    if (bciAve >= 40) return { band: 'poor', avatarColor: 'orange', color: '#f97316' };
    return { band: 'critical', avatarColor: 'red', color: '#ef4444' };
}

function getInitials(name) {
    if (!name) return '?';
    return name.split(' ').filter(Boolean).map(n => n[0]).join('').substring(0, 2).toUpperCase();
}

function formatRelativeTime(dateString) {
    if (!dateString) return '—';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return dateString;

    const diffMs = Date.now() - date.getTime();
    const diffMins = Math.round(diffMs / 60000);
    const diffHours = Math.round(diffMs / 3600000);
    const diffDays = Math.round(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} min${diffMins === 1 ? '' : 's'} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    return formatDate(dateString);
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

// ============================================================
// PENDING REVIEW (engineer/admin only)
// ============================================================

let pendingReviewData = [];
let pendingReviewFiltered = [];
let pendingReviewPage = 1;
const PENDING_REVIEW_PAGE_SIZE = 8;
let reviewingInspectionId = null;

async function checkSessionAndInitReview() {
    try {
        const response = await fetch(API_BASE + '/api/check-session', { credentials: 'include' });
        const result = await response.json();
        if (result && (result.role === 'engineer' || result.role === 'admin')) {
            document.getElementById('pending-review-section').style.display = '';
            document.getElementById('pendingReviewMetric').style.display = '';
            fetchPendingReview();
        }
    } catch (error) {
        console.error('Error checking session:', error);
    }
}

async function fetchPendingReview() {
    try {
        const response = await fetch(API_BASE + '/api/inspections/pending-review', { credentials: 'include' });
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const result = await response.json();
        if (result.success) {
            pendingReviewData = result.data;
            applyPendingReviewFilters(); // preserves whatever search/filter was already active
        }
    } catch (error) {
        console.error('Error fetching pending review:', error);
        document.getElementById('pending-review-list').innerHTML = `
            <div class="activity-item">
                <div style="color: var(--text-muted); font-size: 0.8rem;">Could not load data.</div>
            </div>`;
    }
}

// Filtering is entirely client-side over the already-fetched list — cheap
// (this list tops out in the hundreds, not thousands) and means every
// keystroke/toggle is instant with no extra round trip.
function getPendingReviewFilters() {
    return {
        search: (document.getElementById('pendingReviewSearch')?.value || '').trim().toLowerCase(),
        type: document.querySelector('#pendingReviewTypeFilter .chart-toggle-btn.active')?.dataset.type || 'all',
        criticalOnly: document.getElementById('pendingReviewCriticalToggle')?.classList.contains('active') || false,
        fieldOnly: document.getElementById('pendingReviewFieldToggle')?.classList.contains('active') || false
    };
}

function applyPendingReviewFilters() {
    const { search, type, criticalOnly, fieldOnly } = getPendingReviewFilters();

    const filtered = pendingReviewData.filter(item => {
        if (type !== 'all' && item.inspection_type !== type) return false;
        if (criticalOnly && !(item.overall_bciave !== null && item.overall_bciave < 55)) return false;
        if (fieldOnly && item.source !== 'field') return false;
        if (search) {
            const haystack = ((item.structure_name || '') + ' ' + (item.inspector_name || '') + ' ' + item.structure_id).toLowerCase();
            if (!haystack.includes(search)) return false;
        }
        return true;
    });

    pendingReviewFiltered = filtered;
    pendingReviewPage = 1; // filters changed - back to the first page
    renderPendingReviewPage();

    const countBadge = document.getElementById('pendingReviewCount');
    if (countBadge) {
        countBadge.textContent = filtered.length === pendingReviewData.length
            ? `${pendingReviewData.length} awaiting decision`
            : `${filtered.length} of ${pendingReviewData.length}`;
    }

    const metricCount = document.getElementById('pendingReviewMetricCount');
    if (metricCount) metricCount.textContent = pendingReviewData.length;
}

// Slices pendingReviewFiltered to the current page and renders both the
// list and the page-number strip beneath it. Kept separate from
// applyPendingReviewFilters() so paging doesn't re-run filtering or reset
// itself back to page 1.
function renderPendingReviewPage() {
    const totalPages = Math.max(1, Math.ceil(pendingReviewFiltered.length / PENDING_REVIEW_PAGE_SIZE));
    pendingReviewPage = Math.min(Math.max(1, pendingReviewPage), totalPages);

    const start = (pendingReviewPage - 1) * PENDING_REVIEW_PAGE_SIZE;
    renderPendingReview(pendingReviewFiltered.slice(start, start + PENDING_REVIEW_PAGE_SIZE));
    renderPendingReviewPagination(totalPages);
}

function renderPendingReviewPagination(totalPages) {
    const container = document.getElementById('pending-review-pagination');
    if (!container) return;

    if (totalPages <= 1) {
        container.innerHTML = '';
        return;
    }

    let html = '<div class="pagination-container">';
    html += `<button class="pagination-btn" onclick="goToPendingReviewPage(${pendingReviewPage - 1})" ${pendingReviewPage === 1 ? 'disabled' : ''}><i class="fas fa-angle-left"></i></button>`;

    const startPage = Math.max(1, pendingReviewPage - 2);
    const endPage = Math.min(totalPages, pendingReviewPage + 2);

    if (startPage > 1) {
        html += `<button class="pagination-btn" onclick="goToPendingReviewPage(1)">1</button>`;
        if (startPage > 2) html += '<span class="pagination-ellipsis">...</span>';
    }
    for (let i = startPage; i <= endPage; i++) {
        html += `<button class="pagination-btn ${i === pendingReviewPage ? 'active' : ''}" onclick="goToPendingReviewPage(${i})">${i}</button>`;
    }
    if (endPage < totalPages) {
        if (endPage < totalPages - 1) html += '<span class="pagination-ellipsis">...</span>';
        html += `<button class="pagination-btn" onclick="goToPendingReviewPage(${totalPages})">${totalPages}</button>`;
    }

    html += `<button class="pagination-btn" onclick="goToPendingReviewPage(${pendingReviewPage + 1})" ${pendingReviewPage === totalPages ? 'disabled' : ''}><i class="fas fa-angle-right"></i></button>`;
    html += '</div>';

    container.innerHTML = html;
}

window.goToPendingReviewPage = function goToPendingReviewPage(page) {
    pendingReviewPage = page;
    renderPendingReviewPage();
};

// structure_name/inspector_name/conclusions are free text any authenticated
// account can set via /save-inspection or /update-inspection - escaping is
// required wherever they're interpolated into innerHTML below, not just
// obviously-raw fields (getInitials() slices raw characters out of
// inspector_name too, so it needs the same treatment).
function escapeHtml(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
}

function renderPendingReview(data) {
    const list = document.getElementById('pending-review-list');

    if (!data.length) {
        const message = pendingReviewData.length === 0
            ? 'Nothing awaiting review.'
            : 'No inspections match your filters.';
        list.innerHTML = `
            <tr><td colspan="6" style="color: var(--text-muted); font-size: 0.8rem;">${message}</td></tr>`;
        return;
    }

    list.innerHTML = data.map(item => {
        const bci = item.overall_bciave !== null ? Math.round(item.overall_bciave) : '—';
        const tier = bciTier(item.overall_bciave);
        const initials = escapeHtml(getInitials(item.inspector_name));
        const inspector = escapeHtml(item.inspector_name || 'Unknown');
        const structureName = escapeHtml(item.structure_name || 'Structure ' + item.structure_id);

        const fieldBadge = item.source === 'field'
            ? '<span class="pr-field-badge" data-tip="Saved from spanSense Field"><i class="fas fa-mobile-screen-button"></i> Field</span>'
            : '';
        return `
            <tr>
                <td>
                    <div class="pr-structure-cell">
                        <div class="activity-avatar activity-avatar-${tier.avatarColor}">${initials}</div>
                        <div class="activity-content">
                            <div class="activity-title">${structureName} ${fieldBadge}</div>
                        </div>
                    </div>
                </td>
                <td>#${item.structure_id}</td>
                <td>${inspector}</td>
                <td>${formatDate(item.inspection_date)}</td>
                <td><span class="activity-bci bci-${tier.band}">${bci}</span></td>
                <td><button class="action-btn review-btn" onclick="openReviewModal(${item.id})"><i class="fas fa-user-check"></i> Review</button></td>
            </tr>`;
    }).join('');
}

window.openReviewModal = function openReviewModal(inspectionId) {
    const item = pendingReviewData.find(i => i.id === inspectionId);
    if (!item) return;
    reviewingInspectionId = inspectionId;

    const bciAv = item.overall_bciave !== null ? Math.round(item.overall_bciave) : '—';
    const bciCrit = item.overall_bcicrit !== null ? Math.round(item.overall_bcicrit) : '—';
    document.getElementById('reviewModalTitle').textContent =
        (item.structure_name || 'Structure ' + item.structure_id) + ' · STR #' + item.structure_id;
    document.getElementById('reviewModalSummary').innerHTML =
        `Inspected by ${escapeHtml(item.inspector_name || 'Unknown')} on ${formatDate(item.inspection_date)} &nbsp;·&nbsp; ` +
        `BCI<sub>avg</sub> ${bciAv} / BCI<sub>crit</sub> ${bciCrit}` +
        (item.conclusions ? `<br><br>"${escapeHtml(item.conclusions)}"` : '');
    document.getElementById('reviewCommentsInput').value = '';

    // Same deep-link the existing "Edit Report" buttons use elsewhere (see
    // bcirep.js) to jump straight into the real inspection editor — lets the
    // engineer actually correct/adjust the inspection, not just read a
    // summary, before coming back here to leave their comment and decide.
    document.getElementById('reviewEditFullLink').onclick = function (e) {
        e.preventDefault();
        const dateOnly = (item.inspection_date || '').split('T')[0];
        // A new tab opened via window.open() inherits the opener's
        // sessionStorage, so any defects left over from an inspection open
        // in this tab would otherwise leak into the one being edited here.
        sessionStorage.removeItem('inspectionData');
        sessionStorage.removeItem('defects');
        sessionStorage.removeItem('photoData');
        sessionStorage.removeItem('selectedSpan');
        sessionStorage.removeItem('copiedDefectIds');
        sessionStorage.setItem('inspectionStructureNumber', item.structure_id);
        sessionStorage.setItem('inspectionDate', dateOnly);
        sessionStorage.setItem('inspectionMode', 'edit');
        // The existing "Edit Report" deep-link elsewhere (bcirep.js) skips
        // these, which leaves the header stuck on "Loading..." and the
        // sidebar showing placeholder bridge info — set them here since
        // we already have the real values from the pending-review list.
        sessionStorage.setItem('structureId', item.structure_id);
        sessionStorage.setItem('structureName', item.structure_name);
        window.open('../inspection1/inspection1.html', '_blank');
    };

    document.getElementById('reviewModalOverlay').classList.add('active');
};

function closeReviewModal() {
    document.getElementById('reviewModalOverlay').classList.remove('active');
    reviewingInspectionId = null;
}

document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && document.getElementById('reviewModalOverlay').classList.contains('active')) {
        closeReviewModal();
    }
});

async function submitReviewDecision(decision) {
    if (!reviewingInspectionId) return;
    const comments = document.getElementById('reviewCommentsInput').value.trim();
    try {
        const response = await fetch(API_BASE + `/api/inspections/${reviewingInspectionId}/review`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ decision, comments })
        });
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        closeReviewModal();
        fetchPendingReview();
        fetchRecentActivity();
    } catch (error) {
        console.error('Error submitting review decision:', error);
        alert('Could not submit the review. Please try again.');
    }
}

document.addEventListener('DOMContentLoaded', function () {
    document.getElementById('reviewCancelBtn')?.addEventListener('click', closeReviewModal);
    document.getElementById('reviewApproveBtn')?.addEventListener('click', () => submitReviewDecision('approved'));
    document.getElementById('reviewRejectBtn')?.addEventListener('click', () => submitReviewDecision('rejected'));
    document.getElementById('reviewModalOverlay')?.addEventListener('click', function (e) {
        if (e.target === this) closeReviewModal();
    });

    document.getElementById('pendingReviewSearch')?.addEventListener('input', applyPendingReviewFilters);

    document.querySelectorAll('#pendingReviewTypeFilter .chart-toggle-btn').forEach(btn => {
        btn.addEventListener('click', function () {
            document.querySelectorAll('#pendingReviewTypeFilter .chart-toggle-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            applyPendingReviewFilters();
        });
    });

    document.getElementById('pendingReviewCriticalToggle')?.addEventListener('click', function () {
        this.classList.toggle('active');
        applyPendingReviewFilters();
    });

    document.getElementById('pendingReviewFieldToggle')?.addEventListener('click', function () {
        this.classList.toggle('active');
        applyPendingReviewFilters();
    });
});
