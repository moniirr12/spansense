/* ============================================================
   SPANSENSE - PER-STRUCTURE 3D MODEL DEFINITIONS
   ============================================================
   Span count and total length come from the real bridges table
   (span_number, length) - this file only supplies the geometry
   fields that table doesn't have, since they're purely visual
   and there's no admin UI to manage them yet.

   Each structure is assigned a `kind` (the shape family twin.js's
   rebuildModel() dispatches on) plus whatever tunable params that
   kind's builder reads. Keyed by the structure's real database id,
   authored from the bridges.type + bridges.description columns.
   ============================================================ */

const DEFAULT_KIND = 'truss';

// Per-kind default param sets. Every kind defines deckWidth/trussHeight/
// panelsPerSpan (consumed by the kind-agnostic sensor/stress-overlay code
// in twin.js) plus its own shape-specific knobs.
const KIND_DEFAULTS = {
    truss: {
        deckWidth: 9, trussHeight: 6, panelsPerSpan: 6
    },
    suspension: {
        deckWidth: 10, trussHeight: 2.4, panelsPerSpan: 8,
        towerHeight: 26, cableSag: 0.16, stays: false, zigzagHangers: false
    },
    cable_stay_low: {
        deckWidth: 4, trussHeight: 0.6, panelsPerSpan: 6,
        mastHeight: 4.5, cableSag: 0
    },
    arch: {
        deckWidth: 9, trussHeight: 1.2, panelsPerSpan: 8,
        archHeight: 9, archThickness: 0.6, hangerStyle: 'vertical', deckCurved: false
    },
    cantilever: {
        deckWidth: 10, trussHeight: 7, panelsPerSpan: 8, towerHeight: 22
    },
    bascule: {
        deckWidth: 9, trussHeight: 3, panelsPerSpan: 4,
        towerHeight: 24, towerWidth: 5, leafGap: 1.2, sideSpanRatio: 0.6
    },
    wall: {
        deckWidth: 4, trussHeight: 0, panelsPerSpan: 1,
        wallHeight: 6, wallThickness: 1.4, battered: false, material: 'stone'
    },
    culvert: {
        deckWidth: 4, trussHeight: 0, panelsPerSpan: 1,
        culvertHeight: 2.2, culvertThickness: 0.5
    },
    trilithon: {
        deckWidth: 4, trussHeight: 0, panelsPerSpan: 1,
        postHeight: 4.2, postWidth: 1.1, lintelThickness: 0.7,
        numTrilithons: 5, irregularSpacing: true
    }
};

// Per-structure kind assignment + visual tuning overrides. Spans/length
// still come from the DB; only kind + shape knobs live here.
const BRIDGE_MODELS = {
    1:  { kind: 'bascule' },                                        // Tower Bridge
    2:  { kind: 'cable_stay_low' },                                 // Millennium Bridge
    3:  { kind: 'cantilever' },                                     // Forth Bridge
    4:  { kind: 'suspension' },                                     // Clifton Suspension Bridge
    5:  { kind: 'suspension' },                                     // Humber Bridge
    6:  { kind: 'suspension', stays: true },                        // Albert Bridge
    7:  { kind: 'suspension' },                                     // Menai Suspension Bridge
    8:  { kind: 'arch', hangerStyle: 'vertical' },                  // Tyne Bridge
    9:  { kind: 'wall', material: 'stone' },                        // Hadrian Wall
    10: { kind: 'culvert' },                                        // Box Culvert
    11: { kind: 'truss', deckWidth: 4, trussHeight: 3.2, panelsPerSpan: 4 }, // Thames Footbridge
    12: { kind: 'suspension', zigzagHangers: true },                // Severn Bridge
    13: { kind: 'arch', hangerStyle: 'inclined', deckCurved: true }, // Gateshead Millennium Bridge
    14: { kind: 'arch', hangerStyle: 'none' },                      // Iron Bridge
    15: { kind: 'culvert' },                                        // Culvert at River Avon
    16: { kind: 'wall', material: 'concrete' },                     // Retaining Wall at Edinburgh Castle
    17: { kind: 'wall', material: 'stone', battered: true },        // Retaining Wall at York Minster
    18: { kind: 'culvert' },                                        // Culvert at River Thames
    19: { kind: 'truss', deckWidth: 4, trussHeight: 3.2, panelsPerSpan: 4 }, // Footbridge at Hyde Park
    20: { kind: 'trilithon' }                                       // Retaining Wall at Stonehenge
};

// Fallback for any future structure not yet hand-mapped above.
function inferKindFromType(type) {
    var t = (type || '').toLowerCase();
    if (t === 'retaining wall') return 'wall';
    if (t === 'culvert') return 'culvert';
    return DEFAULT_KIND;
}

function getBridgeModel(bridgeId, type) {
    var override = BRIDGE_MODELS[bridgeId] || {};
    var kind = override.kind || inferKindFromType(type);
    var defaults = KIND_DEFAULTS[kind] || KIND_DEFAULTS[DEFAULT_KIND];
    var merged = Object.assign({}, defaults, override);
    merged.kind = kind;
    return merged;
}
