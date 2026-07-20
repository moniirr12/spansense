// Offline write queue. Only used when a save happens (or is attempted) while
// offline - the online path never touches IndexedDB at all. A queued "job"
// is one whole "save this inspection" action: the inspection/defects JSON
// plus every photo blob captured for it (photos can't be pre-uploaded while
// offline since that needs the network too), so a flush re-does the entire
// upload-then-save sequence as one unit rather than trying to resume a
// half-finished multi-step submission.
(function () {
  const DB_NAME = 'spansense-field';
  const DB_VERSION = 1;
  const STORE = 'pendingInspections';

  function openDb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function withStore(mode, fn) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const store = tx.objectStore(STORE);
      const result = fn(store);
      tx.oncomplete = () => resolve(result && result.__req ? result.__req.result : result);
      tx.onerror = () => reject(tx.error);
    });
  }

  // job: { structureId, structureName, inspectionDate, inspectionType,
  //        inspection, defects, photos: [{tempDefectKey, blob, mimetype, filename, description, displayOrder}] }
  async function queueJob(job) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      const record = { ...job, createdAt: new Date().toISOString(), attempts: 0 };
      const req = store.add(record);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function listJobs() {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  async function removeJob(id) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function bumpAttempts(id) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      const getReq = store.get(id);
      getReq.onsuccess = () => {
        const rec = getReq.result;
        if (rec) { rec.attempts = (rec.attempts || 0) + 1; store.put(rec); }
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  window.FieldDB = { queueJob, listJobs, removeJob, bumpAttempts };
})();
