import { P, bus, resetProject, serialize, newSeq, uidp, setSeq, ls } from './core.js';
import { db } from './db.js';
import { pb } from './playback.js';

let dirty = false, timer = 0;
export const markDirty = () => { dirty = true; };
bus.on('seq', markDirty); bus.on('project', markDirty); bus.on('history', markDirty);

export async function newProject(opts = {}) {
  resetProject();
  P.projId = uidp(); P.projName = opts.name || 'Untitled';
  const s = newSeq(opts.seqName || 'Sequence 01', opts.w || 1920, opts.h || 1080, opts.fps || 30);
  P.seqs.push(s); setSeq(s);
  await saveProject(true);
  return P.projId;
}

export async function saveProject(force) {
  if (!P.projId || (!dirty && !force)) return;
  dirty = false;
  let thumb = null;
  try {
    if (pb.cv && P.seq) { const c = document.createElement('canvas'); c.width = 320; c.height = Math.round(320 * P.seq.h / P.seq.w); pb.render(); c.getContext('2d').drawImage(pb.cv, 0, 0, c.width, c.height); thumb = c.toDataURL('image/jpeg', .6); }
  } catch {}
  const old = await db.getProject(P.projId).catch(() => null);
  const rec = { id: P.projId, name: P.projName, created: (old && old.created) || Date.now(), modified: Date.now(), thumb: thumb || (old && old.thumb) || null, data: JSON.parse(JSON.stringify(serialize())), dur: 0 };
  await db.putProject(rec);
  bus.emit('saved', rec);
}

export async function storeBlob(it) { if (P.projId && it.file) await db.putBlob(P.projId + ':' + it.id, it.file); }

export async function openProject(id) {
  const rec = await db.getProject(id); if (!rec) return false;
  resetProject();
  P.projId = rec.id; P.projName = rec.name;
  const d = rec.data;
  P.bins = d.bins || P.bins; P.seqs = d.seqs || []; P.openSeqs = d.openSeqs || [];
  P.items = [];
  for (const m of d.items || []) {
    const it = { ...m };
    if (!it.url) {
      const b = await db.getBlob(rec.id + ':' + it.id).catch(() => null);
      if (b) { it.file = b; it.url = URL.createObjectURL(b); } else it.offline = true;
    }
    P.items.push(it);
  }
  const s = P.seqs.find(x => x.id === d.seqId) || P.seqs[0];
  if (!s) { const n = newSeq(); P.seqs.push(n); setSeq(n); } else setSeq(s);
  bus.emit('project'); dirty = false;
  return true;
}

export async function deleteProject(id) {
  const rec = await db.getProject(id);
  if (rec) for (const m of rec.data.items || []) await db.delBlob(id + ':' + m.id).catch(() => { });
  await db.delProject(id);
}
export async function duplicateProject(id) {
  const rec = await db.getProject(id); if (!rec) return;
  const nid = uidp();
  for (const m of rec.data.items || []) { const b = await db.getBlob(id + ':' + m.id).catch(() => null); if (b) await db.putBlob(nid + ':' + m.id, b); }
  await db.putProject({ ...rec, id: nid, name: rec.name + ' copy', created: Date.now(), modified: Date.now() });
}
export async function renameProject(id, name) { const rec = await db.getProject(id); if (rec) { rec.name = name; await db.putProject(rec); if (P.projId === id) P.projName = name; } }

export function startAutosave() {
  clearInterval(timer);
  timer = setInterval(() => { if (P.projId) saveProject(); }, 8000);
}
addEventListener('beforeunload', () => { if (P.projId && dirty) saveProject(); });
