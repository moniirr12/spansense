// API_BASE is provided by test.js (loaded before this file).

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
  structureId: null, structureName: null, organizationId: null,
  inspectionDate: null, inspectionType: null, inspectorName: null,
  branding: { accentColor: '#5b8c8a', template: 'modern', logoUrl: null },
  // Whether the loaded data came from "Upload a previous inspection"
  // (AI-extracted, never a real DB row) rather than "From spanSense
  // records" - the extracted case has nothing for inspection1.html to
  // load, so Continue just confirms the extraction instead of handing off
  // (see the #toReportViewBtn listener below).
  loadedFromUpload: false
};

// ============================================================
// SCREEN 1 — SETUP: real structure/inspection picker. The only screen
// left in Author - Report View and Export used to live here too, but
// that review-and-generate work now happens on inspection.html itself
// (its own Preview button, and generation from its post-save screen),
// so Author's whole job is picking the structure/inspection and its
// branding, then handing off.
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
  // Compare-against + Load sit next to Structure now (not nested inside
  // #sourceRecords) since Structure itself is shared across all three
  // tabs - only these two need hiding for Upload, which has no "compare
  // against a base inspection" concept and its own Load button.
  document.getElementById('compareAgainstField').style.display = isUpload ? 'none' : 'block';
  document.getElementById('loadBtn').style.display = isUpload ? 'none' : 'flex';
  // newInspRow only exists for the upload path now (there's no real DB
  // date to stamp the report with until the record is actually saved) -
  // records/Field both hand off into inspection1.html, which already has
  // its own date/type editing.
  document.getElementById('newInspRow').style.display = (isUpload && AUTHOR.loadedFromUpload) ? 'block' : 'none';
  if (!isUpload && document.getElementById('structureSelect').value) onStructureChange();
});

// ---- Structure picker: searchable custom dropdown over the hidden
// #structureSelect - same visual component as twinview's own bridge
// selector (.selector-dropdown/.dropdown-menu/.dd-search/.dd-list,
// twin/twin.html), ported in as-is. The hidden <select> stays the real
// source of truth every onStructureChange()/resumeAuthorReturn() call
// already reads and sets - picking a dd-item just sets its value and
// fires 'change' like a native picker would; this only keeps the visible
// trigger/list in sync with whatever that select currently holds.
const structDropdown = document.getElementById('structDropdown');
const structDdTrigger = document.getElementById('structDdTrigger');
const structDdMenu = document.getElementById('structDdMenu');
const structDdSearch = document.getElementById('structDdSearch');
const structDdList = document.getElementById('structDdList');
const structDdName = document.getElementById('structDdName');
const structDdId = document.getElementById('structDdId');
let structDdOpen = false;

function setStructDdName(text, isPlaceholder){
  structDdName.textContent = text;
  structDdName.classList.toggle('placeholder', !!isPlaceholder);
}
function syncStructTrigger(){
  const id = document.getElementById('structureSelect').value;
  const s = AUTHOR.structures.find(b => String(b.id) === String(id));
  if (s) { setStructDdName(s.name, false); structDdId.textContent = '#' + s.id; }
  else { setStructDdName('Select a structure…', true); structDdId.textContent = ''; }
}
function renderStructDropdownList(filter){
  const term = (filter || '').toLowerCase().trim();
  const currentId = document.getElementById('structureSelect').value;
  const filtered = AUTHOR.structures.filter(b =>
    (b.name || '').toLowerCase().includes(term) || String(b.id).toLowerCase().includes(term)
  );
  if (!filtered.length) {
    structDdList.innerHTML = `<div class="dd-empty"><i class="fas fa-magnifying-glass"></i>No structures found</div>`;
    return;
  }
  structDdList.innerHTML = filtered.map(b => `
    <div class="dd-item ${String(b.id) === String(currentId) ? 'selected' : ''}" data-id="${b.id}">
      <span class="dd-icon"><i class="fas fa-bridge"></i></span>
      <span class="dd-text">
        <span class="dd-name">${b.name}</span>
        <span class="dd-id">#${b.id}</span>
      </span>
      <i class="fas fa-check dd-check"></i>
    </div>`).join('');
  structDdList.querySelectorAll('.dd-item').forEach(item => {
    item.addEventListener('click', () => {
      const sel = document.getElementById('structureSelect');
      sel.value = item.dataset.id;
      sel.dispatchEvent(new Event('change'));
      syncStructTrigger();
      closeStructDropdown();
    });
  });
}
function openStructDropdown(){
  structDdOpen = true;
  structDropdown.classList.add('active');
  structDdMenu.classList.add('open');
  structDdSearch.value = '';
  renderStructDropdownList();
  setTimeout(() => structDdSearch.focus(), 50);
}
function closeStructDropdown(){
  structDdOpen = false;
  structDropdown.classList.remove('active');
  structDdMenu.classList.remove('open');
}
structDdTrigger.addEventListener('click', function(e){
  e.stopPropagation();
  if (structDdOpen) closeStructDropdown(); else openStructDropdown();
});
structDdSearch.addEventListener('input', function(e){ renderStructDropdownList(e.target.value); });
structDdSearch.addEventListener('keydown', function(e){ if (e.key === 'Escape') closeStructDropdown(); });
document.addEventListener('click', function(e){
  if (structDdOpen && !structDropdown.contains(e.target)) closeStructDropdown();
});

async function loadStructures(){
  const sel = document.getElementById('structureSelect');
  try {
    const res = await fetch(`${API_BASE}/api/bridges`);
    if (res.status === 401) {
      sel.innerHTML = '<option value="">Not logged in</option>';
      setStructDdName('Not logged in', true);
      document.getElementById('loadedSummary').innerHTML =
        `<div class="no-history-note"><i class="fas fa-triangle-exclamation"></i> You need to be logged in to use Author. <a href="../index.html">Go to login</a></div>`;
      return;
    }
    if (!res.ok) throw new Error('Server returned ' + res.status);
    const bridges = await res.json();
    AUTHOR.structures = bridges;
    sel.innerHTML = '<option value="">Select a structure…</option>' +
      bridges.map(b => `<option value="${b.id}">${b.name} (#${b.id})</option>`).join('');
    setStructDdName('Select a structure…', true);
    renderStructDropdownList();
  } catch (err) {
    sel.innerHTML = '<option value="">Failed to load structures</option>';
    setStructDdName('Failed to load structures', true);
    console.error('Error loading structures:', err);
  }
}
// ---- Compare-against picker: same searchable-dropdown component as
// Structure (minus the search box - a structure's own inspection history
// is short enough not to need filtering), over the hidden
// #inspectionSelect. Real <option>s still get populated on it too, since
// resumeAuthorReturn() checks for one by value before resuming.
let inspDates = [];
const inspDropdown = document.getElementById('inspDropdown');
const inspDdTrigger = document.getElementById('inspDdTrigger');
const inspDdMenu = document.getElementById('inspDdMenu');
const inspDdList = document.getElementById('inspDdList');
const inspDdName = document.getElementById('inspDdName');
let inspDdOpen = false;

function setInspDdName(text, isPlaceholder){
  inspDdName.textContent = text;
  inspDdName.classList.toggle('placeholder', !!isPlaceholder);
}
function setInspDropdownEnabled(enabled){
  inspDropdown.classList.toggle('disabled', !enabled);
  if (!enabled) closeInspDropdown();
}
function syncInspTrigger(){
  const date = document.getElementById('inspectionSelect').value;
  const d = inspDates.find(x => x.date === date);
  setInspDdName(d ? `${fmtDate(d.date)} — ${d.type}` : 'Select a structure first', !d);
}
function renderInspDropdownList(){
  const currentDate = document.getElementById('inspectionSelect').value;
  inspDdList.innerHTML = inspDates.map(d => `
    <div class="dd-item ${d.date === currentDate ? 'selected' : ''}" data-date="${d.date}">
      <span class="dd-icon"><i class="fas fa-calendar-check"></i></span>
      <span class="dd-text">
        <span class="dd-name">${fmtDate(d.date)}</span>
        <span class="dd-id">${d.type}</span>
      </span>
      <i class="fas fa-check dd-check"></i>
    </div>`).join('');
  inspDdList.querySelectorAll('.dd-item').forEach(item => {
    item.addEventListener('click', () => {
      const sel = document.getElementById('inspectionSelect');
      sel.value = item.dataset.date;
      sel.dispatchEvent(new Event('change'));
      syncInspTrigger();
      closeInspDropdown();
    });
  });
}
function openInspDropdown(){
  if (inspDropdown.classList.contains('disabled')) return;
  inspDdOpen = true;
  inspDropdown.classList.add('active');
  inspDdMenu.classList.add('open');
}
function closeInspDropdown(){
  inspDdOpen = false;
  inspDropdown.classList.remove('active');
  inspDdMenu.classList.remove('open');
}
inspDdTrigger.addEventListener('click', function(e){
  e.stopPropagation();
  if (inspDdOpen) closeInspDropdown(); else openInspDropdown();
});
document.addEventListener('click', function(e){
  if (inspDdOpen && !inspDropdown.contains(e.target)) closeInspDropdown();
});

async function onStructureChange(){
  const structureId = document.getElementById('structureSelect').value;
  const inspSel = document.getElementById('inspectionSelect');
  const loadBtn = document.getElementById('loadBtn');
  inspSel.disabled = true; loadBtn.disabled = true;
  setInspDropdownEnabled(false);
  // newInspRow reflects the upload flow that was last actually loaded -
  // once the picker moves off that structure (back to the placeholder, or
  // on to a different one), its date/type no longer apply until an
  // extraction runs again.
  if (structureId !== AUTHOR.structureId) {
    document.getElementById('newInspRow').style.display = 'none';
  }
  if (!structureId) {
    inspSel.innerHTML = '<option value="">Select a structure first</option>';
    inspDates = []; setInspDdName('Select a structure first', true);
    return;
  }
  inspSel.innerHTML = '<option value="">Loading inspections…</option>';
  inspDates = []; setInspDdName('Loading inspections…', true);
  // "From Field" is the same dropdown, just narrowed to source:'field' rows
  // (inspections.source is 'field' or 'desktop', server.js:1618) - not a
  // separate endpoint or panel.
  const fieldOnly = document.querySelector('.source-tab.active')?.dataset.source === 'field';
  try {
    const res = await fetch(`${API_BASE}/api/inspection-dates/${structureId}`);
    const allDates = await res.json();
    const dates = fieldOnly ? allDates.filter(d => d.source === 'field') : allDates;
    if (!dates.length) {
      const msg = fieldOnly ? 'No Field-submitted inspections for this structure' : 'No inspections recorded for this structure';
      inspSel.innerHTML = `<option value="">${msg}</option>`;
      setInspDdName(msg, true);
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
    inspDates = dates;
    renderInspDropdownList();
    syncInspTrigger();
    setInspDropdownEnabled(true);
  } catch (err) {
    inspSel.innerHTML = '<option value="">Failed to load inspections</option>';
    setInspDdName('Failed to load inspections', true);
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
    const [bridgeRes, fullRes] = await Promise.all([
      fetch(`${API_BASE}/api/bridges/${structureId}`),
      fetch(`${API_BASE}/api/inspection/full?structure_id=${structureId}&date=${date}`)
    ]);
    if (!bridgeRes.ok) throw new Error('Failed to load structure data');
    const bridge = await bridgeRes.json();
    const full = fullRes.ok ? await fullRes.json() : {};

    AUTHOR.loadedFromUpload = false;

    // generateBCIFormForPDF (in test.js) reads these from sessionStorage
    // rather than accepting them as arguments - set here so the full-report
    // PDF export's Appendix B (BCI Proforma) can find them.
    sessionStorage.setItem('structureId', structureId);
    sessionStorage.setItem('structureName', bridge.name);

    AUTHOR.structureId = structureId;
    AUTHOR.structureName = bridge.name;
    AUTHOR.organizationId = bridge.organization_id;
    AUTHOR.inspectionDate = date;
    AUTHOR.inspectorName = full.inspectorName || null;
    AUTHOR.inspectionType = full.inspectionType || null;
    AUTHOR.bciAvg = full.overallBciave != null ? parseFloat(full.overallBciave) : null;
    AUTHOR.bciCrit = full.overallBcicrit != null ? parseFloat(full.overallBcicrit) : null;

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
        <div class="lrc-head"><i class="fas fa-circle-check"></i> Loaded</div>
        <div class="lrc-facts">
          <div class="lrc-fact"><span>Structure</span><b>${AUTHOR.structureName || '—'}</b></div>
          <div class="lrc-fact"><span>Date</span><b>${fmtDate(AUTHOR.inspectionDate)}</b></div>
          <div class="lrc-fact"><span>Type</span><b>${INSPECTION_TYPE_LABELS[AUTHOR.inspectionType] || AUTHOR.inspectionType || '—'}</b></div>
          <div class="lrc-fact"><span>Inspector</span><b>${AUTHOR.inspectorName || '—'}</b></div>
          <div class="lrc-fact"><span>BCI avg</span><b>${AUTHOR.bciAvg != null ? AUTHOR.bciAvg.toFixed(1) : '—'}</b></div>
          <div class="lrc-fact"><span>BCI crit</span><b class="crit">${AUTHOR.bciCrit != null ? AUTHOR.bciCrit.toFixed(1) : '—'}</b></div>
        </div>
      </div>`;

    document.getElementById('setupBottomNav').style.display = 'flex';
    await loadBranding(AUTHOR.organizationId);
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

// If we're arriving back from inspection1.html/inspection.html (the
// badge), auto-resume exactly where the user left off instead of making
// them re-pick the structure and date: select them and run the normal
// load, so the review card and branding are right there again. Cleared as
// soon as it's consumed so a later plain refresh of this page doesn't
// keep re-triggering it. Runs after loadStructures() (not instead of it)
// - the structure picker still needs populating on every load regardless
// of whether there's a return trip to resume.
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
  syncStructTrigger();
  await onStructureChange();
  const inspectionSelect = document.getElementById('inspectionSelect');
  if (!inspectionSelect.querySelector(`option[value="${target.date}"]`)) return;
  inspectionSelect.value = target.date;
  syncInspTrigger();
  renderInspDropdownList();
  await onLoad();
}
loadStructures().then(resumeAuthorReturn);

// ---- Upload a previous inspection (structure whose last inspection
// wasn't done in spanSense) - looks up the structure/organization out of
// an uploaded PDF/Word via /api/author/extract-previous-inspection, so
// its branding can still be set here. See extractPreviousInspection.js
// for how the extraction itself works.
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
    AUTHOR.organizationId = extract.organizationId;
    AUTHOR.inspectionDate = null;
    AUTHOR.inspectorName = null;
    AUTHOR.bciAvg = null;
    AUTHOR.bciCrit = null;

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
// Lives in a modal off the sticky rail bar now, not inline on Setup - it's
// "set once, reused automatically", so it doesn't need permanent space on
// a screen you hit every time. The swatch dot on the bar itself mirrors
// the current accent colour so there's still a glance-able answer to
// "what's set" without opening the modal.
function updateBrandingDot(color){
  const dot = document.getElementById('brandingSwatchDot');
  if (dot) dot.style.background = color || 'var(--teal)';
}
function openBrandingModal(){
  // The rail bar is always visible (branding lives here regardless of
  // whether a structure's loaded yet), but there's nothing to edit until
  // AUTHOR.organizationId exists - show a plain prompt instead of an
  // empty/broken form in that case.
  const hasOrg = !!AUTHOR.organizationId;
  document.getElementById('brandingEmptyState').style.display = hasOrg ? 'none' : 'block';
  document.getElementById('brandingFormBody').style.display = hasOrg ? 'block' : 'none';
  document.getElementById('brandingOverlay').classList.add('show');
  document.body.classList.add('modal-open');
}
function closeBrandingModal(){
  document.getElementById('brandingOverlay').classList.remove('show');
  document.body.classList.remove('modal-open');
}
document.getElementById('brandingBar').addEventListener('click', openBrandingModal);
document.getElementById('brandingClose').addEventListener('click', closeBrandingModal);
document.getElementById('brandingOverlay').addEventListener('click', (e) => {
  if (e.target.id === 'brandingOverlay') closeBrandingModal();
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeBrandingModal(); });

async function loadBranding(organizationId){
  try {
    const res = await fetch(`${API_BASE}/api/author/branding/${organizationId}`);
    const b = await res.json();
    AUTHOR.branding = { accentColor: b.accentColor, template: b.template, logoUrl: b.logoUrl };
    document.querySelectorAll('.swatch').forEach(s => s.classList.toggle('selected', s.dataset.color.toLowerCase() === b.accentColor.toLowerCase()));
    document.querySelectorAll('.template-card').forEach(c => c.classList.toggle('selected', c.dataset.template === b.template));
    updateBrandingDot(b.accentColor);
    const logoContent = document.getElementById('logoZoneContent');
    if (b.logoUrl) {
      logoContent.innerHTML = `<img class="logo-preview" src="${b.logoUrl}" alt="Client logo">`;
    } else {
      logoContent.innerHTML = `<i class="fas fa-image"></i><div class="u-title" style="font-size:.85rem;">Upload logo</div><div class="u-sub">PNG, SVG or JPG</div>`;
    }
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
// Swatch/template picks just update the staged selection (visual state +
// the rail's live preview dot) - nothing hits the server until Save is
// clicked, unlike the old auto-save-on-every-click version.
document.getElementById('swatchRow').addEventListener('click', function(e){
  const sw = e.target.closest('.swatch');
  if(!sw) return;
  document.querySelectorAll('.swatch').forEach(s => s.classList.remove('selected'));
  sw.classList.add('selected');
  AUTHOR.branding.accentColor = sw.dataset.color;
  updateBrandingDot(sw.dataset.color);
});
document.getElementById('templateGallery').addEventListener('click', function(e){
  const card = e.target.closest('.template-card');
  if(!card) return;
  document.querySelectorAll('.template-card').forEach(c => c.classList.remove('selected'));
  card.classList.add('selected');
  AUTHOR.branding.template = card.dataset.template;
});
document.getElementById('saveBrandingBtn').addEventListener('click', saveBranding);
// Records/Field path hands off into the real capture flow. The upload
// path has nowhere left to hand off to now that Report View is gone -
// extraction + branding are already saved by the point this is clickable,
// so Continue just confirms that rather than navigating anywhere. Worth
// revisiting: with no report to review the extracted data against, "Upload
// a previous inspection" may not have a real purpose left either.
document.getElementById('toReportViewBtn').addEventListener('click', () => {
  if (AUTHOR.loadedFromUpload) {
    document.getElementById('uploadSummary').insertAdjacentHTML('beforeend',
      '<div class="loaded-chip"><i class="fas fa-circle-check"></i> Branding saved for this client.</div>');
  } else {
    goEditInInspection();
  }
});

