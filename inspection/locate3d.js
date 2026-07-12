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

    // Far plane needs real headroom past the 130-200 unit cap most builders
    // use for camDistance - the cantilever builder (Forth Bridge) can need ~2300+.
    var camera = new THREE.PerspectiveCamera(38, 1, 0.1, 5000);
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
    var worksGroup = new THREE.Group();
    var defectGroup = new THREE.Group();
    rig.add(structureGroup, sensorGroup, worksGroup, defectGroup);

    l3d = {
        canvas: canvas,
        renderer: renderer,
        scene: scene,
        camera: camera,
        rig: rig,
        structureGroup: structureGroup,
        sensorGroup: sensorGroup,
        worksGroup: worksGroup,
        defectGroup: defectGroup,
        matSteel: new THREE.MeshStandardMaterial({ color: 0x5a6b6a, metalness: 0.6, roughness: 0.4 }),
        matDeck: new THREE.MeshStandardMaterial({ color: 0x394645, metalness: 0.25, roughness: 0.6 }),
        matPier: new THREE.MeshStandardMaterial({ color: 0x435150, metalness: 0.15, roughness: 0.7 }),
        matSensor: new THREE.MeshStandardMaterial({ color: 0x6db3d8, emissive: 0x4a90b8, emissiveIntensity: 1.3 }),
        matStone: new THREE.MeshStandardMaterial({ color: 0x8a8378, metalness: 0.0, roughness: 0.95 }),
        matConcrete: new THREE.MeshStandardMaterial({ color: 0x9aa39c, metalness: 0.05, roughness: 0.85 }),
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

function generateSensorsLocate3D(bridge, spanLenOverride) {
    // spanLenOverride lets rebuildLocate3DModel() pass its stylised-scale
    // span length (cantilever bridges) without mutating bridge.spanLength.
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

// Cone marker (distinct from the defect octahedron) for the Works Required
// layer. exact=false (no placed x/y/z yet) renders semi-transparent so it
// reads as an estimate rather than a precise location.
function createWorksMarker(exact) {
    var color = 0xc28b5a;
    var mat = new THREE.MeshStandardMaterial({
        color: color, emissive: color, emissiveIntensity: 1.1,
        transparent: !exact, opacity: exact ? 1 : 0.55
    });
    var mesh = new THREE.Mesh(new THREE.ConeGeometry(0.7, 1.6, 8), mat);
    return mesh;
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
    var seed = ((d.elementNumber || 0) * 37) % 100 / 100;
    x += (seed - 0.5) * SPAN_LEN * 0.6;
    var z = ((d.elementNumber || 0) % 2 === 0 ? 1 : -1) * (DECK_W * 0.25);
    return { x: x, y: deckY + 1.6, z: z, exact: false };
}

/* ============================================================
   MODEL BUILD (structure + sensors + works required + already-placed defects)
   ============================================================ */
function rebuildLocate3DModel(bridge) {
    var structureGroup = l3d.structureGroup, sensorGroup = l3d.sensorGroup,
        worksGroup = l3d.worksGroup, defectGroup = l3d.defectGroup, rig = l3d.rig;

    while (structureGroup.children.length > 0) structureGroup.remove(structureGroup.children[0]);
    while (sensorGroup.children.length > 0) sensorGroup.remove(sensorGroup.children[0]);
    while (worksGroup.children.length > 0) worksGroup.remove(worksGroup.children[0]);
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
    l3d.gridHelper = new THREE.GridHelper(gridSize, Math.floor(gridSize / 2.5), 0x2a3a38, 0x1a2625);
    l3d.gridHelper.position.y = -8.4;
    l3d.gridHelper.material.transparent = true;
    l3d.gridHelper.material.opacity = 0.4;
    rig.add(l3d.gridHelper);

    // Glow
    var glowRadius = Math.min(Math.max(34, TOTAL_LEN / 2 + 6), 200);
    l3d.glowMesh = new THREE.Mesh(
        new THREE.CircleGeometry(glowRadius, 48),
        new THREE.MeshBasicMaterial({ color: 0x5b8c8a, transparent: true, opacity: 0.07 })
    );
    l3d.glowMesh.rotation.x = -Math.PI / 2;
    l3d.glowMesh.position.y = -8.3;
    rig.add(l3d.glowMesh);

    // Structure - dispatch on the per-bridge model kind (computed above),
    // same as twin.js's rebuildModel(), using the shared builders from
    // twin/shapeBuilders.js.
    var builder = (typeof BUILDERS !== 'undefined' && BUILDERS[kind]) || buildTrussStructure;
    var shapeCtx = {
        SPAN_LEN: SPAN_LEN, NUM_SPANS: NUM_SPANS, DECK_W: DECK_W, TRUSS_H: TRUSS_H,
        PANELS_PER_SPAN: PANELS_PER_SPAN, TOTAL_LEN: TOTAL_LEN, X0: X0, deckY: deckY,
        structureGroup: structureGroup,
        matSteel: l3d.matSteel, matDeck: l3d.matDeck, matPier: l3d.matPier,
        matStone: l3d.matStone, matConcrete: l3d.matConcrete
    };
    var frame = builder(bridge, shapeCtx);

    // Some kinds (e.g. river piers reaching down to a riverbed well below
    // the default -8.4 ground line) need the ground/glow repositioned so
    // the structure actually reaches it instead of floating above it.
    if (frame.groundY != null) {
        l3d.gridHelper.position.y = frame.groundY;
        l3d.glowMesh.position.y = frame.groundY + 0.1;
    }

    // Sensors (procedural, same as twinView)
    generateSensorsLocate3D(bridge, SPAN_LEN).forEach(function(pt) {
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

    // Works Required markers — one per defect flagged works_required='Y',
    // at its real placed position if it has one, otherwise an approximate
    // spot within its span so the layer isn't empty just because most
    // defects haven't been located on the model yet.
    (bridge.worksRequiredDefects || []).forEach(function(d) {
        var pos = worksMarkerPosition(d, X0, SPAN_LEN, NUM_SPANS, DECK_W, deckY);
        var m = createWorksMarker(pos.exact);
        m.position.set(pos.x, pos.y, pos.z);
        worksGroup.add(m);
    });

    // Defects already placed in a previous session render as markers immediately
    (bridge.defects || []).forEach(function(d) {
        var m = createDefectMarker(d.severity);
        m.position.set(d.x, d.y, d.z);
        defectGroup.add(m);
        locateMarkerMeshes[d.index] = m;
    });

    l3d.camDistance = frame.camDistance;
    l3d.camHeight = frame.camHeight;
    l3d.rotY = 0.4;
    l3d.rotX = 0.18;

    // Fog density was tuned for camDistance ~130 (most builders' cap) -
    // scale it down for anything framed further out (the cantilever
    // builder's Forth Bridge can need ~2300+), or the bridge renders as a
    // wall of solid fog. Smaller/typical bridges are unaffected.
    l3d.scene.fog.density = 0.009 * Math.min(1, 130 / Math.max(130, l3d.camDistance));

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

    // Defects/sensors/works required default ON here (unlike twinView) —
    // seeing context while placing points is the whole point of this modal.
    structureGroup.visible = true;
    sensorGroup.visible = true;
    worksGroup.visible = true;
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
            if (layer === 'works') l3d.worksGroup.visible = on;
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
    // sensors/works/defect markers are overlays, not something to place a defect "on".
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

    var structureType = sessionStorage.getItem('structureType') || '';
    var model = (typeof getBridgeModel === 'function')
        ? getBridgeModel(structureId, structureType)
        : { deckWidth: 9, trussHeight: 6, panelsPerSpan: 6 };

    var defects = [];
    (inspectionData.defects || []).forEach(function(d, i) {
        if (d.x != null && d.y != null && d.z != null) {
            defects.push({ index: i, x: d.x, y: d.y, z: d.z, severity: d.severity });
        }
    });

    // Every defect flagged works_required='Y' this session, with its real
    // placed position (x/y/z) carried over if it's already been located on
    // the model, or null if not - rebuildLocate3DModel() approximates a
    // position from spanNumber/elementNumber for those. inspectionData.defects
    // (not getAllDefects()) is the source because it's the only one carrying
    // x/y/z, same as the `defects` array just above.
    var worksRequiredDefects = (inspectionData.defects || [])
        .filter(function(d) { return d.worksRequired === 'Y'; })
        .map(function(d) {
            return {
                spanNumber: d.spanNumber,
                elementNumber: d.elementNumber,
                severity: d.severity,
                x: d.x != null ? d.x : null,
                y: d.y != null ? d.y : null,
                z: d.z != null ? d.z : null
            };
        });

    return {
        spans: spans,
        spanLength: spanLength,
        deckWidth: model.deckWidth,
        trussHeight: model.trussHeight,
        panelsPerSpan: model.panelsPerSpan,
        model: model,
        bciAv: bciAv,
        defects: defects,
        worksRequiredDefects: worksRequiredDefects
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
