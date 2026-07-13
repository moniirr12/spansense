// REAL ELEMENT TAXONOMY - same categories/order as test.js's
// ALL_ELEMENTS_LIST_BY_TYPE, duplicated here per this codebase's
// established per-file convention (category grouping only exists in
// frontend lookups, not the `elements` table).
const ALL_ELEMENTS_LIST_BY_TYPE = {
  Bridge: [
    { category: "Deck Elements", elementNo: 1 }, { category: "Deck Elements", elementNo: 2 },
    { category: "Deck Elements", elementNo: 3 }, { category: "Deck Elements", elementNo: 4 },
    { category: "Deck Elements", elementNo: 5 }, { category: "Deck Elements", elementNo: 6 },
    { category: "Deck Elements", elementNo: 7 },
    { category: "Load-bearing Substructure", elementNo: 8 }, { category: "Load-bearing Substructure", elementNo: 9 },
    { category: "Load-bearing Substructure", elementNo: 10 }, { category: "Load-bearing Substructure", elementNo: 11 },
    { category: "Load-bearing Substructure", elementNo: 12 }, { category: "Load-bearing Substructure", elementNo: 13 },
    { category: "Load-bearing Substructure", elementNo: 14 },
    { category: "Durability Elements", elementNo: 15 }, { category: "Durability Elements", elementNo: 16 },
    { category: "Durability Elements", elementNo: 17 }, { category: "Durability Elements", elementNo: 18 },
    { category: "Durability Elements", elementNo: 19 }, { category: "Durability Elements", elementNo: 20 },
    { category: "Durability Elements", elementNo: 21 },
    { category: "Safety Elements", elementNo: 22 }, { category: "Safety Elements", elementNo: 23 },
    { category: "Safety Elements", elementNo: 24 }, { category: "Safety Elements", elementNo: 25 },
    { category: "Other Bridge Elements", elementNo: 26 }, { category: "Other Bridge Elements", elementNo: 27 },
    { category: "Other Bridge Elements", elementNo: 28 }, { category: "Other Bridge Elements", elementNo: 29 },
    { category: "Other Bridge Elements", elementNo: 30 }, { category: "Other Bridge Elements", elementNo: 31 },
    { category: "Other Bridge Elements", elementNo: 32 }, { category: "Other Bridge Elements", elementNo: 33 },
    { category: "Other Bridge Elements", elementNo: 34 },
    { category: "Ancillary Elements", elementNo: 35 }, { category: "Ancillary Elements", elementNo: 36 },
    { category: "Ancillary Elements", elementNo: 37 }, { category: "Ancillary Elements", elementNo: 38 }
  ],
  "Retaining wall": [
    { category: "Main Elements", elementNo: 1 }, { category: "Main Elements", elementNo: 2 },
    { category: "Main Elements", elementNo: 3 }, { category: "Main Elements", elementNo: 4 },
    { category: "Durability Elements", elementNo: 5 }, { category: "Durability Elements", elementNo: 6 },
    { category: "Durability Elements", elementNo: 7 }, { category: "Durability Elements", elementNo: 8 },
    { category: "Safety Elements", elementNo: 9 }, { category: "Safety Elements", elementNo: 10 },
    { category: "Safety Elements", elementNo: 11 }, { category: "Safety Elements", elementNo: 12 },
    { category: "Safety Elements", elementNo: 13 },
    { category: "Other Elements", elementNo: 14 }, { category: "Other Elements", elementNo: 15 },
    { category: "Other Elements", elementNo: 16 }, { category: "Other Elements", elementNo: 17 },
    { category: "Ancillary Elements", elementNo: 18 }, { category: "Ancillary Elements", elementNo: 19 },
    { category: "Ancillary Elements", elementNo: 20 }
  ],
  "Sign Gantry": [
    { category: "Main Elements", elementNo: 1 }, { category: "Main Elements", elementNo: 2 },
    { category: "Main Elements", elementNo: 3 }, { category: "Main Elements", elementNo: 4 },
    { category: "Durability Elements", elementNo: 5 }, { category: "Durability Elements", elementNo: 6 },
    { category: "Durability Elements", elementNo: 7 },
    { category: "Safety Elements", elementNo: 8 }, { category: "Safety Elements", elementNo: 9 },
    { category: "Safety Elements", elementNo: 10 },
    { category: "Other Elements", elementNo: 11 }, { category: "Other Elements", elementNo: 12 },
    { category: "Other Elements", elementNo: 13 },
    { category: "Ancillary Elements", elementNo: 14 }, { category: "Ancillary Elements", elementNo: 15 },
    { category: "Ancillary Elements", elementNo: 16 }
  ]
};
function categoryFor(structureType, elementNo){
  const list = ALL_ELEMENTS_LIST_BY_TYPE[structureType] || ALL_ELEMENTS_LIST_BY_TYPE.Bridge;
  const found = list.find(e => e.elementNo === elementNo);
  return found ? found.category : 'Other Elements';
}
function categoryOrderFor(structureType){
  const list = ALL_ELEMENTS_LIST_BY_TYPE[structureType] || ALL_ELEMENTS_LIST_BY_TYPE.Bridge;
  const seen = [];
  list.forEach(e => { if (!seen.includes(e.category)) seen.push(e.category); });
  return seen;
}
