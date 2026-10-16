import { P, tc } from './core.js';
import { val, FX, BLENDS } from './fx.js';
import { TRANS } from './trans.js';

const HEAD = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 oc;
uniform sampler2D uTex, uTex2; uniform vec2 uRes; uniform float uTime, uT; uniform int uPass;
#define px (1./uRes)
float luma(vec3 c){ return dot(c, vec3(.2126,.7152,.0722)); }
float hash(vec2 p){ p = fract(p*vec2(443.897,441.423)); p += dot(p, p.yx+19.19); return fract((p.x+p.y)*p.x); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f); return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }
float fbm(vec2 p){ float a = .5, s = 0.; for(int i=0;i<5;i++){ s += a*vnoise(p); p *= 2.02; a *= .5; } return s; }
vec3 rgb2hsv(vec3 c){ vec4 K = vec4(0.,-1./3.,2./3.,-1.); vec4 p = mix(vec4(c.bg,K.wz), vec4(c.gb,K.xy), step(c.b,c.g)); vec4 q = mix(vec4(p.xyw,c.r), vec4(c.r,p.yzx), step(p.x,c.r)); float d = q.x-min(q.w,q.y); return vec3(abs(q.z+(q.w-q.y)/(6.*d+1e-10)), d/(q.x+1e-10), q.x); }
vec3 hsv2rgb(vec3 c){ vec3 p = abs(fract(c.xxx+vec3(1.,2./3.,1./3.))*6.-3.); return c.z*mix(vec3(1.), clamp(p-1.,0.,1.), c.y); }
vec2 rot(vec2 d, float a){ float c = cos(a), s = sin(a); return vec2(d.x*c-d.y*s, d.x*s+d.y*c); }
vec4 S(vec2 u){ if(u.x<0.||u.y<0.||u.x>1.||u.y>1.) return vec4(0.); return texture(uTex, u); }
vec4 U(vec4 c){ return c.a>.0001 ? vec4(c.rgb/c.a, c.a) : vec4(0.); }
vec4 M(vec4 c){ return vec4(c.rgb*c.a, c.a); }
vec4 spiral(vec2 uv, float r, int n){ if(r<.01) return S(uv); vec4 a = vec4(0.); for(int i=0;i<64;i++){ if(i>=n) break; float an = float(i)*2.39996, d = sqrt((float(i)+.5)/float(n)); a += S(uv + vec2(cos(an),sin(an))*d*r*px); } return a/float(n); }
`;
const VS_Q = `#version 300 es
in vec2 a; out vec2 vUv; void main(){ vUv = a; gl_Position = vec4(a*2.-1., 0., 1.); }`;
const VS_L = `#version 300 es
in vec2 a; out vec2 vUv;
uniform vec2 uSeq, uSrc, uAnchor, uPos, uScale; uniform float uRot;
void main(){ vUv = a; vec2 p = (a*uSrc - uAnchor)*uScale; float c = cos(uRot), s = sin(uRot);
  p = vec2(p.x*c - p.y*s, p.x*s + p.y*c) + uPos; gl_Position = vec4(p.x/uSeq.x*2.-1., p.y/uSeq.y*2.-1., 0., 1.); }`;
const FS_T = `#version 300 es
precision highp float; in vec2 vUv; out vec4 oc; uniform sampler2D uTex; uniform float uOp; void main(){ oc = texture(uTex, vUv)*uOp; }`;
const FS_OUT = `#version 300 es
precision highp float; in vec2 vUv; out vec4 oc; uniform sampler2D uTex; void main(){ oc = vec4(texture(uTex, vec2(vUv.x, 1.-vUv.y)).rgb, 1.); }`;
const FS_B = `#version 300 es
precision highp float; in vec2 vUv; out vec4 oc; uniform sampler2D uBase, uTop; uniform float uOp; uniform int uMode;
float lum(vec3 c){ return dot(c, vec3(.3,.59,.11)); }
vec3 clipc(vec3 c){ float l = lum(c), n = min(c.r,min(c.g,c.b)), x = max(c.r,max(c.g,c.b)); if(n<0.) c = l + (c-l)*l/(l-n); if(x>1.) c = l + (c-l)*(1.-l)/(x-l); return c; }
vec3 setlum(vec3 c, float l){ return clipc(c + (l - lum(c))); }
float sat(vec3 c){ return max(c.r,max(c.g,c.b)) - min(c.r,min(c.g,c.b)); }
vec3 setsat(vec3 c, float s){ float mn = min(c.r,min(c.g,c.b)), mx = max(c.r,max(c.g,c.b)); if(mx>mn) return (c-mn)*s/(mx-mn); return vec3(0.); }
float sl(float b, float s){ float d = b<=.25 ? ((16.*b-12.)*b+4.)*b : sqrt(b); return s<=.5 ? b-(1.-2.*s)*b*(1.-b) : b+(2.*s-1.)*(d-b); }
vec3 blend(vec3 b, vec3 s){
  if(uMode==1) return min(b,s); if(uMode==2) return b*s;
  if(uMode==3) return 1.-min(vec3(1.),(1.-b)/max(s,.001)); if(uMode==4) return max(b,s); if(uMode==5) return b+s-b*s;
  if(uMode==6) return min(vec3(1.), b/max(1.-s,.001)); if(uMode==7) return min(b+s, vec3(1.));
  if(uMode==8) return mix(2.*b*s, 1.-2.*(1.-b)*(1.-s), step(.5,b));
  if(uMode==9) return vec3(sl(b.r,s.r), sl(b.g,s.g), sl(b.b,s.b));
  if(uMode==10) return mix(2.*b*s, 1.-2.*(1.-b)*(1.-s), step(.5,s));
  if(uMode==11) return abs(b-s); if(uMode==12) return b+s-2.*b*s;
  if(uMode==13) return setlum(setsat(s,sat(b)),lum(b)); if(uMode==14) return setlum(setsat(b,sat(s)),lum(b));
  if(uMode==15) return setlum(s,lum(b)); if(uMode==16) return setlum(b,lum(s));
  return s; }
void main(){
  vec4 b = texture(uBase, vUv), t = texture(uTop, vUv)*uOp;
  if(uMode==0){ oc = t + b*(1.-t.a); return; }
  vec3 cb = b.a>.0001 ? b.rgb/b.a : vec3(0.), cs = t.a>.0001 ? t.rgb/t.a : vec3(0.);
  vec3 B = clamp(blend(cb, cs), 0., 1.);
  float ao = t.a + b.a*(1.-t.a);
  vec3 co = (1.-t.a)*b.rgb + (1.-b.a)*t.rgb + b.a*t.a*B;
  oc = vec4(co, ao); }`;

const hex = s => { s = String(s || '#fff').replace('#', ''); if (s.length === 3) s = s.split('').map(c => c + c).join(''); const n = parseInt(s, 16) || 0; return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; };

export class Compositor {
  constructor(canvas) {
    this.cv = canvas;
    const g = this.g = canvas.getContext('webgl2', { alpha: false, antialias: false, preserveDrawingBuffer: true });
    if (!g) throw new Error('webgl2 unavailable');
    this.progs = new Map(); this.bad = new Set(); this.errors = {};
    this.tex = new Map(); this.maskC = new Map(); this.maskI = new Map(); this.pool = new Map(); this.hist = new Map(); this.ovTex = null; this.ovKey = '';
    const b = g.createBuffer(); g.bindBuffer(g.ARRAY_BUFFER, b);
    g.bufferData(g.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), g.STATIC_DRAW);
    this.vao = g.createVertexArray(); g.bindVertexArray(this.vao);
    g.bindBuffer(g.ARRAY_BUFFER, b); g.enableVertexAttribArray(0); g.vertexAttribPointer(0, 2, g.FLOAT, false, 0, 0);
    this.layerP = this.mkProg(VS_L, FS_T, ['uSeq', 'uSrc', 'uAnchor', 'uPos', 'uScale', 'uRot', 'uTex', 'uOp']);
    this.blendP = this.mkProg(VS_Q, FS_B, ['uBase', 'uTop', 'uOp', 'uMode']);
    this.outP = this.mkProg(VS_Q, FS_OUT, ['uTex']);
    this.zero = this.mkTex(1, 1, new Uint8Array(4));
    this.ov = document.createElement('canvas');
    g.disable(g.BLEND);
  }
  mkProg(vs, fs, uniforms) {
    const g = this.g;
    const mk = (t, s) => { const x = g.createShader(t); g.shaderSource(x, s); g.compileShader(x); if (!g.getShaderParameter(x, g.COMPILE_STATUS)) throw new Error(g.getShaderInfoLog(x)); return x; };
    const pr = g.createProgram(); g.attachShader(pr, mk(g.VERTEX_SHADER, vs)); g.attachShader(pr, mk(g.FRAGMENT_SHADER, fs));
    g.bindAttribLocation(pr, 0, 'a'); g.linkProgram(pr);
    if (!g.getProgramParameter(pr, g.LINK_STATUS)) throw new Error(g.getProgramInfoLog(pr));
    const u = {}; uniforms.forEach(n => u[n] = g.getUniformLocation(pr, n));
    return { pr, u };
  }
  mkTex(w, h, data) {
    const g = this.g, t = g.createTexture(); g.bindTexture(g.TEXTURE_2D, t);
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MIN_FILTER, g.LINEAR); g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MAG_FILTER, g.LINEAR);
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_S, g.CLAMP_TO_EDGE); g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_T, g.CLAMP_TO_EDGE);
    g.texImage2D(g.TEXTURE_2D, 0, g.RGBA8, w, h, 0, g.RGBA, g.UNSIGNED_BYTE, data || null);
    return t;
  }
  texFor(id) { let t = this.tex.get(id); if (!t) { t = this.mkTex(1, 1, new Uint8Array(4)); this.tex.set(id, t); } return t; }
  // pooled render targets
  acquire(w, h) {
    const k = w + 'x' + h; const a = this.pool.get(k) || []; this.pool.set(k, a);
    if (a.length) return a.pop();
    const g = this.g, tex = this.mkTex(w, h), fb = g.createFramebuffer();
    g.bindFramebuffer(g.FRAMEBUFFER, fb); g.framebufferTexture2D(g.FRAMEBUFFER, g.COLOR_ATTACHMENT0, g.TEXTURE_2D, tex, 0);
    return { tex, fb, w, h, k };
  }
  release(r) { if (r && r.k) (this.pool.get(r.k) || (this.pool.set(r.k, []), this.pool.get(r.k))).push(r); }
  target(r) { const g = this.g; g.bindFramebuffer(g.FRAMEBUFFER, r ? r.fb : null); g.viewport(0, 0, r ? r.w : this.cv.width, r ? r.h : this.cv.height); }
  clear(r, a = 0) { const g = this.g; this.target(r); g.clearColor(0, 0, 0, a); g.clear(g.COLOR_BUFFER_BIT); }
  resize(w, h) { if (this.cv.width !== w || this.cv.height !== h) { this.cv.width = w; this.cv.height = h; } }
  draw() { this.g.drawArrays(this.g.TRIANGLE_STRIP, 0, 4); }

  // build / fetch effect program
  fxProg(type) {
    if (this.progs.has(type)) return this.progs.get(type);
    if (this.bad.has(type)) return null;
    const d = FX[type]; if (!d || !d.glsl) return null;
    let src = HEAD;
    for (const p of d.params) if (p.t !== 'txt') src += p.t === 'color' ? `uniform vec3 p_${p.k};\n` : `uniform float p_${p.k};\n`;
    src += d.glsl;
    if (d.kind === 'color') src += `\nvec4 fx(vec2 uv){ vec4 s = S(uv); vec3 c = cfx(U(s).rgb, uv); return vec4(c*s.a, s.a); }`;
    src += `\nvoid main(){ oc = fx(vUv); }`;
    try {
      const p = this.mkProg(VS_Q, src, ['uTex', 'uTex2', 'uRes', 'uTime', 'uT', 'uPass', ...d.params.map(q => 'p_' + q.k)]);
      this.progs.set(type, p); return p;
    } catch (e) { this.bad.add(type); this.errors[type] = String(e.message || e); console.error('shader', type, this.errors[type]); return null; }
  }
  compileAll() { for (const t in FX) if (FX[t].glsl) this.fxProg(t); return this.errors; }

  // run one effect stage: returns {tex,pooled rt}
  runFx(f, clip, lt, t, cur, w, h, tex2) {
    const d = FX[f.type], pr = this.fxProg(f.type); if (!pr) return cur;
    const g = this.g, passes = d.passes || 1;
    g.useProgram(pr.pr);
    for (const p of d.params) {
      const loc = pr.u['p_' + p.k]; if (!loc || p.t === 'txt') continue;
      const v = val(clip, f, p.k, lt);
      if (p.t === 'color') g.uniform3fv(loc, hex(v)); else g.uniform1f(loc, +v || 0);
    }
    g.uniform2f(pr.u.uRes, w, h); g.uniform1f(pr.u.uTime, t); g.uniform1f(pr.u.uT, lt);
    let src = cur;
    for (let i = 0; i < passes; i++) {
      const out = this.acquire(w, h); this.target(out); g.useProgram(pr.pr);
      g.activeTexture(g.TEXTURE0); g.bindTexture(g.TEXTURE_2D, src.tex); g.uniform1i(pr.u.uTex, 0);
      g.activeTexture(g.TEXTURE1); g.bindTexture(g.TEXTURE_2D, tex2 || this.zero); g.uniform1i(pr.u.uTex2, 1);
      g.uniform1i(pr.u.uPass, i);
      this.draw();
      if (src.k && src !== cur) this.release(src);
      src = out;
    }
    return src;
  }

  overlayTex(f, clip, lt, t, W, H) {
    const d = FX[f.type], v = k => val(clip, f, k, lt);
    const cv = this.ov; cv.width = W; cv.height = H; const c = cv.getContext('2d'); c.clearRect(0, 0, W, H);
    let txt = '';
    if (d.overlay === 'clipName') txt = clip.name || (P.items.find(i => i.id === clip.item) || {}).name || '';
    else if (d.overlay === 'simpleText') txt = String(val(clip, f, 'text', lt) || '');
    else txt = tc(v('src') < .5 ? lt : t, P.seq.fps);
    const size = v('size') * H / 1080, x = v('x') / 100 * W, y = v('y') / 100 * H;
    c.font = `600 ${size}px "Source Sans 3","Segoe UI",sans-serif`; c.textBaseline = 'middle';
    const al = d.overlay === 'simpleText' ? ['left', 'center', 'right'][Math.round(v('align'))] : 'left';
    c.textAlign = al; c.globalAlpha = v('op') / 100;
    if (d.overlay === 'timecode' && v('bg')) { const m = c.measureText(txt).width; c.fillStyle = 'rgba(0,0,0,.6)'; c.fillRect(x - size * .3, y - size * .65, m + size * .6, size * 1.3); }
    if (d.overlay === 'simpleText' && v('shadow')) { c.shadowColor = 'rgba(0,0,0,.7)'; c.shadowBlur = size * .15; c.shadowOffsetY = size * .05; }
    const col = hex(v('col')); c.fillStyle = `rgb(${col.map(x => Math.round(x * 255))})`;
    c.fillText(txt, x, y);
    const g = this.g; if (!this.ovTex) this.ovTex = this.mkTex(1, 1);
    g.bindTexture(g.TEXTURE_2D, this.ovTex); g.pixelStorei(g.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    g.texImage2D(g.TEXTURE_2D, 0, g.RGBA, g.RGBA, g.UNSIGNED_BYTE, cv); g.pixelStorei(g.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    return this.ovTex;
  }

  begin(W, H) {
    this.W = W; this.H = H; this.acc = this.acquire(W, H); this.acc2 = this.acquire(W, H);
    this.clear(this.acc, 0);
  }
  end() {
    const g = this.g; this.target(null); g.useProgram(this.outP.pr);
    g.activeTexture(g.TEXTURE0); g.bindTexture(g.TEXTURE_2D, this.acc.tex); g.uniform1i(this.outP.u.uTex, 0); this.draw();
    this.release(this.acc); this.release(this.acc2); this.acc = this.acc2 = null;
  }
  // blend a layer render-target onto the accumulation buffer
  blendLayer(layer, op, mode) {
    const g = this.g, p = this.blendP;
    this.target(this.acc2); g.useProgram(p.pr);
    g.activeTexture(g.TEXTURE0); g.bindTexture(g.TEXTURE_2D, this.acc.tex); g.uniform1i(p.u.uBase, 0);
    g.activeTexture(g.TEXTURE1); g.bindTexture(g.TEXTURE_2D, layer.tex); g.uniform1i(p.u.uTop, 1);
    g.uniform1f(p.u.uOp, op); g.uniform1i(p.u.uMode, mode); this.draw();
    [this.acc, this.acc2] = [this.acc2, this.acc];
  }

  trProg(type) {
    const k = 'tr:' + type; if (this.progs.has(k)) return this.progs.get(k); if (this.bad.has(k)) return null;
    const d = TRANS[type]; if (!d) return null;
    let src = HEAD.replace('uniform sampler2D uTex, uTex2;', 'uniform sampler2D uA, uB; uniform float uOpA, uOpB, p;').replace('vec4 S(vec2 u){ if(u.x<0.||u.y<0.||u.x>1.||u.y>1.) return vec4(0.); return texture(uTex, u); }', 'vec4 A(vec2 u){ if(u.x<0.||u.y<0.||u.x>1.||u.y>1.) return vec4(0.); return texture(uA, u)*uOpA; }\nvec4 B(vec2 u){ if(u.x<0.||u.y<0.||u.x>1.||u.y>1.) return vec4(0.); return texture(uB, u)*uOpB; }\nvec4 S(vec2 u){ return vec4(0.); }');
    for (const q of d.params) src += q.t === 'color' ? `uniform vec3 p_${q.k};\n` : `uniform float p_${q.k};\n`;
    src += d.glsl + `\nvoid main(){ oc = tr(vUv); }`;
    try { const pr = this.mkProg(VS_Q, src, ['uA', 'uB', 'uOpA', 'uOpB', 'p', 'uRes', 'uTime', ...d.params.map(q => 'p_' + q.k)]); this.progs.set(k, pr); return pr; }
    catch (e) { this.bad.add(k); this.errors[k] = String(e.message || e); console.error('transition', type, this.errors[k]); return null; }
  }
  compileTrans() { for (const t in TRANS) this.trProg(t); return this.errors; }
  // combine two layers (or null) with a transition; returns render target
  transition(tr, la, lb, p, W, H, t) {
    const pr = this.trProg(tr.type), g = this.g; if (!pr) return null;
    const d = TRANS[tr.type], out = this.acquire(W, H); this.target(out); g.useProgram(pr.pr);
    for (const q of d.params) { const loc = pr.u['p_' + q.k]; if (!loc) continue; const v = tr.p && tr.p[q.k] != null ? tr.p[q.k] : q.def; if (q.t === 'color') g.uniform3fv(loc, hex(v)); else g.uniform1f(loc, +v || 0); }
    g.uniform1f(pr.u.p, p); g.uniform2f(pr.u.uRes, W, H); g.uniform1f(pr.u.uTime, t);
    g.uniform1f(pr.u.uOpA, la ? la.op : 1); g.uniform1f(pr.u.uOpB, lb ? lb.op : 1);
    g.activeTexture(g.TEXTURE0); g.bindTexture(g.TEXTURE_2D, la ? la.layer.tex : this.zero); g.uniform1i(pr.u.uA, 0);
    g.activeTexture(g.TEXTURE1); g.bindTexture(g.TEXTURE_2D, lb ? lb.layer.tex : this.zero); g.uniform1i(pr.u.uB, 1);
    this.draw(); return out;
  }
  // ---- masks ----
  maskTex(clip, sw, sh) {
    const ms = clip.masks; const k = Math.min(1, 1024 / Math.max(sw, sh)), w = Math.max(2, Math.round(sw * k)), h = Math.max(2, Math.round(sh * k));
    const key = JSON.stringify(ms) + w + 'x' + h; let e = this.maskC.get(clip.id);
    if (!e) { e = { cv: document.createElement('canvas'), tmp: document.createElement('canvas'), tex: this.mkTex(1, 1), key: '' }; this.maskC.set(clip.id, e); }
    if (e.key !== key) {
      e.key = key; const cv = e.cv, tmp = e.tmp; cv.width = tmp.width = w; cv.height = tmp.height = h;
      const g = cv.getContext('2d'), t = tmp.getContext('2d'); g.clearRect(0, 0, w, h);
      for (const m of ms) {
        t.clearRect(0, 0, w, h); t.save(); t.fillStyle = '#fff'; t.strokeStyle = '#fff'; t.lineJoin = 'round';
        if (m.inv) { t.fillRect(0, 0, w, h); t.globalCompositeOperation = 'destination-out'; }
        t.beginPath();
        if (m.type === 'ellipse') t.ellipse((m.x1 + m.x2) / 2 * k, (m.y1 + m.y2) / 2 * k, Math.abs(m.x2 - m.x1) / 2 * k, Math.abs(m.y2 - m.y1) / 2 * k, 0, 0, 7);
        else if (m.type === 'rect') t.rect(Math.min(m.x1, m.x2) * k, Math.min(m.y1, m.y2) * k, Math.abs(m.x2 - m.x1) * k, Math.abs(m.y2 - m.y1) * k);
        else if (m.type === 'path' && m.pts.length > 2) { m.pts.forEach(([x, y], i) => i ? t.lineTo(x * k, y * k) : t.moveTo(x * k, y * k)); t.closePath(); }
        if (m.type !== 'raster') { t.fill(); if (m.exp) { t.lineWidth = Math.abs(m.exp) * 2 * k; if (m.exp < 0) t.globalCompositeOperation = m.inv ? 'source-over' : 'destination-out'; t.stroke(); } }
        else { const im = this.maskImg(m.data); if (im && im.complete && im.naturalWidth) { if (m.inv) { t.drawImage(im, 0, 0, w, h); } else t.drawImage(im, 0, 0, w, h); } }
        t.restore();
        g.save(); g.globalAlpha = (m.op ?? 100) / 100; if (m.feather) { try { g.filter = `blur(${m.feather * k * .5}px)`; } catch {} } g.globalCompositeOperation = 'lighten'; g.drawImage(tmp, 0, 0); g.restore();
      }
      const gl = this.g; gl.bindTexture(gl.TEXTURE_2D, e.tex); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, cv);
    }
    return e.tex;
  }
  maskImg(url) { let im = this.maskI.get(url); if (!im) { im = new Image(); im.onload = () => { for (const e of this.maskC.values()) e.key = ''; window.dispatchEvent(new Event('op-mask')); }; im.src = url; this.maskI.set(url, im); } return im; }
  // render one clip into a seq-sized layer (premultiplied). returns {layer, op, mode}
  layer(clip, src, sw, sh, t, W, H, o = {}) {
    const g = this.g, lt = t - clip.start;
    const SM = 2048, k = Math.min(1, SM / Math.max(sw, sh)), tw = Math.max(1, Math.round(sw * k)), th = Math.max(1, Math.round(sh * k));
    const tx = this.texFor(clip.id); g.activeTexture(g.TEXTURE0); g.bindTexture(g.TEXTURE_2D, tx);
    try { g.texImage2D(g.TEXTURE_2D, 0, g.RGBA, g.RGBA, g.UNSIGNED_BYTE, src); } catch { return null; }
    let cur = { tex: tx }, mo = null, op = 1, mode = 0;
    const fxs = (clip.fx || []).filter(f => f.on !== false);
    const isDef = f => { const d = FX[f.type]; return d.params.every(p => { const kk = clip.kf && clip.kf[f.id + '.' + p.k]; return !kk && f.p[p.k] === p.def; }); };
    const stage = (f, w, h) => {
      const d = FX[f.type]; if (!d.glsl) return;
      if (f.type === 'lumetri' && isDef(f)) return;
      let t2 = null;
      if (d.overlay) t2 = this.overlayTex(f, clip, lt, t, w, h);
      else if (d.needsTrack) t2 = (o.matte && o.matte.tex) || null;
      else if (d.echo) {
        const key = clip.id + f.id; let e = this.hist.get(key);
        if (!e || e.w !== w || e.h !== h) { if (e) { this.release(e.out); this.release(e.inn); } e = { w, h, t: -1, out: null, inn: null }; this.hist.set(key, e); }
        if (e.t !== t) { this.release(e.inn); e.inn = e.out; e.out = null; e.t = t; }
        t2 = e.inn ? e.inn.tex : null;
        const prev = cur; cur = this.runFx(f, clip, lt, t, cur, w, h, t2);
        if (e.out) this.release(e.out); e.out = cur; if (prev.k && prev !== cur) this.release(prev);
        cur = { tex: cur.tex, keep: true, w, h }; return;
      }
      const prev = cur; cur = this.runFx(f, clip, lt, t, cur, w, h, t2);
      if (prev.k && prev !== cur && !prev.keep) this.release(prev);
    };
    for (const f of fxs) { if (f.type === 'motion') mo = f; else if (f.type === 'opacity') { op = val(clip, f, 'op', lt) / 100; mode = Math.round(val(clip, f, 'blend', lt)) || 0; } }
    for (const f of fxs) if (FX[f.type] && FX[f.type].glsl && !FX[f.type].post) stage(f, tw, th);
    if (clip.masks && clip.masks.length) {
      const mt = this.maskTex(clip, sw, sh); const prev = cur; cur = this.runFx({ type: 'maskpass', id: '_m', p: {} }, clip, lt, t, cur, tw, th, mt);
      if (prev.k && prev !== cur && !prev.keep) this.release(prev);
    }
    // layer pass
    const L = this.acquire(W, H); this.clear(L, 0);
    const p = this.layerP; g.useProgram(p.pr);
    const v = kk => mo ? val(clip, mo, kk, lt) : 0;
    const s = v('scale') / 100, swd = v('sw') / 100;
    g.uniform2f(p.u.uSeq, W, H); g.uniform2f(p.u.uSrc, sw, sh); g.uniform2f(p.u.uAnchor, v('ax'), v('ay')); g.uniform2f(p.u.uPos, v('px'), v('py'));
    g.uniform2f(p.u.uScale, s * (clip.uniform === false ? swd : 1), s); g.uniform1f(p.u.uRot, v('rot') * Math.PI / 180);
    g.uniform1f(p.u.uOp, 1);
    g.activeTexture(g.TEXTURE0); g.bindTexture(g.TEXTURE_2D, cur.tex); g.uniform1i(p.u.uTex, 0); this.draw();
    if (cur.k && !cur.keep) this.release(cur);
    cur = L;
    for (const f of fxs) if (FX[f.type] && FX[f.type].glsl && FX[f.type].post) stage(f, W, H);
    return { layer: cur, op, mode };
  }
  drawClip(clip, src, sw, sh, t, W, H, o) {
    const r = this.layer(clip, src, sw, sh, t, W, H, o); if (!r) return;
    this.blendLayer(r.layer, r.op * ((o && o.opMul) ?? 1), r.mode);
    if (r.layer.k && !r.layer.keep) this.release(r.layer);
  }
}
export const blendIndex = n => Math.max(0, BLENDS.indexOf(n));
