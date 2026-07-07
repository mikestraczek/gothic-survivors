import * as THREE from 'three';

const CAP = 600;

// XP-Stufen: je wertvoller der Gegner, desto höher die Stufe (Farbe + Größe).
const GEM_TIERS = [
  { max: 2, color: 0x9dff8a, scale: 0.9 }, // hellgrün
  { max: 5, color: 0x3dff5a, scale: 1.05 }, // grün
  { max: 9, color: 0x3db0ff, scale: 1.2 }, // blau
  { max: 16, color: 0xb060ff, scale: 1.4 }, // violett
  { max: 45, color: 0xffcf3a, scale: 1.65 }, // gold
  { max: Infinity, color: 0xff3a3a, scale: 2.1 }, // purpurrot (Boss)
];
function gemTier(v) {
  for (let i = 0; i < GEM_TIERS.length; i++) if (v <= GEM_TIERS[i].max) return i;
  return GEM_TIERS.length - 1;
}

// XP-Edelsteine als InstancedMesh; sammeln per Magnet im Aufnahmeradius.
export class GemManager {
  constructor(scene, world) {
    this.world = world;
    this.gems = [];
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._s = new THREE.Vector3();
    this._p = new THREE.Vector3();
    this._up = new THREE.Vector3(0, 1, 0);

    const geo = new THREE.OctahedronGeometry(0.28, 0);
    // MeshBasicMaterial: die Instanz-Farbe wird direkt sichtbar (kein weißes
    // emissive, das alles überstrahlt) -> echte farbige Edelsteine + Bloom.
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.mesh = new THREE.InstancedMesh(geo, mat, CAP);
    this.mesh.count = 0;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.setColorAt(0, new THREE.Color(1, 1, 1));
    this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    scene.add(this.mesh);

    this._tierColors = GEM_TIERS.map((t) => new THREE.Color(t.color));
    this._tierScales = GEM_TIERS.map((t) => t.scale);
    this.elapsed = 0;
  }

  reset() {
    for (const g of this.gems) g.alive = false;
    this.mesh.count = 0;
  }

  // ---- Multiplayer ----
  snapshot() {
    const o = [];
    for (const g of this.gems) {
      if (!g.alive) continue;
      o.push(Math.round(g.x * 10) / 10, Math.round(g.z * 10) / 10, gemTier(g.value));
    }
    return o;
  }
  applySnapshot(arr, dt) {
    this.elapsed += dt;
    const cols = this._tierColors;
    const scs = this._tierScales;
    let idx = 0;
    for (let i = 0; i + 2 < arr.length; i += 3) {
      if (idx >= CAP) break;
      const x = arr[i];
      const z = arr[i + 1];
      const tier = arr[i + 2];
      this._q.setFromAxisAngle(this._up, this.elapsed * 2 + idx);
      this._p.set(x, this.world.getHeight(x, z) + 0.5 + Math.sin(this.elapsed * 3 + idx) * 0.12, z);
      this._s.setScalar(scs[tier] || 1);
      this._m.compose(this._p, this._q, this._s);
      this.mesh.setMatrixAt(idx, this._m);
      this.mesh.setColorAt(idx, cols[tier] || cols[0]);
      idx++;
    }
    this.mesh.count = idx;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  spawn(x, z, value) {
    let g = this.gems.find((q) => !q.alive);
    if (!g) {
      if (this.gems.length >= CAP) return;
      g = {};
      this.gems.push(g);
    }
    g.alive = true;
    g.x = x;
    g.z = z;
    g.y = this.world.getHeight(x, z) + 0.5;
    g.value = value;
    g.magnet = false;
    g.rush = false;
    g.phase = Math.random() * 6;
    const tier = gemTier(value);
    g.color = this._tierColors[tier];
    g.scale = this._tierScales[tier];
  }

  // alle Gems anziehen (z. B. nach Level-Up Bonus) – optional
  attractAll() {
    // kartenweit einsaugen: mit normalem Tempo (16) kämen ferne Gems nie an
    for (const g of this.gems) if (g.alive) { g.magnet = true; g.rush = true; }
  }

  update(dt, players, onCollect) {
    this.elapsed += dt;
    let idx = 0;
    for (const g of this.gems) {
      if (!g.alive) continue;
      // nächsten Spieler bestimmen
      let tp = null;
      let dd = Infinity;
      for (const p of players) {
        if (!p.alive) continue;
        const d = (p.position.x - g.x) ** 2 + (p.position.z - g.z) ** 2;
        if (d < dd) {
          dd = d;
          tp = p;
        }
      }
      if (tp && !g.magnet && dd < tp.pickupRadius * tp.pickupRadius) g.magnet = true;

      if (g.magnet && tp) {
        const dx = tp.position.x - g.x;
        const dz = tp.position.z - g.z;
        const d = Math.sqrt(dd) || 1;
        const speed = g.rush ? 70 : 16;
        g.x += (dx / d) * speed * dt;
        g.z += (dz / d) * speed * dt;
        g.y += (tp.position.y + 0.8 - g.y) * Math.min(1, dt * 8);
        if (dd < 1.0) {
          g.alive = false;
          onCollect(g.value, tp);
          continue;
        }
      } else {
        g.y = this.world.getHeight(g.x, g.z) + 0.5 + Math.sin(this.elapsed * 3 + g.phase) * 0.12;
      }

      if (idx < CAP) {
        this._q.setFromAxisAngle(this._up, this.elapsed * 2 + g.phase);
        this._p.set(g.x, g.y, g.z);
        this._s.setScalar(g.scale);
        this._m.compose(this._p, this._q, this._s);
        this.mesh.setMatrixAt(idx, this._m);
        this.mesh.setColorAt(idx, g.color);
        idx++;
      }
    }
    this.mesh.count = idx;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}
