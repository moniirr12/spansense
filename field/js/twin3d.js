// Lighter mobile TwinView. Reuses the desktop's actual procedural model
// builders (/twin/shapeBuilders.js, /twin/bridgeModels.js) unmodified - they
// are bare global functions with no DOM/page coupling, so they run here
// exactly as they do in twin.js. Ported from twin.js: drag-to-orbit and its
// auto-rotate-pauses-while-touched/resumes-after-idle behavior. Added on
// top (desktop has neither): pinch-to-zoom via the Pointer Events API,
// since a real touch device deserves it even though desktop's mouse-only
// build never needed it. Not ported: the skin switcher and the procedural
// sensor layer - this view only ever uses the desktop's default "twinView"
// material colors, never "Realistic"'s photo-textures.
(function () {
  'use strict';

  let renderer, scene, camera, rig, structureGroup, defectGroup, gridHelper, glowMesh;
  let matSteel, matDeck, matPier, matStone, matConcrete, matDefect;
  let canvas, onTapCallback;
  let rotY = 0.4, rotX = 0.18, camDistance = 58, camHeight = 13, baseCamDistance = 58;
  let active = false;
  let inited = false;

  // Interaction state: single pointer drags to orbit, two pointers pinch to
  // zoom, any touch pauses auto-rotate immediately and it resumes a couple
  // seconds after the last pointer lifts - same idle-timer pattern twin.js
  // uses, just via Pointer Events so one code path covers mouse and touch.
  const activePointers = new Map();
  let dragging = false, lastX = 0, lastY = 0, downX = 0, downY = 0;
  let pinchStartDist = null, pinchStartCamDistance = null;
  let autoRotateEnabled = true, idleTimer = null;

  function ensureInit(canvasEl, tapCallback) {
    onTapCallback = tapCallback;
    if (inited) return;
    inited = true;
    canvas = canvasEl;

    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x7a9490, 0.009);

    camera = new THREE.PerspectiveCamera(38, 1, 0.1, 5000);
    camera.position.set(0, camHeight, camDistance);
    camera.lookAt(0, 1.5, 0);

    scene.add(new THREE.AmbientLight(0x8fa8a4, 0.7));
    const key = new THREE.DirectionalLight(0xffffff, 1.1); key.position.set(20, 30, 15); scene.add(key);
    const rim = new THREE.DirectionalLight(0x4a90b8, 0.45); rim.position.set(-25, 10, -20); scene.add(rim);
    const teal = new THREE.PointLight(0x5b8c8a, 0.7, 80); teal.position.set(-28, 8, 10); scene.add(teal);

    // Same flat "twinView" colors twin.js's default skin uses (not the
    // photo-textured "Realistic" skin - this view never switches skins).
    matSteel = new THREE.MeshStandardMaterial({ color: 0x5a6b6a, metalness: 0.6, roughness: 0.4 });
    matDeck = new THREE.MeshStandardMaterial({ color: 0x394645, metalness: 0.25, roughness: 0.6 });
    matPier = new THREE.MeshStandardMaterial({ color: 0x435150, metalness: 0.15, roughness: 0.7 });
    matStone = new THREE.MeshStandardMaterial({ color: 0x8a8378, metalness: 0.0, roughness: 0.95 });
    matConcrete = new THREE.MeshStandardMaterial({ color: 0x9aa39c, metalness: 0.05, roughness: 0.85 });
    matDefect = new THREE.MeshStandardMaterial({ color: 0xe06a5a, emissive: 0xc0392b, emissiveIntensity: 1.1 });

    rig = new THREE.Group();
    scene.add(rig);
    structureGroup = new THREE.Group();
    defectGroup = new THREE.Group();
    rig.add(structureGroup, defectGroup);

    canvas.style.touchAction = 'none'; // we handle drag/pinch ourselves - stop the browser panning/zooming the page instead
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });

    const resize = () => {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    new ResizeObserver(resize).observe(canvas);
    window.addEventListener('resize', resize);
    resize();

    requestAnimationFrame(animate);
  }

  // A fingertip is much wider than the ~0.5-unit marker geometry it's aiming
  // for, so this picks by on-screen distance to each marker's projected
  // center rather than exact ray-vs-mesh intersection - the same marker a
  // mouse pointer could click precisely stays selectable with a much more
  // forgiving touch, up to TAP_RADIUS_PX away.
  const TAP_RADIUS_PX = 30;
  function raycastTap(clientX, clientY, e) {
    if (!defectGroup.visible || !defectGroup.children.length) { onTapCallback && onTapCallback(null, e); return; }
    const rect = canvas.getBoundingClientRect();
    const tapX = clientX - rect.left;
    const tapY = clientY - rect.top;
    defectGroup.updateMatrixWorld(true);
    const proj = new THREE.Vector3();
    let nearest = null, nearestDist = Infinity;
    defectGroup.children.forEach((m) => {
      proj.setFromMatrixPosition(m.matrixWorld).project(camera);
      if (proj.z < -1 || proj.z > 1) return; // behind the camera or past the far plane
      const sx = (proj.x * 0.5 + 0.5) * rect.width;
      const sy = (-proj.y * 0.5 + 0.5) * rect.height;
      const dist = Math.hypot(sx - tapX, sy - tapY);
      if (dist < nearestDist) { nearestDist = dist; nearest = m; }
    });
    onTapCallback && onTapCallback(nearest && nearestDist <= TAP_RADIUS_PX ? nearest.userData.defect : null, e);
  }

  function pointsArray() { return Array.from(activePointers.values()); }
  function pointDist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
  function clampZoom(d) { return Math.max(baseCamDistance * 0.35, Math.min(baseCamDistance * 3, d)); }

  function onPointerDown(e) {
    canvas.setPointerCapture(e.pointerId);
    activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    autoRotateEnabled = false;
    clearTimeout(idleTimer);
    if (activePointers.size === 1) {
      dragging = true;
      downX = lastX = e.clientX; downY = lastY = e.clientY;
    } else if (activePointers.size === 2) {
      dragging = false;
      const pts = pointsArray();
      pinchStartDist = pointDist(pts[0], pts[1]);
      pinchStartCamDistance = camDistance;
    }
  }
  function onPointerMove(e) {
    if (!activePointers.has(e.pointerId)) return;
    activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (activePointers.size >= 2) {
      const pts = pointsArray();
      const d = pointDist(pts[0], pts[1]);
      if (pinchStartDist) camDistance = clampZoom(pinchStartCamDistance * (pinchStartDist / d));
    } else if (dragging) {
      const dx = e.clientX - lastX, dy = e.clientY - lastY;
      rotY += dx * 0.006;
      rotX = Math.max(-1.2, Math.min(1.2, rotX + dy * 0.006));
      lastX = e.clientX; lastY = e.clientY;
    }
  }
  function onPointerUp(e) {
    const wasSingleTap = dragging && activePointers.size === 1 && Math.hypot(e.clientX - downX, e.clientY - downY) < 6;
    activePointers.delete(e.pointerId);
    if (activePointers.size < 2) pinchStartDist = null;
    if (activePointers.size === 0) {
      dragging = false;
      idleTimer = setTimeout(() => { autoRotateEnabled = true; }, 2500);
    }
    if (wasSingleTap) raycastTap(e.clientX, e.clientY, e);
  }
  function onWheel(e) {
    e.preventDefault();
    camDistance = clampZoom(camDistance + e.deltaY * 0.04);
    autoRotateEnabled = false;
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => { autoRotateEnabled = true; }, 2500);
  }

  function animate() {
    requestAnimationFrame(animate);
    if (!active) return;
    if (autoRotateEnabled && !dragging) rotY += 0.0022;
    rig.rotation.set(rotX, rotY, 0);
    camera.position.set(0, camHeight, camDistance);
    camera.lookAt(0, 1.5, 0);
    renderer.render(scene, camera);
  }

  // bridgeLike: { id, type, spans, spanLength, defects:[{x,y,z,...}] }
  // Mirrors twin.js's rebuildModel() - same math, same defaults, minus the
  // procedural sensor layer and the layer-toggle DOM sync (done by the
  // caller here instead).
  function render(bridgeLike) {
    if (!inited) return;
    while (structureGroup.children.length) structureGroup.remove(structureGroup.children[0]);
    while (defectGroup.children.length) defectGroup.remove(defectGroup.children[0]);
    if (gridHelper) rig.remove(gridHelper);
    if (glowMesh) rig.remove(glowMesh);

    const model = (typeof getBridgeModel === 'function') ? getBridgeModel(bridgeLike.id, bridgeLike.type) : { kind: 'truss' };
    const kind = model.kind || 'truss';
    let SPAN_LEN = bridgeLike.spanLength || 28;
    const NUM_SPANS = bridgeLike.spans || 1;
    const DECK_W = model.deckWidth || 9;
    const TRUSS_H = model.trussHeight || 0;
    const PANELS_PER_SPAN = model.panelsPerSpan || 4;
    let TOTAL_LEN = SPAN_LEN * NUM_SPANS;
    if (kind === 'cantilever') {
      TOTAL_LEN = model.totalLen || 220;
      SPAN_LEN = TOTAL_LEN / NUM_SPANS;
    }
    const X0 = -TOTAL_LEN / 2;
    const deckY = 0;

    const gridSize = Math.min(Math.max(140, TOTAL_LEN + 40), 400);
    gridHelper = new THREE.GridHelper(gridSize, Math.floor(gridSize / 2.5), 0x2a3a38, 0x1a2625);
    gridHelper.position.y = -8.4;
    gridHelper.material.transparent = true;
    gridHelper.material.opacity = 0.4;
    rig.add(gridHelper);

    const glowRadius = Math.min(Math.max(34, TOTAL_LEN / 2 + 6), 200);
    glowMesh = new THREE.Mesh(
      new THREE.CircleGeometry(glowRadius, 48),
      new THREE.MeshBasicMaterial({ color: 0x5b8c8a, transparent: true, opacity: 0.07 })
    );
    glowMesh.rotation.x = -Math.PI / 2;
    glowMesh.position.y = -8.3;
    rig.add(glowMesh);

    const builders = (typeof BUILDERS !== 'undefined') ? BUILDERS : {};
    const builder = builders[kind] || (typeof buildTrussStructure === 'function' ? buildTrussStructure : null);
    const ctx = { SPAN_LEN, NUM_SPANS, DECK_W, TRUSS_H, PANELS_PER_SPAN, TOTAL_LEN, X0, deckY, structureGroup, matSteel, matDeck, matPier, matStone, matConcrete };
    const bridgeForBuilder = Object.assign({}, bridgeLike, {
      model, deckWidth: DECK_W, trussHeight: TRUSS_H, panelsPerSpan: PANELS_PER_SPAN, spanLength: SPAN_LEN, spans: NUM_SPANS
    });
    const frame = builder ? builder(bridgeForBuilder, ctx) : { camDistance: 58, camHeight: 13 };

    if (frame.groundY != null) {
      gridHelper.position.y = frame.groundY;
      glowMesh.position.y = frame.groundY + 0.1;
    }

    (bridgeLike.defects || []).filter((d) => d.x != null && d.y != null && d.z != null).forEach((d) => {
      const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.5, 0), matDefect);
      m.position.set(d.x, d.y, d.z);
      m.userData.defect = d;
      defectGroup.add(m);
    });

    camDistance = frame.camDistance || 58;
    baseCamDistance = camDistance;
    camHeight = frame.camHeight != null ? frame.camHeight : 13;
    scene.fog.density = 0.009 * Math.min(1, 130 / Math.max(130, camDistance));
    rotY = 0.4;
    rotX = 0.18;
  }

  function setDefectsVisible(v) { if (defectGroup) defectGroup.visible = v; }
  function setStructureVisible(v) {
    if (structureGroup) structureGroup.visible = v;
    if (gridHelper) gridHelper.visible = v;
    if (glowMesh) glowMesh.visible = v;
  }
  function hasDefectMarkers() { return !!(defectGroup && defectGroup.children.length); }
  function setActive(v) { active = v; }

  window.Twin3D = { ensureInit, render, setDefectsVisible, setStructureVisible, hasDefectMarkers, setActive };
})();
