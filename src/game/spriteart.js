import * as THREE from 'three';

// HD-2D Pixel-Sprites aus echten CC0-Assets (0x72 "Dungeon Tileset II", via tomb_mates).
// Pro Charakter 4 Lauf-Frames -> quadratische Strip-Textur (Füße unten verankert).
// Gegnertypen werden auf passende Gothic-Monster gemappt.

export const SPRITE_FRAMES = 4;

// Gegnertyp -> 0x72-Charakter (Dateien in public/sprites/<char>_f0..3.png)
const TYPE2CHAR = {
  scavenger: 'goblin',
  bloodfly: 'imp',
  wolf: 'wogol',
  molerat: 'muddy',
  skeleton: 'skelet',
  ghoul: 'zombie',
  gargoyle: 'chort',
  demon: 'orc_warrior',
  troll: 'ogre',
  boss: 'big_zombie',
  boss_bone: 'necromancer',
  boss_demon: 'big_demon',
  player: 'knight_m',
};

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
export async function loadSprites() {
  const chars = [...new Set(Object.values(TYPE2CHAR))];
  for (const ch of chars) {
    try {
      const imgs = await Promise.all([0, 1, 2, 3].map((n) => loadImg(`sprites/${ch}_f${n}.png`)));
      _tex[ch] = buildStrip(imgs);
    } catch (e) {
      console.warn('Sprite-Laden fehlgeschlagen:', ch, e);
    }
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
  pr(g, cx - 11, by - 12, 22, 12, '#0f1112'); // Outline
  pr(g, cx - 10, by - 11, 20, 11, '#4a4f55');
  pr(g, cx - 7, by - 9, 12, 4, '#5c626a'); // Highlight
  pr(g, cx - 9, by - 4, 18, 3, '#33373c'); // Schatten unten
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

const PROP_DRAW = { pine: drawPine, deadtree: drawDeadTree, rock: drawRock, grave: drawGrave, cross: drawCross };
const PROP_SIZE = { pine: 64, deadtree: 64, rock: 32, grave: 48, cross: 48 };

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
