import { def, N, COL, BOOL, SEL, TXT } from './fx.js';
const pct = (k, l, d = 0) => N(k, l, 0, 100, d, .1, '%');

// ================= IMMERSIVE VIDEO (equirectangular aware) =================
def('vrBlur', 'VR Blur', 'Immersive Video', [N('amt', 'Blurriness', 0, 100, 10, .1)], { glsl: `
vec4 fx(vec2 uv){ float lat = (uv.y-.5)*3.14159; float k = 1./max(cos(lat),.15); vec4 a = vec4(0.);
  for(int i=0;i<24;i++){ float an = float(i)*2.39996, d = sqrt((float(i)+.5)/24.); a += S(uv + vec2(cos(an)*k, sin(an))*d*p_amt*px.x); } return a/24.; }` });
def('vrCA', 'VR Chromatic Aberrations', 'Immersive Video', [N('amt', 'Strength', 0, 100, 10, .1)], { glsl: `
vec4 fx(vec2 uv){ vec2 d = (uv-.5); float k = p_amt*.0004; vec2 o = d*vec2(1.,.3)*k*length(d)*8.; return vec4(S(uv+o).r, S(uv).g, S(uv-o).b, S(uv).a); }` });
def('vrDenoise', 'VR De-noise', 'Immersive Video', [N('amt', 'Amount', 0, 100, 40)], { glsl: `
vec4 fx(vec2 uv){ vec4 c = S(uv), a = vec4(0.); float w = 0.;
  for(int j=-2;j<=2;j++) for(int i=-2;i<=2;i++){ vec4 t = S(uv+vec2(float(i),float(j))*px); float g = exp(-dot(t.rgb-c.rgb,t.rgb-c.rgb)*80.); a += t*g; w += g; }
  return mix(c, a/w, p_amt*.01); }` });
def('vrGlitch', 'VR Digital Glitch', 'Immersive Video', [N('amt', 'Major Glitch', 0, 100, 30), N('split', 'RGB Split', 0, 100, 20), N('scan', 'Scanlines', 0, 100, 20), N('seed', 'Seed', 0, 100, 0, .1)], { glsl: `
vec4 fx(vec2 uv){
  float t = floor(uTime*8.+p_seed); float band = floor(uv.y*20.); float r = hash(vec2(band,t)); float off = r>1.-p_amt*.01*.4 ? (hash(vec2(band,t+9.))-.5)*.2*p_amt*.01 : 0.;
  vec2 u = vec2(uv.x+off, uv.y); float sp = p_split*.0006*(off!=0.?4.:1.);
  vec4 c = vec4(S(u+vec2(sp,0.)).r, S(u).g, S(u-vec2(sp,0.)).b, S(u).a);
  c.rgb *= 1.-p_scan*.01*.4*step(.5, fract(uv.y*uRes.y*.5)); return c; }` });
def('vrGlow', 'VR Glow', 'Immersive Video', [N('thr', 'Threshold', 0, 100, 70), N('rad', 'Radius', 0, 200, 30), N('int', 'Intensity', 0, 300, 100)], { glsl: `
vec4 fx(vec2 uv){ vec4 c = S(uv); vec3 g = vec3(0.);
  for(int i=0;i<24;i++){ float an = float(i)*2.39996, d = sqrt((float(i)+.5)/24.); vec3 t = S(uv+vec2(cos(an),sin(an))*d*p_rad*px.x).rgb; g += max(t-p_thr*.01, 0.); }
  return vec4(c.rgb + g/24.*p_int*.04*c.a, c.a); }` });
def('vrPlane2Sphere', 'VR Plane to Sphere', 'Immersive Video', [N('fov', 'Field of View', 10, 170, 90), N('yaw', 'Pan', -180, 180, 0), N('pitch', 'Tilt', -90, 90, 0), N('roll', 'Roll', -180, 180, 0), BOOL('inv', 'Project Sphere to Plane')], { glsl: `
vec4 fx(vec2 uv){
  float lon = (uv.x-.5)*6.28318, lat = (.5-uv.y)*3.14159; vec3 d = vec3(cos(lat)*sin(lon), sin(lat), cos(lat)*cos(lon));
  float y = radians(p_yaw), p = radians(p_pitch), r = radians(p_roll);
  d.xz = vec2(cos(-y)*d.x - sin(-y)*d.z, sin(-y)*d.x + cos(-y)*d.z); d.yz = vec2(cos(-p)*d.y - sin(-p)*d.z, sin(-p)*d.y + cos(-p)*d.z); d.xy = vec2(cos(-r)*d.x - sin(-r)*d.y, sin(-r)*d.x + cos(-r)*d.y);
  if(d.z<=0.) return vec4(0.); float f = 1./tan(radians(p_fov)*.5); vec2 q = d.xy/d.z*f; q.y *= -1.; q = q*.5*vec2(1., uRes.x/uRes.y)+.5;
  if(q.x<0.||q.x>1.||q.y<0.||q.y>1.) return vec4(0.); return S(q);
}` });
def('vrRotate', 'VR Rotate Sphere', 'Immersive Video', [N('yaw', 'Pan', -180, 180, 0), N('pitch', 'Tilt', -90, 90, 0), N('roll', 'Roll', -180, 180, 0)], { glsl: `
vec4 fx(vec2 uv){
  float lon = (uv.x-.5)*6.28318, lat = (.5-uv.y)*3.14159; vec3 d = vec3(cos(lat)*sin(lon), sin(lat), cos(lat)*cos(lon));
  float y = radians(p_yaw), p = radians(p_pitch), r = radians(p_roll);
  d.xy = vec2(cos(r)*d.x - sin(r)*d.y, sin(r)*d.x + cos(r)*d.y); d.yz = vec2(cos(p)*d.y - sin(p)*d.z, sin(p)*d.y + cos(p)*d.z); d.xz = vec2(cos(y)*d.x - sin(y)*d.z, sin(y)*d.x + cos(y)*d.z);
  float lo = atan(d.x, d.z), la = asin(clamp(d.y,-1.,1.)); return S(vec2(lo/6.28318+.5, .5-la/3.14159));
}` });
def('vrSharpen', 'VR Sharpen', 'Immersive Video', [N('amt', 'Sharpen', 0, 100, 30)], { glsl: `
vec4 fx(vec2 uv){ vec4 c = S(uv); vec4 n = (S(uv+vec2(px.x,0.))+S(uv-vec2(px.x,0.))+S(uv+vec2(0.,px.y))+S(uv-vec2(0.,px.y)))*.25; return c+(c-n)*p_amt*.04; }` });

// ================= KEYING =================
def('alphaAdjust', 'Alpha Adjust', 'Keying', [N('op', 'Opacity', 0, 100, 100), BOOL('ign', 'Ignore Alpha'), BOOL('inv', 'Invert Alpha'), BOOL('mask', 'Mask Only')], { glsl: `
vec4 fx(vec2 uv){ vec4 c = U(S(uv)); float a = p_ign>.5 ? 1. : c.a; if(p_inv>.5) a = 1.-a; a *= p_op*.01; if(p_mask>.5) return vec4(vec3(a), 1.); return M(vec4(c.rgb, a)); }` });
def('colorIsolation', 'Color Isolation', 'Keying', [COL('col', 'Color to Isolate', '#ff0000'), N('tol', 'Tolerance', 0, 100, 30), N('soft', 'Smoothness', 0, 100, 20), N('amt', 'Desaturate Others', 0, 100, 100)], { kind: 'color', glsl: `
vec3 cfx(vec3 c, vec2 uv){ vec3 h = rgb2hsv(c), t = rgb2hsv(p_col); float d = abs(h.x-t.x); d = min(d,1.-d)*2.; float m = 1.-smoothstep(p_tol*.01, p_tol*.01+p_soft*.01+.001, d); return mix(mix(c, vec3(luma(c)), p_amt*.01), c, m); }` });
def('lumaKey', 'Luma Key', 'Keying', [N('thr', 'Threshold', 0, 100, 50), N('cut', 'Cutoff', 0, 100, 0), BOOL('inv', 'Reverse')], { glsl: `
vec4 fx(vec2 uv){ vec4 s = S(uv); float l = luma(U(s).rgb); float k = smoothstep(p_cut*.01, p_thr*.01+.001, l); if(p_inv>.5) k = 1.-k; return s*k; }` });
def('trackMatte', 'Track Matte Key', 'Keying', [N('track', 'Matte (V track)', 1, 8, 2, 1), SEL('use', 'Composite Matte Using', ['Matte Alpha', 'Matte Luma']), BOOL('inv', 'Reverse')], { post: true, needsTrack: 'track', glsl: `
vec4 fx(vec2 uv){ vec4 m = texture(uTex2, uv); float k = p_use<.5 ? m.a : luma(U(m).rgb)*m.a; if(p_inv>.5) k = 1.-k; return S(uv)*k; }` });
def('ultraKey', 'Ultra Key', 'Keying', [COL('key', 'Key Color', '#00ff00'), N('trans', 'Transparency', 0, 100, 45), N('hi', 'Highlight', 0, 100, 10), N('sh', 'Shadow', 0, 100, 50), N('ped', 'Pedestal', 0, 100, 10), N('choke', 'Choke', 0, 20, 0, .1), N('soft', 'Soften', 0, 20, 2, .1), N('spill', 'Spill Suppression', 0, 100, 50), SEL('out', 'Output', ['Composite', 'Alpha Channel', 'Color Channel'])], { glsl: `
vec3 ycc(vec3 c){ return vec3(luma(c), (c.b-luma(c))*.564, (c.r-luma(c))*.713); }
float keyOf(vec3 c){ vec3 a = ycc(c), k = ycc(p_key); float d = distance(a.yz, k.yz)*3.; float t = p_trans*.01; float m = smoothstep(t*.5, t*.5+max(.02,p_soft*.03+.1*(1.-t)), d); m = clamp(m - p_choke*.03, 0., 1.);
  float y = a.x; m *= smoothstep(0., p_sh*.01*.3+.001, y+.05) ; m = mix(m, 1., smoothstep(1.-p_hi*.01*.3, 1., y)*0.); return clamp(m + p_ped*.003*(1.-m), 0., 1.); }
vec4 fx(vec2 uv){
  vec4 s = S(uv); vec3 c = U(s).rgb; float m = keyOf(c);
  float k = rgb2hsv(p_key).x; vec3 h = rgb2hsv(c); float hd = abs(h.x-k); hd = min(hd,1.-hd);
  vec3 sp = c; float spillAmt = p_spill*.01*(1.-smoothstep(0.,.15,hd))*h.y; if(p_key.g>=p_key.r && p_key.g>=p_key.b) sp.g = min(c.g, max(c.r,c.b)*(1.-spillAmt)+c.g*spillAmt*.0); else if(p_key.b>=p_key.r) sp.b = min(c.b, max(c.r,c.g)*(1.-spillAmt)+c.b*spillAmt*.0);
  int o = int(p_out+.5); if(o==1) return vec4(vec3(m*s.a),1.); if(o==2) return vec4(sp*s.a,s.a);
  return vec4(sp*m*s.a, m*s.a);
}` });

// ================= NOISE & GRAIN =================
def('dustScratches', 'Dust & Scratches', 'Noise & Grain', [N('rad', 'Radius', 0, 10, 2, .1), N('thr', 'Threshold', 0, 255, 20)], { glsl: `
vec4 fx(vec2 uv){ vec4 c = S(uv); vec4 a = vec4(0.); float w = 0.; float r = max(p_rad,.5);
  for(int j=-2;j<=2;j++) for(int i=-2;i<=2;i++){ if(i==0&&j==0) continue; a += S(uv+vec2(float(i),float(j))*px*r*.5); w += 1.; }
  a /= w; float d = distance(c.rgb, a.rgb); return d > p_thr/255. ? a : c; }` });
def('median', 'Median', 'Noise & Grain', [N('rad', 'Radius', 0, 8, 1, .1), BOOL('alpha', 'Operate on Alpha Channel')], { glsl: `
void sw(inout vec3 a, inout vec3 b){ vec3 t = min(a,b); b = max(a,b); a = t; }
vec4 fx(vec2 uv){
  float r = max(p_rad,.01); vec3 v[9]; int k = 0;
  for(int j=-1;j<=1;j++) for(int i=-1;i<=1;i++){ v[k] = S(uv+vec2(float(i),float(j))*px*r).rgb; k++; }
  sw(v[0],v[1]); sw(v[3],v[4]); sw(v[6],v[7]); sw(v[1],v[2]); sw(v[4],v[5]); sw(v[7],v[8]); sw(v[0],v[1]); sw(v[3],v[4]); sw(v[6],v[7]); sw(v[0],v[3]); sw(v[3],v[6]); sw(v[0],v[3]); sw(v[1],v[4]); sw(v[4],v[7]); sw(v[1],v[4]); sw(v[2],v[5]); sw(v[5],v[8]); sw(v[2],v[5]); sw(v[1],v[3]); sw(v[5],v[7]); sw(v[2],v[6]); sw(v[4],v[6]); sw(v[2],v[4]); sw(v[2],v[3]); sw(v[5],v[6]);
  return vec4(v[4], S(uv).a);
}` });
def('noise', 'Noise', 'Noise & Grain', [N('amt', 'Amount of Noise', 0, 100, 20), BOOL('color', 'Use Color Noise', true), BOOL('clip', 'Clipping', true)], { kind: 'color', glsl: `
vec3 cfx(vec3 c, vec2 uv){ vec3 n = p_color>.5 ? vec3(hash(uv*uRes+uTime), hash(uv*uRes+uTime+7.7), hash(uv*uRes+uTime+13.1)) : vec3(hash(uv*uRes+uTime)); c += (n-.5)*p_amt*.02; return p_clip>.5 ? clamp(c,0.,1.) : c; }` });
def('noiseAlpha', 'Noise Alpha', 'Noise & Grain', [SEL('mode', 'Noise', ['Uniform Random', 'Squared Random', 'Uniform Animated', 'Squared Animated']), N('amt', 'Amount', 0, 100, 50), SEL('op', 'Operator', ['Replace', 'Add', 'Multiply', 'Scale'], 2)], { glsl: `
vec4 fx(vec2 uv){
  vec4 c = U(S(uv)); int m = int(p_mode+.5); float n = hash(uv*uRes + (m>=2 ? uTime : 0.)); if(m==1||m==3) n = n*n; float a = p_amt*.01; int op = int(p_op+.5);
  float na = op==0 ? mix(c.a, n, a) : op==1 ? c.a + (n-.5)*a*2. : op==2 ? c.a*mix(1., n, a) : c.a*(1.-a+n*a);
  return M(vec4(c.rgb, clamp(na,0.,1.)));
}` });
def('noiseHLS', 'Noise HLS', 'Noise & Grain', [SEL('mode', 'Noise', ['Uniform', 'Squared', 'Grain']), N('hue', 'Hue', 0, 100, 0), N('lit', 'Lightness', 0, 100, 10), N('sat', 'Saturation', 0, 100, 0), N('size', 'Grain Size', 1, 10, 1, .1)], { kind: 'color', glsl: `
vec3 cfx(vec3 c, vec2 uv){ vec2 q = floor(uv*uRes/max(p_size,1.)); float n = hash(q+uTime), n2 = hash(q+uTime+3.3), n3 = hash(q+uTime+9.1); if(p_mode>.5&&p_mode<1.5){ n*=n; n2*=n2; n3*=n3; }
  vec3 h = rgb2hsv(c); h.x = fract(h.x + (n-.5)*p_hue*.01); h.z = clamp(h.z + (n2-.5)*p_lit*.01*2., 0., 1.); h.y = clamp(h.y + (n3-.5)*p_sat*.01*2., 0., 1.); return hsv2rgb(h); }` });

// ================= PERSPECTIVE =================
def('basic3D', 'Basic 3D', 'Perspective', [N('swivel', 'Swivel', -180, 180, 0, .1, '°'), N('tilt', 'Tilt', -180, 180, 0, .1, '°'), N('dist', 'Distance to Image', 0, 500, 0), BOOL('spec', 'Specular Highlight'), COL('bg', 'Background', '#000000')], { glsl: `
vec4 fx(vec2 uv){
  float sw = radians(p_swivel), tl = radians(p_tilt); vec2 p = (uv-.5)*vec2(uRes.x/uRes.y,1.);
  vec3 ro = vec3(0.,0.,-(1.6+p_dist*.01*2.)), rd = normalize(vec3(p,1.6)); 
  vec3 n = vec3(sin(sw)*cos(tl), -sin(tl), -cos(sw)*cos(tl)); vec3 tx = normalize(vec3(cos(sw), 0., sin(sw))), ty = cross(n, tx);
  float den = dot(rd, n); if(abs(den)<1e-4) return vec4(0.); float t = dot(-ro, n)/den; if(t<0.) return vec4(0.);
  vec3 hit = ro + rd*t; vec2 q = vec2(dot(hit,tx), dot(hit,ty))/vec2(uRes.x/uRes.y,1.)*vec2(1.,1.); vec2 u = q + .5; u.y = 1.-u.y; u.y = 1.-(u.y); 
  u = vec2(dot(hit,tx)/(uRes.x/uRes.y)+.5, -dot(hit,ty)+.5);
  if(u.x<0.||u.x>1.||u.y<0.||u.y>1.) return vec4(0.);
  vec4 c = S(u); if(p_spec>.5) c.rgb += pow(max(dot(reflect(rd,n), normalize(vec3(.4,.6,-1.))),0.),30.)*c.a*.6; return c;
}` });
def('bevelAlpha', 'Bevel Alpha', 'Perspective', [N('thick', 'Edge Thickness', 0, 20, 3, .1), N('ang', 'Light Angle', -360, 360, -45, .1, '°'), COL('col', 'Light Color', '#ffffff'), N('int', 'Light Intensity', 0, 1, .5, .01)], { glsl: `
vec4 fx(vec2 uv){
  vec4 c = S(uv); vec2 dx = vec2(p_thick*px.x,0.), dy = vec2(0.,p_thick*px.y);
  vec2 g = vec2(S(uv+dx).a - S(uv-dx).a, S(uv+dy).a - S(uv-dy).a); float a = radians(p_ang); float l = dot(normalize(g+1e-5), vec2(cos(a),sin(a)))*length(g);
  return vec4(c.rgb + p_col*l*p_int*c.a, c.a);
}` });
def('bevelEdges', 'Bevel Edges', 'Perspective', [N('thick', 'Edge Thickness', 0, 20, 4, .1), N('ang', 'Light Angle', -360, 360, -45, .1, '°'), COL('col', 'Light Color', '#ffffff'), N('int', 'Light Intensity', 0, 1, .5, .01)], { glsl: `
vec4 fx(vec2 uv){
  vec4 c = S(uv); float t = p_thick*px.x*6.; vec2 d = vec2(smoothstep(0.,t,uv.x) - smoothstep(0.,t,1.-uv.x), smoothstep(0.,t*uRes.x/uRes.y,uv.y) - smoothstep(0.,t*uRes.x/uRes.y,1.-uv.y));
  float a = radians(p_ang); float l = -dot(d, vec2(cos(a),sin(a))); return vec4(c.rgb + p_col*l*p_int*c.a, c.a);
}` });
def('dropShadow', 'Drop Shadow', 'Perspective', [COL('col', 'Shadow Color', '#000000'), N('op', 'Opacity', 0, 100, 50), N('dir', 'Direction', -360, 360, 135, .1, '°'), N('dist', 'Distance', 0, 300, 20), N('soft', 'Softness', 0, 200, 20), BOOL('only', 'Shadow Only')], { post: true, glsl: `
vec4 fx(vec2 uv){
  vec4 c = S(uv); float a = radians(p_dir); vec2 off = vec2(sin(a), -cos(a))*p_dist*px; float sh = 0.;
  for(int i=0;i<20;i++){ float an = float(i)*2.39996, d = sqrt((float(i)+.5)/20.); sh += S(uv - off + vec2(cos(an),sin(an))*d*p_soft*px.x*.5).a; }
  sh = sh/20.*p_op*.01; vec4 s = vec4(p_col*sh, sh); if(p_only>.5) return s*(1.-c.a*0.); return c + s*(1.-c.a);
}` });
def('radialShadow', 'Radial Shadow', 'Perspective', [COL('col', 'Shadow Color', '#000000'), N('op', 'Opacity', 0, 100, 50), pct('lx', 'Light Source X', 25), pct('ly', 'Light Source Y', 25), N('proj', 'Projection Distance', 0, 100, 20), N('soft', 'Softness', 0, 100, 10)], { post: true, glsl: `
vec4 fx(vec2 uv){
  vec4 c = S(uv); vec2 l = vec2(p_lx,p_ly)*.01; vec2 d = uv - l; float sh = 0.;
  for(int i=0;i<16;i++){ float k = float(i)/15.; sh += S(l + d/(1.+p_proj*.01*k*(1.+p_soft*.01))).a*(1.-k*.5); } sh = clamp(sh/10.,0.,1.)*p_op*.01; return c + vec4(p_col*sh, sh)*(1.-c.a);
}` });

// ================= STYLIZE =================
def('alphaGlow', 'Alpha Glow', 'Stylize', [N('glow', 'Glow', 0, 255, 20), N('bright', 'Brightness', 0, 255, 255), COL('col', 'Start Color', '#ffffff'), COL('col2', 'End Color', '#00aaff'), N('fade', 'Fade Out', 0, 100, 100)], { post: true, glsl: `
vec4 fx(vec2 uv){
  vec4 c = S(uv); float g = 0.; for(int i=0;i<24;i++){ float an = float(i)*2.39996, d = sqrt((float(i)+.5)/24.); g += S(uv+vec2(cos(an),sin(an))*d*p_glow*px.x).a; } g /= 24.;
  vec3 gc = mix(p_col, p_col2, 1.-g)*g*p_bright/255.; return c + vec4(gc, g*.9*p_bright/255.)*(1.-c.a);
}` });
def('brushStrokes', 'Brush Strokes', 'Stylize', [N('size', 'Brush Size', 0, 20, 3, .1), N('len', 'Stroke Length', 0, 100, 20), N('dens', 'Stroke Density', 0, 3, 1, .1), N('rand', 'Stroke Randomness', 0, 3, 1, .1), N('blend', 'Blend With Original', 0, 100, 0)], { glsl: `
vec4 fx(vec2 uv){
  vec4 c = S(uv); vec2 e = px*2.; float gx = luma(S(uv+vec2(e.x,0.)).rgb)-luma(S(uv-vec2(e.x,0.)).rgb), gy = luma(S(uv+vec2(0.,e.y)).rgb)-luma(S(uv-vec2(0.,e.y)).rgb);
  vec2 dir = normalize(vec2(-gy,gx)+1e-4 + (vec2(hash(floor(uv*uRes/max(p_size*4.,1.))), hash(floor(uv*uRes/max(p_size*4.,1.))+5.))-.5)*p_rand*.5); vec4 a = vec4(0.);
  for(int i=0;i<16;i++){ float t = float(i)/15.-.5; a += S(uv + dir*t*p_len*px.x*(1.+p_size*.2)); } a/=16.;
  return mix(a, c, p_blend*.01);
}` });
def('emboss', 'Emboss', 'Stylize', [N('dir', 'Direction', -360, 360, 45, .1, '°'), N('rel', 'Relief', 0, 10, 1, .1), N('con', 'Contrast', 0, 200, 100), N('blend', 'Blend With Original', 0, 100, 0)], { kind: 'color', glsl: `
vec3 cfx(vec3 c, vec2 uv){ float a = radians(p_dir); vec2 o = vec2(cos(a),sin(a))*px*p_rel; float d = luma(S(uv+o).rgb) - luma(S(uv-o).rgb); vec3 e = vec3(.5 + d*p_con*.01*3.); return mix(e, c, p_blend*.01); }` });
def('colorEmboss', 'Color Emboss', 'Stylize', [N('dir', 'Direction', -360, 360, 45, .1, '°'), N('rel', 'Relief', 0, 10, 1, .1), N('con', 'Contrast', 0, 200, 100), N('blend', 'Blend With Original', 0, 100, 0)], { kind: 'color', glsl: `
vec3 cfx(vec3 c, vec2 uv){ float a = radians(p_dir); vec2 o = vec2(cos(a),sin(a))*px*p_rel; vec3 d = S(uv+o).rgb - S(uv-o).rgb; vec3 e = c*.0 + vec3(.5) + d*p_con*.01*3.; return mix(e, c, p_blend*.01); }` });
def('findEdges', 'Find Edges', 'Stylize', [BOOL('inv', 'Invert'), N('blend', 'Blend With Original', 0, 100, 0)], { kind: 'color', glsl: `
vec3 cfx(vec3 c, vec2 uv){
  float tl = luma(S(uv+vec2(-px.x,-px.y)).rgb), t = luma(S(uv+vec2(0.,-px.y)).rgb), tr = luma(S(uv+vec2(px.x,-px.y)).rgb), l = luma(S(uv+vec2(-px.x,0.)).rgb), r = luma(S(uv+vec2(px.x,0.)).rgb), bl = luma(S(uv+vec2(-px.x,px.y)).rgb), b = luma(S(uv+vec2(0.,px.y)).rgb), br = luma(S(uv+vec2(px.x,px.y)).rgb);
  float gx = -tl-2.*l-bl+tr+2.*r+br, gy = -tl-2.*t-tr+bl+2.*b+br; float e = clamp(length(vec2(gx,gy)),0.,1.); vec3 o = vec3(p_inv>.5 ? e : 1.-e); return mix(o, c, p_blend*.01);
}` });
def('mosaic', 'Mosaic', 'Stylize', [N('h', 'Horizontal Blocks', 1, 400, 40, 1), N('v', 'Vertical Blocks', 1, 400, 40, 1), BOOL('sharp', 'Sharp Colors')], { glsl: `
vec4 fx(vec2 uv){ vec2 g = vec2(p_h,p_v); vec2 u = (floor(uv*g)+.5)/g; return S(u); }` });
def('posterize', 'Posterize', 'Stylize', [N('lv', 'Level', 2, 32, 6, 1)], { kind: 'color', glsl: `vec3 cfx(vec3 c, vec2 uv){ return floor(c*p_lv)/p_lv; }` });
def('replicate', 'Replicate', 'Stylize', [N('count', 'Count', 1, 16, 2, 1)], { glsl: `
vec4 fx(vec2 uv){ return S(fract(uv*floor(p_count+.5))); }` });
def('solarize', 'Solarize', 'Stylize', [N('thr', 'Threshold', 0, 255, 128)], { kind: 'color', glsl: `
vec3 cfx(vec3 c, vec2 uv){ float t = p_thr/255.; return vec3(c.r>t?1.-c.r:c.r, c.g>t?1.-c.g:c.g, c.b>t?1.-c.b:c.b); }` });
def('strobe', 'Strobe Light', 'Stylize', [COL('col', 'Strobe Color', '#ffffff'), N('blend', 'Blend With Original', 0, 100, 0), N('dur', 'Strobe Duration (secs)', 0, 5, .1, .01), N('per', 'Strobe Period (secs)', .05, 10, 1, .01), N('rnd', 'Random Strobe Probability', 0, 100, 0), SEL('mode', 'Strobe', ['Operates On Color Only', 'Makes Layer Transparent']), SEL('op', 'Strobe Operator', ['Copy', 'Add', 'Multiply', 'Screen'])], { glsl: `
vec4 fx(vec2 uv){
  vec4 s = S(uv); float ph = mod(uT, p_per); float cyc = floor(uT/p_per); bool on = ph < p_dur; if(p_rnd>0.) on = hash(vec2(cyc,1.)) < p_rnd*.01 && ph<p_dur;
  if(!on) return s; vec3 c = U(s).rgb; int op = int(p_op+.5); vec3 r = op==0 ? p_col : op==1 ? min(c+p_col,1.) : op==2 ? c*p_col : 1.-(1.-c)*(1.-p_col);
  if(p_mode>.5) return mix(vec4(0.), s, p_blend*.01); return M(vec4(mix(r, c, p_blend*.01), U(s).a));
}` });
def('texturize', 'Texturize', 'Stylize', [N('dir', 'Light Direction', -360, 360, 135, .1, '°'), N('con', 'Texture Contrast', 0, 10, 1, .1), N('scale', 'Texture Scale', 1, 20, 4, .1)], { kind: 'color', glsl: `
vec3 cfx(vec3 c, vec2 uv){ float a = radians(p_dir); vec2 q = uv*uRes/(p_scale*8.); vec2 o = vec2(cos(a),sin(a))*.02; float h = fbm(q+o)-fbm(q-o); return c*(1.+h*p_con*4.); }` });
def('threshold', 'Threshold', 'Stylize', [N('lv', 'Level', 0, 255, 128)], { kind: 'color', glsl: `vec3 cfx(vec3 c, vec2 uv){ return vec3(step(p_lv/255., luma(c))); }` });
def('sepia', 'Sepia Tone', 'Stylize', [N('amt', 'Amount', 0, 100, 100)], { kind: 'color', glsl: `vec3 cfx(vec3 c, vec2 uv){ float g = luma(c); return mix(c, vec3(g*1.07, g*.74, g*.43)*1.1, p_amt*.01); }` });
def('vignette', 'Vignette', 'Stylize', [N('amt', 'Amount', -5, 5, -1, .01), N('size', 'Midpoint', 0, 100, 50), N('feather', 'Feather', 0, 100, 50)], { kind: 'color', glsl: `
vec3 cfx(vec3 c, vec2 uv){ vec2 d = (uv-.5)*vec2(1., uRes.y/uRes.x); float r = length(d)*1.6; float v = smoothstep(p_size*.01, p_size*.01+max(.001,p_feather*.01), r); return c*(1.+p_amt*v*(p_amt<0.?1.:2.)); }` });
def('rgbsplit', 'RGB Split', 'Stylize', [N('amt', 'Amount', 0, 100, 10, .1), N('ang', 'Angle', 0, 360, 0, .1)], { glsl: `
vec4 fx(vec2 uv){ vec2 o = vec2(cos(radians(p_ang)), sin(radians(p_ang)))*p_amt*px.x*2.; return vec4(S(uv+o).r, S(uv).g, S(uv-o).b, S(uv).a); }` });
def('fadeToBlack', 'Fade', 'Stylize', [N('amt', 'Amount', 0, 100, 0)], { glsl: `vec4 fx(vec2 uv){ return S(uv)*(1.-p_amt*.01); }` });

// ================= TIME =================
def('echo', 'Echo', 'Time', [N('decay', 'Decay', 0, .99, .8, .01), SEL('op', 'Echo Operator', ['Add', 'Maximum', 'Screen', 'Composite in Back', 'Composite in Front'], 1)], { echo: true, glsl: `
vec4 fx(vec2 uv){ vec4 s = S(uv), h = texture(uTex2, uv)*p_decay; int op = int(p_op+.5);
  vec4 r = op==0 ? s+h : op==1 ? max(s,h) : op==2 ? s+h-s*h : op==3 ? s + h*(1.-s.a) : h + s*(1.-h.a); return clamp(r, 0., 1.); }` });
def('posterizeTime', 'Posterize Time', 'Time', [N('rate', 'Frame Rate', 1, 60, 12, 1)], { timeOnly: true });
def('timeWarp', 'Time Warp', 'Time', [N('speed', 'Speed', 0, 800, 100), SEL('method', 'Method', ['Whole Frames', 'Frame Blend', 'Pixel Motion'])], { timeOnly: true });

// ================= UTILITY =================
def('cineon', 'Cineon Converter', 'Utility', [SEL('type', 'Conversion Type', ['Linear to Log', 'Log to Linear', 'Log to Log']), N('black', '10 Bit Black Point', 0, 1023, 95), N('white', '10 Bit White Point', 0, 1023, 685), N('gamma', 'Gamma', .1, 4, 1, .01), N('hl', 'Highlight Filmic Rolloff', 0, 100, 0)], { kind: 'color', glsl: `
vec3 cfx(vec3 c, vec2 uv){
  float bp = p_black/1023., wp = p_white/1023.;
  if(p_type<.5){ c = max(c,1e-4); vec3 l = (log(c*(1.-.0108)+.0108)/log(10.))*.2 + .6; c = (l-bp)/(wp-bp); }
  else if(p_type<1.5){ vec3 l = c*(wp-bp)+bp; c = (pow(vec3(10.), (l-.6)/.2) - .0108)/(1.-.0108); }
  c = pow(max(c,0.), vec3(1./p_gamma)); if(p_hl>0.) c = mix(c, c/(1.+c*.5), p_hl*.01); return c;
}` });
def('hdrCompander', 'HDR Compander', 'Utility', [SEL('mode', 'Mode', ['Compress', 'Expand']), N('amt', 'Amount', 0, 100, 50)], { kind: 'color', glsl: `
vec3 cfx(vec3 c, vec2 uv){ float k = p_amt*.01*.9; return p_mode<.5 ? c/(1.+c*k) *(1.+k) : c/max(1.+k-c*k, .05); }` });

// ================= VIDEO (text overlays) =================
const ovf = `
vec4 fx(vec2 uv){ vec4 s = S(uv); vec4 t = texture(uTex2, uv); return t + s*(1.-t.a); }`;
def('clipName', 'Clip Name', 'Video', [SEL('src', 'Source', ['Clip Name', 'Source File Name']), N('x', 'Position X', 0, 100, 5, .1, '%'), N('y', 'Position Y', 0, 100, 92, .1, '%'), N('size', 'Size', 8, 200, 36), COL('col', 'Color', '#ffffff'), N('op', 'Opacity', 0, 100, 100)], { post: true, overlay: 'clipName', glsl: ovf });
def('simpleText', 'Simple Text', 'Video', [TXT('text', 'Text', 'Text'), N('x', 'Position X', 0, 100, 50, .1, '%'), N('y', 'Position Y', 0, 100, 50, .1, '%'), N('size', 'Size', 8, 600, 72), COL('col', 'Color', '#ffffff'), N('op', 'Opacity', 0, 100, 100), SEL('align', 'Align', ['Left', 'Center', 'Right'], 1), BOOL('shadow', 'Shadow', true)], { post: true, overlay: 'simpleText', text: 'Text', glsl: ovf });
def('timecodefx', 'Timecode', 'Video', [SEL('src', 'Source', ['Clip Time', 'Sequence Time']), N('x', 'Position X', 0, 100, 5, .1, '%'), N('y', 'Position Y', 0, 100, 8, .1, '%'), N('size', 'Size', 8, 200, 40), COL('col', 'Color', '#ffffff'), N('op', 'Opacity', 0, 100, 100), BOOL('bg', 'Background', true)], { post: true, overlay: 'timecode', glsl: ovf });

// internal: mask application
def('maskpass', 'Mask', 'Utility', [], { hidden: true, builtin: true, glsl: `vec4 fx(vec2 uv){ return S(uv)*texture(uTex2, uv).a; }` });
