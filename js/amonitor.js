import { P, h, bus, clamp } from './core.js';
import { reg } from './dock.js';
import { pb } from './playback.js';
import { icon } from './icons.js';

function build(el) {
  el.classList.add('amon');
  const cv = h('canvas'); const lufs = h('b', {}, '-inf'); const peak = h('b', {}, '-inf'); const mv = h('b', {}, '0 dB');
  const vol = h('input', { type: 'range', min: -60, max: 12, step: .5, value: 0, oninput: e => { const db = +e.target.value; pb.audioInit(); pb.master.gain.value = db <= -60 ? 0 : Math.pow(10, db / 20); mv.textContent = db <= -60 ? '-inf' : db + ' dB'; } });
  const mute = h('button', { class: 'tb', title: 'Mute', onclick: () => { pb.audioInit(); const m = pb.master.gain.value > 0; pb.master.gain.value = m ? 0 : Math.pow(10, +vol.value / 20); mute.classList.toggle('on', m); } }, icon('audio', 14));
  el.append(cv, h('div', { class: 'arow' }, 'Master', mute, vol, mv), h('div', { class: 'arow' }, 'Momentary', lufs, 'Peak', peak));
  let spec = null, mom = [], pk = -90;
  const loop = () => {
    if (!el.isConnected) return;
    if (el.offsetParent) {
      const w = cv.clientWidth, hh = cv.clientHeight; if (cv.width !== w) cv.width = w; if (cv.height !== hh) cv.height = hh;
      const g = cv.getContext('2d'); g.fillStyle = '#161616'; g.fillRect(0, 0, w, hh);
      if (pb.an[0]) {
        const a = pb.an[0]; if (!spec || spec.length !== a.frequencyBinCount) spec = new Uint8Array(a.frequencyBinCount);
        a.getByteFrequencyData(spec); const n = spec.length, bars = Math.min(64, n);
        for (let i = 0; i < bars; i++) { const lo = Math.floor(Math.pow(i / bars, 2) * n), hi = Math.max(lo + 1, Math.floor(Math.pow((i + 1) / bars, 2) * n)); let m = 0; for (let k = lo; k < hi; k++) m = Math.max(m, spec[k]); const bh = m / 255 * hh; g.fillStyle = `hsl(${200 - m / 255 * 150},70%,55%)`; g.fillRect(i * w / bars + 1, hh - bh, w / bars - 2, bh); }
        const l = pb.level(); const rms = Math.max(l[0], l[1]); const db = rms > 0 ? 20 * Math.log10(rms) : -90;
        mom.push(db); if (mom.length > 30) mom.shift(); pk = Math.max(db, pk - .05);
        const avg = 10 * Math.log10(mom.reduce((s, x) => s + Math.pow(10, x / 10), 0) / mom.length + 1e-12);
        lufs.textContent = avg < -80 ? '-inf' : avg.toFixed(1) + ' LU'; peak.textContent = pk < -80 ? '-inf' : pk.toFixed(1) + ' dB';
      }
    }
    requestAnimationFrame(loop);
  };
  loop();
}
reg('audioMonitor', 'Audio Monitor', build);
