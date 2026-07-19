/* ============================================================
   SPANSENSE - TWINVIEW PAGE SCRIPTS
   ============================================================ */

// Glass Scrollbar
(function(){
    const sb=document.getElementById('glassScrollbar'), th=document.getElementById('glassThumb');
    if(!sb||!th)return;
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

var API_BASE = window.location.hostname === 'localhost'
    ? 'http://localhost:3000'
    : 'https://spansense.onrender.com';

/* ============================================================
   DEFECT INFO LOOKUP (element names + defect type labels) - same
   per-structure-type element lists and defect-type/number -> label
   map as test.js/reportFull.docx.js's report generators, duplicated
   here for the same reason those do: this page never loads test.js.
   ============================================================ */
var TWIN_ELEMENTS_BY_TYPE = {
    Bridge: [
        'Primary deck element', 'Transverse beams', 'Secondary deck element', 'Half joints', 'Tie beam/rod',
        'Parapet beam or cantilever', 'Deck bracing', 'Foundations', 'Abutments (incl. arch springing)',
        'Spandrel wall/head wall', 'Pier/column', 'Cross-head/capping beam', 'Bearings', 'Bearing plinth/shelf',
        'Superstructure drainage', 'Substructure drainage', 'Waterproofing', 'Movement/expansion joints',
        'Finishes: deck elements', 'Finishes: substructure elements', 'Finishes: parapets/safety fences',
        'Access/walkways/gantries', 'Handrail/parapets/safety fences', 'Carriageway surfacing',
        'Footway/verge/footbridge surfacing', 'Invert/river bed', 'Aprons', 'Fenders/cutwaters/collision prot.',
        'River training works', 'Revetment/batter paving', 'Wing walls', 'Retaining walls', 'Embankments',
        'Machinery', 'Approach rails/barriers/walls', 'Signs', 'Lighting', 'Services'
    ],
    'Retaining wall': [
        'Foundations', 'Retaining wall: Primary', 'Retaining wall: Secondary', 'Parapet beam/plinth',
        'Drainage', 'Movement/Expansion Joints', 'Surface finishes: wall', 'Surface finishes: handrail/parapet',
        'Handrail/parapets/safety fences', 'Carriageway: Top of Wall', 'Carriageway: Foot of Wall',
        'Footway/verge: Top of Wall', 'Footway/verge: Foot of Wall', 'Embankment', 'Superstructure drainage',
        'Invert/river bed', 'Aprons', 'Signs', 'Lighting', 'Services'
    ],
    'Sign Gantry': [
        'Foundations', 'Truss/beams/cantilever', 'Transverse/horiz. bracing elements', 'Columns/supports/legs',
        'Surface finishes: truss/beams/cantilever', 'Surface finishes: columns/supports/legs',
        'Surface finishes: other elements', 'Access/walkway/deck', 'Access ladder', 'Handrails/guard rails',
        'Base connections', 'Support to longitudinal connection', 'Sign and signal supports',
        'Signs/signals', 'Lighting', 'Services'
    ]
};
var TWIN_DEFECT_TYPE_LABEL = {
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
function twinElementName(bridgeType, elementNo) {
    var list = TWIN_ELEMENTS_BY_TYPE[bridgeType] || TWIN_ELEMENTS_BY_TYPE.Bridge;
    return (elementNo && list[elementNo - 1]) || ('Element ' + elementNo);
}
function twinDefectTypeLabel(defectType, defectNumber) {
    var byType = TWIN_DEFECT_TYPE_LABEL[Number(defectType)];
    return (byType && byType[Number(defectNumber)]) || null;
}

// Table 4 - Material Type Codes (GI codes rev 2)
var TWIN_MATERIAL_CODE_LABEL = {
    A: 'Reinforced concrete', B: 'Plain/mass concrete', C: 'Post-tensioned concrete', D: 'Pre-tensioned concrete',
    E: 'Steel', F: 'Cast iron', G: 'Wrought iron', H: 'Aluminium', I: 'Corrugated steel', J: 'Corrugated aluminium',
    K: 'Brick', L: 'Stone', M: 'FRP/GRP/Composite', N: 'Timber', P: 'No secondary element / no material', Q: 'Other'
};
// bridge.material is "PRIMARY / SECONDARY" (or just one code) from the server -
// re-split it here rather than changing that API shape, and wrap each code in
// a native title tooltip so its meaning shows on hover.
function twinMaterialHtml(materialStr) {
    if (!materialStr) return '—';
    return materialStr.split(' / ').map(function(code) {
        var label = TWIN_MATERIAL_CODE_LABEL[code.trim().toUpperCase()];
        return label ? '<span title="' + label + '">' + escapeHtmlTwin(code) + '</span>' : escapeHtmlTwin(code);
    }).join(' / ');
}

/* ============================================================
   PROCEDURAL SENSORS (no real telemetry exists yet - these are
   plausible monitoring points derived from real span/pier geometry)
   ============================================================ */
function generateSensors(bridge, spanLenOverride) {
    // spanLenOverride lets rebuildModel() pass its stylised-scale span
    // length (cantilever bridges) without mutating bridge.spanLength itself
    // - the info panel reads that field straight off bridge, separately.
    var spanLen = spanLenOverride || bridge.spanLength, numSpans = bridge.spans, deckW = bridge.deckWidth;
    var totalLen = spanLen * numSpans;
    var x0 = -totalLen / 2;
    var sensors = [];
    for (var i = 0; i < numSpans; i++) {
        var x = x0 + spanLen * i + spanLen / 2;
        sensors.push({ x: x, y: -0.6, z: deckW / 2 - 0.5 });
        sensors.push({ x: x, y: -0.6, z: -(deckW / 2 - 0.5) });
    }
    return sensors;
}

/* ============================================================
   SELECTOR LOGIC (embedded in LIVE TWIN card)
   ============================================================ */
const liveTwinSelector = document.getElementById('liveTwinSelector');
const dropdownMenu = document.getElementById('dropdownMenu');
const ddSearch = document.getElementById('ddSearch');
const ddList = document.getElementById('ddList');
const ltsName = document.getElementById('ltsName');
const ltsId = document.getElementById('ltsId');
const ltsChevron = document.getElementById('ltsChevron');

let bridgeList = [];
let selectedBridge = null;
let isOpen = false;

function getBciClass(bci) {
    if (bci == null) return 'fair';
    if (bci < 50) return 'critical';
    if (bci < 65) return 'fair';
    return 'good';
}

// Shows the selected inspection's BCI against the one immediately before it
// (e.g. "↓ 6 (78 → 72)") rather than a flat count, so the "Inspection status"
// card answers "is this getting better or worse" instead of just "what's the
// backlog right now" - the previous "Open defects" count didn't mean much
// since defects have no open/closed lifecycle in the data, just a per-
// inspection snapshot.
function renderBciTrend(elId, current, previous) {
    var el = document.getElementById(elId);
    if (current == null) {
        el.textContent = '—';
        el.className = 'status-badge completed';
        return;
    }
    if (previous == null) {
        // Could be a genuinely first-ever inspection, or an earlier one that
        // just never had a BCI score recorded - either way there's nothing
        // to compare against, so don't claim a specific reason.
        el.textContent = 'First inspection - no trend yet';
        el.className = 'status-badge completed';
        return;
    }
    var delta = Math.round(current) - Math.round(previous);
    var arrow = delta > 0 ? '↑' : (delta < 0 ? '↓' : '→');
    el.textContent = arrow + ' ' + Math.abs(delta) + ' (' + Math.round(previous) + ' → ' + Math.round(current) + ')';
    el.className = 'status-badge ' + (delta < 0 ? 'error' : 'completed');
}

// Small per-tile history line (BCI avg tile / BCI crit tile) - just that one
// metric, oldest to newest, coloured to match the tile's own good/fair/
// critical band via the CSS classes in twin.html rather than a hardcoded hex,
// so it also picks up the night-mode variant automatically.
function renderSparkline(elId, inspections, key, bandClass) {
    var el = document.getElementById(elId);
    var valid = (inspections || []).filter(function(i) { return i[key] != null; });
    el.className = 'spark-row ' + bandClass;
    if (valid.length < 2) { el.innerHTML = ''; return; }

    var width = 74, height = 24, min = 30, max = 100;
    var pts = valid.map(function(i, idx) {
        var x = (idx / (valid.length - 1)) * width;
        var v = Math.max(min, Math.min(max, i[key]));
        var y = height - ((v - min) / (max - min)) * height;
        return { x: x, y: y };
    });
    var path = pts.map(function(p, i) { return (i === 0 ? 'M' : 'L') + p.x.toFixed(1) + ',' + p.y.toFixed(1); }).join(' ');
    var last = pts[pts.length - 1];

    el.innerHTML = '<svg width="' + width + '" height="' + height + '" viewBox="0 0 ' + width + ' ' + height + '">' +
        '<path d="' + path + '" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" opacity="0.85"/>' +
        '<circle cx="' + last.x.toFixed(1) + '" cy="' + last.y.toFixed(1) + '" r="2.6" fill="currentColor"/>' +
        '</svg>';
}

// One-line "since last <TYPE>" readout under each tile's sparkline - same
// current/previous pair renderBciTrend already compares, just phrased
// against the previous inspection's type instead of its raw score.
function renderTileDelta(elId, current, previous, prevType) {
    var el = document.getElementById(elId);
    if (current == null || previous == null) { el.textContent = ''; el.className = 'bci-delta'; return; }

    var delta = Math.round(current) - Math.round(previous);
    var dir = delta > 0 ? 'up' : (delta < 0 ? 'down' : 'flat');
    var arrow = delta > 0 ? '▲' : (delta < 0 ? '▼' : '—');
    var since = prevType ? 'vs last ' + prevType : 'vs last insp.';
    el.className = 'bci-delta ' + dir;
    el.textContent = arrow + ' ' + Math.abs(delta) + ' ' + since;
}

// Dedicated "BCI trend" card: both BCI avg and BCI crit plotted against every
// inspection on record (not just the previous one - see renderBciTrend above
// for that flat delta). The two series get fixed identity colours (avg =
// brand teal, crit = the warm tone already used for the 3D stage's BCI
// readout chip) since colour here means "which metric", not a condition band;
// the 65/50 band thresholds are shown as reference lines instead, and hovering
// an inspection shows both scores together as text so colour is never the
// only signal.
// Ordinary least-squares fit (v = slope*t + intercept). Only meaningful with
// a real trend to fit, not just two points defining a line by construction -
// see the >= 3 gate at each call site.
function linearFit(pts) {
    if (pts.length < 3) return null;
    var n = pts.length, sumT = 0, sumV = 0, sumTT = 0, sumTV = 0;
    pts.forEach(function(p) { sumT += p.t; sumV += p.v; sumTT += p.t * p.t; sumTV += p.t * p.v; });
    var denom = n * sumTT - sumT * sumT;
    if (denom === 0) return null;
    var slope = (n * sumTV - sumT * sumV) / denom;
    var intercept = (sumV - slope * sumT) / n;
    return { slope: slope, intercept: intercept };
}

// Off by default - the chart shows only recorded inspections until the
// viewer explicitly asks to see the projection (see the #trendProjToggle
// click handler below), rather than always guessing at the future.
var showBciProjection = false;
var lastBciInspections = [];

function renderBciTrendChart(inspections) {
    lastBciInspections = inspections || [];
    var wrap = document.getElementById('bciTrendChart');
    var sub = document.getElementById('trendSub');
    var projToggle = document.getElementById('trendProjToggle');
    var projNote = document.getElementById('trendProjectedNote');
    var valid = (inspections || []).filter(function(i) { return i.bciAvg != null || i.bciCrit != null; });

    if (valid.length < 2) {
        sub.textContent = valid.length ? '1 inspection' : '—';
        wrap.innerHTML = '<div class="trend-empty"><i class="fa-solid fa-chart-line"></i>Not enough inspection history yet</div>';
        projToggle.style.display = 'none';
        projNote.style.display = 'none';
        return;
    }

    sub.textContent = valid.length + ' inspections · ' + valid[0].date + ' – ' + valid[valid.length - 1].date;

    var width = 296, height = 140, padL = 4, padR = 4, padT = 10, padB = 20;
    var innerW = width - padL - padR, innerH = height - padT - padB;
    var minV = 30, maxV = 100;

    var timestamps = valid.map(function(i) { return i.timestamp; });
    var minT = Math.min.apply(null, timestamps), realMaxT = Math.max.apply(null, timestamps);

    // A straight line through only 2 points is just those 2 points, not a
    // real trend - only extrapolate a series once it has at least 3 real
    // readings of its own (bciAvg/bciCrit can differ in how many they have).
    function rawSeries(key) {
        var pts = [];
        valid.forEach(function(i) { if (i[key] != null) pts.push({ t: i.timestamp, v: i[key] }); });
        return pts;
    }
    function lastReading(key) {
        for (var idx = valid.length - 1; idx >= 0; idx--) {
            if (valid[idx][key] != null) return { t: valid[idx].timestamp, v: valid[idx][key] };
        }
        return null;
    }
    var YEAR_MS = 365.25 * 24 * 60 * 60 * 1000;
    var avgFit = linearFit(rawSeries('bciAvg'));
    var critFit = linearFit(rawSeries('bciCrit'));
    var eligible = !!(avgFit || critFit);
    var showProjection = eligible && showBciProjection;
    var projT = realMaxT + 10 * YEAR_MS;
    var mid5T = realMaxT + 5 * YEAR_MS;

    // The toggle itself only appears once there's enough history to project
    // at all; its on/off look reflects whether it's currently showing one.
    projToggle.style.display = eligible ? '' : 'none';
    projToggle.classList.toggle('active', showProjection);
    document.getElementById('trendProjToggleLabel').textContent = showProjection ? 'Projected' : 'Show projection';

    var maxT = showProjection ? projT : realMaxT;
    var spanT = Math.max(1, maxT - minT);

    function xAt(t) { return padL + ((t - minT) / spanT) * innerW; }
    function yAt(v) {
        var clamped = Math.max(minV, Math.min(maxV, v));
        return padT + innerH - ((clamped - minV) / (maxV - minV)) * innerH;
    }

    function seriesPoints(key) {
        var pts = [];
        valid.forEach(function(i) {
            if (i[key] == null) return;
            pts.push({ x: xAt(i.timestamp), y: yAt(i[key]) });
        });
        return pts;
    }
    function pathFor(pts) {
        return pts.map(function(p, idx) { return (idx === 0 ? 'M' : 'L') + p.x.toFixed(1) + ',' + p.y.toFixed(1); }).join(' ');
    }
    // Anchors the dashed continuation at the series' own last real value
    // (not the fit's estimate for that exact date), so it picks up exactly
    // where the solid line ends instead of showing a small visible jump.
    function projectedPathFor(fit, key) {
        if (!fit) return null;
        var last = lastReading(key);
        if (!last) return null;
        var v5 = fit.slope * mid5T + fit.intercept;
        var v10 = fit.slope * projT + fit.intercept;
        return pathFor([
            { x: xAt(last.t), y: yAt(last.v) },
            { x: xAt(mid5T), y: yAt(v5) },
            { x: xAt(projT), y: yAt(v10) }
        ]);
    }

    var avgPts = seriesPoints('bciAvg');
    var critPts = seriesPoints('bciCrit');
    var avgProjPath = showProjection ? projectedPathFor(avgFit, 'bciAvg') : null;
    var critProjPath = showProjection ? projectedPathFor(critFit, 'bciCrit') : null;
    var goodY = yAt(65), critY = yAt(50);

    var svg = '<svg viewBox="0 0 ' + width + ' ' + height + '" width="100%" height="' + height + '">';

    svg += '<line class="trend-ref-line" x1="0" y1="' + goodY.toFixed(1) + '" x2="' + width + '" y2="' + goodY.toFixed(1) + '"/>';
    svg += '<line class="trend-ref-line" x1="0" y1="' + critY.toFixed(1) + '" x2="' + width + '" y2="' + critY.toFixed(1) + '"/>';
    svg += '<text class="trend-axis-label" x="' + (width - 2) + '" y="' + (goodY - 3).toFixed(1) + '" font-size="8" text-anchor="end">65</text>';
    svg += '<text class="trend-axis-label" x="' + (width - 2) + '" y="' + (critY - 3).toFixed(1) + '" font-size="8" text-anchor="end">50</text>';

    if (showProjection) {
        var todayX = xAt(realMaxT).toFixed(1);
        svg += '<line class="trend-projected-divider" x1="' + todayX + '" y1="' + padT + '" x2="' + todayX + '" y2="' + (padT + innerH) + '"/>';
    }

    if (avgPts.length > 1) {
        svg += '<g class="trend-avg-color"><path d="' + pathFor(avgPts) + '" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></g>';
    }
    if (critPts.length > 1) {
        svg += '<g class="trend-crit-color"><path d="' + pathFor(critPts) + '" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></g>';
    }
    if (avgProjPath) {
        svg += '<g class="trend-avg-color"><path d="' + avgProjPath + '" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="4,3" opacity="0.55"/></g>';
    }
    if (critProjPath) {
        svg += '<g class="trend-crit-color"><path d="' + critProjPath + '" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="4,3" opacity="0.55"/></g>';
    }

    svg += '<line class="trend-crosshair" id="trendCrosshair" x1="0" y1="' + padT + '" x2="0" y2="' + (padT + innerH) + '"/>';

    svg += '<text class="trend-date-label" x="' + xAt(valid[0].timestamp).toFixed(1) + '" y="' + height + '" font-size="9" text-anchor="start">' + valid[0].date + '</text>';
    if (showProjection) {
        svg += '<text class="trend-date-label" x="' + xAt(realMaxT).toFixed(1) + '" y="' + height + '" font-size="9" text-anchor="middle">Today</text>';
        svg += '<text class="trend-date-label" x="' + xAt(mid5T).toFixed(1) + '" y="' + height + '" font-size="9" text-anchor="middle">+5y</text>';
        svg += '<text class="trend-date-label" x="' + xAt(projT).toFixed(1) + '" y="' + height + '" font-size="9" text-anchor="end">+10y</text>';
    } else {
        svg += '<text class="trend-date-label" x="' + xAt(valid[valid.length - 1].timestamp).toFixed(1) + '" y="' + height + '" font-size="9" text-anchor="end">' + valid[valid.length - 1].date + '</text>';
    }

    projNote.style.display = showProjection ? '' : 'none';

    // One hit column per inspection, wide enough to hover even when
    // inspections are bunched close together on the time axis.
    var hitWidth = Math.max(10, innerW / valid.length);
    valid.forEach(function(i) {
        var x = xAt(i.timestamp);
        svg += '<rect class="thit" data-t="' + i.timestamp + '" x="' + (x - hitWidth / 2).toFixed(1) + '" y="0" width="' + hitWidth.toFixed(1) + '" height="' + height + '" fill="transparent" style="cursor:pointer"/>';
    });

    svg += '</svg>';
    wrap.innerHTML = svg;

    var tooltip = document.createElement('div');
    tooltip.className = 'chart-tooltip';
    wrap.appendChild(tooltip);
    var crosshair = wrap.querySelector('#trendCrosshair');

    wrap.querySelectorAll('.thit').forEach(function(hit) {
        hit.addEventListener('mouseenter', function() {
            var t = +hit.getAttribute('data-t');
            var insp = valid.find(function(i) { return i.timestamp === t; });
            if (!insp) return;
            var rows = [];
            if (insp.bciAvg != null) rows.push('Avg ' + Math.round(insp.bciAvg));
            if (insp.bciCrit != null) rows.push('Crit ' + Math.round(insp.bciCrit));
            tooltip.innerHTML = '<b>' + insp.type + ' · ' + insp.date + '</b>' + rows.join('<br>');
            var x = xAt(t);
            tooltip.style.left = ((x / width) * 100) + '%';
            tooltip.style.opacity = '1';
            crosshair.setAttribute('x1', x.toFixed(1));
            crosshair.setAttribute('x2', x.toFixed(1));
            crosshair.style.opacity = '1';
        });
        hit.addEventListener('mouseleave', function() {
            tooltip.style.opacity = '0';
            crosshair.style.opacity = '0';
        });
    });
}

document.getElementById('trendProjToggle').addEventListener('click', function() {
    showBciProjection = !showBciProjection;
    renderBciTrendChart(lastBciInspections);
});

function renderDropdownList(filter) {
    filter = filter || '';
    var term = filter.toLowerCase().trim();
    var filtered = bridgeList.filter(function(b) {
        return (b.name || '').toLowerCase().includes(term) || String(b.id).toLowerCase().includes(term);
    });

    if (filtered.length === 0) {
        ddList.innerHTML = '<div class="dd-empty"><i class="fa-solid fa-magnifying-glass"></i>No bridges found</div>';
        return;
    }

    ddList.innerHTML = filtered.map(function(b) {
        var isSelected = selectedBridge && String(selectedBridge.id) === String(b.id);
        return '<div class="dd-item ' + (isSelected ? 'selected' : '') + '" data-id="' + b.id + '">' +
            '<div class="dd-icon"><i class="fa-solid fa-bridge"></i></div>' +
            '<div class="dd-text">' +
                '<div class="dd-name">' + b.name + '</div>' +
                '<div class="dd-id">' + b.id + '</div>' +
            '</div>' +
            '<i class="fa-solid fa-check dd-check"></i>' +
        '</div>';
    }).join('');

    ddList.querySelectorAll('.dd-item').forEach(function(item) {
        item.addEventListener('click', function() {
            selectBridge(item.dataset.id);
            closeDropdown();
        });
    });
}

function openDropdown() {
    isOpen = true;
    liveTwinSelector.classList.add('active');
    dropdownMenu.classList.add('open');
    ddSearch.value = '';
    renderDropdownList();
    setTimeout(function() { ddSearch.focus(); }, 50);
}

function closeDropdown() {
    isOpen = false;
    liveTwinSelector.classList.remove('active');
    dropdownMenu.classList.remove('open');
}

liveTwinSelector.addEventListener('click', function(e) {
    e.stopPropagation();
    if (isOpen) closeDropdown();
    else openDropdown();
});

ddSearch.addEventListener('input', function(e) {
    renderDropdownList(e.target.value);
});

ddSearch.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') closeDropdown();
});

document.addEventListener('click', function(e) {
    if (!document.querySelector('.selector-dropdown').contains(e.target)) {
        closeDropdown();
    }
});

/* ============================================================
   BRIDGE SELECTION & UI UPDATE
   ============================================================ */
async function selectBridge(bridgeId, inspectionId) {
    var listEntry = bridgeList.find(function(b) { return String(b.id) === String(bridgeId); });
    if (!listEntry) return;

    var res;
    try {
        var url = API_BASE + '/api/twin/' + bridgeId;
        if (inspectionId) url += '?inspectionId=' + encodeURIComponent(inspectionId);
        res = await fetch(url);
        if (!res.ok) throw new Error('Failed to load twin data');
    } catch (err) {
        showToast('Load failed', 'Could not load ' + listEntry.name, 'error');
        return;
    }
    var bridge = await res.json();

    // 3D geometry isn't in the DB - look it up from the hand-authored model file
    var model = getBridgeModel(bridge.id, bridge.type);
    bridge.model = model;                 // full per-kind param bag, incl. model.kind
    bridge.deckWidth = model.deckWidth;   // kept flat: generateSensors() + works overlay read these directly
    bridge.trussHeight = model.trussHeight;
    bridge.panelsPerSpan = model.panelsPerSpan;
    if (!bridge.spans) bridge.spans = 1;
    if (!bridge.spanLength) bridge.spanLength = 28;

    selectedBridge = bridge;
    sessionStorage.setItem('structureId', bridge.id);

    ltsName.textContent = bridge.name;
    ltsId.textContent = bridge.id;

    var infoCol = document.getElementById('infoCol');
    infoCol.style.opacity = '0.5';

    setTimeout(function() {
        var avgClass = getBciClass(bridge.bciAvg);
        var critClass = getBciClass(bridge.bciCrit);

        document.getElementById('bciAvgTile').className = 'bci-tile ' + avgClass;
        document.getElementById('bciCritTile').className = 'bci-tile ' + critClass;

        document.getElementById('bciAvg').textContent = bridge.bciAvg != null ? Math.round(bridge.bciAvg) : '—';
        document.getElementById('bciCrit').textContent = bridge.bciCrit != null ? Math.round(bridge.bciCrit) : '—';

        renderSparkline('sparkAvg', bridge.inspections, 'bciAvg', 'spark-' + avgClass);
        renderSparkline('sparkCrit', bridge.inspections, 'bciCrit', 'spark-' + critClass);
        renderTileDelta('deltaAvg', bridge.bciAvg, bridge.prevBciAvg, bridge.prevInspectionType);
        renderTileDelta('deltaCrit', bridge.bciCrit, bridge.prevBciCrit, bridge.prevInspectionType);
        renderBciTrendChart(bridge.inspections || []);

        document.getElementById('factSpan').textContent = bridge.spanLength ? (bridge.spanLength * bridge.spans).toFixed(1) + ' m' : '—';
        document.getElementById('factSpans').textContent = bridge.spans;
        document.getElementById('factMaterial').innerHTML = twinMaterialHtml(bridge.material);
        document.getElementById('factYear').textContent = bridge.yearBuilt || '—';

        document.getElementById('lastInsp').textContent = bridge.lastInspection || 'None recorded';
        document.getElementById('nextInsp').textContent = bridge.nextInspection || '—';
        document.getElementById('nextInsp').className = 'status-badge ' + (bridge.isOverdue ? 'error' : 'pending');

        renderBciTrend('bciAvgTrend', bridge.bciAvg, bridge.prevBciAvg);
        renderBciTrend('bciCritTrend', bridge.bciCrit, bridge.prevBciCrit);

        document.getElementById('timelineRange').textContent = bridge.timelineRange || '—';
        renderTimeline(bridge.inspections || [], bridge.selectedInspectionId, bridge.id);

        infoCol.style.opacity = '1';
    }, 150);

    rebuildModel(bridge);
    renderDropdownList();
    showToast('Bridge loaded', bridge.name + ' · ' + bridge.id, 'success');
}

function renderTimeline(inspections, selectedId, bridgeId) {
    var track = document.getElementById('timelineTrack');
    if (!inspections.length) {
        track.innerHTML = '<div class="dd-empty" style="padding:14px 0;"><i class="fa-solid fa-calendar-xmark"></i>No inspections recorded</div>';
        return;
    }
    var timestamps = inspections.map(function(i) { return i.timestamp; });
    var minT = Math.min.apply(null, timestamps), maxT = Math.max.apply(null, timestamps);
    var span = Math.max(1, maxT - minT);

    track.innerHTML = inspections.map(function(insp) {
        var left = ((insp.timestamp - minT) / span) * 84 + 6; // 6%-90% inset
        var style = 'left:' + left.toFixed(1) + '%';
        var label = '<div class="tl-label" style="left:' + left.toFixed(1) + '%">' + insp.date + '</div>';
        var isSelected = selectedId != null && String(insp.id) === String(selectedId);
        return '<div class="tl-node' + (isSelected ? ' selected' : '') + '" data-type="' + insp.type + '" ' +
            'data-id="' + insp.id + '" title="View ' + insp.type + ' · ' + insp.date + '" style="' + style + '"></div>' + label;
    }).join('');

    track.querySelectorAll('.tl-node').forEach(function(node) {
        node.addEventListener('click', function() {
            selectBridge(bridgeId, node.dataset.id);
        });
    });
}

/* ============================================================
   FETCH BRIDGE LIST & INIT SELECTION
   ============================================================ */
async function loadBridgeList() {
    try {
        var res = await fetch(API_BASE + '/api/bridges');
        if (!res.ok) throw new Error('Failed to fetch bridges');
        bridgeList = await res.json();
    } catch (err) {
        showToast('Load failed', 'Could not load bridge list', 'error');
        return;
    }
    if (!bridgeList.length) {
        showToast('No bridges', 'No structures found in the database', 'error');
        return;
    }
    var savedId = sessionStorage.getItem('structureId');
    var initial = bridgeList.find(function(b) { return String(b.id) === String(savedId); }) || bridgeList[0];
    selectBridge(initial.id);
}

/* ============================================================
   TOAST
   ============================================================ */
function showToast(title, msg, type) {
    var container = document.getElementById('toastContainer');
    if (!container) {
        container = document.createElement('div');
        container.className = 'toast-container';
        document.body.appendChild(container);
    }
    var toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = '<div class="toast-icon ' + type + '"><i class="fa-solid fa-check"></i></div>' +
        '<div class="toast-content"><div class="toast-title">' + title + '</div><div class="toast-msg">' + msg + '</div></div>';
    container.appendChild(toast);
    requestAnimationFrame(function() {
        toast.classList.add('show');
    });
    setTimeout(function() {
        toast.classList.remove('show');
        setTimeout(function() { toast.remove(); }, 400);
    }, 3000);
}

/* ============================================================
   THREE.JS DIGITAL TWIN
   ============================================================ */
const canvas = document.getElementById('twin-canvas');
const renderer = new THREE.WebGLRenderer({canvas: canvas, antialias: true, alpha: true});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x7a9490, 0.009);

// Far plane needs real headroom past the 130-200 unit cap most builders use
// for camDistance - the cantilever builder (Forth Bridge) can need ~2300+.
const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 5000);
let camDistance = 58, camHeight = 13;
camera.position.set(0, camHeight, camDistance);
camera.lookAt(0, 1.5, 0);

const ambientLight = new THREE.AmbientLight(0x8fa8a4, 0.7);
scene.add(ambientLight);
const key = new THREE.DirectionalLight(0xffffff, 1.1);
key.position.set(20, 30, 15);
scene.add(key);
const rim = new THREE.DirectionalLight(0x4a90b8, 0.45);
rim.position.set(-25, 10, -20);
scene.add(rim);
const teal = new THREE.PointLight(0x5b8c8a, 0.7, 80);
teal.position.set(-28, 8, 10);
scene.add(teal);

const matSteel = new THREE.MeshStandardMaterial({color: 0x5a6b6a, metalness: 0.6, roughness: 0.4});
const matDeck  = new THREE.MeshStandardMaterial({color: 0x394645, metalness: 0.25, roughness: 0.6});
const matPier  = new THREE.MeshStandardMaterial({color: 0x435150, metalness: 0.15, roughness: 0.7});
const matSensor = new THREE.MeshStandardMaterial({color: 0x6db3d8, emissive: 0x4a90b8, emissiveIntensity: 1.3});
const matDefect = new THREE.MeshStandardMaterial({color: 0xe06a5a, emissive: 0xc0392b, emissiveIntensity: 1.1});
const matStone    = new THREE.MeshStandardMaterial({color: 0x8a8378, metalness: 0.0, roughness: 0.95});
const matConcrete = new THREE.MeshStandardMaterial({color: 0x9aa39c, metalness: 0.05, roughness: 0.85});

/* ============================================================
   PROCEDURAL MATERIAL TEXTURES - canvas-drawn, tiled via the per-geometry
   UV scaling shapeBuilders.js's tileBoxUV() bakes in (see there for why).
   Kept as flat mid-tone grayscale/tint patterns so the "Realistic" skin's
   material.color below still tints them per skin - only the "Realistic"
   skin actually assigns these (see applySkin); twinView stays flat-color
   to keep its deliberately more abstract, stylised look.
   ============================================================ */
function makeCanvasTexture(draw, size) {
    size = size || 256;
    var canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    draw(canvas.getContext('2d'), size);
    var tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    return tex;
}

var texTarmac = makeCanvasTexture(function(c, size) {
    c.fillStyle = '#8c8c8c';
    c.fillRect(0, 0, size, size);
    for (var i = 0; i < size * size * 0.35; i++) {
        var x = Math.random() * size, y = Math.random() * size;
        var shade = 100 + Math.random() * 110;
        c.fillStyle = 'rgb(' + shade + ',' + shade + ',' + shade + ')';
        var r = 0.3 + Math.random() * 1.1;
        c.fillRect(x, y, r, r);
    }
    for (var p = 0; p < 6; p++) {
        var px = Math.random() * size, py = Math.random() * size, pr = 10 + Math.random() * 24;
        var grad = c.createRadialGradient(px, py, 0, px, py, pr);
        grad.addColorStop(0, 'rgba(40,40,40,0.35)');
        grad.addColorStop(1, 'rgba(40,40,40,0)');
        c.fillStyle = grad;
        c.beginPath(); c.arc(px, py, pr, 0, Math.PI * 2); c.fill();
    }
});

var texConcrete = makeCanvasTexture(function(c, size) {
    c.fillStyle = '#b4b0a6';
    c.fillRect(0, 0, size, size);
    for (var i = 0; i < 900; i++) {
        var x = Math.random() * size, y = Math.random() * size;
        var shade = 150 + Math.random() * 70;
        c.fillStyle = 'rgba(' + shade + ',' + shade + ',' + (shade - 10) + ',0.5)';
        var r = 1 + Math.random() * 3;
        c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
    }
    for (var s = 0; s < 10; s++) {
        var sx = Math.random() * size;
        var grad = c.createLinearGradient(sx, 0, sx, size);
        grad.addColorStop(0, 'rgba(90,88,80,0)');
        grad.addColorStop(0.5, 'rgba(90,88,80,0.12)');
        grad.addColorStop(1, 'rgba(90,88,80,0.22)');
        c.fillStyle = grad;
        c.fillRect(sx - 4 - Math.random() * 6, 0, 8 + Math.random() * 10, size);
    }
});

var texSteel = makeCanvasTexture(function(c, size) {
    c.fillStyle = '#9a9a9a';
    c.fillRect(0, 0, size, size);
    for (var y = 0; y < size; y++) {
        var shade = 130 + Math.random() * 60;
        c.strokeStyle = 'rgba(' + shade + ',' + shade + ',' + shade + ',0.5)';
        c.beginPath(); c.moveTo(0, y + 0.5); c.lineTo(size, y + 0.5); c.stroke();
    }
    for (var p = 0; p < 5; p++) {
        var px = Math.random() * size, py = Math.random() * size, pr = 6 + Math.random() * 16;
        var grad = c.createRadialGradient(px, py, 0, px, py, pr);
        grad.addColorStop(0, 'rgba(120,70,40,0.4)');
        grad.addColorStop(1, 'rgba(120,70,40,0)');
        c.fillStyle = grad;
        c.beginPath(); c.arc(px, py, pr, 0, Math.PI * 2); c.fill();
    }
});

var texStone = makeCanvasTexture(function(c, size) {
    c.fillStyle = '#8a8478';
    c.fillRect(0, 0, size, size);
    var rows = 6, mortar = 3;
    var rowH = size / rows;
    for (var row = 0; row < rows; row++) {
        var cols = 4 + (row % 2);
        var colW = size / cols;
        var offset = (row % 2) * (colW / 2);
        for (var col = -1; col < cols + 1; col++) {
            var shade = 120 + Math.random() * 60;
            c.fillStyle = 'rgb(' + shade + ',' + (shade - 6) + ',' + (shade - 18) + ')';
            c.fillRect(col * colW + offset + mortar / 2, row * rowH + mortar / 2, colW - mortar, rowH - mortar);
        }
    }
});

const rig = new THREE.Group();
scene.add(rig);
const structureGroup = new THREE.Group();
const sensorGroup = new THREE.Group();
const defectGroup = new THREE.Group();
rig.add(structureGroup, sensorGroup, defectGroup);

let gridHelper, glowMesh;

/* ============================================================
   SKINS - swap only the structure's material colors/finish (plus a
   mild lighting warmth on the structure itself). The stage backdrop,
   fog and grid/glow stay exactly as twinView always looks - applied
   to every structure since the materials are shared across all of
   shapeBuilders.js's kind-specific builders.
   ============================================================ */
const SKINS = {
    twinview: {
        label: 'twinView',
        lights: {
            ambient: { color: 0x8fa8a4, intensity: 0.7 },
            key: { color: 0xffffff, intensity: 1.1 },
            rim: { color: 0x4a90b8, intensity: 0.45 },
            teal: { color: 0x5b8c8a, intensity: 0.7 }
        },
        materials: {
            steel: { color: 0x5a6b6a, roughness: 0.4, metalness: 0.6 },
            deck: { color: 0x394645, roughness: 0.6, metalness: 0.25 },
            pier: { color: 0x435150, roughness: 0.7, metalness: 0.15 },
            stone: { color: 0x8a8378, roughness: 0.95, metalness: 0 },
            concrete: { color: 0x9aa39c, roughness: 0.85, metalness: 0.05 }
        }
    },
    realistic: {
        label: 'Realistic',
        lights: {
            ambient: { color: 0x8fa8a4, intensity: 0.7 },
            key: { color: 0xffe9c7, intensity: 1.3 },
            rim: { color: 0x4a90b8, intensity: 0.45 },
            teal: { color: 0x5b8c8a, intensity: 0.7 }
        },
        // Deliberately high contrast (dark tarmac deck against light stone/
        // concrete piers) - the twinView skin's fairly uniform dark teal-grey
        // across every part read as "barely different" from twinView at a
        // glance, unlike this same contrast on the Caversham page.
        materials: {
            steel: { color: 0x2e3a42, roughness: 0.35, metalness: 0.65 },
            deck: { color: 0x23272a, roughness: 0.95, metalness: 0.03 },
            pier: { color: 0xb0a790, roughness: 0.88, metalness: 0.02 },
            stone: { color: 0xcbb99e, roughness: 0.85, metalness: 0.02 },
            concrete: { color: 0xc2bcae, roughness: 0.88, metalness: 0.02 }
        },
        textures: { steel: texSteel, deck: texTarmac, pier: texConcrete, stone: texStone, concrete: texConcrete }
    }
};
const MAT_BY_KEY = { steel: matSteel, deck: matDeck, pier: matPier, stone: matStone, concrete: matConcrete };
let currentSkin = 'twinview';

function applySkin(name) {
    const skin = SKINS[name];
    if (!skin) return;
    currentSkin = name;

    Object.keys(skin.materials).forEach(function(matKey) {
        var mat = MAT_BY_KEY[matKey];
        var def = skin.materials[matKey];
        mat.color.setHex(def.color);
        mat.roughness = def.roughness;
        mat.metalness = def.metalness;
        mat.map = skin.textures ? (skin.textures[matKey] || null) : null;
        mat.needsUpdate = true;
    });

    ambientLight.color.setHex(skin.lights.ambient.color);
    ambientLight.intensity = skin.lights.ambient.intensity;
    key.color.setHex(skin.lights.key.color);
    key.intensity = skin.lights.key.intensity;
    rim.color.setHex(skin.lights.rim.color);
    rim.intensity = skin.lights.rim.intensity;
    teal.color.setHex(skin.lights.teal.color);
    teal.intensity = skin.lights.teal.intensity;

    document.querySelectorAll('.skin-pill').forEach(function(btn) {
        btn.classList.toggle('on', btn.dataset.skin === name);
    });
}

document.querySelectorAll('.skin-pill').forEach(function(btn) {
    btn.addEventListener('click', function() { applySkin(btn.dataset.skin); });
});

/* Shape builders (addBeam, addDeck, addPiers, archPoint, catenaryY,
   buildTrussPanelRun, all 9 build*Structure functions, BUILDERS) now
   live in shapeBuilders.js, shared with inspection/locate3d.js. */

function rebuildModel(bridge) {
    // Clear existing
    while(structureGroup.children.length > 0) structureGroup.remove(structureGroup.children[0]);
    while(sensorGroup.children.length > 0) sensorGroup.remove(sensorGroup.children[0]);
    while(defectGroup.children.length > 0) defectGroup.remove(defectGroup.children[0]);
    if (gridHelper) rig.remove(gridHelper);
    if (glowMesh) rig.remove(glowMesh);

    var SPAN_LEN = bridge.spanLength;
    var NUM_SPANS = bridge.spans;
    var DECK_W = bridge.deckWidth;
    var TRUSS_H = bridge.trussHeight || 0;
    var PANELS_PER_SPAN = bridge.panelsPerSpan || 4;
    var TOTAL_LEN = SPAN_LEN * NUM_SPANS;

    // Cantilever bridges (Forth Bridge) record length across wildly
    // non-uniform real spans - 2 ~520m main cantilever spans plus much
    // shorter approach viaducts. Averaging that by span count (the
    // TOTAL_LEN above) inflates the model to ~2500 units, shrinking the
    // iconic ~22-unit towers to an invisible bump on a vast flat deck.
    // Every other bridge model here is already a stylised representation,
    // not a literal scale model - use the same fixed sensible scale as
    // similarly grand bridges instead. Overridden here (not just inside the
    // builder) so sensors/grid/works-overlay below stay in proportion too.
    var kind = (bridge.model && bridge.model.kind) || 'truss';
    if (kind === 'cantilever') {
        TOTAL_LEN = (bridge.model && bridge.model.totalLen) || 220;
        SPAN_LEN = TOTAL_LEN / NUM_SPANS;
    }
    var X0 = -TOTAL_LEN / 2;
    var deckY = 0;

    // Grid - capped, since some builders (cantilever) use a fixed stylised
    // scale well under the bridge's literal recorded length (see there for
    // why), and an uncapped ground plane sized off the raw figure would
    // dwarf the structure actually rendered.
    var gridSize = Math.min(Math.max(140, TOTAL_LEN + 40), 400);
    gridHelper = new THREE.GridHelper(gridSize, Math.floor(gridSize / 2.5), 0x2a3a38, 0x1a2625);
    gridHelper.position.y = -8.4;
    gridHelper.material.transparent = true;
    gridHelper.material.opacity = 0.4;
    rig.add(gridHelper);

    // Glow
    var glowRadius = Math.min(Math.max(34, TOTAL_LEN / 2 + 6), 200);
    glowMesh = new THREE.Mesh(
        new THREE.CircleGeometry(glowRadius, 48),
        new THREE.MeshBasicMaterial({color: 0x5b8c8a, transparent: true, opacity: 0.07})
    );
    glowMesh.rotation.x = -Math.PI / 2;
    glowMesh.position.y = -8.3;
    rig.add(glowMesh);

    // Structure - dispatch on the per-bridge model kind (computed above)
    var builder = BUILDERS[kind] || buildTrussStructure;
    var ctx = {
        SPAN_LEN, NUM_SPANS, DECK_W, TRUSS_H, PANELS_PER_SPAN, TOTAL_LEN, X0, deckY,
        structureGroup, matSteel, matDeck, matPier, matStone, matConcrete
    };
    var frame = builder(bridge, ctx);

    // Some kinds (e.g. river piers reaching down to a riverbed well below
    // the default -8.4 ground line) need the ground/glow repositioned so
    // the structure actually reaches it instead of floating above it.
    if (frame.groundY != null) {
        gridHelper.position.y = frame.groundY;
        glowMesh.position.y = frame.groundY + 0.1;
    }

    // Sensors (procedural - no real telemetry source yet)
    generateSensors(bridge, SPAN_LEN).forEach(function(p) {
        var s = new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 16), matSensor);
        s.position.set(p.x, p.y, p.z);
        sensorGroup.add(s);
        var ring = new THREE.Mesh(
            new THREE.RingGeometry(0.6, 0.7, 24),
            new THREE.MeshBasicMaterial({color: 0x4a90b8, transparent: true, opacity: 0.5, side: THREE.DoubleSide})
        );
        ring.position.copy(s.position);
        sensorGroup.add(ring);
    });

    // Defects: only ones with real coordinates set are rendered. There's no
    // interface to place them yet, so this layer is sparse/empty until then.
    (bridge.defects || []).filter(function(d) {
        return d.x != null && d.y != null && d.z != null;
    }).forEach(function(p) {
        var m = new THREE.Mesh(new THREE.OctahedronGeometry(0.5, 0), matDefect);
        m.position.set(p.x, p.y, p.z);
        m.userData.defect = p;
        m.userData.positionExact = true;
        defectGroup.add(m);
    });

    // Camera adjustment - framing returned by whichever builder ran above
    camDistance = frame.camDistance;
    camHeight = frame.camHeight;

    // Fog density was tuned for camDistance ~130 (most builders' cap) -
    // scale it down for anything framed further out (the cantilever
    // builder's Forth Bridge can need ~2300+), or the bridge renders as a
    // wall of solid fog. Smaller/typical bridges are unaffected.
    scene.fog.density = 0.009 * Math.min(1, 130 / Math.max(130, camDistance));

    // Reset rotation
    rotY = 0.4;
    rotX = 0.18;

    // Reset layer toggles - defects off by default
    defectGroup.visible = false;
    document.querySelectorAll('.vc-pill[data-layer="defects"]').forEach(function(el) { el.classList.remove('on'); });
    document.querySelectorAll('.vc-pill[data-layer="structure"]').forEach(function(el) { el.classList.add('on'); });
    document.querySelectorAll('.vc-pill[data-layer="sensors"]').forEach(function(el) { el.classList.add('on'); });
}

/* ============================================================
   INTERACTION
   ============================================================ */
let rotY = 0.4, rotX = 0.18, autoRotate = true, idleTimer = null;
let dragging = false, lastX = 0, lastY = 0;

function onResize() {
    var w = canvas.clientWidth, h = canvas.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
}
window.addEventListener('resize', onResize);
new ResizeObserver(onResize).observe(canvas);

let downX = 0, downY = 0;
canvas.addEventListener('pointerdown', function(e) {
    dragging = true; autoRotate = false;
    lastX = e.clientX; lastY = e.clientY;
    downX = e.clientX; downY = e.clientY;
    clearTimeout(idleTimer);
});
window.addEventListener('pointerup', function(e) {
    // Captured before resetting - true only when the pointerdown that
    // started this gesture came from canvas's own listener below, so this
    // stands in for "did this gesture start on the 3D view" without
    // requiring pointerup's own target to still be exactly canvas (which a
    // little pointer jitter near the canvas edge can defeat even though the
    // click plainly happened on it).
    var wasOnCanvas = dragging;
    dragging = false;
    clearTimeout(idleTimer);
    idleTimer = setTimeout(function() { autoRotate = true; }, 3000);
    // A "click" (not a drag-to-orbit) is a pointerdown/up pair with barely
    // any movement between them - anything more is treated as orbiting.
    var moved = Math.hypot(e.clientX - downX, e.clientY - downY);
    if (wasOnCanvas && moved < 6) handleCanvasClick(e);
});
window.addEventListener('pointermove', function(e) {
    if (!dragging) return;
    var dx = e.clientX - lastX, dy = e.clientY - lastY;
    rotY += dx * 0.006;
    rotX += dy * 0.006;
    lastX = e.clientX; lastY = e.clientY;
});
canvas.addEventListener('wheel', function(e) {
    e.preventDefault();
    camDistance = Math.min(120, Math.max(20, camDistance + e.deltaY * 0.04));
}, {passive: false});

/* ============================================================
   DEFECT MARKER CLICK -> INFO POPUP
   ============================================================ */
const raycaster = new THREE.Raycaster();
const defectPopup = document.getElementById('defectPopup');
const modelStage = document.querySelector('.model-stage');

function handleCanvasClick(e) {
    var rect = canvas.getBoundingClientRect();
    var ndc = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1
    );
    raycaster.setFromCamera(ndc, camera);
    var targets = defectGroup.visible ? defectGroup.children.slice() : [];
    if (!targets.length) { hideDefectPopup(); return; }

    var hits = raycaster.intersectObjects(targets, false);
    if (!hits.length) { hideDefectPopup(); return; }

    var hit = hits[0].object;
    showDefectPopup(hit.userData.defect, hit.userData.positionExact, e.clientX, e.clientY);
}

function showDefectPopup(d, positionExact, clientX, clientY) {
    if (!d) return;
    var bridgeType = (selectedBridge && selectedBridge.type) || 'Bridge';
    var elementName = twinElementName(bridgeType, d.elementNo);
    var typeLabel = twinDefectTypeLabel(d.defectType, d.defectNumber);
    var defectCode = d.defectType && d.defectNumber ? (d.defectType + '.' + d.defectNumber) : null;

    var rows = [];
    if (d.severity != null) rows.push(['Severity', String(d.severity)]);
    if (d.extent) rows.push(['Extent', d.extent]);
    rows.push(['Works required', d.worksRequired ? 'Yes' : 'No']);
    if (d.worksRequired && d.priority) rows.push(['Priority', d.priority]);
    if (d.worksRequired && d.cost != null && d.cost > 0) rows.push(['Est. cost', '£' + d.cost.toLocaleString()]);

    var html = '<div class="defect-popup-head">' +
        '<div><b>' + escapeHtmlTwin(elementName) + '</b>' +
        (typeLabel ? '<span class="defect-popup-type">' + escapeHtmlTwin(typeLabel) + (defectCode ? ' (' + defectCode + ')' : '') + '</span>' : '') +
        '</div>' +
        '<button type="button" class="defect-popup-close" aria-label="Close">&times;</button>' +
        '</div>' +
        '<div class="defect-popup-body">' +
        rows.map(function(r) { return '<div class="defect-popup-row"><span>' + r[0] + '</span><b>' + escapeHtmlTwin(r[1]) + '</b></div>'; }).join('') +
        (d.comments ? '<div class="defect-popup-note"><i>' + escapeHtmlTwin(d.comments) + '</i></div>' : '') +
        (d.remedialWorks ? '<div class="defect-popup-remedial"><b>Remedial: </b>' + escapeHtmlTwin(d.remedialWorks) + '</div>' : '') +
        (!positionExact ? '<div class="defect-popup-approx"><i class="fa-solid fa-triangle-exclamation"></i> Approximate location - not yet placed on the model</div>' : '') +
        '</div>';

    defectPopup.innerHTML = html;
    defectPopup.querySelector('.defect-popup-close').addEventListener('click', hideDefectPopup);

    var stageRect = modelStage.getBoundingClientRect();
    var x = clientX - stageRect.left;
    var y = clientY - stageRect.top;
    defectPopup.style.display = 'block';
    // Clamp so the card can't spill past model-stage's edges (it clips
    // overflow:hidden content rather than letting the card push outside).
    var maxX = stageRect.width - defectPopup.offsetWidth - 12;
    var maxY = stageRect.height - defectPopup.offsetHeight - 12;
    defectPopup.style.left = Math.max(12, Math.min(x + 14, maxX)) + 'px';
    defectPopup.style.top = Math.max(12, Math.min(y + 14, maxY)) + 'px';

    // The model auto-rotating out from under an open popup (which stays
    // anchored to the screen point it was opened at, not the marker itself)
    // would immediately misalign it from the marker it describes - freeze
    // rotation for as long as the popup is open.
    autoRotate = false;
    clearTimeout(idleTimer);
}

function hideDefectPopup() {
    defectPopup.style.display = 'none';
    // Same idle delay the drag-to-orbit interaction already uses before
    // resuming auto-rotate, rather than snapping straight back to spinning.
    clearTimeout(idleTimer);
    idleTimer = setTimeout(function() { autoRotate = true; }, 3000);
}

function escapeHtmlTwin(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

document.addEventListener('click', function(e) {
    if (defectPopup.style.display === 'block' && !defectPopup.contains(e.target) && e.target !== canvas) {
        hideDefectPopup();
    }
});

document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && defectPopup.style.display === 'block') {
        hideDefectPopup();
    }
});

function bindLayerPills(selector) {
    document.querySelectorAll(selector).forEach(function(pill) {
        pill.addEventListener('click', function() {
            pill.classList.toggle('on');
            var layer = pill.dataset.layer;
            var on = pill.classList.contains('on');
            if (layer === 'structure') structureGroup.visible = on;
            if (layer === 'sensors') sensorGroup.visible = on;
            if (layer === 'defects') defectGroup.visible = on;
        });
    });
}
bindLayerPills('.vc-pill');

const yawReadout = document.getElementById('yaw-readout');
const tiltReadout = document.getElementById('tilt-readout');
const zoomReadout = document.getElementById('zoom-readout');

function animate() {
    requestAnimationFrame(animate);
    if (autoRotate && !dragging) rotY += 0.0022;
    rig.rotation.set(rotX, rotY, 0);
    camera.position.set(0, camHeight, camDistance);
    camera.lookAt(0, 1.5, 0);
    var yawDeg = ((rotY * 180 / Math.PI) % 360 + 360) % 360;
    var tiltDeg = ((rotX * 180 / Math.PI) % 360 + 360) % 360;
    yawReadout.textContent = yawDeg.toFixed(1).padStart(5, '0') + '°';
    tiltReadout.textContent = tiltDeg.toFixed(1).padStart(5, '0') + '°';
    zoomReadout.textContent = (58 / camDistance).toFixed(2) + 'x';
    renderer.render(scene, camera);
}

/* ============================================================
   THEME TOGGLE
   ============================================================ */
var nightToggle = document.getElementById('nightToggle');
nightToggle.addEventListener('click', function() {
    document.body.classList.toggle('night-mode');
    if (document.body.classList.contains('night-mode')) {
        nightToggle.innerHTML = '<i class="fas fa-sun"></i>';
        localStorage.setItem('nightMode', 'on');
    } else {
        nightToggle.innerHTML = '<i class="fas fa-moon"></i>';
        localStorage.setItem('nightMode', 'off');
    }
});
var savedNightMode = localStorage.getItem('nightMode');
var systemPrefersLight = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches;
document.documentElement.classList.remove('nm-preload');
if (savedNightMode === 'on' || (savedNightMode === null && !systemPrefersLight)) {
    document.body.classList.add('night-mode');
    nightToggle.innerHTML = '<i class="fas fa-sun"></i>';
}

/* ============================================================
   INIT
   ============================================================ */
onResize();
animate();
loadBridgeList();
applySkin('twinview');
