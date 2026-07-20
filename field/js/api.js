// Thin fetch wrapper around spanSense's existing Express API. This app is
// served from the same origin as the API (see server.js's express.static
// mount at the repo root), so plain relative fetches with credentials:
// 'include' ride on the same session cookie the desktop app already uses -
// no separate mobile auth scheme needed.
(function () {
  async function request(path, options = {}) {
    let res;
    try {
      res = await fetch(path, {
        credentials: 'include',
        headers: options.body && !(options.body instanceof FormData)
          ? { 'Content-Type': 'application/json', ...(options.headers || {}) }
          : (options.headers || {}),
        ...options
      });
    } catch (networkErr) {
      const err = new Error('You appear to be offline.');
      err.offline = true;
      throw err;
    }
    let data = null;
    const text = await res.text();
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    if (!res.ok) {
      const message = (data && (data.message || data.error)) || `Request failed (${res.status})`;
      const err = new Error(message);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  const Api = {
    // --- auth ---
    checkSession: () => request('/api/check-session'),
    login: (username, password) => request('/api/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
    login2fa: (code) => request('/api/login/2fa', { method: 'POST', body: JSON.stringify({ code }) }),
    logout: () => request('/api/logout', { method: 'POST' }),
    getMe: () => request('/api/me'),

    // --- structures ---
    getBridges: () => request('/api/bridges'),
    getBridge: (id) => request(`/api/bridges/${id}`),

    // --- inspections ---
    getInspectionDates: (structureId) => request(`/api/inspection-dates/${structureId}`),
    getInspectionFull: (structureId, date) =>
      request(`/api/inspection/full?structure_id=${encodeURIComponent(structureId)}&date=${encodeURIComponent(date)}`),

    // --- elements / defect history ---
    getElements: (type) => request(`/api/elements?type=${encodeURIComponent(type || 'Bridge')}`),
    getPreviousDefects: (structureId, elementNo) =>
      request(`/api/previous-defects?structureId=${encodeURIComponent(structureId)}&elementNo=${encodeURIComponent(elementNo)}`),

    // Uploads one or more photo blobs for a single defect. `defectId` should
    // stay a non-numeric temp key for defects that don't have a real DB id
    // yet (i.e. every defect in a brand-new inspection draft) - the server
    // only links the photo row immediately when defectId parses as a plain
    // integer; otherwise it just stores the file and hands back its storage
    // path so it can be attached via /save-inspection's photoData once the
    // inspection itself exists.
    uploadPhotos: (structureId, { defectId, inspectionDate, files, descriptions = [], displayOrders = [] }) => {
      const form = new FormData();
      files.forEach((f) => form.append('photos', f.blob || f, f.filename || f.name || 'photo.jpg'));
      descriptions.forEach((d) => form.append('descriptions[]', d || ''));
      displayOrders.forEach((d) => form.append('displayOrders[]', String(d)));
      if (defectId != null) form.append('defectId', String(defectId));
      if (inspectionDate) form.append('inspectionDate', inspectionDate);
      return request(`/api/bridges/${structureId}/inspection-photos`, { method: 'POST', body: form });
    },

    saveInspection: (payload) => request('/save-inspection', { method: 'POST', body: JSON.stringify(payload) })
  };

  window.Api = Api;
})();
