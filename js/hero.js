// Hero: the actual "Form design cube" (8 interlocking modules exported from the Rhino file)
// rendered like the printed portfolio cover — halftone concrete, decals, red plinth, carbon weave.
// Modules assemble in their designed sequence and disassemble along the designed exploded stack.
import * as THREE from 'three';

const BG = new THREE.Color('#0e0e0e');
const TARGET = 3.9;          // world size of the assembled cube
const STACK_GAIN = 1.25;     // exaggeration of the designed vertical explode offsets
const SPREAD = 0.55;         // extra radial push so every module reads from the iso view
// menu layout, as shares of the view height: the band the pieces spread over, and the column offset
const MENU_BAND = [0.2, 0.16];   // clear of the top / bottom edge
const MENU_COL = 0.12;

/* ---------------- procedural textures ---------------- */
function canvasTex(w, h, draw, srgb = true) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function concreteTexture() {
  return canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#cfcbc3';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 70; i++) {
      const x = Math.random() * w, y = Math.random() * h, r = 20 + Math.random() * 90;
      const grd = g.createRadialGradient(x, y, 0, x, y, r);
      const a = Math.random() * 0.09;
      const dark = Math.random() < 0.7;
      grd.addColorStop(0, dark ? `rgba(85,80,72,${a})` : `rgba(255,252,245,${a})`);
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grd;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    for (let i = 0; i < 9000; i++) {
      const v = Math.random() < 0.55 ? 70 + Math.random() * 70 : 225 + Math.random() * 30;
      g.fillStyle = `rgba(${v},${v - 4},${v - 10},${0.15 + Math.random() * 0.5})`;
      const s = Math.random() < 0.93 ? 1 : 2 + Math.random() * 2;
      g.fillRect(Math.random() * w, Math.random() * h, s, s);
    }
    // a few hairline cracks
    g.strokeStyle = 'rgba(70,66,60,0.25)';
    for (let i = 0; i < 6; i++) {
      g.beginPath();
      let x = Math.random() * w, y = Math.random() * h;
      g.moveTo(x, y);
      for (let k = 0; k < 8; k++) { x += (Math.random() - 0.5) * 40; y += (Math.random() - 0.5) * 40; g.lineTo(x, y); }
      g.stroke();
    }
  });
}

// cover-style stickers and stencils
const DECALS = {
  barcode: (g, w, h) => {
    g.fillStyle = '#f3f1ea'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#111'; g.lineWidth = 6; g.strokeRect(10, 10, w - 20, h - 20);
    let x = 34;
    while (x < w * 0.62) { const bw = 2 + Math.random() * 7; g.fillStyle = '#111'; g.fillRect(x, 40, bw, h - 110); x += bw + 2 + Math.random() * 6; }
    g.fillStyle = '#111';
    g.font = 'bold 26px monospace';
    g.fillText('41.4377 N', 34, h - 36);
    for (let i = 0; i < 7; i++) g.fillRect(w * 0.68, 46 + i * 26, w * 0.24 * (0.4 + Math.random() * 0.6), 9);
    g.fillStyle = '#d3161c'; g.fillRect(w * 0.68, h - 70, w * 0.24, 22);
  },
  tag: (g, w, h) => {
    g.fillStyle = '#e9c22b'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#3a3000'; g.lineWidth = 4; g.strokeRect(14, 14, w - 28, h - 28);
    g.beginPath(); g.arc(w / 2, h * 0.62, w * 0.18, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.moveTo(w / 2, h * 0.38); g.lineTo(w / 2, h * 0.86); g.moveTo(w * 0.26, h * 0.62); g.lineTo(w * 0.74, h * 0.62); g.stroke();
    g.fillStyle = '#3a3000'; g.beginPath(); g.arc(w / 2, h * 0.16, 12, 0, Math.PI * 2); g.fill();
    g.font = 'bold 22px monospace'; g.fillText('MOD-08', 26, h * 0.3);
  },
  hatch: (g, w, h) => {
    g.fillStyle = '#f3f1ea'; g.fillRect(0, 0, w, h);
    g.save(); g.beginPath(); g.rect(16, 16, w - 32, h - 32); g.clip();
    g.strokeStyle = '#d3161c'; g.lineWidth = 14;
    for (let i = -h; i < w + h; i += 30) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + h, h); g.stroke(); }
    g.restore();
  },
  label: (g, w, h) => {
    g.fillStyle = '#2b2a2c'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#e8e4dc'; g.font = 'bold 54px monospace'; g.fillText('INTAKE', 26, h * 0.62);
    g.fillStyle = '#d3161c'; g.fillRect(w - 70, 18, 46, h - 36);
  },
  warn: (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = '#d3161c'; g.beginPath(); g.arc(w / 2, h / 2, w * 0.46, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#f3f1ea'; g.lineWidth = 10; g.beginPath(); g.arc(w / 2, h / 2, w * 0.3, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.moveTo(w * 0.3, h * 0.3); g.lineTo(w * 0.7, h * 0.7); g.stroke();
  },
  capsule: (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.strokeStyle = '#d3161c'; g.lineWidth = 14;
    const r = h * 0.36;
    g.beginPath(); g.moveTo(r + 14, h / 2 - r); g.lineTo(w - r - 14, h / 2 - r); g.arc(w - r - 14, h / 2, r, -Math.PI / 2, Math.PI / 2); g.lineTo(r + 14, h / 2 + r); g.arc(r + 14, h / 2, r, Math.PI / 2, -Math.PI / 2); g.stroke();
    g.fillStyle = '#d3161c'; g.fillRect(w * 0.3, h / 2 - 6, w * 0.4, 12);
  },
  vtext: (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.strokeStyle = '#f3f1ea'; g.lineWidth = 6; g.strokeRect(8, 8, w - 16, h - 16);
    g.save(); g.translate(w / 2, h / 2); g.rotate(-Math.PI / 2);
    g.fillStyle = '#f3f1ea'; g.font = 'bold 64px monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('HD21', 0, 4); g.restore();
  },
};
const DECAL_ASPECT = { barcode: 1.5, tag: 0.62, hatch: 1, label: 2.6, warn: 1, capsule: 3.2, vtext: 0.42 };

/* ---------------- geometry helpers ---------------- */
// box-projected UVs (faces are unwelded so each vertex carries its face normal)
function boxUV(pos, nor, scale) {
  const uv = new Float32Array((pos.length / 3) * 2);
  for (let i = 0, j = 0; i < pos.length; i += 3, j += 2) {
    const ax = Math.abs(nor[i]), ay = Math.abs(nor[i + 1]), az = Math.abs(nor[i + 2]);
    let u, v;
    if (ax >= ay && ax >= az) { u = pos[i + 2]; v = pos[i + 1]; }
    else if (ay >= az) { u = pos[i]; v = pos[i + 2]; }
    else { u = pos[i]; v = pos[i + 1]; }
    uv[j] = u * scale; uv[j + 1] = v * scale;
  }
  return uv;
}

// Find the largest outward-facing plane of a module on each outward axis and a corner of it
// that is solid (the coves cut a quarter circle out of one corner of every outer face).
function decalSpots(pos, nor, idx, outSign) {
  const spots = [];
  for (let ax = 0; ax < 3; ax++) {
    const sgn = outSign[ax];
    const u = (ax + 1) % 3, v = (ax + 2) % 3;
    const planes = new Map();
    for (let t = 0; t < idx.length; t += 3) {
      const a = idx[t], b = idx[t + 1], c = idx[t + 2];
      if (nor[a * 3 + ax] * sgn < 0.98) continue;
      const key = Math.round(pos[a * 3 + ax] * 500);
      let p = planes.get(key);
      if (!p) { p = { coord: pos[a * 3 + ax], area: 0, tris: [], min: [1e9, 1e9], max: [-1e9, -1e9] }; planes.set(key, p); }
      const A = [pos[a * 3 + u], pos[a * 3 + v]], B = [pos[b * 3 + u], pos[b * 3 + v]], C = [pos[c * 3 + u], pos[c * 3 + v]];
      p.area += Math.abs((B[0] - A[0]) * (C[1] - A[1]) - (C[0] - A[0]) * (B[1] - A[1])) / 2;
      p.tris.push([A, B, C]);
      for (const P of [A, B, C]) { p.min[0] = Math.min(p.min[0], P[0]); p.min[1] = Math.min(p.min[1], P[1]); p.max[0] = Math.max(p.max[0], P[0]); p.max[1] = Math.max(p.max[1], P[1]); }
    }
    let best = null;
    for (const p of planes.values()) if (!best || p.area > best.area) best = p;
    if (!best) continue;
    const inside = (x, y) => best.tris.some(([A, B, C]) => {
      const d1 = (x - B[0]) * (A[1] - B[1]) - (A[0] - B[0]) * (y - B[1]);
      const d2 = (x - C[0]) * (B[1] - C[1]) - (B[0] - C[0]) * (y - C[1]);
      const d3 = (x - A[0]) * (C[1] - A[1]) - (C[0] - A[0]) * (y - A[1]);
      return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
    });
    const F = Math.min(best.max[0] - best.min[0], best.max[1] - best.min[1]);
    const box = F * 0.36, inset = F * 0.07;
    const corners = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
    for (const [su, sv] of corners) {
      const cu = (su > 0 ? best.max[0] : best.min[0]) - su * (inset + box / 2);
      const cv = (sv > 0 ? best.max[1] : best.min[1]) - sv * (inset + box / 2);
      let ok = true;
      for (let i = -1; i <= 1 && ok; i++) for (let j = -1; j <= 1 && ok; j++) ok = inside(cu + i * box * 0.5, cv + j * box * 0.5);
      if (!ok) continue;
      const centre = [0, 0, 0];
      centre[ax] = best.coord; centre[u] = cu; centre[v] = cv;
      const normal = [0, 0, 0]; normal[ax] = sgn;
      spots.push({ centre, normal, box, area: best.area });
      break;
    }
  }
  return spots;
}

export function createHero(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  renderer.setClearColor(BG, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
  // true isometric, seen from the front-right like the cover
  camera.position.set(10, 10, 10);
  camera.lookAt(0, 0, 0);

  scene.add(new THREE.HemisphereLight('#ffffff', '#4a4440', 1.35));
  const key = new THREE.DirectionalLight('#fff6ea', 2.3);
  key.position.set(-4, 12, 7);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -7, right: 7, top: 7, bottom: -7, near: 1, far: 40 });
  key.shadow.bias = -0.0008;
  key.shadow.normalBias = 0.02;
  scene.add(key);
  const fill = new THREE.DirectionalLight('#dfe6ff', 0.55);
  fill.position.set(9, 3, -2);
  scene.add(fill);
  const rim = new THREE.DirectionalLight('#ff5a3a', 0.5);
  rim.position.set(-8, 1, -6);
  scene.add(rim);

  const world = new THREE.Group();   // pointer / drag rotation
  const rig = new THREE.Group();     // slow spin + scroll spin
  world.add(rig);
  scene.add(world);

  const concrete = concreteTexture();
  concrete.wrapS = concrete.wrapT = THREE.RepeatWrapping;
  const mat = new THREE.MeshStandardMaterial({ map: concrete, color: '#eeebe4', roughness: 0.93, metalness: 0 });

  // ---- red plinth: thick slab + L-shaped extension toward the front-left (as on the cover) ----
  const red = new THREE.MeshStandardMaterial({ color: '#c3141a', roughness: 0.72 });
  const plinth = new THREE.Group();
  const T = TARGET;
  const slab = new THREE.Mesh(new THREE.BoxGeometry(T * 1.06, T * 0.14, T * 1.06), red);
  slab.position.y = -T * 0.5 - T * 0.07 - 0.01;
  const ext = new THREE.Mesh(new THREE.BoxGeometry(T * 0.5, T * 0.14, T * 0.62), red);
  ext.position.set(-T * 0.53 - T * 0.25 + 0.001, slab.position.y, T * 0.22);
  const step = new THREE.Mesh(new THREE.BoxGeometry(T * 0.5, T * 0.07, T * 0.3), red);
  step.position.set(ext.position.x, slab.position.y - T * 0.035, T * 0.53 + 0.15);
  [slab, ext, step].forEach((m) => { m.castShadow = m.receiveShadow = true; plinth.add(m); });
  const SLAB_TOP = slab.position.y + T * 0.07;   // top face, in plinth space
  rig.add(plinth);

  // ---- technical overlays ----
  const frame = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(T * 1.5, T * 1.5, T * 1.5)),
    new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.1 })
  );
  rig.add(frame);
  const scan = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(T * 1.3, 0.001, T * 1.3)),
    new THREE.LineBasicMaterial({ color: '#ff2a2a', transparent: true, opacity: 0.8 })
  );
  rig.add(scan);

  const dustGeo = new THREE.BufferGeometry();
  const dustN = 500;
  const dp = new Float32Array(dustN * 3);
  for (let i = 0; i < dustN; i++) {
    const r = 4 + Math.random() * 9, t = Math.random() * Math.PI * 2, u = Math.random() * 2 - 1;
    dp[i * 3] = r * Math.sqrt(1 - u * u) * Math.cos(t);
    dp[i * 3 + 1] = r * u;
    dp[i * 3 + 2] = r * Math.sqrt(1 - u * u) * Math.sin(t);
  }
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dp, 3));
  const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({ color: '#cfcac0', size: 1.5, sizeAttenuation: false, transparent: true, opacity: 0.4 }));
  scene.add(dust);

  /* ---------------- modules from the Rhino export ---------------- */
  const modules = [];
  const meshes = [];
  let ready = false;
  // the disassembled pieces double as the project menu: picking, focus and screen anchors
  const menu = { on: 0, onT: 0, slots: null, forced: -1, onFrame: null, onSelect: null, shown: false };
  // turned so the circular face (four coves meeting) faces right, as on the cover
  const model = new THREE.Group();
  model.rotation.y = Math.PI / 2;
  rig.add(model);

  fetch('assets/cube.json').then((r) => r.json()).then((data) => {
    const s = TARGET / Math.max(...data.size);
    // seeded so the sticker composition is identical on every visit
    let seed = 808;
    const rnd = () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const decalKinds = ['barcode', 'tag', 'hatch', 'label', 'warn', 'capsule', 'vtext', 'hatch', 'barcode'];
    // centre the designed stack so modules separate both up and down
    const meanLift = data.modules.reduce((a, m) => a + m.explodeY, 0) / data.modules.length;
    let dk = 0;
    data.modules.forEach((m) => {
      const pos = new Float32Array(m.pos.length);
      const c = m.center;
      for (let i = 0; i < m.pos.length; i += 3) {
        pos[i] = (m.pos[i] - c[0]) * s;
        pos[i + 1] = (m.pos[i + 1] - c[1]) * s;
        pos[i + 2] = (m.pos[i + 2] - c[2]) * s;
      }
      const nor = new Float32Array(m.nor);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
      geo.setAttribute('uv', new THREE.BufferAttribute(boxUV(pos, nor, 0.42), 2));
      geo.setIndex(m.idx);
      geo.computeBoundingSphere();
      geo.computeBoundingBox();

      // own material per module, so the menu can dim the pieces that are not picked
      const mesh = new THREE.Mesh(geo, mat.clone());
      mesh.castShadow = mesh.receiveShadow = true;
      const home = new THREE.Vector3(c[0] * s, c[1] * s, c[2] * s);
      mesh.position.copy(home);
      model.add(mesh);

      // stickers on the solid corner of outward faces (skipping the coves)
      const outSign = [Math.sign(home.x) || 1, Math.sign(home.y) || 1, Math.sign(home.z) || 1];
      decalSpots(pos, nor, m.idx, outSign).forEach((spot, si) => {
        if (si > 0 && rnd() < 0.5) return;
        const kind = decalKinds[dk++ % decalKinds.length];
        const aspect = DECAL_ASPECT[kind];
        const tex = canvasTex(256 * Math.min(aspect, 2), 256 / Math.max(1, aspect / 2), DECALS[kind]);
        let w = spot.box, h = w / aspect;
        if (h > spot.box) { h = spot.box; w = h * aspect; }
        const dmat = new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -4, alphaTest: 0.05 });
        const plane = new THREE.Mesh(new THREE.PlaneGeometry(w, h), dmat);
        const n = new THREE.Vector3(...spot.normal);
        plane.position.set(...spot.centre).addScaledVector(n, 0.003);
        plane.lookAt(plane.position.clone().add(n));
        if (Math.abs(n.y) > 0.9) plane.rotateZ(Math.round(rnd() * 3) * Math.PI / 2);
        plane.receiveShadow = true;
        mesh.add(plane);
      });

      const radial = home.clone().setY(0);
      if (radial.lengthSq() < 1e-6) radial.set(1, 0, 0);
      radial.normalize();
      const mod = {
        mesh, home,
        order: m.order,
        lift: (m.explodeY - meanLift) * s * STACK_GAIN,
        radial,
        axis: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize(),
        spin: (Math.random() - 0.5) * 1.2,
        hover: 0, hoverT: 0,
        flip: 0,
        dim: 0,
        tint: [mesh.material, ...mesh.children.map((d) => d.material)].map((m) => ({ m, base: m.color.clone() })),
        introAxis: new THREE.Vector3(Math.random() - 0.5, 1, Math.random() - 0.5).normalize(),
      };
      mesh.userData.mod = mod;
      modules.push(mod);
      meshes.push(mesh);
    });
    // menu slots run down the exploded stack, top piece first
    menu.slots = modules.slice().sort((a, b) => b.lift - a.lift);
    menu.slots.forEach((mod, i) => { mod.slot = i; });
    ready = true;
  }).catch((err) => console.warn('cube.json failed to load', err));

  /* ---------------- halftone post-process ---------------- */
  const rt = new THREE.WebGLRenderTarget(2, 2, { samples: 4, type: THREE.HalfFloatType });
  const post = new THREE.ShaderMaterial({
    uniforms: {
      tDiffuse: { value: rt.texture },
      uDot: { value: 4.0 },
      uTime: { value: 0 },
      uFade: { value: 1 },
    },
    vertexShader: /* glsl */`
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
    `,
    fragmentShader: /* glsl */`
      uniform sampler2D tDiffuse; uniform float uDot; uniform float uTime; uniform float uFade;
      varying vec2 vUv;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
      void main() {
        vec4 c = texture2D(tDiffuse, vUv);
        c.rgb = pow(max(c.rgb, 0.0), vec3(1.0 / 2.2));
        vec2 p = gl_FragCoord.xy;
        float a = c.a;
        // carbon-fibre weave background, as on the cover
        vec2 cell = floor(p / 4.0);
        vec2 f = fract(p / 4.0);
        float dir = mod(cell.x + cell.y, 2.0);
        float stripe = dir > 0.5 ? f.x : f.y;
        float weave = 0.5 + 0.5 * sin(stripe * 3.14159);
        vec3 bg = vec3(0.045) + weave * 0.03;
        // halftone dot screen on geometry (45deg), dot radius from darkness
        float lum = dot(c.rgb, vec3(0.299, 0.587, 0.114));
        float s = 0.70710678;
        vec2 q = mat2(s, -s, s, s) * p / uDot;
        vec2 g = fract(q) - 0.5;
        float r = sqrt(clamp(1.0 - lum, 0.0, 1.0)) * 0.64 + 0.08;
        float dotm = smoothstep(r + 0.07, r - 0.07, length(g));
        vec3 ink = mix(c.rgb * 1.06, c.rgb * 0.42, dotm * 0.85);
        vec3 col = mix(bg, ink, a);
        col += (hash(p + uTime) - 0.5) * 0.04;
        vec2 uv = vUv - 0.5;
        col *= 1.0 - dot(uv, uv) * 0.5;
        gl_FragColor = vec4(col * uFade, 1.0);
      }
    `,
    depthTest: false,
    depthWrite: false,
  });
  const quadScene = new THREE.Scene();
  const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  quadScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), post));

  /* ---------------- state + input ---------------- */
  const state = {
    explode: 0, explodeT: 0,
    shift: 0, shiftT: 0, fh: 11,   // vertical follow of the visible window (+1 = up half a screen)
    burst: 0,
    rotX: 0, rotY: 0, rotXT: 0, rotYT: 0,
    spinV: 0, dragY: 0,
    hovered: null,
    running: true,
    fade: 1,
  };
  const pointer = new THREE.Vector2(-9, -9);
  const ray = new THREE.Raycaster();
  let W = 1, H = 1;

  function resize() {
    W = window.innerWidth; H = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
    renderer.setPixelRatio(dpr);
    renderer.setSize(W, H, false);
    rt.setSize(Math.floor(W * dpr), Math.floor(H * dpr));
    post.uniforms.uDot.value = 3.4 * dpr;
    const aspect = W / H;
    const mobile = aspect < 0.9;
    const fh = mobile ? 13 / Math.max(aspect, 0.45) * 0.6 : 11;
    const shiftX = mobile ? 0 : (aspect > 1.4 ? 0.12 : 0.07);
    const shiftY = mobile ? 0.12 : 0.02;
    const fw = fh * aspect;
    state.fh = fh;
    camera.left = -fw / 2 - fw * shiftX;
    camera.right = fw / 2 - fw * shiftX;
    camera.top = fh / 2 - fh * shiftY;
    camera.bottom = -fh / 2 - fh * shiftY;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();

  let dragging = false, downY = 0, lastX = 0, moved = 0;
  const inHero = () => window.scrollY < H * 0.85;
  const menuLive = () => menu.on > 0.5 && !!menu.slots;
  const setPointer = (e) => {
    pointer.x = (e.clientX / W) * 2 - 1;
    pointer.y = -(e.clientY / H) * 2 + 1;
  };
  const pick = () => {
    ray.setFromCamera(pointer, camera);
    const hit = ray.intersectObjects(meshes, false)[0];
    return hit ? hit.object.userData.mod : null;
  };
  window.addEventListener('pointermove', (e) => {
    setPointer(e);
    state.rotYT = pointer.x * 0.32;
    state.rotXT = -pointer.y * 0.12;
    if (dragging) {
      const dx = e.clientX - lastX;
      state.spinV = dx * 0.006;
      state.dragY += dx * 0.006;
      moved += Math.abs(dx) + Math.abs(e.clientY - downY) * 0.1;
      lastX = e.clientX;
    }
  }, { passive: true });
  window.addEventListener('pointerdown', (e) => {
    if (!(inHero() || menuLive()) || e.button !== 0 || e.target.closest('a, button, .hud')) return;
    dragging = true; moved = 0; lastX = e.clientX; downY = e.clientY;
  });
  window.addEventListener('pointerup', (e) => {
    if (dragging && moved < 6) {
      if (menuLive()) {
        // touch has no hover to rely on: pick under the finger
        setPointer(e);
        const mod = ready && pick();
        if (mod && menu.onSelect) menu.onSelect(mod.slot);
      } else if (inHero()) {
        if (state.hovered) flip(state.hovered);
        else if (Math.abs(pointer.x) < 0.9) burst();
      }
    }
    dragging = false;
  });

  function burst() {
    if (!window.gsap) return;
    window.gsap.killTweensOf(state, 'burst');
    window.gsap.timeline()
      .to(state, { burst: 1, duration: 0.35, ease: 'power3.out' })
      .to(state, { burst: 0, duration: 1.6, ease: 'elastic.out(1, 0.45)' });
  }
  // a clicked module pops out of the assembly, spins a full turn about its outward axis and slots back in
  function flip(mod) {
    if (!window.gsap || mod.flipping) return;
    mod.flipping = true;
    window.gsap.timeline({ onComplete: () => { mod.flipping = false; mod.flip = 0; } })
      .to(mod, { flip: 1, duration: 1.3, ease: 'power3.inOut' });
  }

  /* ---------------- loop ---------------- */
  const clock = new THREE.Clock();
  const intro = { v: 0 };
  const q = new THREE.Quaternion();
  const qa = new THREE.Quaternion();
  const UP = new THREE.Vector3(0, 1, 0);
  const _v = new THREE.Vector3();
  const _p = new THREE.Vector3();
  const _qi = new THREE.Quaternion();
  // screen right / up of the iso camera, in scene space
  camera.updateMatrixWorld();
  const CAM_R = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
  const CAM_U = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);

  // a menu place, fixed on screen: even rows down the view, alternating left and right of the
  // stack's axis, carried back into model space through the world, rig and model turns
  function menuPlace(slot) {
    const n = menu.slots.length;
    const span = camera.top - camera.bottom;
    const top = camera.top - span * MENU_BAND[0], bottom = camera.bottom + span * MENU_BAND[1];
    const y = top - (slot + 0.5) / n * (top - bottom);
    const x = (slot % 2 ? 1 : -1) * Math.min(span * MENU_COL, (camera.right - camera.left) * 0.16);
    _qi.copy(world.quaternion).invert();
    return _p.copy(CAM_R).multiplyScalar(x).addScaledVector(CAM_U, y)
      .applyQuaternion(_qi).divideScalar(rig.scale.x)
      .applyAxisAngle(UP, -(rig.rotation.y + model.rotation.y));
  }

  function tick() {
    requestAnimationFrame(tick);
    if (!state.running || W < 2 || H < 2) return;
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;

    state.explode += (state.explodeT - state.explode) * Math.min(1, dt * 6);
    state.rotX += (state.rotXT - state.rotX) * Math.min(1, dt * 3);
    state.rotY += (state.rotYT - state.rotY) * Math.min(1, dt * 3);
    if (!dragging) { state.dragY += state.spinV; state.spinV *= 0.94; }

    world.rotation.x = state.rotX;
    world.rotation.y = state.rotY + state.dragY + Math.sin(t * 0.25) * 0.05;
    rig.rotation.y = state.explode * 0.9 + t * 0.035;
    // follow the centre of the hero's still-visible window as the next section slides over it
    // (rig y is world-up; the iso camera sees it foreshortened by cos(35.26°))
    state.shift += (state.shiftT - state.shift) * Math.min(1, dt * 6);
    rig.position.y = Math.sin(t * 0.8) * 0.05 + state.shift * state.fh * 0.5 / 0.8165;
    // the exploded stack is taller than the cube; shrink so it fits the uncovered slice
    rig.scale.setScalar(1 - state.explode * 0.2 - menu.on * 0.04);

    // hover: pick the module under the pointer (or the one whose menu label is pointed at)
    menu.on += (menu.onT - menu.on) * Math.min(1, dt * 6);
    const live = menuLive();
    let hovered = null;
    if (ready && live) hovered = menu.forced >= 0 ? menu.slots[menu.forced] : pick();
    else if (ready && state.explode < 0.25 && inHero() && intro.v > 0.98) hovered = pick();
    state.hovered = hovered;
    document.body.classList.toggle('cube-hover', !!hovered && !live);
    document.body.classList.toggle('cube-menu-hover', !!hovered && live);

    const e = state.explode;
    for (const mod of modules) {
      mod.hoverT = mod === hovered ? 1 : 0;
      mod.hover += (mod.hoverT - mod.hover) * Math.min(1, dt * 8);
      // in the menu the other pieces sink back into the halftone while one is picked
      const dimT = live && hovered && mod !== hovered ? 1 : 0;
      mod.dim += (dimT - mod.dim) * Math.min(1, dt * 6);
      for (const { m, base } of mod.tint) m.color.copy(base).multiplyScalar(1 - mod.dim * 0.5);

      // intro: modules descend into place in their assembly order
      const ip = Math.min(1, Math.max(0, (intro.v - mod.order * 0.075) / 0.45));
      const ie = 1 - Math.pow(1 - ip, 3);
      const pre = 1 - ie;

      // scroll: designed vertical stack, top of the stack leaves first
      const ep = Math.min(1, Math.max(0, (e - (7 - mod.order) * 0.045) / 0.68));
      const ee = ep * ep * (3 - 2 * ep);

      const out = mod.home.clone().normalize();
      mod.mesh.position.copy(mod.home)
        .addScaledVector(UP, mod.lift * ee + pre * (4 + mod.order * 0.9))
        .addScaledVector(mod.radial, SPREAD * ee + state.burst * 0.9);
      // in the menu every piece glides to its own place in an evenly spaced zigzag
      const mo = menu.on * ee;
      if (mo > 0 && menu.slots) mod.mesh.position.lerp(menuPlace(mod.slot), mo);
      mod.mesh.position
        .addScaledVector(mod.radial, mod.hover * menu.on * 0.25)
        .addScaledVector(out, mod.hover * 0.22 + state.burst * 0.35 + Math.sin(mod.flip * Math.PI) * 0.9);
      mod.mesh.scale.setScalar(1 + mod.hover * menu.on * 0.08);

      const ang = mod.spin * ee + state.burst * mod.spin * 0.4;
      qa.setFromAxisAngle(mod.axis, ang);
      q.setFromAxisAngle(mod.introAxis, pre * 2.2);
      q.multiply(qa);
      if (mod.flip > 0) { qa.setFromAxisAngle(out, mod.flip * Math.PI * 0.5 * 4); q.multiply(qa); }
      mod.mesh.quaternion.copy(q);
    }

    // the plinth drops as the stack opens, and further if a low piece would cut into the slab:
    // keep the slab top under the lowest corner of every module (model only turns about Y)
    let lowest = Infinity;
    if (ready) {
      for (const mod of modules) {
        mod.mesh.updateMatrix();
        const bb = mod.mesh.geometry.boundingBox;
        for (let c = 0; c < 8; c++) {
          _v.set(c & 1 ? bb.max.x : bb.min.x, c & 2 ? bb.max.y : bb.min.y, c & 4 ? bb.max.z : bb.min.z).applyMatrix4(mod.mesh.matrix);
          lowest = Math.min(lowest, _v.y);
        }
      }
    }
    const drop = -e * 2.2 - (1 - Math.min(1, intro.v * 2)) * 2;
    const clear = lowest - SLAB_TOP - 0.08;
    plinth.position.y = drop + Math.min(0, clear - drop) * Math.min(1, e / 0.15);
    plinth.rotation.y = e * 0.5;
    frame.scale.setScalar(1 + e * 0.8);
    frame.rotation.y = -t * 0.05;
    frame.material.opacity = 0.1 * (1 - e * 0.6);
    scan.position.y = Math.sin(t * 0.9) * TARGET * 0.62;
    scan.material.opacity = 0.8 * (1 - e) * intro.v;
    dust.rotation.y = t * 0.02;

    // where each piece sits on screen, for the menu labels
    if (menu.onFrame && menu.slots && (menu.on > 0.005 || menu.shown)) {
      scene.updateMatrixWorld();
      // each time the menu appears, hand out the places so pieces travel as little as possible:
      // top of the stack first, and within each row pair the piece further left takes the left place
      if (!menu.shown) {
        const seen = new Map(menu.slots.map((mod) => {
          // where it sits once fully apart: model and rig turn about Y, the pointer turns the world
          _v.copy(mod.home).addScaledVector(UP, mod.lift).addScaledVector(mod.radial, SPREAD)
            .applyAxisAngle(UP, model.rotation.y + 0.9 + t * 0.035).applyQuaternion(world.quaternion);
          return [mod, { x: _v.dot(CAM_R), y: _v.dot(CAM_U) }];
        }));
        menu.slots.sort((a, b) => seen.get(b).y - seen.get(a).y);
        for (let i = 0; i + 1 < menu.slots.length; i += 2) {
          if (seen.get(menu.slots[i]).x > seen.get(menu.slots[i + 1]).x) menu.slots.splice(i, 2, menu.slots[i + 1], menu.slots[i]);
        }
        menu.slots.forEach((mod, i) => { mod.slot = i; });
      }
      menu.shown = menu.on > 0.005;
      const anchors = menu.slots.map((mod) => {
        mod.mesh.getWorldPosition(_v).project(camera);
        return { x: (_v.x + 1) / 2 * W, y: (1 - _v.y) / 2 * H };
      });
      menu.onFrame(anchors, menu.on, live && hovered ? hovered.slot : -1);
    }

    post.uniforms.uTime.value = t;
    post.uniforms.uFade.value = state.fade;

    renderer.setRenderTarget(rt);
    renderer.setClearColor(BG, 0);
    renderer.clear();
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    renderer.render(quadScene, quadCam);
  }
  tick();

  return {
    intro,
    setExplode(v) { state.explodeT = v; },
    setShift(v) { state.shiftT = v; },
    setFade(v) { state.fade = v; },
    setRunning(v) {
      if (v && !state.running) clock.getDelta();
      state.running = v;
      // a stopped loop can't fade the menu out, so drop it at once
      if (!v && menu.shown && menu.onFrame) { menu.on = 0; menu.shown = false; menu.onFrame([], 0, -1); }
      if (!v) document.body.classList.remove('cube-hover', 'cube-menu-hover');
    },
    burst,
    // menu: { onFrame(anchors, on, hovered), onSelect(slot) }
    setMenu(opts) { Object.assign(menu, opts); },
    setMenuOn(v) { menu.onT = v; },
    focusMenu(slot) { menu.forced = slot; },
  };
}
