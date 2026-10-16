import { N, SEL, BOOL, COL } from './fx.js';
export const TRANS = {};
export const TCATS = ['3D Motion', 'Dissolve', 'Immersive Video', 'Iris', 'Page Peel', 'Slide', 'Wipe', 'Zoom'];
const tdef = (type, name, cat, params, glsl, o = {}) => { TRANS[type] = { type, name, cat, params, glsl, ...o }; };
const DIR4 = ['From Right', 'From Left', 'From Top', 'From Bottom'];
const F = N('feather', 'Feather', 0, 100, 5);

// ---- 3D motion ----
tdef('cubeSpin', 'Cube Spin', '3D Motion', [SEL('dir', 'Direction', ['Left', 'Right', 'Up', 'Down'])], `
vec4 tr(vec2 uv){
  vec2 q = uv; int d = int(p_dir+.5); bool vert = d>=2; bool rev = (d==1||d==3);
  float x = vert ? q.y : q.x; if(rev) x = 1.-x; float y = vert ? q.x : q.y; float xb = 1.-p;
  vec4 r = vec4(0.);
  if(x < xb){ float u = x/max(xb,.001); float s = mix(1.-.35*p, 1., u); float v = (y-.5)/s+.5; if(v>=0.&&v<=1.){ vec2 c = vec2(u, v); if(rev) c.x = 1.-c.x; c = vert ? c.yx : c; if(vert && !rev) {} r = A(vert? vec2(v, rev?1.-u:u) : vec2(rev?1.-u:u, v)); r.rgb *= mix(1., .55+.45*u, p); } }
  else { float u = (x-xb)/max(1.-xb,.001); float s = mix(1., 1.-.35*(1.-p), u); float v = (y-.5)/s+.5; if(v>=0.&&v<=1.){ r = B(vert? vec2(v, rev?1.-u:u) : vec2(rev?1.-u:u, v)); r.rgb *= mix(.55+.45*(1.-u), 1., p); } }
  return r;
}`);
tdef('flipOver', 'Flip Over', '3D Motion', [SEL('dir', 'Axis', ['Horizontal', 'Vertical']), COL('bg', 'Background', '#000000')], `
vec4 tr(vec2 uv){
  bool vert = p_dir>.5; float a = p*3.14159; float c = cos(a); bool second = p>.5;
  vec2 q = vert ? uv.yx : uv; float x = (q.x-.5)/max(abs(c),.001); float persp = 1.+ (q.x-.5)*sin(a)*.5*(second?-1.:1.); float y = (q.y-.5)*persp+.5; x += .5;
  if(x<0.||x>1.||y<0.||y>1.) return vec4(p_bg*0.,0.);
  vec2 s = vert ? vec2(y,x) : vec2(x,y); if(second){ s = vert ? vec2(y,1.-x) : vec2(1.-x,y); }
  vec4 r = second ? B(s) : A(s); r.rgb *= .6+.4*abs(c); return r;
}`);

// ---- dissolve ----
tdef('crossDissolve', 'Cross Dissolve', 'Dissolve', [], `vec4 tr(vec2 uv){ return A(uv)*(1.-p) + B(uv)*p; }`, { def: 'v' });
tdef('additiveDissolve', 'Additive Dissolve', 'Dissolve', [], `vec4 tr(vec2 uv){ return min(A(uv)*(1.-p) + B(uv)*p + A(uv)*B(uv)*p*(1.-p)*2., 1.); }`);
tdef('dipBlack', 'Dip to Black', 'Dissolve', [], `vec4 tr(vec2 uv){ vec4 a = A(uv), b = B(uv); float k = p<.5 ? 1.-p*2. : p*2.-1.; vec4 r = p<.5 ? a : b; r.rgb *= k; if(p<.5) r.a = a.a; return r; }`);
tdef('dipWhite', 'Dip to White', 'Dissolve', [], `vec4 tr(vec2 uv){ vec4 a = A(uv), b = B(uv); float k = p<.5 ? p*2. : 2.-p*2.; vec4 r = p<.5 ? a : b; r.rgb = mix(r.rgb, vec3(r.a), k); return r; }`);
tdef('filmDissolve', 'Film Dissolve', 'Dissolve', [], `vec4 tr(vec2 uv){ vec4 a = A(uv), b = B(uv); vec3 l = pow(a.rgb*(1.-p), vec3(1./2.2)) ; vec3 la = pow(max(a.rgb,0.), vec3(2.2))*(1.-p) + pow(max(b.rgb,0.), vec3(2.2))*p; return vec4(pow(la, vec3(1./2.2)), a.a*(1.-p)+b.a*p); }`);
tdef('morphCut', 'Morph Cut', 'Dissolve', [], `vec4 tr(vec2 uv){ float k = sin(p*3.14159); vec4 a = vec4(0.), b = vec4(0.); for(int i=0;i<8;i++){ float an = float(i)*.785; vec2 o = vec2(cos(an),sin(an))*k*.012; a += A(uv+o); b += B(uv-o); } a/=8.; b/=8.; float s = smoothstep(0.,1.,p); return a*(1.-s)+b*s; }`);
tdef('nonAdditive', 'Non-Additive Dissolve', 'Dissolve', [], `vec4 tr(vec2 uv){ return max(A(uv)*(1.-p), B(uv)*p); }`);

// ---- immersive (equirectangular) ----
tdef('vrChroma', 'VR Chroma Leaks', 'Immersive Video', [N('int', 'Light Leak Intensity', 0, 100, 60), N('hue', 'Hue', 0, 360, 20)], `
vec4 tr(vec2 uv){
  float k = sin(p*3.14159); vec2 q = uv; float n = fbm(vec2(q.x*3.+uTime*.3, q.y*2.)); vec3 leak = hsv2rgb(vec3(fract(p_hue/360.+n*.3+q.x*.2), .85, 1.))*pow(k,1.5)*p_int*.02*smoothstep(.2,.8,n+.3);
  vec4 r = A(uv)*(1.-p)+B(uv)*p; r.rgb = min(r.rgb + leak*r.a, 1.); return r;
}`);
tdef('vrGradWipe', 'VR Gradient Wipe', 'Immersive Video', [F, BOOL('inv', 'Invert')], `
vec4 tr(vec2 uv){ float g = uv.x + (fbm(uv*vec2(4.,3.))-.5)*.25; if(p_inv>.5) g = 1.-g; float f = p_feather*.01+.01; float m = smoothstep(p*(1.+f*2.)-f*2., p*(1.+f*2.), g); return A(uv)*m + B(uv)*(1.-m); }`);
tdef('vrIris', 'VR Iris Wipe', 'Immersive Video', [N('cx', 'Center Longitude', 0, 100, 50), N('cy', 'Center Latitude', 0, 100, 50), F], `
vec4 tr(vec2 uv){
  vec2 c = vec2(p_cx,p_cy)*.01; vec2 a = (uv.x-c.x)*6.28318*vec2(1.,0.) ; float dx = abs(uv.x-c.x); dx = min(dx,1.-dx)*6.28318; float dy = (uv.y-c.y)*3.14159; float d = length(vec2(dx*cos((uv.y-.5)*3.14159), dy));
  float R = p*3.3; float f = p_feather*.01*.5+.01; float m = 1.-smoothstep(R-f, R+f, d); return A(uv)*(1.-m) + B(uv)*m; }`);
tdef('vrMobius', 'VR Mobius Zoom', 'Immersive Video', [N('zoom', 'Zoom', 0, 100, 60)], `
vec4 tr(vec2 uv){
  vec2 c = uv-.5; float k = 1.+p*p_zoom*.03; float rr = length(c); float an = atan(c.y,c.x) + p*(1.-p)*2.*rr*6.; vec2 u = .5 + vec2(cos(an),sin(an))*rr/k; vec2 u2 = .5 + vec2(cos(an),sin(an))*rr*k*(1.-p*.0);
  return A(clamp(u,0.,1.))*(1.-p) + B(clamp(.5+c/mix(k*1.5,1.,p),0.,1.))*p; }`);
tdef('vrBlocks', 'VR Random Blocks', 'Immersive Video', [N('bw', 'Block Width', 2, 100, 20, 1), N('bh', 'Block Height', 2, 100, 10, 1), F], `
vec4 tr(vec2 uv){ vec2 g = vec2(p_bw, p_bh); vec2 id = floor(uv*g); float r = hash(id+3.7); float f = p_feather*.01+.02; float m = smoothstep(r-f, r+f, p*(1.+2.*f)-f); return A(uv)*(1.-m) + B(uv)*m; }`);
tdef('vrSphBlur', 'VR Spherical Blur', 'Immersive Video', [N('amt', 'Blur Amount', 0, 100, 60)], `
vec4 tr(vec2 uv){ float k = sin(p*3.14159)*p_amt*.0015; vec4 a = vec4(0.), b = vec4(0.); float cl = 1./max(cos((uv.y-.5)*3.14159),.2);
  for(int i=0;i<20;i++){ float an = float(i)*2.39996, d = sqrt((float(i)+.5)/20.); vec2 o = vec2(cos(an)*cl, sin(an))*d*k; a += A(uv+o); b += B(uv+o); } a/=20.; b/=20.; return a*(1.-p)+b*p; }`);

// ---- iris ----
const iris = (shape) => `
vec4 tr(vec2 uv){ float ar = uRes.x/uRes.y; vec2 c = (uv-vec2(p_cx,p_cy)*.01)*vec2(ar,1.); vec2 n = c/vec2(ar*.5,.5);
  float f = p_feather*.003+.003; float m; ${shape}
  return A(uv)*(1.-m) + B(uv)*m; }`;
const irisP = [N('cx', 'Center X', 0, 100, 50, .1), N('cy', 'Center Y', 0, 100, 50, .1), F];
tdef('irisBox', 'Iris Box', 'Iris', irisP, iris('float d = max(abs(n.x), abs(n.y)); m = 1.-smoothstep(p*1.02-f, p*1.02+f, d);'));
tdef('irisCross', 'Iris Cross', 'Iris', irisP, iris(`float fc = min(max(abs(n.x), abs(n.y)*2.5), max(abs(n.y), abs(n.x)*2.5)); float m1 = 1.-smoothstep(p-f, p+f, fc);
  float k = smoothstep(.5,1.,p)*1.03; float m2 = 1.-smoothstep(k-f, k+f, max(abs(n.x),abs(n.y))); m = max(m1, m2);`));
tdef('irisDiamond', 'Iris Diamond', 'Iris', irisP, iris('float d = (abs(n.x)+abs(n.y))*.5; m = 1.-smoothstep(p*1.02-f, p*1.02+f, d);'));
tdef('irisPoints', 'Iris Points', 'Iris', irisP, iris('float an = atan(c.y,c.x); float d = length(c)/(.5+.5*cos(an*5.)*cos(an*5.)*.0+.5*cos(an*5.)); d = length(c)/max(.16, .58+.42*cos(an*5.)); float T = p*p*5.5*1.0; m = 1.-smoothstep(T-f*3., T+f*3., d);'));

// ---- page peel ----
const curl = (R) => `
vec4 tr(vec2 uv){
  float c = mix(1.05, -${(R * 3.14159).toFixed(3)}, p); float R = ${R}; float d = uv.x - c;
  if(d < 0.) return A(uv);
  vec4 b = B(uv); 
  if(d < R){ float s = asin(clamp(d/R,0.,1.)); float xb = c + (3.14159 - s)*R; float xf = c + s*R;
    if(xb <= 1.){ vec4 a = A(vec2(xb, uv.y)); float sh = .55 + .45*(1.-d/R); a.rgb *= sh; a.rgb = mix(a.rgb, vec3(luma(a.rgb))*.9+.08, .3); return a; }
    if(xf <= 1.){ vec4 a = A(vec2(xf, uv.y)); a.rgb *= .75+.25*cos(s); return a; } }
  float sd = smoothstep(R+.12, R, d)*.45; return b*(1.-sd*b.a*0.) * (1.-sd);
}`;
tdef('pagePeel', 'Page Peel', 'Page Peel', [], curl(.07));
tdef('pageTurn', 'Page Turn', 'Page Peel', [], curl(.16));

// ---- slide ----
tdef('centerSplit', 'Center Split', 'Slide', [COL('bg', 'Border Color', '#000000')], `
vec4 tr(vec2 uv){ vec2 s = vec2(uv.x<.5?-1.:1., uv.y<.5?-1.:1.); vec2 u = uv - s*p*.5*vec2(1.,1.)*-1.; 
  vec2 q = uv + sign(uv-.5)*(-p*.5); vec2 qq = (uv-.5); vec2 uu = vec2(uv.x + (uv.x<.5 ? p*.5 : -p*.5), uv.y + (uv.y<.5 ? p*.5 : -p*.5));
  bool inA = (uv.x<.5 ? uu.x<.5 : uu.x>.5) && (uv.y<.5 ? uu.y<.5 : uu.y>.5);
  return inA ? A(uu) : B(uv); }`);
tdef('push', 'Push', 'Slide', [SEL('dir', 'Direction', DIR4)], `
vec4 tr(vec2 uv){ int d = int(p_dir+.5); vec2 v = d==0 ? vec2(-1.,0.) : d==1 ? vec2(1.,0.) : d==2 ? vec2(0.,1.) : vec2(0.,-1.);
  vec2 ua = uv - v*p*-1.; vec2 ub = uv - v*(p-1.)*-1.; ua = uv + v*p*-1.*-1.; ua = uv - v*p; ub = uv - v*(p-1.);
  if(ua.x>=0.&&ua.x<=1.&&ua.y>=0.&&ua.y<=1.) return A(ua); return B(ub); }`);
tdef('slide', 'Slide', 'Slide', [SEL('dir', 'Direction', DIR4)], `
vec4 tr(vec2 uv){ int d = int(p_dir+.5); vec2 v = d==0 ? vec2(-1.,0.) : d==1 ? vec2(1.,0.) : d==2 ? vec2(0.,1.) : vec2(0.,-1.);
  vec2 ub = uv - v*(p-1.); vec4 a = A(uv); if(ub.x>=0.&&ub.x<=1.&&ub.y>=0.&&ub.y<=1.){ return B(ub); } return a; }`);
tdef('split', 'Split', 'Slide', [SEL('dir', 'Orientation', ['Horizontal', 'Vertical'])], `
vec4 tr(vec2 uv){ bool v = p_dir>.5; float x = v ? uv.y : uv.x; float s = x<.5 ? 1. : -1.; float xx = x + s*p*.5; bool inA = x<.5 ? xx<.5 : xx>.5; vec2 u = v ? vec2(uv.x, xx) : vec2(xx, uv.y); return inA ? A(u) : B(uv); }`);

// ---- wipe ----
tdef('barnDoors', 'Barn Doors', 'Wipe', [SEL('dir', 'Orientation', ['Vertical (open)', 'Horizontal (open)']), F], `
vec4 tr(vec2 uv){ float x = p_dir>.5 ? uv.y : uv.x; float d = abs(x-.5)*2.; float f = p_feather*.002+.001; float m = 1.-smoothstep(p-f, p+f, d); return A(uv)*(1.-m) + B(uv)*m; }`);
tdef('clockWipe', 'Clock Wipe', 'Wipe', [N('start', 'Start Angle', 0, 360, 0), BOOL('ccw', 'Counterclockwise'), F], `
vec4 tr(vec2 uv){ vec2 c = uv-.5; float a = atan(c.x, -c.y); a = a<0.? a+6.28318 : a; a = fract(a/6.28318 - p_start/360.); if(p_ccw>.5) a = 1.-a; float f = p_feather*.002+.001; float m = 1.-smoothstep(p-f, p+f, a); return A(uv)*(1.-m)+B(uv)*m; }`);
tdef('gradientWipe', 'Gradient Wipe', 'Wipe', [SEL('pat', 'Gradient', ['Linear', 'Radial', 'Diagonal', 'Cloud', 'Rings', 'Checks']), N('soft', 'Softness', 0, 100, 25), BOOL('inv', 'Invert')], `
vec4 tr(vec2 uv){ int k = int(p_pat+.5); float g = k==0 ? uv.x : k==1 ? length(uv-.5)*1.414 : k==2 ? (uv.x+uv.y)*.5 : k==3 ? fbm(uv*5.) : k==4 ? fract(length(uv-.5)*4.)*.5+length(uv-.5)*.7 : hash(floor(uv*vec2(16.,9.)));
  if(p_inv>.5) g = 1.-g; float f = p_soft*.01*.5+.005; float m = smoothstep(g-f, g+f, p*(1.+4.*f)-2.*f); return A(uv)*(1.-m)+B(uv)*m; }`);
tdef('linearWipe', 'Linear Wipe', 'Wipe', [N('ang', 'Wipe Angle', 0, 360, 90), F], `
vec4 tr(vec2 uv){ float a = radians(p_ang); vec2 d = vec2(sin(a), -cos(a)); float g = dot(uv-.5, d)+.5; float f = p_feather*.003+.001; float m = smoothstep(p*(1.+2.*f)-2.*f-f, p*(1.+2.*f)-2.*f+f, 1.-g+0.); m = 1.-m; return A(uv)*(1.-m)+B(uv)*m; }`);
tdef('radialWipe', 'Radial Wipe', 'Wipe', [N('start', 'Start Angle', 0, 360, 0), SEL('corner', 'Origin', ['Top Left', 'Top Right', 'Bottom Right', 'Bottom Left']), F], `
vec4 tr(vec2 uv){ int k = int(p_corner+.5); vec2 o = k==0 ? vec2(0.) : k==1 ? vec2(1.,0.) : k==2 ? vec2(1.) : vec2(0.,1.); vec2 c = (uv-o)*vec2(uRes.x/uRes.y,1.); float a = atan(c.y,c.x); float base = k==0 ? 0. : k==1 ? 1.5708 : k==2 ? 3.14159 : 4.7124; a = (a - base)/1.5708; a = clamp(a,0.,1.); float f = p_feather*.002+.001; float m = 1.-smoothstep(p-f, p+f, a*(1.-.0)); m = p>.999 ? 1. : m; return A(uv)*(1.-m)+B(uv)*m; }`);
tdef('venetian', 'Venetian Blinds', 'Wipe', [N('n', 'Bands', 1, 50, 8, 1), SEL('dir', 'Orientation', ['Horizontal', 'Vertical']), F], `
vec4 tr(vec2 uv){ float x = p_dir>.5 ? uv.x : uv.y; float f = fract(x*p_n); float fe = p_feather*.002+.001; float m = 1.-smoothstep(p-fe, p+fe, f); return A(uv)*(1.-m)+B(uv)*m; }`);

// ---- zoom ----
tdef('crossZoom', 'Cross Zoom', 'Zoom', [N('str', 'Strength', 0, 100, 60)], `
vec4 tr(vec2 uv){ vec2 c = uv-.5; vec4 a = vec4(0.), b = vec4(0.); float k = p_str*.01;
  for(int i=0;i<16;i++){ float t = float(i)/15.; a += A(.5 + c/(1.+p*k*2.*t)); b += B(.5 + c/(1.+(1.-p)*k*2.*(1.-t)*-1.*-1.)); } a/=16.; b/=16.;
  float s = smoothstep(.2,.8,p); return a*(1.-s)+b*s; }`);

export const DEFAULT_VT = 'crossDissolve';

// region occupied by a clip's head (tin) / tail (tout) transition on its track
export function transRegion(tr, c, side) {
  const x = c[side]; if (!x || !x.type) return null;
  const d = Math.max(.04, x.dur || 1);
  if (side === 'tin') {
    const prev = tr.clips.find(y => y !== c && Math.abs(y.start + y.dur - c.start) < 2e-3);
    const T = c.start;
    if (prev) { const al = x.align || 'center'; const r0 = al === 'start' ? T : al === 'end' ? T - d : T - d / 2; return { r0, r1: r0 + d, a: prev, b: c, x }; }
    return { r0: T, r1: T + d, a: null, b: c, x };
  }
  const T = c.start + c.dur;
  if (tr.clips.find(y => y !== c && Math.abs(y.start - T) < 2e-3)) return null;
  return { r0: T - d, r1: T, a: c, b: null, x };
}
export function newTrans(type) {
  const d = TRANS[type]; const p = {}; d.params.forEach(q => p[q.k] = q.def);
  return { id: 't' + Math.random().toString(36).slice(2, 8), type, dur: 1, align: 'center', p };
}
