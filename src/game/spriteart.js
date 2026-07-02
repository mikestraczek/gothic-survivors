import * as THREE from 'three';
import { HEROES } from './Heroes.js';

// HD-2D Pixel-Sprites aus echten CC0-Assets (0x72 "Dungeon Tileset II", via tomb_mates).
// Pro Charakter 4 Lauf-Frames -> quadratische Strip-Textur (Füße unten verankert).
// Gegnertypen werden auf passende Gothic-Monster gemappt.

export const SPRITE_FRAMES = 4;

// Gegnertyp -> 0x72-Charakter (Dateien in public/sprites/<char>_f0..3.png)
const TYPE2CHAR = {
  scavenger: 'goblin', // Gobbo
  bloodfly: 'imp',
  wolf: 'wogol',
  molerat: 'muddy',
  skeleton: 'skelet',
  ghoul: 'masked_orc', // Ork statt grünem Zombie
  gargoyle: 'chort',
  demon: 'orc_warrior', // Ork-Krieger
  troll: 'ogre',
  boss: 'orc_shaman', // Ork-Schamane als Boss
  boss_bone: 'necromancer',
  boss_demon: 'big_demon',
  shooter: 'necromancer', // Distanz-Caster (deutlich kleiner als der Boss)
  exploder: 'imp',
  splitter: 'big_zombie',
  zombling: 'zombie',
  player: 'knight_m',
};
// jeder Held bekommt seinen eigenen Sprite (hero_<key> -> Charakter aus Heroes.js)
for (const [k, h] of Object.entries(HEROES)) TYPE2CHAR['hero_' + k] = h.sprite || 'knight_m';

const _tex = {}; // char -> THREE.CanvasTexture
let _blank = null;

function loadImg(src) {
  return new Promise((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = () => reject(new Error('img ' + src));
    im.src = src;
  });
}

function buildStrip(imgs) {
  let cell = 0;
  for (const im of imgs) cell = Math.max(cell, im.width, im.height);
  cell = Math.max(cell, 16);
  const c = document.createElement('canvas');
  c.width = cell * SPRITE_FRAMES;
  c.height = cell;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  imgs.forEach((im, f) => {
    const dx = f * cell + Math.floor((cell - im.width) / 2); // horizontal zentriert
    const dy = cell - im.height; // Füße am unteren Rand
    g.drawImage(im, dx, dy);
  });
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Alle Charakter-Texturen laden (im Game._preload awaiten).
export async function loadSprites(onProgress) {
  const chars = [...new Set(Object.values(TYPE2CHAR))];
  let done = 0;
  for (const ch of chars) {
    try {
      const imgs = await Promise.all([0, 1, 2, 3].map((n) => loadImg(`sprites/${ch}_f${n}.png`)));
      _tex[ch] = buildStrip(imgs);
    } catch (e) {
      console.warn('Sprite-Laden fehlgeschlagen:', ch, e);
    }
    done++;
    if (onProgress) onProgress(done / chars.length);
  }
}

function blankTex() {
  if (_blank) return _blank;
  const c = document.createElement('canvas');
  c.width = c.height = 4;
  _blank = new THREE.CanvasTexture(c);
  return _blank;
}

export function spriteTexture(type) {
  const ch = TYPE2CHAR[type] || 'goblin';
  return _tex[ch] || blankTex();
}

// Quad-Geometrie für InstancedMesh mit eigenem aFrame-Instanz-Buffer.
const _baseQuad = new THREE.PlaneGeometry(1, 1);
export function spriteQuad(cap) {
  const g = _baseQuad.clone();
  g.setAttribute('aFrame', new THREE.InstancedBufferAttribute(new Float32Array(cap), 1));
  const flip = new Float32Array(cap).fill(1);
  g.setAttribute('aFlip', new THREE.InstancedBufferAttribute(flip, 1)); // -1 = horizontal gespiegelt
  return g;
}

// Billboard-Material (immer zur Kamera, Atlas-Frame je Instanz, Cutout-Transparenz).
function makeBillboardMaterial(tex, frames) {
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: false, alphaTest: 0.5, side: THREE.DoubleSide, toneMapped: true });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uFrames = { value: frames };
    sh.vertexShader =
      'attribute float aFrame;\nattribute float aFlip;\nuniform float uFrames;\n' +
      sh.vertexShader
        .replace('#include <uv_vertex>', '#include <uv_vertex>\n vMapUv = vec2((uv.x + aFrame) / uFrames, vMapUv.y);')
        .replace(
          '#include <project_vertex>',
          `vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
           float sc = length(instanceMatrix[0].xyz);
           mvPosition.xy += vec2(position.x * aFlip, position.y + 0.5) * sc;
           gl_Position = projectionMatrix * mvPosition;`
        );
  };
  return mat;
}

export function spriteMaterial(key) {
  return makeBillboardMaterial(spriteTexture(key), SPRITE_FRAMES);
}

export function propMaterial(key) {
  return makeBillboardMaterial(propTexture(key), 1);
}

// ---------- Blob-Schatten (weicher radialer Verlauf) ----------
// Verankert Billboard-Sprites optisch am Boden — echte Schatten wirken auf Billboards nicht.
let _blob = null;
export function blobShadowTexture() {
  if (_blob) return _blob;
  const S = 64;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(S / 2, S / 2, 2, S / 2, S / 2, S / 2);
  grad.addColorStop(0, 'rgba(0,0,0,0.55)');
  grad.addColorStop(0.7, 'rgba(0,0,0,0.28)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, S, S);
  _blob = new THREE.CanvasTexture(c);
  return _blob;
}

// ---------- Prozedurale Pixel-Props (Bäume/Felsen/Grabsteine als Billboards) ----------
const _props = {};
function pcv(size) { const c = document.createElement('canvas'); c.width = c.height = size; return c; }
function pr(g, x, y, w, h, c) { g.fillStyle = c; g.fillRect(x, y, w, h); }

function drawPine(g, S) {
  const cx = S / 2;
  pr(g, cx - 3, S - 16, 6, 16, '#3a2616'); // Stamm
  pr(g, cx - 4, S - 16, 1, 16, '#241408');
  // 4 Lagen Nadeln (Pyramide), unten dunkel -> oben heller, mit Outline
  const cols = ['#1c3618', '#234420', '#2c5226', '#36632e'];
  let top = 6, wBase = S * 0.42;
  for (let i = 0; i < 4; i++) {
    const ly = top + i * (S * 0.18);
    const lw = wBase * (1 - i * 0.18);
    for (let r = 0; r < S * 0.22; r++) {
      const w = lw * (r / (S * 0.22));
      pr(g, cx - w / 2 - 1, ly + r, w + 2, 1, '#0e1c0c'); // Outline
      pr(g, cx - w / 2, ly + r, Math.max(1, w), 1, cols[i]);
    }
    // Highlight-Punkte
    pr(g, cx - 2, ly + 3, 2, 2, cols[3]);
  }
}

function drawDeadTree(g, S) {
  const cx = S / 2;
  pr(g, cx - 3, S - 40, 6, 40, '#241a12');
  pr(g, cx - 4, S - 40, 1, 40, '#140c08');
  pr(g, cx + 2, S - 40, 1, 40, '#3a2a1a');
  // krumme Äste
  pr(g, cx - 3, S - 30, -8, 2, '#241a12'); g.fillRect(cx - 11, S - 38, 2, 10);
  pr(g, cx + 3, S - 34, 9, 2, '#241a12'); g.fillRect(cx + 10, S - 44, 2, 12);
  pr(g, cx - 1, S - 42, 2, 8, '#241a12');
}

function drawRock(g, S) {
  const cx = S / 2, by = S - 2;
  pr(g, cx - 11, by - 13, 22, 13, '#2c3034'); // Outline (heller als zuvor)
  pr(g, cx - 10, by - 12, 20, 12, '#6b727a'); // Basis
  pr(g, cx - 7, by - 10, 12, 5, '#868d96'); // Highlight
  pr(g, cx - 9, by - 4, 18, 3, '#4a4f55'); // Schatten unten
}

function drawMenhir(g, S) {
  const cx = S / 2, by = S - 2;
  pr(g, cx - 8, by - 6, 16, 6, '#23262b'); // Sockel
  pr(g, cx - 7, by - 50, 14, 46, '#16181c'); // Outline
  pr(g, cx - 6, by - 50, 12, 46, '#3e444c'); // Stein
  pr(g, cx - 6, by - 50, 3, 46, '#565d66'); // Lichtkante
  pr(g, cx - 5, by - 52, 10, 4, '#3e444c'); // gerundete Spitze
  // glühende Rune
  pr(g, cx - 2, by - 34, 4, 1, '#3aa0ff');
  pr(g, cx - 1, by - 36, 2, 6, '#3aa0ff');
  pr(g, cx - 3, by - 30, 6, 1, '#6ac0ff');
}

function drawOre(g, S) {
  const cx = S / 2, by = S - 2;
  pr(g, cx - 12, by - 13, 24, 13, '#2a2e33'); // Fels-Outline
  pr(g, cx - 11, by - 12, 22, 12, '#555b62');
  pr(g, cx - 8, by - 10, 10, 4, '#6e757d');
  // glühende Magie-Erz-Adern (Gothic-Blau/Cyan)
  pr(g, cx - 6, by - 9, 2, 5, '#28d0ff');
  pr(g, cx + 1, by - 11, 2, 6, '#28d0ff');
  pr(g, cx + 5, by - 7, 2, 4, '#7ae6ff');
  pr(g, cx - 2, by - 6, 2, 3, '#7ae6ff');
}

function drawPalisade(g, S) {
  const by = S - 2;
  const cols = ['#2a1c10', '#33240f', '#241a12'];
  for (let i = 0; i < 5; i++) {
    const x = 3 + i * 9;
    pr(g, x, by - 30, 7, 30, '#140c06'); // Outline/Pfahl
    pr(g, x + 1, by - 29, 5, 29, cols[i % 3]);
    pr(g, x + 1, by - 29, 1, 29, '#3a2a18'); // Lichtkante
    // angespitzte Spitze
    pr(g, x + 1, by - 32, 5, 2, '#140c06');
    pr(g, x + 2, by - 34, 3, 2, '#140c06');
  }
  // Querbalken
  pr(g, 2, by - 14, S - 4, 3, '#1c1209');
}

function drawTower(g, S) {
  const cx = S / 2, by = S - 2;
  // Beine
  pr(g, cx - 12, by - 34, 4, 34, '#241a12'); pr(g, cx + 8, by - 34, 4, 34, '#241a12');
  pr(g, cx - 11, by - 34, 1, 34, '#3a2a18'); pr(g, cx + 9, by - 34, 1, 34, '#3a2a18');
  // Querstreben
  pr(g, cx - 12, by - 22, 24, 3, '#1c1209'); pr(g, cx - 12, by - 12, 24, 3, '#1c1209');
  // Plattform
  pr(g, cx - 16, by - 48, 32, 6, '#14110a');
  pr(g, cx - 15, by - 47, 30, 4, '#3a2a18');
  // Brüstung
  for (let i = 0; i < 6; i++) pr(g, cx - 15 + i * 5, by - 52, 3, 4, '#2a1c10');
  // Spitzdach
  for (let r = 0; r < 10; r++) pr(g, cx - 12 + r, by - 62 + r, (12 - r) * 2, 1, '#3a1410');
}

function drawGrave(g, S) {
  const cx = S / 2, by = S - 2;
  // Sockel + Platte mit rundem Kopf
  pr(g, cx - 9, by - 6, 18, 6, '#2a2d31');
  pr(g, cx - 8, by - 28, 16, 24, '#0f1012'); // Outline
  pr(g, cx - 7, by - 27, 14, 23, '#5a5f66');
  pr(g, cx - 7, by - 31, 14, 6, '#5a5f66'); // runder Kopf (vereinfacht)
  pr(g, cx - 6, by - 30, 12, 3, '#0f1012');
  pr(g, cx - 5, by - 27, 3, 18, '#6e747c'); // Highlight-Kante
  // Riss + "RIP"
  pr(g, cx + 3, by - 24, 1, 14, '#33373c');
  pr(g, cx - 3, by - 22, 6, 2, '#33373c');
}

function drawCross(g, S) {
  const cx = S / 2, by = S - 2;
  pr(g, cx - 3, by - 34, 6, 34, '#0f1012');
  pr(g, cx - 2, by - 33, 4, 33, '#5a5f66');
  pr(g, cx - 12, by - 27, 24, 6, '#0f1012');
  pr(g, cx - 11, by - 26, 22, 4, '#5a5f66');
  pr(g, cx - 1, by - 32, 1, 30, '#6e747c');
}

function drawRuin(g, S) {
  const by = S - 2;
  // verfallene Steinmauer: Ziegelreihen mit gezackter Oberkante
  const rows = 5, bw = 6, bh = 4;
  for (let r = 0; r < rows; r++) {
    const ry = by - (r + 1) * bh;
    const off = (r % 2) * (bw / 2);
    const cnt = 5 - (r > 2 ? r - 2 : 0); // oben weniger (zerfallen)
    for (let c = 0; c < cnt; c++) {
      const x = 4 + off + c * bw;
      if (x + bw > S - 2) continue;
      pr(g, x, ry, bw, bh, '#0f1012');
      pr(g, x + 1, ry + 1, bw - 2, bh - 2, c % 2 ? '#565b62' : '#4a4f55');
    }
  }
}

function drawPillar(g, S) {
  const cx = S / 2, by = S - 2;
  pr(g, cx - 9, by - 4, 18, 4, '#3a3e44'); // Sockel
  pr(g, cx - 7, by - 44, 14, 40, '#0f1012'); // Outline
  pr(g, cx - 6, by - 44, 12, 40, '#565b62');
  pr(g, cx - 6, by - 44, 3, 40, '#6e747c'); // Lichtkante
  pr(g, cx - 1, by - 44, 2, 40, '#3e4248'); // Riefe
  // gebrochene Spitze (gezackt)
  pr(g, cx - 7, by - 46, 6, 3, '#565b62');
  pr(g, cx + 1, by - 47, 5, 4, '#565b62');
}

function drawTorchPost(g, S) {
  const cx = S / 2, by = S - 2;
  pr(g, cx - 2, by - 30, 4, 30, '#2a1c10'); // Holzpfosten
  pr(g, cx - 3, by - 30, 1, 30, '#160d06');
  pr(g, cx + 2, by - 30, 1, 30, '#3a2a18');
  pr(g, cx - 3, by - 32, 6, 3, '#1a1a1e'); // Eisenkorb
}

function drawStake(g, S) {
  const cx = S / 2, by = S - 2;
  pr(g, cx - 2, by - 26, 4, 26, '#2a2014');
  pr(g, cx - 3, by - 26, 1, 26, '#160d06');
  pr(g, cx + 2, by - 26, 1, 26, '#3a2a1a');
  pr(g, cx - 2, by - 30, 4, 4, '#160d06'); // angespitzt
  pr(g, cx - 1, by - 31, 2, 2, '#160d06');
}

function drawBlock(g, S) {
  const cx = S / 2, by = S - 2;
  pr(g, cx - 13, by - 18, 26, 18, '#0f1012');
  pr(g, cx - 12, by - 17, 24, 16, '#4a4f55');
  pr(g, cx - 12, by - 17, 24, 4, '#3a5a30'); // Moos oben
  pr(g, cx - 10, by - 13, 4, 9, '#5c626a'); // Highlight
  pr(g, cx + 4, by - 12, 1, 10, '#2e3236'); // Riss
}

function drawFlame(g, S) {
  const cx = S / 2, by = S - 2;
  // pixelige Flamme: außen orange, innen gelb, oben spitz
  const layers = [
    { y: by - 4, w: 12, c: '#c83a10' },
    { y: by - 9, w: 11, c: '#e8641a' },
    { y: by - 14, w: 9, c: '#ff9a2a' },
    { y: by - 18, w: 6, c: '#ffd23a' },
    { y: by - 22, w: 3, c: '#fff0a0' },
  ];
  for (const L of layers) pr(g, cx - L.w / 2, L.y, L.w, 5, L.c);
  pr(g, cx - 1, by - 25, 2, 3, '#fff0a0'); // Spitze
}

function drawLogs(g, S) {
  const cx = S / 2, by = S - 2;
  // Steinring
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; pr(g, cx + Math.cos(a) * 12 - 2, by - 4 + Math.sin(a) * 5, 4, 4, '#3a3e44'); }
  // gekreuzte Holzscheite
  pr(g, cx - 10, by - 8, 20, 3, '#241a12'); pr(g, cx - 10, by - 8, 20, 1, '#3a2a18');
  pr(g, cx - 2, by - 13, 4, 12, '#2a1c10');
  pr(g, cx - 9, by - 6, 18, 2, '#160d08');
}

const PROP_DRAW = {
  pine: drawPine, deadtree: drawDeadTree, rock: drawRock, grave: drawGrave, cross: drawCross,
  ruin: drawRuin, pillar: drawPillar, torchpost: drawTorchPost, stake: drawStake, block: drawBlock, flame: drawFlame, logs: drawLogs,
  menhir: drawMenhir, ore: drawOre, palisade: drawPalisade, tower: drawTower,
};
const PROP_SIZE = { pine: 64, deadtree: 64, rock: 32, grave: 48, cross: 48, ruin: 48, pillar: 64, torchpost: 48, stake: 48, block: 48, flame: 32, logs: 48, menhir: 64, ore: 40, palisade: 48, tower: 80 };

// Pixel-Boden: kachelbares Graustufen-Muster (multipliziert mit Vertex-Farbe -> Pixel-Körnung)
let _ground = null;
export function groundTexture() {
  if (_ground) return _ground;
  const S = 16;
  const c = pcv(S);
  const g = c.getContext('2d');
  const img = g.createImageData(S, S);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = 190 + ((Math.random() * 66) | 0); // 190..255, leichte Variation
    d[i] = d[i + 1] = d[i + 2] = n; d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  // ein paar dunklere Pixel-Cluster (Grasbüschel/Erde)
  for (let k = 0; k < 14; k++) { g.fillStyle = `rgba(60,70,40,${0.25 + Math.random() * 0.3})`; g.fillRect((Math.random() * S) | 0, (Math.random() * S) | 0, 1, 1); }
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(80, 80);
  _ground = t;
  return t;
}

export function propTexture(key) {
  if (_props[key]) return _props[key];
  const S = PROP_SIZE[key] || 48;
  const c = pcv(S);
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  (PROP_DRAW[key] || drawRock)(g, S);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  _props[key] = t;
  return t;
}
