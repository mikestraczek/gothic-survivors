import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const MAX_PER_TYPE = 340;
const HARD_CAP = 320; // mehr Gegner gleichzeitig

// ---- Geometrie-Helfer (Vertex-Farbe gebacken, Front = +Z) ----
function colored(geo, hex) {
  const c = new THREE.Color(hex);
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = c.r;
    arr[i * 3 + 1] = c.g;
    arr[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(arr, 3));
  geo.deleteAttribute('uv');
  return geo;
}
function part(geo, hex, [px, py, pz] = [0, 0, 0], rot = null, scale = null) {
  if (scale) geo.scale(scale[0], scale[1], scale[2]);
  if (rot) {
    if (rot[0]) geo.rotateX(rot[0]);
    if (rot[1]) geo.rotateY(rot[1]);
    if (rot[2]) geo.rotateZ(rot[2]);
  }
  geo.translate(px, py, pz);
  return colored(geo, hex);
}
const sph = (r, c, p, s) => part(new THREE.SphereGeometry(r, 12, 9), c, p, null, s);
const cyl = (rt, rb, h, c, p, rot) => part(new THREE.CylinderGeometry(rt, rb, h, 8), c, p, rot);
const cone = (r, h, c, p, rot, seg = 7) => part(new THREE.ConeGeometry(r, h, seg), c, p, rot);

// --- Scavenger (aasfressender Laufvogel) ---
function geoScavenger() {
  return mergeGeometries([
    sph(0.46, 0x6a5236, [0, 0.78, 0], [1, 0.92, 1.4]),
    sph(0.34, 0x7a6346, [0, 0.62, 0.35], [0.9, 0.7, 0.9]),
    cyl(0.1, 0.17, 0.62, 0x5a4630, [0, 1.06, 0.32], [0.7, 0, 0]),
    sph(0.2, 0x4a3826, [0, 1.44, 0.5]),
    cone(0.1, 0.5, 0xd8b84a, [0, 1.42, 0.84], [Math.PI / 2, 0, 0], 6),
    sph(0.06, 0x8a1818, [0.1, 0.5, 0.62].map((v, i) => (i === 0 ? 0.1 : i === 1 ? 1.5 : 0.62))),
    sph(0.06, 0x8a1818, [-0.1, 1.5, 0.62]),
    cone(0.24, 0.62, 0x5a4630, [0, 0.86, -0.66], [-1.25, 0, 0], 6),
    cyl(0.05, 0.05, 0.7, 0xb8a040, [0.18, 0.35, 0]),
    cyl(0.05, 0.05, 0.7, 0xb8a040, [-0.18, 0.35, 0]),
    sph(0.18, 0x5f4a30, [0.42, 0.82, -0.05], [0.3, 0.7, 1.1]),
    sph(0.18, 0x5f4a30, [-0.42, 0.82, -0.05], [0.3, 0.7, 1.1]),
  ]);
}

// --- Blutfliege (riesiges fliegendes Insekt) ---
function geoBloodfly() {
  return mergeGeometries([
    sph(0.34, 0x2c3a26, [0, 0, 0.1]),
    sph(0.32, 0x1f2a16, [0, 0, -0.6], [0.9, 0.9, 1.7]),
    sph(0.24, 0x32422a, [0, 0.06, 0.5]),
    sph(0.11, 0xd83020, [0.14, 0.12, 0.62]),
    sph(0.11, 0xd83020, [-0.14, 0.12, 0.62]),
    part(new THREE.BoxGeometry(0.95, 0.03, 0.5), 0xc2d6c2, [0.55, 0.3, -0.02], [0, 0, 0.45]),
    part(new THREE.BoxGeometry(0.95, 0.03, 0.5), 0xc2d6c2, [-0.55, 0.3, -0.02], [0, 0, -0.45]),
    part(new THREE.BoxGeometry(0.7, 0.03, 0.4), 0xa8c0aa, [0.45, 0.18, -0.45], [0, 0.3, 0.3]),
    part(new THREE.BoxGeometry(0.7, 0.03, 0.4), 0xa8c0aa, [-0.45, 0.18, -0.45], [0, -0.3, -0.3]),
    cone(0.09, 0.55, 0x14180f, [0, -0.02, -1.3], [-Math.PI / 2, 0, 0], 5),
  ]);
}

// --- Schattenwolf (Snapper-artig) ---
function geoWolf() {
  const parts = [
    sph(0.5, 0x44413c, [0, 0.62, 0], [1, 0.85, 1.5]),
    sph(0.3, 0x3a3632, [0, 0.74, 0.72]),
    cone(0.18, 0.4, 0x2e2a26, [0, 0.66, 1.02], [Math.PI / 2, 0, 0], 6),
    cone(0.1, 0.28, 0x24201c, [0.15, 0.98, 0.66], [-0.2, 0, 0.2], 4),
    cone(0.1, 0.28, 0x24201c, [-0.15, 0.98, 0.66], [-0.2, 0, -0.2], 4),
    sph(0.05, 0xc83018, [0.13, 0.78, 0.92]),
    sph(0.05, 0xc83018, [-0.13, 0.78, 0.92]),
    cone(0.12, 0.7, 0x44413c, [0, 0.66, -0.85], [-1.3, 0, 0], 6),
  ];
  for (const sx of [0.24, -0.24]) for (const sz of [0.48, -0.48]) parts.push(cyl(0.1, 0.07, 0.62, 0x383430, [sx, 0.3, sz]));
  return mergeGeometries(parts);
}

// --- Molerat ---
function geoMolerat() {
  const parts = [
    sph(0.58, 0x7a6a58, [0, 0.52, 0], [1.25, 0.78, 1.5]),
    cone(0.42, 0.72, 0x6a5a48, [0, 0.5, 0.7], [Math.PI / 2, 0, 0], 9),
    cone(0.07, 0.3, 0xe8e0c8, [0.11, 0.4, 1.02], [Math.PI / 2, 0, 0], 4),
    cone(0.07, 0.3, 0xe8e0c8, [-0.11, 0.4, 1.02], [Math.PI / 2, 0, 0], 4),
    sph(0.04, 0x301810, [0.13, 0.62, 0.78]),
    sph(0.04, 0x301810, [-0.13, 0.62, 0.78]),
  ];
  for (const sx of [0.36, -0.36]) for (const sz of [0.34, -0.34]) parts.push(cyl(0.09, 0.06, 0.4, 0x5a4a38, [sx, 0.2, sz]));
  return mergeGeometries(parts);
}

// --- Skelett (Untoter) ---
function geoSkeleton() {
  const bone = 0xd8d0b8;
  const dark = 0xb6ad94;
  return mergeGeometries([
    sph(0.21, bone, [0, 1.62, 0.02]),
    part(new THREE.BoxGeometry(0.26, 0.1, 0.2), dark, [0, 1.46, 0.06]),
    sph(0.05, 0x202018, [0.08, 1.64, 0.18]),
    sph(0.05, 0x202018, [-0.08, 1.64, 0.18]),
    sph(0.3, bone, [0, 1.16, 0], [1.1, 1.3, 0.7]),
    cyl(0.05, 0.05, 0.45, dark, [0, 1.45, 0]),
    part(new THREE.BoxGeometry(0.36, 0.16, 0.22), bone, [0, 0.82, 0]),
    cyl(0.06, 0.05, 0.62, dark, [0.3, 1.15, 0.04], [0.3, 0, 0.25]),
    cyl(0.06, 0.05, 0.62, dark, [-0.3, 1.15, 0.04], [0.3, 0, -0.25]),
    cyl(0.07, 0.06, 0.78, bone, [0.13, 0.44, 0]),
    cyl(0.07, 0.06, 0.78, bone, [-0.13, 0.44, 0]),
    part(new THREE.BoxGeometry(0.05, 0.95, 0.13), 0x8a8378, [0.36, 1.0, 0.18], [0.2, 0, 0]),
  ]);
}

// --- Ghul (verrottender Humanoid) ---
function geoGhoul() {
  return mergeGeometries([
    sph(0.42, 0x46583a, [0, 1.02, 0.05], [1.1, 1.3, 0.8]),
    sph(0.25, 0x7a8a5a, [0, 1.55, 0.12]),
    sph(0.05, 0xd0c020, [0.1, 1.57, 0.3]),
    sph(0.05, 0xd0c020, [-0.1, 1.57, 0.3]),
    cyl(0.1, 0.08, 0.85, 0x3e4a30, [0.42, 1.0, 0.12], [0.5, 0, 0.15]),
    cyl(0.1, 0.08, 0.85, 0x3e4a30, [-0.42, 1.0, 0.12], [0.5, 0, -0.15]),
    cyl(0.11, 0.09, 0.8, 0x33402a, [0.16, 0.4, 0]),
    cyl(0.11, 0.09, 0.8, 0x33402a, [-0.16, 0.4, 0]),
  ]);
}

// --- Schattenläufer (Boss) ---
function geoShadowbeast() {
  const dark = 0x2a2238;
  const parts = [
    sph(0.95, dark, [0, 1.85, 0], [1.5, 1.7, 1.2]),
    sph(0.62, 0x3a2e4e, [0, 2.95, 0.4]),
    cone(0.2, 1.35, 0xc8bca0, [0.42, 3.25, 0.3], [-0.5, 0, 0.3], 6),
    cone(0.2, 1.35, 0xc8bca0, [-0.42, 3.25, 0.3], [-0.5, 0, -0.3], 6),
    sph(0.14, 0xff2a18, [0.26, 2.95, 0.95]),
    sph(0.14, 0xff2a18, [-0.26, 2.95, 0.95]),
    cyl(0.32, 0.26, 1.8, 0x241d30, [1.15, 1.7, 0.1], [0.2, 0, 0.1]),
    cyl(0.32, 0.26, 1.8, 0x241d30, [-1.15, 1.7, 0.1], [0.2, 0, -0.1]),
    cyl(0.36, 0.3, 1.4, 0x1e1828, [0.5, 0.7, 0]),
    cyl(0.36, 0.3, 1.4, 0x1e1828, [-0.5, 0.7, 0]),
  ];
  return mergeGeometries(parts);
}

// --- Wasserspeier (fliegender Stein-Tank) ---
function geoGargoyle() {
  return mergeGeometries([
    sph(0.5, 0x6a6a74, [0, 0.85, 0], [1, 0.9, 1]),
    sph(0.3, 0x5a5a64, [0, 1.4, 0.15]),
    cone(0.12, 0.42, 0x7c7c88, [0.18, 1.66, 0.1], [-0.2, 0, 0.2], 4),
    cone(0.12, 0.42, 0x7c7c88, [-0.18, 1.66, 0.1], [-0.2, 0, -0.2], 4),
    sph(0.06, 0xffaa20, [0.12, 1.45, 0.34]),
    sph(0.06, 0xffaa20, [-0.12, 1.45, 0.34]),
    part(new THREE.BoxGeometry(1.4, 0.06, 0.8), 0x53535d, [0.85, 1.05, -0.2], [0, 0.35, 0.5]),
    part(new THREE.BoxGeometry(1.4, 0.06, 0.8), 0x53535d, [-0.85, 1.05, -0.2], [0, -0.35, -0.5]),
    cyl(0.12, 0.1, 0.5, 0x5a5a64, [0.22, 0.4, 0]),
    cyl(0.12, 0.1, 0.5, 0x5a5a64, [-0.22, 0.4, 0]),
  ]);
}

// --- Dämon (gehörnter Höllen-Humanoid) ---
function geoDemon() {
  return mergeGeometries([
    sph(0.5, 0x8a2a20, [0, 1.1, 0], [1, 1.3, 0.72]),
    sph(0.28, 0x9a3326, [0, 1.78, 0.08]),
    cone(0.1, 0.48, 0xe8d8c0, [0.18, 2.05, 0], [-0.35, 0, 0.35], 5),
    cone(0.1, 0.48, 0xe8d8c0, [-0.18, 2.05, 0], [-0.35, 0, -0.35], 5),
    sph(0.05, 0xffd020, [0.1, 1.8, 0.27]),
    sph(0.05, 0xffd020, [-0.1, 1.8, 0.27]),
    cyl(0.14, 0.1, 0.95, 0x6e2018, [0.44, 1.12, 0.06], [0.4, 0, 0.18]),
    cyl(0.14, 0.1, 0.95, 0x6e2018, [-0.44, 1.12, 0.06], [0.4, 0, -0.18]),
    cyl(0.16, 0.12, 0.88, 0x6e2018, [0.18, 0.42, 0]),
    cyl(0.16, 0.12, 0.88, 0x6e2018, [-0.18, 0.42, 0]),
  ]);
}

// --- Troll (großer, langsamer Brocken) ---
function geoTroll() {
  return mergeGeometries([
    sph(0.72, 0x5a6a3a, [0, 1.3, 0], [1.2, 1.3, 1]),
    sph(0.32, 0x6a7a48, [0, 2.0, 0.1]),
    sph(0.05, 0xd0c020, [0.13, 2.04, 0.32]),
    sph(0.05, 0xd0c020, [-0.13, 2.04, 0.32]),
    cone(0.05, 0.22, 0xe8e0c8, [0.09, 1.86, 0.34], [Math.PI / 2, 0, 0], 4),
    cone(0.05, 0.22, 0xe8e0c8, [-0.09, 1.86, 0.34], [Math.PI / 2, 0, 0], 4),
    cyl(0.24, 0.18, 1.35, 0x4a5a30, [0.72, 1.3, 0.05], [0.3, 0, 0.12]),
    cyl(0.24, 0.18, 1.35, 0x4a5a30, [-0.72, 1.3, 0.05], [0.3, 0, -0.12]),
    cyl(0.26, 0.2, 1.0, 0x4a5a30, [0.26, 0.5, 0]),
    cyl(0.26, 0.2, 1.0, 0x4a5a30, [-0.26, 0.5, 0]),
  ]);
}

// Reihenfolge der Typen (Index = Snapshot-Code) — nur anhängen, nie umsortieren!
export const ETYPE_KEYS = [
  'scavenger', 'bloodfly', 'wolf', 'molerat', 'skeleton', 'ghoul', 'boss',
  'gargoyle', 'demon', 'troll', 'boss_bone', 'boss_demon',
];

// Bosse, die in Abständen rotierend erscheinen
const BOSS_TYPES = ['boss', 'boss_bone', 'boss_demon'];
const BOSS_NAMES = { boss: 'SCHATTENLÄUFER', boss_bone: 'KNOCHENKÖNIG', boss_demon: 'ERZDÄMON' };

const ETYPES = {
  scavenger: { proc: geoScavenger, hp: 9, speed: 2.6, dmg: 6, radius: 0.55, scale: 1.05, xp: 1, gold: 0.05 },
  bloodfly: { proc: geoBloodfly, hp: 7, speed: 3.0, dmg: 7, radius: 0.5, scale: 0.95, xp: 2, gold: 0.07, fly: true },
  wolf: { proc: geoWolf, hp: 20, speed: 3.5, dmg: 9, radius: 0.6, scale: 1.15, xp: 3, gold: 0.09 },
  molerat: { proc: geoMolerat, hp: 32, speed: 2.2, dmg: 11, radius: 0.8, scale: 1.1, xp: 4, gold: 0.1 },
  skeleton: { proc: geoSkeleton, hp: 46, speed: 2.5, dmg: 12, radius: 0.6, scale: 1.15, xp: 6, gold: 0.14 },
  ghoul: { proc: geoGhoul, hp: 64, speed: 2.3, dmg: 15, radius: 0.7, scale: 1.2, xp: 9, gold: 0.18 },
  // Spät-Gegner (tankiger, mehr XP)
  gargoyle: { proc: geoGargoyle, hp: 85, speed: 2.7, dmg: 15, radius: 0.7, scale: 1.3, xp: 9, gold: 0.22, fly: true },
  demon: { proc: geoDemon, hp: 110, speed: 3.1, dmg: 18, radius: 0.7, scale: 1.5, xp: 13, gold: 0.28 },
  troll: { proc: geoTroll, hp: 190, speed: 1.8, dmg: 24, radius: 1.1, scale: 1.9, xp: 18, gold: 0.45 },
  // Bosse
  boss: { proc: geoShadowbeast, hp: 1300, speed: 2.0, dmg: 26, radius: 2.0, scale: 1.0, xp: 60, gold: 5, boss: true },
  boss_bone: { proc: geoSkeleton, hp: 1600, speed: 2.2, dmg: 28, radius: 1.8, scale: 3.4, xp: 75, gold: 6, boss: true },
  boss_demon: { proc: geoDemon, hp: 2000, speed: 2.4, dmg: 32, radius: 1.9, scale: 3.0, xp: 90, gold: 7, boss: true },
};

export class EnemyManager {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.enemies = [];
    this.meshes = {};
    this._tmpM = new THREE.Matrix4();
    this._tmpQ = new THREE.Quaternion();
    this._tmpE = new THREE.Euler();
    this._white = new THREE.Color(1, 1, 1);
    this._flash = new THREE.Color(2.6, 0.6, 0.6);
    this._col = { x: 0, z: 0 };

    for (const key of ETYPE_KEYS) {
      const def = ETYPES[key];
      const geo = def.proc();
      geo.computeVertexNormals();
      const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0.0 });
      const cap = def.boss ? 8 : MAX_PER_TYPE;
      const im = new THREE.InstancedMesh(geo, mat, cap);
      im.castShadow = true;
      im.count = 0;
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.frustumCulled = false;
      im.setColorAt(0, this._white);
      im.instanceColor.setUsage(THREE.DynamicDrawUsage);
      scene.add(im);
      this.meshes[key] = im;
    }

    this.spawnTimer = 1.0;
    this.bossTimer = 90;
    this.elapsed = 0;
    this.totalKills = 0;
    this._seed = 24680;
    this._bossIndex = 0;
    this.bossAnnounce = null; // vom Game gesetzt (Toast)
    this._nextId = 1; // stabile IDs für Multiplayer-Interpolation
    this._ghosts = new Map(); // Client: id -> interpolierter Gegner
    this._ghostGen = 0;
    this.diff = 1; // Schwierigkeits-Multiplikator
    this.phase = 0; // aktuelle Phase (Intensität)
    this.autoBoss = false; // periodische Bosse aus -> Game steuert finalen Boss
    this.spawnEnabled = true;
  }

  reset() {
    for (const e of this.enemies) e.alive = false;
    for (const key of ETYPE_KEYS) this.meshes[key].count = 0;
    this.spawnTimer = 1.0;
    this.bossTimer = 90;
    this.elapsed = 0;
    this.totalKills = 0;
    this._bossIndex = 0;
    this._nextId = 1;
    this._ghosts.clear();
    this.phase = 0;
    this.spawnEnabled = true;
  }
  setDifficulty(d) {
    this.diff = d;
  }

  _rnd() {
    this._seed = (this._seed * 16807) % 2147483647;
    return this._seed / 2147483647;
  }

  get aliveCount() {
    let n = 0;
    for (const e of this.enemies) if (e.alive) n++;
    return n;
  }

  _scaleFactor() {
    const m = this.elapsed / 60;
    const ph = 1 + this.phase * 0.22;
    return {
      hp: (1 + m * 0.28 + m * m * 0.008) * this.diff * ph,
      dmg: (1 + m * 0.1) * this.diff * (1 + this.phase * 0.06),
      speed: 1 + Math.min(0.22, m * 0.022),
    };
  }

  _typePool() {
    const t = this.elapsed;
    const pool = ['scavenger', 'scavenger'];
    if (t > 20) pool.push('bloodfly');
    if (t > 40) pool.push('wolf');
    if (t > 70) pool.push('molerat');
    if (t > 100) pool.push('skeleton', 'wolf');
    if (t > 150) pool.push('ghoul', 'skeleton');
    if (t > 180) pool.push('gargoyle');
    if (t > 220) pool.push('demon', 'ghoul');
    if (t > 270) pool.push('troll', 'demon');
    if (t > 330) pool.push('troll', 'gargoyle', 'demon');
    return pool;
  }

  spawn(type, x, z) {
    if (this.aliveCount >= HARD_CAP) return null;
    const def = ETYPES[type];
    const sf = this._scaleFactor();
    let e = this.enemies.find((en) => !en.alive);
    if (!e) {
      e = {};
      this.enemies.push(e);
    }
    e.type = type;
    e.def = def;
    e.maxHp = Math.round(def.hp * (def.boss ? 1 + this.elapsed / 120 : sf.hp));
    e.hp = e.maxHp;
    e.speed = def.speed * sf.speed;
    e.dmg = Math.round(def.dmg * sf.dmg);
    e.radius = def.radius;
    e.scale = def.scale;
    e.x = x;
    e.z = z;
    e.y = this.world.getHeight(x, z);
    e.alive = true;
    e.flash = 0;
    e.phase = this._rnd() * 10;
    e.kx = 0;
    e.kz = 0;
    e._dx = 0;
    e._dz = 1;
    e.slow = 0;
    e.id = this._nextId++;
    return e;
  }

  // Finaler Boss (verstärkt) — vom Game nach der letzten Phase gerufen
  spawnFinalBoss(type, cx, cz, hpMult = 2.2) {
    const e = this.spawnRing(type, cx, cz) || this.spawn(type, cx, cz);
    if (e) {
      e.maxHp = Math.round(e.maxHp * hpMult);
      e.hp = e.maxHp;
      e.final = true;
    }
    if (this.bossAnnounce) this.bossAnnounce(BOSS_NAMES[type] || 'BOSS');
    return e;
  }

  spawnRing(type, cx, cz) {
    for (let tries = 0; tries < 6; tries++) {
      const a = this._rnd() * Math.PI * 2;
      const dist = 17 + this._rnd() * 7;
      const x = cx + Math.cos(a) * dist;
      const z = cz + Math.sin(a) * dist;
      if (Math.hypot(x, z) < this.world.barrierRadius - 6) return this.spawn(type, x, z);
    }
    return null;
  }

  // Spawn um den/die Spieler herum (Liste von {x,z})
  _spawnAround(centers) {
    const c = centers[Math.floor(this._rnd() * centers.length)];
    return this.spawnRing(this._curType(), c.x, c.z);
  }
  _curType() {
    const pool = this._typePool();
    return pool[Math.floor(this._rnd() * pool.length)];
  }

  // centers = Liste der Spielerpositionen (Singleplayer: 1, Koop: 2)
  update(dt, players, onKill) {
    this.elapsed += dt;
    const centers = players.map((p) => p.position);
    const anyAlive = players.some((p) => p.alive && !p.dead);

    if (anyAlive && this.spawnEnabled) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0 && this.aliveCount < HARD_CAP) {
        this.spawnTimer = Math.max(0.3, (1.1 - this.elapsed / 200) / this.diff);
        const batch = Math.round(Math.min(8, 1 + Math.floor(this.elapsed / 40) + this.phase) * this.diff) * players.length;
        for (let i = 0; i < batch && this.aliveCount < HARD_CAP; i++) this._spawnAround(centers);
      }
    }
    if (anyAlive && this.autoBoss) {
      this.bossTimer -= dt;
      if (this.bossTimer <= 0) {
        this.bossTimer = 100;
        const c = centers[Math.floor(this._rnd() * centers.length)];
        const type = BOSS_TYPES[this._bossIndex % BOSS_TYPES.length];
        this._bossIndex++;
        this.spawnRing(type, c.x, c.z);
        if (this.bossAnnounce) this.bossAnnounce(BOSS_NAMES[type] || 'BOSS');
      }
    }

    // Separations-Grid
    const cell = 1.6;
    const grid = new Map();
    const key = (cx, cz) => cx + ',' + cz;
    for (let i = 0; i < this.enemies.length; i++) {
      const e = this.enemies[i];
      if (!e.alive) continue;
      const k = key(Math.floor(e.x / cell), Math.floor(e.z / cell));
      let arr = grid.get(k);
      if (!arr) grid.set(k, (arr = []));
      arr.push(i);
    }

    const maxR = this.world.barrierRadius - 4;

    for (const e of this.enemies) {
      if (!e.alive) continue;
      // nächsten lebenden Spieler anvisieren
      let tx = 0;
      let tz = 0;
      let bd = Infinity;
      let target = null;
      for (const p of players) {
        if (!p.alive || p.dead) continue;
        const d = (p.position.x - e.x) ** 2 + (p.position.z - e.z) ** 2;
        if (d < bd) {
          bd = d;
          target = p;
        }
      }
      if (target) {
        tx = target.position.x;
        tz = target.position.z;
      } else {
        tx = e.x;
        tz = e.z;
      }
      let dx = tx - e.x;
      let dz = tz - e.z;
      const d = Math.hypot(dx, dz) || 1;
      dx /= d;
      dz /= d;
      e._dx = dx;
      e._dz = dz;

      let sepX = 0;
      let sepZ = 0;
      const cx = Math.floor(e.x / cell);
      const cz = Math.floor(e.z / cell);
      for (let ox = -1; ox <= 1; ox++) {
        for (let oz = -1; oz <= 1; oz++) {
          const arr = grid.get(key(cx + ox, cz + oz));
          if (!arr) continue;
          for (const j of arr) {
            const o = this.enemies[j];
            if (o === e || !o.alive) continue;
            const ddx = e.x - o.x;
            const ddz = e.z - o.z;
            const dd = ddx * ddx + ddz * ddz;
            const min = e.radius + o.radius;
            if (dd < min * min && dd > 0.0001) {
              const dl = Math.sqrt(dd);
              sepX += (ddx / dl) * (min - dl);
              sepZ += (ddz / dl) * (min - dl);
            }
          }
        }
      }

      const spd = e.slow > 0 ? e.speed * 0.5 : e.speed;
      if (e.slow > 0) e.slow -= dt;
      e.x += (dx * spd + e.kx) * dt + Math.max(-0.5, Math.min(0.5, sepX * 0.5));
      e.z += (dz * spd + e.kz) * dt + Math.max(-0.5, Math.min(0.5, sepZ * 0.5));
      e.kx *= 1 - Math.min(1, dt * 8);
      e.kz *= 1 - Math.min(1, dt * 8);

      if (e.def.fly) {
        const r = Math.hypot(e.x, e.z);
        if (r > maxR) {
          e.x *= maxR / r;
          e.z *= maxR / r;
        }
      } else {
        this._col.x = e.x;
        this._col.z = e.z;
        this.world.resolve(this._col, e.radius);
        e.x = this._col.x;
        e.z = this._col.z;
      }

      e.y = this.world.getHeight(e.x, e.z);
      if (e.flash > 0) e.flash -= dt;

      // Kontaktschaden am nächsten Spieler
      if (target) {
        const distToP = Math.hypot(target.position.x - e.x, target.position.z - e.z);
        if (distToP < e.radius + target.radius + 0.2) target.takeDamage(e.dmg);
      }
    }

    this._render();
  }

  _render() {
    this._renderList(this.enemies, true);
  }

  _renderList(list, needAlive) {
    const counters = {};
    for (const key of ETYPE_KEYS) counters[key] = 0;

    for (const e of list) {
      if (needAlive && !e.alive) continue;
      const mesh = this.meshes[e.type];
      const idx = counters[e.type];
      if (idx >= mesh.instanceMatrix.count) continue;
      const def = e.def;
      const ph = this.elapsed * (def.fly ? 16 : 8) + e.phase;
      let y = e.y;
      let pitch = 0;
      let roll = 0;
      let squash = 1;
      if (def.fly) {
        y += 1.5 + Math.sin(ph) * 0.25;
        roll = Math.sin(ph * 0.5) * 0.16;
      } else {
        const b = Math.sin(ph);
        y += Math.abs(b) * 0.1 * e.scale;
        pitch = b * 0.06;
        squash = 1 + Math.sin(ph * 2) * 0.03;
      }
      this._tmpE.set(pitch, Math.atan2(e._dx, e._dz), roll);
      this._tmpQ.setFromEuler(this._tmpE);
      this._tmpM.compose({ x: e.x, y, z: e.z }, this._tmpQ, { x: e.scale, y: e.scale * squash, z: e.scale });
      mesh.setMatrixAt(idx, this._tmpM);
      mesh.setColorAt(idx, e.flash > 0 ? this._flash : this._white);
      counters[e.type] = idx + 1;
    }

    for (const key of ETYPE_KEYS) {
      const mesh = this.meshes[key];
      mesh.count = counters[key];
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }

  // ---------- Multiplayer ----------
  // Host: Snapshot [id, typeIdx, x, z, hp255] je lebendem Gegner
  snapshot() {
    const out = [];
    for (const e of this.enemies) {
      if (!e.alive) continue;
      out.push(e.id, ETYPE_KEYS.indexOf(e.type), Math.round(e.x * 20) / 20, Math.round(e.z * 20) / 20, Math.max(0, Math.round((e.hp / e.maxHp) * 255)));
    }
    return out;
  }

  // Client: Snapshot in Ziel-Positionen der Ghosts überführen (id-stabil)
  setSnapshot(arr) {
    this._ghostGen++;
    const gen = this._ghostGen;
    for (let i = 0; i + 4 < arr.length; i += 5) {
      const id = arr[i];
      const type = ETYPE_KEYS[arr[i + 1]];
      const tx = arr[i + 2];
      const tz = arr[i + 3];
      let g = this._ghosts.get(id);
      if (!g) {
        g = { type, def: ETYPES[type], x: tx, z: tz, tx, tz, scale: ETYPES[type].scale, phase: (id * 1.37) % 10, _dx: 0, _dz: 1, flash: 0 };
        this._ghosts.set(id, g);
      }
      g.type = type;
      g.def = ETYPES[type];
      g.scale = g.def.scale;
      g.tx = tx;
      g.tz = tz;
      g.hpFrac = arr[i + 4] / 255;
      g.gen = gen;
    }
    for (const [id, g] of this._ghosts) if (g.gen !== gen) this._ghosts.delete(id);
  }

  // Boss-Anzeige: {name, frac} oder null
  bossInfo(client) {
    if (client) {
      for (const g of this._ghosts.values()) if (g.def && g.def.boss) return { name: BOSS_NAMES[g.type] || 'BOSS', frac: g.hpFrac ?? 1 };
    } else {
      for (const e of this.enemies) if (e.alive && e.def.boss) return { name: BOSS_NAMES[e.type] || 'BOSS', frac: e.hp / e.maxHp };
    }
    return null;
  }

  // Client: jeden Frame interpolieren + rendern (flüssig statt 15-Hz-Sprünge)
  clientRender(dt) {
    this.elapsed += dt;
    const k = Math.min(1, dt * 12);
    const list = [];
    for (const g of this._ghosts.values()) {
      const ddx = g.tx - g.x;
      const ddz = g.tz - g.z;
      if (Math.abs(ddx) + Math.abs(ddz) > 0.002) {
        g._dx = ddx;
        g._dz = ddz;
      }
      g.x += ddx * k;
      g.z += ddz * k;
      g.y = this.world.getHeight(g.x, g.z);
      list.push(g);
    }
    this._ghostList = list;
    this._renderList(list, false);
  }

  get ghostCount() {
    return this._ghosts.size;
  }

  // ---------- Abfragen ----------
  nearest(x, z, maxDist = Infinity) {
    let best = null;
    let bestD = maxDist * maxDist;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const dd = (e.x - x) ** 2 + (e.z - z) ** 2;
      if (dd < bestD) {
        bestD = dd;
        best = e;
      }
    }
    return best;
  }

  inRadius(x, z, r) {
    const out = [];
    const rr = r * r;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      if ((e.x - x) ** 2 + (e.z - z) ** 2 <= rr) out.push(e);
    }
    return out;
  }

  allAlive() {
    return this.enemies.filter((e) => e.alive);
  }

  damage(e, amount, knock, onKill, slow) {
    if (!e.alive) return;
    e.hp -= amount;
    e.flash = 0.12;
    if (slow) e.slow = slow;
    if (knock) {
      e.kx += knock.x;
      e.kz += knock.z;
    }
    if (e.hp <= 0) {
      e.alive = false;
      this.totalKills++;
      if (onKill) onKill(e);
    }
  }
}
