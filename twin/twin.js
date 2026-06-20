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
        var bciClass = getBciClass(b.bci_av != null ? parseFloat(b.bci_av) : null);
        var bciLabel = b.bci_av != null ? Math.round(parseFloat(b.bci_av)) : '—';
        var isSelected = selectedBridge && String(selectedBridge.id) === String(b.id);
        return '<div class="dd-item ' + (isSelected ? 'selected' : '') + '" data-id="' + b.id + '">' +
            '<div class="dd-icon"><i class="fa-solid fa-bridge"></i></div>' +
            '<div class="dd-text">' +
                '<div class="dd-name">' + b.name + '</div>' +
                '<div class="dd-id">' + b.id + '</div>' +
            '</div>' +
            '<span class="dd-bci ' + bciClass + '">' + bciLabel + '</span>' +
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
    bridge.deckWidth = model.deckWidth;
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
        document.getElementById('bciAvgSub').textContent = 'across ' + bridge.spans + ' span' + (bridge.spans > 1 ? 's' : '');
        document.getElementById('bciCrit').textContent = bridge.bciCrit != null ? Math.round(bridge.bciCrit) : '—';
        document.getElementById('bciCritSub').textContent = bridge.bciCritLocation || '—';

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

    // Deck
    var deckGeo = new THREE.BoxGeometry(TOTAL_LEN, 0.6, DECK_W);
    var deck = new THREE.Mesh(deckGeo, matDeck);
    deck.position.set(0, deckY, 0);
    structureGroup.add(deck);

    var edges = new THREE.LineSegments(new THREE.EdgesGeometry(deckGeo), new THREE.LineBasicMaterial({color: 0x223230}));
    edges.position.copy(deck.position);
    structureGroup.add(edges);

    // Beams
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

    // Truss sides
    if (TRUSS_H > 0) {
        [DECK_W / 2, -DECK_W / 2].forEach(function(z) {
            var totalPanels = PANELS_PER_SPAN * NUM_SPANS;
            var pw = TOTAL_LEN / totalPanels;
            addBeam(X0, deckY + 0.3, z, X0 + TOTAL_LEN, deckY + 0.3, z, 0.5, matSteel);
            addBeam(X0, deckY + TRUSS_H, z, X0 + TOTAL_LEN, deckY + TRUSS_H, z, 0.5, matSteel);
            for (var i = 0; i <= totalPanels; i++) {
                var x = X0 + i * pw;
                addBeam(x, deckY + 0.3, z, x, deckY + TRUSS_H, z, 0.35, matSteel);
                if (i < totalPanels) {
                    var xNext = x + pw;
                    if (i % 2 === 0) addBeam(x, deckY + 0.3, z, xNext, deckY + TRUSS_H, z, 0.32, matSteel);
                    else addBeam(x, deckY + TRUSS_H, z, xNext, deckY + 0.3, z, 0.32, matSteel);
                }
            }
        });

        // Cross bracing
        var totalPanels = PANELS_PER_SPAN * NUM_SPANS;
        var pw = TOTAL_LEN / totalPanels;
        for (var i = 0; i <= totalPanels; i += 2) {
            var x = X0 + i * pw;
            addBeam(x, deckY + TRUSS_H, -DECK_W / 2, x, deckY + TRUSS_H, DECK_W / 2, 0.3, matSteel);
        }
    }

    // Piers
    var pierPositions = [];
    for (var i = 0; i <= NUM_SPANS; i++) {
        pierPositions.push(X0 + SPAN_LEN * i);
    }
    pierPositions.forEach(function(x, i) {
        var isAbutment = (i === 0 || i === pierPositions.length - 1);
        var w = isAbutment ? 6 : 2.6;
        var h = 8.4;
        var geo = new THREE.BoxGeometry(w, h, isAbutment ? DECK_W + 1 : 3.2);
        var pier = new THREE.Mesh(geo, matPier);
        pier.position.set(x, deckY - 0.3 - h / 2, 0);
        structureGroup.add(pier);
    });

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

    // Camera adjustment
    camDistance = Math.max(40, TOTAL_LEN * 0.9);
    camHeight = Math.max(10, TRUSS_H + 6);
    camHeight = Math.min(camHeight, 20);

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
document.getElementById('nightToggle').addEventListener('click', function() {
    document.body.classList.toggle('night-mode');
});

/* ============================================================
   INIT
   ============================================================ */
onResize();
animate();
loadBridgeList();
