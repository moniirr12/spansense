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
    fetchRecentActivity();
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
      renderTypeBarChart(result.data);
    } else {
      throw new Error('Invalid response format');
    }
  } catch (error) {
    console.error('Error fetching type distribution:', error);
    // Show error to user or retry
  }
}

function renderTypeBarChart(typeData) {
  const ctx = document.getElementById('typeChart').getContext('2d');

  // Sort by count descending so the most common type reads first.
  const sorted = [...typeData].sort((a, b) => b.count - a.count);
  const labels = sorted.map(item => item.type || 'Unknown');
  const counts = sorted.map(item => item.count);

  // Teal-forward palette consistent with the rest of the dashboard.
  const backgroundColors = ['#5b8c8a', '#8ab4b0', '#4a90b8', '#c28b5a', '#a371c7'];

  new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: 'Structures',
        data: counts,
        backgroundColor: labels.map((_, i) => backgroundColors[i % backgroundColors.length]),
        borderWidth: 0,
        borderRadius: 6
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: true,
      aspectRatio: 1.4,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: function(context) {
              const value = context.raw || 0;
              const total = context.dataset.data.reduce((a, b) => a + b, 0);
              const percentage = total > 0 ? Math.round((value / total) * 100) : 0;
              return `${value} (${percentage}%)`;
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
  const labels = sorted.map(item => item.type || 'Unknown');
  const values = sorted.map(item => item.avg_bci);
  const colors = values.map(v => bciTier(v).color);

  avgBciByTypeChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: 'Average BCI',
        data: values,
        backgroundColor: colors,
        borderWidth: 0,
        borderRadius: 6
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: true,
      aspectRatio: 1.4,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
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
    
    bciChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                { label: 'Very Good (90-100)', data: filteredData.map(d => d.very_good || 0), backgroundColor: '#22c55e', borderRadius: 4 },
                { label: 'Good (80-89)', data: filteredData.map(d => d.good || 0), backgroundColor: '#84cc16', borderRadius: 4 },
                { label: 'Fair (65-79)', data: filteredData.map(d => d.fair || 0), backgroundColor: '#eab308', borderRadius: 4 },
                { label: 'Poor (40-64)', data: filteredData.map(d => d.poor || 0), backgroundColor: '#f97316', borderRadius: 4 },
                { label: 'Critical (0-39)', data: filteredData.map(d => d.very_poor || 0), backgroundColor: '#ef4444', borderRadius: 4 }
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
    
    // Load saved preference, defaulting to dark unless the system explicitly prefers light
    const savedNightMode = localStorage.getItem('nightMode');
    const systemPrefersLight = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches;

    // The preload snippet in <head> forces a dark background to avoid a flash;
    // now that the real theme is decided, drop it so the background can't stay dark once night-mode is removed.
    document.documentElement.classList.remove('nm-preload');

    if (savedNightMode === 'on' || (savedNightMode === null && !systemPrefersLight)) {
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
let reviewingInspectionId = null;

async function checkSessionAndInitReview() {
    try {
        const response = await fetch(API_BASE + '/api/check-session', { credentials: 'include' });
        const result = await response.json();
        if (result && (result.role === 'engineer' || result.role === 'admin')) {
            document.getElementById('pending-review-section').style.display = '';
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
            renderPendingReview(result.data);
        }
    } catch (error) {
        console.error('Error fetching pending review:', error);
        document.getElementById('pending-review-list').innerHTML = `
            <div class="activity-item">
                <div style="color: var(--text-muted); font-size: 0.8rem;">Could not load data.</div>
            </div>`;
    }
}

function renderPendingReview(data) {
    const list = document.getElementById('pending-review-list');

    if (!data.length) {
        list.innerHTML = `
            <div class="activity-item">
                <div style="color: var(--text-muted); font-size: 0.8rem;">Nothing awaiting review.</div>
            </div>`;
        return;
    }

    list.innerHTML = data.map(item => {
        const bci = item.overall_bciave !== null ? Math.round(item.overall_bciave) : '—';
        const tier = bciTier(item.overall_bciave);
        const initials = getInitials(item.inspector_name);
        const inspector = item.inspector_name || 'Unknown';

        return `
            <div class="activity-item">
                <div class="activity-avatar activity-avatar-${tier.avatarColor}">${initials}</div>
                <div class="activity-content">
                    <div class="activity-title">${item.structure_name || 'Structure ' + item.structure_id}</div>
                    <div class="activity-meta">${inspector} &nbsp;·&nbsp; ${formatDate(item.inspection_date)}</div>
                </div>
                <span class="activity-bci bci-${tier.band}">${bci}</span>
                <button class="action-btn review-btn" onclick="openReviewModal(${item.id})"><i class="fas fa-user-check"></i> Review</button>
            </div>`;
    }).join('');
}

window.openReviewModal = function openReviewModal(inspectionId) {
    const item = pendingReviewData.find(i => i.id === inspectionId);
    if (!item) return;
    reviewingInspectionId = inspectionId;

    const bciAv = item.overall_bciave !== null ? Math.round(item.overall_bciave) : '—';
    const bciCrit = item.overall_bcicrit !== null ? Math.round(item.overall_bcicrit) : '—';
    document.getElementById('reviewModalTitle').textContent = item.structure_name || 'Structure ' + item.structure_id;
    document.getElementById('reviewModalSummary').innerHTML =
        `Inspected by ${item.inspector_name || 'Unknown'} on ${formatDate(item.inspection_date)} &nbsp;·&nbsp; ` +
        `BCI Avg ${bciAv} / Critical ${bciCrit}` +
        (item.conclusions ? `<br><br>"${item.conclusions}"` : '');
    document.getElementById('reviewCommentsInput').value = '';
    document.getElementById('reviewModalOverlay').classList.add('active');
};

function closeReviewModal() {
    document.getElementById('reviewModalOverlay').classList.remove('active');
    reviewingInspectionId = null;
}

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
});
