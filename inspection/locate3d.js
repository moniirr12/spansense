/* ============================================================
   LOCATE DEFECTS ON 3D MODEL — mock-only feature.

   This is a trimmed, standalone duplicate of the Three.js engine
   in twin/twin.js (scene/camera/materials/rebuildModel/drag-rotate/
   layer toggles), retargeted at this page's own canvas + pills, so
   the working twinView page is never touched. twin.js already
   renders any bridge.defects that have x/y/z set (as red
   octahedra) — this file is what actually writes those coordinates,
   via click-to-pick raycasting against the structure mesh.

   Coordinates are stored in `rig`-local space (via worldToLocal),
   matching exactly how twin.js positions defect markers, so points
   placed here will render correctly in twinView once that page's
   defects layer is fed real data.

   Persistence is sessionStorage only (inspectionData.defects[i].x/y/z),
   matching how the rest of this mock already stores defects.
   ============================================================ */

var armedDefectIndex = null;
var hoveredMarkerIndex = null;
var locate3dReady = false;
var locate3dVisible = false;
var locateMarkerMeshes = {}; // defect array-index -> THREE.Mesh
var l3d = {}; // holds the three.js objects once initialized

/* ============================================================
   ENGINE SETUP (lazy — only built the first time the modal opens)
   ============================================================ */
function initLocate3DEngine() {
    if (locate3dReady) return;
    var canvas = document.getElementById('locate3d-canvas');

    var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    var scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x7a9490, 0.009);

    var camera = new THREE.PerspectiveCamera(38, 1, 0.1, 1000);
    var camDistance = 58, camHeight = 13;
    camera.position.set(0, camHeight, camDistance);
    camera.lookAt(0, 1.5, 0);

    scene.add(new THREE.AmbientLight(0x8fa8a4, 0.7));
    var key = new THREE.DirectionalLight(0xffffff, 1.1);
    key.position.set(20, 30, 15);
    scene.add(key);
    var rim = new THREE.DirectionalLight(0x4a90b8, 0.45);
    rim.position.set(-25, 10, -20);
    scene.add(rim);
    var teal = new THREE.PointLight(0x5b8c8a, 0.7, 80);
    teal.position.set(-28, 8, 10);
    scene.add(teal);

    var rig = new THREE.Group();
    scene.add(rig);
    var structureGroup = new THREE.Group();
    var sensorGroup = new THREE.Group();
    var stressGroup = new THREE.Group();
    var defectGroup = new THREE.Group();
    rig.add(structureGroup, sensorGroup, stressGroup, defectGroup);

    l3d = {
        canvas: canvas,
        renderer: renderer,
        scene: scene,
        camera: camera,
        rig: rig,
        structureGroup: structureGroup,
        sensorGroup: sensorGroup,
        stressGroup: stressGroup,
        defectGroup: defectGroup,
        matSteel: new THREE.MeshStandardMaterial({ color: 0x5a6b6a, metalness: 0.6, roughness: 0.4 }),
        matDeck: new THREE.MeshStandardMaterial({ color: 0x394645, metalness: 0.25, roughness: 0.6 }),
        matPier: new THREE.MeshStandardMaterial({ color: 0x435150, metalness: 0.15, roughness: 0.7 }),
        matSensor: new THREE.MeshStandardMaterial({ color: 0x6db3d8, emissive: 0x4a90b8, emissiveIntensity: 1.3 }),
        camDistance: camDistance,
        camHeight: camHeight,
        rotY: 0.4,
        rotX: 0.18,
        gridHelper: null,
        glowMesh: null,
        dragging: false,
        lastX: 0, lastY: 0,
        downX: 0, downY: 0, downTime: 0,
        onResize: null
    };

    bindLocate3DInteraction();
    locate3dReady = true;
}

function generateSensorsLocate3D(bridge) {
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
   DEFECT MARKERS — colored by severity (same palette as the
   severity badges elsewhere in the app, see inspection.css
   .severity .sev-1..5) so markers are visually distinguishable,
   and each gets its own material instance (no longer shared)
   so hover-highlighting one doesn't affect the others.
   ============================================================ */
function getSeverityMarkerColor(severity) {
    switch (parseInt(severity, 10)) {
        case 1: return 0x2d7a6e;
        case 2: return 0xBA7517;
        case 3: return 0xc47070;
        case 4: return 0xc0392b;
        case 5: return 0xc0392b;
        default: return 0xe06a5a;
    }
}
function getSeverityColorHex(severity) {
    switch (parseInt(severity, 10)) {
        case 1: return '#2d7a6e';
        case 2: return '#BA7517';
        case 3: return '#c47070';
        case 4: return '#c0392b';
        case 5: return '#c0392b';
        default: return '#e06a5a';
    }
}
function createDefectMarker(severity) {
    var color = getSeverityMarkerColor(severity);
    var mat = new THREE.MeshStandardMaterial({ color: color, emissive: color, emissiveIntensity: 1.1 });
    var mesh = new THREE.Mesh(new THREE.OctahedronGeometry(0.5, 0), mat);
    mesh.userData.baseEmissiveIntensity = 1.1;
    mesh.userData.baseScale = 1;
    return mesh;
}

/* ============================================================
   MODEL BUILD (structure + sensors + stress + already-placed defects)
   ============================================================ */
function rebuildLocate3DModel(bridge) {
    var structureGroup = l3d.structureGroup, sensorGroup = l3d.sensorGroup,
        stressGroup = l3d.stressGroup, defectGroup = l3d.defectGroup, rig = l3d.rig;

    while (structureGroup.children.length > 0) structureGroup.remove(structureGroup.children[0]);
    while (sensorGroup.children.length > 0) sensorGroup.remove(sensorGroup.children[0]);
    while (stressGroup.children.length > 0) stressGroup.remove(stressGroup.children[0]);
    while (defectGroup.children.length > 0) defectGroup.remove(defectGroup.children[0]);
    if (l3d.gridHelper) rig.remove(l3d.gridHelper);
    if (l3d.glowMesh) rig.remove(l3d.glowMesh);
    locateMarkerMeshes = {};

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
    l3d.gridHelper = new THREE.GridHelper(gridSize, Math.floor(gridSize / 2.5), 0x2a3a38, 0x1a2625);
    l3d.gridHelper.position.y = -8.4;
    l3d.gridHelper.material.transparent = true;
    l3d.gridHelper.material.opacity = 0.4;
    rig.add(l3d.gridHelper);

    // Glow
    var glowRadius = Math.max(34, TOTAL_LEN / 2 + 6);
    l3d.glowMesh = new THREE.Mesh(
        new THREE.CircleGeometry(glowRadius, 48),
        new THREE.MeshBasicMaterial({ color: 0x5b8c8a, transparent: true, opacity: 0.07 })
    );
    l3d.glowMesh.rotation.x = -Math.PI / 2;
    l3d.glowMesh.position.y = -8.3;
    rig.add(l3d.glowMesh);

    // Deck
    var deckGeo = new THREE.BoxGeometry(TOTAL_LEN, 0.6, DECK_W);
    var deck = new THREE.Mesh(deckGeo, l3d.matDeck);
    deck.position.set(0, deckY, 0);
    structureGroup.add(deck);

    var edges = new THREE.LineSegments(new THREE.EdgesGeometry(deckGeo), new THREE.LineBasicMaterial({ color: 0x223230 }));
    edges.position.copy(deck.position);
    structureGroup.add(edges);

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
            addBeam(X0, deckY + 0.3, z, X0 + TOTAL_LEN, deckY + 0.3, z, 0.5, l3d.matSteel);
            addBeam(X0, deckY + TRUSS_H, z, X0 + TOTAL_LEN, deckY + TRUSS_H, z, 0.5, l3d.matSteel);
            for (var i = 0; i <= totalPanels; i++) {
                var x = X0 + i * pw;
                addBeam(x, deckY + 0.3, z, x, deckY + TRUSS_H, z, 0.35, l3d.matSteel);
                if (i < totalPanels) {
                    var xNext = x + pw;
                    if (i % 2 === 0) addBeam(x, deckY + 0.3, z, xNext, deckY + TRUSS_H, z, 0.32, l3d.matSteel);
                    else addBeam(x, deckY + TRUSS_H, z, xNext, deckY + 0.3, z, 0.32, l3d.matSteel);
                }
            }
        });

        // Cross bracing
        var totalPanels = PANELS_PER_SPAN * NUM_SPANS;
        var pw = TOTAL_LEN / totalPanels;
        for (var i = 0; i <= totalPanels; i += 2) {
            var x = X0 + i * pw;
            addBeam(x, deckY + TRUSS_H, -DECK_W / 2, x, deckY + TRUSS_H, DECK_W / 2, 0.3, l3d.matSteel);
        }
    }

    // Piers
    var pierPositions = [];
    for (var p = 0; p <= NUM_SPANS; p++) {
        pierPositions.push(X0 + SPAN_LEN * p);
    }
    pierPositions.forEach(function(x, idx) {
        var isAbutment = (idx === 0 || idx === pierPositions.length - 1);
        var w = isAbutment ? 6 : 2.6;
        var h = 8.4;
        var geo = new THREE.BoxGeometry(w, h, isAbutment ? DECK_W + 1 : 3.2);
        var pier = new THREE.Mesh(geo, l3d.matPier);
        pier.position.set(x, deckY - 0.3 - h / 2, 0);
        structureGroup.add(pier);
    });

    // Sensors (procedural, same as twinView)
    generateSensorsLocate3D(bridge).forEach(function(pt) {
        var s = new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 16), l3d.matSensor);
        s.position.set(pt.x, pt.y, pt.z);
        sensorGroup.add(s);
        var ring = new THREE.Mesh(
            new THREE.RingGeometry(0.6, 0.7, 24),
            new THREE.MeshBasicMaterial({ color: 0x4a90b8, transparent: true, opacity: 0.5, side: THREE.DoubleSide })
        );
        ring.position.copy(s.position);
        sensorGroup.add(ring);
    });

    // Stress overlay (flat BCI average across all spans — this mock has no per-span score)
    var bciAv = bridge.bciAv != null ? bridge.bciAv : 100;
    var stressColor = bciAv < 50 ? 0xc0392b : (bciAv < 65 ? 0xc28b5a : 0x5b8c8a);
    for (var sIdx = 0; sIdx < NUM_SPANS; sIdx++) {
        var sx = X0 + SPAN_LEN * sIdx + SPAN_LEN / 2;
        var geo2 = new THREE.BoxGeometry(SPAN_LEN - 1, 0.08, DECK_W + 0.4);
        var mat2 = new THREE.MeshBasicMaterial({ color: stressColor, transparent: true, opacity: 0.55 });
        var slab = new THREE.Mesh(geo2, mat2);
        slab.position.set(sx, deckY + 0.42, 0);
        stressGroup.add(slab);
    }

    // Defects already placed in a previous session render as markers immediately
    (bridge.defects || []).forEach(function(d) {
        var m = createDefectMarker(d.severity);
        m.position.set(d.x, d.y, d.z);
        defectGroup.add(m);
        locateMarkerMeshes[d.index] = m;
    });

    l3d.camDistance = Math.min(120, Math.max(40, TOTAL_LEN * 0.9));
    l3d.camHeight = Math.min(20, Math.max(10, TRUSS_H + 6));
    l3d.rotY = 0.4;
    l3d.rotX = 0.18;

    // Center the camera's look-at target on the model's actual bounding
    // box, computed AFTER applying the default rig rotation (rotX/rotY
    // tilt the whole structure, which shifts its apparent center in Y and
    // Z — a flat Y-only midpoint computed in local space doesn't account
    // for that, so the model still hugged the bottom/sides once rotated).
    rig.rotation.set(l3d.rotX, l3d.rotY, 0);
    var box = new THREE.Box3().setFromObject(rig);
    var center = box.getCenter(new THREE.Vector3());
    l3d.lookAtX = center.x;
    l3d.lookAtY = center.y;
    l3d.lookAtZ = center.z;

    // Defects/sensors/stress default ON here (unlike twinView) — seeing
    // context while placing points is the whole point of this modal.
    structureGroup.visible = true;
    sensorGroup.visible = true;
    stressGroup.visible = true;
    defectGroup.visible = true;
    document.querySelectorAll('#locate3dModal .vc-pill').forEach(function(el) { el.classList.add('on'); });
}

/* ============================================================
   INTERACTION — drag-to-rotate, wheel-zoom, and click-to-pick.
   Click vs. drag is disambiguated in the same pointerup handler
   that ends a drag, using the same down-position/time, rather than
   a second competing listener.
   ============================================================ */
function bindLocate3DInteraction() {
    var canvas = l3d.canvas;

    function onResizeLocate3D() {
        var w = canvas.clientWidth, h = canvas.clientHeight;
        if (!w || !h) return; // guards against sizing while the modal is still display:none
        l3d.renderer.setSize(w, h, false);
        l3d.camera.aspect = w / h;
        l3d.camera.updateProjectionMatrix();
    }
    l3d.onResize = onResizeLocate3D;

    window.addEventListener('resize', onResizeLocate3D);
    new ResizeObserver(onResizeLocate3D).observe(canvas);

    canvas.addEventListener('pointerdown', function(e) {
        l3d.dragging = true;
        l3d.lastX = e.clientX; l3d.lastY = e.clientY;
        l3d.downX = e.clientX; l3d.downY = e.clientY;
        l3d.downTime = Date.now();
    });

    window.addEventListener('pointerup', function(e) {
        if (!l3d.dragging) return;
        l3d.dragging = false;

        var movedDist = Math.hypot(e.clientX - l3d.downX, e.clientY - l3d.downY);
        var elapsed = Date.now() - l3d.downTime;
        var releasedOnCanvas = (e.target === canvas);

        if (movedDist < 6 && elapsed < 400 && releasedOnCanvas) {
            handleLocate3DPick(e);
        }
    });

    window.addEventListener('pointermove', function(e) {
        if (!l3d.dragging) return;
        var dx = e.clientX - l3d.lastX, dy = e.clientY - l3d.lastY;
        l3d.rotY += dx * 0.006;
        l3d.rotX += dy * 0.006;
        l3d.lastX = e.clientX; l3d.lastY = e.clientY;
    });

    canvas.addEventListener('wheel', function(e) {
        e.preventDefault();
        l3d.camDistance = Math.min(120, Math.max(20, l3d.camDistance + e.deltaY * 0.04));
    }, { passive: false });

    // Reverse of the list's onmouseenter->marker-scale: hovering a marker
    // directly in the 3D scene highlights its row in the defects list.
    var hoverRaycaster = new THREE.Raycaster();
    canvas.addEventListener('pointermove', function(e) {
        if (l3d.dragging || !l3d.defectGroup.visible) return;

        var rect = canvas.getBoundingClientRect();
        var ndc = new THREE.Vector2(
            ((e.clientX - rect.left) / rect.width) * 2 - 1,
            -((e.clientY - rect.top) / rect.height) * 2 + 1
        );
        hoverRaycaster.setFromCamera(ndc, l3d.camera);
        var hits = hoverRaycaster.intersectObjects(l3d.defectGroup.children, true);

        var hitIndex = null;
        if (hits.length) {
            for (var key in locateMarkerMeshes) {
                if (locateMarkerMeshes[key] === hits[0].object) { hitIndex = key; break; }
            }
        }
        if (hitIndex !== hoveredMarkerIndex) setMarkerHover(hitIndex);
    });
    canvas.addEventListener('pointerleave', function() {
        if (hoveredMarkerIndex != null) setMarkerHover(null);
    });

    document.querySelectorAll('#locate3dModal .vc-pill').forEach(function(pill) {
        pill.addEventListener('click', function() {
            pill.classList.toggle('on');
            var layer = pill.dataset.layer;
            var on = pill.classList.contains('on');
            if (layer === 'structure') l3d.structureGroup.visible = on;
            if (layer === 'sensors') l3d.sensorGroup.visible = on;
            if (layer === 'stress') l3d.stressGroup.visible = on;
            if (layer === 'defects') l3d.defectGroup.visible = on;
        });
    });
}

function handleLocate3DPick(e) {
    if (armedDefectIndex == null) return;

    if (!l3d.structureGroup.visible) {
        flashLocate3DHint('Turn on the Structure layer to place a point.');
        return;
    }

    var rect = l3d.canvas.getBoundingClientRect();
    var ndc = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1
    );

    var raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(ndc, l3d.camera);
    // Only the structure (deck/truss/piers) is a valid placement surface —
    // sensors/stress/defect markers are overlays, not something to place a defect "on".
    var hits = raycaster.intersectObjects(l3d.structureGroup.children, true);
    if (!hits.length) return;

    var worldPoint = hits[0].point;
    // rig is the only rotated node; converting to its local space makes the
    // stored coordinate rotation-invariant, matching how rebuildModel already
    // positions defect markers in twin.js.
    var localPoint = l3d.rig.worldToLocal(worldPoint.clone());

    placeDefectPoint(armedDefectIndex, localPoint.x, localPoint.y, localPoint.z);
}

function flashLocate3DHint(message) {
    var hint = document.getElementById('locate3dHint');
    if (!hint) return;
    var prevText = hint.textContent;
    var prevClass = hint.className;
    hint.textContent = message;
    hint.style.color = '#c0392b';
    setTimeout(function() {
        hint.textContent = prevText;
        hint.removeAttribute('style');
        hint.className = prevClass;
    }, 1800);
}

/* ============================================================
   PERSISTENCE — sessionStorage only, mirroring how the rest of
   this mock already stores defects (inspectionData.defects[i]).
   ============================================================ */
function placeDefectPoint(index, x, y, z) {
    x = Math.round(x * 100) / 100;
    y = Math.round(y * 100) / 100;
    z = Math.round(z * 100) / 100;

    var inspectionData = JSON.parse(sessionStorage.getItem('inspectionData') || '{}');
    if (!inspectionData.defects || !inspectionData.defects[index]) return;

    inspectionData.defects[index].x = x;
    inspectionData.defects[index].y = y;
    inspectionData.defects[index].z = z;
    sessionStorage.setItem('inspectionData', JSON.stringify(inspectionData));

    var existing = locateMarkerMeshes[index];
    if (existing) {
        existing.position.set(x, y, z); // re-clickable/movable: overwrite, don't duplicate
    } else {
        var m = createDefectMarker(inspectionData.defects[index].severity);
        m.position.set(x, y, z);
        l3d.defectGroup.add(m);
        locateMarkerMeshes[index] = m;
    }

    renderLocate3DDefectsList();
}

function removeDefectPoint(index) {
    var inspectionData = JSON.parse(sessionStorage.getItem('inspectionData') || '{}');
    if (inspectionData.defects && inspectionData.defects[index]) {
        delete inspectionData.defects[index].x;
        delete inspectionData.defects[index].y;
        delete inspectionData.defects[index].z;
        sessionStorage.setItem('inspectionData', JSON.stringify(inspectionData));
    }

    var mesh = locateMarkerMeshes[index];
    if (mesh) {
        l3d.defectGroup.remove(mesh);
        mesh.geometry.dispose();
        mesh.material.dispose();
        delete locateMarkerMeshes[index];
    }

    renderLocate3DDefectsList();
}
window.removeDefectPoint = removeDefectPoint;

/* ============================================================
   BRIDGE DATA (derived from sessionStorage + the sidebar's
   already-displayed mock stats — there's no live geometry API
   wired into this page, matching its existing fidelity)
   ============================================================ */
function getLocate3DBridgeData() {
    var structureId = sessionStorage.getItem('structureId') || 'mock';
    var inspectionData = JSON.parse(sessionStorage.getItem('inspectionData') || '{}');

    var spanCountEl = document.getElementById('sidebarSpanCount');
    var lengthEl = document.getElementById('sidebarLength');
    var bciEl = document.getElementById('bciAvResult');

    var spans = parseInt(spanCountEl ? spanCountEl.textContent : '', 10);
    if (!spans || spans < 1) spans = 4;

    var totalLength = parseFloat(lengthEl ? lengthEl.textContent : '');
    var spanLength = (totalLength && totalLength > 0) ? (totalLength / spans) : 28;

    var bciAv = parseFloat(bciEl ? bciEl.textContent : '');
    if (isNaN(bciAv)) bciAv = 100;

    var model = (typeof getBridgeModel === 'function')
        ? getBridgeModel(structureId, '')
        : { deckWidth: 9, trussHeight: 6, panelsPerSpan: 6 };

    var defects = [];
    (inspectionData.defects || []).forEach(function(d, i) {
        if (d.x != null && d.y != null && d.z != null) {
            defects.push({ index: i, x: d.x, y: d.y, z: d.z, severity: d.severity });
        }
    });

    return {
        spans: spans,
        spanLength: spanLength,
        deckWidth: model.deckWidth,
        trussHeight: model.trussHeight,
        panelsPerSpan: model.panelsPerSpan,
        bciAv: bciAv,
        defects: defects
    };
}

/* ============================================================
   DEFECTS LIST — reuses getAllDefects() from spans.js for display
   text (don't duplicate that logic); x/y/z + "located" status come
   from inspectionData.defects directly since getAllDefects() drops them.
   ============================================================ */
function renderLocate3DDefectsList() {
    var container = document.getElementById('locate3dDefectsList');
    var countSpan = document.getElementById('locate3dDefectCount');
    if (!container) return;

    var inspectionData = JSON.parse(sessionStorage.getItem('inspectionData') || '{}');
    var rawDefects = inspectionData.defects || [];
    var defects = (typeof getAllDefects === 'function') ? getAllDefects() : [];

    if (countSpan) countSpan.innerText = defects.length;

    if (!defects.length) {
        container.innerHTML = '<div class="empty-defects-message">No defects recorded yet.</div>';
        return;
    }

    var html = '';
    defects.forEach(function(def, i) {
        var raw = rawDefects[i] || {};
        var located = raw.x != null && raw.y != null && raw.z != null;
        var fullDefectDescription = (typeof getFullDefectDescription === 'function')
            ? getFullDefectDescription(def.defectType, def.defectNumber, def.defectId) : '';
        var combinedDefect = (def.defectType || '') + '.' + (def.defectNumber || '');
        var elementNumber = def.elementNumber || def.element_no;
        var elementDescription = (typeof getElementDescriptionSafe === 'function')
            ? getElementDescriptionSafe(elementNumber) : ('Element ' + elementNumber);
        var isArmed = (armedDefectIndex === i);
        var severityColor = getSeverityColorHex(def.severity);

        html += '<div class="defect-card-item' + (isArmed ? ' armed' : '') + '" style="border-left: 4px solid ' + severityColor + ';" ' +
            'data-defect-index="' + i + '" ' +
            'onclick="armLocate3DDefect(' + i + ')" onmouseenter="highlightLocate3DMarker(' + i + ', true)" onmouseleave="highlightLocate3DMarker(' + i + ', false)">' +
            '<div class="defect-location">Span ' + (def.span != null ? def.span : 'N/A') + ' · ' + escapeHtml(elementDescription) + '</div>' +
            '<div class="defect-description" style="font-size: 0.75rem;">' + (def.severity || 'N/A') + (def.extent || 'N/A') + '. (' + escapeHtml(combinedDefect) + ') ' + escapeHtml(fullDefectDescription) + '</div>' +
            (located
                ? '<div class="defect-located-tag"><i class="fas fa-check-circle"></i> Located (' + raw.x.toFixed(2) + ', ' + raw.y.toFixed(2) + ', ' + raw.z.toFixed(2) + ')' +
                  '<button type="button" class="defect-remove-btn" title="Remove from model" onclick="event.stopPropagation(); removeDefectPoint(' + i + ')"><i class="fas fa-times"></i></button></div>'
                : '') +
            '</div>';
    });
    container.innerHTML = html;
}

function highlightLocate3DMarker(index, on) {
    var mesh = locateMarkerMeshes[index];
    if (!mesh) return;
    var targetScale = on ? mesh.userData.baseScale * 1.6 : mesh.userData.baseScale;
    mesh.scale.setScalar(targetScale);
    mesh.material.emissiveIntensity = on ? 2.4 : mesh.userData.baseEmissiveIntensity;
}
window.highlightLocate3DMarker = highlightLocate3DMarker;

function highlightDefectListItem(index, on) {
    var item = document.querySelector('#locate3dDefectsList .defect-card-item[data-defect-index="' + index + '"]');
    if (!item) return;
    item.classList.toggle('hovered', on);
    if (on) item.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}
window.highlightDefectListItem = highlightDefectListItem;

// Single entry point for marker<->list hover, used by the 3D-scene raycast
// hover (list-item hover already calls highlightLocate3DMarker directly).
function setMarkerHover(index) {
    if (hoveredMarkerIndex != null) {
        highlightLocate3DMarker(hoveredMarkerIndex, false);
        highlightDefectListItem(hoveredMarkerIndex, false);
    }
    hoveredMarkerIndex = index;
    if (hoveredMarkerIndex != null) {
        highlightLocate3DMarker(hoveredMarkerIndex, true);
        highlightDefectListItem(hoveredMarkerIndex, true);
    }
}

function armLocate3DDefect(index) {
    armedDefectIndex = (armedDefectIndex === index) ? null : index;
    renderLocate3DDefectsList();
    updateLocate3DHint();
}
window.armLocate3DDefect = armLocate3DDefect;

function updateLocate3DHint() {
    var hint = document.getElementById('locate3dHint');
    var canvasEl = document.getElementById('locate3d-canvas');
    if (!hint) return;
    if (armedDefectIndex != null) {
        hint.textContent = 'Click the model to place this defect (click again to move it).';
        hint.classList.add('armed');
        if (canvasEl) canvasEl.classList.add('armed');
    } else {
        hint.textContent = 'Select a defect on the right, then click the model to place it.';
        hint.classList.remove('armed');
        if (canvasEl) canvasEl.classList.remove('armed');
    }
}

/* ============================================================
   RENDER LOOP — only runs while the modal is open.
   ============================================================ */
function animateLocate3D() {
    if (!locate3dVisible) return;
    requestAnimationFrame(animateLocate3D);
    l3d.rig.rotation.set(l3d.rotX, l3d.rotY, 0);
    l3d.camera.position.set(0, l3d.camHeight, l3d.camDistance);
    l3d.camera.lookAt(
        l3d.lookAtX != null ? l3d.lookAtX : 0,
        l3d.lookAtY != null ? l3d.lookAtY : 1.5,
        l3d.lookAtZ != null ? l3d.lookAtZ : 0
    );
    l3d.renderer.render(l3d.scene, l3d.camera);
}

/* ============================================================
   OPEN / CLOSE
   ============================================================ */
function openLocate3dModal() {
    var modal = document.getElementById('locate3dModal');
    if (!modal) return;
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
    document.body.classList.add('modal-open');
    locate3dVisible = true;

    initLocate3DEngine();
    armedDefectIndex = null;

    var bridge = getLocate3DBridgeData();
    rebuildLocate3DModel(bridge);
    renderLocate3DDefectsList();
    updateLocate3DHint();

    // Build/resize only after the modal is actually display:flex, never
    // while it's display:none (a zero-height canvas would corrupt the
    // camera's aspect ratio for the rest of the session).
    requestAnimationFrame(function() {
        l3d.onResize();
        animateLocate3D();
    });
}

function closeLocate3dModal() {
    var modal = document.getElementById('locate3dModal');
    if (modal) modal.classList.remove('active');
    // #splitModal stays open underneath — only release the body scroll-lock
    // if it isn't still active (it also locks via the same style property).
    var splitModal = document.getElementById('splitModal');
    if (!splitModal || !splitModal.classList.contains('active')) {
        document.body.style.overflow = '';
        document.body.classList.remove('modal-open');
    }
    locate3dVisible = false;
}

window.openLocate3dModal = openLocate3dModal;
window.closeLocate3dModal = closeLocate3dModal;

// Close on backdrop click (clicking the dimmed area outside the panels).
var locate3dModalEl = document.getElementById('locate3dModal');
if (locate3dModalEl) {
    locate3dModalEl.addEventListener('click', function(e) {
        if (e.target === this) closeLocate3dModal();
    });
}
