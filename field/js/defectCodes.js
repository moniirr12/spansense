// Standard defect type/number reference table - same taxonomy as the
// desktop app's inspection/inspectionA.js (DEFECT_TYPE_MAP + defectNumberText),
// copied here rather than shared as a module since Field ships as its own
// self-contained PWA bundle (see field/sw.js's cache list) with no build
// step to pull in desktop's DOM-coupled inspectionA.js.
(function () {
  const DEFECT_TYPE_MAP = {
    1: 'Metalwork',
    2: 'RC & prestressed concrete',
    3: 'Masonry, brickwork & MC',
    4: 'Paintwork & coatings',
    5: 'Vegetation',
    6: 'Foundation',
    7: 'Invert, apron & riverbed',
    8: 'Drainage',
    9: 'Surfacing',
    10: 'Expansion joints',
    11: 'Embankments',
    12: 'Bearings',
    13: 'Impact damage',
    14: 'Waterproofing',
    15: 'Stone slab bridges',
    16: 'Timber',
  };

  const DEFECT_TEXT_MAP = {
    1: { 1: 'Rusting', 2: 'Section loss', 3: 'Rusting or damage to bolts', 4: 'Damage to weld' },
    2: { 2: 'Spalling', 3: 'Cracking', 4: 'Prestressing damage', 5: 'Delamination', 6: 'Freeze thaw' },
    3: { 1: 'Deformation', 2: 'Pointing', 3: 'Arch ring damage', 4: 'Arch barrel crack', 5: 'Cracking', 6: 'Section loss', 7: 'Bulging or leaning' },
    4: { 1: 'Coating damage' },
    5: { 1: 'Structural damage', 2: 'Inspection obstruction' },
    6: { 1: 'Settlement', 2: 'Differential movement', 3: 'Sliding', 4: 'Rotation', 5: 'Scour', 6: 'Foundation faults' },
    7: { 1: 'Scour', 2: 'Vegetation or silt' },
    8: { 1: 'Blockage', 2: 'Causing stains', 3: 'Structural damage', 4: 'Weep hole blockage' },
    9: { 1: 'Wear and weathering', 2: 'Crazing, tracking & fretting', 3: 'Poor texture', 4: 'Cracking', 5: 'Slippery', 6: 'Cracked flagged surfacing' },
    10: {
      1: 'Asphaltic plug debonding', 2: 'Asphaltic plug material loss', 3: 'Asphaltic plug tracking', 4: 'Cracking along nosing',
      5: 'Elastomeric and others missing bolts', 6: 'Elastomeric and others sealant breached', 7: 'Elastomeric and others road breaking',
      8: 'Elastomeric and others loose fixings', 9: 'Elastomeric and others component damage', 10: 'Buried joint cracking',
      11: 'Buried joint sealant damage', 12: 'Joint leakage',
    },
    11: { 1: 'Deformation or settlement' },
    12: { 1: 'Rusting', 2: 'Offset or dislodged', 3: 'Sliding', 4: 'Crazing', 5: 'Sliding plate damage', 6: 'Bearing damage' },
    13: { 1: 'Impact' },
    14: { 1: 'Non structural damage', 2: 'Structural damage' },
    15: { 1: 'Cracking or displacement' },
    16: { 1: 'Damage', 2: 'Section loss' },
  };

  function getDefectTypeName(type) {
    return DEFECT_TYPE_MAP[Number(type)] || null;
  }
  function getDefectText(type, number) {
    const t = DEFECT_TEXT_MAP[Number(type)];
    return (t && t[Number(number)]) || null;
  }

  // Flattened, search-friendly catalog for the picker - one row per code.
  const CATALOG = [];
  Object.keys(DEFECT_TYPE_MAP).forEach((type) => {
    const category = DEFECT_TYPE_MAP[type];
    const numbers = DEFECT_TEXT_MAP[type] || {};
    Object.keys(numbers).forEach((number) => {
      const name = numbers[number];
      CATALOG.push({
        type: String(type),
        number: String(number),
        code: `${type}.${number}`,
        category,
        name,
        search: `${category} ${name}`.toLowerCase(),
      });
    });
  });

  window.DefectCodes = { DEFECT_TYPE_MAP, DEFECT_TEXT_MAP, CATALOG, getDefectTypeName, getDefectText };
})();
