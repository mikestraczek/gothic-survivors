import * as THREE from 'three';
import { bumpTexture, groundBumpTexture, grassTuftTexture, barkTexture, stoneTexture, foliageTexture, grungeTexture, cloudTexture } from './textures.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// ---- Terrain-Höhe (deterministisch; variantenabhängig pro Karte) ----
let _variant = 'valley';
export function setTerrainVariant(v) {
  _variant = v || 'valley';
}
export function terrainHeight(x, z) {
  const r = Math.hypot(x, z);
  if (_variant === 'swamp') {
    // flacher, tiefer, kleinteilig wellig (Morast)
    let h =
      Math.sin(x * 0.045) * 1.0 +
      Math.cos(z * 0.05) * 1.0 +
      Math.sin((x + z) * 0.03) * 0.7 +
      Math.sin(x * 0.21 + z * 0.15) * 0.5;
    h -= 1.0;
    h += Math.max(0, r - 102) * 0.28; // Rand
    const flat = 1 - Math.min(1, r / 42);
    h *= 1 - flat * 0.5;
    return h;
  }
  if (_variant === 'corridor') {
    // schmaler Hohlweg entlang X: fast flacher Boden, steile Felswände in Z
    let h = Math.sin(x * 0.08) * 0.5 + Math.sin((x + z) * 0.17) * 0.25;
    h += Math.max(0, Math.abs(z) - 13) * 2.4; // Wände
    return h;
  }
  if (_variant === 'flat') {
    // Stadt: fast eben, ansteigender Rand
    let h = Math.sin(x * 0.02) * 0.35 + Math.cos(z * 0.025) * 0.35;
    h += Math.max(0, r - 100) * 0.35;
    return h;
  }
  if (_variant === 'field') {
    // Schlachtfeld: flach, von Kratern zernarbt
    let h = Math.sin(x * 0.05) * 0.7 + Math.cos(z * 0.06) * 0.7;
    const cr = Math.sin(x * 0.11 + 2.3) * Math.sin(z * 0.13 + 1.1);
    h -= Math.max(0, cr - 0.55) * 6.0; // Krater-Dellen
    h += Math.max(0, r - 100) * 0.32;
    const flat = 1 - Math.min(1, r / 40);
    h *= 1 - flat * 0.6;
    return h;
  }
  // Tal: rollende Hügel mit ansteigendem Rand
  let h =
    Math.sin(x * 0.03) * 2.2 +
    Math.cos(z * 0.035) * 2.0 +
    Math.sin((x + z) * 0.02) * 1.5 +
    Math.sin(x * 0.11 + z * 0.07) * 0.6;
  h += Math.max(0, r - 95) * 0.32;
  const flat = 1 - Math.min(1, r / 48);
  h *= 1 - flat * 0.82;
  return h;
}

const BARRIER_RADIUS = 138;
// Hohlweg-Map: begehbarer Streifen entlang X
const CORRIDOR_HALF = 13; // halbe Breite
const CORRIDOR_LEN = 380; // halbe Länge (wirkt durch Nebel endlos)

const _UP = new THREE.Vector3(0, 1, 0);

// Wert in eine Box (±half) um ein Zentrum wrappen — für welt-verankerte Partikelfelder
function _wrap(v, c, half) {
  let d = v - c;
  const span = half * 2;
  d = ((d + half) % span + span) % span - half;
  return c + d;
}

// weicher radialer Verlauf (weiß -> transparent) — für Mond-Halo und Bodennebel
let _glowTex = null;
function glowTexture() {
  if (_glowTex) return _glowTex;
  const S = 128;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(S / 2, S / 2, 4, S / 2, S / 2, S / 2);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.4, 'rgba(255,255,255,0.45)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, S, S);
  _glowTex = new THREE.CanvasTexture(c);
  return _glowTex;
}

// Leuchtfenster-Textur für Cyberpunk-Gebäude (einmal erzeugt, wiederholt gekachelt)
let _winTex = null;
function windowTexture() {
  if (_winTex) return _winTex;
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#04050a';
  g.fillRect(0, 0, 64, 128);
  const cols = ['#2fd0ff', '#ff2fd0', '#ffc46a', '#8a7aff'];
  for (let yy = 6; yy < 122; yy += 9) {
    for (let xx = 5; xx < 58; xx += 9) {
      if (Math.random() < 0.34) {
        g.fillStyle = cols[(Math.random() * cols.length) | 0];
        g.globalAlpha = 0.45 + Math.random() * 0.55;
        g.fillRect(xx, yy, 5, 4);
      }
    }
  }
  g.globalAlpha = 1;
  _winTex = new THREE.CanvasTexture(c);
  return _winTex;
}

// Karten-Themen (umschaltbar)
export const THEMES = {
  valley: {
    name: 'Tal der Kolonie',
    fog: 0x121826, fogD: 0.0064,
    sky: [0x0c0f18, 0x161c2c, 0x231f16],
    hemiSky: 0x6a7aa4, hemiGround: 0x2a281a, hemiI: 1.05,
    ambient: 0x3a4660, ambientI: 0.55, moonCol: 0xc0ccea, moonI: 1.25,
    grass: 0x3c4a2a, grass2: 0x2d3a22, dirt: 0x5a4a30, rock: 0x47433c,
    barrierA: 0x6a2fa0, barrierB: 0x2f7aa0,
    trunk: 0x4a3620, foliage: 0x3f5e2a, rockMat: 0x6a6459, grassMat: 0x5a6e38, stone: 0x7a7264,
    terrain: 'valley', vegStyle: 'pine', layout: 'ruins', treeCount: 70, rockCount: 26, grassCount: 600, water: false,
    gradeShadow: [0.0, 0.02, 0.075], gradeHigh: [0.07, 0.045, 0.0], // Split-Toning (Visuals-Grade-Pass)
    weather: 'motes', music: 'valley',
    finalBoss: 'boss',
  },
  swamp: {
    name: 'Sumpf der Bruderschaft',
    fog: 0x16200f, fogD: 0.0085,
    sky: [0x0c1410, 0x16241a, 0x24281a],
    hemiSky: 0x6a8a60, hemiGround: 0x252a18, hemiI: 1.1,
    ambient: 0x3a4a30, ambientI: 0.75, moonCol: 0xa8c090, moonI: 1.0,
    grass: 0x2f3a22, grass2: 0x24301a, dirt: 0x3a3422, rock: 0x3a3e30,
    barrierA: 0x2f8a5a, barrierB: 0x6a8a2f,
    trunk: 0x322618, foliage: 0x3a5030, rockMat: 0x565c48, grassMat: 0x4a5c34, stone: 0x5c6050,
    terrain: 'swamp', vegStyle: 'dead', layout: 'bog', treeCount: 70, rockCount: 18, grassCount: 360, water: true, waterColor: 0x16321f,
    gradeShadow: [0.0, 0.05, 0.02], gradeHigh: [0.05, 0.06, 0.0],
    weather: 'rain', music: 'swamp',
    finalBoss: 'boss_demon',
  },
  corridor: {
    name: 'Der Hohlweg',
    fog: 0x14161e, fogD: 0.0085,
    sky: [0x08080e, 0x101018, 0x1a1410],
    hemiSky: 0x5a6a8a, hemiGround: 0x241f16, hemiI: 0.95,
    ambient: 0x3a4050, ambientI: 0.6, moonCol: 0xb8c4e0, moonI: 1.1,
    grass: 0x3a3f2c, grass2: 0x2c3122, dirt: 0x4c4232, rock: 0x3f3b34,
    barrierA: 0x8a2fa0, barrierB: 0x2f5aa0,
    trunk: 0x483220, foliage: 0x385024, rockMat: 0x625c54, grassMat: 0x54623a, stone: 0x6c665a,
    terrain: 'corridor', vegStyle: 'pine', layout: 'canyon', treeCount: 48, rockCount: 0, grassCount: 320, water: false,
    bounds: 'corridor', relics: false,
    gradeShadow: [0.01, 0.02, 0.07], gradeHigh: [0.06, 0.05, 0.01],
    weather: 'motes', music: 'valley', mistCol: 0x9aa8c8,
    finalBoss: 'boss_bone',
  },
  cyber: {
    name: 'Neon-Distrikt 7',
    fog: 0x0c0a18, fogD: 0.0072,
    sky: [0x060612, 0x120a24, 0x241030],
    hemiSky: 0x6a4a9a, hemiGround: 0x101020, hemiI: 1.0,
    ambient: 0x3a2a5a, ambientI: 0.7, moonCol: 0x9a7ae0, moonI: 0.9,
    grass: 0x23242c, grass2: 0x1b1c24, dirt: 0x2c2d38, rock: 0x30313c,
    barrierA: 0xff2fd0, barrierB: 0x2fd0ff,
    trunk: 0x2e3038, foliage: 0x304862, rockMat: 0x4c4e5e, grassMat: 0x384658, stone: 0x4a4c5c,
    terrain: 'flat', vegStyle: 'pine', layout: 'city', treeCount: 0, rockCount: 0, grassCount: 0, water: false,
    relics: false, shrooms: false,
    gradeShadow: [0.02, 0.0, 0.09], gradeHigh: [0.06, 0.0, 0.08],
    weather: 'rain', music: 'cyber', mistCol: 0x8a7ab8,
    finalBoss: 'boss_demon',
  },
  ww2: {
    name: 'Frontlinie 1944',
    fog: 0x1a1c18, fogD: 0.009,
    sky: [0x0e100c, 0x1a1c16, 0x24221a],
    hemiSky: 0x7a8070, hemiGround: 0x26241c, hemiI: 0.95,
    ambient: 0x4a4c40, ambientI: 0.6, moonCol: 0xc0c4b0, moonI: 0.9,
    grass: 0x3c3a26, grass2: 0x2e2c1e, dirt: 0x4a4028, rock: 0x403d32,
    barrierA: 0x8a6a2f, barrierB: 0xa03a2f,
    trunk: 0x3c321e, foliage: 0x3c4026, rockMat: 0x5e5a4a, grassMat: 0x545634, stone: 0x686050,
    terrain: 'field', vegStyle: 'dead', layout: 'battlefield', treeCount: 26, rockCount: 10, grassCount: 260, water: false,
    relics: false, shrooms: false,
    gradeShadow: [0.01, 0.03, 0.02], gradeHigh: [0.06, 0.05, 0.02],
    weather: 'rain', music: 'war', mistCol: 0x9aa08a,
    finalBoss: 'boss',
  },
  heaven: {
    name: 'Über den Wolken',
    fog: 0xd0e4f4, fogD: 0.0030,
    sky: [0x3f86d4, 0xa8d4ee, 0xe8f2ea],
    daySky: true,
    hemiSky: 0xcfe4fa, hemiGround: 0x9cb474, hemiI: 1.5,
    ambient: 0xbcd2ec, ambientI: 1.15, moonCol: 0xfff2d4, moonI: 2.3,
    grass: 0x6f9a4a, grass2: 0x5f8a3e, dirt: 0xa89060, rock: 0x9a968a,
    barrierA: 0xffe6a8, barrierB: 0xbfe0ff,
    trunk: 0x74542f, foliage: 0x64a03e, rockMat: 0xa8a294, grassMat: 0x82ac4c, stone: 0xd2ccb6,
    terrain: 'valley', vegStyle: 'pine', layout: 'meadow', treeCount: 44, rockCount: 16, grassCount: 760, water: false,
    relics: false, shrooms: false,
    gradeShadow: [0.01, 0.02, 0.05], gradeHigh: [0.07, 0.06, 0.02],
    weather: 'motes', music: 'valley', mistCol: 0xe8f0ff,
    finalBoss: 'boss',
  },
};
export const MAP_LIST = [
  { key: 'valley', name: 'Tal der Kolonie' },
  { key: 'swamp', name: 'Sumpf der Bruderschaft' },
  { key: 'corridor', name: 'Der Hohlweg' },
  { key: 'cyber', name: 'Neon-Distrikt 7' },
  { key: 'ww2', name: 'Frontlinie 1944' },
  { key: 'heaven', name: 'Über den Wolken' },
];

export class World {
  constructor(scene, renderer, themeKey = 'valley') {
    this.scene = scene;
    this.renderer = renderer;
    this.colliders = []; // {x, z, r}
    this.torchLights = [];
    this.time = 0;
    this.themeKey = themeKey;
    this.theme = THEMES[themeKey] || THEMES.valley;
    setTerrainVariant(this.theme.terrain);
    this.group = new THREE.Group();
    scene.add(this.group);
    this._build();
  }

  _build() {
    this._waterMat = null;
    this._treeFade = null;
    this.bogPools = null;
    this.tanks = null;
    this.lore = null;
    this.boostPads = null;
    this._buildSky();
    this._buildLights();
    this._buildTerrain();
    this._buildBarrier();
    this._buildCamp();
    this._buildVegetation();
    if (this.theme.relics !== false) this._buildGraveyard();
    if (this.theme.layout === 'ruins') this._buildOldCamp();
    this._buildWeather();
  }

  // --------------------------------------------------------------- Wetter & Atmosphäre
  // Sumpf: fallender Regen · Tal: treibende Glühwürmchen. Beides instanziert,
  // folgt dem Kamera-Ziel (center in update) — wirkt überall in der Arena.
  _buildWeather() {
    this.weather = null;
    const wkind = this.theme.weather || (this.theme.terrain === 'swamp' ? 'rain' : 'motes');
    if (wkind === 'rain') {
      const N = 480;
      const geo = new THREE.PlaneGeometry(0.03, 0.8);
      const mat = new THREE.MeshBasicMaterial({ color: 0x9fb6c8, transparent: true, opacity: 0.34, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
      const im = new THREE.InstancedMesh(geo, mat, N);
      im.frustumCulled = false;
      this.group.add(im);
      const drops = [];
      for (let i = 0; i < N; i++) {
        drops.push({ x: (Math.random() - 0.5) * 84, y: Math.random() * 26, z: (Math.random() - 0.5) * 84, v: 19 + Math.random() * 9 });
      }
      this.weather = { kind: 'rain', im, parts: drops };
    } else {
      const N = 130;
      const geo = new THREE.SphereGeometry(0.055, 6, 5);
      const mat = new THREE.MeshBasicMaterial({ color: 0xd8f0a0, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending });
      const im = new THREE.InstancedMesh(geo, mat, N);
      im.frustumCulled = false;
      this.group.add(im);
      const motes = [];
      for (let i = 0; i < N; i++) {
        motes.push({ x: (Math.random() - 0.5) * 90, y: 0.6 + Math.random() * 3.2, z: (Math.random() - 0.5) * 90, phase: Math.random() * 6.28, speed: 0.4 + Math.random() * 0.8 });
      }
      this.weather = { kind: 'motes', im, parts: motes };
    }
    // Bodennebel (beide Karten): weiche, driftende Schwaden dicht über dem Boden
    const MN = 30;
    const mistGeo = new THREE.PlaneGeometry(1, 1);
    mistGeo.rotateX(-Math.PI / 2);
    const mistMat = new THREE.MeshBasicMaterial({
      map: glowTexture(),
      color: this.theme.mistCol || (this.theme.terrain === 'swamp' ? 0x9ab890 : 0x9aa8c8),
      transparent: true,
      opacity: 0.13,
      depthWrite: false,
    });
    const mistIm = new THREE.InstancedMesh(mistGeo, mistMat, MN);
    mistIm.frustumCulled = false;
    mistIm.renderOrder = 2;
    this.group.add(mistIm);
    const puffs = [];
    for (let i = 0; i < MN; i++) {
      puffs.push({ x: (Math.random() - 0.5) * 90, z: (Math.random() - 0.5) * 90, size: 7 + Math.random() * 9, phase: Math.random() * 6.28, spin: (Math.random() - 0.5) * 0.3 });
    }
    this.mist = { im: mistIm, parts: puffs };

    this._wm = this._wm || new THREE.Matrix4();
    this._wq = this._wq || new THREE.Quaternion();
    this._wqTilt = this._wqTilt || new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0.14));
    this._ws = this._ws || new THREE.Vector3(1, 1, 1);
    this._wp = this._wp || new THREE.Vector3();
  }

  // Baumkronen in Heldennähe weich wegschrumpfen — Top-Down-Sicht bleibt frei.
  _updateTreeFade(dt, center) {
    const T = this._treeFade;
    if (!T || !center) return;
    const k = Math.min(1, dt * 6);
    let dirty = false;
    for (let idx = 0; idx < T.list.length; idx++) {
      const t = T.list[idx];
      const dx = t.x - center.x;
      const dz = t.z - center.z;
      const target = dx * dx + dz * dz < 70 ? 0.22 : 1;
      if (Math.abs(t.cur - target) < 0.005) continue;
      t.cur += (target - t.cur) * k;
      dirty = true;
      const sc = t.sc * t.cur;
      this._ws.set(sc, sc, sc);
      for (let li = 0; li < T.layers.length; li++) {
        this._wp.set(t.x, t.y + T.layers[li].y * t.sc, t.z);
        this._wm.compose(this._wp, t.q, this._ws);
        T.folMeshes[li].setMatrixAt(idx, this._wm);
      }
      if (T.branches) {
        this._wp.set(t.x, t.y + 6 * t.sc, t.z);
        this._wm.compose(this._wp, t.q, this._ws);
        T.branches.setMatrixAt(idx, this._wm);
      }
    }
    if (dirty) {
      for (const fm of T.folMeshes) fm.instanceMatrix.needsUpdate = true;
      if (T.branches) T.branches.instanceMatrix.needsUpdate = true;
    }
  }

  _updateWeather(dt, elapsed, center) {
    const w = this.weather;
    if (!w) return;
    const cx = center ? center.x : 0;
    const cy = center ? center.y : 0;
    const cz = center ? center.z : 0;
    if (w.kind === 'rain') {
      for (let i = 0; i < w.parts.length; i++) {
        const d = w.parts[i];
        d.y -= d.v * dt;
        if (d.y < 0) d.y += 26;
        this._wp.set(cx + d.x, cy + d.y, cz + d.z);
        this._ws.set(1, 1, 1);
        this._wm.compose(this._wp, this._wqTilt, this._ws);
        w.im.setMatrixAt(i, this._wm);
      }
    } else {
      // Welt-verankert: Position bleibt stehen, nur in eine Box um das Kamera-Ziel
      // gewrappt (Teleport passiert außerhalb des Sichtfelds) — kein "Mitwandern".
      for (let i = 0; i < w.parts.length; i++) {
        const m = w.parts[i];
        m.x = _wrap(m.x, cx, 45);
        m.z = _wrap(m.z, cz, 45);
        const px = m.x + Math.sin(elapsed * m.speed + m.phase) * 2.4;
        const pz = m.z + Math.cos(elapsed * m.speed * 0.8 + m.phase) * 2.4;
        const py = this.getHeight(px, pz) + m.y + Math.sin(elapsed * 0.7 + m.phase * 2) * 0.8;
        const pulse = 0.7 + 0.5 * Math.sin(elapsed * 2.2 + m.phase * 3); // Glimmen
        this._wp.set(px, py, pz);
        this._ws.setScalar(Math.max(0.15, pulse));
        this._wm.compose(this._wp, this._wq, this._ws);
        w.im.setMatrixAt(i, this._wm);
      }
    }
    w.im.instanceMatrix.needsUpdate = true;

    // Bodennebel driftet langsam, folgt dem Gelände und rotiert kaum merklich
    if (this.mist) {
      for (let i = 0; i < this.mist.parts.length; i++) {
        const m = this.mist.parts[i];
        m.x = _wrap(m.x, cx, 60);
        m.z = _wrap(m.z, cz, 60);
        const px = m.x + Math.sin(elapsed * 0.05 + m.phase) * 6;
        const pz = m.z + Math.cos(elapsed * 0.04 + m.phase) * 6;
        const py = this.getHeight(px, pz) + 0.6;
        this._wq.setFromAxisAngle(_UP, m.phase + elapsed * m.spin);
        this._wp.set(px, py, pz);
        this._ws.set(m.size, 1, m.size);
        this._wm.compose(this._wp, this._wq, this._ws);
        this.mist.im.setMatrixAt(i, this._wm);
      }
      this.mist.im.instanceMatrix.needsUpdate = true;
    }
  }

  // Magie-Erz-Brocken (glühendes Gothic-Erz) — 3D, wiederverwendbar.
  _placeOre(x, z, sc) {
    if (!this._oreGeo) this._oreGeo = new THREE.DodecahedronGeometry(1.0, 0);
    if (!this._oreMat) this._oreMat = new THREE.MeshStandardMaterial({ color: 0x3a4650, roughness: 0.8, emissive: 0x1e90b4, emissiveIntensity: 0.9 });
    const o = new THREE.Mesh(this._oreGeo, this._oreMat);
    o.scale.set(sc, sc * 0.8, sc);
    o.rotation.set(Math.random() * 3, Math.random() * 6, Math.random() * 3);
    this._place(o, x, z, sc * 0.35);
    if (sc > 1.0) this.colliders.push({ x, z, r: sc * 0.8 });
  }

  // Gothic-Relikte (3D): Menhire (Steinmonolithen), Magie-Erz-Brocken, ein paar alte Gräber.
  _buildGraveyard() {
    let seed = 1337;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const stoneMat = new THREE.MeshStandardMaterial({ color: 0x3e444c, roughness: 1, bumpMap: bumpTexture(), bumpScale: 0.4 });
    const graveMat = new THREE.MeshStandardMaterial({ color: 0x555b62, roughness: 1, bumpMap: bumpTexture(), bumpScale: 0.4 });
    const menhirGeo = new THREE.CylinderGeometry(0.5, 0.8, 5.0, 5);
    const graveGeo = new THREE.BoxGeometry(0.9, 1.2, 0.25);
    for (let i = 0; i < 14; i++) {
      const a = rnd() * Math.PI * 2, dist = 18 + rnd() * 94;
      const x = Math.cos(a) * dist, z = Math.sin(a) * dist;
      if (Math.hypot(x, z) > BARRIER_RADIUS - 6) continue;
      const sc = 0.8 + rnd() * 0.6;
      const mh = new THREE.Mesh(menhirGeo, stoneMat);
      mh.scale.setScalar(sc); mh.rotation.y = rnd() * Math.PI; mh.rotation.z = (rnd() - 0.5) * 0.12;
      this._place(mh, x, z, 2.5 * sc);
      this.colliders.push({ x, z, r: 0.7 * sc });
    }
    for (let i = 0; i < 18; i++) {
      const a = rnd() * Math.PI * 2, dist = 16 + rnd() * 98;
      const x = Math.cos(a) * dist, z = Math.sin(a) * dist;
      if (Math.hypot(x, z) > BARRIER_RADIUS - 6) continue;
      this._placeOre(x, z, 0.7 + rnd() * 0.7);
    }
    for (let i = 0; i < 16; i++) {
      const a = rnd() * Math.PI * 2, dist = 24 + rnd() * 86;
      const x = Math.cos(a) * dist, z = Math.sin(a) * dist;
      if (Math.hypot(x, z) > BARRIER_RADIUS - 6) continue;
      const gr = new THREE.Mesh(graveGeo, graveMat);
      gr.rotation.y = rnd() * Math.PI; gr.rotation.z = (rnd() - 0.5) * 0.15;
      this._place(gr, x, z, 0.6);
    }
  }

  // Das „Alte Lager" (3D): Palisaden-Bogen, Wachtürme, Erzhaufen (nur Tal/Ruinen-Layout).
  _buildOldCamp() {
    const wood = new THREE.MeshStandardMaterial({ color: 0x2a1c10, roughness: 1, bumpMap: bumpTexture(), bumpScale: 0.4 });
    const woodTip = new THREE.MeshStandardMaterial({ color: 0x3a2a18, roughness: 1 });
    const stakeGeo = new THREE.CylinderGeometry(0.22, 0.28, 3.2, 6);
    const tipGeo = new THREE.ConeGeometry(0.26, 0.5, 6);
    for (let i = 0; i < 26; i++) {
      const ang = -1.35 + i * 0.105, r = 32;
      const x = Math.cos(ang) * r, z = Math.sin(ang) * r + 8;
      const yb = terrainHeight(x, z);
      const stk = new THREE.Mesh(stakeGeo, wood); stk.position.set(x, yb + 1.6, z); stk.castShadow = true; this.group.add(stk);
      const tip = new THREE.Mesh(tipGeo, woodTip); tip.position.set(x, yb + 3.4, z); this.group.add(tip);
      this.colliders.push({ x, z, r: 0.4 });
    }
    this._buildWatchtower(-22, 6);
    this._buildWatchtower(24, 10);
    this._placeOre(8, 2, 1.3);
    this._placeOre(-6, 12, 1.2);
    this._placeOre(14, -2, 1.2);
  }

  // Holz-Wachturm (3D)
  _buildWatchtower(x, z) {
    const wood = new THREE.MeshStandardMaterial({ color: 0x2a1c10, roughness: 1 });
    const rail = new THREE.MeshStandardMaterial({ color: 0x241a12, roughness: 1 });
    const y = terrainHeight(x, z);
    const g = new THREE.Group();
    const legGeo = new THREE.BoxGeometry(0.3, 7, 0.3);
    for (const [lx, lz] of [[-1.4, -1.4], [1.4, -1.4], [-1.4, 1.4], [1.4, 1.4]]) {
      const leg = new THREE.Mesh(legGeo, wood); leg.position.set(lx, 3.5, lz); leg.castShadow = true; g.add(leg);
    }
    const plat = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.4, 3.6), wood); plat.position.y = 7; plat.castShadow = true; g.add(plat);
    for (const [rx, rz, rw, rd] of [[0, -1.7, 3.6, 0.25], [0, 1.7, 3.6, 0.25], [-1.7, 0, 0.25, 3.6], [1.7, 0, 0.25, 3.6]]) {
      const rr = new THREE.Mesh(new THREE.BoxGeometry(rw, 0.7, rd), rail); rr.position.set(rx, 7.55, rz); g.add(rr);
    }
    const roof = new THREE.Mesh(new THREE.ConeGeometry(2.9, 2.3, 4), new THREE.MeshStandardMaterial({ color: 0x3a1410, roughness: 1 }));
    roof.position.y = 9.2; roof.rotation.y = Math.PI / 4; roof.castShadow = true; g.add(roof);
    g.position.set(x, y, z);
    this.group.add(g);
    this.colliders.push({ x, z, r: 2.0 });
  }

  // Karte wechseln: alte Welt entsorgen und mit neuem Theme neu aufbauen
  applyTheme(themeKey) {
    this.themeKey = themeKey;
    this.theme = THEMES[themeKey] || THEMES.valley;
    setTerrainVariant(this.theme.terrain);
    this.group.traverse((o) => {
      if (o.isMesh || o.isPoints) {
        o.geometry?.dispose?.();
        const m = o.material;
        if (Array.isArray(m)) m.forEach((x) => x?.dispose?.());
        else m?.dispose?.();
      }
    });
    this.scene.remove(this.group);
    this.group = new THREE.Group();
    this.scene.add(this.group);
    this.colliders = [];
    this.torchLights = [];
    this._build();
  }

  // --------------------------------------------------------------- Himmel
  _buildSky() {
    const geo = new THREE.SphereGeometry(500, 32, 16);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        top: { value: new THREE.Color(this.theme.sky[0]) },
        mid: { value: new THREE.Color(this.theme.sky[1]) },
        bot: { value: new THREE.Color(this.theme.sky[2]) },
      },
      vertexShader: `
        varying vec3 vPos;
        void main(){ vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
      `,
      fragmentShader: `
        varying vec3 vPos;
        uniform vec3 top; uniform vec3 mid; uniform vec3 bot;
        void main(){
          float h = normalize(vPos).y;
          vec3 c = mix(mid, bot, smoothstep(0.0, -0.4, h));
          c = mix(c, top, smoothstep(0.1, 0.7, h));
          gl_FragColor = vec4(c, 1.0);
        }
      `,
    });
    this.group.add(new THREE.Mesh(geo, mat));

    if (this.theme.daySky) { this._buildDaySky(); return; }

    // Mond
    const moon = new THREE.Mesh(
      new THREE.CircleGeometry(18, 32),
      new THREE.MeshBasicMaterial({ color: 0xdfe4ee, fog: false })
    );
    moon.position.set(-160, 150, -260);
    moon.lookAt(0, 0, 0);
    this.group.add(moon);
    const moonGlow = new THREE.Mesh(
      new THREE.PlaneGeometry(150, 150),
      new THREE.MeshBasicMaterial({ map: glowTexture(), color: 0x9fb0d8, transparent: true, opacity: 0.6, fog: false, depthWrite: false, blending: THREE.AdditiveBlending })
    );
    moonGlow.position.copy(moon.position);
    moonGlow.lookAt(0, 0, 0);
    this.group.add(moonGlow);

    // Sterne
    const starGeo = new THREE.BufferGeometry();
    const starCount = 1200;
    const pos = new Float32Array(starCount * 3);
    let seed = 1337;
    const rnd = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    for (let i = 0; i < starCount; i++) {
      const v = new THREE.Vector3(rnd() * 2 - 1, rnd(), rnd() * 2 - 1).normalize().multiplyScalar(480);
      pos[i * 3] = v.x;
      pos[i * 3 + 1] = v.y;
      pos[i * 3 + 2] = v.z;
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const stars = new THREE.Points(
      starGeo,
      new THREE.PointsMaterial({ color: 0xc8d2e8, size: 1.4, sizeAttenuation: false, fog: false })
    );
    this.group.add(stars);
  }

  // Heller Tag-Himmel: Sonne + Wolkenschichten (hoch + tiefer Schwebering)
  _buildDaySky() {
    const sun = new THREE.Mesh(new THREE.CircleGeometry(22, 32), new THREE.MeshBasicMaterial({ color: 0xfff6e0, fog: false }));
    sun.position.set(-150, 190, -250); sun.lookAt(0, 0, 0); this.group.add(sun);
    const sunGlow = new THREE.Mesh(new THREE.PlaneGeometry(300, 300), new THREE.MeshBasicMaterial({ map: glowTexture(), color: 0xffe6a8, transparent: true, opacity: 0.7, fog: false, depthWrite: false, blending: THREE.AdditiveBlending }));
    sunGlow.position.copy(sun.position); sunGlow.lookAt(0, 0, 0); this.group.add(sunGlow);
    let cseed = 555; const crnd = () => { cseed = (cseed * 16807) % 2147483647; return cseed / 2147483647; };
    const cloudMat = new THREE.MeshBasicMaterial({ map: cloudTexture(), color: 0xffffff, transparent: true, opacity: 0.94, fog: false, depthWrite: false, side: THREE.DoubleSide });
    const cloudGeo = new THREE.PlaneGeometry(1, 1);
    const clouds = new THREE.InstancedMesh(cloudGeo, cloudMat, 60);
    clouds.frustumCulled = false; clouds.renderOrder = -1;
    const cm = new THREE.Matrix4(), cq = new THREE.Quaternion(), cp = new THREE.Vector3(), cs = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0), look = new THREE.Matrix4();
    let ci = 0;
    const put = (x, y, z, w, h) => { cp.set(x, y, z); look.lookAt(cp, new THREE.Vector3(0, y, 0), up); cq.setFromRotationMatrix(look); cs.set(w, h, 1); cm.compose(cp, cq, cs); clouds.setMatrixAt(ci++, cm); };
    for (let i = 0; i < 30; i++) { const a = crnd() * Math.PI * 2, rr = 200 + crnd() * 220, yy = 70 + crnd() * 170, sz = 70 + crnd() * 110; put(Math.cos(a) * rr, yy, Math.sin(a) * rr, sz, sz * 0.6); } // hoher Himmel
    for (let i = 0; i < 28; i++) { const a = (i / 28) * Math.PI * 2 + crnd() * 0.12, rr = 115 + crnd() * 45, yy = -8 + crnd() * 10, sz = 42 + crnd() * 46; put(Math.cos(a) * rr, yy, Math.sin(a) * rr, sz, sz * 0.55); } // tiefer Schwebering
    clouds.count = ci; this.group.add(clouds);
  }

  // Wiese (helle Map): bunte Wildblumen statt Ruinen/Fackeln
  _meadowFeatures() {
    let seed = 7777; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const cols = [0xff5a7a, 0xffd84a, 0xffffff, 0xc86aff, 0xff9a3a];
    const petalGeo = new THREE.SphereGeometry(0.17, 6, 5);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), pos = new THREE.Vector3(), sc = new THREE.Vector3();
    for (const col of cols) {
      const mat = new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.25, roughness: 0.8 });
      const im = new THREE.InstancedMesh(petalGeo, mat, 90); im.frustumCulled = false; im.castShadow = true;
      let pl = 0;
      for (let i = 0; i < 90; i++) {
        const a = rnd() * Math.PI * 2, d = 8 + rnd() * 100;
        const x = Math.cos(a) * d, z = Math.sin(a) * d;
        if (Math.hypot(x, z) > BARRIER_RADIUS - 6) continue;
        const y = terrainHeight(x, z); const s2 = 0.7 + rnd() * 1.0;
        pos.set(x, y + 0.35 * s2, z); sc.set(s2, s2 * 1.4, s2); m.compose(pos, q, sc); im.setMatrixAt(pl++, m);
      }
      im.count = pl; this.group.add(im);
    }
  }

  // --------------------------------------------------------------- Licht & Nebel
  _buildLights() {
    const t = this.theme;
    this.scene.fog = new THREE.FogExp2(t.fog, t.fogD);

    const hemi = new THREE.HemisphereLight(t.hemiSky, t.hemiGround, t.hemiI);
    this.group.add(hemi);

    const moon = new THREE.DirectionalLight(t.moonCol, t.moonI);
    moon.position.set(-120, 130, -160);
    moon.castShadow = true;
    moon.shadow.mapSize.set(2048, 2048);
    const d = 80;
    moon.shadow.camera.left = -d;
    moon.shadow.camera.right = d;
    moon.shadow.camera.top = d;
    moon.shadow.camera.bottom = -d;
    moon.shadow.camera.near = 1;
    moon.shadow.camera.far = 400;
    moon.shadow.bias = -0.0004;
    this.group.add(moon);
    this.group.add(moon.target);

    this.group.add(new THREE.AmbientLight(t.ambient, t.ambientI));
  }

  // --------------------------------------------------------------- Terrain
  _buildTerrain() {
    const corridor = this.theme.bounds === 'corridor';
    const sizeX = corridor ? 800 : 320;
    const sizeZ = corridor ? 64 : 320;
    const geo = new THREE.PlaneGeometry(sizeX, sizeZ, corridor ? 400 : 200, corridor ? 32 : 200);
    geo.rotateX(-Math.PI / 2);

    const pos = geo.attributes.position;
    const colors = [];
    const cGrass = new THREE.Color(this.theme.grass);
    const cGrass2 = new THREE.Color(this.theme.grass2);
    const cDirt = new THREE.Color(this.theme.dirt);
    const cRock = new THREE.Color(this.theme.rock);

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const y = terrainHeight(x, z);
      pos.setY(i, y);

      // Farbe nach Höhe + leichter Variation
      const n = (Math.sin(x * 1.3) * Math.cos(z * 1.1) + 1) * 0.5;
      let c = cGrass.clone().lerp(cGrass2, n);
      if (y > 6) c = c.lerp(cRock, Math.min(1, (y - 6) / 8));
      const r2 = corridor ? Math.abs(z) * 3.4 : Math.hypot(x, z);
      if (r2 < 30) c = c.lerp(cDirt, 0.4); // getrampelter Boden (Lager bzw. Pfad)
      colors.push(c.r, c.g, c.b);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.computeVertexNormals();

    const groundDetail = grungeTexture(); groundDetail.repeat.set(corridor ? 90 : 55, corridor ? 8 : 55);
    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      map: groundDetail,
      roughness: 1.0,
      metalness: 0.0,
      flatShading: false,
      bumpMap: groundBumpTexture(),
      bumpScale: 0.85,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    this.group.add(mesh);
    this.terrain = mesh;
  }

  getHeight(x, z) {
    return terrainHeight(x, z);
  }

  // --------------------------------------------------------------- Barriere
  _buildBarrier() {
    const geo = new THREE.SphereGeometry(BARRIER_RADIUS, 64, 48);
    this.barrierMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uColorA: { value: new THREE.Color(this.theme.barrierA) },
        uColorB: { value: new THREE.Color(this.theme.barrierB) },
      },
      vertexShader: `
        varying vec3 vNormal; varying vec3 vWorld; varying vec3 vPos;
        void main(){
          vNormal = normalize(normalMatrix * normal);
          vec4 wp = modelMatrix * vec4(position,1.0);
          vWorld = wp.xyz; vPos = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
        }
      `,
      fragmentShader: `
        uniform float uTime; uniform vec3 uColorA; uniform vec3 uColorB;
        varying vec3 vNormal; varying vec3 vWorld; varying vec3 vPos;
        // einfache hash/noise
        float hash(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,37.719)))*43758.5453); }
        void main(){
          vec3 vd = normalize(cameraPosition - vWorld);
          float fres = pow(1.0 - abs(dot(vd, normalize(vNormal))), 2.5);
          // fließende Energiebänder
          float band = sin(vPos.y * 0.18 + uTime * 0.8)
                     + sin(atan(vPos.z, vPos.x) * 8.0 + uTime * 1.4) * 0.5;
          band = smoothstep(0.4, 1.0, abs(band));
          vec3 col = mix(uColorA, uColorB, 0.5 + 0.5*sin(vPos.y*0.05 + uTime*0.3));
          float a = fres * 0.85 + band * 0.4 + 0.06;
          // nur obere Halbkugel sichtbar machen (Kuppel)
          a *= smoothstep(-20.0, 30.0, vPos.y);
          gl_FragColor = vec4(col, a);
        }
      `,
    });
    if (this.theme.bounds === 'corridor') {
      // Keine Energie-Wände: die Felswände des Hohlwegs begrenzen sichtbar,
      // clampBounds() hält unsichtbar in der Spur (Wände hingen sonst in der Kamera).
    } else {
      const dome = new THREE.Mesh(geo, this.barrierMat);
      this.group.add(dome);
    }
    this.barrierRadius = BARRIER_RADIUS;
  }

  // --------------------------------------------------------------- Sturmwand (Modus „Letzter Überlebender")
  // Eine dauerhaft sichtbare, violette Energiewand am Rand der sicheren Zone. Radius wird
  // per Skalierung angepasst, damit man IMMER klar erkennt, wo die Grenze verläuft.
  _buildStormWall() {
    const H = 90;
    const geo = new THREE.CylinderGeometry(1, 1, H, 72, 1, true); // Radius 1 -> über scale gesetzt, offen
    this._stormMat = new THREE.ShaderMaterial({
      side: THREE.DoubleSide,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 } },
      vertexShader: `
        varying vec2 vUv;
        void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
      `,
      fragmentShader: `
        uniform float uTime; varying vec2 vUv;
        void main(){
          // unten am dichtesten, nach oben ausdünnend (klare Bodengrenze)
          float vert = smoothstep(1.0, 0.0, vUv.y);
          vert = vert * vert; // unten kräftiger
          // langsam wandernde vertikale Energiebänder (ruhig, nicht stroboskopisch)
          float bands = 0.5 + 0.5 * sin(vUv.x * 110.0 + uTime * 1.2);
          bands = smoothstep(0.5, 1.0, bands) * 0.6;
          float a = (0.6 + bands) * vert;
          vec3 col = mix(vec3(0.7, 0.2, 1.0), vec3(1.0, 0.55, 1.0), vUv.y * 0.6 + bands);
          gl_FragColor = vec4(col, a);
        }
      `,
    });
    this._stormWall = new THREE.Mesh(geo, this._stormMat);
    this._stormWall.renderOrder = 3;
    this._stormWall.frustumCulled = false;
    this.group.add(this._stormWall);
  }
  updateStorm(radius) {
    // group wird beim Themenwechsel neu aufgebaut -> Wand ggf. neu erstellen
    if (!this._stormWall || this._stormWall.parent !== this.group) this._buildStormWall();
    const w = this._stormWall;
    w.visible = true;
    w.scale.set(Math.max(1, radius), 1, Math.max(1, radius));
    // Basis leicht unter das Zentrums-Gelände senken, Wand ragt weit nach oben (auch über Hügel)
    w.position.set(0, this.getHeight(0, 0) + 22, 0);
  }
  hideStorm() { if (this._stormWall) this._stormWall.visible = false; }

  // --------------------------------------------------------------- Arena (themen-spezifisch)
  _place(mesh, x, z, yOffset = 0) {
    mesh.position.set(x, terrainHeight(x, z) + yOffset, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.group.add(mesh);
    return mesh;
  }

  _buildCamp() {
    const L = this.theme.layout;
    if (L === 'city') { this._cityFeatures(); return; } // Stadt bringt eigene Beleuchtung mit
    if (L === 'battlefield') { this._warFeatures(); return; }
    if (L === 'canyon') { this._canyonFeatures(); return; }
    if (L === 'meadow') { this._meadowFeatures(); return; }
    if (L === 'bog') this._bogFeatures();
    else this._ruinFeatures();

    // Lagerfeuer als zentrale Lichtquellen (beide Karten)
    this._buildCampfire(0, 6);
    this._buildCampfire(-20, 24);

    const torchSpots =
      this.theme.layout === 'bog'
        ? [[-12, 10], [14, 8], [-2, -18], [24, 4], [-26, 18]]
        : [[-10, 12], [12, 12], [-24, 0], [24, 2], [0, -16], [-14, -16], [16, -14], [6, 26], [-30, 16]];
    for (const [tx, tz] of torchSpots) this._buildTorch(tx, tz);
    if (L === 'ruins') this._buildTents();
  }

  // Tal: verwitterte Stein-Ruinen (Altes-Lager-Feeling) — gebrochene Mauerkronen,
  // Schutt am Fuß, Pfeiler mit Sockel + gekippter Bruchkrone, manche Säulen umgestürzt.
  _ruinFeatures() {
    let seed = 4242;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const stoneCol = new THREE.Color(this.theme.stone);
    const mossCol = new THREE.Color(this.theme.grassMat);
    // Flat-Shading passt zu den flach-schattierten Bäumen/Felsen; leichte Moos-Verwitterung erdet die Ruinen
    const stoneMat = (tint, moss = 0) => new THREE.MeshStandardMaterial({
      color: stoneCol.clone().multiplyScalar(tint).lerp(mossCol, moss * 0.35),
      roughness: 1.0, flatShading: true, map: stoneTexture(), bumpMap: bumpTexture(), bumpScale: 0.6,
    });
    const rubbleGeo = new THREE.DodecahedronGeometry(0.4, 0);

    const ruins = [[-22, 10, 0.5, 6], [18, 16, 1.2, 5], [-30, -14, 0.3, 7], [26, -10, 2.0, 6], [8, -28, 0.8, 5], [-14, 30, 1.6, 5], [34, 20, 0.4, 6], [-36, 22, 1.1, 5]];
    for (const [rx, rz, rot, len] of ruins) {
      const y = terrainHeight(rx, rz);
      const wallG = new THREE.Group();
      // massiver Sockel
      const base = new THREE.Mesh(new THREE.BoxGeometry(len, 1.3, 1.25), stoneMat(0.85 + rnd() * 0.25, 0.5 + rnd() * 0.5));
      base.position.y = 0.65;
      wallG.add(base);
      // gebrochene Oberkante: unregelmäßige Segmente unterschiedlicher Höhe
      let cx = -len / 2;
      while (cx < len / 2 - 0.5) {
        const w = 0.7 + rnd() * 1.3;
        const h = 0.4 + rnd() * 1.5;
        const seg = new THREE.Mesh(new THREE.BoxGeometry(Math.min(w, len / 2 - cx) * 0.96, h, 1.15), stoneMat(0.8 + rnd() * 0.35));
        seg.position.set(cx + w / 2, 1.3 + h / 2, (rnd() - 0.5) * 0.08);
        seg.rotation.y = (rnd() - 0.5) * 0.05;
        wallG.add(seg);
        cx += w;
      }
      // Schutt am Fuß der Mauer
      for (let i = 0; i < 4; i++) {
        const rb = new THREE.Mesh(rubbleGeo, stoneMat(0.7 + rnd() * 0.3, 0.6 + rnd() * 0.4));
        const rsc = 0.5 + rnd() * 0.9;
        rb.scale.set(rsc, rsc * 0.6, rsc);
        rb.position.set((rnd() - 0.5) * len, 0.15, (rnd() > 0.5 ? 1 : -1) * (0.9 + rnd() * 0.6));
        rb.rotation.set(rnd() * 3, rnd() * 6, rnd() * 3);
        wallG.add(rb);
      }
      wallG.rotation.y = rot;
      wallG.position.set(rx, y, rz);
      wallG.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      this.group.add(wallG);
      this.colliders.push({ x: rx, z: rz, r: 1.8 });
    }

    const pillars = [[-8, -6, 1.0], [10, 4, 1.4], [0, 18, 1.1], [-18, -2, 1.2], [20, 8, 0.9], [-26, 14, 1.3], [16, -18, 1.1], [-6, -22, 1.0], [28, 0, 1.2], [-32, 4, 0.9]];
    let pi = 0;
    for (const [sx, sz, sc] of pillars) {
      const y = terrainHeight(sx, sz);
      const mat = stoneMat(0.85 + rnd() * 0.3);
      if (pi++ % 3 === 2) {
        // umgestürzte Säule: liegender Schaft + abgebrochener Stumpf
        const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.42 * sc, 0.5 * sc, 3.4 * sc, 8), mat);
        shaft.rotation.set(0, rnd() * Math.PI, Math.PI / 2 - 0.06);
        shaft.position.set(sx + 1.2 * sc, y + 0.5 * sc, sz);
        shaft.castShadow = true;
        this.group.add(shaft);
        const stump = new THREE.Mesh(new THREE.CylinderGeometry(0.5 * sc, 0.62 * sc, 1.0 * sc, 8), mat);
        stump.position.set(sx - 0.8 * sc, y + 0.5 * sc, sz);
        stump.castShadow = true;
        this.group.add(stump);
        this.colliders.push({ x: sx, z: sz, r: 1.0 * sc });
      } else {
        // stehender Pfeiler: Sockelplatte + Schaft + gekippte Bruchkrone
        const plinth = new THREE.Mesh(new THREE.BoxGeometry(1.5 * sc, 0.45, 1.5 * sc), mat);
        this._place(plinth, sx, sz, 0.22);
        const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.48 * sc, 0.6 * sc, 3.7 * sc, 8), mat);
        this._place(pillar, sx, sz, 0.45 + 1.85 * sc);
        const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.52 * sc, 0.48 * sc, 0.6 * sc, 8), mat);
        crown.rotation.set((rnd() - 0.5) * 0.3, 0, (rnd() - 0.5) * 0.3);
        this._place(crown, sx, sz, 0.45 + 3.7 * sc + 0.2);
        plinth.castShadow = pillar.castShadow = crown.castShadow = true;
        this.colliders.push({ x: sx, z: sz, r: 0.8 * sc });
      }
    }
  }

  // Altes-Lager-Zelte + Kisten/Fässer rund um die Lagerfeuer (nur Tal)
  _buildTents() {
    let seed = 777;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const cloth = [0x6a5138, 0x5a4a34, 0x74583a];
    const tents = [[5, 11, 0.4], [-7, 1, 2.2], [-25, 29, 1.1], [-14, 19, 2.9], [7, 0, 5.3]];
    for (const [tx, tz, rot] of tents) {
      const y = terrainHeight(tx, tz);
      const tent = new THREE.Group();
      const cone = new THREE.Mesh(
        new THREE.ConeGeometry(2.1, 2.5, 7),
        new THREE.MeshStandardMaterial({ color: cloth[Math.floor(rnd() * cloth.length)], roughness: 1, bumpMap: bumpTexture(), bumpScale: 0.3 })
      );
      cone.position.y = 1.25;
      cone.rotation.y = rnd() * Math.PI;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 3.1, 5), new THREE.MeshStandardMaterial({ color: 0x2e2113, roughness: 1 }));
      pole.position.y = 1.55;
      tent.add(cone, pole);
      tent.rotation.y = rot;
      tent.rotation.z = (rnd() - 0.5) * 0.05;
      tent.position.set(tx, y, tz);
      tent.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      this.group.add(tent);
      this.colliders.push({ x: tx, z: tz, r: 1.9 });
    }
    // Kisten & Fässer
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x4a3620, roughness: 1, bumpMap: bumpTexture(), bumpScale: 0.4 });
    const props = [[2, 8, 'crate'], [-3, 4, 'barrel'], [-22, 26, 'barrel'], [-17, 23, 'crate'], [3, 3, 'barrel']];
    for (const [px, pz, kind] of props) {
      const y = terrainHeight(px, pz);
      let mesh;
      if (kind === 'crate') {
        mesh = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.85, 0.85), woodMat);
        mesh.position.set(px, y + 0.42, pz);
        mesh.rotation.y = rnd() * Math.PI;
      } else {
        mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.4, 0.95, 9), woodMat);
        mesh.position.set(px, y + 0.47, pz);
      }
      mesh.castShadow = true;
      this.group.add(mesh);
      this.colliders.push({ x: px, z: pz, r: 0.55 });
    }
  }

  // Sumpf: Wassertümpel, Holzpfähle, versunkene Steinblöcke (3D)
  _bogFeatures() {
    const wood = new THREE.MeshStandardMaterial({ color: 0x2a2014, roughness: 1, bumpMap: bumpTexture(), bumpScale: 0.4 });
    const stone = new THREE.MeshStandardMaterial({ color: this.theme.stone, roughness: 1, bumpMap: bumpTexture(), bumpScale: 0.5 });
    const water = new THREE.MeshStandardMaterial({ color: this.theme.waterColor || 0x16321f, roughness: 0.15, metalness: 0.4, transparent: true, opacity: 0.85, emissive: 0x1a4a2c, emissiveIntensity: 0.22 });
    this._waterMat = water; // schimmert im update()
    const pools = [[-14, 8, 5], [16, -6, 6], [-26, -16, 7], [26, 16, 5], [2, 28, 6], [-30, 22, 4.5], [12, -26, 5.5], [-4, -6, 4]];
    this.bogPools = pools.map(([px, pz, prr]) => ({ x: px, z: pz, r: prr })); // Map-Special: Morast bremst
    for (const [px, pz, prr] of pools) {
      const w = new THREE.Mesh(new THREE.CircleGeometry(prr, 22), water);
      w.rotation.x = -Math.PI / 2;
      w.position.set(px, terrainHeight(px, pz) + 0.15, pz);
      this.group.add(w);
    }
    const stakes = [[-8, 14, 2.2], [10, 4, 1.8], [0, 20, 2.6], [-20, 2, 2.0], [22, 10, 2.3], [-28, 16, 1.7], [18, -16, 2.4], [-6, -20, 1.9], [30, -2, 2.1], [6, -30, 2.0]];
    for (const [x, z, h] of stakes) {
      const stk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.38, h, 6), wood);
      stk.rotation.z = (Math.random() - 0.5) * 0.25;
      this._place(stk, x, z, h / 2);
      this.colliders.push({ x, z, r: 0.5 });
    }
    const blocks = [[-20, 12], [22, -12], [6, -28], [-32, 24], [14, 22]];
    for (const [x, z] of blocks) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(3, 2.2, 3), stone);
      b.rotation.y = Math.random() * Math.PI;
      this._place(b, x, z, 0.5);
      this.colliders.push({ x, z, r: 2 });
    }
  }

  // Cyberpunk: Gebäudeblocks mit Leuchtfenstern, Neon-Dachkanten, Straßenlampen, Holo-Ringe
  _cityFeatures() {
    let seed = 1717;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const winTex = windowTexture();
    for (let i = 0; i < 30; i++) {
      const a = rnd() * Math.PI * 2;
      const dist = 24 + rnd() * 95;
      const x = Math.cos(a) * dist, z = Math.sin(a) * dist;
      if (!this.inBounds(x, z, 12)) continue;
      if (Math.hypot(x, z - 50) < 20) continue; // Spawn-Bereich freihalten
      // innen niedrige Blocks (Sicht!), Hochhäuser nur am Rand
      const w = 5 + rnd() * 5, d = 5 + rnd() * 5;
      const h = dist < 60 ? 4 + rnd() * 4 : 8 + rnd() * 16;
      const mat = new THREE.MeshStandardMaterial({ color: 0x14161e, roughness: 0.85, emissive: 0xffffff, emissiveMap: winTex, emissiveIntensity: 0.9 });
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      const y = terrainHeight(x, z);
      b.position.set(x, y + h / 2 - 0.3, z);
      b.rotation.y = Math.floor(rnd() * 4) * (Math.PI / 2) + (rnd() - 0.5) * 0.12;
      b.castShadow = true;
      this.group.add(b);
      // Neon-Kante auf dem Dach
      const neon = new THREE.Mesh(
        new THREE.BoxGeometry(w * 0.92, 0.14, 0.14),
        new THREE.MeshBasicMaterial({ color: rnd() > 0.5 ? 0xff2fd0 : 0x2fd0ff })
      );
      neon.position.set(x, y + h - 0.2, z);
      neon.rotation.y = b.rotation.y;
      this.group.add(neon);
      this.colliders.push({ x, z, r: Math.max(w, d) * 0.62 });
    }
    // Straßenlampen als kalte Lichtinseln
    const lamps = [[-10, 10], [12, 8], [-16, -12], [16, -12], [0, 22], [-26, 2], [26, 18], [8, -26], [0, -8]];
    let li = 0;
    for (const [lx, lz] of lamps) this._buildNeonLamp(lx, lz, li++ % 2 ? 0xff2fd0 : 0x2fd0ff);
    // schwebende Holo-Ringe
    for (let i = 0; i < 6; i++) {
      const x = (rnd() * 2 - 1) * 60, z = (rnd() * 2 - 1) * 60;
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(1.1 + rnd(), 0.06, 8, 24),
        new THREE.MeshBasicMaterial({ color: 0x2fd0ff, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false })
      );
      ring.position.set(x, terrainHeight(x, z) + 5 + rnd() * 4, z);
      ring.rotation.x = Math.PI / 2;
      this.group.add(ring);
    }
    // Map-Special: Boost-Pads (kurzer Tempo-Schub beim Drüberlaufen)
    this.boostPads = [];
    for (const [bx, bz] of [[-6, 2], [10, -14], [-18, 16], [20, 24], [4, 34], [-28, -10]]) {
      const pad = new THREE.Mesh(
        new THREE.CircleGeometry(1.3, 24),
        new THREE.MeshBasicMaterial({ color: 0x2fd0ff, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false })
      );
      pad.rotation.x = -Math.PI / 2;
      pad.position.set(bx, terrainHeight(bx, bz) + 0.1, bz);
      pad.renderOrder = 2;
      this.group.add(pad);
      this.boostPads.push({ x: bx, z: bz, cd: 0, mesh: pad });
    }
  }

  _buildNeonLamp(x, z, color) {
    const y = terrainHeight(x, z);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 4.4, 6), new THREE.MeshStandardMaterial({ color: 0x1c1e26, roughness: 0.7, metalness: 0.5 }));
    pole.position.set(x, y + 2.2, z);
    pole.castShadow = true;
    this.group.add(pole);
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.4, 6), new THREE.MeshBasicMaterial({ color }));
    tube.rotation.z = Math.PI / 2;
    tube.position.set(x, y + 4.4, z);
    this.group.add(tube);
    const pool = new THREE.Mesh(
      new THREE.PlaneGeometry(6, 6),
      new THREE.MeshBasicMaterial({ map: glowTexture(), color, transparent: true, opacity: 0.18, depthWrite: false, blending: THREE.AdditiveBlending })
    );
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(x, y + 0.08, z);
    pool.renderOrder = 2;
    this.group.add(pool);
    const light = new THREE.PointLight(color, 2.2, 22, 2);
    light.position.set(x, y + 4.2, z);
    this.group.add(light);
    this.torchLights.push({ light, flame: null, base: 2.2, x, z, seed: Math.random() * 10 });
  }

  // 2.-Weltkrieg-Front: Sandsack-Stellungen, Panzersperren, Stacheldraht, Backstein-Ruinen, Feuertonnen
  _warFeatures() {
    let seed = 999;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    // Sandsack-Stellungen
    const sandMat = new THREE.MeshStandardMaterial({ color: 0x6a5c3c, roughness: 1, bumpMap: bumpTexture(), bumpScale: 0.3 });
    const sandGeo = new THREE.SphereGeometry(0.42, 8, 6);
    const walls = [[-16, 8, 0.3], [14, -6, 1.2], [-8, -18, 2.2], [20, 14, 0.8], [-28, 20, 1.6], [4, 26, 0.1]];
    for (const [wx, wz, rot] of walls) {
      const gW = new THREE.Group();
      for (let row = 0; row < 2; row++) {
        for (let k = 0; k < 6; k++) {
          const bag = new THREE.Mesh(sandGeo, sandMat);
          bag.scale.set(1.5, 0.7, 0.9);
          bag.position.set(-2.1 + k * 0.85 + (row % 2) * 0.4, 0.28 + row * 0.42, 0);
          bag.rotation.y = (rnd() - 0.5) * 0.3;
          gW.add(bag);
        }
      }
      gW.rotation.y = rot;
      gW.position.set(wx, terrainHeight(wx, wz), wz);
      gW.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      this.group.add(gW);
      this.colliders.push({ x: wx, z: wz, r: 1.6 });
    }
    // Panzersperren (gekreuzte Stahlträger)
    const steel = new THREE.MeshStandardMaterial({ color: 0x2c2e30, roughness: 0.6, metalness: 0.7 });
    const beam = new THREE.BoxGeometry(0.22, 2.6, 0.22);
    const hedgehogs = [[-22, -6], [10, 18], [26, -2], [-4, -28], [-32, 8], [18, -22], [2, 12]];
    for (const [hx, hz] of hedgehogs) {
      const hg = new THREE.Group();
      for (const tilt of [[0.9, 0.3], [-0.5, 1.2], [-0.5, -0.9]]) {
        const b = new THREE.Mesh(beam, steel);
        b.rotation.set(tilt[0], 0, tilt[1]);
        hg.add(b);
      }
      hg.rotation.y = rnd() * Math.PI;
      hg.position.set(hx, terrainHeight(hx, hz) + 0.6, hz);
      hg.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      this.group.add(hg);
      this.colliders.push({ x: hx, z: hz, r: 0.9 });
    }
    // Stacheldraht-Linien: schiefe Holzpfosten + gespannte Drähte
    const postGeo = new THREE.CylinderGeometry(0.06, 0.08, 1.3, 5);
    const wood = new THREE.MeshStandardMaterial({ color: 0x2c2416, roughness: 1 });
    const wire = new THREE.MeshStandardMaterial({ color: 0x3a3c3e, roughness: 0.5, metalness: 0.6 });
    const lines = [[-30, -18, 0.4], [22, 24, 1.9], [-12, 30, 0.9], [30, 6, 2.6]];
    for (const [lx, lz, rot] of lines) {
      const lg = new THREE.Group();
      for (let k = 0; k < 4; k++) {
        const pMesh = new THREE.Mesh(postGeo, wood);
        pMesh.position.set(k * 2.2 - 3.3, 0.65, 0);
        pMesh.rotation.z = (rnd() - 0.5) * 0.2;
        lg.add(pMesh);
      }
      for (let w = 0; w < 2; w++) {
        const wr = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 6.8, 4), wire);
        wr.rotation.z = Math.PI / 2;
        wr.position.set(0, 0.45 + w * 0.45, 0);
        lg.add(wr);
      }
      lg.rotation.y = rot;
      lg.position.set(lx, terrainHeight(lx, lz), lz);
      this.group.add(lg);
    }
    // zerschossene Backstein-Mauerreste
    const brick = new THREE.MeshStandardMaterial({ color: 0x5a3a30, roughness: 1, bumpMap: bumpTexture(), bumpScale: 0.5 });
    const ruins = [[-10, 4, 0.6, 5], [16, 6, 1.4, 4], [8, -14, 2.4, 6], [-24, 30, 0.2, 4]];
    for (const [rx, rz, rot, len] of ruins) {
      const y = terrainHeight(rx, rz);
      const wallG = new THREE.Group();
      const base = new THREE.Mesh(new THREE.BoxGeometry(len, 1.1, 0.6), brick);
      base.position.y = 0.55;
      wallG.add(base);
      let cx = -len / 2;
      while (cx < len / 2 - 0.4) {
        const w = 0.6 + rnd() * 1.0, h = 0.3 + rnd() * 1.3;
        const seg = new THREE.Mesh(new THREE.BoxGeometry(w * 0.95, h, 0.55), brick);
        seg.position.set(cx + w / 2, 1.1 + h / 2, 0);
        wallG.add(seg);
        cx += w;
      }
      wallG.rotation.y = rot;
      wallG.position.set(rx, y, rz);
      wallG.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      this.group.add(wallG);
      this.colliders.push({ x: rx, z: rz, r: 1.4 });
    }
    // brennende Fässer als Lichtquellen
    for (const [bx, bz] of [[0, 6], [-20, 24], [14, -10]]) this._buildBarrelFire(bx, bz);
    // Map-Special: zwei fahrbare Panzer (Respawn-Logik in RunControl)
    this._buildTank(-8, 34);
    this._buildTank(18, -16);
  }

  // Fahrbarer Panzer (Map-Special Frontlinie). Fahr-Logik lebt in RunControl._updateMapSpecials;
  // die Gruppe dient beim Fahren als Fahrzeug-Visual (folgt dem Spieler).
  _buildTank(x, z) {
    const g = new THREE.Group();
    const olive = new THREE.MeshStandardMaterial({ color: 0x3f4a2c, roughness: 0.8, metalness: 0.3 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x24281e, roughness: 0.9 });
    const hull = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.8, 1.7), olive);
    hull.position.y = 0.75;
    const turret = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.55, 1.1), olive);
    turret.position.set(-0.2, 1.35, 0);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 2.2, 8), dark);
    barrel.rotation.z = Math.PI / 2;
    barrel.position.set(1.15, 1.4, 0);
    const trackL = new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.55, 0.42), dark);
    trackL.position.set(0, 0.35, 0.95);
    const trackR = trackL.clone();
    trackR.position.z = -0.95;
    g.add(hull, turret, barrel, trackL, trackR);
    g.position.set(x, terrainHeight(x, z), z);
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    this.group.add(g);
    const collider = { x, z, r: 1.6 };
    this.colliders.push(collider);
    if (!this.tanks) this.tanks = [];
    this.tanks.push({ group: g, taken: false, homeX: x, homeZ: z, collider, respawn: 0 });
  }

  _buildBarrelFire(x, z) {
    const y = terrainHeight(x, z);
    const barrel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.42, 0.46, 1.05, 10),
      new THREE.MeshStandardMaterial({ color: 0x35402c, roughness: 0.8, metalness: 0.4 })
    );
    barrel.position.set(x, y + 0.52, z);
    barrel.castShadow = true;
    this.group.add(barrel);
    const flame = new THREE.Group();
    const fo = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.9, 7), new THREE.MeshBasicMaterial({ color: 0xff7a1a, transparent: true, opacity: 0.85, fog: false, blending: THREE.AdditiveBlending, depthWrite: false }));
    const fc = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.55, 6), new THREE.MeshBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 0.95, fog: false, blending: THREE.AdditiveBlending, depthWrite: false }));
    fc.position.y = -0.1;
    flame.add(fo, fc);
    flame.position.set(x, y + 1.45, z);
    this.group.add(flame);
    const light = new THREE.PointLight(0xff8a2a, 3.2, 30, 2);
    light.position.set(x, y + 1.8, z);
    this.group.add(light);
    this.torchLights.push({ light, flame, base: 3.2, x, z, seed: Math.random() * 10 });
    this.colliders.push({ x, z, r: 0.6 });
  }

  // Hohlweg: Stollen-Stützbögen, Wand-Fackeln, Geröll + glühendes Erz an den Wandfüßen
  _canyonFeatures() {
    let seed = 313;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const wood = new THREE.MeshStandardMaterial({ color: 0x2e2113, roughness: 1, bumpMap: bumpTexture(), bumpScale: 0.4 });
    // Stützbögen in Abständen entlang des Wegs
    for (let x = -360; x <= 360; x += 24 + Math.floor(rnd() * 12)) {
      const gS = new THREE.Group();
      for (const side of [-1, 1]) {
        const postM = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 5.6, 6), wood);
        postM.position.set(0, 2.7, side * 11.6);
        postM.rotation.x = side * -0.12;
        gS.add(postM);
      }
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 24, 6), wood);
      beam.rotation.x = Math.PI / 2;
      beam.position.set(0, 5.4, 0);
      gS.add(beam);
      gS.position.set(x, terrainHeight(x, 0), 0);
      gS.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      this.group.add(gS);
    }
    // Fackeln abwechselnd an beiden Wänden
    let ti = 0;
    for (let x = -350; x <= 350; x += 40) this._buildTorch(x, ti++ % 2 === 0 ? -10.5 : 10.5);
    // Geröll + glühendes Magie-Erz an den Wandfüßen
    for (let i = 0; i < 70; i++) {
      const x = (rnd() * 2 - 1) * 360;
      const side = rnd() > 0.5 ? 1 : -1;
      const z = side * (9.5 + rnd() * 3);
      if (rnd() < 0.18) {
        this._placeOre(x, z, 0.5 + rnd() * 0.8);
      } else {
        const rb = new THREE.Mesh(new THREE.DodecahedronGeometry(0.5, 0), new THREE.MeshStandardMaterial({ color: 0x4c4842, roughness: 1, flatShading: true }));
        const sc = 0.5 + rnd() * 1.1;
        rb.scale.set(sc, sc * 0.7, sc);
        rb.position.set(x, terrainHeight(x, z) + 0.2, z);
        rb.rotation.set(rnd() * 3, rnd() * 6, rnd() * 3);
        this.group.add(rb);
      }
    }
    this._buildCampfire(6, 0);

    // Map-Special: Schienen in der Mitte + Minen-Lore, die periodisch durchrast
    const railMat = new THREE.MeshStandardMaterial({ color: 0x3a3c40, roughness: 0.5, metalness: 0.7 });
    for (let rx = -370; rx < 370; rx += 10) {
      const y = terrainHeight(rx + 5, 0);
      for (const off of [-0.55, 0.55]) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(10.2, 0.07, 0.09), railMat);
        rail.position.set(rx + 5, y + 0.32, off);
        this.group.add(rail);
      }
    }
    const sleeperGeo = new THREE.BoxGeometry(0.22, 0.06, 1.5);
    const sleeperMat = new THREE.MeshStandardMaterial({ color: 0x241c10, roughness: 1 });
    const sleepers = new THREE.InstancedMesh(sleeperGeo, sleeperMat, 300);
    const sm = new THREE.Matrix4();
    let si = 0;
    for (let rx = -370; rx < 370 && si < 300; rx += 2.5) {
      sm.makeTranslation(rx, terrainHeight(rx, 0) + 0.26, 0);
      sleepers.setMatrixAt(si++, sm);
    }
    sleepers.count = si;
    this.group.add(sleepers);
    // die Lore selbst (versteckt bis zur Durchfahrt)
    const loreG = new THREE.Group();
    const rust = new THREE.MeshStandardMaterial({ color: 0x4a3226, roughness: 0.8, metalness: 0.4 });
    const cart = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.75, 1.05), rust);
    cart.position.y = 0.75;
    loreG.add(cart);
    const oreLoad = new THREE.Mesh(new THREE.DodecahedronGeometry(0.42, 0), new THREE.MeshStandardMaterial({ color: 0x3a4650, roughness: 0.8, emissive: 0x1e90b4, emissiveIntensity: 0.9 }));
    oreLoad.position.y = 1.2;
    loreG.add(oreLoad);
    const wheelGeo = new THREE.CylinderGeometry(0.22, 0.22, 0.1, 10);
    for (const [wx, wz] of [[-0.5, 0.55], [0.5, 0.55], [-0.5, -0.55], [0.5, -0.55]]) {
      const wheel = new THREE.Mesh(wheelGeo, railMat);
      wheel.rotation.x = Math.PI / 2;
      wheel.position.set(wx, 0.3, wz);
      loreG.add(wheel);
    }
    loreG.visible = false;
    loreG.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    this.group.add(loreG);
    this.lore = { group: loreG, active: false, x: 0, dir: 1, timer: 14 };
  }

  _buildTorch(x, z) {
    const y = terrainHeight(x, z);
    // schiefer, konischer Holzpfahl mit Eisenring — statt glattem Zylinder
    const post = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.17, 2.9, 7),
      new THREE.MeshStandardMaterial({ color: 0x2e2113, roughness: 1, bumpMap: bumpTexture(), bumpScale: 0.35 })
    );
    post.position.set(x, y + 1.45, z);
    post.rotation.z = (Math.random() - 0.5) * 0.08;
    post.castShadow = true;
    this.group.add(post);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.15, 0.035, 6, 12),
      new THREE.MeshStandardMaterial({ color: 0x23232a, roughness: 0.55, metalness: 0.75 })
    );
    ring.position.set(x, y + 2.72, z);
    ring.rotation.x = Math.PI / 2;
    this.group.add(ring);
    // zweilagige Flamme (additiv): warmer Mantel + heller Kern
    const flame = new THREE.Group();
    const outer = new THREE.Mesh(
      new THREE.ConeGeometry(0.2, 0.72, 7),
      new THREE.MeshBasicMaterial({ color: 0xff7a1a, transparent: true, opacity: 0.85, fog: false, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    const core = new THREE.Mesh(
      new THREE.ConeGeometry(0.1, 0.42, 6),
      new THREE.MeshBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 0.95, fog: false, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    core.position.y = -0.08;
    flame.add(outer, core);
    flame.position.set(x, y + 3.15, z);
    this.group.add(flame);
    // warmer Lichtschein am Boden
    const pool = new THREE.Mesh(
      new THREE.PlaneGeometry(4.6, 4.6),
      new THREE.MeshBasicMaterial({ map: glowTexture(), color: 0xff8a2a, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending })
    );
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(x, y + 0.08, z);
    pool.renderOrder = 2;
    this.group.add(pool);
    const light = new THREE.PointLight(0xff9a3a, 2.4, 26, 2);
    light.position.set(x, y + 3.4, z);
    this.group.add(light);
    this.torchLights.push({ light, flame, base: 2.4, x, z, seed: Math.random() * 10 });
  }

  _buildCampfire(x, z) {
    const y = terrainHeight(x, z);
    // Steinkreis aus einzelnen Brocken statt glattem Torus
    const stoneMat = new THREE.MeshStandardMaterial({ color: 0x44464c, roughness: 1, flatShading: true });
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const st = new THREE.Mesh(new THREE.DodecahedronGeometry(0.3, 0), stoneMat);
      st.position.set(x + Math.cos(a) * 1.5, y + 0.22, z + Math.sin(a) * 1.5);
      st.rotation.set(Math.random() * 3, Math.random() * 6, 0);
      st.scale.y = 0.7;
      this.group.add(st);
    }
    // gekreuzte Holzscheite
    const wood = new THREE.MeshStandardMaterial({ color: 0x2a1c10, roughness: 1 });
    for (const rot of [0.5, 1.7, 2.6]) {
      const log = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 1.7, 6), wood);
      log.position.set(x, y + 0.34, z);
      log.rotation.set(Math.PI / 2 - 0.35, rot, 0);
      this.group.add(log);
    }
    // zweilagige Flamme
    const fire = new THREE.Group();
    const fOuter = new THREE.Mesh(
      new THREE.ConeGeometry(0.75, 1.9, 8),
      new THREE.MeshBasicMaterial({ color: 0xff7a1a, transparent: true, opacity: 0.8, fog: false, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    const fCore = new THREE.Mesh(
      new THREE.ConeGeometry(0.4, 1.2, 7),
      new THREE.MeshBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 0.95, fog: false, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    fCore.position.y = -0.25;
    fire.add(fOuter, fCore);
    fire.position.set(x, y + 1.15, z);
    this.group.add(fire);
    // großer warmer Lichtschein am Boden
    const pool = new THREE.Mesh(
      new THREE.PlaneGeometry(9, 9),
      new THREE.MeshBasicMaterial({ map: glowTexture(), color: 0xff8a2a, transparent: true, opacity: 0.26, depthWrite: false, blending: THREE.AdditiveBlending })
    );
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(x, y + 0.1, z);
    pool.renderOrder = 2;
    this.group.add(pool);
    const light = new THREE.PointLight(0xff8a2a, 4.5, 40, 2);
    light.position.set(x, y + 2.0, z);
    this.group.add(light);
    this.torchLights.push({ light, flame: fire, base: 4.5, x, z, seed: 5.5 });
    this.colliders.push({ x, z, r: 1.6 });
  }

  // --------------------------------------------------------------- Vegetation
  _buildVegetation() {
    let seed = 9001;
    const rnd = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };

    const dead = this.theme.vegStyle === 'dead';
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const p = new THREE.Vector3();

    // Bäume (3D): Tal = Nadelbäume mit 3 Kronen-Etagen; Sumpf = hohe kahle Bäume mit Ast.
    // Pro Baum leichte Neigung + Farbvariation (setColorAt) — bricht die Klon-Optik.
    const treeCount = this.theme.treeCount;
    const trunkGeo = dead ? new THREE.CylinderGeometry(0.18, 0.4, 9, 6) : new THREE.CylinderGeometry(0.4, 0.6, 6, 6);
    const trunkMat = new THREE.MeshStandardMaterial({ color: this.theme.trunk, roughness: 1, map: barkTexture(), bumpMap: bumpTexture(), bumpScale: 0.6 });
    const folMat = new THREE.MeshStandardMaterial({ color: this.theme.foliage, roughness: 0.95, map: foliageTexture() });
    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, treeCount);
    trunks.castShadow = true;
    const layers = dead
      ? [{ geo: new THREE.ConeGeometry(1.5, 2.6, 6), y: 8.4 }]
      : [
          { geo: new THREE.ConeGeometry(3.1, 4.4, 7), y: 6.8 },
          { geo: new THREE.ConeGeometry(2.3, 3.6, 7), y: 9.2 },
          { geo: new THREE.ConeGeometry(1.5, 3.0, 7), y: 11.2 },
        ];
    const folMeshes = layers.map((L) => {
      const im = new THREE.InstancedMesh(L.geo, folMat, treeCount);
      im.castShadow = true;
      return im;
    });
    // Sumpf: ein knorriger Ast pro Baum
    let branches = null;
    if (dead) {
      const brGeo = new THREE.CylinderGeometry(0.05, 0.1, 2.6, 5);
      brGeo.translate(0, 1.3, 0);
      brGeo.rotateZ(1.1);
      branches = new THREE.InstancedMesh(brGeo, trunkMat, treeCount);
      branches.castShadow = true;
    }
    const trunkY = dead ? 4.5 : 3;
    const tint = new THREE.Color();
    const treeList = [];
    const corridorVeg = this.theme.bounds === 'corridor';
    let placed = 0, tries = 0;
    while (placed < treeCount && tries < treeCount * 8) {
      tries++;
      let x, z;
      if (corridorVeg) {
        // Bäume auf den Wällen links/rechts des Hohlwegs
        x = (rnd() * 2 - 1) * 370;
        z = (rnd() > 0.5 ? 1 : -1) * (15 + rnd() * 8);
      } else {
        const a = rnd() * Math.PI * 2;
        const dist = 32 + rnd() * 95;
        x = Math.cos(a) * dist;
        z = Math.sin(a) * dist;
        if (Math.hypot(x, z) > BARRIER_RADIUS - 8) continue;
      }
      const y = terrainHeight(x, z);
      const sc = 0.7 + rnd() * 0.9;
      // leichte Schräglage + zufällige Drehung
      q.setFromEuler(new THREE.Euler((rnd() - 0.5) * 0.09, rnd() * Math.PI * 2, (rnd() - 0.5) * 0.09));
      s.set(sc, sc, sc);
      p.set(x, y + trunkY * sc, z); m.compose(p, q, s); trunks.setMatrixAt(placed, m);
      const shade = 0.8 + rnd() * 0.45;
      tint.setRGB(shade * (0.9 + rnd() * 0.2), shade, shade * 0.9);
      for (let li = 0; li < layers.length; li++) {
        p.set(x, y + layers[li].y * sc, z);
        m.compose(p, q, s);
        folMeshes[li].setMatrixAt(placed, m);
        folMeshes[li].setColorAt(placed, tint);
      }
      if (branches) {
        p.set(x, y + (5.2 + rnd() * 2) * sc, z);
        m.compose(p, q, s);
        branches.setMatrixAt(placed, m);
      }
      this.colliders.push({ x, z, r: 0.7 * sc });
      treeList.push({ x, y, z, sc, q: q.clone(), cur: 1 });
      placed++;
    }
    trunks.count = placed;
    for (const fm of folMeshes) fm.count = placed;
    this.group.add(trunks, ...folMeshes);
    if (branches) { branches.count = placed; this.group.add(branches); }
    this._treeFade = { folMeshes, branches, layers, list: treeList };

    // Felsen (3D)
    const rockCount = this.theme.rockCount;
    const rockGeo = new THREE.DodecahedronGeometry(1.4, 0);
    const rockMat = new THREE.MeshStandardMaterial({ color: this.theme.rockMat, roughness: 1, flatShading: true, bumpMap: bumpTexture(), bumpScale: 0.5 });
    const rocks = new THREE.InstancedMesh(rockGeo, rockMat, rockCount);
    rocks.castShadow = true; rocks.receiveShadow = true;
    const rockTint = new THREE.Color();
    let rp = 0;
    for (let i = 0; i < rockCount; i++) {
      const a = rnd() * Math.PI * 2;
      const dist = 30 + rnd() * 100;
      const x = Math.cos(a) * dist, z = Math.sin(a) * dist;
      if (Math.hypot(x, z) > BARRIER_RADIUS - 5) continue;
      const y = terrainHeight(x, z);
      const sc = 0.6 + rnd() * 1.5;
      p.set(x, y + sc * 0.4, z);
      q.setFromEuler(new THREE.Euler(rnd() * 3, rnd() * 6, rnd() * 3));
      s.set(sc, sc * 0.8, sc);
      m.compose(p, q, s);
      rocks.setMatrixAt(rp, m);
      // Helligkeitsvariation + gelegentlicher Moos-Stich
      const rshade = 0.75 + rnd() * 0.5;
      const moss = rnd() < 0.35 ? 0.18 : 0;
      rockTint.setRGB(rshade * (1 - moss * 0.4), rshade, rshade * (1 - moss * 0.6));
      rocks.setColorAt(rp, rockTint);
      if (sc > 1.1) this.colliders.push({ x, z, r: sc });
      rp++;
    }
    rocks.count = rp;
    this.group.add(rocks);

    // Grasbüschel / Schilf (Billboards, instanziert, kein Schatten)
    const grassCount = this.theme.grassCount;
    // gekreuzte Quads (2 Ebenen) -> Volumen von jedem Blickwinkel, kein flaches Raut-Rauschen
    const g1 = new THREE.PlaneGeometry(1.5, 1.2);
    const g2 = g1.clone(); g2.rotateY(Math.PI / 2);
    const bladeGeo = mergeGeometries ? mergeGeometries([g1, g2]) : g1;
    const grassMat = new THREE.MeshStandardMaterial({
      color: this.theme.grassMat,
      roughness: 1,
      side: THREE.DoubleSide,
      map: grassTuftTexture(),
      transparent: true,
      alphaTest: 0.28,
      depthWrite: true,
    });
    const grass = new THREE.InstancedMesh(bladeGeo, grassMat, grassCount);
    const grassTint = new THREE.Color();
    let gp = 0;
    for (let i = 0; i < grassCount; i++) {
      let x, z;
      if (corridorVeg) {
        x = (rnd() * 2 - 1) * 370;
        z = (rnd() * 2 - 1) * 12;
      } else {
        const a = rnd() * Math.PI * 2;
        const dist = 6 + rnd() * 110;
        x = Math.cos(a) * dist;
        z = Math.sin(a) * dist;
        if (Math.hypot(x, z) > BARRIER_RADIUS - 4) continue;
      }
      const y = terrainHeight(x, z);
      const gs = 0.7 + rnd() * 0.9;
      const gy = dead ? 2.2 : 1; // Schilf höher
      p.set(x, y + 0.5 * gy, z);
      q.setFromEuler(new THREE.Euler(0, rnd() * Math.PI, 0));
      s.set(gs, gs * gy, gs);
      m.compose(p, q, s);
      grass.setMatrixAt(gp, m);
      grassTint.setRGB(0.82 + rnd() * 0.28, 0.9 + rnd() * 0.2, 0.72 + rnd() * 0.22);
      grass.setColorAt(gp, grassTint);
      gp++;
    }
    grass.count = gp;
    this.group.add(grass);

    // Glühende Pilz-Cluster (Gothic-Flair; emissive -> füttert den Bloom-Pass)
    if (this.theme.shrooms === false) return;
    const clusters = 14;
    const shroomCap = clusters * 5;
    const stemGeo = new THREE.CylinderGeometry(0.05, 0.09, 0.42, 5);
    const capGeo = new THREE.ConeGeometry(0.2, 0.26, 7);
    const glowCol = dead ? 0x6ade4a : 0x35c8f0;
    const stemMat = new THREE.MeshStandardMaterial({ color: 0xb8c4be, roughness: 0.9 });
    const capMat = new THREE.MeshStandardMaterial({ color: 0x18242a, emissive: glowCol, emissiveIntensity: 1.5, roughness: 0.6 });
    const stems = new THREE.InstancedMesh(stemGeo, stemMat, shroomCap);
    const caps = new THREE.InstancedMesh(capGeo, capMat, shroomCap);
    let sp2 = 0;
    for (let ci = 0; ci < clusters; ci++) {
      let ccx, ccz;
      if (corridorVeg) {
        ccx = (rnd() * 2 - 1) * 350;
        ccz = (rnd() > 0.5 ? 1 : -1) * (9 + rnd() * 3);
      } else {
        const a = rnd() * Math.PI * 2;
        const dist = 14 + rnd() * 95;
        ccx = Math.cos(a) * dist;
        ccz = Math.sin(a) * dist;
      }
      const n = 3 + Math.floor(rnd() * 3);
      for (let k = 0; k < n && sp2 < shroomCap; k++) {
        const mx = ccx + (rnd() - 0.5) * 2.4;
        const mz = ccz + (rnd() - 0.5) * 2.4;
        const my = terrainHeight(mx, mz);
        const msc = 0.6 + rnd() * 0.9;
        q.setFromEuler(new THREE.Euler((rnd() - 0.5) * 0.2, rnd() * 6, (rnd() - 0.5) * 0.2));
        s.set(msc, msc, msc);
        p.set(mx, my + 0.21 * msc, mz); m.compose(p, q, s); stems.setMatrixAt(sp2, m);
        p.set(mx, my + 0.5 * msc, mz); m.compose(p, q, s); caps.setMatrixAt(sp2, m);
        sp2++;
      }
    }
    stems.count = sp2;
    caps.count = sp2;
    this.group.add(stems, caps);
  }

  // --------------------------------------------------------------- Kollision
  resolve(pos, radius) {
    for (const c of this.colliders) {
      const dx = pos.x - c.x;
      const dz = pos.z - c.z;
      const d = Math.hypot(dx, dz);
      const min = c.r + radius;
      if (d < min && d > 0.0001) {
        const push = (min - d) / d;
        pos.x += dx * push;
        pos.z += dz * push;
      }
    }
    // innerhalb des Spielfelds halten (radiale Arena oder Korridor)
    this.clampBounds(pos, 4);
  }

  // Begehbarer Bereich je Karte: radiale Arena oder schmaler Korridor entlang X
  inBounds(x, z, m = 0) {
    if (this.theme.bounds === 'corridor') return Math.abs(x) < CORRIDOR_LEN - m && Math.abs(z) < CORRIDOR_HALF - m;
    return Math.hypot(x, z) < BARRIER_RADIUS - m;
  }
  clampBounds(o, m = 4) {
    if (this.theme.bounds === 'corridor') {
      // Korridor: kleiner Rand-Puffer, sonst frisst der Arena-Margin die halbe Wegbreite
      const mz = Math.min(m, 0.6);
      const mx = Math.min(m, 2);
      o.x = Math.max(-(CORRIDOR_LEN - mx), Math.min(CORRIDOR_LEN - mx, o.x));
      o.z = Math.max(-(CORRIDOR_HALF - mz), Math.min(CORRIDOR_HALF - mz, o.z));
      return;
    }
    const r = Math.hypot(o.x, o.z);
    const maxR = BARRIER_RADIUS - m;
    if (r > maxR) {
      o.x *= maxR / r;
      o.z *= maxR / r;
    }
  }
  // Start-Position der Spieler (Korridor: Mitte, sonst Süd-Rand des Lagers)
  spawnPoint() {
    return this.theme.bounds === 'corridor' ? { x: 0, z: 0 } : { x: 0, z: 50 };
  }

  // --------------------------------------------------------------- Update
  update(dt, elapsed, center = null) {
    this.time = elapsed;
    if (this.barrierMat) this.barrierMat.uniforms.uTime.value = elapsed;
    if (this._stormMat && this._stormWall && this._stormWall.visible) this._stormMat.uniforms.uTime.value = elapsed;
    this._updateWeather(dt, elapsed, center);
    this._updateTreeFade(dt, center);
    // Boost-Pads pulsieren (Client kennt keine Cooldowns -> reiner Look)
    if (this.boostPads) {
      for (const pad of this.boostPads) {
        pad.mesh.material.opacity = pad.cd > 0 ? 0.14 : 0.4 + Math.sin(elapsed * 5) * 0.15;
      }
    }
    // Wasseroberflächen schimmern leicht
    if (this._waterMat) this._waterMat.emissiveIntensity = 0.22 + Math.sin(elapsed * 1.1) * 0.1;
    // Fackel-Flackern
    for (const t of this.torchLights) {
      const f = 0.75 + Math.sin(elapsed * 11 + t.seed) * 0.12 + Math.sin(elapsed * 23 + t.seed * 2) * 0.08;
      t.light.intensity = t.base * f;
      if (t.flame) {
        t.flame.scale.y = 0.9 + f * 0.25;
        t.flame.scale.x = t.flame.scale.z = 0.95 + Math.sin(elapsed * 17 + t.seed) * 0.08;
      }
    }
  }
}
