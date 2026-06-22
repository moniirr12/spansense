/* ============================================================
   SPANSENSE - TWINVIEW PAGE SCRIPTS
   ============================================================ */

var API_BASE = window.location.hostname === 'localhost'
    ? 'http://localhost:3000'
    : 'https://spansense.onrender.com';

/* ============================================================
   PROCEDURAL SENSORS (no real telemetry exists yet - these are
   plausible monitoring points derived from real span/pier geometry)
   ============================================================ */
function generateSensors(bridge) {
    var spanLen = bridge.spanLength, numSpans = bridge.spans, deckW = bridge.deckWidth;
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
async function selectBridge(bridgeId) {
    var listEntry = bridgeList.find(function(b) { return String(b.id) === String(bridgeId); });
    if (!listEntry) return;

    var res;
    try {
        res = await fetch(API_BASE + '/api/twin/' + bridgeId);
        if (!res.ok) throw new Error('Failed to load twin data');
    } catch (err) {
        showToast('Load failed', 'Could not load ' + listEntry.name, 'error');
        return;
    }
    var bridge = await res.json();

    // 3D geometry isn't in the DB - look it up from the hand-authored model file
    var model = getBridgeModel(bridge.id, bridge.type);
    bridge.model = model;                 // full per-kind param bag, incl. model.kind
    bridge.deckWidth = model.deckWidth;   // kept flat: generateSensors() + stress overlay read these directly
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

        document.getElementById('factSpan').textContent = bridge.spanLength ? (bridge.spanLength * bridge.spans).toFixed(1) + ' m' : '—';
        document.getElementById('factSpans').textContent = bridge.spans;
        document.getElementById('factMaterial').textContent = bridge.material || '—';
        document.getElementById('factYear').textContent = bridge.yearBuilt || '—';

        document.getElementById('lastInsp').textContent = bridge.lastInspection || 'None recorded';
        document.getElementById('nextInsp').textContent = bridge.nextInspection || '—';
        document.getElementById('nextInsp').className = 'status-badge ' + (bridge.isOverdue ? 'error' : 'pending');

        var defectsEl = document.getElementById('openDefects');
        defectsEl.textContent = bridge.openDefects > 0 ? bridge.openDefects + ' flagged' : 'None';
        defectsEl.className = 'status-badge ' + (bridge.openDefects > 0 ? 'error' : 'completed');

        document.getElementById('timelineRange').textContent = bridge.timelineRange || '—';
        renderTimeline(bridge.inspections || []);

        infoCol.style.opacity = '1';
    }, 150);

    rebuildModel(bridge);
    renderDropdownList();
    showToast('Bridge loaded', bridge.name + ' · ' + bridge.id, 'success');
}

function renderTimeline(inspections) {
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
        return '<div class="tl-node" data-type="' + insp.type + '" style="' + style + '"></div>' + label;
    }).join('');
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

const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 1000);
let camDistance = 58, camHeight = 13;
camera.position.set(0, camHeight, camDistance);
camera.lookAt(0, 1.5, 0);

scene.add(new THREE.AmbientLight(0x8fa8a4, 0.7));
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

function spanColor(bci) {
    if (bci == null) return 0x8a9ba8;
    if (bci < 50) return 0xc0392b;
    if (bci < 65) return 0xc28b5a;
    return 0x5b8c8a;
}

const rig = new THREE.Group();
scene.add(rig);
const structureGroup = new THREE.Group();
const sensorGroup = new THREE.Group();
const stressGroup = new THREE.Group();
const defectGroup = new THREE.Group();
rig.add(structureGroup, sensorGroup, stressGroup, defectGroup);

let gridHelper, glowMesh;

/* ============================================================
   SHARED GEOMETRY HELPERS (used by every shape builder below)
   ============================================================ */
function addBeam(x1, y1, z1, x2, y2, z2, thickness, material) {
    var dx = x2 - x1, dy = y2 - y1, dz = z2 - z1;
    var len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    var geo = new THREE.BoxGeometry(len, thickness, thickness);
    var mesh = new THREE.Mesh(geo, material);
    mesh.position.set((x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2);
    mesh.lookAt(x2, y2, z2);
    mesh.rotateY(Math.PI / 2);
    structureGroup.add(mesh);
}

function addDeck(X0, TOTAL_LEN, DECK_W, deckY, thickness) {
    var deckGeo = new THREE.BoxGeometry(TOTAL_LEN, thickness || 0.6, DECK_W);
    var deck = new THREE.Mesh(deckGeo, matDeck);
    deck.position.set(0, deckY, 0);
    structureGroup.add(deck);
    var edges = new THREE.LineSegments(new THREE.EdgesGeometry(deckGeo), new THREE.LineBasicMaterial({color: 0x223230}));
    edges.position.copy(deck.position);
    structureGroup.add(edges);
}

// Piers/abutments at each span boundary - opt-in (only kinds with real
// piers call this; previously this ran unconditionally for every kind).
function addPiers(X0, SPAN_LEN, NUM_SPANS, DECK_W, deckY, opts) {
    opts = opts || {};
    var pierHeight = opts.pierHeight || 8.4;
    var abutmentWidth = opts.abutmentWidth || 6;
    var pierWidth = opts.pierWidth || 2.6;
    var pierDepth = opts.pierDepth || 3.2;
    var pierPositions = [];
    for (var i = 0; i <= NUM_SPANS; i++) {
        pierPositions.push(X0 + SPAN_LEN * i);
    }
    if (opts.abutmentsOnly) pierPositions = [pierPositions[0], pierPositions[pierPositions.length - 1]];
    pierPositions.forEach(function(x, i) {
        var isAbutment = opts.abutmentsOnly || i === 0 || i === pierPositions.length - 1;
        var w = isAbutment ? abutmentWidth : pierWidth;
        var geo = new THREE.BoxGeometry(w, pierHeight, isAbutment ? DECK_W + 1 : pierDepth);
        var pier = new THREE.Mesh(geo, matPier);
        pier.position.set(x, deckY - 0.3 - pierHeight / 2, 0);
        structureGroup.add(pier);
    });
}

// Parabolic arch sample point: t in [0,1] across the arch span.
function archPoint(t, X0, TOTAL_LEN, deckY, archHeight) {
    return { x: X0 + t * TOTAL_LEN, y: deckY + archHeight * 4 * t * (1 - t) };
}

// Simple quadratic cable droop (not a true catenary - close enough for
// this low-poly look). t in [0,1] between two towers of equal height.
function catenaryY(t, deckY, towerHeight, sag) {
    var droop = towerHeight * (sag || 0.16);
    return deckY + towerHeight - droop * 4 * t * (1 - t);
}

// A short run of Warren-truss panels between two x positions at one z side.
function buildTrussPanelRun(x1, x2, z, yLow, yHigh, panelCount, material) {
    var pw = (x2 - x1) / panelCount;
    addBeam(x1, yLow, z, x2, yLow, z, 0.5, material);
    addBeam(x1, yHigh, z, x2, yHigh, z, 0.5, material);
    for (var i = 0; i <= panelCount; i++) {
        var x = x1 + i * pw;
        addBeam(x, yLow, z, x, yHigh, z, 0.35, material);
        if (i < panelCount) {
            var xNext = x + pw;
            if (i % 2 === 0) addBeam(x, yLow, z, xNext, yHigh, z, 0.32, material);
            else addBeam(x, yHigh, z, xNext, yLow, z, 0.32, material);
        }
    }
}

/* ============================================================
   SHAPE BUILDERS - one per bridgeModels.js `kind`. Each populates
   structureGroup only and returns {camDistance, camHeight} framing
   tuned to its own scale. Sensors/stress/defects stay kind-agnostic
   (built once, generically, back in rebuildModel below).
   ============================================================ */
function buildTrussStructure(bridge, ctx) {
    var SPAN_LEN = ctx.SPAN_LEN, NUM_SPANS = ctx.NUM_SPANS, DECK_W = ctx.DECK_W,
        TRUSS_H = ctx.TRUSS_H, PANELS_PER_SPAN = ctx.PANELS_PER_SPAN,
        TOTAL_LEN = ctx.TOTAL_LEN, X0 = ctx.X0, deckY = ctx.deckY;

    addDeck(X0, TOTAL_LEN, DECK_W, deckY);

    if (TRUSS_H > 0) {
        [DECK_W / 2, -DECK_W / 2].forEach(function(z) {
            buildTrussPanelRun(X0, X0 + TOTAL_LEN, z, deckY + 0.3, deckY + TRUSS_H, PANELS_PER_SPAN * NUM_SPANS, matSteel);
        });

        // Cross bracing
        var totalPanels = PANELS_PER_SPAN * NUM_SPANS;
        var pw = TOTAL_LEN / totalPanels;
        for (var i = 0; i <= totalPanels; i += 2) {
            var x = X0 + i * pw;
            addBeam(x, deckY + TRUSS_H, -DECK_W / 2, x, deckY + TRUSS_H, DECK_W / 2, 0.3, matSteel);
        }
    }

    addPiers(X0, SPAN_LEN, NUM_SPANS, DECK_W, deckY);

    return {
        camDistance: Math.min(Math.max(40, TOTAL_LEN * 0.9), 200),
        camHeight: Math.min(Math.max(10, TRUSS_H + 6), 20)
    };
}

// Mass retaining wall - no deck/piers/truss at all, just a long solid block.
function buildWallStructure(bridge, ctx) {
    var TOTAL_LEN = ctx.TOTAL_LEN, deckY = ctx.deckY;
    var model = bridge.model || {};
    var wallHeight = model.wallHeight || 6;
    var wallThickness = model.wallThickness || 1.4;
    var material = model.material === 'concrete' ? matConcrete : matStone;

    function addSlab(width, height, depth, y) {
        var geo = new THREE.BoxGeometry(width, height, depth);
        var mesh = new THREE.Mesh(geo, material);
        mesh.position.set(0, y, 0);
        structureGroup.add(mesh);
        var edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({color: 0x2a2620}));
        edges.position.copy(mesh.position);
        structureGroup.add(edges);
    }

    if (model.battered) {
        // Battered (sloped) face: stack progressively narrower tiers.
        var tiers = 3;
        var tierHeight = wallHeight / tiers;
        for (var i = 0; i < tiers; i++) {
            var tierThickness = wallThickness * (1 - i * 0.22);
            addSlab(TOTAL_LEN, tierHeight, tierThickness, deckY + tierHeight * i + tierHeight / 2);
        }
    } else {
        addSlab(TOTAL_LEN, wallHeight, wallThickness, deckY + wallHeight / 2);
    }

    return {
        camDistance: Math.min(Math.max(25, TOTAL_LEN * 0.75), 130),
        camHeight: Math.min(Math.max(5, wallHeight + 2), 10)
    };
}

// Buried box culvert - low concrete conduit at grade, no piers, with dark
// "bore" openings at each end face to read as hollow rather than solid.
function buildCulvertStructure(bridge, ctx) {
    var TOTAL_LEN = ctx.TOTAL_LEN, DECK_W = ctx.DECK_W, deckY = ctx.deckY;
    var model = bridge.model || {};
    var culvertHeight = model.culvertHeight || 2.2;
    var culvertThickness = model.culvertThickness || 0.5;
    var boxY = deckY + culvertHeight * 0.2; // sits mostly at grade, slightly proud

    var geo = new THREE.BoxGeometry(TOTAL_LEN, culvertHeight, DECK_W);
    var box = new THREE.Mesh(geo, matConcrete);
    box.position.set(0, boxY, 0);
    structureGroup.add(box);
    var edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({color: 0x2a2620}));
    edges.position.copy(box.position);
    structureGroup.add(edges);

    var voidW = Math.max(0.6, DECK_W - culvertThickness * 2);
    var voidH = Math.max(0.6, culvertHeight - culvertThickness * 2);
    var voidMat = new THREE.MeshBasicMaterial({color: 0x0c1412, side: THREE.DoubleSide});
    [-1, 1].forEach(function(dir) {
        var voidMesh = new THREE.Mesh(new THREE.PlaneGeometry(voidW, voidH), voidMat);
        voidMesh.position.set(dir * (TOTAL_LEN / 2 - 0.02), boxY, 0);
        voidMesh.rotation.y = Math.PI / 2;
        structureGroup.add(voidMesh);
    });

    return {
        camDistance: Math.min(Math.max(20, TOTAL_LEN * 0.7), 130),
        camHeight: Math.min(Math.max(4, culvertHeight + 2), 8)
    };
}

// Stonehenge-style trilithons - discrete upright-post pairs + lintels,
// NOT a continuous wall (no deck/piers/wall slab at all).
function buildTrilithonStructure(bridge, ctx) {
    var TOTAL_LEN = ctx.TOTAL_LEN, deckY = ctx.deckY;
    var model = bridge.model || {};
    var postHeight = model.postHeight || 4.2;
    var postWidth = model.postWidth || 1.1;
    var lintelThickness = model.lintelThickness || 0.7;
    var numTrilithons = model.numTrilithons || 5;
    var postGap = postWidth * 1.3;

    var spacing = TOTAL_LEN / numTrilithons;
    var startX = -TOTAL_LEN / 2 + spacing / 2;

    for (var i = 0; i < numTrilithons; i++) {
        var x = startX + i * spacing;
        if (model.irregularSpacing) {
            // Deterministic pseudo-random jitter (no Math.random()) so the
            // layout is stable across rebuilds/screenshots.
            var jitter = (Math.sin(i * 12.9898) * 43758.5453) % 1;
            x += jitter * spacing * 0.3;
        }
        [-1, 1].forEach(function(side) {
            var post = new THREE.Mesh(new THREE.BoxGeometry(postWidth, postHeight, postWidth), matStone);
            post.position.set(x, deckY + postHeight / 2, side * postGap / 2);
            structureGroup.add(post);
        });
        var lintel = new THREE.Mesh(new THREE.BoxGeometry(postWidth * 1.4, lintelThickness, postGap + postWidth), matStone);
        lintel.position.set(x, deckY + postHeight + lintelThickness / 2, 0);
        structureGroup.add(lintel);
    }

    return {
        camDistance: Math.min(Math.max(28, TOTAL_LEN * 0.8), 130),
        camHeight: Math.min(Math.max(6, postHeight + 3), 12)
    };
}

// Through-arch / arch bridge: a segmented parabolic arch with hangers down
// to the deck (vertical or inclined), or no hangers at all if the deck
// rests directly on the arch (Iron Bridge).
function buildArchStructure(bridge, ctx) {
    var DECK_W = ctx.DECK_W, TOTAL_LEN = ctx.TOTAL_LEN, X0 = ctx.X0, deckY = ctx.deckY,
        SPAN_LEN = ctx.SPAN_LEN, NUM_SPANS = ctx.NUM_SPANS, PANELS_PER_SPAN = ctx.PANELS_PER_SPAN;
    var model = bridge.model || {};
    var archHeight = model.archHeight || 9;
    var archThickness = model.archThickness || 0.6;
    var hangerStyle = model.hangerStyle || 'vertical';

    // Deck rests directly on/near the arch crown when there are no hangers.
    var deckYActual = hangerStyle === 'none' ? deckY + archHeight * 0.55 : deckY;

    addDeck(X0, TOTAL_LEN, DECK_W, deckYActual);

    // Arch: segmented voussoir chain on both sides of the deck.
    var archSamples = 16;
    var archZ = [DECK_W / 2 + 0.3, -(DECK_W / 2 + 0.3)];
    archZ.forEach(function(z) {
        var prev = null;
        for (var i = 0; i <= archSamples; i++) {
            var t = i / archSamples;
            var p = archPoint(t, X0, TOTAL_LEN, deckY, archHeight);
            if (prev) addBeam(prev.x, prev.y, z, p.x, p.y, z, archThickness, matSteel);
            prev = p;
        }
    });

    if (hangerStyle !== 'none') {
        var totalPanels = PANELS_PER_SPAN * NUM_SPANS;
        var pw = TOTAL_LEN / totalPanels;
        archZ.forEach(function(z) {
            for (var i = 1; i < totalPanels; i++) {
                var x = X0 + i * pw;
                var t = i / totalPanels;
                var archY = archPoint(t, X0, TOTAL_LEN, deckY, archHeight).y;
                if (archY <= deckYActual + 0.3) continue; // too close to the abutments
                var deckAttachX = hangerStyle === 'inclined' ? x + pw * 0.4 : x;
                addBeam(deckAttachX, deckYActual + 0.3, z, x, archY, z, 0.22, matSteel);
            }
        });
    }

    addPiers(X0, SPAN_LEN, NUM_SPANS, DECK_W, deckYActual, { abutmentsOnly: true });

    return {
        camDistance: Math.min(Math.max(40, TOTAL_LEN * 0.9), 200),
        camHeight: Math.min(Math.max(12, archHeight + 6), 22)
    };
}

// Suspension bridge: towers at each span boundary, a draped main cable with
// vertical (or zigzag) hangers down to the deck, and optional extra straight
// stay-cables for hybrid suspension+cable-stay structures (Albert Bridge).
function buildSuspensionStructure(bridge, ctx) {
    var SPAN_LEN = ctx.SPAN_LEN, NUM_SPANS = ctx.NUM_SPANS, DECK_W = ctx.DECK_W,
        PANELS_PER_SPAN = ctx.PANELS_PER_SPAN, TOTAL_LEN = ctx.TOTAL_LEN, X0 = ctx.X0, deckY = ctx.deckY;
    var model = bridge.model || {};
    var towerHeight = model.towerHeight || 26;
    var cableSag = model.cableSag != null ? model.cableSag : 0.16;
    var deckThickness = ctx.TRUSS_H || 2.4; // girder depth (no truss sides on this kind)
    var cableZ = [DECK_W / 2 + 0.4, -(DECK_W / 2 + 0.4)];

    addDeck(X0, TOTAL_LEN, DECK_W, deckY, deckThickness);

    // Towers at each span boundary (same x-positions addPiers would use).
    var towerXs = [];
    for (var i = 0; i <= NUM_SPANS; i++) towerXs.push(X0 + SPAN_LEN * i);
    var towerBaseY = deckY - 8;
    var towerTopY = deckY + towerHeight;
    var towerH = towerTopY - towerBaseY;
    towerXs.forEach(function(x) {
        cableZ.forEach(function(z) {
            var tower = new THREE.Mesh(new THREE.BoxGeometry(1.6, towerH, 1.6), matPier);
            tower.position.set(x, towerBaseY + towerH / 2, z);
            structureGroup.add(tower);
        });
    });

    // Main cable, sampled per span between adjacent towers.
    var cableSamples = 20;
    cableZ.forEach(function(z) {
        for (var s = 0; s < towerXs.length - 1; s++) {
            var xa = towerXs[s], xb = towerXs[s + 1];
            var prev = null;
            for (var i = 0; i <= cableSamples; i++) {
                var t = i / cableSamples;
                var x = xa + t * (xb - xa);
                var y = catenaryY(t, deckY, towerHeight, cableSag);
                if (prev) addBeam(prev.x, prev.y, z, x, y, z, 0.18, matSteel);
                prev = { x: x, y: y };
            }
        }
    });

    // Hangers from the cable down to the deck at each panel position.
    var totalPanels = PANELS_PER_SPAN * NUM_SPANS;
    var pw = TOTAL_LEN / totalPanels;
    cableZ.forEach(function(z) {
        for (var i = 1; i < totalPanels; i++) {
            var x = X0 + i * pw;
            var spanIdx = Math.min(NUM_SPANS - 1, Math.floor((x - X0) / SPAN_LEN));
            var xa = towerXs[spanIdx], xb = towerXs[spanIdx + 1];
            var t = (x - xa) / (xb - xa);
            var cableY = catenaryY(t, deckY, towerHeight, cableSag);
            var hangerX = x;
            if (model.zigzagHangers) hangerX = x + (i % 2 === 0 ? pw * 0.3 : -pw * 0.3);
            addBeam(hangerX, deckY + deckThickness / 2, z, x, cableY, z, 0.15, matSteel);
        }
    });

    // Extra straight stay-cables from tower tops to the deck (hybrid kind).
    if (model.stays) {
        cableZ.forEach(function(z) {
            towerXs.forEach(function(towerX) {
                [-1, 1].forEach(function(dir) {
                    var deckX = towerX + dir * SPAN_LEN * 0.3;
                    if (deckX < X0 || deckX > X0 + TOTAL_LEN) return;
                    addBeam(towerX, towerTopY - 1, z, deckX, deckY + deckThickness / 2, z, 0.15, matSteel);
                });
            });
        });
    }

    // Capped well below TOTAL_LEN*0.85 - real suspension spans (Humber is
    // 1410m) would otherwise push the camera so far back that towers and
    // cables shrink to illegible specks. This views a representative
    // section near mid-span rather than the entire real-world length.
    var camDistance = Math.min(Math.max(50, TOTAL_LEN * 0.85), 110);
    return {
        camDistance: camDistance,
        camHeight: Math.min(Math.max(16, towerHeight * 0.7), 32)
    };
}

// Low-profile cable-stay footbridge (Millennium Bridge): no tall towers,
// just short mast stubs with straight shallow cables to a thin deck.
function buildCableStayLowStructure(bridge, ctx) {
    var DECK_W = ctx.DECK_W, TOTAL_LEN = ctx.TOTAL_LEN, X0 = ctx.X0, deckY = ctx.deckY,
        PANELS_PER_SPAN = ctx.PANELS_PER_SPAN, NUM_SPANS = ctx.NUM_SPANS;
    var model = bridge.model || {};
    var mastHeight = model.mastHeight || 4.5;
    var deckThickness = ctx.TRUSS_H || 0.6;

    addDeck(X0, TOTAL_LEN, DECK_W, deckY, deckThickness);

    var totalPanels = PANELS_PER_SPAN * NUM_SPANS;
    var pw = TOTAL_LEN / totalPanels;
    var mastZ = [DECK_W / 2 + 0.2, -(DECK_W / 2 + 0.2)];
    for (var i = 1; i < totalPanels; i += 2) {
        var x = X0 + i * pw;
        mastZ.forEach(function(z) {
            var mast = new THREE.Mesh(new THREE.BoxGeometry(0.3, mastHeight, 0.3), matSteel);
            mast.position.set(x, deckY + deckThickness / 2 + mastHeight / 2, z);
            structureGroup.add(mast);
            var mastTopY = deckY + deckThickness / 2 + mastHeight;
            [-1, 1].forEach(function(dir) {
                var deckX = x + dir * pw * 1.5;
                if (deckX < X0 || deckX > X0 + TOTAL_LEN) return;
                addBeam(x, mastTopY, z, deckX, deckY + deckThickness / 2, z, 0.08, matSteel);
            });
        });
    }

    return {
        camDistance: Math.min(Math.max(30, TOTAL_LEN * 0.8), 130),
        camHeight: Math.min(Math.max(6, mastHeight + 3), 12)
    };
}

// Cantilever railway bridge (Forth Bridge): 3 diamond-lattice towers, each
// reaching cantilever arms toward its neighbours, with a suspended truss
// span filling the gap between arm tips.
function buildCantileverStructure(bridge, ctx) {
    var DECK_W = ctx.DECK_W, TOTAL_LEN = ctx.TOTAL_LEN, X0 = ctx.X0, deckY = ctx.deckY;
    var model = bridge.model || {};
    var towerHeight = model.towerHeight || 22;

    addDeck(X0, TOTAL_LEN, DECK_W, deckY);

    var towerXs = [X0 + TOTAL_LEN * 0.17, X0 + TOTAL_LEN * 0.5, X0 + TOTAL_LEN * 0.83];
    var baseY = deckY - 8, topY = deckY + towerHeight, midY = deckY + towerHeight * 0.45;
    var baseHalfW = 4, topHalfW = 3;
    var towerZ = [DECK_W / 2, -DECK_W / 2];

    towerXs.forEach(function(tx) {
        towerZ.forEach(function(z) {
            // Diamond lattice: base corners -> waist point -> top corners.
            addBeam(tx - baseHalfW, baseY, z, tx, midY, z, 0.4, matSteel);
            addBeam(tx + baseHalfW, baseY, z, tx, midY, z, 0.4, matSteel);
            addBeam(tx, midY, z, tx - topHalfW, topY, z, 0.4, matSteel);
            addBeam(tx, midY, z, tx + topHalfW, topY, z, 0.4, matSteel);
            addBeam(tx, baseY, z, tx, topY, z, 0.3, matSteel);
        });
        addBeam(tx, midY, towerZ[0], tx, midY, towerZ[1], 0.35, matSteel);
        addBeam(tx, topY, towerZ[0], tx, topY, towerZ[1], 0.3, matSteel);
    });

    // Cantilever arms + suspended center span between each pair of towers.
    for (var s = 0; s < towerXs.length - 1; s++) {
        var xa = towerXs[s], xb = towerXs[s + 1];
        var armLen = (xb - xa) * 0.32;
        var armY = deckY + towerHeight * 0.38;
        towerZ.forEach(function(z) {
            addBeam(xa, midY, z, xa + armLen, armY, z, 0.3, matSteel);
            addBeam(xb, midY, z, xb - armLen, armY, z, 0.3, matSteel);
            buildTrussPanelRun(xa + armLen, xb - armLen, z, deckY + 0.3, armY, 4, matSteel);
        });
    }

    return {
        camDistance: Math.min(Math.max(55, TOTAL_LEN * 0.95), 130),
        camHeight: Math.min(Math.max(16, towerHeight * 0.65), 30)
    };
}

// Bascule bridge (Tower Bridge): twin towers with a high walkway, a central
// lifting gap between the two deck leaves, and simplified suspension-style
// side spans outboard of the towers.
function buildBasculeStructure(bridge, ctx) {
    var DECK_W = ctx.DECK_W, TOTAL_LEN = ctx.TOTAL_LEN, deckY = ctx.deckY;
    var model = bridge.model || {};
    var towerHeight = model.towerHeight || 24;
    var towerWidth = model.towerWidth || 5;
    var leafGap = model.leafGap != null ? model.leafGap : 1.2;
    var sideSpanRatio = model.sideSpanRatio || 0.6;

    var towerX = TOTAL_LEN * 0.15;
    var towerBaseY = deckY - 8, towerTopY = deckY + towerHeight;
    var towerH = towerTopY - towerBaseY;
    var sideZ = [DECK_W / 2 + 0.3, -(DECK_W / 2 + 0.3)];

    function deckSegment(xCenter, len) {
        var geo = new THREE.BoxGeometry(len, 0.6, DECK_W);
        var mesh = new THREE.Mesh(geo, matDeck);
        mesh.position.set(xCenter, deckY, 0);
        structureGroup.add(mesh);
        var edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({color: 0x223230}));
        edges.position.copy(mesh.position);
        structureGroup.add(edges);
    }

    [-1, 1].forEach(function(dir) {
        var tx = dir * towerX;
        sideZ.forEach(function(z) {
            var tower = new THREE.Mesh(new THREE.BoxGeometry(towerWidth * 0.5, towerH, towerWidth * 0.5), matPier);
            tower.position.set(tx, towerBaseY + towerH / 2, z);
            structureGroup.add(tower);
        });

        // Bascule leaf: from the central lifting gap out to the tower.
        var leafLen = towerX - leafGap / 2;
        deckSegment(dir * (leafGap / 2 + leafLen / 2), leafLen);

        // Side span: from the tower out to the far end.
        var outerX = dir * TOTAL_LEN / 2;
        var sideLen = Math.abs(outerX - tx);
        deckSegment((tx + outerX) / 2, sideLen);
        sideZ.forEach(function(z) {
            addBeam(tx, towerBaseY + towerH * sideSpanRatio, z, outerX, deckY + 0.3, z, 0.15, matSteel);
        });

        // Abutment at the far end.
        var pier = new THREE.Mesh(new THREE.BoxGeometry(4, 8, DECK_W + 1), matPier);
        pier.position.set(outerX, deckY - 0.3 - 4, 0);
        structureGroup.add(pier);
    });

    // High walkway connecting the tower tops.
    sideZ.forEach(function(z) {
        addBeam(-towerX, towerTopY - 1, z, towerX, towerTopY - 1, z, 0.5, matSteel);
    });

    return {
        camDistance: Math.min(Math.max(45, TOTAL_LEN), 200),
        camHeight: Math.min(Math.max(16, towerHeight * 0.6), 24)
    };
}

var BUILDERS = {
    truss: buildTrussStructure,
    wall: buildWallStructure,
    culvert: buildCulvertStructure,
    trilithon: buildTrilithonStructure,
    arch: buildArchStructure,
    cable_stay_low: buildCableStayLowStructure,
    suspension: buildSuspensionStructure,
    cantilever: buildCantileverStructure,
    bascule: buildBasculeStructure
};

function rebuildModel(bridge) {
    // Clear existing
    while(structureGroup.children.length > 0) structureGroup.remove(structureGroup.children[0]);
    while(sensorGroup.children.length > 0) sensorGroup.remove(sensorGroup.children[0]);
    while(stressGroup.children.length > 0) stressGroup.remove(stressGroup.children[0]);
    while(defectGroup.children.length > 0) defectGroup.remove(defectGroup.children[0]);
    if (gridHelper) rig.remove(gridHelper);
    if (glowMesh) rig.remove(glowMesh);

    var SPAN_LEN = bridge.spanLength;
    var NUM_SPANS = bridge.spans;
    var DECK_W = bridge.deckWidth;
    var TRUSS_H = bridge.trussHeight || 0;
    var PANELS_PER_SPAN = bridge.panelsPerSpan || 4;
    var TOTAL_LEN = SPAN_LEN * NUM_SPANS;
    var X0 = -TOTAL_LEN / 2;
    var deckY = 0;

    // Grid
    var gridSize = Math.max(140, TOTAL_LEN + 40);
    gridHelper = new THREE.GridHelper(gridSize, Math.floor(gridSize / 2.5), 0x2a3a38, 0x1a2625);
    gridHelper.position.y = -8.4;
    gridHelper.material.transparent = true;
    gridHelper.material.opacity = 0.4;
    rig.add(gridHelper);

    // Glow
    var glowRadius = Math.max(34, TOTAL_LEN / 2 + 6);
    glowMesh = new THREE.Mesh(
        new THREE.CircleGeometry(glowRadius, 48),
        new THREE.MeshBasicMaterial({color: 0x5b8c8a, transparent: true, opacity: 0.07})
    );
    glowMesh.rotation.x = -Math.PI / 2;
    glowMesh.position.y = -8.3;
    rig.add(glowMesh);

    // Structure - dispatch on the per-bridge model kind
    var kind = (bridge.model && bridge.model.kind) || 'truss';
    var builder = BUILDERS[kind] || buildTrussStructure;
    var ctx = { SPAN_LEN, NUM_SPANS, DECK_W, TRUSS_H, PANELS_PER_SPAN, TOTAL_LEN, X0, deckY };
    var frame = builder(bridge, ctx);

    // Sensors (procedural - no real telemetry source yet)
    generateSensors(bridge).forEach(function(p) {
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

    // Stress overlay (per span BCI)
    var spanBCI = bridge.spanBCI && bridge.spanBCI.length ? bridge.spanBCI : [bridge.bciAvg];
    for (var i = 0; i < NUM_SPANS; i++) {
        var x = X0 + SPAN_LEN * i + SPAN_LEN / 2;
        var bci = spanBCI[i] !== undefined ? spanBCI[i] : bridge.bciAvg;
        var geo = new THREE.BoxGeometry(SPAN_LEN - 1, 0.08, DECK_W + 0.4);
        var mat = new THREE.MeshBasicMaterial({color: spanColor(bci), transparent: true, opacity: 0.55});
        var slab = new THREE.Mesh(geo, mat);
        slab.position.set(x, deckY + 0.42, 0);
        stressGroup.add(slab);
    }

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

    // Reset rotation
    rotY = 0.4;
    rotX = 0.18;

    // Reset layer toggles - stress and defects off by default
    stressGroup.visible = false;
    defectGroup.visible = false;
    document.querySelectorAll('.vc-pill[data-layer="stress"]').forEach(function(el) { el.classList.remove('on'); });
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
            if (layer === 'stress') stressGroup.visible = on;
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
if (localStorage.getItem('nightMode') === 'on') {
    document.body.classList.add('night-mode');
    nightToggle.innerHTML = '<i class="fas fa-sun"></i>';
}

/* ============================================================
   INIT
   ============================================================ */
onResize();
animate();
loadBridgeList();
