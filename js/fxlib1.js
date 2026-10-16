import { def, N, COL, BOOL, SEL } from './fx.js';
const pct = (k, l, d = 0) => N(k, l, 0, 100, d, .1, '%');
const DIM = ['Horizontal and Vertical', 'Horizontal', 'Vertical'];

// ================= BLUR & SHARPEN =================
def('cameraBlur', 'Camera Blur', 'Blur & Sharpen', [N('pct', 'Percent Blur', 0, 100, 0, .1)], { glsl: `
vec4 fx(vec2 uv){ return spiral(uv, p_pct*.01*uRes.x*.06, 28); }` });
def('channelBlur', 'Channel Blur', 'Blur & Sharpen', [N('r', 'Red Blurriness', 0, 100, 0, .1), N('g', 'Green Blurriness', 0, 100, 0, .1), N('b', 'Blue Blurriness', 0, 100, 0, .1), N('a', 'Alpha Blurriness', 0, 100, 0, .1), SEL('dir', 'Dimensions', DIM)], { glsl: `
vec4 fx(vec2 uv){
  float k = uRes.x*.002;
  vec4 R = spiral(uv, p_r*k, 20), G = spiral(uv, p_g*k, 20), B = spiral(uv, p_b*k, 20), A = spiral(uv, p_a*k, 20);
  return vec4(R.r, G.g, B.b, A.a);
}` });
def('compoundBlur', 'Compound Blur', 'Blur & Sharpen', [N('max', 'Maximum Blur', 0, 100, 20, .1), BOOL('inv', 'Invert Blur')], { glsl: `
vec4 fx(vec2 uv){ float l = luma(U(S(uv)).rgb); if(p_inv>.5) l = 1.-l; return spiral(uv, l*p_max*uRes.x*.002, 24); }` });
def('directionalBlur', 'Directional Blur', 'Blur & Sharpen', [N('ang', 'Direction', -360, 360, 0, .1, '°'), N('len', 'Blur Length', 0, 500, 10, .1)], { glsl: `
vec4 fx(vec2 uv){
  vec2 d = vec2(cos(radians(p_ang)), sin(radians(p_ang)))*p_len*px; vec4 a = vec4(0.);
  for(int i=0;i<32;i++){ float t = float(i)/31.-.5; a += S(uv + d*t); } return a/32.;
}` });
def('gblur', 'Gaussian Blur', 'Blur & Sharpen', [N('r', 'Blurriness', 0, 300, 0, .1), SEL('dir', 'Blur Dimensions', DIM), BOOL('rep', 'Repeat Edge Pixels', true)], { passes: 2, glsl: `
vec4 fx(vec2 uv){
  float r = p_r; if(r<.01) return S(uv);
  vec2 dir = uPass==0 ? vec2(1.,0.) : vec2(0.,1.);
  if(p_dir>.5 && p_dir<1.5 && uPass==1) return S(uv);
  if(p_dir>1.5 && uPass==0) return S(uv);
  float sig = max(r*.5, .3); float step_ = max(1., r/16.);
  vec4 a = vec4(0.); float w = 0.;
  for(int i=-16;i<=16;i++){ float x = float(i)*step_; float g = exp(-x*x/(2.*sig*sig)); a += S(uv + dir*px*x)*g; w += g; }
  return a/w;
}` });
def('radialBlur', 'Radial Blur', 'Blur & Sharpen', [N('amt', 'Amount', 0, 100, 0, .1), SEL('type', 'Type', ['Spin', 'Zoom']), pct('cx', 'Center X', 50), pct('cy', 'Center Y', 50)], { glsl: `
vec4 fx(vec2 uv){
  vec2 c = vec2(p_cx,p_cy)*.01; vec2 d = uv - c; vec4 a = vec4(0.);
  for(int i=0;i<24;i++){ float t = float(i)/23.-.5;
    if(p_type<.5){ float an = t*p_amt*.01*.6; a += S(c + rot(d, an)); } else a += S(c + d*(1. + t*p_amt*.01*.5)); }
  return a/24.;
}` });
def('sharpen', 'Sharpen', 'Blur & Sharpen', [N('amt', 'Sharpen Amount', 0, 100, 0)], { glsl: `
vec4 fx(vec2 uv){ vec4 c = S(uv); vec4 n = (S(uv+vec2(px.x,0.))+S(uv-vec2(px.x,0.))+S(uv+vec2(0.,px.y))+S(uv-vec2(0.,px.y)))*.25; return c + (c-n)*p_amt*.04; }` });
def('unsharp', 'Unsharp Mask', 'Blur & Sharpen', [N('amt', 'Amount', 0, 500, 50), N('rad', 'Radius', .1, 50, 3, .1), N('thr', 'Threshold', 0, 255, 0)], { glsl: `
vec4 fx(vec2 uv){ vec4 c = S(uv); vec4 b = spiral(uv, p_rad, 20); vec4 d = c - b; float m = step(p_thr/255., max(abs(d.r),max(abs(d.g),abs(d.b)))); return c + d*p_amt*.02*m; }` });

// ================= CHANNEL =================
def('arithmetic', 'Arithmetic', 'Channel', [SEL('op', 'Operator', ['And', 'Or', 'Xor', 'Add', 'Subtract', 'Multiply', 'Difference', 'Min', 'Max', 'Block Above', 'Block Below', 'Slide'], 3), N('r', 'Red Value', 0, 255, 0), N('g', 'Green Value', 0, 255, 0), N('b', 'Blue Value', 0, 255, 0), BOOL('clip', 'Clip Result Values', true)], { kind: 'color', glsl: `
vec3 cfx(vec3 c, vec2 uv){
  vec3 v = vec3(p_r,p_g,p_b)/255.; int op = int(p_op+.5); vec3 o = c;
  if(op==0||op==1||op==2){ ivec3 a = ivec3(c*255.+.5), b = ivec3(v*255.+.5); ivec3 r = op==0 ? (a&b) : op==1 ? (a|b) : (a^b); o = vec3(r)/255.; }
  else if(op==3) o = c+v; else if(op==4) o = c-v; else if(op==5) o = c*v*1.;
  else if(op==6) o = abs(c-v); else if(op==7) o = min(c,v); else if(op==8) o = max(c,v);
  else if(op==9) o = mix(c, max(c,v), 1.); else if(op==10) o = min(c,v); else o = mod(c+v,1.);
  if(op==5) o = c*v*2.;
  return p_clip>.5 ? clamp(o,0.,1.) : o;
}` });
def('blendch', 'Blend', 'Channel', [N('track', 'Blend With Track (V)', 1, 8, 2, 1), SEL('mode', 'Mode', ['Cross fade', 'Color only', 'Tint only', 'Darken only', 'Lighten only']), N('amt', 'Blend With Original', 0, 100, 50)], { post: true, needsTrack: 'track', glsl: `
vec4 fx(vec2 uv){
  vec4 a = S(uv), b = texture(uTex2, uv); float t = p_amt*.01; int m = int(p_mode+.5);
  vec3 ua = U(a).rgb, ub = U(b).rgb; vec3 r;
  if(m==0) r = mix(ua, ub, 1.-t); else if(m==1){ vec3 h = rgb2hsv(ua), hb = rgb2hsv(ub); r = hsv2rgb(vec3(hb.x,hb.y,h.z)); r = mix(ua, r, 1.-t); }
  else if(m==2) r = mix(ua, vec3(luma(ua))*ub*1.5, 1.-t); else if(m==3) r = mix(ua, min(ua,ub), 1.-t); else r = mix(ua, max(ua,ub), 1.-t);
  return M(vec4(r, a.a));
}` });
def('invertch', 'Invert', 'Channel', [SEL('ch', 'Channel', ['RGB', 'Red', 'Green', 'Blue', 'Alpha', 'Luma', 'Hue', 'Saturation'], 0), N('amt', 'Blend With Original', 0, 100, 0)], { glsl: `
vec4 fx(vec2 uv){
  vec4 s = S(uv); vec4 c = U(s); int ch = int(p_ch+.5); vec4 o = c;
  if(ch==0) o.rgb = 1.-c.rgb; else if(ch==1) o.r = 1.-c.r; else if(ch==2) o.g = 1.-c.g; else if(ch==3) o.b = 1.-c.b; else if(ch==4) o.a = 1.-c.a;
  else { vec3 h = rgb2hsv(c.rgb); if(ch==5) h.z = 1.-h.z; else if(ch==6) h.x = fract(h.x+.5); else h.y = 1.-h.y; o.rgb = hsv2rgb(h); }
  return M(mix(o, c, p_amt*.01));
}` });
def('minimax', 'Minimax', 'Channel', [SEL('op', 'Operation', ['Minimum', 'Maximum', 'Minimum then Maximum', 'Maximum then Minimum']), N('rad', 'Radius', 0, 8, 1, 1), SEL('ch', 'Channel', ['Color', 'Alpha', 'Alpha and Color', 'Red', 'Green', 'Blue']), SEL('dir', 'Direction', DIM)], { glsl: `
vec4 fx(vec2 uv){
  int op = int(p_op+.5); float r = floor(p_rad+.5);
  bool mx = (op==1) || (op==3 && uPass==0) || false;
  vec4 mn = vec4(1.), mxv = vec4(0.);
  for(int i=-8;i<=8;i++){ if(float(abs(i))>r) continue;
    for(int j=-8;j<=8;j++){ if(float(abs(j))>r) continue; if(p_dir>.5&&p_dir<1.5&&j!=0) continue; if(p_dir>1.5&&i!=0) continue;
      vec4 t = S(uv+vec2(float(i),float(j))*px); mn = min(mn,t); mxv = max(mxv,t); } }
  vec4 o = (op==1||op==3) ? mxv : mn;
  vec4 s = S(uv);
  int ch = int(p_ch+.5);
  if(ch==1) return vec4(s.rgb, o.a); if(ch==3) return vec4(o.r,s.g,s.b,s.a); if(ch==4) return vec4(s.r,o.g,s.b,s.a); if(ch==5) return vec4(s.r,s.g,o.b,s.a);
  return o;
}` });
def('solidComp', 'Solid Composite', 'Channel', [N('sop', 'Source Opacity', 0, 100, 100), COL('col', 'Color', '#000000'), N('op', 'Opacity', 0, 100, 100), SEL('mode', 'Blend Mode', ['Normal', 'Add', 'Multiply', 'Screen'])], { glsl: `
vec4 fx(vec2 uv){
  vec4 s = S(uv)*p_sop*.01; vec3 b = p_col; float ba = p_op*.01; int m = int(p_mode+.5);
  vec3 sc = U(s).rgb; vec3 mixed = m==0 ? sc : m==1 ? min(sc+b,1.) : m==2 ? sc*b : 1.-(1.-sc)*(1.-b);
  vec3 under = b*ba; vec3 over_ = mixed*s.a;
  return vec4(over_ + under*(1.-s.a), s.a + ba*(1.-s.a));
}` });

// ================= COLOR CORRECTION =================
def('bc', 'Brightness & Contrast', 'Color Correction', [N('bright', 'Brightness', -100, 100, 0), N('contrast', 'Contrast', -100, 100, 0)], { kind: 'color', glsl: `
vec3 cfx(vec3 c, vec2 uv){ c += p_bright*.005; return (c-.5)*(1.+p_contrast*.01)+.5; }` });
def('changeColor', 'Change Color', 'Color Correction', [N('hue', 'Hue Transform', -180, 180, 0), N('lit', 'Lightness Transform', -100, 100, 0), N('sat', 'Saturation Transform', -100, 100, 0), COL('col', 'Color To Change', '#ff0000'), N('tol', 'Matching Tolerance', 0, 100, 30), N('soft', 'Matching Softness', 0, 100, 20), BOOL('inv', 'Invert Color Correction Mask')], { kind: 'color', glsl: `
vec3 cfx(vec3 c, vec2 uv){
  vec3 h = rgb2hsv(c), t = rgb2hsv(p_col); float d = abs(h.x-t.x); d = min(d,1.-d)*2.; float m = 1.-smoothstep(p_tol*.01, p_tol*.01+p_soft*.01+.001, d);
  m *= step(.05, h.y); if(p_inv>.5) m = 1.-m;
  vec3 o = h; o.x = fract(h.x + p_hue/360.); o.y = clamp(h.y*(1.+p_sat*.01),0.,1.); o.z = clamp(h.z + p_lit*.005,0.,1.);
  return mix(c, hsv2rgb(o), m);
}` });
def('changeToColor', 'Change to Color', 'Color Correction', [COL('from', 'From', '#ff0000'), COL('to', 'To', '#0000ff'), N('tol', 'Tolerance', 0, 100, 20), N('soft', 'Softness', 0, 100, 20), SEL('mode', 'Change By', ['Setting to Color', 'Transforming to Color'])], { kind: 'color', glsl: `
vec3 cfx(vec3 c, vec2 uv){
  vec3 h = rgb2hsv(c), f = rgb2hsv(p_from), t = rgb2hsv(p_to); float d = abs(h.x-f.x); d = min(d,1.-d)*2.; float m = 1.-smoothstep(p_tol*.01, p_tol*.01+p_soft*.01+.001, d); m *= step(.04, h.y);
  vec3 o = p_mode<.5 ? vec3(t.x, t.y, h.z) : vec3(fract(h.x + (t.x-f.x)), h.y, h.z);
  return mix(c, hsv2rgb(o), m);
}` });
def('colorbal', 'Color Balance', 'Color Correction', [
  N('liftR', 'Shadow Red', -100, 100, 0), N('liftG', 'Shadow Green', -100, 100, 0), N('liftB', 'Shadow Blue', -100, 100, 0),
  N('gamR', 'Midtone Red', -100, 100, 0), N('gamG', 'Midtone Green', -100, 100, 0), N('gamB', 'Midtone Blue', -100, 100, 0),
  N('gainR', 'Highlight Red', -100, 100, 0), N('gainG', 'Highlight Green', -100, 100, 0), N('gainB', 'Highlight Blue', -100, 100, 0), BOOL('pres', 'Preserve Luminosity', true)], { kind: 'color', glsl: `
vec3 cfx(vec3 c, vec2 uv){
  float l = luma(c); float ws = pow(1.-l,2.), wm = 4.*l*(1.-l), wh = pow(l,2.);
  vec3 o = c + vec3(p_liftR,p_liftG,p_liftB)*.004*ws + vec3(p_gamR,p_gamG,p_gamB)*.004*wm + vec3(p_gainR,p_gainG,p_gainB)*.004*wh;
  if(p_pres>.5) o *= max(l,.001)/max(luma(o),.001);
  return o;
}` });
def('colorbalHLS', 'Color Balance (HLS)', 'Color Correction', [N('hue', 'Hue', -180, 180, 0), N('lit', 'Lightness', -100, 100, 0), N('sat', 'Saturation', -100, 100, 0)], { kind: 'color', glsl: `
vec3 cfx(vec3 c, vec2 uv){ vec3 h = rgb2hsv(c); h.x = fract(h.x + p_hue/360.); h.z = clamp(h.z + p_lit*.005,0.,1.); h.y = clamp(h.y*(1.+p_sat*.01),0.,1.); return hsv2rgb(h); }` });
def('equalize', 'Equalize', 'Color Correction', [SEL('mode', 'Equalize', ['RGB', 'Brightness', 'Photoshop Style']), N('amt', 'Amount to Equalize', 0, 100, 100)], { kind: 'color', glsl: `
float eq(float x){ return smoothstep(0.,1.,smoothstep(.04,.96,x)); }
vec3 cfx(vec3 c, vec2 uv){
  vec3 o;
  if(p_mode<.5) o = vec3(eq(c.r),eq(c.g),eq(c.b)); else { float l = luma(c); float k = eq(l)/max(l,.001); o = c*k; }
  return mix(c, o, p_amt*.01);
}` });
def('leaveColor', 'Leave Color', 'Color Correction', [N('amt', 'Amount to Decolor', 0, 100, 100), COL('col', 'Color to Leave', '#ff0000'), N('tol', 'Tolerance', 0, 100, 30), N('soft', 'Edge Softness', 0, 100, 20), SEL('mode', 'Match Colors', ['Using RGB', 'Using Hue'])], { kind: 'color', glsl: `
vec3 cfx(vec3 c, vec2 uv){
  float d;
  if(p_mode<.5) d = distance(c, p_col)/1.732; else { vec3 h = rgb2hsv(c), t = rgb2hsv(p_col); d = abs(h.x-t.x); d = min(d,1.-d)*2.; }
  float m = 1.-smoothstep(p_tol*.01, p_tol*.01+p_soft*.01+.001, d);
  return mix(mix(c, vec3(luma(c)), p_amt*.01), c, m);
}` });
def('lumaCorrector', 'Luma Corrector', 'Color Correction', [N('bright', 'Brightness', -100, 100, 0), N('contrast', 'Contrast', -100, 100, 0), N('gamma', 'Gamma', 10, 28, 10, .1), N('ped', 'Pedestal', -100, 100, 0), N('gain', 'Gain', 0, 200, 100)], { kind: 'color', glsl: `
vec3 cfx(vec3 c, vec2 uv){ c = (c + p_ped*.003)*p_gain*.01; c += p_bright*.005; c = (c-.5)*(1.+p_contrast*.01)+.5; return pow(max(c,0.), vec3(10./p_gamma)); }` });
def('lumaCurve', 'Luma Curve', 'Color Correction', [N('p0', 'Blacks (0%)', 0, 100, 0), N('p1', 'Shadows (25%)', 0, 100, 25), N('p2', 'Midtones (50%)', 0, 100, 50), N('p3', 'Highlights (75%)', 0, 100, 75), N('p4', 'Whites (100%)', 0, 100, 100)], { kind: 'color', glsl: `
float cv(float x){
  float v[5]; v[0]=p_p0*.01; v[1]=p_p1*.01; v[2]=p_p2*.01; v[3]=p_p3*.01; v[4]=p_p4*.01;
  float f = clamp(x,0.,1.)*4.; int i = int(min(floor(f),3.)); float t = f-float(i);
  float a = v[i], b = v[i+1]; float a0 = i>0 ? v[i-1] : a, b1 = i<3 ? v[i+2] : b;
  float t2 = t*t, t3 = t2*t; return .5*((2.*a) + (-a0+b)*t + (2.*a0-5.*a+4.*b-b1)*t2 + (-a0+3.*a-3.*b+b1)*t3);
}
vec3 cfx(vec3 c, vec2 uv){ float l = luma(c); float n = cv(l); return c*(n/max(l,.001)); }` });
def('tint', 'Tint', 'Color Correction', [COL('black', 'Map Black To', '#000000'), COL('white', 'Map White To', '#ffffff'), N('amt', 'Amount to Tint', 0, 100, 100)], { kind: 'color', glsl: `
vec3 cfx(vec3 c, vec2 uv){ return mix(c, mix(p_black, p_white, luma(c)), p_amt*.01); }` });
def('gamma', 'Gamma Correction', 'Image Control', [N('gamma', 'Gamma', 1, 28, 10, .1)], { kind: 'color', glsl: `
vec3 cfx(vec3 c, vec2 uv){ return pow(max(c,0.), vec3(10./p_gamma)); }` });
def('bw', 'Black & White', 'Image Control', [], { kind: 'color', glsl: `vec3 cfx(vec3 c, vec2 uv){ return vec3(luma(c)); }` });
def('colorPass', 'Color Pass', 'Image Control', [N('amt', 'Amount to Decolor', 0, 100, 100), COL('col', 'Color', '#ff0000'), N('tol', 'Tolerance', 0, 100, 30), N('soft', 'Edge Softness', 0, 100, 20), SEL('mode', 'Match', ['Using RGB', 'Using Hue']), BOOL('inv', 'Reverse')], { kind: 'color', glsl: `
vec3 cfx(vec3 c, vec2 uv){
  float d; if(p_mode<.5) d = distance(c,p_col)/1.732; else { vec3 h = rgb2hsv(c), t = rgb2hsv(p_col); d = abs(h.x-t.x); d = min(d,1.-d)*2.; }
  float m = 1.-smoothstep(p_tol*.01, p_tol*.01+p_soft*.01+.001, d); if(p_inv>.5) m = 1.-m;
  return mix(mix(c, vec3(luma(c)), p_amt*.01), c, m);
}` });
def('colorReplace', 'Color Replace', 'Image Control', [COL('target', 'Target Color', '#ff0000'), COL('repl', 'Replace Color', '#00a0ff'), N('sim', 'Similarity', 0, 100, 30), BOOL('solid', 'Solid Colors')], { kind: 'color', glsl: `
vec3 cfx(vec3 c, vec2 uv){
  float d = distance(c,p_target)/1.732; float m = 1.-smoothstep(p_sim*.01*.7, p_sim*.01+.02, d);
  vec3 th = rgb2hsv(p_target), rh = rgb2hsv(p_repl), ch = rgb2hsv(c);
  vec3 r = p_solid>.5 ? p_repl : hsv2rgb(vec3(rh.x, mix(ch.y, rh.y, .85), ch.z));
  return mix(c, r, m);
}` });
def('invert', 'Invert (RGB)', 'Image Control', [], { hidden: true, kind: 'color', glsl: `vec3 cfx(vec3 c, vec2 uv){ return 1.-c; }` });

// ---- Lumetri: shader attached to the builtin definition ----
import { FX } from './fx.js';
Object.assign(FX.lumetri, { kind: 'color', glsl: `
vec3 cfx(vec3 c, vec2 uv){
  vec3 lift = vec3(p_liftR,p_liftG,p_liftB), gam = vec3(p_gamR,p_gamG,p_gamB), gain = vec3(p_gainR,p_gainG,p_gainB);
  if(p_sharp>0.){ vec2 q = 1./uRes; vec3 n = (U(S(uv+vec2(q.x,0.))).rgb + U(S(uv-vec2(q.x,0.))).rgb + U(S(uv+vec2(0.,q.y))).rgb + U(S(uv-vec2(0.,q.y))).rgb)*.25; c += (c-n)*p_sharp*.03; }
  c *= pow(2., p_exposure);
  c.r *= 1.+p_temp*.002; c.b *= 1.-p_temp*.002; c.g *= 1.-p_tint*.0012; c.r *= 1.+p_tint*.0004; c.b *= 1.+p_tint*.0004;
  c = (c-.5)*(1.+p_contrast*.01)+.5;
  float l = luma(c);
  c += p_shadows*.0035*pow(1.-clamp(l,0.,1.),2.)*(1.-smoothstep(.5,1.,l));
  c += p_highlights*.0035*pow(clamp(l,0.,1.),2.);
  c = (c - p_blacks*.002) / max(.05, 1.+p_whites*.003 - p_blacks*.002);
  c = c*(1.+gain) + lift*(1.-c);
  c = pow(max(c, vec3(0.)), 1./max(vec3(.05), 1.+gam));
  float lu = luma(c);
  c = mix(vec3(lu), c, p_sat*.01);
  float mx = max(c.r,max(c.g,c.b)), mn = min(c.r,min(c.g,c.b));
  c = mix(vec3(luma(c)), c, 1.+p_vib*.01*(1.-(mx-mn)));
  if(p_hue!=0.){ float a = radians(p_hue), cs = cos(a), sn = sin(a);
    mat3 m = mat3(.299+.701*cs+.168*sn, .587-.587*cs+.330*sn, .114-.114*cs-.497*sn, .299-.299*cs-.328*sn, .587+.413*cs+.035*sn, .114-.114*cs+.292*sn, .299-.300*cs+1.25*sn, .587-.588*cs-1.05*sn, .114+.886*cs-.203*sn);
    c = m*c; }
  if(p_fade>0.) c = mix(c, c*.85+.08, p_fade*.01);
  if(p_vigAmt!=0.){ vec2 d = (uv-.5)*vec2(1., uRes.y/uRes.x); float r = length(d)*1.6; float v = smoothstep(p_vigSize*.01, p_vigSize*.01+max(.001,p_vigFeather*.01), r); c *= 1. + p_vigAmt*v*(p_vigAmt<0.?1.:2.); }
  return c;
}` });
