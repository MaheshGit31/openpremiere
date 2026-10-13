const NS = 'http://www.w3.org/2000/svg';
// 24x24 viewBox, stroke icons unless fill flagged by leading '!'
const I = {
  list: 'M4 6h16M4 12h16M4 18h16', grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  folder: 'M3 6h6l2 2h10v11H3z', newitem: 'M6 3h9l4 4v14H6zM14 3v5h5M12 11v6M9 14h6', import: 'M12 3v12M7 10l5 5 5-5M4 20h16',
  seq: 'M3 6h18v12H3zM3 10h18M8 6v12', film: 'M4 5h16v14H4zM4 9h3M4 13h3M4 17h3M17 9h3M17 13h3M17 17h3M9 8h6v8H9z', audio: 'M4 9v6h4l5 4V5L8 9zM16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11',
  markin: 'M9 4v16M9 4h8M9 12h6M9 20h8', markout: 'M15 4v16M15 4H7M15 12H9M15 20H7',
  gotoin: 'M6 5v14M18 5l-9 7 9 7z', gotoout: 'M18 5v14M6 5l9 7-9 7z', stepb: 'M17 5v14l-9-7zM6 5v14', stepf: 'M7 5v14l9-7zM18 5v14',
  play: 'M7 4l13 8-13 8z', insert: 'M3 7h8v10H3zM15 7h6M15 12h6M15 17h6M7 10v4M5 12h4', overwrite: 'M3 7h8v10H3zM14 7h7v10h-7zM7 10v4M5 12h4',
  lift: 'M12 4v10M7 9l5-5 5 5M4 19h16', extract: 'M12 4v10M7 9l5-5 5 5M4 19h6M14 19h6', camera: 'M4 8h4l2-3h4l2 3h4v11H4zM12 11a3.2 3.2 0 1 0 .01 0',
  tsel: 'M6 3l12 9-5 1 3 6-3 1-3-6-4 4z', tfwd: 'M4 5v14M8 8l8 4-8 4zM17 8l4 4-4 4', tripple: 'M12 4v16M12 8H5M12 16H5M5 6v4M5 14v4', trate: 'M4 12h16M7 8l-4 4 4 4M17 8l4 4-4 4M12 6v12',
  trazor: 'M12 3v18M5 7h4v4H5zM15 13h4v4h-4z', tslip: 'M3 8h6v8H3zM15 8h6v8h-6zM10 12h4M12 10v4', tpen: 'M5 19l3-1L19 7l-2-2L6 16zM14 8l2 2', thand: 'M8 12V6a1.5 1.5 0 0 1 3 0v5M11 11V4a1.5 1.5 0 0 1 3 0v7M14 11V6a1.5 1.5 0 0 1 3 0v8c0 4-2 6-6 6-3 0-4-2-5-4l-2-4a1.5 1.5 0 0 1 3-1l1 2',
  tzoom: 'M10 4a6 6 0 1 0 .01 0M15 15l6 6M8 10h4M10 8v4', ttype: 'M5 5h14M12 5v14M9 19h6',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 .01 0', chev: 'M9 6l6 6-6 6', chevd: 'M6 9l6 6 6-6', diamond: 'M12 4l7 8-7 8-7-8z',
  reset: 'M4 12a8 8 0 1 0 3-6M4 4v5h5', fx: 'M5 5h6M5 5v14M5 12h5M13 8l7 8M20 8l-7 8', search: 'M10 4a6 6 0 1 0 .01 0M15 15l6 6',
  link:'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1', lock:'M6 11h12v9H6zM8 11V8a4 4 0 0 1 8 0v3', unlock:'M6 11h12v9H6zM8 11V8a4 4 0 0 1 7.5-2', stopwatch:'M12 21a7 7 0 1 0 .01 0M12 10v4l2.5 1.5M10 3h4M12 3v3', magnet:'M5 4v8a7 7 0 0 0 14 0V4h-4v8a3 3 0 0 1-6 0V4zM5 8h4M15 8h4', marker:'M6 4h12v10l-6 6-6-6z', kprev:'M15 6l-6 6 6 6', knext:'M9 6l6 6-6 6', kdiam:'M12 5l7 7-7 7-7-7z', menu:'M4 7h16M4 12h16M4 17h16', more:'M7 7l5 5-5 5M13 7l5 5-5 5', check:'M5 12l5 5 9-10',
  trash: 'M5 7h14M9 7V4h6v3M7 7l1 13h8l1-13', plus: 'M12 5v14M5 12h14', x: 'M6 6l12 12M18 6L6 18',
};
export function icon(name, size = 16) {
  const s = document.createElementNS(NS, 'svg');
  s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('width', size); s.setAttribute('height', size);
  s.setAttribute('fill', 'none'); s.setAttribute('stroke', 'currentColor'); s.setAttribute('stroke-width', '1.7'); s.setAttribute('stroke-linecap', 'round'); s.setAttribute('stroke-linejoin', 'round');
  const p = document.createElementNS(NS, 'path'); p.setAttribute('d', I[name] || I.diamond);
  if (['play', 'tsel', 'diamond', 'kdiam'].includes(name)) p.setAttribute('fill', 'currentColor');
  s.append(p); return s;
}
