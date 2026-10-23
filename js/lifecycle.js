// Life cycle of the Design Studio IV site, animated from the Rhino progress models.
// Every object is a "track" with a birth stage, a death stage and (for the decay) its real rigid motion
// recovered from the Rhino file. One timeline value u ∈ [0, 4] drives all of it on the GPU.
import * as THREE from 'three';
import { buildVegetation, loadTreeModels } from './vegetation.js';

const PER_ROW = 64;   // tracks per texture row
const TEXELS = 7;     // texels per track

// in/out animation kinds (mirrored in the shader)
const IN = { none: 0, rise: 1, build: 2, grow: 3, swap: 4, settle: 5, fade: 6 };
const OUT = { none: 0, crumble: 1, sink: 2, collapse: 3, swap: 4, fade: 5 };

const HEADER = /* glsl */`
uniform sampler2D uTracks;
uniform float uTime;
attribute float aTrack;
varying vec3 vRest;
varying float vDilap;
varying float vFade;   // 1 = solid; 0..1 fading in; -1..0 fading out (the specks the incoming piece hasn't taken yet)
vec4 trk(int k) {
  int id = int(aTrack + 0.5);
  return texelFetch(uTracks, ivec2((id % ${PER_ROW}) * ${TEXELS} + k, id / ${PER_ROW}), 0);
}
vec3 rotAxis(vec3 v, vec3 a, float ang) {
  float c = cos(ang), s = sin(ang);
  return v * c + cross(a, v) * s + a * dot(a, v) * (1.0 - c);
}
float easeOut(float x) { return 1.0 - pow(1.0 - x, 3.0); }
vec3 lifeCycle(vec3 p) {
  vec4 t0 = trk(0), t1 = trk(1), t2 = trk(2), t3 = trk(3), t4 = trk(4), t5 = trk(5), t6 = trk(6);
  vDilap = 0.0;
  vFade = 1.0;
  vec3 c = t0.xyz; float b = t0.w;
  vec3 sz = t1.xyz; float d = t1.w;
  float u = uTime;
  float dur = t5.w;
  vec3 pivot = vec3(c.x, c.y - sz.y * 0.5, c.z);
  vec3 ax = normalize(vec3(t5.x - 0.5, 0.25, t5.z - 0.5));
  float sc = 1.0; vec3 off = vec3(0.0); float ang = 0.0;

  // birth: animate in during the transition (b-1 -> b)
  if (b > 0.5) {
    float lp = u - (b - 1.0);
    if (lp <= 0.0) return pivot;
    if (lp < 1.0) {
      int it = int(t2.x + 0.5);
      if (it == 4) { if (lp < 0.5) return pivot; }
      else {
        float pin = clamp((lp - t2.z) / dur, 0.0, 1.0);
        if (pin <= 0.0) return pivot;
        float e = easeOut(pin);
        if (it == 1) off.y -= (sz.y + 1.5) * (1.0 - e);
        else if (it == 2) { off.y += 9.0 * (1.0 - e); ang += (1.0 - e) * 0.25; }
        else if (it == 3) sc *= e;
        else if (it == 5) { off.y += 3.0 * (1.0 - e); ang += (1.0 - e) * 0.7; }
        else if (it == 6) vFade = pin;   // in place, dissolving in
      }
    }
  }
  // death: animate out during the transition (d -> d+1)
  if (d < 3.5) {
    float lp = u - d;
    if (lp >= 1.0) return pivot;
    if (lp > 0.0) {
      int ot = int(t2.y + 0.5);
      if (ot == 4) { if (lp >= 0.5) return pivot; }
      else {
        float po = clamp((lp - t2.w) / dur, 0.0, 1.0);
        if (po >= 1.0) return pivot;
        if (ot == 1) { off.y -= (sz.y + 2.0) * po * po; ang += po * 0.9; sc *= 1.0 - 0.5 * po; }
        else if (ot == 2) { off.y -= (sz.y + 0.5) * po; }
        else if (ot == 3) { off.y -= t5.y * po * po; ang += po * 1.4; sc *= 1.0 - smoothstep(0.7, 1.0, po); }
        else if (ot == 5) vFade = -(1.0 - po);   // in place, dissolving out (negative: the complementary specks)
      }
    }
  }
  vec3 q = p;
  // dilapidation: the piece's real rigid motion from the construction model to the decay model
  if (t3.w >= 0.0 && u > 3.0) {
    float pm = clamp((u - 3.0 - t3.w) / dur, 0.0, 1.0);
    float e = pm * pm * (3.0 - 2.0 * pm);
    vec3 ca = t6.xyz;
    q = rotAxis(q - ca, t4.xyz, t4.w * e) + ca + t3.xyz * mix(e, pm * pm, 0.5);
  }
  // decay (4): the roofs left standing break open with the same ragged, stained holes once the flood has passed
  if (t6.w > 3.5) vDilap = smoothstep(3.35, 3.95, u);
  // demolition: the old roof gives way. Slabs (1) sag from one edge and break open, members (2) hang askew,
  // some members (3) are already gone
  else if (t6.w > 0.5) {
    float amt = clamp((u - 0.25) / 0.6, 0.0, 1.0);
    if (t6.w > 2.5 && amt > 0.4) return pivot;
    float sg = t5.z > 0.5 ? 1.0 : -1.0;
    bool alongX = sz.x >= sz.z;
    vec3 hinge = c + (alongX ? vec3(sz.x * 0.5 * sg, 0.0, 0.0) : vec3(0.0, 0.0, sz.z * 0.5 * sg));
    vec3 hax = alongX ? vec3(0.0, 0.0, 1.0) : vec3(1.0, 0.0, 0.0);
    float th = (t6.w < 1.5 ? 0.05 + 0.08 * t5.x : 0.12 + 0.45 * t5.x) * amt * (alongX ? sg : -sg);
    q = rotAxis(q - hinge, hax, th) + hinge;
    q.y -= (t6.w < 1.5 ? 0.15 : 0.05) * amt;
    if (t6.w < 1.5) vDilap = amt;
  }
  if (ang != 0.0 || sc != 1.0) q = rotAxis(q - pivot, ax, ang) * sc + pivot;
  return q + off;
}
`;

// shared by every life-cycle fragment shader: the rest position, the roof's decay, and a value noise
const FRAG_HEAD = /* glsl */`
varying vec3 vRest;
varying float vDilap;
varying float vFade;
float hash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash2(i), hash2(i + vec2(1, 0)), f.x), mix(hash2(i + vec2(0, 1)), hash2(i + vec2(1, 1)), f.x), f.y);
}
`;
// the demolished roof breaks open: holes grow through it with dark, stained rims (shadows follow, as the
// depth material discards the same fragments)
const DILAPIDATE = /* glsl */`
// fading pieces dissolve in small specks fixed to the piece (in the shadow pass too, and still while the camera
// sways), so the decayed roof panels can take the new ones' place without anything falling. The outgoing piece
// keeps exactly the specks the incoming one hasn't taken yet, so the two never show in the same place at once
if (vFade < 0.999) {
  float fh = hash2(floor(vRest.xz * 14.0) + floor(vRest.y * 14.0) * vec2(7.13, 3.71));
  if (vFade >= 0.0 ? fh > vFade : fh <= 1.0 + vFade) discard;
}
if (vDilap > 0.001) {
  vec3 hp = vRest;
  float dn = vnoise(hp.xz * 0.32 + hp.y) * 0.6 + vnoise(hp.xz * 1.25 + 7.0) * 0.3 + vnoise(hp.xz * 4.0 + 3.0) * 0.1;
  float dth = 1.0 - 0.45 * vDilap;
  if (dn > dth) discard;
  diffuseColor.rgb *= mix(1.0, 0.3, smoothstep(dth - 0.1, dth, dn));
  diffuseColor.rgb *= mix(1.0, 0.6 + 0.4 * vnoise(hp.xz * 2.2 + 11.0), vDilap);
}
`;

// lift: raise the piece a little before animating it (the thatch, so the roof framing never pokes through;
// its shadow-casting depth material gets the same lift). flow: the river, which also rises in the flood
function inject(material, uniforms, tri = null, flow = null, lift = 0) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTracks = uniforms.uTracks;
    shader.uniforms.uTime = uniforms.uTime;
    if (flow) shader.uniforms.uFlood = uniforms.uFlood;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + HEADER + (flow ? 'uniform float uFlood;\n' : ''))
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRest = transformed;\n' + (lift ? `transformed.y += ${lift.toFixed(3)};\n` : '') + 'transformed = lifeCycle(transformed);\n'
        // the flood lifts the river's surface (its 0.4 m deep base stays put)
        + (flow ? 'if (transformed.y > -0.3) transformed.y += uFlood;\n' : ''));
    if (tri) triplanar(shader, tri, uniforms);
    if (flow) riverFlow(shader, flow, uniforms);
    // inserted last, so it lands right after <common>, ahead of the declarations above that use it
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + FRAG_HEAD)
      .replace('#include <alphamap_fragment>', DILAPIDATE + '#include <alphamap_fragment>');
  };
  material.customProgramCacheKey = () => 'lifecycle3' + (tri ? (tri.normal ? 'tn' : 't') + (tri.weather ? 'w' : '') : '') + (flow ? 'f' : '') + (lift ? 'l' + lift : '');
}

// the Ebro running downstream: foam streaks and glints drift along the river axis, bend around whatever stands
// in the water at that stage (pier walls, gabions, reed beds), pile up as foam on its upstream face and trail
// off in a turbulent wake behind it. The obstacles come as a blurred mask per stage (stages 0-3 in tObstA's
// rgba, stage 4 in tObstB.r) over a square of the river (uObstBox: x0, z0, size)
function riverFlow(shader, flow, uniforms) {
  Object.assign(shader.uniforms, { uFlow: flow.dir, uClock: uniforms.uClock, uFlowT: uniforms.uFlowT, uTime: uniforms.uTime, tObstA: flow.obstA, tObstB: flow.obstB, uObstBox: flow.box });
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', `#include <common>
      uniform vec2 uFlow;
      uniform float uClock;
      uniform float uFlowT;
      uniform float uFlood;
      uniform float uTime;
      uniform sampler2D tObstA;
      uniform sampler2D tObstB;
      uniform vec4 uObstBox;
      float obst(vec2 p) {
        vec2 uv = (p - uObstBox.xy) / uObstBox.z;
        if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return 0.0;
        float s = clamp(uTime, 0.0, 4.0);
        vec4 w = max(vec4(0.0), 1.0 - abs(vec4(s) - vec4(0.0, 1.0, 2.0, 3.0)));
        return dot(texture2D(tObstA, uv), w) + texture2D(tObstB, uv).r * max(0.0, 1.0 - abs(s - 4.0));
      }`)
    .replace('#include <map_fragment>', `#include <map_fragment>
      {
        vec2 F = uFlow, P = vec2(-uFlow.y, uFlow.x);
        vec2 xz = vRest.xz;
        float m = obst(xz);
        // the mask's slope points into the obstacle; the current slides along it instead
        vec2 g = vec2(obst(xz + vec2(1.5, 0.0)) - obst(xz - vec2(1.5, 0.0)), obst(xz + vec2(0.0, 1.5)) - obst(xz - vec2(0.0, 1.5)));
        // along / across the current, in metres; uFlowT is the distance the surface has travelled (about 2 m/s,
        // several times that in the flood)
        vec2 q = vec2(dot(xz, F), dot(xz, P));
        q.y -= dot(g, P) * 3.0;                    // streamlines bow out around the obstacle
        float t = uFlowT;
        float fl = clamp(uFlood / 2.4, 0.0, 1.0);  // how far into the flood
        float a = vnoise(vec2((q.x - t) * 0.16, q.y * 2.4));
        float b = vnoise(vec2((q.x - t * 1.35) * 0.32 + 17.0, q.y * 4.5 + 3.0));
        float c = vnoise(vec2((q.x - t * 0.8) * 0.03, q.y * 0.15));
        float streak = (smoothstep(0.7, 0.9, a) * (0.3 + 0.7 * c) + smoothstep(0.78, 0.95, b) * 0.45) * (1.0 - 0.8 * m);
        // wake: how much obstacle lies just upstream, fading with distance
        float wake = 0.0;
        for (int i = 1; i <= 6; i++) wake += obst(xz - F * float(i) * 1.6) * (1.0 - float(i) / 7.0);
        wake = smoothstep(0.35, 1.6, wake) * (1.0 - m);
        // eddies in the wake: a churned, faster-varying foam
        vec2 e = vec2(q.x - t * 0.7, q.y);
        float eddy = vnoise(e * 1.6 + vec2(sin(q.y * 0.8 + uClock), cos(q.x * 0.6 - uClock * 1.3)) * 0.8);
        float churn = smoothstep(0.62, 0.9, eddy) * wake;
        // bow wave: a foam line where the current runs into the obstacle's upstream face
        float face = clamp(dot(g, F) * 4.0, 0.0, 1.0);
        float bow = smoothstep(0.08, 0.35, m) * (1.0 - smoothstep(0.35, 0.8, m)) * face * (0.65 + 0.35 * sin(uClock * 3.0 + q.y * 2.0));
        float foam = clamp(streak * (0.3 + 0.35 * fl) + churn * 0.4 + bow * 0.7, 0.0, 1.0);
        // flood water: silty brown, churning everywhere
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.32, 0.27, 0.18), fl * 0.75);
        foam = max(foam, smoothstep(0.62, 0.92, vnoise(vec2(q.x - t * 1.2, q.y * 2.2) * 0.6)) * fl * 0.32);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.7, 0.72, 0.66), foam);
        diffuseColor.rgb *= (0.92 + 0.16 * c) * (1.0 - 0.25 * m * (1.0 - fl));   // calmer, darker water inside the reed beds
      }`);
}

// Twinmotion materials on the Rhino pieces, which carry no uvs: project the textures along the three axes
// from each piece's rest position, so they stay put on a piece while it falls in the decay
function triplanar(shader, tri, uniforms) {
  Object.assign(shader.uniforms, { tAlbedo: { value: tri.map }, tNormal: { value: tri.normal }, uTile: { value: tri.tile }, uNormalAmt: { value: tri.normalAmt }, uMacro: { value: tri.macro ?? 0.35 } });
  if (tri.weather) {
    // new until the decay, then sun-bleached grey with green moss
    shader.uniforms.uTime = uniforms.uTime;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <alphamap_fragment>', `{
        float wx = smoothstep(3.3, 4.0, uTime);   // after the flood
        float moss = smoothstep(0.45, 0.75, vnoise(vRest.xz * 0.5));
        diffuseColor.rgb *= mix(vec3(1.0), mix(vec3(0.62, 0.62, 0.58), vec3(0.42, 0.5, 0.3), moss), wx);
      }
      #include <alphamap_fragment>`);
  }
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', `#include <common>
      uniform sampler2D tAlbedo;
      ${tri.normal ? 'uniform sampler2D tNormal;' : ''}
      uniform float uTile;
      uniform float uNormalAmt;
      uniform float uMacro;
      vec3 triW(vec3 n) { vec3 w = pow(abs(n), vec3(6.0)); return w / (w.x + w.y + w.z); }
      vec4 triTex(sampler2D t, vec3 p, vec3 w) {
        // a second, coarser sample breaks up the repeat across the big ground planes
        vec4 a = texture2D(t, p.zy) * w.x + texture2D(t, p.xz) * w.y + texture2D(t, p.xy) * w.z;
        vec3 q = p * 0.173;
        vec4 b = texture2D(t, q.zy) * w.x + texture2D(t, q.xz) * w.y + texture2D(t, q.xy) * w.z;
        return mix(a, b, uMacro);
      }`)
    .replace('#include <map_fragment>', `
      vec3 restN = normalize(cross(dFdx(vRest), dFdy(vRest)));
      vec3 triP = vRest * uTile;
      vec3 triWt = triW(restN);
      diffuseColor *= triTex(tAlbedo, triP, triWt);`);
  if (tri.normal) {
    shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_maps>', `
      {
        // whiteout-blended triplanar normal map (DirectX green), applied as a tilt of the face normal
        vec3 sg = sign(restN);
        vec3 nx = texture2D(tNormal, triP.zy).xyz * 2.0 - 1.0;
        vec3 ny = texture2D(tNormal, triP.xz).xyz * 2.0 - 1.0;
        vec3 nz = texture2D(tNormal, triP.xy).xyz * 2.0 - 1.0;
        nx.y = -nx.y; ny.y = -ny.y; nz.y = -nz.y;
        nx.xy *= uNormalAmt; ny.xy *= uNormalAmt; nz.xy *= uNormalAmt;
        nx.x *= sg.x; ny.x *= sg.y; nz.x *= -sg.z;
        nx = vec3(nx.xy + restN.zy, abs(nx.z) * restN.x);
        ny = vec3(ny.xy + restN.xz, abs(ny.z) * restN.y);
        nz = vec3(nz.xy + restN.xy, abs(nz.z) * restN.z);
        vec3 bent = normalize(nx.zyx * triWt.x + ny.xzy * triWt.y + nz.xyz * triWt.z);
        normal = normalize(normal + mat3(viewMatrix) * (bent - restN));
      }`);
  }
}

const THATCH_LIFT = 0.3;   // m the thatch sits proud of the roof framing

// Drawing order for coplanar surfaces. The Rhino site lays paths, paving and beaches as plates at exactly the
// height of the lawn under them (and the riverbed meets the water level), so with the camera's sway they flickered
// against each other. Each material gets a rank, low to high; a few millimetres of depth offset per rank makes
// the higher one always win where two lie in the same plane (tools/zfight_scan.py lists the cases)
const Z_ORDER = ['Grass_4', 'Grassy_ground', 'River_pebbles', 'Bare_concrete_03', 'Plaster__4_', 'Concrete_tiles_5', 'Plaster__7_',
  'Plaster__5_', 'Plaster__1_', 'Plaster__8_', 'New_standard', 'Maple_01_A', 'Plywood_02', 'Old_planks', 'Oak_04_G', 'Oak_04_G*',
  'Clean_brick_06', 'Corten_steel_01', 'Galvanised_steel_01', 'Long_pile_carpet_06', 'gabion', 'water'];
function zOrder(mat, name) {
  const L = Z_ORDER.indexOf(name);
  if (L <= 0) return;
  mat.polygonOffset = true;
  mat.polygonOffsetFactor = -0.05 * L;
  mat.polygonOffsetUnits = -2 * L;
}

// the flood at the start of the decay: the river climbs FLOOD.peak m over the first part of the transition,
// stands high while the structure gives way, then drains; its surface runs FLOOD.speed times faster at the peak
const FLOOD = { peak: 2.4, rise: [3.0, 3.25], drain: [3.62, 3.92], speed: 3.5 };
function floodLevel(u) {
  const s = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  return FLOOD.peak * s(FLOOD.rise[0], FLOOD.rise[1], u) * (1 - s(FLOOD.drain[0], FLOOD.drain[1], u));
}

// deterministic random so the choreography is the same on every visit
function rng(seed) {
  return () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export function createLifecycle(canvas, { mobile = false } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  // neutral keeps Rhino's white plaster white, like the diagram's model renders
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.35;
  // crisp sun shadows: ~4 cm per shadow texel, with the lightest filtering (one texel) so their edges don't crawl
  // as the sun moves through the day (on every screen; the buildings and trees cast them, the reeds don't)
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const bg = new THREE.Color('#151515');
  const scene = new THREE.Scene();
  scene.background = bg;
  // the camera never comes closer than ~60 m: a far near plane keeps the stacked roof layers from z-fighting
  const camera = new THREE.PerspectiveCamera(30, 1, 15, 1200);

  // a weaker sky fill against a strong sun: shadows stay dark enough to read
  scene.add(new THREE.HemisphereLight('#eef2f6', '#4a4238', 0.45));
  const sun = new THREE.DirectionalLight('#fff3e2', 3.8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(mobile ? 2048 : 4096, mobile ? 2048 : 4096);
  // a tight depth range (set in build) lets this bias stay at ~2 cm, so shadows sit right at their objects
  sun.shadow.bias = -0.0002;
  // a few centimetres along the surface normal keeps flat surfaces from shadowing themselves (acne rings)
  sun.shadow.normalBias = 0.07;
  scene.add(sun, sun.target);

  // uFlood: metres the river stands above normal; uFlowT: distance its surface has travelled (speeds up in the flood)
  const uniforms = { uTracks: { value: null }, uTime: { value: 0 }, uClock: { value: 0 }, uFlood: { value: 0 }, uFlowT: { value: 0 } };
  let vegInfo = null, flowDirDbg = null, riverDbg = null;
  const state = { u: 0, uT: 0, active: false, ready: false, w: 1, h: 1, az: 0, azT: 0, drag: false, zoom: 1 };
  const anchors = [];
  let focus = new THREE.Vector3(), radius = 100, waterDir = new THREE.Vector3(0, 0, 1);

  const ready = Promise.all([
    fetch('assets/lifecycle.json').then((r) => r.json()),
    // geometry ships as base64 in JSON so it can be hosted anywhere that serves .json
    fetch('assets/lifecycle-geometry.json').then((r) => r.json()).then((j) => {
      const s = atob(j.data);
      const u8 = new Uint8Array(s.length);
      for (let i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i);
      return u8.buffer;
    }),
    // Twinmotion willow branch system and poplar; the procedural trees stand in if these fail
    loadTreeModels().catch((e) => (console.warn('tree models', e), null)),
    // the Twinmotion scene linked to the tracks (tools/twinmotion_scene.py): its materials and tree layout
    fetch('assets/lifecycle-tm.json').then((r) => r.json()).catch((e) => (console.warn('twinmotion scene', e), null)),
  ]).then(([meta, buf, treeModels, tm]) => build(meta, buf, treeModels, tm));

  function build(meta, buf, treeModels, tm) {
    const tracks = meta.tracks;
    const N = tracks.length;
    const rand = rng(1984);
    const mats = meta.materials;
    const isWater = (m) => m.rgb[0] === 97 && m.rgb[1] === 203 && m.rgb[2] === 172;

    // ---- choreography per track ----
    const rows = Math.ceil(N / PER_ROW);
    const data = new Float32Array(PER_ROW * TEXELS * rows * 4);
    const buildBottoms = tracks.filter((t) => t[0] === 3).map((t) => t[3][1] - t[4][1] / 2).sort((a, b) => a - b);
    const rank = (y) => {
      let lo = 0, hi = buildBottoms.length;
      while (lo < hi) { const m = (lo + hi) >> 1; if (buildBottoms[m] < y) lo = m + 1; else hi = m; }
      return buildBottoms.length > 1 ? lo / (buildBottoms.length - 1) : 0;
    };
    // when, within the decay, a spot swaps from new to decayed: the same moment for every piece of one building
    // (12 m cells), so old and new cross-fade in step
    const decaySwap = (c) => {
      const h = Math.sin(Math.round(c[0] / 12) * 127.1 + Math.round(c[2] / 12) * 311.7) * 43758.5453;
      return 0.45 + 0.18 * (h - Math.floor(h));
    };
    // the old club building, under its canopy (Rhino colour 205,203,171)
    const canopyTracks = tracks.filter((t) => t[0] === 0 && mats[t[2]].rgb.join() === '205,203,171');
    const club = canopyTracks.length ? [canopyTracks.reduce((s, t) => s + t[3][0], 0) / canopyTracks.length, canopyTracks.reduce((s, t) => s + t[3][2], 0) / canopyTracks.length] : null;
    tracks.forEach((t, i) => {
      const [b, d, mi, c, size] = t;
      const move = t[6];
      const m = mats[mi];
      const flatBig = size[0] * size[2] > 600 && size[1] < 1.5;
      const tiny = Math.max(size[0], size[1], size[2]) < 0.4;
      const r1 = rand(), r2 = rand();
      let inT = IN.none, outT = OUT.none, dIn = 0, dOut = 0, dur = 0.3;
      if (b > 0) {
        if (flatBig || isWater(m)) inT = IN.swap;
        else if (b === 3) {
          // the structure goes up first, bottom to top; then the small parts settle into place, one by one
          // and the thatch goes on last, over the finished framing, so no batten is ever seen sitting on top of it
          const detail = Math.max(size[0], size[1], size[2]) < 1.6;
          const h = rank(c[1] - size[1] / 2);
          if (m.name === 'thatch') { inT = IN.build; dur = 0.3; dIn = 0.64 + r1 * 0.06; }
          else if (detail) { inT = IN.settle; dur = 0.3; dIn = 0.34 + (h * 0.7 + r1 * 0.3) * 0.26; }
          else { inT = IN.build; dIn = 0.02 + h * 0.3 + r1 * 0.04; }
        }
        // the decay: the flood comes first (see FLOOD); once the water stands high, the decayed pieces fade in
        // where they belong, nothing falls in
        else if (b === 4) { inT = IN.fade; dIn = decaySwap(c); dur = 0.3; }
        else { inT = IN.rise; dIn = 0.38 + r1 * 0.32; }
      }
      if (d < 4) {
        if (flatBig || isWater(m)) outT = OUT.swap;
        else if (d === 0) { outT = OUT.crumble; dOut = r2 * 0.35; dur = 0.35; }
        // the new roofs (everything up at roof level) fade out as their decayed panels fade in, in step
        else if (d === 3 && c[1] - size[1] / 2 > 9.5) { outT = OUT.fade; dOut = decaySwap(c); dur = 0.3; }
        else if (d === 3) { outT = tiny ? OUT.sink : OUT.collapse; dOut = 0.4 + r2 * 0.3; }
        else { outT = OUT.sink; dOut = r2 * 0.3; }
      }
      const bottom = c[1] - size[1] / 2;
      const fall = Math.min(12, Math.max(0.6, bottom - 3.5));
      // the club building's roof, up at roof level during the demolition: slabs and the members laid over them
      let dilap = 0;
      if (b <= 1 && d === 1 && bottom > 7.3 && club && Math.hypot(c[0] - club[0], c[2] - club[1]) < 30 && size[0] * size[2] < 600) {
        const lo3 = Math.min(size[0], size[1], size[2]), hi3 = Math.max(size[0], size[1], size[2]);
        if (size[1] < 0.6 && size[0] * size[2] > 12) dilap = 1;
        else if (lo3 < 0.25 && hi3 > 0.8) dilap = rand() < 0.25 ? 3 : 2;
      }
      // the roofs that stand through the decay (decayed panels, and thatch carried over): holed and stained
      else if (d === 4 && b >= 3 && bottom > 9.5 && size[0] * size[2] > 4) dilap = 4;
      const base = ((i % PER_ROW) * TEXELS + Math.floor(i / PER_ROW) * PER_ROW * TEXELS) * 4;
      const put = (k, x, y, z, w) => { const o = base + k * 4; data[o] = x; data[o + 1] = y; data[o + 2] = z; data[o + 3] = w; };
      put(0, c[0], c[1], c[2], b);
      put(1, size[0], size[1], size[2], d);
      put(2, inT, outT, Math.min(dIn, 1 - dur), Math.min(dOut, 1 - dur));
      if (move) {
        const delay = Math.min(0.4 + rand() * 0.25, 1 - 0.35);
        put(3, move.cb[0] - move.ca[0], move.cb[1] - move.ca[1], move.cb[2] - move.ca[2], delay);
        put(4, move.axis[0], move.axis[1], move.axis[2], move.ang);
        put(6, move.ca[0], move.ca[1], move.ca[2], dilap);
      } else {
        put(3, 0, 0, 0, -1);
        put(4, 0, 1, 0, 0);
        put(6, c[0], c[1], c[2], dilap);
      }
      put(5, r1, fall, r2, move ? 0.35 : dur);
    });
    const tex = new THREE.DataTexture(data, PER_ROW * TEXELS, rows, THREE.RGBAFormat, THREE.FloatType);
    tex.minFilter = tex.magFilter = THREE.NearestFilter;
    tex.needsUpdate = true;
    uniforms.uTracks.value = tex;

    // ---- materials straight from the Rhino file ----
    const flowDir = flowDirDbg = { value: new THREE.Vector2(1, 0) };   // set once the river's axis is known
    // what stands in the river at each stage, filled in once the site and its reeds are known
    const riverU = { dir: flowDir, obstA: { value: null }, obstB: { value: null }, box: { value: new THREE.Vector4(0, 0, 1, 1) } };
    const materials = mats.map((m) => {
      const col = new THREE.Color().setRGB(m.rgb[0] / 255, m.rgb[1] / 255, m.rgb[2] / 255, THREE.SRGBColorSpace);
      let mat;
      if (m.name === 'Glass') {
        mat = new THREE.MeshStandardMaterial({ color: '#2a3a40', roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.35, depthWrite: false });
      } else {
        const rough = { wood: 0.8, stilts: 0.85, thatch: 0.95, 'gabion basket': 0.6, 'solar sail support': 0.45 }[m.name] ?? 0.9;
        mat = new THREE.MeshStandardMaterial({ color: col, roughness: rough, metalness: m.name === 'solar sail support' ? 0.35 : 0 });
      }
      mat.flatShading = true;
      mat.side = THREE.DoubleSide;
      inject(mat, uniforms, null, isWater(m) ? riverU : null);
      if (isWater(m)) zOrder(mat, 'water');   // the river over the riverbed plates that meet its surface
      return mat;
    });
    const depthMat = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, side: THREE.DoubleSide });
    inject(depthMat, uniforms);

    // ---- Twinmotion materials, per track; water and glass keep the site's own ----
    const tl = new THREE.TextureLoader();
    const texCache = {};
    const tmTex = (f, srgb) => texCache[f] || (texCache[f] = (() => {
      const t = tl.load('assets/img/' + f);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.anisotropy = 8;
      if (srgb) t.colorSpace = THREE.SRGBColorSpace;
      return t;
    })());
    const makeTM = (e) => {
      if (!e.kind || e.kind === 'glass' || e.kind === 'water') return null;
      const [r, g, b, a] = e.tint || [1, 1, 1, 0];
      const k = Math.min(1, Math.max(0, a));
      // Twinmotion's colour swatch tints a texture; on its own it is the colour
      const col = e.map ? new THREE.Color(1 + (r - 1) * k, 1 + (g - 1) * k, 1 + (b - 1) * k) : a > 0 ? new THREE.Color(r, g, b) : new THREE.Color(1, 1, 1);
      // Twinmotion's lawn is far brighter in its renders than its dark map: lift it the same way
      if (/grass/i.test(e.name)) col.multiplyScalar(3.1);
      // the thatch (a long-pile carpet in Twinmotion): fresh golden reed on the new roofs, greying only in the
      // decay, and laid a few centimetres proud of the roof framing so no board shows through it
      const thatch = /carpet/i.test(e.name);
      if (thatch) col.setRGB(1.05, 0.8, 0.42);
      // the solar sail: Twinmotion's sheer dark cotton reads as rot where its corners stretch over the roofs.
      // A clean, light canvas, as in the renders
      if (/cotton/i.test(e.name)) {
        // semi-translucent: the sky and the structure read through it, and it throws a half shadow (depthSail)
        const sail = new THREE.MeshStandardMaterial({ color: '#efe8d6', roughness: 0.85, transparent: true, opacity: 0.55, depthWrite: false });
        sail.flatShading = true;
        sail.side = THREE.DoubleSide;
        sail.userData.sail = true;
        inject(sail, uniforms);
        return sail;
      }
      const mat = new THREE.MeshStandardMaterial({ color: col, roughness: Math.min(1, Math.max(0.3, 0.45 * e.rough)), metalness: Math.min(0.5, e.metal) });
      mat.flatShading = true;
      mat.side = THREE.DoubleSide;
      inject(mat, uniforms, e.map ? { map: tmTex(e.map, true), normal: e.normalMap && e.normal > 0 ? tmTex(e.normalMap) : null, tile: e.uv ? e.uv[0] : 1, normalAmt: e.normal,
        weather: thatch } : null, null, thatch ? THATCH_LIFT : 0);
      mat.userData.thatch = thatch;
      // a second material of the same name (the two oak tints) ranks just above the first
      zOrder(mat, zSeen.has(e.name) ? e.name + '*' : e.name);
      zSeen.add(e.name);
      return mat;
    };
    const zSeen = new Set();
    const tmMats = (tm ? tm.materials : []).map(makeTM);
    // the translucent sail lets about half the sun through: its shadow is dithered to half strength
    const depthSail = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, side: THREE.DoubleSide });
    inject(depthSail, uniforms);
    const sailBase = depthSail.onBeforeCompile;
    depthSail.onBeforeCompile = (shader, r) => {
      sailBase(shader, r);
      // a coarse weave fixed to the fabric, so the half shadow moves with the sail instead of boiling as the sun moves
      shader.fragmentShader = shader.fragmentShader.replace('#include <alphamap_fragment>', 'if (hash2(floor(vRest.xz * 8.0)) > 0.5) discard;\n#include <alphamap_fragment>');
    };
    depthSail.customProgramCacheKey = () => 'lifecycle-sail';
    // the thatch casts its shadow from the same lifted surface, so the framing tips can't speckle it
    const depthThatch = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, side: THREE.DoubleSide });
    inject(depthThatch, uniforms, null, null, THATCH_LIFT);
    // Twinmotion's river: deep green-grey and glossy instead of Rhino's diagram turquoise
    if (tm) materials.forEach((mat, i) => { if (isWater(mats[i])) { mat.color.set('#3f5a58'); mat.roughness = 0.12; } });
    // gabion baskets (Twinmotion left them plain white): river stones behind galvanised square mesh, 1 m per tile
    // (tools/gabion_texture.ps1)
    const gabionMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.88, metalness: 0 });
    gabionMat.flatShading = true;
    gabionMat.side = THREE.DoubleSide;
    inject(gabionMat, uniforms, { map: tmTex('tm-mat-gabion.jpg', true), normal: tmTex('tm-mat-gabion-n.jpg'), tile: 1, normalAmt: 1, macro: 0 });
    zOrder(gabionMat, 'gabion');
    const trackMat = tracks.map((t, i) => {
      if (mats[t[2]].name === 'gabion basket') return gabionMat;
      const k = tm ? tm.trackMat[i] : -1;
      return k >= 0 && tmMats[k] && !isWater(mats[t[2]]) && mats[t[2]].name !== 'Glass' ? tmMats[k] : materials[t[2]];
    });

    // ---- geometry chunks ----
    const { lo, scale } = meta.quant;
    const raw = [];   // kept for reading the site when placing vegetation
    for (const ch of meta.chunks) {
      const q = new Int16Array(buf, ch.pos, ch.v * 3);
      const pos = new Float32Array(ch.v * 3);
      for (let i = 0; i < ch.v; i++) {
        pos[i * 3] = lo[0] + (q[i * 3] + 32767) * scale[0];
        pos[i * 3 + 1] = lo[1] + (q[i * 3 + 1] + 32767) * scale[1];
        pos[i * 3 + 2] = lo[2] + (q[i * 3 + 2] + 32767) * scale[2];
      }
      // the river is modelled as a 50 m deep box; keep only a thin slab so its wall doesn't fill the view
      if (isWater(mats[ch.mat])) for (let i = 1; i < pos.length; i += 3) pos[i] = Math.max(pos[i], -0.4);
      const ids = new Float32Array(new Uint16Array(buf, ch.ids, ch.v));
      const idx = new Uint16Array(buf, ch.idx, ch.i);
      raw.push({ pos, ids, idx, water: isWater(mats[ch.mat]) });
      // one draw per material within the chunk: pieces of one Rhino material can carry different Twinmotion ones
      const parts = new Map();
      for (let t = 0; t < idx.length; t += 3) {
        const m = trackMat[ids[idx[t]]];
        let list = parts.get(m);
        if (!list) parts.set(m, (list = []));
        list.push(idx[t], idx[t + 1], idx[t + 2]);
      }
      const posAttr = new THREE.BufferAttribute(pos, 3), idAttr = new THREE.BufferAttribute(ids, 1);
      // shading is flat (from screen-space derivatives), but three's shadow lookup still normalises the vertex
      // normal: without one it turns NaN and the surface silently never receives a shadow
      const whole = new THREE.BufferGeometry();
      whole.setAttribute('position', posAttr);
      whole.setIndex(new THREE.BufferAttribute(idx, 1));
      whole.computeVertexNormals();
      const nrmAttr = whole.getAttribute('normal');
      for (const [mat, list] of parts) {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', posAttr);
        geo.setAttribute('normal', nrmAttr);
        geo.setAttribute('aTrack', idAttr);
        geo.setIndex(new THREE.BufferAttribute(new Uint16Array(list), 1));
        const mesh = new THREE.Mesh(geo, mat);
        mesh.frustumCulled = false;   // vertices move in the shader
        mesh.castShadow = mesh.receiveShadow = mats[ch.mat].name !== 'Glass';
        mesh.customDepthMaterial = mat.userData.thatch ? depthThatch : mat.userData.sail ? depthSail : depthMat;
        if (isWater(mats[ch.mat])) mesh.castShadow = false;
        scene.add(mesh);
      }
    }

    // ---- framing: the pier and the new building, where the life cycle happens ----
    let water = null;
    const xs = [], ys = [], zs = [];
    tracks.forEach((t) => {
      const [b, d, mi, c, size] = t;
      const m = mats[mi];
      if (isWater(m)) { water = c; return; }
      if ((b > 0 || d < 4) && Math.max(size[0], size[2]) < 40) { xs.push(c[0]); ys.push(c[1]); zs.push(c[2]); }
    });
    // robust extent: ignore the outermost 4% of changing objects
    const pct = (a, q) => { const s = [...a].sort((p, r) => p - r); return s[Math.min(s.length - 1, Math.max(0, Math.round(q * (s.length - 1))))]; };
    const box = new THREE.Box3(new THREE.Vector3(pct(xs, 0.04), pct(ys, 0.04), pct(zs, 0.04)), new THREE.Vector3(pct(xs, 0.96), pct(ys, 0.96), pct(zs, 0.96)));
    box.getCenter(focus);
    const sz = box.getSize(new THREE.Vector3());
    radius = Math.max(sz.x, sz.z) * 0.6 + 12;
    if (water) waterDir.set(water[0] - focus.x, 0, water[2] - focus.z).normalize();

    // the Ebro's axis: the long direction of the water surface near the site (principal axis of its vertices)
    let sx = 0, sz2 = 0, sxx = 0, szz = 0, sxz = 0, wn = 0;
    raw.forEach((c) => {
      if (!c.water) return;
      for (let i = 0; i < c.pos.length; i += 3) {
        const x = c.pos[i] - focus.x, z = c.pos[i + 2] - focus.z;
        if (x * x + z * z > (radius * 3) ** 2) continue;
        sx += x; sz2 += z; sxx += x * x; szz += z * z; sxz += x * z; wn++;
      }
    });
    if (wn > 2) {
      const mx = sx / wn, mz = sz2 / wn;
      const cxx = sxx / wn - mx * mx, czz = szz / wn - mz * mz, cxz = sxz / wn - mx * mz;
      const a = 0.5 * Math.atan2(2 * cxz, cxx - czz);
      flowDir.value.set(Math.cos(a), Math.sin(a));
    }
    // downstream runs from left to right in the opening view
    const ang0 = Math.atan2(-waterDir.x, -waterDir.z) + 0.35;
    if (flowDir.value.x * Math.cos(ang0) - flowDir.value.y * Math.sin(ang0) < 0) flowDir.value.negate();

    // ---- annotation anchors (labels from the life-cycle diagram) ----
    const centroid = (pred) => {
      const v = new THREE.Vector3(); let n = 0;
      tracks.forEach((t) => { if (pred(t, mats[t[2]])) { v.add(new THREE.Vector3(t[3][0], t[3][1] + t[4][1] / 2, t[3][2])); n++; } });
      return n ? v.divideScalar(n) : null;
    };
    const rgbIs = (m, r, g, b) => m.rgb[0] === r && m.rgb[1] === g && m.rgb[2] === b;
    const flat = (t) => t[4][0] * t[4][2] > 600 && t[4][1] < 1.5;
    const pier = centroid((t, m) => t[1] === 0 && !flat(t));
    const canopy = centroid((t, m) => t[0] === 0 && rgbIs(m, 205, 203, 171));
    const debris = centroid((t, m) => t[0] === 1 && rgbIs(m, 215, 140, 74));
    const gabion = centroid((t, m) => t[0] === 2 && m.name === 'gabion basket');
    const stilts = centroid((t, m) => t[0] === 3 && m.name === 'stilts');
    const sail = centroid((t, m) => t[0] >= 3 && (m.name === 'solar sail support' || rgbIs(m, 205, 203, 171)));
    const fallen = centroid((t) => !!t[6]);
    const add = (stage, pos, text) => { if (pos) anchors.push({ stage, pos, text }); };
    add(0, pier, 'Concrete pier'); add(0, canopy, 'Club building');
    add(1, pier, 'Demolition'); add(1, canopy, 'Remodeling'); add(1, debris, 'Usable materials');
    add(2, pier, 'Reed cultivation'); add(2, gabion, 'Gabion baskets');
    add(3, stilts, 'Stilts'); add(3, sail, 'Improved solar sail'); add(3, gabion, 'Shore stabilisation');
    add(4, fallen, 'Non-polluting materials'); add(4, stilts, 'Natural hydroresistance'); add(4, gabion, 'Revitalised ecosystem');

    // ---- planting: high-poly willows, poplars, reeds and bulrush, placed from the site itself ----
    try {
      vegInfo = buildVegetation({ scene, uniforms, tracks, mats, chunks: raw, focus, radius, mobile, shadows: true, rand: rng(808), models: treeModels,
        // the construction stage is the reference frame, and its layout is the one kept for every stage
        layout: tm ? tm.trees.filter((t) => t.stage === 3) : null,
        // the courtyard of the new buildings: under the middle of the solar sail (its largest piece)
        courtyard: (() => {
          const sail = tracks.filter((t) => t[0] === 3 && mats[t[2]].rgb.join() === '205,203,171').sort((p, q) => q[4][0] * q[4][2] - p[4][0] * p[4][2])[0];
          return sail ? { x: sail[3][0], z: sail[3][2] } : null;
        })() });
      const setAnchor = (text, pos) => { const a = anchors.find((x) => x.text === text); if (a && pos) a.pos = pos; };
      setAnchor('Reed cultivation', vegInfo.reedCentre);
      setAnchor('Revitalised ecosystem', vegInfo.decayCentre || vegInfo.reedCentre);
    } catch (err) { console.warn('vegetation skipped', err); }

    // ---- what breaks the current at each stage: anything reaching down to the water (pier walls, gabions,
    // stilts, the banks) and the reed beds; a blurred mask per stage for the river shader ----
    {
      const t0 = performance.now();
      const R = 256, half = radius * 1.8, x0 = focus.x - half, z0 = focus.z - half, cell = (2 * half) / R;
      let waterTop = -Infinity;
      raw.forEach((ch) => { if (ch.water) for (let i = 1; i < ch.pos.length; i += 3) waterTop = Math.max(waterTop, ch.pos[i]); });
      const masks = Array.from({ length: 5 }, () => new Float32Array(R * R));
      // only what stands up out of the water counts (the pier, stilts, gabions), not the flat ground and
      // riverbed plates lying at water level
      const wet = tracks.map((t) => mats[t[2]].name === 'gabion basket' || (t[3][1] + t[4][1] / 2 > waterTop + 1.0 && t[4][0] * t[4][2] < 20000));
      const mark = (s0, s1, x, z, v) => {
        const i = Math.floor((x - x0) / cell), j = Math.floor((z - z0) / cell);
        if (i < 0 || j < 0 || i >= R || j >= R) return;
        for (let s = s0; s <= s1; s++) if (masks[s][j * R + i] < v) masks[s][j * R + i] = v;
      };
      for (const ch of raw) {
        if (ch.water) continue;
        const p = ch.pos, ix = ch.idx;
        for (let t = 0; t < ix.length; t += 3) {
          const a = ix[t] * 3, b = ix[t + 1] * 3, c = ix[t + 2] * 3;
          if (Math.min(p[a + 1], p[b + 1], p[c + 1]) > waterTop + 0.6) continue;   // decks and land above the water
          if (!wet[ch.ids[ix[t]]]) continue;
          const tk = tracks[ch.ids[ix[t]]];
          const s0 = tk[0], s1 = Math.min(4, tk[1]);
          // trace the edges (walls have no area in plan) ...
          for (const [u, v] of [[a, b], [b, c], [c, a]]) {
            const n = Math.ceil(Math.hypot(p[v] - p[u], p[v + 2] - p[u + 2]) / (cell * 0.5)) + 1;
            for (let k = 0; k <= n; k++) mark(s0, s1, p[u] + (p[v] - p[u]) * (k / n), p[u + 2] + (p[v + 2] - p[u + 2]) * (k / n), 1);
          }
          // ... and fill the footprint
          const minx = Math.min(p[a], p[b], p[c]), maxx = Math.max(p[a], p[b], p[c]);
          const minz = Math.min(p[a + 2], p[b + 2], p[c + 2]), maxz = Math.max(p[a + 2], p[b + 2], p[c + 2]);
          const d = (p[b + 2] - p[c + 2]) * (p[a] - p[c]) + (p[c] - p[b]) * (p[a + 2] - p[c + 2]);
          if (Math.abs(d) < 1e-6 || (maxx - minx) * (maxz - minz) < cell * cell) continue;
          for (let z = Math.floor((minz - z0) / cell); z <= Math.floor((maxz - z0) / cell); z++) {
            for (let x = Math.floor((minx - x0) / cell); x <= Math.floor((maxx - x0) / cell); x++) {
              const px = x0 + (x + 0.5) * cell, pz = z0 + (z + 0.5) * cell;
              const l1 = ((p[b + 2] - p[c + 2]) * (px - p[c]) + (p[c] - p[b]) * (pz - p[c + 2])) / d;
              const l2 = ((p[c + 2] - p[a + 2]) * (px - p[c]) + (p[a] - p[c]) * (pz - p[c + 2])) / d;
              if (l1 >= 0 && l2 >= 0 && l1 + l2 <= 1) mark(s0, s1, px, pz, 1);
            }
          }
        }
      }
      // reeds slow the water rather than stop it
      for (const [x, z, born] of (vegInfo && vegInfo.reedSpots) || []) {
        for (let s = 0; s <= 4; s++) if (s > born + 0.2) {
          for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) mark(s, s, x + dx * cell, z + dz * cell, 0.35);
        }
      }
      // soften: two box blurs, about a metre each way
      const tmpM = new Float32Array(R * R);
      const blur = (m) => {
        for (let pass = 0; pass < 2; pass++) {
          for (let j = 0; j < R; j++) for (let i = 0; i < R; i++) {
            let s = 0; for (let k = -2; k <= 2; k++) s += m[j * R + Math.min(R - 1, Math.max(0, i + k))]; tmpM[j * R + i] = s / 5;
          }
          for (let j = 0; j < R; j++) for (let i = 0; i < R; i++) {
            let s = 0; for (let k = -2; k <= 2; k++) s += tmpM[Math.min(R - 1, Math.max(0, j + k)) * R + i]; m[j * R + i] = s / 5;
          }
        }
      };
      masks.forEach(blur);
      const pack = (list) => {
        const out = new Uint8Array(R * R * 4);
        for (let k = 0; k < R * R; k++) list.forEach((m, c) => { out[k * 4 + c] = Math.round(Math.min(1, m[k] * 1.4) * 255); });
        const tex = new THREE.DataTexture(out, R, R, THREE.RGBAFormat, THREE.UnsignedByteType);
        tex.minFilter = tex.magFilter = THREE.LinearFilter;
        tex.needsUpdate = true;
        return tex;
      };
      riverU.obstA.value = pack(masks.slice(0, 4));
      riverU.obstB.value = pack([masks[4]]);
      riverU.box.value.set(x0, z0, 2 * half, 2 * half);
      riverDbg = { ms: Math.round(performance.now() - t0), waterTop, cover: masks.map((m) => Math.round(m.reduce((s, v) => s + (v > 0.3 ? 1 : 0), 0) / (R * R) * 100)) };
    }

    scene.fog = new THREE.Fog(bg, radius * 2.2, radius * 5.5);
    placeSun(0);
    sun.target.position.copy(focus);
    // wide enough for the outer trees and lawns (about 90 m each way), still ~4 cm per shadow texel on desktop
    Object.assign(sun.shadow.camera, { left: -radius * 2.2, right: radius * 2.2, top: radius * 2.2, bottom: -radius * 2.2, near: radius * 0.6, far: radius * 5.4 });
    sun.shadow.camera.updateProjectionMatrix();
    state.ready = true;
    resize();
    return { anchors, stages: meta.stages };
  }

  // ---- the sun, as light and shadow only: one day across the five stages. It is set against the opening
  // view rather than the compass (the real path, east-south-west, sits behind this camera and would hide every
  // shadow behind its object). It stays on the viewer's left, moving from a little in front to a little behind,
  // and climbs from about 28° to 42° and back: shadows always fall sideways across the ground, never hidden
  // behind (or under) the thing that casts them ----
  const sunTmp = new THREE.Vector3();
  function sunDir(u, out) {
    const k = u / 4;
    const ang0 = Math.atan2(-waterDir.x, -waterDir.z) + 0.35;              // the camera's opening azimuth
    const az = ang0 + THREE.MathUtils.degToRad(THREE.MathUtils.lerp(295, 235, k));   // 270° = the viewer's left
    const el = THREE.MathUtils.degToRad(28 + 14 * Math.sin(Math.PI * k));
    return out.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
  }
  const SUN_HIGH = new THREE.Color('#fff3e2'), SUN_LOW = new THREE.Color('#ffc58a');
  function placeSun(u) {
    const d = sunDir(u, sunTmp);
    sun.position.copy(d).multiplyScalar(radius * 3).add(focus);
    // warmer and softer when it is low
    const k = THREE.MathUtils.clamp((d.y - 0.35) / 0.5, 0, 1);
    sun.color.copy(SUN_LOW).lerp(SUN_HIGH, k);
    sun.intensity = 3.4 + 0.6 * k;
  }

  function resize() {
    const r = canvas.getBoundingClientRect();
    state.w = Math.max(2, r.width); state.h = Math.max(2, r.height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 1.75));
    renderer.setSize(state.w, state.h, false);
    camera.aspect = state.w / state.h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);

  // drag to turn the model (desktop)
  let lastX = 0;
  canvas.addEventListener('pointerdown', (e) => { if (e.pointerType === 'mouse') { state.drag = true; lastX = e.clientX; } });
  window.addEventListener('pointermove', (e) => { if (state.drag) { state.azT += (e.clientX - lastX) * 0.005; lastX = e.clientX; } });
  window.addEventListener('pointerup', () => { state.drag = false; });

  const tmp = new THREE.Vector3();
  const clock = new THREE.Clock();
  const listeners = [];
  function tick() {
    requestAnimationFrame(tick);
    if (!state.active || !state.ready) return;
    const dt = Math.min(clock.getDelta(), 0.05);
    state.u += (state.uT - state.u) * Math.min(1, dt * 7);
    state.az += (state.azT - state.az) * Math.min(1, dt * 4);
    uniforms.uTime.value = state.u;
    uniforms.uClock.value = clock.elapsedTime;
    uniforms.uFlood.value = floodLevel(state.u);
    uniforms.uFlowT.value += dt * 2.0 * (1 + (FLOOD.speed - 1) * uniforms.uFlood.value / FLOOD.peak);
    placeSun(state.u);

    // camera from the river side, looking back at the site; a slow sway plus the visitor's drag
    // the river box's centre lies inland of the pier, so look from the opposite side to have water in front
    const ang = Math.atan2(-waterDir.x, -waterDir.z) + 0.35 + Math.sin(clock.elapsedTime * 0.12) * 0.06 + state.az - state.u * 0.06;
    const dist = radius * (camera.aspect < 1 ? 3.4 : 2.6) * state.zoom;
    // haze starts just short of the site whatever the framing (portrait screens sit farther back)
    if (scene.fog) { scene.fog.near = dist * 0.9; scene.fog.far = dist * 2.3; }
    camera.position.set(focus.x + Math.sin(ang) * dist, focus.y + dist * 0.85, focus.z + Math.cos(ang) * dist);
    camera.lookAt(focus.x, focus.y - radius * 0.05, focus.z);
    renderer.render(scene, camera);

    // project anchors for the HTML labels
    for (const a of anchors) {
      tmp.copy(a.pos).project(camera);
      a.x = (tmp.x * 0.5 + 0.5) * state.w;
      a.y = (-tmp.y * 0.5 + 0.5) * state.h;
      a.behind = tmp.z > 1;
    }
    listeners.forEach((fn) => fn(state.u, anchors));
  }
  tick();

  return {
    ready,
    debug: () => ({ river: riverDbg, flow: flowDirDbg && flowDirDbg.value.toArray(), sun: sun.position.toArray(), focus: focus.toArray(), radius, waterDir: waterDir.toArray(), cam: camera.position.toArray(), u: state.u, active: state.active, veg: vegInfo && vegInfo.counts, calls: renderer.info.render.calls, tris: renderer.info.render.triangles }),
    setTimeDirect(u) { state.uT = u; state.u = u; },
    setZoom(z) { state.zoom = z; },
    setTime(u) { state.uT = u; },
    setActive(v) { if (v && !state.active) clock.getDelta(); state.active = v; },
    onFrame(fn) { listeners.push(fn); },
    resize,
  };
}
