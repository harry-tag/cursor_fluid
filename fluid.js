// fluid.js — cursor-reactive domain-warped noise ("lava lamp") on a WebGL canvas.
// Usage (module):   import initFluid from './fluid.js';
//                   const f = initFluid(canvasEl, { palette:'sage' });
//                   f.setOptions({ speed:0.6 });   // live tweak
//                   f.destroy();                    // tear down on unmount
// Usage (no modules): delete the `export default`, load with a <script> tag,
//                     and call initFluid(...) directly.

const VERT = `attribute vec2 p; void main(){ gl_Position = vec4(p,0.,1.); }`;

const FRAG = `
precision highp float;
uniform vec2  u_res;
uniform float u_time;
uniform vec2  u_mouse;
uniform float u_speed;
uniform float u_warp;
uniform float u_force;
uniform int   u_pal;

vec3 permute(vec3 x){ return mod(((x*34.0)+1.0)*x, 289.0); }
float snoise(vec2 v){
  const vec4 C = vec4(0.211324865405187,0.366025403784439,
                     -0.577350269189626,0.024390243902439);
  vec2 i  = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0,0.0) : vec2(0.0,1.0);
  vec4 x12 = x0.xyxy + C.xxzz; x12.xy -= i1;
  i = mod(i, 289.0);
  vec3 perm = permute( permute( i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
  m = m*m; m = m*m;
  vec3 x = 2.0 * fract(perm * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);
  vec3 g;
  g.x  = a0.x  * x0.x  + h.x  * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}
float fbm(vec2 p){
  float f = 0.0, amp = 0.5;
  for(int i=0;i<5;i++){ f += amp*snoise(p); p *= 2.02; amp *= 0.5; }
  return f;
}
vec3 cosp(float t, vec3 a, vec3 b, vec3 c, vec3 d){ return a + b*cos(6.28318*(c*t + d)); }
vec3 palette(float t, int id){
  if(id==0) return cosp(t, vec3(.50,.50,.52), vec3(.50,.48,.50), vec3(1.,1.,1.), vec3(.00,.10,.20));
  if(id==1) return cosp(t, vec3(.62,.58,.50), vec3(.30,.28,.22), vec3(1.,1.,1.), vec3(.10,.15,.20));
  if(id==2) return cosp(t, vec3(.55,.40,.30), vec3(.45,.30,.20), vec3(1.,.9,.7),  vec3(.05,.35,.55));
  return cosp(t, vec3(.30,.40,.55), vec3(.30,.30,.40), vec3(1.,1.,1.), vec3(.55,.30,.20));
}
void main(){
  float aspect = u_res.x / u_res.y;
  vec2 uv = gl_FragCoord.xy / u_res;
  vec2 p  = uv; p.x *= aspect;
  vec2 m  = u_mouse; m.x *= aspect;
  float d = distance(p, m);
  float bulge = exp(-d*d*9.0);
  float t = u_time * (0.05 + u_speed*0.35);
  vec2 q = vec2(fbm(p*1.4 + vec2(0.0,  t*0.6)),
                fbm(p*1.4 + vec2(5.2, -t*0.5) + 1.3));
  vec2 r = vec2(fbm(p*1.4 + u_warp*q + vec2(1.7,9.2) + t*0.7),
                fbm(p*1.4 + u_warp*q + vec2(8.3,2.8) - t*0.6));
  r += u_force * bulge * normalize(p - m + 0.0001) * 0.9;
  float f = fbm(p*1.4 + u_warp*r);
  f = f*0.5 + 0.5;
  f += bulge * u_force * 0.35;
  vec3 col = palette(clamp(f,0.0,1.0), u_pal);
  col *= 0.82 + 0.30*f;
  col = pow(col, vec3(0.92));
  gl_FragColor = vec4(col, 1.0);
}`;

const PALETTES = { ink:0, sage:1, lava:2, teal:3 };

export default function initFluid(canvas, opts = {}){
  const gl = canvas.getContext('webgl', { antialias:false, premultipliedAlpha:false });
  if(!gl) throw new Error('initFluid: WebGL not available');

  // ---- options + live state ----
  const state = {
    speed: opts.speed ?? 0.35,
    warp:  opts.warp  ?? 3.2,
    force: opts.force ?? 0.55,
    pal:   PALETTES[opts.palette] ?? PALETTES.sage,
  };
  const renderScale  = opts.renderScale ?? 0.75;   // soft effect -> render below native
  const dprCap       = opts.dprCap ?? 1.5;
  const pointerTarget= opts.pointerTarget ?? window; // window = reacts page-wide (background)
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---- shader setup ----
  const compile = (type, src) => {
    const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if(!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  };
  const prog = gl.createProgram();
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(prog); gl.useProgram(prog);

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 3,-1, -1,3]), gl.STATIC_DRAW);
  const aLoc = gl.getAttribLocation(prog, 'p');
  gl.enableVertexAttribArray(aLoc);
  gl.vertexAttribPointer(aLoc, 2, gl.FLOAT, false, 0, 0);

  const U = {
    res:   gl.getUniformLocation(prog,'u_res'),
    time:  gl.getUniformLocation(prog,'u_time'),
    mouse: gl.getUniformLocation(prog,'u_mouse'),
    speed: gl.getUniformLocation(prog,'u_speed'),
    warp:  gl.getUniformLocation(prog,'u_warp'),
    force: gl.getUniformLocation(prog,'u_force'),
    pal:   gl.getUniformLocation(prog,'u_pal'),
  };

  // ---- sizing (observe the canvas itself, so it works full-screen or boxed) ----
  function resize(){
    const dpr = Math.min(devicePixelRatio || 1, dprCap) * renderScale;
    const w = Math.max(1, Math.floor(canvas.clientWidth  * dpr));
    const h = Math.max(1, Math.floor(canvas.clientHeight * dpr));
    if(canvas.width !== w || canvas.height !== h){
      canvas.width = w; canvas.height = h; gl.viewport(0,0,w,h);
    }
  }
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  resize();

  // ---- pointer (normalized to the canvas rect; handles scroll/offset) ----
  const target = { x:0.5, y:0.5 }, eased = { x:0.5, y:0.5 };
  function onMove(e){
    const r = canvas.getBoundingClientRect();
    if(!r.width || !r.height) return;
    target.x = (e.clientX - r.left) / r.width;
    target.y = 1 - (e.clientY - r.top) / r.height; // flip into GL space
  }
  pointerTarget.addEventListener('pointermove', onMove);
  pointerTarget.addEventListener('pointerdown', onMove);

  // ---- render loop ----
  let raf = 0, t0 = performance.now();
  function frame(now){
    const time = reduce ? 0 : (now - t0) / 1000;
    eased.x += (target.x - eased.x) * 0.05;   // momentum / trailing
    eased.y += (target.y - eased.y) * 0.05;

    gl.uniform2f(U.res, canvas.width, canvas.height);
    gl.uniform1f(U.time, time);
    gl.uniform2f(U.mouse, eased.x, eased.y);
    gl.uniform1f(U.speed, state.speed);
    gl.uniform1f(U.warp,  state.warp);
    gl.uniform1f(U.force, state.force);
    gl.uniform1i(U.pal,   state.pal);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);

  // ---- public API ----
  return {
    setOptions(next = {}){
      if(next.speed   != null) state.speed = next.speed;
      if(next.warp    != null) state.warp  = next.warp;
      if(next.force   != null) state.force = next.force;
      if(next.palette != null && next.palette in PALETTES) state.pal = PALETTES[next.palette];
    },
    destroy(){
      cancelAnimationFrame(raf);
      ro.disconnect();
      pointerTarget.removeEventListener('pointermove', onMove);
      pointerTarget.removeEventListener('pointerdown', onMove);
      gl.deleteBuffer(buf);
      gl.deleteProgram(prog);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    },
  };
}
