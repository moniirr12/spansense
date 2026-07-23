(function () {
  'use strict';

  /* ============================================================
     STATE
     ============================================================ */
  const S = {
    session: null,
    structures: [],
    currentStructure: null,   // full row from Api.getBridge
    inspectionDates: [],
    elements: [],             // [{no, description, category}]
    draft: null,
    currentSpan: 1,
    homeTab: 'twin',
    listFilterBand: 'all',
    hideUntouched: false,
    currentDefectKey: null
  };

  const TYPE_META = {
    Bridge: { color: '#5b8c8a' }, Footbridge: { color: '#8ab4b0' },
    'Retaining wall': { color: '#c9a227' }, Culvert: { color: '#e07b39' },
    'Sign Gantry': { color: '#7c6fc4' }
  };
  const INSP_TYPE_META = {
    GI: { label: 'General Inspection', color: '#5b8c8a' },
    PI: { label: 'Principal Inspection', color: '#4a90b8' },
    SI: { label: 'Safety Inspection', color: '#c28b5a' }
  };
  function inspTypeMeta(type) {
    const key = (type || '').toUpperCase().startsWith('P') ? 'PI' : (type || '').toUpperCase().startsWith('S') ? 'SI' : 'GI';
    return INSP_TYPE_META[key];
  }

  /* ============================================================
     TOAST / MISC
     ============================================================ */
  let toastTimer = null;
  function toast(msg, ms = 2600) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), ms);
  }

  // spanSense-styled stand-in for window.confirm() - same yes/no contract
  // (resolves true/false), just not a native OS alert. Backdrop tap counts
  // as Cancel.
  function showConfirmModal({ title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel' }) {
    const overlay = document.getElementById('confirmOverlay');
    document.getElementById('confirmTitle').textContent = title;
    document.getElementById('confirmMessage').textContent = message || '';
    const okBtn = document.getElementById('confirmOkBtn');
    const cancelBtn = document.getElementById('confirmCancelBtn');
    okBtn.textContent = confirmLabel;
    cancelBtn.textContent = cancelLabel;
    overlay.classList.add('show');
    overlay.hidden = false;
    return new Promise((resolve) => {
      function done(result) {
        overlay.classList.remove('show');
        overlay.hidden = true;
        okBtn.onclick = null; cancelBtn.onclick = null; overlay.onclick = null;
        resolve(result);
      }
      okBtn.onclick = () => done(true);
      cancelBtn.onclick = () => done(false);
      overlay.onclick = (e) => { if (e.target === overlay) done(false); };
    });
  }

  /* ============================================================
     NAVIGATION STACK
     ============================================================ */
  const screens = {};
  document.querySelectorAll('.screen[data-screen]').forEach((el) => { screens[el.dataset.screen] = el; });
  let stack = ['structures'];

  function renderStack(animate) {
    Object.keys(screens).forEach((name) => {
      const el = screens[name];
      const idx = stack.indexOf(name);
      el.style.transition = animate === false ? 'none' : 'transform .3s cubic-bezier(.2,.8,.2,1)';
      if (idx === -1) { el.style.transform = 'translateX(100%)'; el.style.zIndex = 0; }
      else { el.style.transform = 'translateX(0)'; el.style.zIndex = 10 + idx; }
    });
  }
  function goto(name) { if (stack[stack.length - 1] !== name) stack.push(name); renderStack(true); updateTwinActiveState(); }
  function back() { if (stack.length > 1) { stack.pop(); renderStack(true); } updateTwinActiveState(); }
  // Route the on-screen back arrows through the browser's own History API
  // instead of calling back() directly, so they and the phone's hardware/
  // gesture back button end up on the exact same code path below (a tap
  // and a hardware back should behave identically, not one bypass the
  // other's exit-confirmation).
  document.querySelectorAll('[data-back]').forEach((btn) => btn.addEventListener('click', () => history.back()));

  // Keeps a single extra history entry ahead of wherever the app actually
  // is - popstate fires (below) the moment that entry gets consumed by a
  // back gesture, which is the hook that lets an in-app screen stack (not
  // a real multi-page history) intercept the phone's back button instead
  // of it just closing the PWA outright.
  function ensureHistoryGuard() { history.pushState({ fieldGuard: true }, '', location.href); }
  // showConfirmModal() isn't blocking like window.confirm() was, so a
  // second back-tap landing while it's still open needs its own guard
  // (awaitingExitConfirm) - and the confirmed exit itself replays through
  // history.back() to actually consume that guard, so exitConfirmed marks
  // that replay as "let it through" rather than popping up a second modal.
  let awaitingExitConfirm = false, exitConfirmed = false;
  window.addEventListener('popstate', () => {
    if (stack.length > 1) {
      back();
      ensureHistoryGuard();
      return;
    }
    if (exitConfirmed) return;
    ensureHistoryGuard();
    if (awaitingExitConfirm) return;
    awaitingExitConfirm = true;
    showConfirmModal({ title: 'Exit spanSense Field?', confirmLabel: 'Exit', cancelLabel: 'Stay' }).then((confirmed) => {
      awaitingExitConfirm = false;
      if (confirmed) { exitConfirmed = true; history.back(); }
    });
  });

  // Swipe-to-go-back: only from a thin sliver at the true left edge (12px,
  // safely inside the 16px margin every screen's cards sit within), same
  // convention iOS uses. Deliberately NOT a whole-screen swipe - TwinView's
  // own drag-to-orbit (see twin3d.js) already owns horizontal drags that
  // start in the middle of the canvas, and a screen-wide listener here
  // would fight it for the same gesture. Routes through history.back() so
  // it lands on the exact same popstate path as the hardware button and
  // the on-screen arrows, rather than a fourth slightly-different way to
  // go back.
  (function setupEdgeSwipeBack() {
    const EDGE_ZONE = 12, THRESHOLD = 70;
    let tracking = false, startX = 0, startY = 0;
    const stackEl = document.getElementById('stack');
    stackEl.addEventListener('pointerdown', (e) => {
      tracking = e.clientX <= EDGE_ZONE && stack.length > 1;
      startX = e.clientX; startY = e.clientY;
    });
    stackEl.addEventListener('pointerup', (e) => {
      if (!tracking) return;
      tracking = false;
      const dx = e.clientX - startX, dy = e.clientY - startY;
      if (dx > THRESHOLD && Math.abs(dy) < dx * 0.6) history.back();
    });
    stackEl.addEventListener('pointercancel', () => { tracking = false; });
  })();

  /* ============================================================
     NIGHT MODE
     ============================================================ */
  const nightBtn = document.getElementById('nightToggleBtn');
  function renderNightIcon() {
    const isNight = document.body.classList.contains('night-mode');
    nightBtn.innerHTML = isNight
      ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5z"/></svg>';
  }
  nightBtn.addEventListener('click', () => {
    document.body.classList.toggle('night-mode');
    localStorage.setItem('nightMode', document.body.classList.contains('night-mode') ? 'on' : 'off');
    renderNightIcon();
    refreshMapTileForNightMode();
  });
  renderNightIcon();

  document.getElementById('accountBtn').addEventListener('click', async () => {
    const confirmed = await showConfirmModal({
      title: 'Sign out?',
      message: `Signed in as ${S.session ? S.session.username : ''}.`,
      confirmLabel: 'Sign out'
    });
    if (confirmed) {
      try { await Api.logout(); } catch {}
      location.reload();
    }
  });

  /* ============================================================
     OFFLINE BANNER + SYNC QUEUE
     ============================================================ */
  function updateOfflineBanner() {
    document.getElementById('offlineBanner').hidden = navigator.onLine;
  }
  window.addEventListener('online', () => { updateOfflineBanner(); flushQueue(); });
  window.addEventListener('offline', updateOfflineBanner);
  updateOfflineBanner();
  // navigator.onLine is known to give false negatives on some networks/
  // browsers (it only reflects whether a network interface is up, not real
  // reachability) - a request that actually completes is stronger evidence
  // than that flag, so let real traffic correct a wrong "offline" reading.
  function noteRequestSucceeded() { document.getElementById('offlineBanner').hidden = true; }

  async function updateSyncBar() {
    const jobs = await FieldDB.listJobs();
    const bar = document.getElementById('syncBar');
    if (jobs.length === 0) { bar.hidden = true; return; }
    bar.hidden = false;
    document.getElementById('syncBarText').textContent =
      jobs.length === 1 ? '1 inspection pending sync' : `${jobs.length} inspections pending sync`;
  }
  document.getElementById('syncNowBtn').addEventListener('click', flushQueue);

  let flushing = false;
  async function flushQueue() {
    if (flushing) return;
    flushing = true;
    try {
      const jobs = await FieldDB.listJobs();
      for (const job of jobs) {
        try {
          await submitJob(job);
          await FieldDB.removeJob(job.id);
          toast(`Synced inspection for ${job.structureName}`);
        } catch (err) {
          await FieldDB.bumpAttempts(job.id);
          if (!err.offline) console.error('Sync failed for job', job.id, err);
          break; // stop on first failure, try the rest next time
        }
      }
    } finally {
      flushing = false;
      updateSyncBar();
    }
  }

  // Shared by the live save path and the queue flush: uploads every photo
  // blob for the job, builds photoData keyed by the exact temp key the
  // server computes in /save-inspection, then saves the inspection.
  async function submitJob(job) {
    const photoData = {};
    for (const p of job.photos) {
      const uploadRes = await Api.uploadPhotos(job.structureId, {
        defectId: p.tempDefectKey,
        inspectionDate: job.inspection.inspection_date,
        files: [{ blob: p.blob, filename: p.filename }],
        descriptions: [p.description || ''],
        displayOrders: [p.displayOrder || 0]
      });
      const uploaded = uploadRes.photos[0];
      if (!photoData[p.tempDefectKey]) photoData[p.tempDefectKey] = [];
      photoData[p.tempDefectKey].push({
        photo_url: uploaded.path,
        photo_description: p.description || '',
        display_order: p.displayOrder || 0
      });
    }
    return Api.saveInspection({ inspection: job.inspection, defects: job.defects, photoData });
  }

  /* ============================================================
     AUTH / LOGIN
     ============================================================ */
  const loginForm = document.getElementById('loginForm');
  const twofaForm = document.getElementById('twofaForm');

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('loginUsername').value.trim();
    const password = document.getElementById('loginPassword').value;
    const errEl = document.getElementById('loginError');
    errEl.hidden = true;
    const btn = document.getElementById('loginSubmitBtn');
    btn.disabled = true; btn.textContent = 'Signing in…';
    // A hosted server that's been idle can take up to a minute to wake up
    // on the first request - without this, that wait just looks identical
    // to the app being frozen, which is worse than a slow-but-explained one.
    const slowNotice = setTimeout(() => { btn.textContent = 'Still connecting… waking up the server'; }, 4000);
    try {
      const res = await Api.login(username, password);
      if (res.requires2FA) {
        loginForm.hidden = true;
        twofaForm.hidden = false;
      } else {
        await onAuthenticated();
      }
    } catch (err) {
      errEl.textContent = err.message;
      errEl.hidden = false;
    } finally {
      clearTimeout(slowNotice);
      btn.disabled = false; btn.textContent = 'Sign In';
    }
  });

  twofaForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const code = document.getElementById('twofaCode').value.trim();
    const errEl = document.getElementById('twofaError');
    errEl.hidden = true;
    try {
      await Api.login2fa(code);
      await onAuthenticated();
    } catch (err) {
      errEl.textContent = err.message;
      errEl.hidden = false;
    }
  });

  async function onAuthenticated() {
    let me = null;
    try { me = await Api.getMe(); } catch {}
    S.session = { username: me?.username, fullName: me?.full_name || me?.username, role: me?.role };
    document.getElementById('screen-login').style.display = 'none';
    document.getElementById('appShell').hidden = false;
    ensureHistoryGuard();
    updateSyncBar();
    await loadStructures();
  }

  async function boot() {
    try {
      const session = await Api.checkSession();
      noteRequestSucceeded();
      if (session.loggedIn) { await onAuthenticated(); return; }
    } catch {}
    // not logged in (or offline on first-ever load) - show login screen
  }
  boot();

  /* ============================================================
     STRUCTURES LIST
     ============================================================ */
  async function loadStructures() {
    const area = document.getElementById('structureListArea');
    try {
      S.structures = await Api.getBridges();
      noteRequestSucceeded();
      document.getElementById('structuresSubtitle').textContent =
        `${S.structures.length} total`;
      renderStructures();
    } catch (err) {
      area.innerHTML = `<div class="empty-state">${err.offline ? 'Offline. No cached structures yet.' : 'Could not load structures.'}</div>`;
    }
  }
  function renderStructures(filter) {
    const q = (filter || '').toLowerCase();
    const area = document.getElementById('structureListArea');
    const list = S.structures.filter((s) => !q || (s.name || '').toLowerCase().includes(q) || String(s.id).toLowerCase().includes(q));
    if (list.length === 0) { area.innerHTML = '<div class="empty-state">No structures match.</div>'; return; }
    area.innerHTML = '';
    list.forEach((s) => {
      const meta = TYPE_META[s.type] || TYPE_META.Bridge;
      const card = document.createElement('div');
      card.className = 'structure-card';
      card.onclick = () => openInspections(s.id);
      const bciVal = s.bci_av != null ? Math.round(s.bci_av) : null;
      const pill = bciVal != null
        ? (() => { const bc = FieldBCI.BAND_COLORS[FieldBCI.bandFromScore(bciVal)]; return `<span class="bci-pill" style="background:${bc.bg};color:${bc.c};">${bciVal}</span>`; })()
        : `<span class="bci-pill" style="background:var(--surface-2);color:var(--ink-faint);">--</span>`;
      card.innerHTML = `
        <div class="type-icon" style="background:${meta.color}22; color:${meta.color};">${typeIconSvg(s.type)}</div>
        <div class="structure-main"><div class="s-name">${escapeHtml(s.name)}</div><div class="s-sub">${escapeHtml(String(s.id))} · ${escapeHtml(s.type || 'Bridge')}</div></div>
        ${pill}`;
      area.appendChild(card);
    });
  }
  document.getElementById('structureSearch').addEventListener('input', (e) => renderStructures(e.target.value));

  function typeIconSvg(type) {
    if (type === 'Footbridge') return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="5" r="1.8" fill="currentColor" stroke="none"/><path d="M12 8v5M9 21l3-8 3 8M9 12l-2 3M15 12l2 3"/></svg>';
    if (type === 'Retaining wall') return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="9" width="18" height="11"/><path d="M3 9h18M8 9v11M13 9v11M18 9v11M3 14h18"/></svg>';
    if (type === 'Culvert' || type === 'Sign Gantry') return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.4"/></svg>';
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17c2-4 4-6 9-6s7 2 9 6"/><path d="M3 17h18M6 17v-4M12 17v-6M18 17v-4"/></svg>';
  }
  function escapeHtml(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  /* ============================================================
     INSPECTIONS LIST
     ============================================================ */
  async function openInspections(structureId) {
    goto('inspections');
    document.getElementById('inspTitle').textContent = '…';
    document.getElementById('inspectionRows').innerHTML = '<div class="empty-state">Loading…</div>';
    try {
      const [structure, dates] = await Promise.all([
        Api.getBridge(structureId),
        Api.getInspectionDates(structureId)
      ]);
      noteRequestSucceeded();
      S.currentStructure = structure;
      S.inspectionDates = dates;
      document.getElementById('inspTitle').textContent = structure.name;
      document.getElementById('inspSubtitle').textContent = `${structure.id} · ${structure.type || 'Bridge'}`;
      document.getElementById('inspInfoSpans').textContent = structure.span_number || structure.span || '--';
      document.getElementById('inspInfoLength').textContent = structure.length ? `${parseFloat(structure.length).toFixed(1)} m` : '--';
      document.getElementById('inspInfoBuilt').textContent = structure.built_year || '--';
      document.getElementById('structureDescriptionText').textContent = structure.description || 'No description recorded.';
      renderStructureMap(structure);
      renderInspectionRows();
    } catch (err) {
      document.getElementById('inspectionRows').innerHTML =
        `<div class="empty-state">${err.offline ? 'Offline. Open a structure you\'ve viewed before.' : 'Could not load this structure.'}</div>`;
    }
  }
  function renderInspectionRows() {
    const area = document.getElementById('inspectionRows');
    if (S.inspectionDates.length === 0) {
      area.innerHTML = '<div class="empty-state">No inspections recorded yet. Use + to start the first one.</div>';
      return;
    }
    area.innerHTML = '';
    S.inspectionDates.forEach((insp) => {
      const meta = inspTypeMeta(insp.type);
      const row = document.createElement('div');
      row.className = 'insp-row';
      row.onclick = () => openInspectionForEdit(insp.date);
      const fieldBadge = insp.source === 'field' ? '<span class="field-source-badge">Field</span>' : '';
      row.innerHTML = `
        <div class="type-dot" style="background:${meta.color};">${meta.label.split(' ')[0].slice(0, 2).toUpperCase()}</div>
        <div class="insp-main"><div class="i-title">${meta.label} ${fieldBadge}</div><div class="i-sub">${formatDate(insp.date)}</div></div>
        <div class="insp-status">View / Edit</div>`;
      area.appendChild(row);
    });
  }
  function formatDate(d) {
    try { return new Date(d).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' }); }
    catch { return d; }
  }

  /* --- Structure location map (Leaflet, same tile sources as desktop's Map page) --- */
  let structureMapInstance = null, structureMapMarker = null, structureMapTileLayer = null;
  const structureMapPinIcon = L.divIcon({
    className: 'structure-map-pin',
    html: '<svg viewBox="0 0 24 24" fill="#5b8c8a" stroke="#ffffff" stroke-width="1.5"><path d="M12 21s7-6.5 7-12a7 7 0 1 0-14 0c0 5.5 7 12 7 12z"/><circle cx="12" cy="9" r="2.6" fill="#fff"/></svg>',
    iconSize: [30, 30], iconAnchor: [15, 30]
  });
  function refreshMapTileForNightMode() {
    if (!structureMapInstance) return;
    if (structureMapTileLayer) structureMapInstance.removeLayer(structureMapTileLayer);
    const isNight = document.body.classList.contains('night-mode');
    structureMapTileLayer = isNight
      ? L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { subdomains: 'abcd', maxZoom: 19, attribution: '&copy; OpenStreetMap &copy; CARTO' })
      : L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap contributors' });
    structureMapTileLayer.addTo(structureMapInstance);
  }
  let currentMapLatLng = null;
  function openInGoogleMaps() {
    if (!currentMapLatLng) return;
    const { lat, lng } = currentMapLatLng;
    window.open(`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`, '_blank');
  }
  function renderStructureMap(structure) {
    const card = document.getElementById('structureMapCard');
    const lat = structure.latitude != null ? parseFloat(structure.latitude) : null;
    const lng = structure.longitude != null ? parseFloat(structure.longitude) : null;
    if (lat == null || lng == null || Number.isNaN(lat) || Number.isNaN(lng)) { card.hidden = true; return; }
    card.hidden = false;
    currentMapLatLng = { lat, lng };
    document.getElementById('structureLatLong').textContent = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    if (!structureMapInstance) {
      structureMapInstance = L.map('structureMap', { scrollWheelZoom: false }).setView([lat, lng], 15);
      refreshMapTileForNightMode();
      structureMapMarker = L.marker([lat, lng], { icon: structureMapPinIcon }).addTo(structureMapInstance);
      // Tapping the map (or its marker) offers to hand off to Google Maps -
      // this embedded one is just a location preview, not for turn-by-turn
      // navigation or anything Leaflet itself would need to handle.
      const onMapTap = async () => {
        if (await showConfirmModal({ title: 'Open in Google Maps?', message: 'View this structure\'s location in the Google Maps app.', confirmLabel: 'Open Maps' })) {
          openInGoogleMaps();
        }
      };
      structureMapInstance.on('click', onMapTap);
      structureMapMarker.on('click', onMapTap);
    } else {
      structureMapMarker.setLatLng([lat, lng]);
      structureMapInstance.setView([lat, lng], 15);
    }
    // Leaflet sizes itself off the container's on-screen dimensions at
    // creation time - if the screen was still off-canvas (mid slide-in
    // transform) at that moment, the map renders squashed until nudged.
    setTimeout(() => structureMapInstance && structureMapInstance.invalidateSize(), 300);
  }
  document.getElementById('newInspectionFab').addEventListener('click', () => startBlankInspection());

  /* ============================================================
     LOADING / STARTING A DRAFT
     ============================================================ */
  async function openInspectionForEdit(date) {
    try {
      const [full, elements] = await Promise.all([
        Api.getInspectionFull(S.currentStructure.id, date),
        loadElementsFor(S.currentStructure.type)
      ]);
      buildDraftFromInspection(full);
      openViewer();
    } catch (err) {
      toast(err.offline ? 'Offline. This inspection isn\'t cached yet.' : 'Could not load that inspection.');
    }
  }
  async function startBlankInspection() {
    try {
      await loadElementsFor(S.currentStructure.type);
    } catch (err) {
      toast(err.offline ? 'Offline. Element list not cached yet.' : 'Could not load element list.');
      return;
    }
    const totalSpans = parseInt(S.currentStructure.span_number || S.currentStructure.span || 1, 10) || 1;
    S.draft = {
      structureId: S.currentStructure.id,
      structureName: S.currentStructure.name,
      structureType: S.currentStructure.type || 'Bridge',
      inspectionType: 'General Inspection',
      baseDate: null,
      baseType: null,
      totalSpans,
      conclusions: '',
      spans: Array.from({ length: totalSpans }, (_, i) => ({ spanNumber: i + 1, comments: '' })),
      defects: []
    };
    S.currentSpan = 1;
    openViewer();
  }
  function buildDraftFromInspection(full) {
    S.draft = {
      structureId: S.currentStructure.id,
      structureName: S.currentStructure.name,
      structureType: S.currentStructure.type || 'Bridge',
      inspectionType: full.inspectionType || 'General Inspection',
      baseDate: full.inspectionDate,
      baseType: full.inspectionType,
      totalSpans: full.totalSpans || (full.spans || []).length || 1,
      conclusions: full.conclusions || '',
      spans: (full.spans && full.spans.length ? full.spans : [{ spanNumber: 1 }]).map((sp) => ({
        spanNumber: sp.spanNumber, comments: sp.comments || ''
      })),
      defects: (full.defects || []).map((d, i) => ({
        key: `orig-${i}`,
        defectDbId: d.defectDbId,
        spanNumber: d.spanNumber,
        elementNumber: d.elementNumber,
        elementDescription: d.elementDescription,
        defectType: String(d.defectId).split('.')[0],
        defectNumber: String(d.defectId).split('.')[1],
        severity: String(d.severity),
        extent: d.extent,
        worksRequired: d.worksRequired === true || d.worksRequired === 'Y' ? 'Y' : (d.worksRequired === 'M' ? 'M' : 'N'),
        priority: d.priority ? d.priority.charAt(0).toUpperCase() : '',
        cost: d.cost || '',
        comments: d.comments || '',
        remedial_works: d.remedialWorks || '',
        timestamp: d.timestamp || new Date().toISOString(),
        isPrimary: !!d.isPrimary,
        // Real 3D placement from the loaded inspection (twin/twin.js's
        // pos_x/y/z), kept only for TwinView display - never re-sent on
        // save, since this mobile draft has no way to place a NEW
        // defect's coordinates itself (out of scope for the "lighter"
        // TwinView), so posX/posY/posZ in the save payload stay null.
        origX: d.x != null ? d.x : null,
        origY: d.y != null ? d.y : null,
        origZ: d.z != null ? d.z : null,
        referencePhotos: d.photos || [], // old inspection's photos - view only, never re-uploaded
        photos: []
      }))
    };
    S.currentSpan = S.draft.spans[0] ? S.draft.spans[0].spanNumber : 1;
  }
  async function loadElementsFor(type) {
    const rows = await Api.getElements(type);
    S.elements = rows.map((r) => ({
      no: r.element_number,
      description: r.description,
      category: FieldBCI.categoryForElement(type, r.element_number)
    }));
  }

  /* ============================================================
     VIEWER SCREEN
     ============================================================ */
  function openViewer() {
    document.getElementById('viewerTitle').textContent = S.draft.structureName;
    document.getElementById('editBanner').hidden = !S.draft.baseDate;
    // Reviewing a cloned inspection: most elements are usually already
    // recorded, so declutter down to just what's there by default. A blank
    // first-time inspection needs every element reviewed anyway, so show
    // everything from the start instead of hiding the very thing to do.
    S.hideUntouched = !!S.draft.baseDate;
    if (S.draft.baseDate) {
      document.getElementById('editBanner').querySelector('span').innerHTML =
        `Copy of <strong>${inspTypeMeta(S.draft.baseType).label}, ${formatDate(S.draft.baseDate)}</strong> → saves as new.`;
    }
    renderSpanTabs();
    setHomeTab('twin');
    document.getElementById('viewerSaveBar').hidden = false;
    goto('viewer');
  }
  function renderSpanTabs() {
    const row = document.getElementById('spanTabsRow');
    row.innerHTML = '';
    S.draft.spans.forEach((sp) => {
      const btn = document.createElement('button');
      btn.className = 'span-tab' + (sp.spanNumber === S.currentSpan ? ' active' : '');
      btn.textContent = `Span ${sp.spanNumber}`;
      btn.onclick = () => { S.currentSpan = sp.spanNumber; renderSpanTabs(); refreshViewerContent(); };
      row.appendChild(btn);
    });
  }
  document.getElementById('viewerSubtitle').textContent = '';
  function refreshViewerContent() {
    document.getElementById('viewerSubtitle').textContent =
      `Span ${S.currentSpan} · ${inspTypeMeta(S.draft.inspectionType).label}`;
    updateBciTiles();
    renderTwin3D();
    renderDefectList();
    updateTwinActiveState();
  }

  // The new draft defaults to whatever type the copied-from inspection was
  // (or General Inspection for a blank one), but that's often not what
  // today's visit actually is - this lets it be changed at any point while
  // editing, not just locked in from the start.
  document.getElementById('viewerMenuBtn').addEventListener('click', openInspectionTypePicker);
  function openInspectionTypePicker() {
    const options = [INSP_TYPE_META.GI, INSP_TYPE_META.PI, INSP_TYPE_META.SI];
    const wrap = document.createElement('div');
    wrap.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,.4); z-index:500; display:flex; align-items:flex-end;';
    wrap.innerHTML = `
      <div style="background:var(--surface); width:100%; border-radius:20px 20px 0 0; padding:20px 18px calc(20px + env(safe-area-inset-bottom));">
        <div class="field-label" style="margin-bottom:12px;">Inspection type for this draft</div>
        <div id="typePickerOptions" style="display:flex; flex-direction:column; gap:8px; margin-bottom:14px;"></div>
        <button class="btn btn-secondary btn-block" id="typePickerCancel">Cancel</button>
      </div>`;
    const optsContainer = wrap.querySelector('#typePickerOptions');
    options.forEach((o) => {
      const selected = inspTypeMeta(S.draft.inspectionType).label === o.label;
      const btn = document.createElement('button');
      btn.className = 'field-chip-select';
      btn.style.width = '100%';
      btn.innerHTML = `<span style="display:flex; align-items:center; gap:9px;"><span style="width:8px; height:8px; border-radius:50%; background:${o.color}; flex-shrink:0;"></span>${o.label}</span>` +
        (selected ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" style="color:var(--teal-500);"><path d="M5 13l4 4L19 7"/></svg>' : '');
      btn.onclick = () => {
        S.draft.inspectionType = o.label;
        wrap.remove();
        refreshViewerContent();
      };
      optsContainer.appendChild(btn);
    });
    wrap.querySelector('#typePickerCancel').onclick = () => wrap.remove();
    wrap.addEventListener('click', (e) => { if (e.target === wrap) wrap.remove(); });
    document.body.appendChild(wrap);
  }

  document.getElementById('conclusionsInput').addEventListener('input', (e) => {
    if (S.draft) S.draft.conclusions = e.target.value;
  });

  /* ============================================================
     VOICE DICTATION - Web Speech API. Chrome/Android only (no iOS Safari
     support, and it needs a network round-trip to actually transcribe -
     both real constraints for a site with patchy signal, not just a nice-
     to-have footnote), so every mic button quietly hides itself instead of
     erroring when the API isn't available rather than pretending to work.
     ============================================================ */
  function attachDictation(btn, textarea, { timestamp = false } = {}) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) { btn.classList.add('unsupported'); return; }
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = navigator.language || 'en-GB';
    let listening = false;

    recognition.onresult = (e) => {
      let transcript = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) transcript += e.results[i][0].transcript;
      }
      transcript = transcript.trim();
      if (!transcript) return;
      if (timestamp) {
        // Notes only, not Comments/Remedial Works - each dictated burst
        // reads as its own timestamped log line rather than running into
        // whatever was typed/dictated before it. Manual typing is left
        // alone (no reliable way to tell "new thought" from "still the
        // same sentence, just paused"), only a fresh mic recording gets one.
        const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const prefix = textarea.value.trim() ? '\n' : '';
        const sentence = /[.!?]$/.test(transcript) ? transcript : `${transcript}.`;
        textarea.value += `${prefix}[${time}] ${sentence}`;
      } else {
        const needsSpace = textarea.value && !/[\s\n]$/.test(textarea.value);
        textarea.value += (needsSpace ? ' ' : '') + transcript + ' ';
      }
      textarea.dispatchEvent(new Event('input'));
    };
    recognition.onerror = () => stop();
    recognition.onend = () => stop();
    function stop() { listening = false; btn.classList.remove('listening'); try { recognition.stop(); } catch {} }
    function start() { try { recognition.start(); listening = true; btn.classList.add('listening'); } catch {} }

    btn.addEventListener('click', () => (listening ? stop() : start()));
  }
  attachDictation(document.getElementById('conclusionsMicBtn'), document.getElementById('conclusionsInput'), { timestamp: true });
  attachDictation(document.getElementById('defCommentsMicBtn'), document.getElementById('defComments'));
  attachDictation(document.getElementById('defRemedialMicBtn'), document.getElementById('defRemedial'));

  document.getElementById('tabTwinBtn').addEventListener('click', () => setHomeTab('twin'));
  document.getElementById('tabListBtn').addEventListener('click', () => setHomeTab('list'));
  document.getElementById('tabNotesBtn').addEventListener('click', () => setHomeTab('notes'));
  function setHomeTab(tab) {
    S.homeTab = tab;
    document.getElementById('tabTwinBtn').classList.toggle('active', tab === 'twin');
    document.getElementById('tabListBtn').classList.toggle('active', tab === 'list');
    document.getElementById('tabNotesBtn').classList.toggle('active', tab === 'notes');
    document.getElementById('twinTab').style.display = tab === 'twin' ? 'flex' : 'none';
    document.getElementById('listTab').style.display = tab === 'list' ? 'flex' : 'none';
    document.getElementById('notesTab').style.display = tab === 'notes' ? 'flex' : 'none';
    document.getElementById('twinPopup').classList.remove('show');
    // Neither the span selector nor "add a defect" make sense against a
    // whole-inspection free-text field with no element/span of its own.
    document.getElementById('spanTabsRow').style.display = tab === 'notes' ? 'none' : 'flex';
    document.getElementById('addDefectFab').style.display = tab === 'notes' ? 'none' : 'flex';
    if (tab === 'notes') { document.getElementById('conclusionsInput').value = S.draft.conclusions || ''; renderNotesPhotoStrip(); }
    refreshViewerContent();
  }
  // Pauses the 3D render loop (battery) whenever the viewer+TwinView tab
  // isn't the thing actually on screen - called after every navigation and
  // every tab switch, not just once, since either can change the answer.
  function updateTwinActiveState() {
    Twin3D.setActive(stack[stack.length - 1] === 'viewer' && S.homeTab === 'twin');
  }

  function spanDefects() {
    return S.draft.defects.filter((d) => d.spanNumber === S.currentSpan);
  }
  function isPlaceholder(d) { return d.defectType === '0'; }
  function defectCombined(d) { return `${d.defectType}.${d.defectNumber}`; }
  function defectRowBand(d) {
    if (defectCombined(d) === '0.0') return 'good';
    if (defectCombined(d) === '0.1') return 'fair';
    const sev = parseInt(d.severity, 10);
    if (sev <= 1) return 'good';
    if (sev === 2) return 'fair';
    if (sev >= 4) return sev === 5 ? 'critical' : 'poor';
    return 'poor';
  }

  /* --- BCI --- */
  function computeSpanBci() {
    const entries = spanDefects();
    const severityValues = [], extentValues = [], itemNumbers = [];
    S.elements.forEach((el) => {
      const forElement = entries.filter((d) => d.elementNumber === el.no);
      const primary = forElement.find((d) => d.isPrimary) || forElement[0];
      itemNumbers.push(el.no);
      severityValues.push(primary ? parseInt(primary.severity, 10) : 0);
      extentValues.push(primary ? primary.extent : 0);
    });
    return FieldBCI.calculateBCI(severityValues, extentValues, itemNumbers, S.draft.structureType);
  }
  function updateBciTiles() {
    const { bciAv, bciCrit } = computeSpanBci();
    const avVal = document.getElementById('bciAvVal'), avBand = document.getElementById('bciAvBand');
    const critVal = document.getElementById('bciCritVal'), critBand = document.getElementById('bciCritBand');
    const bc1 = FieldBCI.BAND_COLORS[FieldBCI.bandFromScore(bciAv)];
    const bc2 = FieldBCI.BAND_COLORS[FieldBCI.bandFromScore(bciCrit)];
    avVal.textContent = bciAv.toFixed(1); avVal.style.color = bc1.c;
    avBand.textContent = FieldBCI.BAND_LABELS[FieldBCI.bandFromScore(bciAv)];
    avBand.style.background = bc1.bg; avBand.style.color = bc1.c;
    critVal.textContent = bciCrit.toFixed(1); critVal.style.color = bc2.c;
    critBand.textContent = FieldBCI.BAND_LABELS[FieldBCI.bandFromScore(bciCrit)];
    critBand.style.background = bc2.bg; critBand.style.color = bc2.c;
  }

  /* --- TwinView: real 3D, reusing desktop's procedural model builders
     (twin/shapeBuilders.js + twin/bridgeModels.js, loaded as plain globals).
     Whole structure at once (not per-span - the model is one continuous
     structure, span tabs only filter the Defect List tab), auto-rotate
     only, tap a marker to preview. --- */
  let defectsLayerOn = true;
  let structureLayerOn = true;
  Twin3D.ensureInit(document.getElementById('twin3dCanvas'), (defect, evt) => {
    if (!defect) { document.getElementById('twinPopup').classList.remove('show'); return; }
    showTwinPopup(defect, evt);
  });
  document.getElementById('defectLayerPill').addEventListener('click', () => {
    defectsLayerOn = !defectsLayerOn;
    document.getElementById('defectLayerPill').classList.toggle('on', defectsLayerOn);
    Twin3D.setDefectsVisible(defectsLayerOn);
    document.getElementById('twinPopup').classList.remove('show');
  });
  document.getElementById('structureLayerPill').addEventListener('click', () => {
    structureLayerOn = !structureLayerOn;
    document.getElementById('structureLayerPill').classList.toggle('on', structureLayerOn);
    Twin3D.setStructureVisible(structureLayerOn);
  });

  function renderTwin3D() {
    const markerDefects = S.draft.defects
      .filter((d) => !isPlaceholder(d) && d.origX != null && d.origY != null && d.origZ != null)
      .map((d) => Object.assign({}, d, { x: d.origX, y: d.origY, z: d.origZ }));
    const totalSpans = S.draft.totalSpans || S.draft.spans.length || 1;
    const structureLength = S.currentStructure ? parseFloat(S.currentStructure.length) : null;
    const spanLength = structureLength && totalSpans ? structureLength / totalSpans : undefined;
    Twin3D.render({ id: S.draft.structureId, type: S.draft.structureType, spans: totalSpans, spanLength, defects: markerDefects });
    Twin3D.setDefectsVisible(defectsLayerOn);
    Twin3D.setStructureVisible(structureLayerOn);
    const hint = document.getElementById('twinHintText');
    hint.textContent = Twin3D.hasDefectMarkers()
      ? 'Drag to orbit, pinch to zoom, tap a marker to preview'
      : 'No defects have a placed 3D position yet on this structure · drag to orbit, pinch to zoom';
  }

  function showTwinPopup(d, evt) {
    const stage = document.getElementById('twinStage');
    const popup = document.getElementById('twinPopup');
    const bc = FieldBCI.BAND_COLORS[defectRowBand(d)];
    popup.innerHTML = `
      <p class="p-code">${defectCombined(d)}</p>
      <p class="p-title">${escapeHtml(d.elementDescription || elementDescFor(d.elementNumber))}</p>
      <div class="p-badges">
        <span style="background:${bc.bg}; color:${bc.c};">Sev ${d.severity}</span>
        <span style="background:rgba(255,255,255,.14); color:#eef4f2;">Ext ${d.extent}</span>
        <span style="background:rgba(255,255,255,.14); color:#eef4f2;">Span ${d.spanNumber}</span>
      </div>
      <button class="p-link">View / edit
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>
      </button>`;
    popup.querySelector('.p-link').onclick = () => { popup.classList.remove('show'); openDefectEdit(d.key); };
    const stageRect = stage.getBoundingClientRect();
    let left = (evt ? evt.clientX : stageRect.left + stageRect.width / 2) - stageRect.left - 100;
    left = Math.max(8, Math.min(left, stageRect.width - 208));
    let top = (evt ? evt.clientY : stageRect.top + 40) - stageRect.top - 160;
    if (top < 4) top = (evt ? evt.clientY : stageRect.top) - stageRect.top + 20;
    popup.style.left = left + 'px'; popup.style.top = top + 'px';
    popup.classList.add('show');
  }
  function elementDescFor(no) {
    const el = S.elements.find((e) => e.no === no);
    return el ? el.description : `Element ${no}`;
  }

  /* --- Defect list (grouped by category) --- */
  function renderDefectList() {
    const area = document.getElementById('defectListArea');
    const chipRow = document.getElementById('chipRow');
    const entries = spanDefects();
    const counts = { critical: 0, poor: 0, fair: 0, good: 0 };
    entries.forEach((d) => { if (!isPlaceholder(d)) counts[defectRowBand(d)]++; });
    const bandChip = (b) => {
      const label = b === 'all' ? `All · ${entries.filter((d) => !isPlaceholder(d)).length}` : `${b[0].toUpperCase()}${b.slice(1)} · ${counts[b]}`;
      return `<button class="chip${S.listFilterBand === b ? ' active' : ''}" data-band="${b}">${label}</button>`;
    };
    const untouchedCount = S.elements.filter((el) => !entries.some((d) => d.elementNumber === el.no)).length;
    const eyeIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
    const eyeOffIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a18.5 18.5 0 0 1 5.06-5.94M9.9 4.24A10.94 10.94 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19M14.12 14.12a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';
    const toggleChip = `<button class="chip chip-icon${S.hideUntouched ? '' : ' active'}" id="toggleUntouchedChip" title="${S.hideUntouched ? `Show all (${untouchedCount} hidden)` : 'Hide unrecorded elements'}">${S.hideUntouched ? eyeOffIcon : eyeIcon}</button>`;
    chipRow.innerHTML = bandChip('all') + toggleChip + ['critical', 'poor', 'fair', 'good'].map(bandChip).join('');
    chipRow.querySelectorAll('.chip[data-band]').forEach((c) => c.onclick = () => { S.listFilterBand = c.dataset.band; renderDefectList(); });
    document.getElementById('toggleUntouchedChip').onclick = () => { S.hideUntouched = !S.hideUntouched; renderDefectList(); };

    area.innerHTML = '';
    let lastCategory = null;
    S.elements.forEach((el) => {
      const forElement = entries.filter((d) => d.elementNumber === el.no);

      // Untouched elements (no record at all yet) only ever make sense
      // under "All" - they have no severity band to match a chip filter -
      // and are skipped outright when the declutter toggle is on.
      if (forElement.length === 0 && (S.hideUntouched || S.listFilterBand !== 'all')) return;

      const visible = forElement.filter((d) => S.listFilterBand === 'all' || defectRowBand(d) === S.listFilterBand);
      if (S.listFilterBand !== 'all' && forElement.length && visible.length === 0) return;

      if (el.category !== lastCategory) {
        lastCategory = el.category;
        const h = document.createElement('p'); h.className = 'cat-label'; h.textContent = el.category || '';
        area.appendChild(h);
      }

      visible.forEach((d) => area.appendChild(renderDefectRow(el, d)));

      if (S.listFilterBand === 'all') {
        if (forElement.length === 0) {
          area.appendChild(renderQuickActionsRow(el));
        } else {
          const link = document.createElement('div');
          link.className = 'no-defect-row';
          link.style.background = 'transparent'; link.style.border = 'none'; link.style.justifyContent = 'flex-end'; link.style.padding = '0 4px';
          link.innerHTML = `<button style="margin-left:0;">+ Add another defect here</button>`;
          link.querySelector('button').onclick = () => openDefectEdit(null, el);
          area.appendChild(link);
        }
      }
    });
    if (area.children.length === 0) {
      area.innerHTML = S.hideUntouched
        ? '<div class="empty-state">Nothing recorded yet for this span. Tap "Show all" to review every element.</div>'
        : '<div class="empty-state">No defects in this band for this span.</div>';
    }
  }
  function renderDefectRow(el, d) {
    const combined = defectCombined(d);
    if (combined === '0.0' || combined === '0.1') {
      const row = document.createElement('div');
      row.className = 'no-defect-row';
      row.style.background = combined === '0.0' ? 'var(--good-bg)' : 'var(--fair-bg)';
      row.style.borderColor = combined === '0.0' ? 'var(--good)' : 'var(--fair)';
      row.style.cursor = 'pointer';
      row.onclick = () => openDefectEdit(d.key);
      const icon = combined === '0.0'
        ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4 4L19 7"/></svg>'
        : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v4M12 16h.01"/></svg>';
      row.innerHTML = `${icon}<span style="color:${combined === '0.0' ? 'var(--good)' : 'var(--fair)'}">${escapeHtml(el.description)}: ${combined === '0.0' ? 'no defects recorded' : 'not inspected'}</span>`;
      return row;
    }
    const row = document.createElement('div');
    row.className = 'defect-row';
    row.onclick = () => openDefectEdit(d.key);
    const band = defectRowBand(d);
    const colorMap = { good: '#2d7a6e', fair: '#BA7517', poor: '#c47070', critical: '#c0392b' };
    row.innerHTML = `
      <div class="item-badge">${el.no}</div>
      <div class="row-main"><div class="desc">${escapeHtml(d.elementDescription || el.description)}</div><div class="sub">${escapeHtml(el.description)} · ${combined}</div></div>
      <div class="sev-dot" style="background:${colorMap[band]};">${d.severity}</div>
      <span class="extent-pill">${d.extent}</span>`;
    return row;
  }
  function renderQuickActionsRow(el) {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'margin:0 16px 10px;';
    wrap.innerHTML = `
      <div style="display:flex; align-items:center; gap:11px; margin-bottom:8px;">
        <div class="item-badge">${el.no}</div>
        <div class="row-main"><div class="desc">${escapeHtml(el.description)}</div></div>
      </div>
      <div style="display:flex; gap:8px;">
        <button class="chip" style="flex:1;">No Defects</button>
        <button class="chip" style="flex:1;">Not Inspected</button>
        <button class="chip" style="flex:1; background:var(--good-bg); border-color:var(--teal-300); color:var(--teal-700);">+ Add Defect</button>
      </div>`;
    const [noDef, notInsp, addDef] = wrap.querySelectorAll('button');
    noDef.onclick = () => quickRecord(el, '0', '0');
    notInsp.onclick = () => quickRecord(el, '0', '1');
    addDef.onclick = () => openDefectEdit(null, el);
    return wrap;
  }
  function quickRecord(el, defectType, defectNumber) {
    S.draft.defects.push({
      key: `new-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      defectDbId: null,
      spanNumber: S.currentSpan,
      elementNumber: el.no,
      elementDescription: el.description,
      defectType, defectNumber,
      severity: '1', extent: 'A', worksRequired: 'N', priority: '', cost: '',
      comments: '', remedial_works: '', timestamp: new Date().toISOString(),
      isPrimary: true, referencePhotos: [], photos: []
    });
    renderDefectList();
    updateBciTiles();
    renderTwinPins();
  }

  document.getElementById('addDefectFab').addEventListener('click', () => {
    setHomeTab('list');
    openElementPicker();
  });
  function openElementPicker() {
    // Lightweight native <select> prompt built inline - avoids a whole
    // extra screen just to choose which element a brand-new defect is on.
    const options = S.elements.map((e) => `<option value="${e.no}">${e.no}. ${escapeHtml(e.description)} (${e.category})</option>`).join('');
    const wrap = document.createElement('div');
    wrap.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,.4); z-index:500; display:flex; align-items:flex-end;';
    wrap.innerHTML = `
      <div style="background:var(--surface); width:100%; border-radius:20px 20px 0 0; padding:20px 18px calc(20px + env(safe-area-inset-bottom));">
        <div class="field-label">Choose element</div>
        <select id="elementPickerSelect" style="width:100%; padding:12px; border-radius:12px; border:1px solid var(--border); background:var(--surface-2); color:var(--ink); font-size:14px; margin-bottom:14px;">${options}</select>
        <div style="display:flex; gap:10px;">
          <button class="btn btn-secondary" style="flex:1;" id="elementPickerCancel">Cancel</button>
          <button class="btn btn-primary" style="flex:1;" id="elementPickerGo">Continue</button>
        </div>
      </div>`;
    document.body.appendChild(wrap);
    wrap.querySelector('#elementPickerCancel').onclick = () => wrap.remove();
    wrap.querySelector('#elementPickerGo').onclick = () => {
      const no = parseInt(wrap.querySelector('#elementPickerSelect').value, 10);
      const el = S.elements.find((e) => e.no === no);
      wrap.remove();
      openDefectEdit(null, el);
    };
  }

  /* ============================================================
     DEFECT EDIT SCREEN
     ============================================================ */
  let editingNewElement = null;
  function openDefectEdit(key, newForElement) {
    S.currentDefectKey = key;
    editingNewElement = newForElement || null;
    const d = key ? S.draft.defects.find((x) => x.key === key) : null;
    const el = d ? S.elements.find((e) => e.no === d.elementNumber) : newForElement;

    document.getElementById('defTitle').textContent = d ? (isPlaceholder(d) ? 'Element status' : 'Edit defect') : 'New defect';
    document.getElementById('defSubtitle').textContent = `Span ${S.currentSpan}`;
    document.getElementById('defElementDisplay').textContent = el ? `${el.no}. ${el.description}` : '--';
    document.getElementById('defectDeleteBtn').style.visibility = d ? 'visible' : 'hidden';

    const typeCode = document.getElementById('defTypeCode');
    const numCode = document.getElementById('defNumberCode');
    const typeLabel = document.getElementById('defTypeLabel');
    const isPh = d && isPlaceholder(d);
    document.getElementById('defectTypeGroup').style.display = isPh ? 'none' : 'block';
    typeCode.value = d && !isPh ? d.defectType : '';
    numCode.value = d && !isPh ? d.defectNumber : '';
    typeLabel.value = d ? (d.elementDescription && d.elementDescription !== el?.description ? d.elementDescription : '') : '';

    // Severity/extent/works are meaningless on a No Defects / Not Inspected
    // placeholder row (they're pinned at 1A by definition) - hide them and
    // require an explicit "convert" step rather than letting the steppers
    // drift the row into an invalid state (e.g. severity 4 on a "0.0" code).
    const sevGroup = document.getElementById('sevStepper').closest('.field-group');
    const extGroup = document.getElementById('extStepper').closest('.field-group');
    const worksGroup = document.getElementById('worksStepper').closest('.field-group');
    sevGroup.style.display = isPh ? 'none' : 'block';
    extGroup.style.display = isPh ? 'none' : 'block';
    worksGroup.style.display = isPh ? 'none' : 'block';

    const existingNote = document.getElementById('placeholderNote');
    if (existingNote) existingNote.remove();
    if (isPh) {
      const note = document.createElement('div');
      note.id = 'placeholderNote';
      note.className = 'field-group';
      const label = defectCombined(d) === '0.0' ? 'No Defects' : 'Not Inspected';
      note.innerHTML = `<div class="field-static" style="margin-bottom:10px;">Marked as <strong>${label}</strong> for this element.</div>
        <button class="btn btn-secondary btn-block" id="convertPlaceholderBtn">Log a real defect instead</button>`;
      sevGroup.parentNode.insertBefore(note, sevGroup);
      note.querySelector('#convertPlaceholderBtn').onclick = () => {
        d.defectType = '1'; d.defectNumber = '1';
        openDefectEdit(d.key);
      };
    }

    setStepperValue('sevStepper', d ? d.severity : '1');
    setStepperValue('extStepper', d ? d.extent : 'A');
    setStepperValue('worksStepper', d ? d.worksRequired : 'N');
    setStepperValue('priorityStepper', d ? (d.priority || 'M') : 'M');
    document.getElementById('defCost').value = d ? d.cost : '';
    document.getElementById('worksDetailGroup').hidden = isPh ? true : !(d ? d.worksRequired === 'Y' : false);
    document.getElementById('defComments').value = d ? d.comments : '';
    document.getElementById('defRemedial').value = d ? d.remedial_works : '';
    document.getElementById('sevExtWarning').hidden = true;

    renderPhotoStrip(d);

    // previously-used defect types for this element, as a hint (see
    // /api/previous-defects) - genuinely useful since recurring defects
    // repeat element+type across inspections most of the time.
    const hint = document.getElementById('prevDefectHint');
    hint.hidden = true;
    if (!d && el) {
      Api.getPreviousDefects(S.draft.structureId, el.no).then((prev) => {
        const real = prev.filter((p) => !(p.defect_type === '0'));
        if (real.length) {
          hint.hidden = false;
          hint.textContent = `Previously recorded here: ${real.slice(0, 3).map((p) => `${p.defect_type}.${p.defect_number}`).join(', ')}`;
        }
      }).catch(() => {});
    }

    goto('defectEdit');
  }
  function setStepperValue(id, val) {
    document.querySelectorAll(`#${id} button`).forEach((b) => b.classList.toggle('sel', b.dataset.v === String(val)));
  }
  function getStepperValue(id) {
    const sel = document.querySelector(`#${id} button.sel`);
    return sel ? sel.dataset.v : null;
  }
  document.querySelectorAll('.stepper').forEach((stepper) => {
    stepper.addEventListener('click', (e) => {
      const btn = e.target.closest('button'); if (!btn) return;
      setStepperValue(stepper.id, btn.dataset.v);
      if (stepper.id === 'worksStepper') {
        document.getElementById('worksDetailGroup').hidden = btn.dataset.v !== 'Y';
      }
      if (stepper.id === 'sevStepper' || stepper.id === 'extStepper') {
        document.getElementById('sevExtWarning').hidden = true;
      }
    });
  });

  // Shared by the per-defect photo strip and the Notes tab's general site
  // photos - same thumbnails/remove/add-tile behavior, different container
  // and different "what happens on Add".
  function renderPhotoStripInto(containerId, d, onAddClick) {
    const strip = document.getElementById(containerId);
    strip.innerHTML = '';
    (d?.referencePhotos || []).forEach((p) => {
      const thumb = document.createElement('div');
      thumb.className = 'photo-thumb';
      thumb.style.backgroundImage = `url('${p.url}')`;
      thumb.style.opacity = '0.55';
      thumb.innerHTML = `<span class="photo-pending-badge">Previous</span>`;
      strip.appendChild(thumb);
    });
    (d?.photos || []).forEach((p, idx) => {
      const thumb = document.createElement('div');
      thumb.className = 'photo-thumb';
      thumb.style.backgroundImage = `url('${p.localUrl}')`;
      thumb.innerHTML = `<span class="photo-pending-badge">New</span>
        <button class="photo-remove"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button>`;
      thumb.querySelector('.photo-remove').onclick = (e) => { e.stopPropagation(); URL.revokeObjectURL(p.localUrl); d.photos.splice(idx, 1); renderPhotoStripInto(containerId, d, onAddClick); };
      strip.appendChild(thumb);
    });
    const addTile = document.createElement('button');
    addTile.className = 'photo-add-tile';
    addTile.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>Add`;
    addTile.onclick = onAddClick;
    strip.appendChild(addTile);
  }
  function renderPhotoStrip(d) {
    renderPhotoStripInto('defPhotoStrip', d, () => document.getElementById('cameraInput').click());
  }

  // General site photos - not tied to any element/defect, same idea as the
  // Notes tab's free-text field. Reuses the exact same defects/defect_photos
  // plumbing as a real defect (a reserved (elementNumber 0, defectType
  // '0', defectNumber '2') record, same convention as the existing 0.0/0.1
  // No-Defects/Not-Inspected codes) so save/upload needs no server changes -
  // it never matches a real element, so it's automatically excluded from
  // BCI scoring and never appears in the per-element Defect List.
  const GENERAL_PHOTO_ELEMENT = 0;
  function findGeneralPhotoEntry() {
    return S.draft.defects.find((d) => d.elementNumber === GENERAL_PHOTO_ELEMENT && d.defectType === '0' && d.defectNumber === '2');
  }
  function ensureGeneralPhotoEntry() {
    let entry = findGeneralPhotoEntry();
    if (!entry) {
      entry = {
        key: `general-${Date.now()}`, defectDbId: null, spanNumber: 1, elementNumber: GENERAL_PHOTO_ELEMENT,
        elementDescription: 'General site photos', defectType: '0', defectNumber: '2',
        severity: '1', extent: 'A', worksRequired: 'N', priority: '', cost: '',
        comments: '', remedial_works: '', timestamp: new Date().toISOString(), isPrimary: false,
        referencePhotos: [], photos: []
      };
      S.draft.defects.push(entry);
    }
    return entry;
  }
  function renderNotesPhotoStrip() {
    renderPhotoStripInto('notesPhotoStrip', findGeneralPhotoEntry(), () => document.getElementById('notesCameraInput').click());
  }
  document.getElementById('notesCameraInput').addEventListener('change', (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const entry = ensureGeneralPhotoEntry();
    files.forEach((file) => entry.photos.push({ blob: file, filename: file.name, description: '', displayOrder: entry.photos.length, localUrl: URL.createObjectURL(file) }));
    renderNotesPhotoStrip();
    e.target.value = '';
  });
  document.getElementById('addPhotoBtn').addEventListener('click', () => document.getElementById('cameraInput').click());
  document.getElementById('cameraInput').addEventListener('change', (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    ensureCurrentDraftDefect();
    const d = S.draft.defects.find((x) => x.key === S.currentDefectKey);
    files.forEach((file) => {
      d.photos.push({ blob: file, filename: file.name, description: '', displayOrder: d.photos.length, localUrl: URL.createObjectURL(file) });
    });
    renderPhotoStrip(d);
    e.target.value = '';
  });

  // A photo can be added before the defect's other fields are first saved
  // (e.g. tapping Add Photo on a brand-new element pick) - this lazily
  // creates the draft row exactly like committing the form would, so the
  // photo has somewhere real to attach to.
  function ensureCurrentDraftDefect() {
    if (S.currentDefectKey && S.draft.defects.some((x) => x.key === S.currentDefectKey)) return;
    const key = `new-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const el = editingNewElement;
    S.draft.defects.push({
      key, defectDbId: null, spanNumber: S.currentSpan, elementNumber: el.no, elementDescription: el.description,
      defectType: '1', defectNumber: '1', severity: '1', extent: 'A', worksRequired: 'N', priority: '', cost: '',
      comments: '', remedial_works: '', timestamp: new Date().toISOString(), isPrimary: !hasEntryFor(el.no),
      referencePhotos: [], photos: []
    });
    S.currentDefectKey = key;
  }
  function hasEntryFor(elementNo) {
    return S.draft.defects.some((d) => d.spanNumber === S.currentSpan && d.elementNumber === elementNo);
  }

  document.getElementById('defectDeleteBtn').addEventListener('click', async () => {
    if (!S.currentDefectKey) { back(); return; }
    const confirmed = await showConfirmModal({
      title: 'Remove this defect?',
      message: 'It will be removed from this draft.',
      confirmLabel: 'Remove'
    });
    if (!confirmed) return;
    const idx = S.draft.defects.findIndex((x) => x.key === S.currentDefectKey);
    if (idx >= 0) {
      S.draft.defects[idx].photos.forEach((p) => URL.revokeObjectURL(p.localUrl));
      S.draft.defects.splice(idx, 1);
    }
    back();
    refreshViewerContent();
  });

  document.getElementById('defectDoneBtn').addEventListener('click', () => {
    const severity = getStepperValue('sevStepper');
    const extent = getStepperValue('extStepper');
    if (!FieldBCI.isValidSeverityExtent(severity, extent)) {
      document.getElementById('sevExtWarning').hidden = false;
      return;
    }
    let d = S.draft.defects.find((x) => x.key === S.currentDefectKey);
    const isPh = d && isPlaceholder(d);
    if (!d) {
      ensureCurrentDraftDefect();
      d = S.draft.defects.find((x) => x.key === S.currentDefectKey);
    }
    if (!isPh) {
      const typeCode = document.getElementById('defTypeCode').value.trim() || '1';
      const numCode = document.getElementById('defNumberCode').value.trim() || '1';
      d.defectType = typeCode; d.defectNumber = numCode;
      const label = document.getElementById('defTypeLabel').value.trim();
      if (label) d.elementDescription = label;
    }
    d.severity = severity; d.extent = extent;
    d.worksRequired = getStepperValue('worksStepper');
    d.priority = d.worksRequired === 'Y' ? getStepperValue('priorityStepper') : '';
    d.cost = d.worksRequired === 'Y' ? (document.getElementById('defCost').value || '') : '';
    d.comments = document.getElementById('defComments').value;
    d.remedial_works = document.getElementById('defRemedial').value;
    d.timestamp = new Date().toISOString();
    back();
    refreshViewerContent();
  });

  /* ============================================================
     SAVE
     ============================================================ */
  document.getElementById('saveInspectionBtn').addEventListener('click', doSave);
  async function doSave() {
    const btn = document.getElementById('saveInspectionBtn');
    btn.disabled = true; const originalText = btn.textContent; btn.textContent = 'Saving…';
    try {
      const dateStr = new Date().toISOString().slice(0, 10);
      const structureId = S.draft.structureId;

      // isPrimary recomputed at save time: first entry per (span, element)
      // in insertion order wins, matching persistCurrentDefectForm()'s
      // default (no manual override UI on mobile yet).
      const seen = new Set();
      S.draft.defects.forEach((d) => {
        const k = `${d.spanNumber}-${d.elementNumber}`;
        d.isPrimary = !seen.has(k);
        seen.add(k);
      });

      const spansPayload = S.draft.spans.map((sp) => {
        const savedSpan = S.currentSpan;
        S.currentSpan = sp.spanNumber;
        const { bciAv, bciCrit } = computeSpanBci();
        S.currentSpan = savedSpan;
        const spanEntries = S.draft.defects.filter((d) => d.spanNumber === sp.spanNumber);
        return {
          spanNumber: sp.spanNumber,
          elementsInspected: spanEntries.length > 0,
          photographsTaken: spanEntries.some((d) => d.photos.length > 0),
          comments: sp.comments || '',
          bciCrit: Number(bciCrit.toFixed(2)),
          bciAv: Number(bciAv.toFixed(2))
        };
      });

      const inspection = {
        structure_id: structureId,
        structure_name: S.draft.structureName,
        inspection_date: dateStr,
        inspection_type: S.draft.inspectionType,
        inspector_name: S.session?.fullName || S.session?.username || 'Field inspector',
        total_spans: S.draft.totalSpans,
        conclusions: S.draft.conclusions || '',
        source: 'field',
        spans: spansPayload
      };
      const defects = S.draft.defects.map((d) => ({
        spanNumber: d.spanNumber, elementNumber: d.elementNumber,
        defectType: d.defectType, defectNumber: d.defectNumber,
        severity: parseInt(d.severity, 10), extent: d.extent,
        worksRequired: d.worksRequired, priority: d.priority, cost: d.cost,
        comments: d.comments, remedial_works: d.remedial_works,
        timestamp: d.timestamp, posX: null, posY: null, posZ: null, isPrimary: d.isPrimary
      }));

      const photos = [];
      S.draft.defects.forEach((d) => {
        const tempKey = `${structureId}_${dateStr}_${d.spanNumber}_${d.elementNumber}_${d.defectType}.${d.defectNumber}`;
        d.photos.forEach((p) => photos.push({
          tempDefectKey: tempKey, blob: p.blob, filename: p.filename,
          description: p.description, displayOrder: p.displayOrder
        }));
      });

      const job = { structureId, structureName: S.draft.structureName, inspection, defects, photos };

      // Always attempt the live save first - navigator.onLine is only ever
      // a hint (some browsers/networks report it wrong) and the real
      // fetch failing is the only trustworthy signal that we're offline.
      await submitJob(job);
      noteRequestSucceeded();
      toast('Inspection saved.');
      S.draft.defects.forEach((d) => d.photos.forEach((p) => URL.revokeObjectURL(p.localUrl)));
      stack = ['structures', 'inspections'];
      renderStack(true);
      await openInspections(structureId);
    } catch (err) {
      if (err.offline) {
        const dateStr = new Date().toISOString().slice(0, 10);
        const structureId = S.draft.structureId;
        // rebuild the same job shape for queuing (blobs survive in IndexedDB)
        const seen = new Set();
        S.draft.defects.forEach((d) => { const k = `${d.spanNumber}-${d.elementNumber}`; d.isPrimary = !seen.has(k); seen.add(k); });
        const spansPayload = S.draft.spans.map((sp) => {
          const savedSpan = S.currentSpan; S.currentSpan = sp.spanNumber;
          const { bciAv, bciCrit } = computeSpanBci(); S.currentSpan = savedSpan;
          const spanEntries = S.draft.defects.filter((d) => d.spanNumber === sp.spanNumber);
          return { spanNumber: sp.spanNumber, elementsInspected: spanEntries.length > 0,
            photographsTaken: spanEntries.some((d) => d.photos.length > 0), comments: sp.comments || '',
            bciCrit: Number(bciCrit.toFixed(2)), bciAv: Number(bciAv.toFixed(2)) };
        });
        const inspection = {
          structure_id: structureId, structure_name: S.draft.structureName, inspection_date: dateStr,
          inspection_type: S.draft.inspectionType, inspector_name: S.session?.fullName || S.session?.username || 'Field inspector',
          total_spans: S.draft.totalSpans, conclusions: S.draft.conclusions || '', source: 'field', spans: spansPayload
        };
        const defects = S.draft.defects.map((d) => ({
          spanNumber: d.spanNumber, elementNumber: d.elementNumber, defectType: d.defectType, defectNumber: d.defectNumber,
          severity: parseInt(d.severity, 10), extent: d.extent, worksRequired: d.worksRequired, priority: d.priority,
          cost: d.cost, comments: d.comments, remedial_works: d.remedial_works, timestamp: d.timestamp,
          posX: null, posY: null, posZ: null, isPrimary: d.isPrimary
        }));
        const photos = [];
        S.draft.defects.forEach((d) => {
          const tempKey = `${structureId}_${dateStr}_${d.spanNumber}_${d.elementNumber}_${d.defectType}.${d.defectNumber}`;
          d.photos.forEach((p) => photos.push({ tempDefectKey: tempKey, blob: p.blob, filename: p.filename, description: p.description, displayOrder: p.displayOrder }));
        });
        await FieldDB.queueJob({ structureId, structureName: S.draft.structureName, inspection, defects, photos });
        toast('Offline. Inspection queued, will sync automatically.');
        updateSyncBar();
        stack = ['structures', 'inspections'];
        renderStack(true);
        await openInspections(structureId);
      } else {
        toast(err.message || 'Could not save inspection.');
      }
    } finally {
      btn.disabled = false; btn.textContent = originalText;
    }
  }

  // Kick a flush attempt shortly after boot in case jobs were queued last
  // session and the app happens to already be online.
  setTimeout(() => { if (navigator.onLine) flushQueue(); }, 1500);
})();
