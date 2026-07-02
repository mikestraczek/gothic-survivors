import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { grungeTexture, bumpTexture } from './textures.js';
import { spriteQuad, spriteMaterial, SPRITE_FRAMES } from './spriteart.js';

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
const ENEMY_NAMES = {
  scavenger: 'Aasfresser', bloodfly: 'Blutfliege', wolf: 'Wolf', molerat: 'Maulwurfsratte',
  skeleton: 'Skelett', ghoul: 'Ghul', gargoyle: 'Gargyle', demon: 'Dämon', troll: 'Troll',
  boss: 'Schattenläufer', boss_bone: 'Knochenkönig', boss_demon: 'Erzdämon',
};

const ETYPES = {
  scavenger: { proc: geoScavenger, hp: 9, speed: 2.6, dmg: 6, radius: 0.55, scale: 1.05, xp: 1, gold: 0.05, glow: 0x86b03a },
  bloodfly: { proc: geoBloodfly, hp: 7, speed: 3.0, dmg: 7, radius: 0.5, scale: 0.95, xp: 2, gold: 0.07, fly: true, glow: 0xd02828 },
  wolf: { proc: geoWolf, hp: 20, speed: 3.5, dmg: 9, radius: 0.6, scale: 1.15, xp: 3, gold: 0.09, glow: 0xe08018 },
  molerat: { proc: geoMolerat, hp: 32, speed: 2.2, dmg: 11, radius: 0.8, scale: 1.1, xp: 4, gold: 0.1, glow: 0xc89838 },
  skeleton: { proc: geoSkeleton, hp: 46, speed: 2.5, dmg: 12, radius: 0.6, scale: 1.15, xp: 6, gold: 0.14, glow: 0x9fd8e6 },
  ghoul: { proc: geoGhoul, hp: 64, speed: 2.3, dmg: 15, radius: 0.7, scale: 1.2, xp: 9, gold: 0.18, glow: 0x7ec24a },
  // Spät-Gegner (tankiger, mehr XP)
  gargoyle: { proc: geoGargoyle, hp: 85, speed: 2.7, dmg: 15, radius: 0.7, scale: 1.3, xp: 9, gold: 0.22, fly: true, glow: 0x7aa0d0 },
  demon: { proc: geoDemon, hp: 110, speed: 3.1, dmg: 18, radius: 0.7, scale: 1.5, xp: 13, gold: 0.28, glow: 0xe85018 },
  troll: { proc: geoTroll, hp: 190, speed: 1.8, dmg: 24, radius: 1.1, scale: 1.9, xp: 18, gold: 0.45, glow: 0x58a838 },
  // Bosse
  // Jeder Boss hat ein EIGENES Fähigkeiten-Set (fühlt sich anders an):
  //  Schattenläufer = Nahkämpfer (Slam/Kegel/Festwurzeln), Knochenkönig = Distanz/Bullet-Hell (Kugeln/Nova/Safe-Zonen),
  //  Erzdämon = aggressiver Allrounder (Slam/Nova/Kugeln/Festwurzeln).
  boss: { proc: geoShadowbeast, hp: 1300, speed: 2.0, dmg: 26, radius: 2.0, scale: 2.6, xp: 60, gold: 5, boss: true, glow: 0xb030e0, abilities: ['slam', 'frontal', 'root'] },
  boss_bone: { proc: geoSkeleton, hp: 1600, speed: 2.2, dmg: 28, radius: 1.8, scale: 1.8, xp: 75, gold: 6, boss: true, glow: 0xdce6f0, abilities: ['bolts', 'nova', 'safe'] },
  boss_demon: { proc: geoDemon, hp: 2000, speed: 2.4, dmg: 32, radius: 1.9, scale: 2.0, xp: 90, gold: 7, boss: true, glow: 0xff3a14, abilities: ['slam', 'nova', 'bolts', 'root'] },
};

// Fresnel-Randglühen in der Typ-Farbe per Shader-Injektion.
function addRimGlow(mat, color, strength) {
  const r = (color.r * strength).toFixed(3);
  const g = (color.g * strength).toFixed(3);
  const b = (color.b * strength).toFixed(3);
  mat.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace(
      '#include <dithering_fragment>',
      `float _rim = pow(1.0 - clamp(dot(normalize(vNormal), normalize(vViewPosition)), 0.0, 1.0), 2.5);
       gl_FragColor.rgb += vec3(${r}, ${g}, ${b}) * _rim;
       #include <dithering_fragment>`
    );
  };
}

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

    // HD-2D: jeder Gegner ist ein Billboard-Pixel-Sprite (InstancedMesh je Typ).
    this._buildSpriteMeshes();

    this.spawnTimer = 1.0;
    this.bossTimer = 90;
    this.elapsed = 0;
    this.totalKills = 0;
    this._seed = 24680;
    this._bossIndex = 0;
    this.bossAnnounce = null; // vom Game gesetzt (Toast)
    this.onSafeZones = null; // vom Game gesetzt (Safezone-Warnung)
    this._nextId = 1; // stabile IDs für Multiplayer-Interpolation
    this._ghosts = new Map(); // Client: id -> interpolierter Gegner
    this._ghostGen = 0;
    this.diff = 1; // Schwierigkeits-Multiplikator
    this.phase = 0; // aktuelle Phase (Intensität)
    this.autoBoss = false; // periodische Bosse aus -> Game steuert finalen Boss
    this.spawnEnabled = true;
    this.spawnScale = 1; // <1 während Bossfights, >1 im Endlos-Modus (mehr Adds)
    this.maxAlive = HARD_CAP; // im Endlos-Modus angehoben
    this.coopScale = 1; // Koop: mehr Gegner gleichzeitig
    this.bossInterval = 100; // Sekunden zwischen wiederkehrenden Bossen (Endlos kürzer)
    this.fx = null; // vom Game gesetzt (Boss-Telegraphen)
    this._aoes = []; // telegrafierte Boss-AoE-Angriffe

    // Anti-Kiting: Gegner werden „zornig" (schneller), wenn zu lange niemand getötet wird
    this._sinceKill = 0;
    this._wrath = 1;

    // ---- Boss-Kugeln (dodgebare Projektile) ----
    this._bolts = []; // Host: simuliert (mit Mesh)
    this._boltGhosts = []; // Client: reine Anzeige
    this._boltGeo = new THREE.SphereGeometry(0.45, 12, 10);
    this._boltMat = new THREE.MeshStandardMaterial({ color: 0xff7ad0, emissive: 0xff2a9a, emissiveIntensity: 2.6 });
    this._boltGroup = new THREE.Group();
    this.scene.add(this._boltGroup);
  }

  // HD-2D: Billboard-Pixel-Sprite je Gegnertyp (InstancedMesh)
  _buildSpriteMeshes() {
    for (const key of ETYPE_KEYS) {
      const def = ETYPES[key];
      const cap = def.boss ? 8 : MAX_PER_TYPE;
      const geo = spriteQuad(cap);
      const mat = spriteMaterial(key);
      const im = new THREE.InstancedMesh(geo, mat, cap);
      im.count = 0;
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.frustumCulled = false;
      im.setColorAt(0, this._white);
      im.instanceColor.setUsage(THREE.DynamicDrawUsage);
      this.scene.add(im);
      this.meshes[key] = im;
    }
  }

  // (Sprites werden bereits im Konstruktor gebaut — kein Modell-Laden nötig)
  async loadModels() {}

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
    this.spawnScale = 1;
    this.maxAlive = HARD_CAP;
    this.coopScale = 1;
    this.bossInterval = 100;
    this._aoes = [];
    this.hideBolts();
    this._sinceKill = 0;
    this._wrath = 1;
  }
  setDifficulty(d) {
    this.diff = d;
  }
  // Zorn-Stärke normiert (0 = ruhig, 1 = maximal) — fürs HUD
  wrathFrac() {
    return Math.max(0, Math.min(1, (this._wrath - 1) / 1.6));
  }
  displayName(type) {
    return ENEMY_NAMES[type] || 'einem Gegner';
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

  // Boss spawnen (Mini- oder Endboss). hpMult/sizeMult skalieren ihn; announceName zeigt das Banner.
  spawnBoss(type, cx, cz, hpMult = 1, sizeMult = 1, announceName = null) {
    const e = this.spawnRing(type, cx, cz) || this.spawn(type, cx, cz);
    if (e) {
      e.maxHp = Math.round(e.maxHp * hpMult);
      e.hp = e.maxHp;
      e.scale *= sizeMult;
      e.atk = 2.2;
    }
    if (announceName && this.bossAnnounce) this.bossAnnounce(announceName);
    return e;
  }
  // Rückwärtskompatibel (Resume): finaler Boss
  spawnFinalBoss(type, cx, cz, hpMult = 2.2) {
    const e = this.spawnBoss(type, cx, cz, hpMult, 1.15, 'ENDBOSS');
    if (e) e.final = true;
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

  // Spawn um den/die Spieler herum (Liste von {x,z}) — nie direkt auf/an einem Spieler (auch nicht am Mate)
  _spawnAround(centers) {
    const type = this._curType();
    const minDist = 13;
    for (let tries = 0; tries < 10; tries++) {
      const c = centers[Math.floor(this._rnd() * centers.length)];
      const a = this._rnd() * Math.PI * 2;
      const dist = 17 + this._rnd() * 7;
      const x = c.x + Math.cos(a) * dist;
      const z = c.z + Math.sin(a) * dist;
      if (Math.hypot(x, z) >= this.world.barrierRadius - 6) continue;
      let ok = true;
      for (const p of centers) { if (Math.hypot(x - p.x, z - p.z) < minDist) { ok = false; break; } }
      if (ok) return this.spawn(type, x, z);
    }
    return null;
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

    // Anti-Kiting: „Zorn" steigt, wenn zu lange kein Kill fällt -> Gegner werden schneller.
    // In Boss-Phasen (reduzierter spawnScale) nicht eskalieren. Reset in damage() bei jedem Kill.
    const kiteGuard = anyAlive && this.spawnScale >= 0.9;
    if (kiteGuard) {
      this._sinceKill += dt;
      this._wrath = 1 + Math.min(1.6, Math.max(0, this._sinceKill - 6) * 0.13);
    } else {
      this._sinceKill = 0;
      this._wrath = 1;
    }

    if (anyAlive && this.spawnEnabled) {
      // Konstante Ziel-Population statt immer schnellerer Wellen -> Platz zum Ausweichen
      const cap = this.maxAlive || HARD_CAP;
      const target = Math.min(cap, Math.round((24 + this.phase * 9) * this.diff * this.spawnScale * this.coopScale * (0.7 + 0.3 * players.length)));
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) {
        this.spawnTimer = 0.55;
        let need = target - this.aliveCount;
        if (need > 0) {
          need = Math.min(need, 3 + this.phase); // sanft auffüllen
          for (let i = 0; i < need; i++) this._spawnAround(centers);
        }
      }
    }
    if (anyAlive && this.autoBoss) {
      this.bossTimer -= dt;
      if (this.bossTimer <= 0) {
        this.bossTimer = this.bossInterval || 100;
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

      const spd = (e.slow > 0 ? e.speed * 0.5 : e.speed) * this._wrath;
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
        // Bosse haben einen großen Kollisionsradius (Trennung/Treffer) — für Kontaktschaden aber
        // enger fassen, damit man nur bei echter Berührung getroffen wird, nicht schon aus der Ferne.
        const contactR = e.def.boss ? e.radius * 0.5 : e.radius + 0.2;
        if (distToP < contactR + target.radius) target.takeDamage(e.dmg, e.type);

        // ---- Boss-Fähigkeiten: jeder Boss hat NUR seine eigenen (def.abilities) ----
        if (e.def.boss) {
          const ab = e.def.abilities || ['slam', 'nova', 'frontal', 'safe'];
          // Spezial: sichere Zonen (nur wenn der Boss sie hat)
          if (ab.includes('safe')) {
            e.special = (e.special || 9) - dt;
            if (e.special <= 0) {
              e.special = 12 + this._rnd() * 5;
              const dur = 3.2;
              const spots = [];
              const n = 2 + (this._rnd() < 0.5 ? 0 : 1);
              for (let i = 0; i < n; i++) {
                const ref = players[Math.floor(this._rnd() * players.length)] || target;
                const ang = this._rnd() * Math.PI * 2;
                const dist = 4 + this._rnd() * 8;
                const sx = ref.position.x + Math.cos(ang) * dist;
                const sz = ref.position.z + Math.sin(ang) * dist;
                spots.push({ x: sx, z: sz, r: 3.6 });
                if (this.fx) this.fx.telegraphSafe(sx, sz, 3.6, dur, this.world.getHeight(sx, sz));
              }
              this._aoes.push({ type: 'safe', spots, dmg: Math.round(e.dmg * 2.2), delay: dur, src: e.type });
              if (this.onSafeZones) this.onSafeZones();
            }
          }
          // reguläre Angriffe zyklisch aus dem eigenen Set (ohne 'safe')
          const cyc = e._cyc || (e._cyc = ab.filter((a) => a !== 'safe'));
          if (cyc.length) {
            e.atk = (e.atk || 2) - dt;
            if (e.atk <= 0) {
              e.atk = 2.6 + this._rnd() * 1.6;
              e._ci = ((e._ci == null ? -1 : e._ci) + 1) % cyc.length;
              this._bossAttack(e, cyc[e._ci], target);
            }
          }
        }
      }
    }

    // ---- AoE-Einschläge abarbeiten ----
    if (this._aoes.length) {
      for (const a of this._aoes) {
        a.delay -= dt;
        if (a.delay > 0) continue;
        if (a.type === 'safe') {
          // alle außerhalb JEDER sicheren Zone werden getroffen
          for (const p of players) {
            if (!p.alive || p.dead) continue;
            let safe = false;
            for (const sp of a.spots) {
              if (Math.hypot(p.position.x - sp.x, p.position.z - sp.z) < sp.r) { safe = true; break; }
            }
            if (!safe) {
              p.takeDamage(a.dmg, a.src);
              if (this.fx) this.fx.explosion(p.position.x, p.position.z, 3, 0xff3020);
            }
          }
        } else if (a.type === 'cone') {
          if (this.fx) this.fx.explosion(a.x + a.dx * a.range * 0.5, a.z + a.dz * a.range * 0.5, 3.6, 0xff5a3a);
          for (const p of players) {
            if (!p.alive || p.dead) continue;
            const pdx = p.position.x - a.x, pdz = p.position.z - a.z;
            const d = Math.hypot(pdx, pdz);
            if (d < a.range && d > 0.001 && (pdx / d) * a.dx + (pdz / d) * a.dz > Math.cos(a.half)) p.takeDamage(a.dmg, a.src);
          }
        } else {
          if (this.fx) this.fx.explosion(a.x, a.z, a.r, 0xff5a3a);
          for (const p of players) {
            if (!p.alive || p.dead) continue;
            if (Math.hypot(p.position.x - a.x, p.position.z - a.z) < a.r) p.takeDamage(a.dmg, a.src);
          }
        }
        a.done = true;
      }
      this._aoes = this._aoes.filter((a) => !a.done);
    }

    this._updateBolts(dt, players);
    this._render();
  }

  // Einzelner Boss-Angriff (telegrafiert)
  _bossAttack(e, kind, target) {
    if (kind === 'nova') {
      const r = 6.5;
      this._aoes.push({ type: 'circle', x: e.x, z: e.z, r, dmg: Math.round(e.dmg * 1.3), delay: 1.25, src: e.type });
      if (this.fx) this.fx.telegraph(e.x, e.z, r, 1.25, e.y);
    } else if (kind === 'frontal') {
      let dx = target.position.x - e.x, dz = target.position.z - e.z;
      const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
      const range = 11;
      this._aoes.push({ type: 'cone', x: e.x, z: e.z, dx, dz, range, half: 0.55, dmg: Math.round(e.dmg * 1.4), delay: 1.2, src: e.type });
      if (this.fx) this.fx.telegraphCone(e.x, e.z, dx, dz, range, 1.2, e.y);
    } else if (kind === 'bolts') {
      // Kugelsalve: gezielter 3er-Fächer + radialer Ring — dodgebar durch Wegbewegen
      const dmg = Math.round(e.dmg * 1.1);
      const sp = 9;
      let dx = target.position.x - e.x, dz = target.position.z - e.z;
      const base = Math.atan2(dz, dx);
      for (let i = -1; i <= 1; i++) {
        const ang = base + i * 0.22;
        this._spawnBolt(e.x, e.z, Math.cos(ang) * sp, Math.sin(ang) * sp, dmg, e.type);
      }
      const n = 10;
      for (let i = 0; i < n; i++) {
        const ang = (i / n) * Math.PI * 2;
        this._spawnBolt(e.x, e.z, Math.cos(ang) * sp * 0.8, Math.sin(ang) * sp * 0.8, dmg, e.type);
      }
      if (this.fx) this.fx.sparksBurst(e.x, 1.4, e.z, 0xff7ad0, 12, 5);
    } else if (kind === 'root') {
      // Festwurzeln: löst sich NUR durch Tastenhämmern (~5 Drücke), kein Zeit-Abbau.
      target.rooted = 1.0;
      if (this.fx) {
        this.fx.ring(target.position.x, target.position.z, 2.6, 0x9a6a2a);
        this.fx.sparksBurst(target.position.x, 0.6, target.position.z, 0x7a5020, 12, 3);
      }
    } else {
      // slam: Einschlag auf Spielerposition
      const r = 3.8;
      this._aoes.push({ type: 'circle', x: target.position.x, z: target.position.z, r, dmg: Math.round(e.dmg * 1.6), delay: 1.1, src: e.type });
      if (this.fx) this.fx.telegraph(target.position.x, target.position.z, r, 1.1, target.position.y);
    }
  }

  // ---- Boss-Kugeln: spawnen (Host), simulieren (Host), als Ghosts anzeigen (Client) ----
  _spawnBolt(x, z, vx, vz, dmg, src) {
    let b = this._bolts.find((q) => !q.alive);
    if (!b) {
      const mesh = new THREE.Mesh(this._boltGeo, this._boltMat);
      b = { mesh, alive: false };
      this._bolts.push(b);
      this._boltGroup.add(mesh);
    }
    b.alive = true; b.x = x; b.z = z; b.vx = vx; b.vz = vz; b.dmg = dmg; b.src = src; b.life = 3.2; b.r = 0.5;
    b.mesh.visible = true; b.mesh.position.set(x, this.world.getHeight(x, z) + 1.2, z);
  }
  _updateBolts(dt, players) {
    if (!this._bolts.length) return;
    const maxR = this.world.barrierRadius;
    for (const b of this._bolts) {
      if (!b.alive) continue;
      b.life -= dt;
      b.x += b.vx * dt; b.z += b.vz * dt;
      let hit = false;
      for (const p of players) {
        if (!p.alive || p.dead) continue;
        if (Math.hypot(p.position.x - b.x, p.position.z - b.z) < b.r + p.radius) { p.takeDamage(b.dmg, b.src); hit = true; break; }
      }
      if (hit || b.life <= 0 || Math.hypot(b.x, b.z) > maxR) {
        b.alive = false; b.mesh.visible = false;
        if (hit && this.fx) this.fx.sparksBurst(b.x, this.world.getHeight(b.x, b.z) + 1.2, b.z, 0xff7ad0, 5, 4);
        continue;
      }
      b.mesh.position.set(b.x, this.world.getHeight(b.x, b.z) + 1.2, b.z); // folgt dem Gelände -> nicht im Boden
    }
  }
  boltSnapshot() {
    const out = [];
    for (const b of this._bolts) if (b.alive) out.push([Math.round(b.x * 10) / 10, Math.round(b.z * 10) / 10]);
    return out;
  }
  renderBoltGhosts(list, dt) {
    list = list || [];
    let i = 0;
    for (; i < list.length; i++) {
      let g = this._boltGhosts[i];
      if (!g) { g = new THREE.Mesh(this._boltGeo, this._boltMat); this._boltGroup.add(g); this._boltGhosts.push(g); }
      g.visible = true; g.position.set(list[i][0], this.world.getHeight(list[i][0], list[i][1]) + 1.2, list[i][1]);
    }
    for (; i < this._boltGhosts.length; i++) this._boltGhosts[i].visible = false;
  }
  hideBolts() {
    for (const b of this._bolts) { b.alive = false; b.mesh.visible = false; }
    for (const g of this._boltGhosts) g.visible = false;
  }

  _render() {
    this._renderList(this.enemies, true);
  }

  _renderList(list, needAlive) {
    const counters = {};
    for (const key of ETYPE_KEYS) counters[key] = 0;
    const _q = this._tmpQ.identity();
    const _p = this._p || (this._p = { x: 0, y: 0, z: 0 });
    const _s = this._sv || (this._sv = { x: 1, y: 1, z: 1 });

    for (const e of list) {
      if (needAlive && !e.alive) continue;
      const mesh = this.meshes[e.type];
      const idx = counters[e.type];
      if (idx >= mesh.instanceMatrix.count) continue;
      const def = e.def;
      // Sprite-Höhe in Welt-Einheiten; Füße auf dem Boden (Billboard verankert unten)
      const sc = e.scale * 3.1;
      let y = e.y;
      if (def.fly) y += 1.4 + Math.sin(this.elapsed * 6 + e.phase) * 0.25; // Schweben
      _p.x = e.x; _p.y = y; _p.z = e.z;
      _s.x = sc; _s.y = sc; _s.z = sc;
      this._tmpM.compose(_p, _q, _s); // nur Position+Skalierung; Billboard im Shader
      mesh.setMatrixAt(idx, this._tmpM);
      mesh.setColorAt(idx, e.flash > 0 ? this._flash : this._white);
      // Lauf-/Flatter-Frame
      const frame = Math.floor(this.elapsed * (def.fly ? 12 : 6) + e.phase) % SPRITE_FRAMES;
      mesh.geometry.getAttribute('aFrame').setX(idx, frame);
      // Blickrichtung: Bewegung auf die Kamera-Rechtsachse projizieren -> links/rechts spiegeln
      const screenDir = e._dx * (this.camRightX ?? 1) + e._dz * (this.camRightZ ?? 0);
      if (screenDir > 0.05) e._flip = 1; else if (screenDir < -0.05) e._flip = -1;
      mesh.geometry.getAttribute('aFlip').setX(idx, e._flip || 1);
      counters[e.type] = idx + 1;
    }

    for (const key of ETYPE_KEYS) {
      const mesh = this.meshes[key];
      mesh.count = counters[key];
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.geometry.getAttribute('aFrame').needsUpdate = true;
      mesh.geometry.getAttribute('aFlip').needsUpdate = true;
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
      this._sinceKill = 0; // Kill beruhigt den Zorn (Anti-Kiting)
      if (onKill) onKill(e);
    }
  }
}
