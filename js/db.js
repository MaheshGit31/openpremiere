// IndexedDB persistence: projects + media blobs
let _db = null;
const open = () => _db ? Promise.resolve(_db) : new Promise((res, rej) => {
  const r = indexedDB.open('openpremiere', 1);
  r.onupgradeneeded = () => { const d = r.result; d.createObjectStore('projects', { keyPath: 'id' }); d.createObjectStore('blobs'); };
  r.onsuccess = () => { _db = r.result; res(_db); };
  r.onerror = () => rej(r.error);
});
const tx = async (store, mode, fn) => { const d = await open(); return new Promise((res, rej) => { const t = d.transaction(store, mode); const s = t.objectStore(store); const q = fn(s); t.oncomplete = () => res(q && q.result); t.onerror = () => rej(t.error); }); };
export const db = {
  putProject: p => tx('projects', 'readwrite', s => s.put(p)),
  getProject: id => tx('projects', 'readonly', s => s.get(id)),
  allProjects: () => tx('projects', 'readonly', s => s.getAll()),
  delProject: id => tx('projects', 'readwrite', s => s.delete(id)),
  putBlob: (key, blob) => tx('blobs', 'readwrite', s => s.put(blob, key)),
  getBlob: key => tx('blobs', 'readonly', s => s.get(key)),
  delBlob: key => tx('blobs', 'readwrite', s => s.delete(key)),
};
