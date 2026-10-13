import { P, clamp } from './core.js';
import { val, FX } from './fx.js';

const VS = `#version 300 es
in vec2 a; out vec2 uv;
uniform vec2 uSeq, uSrc, uAnchor, uPos, uScale; uniform float uRot;
void main(){
  uv = a;
  vec2 p = (a*uSrc - uAnchor)*uScale;
  float c = cos(uRot), s = sin(uRot);
  p = vec2(p.x*c - p.y*s, p.x*s + p.y*c) + uPos;
  gl_Position = vec4(p.x/uSeq.x*2.-1., 1.-p.y/uSeq.y*2., 0., 1.);
}`;

const FS = `#version 300 es
precision highp float;
in vec2 uv; out vec4 o;
uniform sampler2D tex; uniform vec2 uSrc; uniform float uTime, uOp;
uniform float exposure, contrast, highlights, shadows, whites, blacks, sat, vib, temp, tint, hue, fade, sharp, gammaF;
uniform vec3 lift, gam, gain;
uniform float vigAmt, vigSize, vigFeather, blurR, mosaicN, rgbAmt, rgbAng, noiseAmt, poster, thresh, bwF, invF, sepiaF;
uniform vec4 crop; uniform float flipH, flipV, mirror, fadeAmt, bright;
float luma(vec3 c){ return dot(c, vec3(.2126,.7152,.0722)); }
float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)))*43758.5453); }
vec4 S(vec2 u){ return texture(tex, clamp(u, vec2(0.0), vec2(1.0))); }
void main(){
  vec2 u = uv;
  if(flipH>.5) u.x = 1.-u.x;
  if(flipV>.5) u.y = 1.-u.y;
  if(mirror>=0.) { if(u.x > mirror) u.x = 2.*mirror - u.x; }
  if(u.x < crop.x || u.y < crop.y || u.x > 1.-crop.z || u.y > 1.-crop.w) discard;
  if(mosaicN>1.){ vec2 g = vec2(mosaicN, mosaicN*uSrc.y/uSrc.x); u = (floor(u*g)+.5)/g; }
  vec4 col;
  if(blurR>0.){
    vec4 acc = vec4(0.); float w=0.; float r = blurR/uSrc.x;
    for(int i=0;i<24;i++){
      float a = float(i)*2.39996; float d = sqrt((float(i)+.5)/24.);
      vec2 off = vec2(cos(a), sin(a))*d*r*vec2(1., uSrc.x/uSrc.y);
      acc += S(u+off); w+=1.;
    }
    col = acc/w;
  } else if(rgbAmt>0.){
    vec2 off = vec2(cos(rgbAng), sin(rgbAng))*rgbAmt/uSrc.x;
    col = vec4(S(u+off).r, S(u).g, S(u-off).b, S(u).a);
  } else col = S(u);
  vec3 c = col.rgb;
  if(sharp>0.){
    vec2 px = 1./uSrc;
    vec3 n = (S(u+vec2(px.x,0.)).rgb + S(u-vec2(px.x,0.)).rgb + S(u+vec2(0.,px.y)).rgb + S(u-vec2(0.,px.y)).rgb)*.25;
    c += (c-n)*sharp*3.;
  }
  c += bright;
  c *= pow(2., exposure);
  c.r *= 1.+temp*.2; c.b *= 1.-temp*.2; c.g *= 1.-tint*.12; c.r *= 1.+tint*.04; c.b *= 1.+tint*.04;
  c = (c-.5)*(1.+contrast)+.5;
  float l = luma(c);
  c += shadows*.35*pow(1.-clamp(l,0.,1.),2.) * (1.-smoothstep(.5,1.,l));
  c += highlights*.35*pow(clamp(l,0.,1.),2.);
  c = (c - blacks*.2) / max(.05, 1.+whites*.3 - blacks*.2);
  c = c*(1.+gain) + lift*(1.-c);
  c = pow(max(c, vec3(0.)), 1./max(vec3(.05), 1.+gam));
  if(gammaF!=1.) c = pow(max(c,vec3(0.)), vec3(1./gammaF));
  float lu = luma(c);
  c = mix(vec3(lu), c, sat);
  float mx = max(c.r,max(c.g,c.b)), mn = min(c.r,min(c.g,c.b));
  c = mix(vec3(luma(c)), c, 1.+vib*(1.-(mx-mn)));
  if(hue!=0.){
    float a = hue, cs = cos(a), sn = sin(a);
    mat3 m = mat3(.299+.701*cs+.168*sn, .587-.587*cs+.330*sn, .114-.114*cs-.497*sn,
                  .299-.299*cs-.328*sn, .587+.413*cs+.035*sn, .114-.114*cs+.292*sn,
                  .299-.300*cs+1.25*sn, .587-.588*cs-1.05*sn, .114+.886*cs-.203*sn);
    c = m*c;
  }
  if(fade>0.) c = mix(c, c*.85+.08, fade);
  if(bwF>0.) c = mix(c, vec3(luma(c)), bwF);
  if(sepiaF>0.){ float g = luma(c); c = mix(c, vec3(g*1.07, g*.74, g*.43)*1.1, sepiaF); }
  if(invF>0.) c = mix(c, 1.-c, invF);
  if(poster>1.) c = floor(c*poster)/poster;
  if(thresh>=0.) c = vec3(step(thresh, luma(c)));
  if(noiseAmt>0.) c += (hash(uv*uSrc + uTime) - .5)*noiseAmt;
  if(vigAmt!=0.){
    vec2 d = (uv-.5)*vec2(1., uSrc.y/uSrc.x*1.0); float r = length(d)*1.6;
    float v = smoothstep(vigSize, vigSize+max(.001,vigFeather), r);
    c *= 1. + vigAmt*v*(vigAmt<0.?1.:2.);
  }
  c *= (1.-fadeAmt);
  o = vec4(clamp(c,0.,1.), col.a*uOp);
}`;

const UNIF = ['uSeq', 'uSrc', 'uAnchor', 'uPos', 'uScale', 'uRot', 'tex', 'uTime', 'uOp', 'exposure', 'contrast', 'highlights', 'shadows', 'whites', 'blacks', 'sat', 'vib', 'temp', 'tint', 'hue', 'fade', 'sharp', 'gammaF', 'lift', 'gam', 'gain', 'vigAmt', 'vigSize', 'vigFeather', 'blurR', 'mosaicN', 'rgbAmt', 'rgbAng', 'noiseAmt', 'poster', 'thresh', 'bwF', 'invF', 'sepiaF', 'crop', 'flipH', 'flipV', 'mirror', 'fadeAmt', 'bright'];

export class Compositor {
  constructor(canvas) {
    this.cv = canvas;
    const g = this.g = canvas.getContext('webgl2', { alpha: false, antialias: false, preserveDrawingBuffer: true });
    if (!g) throw new Error('webgl2 unavailable');
    const mk = (t, s) => { const x = g.createShader(t); g.shaderSource(x, s); g.compileShader(x); if (!g.getShaderParameter(x, g.COMPILE_STATUS)) throw new Error(g.getShaderInfoLog(x)); return x; };
    const pr = this.pr = g.createProgram();
    g.attachShader(pr, mk(g.VERTEX_SHADER, VS)); g.attachShader(pr, mk(g.FRAGMENT_SHADER, FS)); g.linkProgram(pr);
    if (!g.getProgramParameter(pr, g.LINK_STATUS)) throw new Error(g.getProgramInfoLog(pr));
    this.u = {}; UNIF.forEach(n => this.u[n] = g.getUniformLocation(pr, n));
    const b = g.createBuffer(); g.bindBuffer(g.ARRAY_BUFFER, b);
    g.bufferData(g.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), g.STATIC_DRAW);
    const loc = g.getAttribLocation(pr, 'a'); g.enableVertexAttribArray(loc); g.vertexAttribPointer(loc, 2, g.FLOAT, false, 0, 0);
    this.tex = new Map();
    g.enable(g.BLEND); g.blendFunc(g.SRC_ALPHA, g.ONE_MINUS_SRC_ALPHA);
  }
  texFor(id) {
    const g = this.g; let t = this.tex.get(id);
    if (!t) {
      t = g.createTexture(); g.bindTexture(g.TEXTURE_2D, t);
      g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MIN_FILTER, g.LINEAR); g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MAG_FILTER, g.LINEAR);
      g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_S, g.CLAMP_TO_EDGE); g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_T, g.CLAMP_TO_EDGE);
      this.tex.set(id, t);
    }
    return t;
  }
  resize(w, h) { if (this.cv.width !== w || this.cv.height !== h) { this.cv.width = w; this.cv.height = h; } }

  // gather shader params for a clip at global time t
  params(clip, t) {
    const lt = t - clip.start;
    const q = {
      exposure: 0, contrast: 0, highlights: 0, shadows: 0, whites: 0, blacks: 0, sat: 1, vib: 0, temp: 0, tint: 0, hue: 0, fade: 0, sharp: 0, gammaF: 1,
      lift: [0, 0, 0], gam: [0, 0, 0], gain: [0, 0, 0], vigAmt: 0, vigSize: .5, vigFeather: .5, blurR: 0, mosaicN: 0, rgbAmt: 0, rgbAng: 0, noiseAmt: 0,
      poster: 0, thresh: -1, bwF: 0, invF: 0, sepiaF: 0, crop: [0, 0, 0, 0], flipH: 0, flipV: 0, mirror: -1, fadeAmt: 0, bright: 0,
      px: 0, py: 0, sx: 1, sy: 1, rot: 0, ax: 0, ay: 0, op: 1,
    };
    for (const f of clip.fx || []) {
      if (!f.on) continue;
      const v = k => val(clip, f, k, lt);
      switch (f.type) {
        case 'motion': { const s = v('scale') / 100, sw = v('sw') / 100; q.px = v('px'); q.py = v('py'); q.sx = s * (clip.uniform === false ? sw : 1); q.sy = s; q.rot = v('rot') * Math.PI / 180; q.ax = v('ax'); q.ay = v('ay'); break; }
        case 'opacity': q.op = v('op') / 100; break;
        case 'lumetri':
          q.temp += v('temp') / 100; q.tint += v('tint') / 100; q.exposure += v('exposure'); q.contrast += v('contrast') / 100;
          q.highlights += v('highlights') / 100; q.shadows += v('shadows') / 100; q.whites += v('whites') / 100; q.blacks += v('blacks') / 100;
          q.sat *= v('sat') / 100; q.vib += v('vib') / 100; q.hue += v('hue') * Math.PI / 180; q.fade += v('fade') / 100; q.sharp += v('sharp') / 100;
          q.lift[0] += v('liftR'); q.lift[1] += v('liftG'); q.lift[2] += v('liftB'); q.gam[0] += v('gamR'); q.gam[1] += v('gamG'); q.gam[2] += v('gamB');
          q.gain[0] += v('gainR'); q.gain[1] += v('gainG'); q.gain[2] += v('gainB');
          if (v('vigAmt')) { q.vigAmt += v('vigAmt'); q.vigSize = v('vigSize') / 100; q.vigFeather = v('vigFeather') / 100; }
          break;
        case 'bc': q.bright += v('bright') / 200; q.contrast += v('contrast') / 100; break;
        case 'gamma': q.gammaF = v('gamma') / 10; break;
        case 'huesat': q.hue += v('hue') * Math.PI / 180; q.sat *= v('sat') / 100; break;
        case 'bw': q.bwF = 1; break;
        case 'invert': q.invF = 1; break;
        case 'sepia': q.sepiaF = v('amt') / 100; break;
        case 'colorbal': for (let i = 0; i < 3; i++) { const c = 'RGB'[i]; q.lift[i] += v('lift' + c) / 200; q.gam[i] += v('gam' + c) / 100; q.gain[i] += v('gain' + c) / 200; } break;
        case 'posterize': q.poster = v('lv'); break;
        case 'threshold': q.thresh = v('lv') / 255; break;
        case 'blur': q.blurR = v('r') * 1.6; break;
        case 'sharpen': q.sharp += v('amt') / 100; break;
        case 'mosaic': q.mosaicN = v('n'); break;
        case 'rgbsplit': q.rgbAmt = v('amt') * 2; q.rgbAng = v('ang') * Math.PI / 180; break;
        case 'noise': q.noiseAmt = v('amt') / 100; break;
        case 'vignette': q.vigAmt += v('amt'); q.vigSize = v('size') / 100; q.vigFeather = v('feather') / 100; break;
        case 'crop': q.crop = [v('l') / 100, v('t') / 100, v('r') / 100, v('b') / 100]; break;
        case 'hflip': q.flipH = 1; break;
        case 'vflip': q.flipV = 1; break;
        case 'mirror': q.mirror = v('pos') / 100; break;
        case 'fadein': q.fadeAmt = v('amt') / 100; break;
      }
    }
    return q;
  }

  drawClip(clip, src, sw, sh, t, W, H, extra) {
    const g = this.g, u = this.u, q = this.params(clip, t);
    if (extra) Object.assign(q, extra(q));
    const tx = this.texFor(clip.id); g.activeTexture(g.TEXTURE0); g.bindTexture(g.TEXTURE_2D, tx);
    try { g.texImage2D(g.TEXTURE_2D, 0, g.RGBA, g.RGBA, g.UNSIGNED_BYTE, src); } catch { return; }
    g.uniform1i(u.tex, 0);
    g.uniform2f(u.uSeq, W, H); g.uniform2f(u.uSrc, sw, sh);
    g.uniform2f(u.uAnchor, q.ax, q.ay); g.uniform2f(u.uPos, q.px, q.py); g.uniform2f(u.uScale, q.sx, q.sy); g.uniform1f(u.uRot, q.rot);
    g.uniform1f(u.uTime, (t * 7.1) % 10); g.uniform1f(u.uOp, q.op);
    for (const k of ['exposure', 'contrast', 'highlights', 'shadows', 'whites', 'blacks', 'sat', 'vib', 'temp', 'tint', 'hue', 'fade', 'sharp', 'gammaF', 'vigAmt', 'vigSize', 'vigFeather', 'blurR', 'mosaicN', 'rgbAmt', 'rgbAng', 'noiseAmt', 'poster', 'thresh', 'bwF', 'invF', 'sepiaF', 'flipH', 'flipV', 'mirror', 'fadeAmt', 'bright']) g.uniform1f(u[k], q[k]);
    g.uniform3fv(u.lift, q.lift); g.uniform3fv(u.gam, q.gam); g.uniform3fv(u.gain, q.gain); g.uniform4fv(u.crop, q.crop);
    g.drawArrays(g.TRIANGLE_STRIP, 0, 4);
  }
}
