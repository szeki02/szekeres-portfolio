// Planting for the life-cycle scene: the species from the Design Studio IV native vegetation list
// (weeping willow, black poplar, common reed, bulrush) as high-poly procedural models: modelled
// limbs, branches and hanging whips, tens of thousands of individual folded leaves per tree, reed
// stems with nodes, blades and filament plumes. Placement is read from the Rhino geometry itself.
import * as THREE from 'three';

/* ------------------------------------------------------------------ */
/* material textures (painted once on canvas)                          */
/* ------------------------------------------------------------------ */
function canvasTex(w, h, draw, srgb = true) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// a single lanceolate leaf blade: pale midrib, fine secondary veins, darker margins (multiplied by vertex colour)
function willowLeafTexture() {
  return canvasTex(64, 256, (g, w, h) => {
    const grd = g.createLinearGradient(0, 0, w, 0);
    grd.addColorStop(0, '#9da38f'); grd.addColorStop(0.5, '#f4f6ea'); grd.addColorStop(1, '#9da38f');
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(255,255,240,0.9)'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(w / 2, 0); g.lineTo(w / 2, h); g.stroke();
    g.strokeStyle = 'rgba(255,255,235,0.45)'; g.lineWidth = 1;
    for (let y = 8; y < h; y += 9) {
      g.beginPath(); g.moveTo(w / 2, y); g.lineTo(2, y + 14); g.stroke();
      g.beginPath(); g.moveTo(w / 2, y); g.lineTo(w - 2, y + 14); g.stroke();
    }
  });
}

// deltoid poplar leaf: glossy upper side with a branching vein network
function poplarLeafTexture() {
  return canvasTex(256, 256, (g, w, h) => {
    const grd = g.createRadialGradient(w / 2, h * 0.55, 10, w / 2, h * 0.55, w * 0.7);
    grd.addColorStop(0, '#f2f4e8'); grd.addColorStop(1, '#a8ae98');
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(255,255,236,0.85)'; g.lineWidth = 4;
    g.beginPath(); g.moveTo(w / 2, h); g.lineTo(w / 2, 0); g.stroke();
    g.lineWidth = 2;
    for (let i = 0; i < 7; i++) {
      const y = h * (0.85 - i * 0.11);
      for (const s of [-1, 1]) {
        g.beginPath(); g.moveTo(w / 2, y); g.quadraticCurveTo(w / 2 + s * w * 0.2, y - 18, w / 2 + s * w * (0.42 - i * 0.04), y - 40); g.stroke();
      }
    }
  });
}

// grass-like blade with parallel veins (reed and bulrush leaves)
function bladeTexture() {
  return canvasTex(32, 256, (g, w, h) => {
    g.fillStyle = '#e6e9d9'; g.fillRect(0, 0, w, h);
    for (let x = 2; x < w; x += 3) {
      g.strokeStyle = x === 15 || x === 17 ? 'rgba(255,255,245,0.9)' : `rgba(150,158,130,${0.25 + Math.random() * 0.3})`;
      g.lineWidth = 1;
      g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke();
    }
  });
}

function barkTexture(r) {
  return canvasTex(256, 512, (g, w, h) => {
    g.fillStyle = '#6a5f55'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 420; i++) {
      const x = r() * w, y = r() * h, len = 30 + r() * 140;
      g.strokeStyle = r() < 0.6 ? `rgba(28,22,18,${0.3 + r() * 0.45})` : `rgba(160,148,130,${0.12 + r() * 0.25})`;
      g.lineWidth = 1 + r() * 3.5;
      g.beginPath(); g.moveTo(x, y);
      g.bezierCurveTo(x + (r() - 0.5) * 14, y + len * 0.3, x + (r() - 0.5) * 14, y + len * 0.6, x + (r() - 0.5) * 8, y + len);
      g.stroke();
    }
  });
}

/* ------------------------------------------------------------------ */
/* geometry builder                                                    */
/* ------------------------------------------------------------------ */
class Builder {
  constructor() { this.p = []; this.n = []; this.uv = []; this.c = []; this.sw = []; this.idx = []; }
  vert(p, n, u, v, col, sway) {
    this.p.push(p.x, p.y, p.z); this.n.push(n.x, n.y, n.z);
    this.uv.push(u, v); this.c.push(col.r, col.g, col.b); this.sw.push(sway);
    return this.p.length / 3 - 1;
  }
  tri(a, b, c) { this.idx.push(a, b, c); }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setAttribute('aSway', new THREE.Float32BufferAttribute(this.sw, 1));
    g.setIndex(this.idx);
    return g;
  }
  get tris() { return this.idx.length / 3; }
}
const WHITE = new THREE.Color(1, 1, 1);
const UP = new THREE.Vector3(0, 1, 0);
const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3();

// tapered tube along a curve; colour may vary along it (reed nodes)
function tube(B, curve, segs, r0, r1, radial, sway0, sway1, colorAt = () => WHITE, vScale = 3) {
  const frames = curve.computeFrenetFrames(segs, false);
  const rings = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const c = curve.getPointAt(t);
    const rad = r0 + (r1 - r0) * Math.pow(t, 0.85);
    const col = colorAt(t);
    const ring = [];
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      const n = new THREE.Vector3().addScaledVector(frames.normals[i], Math.cos(a)).addScaledVector(frames.binormals[i], Math.sin(a));
      ring.push(B.vert(c.clone().addScaledVector(n, rad), n, j / radial, t * vScale, col, sway0 + (sway1 - sway0) * t));
    }
    rings.push(ring);
  }
  for (let i = 0; i < segs; i++) for (let j = 0; j < radial; j++) {
    const a = rings[i][j], b = rings[i + 1][j], c = rings[i + 1][j + 1], d = rings[i][j + 1];
    B.tri(a, b, c); B.tri(a, c, d);
  }
}

// one leaf: base -> two folded cross rows -> tip (8 triangles), shaped by a width profile
function leaf(B, base, axis, side, len, wid, rows, col, sway, soft) {
  const nrm = new THREE.Vector3().crossVectors(side, axis).normalize();
  if (soft) nrm.lerp(soft, 0.45).normalize();
  const fold = nrm.clone().multiplyScalar(wid * 0.18);
  const tip = base.clone().addScaledVector(axis, len);
  const ib = B.vert(base, nrm, 0.5, 0, col, sway);
  const ring = rows.map(([s, wf]) => {
    const c = base.clone().addScaledVector(axis, len * s);
    const hw = wid * wf * 0.5;
    return [
      B.vert(c.clone().addScaledVector(side, -hw), nrm, 0, s, col, sway),
      B.vert(c.clone().add(fold), nrm, 0.5, s, col, sway),
      B.vert(c.clone().addScaledVector(side, hw), nrm, 1, s, col, sway),
    ];
  });
  const it = B.vert(tip, nrm, 0.5, 1, col, sway);
  const [r1, r2] = ring;
  B.tri(ib, r1[1], r1[0]); B.tri(ib, r1[2], r1[1]);
  if (!r2) { B.tri(r1[0], r1[1], it); B.tri(r1[1], r1[2], it); return; }
  B.tri(r1[0], r1[1], r2[1]); B.tri(r1[0], r2[1], r2[0]);
  B.tri(r1[1], r1[2], r2[2]); B.tri(r1[1], r2[2], r2[1]);
  B.tri(r2[0], r2[1], it); B.tri(r2[1], r2[2], it);
}
const WILLOW_ROWS = [[0.3, 0.95], [0.66, 0.7]];
const WILLOW_ROWS_LITE = [[0.42, 0.9]];   // 4 triangles instead of 8, for trees seen from afar
const POPLAR_ROWS = [[0.22, 1.0], [0.58, 0.68]];

// a strip blade along a param curve
function blade(B, fn, segs, w0, colA, colB, swayAt) {
  let prev = null;
  for (let i = 0; i <= segs; i++) {
    const s = i / segs;
    const { p, side } = fn(s);
    const w = w0 * Math.pow(1 - s, 0.65) + 0.0015;
    const col = colA.clone().lerp(colB, s * s);
    const n = new THREE.Vector3().crossVectors(side, UP);
    if (n.lengthSq() < 1e-4) n.set(0, 0, 1);
    n.normalize().lerp(UP, 0.3).normalize();
    const sway = swayAt(p);
    const a = B.vert(p.clone().addScaledVector(side, -w / 2), n, 0, s, col, sway);
    const b = B.vert(p.clone().addScaledVector(side, w / 2), n, 1, s, col, sway);
    if (prev) { B.tri(prev[0], prev[1], b); B.tri(prev[0], b, a); }
    prev = [a, b];
  }
}

/* ------------------------------------------------------------------ */
/* species                                                             */
/* ------------------------------------------------------------------ */
function willow(r, detail) {
  const bark = new Builder(), leaves = new Builder();
  const lean = new THREE.Vector3((r() - 0.5) * 0.9, 0, (r() - 0.5) * 0.9);
  const top = new THREE.Vector3(lean.x, 3.2, lean.z);
  tube(bark, new THREE.CatmullRomCurve3([new THREE.Vector3(0, -0.4, 0), new THREE.Vector3(lean.x * 0.25, 1.4, lean.z * 0.25), top]), 10, 0.55, 0.34, 14, 0, 0.01);
  // root flare
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + r();
    const d = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    tube(bark, new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0.6, 0).addScaledVector(d, 0.2), new THREE.Vector3(0, 0.15, 0).addScaledVector(d, 0.75), new THREE.Vector3(0, -0.25, 0).addScaledVector(d, 1.3)]), 5, 0.22, 0.05, 7, 0, 0);
  }
  const crown = new THREE.Vector3(lean.x, 6.0, lean.z);
  const whipStarts = [];
  const limbs = 6 + Math.floor(r() * 2);
  for (let i = 0; i < limbs; i++) {
    const a = (i / limbs) * Math.PI * 2 + r() * 0.5;
    const dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    const reach = 4.2 + r() * 2.0;
    const start = top.clone().add(new THREE.Vector3(0, -r() * 0.6, 0));
    const limb = new THREE.CatmullRomCurve3([
      start,
      start.clone().addScaledVector(dir, reach * 0.3).add(new THREE.Vector3(0, 1.9, 0)),
      start.clone().addScaledVector(dir, reach * 0.72).add(new THREE.Vector3(0, 3.5, 0)),
      start.clone().addScaledVector(dir, reach).add(new THREE.Vector3(0, 3.3 + r() * 0.8, 0)),
    ]);
    tube(bark, limb, 12, 0.27, 0.06, 10, 0.01, 0.12);
    // secondary branches off each limb
    for (let b = 0; b < 6; b++) {
      const t = 0.3 + 0.68 * (b / 5) + (r() - 0.5) * 0.06;
      const s0 = limb.getPointAt(Math.min(1, t));
      const tan = limb.getTangentAt(Math.min(1, t));
      const out = new THREE.Vector3().crossVectors(tan, UP).normalize().multiplyScalar(r() < 0.5 ? 1 : -1).lerp(dir, 0.5).normalize();
      const L = 1.4 + r() * 1.9;
      const br = new THREE.CatmullRomCurve3([s0, s0.clone().addScaledVector(out, L * 0.5).add(new THREE.Vector3(0, L * 0.45, 0)), s0.clone().addScaledVector(out, L).add(new THREE.Vector3(0, L * 0.35, 0))]);
      tube(bark, br, 6, 0.07, 0.02, 6, 0.1, 0.25);
      for (let w = 0; w < 7; w++) whipStarts.push({ p: br.getPointAt(0.25 + 0.75 * r()), sway: 0.22 });
    }
    for (let w = 0; w < 5; w++) whipStarts.push({ p: limb.getPointAt(0.6 + 0.4 * r()), sway: 0.15 });
  }
  // pendulous whips with individual leaves
  const leafCount = { n: 0 };
  const spacing = 0.05 / detail;
  for (const ws of whipStarts) {
    const o = ws.p;
    const out = o.clone().sub(crown).setY(0);
    if (out.lengthSq() < 1e-4) out.set(1, 0, 0);
    out.normalize();
    const L = Math.min(o.y - 0.55, 3.0 + r() * 3.6);
    if (L < 0.6) continue;
    const curve = new THREE.CatmullRomCurve3([
      o,
      o.clone().addScaledVector(out, 0.32).add(new THREE.Vector3(0, 0.18, 0)),
      o.clone().addScaledVector(out, 0.62).add(new THREE.Vector3(0, -L * 0.35, 0)),
      o.clone().addScaledVector(out, 0.72 + r() * 0.2).add(new THREE.Vector3(0, -L, 0)),
    ]);
    const len = curve.getLength();
    tube(bark, curve, 7, 0.013, 0.004, 3, ws.sway, 1.0);
    const soft = new THREE.Vector3();
    for (let d = 0.12; d < len; d += spacing * (0.7 + r() * 0.6)) {
      const t = d / len;
      const p = curve.getPointAt(t);
      const tan = curve.getTangentAt(t);
      // leaves hang along the whip, splayed out to both sides and slightly rolled
      const roll = r() * Math.PI * 2;
      const side = new THREE.Vector3(Math.cos(roll), 0, Math.sin(roll)).cross(tan).normalize();
      const axis = tan.clone().lerp(side.clone().cross(tan).normalize().multiplyScalar(r() < 0.5 ? 1 : -1), 0.45 + r() * 0.3).normalize();
      if (axis.y > 0) axis.y *= -0.4;
      axis.normalize();
      const sideV = new THREE.Vector3().crossVectors(axis, side).normalize();
      soft.copy(p).sub(crown).normalize();
      const col = new THREE.Color().setHSL(0.19 + r() * 0.07, 0.42 + r() * 0.2, 0.26 + r() * 0.16 + t * 0.04);
      leaf(leaves, p, axis, sideV, 0.24 + r() * 0.1, 0.046 + r() * 0.016, WILLOW_ROWS, col, ws.sway + (1 - ws.sway) * t, soft);
      leafCount.n++;
    }
  }
  return { bark: bark.geometry(), leaves: leaves.geometry(), tris: bark.tris + leaves.tris, leafCount: leafCount.n };
}

function poplar(r, detail) {
  const bark = new Builder(), leaves = new Builder();
  const lean = new THREE.Vector3((r() - 0.5) * 0.6, 0, (r() - 0.5) * 0.6);
  const top = new THREE.Vector3(lean.x, 9, lean.z);
  tube(bark, new THREE.CatmullRomCurve3([new THREE.Vector3(0, -0.4, 0), new THREE.Vector3(lean.x * 0.4, 4.2, lean.z * 0.4), top]), 12, 0.48, 0.13, 14, 0, 0.03);
  const crown = new THREE.Vector3(lean.x, 10.2, lean.z);
  const twigs = [];
  // scaffold branches -> shoots, leaves clustered on the shoots
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + r() * 0.6;
    const s = new THREE.Vector3(lean.x * 0.5, 4.6 + r() * 4, lean.z * 0.5);
    const d = new THREE.Vector3(Math.cos(a), 0.7 + r() * 0.5, Math.sin(a)).normalize();
    const L = 3.2 + r() * 1.6;
    const e = s.clone().addScaledVector(d, L);
    const br = new THREE.CatmullRomCurve3([s, s.clone().lerp(e, 0.5).add(new THREE.Vector3(0, 0.4, 0)), e]);
    tube(bark, br, 8, 0.16, 0.04, 8, 0.02, 0.1);
    for (let k = 0; k < 9; k++) {
      const p0 = br.getPointAt(0.3 + 0.7 * r());
      const sd = new THREE.Vector3(r() - 0.5, r() * 0.8, r() - 0.5).normalize();
      const sL = 0.9 + r() * 1.2;
      const shoot = new THREE.CatmullRomCurve3([p0, p0.clone().addScaledVector(sd, sL * 0.5).add(new THREE.Vector3(0, 0.15, 0)), p0.clone().addScaledVector(sd, sL)]);
      tube(bark, shoot, 3, 0.03, 0.008, 4, 0.1, 0.3);
      twigs.push(shoot);
    }
  }
  const per = Math.round(165 * detail);
  for (const tw of twigs) {
    for (let k = 0; k < per; k++) {
      const t = 0.15 + 0.85 * r();
      const p = tw.getPointAt(t).add(new THREE.Vector3((r() - 0.5) * 1.3, (r() - 0.5) * 1.0, (r() - 0.5) * 1.3));
      const axis = new THREE.Vector3(r() - 0.5, -0.2 - r() * 0.8, r() - 0.5).normalize();
      const side = new THREE.Vector3().crossVectors(axis, new THREE.Vector3(r() - 0.5, r() - 0.5, r() - 0.5).normalize()).normalize();
      const under = r() < 0.2;
      const col = under ? new THREE.Color().setHSL(0.22, 0.2, 0.5) : new THREE.Color().setHSL(0.24 + r() * 0.05, 0.38 + r() * 0.2, 0.18 + r() * 0.14);
      leaf(leaves, p, axis, side, 0.17 + r() * 0.07, 0.15 + r() * 0.05, POPLAR_ROWS, col, 0.35, p.clone().sub(crown).normalize());
    }
  }
  return { bark: bark.geometry(), leaves: leaves.geometry(), tris: bark.tris + leaves.tris };
}

/* ------------------------------------------------------------------ */
/* Twinmotion trees                                                    */
/* ------------------------------------------------------------------ */
// assets/willow-tm.json (tools/willow_skeleton.py): the Twinmotion willow's trunk mesh plus every branch
// and hanging whip as a centreline with radii. assets/poplar-tm.json (tools/poplar_extract.py): the
// Twinmotion black poplar reduced in Unreal. Both quantised: int16 mm, int8 normals, uint16 uvs.
const fromB64 = (s, T) => {
  const bin = atob(s);
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return new T(u8.buffer);
};
function unpackMesh(m) {
  const p = fromB64(m.pos, Int16Array), n = fromB64(m.nrm, Int8Array), q = fromB64(m.uv, Uint16Array);
  const [u0, v0, u1, v1] = m.uvRange;
  const pos = new Float32Array(p.length), nrm = new Float32Array(n.length), uv = new Float32Array(q.length);
  for (let i = 0; i < p.length; i++) pos[i] = p[i] / 1000;
  for (let i = 0; i < n.length; i++) nrm[i] = n[i] / 127;
  for (let i = 0; i < q.length; i += 2) { uv[i] = u0 + (q[i] / 65535) * (u1 - u0); uv[i + 1] = v0 + (q[i + 1] / 65535) * (v1 - v0); }
  return { pos, nrm, uv, idx: fromB64(m.idx, Uint16Array) };
}

export async function loadTreeModels(base = '') {
  const get = (f) => fetch(base + f).then((r) => { if (!r.ok) throw new Error(f + ' ' + r.status); return r.json(); });
  const [willow, poplar] = await Promise.all([get('assets/willow-tm.json'), get('assets/poplar-tm.json')]);
  return { willow, poplar };
}

// tube along a polyline with per-node radii (parallel-transport frames)
function polyTube(B, P, R, radial, swayAt, col = WHITE) {
  const n = P.length;
  let nrm = null;
  let dist = 0;
  const rings = [];
  for (let i = 0; i < n; i++) {
    const tan = (i < n - 1 ? tmpA.subVectors(P[i + 1], P[i]) : tmpA.subVectors(P[i], P[i - 1])).clone().normalize();
    if (!nrm) {
      nrm = Math.abs(tan.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
    }
    nrm.addScaledVector(tan, -nrm.dot(tan)).normalize();
    const bin = new THREE.Vector3().crossVectors(tan, nrm);
    if (i) dist += P[i].distanceTo(P[i - 1]);
    const vt = dist / (Math.PI * 2 * Math.max(R[i], 0.01));
    const sway = swayAt(i, dist);
    const ring = [];
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      const d = new THREE.Vector3().addScaledVector(nrm, Math.cos(a)).addScaledVector(bin, Math.sin(a));
      ring.push(B.vert(P[i].clone().addScaledVector(d, R[i]), d, j / radial, vt, col, sway));
    }
    rings.push(ring);
  }
  for (let i = 0; i < n - 1; i++) for (let j = 0; j < radial; j++) {
    const a = rings[i][j], b = rings[i + 1][j], c = rings[i + 1][j + 1], d = rings[i][j + 1];
    B.tri(a, b, c); B.tri(a, c, d);
  }
}

// Twinmotion branch system, procedural willow leaves hung along its whips
const WILLOW_TM_SCALE = 0.68;
const WILLOW_LAYOUT_DETAIL = 0.5;
const WHIP = new THREE.Color(1.9, 1.85, 1.05);
function willowTM(data, r, detail, scale = WILLOW_TM_SCALE) {
  const bark = new Builder(), leaves = new Builder();
  const T = unpackMesh(data.trunk);
  let top = 0;
  for (let i = 1; i < T.pos.length; i += 3) top = Math.max(top, T.pos[i]);
  const p = new THREE.Vector3(), n = new THREE.Vector3();
  for (let i = 0; i < T.pos.length / 3; i++) {
    p.fromArray(T.pos, i * 3); n.fromArray(T.nrm, i * 3);
    bark.vert(p, n, T.uv[i * 2], T.uv[i * 2 + 1], WHITE, 0.08 * Math.max(0, p.y / top) ** 2);
  }
  for (let i = 0; i < T.idx.length; i += 3) bark.tri(T.idx[i], T.idx[i + 1], T.idx[i + 2]);

  const pts = fromB64(data.branches.pts, Int16Array), rad = fromB64(data.branches.rad, Uint16Array), offs = fromB64(data.branches.offs, Uint32Array);
  const chains = [];
  let thinLen = 0;
  const crown = new THREE.Vector3();
  for (let c = 0; c < offs.length - 1; c++) {
    const P = [], R = [];
    let L = 0, rSum = 0;
    for (let k = offs[c]; k < offs[c + 1]; k++) {
      P.push(new THREE.Vector3(pts[k * 3] / 1000, pts[k * 3 + 1] / 1000, pts[k * 3 + 2] / 1000));
      R.push(rad[k] / 10000);
      rSum += rad[k] / 10000;
      if (P.length > 1) L += P[P.length - 1].distanceTo(P[P.length - 2]);
    }
    const rAvg = rSum / P.length;
    const thin = rAvg < 0.012;
    if (thin) thinLen += L;
    crown.add(P[0]);
    chains.push({ P, R, L, rAvg, thin });
  }
  crown.divideScalar(chains.length);

  const spacing = thinLen / (32000 * detail);
  const rows = detail <= 0.5 ? WILLOW_ROWS_LITE : WILLOW_ROWS;
  const soft = new THREE.Vector3(), tan = new THREE.Vector3();
  let leafCount = 0;
  for (const ch of chains) {
    const { P, R, L, rAvg, thin } = ch;
    // branches sway a little more the thinner they are; whips swing from their attachment to the tip
    const base = Math.min(0.14, 0.02 + Math.max(0, 1 - rAvg / 0.05) * 0.12);
    const swayAt = thin ? (d) => 0.15 + 0.85 * Math.min(1, d / Math.max(L, 0.3)) : () => base;
    // resample: fewer rings on the hanging whips, more on the structural branches
    const seg = thin ? 0.45 / Math.sqrt(detail) : detail < 0.4 ? 0.5 : 0.25;
    const keepP = [P[0]], keepR = [R[0]], keepD = [0];
    let acc = 0, d = 0;
    for (let i = 1; i < P.length; i++) {
      const s = P[i].distanceTo(P[i - 1]);
      acc += s; d += s;
      if (acc >= seg || i === P.length - 1) { keepP.push(P[i]); keepR.push(R[i]); keepD.push(d); acc = 0; }
    }
    if (keepP.length < 2) continue;
    // phones: the leaves alone draw the whips, only the structural branches are modelled
    const tubes = !thin || detail > 0.6;
    const radial = detail < 0.4 ? (rAvg > 0.05 ? 5 : 3) : rAvg > 0.05 ? 8 : rAvg > 0.012 ? 5 : 3;
    // young whips are olive, not bark-brown (vertex colour lifts the dark bark map)
    if (tubes) polyTube(bark, keepP, keepR, radial, (i) => swayAt(keepD[i]), thin ? WHIP : WHITE);
    if (!thin) continue;
    // leaves: same blade, fold, colour and sway as the procedural willow
    let k = 0, dk = 0;
    for (let dd = 0.06; dd < L; dd += spacing * (0.7 + r() * 0.6)) {
      while (k < P.length - 2 && dk + P[k + 1].distanceTo(P[k]) < dd) { dk += P[k + 1].distanceTo(P[k]); k++; }
      const segL = P[k + 1].distanceTo(P[k]) || 1e-4;
      const pos = P[k].clone().lerp(P[k + 1], Math.min(1, (dd - dk) / segL));
      tan.subVectors(P[k + 1], P[k]).normalize();
      const t = dd / L;
      const roll = r() * Math.PI * 2;
      const side = new THREE.Vector3(Math.cos(roll), 0, Math.sin(roll)).cross(tan);
      if (side.lengthSq() < 1e-6) side.set(1, 0, 0);
      side.normalize();
      const axis = tan.clone().lerp(side.clone().cross(tan).normalize().multiplyScalar(r() < 0.5 ? 1 : -1), 0.45 + r() * 0.3).normalize();
      if (axis.y > 0) axis.y *= -0.4;
      axis.normalize();
      const sideV = new THREE.Vector3().crossVectors(axis, side).normalize();
      soft.copy(pos).sub(crown).normalize();
      const col = new THREE.Color().setHSL(0.19 + r() * 0.07, 0.42 + r() * 0.2, 0.26 + r() * 0.16 + t * 0.04);
      leaf(leaves, pos, axis, sideV, (0.24 + r() * 0.1) / scale * 0.8, (0.046 + r() * 0.016) / scale * 0.8, rows, col, swayAt(dd), soft);
      leafCount++;
    }
  }
  const out = { bark: bark.geometry(), leaves: leaves.geometry(), tris: bark.tris + leaves.tris, leafCount };
  out.bark.scale(scale, scale, scale);
  out.leaves.scale(scale, scale, scale);
  return out;
}

// the Twinmotion poplar as modelled, with sway weights by height for the wind shader
const POPLAR_TM_SCALE = 0.95;
function poplarTM(data, scale = POPLAR_TM_SCALE, keep = 1) {
  const part = (m, swayOf, thin = 1) => {
    const M = unpackMesh(m);
    // phones: every other leaf card (two triangles each) is left out
    if (thin > 1) M.idx = M.idx.filter((_, i) => Math.floor(i / 6) % thin === 0);
    let top = 0;
    for (let i = 1; i < M.pos.length; i += 3) top = Math.max(top, M.pos[i]);
    const sw = new Float32Array(M.pos.length / 3), col = new Float32Array(M.pos.length).fill(1);
    for (let i = 0; i < sw.length; i++) sw[i] = swayOf(Math.max(0, M.pos[i * 3 + 1] / top));
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(M.pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(M.nrm, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(M.uv, 2));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('aSway', new THREE.BufferAttribute(sw, 1));
    g.setIndex(new THREE.BufferAttribute(M.idx, 1));
    g.scale(scale, scale, scale);
    return g;
  };
  const bark = part(data.bark, (h) => 0.25 * h ** 2);
  const leaves = part(data.leaves, (h) => 0.3 + 0.7 * h ** 1.2, Math.round(1 / keep));
  return { bark, leaves, tris: (bark.index.count + leaves.index.count) / 3 };
}

function reed(r, kind) {
  const S = new Builder(), L = new Builder(), F = new Builder();
  const cattail = kind === 'cattail';
  const H = cattail ? 1.8 : 2.6 + r() * 0.5;
  const curl = (r() - 0.5) * 0.35;
  const swayAt = (p) => Math.pow(Math.max(0, p.y) / 3, 1.6);
  const stemGreen = new THREE.Color().setHSL(0.2 + r() * 0.03, 0.4, 0.32);
  const stemTan = new THREE.Color().setHSL(0.11, 0.35, 0.52);
  const node = new THREE.Color().setHSL(0.1, 0.3, 0.25);
  const stem = new THREE.CatmullRomCurve3([new THREE.Vector3(0, -0.3, 0), new THREE.Vector3(curl * 0.2, H * 0.5, 0), new THREE.Vector3(curl, H, 0)]);
  tube(S, stem, 10, cattail ? 0.02 : 0.018, 0.008, 5, 0, swayAt(new THREE.Vector3(0, H, 0)),
    (t) => (!cattail && Math.abs(((t * H) / 0.38) % 1 - 0.5) > 0.46 ? node : stemGreen.clone().lerp(stemTan, cattail ? 0 : t * t)), 1);
  // leaves sheathing the stem and arching out
  const nLeaves = cattail ? 5 : 6;
  for (let i = 0; i < nLeaves; i++) {
    const h0 = cattail ? 0.02 + r() * 0.15 : 0.18 + i * 0.27 + r() * 0.1;
    const yaw = (i * 2.4) + r() * 0.6;
    const dir = new THREE.Vector3(Math.cos(yaw), 0, Math.sin(yaw));
    const side = new THREE.Vector3(-dir.z, 0, dir.x);
    const len = cattail ? 1.1 + r() * 0.6 : 0.5 + r() * 0.35;
    const up = cattail ? 0.97 : 0.6;
    const droop = cattail ? 0.12 : 0.6;
    const base = stem.getPointAt(Math.min(1, (h0 + 0.3) / (H + 0.3)));
    const col = new THREE.Color().setHSL(0.19 + r() * 0.06, 0.38 + r() * 0.16, 0.22 + r() * 0.12);
    const tip = new THREE.Color().setHSL(0.13, 0.42, 0.45);
    blade(L, (s) => ({ p: base.clone().addScaledVector(dir, len * (cattail ? 0.22 : 0.62) * s).add(new THREE.Vector3(0, len * (up * s - droop * s * s), 0)), side }), 7, cattail ? 0.04 : 0.058, col, tip, swayAt);
  }
  if (cattail) {
    // the brown spike and its thin tip
    const brown = new THREE.Color('#5a3a22');
    const sp = new THREE.CatmullRomCurve3([new THREE.Vector3(curl * 0.78, H * 0.78, 0), new THREE.Vector3(curl * 0.84, H * 0.84, 0), new THREE.Vector3(curl * 0.9, H * 0.9, 0)]);
    tube(S, sp, 4, 0.034, 0.03, 12, swayAt(new THREE.Vector3(0, H * 0.8, 0)), swayAt(new THREE.Vector3(0, H * 0.9, 0)), () => brown, 1);
    return { stem: S.geometry(), leaves: L.geometry(), plume: null, tris: S.tris + L.tris };
  }
  // plume: rachis, branchlets and spikelet filaments
  const top = new THREE.Vector3(curl, H, 0);
  const rachis = new THREE.CatmullRomCurve3([top, top.clone().add(new THREE.Vector3(0.03, 0.22, 0)), top.clone().add(new THREE.Vector3(0.08, 0.46, 0.02))]);
  tube(F, rachis, 4, 0.006, 0.002, 3, swayAt(top), swayAt(top) * 1.2, () => new THREE.Color('#8a7660'), 1);
  for (let b = 0; b < 18; b++) {
    const t = 0.05 + 0.92 * (b / 18);
    const p0 = rachis.getPointAt(t);
    const a = b * 2.4 + r() * 0.5;
    const out = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    const bl = (0.08 + 0.17 * (1 - Math.abs(t - 0.4) * 1.4)) * (0.8 + r() * 0.4);
    const side = new THREE.Vector3(-out.z, 0, out.x);
    const purple = r() < 0.5;
    const c0 = purple ? new THREE.Color('#6e5163') : new THREE.Color('#8d7a62');
    const c1 = purple ? new THREE.Color('#a6889a') : new THREE.Color('#cdb894');
    const fn = (s) => ({ p: p0.clone().addScaledVector(out, bl * 0.5 * s).add(new THREE.Vector3(0, bl * s, 0)), side });
    blade(F, fn, 3, 0.008, c0, c1, () => swayAt(top) * 1.25);
    // spikelets: small silky tufts along each branchlet
    for (let k = 0; k < 5; k++) {
      const s = 0.25 + 0.75 * (k / 5);
      const { p } = fn(s);
      const d = out.clone().multiplyScalar(0.3).add(new THREE.Vector3((r() - 0.5) * 0.5, 1, (r() - 0.5) * 0.5)).normalize();
      const n = new THREE.Vector3().crossVectors(side, d).normalize();
      const sw = swayAt(top) * 1.3;
      const i0 = F.vert(p, n, 0, 0, c0, sw);
      const i1 = F.vert(p.clone().addScaledVector(d, 0.035).addScaledVector(side, 0.006), n, 1, 0, c1, sw);
      const i2 = F.vert(p.clone().addScaledVector(d, 0.035).addScaledVector(side, -0.006), n, 0, 1, c1, sw);
      F.tri(i0, i1, i2);
    }
  }
  return { stem: S.geometry(), leaves: L.geometry(), plume: F.geometry(), tris: S.tris + L.tris + F.tris };
}

/* ------------------------------------------------------------------ */
/* growth + wind in the vertex shader                                  */
/* ------------------------------------------------------------------ */
const VEG_HEAD = /* glsl */`
uniform float uTime;
uniform float uClock;
uniform float uAmp;
attribute vec4 aGrow;   // birth, size after sprouting, size at the new-structure stage, phase
attribute float aSway;
float vegGrowth() {
  float b = aGrow.x, s0 = aGrow.y, s1 = aGrow.z;
  if (uTime <= b) return 0.0;
  float e = b + 0.35;
  float s = s0 * smoothstep(b, e, uTime);
  if (uTime > e) {
    float a2 = max(e, 2.0);
    float mid = s0;
    if (a2 < 3.0) { s += (s1 - s0) * clamp((uTime - a2) / (3.0 - a2), 0.0, 1.0); mid = s1; }
    float a3 = max(e, 3.0);
    s += (1.0 - mid) * clamp((uTime - a3) / max(4.0 - a3, 0.05), 0.0, 1.0);
  }
  return s;
}
`;
function injectVeg(mat, uniforms, amp) {
  const uAmp = { value: amp };
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.uniforms.uClock = uniforms.uClock;
    shader.uniforms.uAmp = uAmp;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + VEG_HEAD)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        float vg = vegGrowth();
        transformed *= vg;
        float sw = aSway * uAmp * vg;
        float ph = aGrow.w + position.x * 0.7 + position.z * 0.5;
        transformed.x += (sin(uClock * 1.25 + ph + transformed.y * 0.32) + 0.35 * sin(uClock * 3.1 + ph * 2.3)) * sw;
        transformed.z += cos(uClock * 1.05 + ph * 1.7 + transformed.y * 0.28) * sw * 0.6;
        transformed.y -= abs(sin(uClock * 1.25 + ph)) * sw * 0.15;`);
  };
  mat.customProgramCacheKey = () => 'veg' + amp + (mat.isMeshDepthMaterial ? 'd' : '');
}

/* ------------------------------------------------------------------ */
/* reading the site: a height/material map per stage                   */
/* ------------------------------------------------------------------ */
function siteReader(chunks, tracks, mats, focus, half) {
  const C = 4;
  const x0 = focus.x - half, z0 = focus.z - half;
  const N = Math.ceil((2 * half) / C);
  const cells = Array.from({ length: N * N }, () => []);
  const tri = [];
  const triTrack = [];
  for (const ch of chunks) {
    const p = ch.pos, ix = ch.idx, ids = ch.ids;
    for (let t = 0; t < ix.length; t += 3) {
      const a = ix[t] * 3, b = ix[t + 1] * 3, c = ix[t + 2] * 3;
      const minx = Math.min(p[a], p[b], p[c]), maxx = Math.max(p[a], p[b], p[c]);
      const minz = Math.min(p[a + 2], p[b + 2], p[c + 2]), maxz = Math.max(p[a + 2], p[b + 2], p[c + 2]);
      if (maxx < x0 || minx > x0 + 2 * half || maxz < z0 || minz > z0 + 2 * half) continue;
      const area = Math.abs((p[b] - p[a]) * (p[c + 2] - p[a + 2]) - (p[c] - p[a]) * (p[b + 2] - p[a + 2]));
      if (area < 1e-4) continue;   // walls have no footprint to stand on
      const k = tri.length / 9;
      tri.push(p[a], p[a + 1], p[a + 2], p[b], p[b + 1], p[b + 2], p[c], p[c + 1], p[c + 2]);
      triTrack.push(ids[ix[t]]);
      const i0 = Math.max(0, Math.floor((minx - x0) / C)), i1 = Math.min(N - 1, Math.floor((maxx - x0) / C));
      const j0 = Math.max(0, Math.floor((minz - z0) / C)), j1 = Math.min(N - 1, Math.floor((maxz - z0) / C));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) cells[j * N + i].push(k);
    }
  }
  return function surfaceAt(x, z, stage, maxY = Infinity) {
    const i = Math.floor((x - x0) / C), j = Math.floor((z - z0) / C);
    if (i < 0 || j < 0 || i >= N || j >= N) return null;
    let best = null;
    for (const k of cells[j * N + i]) {
      const tk = tracks[triTrack[k]];
      if (tk[0] > stage || tk[1] < stage) continue;
      const o = k * 9;
      const ax = tri[o], ay = tri[o + 1], az = tri[o + 2], bx = tri[o + 3], by = tri[o + 4], bz = tri[o + 5], cx = tri[o + 6], cy = tri[o + 7], cz = tri[o + 8];
      const d = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
      if (Math.abs(d) < 1e-9) continue;
      const l1 = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / d;
      const l2 = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / d;
      const l3 = 1 - l1 - l2;
      if (l1 < -1e-4 || l2 < -1e-4 || l3 < -1e-4) continue;
      const y = l1 * ay + l2 * by + l3 * cy;
      if (y > maxY) continue;
      if (!best || y > best.y) best = { y, mat: mats[tk[2]] };
    }
    return best;
  };
}

function classify(hit) {
  if (!hit) return 'void';
  const m = hit.mat, [r, g, b] = m.rgb;
  if (r === 97 && g === 203 && b === 172) return 'water';
  if (m.name === 'Default' || (m.name === 'Plaster' && ((r === 250 && g === 250) || (r === 77 && g === 59)))) return 'ground';
  if (m.name === 'pebbly?') return 'pebble';
  if (m.name === 'Plaster' && (r === 40 || r === 178 || r === 85)) return 'path';
  if (m.name === 'Paint' || m.name === 'terracotta') return 'path';
  return 'structure';
}

/* ------------------------------------------------------------------ */
/* main                                                                */
/* ------------------------------------------------------------------ */
export function buildVegetation({ scene, uniforms, tracks, mats, chunks, focus, radius, mobile, shadows, rand, models, layout, courtyard }) {
  const r = rand;
  const detail = mobile ? 0.45 : 1;
  const half = radius * 1.8;
  const surfaceAt = siteReader(chunks, tracks, mats, focus, half);

  // sample a 2 m grid at the stages that matter
  const S = 2;
  const n = Math.ceil((2 * half) / S);
  const gx0 = focus.x - half, gz0 = focus.z - half;
  const typ = [2, 3, 4].map(() => new Array(n * n));
  const hy = [2, 3, 4].map(() => new Float32Array(n * n));
  [2, 3, 4].forEach((stage, si) => {
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const h = surfaceAt(gx0 + (i + 0.5) * S, gz0 + (j + 0.5) * S, stage);
      typ[si][j * n + i] = classify(h);
      hy[si][j * n + i] = h ? h.y : 0;
    }
  });
  const distTo = (pred) => {
    const d = new Int16Array(n * n).fill(999);
    const q = [];
    for (let k = 0; k < n * n; k++) if (pred(k)) { d[k] = 0; q.push(k); }
    for (let h = 0; h < q.length; h++) {
      const k = q[h], i = k % n, j = (k / n) | 0;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const a = i + di, b = j + dj;
        if (a < 0 || b < 0 || a >= n || b >= n) continue;
        const kk = b * n + a;
        if (d[kk] > d[k] + 1) { d[kk] = d[k] + 1; q.push(kk); }
      }
    }
    return d;
  };
  const T2 = typ[0], T3 = typ[1], T4 = typ[2];
  const landDist = distTo((k) => T2[k] !== 'water' && T2[k] !== 'void');
  const waterDist = distTo((k) => T2[k] === 'water');
  const builtDist4 = distTo((k) => T4[k] === 'structure' || T4[k] === 'path');
  const structDist4 = distTo((k) => T4[k] === 'structure');
  const cellPos = (k, jitter = 0.9) => ({ x: gx0 + ((k % n) + 0.5 + (r() - 0.5) * jitter) * S, z: gz0 + (((k / n) | 0) + 0.5 + (r() - 0.5) * jitter) * S });
  const order = [...Array(n * n).keys()].sort(() => r() - 0.5);

  const reeds = [], cattails = [], willows = [], poplars = [];
  const dens = mobile ? 0.45 : 1.35;
  for (const k of order) {
    // reeds along the new shoreline, in water that is never built over
    const wet = T2[k] === 'water' && T3[k] === 'water' && T4[k] === 'water';
    if (wet && landDist[k] <= 3) {
      const d = landDist[k];
      const count = Math.round((6 - d * 1.5) * dens * (0.6 + r() * 0.6));
      for (let c = 0; c < count; c++) {
        reeds.push({ ...cellPos(k, 1.0), y: hy[0][k] - 0.25, yaw: r() * 6.28, s: 1.1 + r() * 0.5, grow: [1.5 + d * 0.08 + r() * 0.22, 0.85 + r() * 0.12, 1.0, r() * 6.28] });
      }
      if (d === 1 && r() < 0.5) for (let c = 0; c < 2 + Math.round(r() * 2 * dens); c++) {
        cattails.push({ ...cellPos(k, 1.0), y: hy[0][k] - 0.2, yaw: r() * 6.28, s: 0.85 + r() * 0.35, grow: [1.7 + r() * 0.2, 0.9, 1.0, r() * 6.28] });
      }
    }
    // the decay: reeds spread further out and up the bank
    if ((T4[k] === 'water' && landDist[k] <= 5) || ((T4[k] === 'ground' || T4[k] === 'pebble') && waterDist[k] <= 1)) {
      if (r() < 0.5 * dens) {
        const wetNow = T4[k] === 'water';
        reeds.push({ ...cellPos(k, 1.0), y: wetNow ? hy[2][k] - 0.25 : hy[2][k], yaw: r() * 6.28, s: 0.75 + r() * 0.45, grow: [3.1 + r() * 0.6, 0.95, 1.0, r() * 6.28] });
      }
    }
  }
  const spaced = (list, p, min) => list.every((q) => (q.x - p.x) ** 2 + (q.z - p.z) ** 2 > min * min);
  const soil = (t) => t === 'ground' || t === 'pebble';
  const groundAll = (k) => soil(T2[k]) && soil(T3[k]) && soil(T4[k]);
  // the Twinmotion layout: the same trees, full grown, on every stage
  const fromLayout = !!(models && layout && layout.length);
  // except on the old concrete pier and quay (or the water beside it): those are planted once it is demolished,
  // and grow in through the rehabilitation
  const soilAt = (p, s) => { const c = classify(surfaceAt(p[0], p[2], s)); return c === 'ground' || c === 'pebble' || c === 'void'; };
  if (fromLayout) for (const t of layout) {
    const onPier = !soilAt(t.p, 0) || !soilAt(t.p, 1);
    const grow = onPier ? [1.45 + r() * 0.3, 0.45, 1, r() * 6.28] : [-1, 1, 1, r() * 6.28];
    const p = { x: t.p[0], y: t.p[1], z: t.p[2], yaw: t.yaw, s: t.scale, grow, onPier };
    (t.kind === 'willow' ? willows : poplars).push(p);
  }
  // the end of the decay: a big willow takes over the courtyard of the ruined buildings, sprouting once the flood
  // has passed and reaching full size as the timeline ends. It stands on the courtyard floor, under the roofs
  if (fromLayout && courtyard) {
    const floor = surfaceAt(courtyard.x, courtyard.z, 4, 9);
    if (floor) willows.push({ x: courtyard.x, y: floor.y, z: courtyard.z, yaw: 0.8, s: 1.6, grow: [3.35, 0.4, 0.4, r() * 6.28], courtyard: true });
  }
  const maxW = fromLayout ? 0 : mobile ? 3 : 5, maxP = fromLayout ? 0 : mobile ? 2 : 4, maxDW = fromLayout ? 0 : mobile ? 2 : 3;
  for (const k of order) {
    if (willows.length >= maxW) break;
    if (!groundAll(k) || waterDist[k] > 3 || builtDist4[k] < 2) continue;
    const p = cellPos(k, 0.4);
    if (!spaced(willows, p, 10)) continue;
    willows.push({ ...p, y: hy[0][k], yaw: r() * 6.28, s: 1.15 + r() * 0.3, grow: [1.6 + r() * 0.3, 0.3 + r() * 0.08, 0.66, r() * 6.28] });
  }
  for (const k of order) {
    if (poplars.length >= maxP) break;
    if (!groundAll(k) || waterDist[k] < 4 || waterDist[k] > 14 || builtDist4[k] < 3) continue;
    const p = cellPos(k, 0.4);
    if (!spaced(poplars, p, 14) || !spaced(willows, p, 8)) continue;
    poplars.push({ ...p, y: hy[0][k], yaw: r() * 6.28, s: 1.15 + r() * 0.25, grow: [1.7 + r() * 0.3, 0.32, 0.68, r() * 6.28] });
  }
  let decayWillows = 0;
  for (const k of order) {
    if (decayWillows >= maxDW) break;
    const ok = (soil(T4[k]) || (T4[k] === 'water' && landDist[k] <= 1)) && structDist4[k] >= 1 && structDist4[k] <= 3;
    if (!ok) continue;
    const p = cellPos(k, 0.3);
    if (!spaced(willows, p, 7)) continue;
    willows.push({ ...p, y: T4[k] === 'water' ? hy[2][k] - 0.3 : hy[2][k], yaw: r() * 6.28, s: 0.95 + r() * 0.25, grow: [3.05 + r() * 0.35, 0.42, 0.42, r() * 6.28] });
    decayWillows++;
  }

  /* ---- PBR materials ---- */
  const barkMap = barkTexture(r);
  barkMap.wrapS = barkMap.wrapT = THREE.RepeatWrapping;
  const barkBump = barkMap.clone(); barkBump.colorSpace = THREE.NoColorSpace; barkBump.needsUpdate = true;
  const tex = { willow: willowLeafTexture(), poplar: poplarLeafTexture(), blade: bladeTexture() };
  const mk = (opts, amp, depthOpts = {}) => {
    const mat = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, ...opts });
    injectVeg(mat, uniforms, amp);
    const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, side: THREE.DoubleSide, ...depthOpts });
    injectVeg(depth, uniforms, amp);
    // three clones the depth material for alpha-tested leaves; the clone must keep the growth and wind, or
    // trees not yet planted would still cast shadows
    depth.clone = function () {
      const c = THREE.MeshDepthMaterial.prototype.clone.call(this);
      c.onBeforeCompile = this.onBeforeCompile;
      c.customProgramCacheKey = this.customProgramCacheKey;
      return c;
    };
    return { mat, depth };
  };
  // leaves glow faintly where the sun comes through them
  const leafGlow = { emissive: new THREE.Color('#1c2a0c'), emissiveIntensity: 0.55 };
  const M = {
    bark: mk({ map: barkMap, bumpMap: barkBump, bumpScale: 2.5, color: '#d8cfc4', roughness: 0.96 }, 0.35),
    willow: mk({ map: tex.willow, vertexColors: true, roughness: 0.52, ...leafGlow }, 0.35),
    poplar: mk({ map: tex.poplar, vertexColors: true, roughness: 0.42, metalness: 0.02, ...leafGlow }, 0.12),
    stem: mk({ vertexColors: true, roughness: 0.6 }, 0.3),
    blade: mk({ map: tex.blade, vertexColors: true, roughness: 0.62, ...leafGlow }, 0.3),
    plume: mk({ vertexColors: true, roughness: 0.92 }, 0.3),
  };
  if (models) {
    // Twinmotion textures (Unreal uvs: top-left origin, DirectX normal maps)
    const tl = new THREE.TextureLoader();
    const tmTex = (f, srgb) => {
      const t = tl.load('assets/img/' + f);
      t.flipY = false;
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.anisotropy = 8;
      if (srgb) t.colorSpace = THREE.SRGBColorSpace;
      return t;
    };
    const dx = new THREE.Vector2(1, -1);
    M.tmWillowBark = mk({ map: tmTex('tm-willow-bark.jpg', true), normalMap: tmTex('tm-willow-bark-n.jpg'), normalScale: dx, vertexColors: true, roughness: 0.92 }, 0.35);
    M.tmPoplarBark = mk({ map: tmTex('tm-poplar-bark.jpg', true), normalMap: tmTex('tm-poplar-bark-n.jpg'), normalScale: dx, roughness: 0.9 }, 0.12);
    // Twinmotion lifts its dark leaf maps with translucency and a season tint: approximated here
    const leafMap = tmTex('tm-poplar-leaf.png', true);
    M.tmPoplarLeaf = mk({ map: leafMap, normalMap: tmTex('tm-poplar-leaf-n.jpg'), normalScale: dx, alphaTest: 0.4, roughness: 0.55,
      emissive: new THREE.Color('#ffffff'), emissiveMap: leafMap, emissiveIntensity: 0.45 }, 0.12, { map: leafMap, alphaTest: 0.4 });
    M.tmPoplarLeaf.mat.color.setRGB(1.9, 1.85, 1.5);
    // smooth the cut-out leaf edges with the multisampling, so the crowns don't shimmer as the camera sways
    M.tmPoplarLeaf.mat.alphaToCoverage = true;
  }

  // A weeping willow's crown is fine leaves on long whips, so on its own it throws only a faint dapple. A
  // crown-shaped stand-in, never drawn and only casting shadows, gives the dense, dappled shadow it really casts
  const crownProxy = (leaves) => {
    leaves.computeBoundingBox();
    const c = leaves.boundingBox.getCenter(new THREE.Vector3()), s = leaves.boundingBox.getSize(new THREE.Vector3());
    const g = new THREE.SphereGeometry(1, 18, 12);
    g.scale(s.x * 0.46, s.y * 0.48, s.z * 0.46);
    g.translate(c.x, c.y + s.y * 0.04, c.z);
    g.setAttribute('aSway', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count), 1));
    return g;
  };
  const crownPack = () => {
    const mat = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
    const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, side: THREE.DoubleSide });
    injectVeg(depth, uniforms, 0);
    const grow = depth.onBeforeCompile;
    depth.onBeforeCompile = (shader, r) => {
      grow(shader, r);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vCrown;')
        .replace('#include <project_vertex>', `#include <project_vertex>
          vec4 cw = vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
            cw = instanceMatrix * cw;
          #endif
          vCrown = (modelMatrix * cw).xyz;`);
      // holes through the crown: sun flecks in the shadow
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
          varying vec3 vCrown;
          float cHash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
          float cNoise(vec3 p) {
            vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
            return mix(mix(mix(cHash(i), cHash(i + vec3(1, 0, 0)), f.x), mix(cHash(i + vec3(0, 1, 0)), cHash(i + vec3(1, 1, 0)), f.x), f.y),
                       mix(mix(cHash(i + vec3(0, 0, 1)), cHash(i + vec3(1, 0, 1)), f.x), mix(cHash(i + vec3(0, 1, 1)), cHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
          }`)
        // broad flecks only: finer holes crawl visibly with every small move of the sun
        .replace('void main() {', 'void main() {\n  if (cNoise(vCrown * 0.9) < 0.3) discard;');
    };
    depth.customProgramCacheKey = () => 'vegcrown';
    return { mat, depth };
  };

  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3();
  let totalTris = 0;
  const instance = (geo, pack, list, castShadow) => {
    if (!list.length || !geo) return null;
    const g = new THREE.BufferGeometry();
    for (const name of Object.keys(geo.attributes)) g.setAttribute(name, geo.attributes[name]);
    g.setIndex(geo.index);
    const grow = new Float32Array(list.length * 4);
    const mesh = new THREE.InstancedMesh(g, pack.mat, list.length);
    list.forEach((p, i) => {
      q.setFromAxisAngle(UP, p.yaw);
      m4.compose(v.set(p.x, p.y, p.z), q, sc.setScalar(p.s));
      mesh.setMatrixAt(i, m4);
      grow.set(p.grow, i * 4);
    });
    g.setAttribute('aGrow', new THREE.InstancedBufferAttribute(grow, 4));
    mesh.frustumCulled = false;
    mesh.castShadow = shadows && castShadow;
    mesh.receiveShadow = true;
    mesh.customDepthMaterial = pack.depth;
    scene.add(mesh);
    totalTris += (geo.index.count / 3) * list.length;
    return mesh;
  };
  const split = (list, k) => Array.from({ length: k }, (_, i) => list.filter((_, j) => j % k === i));
  if (models) {
    // one Twinmotion-based model per species, varied by yaw and scale per instance
    // the Twinmotion layout places them at their modelled size, and many more of them: lighter willows
    const wDetail = fromLayout ? detail * WILLOW_LAYOUT_DETAIL : detail;
    if (willows.length) {
      const g = willowTM(models.willow, r, wDetail, fromLayout ? 1 : undefined);
      instance(g.bark, M.tmWillowBark, willows, true);
      instance(g.leaves, M.willow, willows, true);
      const proxy = instance(crownProxy(g.leaves), crownPack(), willows, true);
      if (proxy) proxy.receiveShadow = false;
    }
    if (poplars.length) { const g = poplarTM(models.poplar, fromLayout ? 1 : undefined, fromLayout && mobile ? 0.5 : 1);instance(g.bark, M.tmPoplarBark, poplars, true); instance(g.leaves, M.tmPoplarLeaf, poplars, true); }
  } else {
    split(willows, 2).forEach((list) => { if (!list.length) return; const g = willow(r, detail); instance(g.bark, M.bark, list, true); instance(g.leaves, M.willow, list, true); });
    split(poplars, 2).forEach((list) => { if (!list.length) return; const g = poplar(r, detail); instance(g.bark, M.bark, list, true); instance(g.leaves, M.poplar, list, true); });
  }
  split(reeds, 4).forEach((list) => { if (!list.length) return; const g = reed(r, 'reed'); instance(g.stem, M.stem, list, false); instance(g.leaves, M.blade, list, false); instance(g.plume, M.plume, list, false); });
  split(cattails, 2).forEach((list) => { if (!list.length) return; const g = reed(r, 'cattail'); instance(g.stem, M.stem, list, false); instance(g.leaves, M.blade, list, false); });

  const centroid = (list) => {
    if (!list.length) return null;
    const c = new THREE.Vector3();
    list.forEach((p) => c.add(new THREE.Vector3(p.x, p.y + 1.5, p.z)));
    return c.divideScalar(list.length);
  };
  return {
    counts: { reeds: reeds.length, cattails: cattails.length, willows: willows.length, poplars: poplars.length, plantedOnPier: [...willows, ...poplars].filter((p) => p.onPier).length, triangles: Math.round(totalTris) },
    // where the reeds stand and when they sprout: the river's current is broken by them
    reedSpots: [...reeds, ...cattails].map((p) => [p.x, p.z, p.grow[0]]),
    reedCentre: centroid(reeds.filter((p) => p.grow[0] < 3)),
    decayCentre: centroid(willows.filter((p) => p.grow[0] > 3)),
  };
}

// single trees for side-by-side previews (tools/tree-preview.html)
export const species = { willow, poplar, willowTM, poplarTM, willowLeafTexture, poplarLeafTexture, barkTexture };
