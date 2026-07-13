// API_BASE, formatDate, and imageUrlToDataURL are provided by test.js
// (loaded before this file) - same dependency reportFull.docx.js already
// has on pages that load it, and Author now also uses test.js directly for
// the full-report PDF export (generateSimplePDFReport).

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
  inspectionDate: null, inspectionType: null, previousDate: null,
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
      <div class="bc-date">${t.date}</div>
      <div class="bc-score-row avg"><span>Avg</span><b>${t.bciAvg.toFixed(1)}</b></div>
      ${critHtml}
      <div class="bc-type">${t.type}</div>
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
    AUTHOR.bciTrend = twin.inspections || [];
    AUTHOR.diffElements = diff.elements.map(e => ({ ...e, category: categoryFor(diff.structureType, e.elementNumber), reviewed: false }));
    draftFilter = 'all';

    // Real defect photos, keyed by element number (an element can have more
    // than one defect row with its own photos across the same inspection).
    const photosByElement = {};
    (full.defects || []).forEach(d => {
      if (!d.photos || !d.photos.length) return;
      if (!photosByElement[d.elementNumber]) photosByElement[d.elementNumber] = [];
      photosByElement[d.elementNumber].push(...d.photos);
    });
    AUTHOR.photosByElement = photosByElement;
    AUTHOR.diffElements.forEach(el => { el.photos = photosByElement[el.elementNumber] || []; });

    const summary = document.getElementById('loadedSummary');
    summary.innerHTML = `<div class="loaded-summary"><i class="fas fa-circle-check"></i><div>
        Loaded <b>${bridge.name}</b> — inspection dated ${fmtDate(diff.currentDate)}.
        ${diff.previousDate
          ? `<span class="prev-note">Comparing against the previous inspection on ${fmtDate(diff.previousDate)}.</span>`
          : `<span class="prev-note">No previous inspection found — this is the first recorded inspection for this structure.</span>`}
      </div></div>
      ${AUTHOR.structureDescription ? `<div class="struct-desc"><b>Structure description</b>${AUTHOR.structureDescription}</div>` : ''}
      ${bciTrendHTML(AUTHOR.bciTrend)}`;

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
function narrativeFor(el){
  return el.editedNarrative != null ? el.editedNarrative : buildNarrative(el, AUTHOR.previousDate);
}
function elPhotosHTML(photos, containerCls){
  if (!photos || !photos.length) return '';
  const thumbCls = containerCls === 'doc-photos' ? 'doc-photo-thumb' : 'el-photo-thumb';
  return `<div class="${containerCls}">${photos.map(p =>
    `<img class="${thumbCls}" src="${p.url}" alt="${(p.description||'Site photo').replace(/"/g,'')}" title="${(p.description||'').replace(/"/g,'')}" onclick="window.open('${p.url}','_blank')">`
  ).join('')}</div>`;
}

let draftFilter = 'all';
function draftFilterPillsHTML(){
  const defects = AUTHOR.diffElements.filter(e => e.current.status === 'defect');
  const flagged = defects.filter(e => e.comparison === 'new' || e.comparison === 'worsened' || e.comparison === 'first');
  const reviewed = defects.filter(e => e.reviewed);
  const pills = [
    { key:'all', label:`All defects (${defects.length})` },
    { key:'flagged', label:`New or worsened (${flagged.length})` },
    { key:'unreviewed', label:`Needs review (${defects.length - reviewed.length})` },
    { key:'reviewed', label:`Reviewed (${reviewed.length})` }
  ];
  return pills.map(p => `<button class="f-pill ${draftFilter===p.key?'on':''}" data-filter="${p.key}">${p.label}</button>`).join('');
}
function passesDraftFilter(el){
  if (draftFilter === 'flagged') return el.comparison === 'new' || el.comparison === 'worsened' || el.comparison === 'first';
  if (draftFilter === 'unreviewed') return !el.reviewed;
  if (draftFilter === 'reviewed') return !!el.reviewed;
  return true;
}

function renderDraft(){
  document.getElementById('draftStructureName').textContent = AUTHOR.structureName || '—';
  document.getElementById('draftFilterPills').innerHTML = draftFilterPillsHTML();
  const order = categoryOrderFor(AUTHOR.structureType);
  const wrap = document.getElementById('draftGroups');
  wrap.innerHTML = order.map(cat => {
    const els = AUTHOR.diffElements.filter(e => e.category === cat);
    if (!els.length) return '';
    const clearEls = els.filter(e => e.current.status !== 'defect');
    const defectEls = els.filter(e => e.current.status === 'defect').filter(passesDraftFilter);
    if (!clearEls.length && !defectEls.length) return '';
    const clearHtml = clearEls.length ? `<div class="clear-table">${clearEls.map(clearRowHTML).join('')}</div>` : '';
    return `<div class="cat-group">
      <div class="cat-title">${cat}</div>
      ${clearHtml}
      ${defectEls.map(defectCardHTML).join('')}
    </div>`;
  }).join('');
  const totalDefects = AUTHOR.diffElements.filter(e => e.current.status === 'defect').length;
  const reviewedDefects = AUTHOR.diffElements.filter(e => e.current.status === 'defect' && e.reviewed).length;
  document.getElementById('draftProgressText').textContent = totalDefects
    ? `${reviewedDefects} of ${totalDefects} defects reviewed`
    : 'No defects recorded for this inspection';
  document.getElementById('markUnchangedBtn').disabled = !AUTHOR.diffElements.some(e => e.current.status === 'defect' && e.comparison === 'unchanged' && !e.reviewed);
  attachDraftEditors();
}
function clearRowHTML(el){
  const [cls, label] = statusInfo(el.current.status);
  return `<div class="clear-row"><span class="cr-name">${el.name}</span><span class="status-pill ${cls}" style="margin:0;">${label}</span></div>`;
}
function trendBadgeHTML(el){
  if (!el.comparison) return '';
  const label = { new:'New finding', worsened:'Worsened since last visit', improved:'Improved since last visit', resolved:'Resolved', unchanged:'Stable', changed:'Changed', first:'First record' }[el.comparison] || cmpLabel(el.comparison);
  return `<span class="trend-badge ${el.comparison}">${label}</span>`;
}
function defectCardHTML(el){
  const codeLabel = (typeof defectTypeLabel === 'function') ? defectTypeLabel(el.current.defectType, el.current.defectNumber) : null;
  const sevLabel = (typeof severityLabel === 'function') ? severityLabel(el.current.severity) : null;
  const code = el.current.defectType && el.current.defectNumber ? `${el.current.defectType}.${el.current.defectNumber}` : '';

  const historyBits = [];
  if (el.previous && el.previous.status === 'defect') {
    historyBits.push(`Previously: severity ${el.previous.severity}, extent ${el.previous.extent}`);
  } else if (el.comparison === 'resolved') {
    historyBits.push('Previously recorded with a defect');
  } else if (el.comparison !== 'first') {
    historyBits.push('No prior record for this element');
  }

  let whyBanner = '';
  if (el.comparison === 'first') {
    whyBanner = `<div class="dc-why"><i class="fas fa-circle-info"></i> First recorded inspection for this structure — no previous data to compare against.</div>`;
  } else if (el.previous && el.previous.status === 'ninsp') {
    whyBanner = `<div class="dc-why"><i class="fas fa-circle-info"></i> The previous inspection didn't cover this element, so there's nothing to compare against.</div>`;
  }

  const photosHtml = (el.photos && el.photos.length)
    ? `<div class="dc-photos">${el.photos.slice(0,2).map(p => `<img src="${p.url}" alt="${(p.description||'Site photo').replace(/"/g,'')}" title="${(p.description||'').replace(/"/g,'')}" onclick="window.open('${p.url}','_blank')">`).join('')}</div>`
    : `<div class="dc-photo-placeholder"><i class="fas fa-camera"></i></div>`;

  return `<div class="defect-card cmp-${el.comparison||''} ${el.reviewed?'reviewed':''}" data-el="${el.elementNumber}">
    <div class="dc-top">
      <div>
        <div class="dc-elem">${el.name}</div>
        <div class="dc-code">${code}${codeLabel ? ' · ' + codeLabel.toUpperCase() : ''}</div>
      </div>
      <div class="dc-actions">
        <label class="dc-review-check ${el.reviewed?'checked':''}">
          <input type="checkbox" data-reviewed="${el.elementNumber}" ${el.reviewed?'checked':''}>
          ${el.reviewed ? 'Reviewed' : 'Mark reviewed'}
        </label>
      </div>
    </div>
    <div class="dc-history">
      <span>${historyBits.join(' · ')}</span>
      ${trendBadgeHTML(el)}
    </div>
    <div class="dc-grid">
      ${photosHtml}
      <div>
        <div class="dc-facts">
          <span>Severity: <b>${el.current.severity || '—'}${sevLabel ? ' (' + sevLabel + ')' : ''}</b></span>
          <span>Extent: <b>${el.current.extent || '—'}</b></span>
          <span>Works required: <b>${el.current.worksRequired === 'Y' ? 'Yes' : 'No'}</b></span>
        </div>
        <div class="dc-narrative-lbl">
          <span class="mini-lbl" style="margin:0;">Drafted narrative</span>
          <button class="dc-reset-btn" data-reset="${el.elementNumber}"><i class="fas fa-rotate-left"></i> Reset to drafted text</button>
        </div>
        <textarea class="dc-narrative" data-field="narrative" data-el="${el.elementNumber}">${narrativeFor(el)}</textarea>
      </div>
    </div>
    ${whyBanner}
  </div>`;
}
function attachDraftEditors(){
  document.querySelectorAll('.dc-narrative').forEach(ta => {
    ta.addEventListener('input', () => {
      const el = AUTHOR.diffElements.find(x => String(x.elementNumber) === ta.dataset.el);
      if(!el) return;
      el.editedNarrative = ta.value;
      if(document.getElementById('screen-author').classList.contains('active')){ renderDataPane(); renderReportPane(); }
    });
  });
  document.querySelectorAll('[data-reset]').forEach(btn => {
    btn.addEventListener('click', () => {
      const el = AUTHOR.diffElements.find(x => String(x.elementNumber) === btn.dataset.reset);
      if(!el) return;
      el.editedNarrative = null;
      const ta = document.querySelector(`.dc-narrative[data-el="${btn.dataset.reset}"]`);
      if(ta) ta.value = narrativeFor(el);
      if(document.getElementById('screen-author').classList.contains('active')){ renderDataPane(); renderReportPane(); }
    });
  });
  document.querySelectorAll('[data-reviewed]').forEach(cb => {
    cb.addEventListener('change', () => {
      const el = AUTHOR.diffElements.find(x => String(x.elementNumber) === cb.dataset.reviewed);
      if(!el) return;
      el.reviewed = cb.checked;
      renderDraft();
    });
  });
}
document.getElementById('draftFilterPills').addEventListener('click', function(e){
  const btn = e.target.closest('.f-pill');
  if(!btn) return;
  draftFilter = btn.dataset.filter;
  renderDraft();
});
document.getElementById('markUnchangedBtn').addEventListener('click', function(){
  AUTHOR.diffElements.forEach(el => {
    if (el.current.status === 'defect' && el.comparison === 'unchanged') el.reviewed = true;
  });
  renderDraft();
});
document.getElementById('toAuthorBtn').addEventListener('click', () => goTo('author'));

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
      <div class="dc-title">${AUTHOR.structureName || 'Untitled Structure'} — ${AUTHOR.inspectionType || 'Inspection'}</div>
      <div class="dc-sub">Structure ID: ${AUTHOR.structureId || '—'} · Inspected ${fmtDate(AUTHOR.inspectionDate)}</div>
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
    inspectionDate: AUTHOR.inspectionDate, previousDate: AUTHOR.previousDate,
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
  children.push(new d.Paragraph({ alignment: d.AlignmentType.CENTER, spacing: { after: 60 }, children: [new d.TextRun({ text: 'Structure ID: ' + payload.structureId + ' · Inspected ' + fmtDate(payload.inspectionDate), size: 20, color: REPORT_COLORS.muted })] }));
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
    const fileName = payload.structure.replace(/[^a-z0-9]/gi, '_') + '_Author_Report.docx';
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
