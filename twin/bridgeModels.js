/* ============================================================
   SPANSENSE - PER-BRIDGE 3D MODEL DEFINITIONS
   ============================================================
   Span count and total length come from the real bridges table
   (span_number, length) - this file only supplies the geometry
   fields that table doesn't have, since they're purely visual
   and there's no admin UI to manage them yet.

   Keyed by the bridge's real database id. Add an entry here for
   any bridge that needs a hand-tuned model; anything else falls
   back to DEFAULT_MODEL (adjusted by structure type).
   ============================================================ */

const BRIDGE_MODELS = {
    // Example: 1: { deckWidth: 9, trussHeight: 6.5, panelsPerSpan: 7 },
};

const FLAT_TYPES = ['retaining_wall', 'culvert'];

function getBridgeModel(bridgeId, type) {
    var override = BRIDGE_MODELS[bridgeId] || {};
    var isFlat = FLAT_TYPES.indexOf((type || '').toLowerCase()) !== -1;
    var defaults = {
        deckWidth: isFlat ? 4 : 9,
        trussHeight: isFlat ? 0 : 6,
        panelsPerSpan: isFlat ? 1 : 6
    };
    return {
        deckWidth: override.deckWidth != null ? override.deckWidth : defaults.deckWidth,
        trussHeight: override.trussHeight != null ? override.trussHeight : defaults.trussHeight,
        panelsPerSpan: override.panelsPerSpan != null ? override.panelsPerSpan : defaults.panelsPerSpan
    };
}
