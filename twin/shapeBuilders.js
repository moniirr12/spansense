/* ============================================================
   SHARED 3D STRUCTURE-SHAPE BUILDERS
   ============================================================
   Used by both twin/twin.js (the TwinView page) and
   inspection/locate3d.js (the "Locate Defects on 3D Model" modal)
   so the two pages render the exact same shape for a given
   structure's bridgeModels.js `kind`, instead of maintaining two
   diverging copies.

   Each consuming page owns its own Three.js scene/renderer/groups/
   materials (they can't be singleton-shared across pages), so every
   function here takes a `ctx` object instead of closing over page
   globals. `ctx` must provide: structureGroup, matSteel, matDeck,
   matPier, matStone, matConcrete, plus the geometry fields
   (SPAN_LEN, NUM_SPANS, DECK_W, TRUSS_H, PANELS_PER_SPAN, TOTAL_LEN,
   X0, deckY) that rebuildModel()/rebuildLocate3DModel() compute from
   the bridge before dispatching.
   ============================================================ */

function addBeam(ctx, x1, y1, z1, x2, y2, z2, thickness, material) {
    var dx = x2 - x1, dy = y2 - y1, dz = z2 - z1;
    var len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    var geo = new THREE.BoxGeometry(len, thickness, thickness);
    var mesh = new THREE.Mesh(geo, material);
    mesh.position.set((x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2);
    mesh.lookAt(x2, y2, z2);
    mesh.rotateY(Math.PI / 2);
    ctx.structureGroup.add(mesh);
}

function addDeck(ctx, X0, TOTAL_LEN, DECK_W, deckY, thickness) {
    var deckGeo = new THREE.BoxGeometry(TOTAL_LEN, thickness || 0.6, DECK_W);
    var deck = new THREE.Mesh(deckGeo, ctx.matDeck);
    deck.position.set(0, deckY, 0);
    ctx.structureGroup.add(deck);
    var edges = new THREE.LineSegments(new THREE.EdgesGeometry(deckGeo), new THREE.LineBasicMaterial({color: 0x223230}));
    edges.position.copy(deck.position);
    ctx.structureGroup.add(edges);
}

// Piers/abutments at each span boundary - opt-in (only kinds with real
// piers call this; previously this ran unconditionally for every kind).
function addPiers(ctx, X0, SPAN_LEN, NUM_SPANS, DECK_W, deckY, opts) {
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
        var pier = new THREE.Mesh(geo, ctx.matPier);
        pier.position.set(x, deckY - 0.3 - pierHeight / 2, 0);
        ctx.structureGroup.add(pier);
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
function buildTrussPanelRun(ctx, x1, x2, z, yLow, yHigh, panelCount, material) {
    var pw = (x2 - x1) / panelCount;
    addBeam(ctx, x1, yLow, z, x2, yLow, z, 0.5, material);
    addBeam(ctx, x1, yHigh, z, x2, yHigh, z, 0.5, material);
    for (var i = 0; i <= panelCount; i++) {
        var x = x1 + i * pw;
        addBeam(ctx, x, yLow, z, x, yHigh, z, 0.35, material);
        if (i < panelCount) {
            var xNext = x + pw;
            if (i % 2 === 0) addBeam(ctx, x, yLow, z, xNext, yHigh, z, 0.32, material);
            else addBeam(ctx, x, yHigh, z, xNext, yLow, z, 0.32, material);
        }
    }
}

/* ============================================================
   SHAPE BUILDERS - one per bridgeModels.js `kind`. Each populates
   ctx.structureGroup only and returns {camDistance, camHeight}
   framing tuned to its own scale. Sensors/stress/defects stay
   kind-agnostic (built once, generically, by the caller).
   ============================================================ */
function buildTrussStructure(bridge, ctx) {
    var SPAN_LEN = ctx.SPAN_LEN, NUM_SPANS = ctx.NUM_SPANS, DECK_W = ctx.DECK_W,
        TRUSS_H = ctx.TRUSS_H, PANELS_PER_SPAN = ctx.PANELS_PER_SPAN,
        TOTAL_LEN = ctx.TOTAL_LEN, X0 = ctx.X0, deckY = ctx.deckY;

    addDeck(ctx, X0, TOTAL_LEN, DECK_W, deckY);

    if (TRUSS_H > 0) {
        [DECK_W / 2, -DECK_W / 2].forEach(function(z) {
            buildTrussPanelRun(ctx, X0, X0 + TOTAL_LEN, z, deckY + 0.3, deckY + TRUSS_H, PANELS_PER_SPAN * NUM_SPANS, ctx.matSteel);
        });

        // Cross bracing
        var totalPanels = PANELS_PER_SPAN * NUM_SPANS;
        var pw = TOTAL_LEN / totalPanels;
        for (var i = 0; i <= totalPanels; i += 2) {
            var x = X0 + i * pw;
            addBeam(ctx, x, deckY + TRUSS_H, -DECK_W / 2, x, deckY + TRUSS_H, DECK_W / 2, 0.3, ctx.matSteel);
        }
    }

    addPiers(ctx, X0, SPAN_LEN, NUM_SPANS, DECK_W, deckY);

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
    var material = model.material === 'concrete' ? ctx.matConcrete : ctx.matStone;

    function addSlab(width, height, depth, y) {
        var geo = new THREE.BoxGeometry(width, height, depth);
        var mesh = new THREE.Mesh(geo, material);
        mesh.position.set(0, y, 0);
        ctx.structureGroup.add(mesh);
        var edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({color: 0x2a2620}));
        edges.position.copy(mesh.position);
        ctx.structureGroup.add(edges);
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
    var box = new THREE.Mesh(geo, ctx.matConcrete);
    box.position.set(0, boxY, 0);
    ctx.structureGroup.add(box);
    var edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({color: 0x2a2620}));
    edges.position.copy(box.position);
    ctx.structureGroup.add(edges);

    var voidW = Math.max(0.6, DECK_W - culvertThickness * 2);
    var voidH = Math.max(0.6, culvertHeight - culvertThickness * 2);
    var voidMat = new THREE.MeshBasicMaterial({color: 0x0c1412, side: THREE.DoubleSide});
    [-1, 1].forEach(function(dir) {
        var voidMesh = new THREE.Mesh(new THREE.PlaneGeometry(voidW, voidH), voidMat);
        voidMesh.position.set(dir * (TOTAL_LEN / 2 - 0.02), boxY, 0);
        voidMesh.rotation.y = Math.PI / 2;
        ctx.structureGroup.add(voidMesh);
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
            var post = new THREE.Mesh(new THREE.BoxGeometry(postWidth, postHeight, postWidth), ctx.matStone);
            post.position.set(x, deckY + postHeight / 2, side * postGap / 2);
            ctx.structureGroup.add(post);
        });
        var lintel = new THREE.Mesh(new THREE.BoxGeometry(postWidth * 1.4, lintelThickness, postGap + postWidth), ctx.matStone);
        lintel.position.set(x, deckY + postHeight + lintelThickness / 2, 0);
        ctx.structureGroup.add(lintel);
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

    addDeck(ctx, X0, TOTAL_LEN, DECK_W, deckYActual);

    // Arch: segmented voussoir chain on both sides of the deck.
    var archSamples = 16;
    var archZ = [DECK_W / 2 + 0.3, -(DECK_W / 2 + 0.3)];
    archZ.forEach(function(z) {
        var prev = null;
        for (var i = 0; i <= archSamples; i++) {
            var t = i / archSamples;
            var p = archPoint(t, X0, TOTAL_LEN, deckY, archHeight);
            if (prev) addBeam(ctx, prev.x, prev.y, z, p.x, p.y, z, archThickness, ctx.matSteel);
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
                addBeam(ctx, deckAttachX, deckYActual + 0.3, z, x, archY, z, 0.22, ctx.matSteel);
            }
        });
    }

    addPiers(ctx, X0, SPAN_LEN, NUM_SPANS, DECK_W, deckYActual, { abutmentsOnly: true });

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

    addDeck(ctx, X0, TOTAL_LEN, DECK_W, deckY, deckThickness);

    // Towers at each span boundary (same x-positions addPiers would use).
    var towerXs = [];
    for (var i = 0; i <= NUM_SPANS; i++) towerXs.push(X0 + SPAN_LEN * i);
    var towerBaseY = deckY - 8;
    var towerTopY = deckY + towerHeight;
    var towerH = towerTopY - towerBaseY;
    towerXs.forEach(function(x) {
        cableZ.forEach(function(z) {
            var tower = new THREE.Mesh(new THREE.BoxGeometry(1.6, towerH, 1.6), ctx.matPier);
            tower.position.set(x, towerBaseY + towerH / 2, z);
            ctx.structureGroup.add(tower);
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
                if (prev) addBeam(ctx, prev.x, prev.y, z, x, y, z, 0.18, ctx.matSteel);
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
            addBeam(ctx, hangerX, deckY + deckThickness / 2, z, x, cableY, z, 0.15, ctx.matSteel);
        }
    });

    // Extra straight stay-cables from tower tops to the deck (hybrid kind).
    if (model.stays) {
        cableZ.forEach(function(z) {
            towerXs.forEach(function(towerX) {
                [-1, 1].forEach(function(dir) {
                    var deckX = towerX + dir * SPAN_LEN * 0.3;
                    if (deckX < X0 || deckX > X0 + TOTAL_LEN) return;
                    addBeam(ctx, towerX, towerTopY - 1, z, deckX, deckY + deckThickness / 2, z, 0.15, ctx.matSteel);
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

    addDeck(ctx, X0, TOTAL_LEN, DECK_W, deckY, deckThickness);

    var totalPanels = PANELS_PER_SPAN * NUM_SPANS;
    var pw = TOTAL_LEN / totalPanels;
    var mastZ = [DECK_W / 2 + 0.2, -(DECK_W / 2 + 0.2)];
    for (var i = 1; i < totalPanels; i += 2) {
        var x = X0 + i * pw;
        mastZ.forEach(function(z) {
            var mast = new THREE.Mesh(new THREE.BoxGeometry(0.3, mastHeight, 0.3), ctx.matSteel);
            mast.position.set(x, deckY + deckThickness / 2 + mastHeight / 2, z);
            ctx.structureGroup.add(mast);
            var mastTopY = deckY + deckThickness / 2 + mastHeight;
            [-1, 1].forEach(function(dir) {
                var deckX = x + dir * pw * 1.5;
                if (deckX < X0 || deckX > X0 + TOTAL_LEN) return;
                addBeam(ctx, x, mastTopY, z, deckX, deckY + deckThickness / 2, z, 0.08, ctx.matSteel);
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
    // ctx.TOTAL_LEN/X0 already reflect the stylised scale rebuildModel()
    // substitutes for this 'kind' (see the comment there) - every system
    // that depends on scale (grid/glow, sensors, works overlay) shares it.
    var DECK_W = ctx.DECK_W, TOTAL_LEN = ctx.TOTAL_LEN, X0 = ctx.X0, deckY = ctx.deckY;
    var model = bridge.model || {};
    var towerHeight = model.towerHeight || 22;

    addDeck(ctx, X0, TOTAL_LEN, DECK_W, deckY);

    var towerXs = [X0 + TOTAL_LEN * 0.17, X0 + TOTAL_LEN * 0.5, X0 + TOTAL_LEN * 0.83];
    var baseY = deckY - 8, topY = deckY + towerHeight, midY = deckY + towerHeight * 0.45;
    var baseHalfW = 4, topHalfW = 3;
    var towerZ = [DECK_W / 2, -DECK_W / 2];

    towerXs.forEach(function(tx) {
        towerZ.forEach(function(z) {
            // Diamond lattice: base corners -> waist point -> top corners.
            addBeam(ctx, tx - baseHalfW, baseY, z, tx, midY, z, 0.4, ctx.matSteel);
            addBeam(ctx, tx + baseHalfW, baseY, z, tx, midY, z, 0.4, ctx.matSteel);
            addBeam(ctx, tx, midY, z, tx - topHalfW, topY, z, 0.4, ctx.matSteel);
            addBeam(ctx, tx, midY, z, tx + topHalfW, topY, z, 0.4, ctx.matSteel);
            addBeam(ctx, tx, baseY, z, tx, topY, z, 0.3, ctx.matSteel);
        });
        addBeam(ctx, tx, midY, towerZ[0], tx, midY, towerZ[1], 0.35, ctx.matSteel);
        addBeam(ctx, tx, topY, towerZ[0], tx, topY, towerZ[1], 0.3, ctx.matSteel);
    });

    // Cantilever arms + suspended center span between each pair of towers.
    for (var s = 0; s < towerXs.length - 1; s++) {
        var xa = towerXs[s], xb = towerXs[s + 1];
        var armLen = (xb - xa) * 0.32;
        var armY = deckY + towerHeight * 0.38;
        towerZ.forEach(function(z) {
            addBeam(ctx, xa, midY, z, xa + armLen, armY, z, 0.3, ctx.matSteel);
            addBeam(ctx, xb, midY, z, xb - armLen, armY, z, 0.3, ctx.matSteel);
            buildTrussPanelRun(ctx, xa + armLen, xb - armLen, z, deckY + 0.3, armY, 4, ctx.matSteel);
        });
    }

    // Real cantilever railway bridges (this builder's only user, the Forth
    // Bridge) run to 2000+ m total length - the 130-unit cap every other
    // builder uses (tuned for ~100-300m road/footbridges) put the camera
    // inside a single tower instead of framing the whole bridge.
    var camDist = Math.max(55, TOTAL_LEN * 0.95);
    return {
        camDistance: camDist,
        // A fixed height (~16, sized for towerHeight) reads fine at the
        // usual ~55-130 camDistance, but at 2000+ it puts the camera
        // almost perfectly horizontal (angle ~0.4°) - scale with distance
        // so the viewing angle, and the towers, stay roughly the same.
        camHeight: Math.max(towerHeight * 0.65, camDist * 0.27)
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
        var mesh = new THREE.Mesh(geo, ctx.matDeck);
        mesh.position.set(xCenter, deckY, 0);
        ctx.structureGroup.add(mesh);
        var edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({color: 0x223230}));
        edges.position.copy(mesh.position);
        ctx.structureGroup.add(edges);
    }

    [-1, 1].forEach(function(dir) {
        var tx = dir * towerX;
        sideZ.forEach(function(z) {
            var tower = new THREE.Mesh(new THREE.BoxGeometry(towerWidth * 0.5, towerH, towerWidth * 0.5), ctx.matPier);
            tower.position.set(tx, towerBaseY + towerH / 2, z);
            ctx.structureGroup.add(tower);
        });

        // Bascule leaf: from the central lifting gap out to the tower.
        var leafLen = towerX - leafGap / 2;
        deckSegment(dir * (leafGap / 2 + leafLen / 2), leafLen);

        // Side span: from the tower out to the far end.
        var outerX = dir * TOTAL_LEN / 2;
        var sideLen = Math.abs(outerX - tx);
        deckSegment((tx + outerX) / 2, sideLen);
        sideZ.forEach(function(z) {
            addBeam(ctx, tx, towerBaseY + towerH * sideSpanRatio, z, outerX, deckY + 0.3, z, 0.15, ctx.matSteel);
        });

        // Abutment at the far end.
        var pier = new THREE.Mesh(new THREE.BoxGeometry(4, 8, DECK_W + 1), ctx.matPier);
        pier.position.set(outerX, deckY - 0.3 - 4, 0);
        ctx.structureGroup.add(pier);
    });

    // High walkway connecting the tower tops.
    sideZ.forEach(function(z) {
        addBeam(ctx, -towerX, towerTopY - 1, z, towerX, towerTopY - 1, z, 0.5, ctx.matSteel);
    });

    return {
        camDistance: Math.min(Math.max(45, TOTAL_LEN), 200),
        camHeight: Math.min(Math.max(16, towerHeight * 0.6), 24)
    };
}

// Overhead sign gantry - twin support columns either side of the
// carriageway with a horizontal lattice beam between them at clearance
// height, carrying a row of sign panels on its downstream face. No deck/
// piers at all - unlike every other kind here, nothing carries traffic
// through this structure, it just spans over it.
function buildSignGantryStructure(bridge, ctx) {
    var TOTAL_LEN = ctx.TOTAL_LEN, X0 = ctx.X0, deckY = ctx.deckY;
    var model = bridge.model || {};
    var columnHeight = model.columnHeight || 6.6;
    var columnWidth = model.columnWidth || 0.6;
    var beamDepth = ctx.DECK_W || 1.4; // deckWidth is repurposed as beam depth for this kind
    var beamWidth = model.beamWidth || 1.0;
    var numPanels = model.numSignPanels || 3;
    var beamY = deckY + columnHeight;

    [X0, X0 + TOTAL_LEN].forEach(function(x) {
        var col = new THREE.Mesh(new THREE.BoxGeometry(columnWidth, columnHeight, columnWidth), ctx.matPier);
        col.position.set(x, deckY + columnHeight / 2, 0);
        ctx.structureGroup.add(col);
    });

    // Horizontal lattice beam spanning between the columns (buildTrussPanelRun
    // builds a truss "run" between two x positions at one z - reused here as
    // the gantry's own spanning beam rather than a bridge's side truss).
    var panelCount = Math.max(4, Math.round(TOTAL_LEN / 3));
    buildTrussPanelRun(ctx, X0, X0 + TOTAL_LEN, 0, beamY - beamDepth / 2, beamY + beamDepth / 2, panelCount, ctx.matSteel);

    // Sign panels along the downstream face of the beam - deliberately much
    // smaller than the beam itself (a fixed ~3m width, well under beamDepth
    // in height) so they read as individual signs mounted on the lattice
    // rather than merging into one solid slab across it.
    var gap = Math.max(1.5, (TOTAL_LEN * 0.7 - numPanels * 3) / Math.max(1, numPanels - 1));
    var panelW = Math.min(3, TOTAL_LEN * 0.7 / numPanels);
    var panelH = beamDepth * 0.55;
    var rowWidth = numPanels * panelW + (numPanels - 1) * gap;
    var startX = -rowWidth / 2 + panelW / 2;
    for (var i = 0; i < numPanels; i++) {
        var panel = new THREE.Mesh(new THREE.BoxGeometry(panelW, panelH, 0.12), ctx.matDeck);
        panel.position.set(startX + i * (panelW + gap), beamY, beamWidth / 2 + 0.1);
        ctx.structureGroup.add(panel);
    }

    // Wider/flatter than most other kinds (a real gantry spans the full
    // carriageway width but stands barely taller than a lorry) - the
    // default camDistance-vs-length ratio other builders use crops the far
    // column out of frame, so this needs a noticeably wider multiplier.
    return {
        camDistance: Math.min(Math.max(30, TOTAL_LEN * 1.7), 90),
        camHeight: Math.min(Math.max(6, columnHeight + 3), 14)
    };
}

// Caversham Bridge (Reading): two shallow segmental arches meeting at a
// single central river pier, each arch built from several concrete ribs
// spread across the deck width (not the generic 2-rib arch buildArchStructure
// uses), with a stadium-shaped (rounded-end) central pier and semicircular
// granite-balustraded promenade bays bulging out from the deck edges over
// that pier. Bespoke to this one real structure, the same way
// buildBasculeStructure/buildCantileverStructure are tailored to Tower
// Bridge/Forth Bridge rather than being fully generic. Ported from a
// standalone concept model (twin/caversham-bridge-3d.html) built against
// real-world references (opened 1926, 2 segmental arches on 1 central
// river pier, 6 concrete ribs per arch, granite-faced reinforced concrete).
function buildCavershamStructure(bridge, ctx) {
    var TOTAL_LEN = ctx.TOTAL_LEN, DECK_W = ctx.DECK_W, deckY = ctx.deckY;
    var model = bridge.model || {};
    var ribCount = model.ribCount || 6;
    var archRise = model.archRise || 3.2;
    var archThickness = model.archThickness || 0.7;
    var deckThickness = model.deckThickness || 1.1;
    var springDrop = model.springDrop || 4.2;
    var pierDrop = model.pierDrop || 8;
    var pierWidth = model.pierWidth || 2.2;
    var bayRadius = model.bayRadius || 2.0;

    var springY = deckY - springDrop;
    var riverbedY = springY - pierDrop;
    var pierXs = [-TOTAL_LEN / 2, 0, TOTAL_LEN / 2]; // abutment, central river pier, abutment

    function addBox(x, y, z, w, h, d, material) {
        var mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
        mesh.position.set(x, y, z);
        ctx.structureGroup.add(mesh);
        return mesh;
    }

    function ribZs() {
        var zs = [];
        for (var i = 0; i < ribCount; i++) zs.push(-DECK_W / 2 + (i + 0.5) * (DECK_W / ribCount));
        return zs;
    }

    // Central river pier: a box spanning the full deck width up to the arch
    // springing line, PLUS two rounded bulges at the deck edges that run the
    // full height from the riverbed up past deck level - these are the same
    // continuous mass as the promenade balconies above (addPromenadeBay caps
    // them with a floor/parapet), not a separate feature bolted onto a thin
    // post, matching how the real bridge's rounded pier end reads as one
    // uninterrupted stone mass from the waterline to the balcony rail.
    function addRiverPier(x) {
        var coreH = springY - riverbedY;
        addBox(x, riverbedY + coreH / 2, 0, pierWidth, coreH, DECK_W, ctx.matStone);
        var bulgeH = deckY - riverbedY;
        [-1, 1].forEach(function (dir) {
            var cyl = new THREE.Mesh(new THREE.CylinderGeometry(bayRadius, bayRadius, bulgeH, 24, 1, false, dir > 0 ? -Math.PI / 2 : Math.PI / 2, Math.PI), ctx.matStone);
            cyl.position.set(x, riverbedY + bulgeH / 2, dir * DECK_W / 2);
            ctx.structureGroup.add(cyl);
        });
    }

    function addAbutment(x) {
        var h = springY - riverbedY;
        addBox(x, riverbedY + h / 2, 0, 5, h, DECK_W + 1.5, ctx.matStone);
    }

    // One shallow segmental arch spanning [xa, xb], as a ring of ribs
    // across the deck width, plus open-spandrel columns up to the soffit.
    function buildSpanArch(xa, xb) {
        var samples = 16;
        ribZs().forEach(function (z) {
            var prev = null;
            for (var i = 0; i <= samples; i++) {
                var t = i / samples;
                var x = xa + t * (xb - xa);
                var y = springY + archRise * 4 * t * (1 - t);
                if (prev) addBeam(ctx, prev.x, prev.y, z, x, y, z, archThickness, ctx.matStone);
                prev = { x: x, y: y };
            }
            [0.2, 0.35, 0.5, 0.65, 0.8].forEach(function (t) {
                var x = xa + t * (xb - xa);
                var archTopY = springY + archRise * 4 * t * (1 - t) + archThickness / 2;
                var deckSoffitY = deckY - deckThickness / 2;
                if (deckSoffitY - archTopY > 0.12) addBeam(ctx, x, archTopY, z, x, deckSoffitY, z, 0.22, ctx.matPier);
            });
        });
    }

    // Granite-balustraded parapet capping the promenade balcony, bulging
    // outward on one side (dir = +1/-1) - sits directly on top of the
    // full-height rounded pier bulge addRiverPier already built at this same
    // (x, ±DECK_W/2) position, so the balcony reads as its continuation
    // rather than a separate feature. CylinderGeometry's cap angle
    // parametrizes as x=sin(theta), z=cos(theta) (verified empirically) -
    // thetaStart=-PI/2 sweeps (-r,0)->(0,r)->(r,0), a flat chord along local
    // X bulging +Z.
    function addPromenadeBay(x, dir) {
        var parapetH = 0.9;
        var thetaStart = dir > 0 ? -Math.PI / 2 : Math.PI / 2;
        var floor = new THREE.Mesh(
            new THREE.CylinderGeometry(bayRadius, bayRadius, deckThickness, 24, 1, false, thetaStart, Math.PI),
            ctx.matStone
        );
        floor.position.set(x, deckY, dir * DECK_W / 2);
        ctx.structureGroup.add(floor);

        var wall = new THREE.Mesh(
            new THREE.CylinderGeometry(bayRadius, bayRadius, parapetH, 24, 1, true, thetaStart, Math.PI),
            ctx.matStone
        );
        wall.position.set(x, deckY + deckThickness / 2 + parapetH / 2, dir * DECK_W / 2);
        ctx.structureGroup.add(wall);
    }

    function buildDeck() {
        addBox(0, deckY, 0, TOTAL_LEN, deckThickness, DECK_W, ctx.matDeck);
        [DECK_W / 2 - 0.15, -(DECK_W / 2 - 0.15)].forEach(function (z) {
            addBox(0, deckY + deckThickness / 2 + 0.45, z, TOTAL_LEN, 0.9, 0.28, ctx.matStone);
            [pierXs[0] + 1.4, pierXs[2] - 1.4].forEach(function (x) {
                var post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.5, 10), ctx.matSteel);
                post.position.set(x, deckY + deckThickness / 2 + 0.9 + 0.75, z);
                ctx.structureGroup.add(post);
            });
        });
        [1, -1].forEach(function (dir) { addPromenadeBay(pierXs[1], dir); });
    }

    addAbutment(pierXs[0]);
    addRiverPier(pierXs[1]);
    addAbutment(pierXs[2]);
    for (var s = 0; s < pierXs.length - 1; s++) buildSpanArch(pierXs[s], pierXs[s + 1]);
    buildDeck();

    return {
        camDistance: Math.min(Math.max(40, TOTAL_LEN * 1.05), 130),
        camHeight: Math.min(Math.max(10, archRise + springDrop + 8), 20),
        // The shared ground grid otherwise sits fixed partway up the pier
        // shaft (-8.4, well above riverbedY here), making the piers look
        // like they stop short of the ground instead of reaching it.
        groundY: riverbedY
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
    bascule: buildBasculeStructure,
    gantry: buildSignGantryStructure,
    caversham_arch: buildCavershamStructure
};
