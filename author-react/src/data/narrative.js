// ============================================================
// STYLE PROFILE — extracted (mock) from an uploaded exemplar report.
// In production, stage 1 (upload -> extraction) produces this same
// shape from a real LLM call; everything downstream is unchanged.
// ============================================================
export const STYLE_PROFILE = {
  source: "HCC PI Inspection Report FB798 — Millway Footbridge (Stantec, June 2025)",
  photoCitation(nums) {
    return nums && nums.length ? ' (' + nums.map(n => 'Photo ' + n).join(', ') + ').' : '.';
  },
  priorityBands: [
    { code: 'H', label: 'High Priority (0 to 3 months)', cls: 'h' },
    { code: 'M', label: 'Medium Priority (4 to 12 months)', cls: 'm' },
    { code: 'L', label: 'Low Priority (13 to 60 months)', cls: 'l' },
  ],
};

// ============================================================
// MOCK INSPECTION DATA — Foxhollow Footbridge, Span 1
// (element taxonomy mirrors reportFull.docx.js's REPORT_ELEMENTS_BY_TYPE
// so this assembled structure could feed straight into it)
// ============================================================
export const CATEGORY_ORDER = [
  'Deck Elements',
  'Load-bearing Substructure',
  'Durability Elements',
  'Safety Elements',
  'Other Bridge Elements',
  'Ancillary Elements',
];

export const INITIAL_ELEMENTS = [
  { id: 'e1', category: 'Deck Elements', name: 'Primary deck element', status: 'good', note: null, photos: [] },
  { id: 'e2', category: 'Deck Elements', name: 'Transverse beams', status: 'defect',
    comment: 'Localised area of approximately 150mm x 80mm of surface corrosion due to paint coating loss, mid-span towards the east side.',
    severity: 2, extent: 'B', works: 'Y', priority: 'L', cost: '900', prior: null, photos: [1, 2] },
  { id: 'e3', category: 'Deck Elements', name: 'Half joints', status: 'na' },
  { id: 'e4', category: 'Deck Elements', name: 'Deck bracing', status: 'na' },

  { id: 'e5', category: 'Load-bearing Substructure', name: 'Foundations', status: 'good', note: 'no signs of settlement or rotation observed', photos: [] },
  { id: 'e6', category: 'Load-bearing Substructure', name: 'Abutments', status: 'ninsp', reason: 'extensive vegetation and a steep embankment', photos: [3] },
  { id: 'e7', category: 'Load-bearing Substructure', name: 'Bearings', status: 'defect',
    comment: 'Surface corrosion has progressed on the bearing plates at the north abutment, with pitting now visible across a wider area.',
    severity: 3, extent: 'B', works: 'Y', priority: 'M', cost: '2200',
    prior: { year: 2022, notedAs: 'minor surface staining' }, photos: [4] },
  { id: 'e8', category: 'Load-bearing Substructure', name: 'Bearing plinth/shelf', status: 'na' },

  { id: 'e9', category: 'Durability Elements', name: 'Waterproofing', status: 'defect',
    comment: 'Surfacing has worn through near the north expansion joint, exposing the deck plate over a wider area.',
    severity: 4, extent: 'C', works: 'Y', priority: 'H', cost: '9000',
    prior: { year: 2022, notedAs: 'minor localised wear' }, photos: [5, 6] },
  { id: 'e10', category: 'Durability Elements', name: 'Movement/expansion joints', status: 'defect',
    comment: 'The elastomeric joint sealant at midspan has debonded and is missing in places, allowing water to pass through onto the bearings below.',
    severity: 4, extent: 'C', works: 'Y', priority: 'H', cost: '2500', prior: null, photos: [7] },
  { id: 'e11', category: 'Durability Elements', name: 'Finishes: parapets/safety fences', status: 'defect',
    comment: 'Small areas of carved graffiti are present on both parapets, causing minor damage to the paint coating.',
    severity: 2, extent: 'B', works: 'Y', priority: 'L', cost: '600', prior: null, photos: [8] },

  { id: 'e12', category: 'Safety Elements', name: 'Handrail/parapets/safety fences', status: 'defect',
    comment: 'The parapet shows deformation in two locations, consistent with impact from passing vehicles or pedestrians.',
    severity: 2, extent: 'C', works: 'Y', priority: 'M', cost: '1500', prior: null, photos: [9] },
  { id: 'e13', category: 'Safety Elements', name: 'Footway/verge/footbridge surfacing', status: 'good', note: 'only minor, localised wear', photos: [] },

  { id: 'e14', category: 'Other Bridge Elements', name: 'Embankments', status: 'defect',
    comment: 'Vegetation on the east embankment obscures the abutment and prevents close inspection.',
    severity: 3, extent: 'B', works: 'Y', priority: 'M', cost: '2000', prior: null, photos: [10] },

  { id: 'e15', category: 'Ancillary Elements', name: 'Signs', status: 'defect',
    comment: 'The bridge identification sign at the north end is missing.',
    severity: 2, extent: 'A', works: 'Y', priority: 'L', cost: '750', prior: null, photos: [] },
  { id: 'e16', category: 'Ancillary Elements', name: 'Lighting', status: 'na' },
];

export const STATUS_INFO = {
  defect: ['defect', 'Defect'],
  good: ['good', 'Good condition'],
  na: ['na', 'Not applicable'],
  ninsp: ['ninsp', 'Not inspected'],
};

// ============================================================
// NARRATIVE ASSEMBLY — encodes the learned style profile.
// In production this step is an LLM call; here it's a deterministic
// stand-in so the concept works without any API key.
// ============================================================
export function buildNarrative(el) {
  if (el.status === 'na') return 'Not applicable.';
  if (el.status === 'ninsp') return `The ${el.name.toLowerCase()} could not be inspected due to ${el.reason}.`;
  if (el.status === 'good') return `The ${el.name.toLowerCase()} appeared to be in good condition${el.note ? ', with ' + el.note : ''}.`;
  let text = el.comment.trim();
  if (el.prior) {
    text = `Noted in the previous inspection (${el.prior.year}) as ${el.prior.notedAs}, this has since progressed: ${text}`;
  }
  return text + STYLE_PROFILE.photoCitation(el.photos);
}

export function buildConclusionsIntro(elements) {
  const defects = elements.filter(e => e.status === 'defect');
  const worst = defects.reduce((m, d) => Math.max(m, d.severity || 0), 0);
  const overall = worst >= 4 ? 'fair' : worst >= 3 ? 'fair to good' : 'good';
  let s = `The structure was found to be overall in ${overall} condition. `;
  const deteriorating = defects.filter(d => d.prior);
  if (deteriorating.length) {
    s += `Defects at the ${deteriorating.map(d => d.name.toLowerCase()).join(' and ')} previously identified in ${deteriorating[0].prior.year} have progressed further since the last inspection. `;
  }
  const notInspected = elements.filter(e => e.status === 'ninsp');
  if (notInspected.length) {
    s += `The ${notInspected.map(d => d.name.toLowerCase()).join(', ')} could not be fully inspected due to ${notInspected[0].reason}, and should be prioritised for access at the next visit.`;
  }
  return s;
}

export function buildPriorityBands(elements) {
  const bands = {};
  STYLE_PROFILE.priorityBands.forEach(b => { bands[b.code] = { ...b, items: [] }; });
  elements.filter(e => e.status === 'defect' && e.works === 'Y').forEach(e => {
    const band = bands[e.priority] || bands.L;
    band.items.push(`${e.comment.split('.')[0]}${e.name ? ' (' + e.name + ')' : ''}${e.cost ? ' — est. £' + e.cost : ''}`);
  });
  return Object.values(bands);
}
