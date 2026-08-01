// API_BASE, formatDate, and imageUrlToDataURL are provided by test.js
// (loaded before this file) - same dependency reportFull.docx.js already
// has on pages that load it, and Author now also uses test.js directly for
// the full-report PDF export (generateSimplePDFReport). DEFECT_TYPE_LABEL
// and defectTypeLabel() are also provided by test.js.

// ============================================================
// WIZARD RAIL — centres against .page-wrapper (the one element common to
// every screen) so it lands in the left gutter regardless of how wide
// that gutter is at the current viewport size. Half the gutter, minus
// half the rail's own width.
// ============================================================
(function(){
  function positionWizardRail(){
    const rail = document.getElementById('wizardSteps');
    const wrap = document.querySelector('.page-wrapper');
    if (!rail || !wrap) return;
    const wrapRect = wrap.getBoundingClientRect();
    const railWidth = rail.offsetWidth || 44;
    rail.style.left = Math.max(8, (wrapRect.left / 2) - (railWidth / 2)) + 'px';
  }
  window.addEventListener('resize', positionWizardRail);
  positionWizardRail();
})();

const INSPECTION_TYPE_LABELS = { GI: 'General Inspection (GI)', PI: 'Principal Inspection (PI)', SI: 'Safety Inspection (SI)' };

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
  inspectionId: null, conclusions: '', generalPhotos: [], notes: [],
  diffElements: [], // [{ elementNumber, name, category, current, previous, comparison, editedNarrative? }]
  branding: { accentColor: '#5b8c8a', template: 'modern', logoUrl: null },
  maxStepReached: 0,
  // Whether the loaded data came from "Upload a previous inspection"
  // (AI-extracted, never a real DB row) rather than "From spanSense
  // records" - the extracted case has nothing for inspection1.html to
  // load, so Continue skips the redirect and goes straight to Report
  // View for it (see the #toReportViewBtn listener below).
  loadedFromUpload: false
};

// ============================================================
// SCREEN NAVIGATION
// ============================================================
const WIZARD_ORDER = ['setup','author','export'];
function goTo(step){
  const idx = WIZARD_ORDER.indexOf(step);
  AUTHOR.maxStepReached = Math.max(AUTHOR.maxStepReached, idx);
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('screen-' + step).classList.add('active');
  // Screens are toggled via display, not real navigation, so the browser
  // doesn't reset scroll position on its own - without this, whatever
  // scrollY the previous screen was left at carries straight over onto the
  // new one's completely different content.
  window.scrollTo(0, 0);
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
  // The right rail (Conclusions/Photos/Notes) only makes sense on Report
  // View - Setup/Export have no use for editing raw notes/photos, so it
  // stays out of the way (and its modals/drawer closed) everywhere else.
  const onAuthor = step === 'author';
  document.getElementById('draftRightRail').style.display = onAuthor ? 'flex' : 'none';
  if(step === 'author') {
    refreshConclusionsRailState();
    renderDraftNotesList();
    renderReportPane();
  } else {
    closeConclusionsModal(); closePhotosModal(); closeDraftNotesPanel();
  }
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
  // "From Field" reuses the exact same structure+date picker as "From
  // spanSense records" - it's the same panel, just later filtered down to
  // source:'field' rows in onStructureChange() - not a separate panel.
  document.getElementById('sourceRecords').style.display = isUpload ? 'none' : 'block';
  document.getElementById('sourceUpload').style.display = isUpload ? 'block' : 'none';
  // newInspRow only exists for the upload path now (there's no real DB
  // date to stamp the report with until the record is actually saved) -
  // records/Field both hand off into inspection1.html, which already has
  // its own date/type editing.
  document.getElementById('newInspRow').style.display = (isUpload && AUTHOR.loadedFromUpload) ? 'block' : 'none';
  if (!isUpload && document.getElementById('structureSelect').value) onStructureChange();
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
  // newInspRow reflects the upload flow that was last actually loaded -
  // once the picker moves off that structure (back to the placeholder, or
  // on to a different one), its date/type no longer apply until an
  // extraction runs again.
  if (structureId !== AUTHOR.structureId) {
    document.getElementById('newInspRow').style.display = 'none';
  }
  if (!structureId) { inspSel.innerHTML = '<option value="">Select a structure first</option>'; return; }
  inspSel.innerHTML = '<option value="">Loading inspections…</option>';
  // "From Field" is the same dropdown, just narrowed to source:'field' rows
  // (inspections.source is 'field' or 'desktop', server.js:1618) - not a
  // separate endpoint or panel.
  const fieldOnly = document.querySelector('.source-tab.active')?.dataset.source === 'field';
  try {
    const res = await fetch(`${API_BASE}/api/inspection-dates/${structureId}`);
    const allDates = await res.json();
    const dates = fieldOnly ? allDates.filter(d => d.source === 'field') : allDates;
    if (!dates.length) {
      inspSel.innerHTML = `<option value="">${fieldOnly ? 'No Field-submitted inspections for this structure' : 'No inspections recorded for this structure'}</option>`;
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

async function onLoad(){
  const structureId = document.getElementById('structureSelect').value;
  const date = document.getElementById('inspectionSelect').value;
  if (!structureId || !date) return;

  const loadBtn = document.getElementById('loadBtn');
  loadBtn.disabled = true;
  loadBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Loading…';
  try {
    const [diffRes, bridgeRes, fullRes] = await Promise.all([
      fetch(`${API_BASE}/api/author/diff?structureId=${structureId}&date=${date}`),
      fetch(`${API_BASE}/api/bridges/${structureId}`),
      fetch(`${API_BASE}/api/inspection/full?structure_id=${structureId}&date=${date}`)
    ]);
    if (!diffRes.ok) throw new Error((await diffRes.json()).error || 'Failed to load inspection data');
    const diff = await diffRes.json();
    const bridge = await bridgeRes.json();
    const full = fullRes.ok ? await fullRes.json() : { defects: [] };

    AUTHOR.loadedFromUpload = false;

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
    AUTHOR.structureSpans = bridge.span_number || null;
    AUTHOR.structureLength = bridge.length || null;
    AUTHOR.structureBuiltYear = bridge.built_year || null;
    AUTHOR.structureMaterial = [bridge.primary_material, bridge.secondary_material].filter(Boolean).join(' / ') || null;
    AUTHOR.inspectorName = full.inspectorName || null;
    // The loaded base inspection's own id/conclusions/general photos/notes -
    // these attach to it directly (same "editing the stored record" model
    // as structure info above), not to newInspectionDate, which only labels
    // this report's cover page and may not be a real DB row yet.
    AUTHOR.inspectionId = full.id || null;
    AUTHOR.inspectionType = full.inspectionType || null;
    AUTHOR.conclusions = full.conclusions || '';
    AUTHOR.generalPhotos = full.generalPhotos || [];
    AUTHOR.notes = full.notes || [];
    AUTHOR.bciAvg = full.overallBciave != null ? parseFloat(full.overallBciave) : null;
    AUTHOR.bciCrit = full.overallBcicrit != null ? parseFloat(full.overallBcicrit) : null;
    AUTHOR.diffElements = diff.elements.map(e => ({
      ...e, category: categoryFor(diff.structureType, e.elementNumber), extraDefects: []
    }));

    // Real defect photos - el.photos is the read-only aggregate the Report
    // View/export panes use (every photo across all of the element's
    // defect rows). Photos themselves are only ever added/edited in
    // inspection.html now, so this is display-only.
    const photosByElement = {};
    (full.defects || []).forEach(d => {
      if (!d.photos || !d.photos.length) return;
      if (!photosByElement[d.elementNumber]) photosByElement[d.elementNumber] = [];
      photosByElement[d.elementNumber].push(...d.photos);
    });
    AUTHOR.photosByElement = photosByElement;
    AUTHOR.diffElements.forEach(el => { el.photos = photosByElement[el.elementNumber] || []; });

    // A real review card rather than just a "Loaded" chip - a chance to
    // double-check this is actually the right structure/date/type before
    // clicking Continue, which now hands off straight into the real
    // capture flow (inspection1.html -> inspection.html) for fixing/adding
    // underlying defect data or photos - see goEditInInspection() and the
    // #toReportViewBtn listener below. That flow is the same "open in edit
    // mode" convention already used by database.js/dashboard.js/map.js's
    // own "Edit"/"Edit Report" links - editInspectionRow
    // (database/database.js) is the canonical example - plus one new
    // sessionStorage key, authorReturn, so those pages know to show a way
    // back into Author (see the navbar badge in inspection.html/
    // inspection1.html and the auto-resume check near loadStructures()
    // below).
    const summary = document.getElementById('loadedSummary');
    summary.innerHTML = `
      <div class="load-review-card">
        <div class="lrc-head"><i class="fas fa-circle-check"></i> Loaded${diff.previousDate ? '' : ' — first recorded inspection, no previous data to compare against'}</div>
        <div class="lrc-facts">
          <div class="lrc-fact"><span>Structure</span><b>${AUTHOR.structureName || '—'}</b></div>
          <div class="lrc-fact"><span>Date</span><b>${fmtDate(AUTHOR.inspectionDate)}</b></div>
          <div class="lrc-fact"><span>Type</span><b>${INSPECTION_TYPE_LABELS[AUTHOR.inspectionType] || AUTHOR.inspectionType || '—'}</b></div>
          <div class="lrc-fact"><span>Inspector</span><b>${AUTHOR.inspectorName || '—'}</b></div>
          <div class="lrc-fact"><span>BCI avg</span><b>${AUTHOR.bciAvg != null ? AUTHOR.bciAvg.toFixed(1) : '—'}</b></div>
          <div class="lrc-fact"><span>BCI crit</span><b class="crit">${AUTHOR.bciCrit != null ? AUTHOR.bciCrit.toFixed(1) : '—'}</b></div>
        </div>
      </div>`;

    // No date/type picker here for the records/Field path - there's a real
    // recorded inspection to report on, so its own date/type are the
    // report's date/type by default (still overridable via the Info modal
    // on Report View, which reads/writes these same two fields).
    AUTHOR.newInspectionDate = AUTHOR.inspectionDate;
    AUTHOR.newInspectionType = AUTHOR.inspectionType;

    document.getElementById('setupBottomNav').style.display = 'flex';
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

// Hands off to the real capture flow for this exact structure/date - the
// same sessionStorage keys editInspectionRow (database/database.js) sets
// before opening inspection1.html, plus authorReturn so that page (and
// inspection.html after it) knows to show a way back into Author. Same
// tab, not a new one - this is a "go there, come back" trip, not a
// side-reference lookup like the database page's own Edit links.
function goEditInInspection(){
  sessionStorage.removeItem('inspectionData');
  sessionStorage.removeItem('defects');
  sessionStorage.removeItem('photoData');
  sessionStorage.removeItem('selectedSpan');
  sessionStorage.setItem('inspectionStructureNumber', AUTHOR.structureId);
  sessionStorage.setItem('inspectionDate', AUTHOR.inspectionDate);
  sessionStorage.setItem('inspectionMode', 'edit');
  sessionStorage.setItem('structureId', AUTHOR.structureId);
  sessionStorage.setItem('structureName', AUTHOR.structureName);
  sessionStorage.setItem('authorReturn', JSON.stringify({ structureId: AUTHOR.structureId, date: AUTHOR.inspectionDate }));
  window.location.href = '../inspection1/inspection1.html';
}

// If we're arriving back from inspection1.html/inspection.html (the badge
// or the post-save "Continue authoring" action), auto-resume exactly
// where the user left off instead of making them re-pick the structure
// and date: select them, run the normal load, and jump straight to Draft.
// Cleared as soon as it's consumed so a later plain refresh of this page
// doesn't keep re-triggering it. Runs after loadStructures() (not instead
// of it) - the structure picker still needs populating on every load
// regardless of whether there's a return trip to resume.
async function resumeAuthorReturn(){
  const raw = sessionStorage.getItem('authorReturn');
  if (!raw) return;
  sessionStorage.removeItem('authorReturn');
  let target;
  try { target = JSON.parse(raw); } catch { return; }
  if (!target || !target.structureId || !target.date) return;

  const structureSelect = document.getElementById('structureSelect');
  if (!structureSelect.querySelector(`option[value="${target.structureId}"]`)) return;
  structureSelect.value = target.structureId;
  await onStructureChange();
  const inspectionSelect = document.getElementById('inspectionSelect');
  if (!inspectionSelect.querySelector(`option[value="${target.date}"]`)) return;
  inspectionSelect.value = target.date;
  await onLoad();
  goTo('author');
}
loadStructures().then(resumeAuthorReturn);

// ---- Upload a previous inspection (structure whose last inspection
// wasn't done in spanSense) - extracts per-element narrative out of an
// uploaded PDF/Word via /api/author/extract-previous-inspection, then
// converges on the exact same "loaded" state onLoad() reaches, just with
// no historical comparison (previousDate stays empty - the
// extracted content IS the starting draft, not a second data source
// diffed against something else). See extractPreviousInspection.js for
// why severity/extent default to 1/A rather than being parsed too.
let prevInspectionFile = null;
document.getElementById('prevInspectionZone').addEventListener('click', () => document.getElementById('prevInspectionInput').click());
document.getElementById('prevInspectionInput').addEventListener('change', function(){
  prevInspectionFile = this.files[0] || null;
  const titleEl = document.getElementById('prevInspectionZoneTitle');
  titleEl.textContent = prevInspectionFile ? prevInspectionFile.name : 'Upload a previous inspection report';
  document.getElementById('loadUploadBtn').disabled = !(prevInspectionFile && document.getElementById('structureSelect').value);
});
document.getElementById('structureSelect').addEventListener('change', function(){
  document.getElementById('loadUploadBtn').disabled = !(prevInspectionFile && this.value);
});

async function onLoadFromUpload(){
  const structureId = document.getElementById('structureSelect').value;
  if (!structureId || !prevInspectionFile) return;

  const loadBtn = document.getElementById('loadUploadBtn');
  loadBtn.disabled = true;
  loadBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Extracting…';
  try {
    const formData = new FormData();
    formData.append('file', prevInspectionFile);
    formData.append('structureId', structureId);
    const [extractRes, bridgeRes] = await Promise.all([
      fetch(`${API_BASE}/api/author/extract-previous-inspection`, { method: 'POST', body: formData }),
      fetch(`${API_BASE}/api/bridges/${structureId}`)
    ]);
    if (!extractRes.ok) throw new Error((await extractRes.json()).error || 'Failed to extract the document');
    const extract = await extractRes.json();
    const bridge = await bridgeRes.json();

    AUTHOR.loadedFromUpload = true;
    sessionStorage.setItem('structureId', structureId);
    sessionStorage.setItem('structureName', bridge.name);

    AUTHOR.structureId = structureId;
    AUTHOR.structureName = bridge.name;
    AUTHOR.structureType = extract.structureType;
    AUTHOR.organizationId = extract.organizationId;
    AUTHOR.inspectionDate = null;
    AUTHOR.previousDate = null;
    AUTHOR.structureDescription = bridge.description || null;
    AUTHOR.structureSpans = bridge.span_number || null;
    AUTHOR.structureLength = bridge.length || null;
    AUTHOR.structureBuiltYear = bridge.built_year || null;
    AUTHOR.structureMaterial = [bridge.primary_material, bridge.secondary_material].filter(Boolean).join(' / ') || null;
    AUTHOR.inspectorName = null;
    AUTHOR.bciAvg = null;
    AUTHOR.bciCrit = null;
    AUTHOR.diffElements = extract.elements.map(e => ({
      ...e,
      category: categoryFor(extract.structureType, e.elementNumber),
      extraDefects: []
    }));
    AUTHOR.photosByElement = {};
    AUTHOR.diffElements.forEach(el => { el.photos = []; });

    const summary = document.getElementById('uploadSummary');
    summary.innerHTML = extract.warning
      ? `<div class="no-history-note"><i class="fas fa-triangle-exclamation"></i> ${extract.warning}</div>`
      : `<div class="loaded-chip"><i class="fas fa-circle-check"></i> Extracted — review every card, this is a best-effort read of the document, not verified data.</div>`;

    const newInspRow = document.getElementById('newInspRow');
    newInspRow.style.display = 'block';
    const dateInput = document.getElementById('newInspectionDate');
    if (!dateInput.value) dateInput.value = new Date().toISOString().slice(0,10);
    AUTHOR.newInspectionDate = dateInput.value;
    AUTHOR.newInspectionType = document.getElementById('newInspectionType').value || null;

    document.getElementById('setupBottomNav').style.display = 'flex';
    await loadBranding(extract.organizationId);
    document.getElementById('brandingCard').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  } catch (err) {
    document.getElementById('uploadSummary').innerHTML =
      `<div class="no-history-note"><i class="fas fa-triangle-exclamation"></i> ${err.message}</div>`;
    console.error('Error extracting previous inspection:', err);
  } finally {
    loadBtn.disabled = false;
    loadBtn.innerHTML = '<i class="fas fa-arrow-right"></i> Load from this document';
  }
}
document.getElementById('loadUploadBtn').addEventListener('click', onLoadFromUpload);

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
document.getElementById('toReportViewBtn').addEventListener('click', () => {
  if (AUTHOR.loadedFromUpload) goTo('author');
  else goEditInInspection();
});

// ============================================================
// REPORT VIEW helpers (real data, read-only - no editing happens here;
// defect data itself is edited in inspection1.html/inspection.html)
// ============================================================
function statusInfo(status){
  return { defect:['defect','Defect'], good:['good','Good condition'], na:['na','Not applicable'], ninsp:['ninsp','Not inspected'] }[status];
}
function cmpLabel(cmp){
  return { new:'New', worsened:'Worsened', improved:'Improved', resolved:'Resolved', unchanged:'Unchanged', changed:'Changed', first:'First record' }[cmp] || '';
}
// Each defect's description in Report View/Export is its own raw comment,
// same as inspection.html/inspection1.html show it - no auto-generated
// narrative sentence. Elements with no defect (or a defect with no
// comment typed) fall back to a plain status label instead of an empty
// paragraph.
function defectDescriptionFor(el, extraIdx){
  const defect = extraIdx != null ? el.extraDefects[extraIdx] : el.current;
  return defect.comments || statusInfo(defect.status || 'defect')[1];
}
// Defect type -> category name (e.g. type 6 "Foundation"), same taxonomy
// as field/js/defectCodes.js's DEFECT_TYPE_MAP - duplicated locally since
// Author only loads test.js (DEFECT_TYPE_LABEL, the defect *text* half of
// this, e.g. "Settlement") and not the Field bundle. Combined the same way
// inspection.html's own preview does (getFullDefectDescription in
// inspection/spans.js), so the Report View table reads "Foundation -
// Settlement" instead of just a bare defect number.
const DEFECT_TYPE_CATEGORY = {
  1:'Metalwork', 2:'RC & prestressed concrete', 3:'Masonry, brickwork & MC', 4:'Paintwork & coatings',
  5:'Vegetation', 6:'Foundation', 7:'Invert, apron & riverbed', 8:'Drainage', 9:'Surfacing',
  10:'Expansion joints', 11:'Embankments', 12:'Bearings', 13:'Impact damage', 14:'Waterproofing',
  15:'Stone slab bridges', 16:'Timber'
};
function defectCodeLabel(type, number){
  const cat = DEFECT_TYPE_CATEGORY[Number(type)];
  const text = typeof defectTypeLabel === 'function' ? defectTypeLabel(type, number) : null;
  if (cat && text) return `${cat} - ${text}`;
  return cat || text || '—';
}
function elPhotosHTML(photos, containerCls){
  if (!photos || !photos.length) return '';
  const thumbCls = containerCls === 'doc-photos' ? 'doc-photo-thumb' : 'el-photo-thumb';
  return `<div class="${containerCls}">${photos.map(p =>
    `<img class="${thumbCls}" src="${p.url}" alt="${(p.description||'Site photo').replace(/"/g,'')}" title="${(p.description||'').replace(/"/g,'')}" onclick="window.open('${p.url}','_blank')">`
  ).join('')}</div>`;
}

document.getElementById('backToSetupBtn').addEventListener('click', () => goTo('setup'));

function sipEscapeHtml(str){
  return String(str == null ? '' : str).replace(/[&<>"']/g, function(c){
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
  });
}

// ============================================================
// DRAFT RIGHT RAIL — Conclusions, General Photos and Notes, stacked in
// one shared right-side rail (the same "always one click away"
// convention inspection.html's left-floating-rail/notes-tab use),
// instead of nesting these behind the Structure Info modal's tabs. Each
// opens its own small modal/drawer (reusing the .sip-overlay/
// .struct-info-panel glass-card shell Structure Info already established)
// rather than sharing one tab-switched surface. The left gutter stays
// BCI-cards + wizard-steps only. Shown/hidden per wizard step from goTo().
// ============================================================

// ---- Conclusions: a free-text field the base inspection never had a
// user-editable version of in Author (only the export narrative's
// auto-generated intro, buildConclusionsIntro() in authorNarrative.js).
// "Suggest Draft" reuses the same /api/draft-conclusions Gemini endpoint
// inspection.html's Conclusions modal uses (see suggestDraftConclusions()
// in inspection/spans.js), fed from AUTHOR.diffElements instead of
// sessionStorage. Saving goes straight to the DB via the narrow
// PATCH /api/inspections/:id/conclusions route - unlike inspection.html's
// version, which only lands in sessionStorage until the whole inspection
// is (re)saved through /update-inspection, Author has no such save step
// and isn't meant to rewrite the base inspection's spans/defects, so this
// needed its own narrow endpoint touching just that one column.
function renderConclusionsPanel(){
  const panel = document.getElementById('conclusionsPanel');
  if (!panel || !AUTHOR.structureId) return;
  panel.innerHTML = `
    <button class="sip-close" id="conclusionsClose" title="Close">&times;</button>
    <div class="sip-panel-title"><i class="fas fa-clipboard-check"></i> Conclusions</div>
    <div class="sip-meta">${AUTHOR.structureName || ''}</div>
    <textarea class="sip-conclusions-textarea" id="draftConclusionsText" placeholder="Summarise overall structure condition.">${sipEscapeHtml(AUTHOR.conclusions || '')}</textarea>
    <div class="sip-conclusions-actions">
      <button class="sip-suggest-btn" id="draftSuggestBtn"><i class="fas fa-wand-magic-sparkles"></i> Suggest Draft</button>
      <button class="sip-save-btn" id="draftSaveConclusionsBtn">Save Conclusions</button>
    </div>
  `;
  document.getElementById('conclusionsClose').addEventListener('click', closeConclusionsModal);
  document.getElementById('draftSuggestBtn').addEventListener('click', suggestAuthorConclusions);
  document.getElementById('draftSaveConclusionsBtn').addEventListener('click', saveAuthorConclusions);
}
function openConclusionsModal(){
  renderConclusionsPanel();
  document.getElementById('conclusionsOverlay').classList.add('show');
  document.body.classList.add('modal-open');
}
function closeConclusionsModal(){
  document.getElementById('conclusionsOverlay').classList.remove('show');
  document.body.classList.remove('modal-open');
}
function refreshConclusionsRailState(){
  const bar = document.getElementById('conclusionsBar');
  if (bar) bar.classList.toggle('done', !!(AUTHOR.conclusions && AUTHOR.conclusions.trim()));
}
function buildAuthorConclusionsSummary(){
  const defects = [];
  const collect = (name, d) => {
    if (!d || d.status !== 'defect') return;
    defects.push({
      element: name,
      code: `${d.defectType}.${d.defectNumber}`,
      description: (typeof defectTypeLabel === 'function' && defectTypeLabel(d.defectType, d.defectNumber)) || '',
      severity: d.severity, extent: d.extent,
      worksRequired: d.worksRequired, comment: d.comments || ''
    });
  };
  AUTHOR.diffElements.forEach(el => {
    collect(el.name, el.current);
    (el.extraDefects || []).forEach(d => collect(el.name, d));
  });
  defects.sort((a, b) => (parseInt(b.severity, 10) || 0) - (parseInt(a.severity, 10) || 0));
  return {
    structureType: AUTHOR.structureType || 'Bridge',
    elementsChecked: AUTHOR.diffElements.filter(e => e.current.status !== 'na').length,
    noDefectsCount: AUTHOR.diffElements.filter(e => e.current.status === 'good').length,
    notInspectedCount: AUTHOR.diffElements.filter(e => e.current.status === 'ninsp').length,
    bciAv: AUTHOR.bciAvg != null ? Number(AUTHOR.bciAvg.toFixed(2)) : 100,
    bciCrit: AUTHOR.bciCrit != null ? Number(AUTHOR.bciCrit.toFixed(2)) : 100,
    defects
  };
}
async function suggestAuthorConclusions(){
  const textarea = document.getElementById('draftConclusionsText');
  if (!textarea) return;
  if (textarea.value.trim().length > 0 && !confirm('This will replace the current text with a suggested draft. Continue?')) return;

  const btn = document.getElementById('draftSuggestBtn');
  const originalHtml = btn.innerHTML;
  btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Drafting…';
  try {
    const res = await fetch(`${API_BASE}/api/draft-conclusions`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildAuthorConclusionsSummary())
    });
    const result = await res.json();
    if (!res.ok || !result.success || !result.text) throw new Error(result.error || 'No draft returned');
    textarea.value = result.text;
  } catch (err) {
    console.error('Suggest draft failed:', err);
    alert('Could not draft conclusions right now. Please write your own, or try again shortly.');
  } finally {
    btn.disabled = false; btn.innerHTML = originalHtml;
  }
}
async function saveAuthorConclusions(){
  const textarea = document.getElementById('draftConclusionsText');
  if (!textarea || !AUTHOR.inspectionId) return;
  const btn = document.getElementById('draftSaveConclusionsBtn');
  btn.disabled = true; btn.textContent = 'Saving…';
  try {
    const res = await fetch(`${API_BASE}/api/inspections/${AUTHOR.inspectionId}/conclusions`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conclusions: textarea.value })
    });
    if (!res.ok) throw new Error('Save failed');
    AUTHOR.conclusions = textarea.value;
    refreshConclusionsRailState();
    btn.textContent = 'Saved';
    setTimeout(() => { if (btn) { btn.disabled = false; btn.textContent = 'Save Conclusions'; } }, 1200);
  } catch (err) {
    console.error('Save conclusions failed:', err);
    alert('Could not save conclusions. Please try again.');
    btn.disabled = false; btn.textContent = 'Save Conclusions';
  }
}

// ---- Notes: a running multi-entry log (inspection_notes), separate from
// Conclusions - same table/endpoints inspection/notesPanel.js uses, just
// without its queued-in-sessionStorage fallback, since Author only ever
// loads an already-recorded inspection (AUTHOR.inspectionId always exists
// once a structure+date is loaded). A sliding drawer off the right edge,
// same open/close mechanic as inspection.html's #notesPanel.
function renderDraftNotesList(){
  const list = document.getElementById('draftNotesList');
  const sub = document.getElementById('draftNotesSub');
  const badge = document.getElementById('draftNotesBadge');
  if (!list) return;
  const notes = AUTHOR.notes || [];
  list.innerHTML = notes.length ? notes.map(sipNoteCardHTML).join('') : '<div class="sip-notes-empty">No notes yet. Add one below.</div>';
  // Note text set via textContent here, not the innerHTML above, so a
  // note can't inject markup into the page - same convention as
  // inspection/notesPanel.js's noteCardHTML.
  list.querySelectorAll('.sip-note-card .sip-note-text').forEach((el, i) => { el.textContent = notes[i].text; });
  const fieldCount = notes.filter(n => n.source === 'field').length;
  sub.textContent = notes.length
    ? `${notes.length} note${notes.length === 1 ? '' : 's'}${fieldCount ? ` · ${fieldCount} from Field` : ''}`
    : 'No notes yet';
  if (badge) { if (notes.length) { badge.textContent = String(notes.length); badge.hidden = false; } else badge.hidden = true; }
}
function sipNoteCardHTML(note){
  const src = note.source === 'field' ? 'field' : 'core';
  const srcLabel = src === 'field' ? 'Field' : 'Core';
  return `
    <div class="sip-note-card">
      <div class="sip-note-top">
        <span class="sip-note-src sip-note-src-${src}">${srcLabel}</span>
        <span class="sip-note-meta">${sipTimeAgo(note.created_at)}</span>
      </div>
      <div class="sip-note-text"></div>
      ${note.author ? `<div class="sip-note-author">${sipEscapeHtml(note.author)}</div>` : ''}
    </div>`;
}
function sipTimeAgo(iso){
  if (!iso) return '';
  const then = new Date(iso);
  const diffMin = Math.round((Date.now() - then.getTime()) / 60000);
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return then.toLocaleDateString(undefined, { day: '2-digit', month: 'short' });
}
function openDraftNotesPanel(){
  renderDraftNotesList();
  document.getElementById('draftNotesPanel').classList.add('open');
  document.getElementById('draftNotesTab').classList.add('hide');
}
function closeDraftNotesPanel(){
  document.getElementById('draftNotesPanel').classList.remove('open');
  document.getElementById('draftNotesTab').classList.remove('hide');
}
async function addAuthorNote(){
  const input = document.getElementById('draftNotesInput');
  const btn = document.getElementById('draftNotesAddBtn');
  const text = input.value.trim();
  if (!text || !AUTHOR.inspectionId) return;
  btn.disabled = true;
  try {
    const res = await fetch(`${API_BASE}/api/inspections/${AUTHOR.inspectionId}/notes`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, source: 'core' })
    });
    const result = await res.json();
    if (!res.ok || !result.success) throw new Error(result.error || 'Failed to add note');
    AUTHOR.notes = [result.note, ...(AUTHOR.notes || [])];
    input.value = '';
    renderDraftNotesList();
  } catch (err) {
    console.error('Add note error:', err);
    alert('Could not add note: ' + err.message);
  } finally {
    btn.disabled = input.value.trim().length === 0;
  }
}

// ---- Photos: general/site photos not tied to any defect - same reserved
// defectId:'general' convention and upload endpoint
// inspection/photo.js's openGeneralPhotosModal() uses (and the same one
// Author's own defect-photo uploads already call, see uploadPendingPhotos
// above), and the same generic-by-id delete/caption endpoints. Uploads
// immediately on file selection rather than staging a pending/caption-
// first preview - matching how inspection.html's general photos already
// behave (see the "auto-upload as soon as they're added" comment in
// inspection/photo.js), not Author's own per-defect pending-upload flow.
function renderPhotosPanel(){
  const panel = document.getElementById('photosPanel');
  if (!panel || !AUTHOR.structureId) return;
  const photos = AUTHOR.generalPhotos || [];
  panel.innerHTML = `
    <button class="sip-close" id="photosClose" title="Close">&times;</button>
    <div class="sip-panel-title"><i class="fas fa-camera"></i> General Photos</div>
    <div class="sip-meta">${AUTHOR.structureName || ''}</div>
    ${photos.length ? '' : '<div class="sip-photos-empty">No general photos yet. Add site or general-arrangement photos below.</div>'}
    <div class="sip-photos-grid" id="draftPhotosGrid">
      ${photos.map(sipPhotoTileHTML).join('')}
      <div class="sip-photo-add-tile" id="draftPhotoAddTile"><i class="fas fa-camera"></i><span>Add photos</span></div>
    </div>
    <input type="file" id="draftPhotoInput" accept="image/*" multiple hidden>
    <div class="sip-photo-pending" id="draftPhotoPending"></div>
  `;
  document.getElementById('photosClose').addEventListener('click', closePhotosModal);
  document.getElementById('draftPhotoAddTile').addEventListener('click', () => document.getElementById('draftPhotoInput').click());
  document.getElementById('draftPhotoInput').addEventListener('change', function(){
    const files = Array.from(this.files || []);
    if (files.length) uploadAuthorGeneralPhotos(files);
    this.value = '';
  });
  panel.querySelectorAll('[data-sip-delete-photo]').forEach(btn => {
    btn.addEventListener('click', () => deleteAuthorGeneralPhoto(btn.dataset.sipDeletePhoto));
  });
  panel.querySelectorAll('[data-sip-caption-photo]').forEach(input => {
    input.addEventListener('change', () => saveAuthorPhotoCaption(input.dataset.sipCaptionPhoto, input.value));
  });
}
function openPhotosModal(){
  renderPhotosPanel();
  document.getElementById('photosOverlay').classList.add('show');
  document.body.classList.add('modal-open');
}
function closePhotosModal(){
  document.getElementById('photosOverlay').classList.remove('show');
  document.body.classList.remove('modal-open');
}
function sipPhotoTileHTML(photo){
  return `
    <div class="sip-photo-item">
      <div class="sip-photo-tile">
        <img src="${photo.url}" onclick="window.open('${photo.url}','_blank')">
        <button class="sip-photo-del" data-sip-delete-photo="${photo.id}" title="Delete photo"><i class="fas fa-xmark"></i></button>
      </div>
      <input class="sip-photo-caption" data-sip-caption-photo="${photo.id}" value="${sipEscapeHtml(photo.description||'')}" placeholder="Add a caption…">
    </div>`;
}
async function uploadAuthorGeneralPhotos(files){
  const pending = document.getElementById('draftPhotoPending');
  pending.textContent = `Uploading ${files.length} photo${files.length > 1 ? 's' : ''}…`;
  try {
    const formData = new FormData();
    files.forEach(f => formData.append('photos', f));
    files.forEach(() => formData.append('descriptions', ''));
    formData.append('defectId', 'general');
    formData.append('inspectionDate', AUTHOR.inspectionDate);
    const res = await fetch(`${API_BASE}/api/bridges/${AUTHOR.structureId}/inspection-photos`, { method: 'POST', body: formData });
    const result = await res.json();
    if (!res.ok || !result.success) throw new Error(result.error || 'Upload failed');
    AUTHOR.generalPhotos = AUTHOR.generalPhotos || [];
    result.photos.forEach(p => {
      AUTHOR.generalPhotos.push({ id: p.id, url: p.url, description: p.photo_description, displayOrder: p.display_order });
    });
    pending.textContent = '';
    renderPhotosPanel();
  } catch (err) {
    console.error('General photo upload failed:', err);
    pending.textContent = 'Upload failed: ' + err.message;
  }
}
async function deleteAuthorGeneralPhoto(photoId){
  if (!confirm('Delete this photo?')) return;
  try {
    const res = await fetch(`${API_BASE}/api/inspection-photos/${photoId}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Delete failed');
    AUTHOR.generalPhotos = (AUTHOR.generalPhotos || []).filter(p => String(p.id) !== String(photoId));
    renderPhotosPanel();
  } catch (err) {
    console.error('Photo delete failed:', err);
    alert('Could not delete photo: ' + err.message);
  }
}
async function saveAuthorPhotoCaption(photoId, value){
  try {
    const res = await fetch(`${API_BASE}/api/inspection-photos/${photoId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ photo_description: value })
    });
    if (!res.ok) throw new Error('Save failed');
    const photo = (AUTHOR.generalPhotos || []).find(p => String(p.id) === String(photoId));
    if (photo) photo.description = value;
  } catch (err) {
    console.error('Caption save failed:', err);
  }
}

document.getElementById('conclusionsBar').addEventListener('click', openConclusionsModal);
document.getElementById('conclusionsOverlay').addEventListener('click', (e) => {
  if (e.target.id === 'conclusionsOverlay') closeConclusionsModal();
});
document.getElementById('draftPhotosBar').addEventListener('click', openPhotosModal);
document.getElementById('photosOverlay').addEventListener('click', (e) => {
  if (e.target.id === 'photosOverlay') closePhotosModal();
});
document.getElementById('draftNotesTab').addEventListener('click', openDraftNotesPanel);
document.getElementById('draftNotesClose').addEventListener('click', closeDraftNotesPanel);
document.getElementById('draftNotesInput').addEventListener('input', function(){
  document.getElementById('draftNotesAddBtn').disabled = this.value.trim().length === 0;
});
document.getElementById('draftNotesAddBtn').addEventListener('click', addAuthorNote);
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  closeConclusionsModal();
  closePhotosModal();
  closeDraftNotesPanel();
});

// ============================================================
// SCREEN 2 — REPORT VIEW: one report-styled page, laid out like
// inspection.html's own #previewInspection popup (stat cards, a
// per-category defect table, conclusions) instead of Author's old
// Defect Data / Split View / Report Visual toggle. liveDefectList()
// is the same source of truth the PDF/Word exports already use, so
// what's shown here always matches what Export actually produces.
// ============================================================
function renderReportPane(){
  const order = categoryOrderFor(AUTHOR.structureType);
  const bands = buildPriorityBands(AUTHOR);
  const allDefects = liveDefectList();
  const noDefectCount = AUTHOR.diffElements.filter(e => e.current.status === 'good').length;
  const notInspectedCount = AUTHOR.diffElements.filter(e => e.current.status === 'ninsp').length;
  const worksRequiredCount = allDefects.filter(d => d.defect.worksRequired === 'Y').length;
  const bciAv = AUTHOR.bciAvg != null ? AUTHOR.bciAvg.toFixed(2) : '—';
  const bciCrit = AUTHOR.bciCrit != null ? AUTHOR.bciCrit.toFixed(2) : '—';

  const reportEl = document.getElementById('reportDoc');
  reportEl.style.setProperty('--accent', AUTHOR.branding.accentColor || '#5b8c8a');

  let html = `
    <div class="doc-cover">
      <div class="dc-brand">spanSense</div>
      <div class="dc-title">${AUTHOR.structureName || 'Untitled Structure'}</div>
      <div class="dc-sub">${INSPECTION_TYPE_LABELS[AUTHOR.newInspectionType || AUTHOR.inspectionType] || 'Inspection'} · Structure #${AUTHOR.structureId || '—'}${AUTHOR.inspectorName ? ' · ' + AUTHOR.inspectorName : ''}</div>
    </div>
    <div class="report-stat-grid">
      <div class="report-stat"><span class="rs-label">Inspection Date</span><span class="rs-value">${fmtDate(AUTHOR.newInspectionDate || AUTHOR.inspectionDate)}</span></div>
      <div class="report-stat"><span class="rs-label">Defects Found</span><span class="rs-value">${allDefects.length}</span></div>
      <div class="report-stat"><span class="rs-label">BCI<sub>avg</sub></span><span class="rs-value accent">${bciAv}</span></div>
      <div class="report-stat"><span class="rs-label">BCI<sub>crit</sub></span><span class="rs-value crit">${bciCrit}</span></div>
    </div>
    <div class="report-count-row">
      <span><b>${noDefectCount}</b> element(s) with no defects</span>
      <span><b>${notInspectedCount}</b> element(s) not inspected</span>
      <span><b>${worksRequiredCount}</b> defect(s) requiring works</span>
    </div>`;

  if (AUTHOR.structureDescription) {
    html += `<div class="doc-h1">2. Structure Description</div><p class="doc-p">${AUTHOR.structureDescription}</p>`;
  }

  html += `<div class="doc-h1">3. Description of Defects</div>`;
  let anyDefects = false;
  order.forEach((cat, ci) => {
    const rows = allDefects.filter(d => d.el.category === cat);
    if (!rows.length) return;
    anyDefects = true;
    html += `
      <div class="doc-h2">3.${ci+1} ${cat}</div>
      <div class="report-table-wrap"><table class="report-table">
        <thead><tr><th>Element</th><th>Sev</th><th>Ext</th><th>Defect</th><th>Works</th><th>Comment</th></tr></thead>
        <tbody>${rows.map(r => `
          <tr>
            <td>${r.el.name}${r.el.comparison ? `<span class="cmp-chip ${r.el.comparison}">${cmpLabel(r.el.comparison)}</span>` : ''}</td>
            <td><span class="rd-sev sev-${r.defect.severity||0}">${r.defect.severity||'-'}</span></td>
            <td><span class="rd-ext ext-${r.defect.extent||''}">${r.defect.extent||'-'}</span></td>
            <td>${defectCodeLabel(r.defect.defectType, r.defect.defectNumber)}</td>
            <td class="works-${r.defect.worksRequired||'N'}">${r.defect.worksRequired === 'Y' ? 'Yes' : r.defect.worksRequired === 'M' ? 'Monitor' : 'No'}</td>
            <td>${defectDescriptionFor(r.el, r.extraIdx)}</td>
          </tr>`).join('')}
        </tbody>
      </table></div>
      ${rows.map(r => elPhotosHTML(r.el.photos, 'doc-photos')).join('')}`;
  });
  if (!anyDefects) html += `<p class="doc-p na">No defects were recorded for this inspection.</p>`;

  html += `<div class="doc-h1">4. Conclusions and Recommendations</div>
    <p class="doc-p">${buildConclusionsIntro(AUTHOR)}</p>`;
  bands.forEach(b => {
    if(!b.items.length) return;
    html += `<div class="priority-band"><h4 class="${b.cls}">${b.label}</h4><ul>${b.items.map(i=>`<li>${i}</li>`).join('')}</ul></div>`;
  });
  reportEl.innerHTML = html;
}

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
        name: el.name, status: el.current.status, comparison: el.comparison, narrative: defectDescriptionFor(el),
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
  const { overlay, box } = showOverlay('fa-cog fa-spin', 'Generating Word report…', 'Assembling the report into a document');
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
    finishOverlay(box, overlay, 'fa-check', 'Downloaded', `${fileName} was generated from the data reviewed above.`);
  } catch(err){
    console.error('Word generation failed:', err);
    finishOverlay(box, overlay, 'fa-triangle-exclamation', 'Generation failed', err.message || 'Something went wrong building the document.', true);
  }
}

// Every current defect (primary + extras) across all elements, in Author's
// own live-edited state - the one place both PDF exporters below pull from,
// so a severity/extent/narrative edit (or an added/removed defect) actually
// shows up in what gets downloaded instead of whatever's still saved in
// the database.
function liveDefectList(){
  const out = [];
  AUTHOR.diffElements.forEach(el => {
    if (el.current.status === 'defect') out.push({ el, defect: el.current, extraIdx: null, isExtra: false });
    (el.extraDefects || []).forEach((extra, i) => out.push({ el, defect: extra, extraIdx: i, isExtra: true }));
  });
  return out;
}

// Real BCI Proforma PDF export - same generator/data shape as
// map.js's generateBCIProformaForDate, so the output is identical to the
// one downloadable from the Previous Inspections list. The fetched
// spansData/worksRequired are the last-saved DB state; span 1's defect
// list and BCI figures are then rebuilt from Author's live state so edits
// actually appear (Author doesn't support multi-span yet, so this only
// ever touches span 1).
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

    const span1 = spansData.find(s => Number(s.span_number) === 1) || spansData[0];
    if (span1) {
      const liveDefects = [];
      const liveWorksRequired = [];
      AUTHOR.diffElements.forEach(el => {
        const pushLive = (defect, isPrimary) => {
          liveDefects.push({
            element_no: el.elementNumber, element_description: el.name, is_primary: isPrimary,
            s: defect.severity, ex: defect.extent, def: defect.defectType, defn: defect.defectNumber,
            w: defect.worksRequired, p: defect.priority, cost: defect.cost,
            comments_remarks: defect.comments || ''
          });
          if (defect.worksRequired === 'Y') {
            liveWorksRequired.push({
              spanNumber: 1, elementNumber: el.elementNumber, elementDescription: el.name,
              worksRequired: 'Y', priority: defect.priority,
              cost: defect.cost ? `£${Number(defect.cost).toFixed(2)}` : 'Not specified',
              remedialWorks: defect.remedialWorks || '', comments: defect.comments || ''
            });
          }
        };
        if (el.current.status === 'defect') pushLive(el.current, true);
        (el.extraDefects || []).forEach(extra => pushLive(extra, false));
        if (el.current.status === 'good') liveDefects.push({ element_no: el.elementNumber, element_description: el.name, is_primary: true, def: '0', defn: '0' });
        else if (el.current.status === 'ninsp') liveDefects.push({ element_no: el.elementNumber, element_description: el.name, is_primary: true, def: '0', defn: '1' });
      });
      span1.defects = liveDefects;
      span1.bci_av = AUTHOR.bciAvg;
      span1.bci_crit = AUTHOR.bciCrit;
      worksRequired.worksRequired = liveWorksRequired;
    }

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
    finishOverlay(box, overlay, 'fa-check', 'Downloaded', `${fileName} was generated from Author's live severity/extent/works edits.`);
  } catch (err) {
    console.error('BCI Proforma generation failed:', err);
    finishOverlay(box, overlay, 'fa-triangle-exclamation', 'Generation failed', err.message || 'Something went wrong building the PDF.', true);
  }
}

// Full inspection report PDF - reuses the app's real report generator
// (test.js's generateSimplePDFReport / buildInspectionReportDocDefinition),
// so cover, TOC, structure details, photo appendix and BCI Proforma
// appendix are byte-for-byte the same format spanSense already produces
// elsewhere. defectOverrides/bciOverride replace its per-defect content
// and BCI summary with whatever Author currently has loaded (see
// generateSimplePDFReport in test.js) - matters for the "Upload a
// previous inspection" source path, whose extracted data was never saved
// as a real DB inspection for the generator to read on its own.
async function generateFullReportPdf(){
  if (!AUTHOR.structureId) { alert('Load a structure and inspection first.'); return; }
  const { overlay, box } = showOverlay('fa-cog fa-spin', 'Generating full report…', 'Assembling structure details, defects, and the BCI Proforma appendix');
  try {
    if (typeof window.generateSimplePDFReport !== 'function') {
      throw new Error('Report generator not loaded yet - please wait a moment and try again.');
    }
    const dateStr = AUTHOR.inspectionDate;
    const defectOverrides = liveDefectList().map(({ el, defect, isExtra }) => ({
      elementNumber: el.elementNumber, isExtra,
      defectDbId: defect.defectDbId, defectType: defect.defectType, defectNumber: defect.defectNumber,
      severity: defect.severity, extent: defect.extent, worksRequired: defect.worksRequired,
      priority: defect.priority, cost: defect.cost, remedialWorks: defect.remedialWorks,
      comments: defect.comments
    }));
    await window.generateSimplePDFReport({
      structure_id: AUTHOR.structureId,
      structure_name: AUTHOR.structureName,
      date: dateStr,
      defectOverrides,
      bciOverride: { bciAv: AUTHOR.bciAvg, bciCrit: AUTHOR.bciCrit }
    }, 'download');
    finishOverlay(box, overlay, 'fa-check', 'Downloaded', 'The full inspection report was generated from the data reviewed above.');
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
