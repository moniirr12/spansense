// API_BASE, formatDate, and imageUrlToDataURL are provided by test.js
// (loaded before this file) - same dependency reportFull.docx.js already
// has on pages that load it, and Author now also uses test.js directly for
// the full-report PDF export (generateSimplePDFReport). DEFECT_TYPE_LABEL
// and defectTypeLabel() are also provided by test.js.

// Real BCI formula, ported verbatim from inspection/bci.js (that file isn't
// loaded on this page) so severity/extent edits here recompute a genuine
// score instead of leaving the originally-loaded value static.
const STRUCTURE_TYPE_CONFIG = {
  "Bridge": {
    importanceMapping: {1:"Very High",2:"High",3:"Very High",4:"Very High",5:"High",6:"High",7:"High",8:"High",9:"High",10:"High",11:"Very High",12:"Very High",13:"High",14:"Medium",15:"Medium",16:"Medium",17:"Medium",18:"High",19:"Medium",20:"Medium",21:"Medium",22:"Medium",23:"High",24:"Medium",25:"Low",26:"Medium",27:"Medium",28:"Medium",29:"Medium",30:"Low",31:"Medium",32:"Medium",33:"Low",34:"Medium"},
    criticalElements: [1,2,3,4,11,12],
    bciAvIncludedElements: Array.from({length:34},(_,i)=>i+1)
  },
  "Retaining wall": {
    importanceMapping: {1:"High",2:"Very High",3:"Very High",4:"High",5:"Medium",6:"Medium",7:"Medium",8:"Medium",9:"High",10:"Low",11:"Low",12:"Low",13:"Low",14:"Low",15:"Low",16:"Medium",17:"Medium"},
    criticalElements: [1,2,3],
    bciAvIncludedElements: [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17]
  },
  "Sign Gantry": {
    importanceMapping: {1:"High",2:"Very High",3:"Very High",4:"Very High",5:"Medium",6:"Medium",7:"Low",8:"High",9:"High",10:"High",11:"Very High",12:"Very High",13:"Medium"},
    criticalElements: [2,3,4,11,12],
    bciAvIncludedElements: [1,2,3,4,5,6,7,8,9,10,11,12,13]
  }
};
function getStructureConfig(structureType){ return STRUCTURE_TYPE_CONFIG[structureType] || STRUCTURE_TYPE_CONFIG["Bridge"]; }
const BCI_ECS_MAPPING = {"1A":1.0,"2B":2.0,"2C":2.1,"2D":2.3,"2E":2.7,"3B":3.0,"3C":3.1,"3D":3.3,"3E":3.7,"4B":4.0,"4C":4.1,"4D":4.3,"4E":4.7,"5B":5.0,"5C":5.0,"5D":5.0,"5E":5.0};
function calculateECS(sPlusEx){ if (sPlusEx === "00") return 0; return BCI_ECS_MAPPING[sPlusEx] || 0.0; }
function calculateECF(importance, ecs){
  if (importance === "Very High") return 0;
  if (importance === "High") return 0.3 - ((ecs - 1) * (0.3 / 4));
  if (importance === "Medium") return 0.6 - ((ecs - 1) * (0.6 / 4));
  if (importance === "Low") return 1.2 - ((ecs - 1) * (1.2 / 4));
  return 0;
}
function calculateECI(ecs, ecf){ return ecs - ecf >= 1 ? ecs - ecf : 1; }
function calculateEIF(importance, severity){
  if (severity === 0) return 0;
  if (importance === "Very High") return 2;
  if (importance === "High") return 1.5;
  if (importance === "Medium") return 1.2;
  if (importance === "Low") return 1;
  return 0;
}
function calculateBCIAv(bcsValues, eifValues){
  const bcsSum = bcsValues.reduce((s,v)=>s+v,0), eifSum = eifValues.reduce((s,v)=>s+v,0);
  const bcsAvg = bcsSum / eifSum;
  return 100 - 2 * ((bcsAvg ** 2) + (6.5 * bcsAvg) - 7.5);
}
function calculateBCICrit(eciValues, structureType){
  const specificElements = getStructureConfig(structureType).criticalElements;
  const filtered = eciValues.filter(item => specificElements.includes(item.itemno)).map(item => item.eci);
  if (!filtered.length) return 100.00;
  const eciMax = Math.max(...filtered);
  return 100 - 2 * ((eciMax ** 2) + (6.5 * eciMax) - 7.5);
}
function calculateBCI(severityValues, extentValues, itemNumbers, structureType){
  const config = getStructureConfig(structureType);
  const eciValues = [], bciAvBcsValues = [], bciAvEifValues = [];
  itemNumbers.forEach((itemno, i) => {
    const severity = severityValues[i] || 0, extent = extentValues[i] || 0;
    const ecs = calculateECS(`${severity}${extent}`);
    const importance = config.importanceMapping[itemno] || "Medium";
    const ecf = calculateECF(importance, ecs);
    const eci = calculateECI(ecs, ecf);
    eciValues.push({ itemno, eci });
    const eif = calculateEIF(importance, severity);
    const bcs = eci * eif;
    if (config.bciAvIncludedElements.includes(itemno)) { bciAvBcsValues.push(bcs); bciAvEifValues.push(eif); }
  });
  return { bciAv: calculateBCIAv(bciAvBcsValues, bciAvEifValues), bciCrit: calculateBCICrit(eciValues, structureType) };
}
// Author's live equivalent of inspection.js's refreshBCIScores(): builds
// the same severity/extent/itemNumber arrays from the current in-memory
// draft (not the DOM), using each element's primary defect - 'good'
// (explicitly inspected, no defect) counts as severity 1/extent A (best
// score); 'ninsp' and 'na' are excluded entirely, same convention the real
// save flow uses for the reserved marker rows.
function recomputeLiveBCI(){
  const severityValues = [], extentValues = [], itemNumbers = [];
  AUTHOR.diffElements.forEach(el => {
    if (el.current.status === 'defect') {
      severityValues.push(parseInt(el.current.severity, 10) || 0);
      extentValues.push(el.current.extent || 'A');
      itemNumbers.push(el.elementNumber);
    } else if (el.current.status === 'good') {
      severityValues.push(1); extentValues.push('A'); itemNumbers.push(el.elementNumber);
    }
  });
  const { bciAv, bciCrit } = calculateBCI(severityValues, extentValues, itemNumbers, AUTHOR.structureType);
  AUTHOR.bciAvg = bciAv; AUTHOR.bciCrit = bciCrit;
  animateBciValue(document.getElementById('leftBciAvg'), bciAv);
  animateBciValue(document.getElementById('leftBciCrit'), bciCrit);
}

// ============================================================
// MULTI-DEFECT SUPPORT — an element can carry more than one defect (the
// real data model already allows this; only one is "primary" and counts
// toward BCI, matching how the main inspection editor treats it). Extra
// defects are addressed by a stable "key" string (plain element number for
// the primary, "<elementNumber>-x<index>" for an extra) so every handler
// can be written once and work for both without a parallel set of markup.
// ============================================================
function defectKey(elementNumber, extraIdx){
  return extraIdx == null ? String(elementNumber) : `${elementNumber}-x${extraIdx}`;
}
function findDefectRef(key){
  const m = /^(\d+)(?:-x(\d+))?$/.exec(String(key));
  if (!m) return null;
  const el = AUTHOR.diffElements.find(x => String(x.elementNumber) === m[1]);
  if (!el) return null;
  if (m[2] != null) {
    const idx = parseInt(m[2], 10);
    return { el, defect: el.extraDefects[idx], extraIdx: idx };
  }
  return { el, defect: el.current, extraIdx: null };
}
function newDefectObject(){
  const firstType = Object.keys(DEFECT_TYPE_MAP)[0];
  return {
    status: 'defect', defectDbId: null,
    defectType: firstType, defectNumber: Object.keys(DEFECT_TYPE_LABEL[Number(firstType)] || {})[0] || null,
    severity: '1', extent: 'A', worksRequired: 'N', priority: null, cost: null,
    comments: '', remedialWorks: '',
    photos: [], heroIndex: 0, reviewed: false, collapsed: false, editedNarrative: null
  };
}

const INSPECTION_TYPE_LABELS = { GI: 'General Inspection (GI)', PI: 'Principal Inspection (PI)', SI: 'Special Inspection (SI)' };

// Defect type category names - same table as inspection/spans.js's
// DEFECT_TYPE_MAP, duplicated here per this codebase's established
// per-file convention (spans.js isn't loaded on this page).
const DEFECT_TYPE_MAP = {
  1: "Metalwork", 2: "RC & prestressed concrete", 3: "Masonry, brickwork & MC",
  4: "Paintwork & coatings", 5: "Vegetation", 6: "Foundation",
  7: "Invert, apron & riverbed", 8: "Drainage", 9: "Surfacing",
  10: "Expansion joints", 11: "Embankments", 12: "Bearings",
  13: "Impact damage", 14: "Waterproofing", 15: "Stone slab bridges", 16: "Timber"
};
// Searchable dropdown for defect type/number, same pattern as twinview's
// bridge selector (.selector-dropdown/.dropdown-menu/.dd-search/.dd-list) -
// replaces a plain <select> so long defect-type lists are easy to scan/find.
function classDropdownHTML(field, key, current, label, options){
  const selectedOpt = options.find(o => String(o.val) === String(current));
  return `<div class="class-dd" data-dd="${field}" data-el="${key}">
    <button type="button" class="class-dd-trigger" data-dd-trigger>
      <span class="cdd-val">${selectedOpt ? selectedOpt.val + ' · ' + selectedOpt.label : label}</span>
      <i class="fas fa-chevron-down"></i>
    </button>
    <div class="class-dd-menu">
      <div class="class-dd-search"><i class="fas fa-magnifying-glass"></i><input type="text" placeholder="Search…" data-dd-search></div>
      <div class="class-dd-list">
        ${options.map(o => `<div class="class-dd-item ${String(o.val)===String(current)?'selected':''}" data-dd-item data-val="${o.val}" data-search="${(o.val + ' ' + o.label).toLowerCase()}">
          <span class="cdd-num">${o.val}</span><span class="cdd-name">${o.label}</span><i class="fas fa-check cdd-check"></i>
        </div>`).join('')}
      </div>
    </div>
  </div>`;
}
function defectTypeDropdownHTML(el, extraIdx){
  const defect = extraIdx != null ? el.extraDefects[extraIdx] : el.current;
  const options = Object.keys(DEFECT_TYPE_MAP).map(t => ({ val: t, label: DEFECT_TYPE_MAP[t] }));
  return classDropdownHTML('defectType', defectKey(el.elementNumber, extraIdx), defect.defectType, 'Select type…', options);
}
function defectNumberDropdownHTML(el, extraIdx){
  const defect = extraIdx != null ? el.extraDefects[extraIdx] : el.current;
  const nums = DEFECT_TYPE_LABEL[Number(defect.defectType)] || {};
  const options = Object.keys(nums).map(n => ({ val: n, label: nums[n] }));
  return classDropdownHTML('defectNumber', defectKey(el.elementNumber, extraIdx), defect.defectNumber, 'Select…', options);
}

// ============================================================
// NIGHT MODE TOGGLE (same convention as the rest of spanSense)
// ============================================================
(function(){
  const savedNightMode = localStorage.getItem('nightMode');
  const systemPrefersLight = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches;
  document.documentElement.classList.remove('nm-preload');
  if(savedNightMode === 'on' || (savedNightMode === null && !systemPrefersLight)){
    document.body.classList.add('night-mode');
  }
  const toggleBtn = document.getElementById('nightToggle');
  if(toggleBtn){
    toggleBtn.innerHTML = document.body.classList.contains('night-mode') ? '<i class="fas fa-sun"></i>' : '<i class="fas fa-moon"></i>';
    toggleBtn.onclick = function(){
      document.body.classList.toggle('night-mode');
      if(document.body.classList.contains('night-mode')){
        this.innerHTML = '<i class="fas fa-sun"></i>';
        localStorage.setItem('nightMode', 'on');
      } else {
        this.innerHTML = '<i class="fas fa-moon"></i>';
        localStorage.setItem('nightMode', 'off');
      }
    };
  }
})();

// ============================================================
// GLASS SCROLLBAR (same convention as the rest of spanSense)
// ============================================================
(function(){
    const sb=document.getElementById('glassScrollbar'), th=document.getElementById('glassThumb');
    if(!sb||!th)return;
    let drag=false, sy=0, sty=0;
    function m(){const st=window.scrollY||0,th=document.documentElement.scrollHeight,vh=window.innerHeight,dh=Math.max(1,th-vh),tr=sb.offsetHeight||1,r=vh/Math.max(1,th),h=Math.max(40,r*tr),mx=Math.max(0,tr-h);return{st,p:st/dh,tr,h,mx,dh}}
    function u(){const x=m();th.style.setProperty('height',x.h+'px','important');th.style.setProperty('top',(x.p*x.mx)+'px','important')}
    window.addEventListener('scroll',u,{passive:true});window.addEventListener('resize',u);
    th.addEventListener('mousedown',e=>{drag=true;sy=e.clientY;sty=m().p*m().mx;e.preventDefault()});
    sb.addEventListener('mousedown',e=>{if(e.target===th||th.contains(e.target))return;const r=sb.getBoundingClientRect(),y=e.clientY-r.top,x=m();window.scrollTo({top:Math.max(0,Math.min(1,y/x.tr))*x.dh,behavior:'smooth'})});
    window.addEventListener('mousemove',e=>{if(!drag)return;const x=m(),ny=sty+(e.clientY-sy),c=Math.max(0,Math.min(x.mx,ny));window.scrollTo(0,(c/Math.max(1,x.mx))*x.dh)});
    window.addEventListener('mouseup',()=>drag=false);
    new MutationObserver(()=>{clearTimeout(window._t);window._t=setTimeout(u,50)}).observe(document.body,{childList:true,subtree:true});
    u();[50,100,250,500,1000,2000].forEach(d=>setTimeout(u,d));
})();

// ============================================================
// APP STATE
// ============================================================
const AUTHOR = {
  structures: [],
  structureId: null, structureName: null, structureType: null, organizationId: null,
  inspectionDate: null, inspectionType: null, previousDate: null, inspectorName: null,
  diffElements: [], // [{ elementNumber, name, category, current, previous, comparison, editedNarrative? }]
  branding: { accentColor: '#5b8c8a', template: 'modern', logoUrl: null },
  maxStepReached: 0
};

// ============================================================
// SCREEN NAVIGATION
// ============================================================
const WIZARD_ORDER = ['setup','draft','author','export'];
function goTo(step){
  const idx = WIZARD_ORDER.indexOf(step);
  AUTHOR.maxStepReached = Math.max(AUTHOR.maxStepReached, idx);
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('screen-' + step).classList.add('active');
  document.querySelectorAll('.wizard-step').forEach(el => {
    const i = WIZARD_ORDER.indexOf(el.dataset.step);
    el.classList.remove('active','done');
    if(i < idx) el.classList.add('done');
    else if(i === idx) el.classList.add('active');
    el.classList.toggle('clickable', i <= AUTHOR.maxStepReached && i !== idx);
  });
  document.querySelectorAll('.wizard-connector').forEach((el, i) => {
    el.classList.toggle('filled', i < idx);
  });
  if(step === 'draft') renderDraft();
  else closeStructInfoModal();
  if(step === 'author') { renderDataPane(); renderReportPane(); }
  if(step === 'export') renderExport();
}
document.getElementById('wizardSteps').addEventListener('click', function(e){
  const stepEl = e.target.closest('.wizard-step');
  if(!stepEl) return;
  const idx = WIZARD_ORDER.indexOf(stepEl.dataset.step);
  if(idx <= AUTHOR.maxStepReached) goTo(stepEl.dataset.step);
});

// ============================================================
// SCREEN 1 — SETUP: real structure/inspection picker
// ============================================================
document.getElementById('sourceTabs').addEventListener('click', function(e){
  const tab = e.target.closest('.source-tab');
  if(!tab) return;
  document.querySelectorAll('.source-tab').forEach(t => t.classList.remove('active'));
  tab.classList.add('active');
  const isUpload = tab.dataset.source === 'upload';
  document.getElementById('sourceRecords').style.display = isUpload ? 'none' : 'block';
  document.getElementById('sourceUpload').style.display = isUpload ? 'block' : 'none';
});

async function loadStructures(){
  const sel = document.getElementById('structureSelect');
  try {
    const res = await fetch(`${API_BASE}/api/bridges`);
    if (res.status === 401) {
      sel.innerHTML = '<option value="">Not logged in</option>';
      document.getElementById('loadedSummary').innerHTML =
        `<div class="no-history-note"><i class="fas fa-triangle-exclamation"></i> You need to be logged in to use Author. <a href="../index.html">Go to login</a></div>`;
      return;
    }
    if (!res.ok) throw new Error('Server returned ' + res.status);
    const bridges = await res.json();
    AUTHOR.structures = bridges;
    sel.innerHTML = '<option value="">Select a structure…</option>' +
      bridges.map(b => `<option value="${b.id}">${b.name} (#${b.id})</option>`).join('');
  } catch (err) {
    sel.innerHTML = '<option value="">Failed to load structures</option>';
    console.error('Error loading structures:', err);
  }
}
async function onStructureChange(){
  const structureId = document.getElementById('structureSelect').value;
  const inspSel = document.getElementById('inspectionSelect');
  const loadBtn = document.getElementById('loadBtn');
  inspSel.disabled = true; loadBtn.disabled = true;
  if (!structureId) { inspSel.innerHTML = '<option value="">Select a structure first</option>'; return; }
  inspSel.innerHTML = '<option value="">Loading inspections…</option>';
  try {
    const res = await fetch(`${API_BASE}/api/inspection-dates/${structureId}`);
    const dates = await res.json();
    if (!dates.length) {
      inspSel.innerHTML = '<option value="">No inspections recorded for this structure</option>';
      return;
    }
    // d.date is already a plain 'YYYY-MM-DD' string from the server - using
    // it as-is (rather than round-tripping through `new Date(...).toISOString()`)
    // avoids a timezone-shift-by-a-day bug when the server's local timezone
    // isn't UTC. dates is newest-first, so the first entry is the most
    // recent inspection - pre-selected by default since that's almost
    // always the one being authored, while still letting the user pick an
    // older one if they want.
    inspSel.innerHTML = dates.map(d => `<option value="${d.date}">${fmtDate(d.date)} — ${d.type}</option>`).join('');
    inspSel.value = dates[0].date;
    inspSel.disabled = false;
    loadBtn.disabled = false;
  } catch (err) {
    inspSel.innerHTML = '<option value="">Failed to load inspections</option>';
    console.error('Error loading inspection dates:', err);
  }
}

// Same count-up tween as the main inspection editor's setBciValue
// (inspection/bci.js) - ease-out cubic over 450ms.
const bciTweenFrames = new WeakMap();
function animateBciValue(el, value){
  if (!el) return;
  if (value == null) { el.textContent = '—'; el.classList.remove('loading'); return; }
  const target = parseFloat(value);
  const current = parseFloat(el.textContent);
  el.classList.remove('loading');
  if (isNaN(current)) { el.textContent = target.toFixed(1); return; }
  const pending = bciTweenFrames.get(el);
  if (pending) cancelAnimationFrame(pending);
  const duration = 450;
  const start = performance.now();
  function step(now){
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - t, 3);
    el.textContent = (current + (target - current) * eased).toFixed(1);
    if (t < 1) bciTweenFrames.set(el, requestAnimationFrame(step));
    else bciTweenFrames.delete(el);
  }
  bciTweenFrames.set(el, requestAnimationFrame(step));
}

// BCI trend strip - twin.inspections is already sorted oldest-to-newest by
// /api/twin/:structureId, with a null bciAvg for inspections that predate BCI
// scoring or never had one recorded.
const BCI_TREND_MAX_CHIPS = 4;
function bciTrendHTML(trend){
  const scored = trend.filter(t => t.bciAvg != null);
  if (!scored.length) return '';
  const shown = scored.slice(-BCI_TREND_MAX_CHIPS);
  const startIdx = scored.length - shown.length;
  const chips = shown.map((t, i) => {
    const isLast = i === shown.length - 1;
    const prev = i > 0 ? shown[i-1] : (startIdx > 0 ? scored[startIdx - 1] : null);
    let delta = '';
    if (prev) {
      const d = Math.round((t.bciAvg - prev.bciAvg) * 10) / 10;
      const dir = d > 0 ? 'up' : d < 0 ? 'down' : 'flat';
      delta = `<div class="bci-delta ${dir}"><i class="fas fa-arrow-${dir === 'flat' ? 'right' : dir}"></i>${d > 0 ? '+' : ''}${d}</div>`;
    }
    const critHtml = t.bciCrit != null ? `<div class="bc-score-row crit"><span>Crit</span><b>${t.bciCrit.toFixed(1)}</b></div>` : '';
    return delta + `<div class="bci-chip${isLast ? ' current' : ''}">
      <div class="bc-date">${t.date} <span class="bc-type">${t.type}</span></div>
      <div class="bc-score-row avg"><span>Avg</span><b>${t.bciAvg.toFixed(1)}</b></div>
      ${critHtml}
    </div>`;
  }).join('');
  const label = scored.length > shown.length
    ? `BCI trend — last ${shown.length} of ${scored.length} inspections`
    : `BCI trend across ${scored.length} inspection${scored.length===1?'':'s'}`;
  return `<div class="bci-trend"><div class="bci-trend-label">${label}</div><div class="bci-track">${chips}</div></div>`;
}

async function onLoad(){
  const structureId = document.getElementById('structureSelect').value;
  const date = document.getElementById('inspectionSelect').value;
  if (!structureId || !date) return;

  const loadBtn = document.getElementById('loadBtn');
  loadBtn.disabled = true;
  loadBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Loading…';
  try {
    const [diffRes, bridgeRes, twinRes, fullRes] = await Promise.all([
      fetch(`${API_BASE}/api/author/diff?structureId=${structureId}&date=${date}`),
      fetch(`${API_BASE}/api/bridges/${structureId}`),
      fetch(`${API_BASE}/api/twin/${structureId}`),
      fetch(`${API_BASE}/api/inspection/full?structure_id=${structureId}&date=${date}`)
    ]);
    if (!diffRes.ok) throw new Error((await diffRes.json()).error || 'Failed to load inspection data');
    const diff = await diffRes.json();
    const bridge = await bridgeRes.json();
    const twin = twinRes.ok ? await twinRes.json() : { inspections: [] };
    const full = fullRes.ok ? await fullRes.json() : { defects: [] };

    // generateBCIFormForPDF (in test.js) reads these from sessionStorage
    // rather than accepting them as arguments - set here so the full-report
    // PDF export's Appendix B (BCI Proforma) can find them.
    sessionStorage.setItem('structureId', structureId);
    sessionStorage.setItem('structureName', bridge.name);

    AUTHOR.structureId = structureId;
    AUTHOR.structureName = bridge.name;
    AUTHOR.structureType = diff.structureType;
    AUTHOR.organizationId = diff.organizationId;
    AUTHOR.inspectionDate = diff.currentDate;
    AUTHOR.previousDate = diff.previousDate;
    AUTHOR.structureDescription = bridge.description || null;
    AUTHOR.inspectorName = full.inspectorName || null;
    AUTHOR.bciTrend = twin.inspections || [];
    AUTHOR.bciAvg = full.overallBciave != null ? parseFloat(full.overallBciave) : null;
    AUTHOR.bciCrit = full.overallBcicrit != null ? parseFloat(full.overallBcicrit) : null;
    AUTHOR.diffElements = diff.elements.map(e => {
      e.current.reviewed = false; e.current.collapsed = false; e.current.editedNarrative = null; e.current.heroIndex = 0;
      return { ...e, category: categoryFor(diff.structureType, e.elementNumber), extraDefects: [], hadBaseDefect: e.current.status === 'defect' };
    });
    draftFilter = 'all';

    // Real defect photos. el.photos is the read-only aggregate used by the
    // report/docx preview (every photo across all of the element's defect
    // rows); el.current.photos is the draft screen's editable set, matched
    // to the one real defect row driving el.current via defectDbId so it
    // doesn't get mixed up with other defect rows on the same element.
    const photosByElement = {}, photosByDefectId = {};
    (full.defects || []).forEach(d => {
      photosByDefectId[d.defectDbId] = d.photos || [];
      if (!d.photos || !d.photos.length) return;
      if (!photosByElement[d.elementNumber]) photosByElement[d.elementNumber] = [];
      photosByElement[d.elementNumber].push(...d.photos);
    });
    AUTHOR.photosByElement = photosByElement;
    AUTHOR.diffElements.forEach(el => {
      el.photos = photosByElement[el.elementNumber] || [];
      if (el.current.status === 'defect' && el.current.defectDbId != null) {
        el.current.photos = photosByDefectId[el.current.defectDbId] || [];
      }
    });

    const summary = document.getElementById('loadedSummary');
    summary.innerHTML = `<div class="loaded-summary"><i class="fas fa-circle-check"></i><div>
        Loaded <b>${bridge.name}</b> — inspection dated ${fmtDate(diff.currentDate)}.
        ${diff.previousDate
          ? `<span class="prev-note">Comparing against the previous inspection on ${fmtDate(diff.previousDate)}.</span>`
          : `<span class="prev-note">No previous inspection found — this is the first recorded inspection for this structure.</span>`}
      </div></div>
      ${AUTHOR.structureDescription ? `<div class="struct-desc"><b>Structure description</b>${AUTHOR.structureDescription}</div>` : ''}
      ${bciTrendHTML(AUTHOR.bciTrend)}`;

    document.getElementById('leftBciCards').style.display = 'flex';
    recomputeLiveBCI();

    const newInspRow = document.getElementById('newInspRow');
    newInspRow.style.display = 'block';
    const dateInput = document.getElementById('newInspectionDate');
    if (!dateInput.value) dateInput.value = new Date().toISOString().slice(0,10);
    AUTHOR.newInspectionDate = dateInput.value;
    AUTHOR.newInspectionType = document.getElementById('newInspectionType').value || null;

    document.getElementById('brandingCard').style.display = 'block';
    await loadBranding(diff.organizationId);
    document.getElementById('brandingCard').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  } catch (err) {
    document.getElementById('loadedSummary').innerHTML =
      `<div class="no-history-note"><i class="fas fa-triangle-exclamation"></i> ${err.message}</div>`;
    console.error('Error loading inspection:', err);
  } finally {
    loadBtn.disabled = false;
    loadBtn.innerHTML = '<i class="fas fa-arrow-right"></i> Load';
  }
}
document.getElementById('structureSelect').addEventListener('change', onStructureChange);
document.getElementById('loadBtn').addEventListener('click', onLoad);
document.getElementById('newInspectionDate').addEventListener('change', function(){ AUTHOR.newInspectionDate = this.value; });
document.getElementById('newInspectionType').addEventListener('change', function(){ AUTHOR.newInspectionType = this.value || null; });
loadStructures();

// ---- Branding & Template picker (real, persisted per organization) ----
async function loadBranding(organizationId){
  try {
    const res = await fetch(`${API_BASE}/api/author/branding/${organizationId}`);
    const b = await res.json();
    AUTHOR.branding = { accentColor: b.accentColor, template: b.template, logoUrl: b.logoUrl };
    document.querySelectorAll('.swatch').forEach(s => s.classList.toggle('selected', s.dataset.color.toLowerCase() === b.accentColor.toLowerCase()));
    document.querySelectorAll('.template-card').forEach(c => c.classList.toggle('selected', c.dataset.template === b.template));
    const logoContent = document.getElementById('logoZoneContent');
    if (b.logoUrl) {
      logoContent.innerHTML = `<img class="logo-preview" src="${b.logoUrl}" alt="Client logo">`;
    } else {
      logoContent.innerHTML = `<i class="fas fa-image"></i><div class="u-title" style="font-size:.85rem;">Upload logo</div><div class="u-sub">PNG, SVG or JPG</div>`;
    }
    document.getElementById('savedBannerOrg').textContent = `structure organization #${organizationId}`;
  } catch (err) {
    console.error('Error loading branding:', err);
  }
}
async function saveBranding(){
  if (!AUTHOR.organizationId) return;
  const note = document.getElementById('savingNote');
  note.textContent = 'Saving…'; note.classList.remove('show-saved');
  try {
    await fetch(`${API_BASE}/api/author/branding/${AUTHOR.organizationId}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accentColor: AUTHOR.branding.accentColor, template: AUTHOR.branding.template })
    });
    note.textContent = 'Saved'; note.classList.add('show-saved');
    setTimeout(() => { note.textContent = ''; }, 2000);
  } catch (err) {
    note.textContent = 'Failed to save — will retry on next change.';
    console.error('Error saving branding:', err);
  }
}
document.getElementById('logoZone').addEventListener('click', () => document.getElementById('logoInput').click());
document.getElementById('logoInput').addEventListener('change', async function(e){
  const f = e.target.files[0];
  if (!f || !AUTHOR.organizationId) return;
  const note = document.getElementById('savingNote');
  note.textContent = 'Uploading logo…'; note.classList.remove('show-saved');
  try {
    const formData = new FormData();
    formData.append('logo', f);
    const res = await fetch(`${API_BASE}/api/author/branding/${AUTHOR.organizationId}/logo`, { method: 'POST', body: formData });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'Upload failed');
    AUTHOR.branding.logoUrl = result.logoUrl;
    document.getElementById('logoZoneContent').innerHTML = `<img class="logo-preview" src="${result.logoUrl}" alt="Client logo">`;
    note.textContent = 'Saved'; note.classList.add('show-saved');
    setTimeout(() => { note.textContent = ''; }, 2000);
  } catch (err) {
    note.textContent = 'Logo upload failed: ' + err.message;
    console.error('Error uploading logo:', err);
  }
});
document.getElementById('swatchRow').addEventListener('click', function(e){
  const sw = e.target.closest('.swatch');
  if(!sw) return;
  document.querySelectorAll('.swatch').forEach(s => s.classList.remove('selected'));
  sw.classList.add('selected');
  AUTHOR.branding.accentColor = sw.dataset.color;
  saveBranding();
});
document.getElementById('templateGallery').addEventListener('click', function(e){
  const card = e.target.closest('.template-card');
  if(!card) return;
  document.querySelectorAll('.template-card').forEach(c => c.classList.remove('selected'));
  card.classList.add('selected');
  AUTHOR.branding.template = card.dataset.template;
  saveBranding();
});
document.getElementById('toDraftBtn').addEventListener('click', () => goTo('draft'));

// ============================================================
// SCREEN 2 — DRAFT REPORT (real data + smart-template narrative)
// ============================================================
function statusInfo(status){
  return { defect:['defect','Defect'], good:['good','Good condition'], na:['na','Not applicable'], ninsp:['ninsp','Not inspected'] }[status];
}
function cmpLabel(cmp){
  return { new:'New', worsened:'Worsened', improved:'Improved', resolved:'Resolved', unchanged:'Unchanged', changed:'Changed', first:'First record' }[cmp] || '';
}
// narrativeFor/photoSectionHTML work for either the primary defect (extraIdx
// omitted) or an extra one on the same element (extraIdx given) - extras
// have no history of their own (they didn't exist in the base inspection by
// definition), so they always narrate as a first-time finding.
function narrativeFor(el, extraIdx){
  if (extraIdx != null) {
    const defect = el.extraDefects[extraIdx];
    if (defect.editedNarrative != null) return defect.editedNarrative;
    return buildNarrative({ name: el.name, current: defect, previous: null, comparison: 'new' }, AUTHOR.inspectionDate);
  }
  return el.editedNarrative != null ? el.editedNarrative : buildNarrative(el, AUTHOR.previousDate);
}
function elPhotosHTML(photos, containerCls){
  if (!photos || !photos.length) return '';
  const thumbCls = containerCls === 'doc-photos' ? 'doc-photo-thumb' : 'el-photo-thumb';
  return `<div class="${containerCls}">${photos.map(p =>
    `<img class="${thumbCls}" src="${p.url}" alt="${(p.description||'Site photo').replace(/"/g,'')}" title="${(p.description||'').replace(/"/g,'')}" onclick="window.open('${p.url}','_blank')">`
  ).join('')}</div>`;
}

// Draft screen's own photo section - unlike elPhotosHTML (read-only, used
// in the report preview), this one supports uploading new photos (with a
// caption) and deleting/re-captioning existing ones, wired to the app's
// real photo endpoints - these persist to the actual inspection record,
// unlike the narrative/severity/extent edits which are draft-only. A
// newly-added defect has no real defectDbId yet (nothing to link photos to
// until it's actually saved), so it gets a placeholder with no upload option.
function photoSectionHTML(el, extraIdx){
  const defect = extraIdx != null ? el.extraDefects[extraIdx] : el.current;
  const key = defectKey(el.elementNumber, extraIdx);
  const photos = defect.photos || [];
  if (defect.heroIndex == null) defect.heroIndex = 0;
  const heroIdx = Math.min(defect.heroIndex, Math.max(0, photos.length - 1));
  const hero = photos[heroIdx];
  const canUpload = !!defect.defectDbId;

  const heroHtml = hero
    ? `<div class="dc-hero">
        <img src="${hero.url}" onclick="window.open('${hero.url}','_blank')">
        ${hero.id ? `<button class="dc-hero-del" data-delete-photo="${hero.id}" data-el="${key}" title="Delete photo"><i class="fas fa-xmark"></i></button>` : ''}
      </div>
      ${hero.id ? `<input class="dc-photo-caption" data-caption-photo="${hero.id}" data-el="${key}" value="${(hero.description||'').replace(/"/g,'&quot;')}" placeholder="Add a caption…">` : ''}`
    : `<div class="dc-photo-placeholder" ${canUpload ? `data-add-photo="${key}"` : ''}><i class="fas fa-camera"></i></div>`;

  const stripThumbs = photos.map((p, i) => `<img class="dc-strip-thumb ${i===heroIdx?'active':''}" data-strip-thumb="${key}" data-idx="${i}" src="${p.url}">`).join('');
  const addTileInStrip = canUpload ? `<div class="dc-strip-add" data-add-photo="${key}" title="Add photos"><i class="fas fa-plus"></i></div>` : '';
  const stripHtml = (photos.length > 1 || (photos.length && canUpload)) ? `<div class="dc-strip">${stripThumbs}${addTileInStrip}</div>` : '';
  const inputAndPending = canUpload
    ? `<input type="file" data-photo-input="${key}" accept="image/*" multiple hidden>
       <div class="dc-photo-pending" data-photo-pending="${key}" style="display:none;"></div>`
    : '';

  return `<div class="dc-photos" data-photos-for="${key}">${heroHtml}${stripHtml}${inputAndPending}</div>`;
}
function pendingPhotoRowHTML(file, idx){
  const url = URL.createObjectURL(file);
  return `<div class="dc-pending-item" data-pending-idx="${idx}">
    <img src="${url}">
    <input type="text" data-pending-caption="${idx}" placeholder="Caption for this photo…">
  </div>`;
}
async function uploadPendingPhotos(key, defect, files){
  const container = document.querySelector(`[data-photo-pending="${key}"]`);
  const captions = files.map((f, i) => {
    const input = container.querySelector(`[data-pending-caption="${i}"]`);
    return input ? input.value : '';
  });
  container.innerHTML = `<div style="font-size:.76rem; color:var(--text-mute2);"><i class="fas fa-spinner fa-spin"></i> Uploading…</div>`;
  try {
    const formData = new FormData();
    files.forEach(f => formData.append('photos', f));
    captions.forEach(c => formData.append('descriptions', c));
    formData.append('defectId', String(defect.defectDbId));
    formData.append('inspectionDate', AUTHOR.inspectionDate);
    const res = await fetch(`${API_BASE}/api/bridges/${AUTHOR.structureId}/inspection-photos`, { method: 'POST', body: formData });
    const result = await res.json();
    if (!res.ok || !result.success) throw new Error(result.error || 'Upload failed');
    result.photos.forEach(p => {
      defect.photos.push({ id: p.id, url: p.url, description: p.photo_description, displayOrder: p.display_order });
    });
    defect.heroIndex = defect.photos.length - 1;
    renderDraft();
  } catch (err) {
    console.error('Photo upload failed:', err);
    container.innerHTML = `<div style="font-size:.76rem; color:var(--red);">Upload failed: ${err.message}</div>`;
  }
}

let draftFilter = 'all';
let draftOnlyDefects = false;
let draftAllCollapsed = false;
// All defects across every element, each paired with its comparison value
// (the primary's is el.comparison; an extra's is always 'new' by
// definition - see defectCardHTML) - used for both the pill counts and the
// actual filtering, so the two can never disagree.
function allDraftDefects(){
  const out = [];
  AUTHOR.diffElements.forEach(el => {
    if (el.current.status === 'defect') out.push({ defect: el.current, comparison: el.comparison });
    (el.extraDefects || []).forEach(extra => out.push({ defect: extra, comparison: 'new' }));
  });
  return out;
}
function draftFilterPillsHTML(){
  const defects = allDraftDefects();
  const flagged = defects.filter(d => d.comparison === 'new' || d.comparison === 'worsened' || d.comparison === 'first');
  const reviewed = defects.filter(d => d.defect.reviewed);
  const pills = [
    { key:'all', label:`All defects (${defects.length})` },
    { key:'flagged', label:`New or worsened (${flagged.length})` },
    { key:'unreviewed', label:`Needs review (${defects.length - reviewed.length})` },
    { key:'reviewed', label:`Reviewed (${reviewed.length})` }
  ];
  const filterHtml = pills.map(p => `<button class="f-pill" data-filter="${p.key}" data-active="${draftFilter===p.key}">${p.label}</button>`).join('');
  const onlyDefectsHtml = `<button class="f-pill" data-only-defects="1" data-active="${draftOnlyDefects}"><i class="fas fa-filter"></i> Only defects</button>`;
  return filterHtml + onlyDefectsHtml;
}
function passesDraftFilter(defect, comparison){
  if (draftFilter === 'flagged') return comparison === 'new' || comparison === 'worsened' || comparison === 'first';
  if (draftFilter === 'unreviewed') return !defect.reviewed;
  if (draftFilter === 'reviewed') return !!defect.reviewed;
  return true;
}

function renderDraft(){
  document.getElementById('draftStructureName').textContent = AUTHOR.structureName || '—';
  document.getElementById('draftBciTrend').innerHTML = bciTrendHTML(AUTHOR.bciTrend);
  document.getElementById('draftFilterPills').innerHTML = draftFilterPillsHTML();
  document.querySelectorAll('#draftFilterPills .f-pill').forEach(b => b.classList.toggle('on', b.dataset.active === 'true'));
  const order = categoryOrderFor(AUTHOR.structureType);
  const wrap = document.getElementById('draftGroups');
  wrap.innerHTML = order.map(cat => {
    const els = AUTHOR.diffElements.filter(e => e.category === cat);
    if (!els.length) return '';
    // Walk elements in their real numeric order, batching consecutive
    // clear (no-defect) elements into one compact table and flushing it
    // whenever a defect card needs to appear at its correct position -
    // same pending/flush pattern the exported report itself uses, so a
    // defect never gets shunted to the end of the category out of order.
    let body = '';
    let pending = [];
    let anyVisible = false;
    const flush = () => { if (pending.length) { body += pending.map(clearRowHTML).join(''); pending = []; } };
    els.forEach(el => {
      if (el.current.status !== 'defect') {
        if (!draftOnlyDefects) { pending.push(el); anyVisible = true; }
        return;
      }
      if (passesDraftFilter(el.current, el.comparison)) {
        flush();
        body += defectCardHTML(el);
        anyVisible = true;
      }
      (el.extraDefects || []).forEach((extra, i) => {
        if (!passesDraftFilter(extra, 'new')) return;
        flush();
        body += defectCardHTML(el, i);
        anyVisible = true;
      });
    });
    flush();
    if (!anyVisible) return '';
    return `<div class="cat-group">
      <div class="cat-title">${cat}</div>
      ${body}
    </div>`;
  }).join('');
  const allDefects = AUTHOR.diffElements.flatMap(e => (e.current.status === 'defect' ? [e.current] : []).concat(e.extraDefects || []));
  const totalDefects = allDefects.length;
  const reviewedDefects = allDefects.filter(d => d.reviewed).length;
  document.getElementById('draftProgressText').textContent = totalDefects
    ? `${reviewedDefects} of ${totalDefects} defects reviewed`
    : 'No defects recorded for this inspection';
  document.getElementById('markUnchangedBtn').disabled = !AUTHOR.diffElements.some(e => e.current.status === 'defect' && e.comparison === 'unchanged' && !e.current.reviewed);
  attachDraftEditors();
}
function clearRowHTML(el){
  const [cls, label] = statusInfo(el.current.status);
  return `<div class="clear-row">
    <span class="cr-name"><b class="cr-num">${el.elementNumber}</b> ${el.name}</span>
    <span style="display:flex; align-items:center; gap:10px;">
      <span class="status-pill ${cls}" style="margin:0;">${label}</span>
      <button class="btn-mini" data-add-defect="${el.elementNumber}" style="padding:4px 11px; font-size:.68rem;"><i class="fas fa-plus"></i> Add defect</button>
    </span>
  </div>`;
}
function trendBadgeHTML(comparison){
  if (!comparison) return '';
  const label = { new:'New finding', worsened:'Worsened since last visit', improved:'Improved since last visit', resolved:'Resolved', unchanged:'Stable', changed:'Changed', first:'First record' }[comparison] || cmpLabel(comparison);
  return `<span class="trend-badge ${comparison}">${label}</span>`;
}
function workDetailsHTML(el, extraIdx){
  const defect = extraIdx != null ? el.extraDefects[extraIdx] : el.current;
  const key = defectKey(el.elementNumber, extraIdx);
  const show = defect.worksRequired === 'Y';
  return `<div class="dc-works-detail${show?' show':''}" data-works-detail="${key}">
    <div class="dc-works-field">
      <span class="mini-lbl">Priority</span>
      <select data-field="priority" data-el="${key}">
        <option value="L" ${defect.priority==='L'?'selected':''}>Low</option>
        <option value="M" ${defect.priority==='M'?'selected':''}>Medium</option>
        <option value="H" ${defect.priority==='H'?'selected':''}>High</option>
      </select>
    </div>
    <div class="dc-works-field">
      <span class="mini-lbl">Est. cost (£)</span>
      <input type="number" min="0" data-field="cost" data-el="${key}" value="${defect.cost != null ? defect.cost : ''}" placeholder="Enter amount">
    </div>
  </div>`;
}
// Renders one card - the primary defect (extraIdx omitted) or an extra one
// added on top of the same element (extraIdx given). Both share the same
// markup/behaviour; only the header actions differ (primary gets "add
// another defect", extras get "remove this defect", and primary can only
// be removed if the base inspection didn't actually have a defect there -
// deleting a real historical finding from the draft would misrepresent it).
function defectCardHTML(el, extraIdx){
  const defect = extraIdx != null ? el.extraDefects[extraIdx] : el.current;
  const key = defectKey(el.elementNumber, extraIdx);
  const isExtra = extraIdx != null;
  const comparison = isExtra ? 'new' : el.comparison;

  const historyBits = [];
  if (isExtra) {
    historyBits.push('Added on top of this element\'s existing record');
  } else if (el.previous && el.previous.status === 'defect') {
    historyBits.push(`Previously: severity ${el.previous.severity}, extent ${el.previous.extent}`);
  } else if (el.comparison === 'resolved') {
    historyBits.push('Previously recorded with a defect');
  } else if (el.comparison !== 'first') {
    historyBits.push('No prior record for this element');
  }

  let whyBanner = '';
  if (!isExtra && el.comparison === 'first') {
    whyBanner = `<div class="dc-why"><i class="fas fa-circle-info"></i> First recorded inspection for this structure — no previous data to compare against.</div>`;
  } else if (!isExtra && el.previous && el.previous.status === 'ninsp') {
    whyBanner = `<div class="dc-why"><i class="fas fa-circle-info"></i> The previous inspection didn't cover this element, so there's nothing to compare against.</div>`;
  }

  const photosHtml = photoSectionHTML(el, extraIdx);

  // Value-indicating classes (sev-N/ext-X/works-V) are always present, not
  // just when active, so a click only ever needs to toggle 'active' among
  // siblings in place - the button never gets torn down and recreated, so
  // its background-color transition can actually animate.
  const sevSteps = [1,2,3,4,5].map(s => `<button class="dc-step sev-${s}${defect.severity==String(s)?' active':''}" data-field="severity" data-el="${key}" data-val="${s}">${s}</button>`).join('');
  const extSteps = ['A','B','C','D','E'].map(x => `<button class="dc-step ext-${x}${defect.extent===x?' active':''}" data-field="extent" data-el="${key}" data-val="${x}">${x}</button>`).join('');
  const worksSteps = [['N','No'],['Y','Yes'],['M','Monitor']].map(([v,l]) => `<button class="dc-step works-btn works-${v}${defect.worksRequired===v?' active':''}" data-field="works" data-el="${key}" data-val="${v}">${l}</button>`).join('');

  const canRemovePrimary = !isExtra && !el.hadBaseDefect;
  const removeOrAddBtn = isExtra
    ? `<button class="btn-mini" data-remove-defect="${key}" title="Remove this defect"><i class="fas fa-trash"></i></button>`
    : `<button class="btn-mini" data-add-extra="${el.elementNumber}" title="Add another defect on this element"><i class="fas fa-plus"></i> Add another</button>
       ${canRemovePrimary ? `<button class="btn-mini" data-remove-defect="${key}" title="Remove this defect"><i class="fas fa-trash"></i></button>` : ''}`;

  return `<div class="defect-card cmp-${comparison||''} ${defect.reviewed?'reviewed':''}${defect.collapsed?' collapsed':''}" data-el="${key}">
    <div class="dc-top" data-collapse-toggle="${key}">
      <button class="dc-collapse-btn"><i class="fas fa-chevron-down"></i></button>
      <div class="dc-elem" style="flex:1;"><b class="cr-num">${el.elementNumber}</b> ${el.name}${isExtra ? ' <span style="font-weight:400; color:var(--text-mute2); font-size:.78rem;">(additional defect)</span>' : ''}</div>
    </div>
    <div class="dc-body">
      <div class="dc-grid">
        ${photosHtml}
        <div style="min-width:0;">
          <div class="dc-history">
            <div class="dc-history-left">
              <span>${historyBits.join(' · ')}</span>
              ${trendBadgeHTML(comparison)}
            </div>
            <div class="dc-class-row">
              ${defectTypeDropdownHTML(el, extraIdx)}
              <span class="class-dd-sep">·</span>
              ${defectNumberDropdownHTML(el, extraIdx)}
            </div>
          </div>
          <div class="dc-stepper-row">
            <div><span class="dc-stepper-lbl">Severity</span><div class="dc-step-track">${sevSteps}</div></div>
            <div><span class="dc-stepper-lbl">Extent</span><div class="dc-step-track">${extSteps}</div></div>
            <div><span class="dc-stepper-lbl">Works required</span><div class="dc-step-track">${worksSteps}</div></div>
          </div>
          ${workDetailsHTML(el, extraIdx)}
          <div class="dc-narrative-lbl">
            <span class="mini-lbl" style="margin:0;">Drafted narrative</span>
            <div style="display:flex; gap:6px;">
              ${defect.photos && defect.photos.length ? `<button class="dc-reset-btn" data-mention-photo="${key}"><i class="fas fa-image"></i> Mention photo</button>` : ''}
              <button class="dc-reset-btn" data-reset="${key}"><i class="fas fa-rotate-left"></i> Reset to drafted text</button>
            </div>
          </div>
          <textarea class="dc-narrative" data-field="narrative" data-el="${key}">${narrativeFor(el, extraIdx)}</textarea>
        </div>
      </div>
      ${whyBanner}
      <div class="dc-footer-actions">
        ${removeOrAddBtn}
        <label class="dc-review-check ${defect.reviewed?'checked':''}">
          <input type="checkbox" data-reviewed="${key}" ${defect.reviewed?'checked':''}>
          ${defect.reviewed ? 'Reviewed' : 'Mark reviewed'}
        </label>
      </div>
    </div>
  </div>`;
}
function refreshCardNarrative(el, extraIdx){
  const defect = extraIdx != null ? el.extraDefects[extraIdx] : el.current;
  const key = defectKey(el.elementNumber, extraIdx);
  defect.editedNarrative = null;
  const ta = document.querySelector(`.dc-narrative[data-el="${key}"]`);
  if(ta) ta.value = narrativeFor(el, extraIdx);
  if(document.getElementById('screen-author').classList.contains('active')){ renderDataPane(); renderReportPane(); }
}
function attachDraftEditors(){
  document.querySelectorAll('.dc-narrative').forEach(ta => {
    ta.addEventListener('input', () => {
      const ref = findDefectRef(ta.dataset.el);
      if(!ref) return;
      ref.defect.editedNarrative = ta.value;
      if(document.getElementById('screen-author').classList.contains('active')){ renderDataPane(); renderReportPane(); }
    });
  });
  document.querySelectorAll('[data-reset]').forEach(btn => {
    btn.addEventListener('click', () => {
      const ref = findDefectRef(btn.dataset.reset);
      if(ref) refreshCardNarrative(ref.el, ref.extraIdx);
    });
  });
  document.querySelectorAll('[data-mention-photo]').forEach(btn => {
    btn.addEventListener('click', () => {
      const ref = findDefectRef(btn.dataset.mentionPhoto);
      if(!ref) return;
      const { el, defect, extraIdx } = ref;
      if(!defect.photos || !defect.photos.length) return;
      const hero = defect.photos[Math.min(defect.heroIndex || 0, defect.photos.length - 1)];
      const mention = hero.description ? ` (see photo: "${hero.description}")` : ' (see attached photo)';
      const key = defectKey(el.elementNumber, extraIdx);
      const ta = document.querySelector(`.dc-narrative[data-el="${key}"]`);
      const current = narrativeFor(el, extraIdx);
      const updated = current.trim() + mention;
      defect.editedNarrative = updated;
      if(ta) ta.value = updated;
      if(document.getElementById('screen-author').classList.contains('active')){ renderDataPane(); renderReportPane(); }
    });
  });
  document.querySelectorAll('[data-reviewed]').forEach(cb => {
    cb.addEventListener('change', () => {
      const ref = findDefectRef(cb.dataset.reviewed);
      if(!ref) return;
      ref.defect.reviewed = cb.checked;
      renderDraft();
    });
  });
  document.querySelectorAll('[data-collapse-toggle]').forEach(header => {
    header.addEventListener('click', () => {
      const ref = findDefectRef(header.dataset.collapseToggle);
      if(!ref) return;
      ref.defect.collapsed = !ref.defect.collapsed;
      header.closest('.defect-card').classList.toggle('collapsed', ref.defect.collapsed);
    });
  });
  // Toggle the clicked segment in place rather than calling renderDraft() -
  // a full re-render tears down and recreates every button, so the old and
  // new "active" states never actually transition, they just snap. Updating
  // classes on the existing nodes lets the CSS transition animate for real.
  document.querySelectorAll('.dc-step[data-field="severity"], .dc-step[data-field="extent"], .dc-step[data-field="works"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const ref = findDefectRef(btn.dataset.el);
      if(!ref) return;
      const { el, defect, extraIdx } = ref;
      const field = btn.dataset.field;
      if(field === 'severity') defect.severity = btn.dataset.val;
      else if(field === 'extent') defect.extent = btn.dataset.val;
      else if(field === 'works') defect.worksRequired = btn.dataset.val;

      btn.closest('.dc-step-track').querySelectorAll('.dc-step').forEach(b => b.classList.toggle('active', b === btn));
      if (field === 'works') {
        const detail = document.querySelector(`[data-works-detail="${btn.dataset.el}"]`);
        if (detail) detail.classList.toggle('show', btn.dataset.val === 'Y');
      }
      refreshCardNarrative(el, extraIdx);
      recomputeLiveBCI();
    });
  });
  document.querySelectorAll('[data-field="priority"], [data-field="cost"]').forEach(input => {
    input.addEventListener('change', () => {
      const ref = findDefectRef(input.dataset.el);
      if(!ref) return;
      const { el, defect, extraIdx } = ref;
      if(input.dataset.field === 'priority') defect.priority = input.value;
      else defect.cost = input.value ? parseFloat(input.value) : null;
      refreshCardNarrative(el, extraIdx);
    });
  });
  document.querySelectorAll('[data-add-photo]').forEach(tile => {
    tile.addEventListener('click', () => {
      document.querySelector(`[data-photo-input="${tile.dataset.addPhoto}"]`).click();
    });
  });
  document.querySelectorAll('[data-strip-thumb]').forEach(thumb => {
    thumb.addEventListener('click', () => {
      const ref = findDefectRef(thumb.dataset.stripThumb);
      if(!ref) return;
      ref.defect.heroIndex = parseInt(thumb.dataset.idx, 10);
      renderDraft();
    });
  });
  document.querySelectorAll('[data-photo-input]').forEach(input => {
    input.addEventListener('change', () => {
      const key = input.dataset.photoInput;
      const ref = findDefectRef(key);
      const files = Array.from(input.files || []);
      if (!ref || !files.length) return;
      const pending = document.querySelector(`[data-photo-pending="${key}"]`);
      pending.style.display = 'block';
      pending.innerHTML = files.map((f, i) => pendingPhotoRowHTML(f, i)).join('') +
        `<div class="dc-pending-actions">
          <button class="dc-pending-upload" data-confirm-upload="${key}"><i class="fas fa-cloud-arrow-up"></i> Upload ${files.length > 1 ? files.length + ' photos' : 'photo'}</button>
          <button class="dc-pending-cancel" data-cancel-upload="${key}">Cancel</button>
        </div>`;
      pending.querySelector(`[data-confirm-upload="${key}"]`).addEventListener('click', () => uploadPendingPhotos(key, ref.defect, files));
      pending.querySelector(`[data-cancel-upload="${key}"]`).addEventListener('click', () => { pending.style.display = 'none'; pending.innerHTML = ''; input.value = ''; });
    });
  });
  document.querySelectorAll('[data-delete-photo]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const ref = findDefectRef(btn.dataset.el);
      if (!ref || !confirm('Delete this photo?')) return;
      try {
        const res = await fetch(`${API_BASE}/api/inspection-photos/${btn.dataset.deletePhoto}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('Delete failed');
        ref.defect.photos = ref.defect.photos.filter(p => String(p.id) !== btn.dataset.deletePhoto);
        renderDraft();
      } catch (err) {
        console.error('Photo delete failed:', err);
        alert('Could not delete photo: ' + err.message);
      }
    });
  });
  document.querySelectorAll('[data-caption-photo]').forEach(input => {
    input.addEventListener('change', async () => {
      const ref = findDefectRef(input.dataset.el);
      try {
        const res = await fetch(`${API_BASE}/api/inspection-photos/${input.dataset.captionPhoto}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ photo_description: input.value })
        });
        if (!res.ok) throw new Error('Save failed');
        if (ref) {
          const photo = ref.defect.photos.find(p => String(p.id) === input.dataset.captionPhoto);
          if (photo) photo.description = input.value;
        }
      } catch (err) {
        console.error('Caption save failed:', err);
      }
    });
  });
  document.querySelectorAll('[data-add-defect]').forEach(btn => {
    btn.addEventListener('click', () => {
      const el = AUTHOR.diffElements.find(x => String(x.elementNumber) === btn.dataset.addDefect);
      if(!el) return;
      el.baseNonDefectStatus = el.current.status;
      el.current = newDefectObject();
      el.comparison = 'new';
      recomputeLiveBCI();
      renderDraft();
    });
  });
  document.querySelectorAll('[data-add-extra]').forEach(btn => {
    btn.addEventListener('click', () => {
      const el = AUTHOR.diffElements.find(x => String(x.elementNumber) === btn.dataset.addExtra);
      if(!el) return;
      el.extraDefects = el.extraDefects || [];
      el.extraDefects.push(newDefectObject());
      renderDraft();
    });
  });
  document.querySelectorAll('[data-remove-defect]').forEach(btn => {
    btn.addEventListener('click', () => {
      const ref = findDefectRef(btn.dataset.removeDefect);
      if(!ref) return;
      const { el, extraIdx } = ref;
      if (extraIdx != null) {
        el.extraDefects.splice(extraIdx, 1);
      } else {
        el.current = { status: el.baseNonDefectStatus || 'na' };
        el.comparison = null;
      }
      recomputeLiveBCI();
      renderDraft();
    });
  });
}

// Defect type/number dropdown - delegated on the stable #draftGroups
// container rather than re-bound in attachDraftEditors, since delegation
// survives renderDraft()'s innerHTML rebuilds without re-attaching anything.
function closeAllClassDropdowns(except){
  document.querySelectorAll('.class-dd.open').forEach(dd => { if (dd !== except) dd.classList.remove('open'); });
}
const draftGroupsEl = document.getElementById('draftGroups');
draftGroupsEl.addEventListener('click', (e) => {
  const trigger = e.target.closest('.class-dd-trigger');
  if (trigger) {
    const dd = trigger.closest('.class-dd');
    const wasOpen = dd.classList.contains('open');
    closeAllClassDropdowns();
    dd.classList.toggle('open', !wasOpen);
    if (!wasOpen) { const input = dd.querySelector('[data-dd-search]'); if(input){ input.value=''; dd.querySelectorAll('.class-dd-item').forEach(i=>i.style.display=''); setTimeout(()=>input.focus(),10);} }
    return;
  }
  const item = e.target.closest('.class-dd-item');
  if (item) {
    const dd = item.closest('.class-dd');
    const ref = findDefectRef(dd.dataset.el);
    if (!ref) return;
    const { el, defect, extraIdx } = ref;
    if (dd.dataset.dd === 'defectType') {
      defect.defectType = item.dataset.val;
      // A different type's numbers rarely line up with the old one's, so
      // default to the first available number for it.
      defect.defectNumber = Object.keys(DEFECT_TYPE_LABEL[Number(item.dataset.val)] || {})[0] || null;
    } else {
      defect.defectNumber = item.dataset.val;
    }
    refreshCardNarrative(el, extraIdx);
    renderDraft();
  }
});
draftGroupsEl.addEventListener('input', (e) => {
  const searchInput = e.target.closest('[data-dd-search]');
  if (!searchInput) return;
  const q = searchInput.value.trim().toLowerCase();
  searchInput.closest('.class-dd-menu').querySelectorAll('.class-dd-item').forEach(item => {
    item.style.display = !q || item.dataset.search.includes(q) ? '' : 'none';
  });
});
document.addEventListener('click', (e) => {
  if (!e.target.closest('.class-dd')) closeAllClassDropdowns();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeAllClassDropdowns();
});

document.getElementById('draftFilterPills').addEventListener('click', function(e){
  const btn = e.target.closest('.f-pill');
  if(!btn) return;
  if(btn.dataset.onlyDefects){ draftOnlyDefects = !draftOnlyDefects; }
  else { draftFilter = btn.dataset.filter; }
  renderDraft();
});
document.getElementById('markUnchangedBtn').addEventListener('click', function(){
  AUTHOR.diffElements.forEach(el => {
    if (el.current.status === 'defect' && el.comparison === 'unchanged') el.current.reviewed = true;
  });
  renderDraft();
});
document.getElementById('toggleCollapseAllBtn').addEventListener('click', function(){
  draftAllCollapsed = !draftAllCollapsed;
  this.innerHTML = draftAllCollapsed ? '<i class="fas fa-expand"></i> Expand all' : '<i class="fas fa-compress"></i> Collapse all';
  allDraftDefects().forEach(({defect}) => { defect.collapsed = draftAllCollapsed; });
  document.querySelectorAll('.defect-card').forEach(card => card.classList.toggle('collapsed', draftAllCollapsed));
});
document.getElementById('toAuthorBtn').addEventListener('click', () => goTo('author'));
document.getElementById('backToSetupBtn').addEventListener('click', () => goTo('setup'));

// Structure/inspection info - a collapsible popover opened on demand from
// its toolbar button, not rendered as part of every renderDraft() (which
// would reset it mid-typing if it happened to be open). BCI trend and
// description are read-only context; the fields below feed the same
// AUTHOR.newInspectionDate/newInspectionType the Setup screen sets, plus
// an inspector name (defaulted from the base inspection's own record).
function renderStructInfoPanel(){
  const panel = document.getElementById('structInfoPanel');
  if (!AUTHOR.structureId) return;
  panel.innerHTML = `
    <button class="sip-close" id="sipClose" title="Close">&times;</button>
    <div class="sip-name">${AUTHOR.structureName || ''}</div>
    <div class="sip-meta">${AUTHOR.structureType || ''} · Base inspection ${fmtDate(AUTHOR.inspectionDate)}</div>
    <div class="sip-label">This Report's Details</div>
    <div class="sip-edit-grp">
      <label class="sip-edit-field"><span>Inspection date</span>
        <input type="date" id="sipInspectionDate" value="${AUTHOR.newInspectionDate || ''}">
      </label>
      <label class="sip-edit-field"><span>Inspection type</span>
        <select id="sipInspectionType">
          <option value="">Select type…</option>
          <option value="GI" ${AUTHOR.newInspectionType==='GI'?'selected':''}>GI — General Inspection</option>
          <option value="PI" ${AUTHOR.newInspectionType==='PI'?'selected':''}>PI — Principal Inspection</option>
          <option value="SI" ${AUTHOR.newInspectionType==='SI'?'selected':''}>SI — Special Inspection</option>
        </select>
      </label>
      <label class="sip-edit-field"><span>Inspector name</span>
        <input type="text" id="sipInspectorName" placeholder="Enter inspector's name" value="${(AUTHOR.inspectorName||'').replace(/"/g,'&quot;')}">
      </label>
    </div>
    <div class="sip-divider"></div>
    ${AUTHOR.structureDescription ? `<div class="sip-label">Description</div><div class="sip-desc">${AUTHOR.structureDescription}</div>` : ''}
    <div class="sip-label">BCI trend</div>
    <div class="sip-bci-track">${sipBciTrendHTML()}</div>
  `;
  document.getElementById('sipClose').addEventListener('click', closeStructInfoModal);
  document.getElementById('sipInspectionDate').addEventListener('change', function(){
    AUTHOR.newInspectionDate = this.value;
    document.getElementById('newInspectionDate').value = this.value;
  });
  document.getElementById('sipInspectionType').addEventListener('change', function(){
    AUTHOR.newInspectionType = this.value || null;
    document.getElementById('newInspectionType').value = this.value;
  });
  document.getElementById('sipInspectorName').addEventListener('input', function(){
    AUTHOR.inspectorName = this.value || null;
  });
}
function closeStructInfoModal(){
  document.getElementById('sipOverlay').classList.remove('show');
  document.body.classList.remove('modal-open');
}
document.getElementById('structInfoToggle').addEventListener('click', () => {
  renderStructInfoPanel();
  document.getElementById('sipOverlay').classList.add('show');
  document.body.classList.add('modal-open');
});
document.getElementById('sipOverlay').addEventListener('click', (e) => {
  if (e.target.id === 'sipOverlay') closeStructInfoModal();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeStructInfoModal();
});
function sipBciTrendHTML(){
  const scored = (AUTHOR.bciTrend || []).filter(t => t.bciAvg != null).slice(-6);
  if (!scored.length) return '<div style="font-size:.74rem; color:var(--text-mute);">No BCI history recorded.</div>';
  return scored.map((t, i) => `<div class="sip-bci-chip${i===scored.length-1?' current':''}">
    <span class="sc-date">${t.date}</span>
    <span class="sc-vals">${t.bciAvg.toFixed(1)}${t.bciCrit != null ? `<span class="crit">${t.bciCrit.toFixed(1)}</span>` : ''}</span>
  </div>`).join('');
}

// ============================================================
// SCREEN 3 — AUTHOR VIEW (split / data / report)
// ============================================================
document.getElementById('viewToggle').addEventListener('click', function(e){
  const btn = e.target.closest('.vt-btn');
  if(!btn) return;
  document.querySelectorAll('.vt-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  const layout = document.getElementById('authorLayout');
  layout.className = 'author-layout mode-' + btn.dataset.mode;
  document.getElementById('dataPane').style.display = btn.dataset.mode === 'report' ? 'none' : 'block';
  document.getElementById('reportPane').style.display = btn.dataset.mode === 'data' ? 'none' : 'block';
});

function renderDataPane(){
  const wrap = document.getElementById('dataRows');
  wrap.innerHTML = AUTHOR.diffElements.map(el => `
    <div class="data-row" data-el="${el.elementNumber}">
      <div class="dr-name">${el.name}</div>
      <div class="dr-meta">
        <span class="status-pill ${statusInfo(el.current.status)[0]}" style="margin-bottom:2px;">${statusInfo(el.current.status)[1]}</span>
        ${el.comparison ? `<span class="cmp-chip ${el.comparison}">${cmpLabel(el.comparison)}</span>` : ''}<br>
        ${el.current.status === 'defect' ? `Sev ${el.current.severity} · Ext ${el.current.extent}${el.current.priority ? ' · Priority ' + el.current.priority : ''}` : ''}
      </div>
    </div>`).join('');
  wrap.querySelectorAll('.data-row').forEach(row => {
    row.addEventListener('click', () => highlightPair(row.dataset.el));
  });
}

function renderReportPane(){
  const bands = buildPriorityBands(AUTHOR);
  const order = categoryOrderFor(AUTHOR.structureType);
  let html = `
    <div class="doc-cover">
      <div class="dc-brand">spanSense</div>
      <div class="dc-title">${AUTHOR.structureName || 'Untitled Structure'} — ${INSPECTION_TYPE_LABELS[AUTHOR.newInspectionType] || 'Inspection'}</div>
      <div class="dc-sub">Structure ID: ${AUTHOR.structureId || '—'} · Inspected ${fmtDate(AUTHOR.newInspectionDate || AUTHOR.inspectionDate)}${AUTHOR.inspectorName ? ' · Inspector: ' + AUTHOR.inspectorName : ''}</div>
    </div>`;
  if (AUTHOR.structureDescription) {
    html += `<div class="doc-h1">2. Structure Description</div><p class="doc-p">${AUTHOR.structureDescription}</p>`;
  }
  html += `<div class="doc-h1">3. Description of Defects</div>`;
  order.forEach((cat, ci) => {
    const els = AUTHOR.diffElements.filter(e => e.category === cat);
    if (!els.length) return;
    html += `<div class="doc-h2">3.${ci+1} ${cat}</div>`;
    els.forEach((el, ei) => {
      html += `<div class="doc-h3">3.${ci+1}.${ei+1} ${el.name}</div>
        <p class="doc-p linked ${el.current.status === 'na' ? 'na' : ''}" data-el="${el.elementNumber}">${narrativeFor(el)}</p>
        ${elPhotosHTML(el.photos, 'doc-photos')}`;
    });
  });
  html += `<div class="doc-h1">4. Conclusions and Recommendations</div>
    <p class="doc-p">${buildConclusionsIntro(AUTHOR)}</p>`;
  bands.forEach(b => {
    if(!b.items.length) return;
    html += `<div class="priority-band"><h4 class="${b.cls}">${b.label}</h4><ul>${b.items.map(i=>`<li>${i}</li>`).join('')}</ul></div>`;
  });
  document.getElementById('reportDoc').innerHTML = html;
  document.querySelectorAll('.doc-p.linked').forEach(p => {
    p.addEventListener('click', () => highlightPair(p.dataset.el));
  });
}

function highlightPair(id){
  document.querySelectorAll('.data-row').forEach(r => r.classList.toggle('highlight', r.dataset.el === id));
  document.querySelectorAll('.doc-p.linked').forEach(p => p.classList.toggle('highlight', p.dataset.el === id));
  const target = document.querySelector('.doc-p.linked[data-el="' + id + '"]');
  if(target) target.scrollIntoView({ behavior:'smooth', block:'center' });
}

document.getElementById('backToDraftBtn').addEventListener('click', () => goTo('draft'));
document.getElementById('toExportBtn').addEventListener('click', () => goTo('export'));

// ============================================================
// SCREEN 4 — EXPORT
// ============================================================
function buildPayload(){
  const order = categoryOrderFor(AUTHOR.structureType);
  return {
    structure: AUTHOR.structureName, structureId: AUTHOR.structureId,
    inspectionDate: AUTHOR.newInspectionDate || AUTHOR.inspectionDate,
    inspectionType: AUTHOR.newInspectionType,
    inspectorName: AUTHOR.inspectorName,
    previousDate: AUTHOR.previousDate,
    description: AUTHOR.structureDescription,
    branding: AUTHOR.branding,
    sections: order.map(cat => ({
      category: cat,
      elements: AUTHOR.diffElements.filter(e => e.category === cat).map(el => ({
        name: el.name, status: el.current.status, comparison: el.comparison, narrative: narrativeFor(el),
        severity: el.current.severity||null, extent: el.current.extent||null, priority: el.current.priority||null, cost: el.current.cost||null,
        photos: el.photos || []
      }))
    })),
    conclusions: { intro: buildConclusionsIntro(AUTHOR), priorityBands: buildPriorityBands(AUTHOR) }
  };
}
function renderExport(){
  document.getElementById('jsonPayload').textContent = JSON.stringify(buildPayload(), null, 2);
  const note = document.getElementById('exportDateNote');
  const newDate = AUTHOR.newInspectionDate;
  if (newDate && newDate !== AUTHOR.inspectionDate) {
    const typeLabel = INSPECTION_TYPE_LABELS[AUTHOR.newInspectionType] || 'the type you picked';
    note.innerHTML = `<i class="fas fa-circle-info"></i> The Word report is dated ${fmtDate(newDate)} (${typeLabel}). The Full Report and BCI Proforma PDFs still pull their per-span data from the real ${fmtDate(AUTHOR.inspectionDate)} inspection, since nothing has been saved under the new date yet.`;
  } else {
    note.innerHTML = '';
  }
}
document.getElementById('backToAuthorBtn').addEventListener('click', () => goTo('author'));

function loadScript(src){
  return new Promise((resolve, reject) => {
    if(document.querySelector('script[src="' + src + '"]')) return resolve();
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error('Failed to load ' + src));
    document.head.appendChild(s);
  });
}

const REPORT_FONT = 'Roboto';
const REPORT_COLORS = { text:'2C3E44', heading:'2C3E44', muted:'888888' };
const PRIORITY_COLORS = { h:'C0392B', m:'BA7517', l:'2D7A6E' };

// docx's ImageRun requires an explicit type (jpg/png/gif/bmp) - same helper
// as reportFull.docx.js uses for the same reason.
function imageTypeFromDataUrl(dataUrl){
  const m = /^data:image\/(\w+)/i.exec(dataUrl);
  const subtype = m ? m[1].toLowerCase() : '';
  if (subtype === 'jpeg') return 'jpg';
  if (['jpg','png','gif','bmp'].includes(subtype)) return subtype;
  return 'png';
}
function imageParagraph(d, dataUrl, maxWidthPx){
  if (!dataUrl) return null;
  const width = maxWidthPx || 220;
  const height = Math.round(width * 0.75);
  return new d.Paragraph({
    alignment: d.AlignmentType.CENTER,
    spacing: { after: 160 },
    children: [new d.ImageRun({ data: dataUrl, type: imageTypeFromDataUrl(dataUrl), transformation: { width, height } })]
  });
}

async function buildAuthorReportDocx(payload){
  const d = window.docx;
  const accent = (payload.branding.accentColor || '#5B8C8A').replace('#','').toUpperCase();

  function para(text, opts){
    opts = opts || {};
    return new d.Paragraph({
      alignment: opts.alignment,
      spacing: { before: opts.before || 0, after: opts.after != null ? opts.after : 120 },
      children: [new d.TextRun({ text: text != null ? String(text) : '', italics: !!opts.italics, bold: !!opts.bold, color: opts.color, size: opts.size || 18 })]
    });
  }
  function heading(text, level){
    return new d.Paragraph({ heading: level, spacing: { before: 240, after: 120 }, children: [new d.TextRun({ text })] });
  }

  const children = [];

  children.push(new d.Paragraph({ alignment: d.AlignmentType.CENTER, spacing: { before: 1600 }, children: [new d.TextRun({ text: 'SPANSENSE', bold: true, size: 40, color: accent })] }));
  children.push(new d.Paragraph({ alignment: d.AlignmentType.CENTER, spacing: { after: 200 }, children: [new d.TextRun({ text: 'INSPECTION REPORT', bold: true, size: 32, color: REPORT_COLORS.heading })] }));
  children.push(new d.Paragraph({ alignment: d.AlignmentType.CENTER, spacing: { after: 100 }, children: [new d.TextRun({ text: payload.structure, bold: true, size: 28 })] }));
  const typePrefix = INSPECTION_TYPE_LABELS[payload.inspectionType] ? INSPECTION_TYPE_LABELS[payload.inspectionType] + ' · ' : '';
  const inspectorSuffix = payload.inspectorName ? ' · Inspector: ' + payload.inspectorName : '';
  children.push(new d.Paragraph({ alignment: d.AlignmentType.CENTER, spacing: { after: 60 }, children: [new d.TextRun({ text: typePrefix + 'Structure ID: ' + payload.structureId + ' · Inspected ' + fmtDate(payload.inspectionDate) + inspectorSuffix, size: 20, color: REPORT_COLORS.muted })] }));
  if (payload.previousDate) {
    children.push(new d.Paragraph({ alignment: d.AlignmentType.CENTER, spacing: { after: 500 }, children: [new d.TextRun({ text: 'Compared against the previous inspection on ' + fmtDate(payload.previousDate), italics: true, size: 16, color: REPORT_COLORS.muted })] }));
  }
  children.push(new d.Paragraph({ children: [], pageBreakBefore: true }));

  if (payload.description) {
    children.push(heading('2. Structure Description', d.HeadingLevel.HEADING_1));
    children.push(para(payload.description, { after: 240 }));
  }

  children.push(heading('3. Description of Defects', d.HeadingLevel.HEADING_1));
  for (const [ci, sec] of payload.sections.entries()) {
    if (!sec.elements.length) continue;
    children.push(heading('3.' + (ci + 1) + ' ' + sec.category, d.HeadingLevel.HEADING_2));
    for (const [ei, el] of sec.elements.entries()) {
      children.push(para('3.' + (ci + 1) + '.' + (ei + 1) + ' ' + el.name, { bold: true, after: 60 }));
      children.push(para(el.narrative, { after: el.photos.length ? 100 : 160, italics: el.status === 'na', color: el.status === 'na' ? REPORT_COLORS.muted : undefined }));
      for (const photo of el.photos.slice(0, 2)) {
        const dataUrl = await imageUrlToDataURL(photo.url);
        const imgPara = imageParagraph(d, dataUrl);
        if (imgPara) children.push(imgPara);
      }
    }
  }

  children.push(new d.Paragraph({ children: [], pageBreakBefore: true }));
  children.push(heading('4. Conclusions and Recommendations', d.HeadingLevel.HEADING_1));
  children.push(para(payload.conclusions.intro, { after: 240 }));
  payload.conclusions.priorityBands.forEach(band => {
    if(!band.items.length) return;
    children.push(para(band.label.toUpperCase(), { bold: true, after: 80, before: 100, color: PRIORITY_COLORS[band.cls] }));
    band.items.forEach(item => children.push(para('•  ' + item, { after: 60 })));
  });

  return new d.Document({
    styles: {
      default: {
        document: { run: { font: REPORT_FONT, size: 18, color: REPORT_COLORS.text } },
        heading1: { run: { font: REPORT_FONT, size: 26, bold: true, color: REPORT_COLORS.heading } },
        heading2: { run: { font: REPORT_FONT, size: 22, bold: true, color: accent } },
      }
    },
    sections: [{ properties: {}, children }]
  });
}

function showOverlay(icon, title, body){
  const overlay = document.getElementById('saveOverlay');
  const box = document.getElementById('saveBox');
  box.classList.remove('success');
  box.innerHTML = `<div class="ic"><i class="fas ${icon}"></i></div><h3>${title}</h3><p>${body}</p>`;
  overlay.classList.add('show');
  return { overlay, box };
}
function finishOverlay(box, overlay, icon, title, body, isError){
  box.classList.toggle('success', !isError);
  box.innerHTML = `<div class="ic"${isError ? ' style="background:var(--red-bg);color:var(--red);"' : ''}><i class="fas ${icon}"></i></div><h3>${title}</h3><p>${body}</p>
    <div style="margin-top:18px;"><button class="btn-mini" id="closeOverlayBtn">Close</button></div>`;
  document.getElementById('closeOverlayBtn').addEventListener('click', () => overlay.classList.remove('show'));
}

async function generateWordReport(){
  if (!AUTHOR.structureId) { alert('Load a structure and inspection first.'); return; }
  const { overlay, box } = showOverlay('fa-cog fa-spin', 'Generating Word report…', 'Assembling the drafted narrative into a document');
  try{
    if(typeof window.docx === 'undefined'){
      await loadScript('https://cdn.jsdelivr.net/npm/docx@9.7.1/dist/index.iife.js');
    }
    const payload = buildPayload();
    const doc = await buildAuthorReportDocx(payload);
    const blob = await window.docx.Packer.toBlob(doc);
    const fileName = payload.structure.replace(/[^a-z0-9]/gi, '_') + '_' + (payload.inspectionDate || 'draft') + '_Author_Report.docx';
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = fileName;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    finishOverlay(box, overlay, 'fa-check', 'Downloaded', `${fileName} was generated from the drafted narrative above.`);
  } catch(err){
    console.error('Word generation failed:', err);
    finishOverlay(box, overlay, 'fa-triangle-exclamation', 'Generation failed', err.message || 'Something went wrong building the document.', true);
  }
}

// Real BCI Proforma PDF export - same generator/data shape as
// map.js's generateBCIProformaForDate, so the output is identical to the
// one downloadable from the Previous Inspections list.
async function generateBciProformaPdf(){
  if (!AUTHOR.structureId) { alert('Load a structure and inspection first.'); return; }
  const { overlay, box } = showOverlay('fa-cog fa-spin', 'Generating BCI Proforma…', 'Building the per-span defect grid');
  try {
    if (typeof pdfMake === 'undefined' || typeof buildBCIProformaFullContent !== 'function') {
      throw new Error('PDF libraries not loaded yet - please wait a moment and try again.');
    }
    const dateStr = AUTHOR.inspectionDate;
    const [bridgeRes, defectsRes, worksRes] = await Promise.all([
      fetch(`${API_BASE}/api/bridges/${AUTHOR.structureId}`),
      fetch(`${API_BASE}/api/defectsbci?structureId=${AUTHOR.structureId}&date=${dateStr}`),
      fetch(`${API_BASE}/api/worksrequired?structureId=${AUTHOR.structureId}&date=${dateStr}`)
    ]);
    const bridge = await bridgeRes.json();
    const spansData = await defectsRes.json();
    const worksRequired = await worksRes.json();

    const bciFormData = {
      structureName: AUTHOR.structureName, structureId: AUTHOR.structureId,
      bridgeData: bridge, totalSpans: bridge.span_number || 1,
      spansData, worksRequired
    };
    const docDefinition = {
      pageSize: 'A4', pageMargins: [40, 40, 40, 40],
      content: buildBCIProformaFullContent(bciFormData),
      defaultStyle: { font: 'Roboto' }
    };
    const fileName = AUTHOR.structureName.replace(/[^a-z0-9]/gi, '_') + '_BCI_Proforma.pdf';
    pdfMake.createPdf(docDefinition).download(fileName);
    finishOverlay(box, overlay, 'fa-check', 'Downloaded', `${fileName} was generated from the same BCI Proforma used elsewhere in spanSense.`);
  } catch (err) {
    console.error('BCI Proforma generation failed:', err);
    finishOverlay(box, overlay, 'fa-triangle-exclamation', 'Generation failed', err.message || 'Something went wrong building the PDF.', true);
  }
}

// Full inspection report PDF - reuses the app's real report generator
// (test.js's generateSimplePDFReport / buildInspectionReportDocDefinition),
// so cover, TOC, structure details, BCI summary, photo appendix and BCI
// Proforma appendix are byte-for-byte the same format spanSense already
// produces elsewhere. Only the per-element narrative differs: Author's
// drafted (previous-inspection-aware) text stands in for the raw stored
// comment, via generateSimplePDFReport's narrativeByElement override.
async function generateFullReportPdf(){
  if (!AUTHOR.structureId) { alert('Load a structure and inspection first.'); return; }
  const { overlay, box } = showOverlay('fa-cog fa-spin', 'Generating full report…', 'Assembling structure details, defects, and the BCI Proforma appendix');
  try {
    if (typeof window.generateSimplePDFReport !== 'function') {
      throw new Error('Report generator not loaded yet - please wait a moment and try again.');
    }
    const dateStr = AUTHOR.inspectionDate;
    const narrativeByElement = {};
    AUTHOR.diffElements.forEach(el => {
      if (el.current.status === 'defect') narrativeByElement[el.elementNumber] = narrativeFor(el);
    });
    await window.generateSimplePDFReport({
      structure_id: AUTHOR.structureId,
      structure_name: AUTHOR.structureName,
      date: dateStr,
      narrativeByElement
    }, 'download');
    finishOverlay(box, overlay, 'fa-check', 'Downloaded', 'The full inspection report was generated with Author\'s drafted narrative in place of the raw stored comments.');
  } catch (err) {
    console.error('Full report generation failed:', err);
    finishOverlay(box, overlay, 'fa-triangle-exclamation', 'Generation failed', err.message || 'Something went wrong building the report.', true);
  }
}

document.getElementById('genWordBtn').addEventListener('click', generateWordReport);
document.getElementById('genPdfBtn').addEventListener('click', generateBciProformaPdf);
document.getElementById('genFullReportBtn').addEventListener('click', generateFullReportPdf);

// ============================================================
// INIT
// ============================================================
goTo('setup');
