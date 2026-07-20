// Lighter mobile TwinView. Reuses the desktop's actual procedural model
// builders (/twin/shapeBuilders.js, /twin/bridgeModels.js) unmodified - they
// are bare global functions with no DOM/page coupling, so they run here
// exactly as they do in twin.js. What's deliberately NOT ported from
// twin.js: manual drag-to-orbit, pinch-zoom, the skin switcher, and the
// procedural sensor layer - this view is auto-rotate + tap-a-marker only,
// using the desktop's default "twinView" material colors (its only
// stylised skin, not "Realistic"'s photo-textures).
(function () {
  'use strict';

  let renderer, scene, camera, rig, structureGroup, defectGroup, gridHelper, glowMesh;
  let matSteel, matDeck, matPier, matStone, matConcrete, matDefect;
  let canvas, raycaster, onTapCallback;
  let rotY = 0.4, camDistance = 58, camHeight = 13;
  let active = false;
  let inited = false;

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

    raycaster = new THREE.Raycaster();
    canvas.addEventListener('click', onCanvasClick);

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

  function onCanvasClick(e) {
    const rect = canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1
    );
    raycaster.setFromCamera(ndc, camera);
    if (!defectGroup.visible || !defectGroup.children.length) { onTapCallback && onTapCallback(null, e); return; }
    const hits = raycaster.intersectObjects(defectGroup.children, false);
    onTapCallback && onTapCallback(hits.length ? hits[0].object.userData.defect : null, e);
  }

  function animate() {
    requestAnimationFrame(animate);
    if (!active) return;
    rotY += 0.0022;
    rig.rotation.set(0.18, rotY, 0);
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
    camHeight = frame.camHeight != null ? frame.camHeight : 13;
    scene.fog.density = 0.009 * Math.min(1, 130 / Math.max(130, camDistance));
    rotY = 0.4;
  }

  function setDefectsVisible(v) { if (defectGroup) defectGroup.visible = v; }
  function setActive(v) { active = v; }

  window.Twin3D = { ensureInit, render, setDefectsVisible, setActive };
})();
