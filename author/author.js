// Dynamic API Base URL (same convention as map.js) - lets the page still
// reach the real API when previewed from a static file server like Live
// Server on port 5500, which has no /api/* routes of its own.
const API_BASE = window.location.origin.includes('localhost')
    ? 'http://localhost:3000'
    : window.location.origin;

// bciProforma.pdfmake.js expects a global formatDate (normally supplied by
// test.js on pages that load it) - matches test.js's exact implementation.
function formatDate(dateString) {
    if (!dateString) return '--';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return dateString;
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
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
  inspectionDate: null, inspectionType: null, previousDate: null,
  diffElements: [], // [{ elementNumber, name, category, current, previous, comparison, editedNarrative? }]
  branding: { accentColor: '#5b8c8a', template: 'modern', logoUrl: null }
};

// ============================================================
// SCREEN NAVIGATION
// ============================================================
function goTo(step){
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('screen-' + step).classList.add('active');
  const order = ['setup','draft','author','export'];
  const idx = order.indexOf(step);
  document.querySelectorAll('.wizard-step').forEach(el => {
    const i = order.indexOf(el.dataset.step);
    el.classList.remove('active','done');
    if(i < idx) el.classList.add('done');
    else if(i === idx) el.classList.add('active');
  });
  document.querySelectorAll('.wizard-connector').forEach((el, i) => {
    el.classList.toggle('filled', i < idx);
  });
  if(step === 'draft') renderDraft();
  if(step === 'author') { renderDataPane(); renderReportPane(); }
  if(step === 'export') renderExport();
}

// ============================================================
// SCREEN 1 — SETUP: real structure/inspection picker
// ============================================================
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
    inspSel.innerHTML = dates.map(d => {
      const iso = new Date(d.date).toISOString().slice(0,10);
      return `<option value="${iso}">${fmtDate(d.date)} — ${d.type}</option>`;
    }).join('');
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
    const [diffRes, bridgeRes] = await Promise.all([
      fetch(`${API_BASE}/api/author/diff?structureId=${structureId}&date=${date}`),
      fetch(`${API_BASE}/api/bridges/${structureId}`)
    ]);
    if (!diffRes.ok) throw new Error((await diffRes.json()).error || 'Failed to load inspection data');
    const diff = await diffRes.json();
    const bridge = await bridgeRes.json();

    AUTHOR.structureId = structureId;
    AUTHOR.structureName = bridge.name;
    AUTHOR.structureType = diff.structureType;
    AUTHOR.organizationId = diff.organizationId;
    AUTHOR.inspectionDate = diff.currentDate;
    AUTHOR.previousDate = diff.previousDate;
    AUTHOR.diffElements = diff.elements.map(e => ({ ...e, category: categoryFor(diff.structureType, e.elementNumber) }));

    const summary = document.getElementById('loadedSummary');
    summary.innerHTML = `<div class="loaded-summary"><i class="fas fa-circle-check"></i><div>
        Loaded <b>${bridge.name}</b> — inspection dated ${fmtDate(diff.currentDate)}.
        ${diff.previousDate
          ? `<span class="prev-note">Comparing against the previous inspection on ${fmtDate(diff.previousDate)}.</span>`
          : `<span class="prev-note">No previous inspection found — this is the first recorded inspection for this structure.</span>`}
      </div></div>`;

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
function renderDraft(){
  document.getElementById('draftStructureName').textContent = AUTHOR.structureName || '—';
  const order = categoryOrderFor(AUTHOR.structureType);
  const wrap = document.getElementById('draftGroups');
  wrap.innerHTML = order.map(cat => {
    const els = AUTHOR.diffElements.filter(e => e.category === cat);
    if (!els.length) return '';
    return `<div class="cat-group">
      <div class="cat-title">${cat}</div>
      ${els.map(el => elRowHTML(el)).join('')}
    </div>`;
  }).join('');
  const total = AUTHOR.diffElements.length;
  const cats = order.filter(c => AUTHOR.diffElements.some(e => e.category === c)).length;
  document.getElementById('draftProgressText').textContent = `${total} elements drafted across ${cats} categories`;
  attachDraftEditors();
}
function narrativeFor(el){
  return el.editedNarrative != null ? el.editedNarrative : buildNarrative(el, AUTHOR.previousDate);
}
function elRowHTML(el){
  const [cls, label] = statusInfo(el.current.status);
  const editableFields = el.current.status === 'defect' ? `
    <div class="el-editor" id="editor-${el.elementNumber}">
      <span class="mini-lbl">Drafted narrative (edit directly — overrides the generated text)</span>
      <textarea data-field="narrative" data-el="${el.elementNumber}">${narrativeFor(el)}</textarea>
    </div>` : '';
  return `<div class="el-row" data-el="${el.elementNumber}">
    <div class="el-name">${el.name}</div>
    <div class="el-body">
      <span class="status-pill ${cls}">${label}</span>
      ${el.comparison ? `<span class="cmp-chip ${el.comparison}">${cmpLabel(el.comparison)}</span>` : ''}
      <div class="el-narrative" id="narrative-${el.elementNumber}">${narrativeFor(el)}</div>
      ${el.current.status === 'defect' ? `<button class="el-edit-btn" data-toggle="${el.elementNumber}"><i class="fas fa-pen"></i> Edit</button>` : ''}
      ${editableFields}
    </div>
  </div>`;
}
function attachDraftEditors(){
  document.querySelectorAll('[data-toggle]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.getElementById('editor-' + btn.dataset.toggle).classList.toggle('open');
    });
  });
  document.querySelectorAll('.el-editor [data-field="narrative"]').forEach(ta => {
    ta.addEventListener('input', () => {
      const el = AUTHOR.diffElements.find(x => String(x.elementNumber) === ta.dataset.el);
      if(!el) return;
      el.editedNarrative = ta.value;
      document.getElementById('narrative-' + el.elementNumber).textContent = ta.value;
      if(document.getElementById('screen-author').classList.contains('active')){ renderDataPane(); renderReportPane(); }
    });
  });
}
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
    </div>
    <div class="doc-h1">3. Description of Defects</div>`;
  order.forEach((cat, ci) => {
    const els = AUTHOR.diffElements.filter(e => e.category === cat);
    if (!els.length) return;
    html += `<div class="doc-h2">3.${ci+1} ${cat}</div>`;
    els.forEach((el, ei) => {
      html += `<div class="doc-h3">3.${ci+1}.${ei+1} ${el.name}</div>
        <p class="doc-p linked ${el.current.status === 'na' ? 'na' : ''}" data-el="${el.elementNumber}">${narrativeFor(el)}</p>`;
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
    branding: AUTHOR.branding,
    sections: order.map(cat => ({
      category: cat,
      elements: AUTHOR.diffElements.filter(e => e.category === cat).map(el => ({
        name: el.name, status: el.current.status, comparison: el.comparison, narrative: narrativeFor(el),
        severity: el.current.severity||null, extent: el.current.extent||null, priority: el.current.priority||null, cost: el.current.cost||null
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

function buildAuthorReportDocx(payload){
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

  children.push(heading('3. Description of Defects', d.HeadingLevel.HEADING_1));
  payload.sections.forEach((sec, ci) => {
    if (!sec.elements.length) return;
    children.push(heading('3.' + (ci + 1) + ' ' + sec.category, d.HeadingLevel.HEADING_2));
    sec.elements.forEach((el, ei) => {
      children.push(para('3.' + (ci + 1) + '.' + (ei + 1) + ' ' + el.name, { bold: true, after: 60 }));
      children.push(para(el.narrative, { after: 160, italics: el.status === 'na', color: el.status === 'na' ? REPORT_COLORS.muted : undefined }));
    });
  });

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
    const doc = buildAuthorReportDocx(payload);
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
    const dateStr = new Date(AUTHOR.inspectionDate).toISOString().slice(0,10);
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

document.getElementById('genWordBtn').addEventListener('click', generateWordReport);
document.getElementById('genPdfBtn').addEventListener('click', generateBciProformaPdf);

// ============================================================
// INIT
// ============================================================
goTo('setup');
