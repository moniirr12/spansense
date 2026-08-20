/* ============================================================
   SAVI EXPORT - CROSSWALK TABLES
   ============================================================
   Maps spanSense's own element/material/condition vocabulary onto
   SAVI v1.10's controlled vocabulary (UKRLG's Structures Asset
   Valuation and Investment tool - see database/savi-template/).
   Built directly against the real SAVI v1.10 blank workbook's
   'Ref14' (element list), 'Ref03&04i' (component/material list) and
   'Ref00' (element condition score table) reference sheets - not
   guessed from the user guide.
   ============================================================ */
(function (global) {
    'use strict';

    // spanSense ELEMENTS_DB_BY_TYPE element number -> SAVI "Full Name of
    // Element" (Elements tab column C). Every spanSense element name below
    // is close enough to its SAVI counterpart to be an exact concept match;
    // the few spanSense elements with no SAVI equivalent (Machinery,
    // Lighting, Services, Signs/signals-as-element) are simply absent from
    // these maps, and rows for them are skipped by the exporter rather than
    // written with a guessed value.
    var SAVI_ELEMENT_NAME = {
        'Bridge': {
            1: 'Br01.  Primary Deck Element',
            2: 'Br02.  Transverse Beams',
            3: 'Br03.  Secondary Deck Element',
            4: 'Br04.  Half Joints/Hinge Joints',
            5: 'Br05.  Tie Beam/Rod',
            6: 'Br06.  Parapet Beam or Cantilever',
            7: 'Br07.  Deck Bracing',
            8: 'Br08.  Foundations',
            9: 'Br09.  Abutments (incl. Arch Springing)',
            10: 'Br10.  Spandrel Wall/Head Wall',
            11: 'Br11.  Pier/Column',
            12: 'Br12.  Cross-Head/Capping Beam',
            13: 'Br13.  Bearings',
            14: 'Br14.  Bearing Plinth/Shelf',
            15: 'Br15.  Superstructure Drainage',
            16: 'Br16.  Substructure Drainage',
            17: 'Br17.  Waterproofing',
            18: 'Br18.  Expansion Joints',
            19: 'Br19.  Finishes:  Deck Elements',
            20: 'Br20.  Finishes:  Substructure Elements',
            21: 'Br21.  Finishes:  Parapets/Safety Fences',
            22: 'Br22.  Access/Walkways/Gantries',
            23: 'Br23.  Handrail/Parapets/Safety Fences',
            24: 'Br24.  Carriageway surfacing',
            25: 'Br25.  Footway/verge/footbridge surfacing',
            26: 'Br26.  Invert/River Bed',
            27: 'Br27.  Aprons',
            28: 'Br28.  Fenders/Cutwaters/Collision Protection',
            29: 'Br29.  River Training Works',
            30: 'Br30.  Revetment/Batter Paving',
            31: 'Br31.  Wing Walls',
            32: 'Br32.  Retaining Walls',
            33: 'Br33.  Embankments',
            // 34 Machinery - no SAVI equivalent, intentionally omitted
            35: 'Br35.  Approach Rails/Barriers/Walls',
            36: 'Br36.  Signs'
            // 37 Lighting, 38 Services - no SAVI equivalent, intentionally omitted
        },
        'Retaining wall': {
            1: 'Rw01.  Foundations',
            2: 'Rw02.  Primary Element',
            3: 'Rw03.  Secondary Element',
            4: 'Rw04.  Parapet Beam/Plinth',
            5: 'Rw05.  Drainage',
            6: 'Rw06.  Movement/Expansion Joints',
            7: 'Rw07.  Finishes:  Wall',
            8: 'Rw08.  Finishes:  Handrail/Parapet',
            9: 'Rw09.  Handrail/Parapets/Safety Fences',
            10: 'Rw10.  Carriageway:  Top of Wall',
            11: 'Rw11.  Carriageway:  Foot of Wall',
            12: 'Rw12.  Footway/Verge:  Top of Wall',
            13: 'Rw13.  Footway/Verge:  Foot of Wall',
            14: 'Rw14.  Embankment:  Top of Wall',
            // 15 Superstructure drainage - no SAVI Rw equivalent, omitted
            16: 'Rw16.  Invert/River Bed',
            17: 'Rw17.  Aprons',
            18: 'Rw18.  Signs'
            // 19 Lighting, 20 Services - no SAVI equivalent, intentionally omitted
        },
        'Sign Gantry': {
            1: 'Sg01.  Foundations',
            2: 'Sg02.  Truss/Beams/Cantilevers',
            3: 'Sg03.  Transverse Members',
            4: 'Sg04.  Columns/Supports/Legs',
            5: 'Sg05.  Finishes:  Truss/Beam/Cantilever',
            6: 'Sg06.  Finishes:  Columns/Supports',
            7: 'Sg07.  Finishes:  Other Elements',
            8: 'Sg08.  Access Walkway/Deck',
            9: 'Sg09.  Access Ladder',
            10: 'Sg10.  Handrails',
            11: 'Sg11.  Base Connections',
            12: 'Sg12.  Support to Longitudinal Connection',
            13: 'Sg13.  Sign and Signal Supports'
            // 14 Signs/signals, 15 Lighting, 16 Services - no SAVI equivalent
        }
    };

    // bridges.type is stored as-is ("Bridge", "Footbridge", "Culvert",
    // "Retaining wall", "Sign Gantry" - confirmed against the live API, not
    // the lowercase-with-underscores ids the UI's filter chips use). Only
    // "Bridge", "Retaining wall" and "Sign Gantry" have their own element
    // catalog (SEEDED_ELEMENT_TYPES in server.js); Footbridge and Culvert
    // fall back to the Bridge catalog, mirroring server.js's own
    // resolveElementsType().
    var SEEDED_ELEMENT_TYPES = ['Bridge', 'Retaining wall', 'Sign Gantry'];

    // spanSense Table 4 material code (bridge_spans.primary_material_code)
    // -> SAVI Component/Material Type (Elements tab column D). SAVI's list
    // is far more granular (103 entries) than spanSense's 15 Table 4 codes,
    // so this is a best-fit default, not a guaranteed-exact match - flagged
    // as such in the export UI. 'P' (no secondary element/material) has no
    // mapping since it means "row not applicable".
    var SAVI_MATERIAL_TYPE = {
        A: 'Insitu Reinforced Concrete',
        B: 'Insitu Mass Concrete or Precast Plain Concrete',
        C: 'Insitu Prestressed Concrete (Post-Tensioned)',
        D: 'Precast Prestressed Concrete (Pre-Tensioned)',
        E: 'Fabricated Steel, Rolled Steel, Steel, or Steel Plate',
        F: 'Cast Iron or Wrought Iron',
        G: 'Cast Iron or Wrought Iron',
        H: 'Aluminium',
        I: 'Corrugated Rolled Steel',
        J: 'Corrugated Rolled Steel',
        K: 'Brickwork',
        L: 'Blockwork, i.e. Masonry or Stone',
        M: 'Other/Unknown Material',
        N: 'Timber (Hardwood not Treated)',
        Q: 'Other/Unknown Material'
    };

    // spanSense severity (1-5) + extent (A-E) -> SAVI condition code, and its
    // numeric Element Condition Score (ECS) for ranking "worst defect on
    // this element" - both lifted verbatim from SAVI's own 'Ref00' sheet
    // (Table C.11.F), which spanSense's own bci.js ecsMapping already
    // mirrors, so this is a same-scheme passthrough, not a translation.
    var SAVI_CONDITION_ECS = {
        '1A': 1,
        '2B': 2, '2C': 2.1, '2D': 2.3, '2E': 2.7,
        '3B': 3, '3C': 3.1, '3D': 3.3, '3E': 3.7,
        '4B': 4, '4C': 4.1, '4D': 4.3, '4E': 4.7,
        '5B': 5, '5C': 5.000000000001, '5D': 5.000000000002, '5E': 5.000000000003
    };

    // Build a SAVI condition code from spanSense's own severity/extent pair.
    // spanSense records severity 1-5 and extent A-E per defect; severity 1
    // has no extent grading in either scheme (there's only one valid code,
    // 1A), which this mirrors.
    function toSaviCondition(severity, extent) {
        if (severity === null || severity === undefined) return null;
        var sev = Number(severity);
        if (!sev || sev < 1 || sev > 5) return null;
        if (sev === 1) return '1A';
        var ext = (extent || 'B').toString().toUpperCase().charAt(0);
        if (!'BCDE'.includes(ext)) ext = 'B';
        var code = sev + ext;
        return SAVI_CONDITION_ECS.hasOwnProperty(code) ? code : (sev + 'B');
    }

    function elementCatalogForType(bridgeType) {
        return SEEDED_ELEMENT_TYPES.indexOf(bridgeType) >= 0 ? bridgeType : 'Bridge';
    }

    function saviElementName(bridgeType, elementNo) {
        var catalog = elementCatalogForType(bridgeType);
        var map = SAVI_ELEMENT_NAME[catalog] || SAVI_ELEMENT_NAME['Bridge'];
        return map[elementNo] || null;
    }

    function saviMaterialType(materialCode) {
        if (!materialCode) return null;
        return SAVI_MATERIAL_TYPE[materialCode.toUpperCase()] || null;
    }

    global.SaviMapping = {
        SAVI_ELEMENT_NAME: SAVI_ELEMENT_NAME,
        SAVI_MATERIAL_TYPE: SAVI_MATERIAL_TYPE,
        SAVI_CONDITION_ECS: SAVI_CONDITION_ECS,
        elementCatalogForType: elementCatalogForType,
        saviElementName: saviElementName,
        saviMaterialType: saviMaterialType,
        toSaviCondition: toSaviCondition
    };
})(window);
