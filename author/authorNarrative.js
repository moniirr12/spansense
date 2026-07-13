// SMART NARRATIVE ENGINE — deterministic, grounded in the real GI codes
// rev 2 standard (Table 6 extent codes, Table 7 generic severity
// descriptions), not a generic AI rewrite. Every sentence traces back to
// a real field: severity, extent, comparison against the structure's own
// previous inspection.
const SEVERITY_WORDS = {
  '1': 'a defect with no significant effect on the element',
  '2': 'an early sign of deterioration, with minor damage and no reduction in functionality',
  '3': 'a moderate defect, with some loss of functionality expected',
  '4': 'a severe defect, with significant loss of functionality',
  '5': 'a critical defect - the element is non-functional or failed'
};
const EXTENT_WORDS = {
  'A': 'affecting no significant area',
  'B': 'affecting a slight area (up to 5%)',
  'C': 'affecting a moderate area (5-20%)',
  'D': 'affecting a wide area (20-50%)',
  'E': 'affecting an extensive area (over 50%)'
};
function fmtDate(d){
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}
function buildNarrative(elDiff, previousDate){
  const lname = elDiff.name.toLowerCase();
  const cur = elDiff.current, prev = elDiff.previous, cmp = elDiff.comparison;

  if (cur.status === 'na') return 'Not applicable to this structure.';

  if (cur.status === 'ninsp') {
    return `The ${lname} could not be inspected on this occasion` + (cur.comments ? `, due to ${cur.comments.replace(/\.$/, '')}.` : '.');
  }

  if (cur.status === 'good') {
    if (cmp === 'resolved') {
      return `The ${lname} was previously recorded with a defect` + (previousDate ? ` at the inspection on ${fmtDate(previousDate)}` : '') + `; no defects were observed on this occasion, indicating the issue has since been resolved.`;
    }
    if (cmp === 'changed' && prev && prev.status === 'ninsp') {
      return `The ${lname} could not be inspected on the previous visit; on this occasion it was inspected and found to be in good condition.`;
    }
    if (cmp === 'unchanged') {
      return `The ${lname} appeared to be in good condition, consistent with the previous inspection` + (previousDate ? ` on ${fmtDate(previousDate)}` : '') + `.`;
    }
    return `The ${lname} appeared to be in good condition.`;
  }

  // defect
  const sevText = SEVERITY_WORDS[cur.severity] || 'a defect';
  const extText = cur.extent ? `, ${EXTENT_WORDS[cur.extent] || ''}` : '';
  let text = `${sevText.charAt(0).toUpperCase() + sevText.slice(1)} was observed at the ${lname}${extText}`;
  if (cur.comments) text += ` (${cur.comments.replace(/\.$/, '')})`;
  text += '.';

  if (cmp === 'new') {
    text += ` This is a newly identified defect, not present at the previous inspection.`;
  } else if (cmp === 'first') {
    text += ` This is the first recorded inspection of this structure, so no historical comparison is available.`;
  } else if (prev && prev.status === 'defect') {
    if (cmp === 'worsened') {
      text += ` This has worsened since the previous inspection${previousDate ? ` on ${fmtDate(previousDate)}` : ''}, when it was recorded as severity ${prev.severity} (${SEVERITY_WORDS[prev.severity] || 'lower severity'}).`;
    } else if (cmp === 'improved') {
      text += ` This has improved since the previous inspection${previousDate ? ` on ${fmtDate(previousDate)}` : ''}, when it was recorded as severity ${prev.severity}.`;
    } else if (cmp === 'changed') {
      text += ` The extent has changed since the previous inspection${previousDate ? ` on ${fmtDate(previousDate)}` : ''} (previously extent ${prev.extent}).`;
    } else {
      text += ` This is unchanged since the previous inspection${previousDate ? ` on ${fmtDate(previousDate)}` : ''}.`;
    }
  }

  if (cur.worksRequired === 'Y') {
    text += ` Remedial works are recommended` + (cur.priority ? ` at ${cur.priority === 'H' ? 'high' : cur.priority === 'M' ? 'medium' : 'low'} priority` : '') + (cur.cost ? `, estimated at £${Number(cur.cost).toLocaleString()}` : '') + `.`;
  } else if (cur.worksRequired === 'M') {
    text += ` This should be monitored at the next inspection to check for further progression.`;
  }
  return text;
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
