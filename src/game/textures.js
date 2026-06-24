import * as THREE from 'three';

// Prozedurale Texturen (Canvas) für matte, reliefierte Oberflächen statt plastischer Glätte.
// Organische, mehrlagige Flecken (kein TV-Rauschen) -> wirkt wie echtes Material.

function organicCanvas(size, base, layers) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  g.fillStyle = `rgb(${base},${base},${base})`;
  g.fillRect(0, 0, size, size);
  for (const L of layers) {
    for (let i = 0; i < L.n; i++) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      const r = L.min + Math.random() * L.max;
      const a = L.a * (0.5 + Math.random() * 0.5);
      // weicher Fleck (radialer Verlauf) -> organisch verteilt, kachelt durch Wrap
      const grd = g.createRadialGradient(x, y, 0, x, y, r);
      grd.addColorStop(0, `rgba(${L.c},${a})`);
      grd.addColorStop(1, `rgba(${L.c},0)`);
      g.fillStyle = grd;
      g.beginPath();
      g.arc(x, y, r, 0, 7);
      g.fill();
    }
  }
  return c;
}

function toTex(canvas, repeat) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 4;
  return t;
}

// gemeinsame Canvas-Quellen (einmal gezeichnet)
let _grungeCanvas = null;
function grungeCanvas() {
  if (!_grungeCanvas) {
    _grungeCanvas = organicCanvas(128, 206, [
      { n: 16, min: 10, max: 40, a: 0.2, c: '52,40,36' }, // große Grime-Flecken
      { n: 130, min: 1, max: 5, a: 0.26, c: '34,26,24' }, // Poren/Schuppen (dunkel)
      { n: 46, min: 1, max: 4, a: 0.16, c: '238,232,220' }, // feine Glanzpunkte
    ]);
  }
  return _grungeCanvas;
}

let _bumpCanvas = null;
function bumpCanvas() {
  if (!_bumpCanvas) {
    _bumpCanvas = organicCanvas(128, 128, [
      { n: 24, min: 8, max: 34, a: 0.5, c: '55,55,55' }, // Vertiefungen
      { n: 170, min: 1, max: 4, a: 0.55, c: '38,38,38' }, // feine Poren
      { n: 70, min: 1, max: 4, a: 0.5, c: '220,220,220' }, // erhabene Punkte
    ]);
  }
  return _bumpCanvas;
}

let _grunge = null;
export function grungeTexture() {
  if (!_grunge) _grunge = toTex(grungeCanvas(), 2);
  return _grunge;
}

let _bump = null;
export function bumpTexture() {
  if (!_bump) _bump = toTex(bumpCanvas(), 3);
  return _bump;
}

// eigener Bump fürs Gelände (feinere Kachelung über die große Fläche)
let _groundBump = null;
export function groundBumpTexture() {
  if (!_groundBump) _groundBump = toTex(bumpCanvas(), 48);
  return _groundBump;
}
