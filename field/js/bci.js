// Ported 1:1 from inspection/bci.js and inspection/inspection.js so the
// mobile app computes the exact same BCIav/BCIcrit scores and uses the same
// element categories as the desktop app — this must never drift from those
// files' formulas/tables, since a mismatch would silently produce a
// different BCI for the same inspection depending which app saved it.
(function () {
  const STRUCTURE_TYPE_CONFIG = {
    'Bridge': {
      importanceMapping: {
        1: 'Very High', 2: 'High', 3: 'Very High', 4: 'Very High', 5: 'High', 6: 'High', 7: 'High',
        8: 'High', 9: 'High', 10: 'High', 11: 'Very High', 12: 'Very High', 13: 'High', 14: 'Medium',
        15: 'Medium', 16: 'Medium', 17: 'Medium', 18: 'High', 19: 'Medium', 20: 'Medium', 21: 'Medium',
        22: 'Medium', 23: 'High', 24: 'Medium', 25: 'Low', 26: 'Medium', 27: 'Medium', 28: 'Medium',
        29: 'Medium', 30: 'Low', 31: 'Medium', 32: 'Medium', 33: 'Low', 34: 'Medium'
      },
      criticalElements: [1, 2, 3, 4, 11, 12],
      bciAvIncludedElements: Array.from({ length: 34 }, (_, i) => i + 1)
    },
    'Retaining wall': {
      importanceMapping: {
        1: 'High', 2: 'Very High', 3: 'Very High', 4: 'High', 5: 'Medium', 6: 'Medium', 7: 'Medium',
        8: 'Medium', 9: 'High', 10: 'Low', 11: 'Low', 12: 'Low', 13: 'Low', 14: 'Low', 15: 'Low',
        16: 'Medium', 17: 'Medium'
      },
      criticalElements: [1, 2, 3],
      bciAvIncludedElements: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17]
    },
    'Sign Gantry': {
      importanceMapping: {
        1: 'High', 2: 'Very High', 3: 'Very High', 4: 'Very High', 5: 'Medium', 6: 'Medium', 7: 'Low',
        8: 'High', 9: 'High', 10: 'High', 11: 'Very High', 12: 'Very High', 13: 'Medium'
      },
      criticalElements: [2, 3, 4, 11, 12],
      bciAvIncludedElements: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]
    }
  };

  function getStructureConfig(structureType) {
    return STRUCTURE_TYPE_CONFIG[structureType] || STRUCTURE_TYPE_CONFIG['Bridge'];
  }

  const ecsMapping = {
    '1A': 1.0,
    '2B': 2.0, '2C': 2.1, '2D': 2.3, '2E': 2.7,
    '3B': 3.0, '3C': 3.1, '3D': 3.3, '3E': 3.7,
    '4B': 4.0, '4C': 4.1, '4D': 4.3, '4E': 4.7,
    '5B': 5.0, '5C': 5.0, '5D': 5.0, '5E': 5.0
  };

  function calculateECS(sPlusEx) {
    if (sPlusEx === '00') return 0;
    return ecsMapping[sPlusEx] || 0.0;
  }
  function calculateECF(importance, ecs) {
    if (importance === 'Very High') return 0;
    if (importance === 'High') return 0.3 - ((ecs - 1) * (0.3 / 4));
    if (importance === 'Medium') return 0.6 - ((ecs - 1) * (0.6 / 4));
    if (importance === 'Low') return 1.2 - ((ecs - 1) * (1.2 / 4));
    return 0;
  }
  function calculateECI(ecs, ecf) { return ecs - ecf >= 1 ? ecs - ecf : 1; }
  function calculateEIF(importance, severity) {
    if (severity === 0) return 0;
    if (importance === 'Very High') return 2;
    if (importance === 'High') return 1.5;
    if (importance === 'Medium') return 1.2;
    if (importance === 'Low') return 1;
    return 0;
  }
  function calculateBCIAv(bcsValues, eifValues) {
    const bcsSum = bcsValues.reduce((s, v) => s + v, 0);
    const eifSum = eifValues.reduce((s, v) => s + v, 0);
    // No element with a real defect yet (every EIF is 0, same "nothing
    // recorded" case calculateBCICrit already guards) - 0/0 is NaN, not a
    // score. Perfect condition until something is actually flagged.
    if (eifSum === 0) return 100;
    const bcsAvg = bcsSum / eifSum;
    return 100 - 2 * ((bcsAvg ** 2) + (6.5 * bcsAvg) - 7.5);
  }
  function calculateBCICrit(eciValues, structureType) {
    const specificElements = getStructureConfig(structureType).criticalElements;
    const filtered = eciValues.filter((it) => specificElements.includes(it.itemno)).map((it) => it.eci);
    if (filtered.length === 0) return 100.00;
    const eciMax = Math.max(...filtered);
    return 100 - 2 * ((eciMax ** 2) + (6.5 * eciMax) - 7.5);
  }

  // severityValues/extentValues/itemNumbers are parallel arrays, one entry
  // per element considered (missing/untouched elements should pass severity
  // 0 so they drop out of the weighted average entirely, per calculateEIF).
  function calculateBCI(severityValues, extentValues, itemNumbers, structureType = 'Bridge') {
    const config = getStructureConfig(structureType);
    const eciValues = [];
    const bciAvBcs = [];
    const bciAvEif = [];

    itemNumbers.forEach((itemno, i) => {
      const severity = severityValues[i] || 0;
      const extent = extentValues[i] || 0;
      const ecs = calculateECS(`${severity}${extent}`);
      const importance = config.importanceMapping[itemno] || 'Medium';
      const ecf = calculateECF(importance, ecs);
      const eci = calculateECI(ecs, ecf);
      eciValues.push({ itemno, eci });
      const eif = calculateEIF(importance, severity);
      const bcs = eci * eif;
      if (config.bciAvIncludedElements.includes(itemno)) {
        bciAvBcs.push(bcs);
        bciAvEif.push(eif);
      }
    });

    return {
      bciAv: calculateBCIAv(bciAvBcs, bciAvEif),
      bciCrit: calculateBCICrit(eciValues, structureType)
    };
  }

  // Structure Condition Index bands - Very Good 90-100, Good 80-<90,
  // Fair 65-<80, Poor 40-<65, Very Poor 0-<40 (the standard SCI key, not a
  // spanSense-specific scale - matches the reference table exactly).
  function bandFromScore(score) {
    if (score >= 90) return 'verygood';
    if (score >= 80) return 'good';
    if (score >= 65) return 'fair';
    if (score >= 40) return 'poor';
    return 'critical';
  }
  const BAND_LABELS = { verygood: 'Very Good', good: 'Good', fair: 'Fair', poor: 'Poor', critical: 'Very Poor' };
  const BAND_COLORS = {
    verygood: { c: '#1f5c4a', bg: '#e6f2ee' },
    good: { c: '#2d7a6e', bg: '#eef4f2' },
    fair: { c: '#BA7517', bg: '#fdf6ec' },
    poor: { c: '#c47070', bg: '#fbeeee' },
    critical: { c: '#c0392b', bg: '#fdf2f2' }
  };

  // element -> category, per structure type. Ported from inspection.js's
  // CATEGORY_RANGES tables (used there to draw the grouped category-header
  // rows in the element table).
  const CATEGORY_MAPS = {
    'Bridge': [
      ...[1, 2, 3, 4, 5, 6, 7].map((n) => ({ category: 'Deck Elements', elementNo: n })),
      ...[8, 9, 10, 11, 12, 13, 14].map((n) => ({ category: 'Load-bearing Substructure', elementNo: n })),
      ...[15, 16, 17, 18, 19, 20, 21].map((n) => ({ category: 'Durability Elements', elementNo: n })),
      ...[22, 23, 24, 25].map((n) => ({ category: 'Safety Elements', elementNo: n })),
      ...[26, 27, 28, 29, 30, 31, 32, 33, 34].map((n) => ({ category: 'Other Bridge Elements', elementNo: n })),
      ...[35, 36, 37, 38].map((n) => ({ category: 'Ancillary Elements', elementNo: n }))
    ],
    'Retaining wall': [
      ...[1, 2, 3, 4].map((n) => ({ category: 'Main Elements', elementNo: n })),
      ...[5, 6, 7, 8].map((n) => ({ category: 'Durability Elements', elementNo: n })),
      ...[9, 10, 11, 12, 13].map((n) => ({ category: 'Safety Elements', elementNo: n })),
      ...[14, 15, 16, 17].map((n) => ({ category: 'Other Elements', elementNo: n })),
      ...[18, 19, 20].map((n) => ({ category: 'Ancillary Elements', elementNo: n }))
    ],
    'Sign Gantry': [
      ...[1, 2, 3, 4].map((n) => ({ category: 'Main Elements', elementNo: n })),
      ...[5, 6, 7].map((n) => ({ category: 'Durability Elements', elementNo: n })),
      ...[8, 9, 10].map((n) => ({ category: 'Safety Elements', elementNo: n })),
      ...[11, 12, 13].map((n) => ({ category: 'Other Elements', elementNo: n })),
      ...[14, 15, 16].map((n) => ({ category: 'Ancillary Elements', elementNo: n }))
    ]
  };
  function resolveElementsType(type) {
    return CATEGORY_MAPS[type] ? type : 'Bridge';
  }
  function categoryForElement(structureType, elementNo) {
    const map = CATEGORY_MAPS[resolveElementsType(structureType)];
    const found = map.find((e) => e.elementNo === Number(elementNo));
    return found ? found.category : null;
  }

  // Reserved defect codes for the two quick actions - "No Defects" (0.0) and
  // "Not Inspected" (0.1) - both stored as severity 1 / extent A internally
  // (a real defect row, so BCI math treats it like any other 1A entry)
  // purely so every element ends up with a row without inventing a third
  // severity scale just for these two states.
  const NO_DEFECTS_CODE = '0.0';
  const NOT_INSPECTED_CODE = '0.1';

  // Only two families of Severity+Extent are valid on a real proforma: 1A
  // (trivial/no issue) or 2-5 paired with B-E (worse-than-trivial, sized by
  // extent). Mirrors persistCurrentDefectForm()'s isValidCombo check.
  function isValidSeverityExtent(severity, extent) {
    const s = parseInt(severity, 10);
    if (s === 1) return extent === 'A';
    return s >= 2 && s <= 5 && ['B', 'C', 'D', 'E'].includes(extent);
  }

  window.FieldBCI = {
    calculateBCI, bandFromScore, BAND_COLORS, BAND_LABELS,
    categoryForElement, resolveElementsType, CATEGORY_MAPS,
    NO_DEFECTS_CODE, NOT_INSPECTED_CODE, isValidSeverityExtent
  };
})();
