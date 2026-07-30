// Author no longer auto-drafts per-defect narrative text (each defect's
// description in Report View/Export is just its own raw comment, same as
// inspection.html/inspection1.html show it - see defectDescriptionFor()
// in author.js). What's left here is just the Conclusions summary
// generator, which never touched narrative text in the first place.
function fmtDate(d){
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

function buildConclusionsIntro(state){
  const defects = state.diffElements.filter(e => e.current.status === 'defect');
  const worst = defects.reduce((m,d) => Math.max(m, parseInt(d.current.severity,10)||0), 0);
  const overall = worst >= 4 ? 'fair' : worst >= 3 ? 'fair to good' : 'good';
  let s = `The structure was found to be overall in ${overall} condition. `;
  const worsening = defects.filter(d => d.comparison === 'worsened');
  if (worsening.length) {
    s += `Defects at the ${worsening.map(d=>d.name.toLowerCase()).join(', ')} have worsened since the previous inspection` + (state.previousDate ? ` on ${fmtDate(state.previousDate)}` : '') + `. `;
  }
  const newDefects = defects.filter(d => d.comparison === 'new');
  if (newDefects.length) {
    s += `New defects were identified at the ${newDefects.map(d=>d.name.toLowerCase()).join(', ')}. `;
  }
  const notInspected = state.diffElements.filter(e => e.current.status === 'ninsp');
  if (notInspected.length) {
    s += `The ${notInspected.map(d=>d.name.toLowerCase()).join(', ')} could not be inspected on this occasion, and should be prioritised for access at the next visit.`;
  }
  return s;
}

const PRIORITY_BANDS_DEF = [
  { code: 'H', label: 'High Priority (0 to 3 months)', cls: 'h' },
  { code: 'M', label: 'Medium Priority (4 to 12 months)', cls: 'm' },
  { code: 'L', label: 'Low Priority (13 to 60 months)', cls: 'l' }
];
function buildPriorityBands(state){
  const bands = {};
  PRIORITY_BANDS_DEF.forEach(b => bands[b.code] = { ...b, items: [] });
  state.diffElements.filter(e => e.current.status === 'defect' && e.current.worksRequired === 'Y').forEach(e => {
    const band = bands[e.current.priority] || bands.L;
    band.items.push(`${e.name}${e.current.cost ? ' — est. £' + Number(e.current.cost).toLocaleString() : ''}`);
  });
  return Object.values(bands);
}
