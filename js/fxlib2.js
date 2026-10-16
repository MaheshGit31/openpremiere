import { def, N, COL, BOOL, SEL } from './fx.js';
const pct = (k, l, d = 0) => N(k, l, 0, 100, d, .1, '%');
const px_ = (k, l, d = 0) => N(k, l, -200, 300, d, .1, '%');

// ================= DISTORT =================
def('cornerPin', 'Corner Pin', 'Distort', [px_('ulx', 'Upper Left X', 0), px_('uly', 'Upper Left Y', 0), px_('urx', 'Upper Right X', 100), px_('ury', 'Upper Right Y', 0), px_('llx', 'Lower Left X', 0), px_('lly', 'Lower Left Y', 100), px_('lrx', 'Lower Right X', 100), px_('lry', 'Lower Right Y', 100)], { glsl: `
vec2 cross2(vec2 a, vec2 b){ return vec2(a.x*b.y-a.y*b.x); }
vec2 invBilinear(vec2 p, vec2 a, vec2 b, vec2 c, vec2 d){
  vec2 e = b-a, f = d-a, g = a-b+c-d, h = p-a;
  float k2 = cross2(g,f).x, k1 = cross2(e,f).x + cross2(h,g).x, k0 = cross2(h,e).x;
  float u, v;
  if(abs(k2)<.0001){ v = -k0/k1; u = (h.x-f.x*v)/(e.x+g.x*v); }
  else { float w = k1*k1-4.*k0*k2; if(w<0.) return vec2(-1.); w = sqrt(w); float v1 = (-k1-w)/(2.*k2), v2 = (-k1+w)/(2.*k2); u = (h.x-f.x*v1)/(e.x+g.x*v1); v = v1; if(v<0.||v>1.||u<0.||u>1.){ v = v2; u = (h.x-f.x*v)/(e.x+g.x*v); } }
  return vec2(u,v);
}
vec4 fx(vec2 uv){
  vec2 a = vec2(p_ulx,p_uly)*.01, b = vec2(p_urx,p_ury)*.01, c = vec2(p_lrx,p_lry)*.01, d = vec2(p_llx,p_lly)*.01;
  vec2 r = invBilinear(uv, a, b, c, d); if(r.x<0.||r.x>1.||r.y<0.||r.y>1.) return vec4(0.); return S(r);
}` });
def('crop', 'Crop', 'Distort', [pct('l', 'Left'), pct('t', 'Top'), pct('r', 'Right'), pct('b', 'Bottom'), BOOL('zoom', 'Zoom'), N('feather', 'Edge Feather', 0, 200, 0)], { glsl: `
vec4 fx(vec2 uv){
  vec2 u = uv; vec4 cr = vec4(p_l,p_t,p_r,p_b)*.01;
  if(p_zoom>.5){ vec2 sz = vec2(1.-cr.x-cr.z, 1.-cr.y-cr.w); u = cr.xy + uv*sz; return S(u); }
  float f = p_feather*px.x; float m = smoothstep(cr.x-f*.5, cr.x+f*.5+1e-4, uv.x)*smoothstep(cr.z-f*.5, cr.z+f*.5+1e-4, 1.-uv.x)*smoothstep(cr.y-f*.5, cr.y+f*.5+1e-4, uv.y)*smoothstep(cr.w-f*.5, cr.w+f*.5+1e-4, 1.-uv.y);
  if(cr.x==0.&&cr.y==0.&&cr.z==0.&&cr.w==0.) m = 1.;
  return S(uv)*m;
}` });
def('lensDist', 'Lens Distortion', 'Distort', [N('curv', 'Curvature', -100, 100, 0), N('vdec', 'Vertical Decentering', -100, 100, 0), N('hdec', 'Horizontal Decentering', -100, 100, 0), N('fill', 'Fill Alpha', 0, 1, 0, 1)], { glsl: `
vec4 fx(vec2 uv){
  vec2 c = vec2(.5+p_hdec*.002, .5+p_vdec*.002); vec2 d = uv-c; float r2 = dot(d*vec2(1., uRes.y/uRes.x), d*vec2(1., uRes.y/uRes.x));
  vec2 u = c + d*(1.+p_curv*.01*r2*2.5); if(u.x<0.||u.x>1.||u.y<0.||u.y>1.) return vec4(0.); return S(u);
}` });
def('magnify', 'Magnify', 'Distort', [SEL('shape', 'Shape', ['Circle', 'Square']), pct('cx', 'Center X', 50), pct('cy', 'Center Y', 50), N('mag', 'Magnification', 100, 800, 200), N('size', 'Size', 10, 500, 100), N('feather', 'Feather', 0, 100, 10), N('op', 'Opacity', 0, 100, 100)], { glsl: `
vec4 fx(vec2 uv){
  vec2 c = vec2(p_cx,p_cy)*.01; vec2 d = (uv-c)*vec2(uRes.x/uRes.y,1.); float r = p_shape<.5 ? length(d) : max(abs(d.x),abs(d.y)); float R = p_size*.5/uRes.y;
  float m = 1.-smoothstep(R*(1.-p_feather*.01), R+1e-4, r); m *= p_op*.01;
  vec4 mag = S(c + (uv-c)*(100./p_mag)); return mix(S(uv), mag, m);
}` });
def('mirror', 'Mirror', 'Distort', [N('ang', 'Reflection Angle', -360, 360, 0, .1, '°'), pct('cx', 'Reflection Center X', 50), pct('cy', 'Reflection Center Y', 50)], { glsl: `
vec4 fx(vec2 uv){
  vec2 c = vec2(p_cx,p_cy)*.01; float a = radians(p_ang); vec2 n = vec2(cos(a), sin(a)); vec2 d = (uv-c)*vec2(uRes.x/uRes.y,1.);
  float s = dot(d,n); if(s>0.) d -= 2.*s*n; return S(c + d*vec2(uRes.y/uRes.x,1.));
}` });
def('offset', 'Offset', 'Distort', [pct('x', 'Shift Center X', 50), pct('y', 'Shift Center Y', 50), N('blend', 'Blend With Original', 0, 100, 0)], { glsl: `
vec4 fx(vec2 uv){ vec2 u = fract(uv - (vec2(p_x,p_y)*.01 - .5)); return mix(S(u), S(uv), p_blend*.01); }` });
def('spherize', 'Spherize', 'Distort', [N('rad', 'Radius', 0, 500, 100), pct('cx', 'Center X', 50), pct('cy', 'Center Y', 50), N('amt', 'Amount', -100, 100, 50)], { glsl: `
vec4 fx(vec2 uv){
  vec2 c = vec2(p_cx,p_cy)*.01; vec2 d = (uv-c)*vec2(uRes.x/uRes.y,1.); float R = p_rad/uRes.y; float r = length(d);
  if(r>=R) return S(uv);
  float z = sqrt(max(1e-4, 1.-(r/R)*(r/R))); float k = mix(1., asin(r/R)/(1.5708*max(r/R,1e-4)), p_amt*.01);
  vec2 u = c + d*k*vec2(uRes.y/uRes.x,1.); return S(u);
}` });
def('transformfx', 'Transform', 'Distort', [N('ax', 'Anchor X', -100, 200, 50, .1, '%'), N('ay', 'Anchor Y', -100, 200, 50, .1, '%'), N('px', 'Position X', -200, 300, 50, .1, '%'), N('py', 'Position Y', -200, 300, 50, .1, '%'), N('scale', 'Scale', 0, 500, 100), N('skew', 'Skew', -85, 85, 0, .1, '°'), N('skewax', 'Skew Axis', -180, 180, 0, .1, '°'), N('rot', 'Rotation', -360, 360, 0, .1, '°'), N('op', 'Opacity', 0, 100, 100)], { glsl: `
vec4 fx(vec2 uv){
  vec2 asp = vec2(uRes.x/uRes.y, 1.); vec2 d = (uv - vec2(p_px,p_py)*.01)*asp;
  d = rot(d, radians(p_rot)); d /= max(p_scale*.01, .001);
  float sa = radians(p_skewax); vec2 ax = vec2(cos(sa), sin(sa)); d = rot(d,-sa); d.x -= d.y*tan(radians(p_skew)); d = rot(d,sa);
  vec2 u = vec2(p_ax,p_ay)*.01 + d/asp; if(u.x<0.||u.x>1.||u.y<0.||u.y>1.) return vec4(0.); return S(u)*p_op*.01;
}` });
def('turbDisp', 'Turbulent Displace', 'Distort', [SEL('type', 'Displacement', ['Turbulent', 'Bulge', 'Twist', 'Turbulent Smoother', 'Horizontal Displacement', 'Vertical Displacement']), N('amt', 'Amount', 0, 500, 50), N('size', 'Size', 1, 500, 100), N('off', 'Offset', 0, 100, 0), N('cx', 'Complexity', 1, 10, 3, 1), N('evo', 'Evolution', 0, 360, 0, .1)], { glsl: `
vec4 fx(vec2 uv){
  vec2 q = uv*uRes/max(p_size,1.) + p_off*.1; float e = radians(p_evo);
  vec2 n = vec2(fbm(q+e)-.5, fbm(q+17.3-e)-.5)*2.; int t = int(p_type+.5);
  if(t==4) n.y = 0.; if(t==5) n.x = 0.;
  return S(uv + n*p_amt*px.x);
}` });
def('twirl', 'Twirl', 'Distort', [N('ang', 'Angle', -3600, 3600, 90, .1, '°'), N('rad', 'Radius', 0, 100, 50), pct('cx', 'Center X', 50), pct('cy', 'Center Y', 50)], { glsl: `
vec4 fx(vec2 uv){
  vec2 c = vec2(p_cx,p_cy)*.01; vec2 d = (uv-c)*vec2(uRes.x/uRes.y,1.); float R = p_rad*.01; float r = length(d);
  float t = max(0., 1.-r/max(R,1e-4)); float a = radians(p_ang)*t*t; d = rot(d, a); return S(c + d*vec2(uRes.y/uRes.x,1.));
}` });
def('waveWarp', 'Wave Warp', 'Distort', [SEL('type', 'Wave Type', ['Sine', 'Triangle', 'Square', 'Noise']), N('h', 'Wave Height', 0, 500, 10), N('w', 'Wave Width', 1, 1000, 100), N('dir', 'Direction', -360, 360, 90, .1, '°'), N('speed', 'Wave Speed', -10, 10, 1, .1)], { glsl: `
vec4 fx(vec2 uv){
  float a = radians(p_dir); vec2 d = vec2(cos(a), sin(a)); vec2 pp = uv*uRes; float ph = dot(pp,d)/max(p_w,1.)*6.2832 + uTime*p_speed*3.; int t = int(p_type+.5);
  float w = t==0 ? sin(ph) : t==1 ? (abs(fract(ph/6.2832)-.5)*4.-1.) : t==2 ? sign(sin(ph)) : (vnoise(vec2(ph,0.))*2.-1.);
  vec2 n = vec2(-d.y, d.x); return S(uv + n*w*p_h*px);
}` });
def('hflip', 'Horizontal Flip', 'Transform', [], { glsl: `vec4 fx(vec2 uv){ return S(vec2(1.-uv.x, uv.y)); }` });
def('vflip', 'Vertical Flip', 'Transform', [], { glsl: `vec4 fx(vec2 uv){ return S(vec2(uv.x, 1.-uv.y)); }` });

// ================= GENERATE (composited over the clip) =================
const ov = `
vec4 over(vec4 top, vec4 bot, float op){ top *= op; return top + bot*(1.-top.a); }`;
def('gradient4', '4-Color Gradient', 'Generate', [pct('x1', 'Point 1 X', 0), pct('y1', 'Point 1 Y', 0), COL('c1', 'Color 1', '#ff2d55'), pct('x2', 'Point 2 X', 100), pct('y2', 'Point 2 Y', 0), COL('c2', 'Color 2', '#ffd60a'), pct('x3', 'Point 3 X', 0), pct('y3', 'Point 3 Y', 100), COL('c3', 'Color 3', '#30d158'), pct('x4', 'Point 4 X', 100), pct('y4', 'Point 4 Y', 100), COL('c4', 'Color 4', '#0a84ff'), N('blend', 'Blend', 0, 100, 100), N('jit', 'Jitter', 0, 100, 0), N('op', 'Opacity', 0, 100, 100)], { glsl: ov + `
vec4 fx(vec2 uv){
  vec2 q = uv + (hash(uv*uRes)-.5)*p_jit*.01;
  vec2 a = vec2(p_x1,p_y1)*.01, b = vec2(p_x2,p_y2)*.01, c = vec2(p_x3,p_y3)*.01, d = vec2(p_x4,p_y4)*.01;
  float w1 = 1./(pow(distance(q,a),2.)+.01), w2 = 1./(pow(distance(q,b),2.)+.01), w3 = 1./(pow(distance(q,c),2.)+.01), w4 = 1./(pow(distance(q,d),2.)+.01);
  vec3 g = (p_c1*w1 + p_c2*w2 + p_c3*w3 + p_c4*w4)/(w1+w2+w3+w4);
  vec4 s = S(uv); return over(vec4(g,1.), s, p_op*.01*p_blend*.01);
}` });
def('cellPattern', 'Cell Pattern', 'Generate', [SEL('type', 'Cell Pattern', ['Bubbles', 'Crystals', 'Plates', 'Pillow', 'Mixed Crystals']), BOOL('inv', 'Invert'), N('contrast', 'Contrast', 0, 400, 100), N('size', 'Size', 5, 400, 60), N('evo', 'Evolution', 0, 360, 0, .1), N('op', 'Opacity', 0, 100, 100)], { glsl: ov + `
vec4 fx(vec2 uv){
  vec2 p = uv*uRes/max(p_size,4.); vec2 ip = floor(p), fp = fract(p); float md = 8., md2 = 8.; vec2 id = vec2(0.);
  for(int j=-1;j<=1;j++) for(int i=-1;i<=1;i++){ vec2 g = vec2(float(i),float(j)); vec2 o = vec2(hash(ip+g), hash(ip+g+31.7)); o = .5+.5*sin(radians(p_evo)+6.2831*o); vec2 r = g+o-fp; float d = dot(r,r); if(d<md){ md2=md; md=d; id=ip+g; } else if(d<md2) md2 = d; }
  int t = int(p_type+.5); float v = t==0 ? sqrt(md) : t==1 ? hash(id) : t==2 ? (sqrt(md2)-sqrt(md)) : t==3 ? (1.-sqrt(md)) : mix(hash(id), sqrt(md2)-sqrt(md), .5);
  v = clamp((v-.5)*p_contrast*.01+.5, 0., 1.); if(p_inv>.5) v = 1.-v;
  return over(vec4(vec3(v),1.), S(uv), p_op*.01);
}` });
def('checkerboard', 'Checkerboard', 'Generate', [N('size', 'Size', 2, 800, 80), N('feather', 'Feather', 0, 100, 0), COL('c1', 'Color', '#ffffff'), COL('c2', 'Color 2', '#000000'), N('op', 'Opacity', 0, 100, 50)], { glsl: ov + `
vec4 fx(vec2 uv){
  vec2 p = uv*uRes/p_size;
  float ch = mod(floor(p.x)+floor(p.y), 2.); vec3 c = ch<.5 ? p_c1 : p_c2; return over(vec4(c,1.), S(uv), p_op*.01);
}` });
def('circle', 'Circle', 'Generate', [pct('cx', 'Center X', 50), pct('cy', 'Center Y', 50), N('rad', 'Radius', 0, 2000, 150), SEL('edge', 'Edge', ['None', 'Edge Radius', 'Thickness', 'Thickness & Feather']), N('thick', 'Thickness', 0, 500, 20), N('feather', 'Feather', 0, 500, 0), COL('col', 'Color', '#ffffff'), BOOL('inv', 'Invert Circle'), N('op', 'Opacity', 0, 100, 100)], { glsl: ov + `
vec4 fx(vec2 uv){
  vec2 c = vec2(p_cx,p_cy)*.01*uRes; float d = distance(uv*uRes, c); float R = p_rad; int e = int(p_edge+.5);
  float m;
  if(e==0) m = 1.-smoothstep(R-p_feather*.5, R+p_feather*.5+.5, d);
  else if(e==1) m = 1.-smoothstep(R-p_feather*.5-1., R+p_feather*.5+1., d);
  else m = (1.-smoothstep(R-.5, R+.5, d)) * smoothstep(R-p_thick-.5-p_feather*.5, R-p_thick+.5+p_feather*.5, d);
  if(p_inv>.5) m = 1.-m; return over(vec4(p_col*m,m), S(uv), p_op*.01);
}` });
def('ellipsefx', 'Ellipse', 'Generate', [pct('cx', 'Center X', 50), pct('cy', 'Center Y', 50), N('w', 'Width', 1, 3000, 300), N('h', 'Height', 1, 3000, 150), N('thick', 'Thickness', 0, 500, 10), N('soft', 'Softness', 0, 100, 10), COL('in', 'Inside Color', '#ffffff'), COL('out', 'Outside Color', '#000000'), N('op', 'Opacity', 0, 100, 100)], { glsl: ov + `
vec4 fx(vec2 uv){
  vec2 c = vec2(p_cx,p_cy)*.01*uRes; vec2 d = (uv*uRes-c)/vec2(p_w*.5,p_h*.5); float r = length(d);
  float edge = p_soft*.01+.002; float m = 1.-smoothstep(1.-edge, 1.+edge, r);
  float ring = (1.-smoothstep(1.-edge,1.+edge,r))*smoothstep(1.-p_thick/max(p_w*.5,1.)-edge, 1.-p_thick/max(p_w*.5,1.)+edge, r);
  vec3 col = mix(p_out, p_in, p_thick>0.? ring : m); return over(vec4(col,1.), S(uv), p_op*.01);
}` });
def('gridfx', 'Grid', 'Generate', [N('sx', 'Size X', 4, 800, 100), N('sy', 'Size Y', 4, 800, 100), N('border', 'Border', .5, 40, 2, .1), N('feather', 'Feather', 0, 20, 0, .1), COL('col', 'Color', '#ffffff'), N('op', 'Opacity', 0, 100, 100)], { glsl: ov + `
vec4 fx(vec2 uv){
  vec2 p = uv*uRes; vec2 f = abs(fract(p/vec2(p_sx,p_sy)-.5)-.5)*vec2(p_sx,p_sy); float d = min(f.x,f.y); float m = 1.-smoothstep(p_border*.5, p_border*.5+p_feather+.7, d);
  return over(vec4(p_col*m,m), S(uv), p_op*.01);
}` });
def('lensFlare', 'Lens Flare', 'Generate', [pct('cx', 'Flare Center X', 30), pct('cy', 'Flare Center Y', 30), N('bright', 'Flare Brightness', 0, 300, 100), SEL('lens', 'Lens Type', ['50-300mm Zoom', '35mm Prime', '105mm Prime']), N('blend', 'Blend With Original', 0, 100, 0)], { glsl: `
vec4 fx(vec2 uv){
  vec2 asp = vec2(uRes.x/uRes.y,1.); vec2 c = vec2(p_cx,p_cy)*.01; vec2 d = (uv-c)*asp; float r = length(d); float k = p_bright*.01;
  vec3 f = vec3(1.,.9,.7)*k*(.12/(r*r*60.+.05)); vec2 ctr = (vec2(.5)-c)*asp;
  for(int i=1;i<6;i++){ float t = float(i)*.35+.2; vec2 gp = c*asp + ctr*t*2.; float gd = length((uv*asp)-gp); vec3 gc = .5+.5*cos(6.28*(float(i)*.17+vec3(0.,.33,.67))); f += gc*k*.08*smoothstep(.07+.02*float(i), .0, gd); }
  f += vec3(1.,.8,.6)*k*.4*exp(-abs(d.y)*40.)*exp(-r*2.5); vec4 s = S(uv); vec3 o = s.rgb + f*(1.-s.rgb*.3); return vec4(mix(o, s.rgb, p_blend*.01), s.a);
}` });
def('lightning', 'Lightning', 'Generate', [pct('x1', 'Start X', 20), pct('y1', 'Start Y', 50), pct('x2', 'End X', 80), pct('y2', 'End Y', 50), N('seg', 'Segments', 2, 30, 12, 1), N('amp', 'Amplitude', 0, 100, 30), N('speed', 'Speed', 0, 30, 10), N('width', 'Width', 1, 60, 6), COL('col', 'Inside Color', '#ffffff'), COL('glow', 'Outside Color', '#6aa0ff'), N('op', 'Opacity', 0, 100, 100)], { glsl: ov + `
vec4 fx(vec2 uv){
  vec2 a = vec2(p_x1,p_y1)*.01*uRes, b = vec2(p_x2,p_y2)*.01*uRes, p = uv*uRes; vec2 dir = b-a; float L = length(dir); vec2 nrm = normalize(vec2(-dir.y,dir.x)+1e-5);
  float best = 1e9; vec2 prev = a; float t0 = floor(uTime*p_speed);
  for(int i=1;i<=30;i++){ if(float(i)>p_seg) break; float t = float(i)/p_seg; float n = (hash(vec2(float(i), t0))-.5)*2.; vec2 cur = a + dir*t + nrm*n*p_amp*.01*L*.25*(i==int(p_seg)?0.:1.);
    vec2 pa = p-prev, ba = cur-prev; float h = clamp(dot(pa,ba)/max(dot(ba,ba),1e-3),0.,1.); best = min(best, length(pa-ba*h)); prev = cur; }
  float core = 1.-smoothstep(0., p_width*.5, best); float gl = exp(-best/max(p_width*2.,1.));
  vec3 col = p_col*core + p_glow*gl*.8; float al = clamp(core+gl*.8,0.,1.);
  return over(vec4(col*al, al), S(uv), p_op*.01);
}` });
def('paintBucket', 'Paint Bucket', 'Generate', [COL('target', 'Sample Color', '#ffffff'), COL('fill', 'Fill Color', '#ff8c00'), N('tol', 'Tolerance', 0, 100, 25), N('soft', 'Stroke Softness', 0, 100, 10), N('op', 'Opacity', 0, 100, 100)], { glsl: `
vec4 fx(vec2 uv){ vec4 s = S(uv); vec3 c = U(s).rgb; float d = distance(c,p_target)/1.732; float m = (1.-smoothstep(p_tol*.01, p_tol*.01+p_soft*.01+.001, d))*p_op*.01; return M(vec4(mix(c,p_fill,m), s.a)); }` });
def('ramp', 'Ramp', 'Generate', [pct('x1', 'Start X', 50), pct('y1', 'Start Y', 0), COL('c1', 'Start Color', '#000000'), pct('x2', 'End X', 50), pct('y2', 'End Y', 100), COL('c2', 'End Color', '#ffffff'), SEL('shape', 'Ramp Shape', ['Linear', 'Radial']), N('scatter', 'Ramp Scatter', 0, 100, 0), N('blend', 'Blend With Original', 0, 100, 0)], { glsl: `
vec4 fx(vec2 uv){
  vec2 a = vec2(p_x1,p_y1)*.01*uRes, b = vec2(p_x2,p_y2)*.01*uRes, p = uv*uRes; float t;
  if(p_shape<.5) t = dot(p-a,b-a)/max(dot(b-a,b-a),1.); else t = length(p-a)/max(length(b-a),1.);
  t = clamp(t + (hash(uv*uRes)-.5)*p_scatter*.01, 0., 1.); vec4 s = S(uv); vec3 g = mix(p_c1,p_c2,t);
  return vec4(mix(g*s.a, s.rgb, p_blend*.01), s.a);
}` });
def('writeOn', 'Write-on', 'Generate', [pct('x1', 'Start X', 20), pct('y1', 'Start Y', 50), pct('x2', 'End X', 80), pct('y2', 'End Y', 50), N('prog', 'Progress', 0, 100, 0), N('size', 'Brush Size', 1, 300, 20), N('hard', 'Brush Hardness', 0, 100, 80), COL('col', 'Color', '#ff3b30'), N('op', 'Opacity', 0, 100, 100), SEL('style', 'Paint Style', ['On Original Image', 'On Transparent', 'Reveal Original Image'])], { glsl: `
vec4 fx(vec2 uv){
  vec2 a = vec2(p_x1,p_y1)*.01*uRes, b = vec2(p_x2,p_y2)*.01*uRes, p = uv*uRes; b = a + (b-a)*p_prog*.01;
  vec2 pa = p-a, ba = b-a; float h = clamp(dot(pa,ba)/max(dot(ba,ba),1e-3),0.,1.); float d = length(pa-ba*h); float R = p_size*.5;
  float m = (1.-smoothstep(R*p_hard*.01, R+.5, d))*p_op*.01; if(p_prog<=0.) m = 0.;
  vec4 s = S(uv); int st = int(p_style+.5);
  if(st==2) return s*m; if(st==1) return vec4(p_col*m, m);
  return vec4(mix(U(s).rgb, p_col, m)*s.a, s.a);
}` });
