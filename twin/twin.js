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
function renderBciTrendChart(inspections) {
    var wrap = document.getElementById('bciTrendChart');
    var sub = document.getElementById('trendSub');
    var valid = (inspections || []).filter(function(i) { return i.bciAvg != null || i.bciCrit != null; });

    if (valid.length < 2) {
        sub.textContent = valid.length ? '1 inspection' : '—';
        wrap.innerHTML = '<div class="trend-empty"><i class="fa-solid fa-chart-line"></i>Not enough inspection history yet</div>';
        return;
    }

    sub.textContent = valid.length + ' inspections · ' + valid[0].date + ' – ' + valid[valid.length - 1].date;

    var width = 296, height = 140, padL = 4, padR = 4, padT = 10, padB = 20;
    var innerW = width - padL - padR, innerH = height - padT - padB;
    var minV = 30, maxV = 100;

    var timestamps = valid.map(function(i) { return i.timestamp; });
    var minT = Math.min.apply(null, timestamps), maxT = Math.max.apply(null, timestamps);
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

    var avgPts = seriesPoints('bciAvg');
    var critPts = seriesPoints('bciCrit');
    var goodY = yAt(65), critY = yAt(50);

    var svg = '<svg viewBox="0 0 ' + width + ' ' + height + '" width="100%" height="' + height + '">';

    svg += '<line class="trend-ref-line" x1="0" y1="' + goodY.toFixed(1) + '" x2="' + width + '" y2="' + goodY.toFixed(1) + '"/>';
    svg += '<line class="trend-ref-line" x1="0" y1="' + critY.toFixed(1) + '" x2="' + width + '" y2="' + critY.toFixed(1) + '"/>';
    svg += '<text class="trend-axis-label" x="' + (width - 2) + '" y="' + (goodY - 3).toFixed(1) + '" font-size="8" text-anchor="end">65</text>';
    svg += '<text class="trend-axis-label" x="' + (width - 2) + '" y="' + (critY - 3).toFixed(1) + '" font-size="8" text-anchor="end">50</text>';

    if (avgPts.length > 1) {
        svg += '<g class="trend-avg-color"><path d="' + pathFor(avgPts) + '" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></g>';
    }
    if (critPts.length > 1) {
        svg += '<g class="trend-crit-color"><path d="' + pathFor(critPts) + '" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></g>';
    }

    svg += '<line class="trend-crosshair" id="trendCrosshair" x1="0" y1="' + padT + '" x2="0" y2="' + (padT + innerH) + '"/>';

    svg += '<text class="trend-date-label" x="' + xAt(valid[0].timestamp).toFixed(1) + '" y="' + height + '" font-size="9" text-anchor="start">' + valid[0].date + '</text>';
    svg += '<text class="trend-date-label" x="' + xAt(valid[valid.length - 1].timestamp).toFixed(1) + '" y="' + height + '" font-size="9" text-anchor="end">' + valid[valid.length - 1].date + '</text>';

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
        document.getElementById('factMaterial').textContent = bridge.material || '—';
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

// Cone marker (distinct from the octahedron defect markers) for the Works
// Required layer. exact=false (no placed x/y/z) renders semi-transparent so
// it reads as an estimate rather than a precise location.
function createWorksMarker(exact) {
    var color = 0xc28b5a;
    var mat = new THREE.MeshStandardMaterial({
        color: color, emissive: color, emissiveIntensity: 1.1,
        transparent: !exact, opacity: exact ? 1 : 0.55
    });
    return new THREE.Mesh(new THREE.ConeGeometry(0.7, 1.6, 8), mat);
}

// Real placed position if this defect has one, otherwise a position spread
// across its span/element so multiple unlocated works-required defects in
// the same span don't all stack on one spot.
function worksMarkerPosition(d, X0, SPAN_LEN, NUM_SPANS, DECK_W, deckY) {
    if (d.x != null && d.y != null && d.z != null) {
        return { x: d.x, y: d.y, z: d.z, exact: true };
    }
    var spanIdx = Math.min(Math.max((d.spanNumber || 1) - 1, 0), Math.max(NUM_SPANS - 1, 0));
    var x = X0 + SPAN_LEN * spanIdx + SPAN_LEN / 2;
    var seed = ((d.elementNo || 0) * 37) % 100 / 100;
    x += (seed - 0.5) * SPAN_LEN * 0.6;
    var z = ((d.elementNo || 0) % 2 === 0 ? 1 : -1) * (DECK_W * 0.25);
    return { x: x, y: deckY + 1.6, z: z, exact: false };
}

const rig = new THREE.Group();
scene.add(rig);
const structureGroup = new THREE.Group();
const sensorGroup = new THREE.Group();
const worksGroup = new THREE.Group();
const defectGroup = new THREE.Group();
rig.add(structureGroup, sensorGroup, worksGroup, defectGroup);

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
        }
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
    while(worksGroup.children.length > 0) worksGroup.remove(worksGroup.children[0]);
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

    // Works Required markers — one per defect flagged works_required='Y',
    // at its real placed position if it has one, otherwise an approximate
    // spot within its span so the layer isn't empty just because most
    // defects haven't been located on the model yet.
    (bridge.defects || []).filter(function(d) { return d.worksRequired; }).forEach(function(d) {
        var pos = worksMarkerPosition(d, X0, SPAN_LEN, NUM_SPANS, DECK_W, deckY);
        var m = createWorksMarker(pos.exact);
        m.position.set(pos.x, pos.y, pos.z);
        worksGroup.add(m);
    });

    // Defects: only ones with real coordinates set are rendered. There's no
    // interface to place them yet, so this layer is sparse/empty until then.
    (bridge.defects || []).filter(function(d) {
        return d.x != null && d.y != null && d.z != null;
    }).forEach(function(p) {
        var m = new THREE.Mesh(new THREE.OctahedronGeometry(0.5, 0), matDefect);
        m.position.set(p.x, p.y, p.z);
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

    // Reset layer toggles - works required and defects off by default
    worksGroup.visible = false;
    defectGroup.visible = false;
    document.querySelectorAll('.vc-pill[data-layer="works"]').forEach(function(el) { el.classList.remove('on'); });
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

canvas.addEventListener('pointerdown', function(e) {
    dragging = true; autoRotate = false;
    lastX = e.clientX; lastY = e.clientY;
    clearTimeout(idleTimer);
});
window.addEventListener('pointerup', function() {
    dragging = false;
    clearTimeout(idleTimer);
    idleTimer = setTimeout(function() { autoRotate = true; }, 3000);
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

function bindLayerPills(selector) {
    document.querySelectorAll(selector).forEach(function(pill) {
        pill.addEventListener('click', function() {
            pill.classList.toggle('on');
            var layer = pill.dataset.layer;
            var on = pill.classList.contains('on');
            if (layer === 'structure') structureGroup.visible = on;
            if (layer === 'sensors') sensorGroup.visible = on;
            if (layer === 'works') worksGroup.visible = on;
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
