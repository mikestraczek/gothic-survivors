import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { World } from './World.js';
import { SurvivorsCamera } from './SurvivorsCamera.js';
import { spriteQuad, spriteMaterial, SPRITE_FRAMES, blobShadowTexture } from './spriteart.js';
import { HEROES } from './Heroes.js';

// Render-Pipeline (Composer/Pässe) + Helden-Sprites/Schatten.
// Alle Funktionen nehmen die Game-Instanz `g` (Facade-Delegates in Game.js).

// Pixel-Art / HD-2D-Look: rastert das fertige Bild auf ein Pixelgitter + leichte Farbquantisierung.
const PixelArtShader = {
  uniforms: { tDiffuse: { value: null }, resolution: { value: new THREE.Vector2(1, 1) }, pixelSize: { value: 4 }, levels: { value: 32 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform vec2 resolution; uniform float pixelSize; uniform float levels; varying vec2 vUv;
    void main(){
      vec2 dxy = pixelSize / resolution;
      vec2 coord = dxy * (floor(vUv / dxy) + 0.5);
      vec3 c = texture2D(tDiffuse, coord).rgb;
      c = floor(c * levels + 0.5) / levels; // sanfte Farbquantisierung (Retro-Look)
      gl_FragColor = vec4(c, 1.0);
    }`,
};

export function _initRenderer(g) {
  g.renderer = new THREE.WebGLRenderer({ canvas: g.canvas, antialias: true });
  g.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  g.renderer.shadowMap.enabled = true;
  g.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  g.renderer.toneMapping = THREE.ACESFilmicToneMapping;
  g.renderer.toneMappingExposure = 1.45;
  g.renderer.outputColorSpace = THREE.SRGBColorSpace;
}
export function _initScene(g) {
  g.scene = new THREE.Scene();
  g.camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 1000);
  g.world = new World(g.scene, g.renderer);
  g.camCtrl = new SurvivorsCamera(g.camera);
  // MSAA-Rendertarget (WebGL2): glättet Geometriekanten trotz Post-Processing;
  // HalfFloat hält den HDR-Bereich für den Bloom-Pass sauber.
  const rt = new THREE.WebGLRenderTarget(window.innerWidth, window.innerHeight, { samples: 4, type: THREE.HalfFloatType });
  g.composer = new EffectComposer(g.renderer, rt);
  g.composer.addPass(new RenderPass(g.scene, g.camera));
  g.bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.38, 0.55, 0.8);
  g.composer.addPass(g.bloom);
  g.composer.addPass(new OutputPass());
  // Cinematic Grade: Kontrast + Sättigung + Split-Toning (Theme-Farben) + Vignette in einem Pass
  const GradeShader = {
    uniforms: {
      tDiffuse: { value: null },
      saturation: { value: 1.14 },
      contrast: { value: 1.07 },
      shadowTint: { value: new THREE.Vector3(0.0, 0.02, 0.07) },
      highTint: { value: new THREE.Vector3(0.06, 0.04, 0.0) },
      vignette: { value: 0.42 },
    },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `
      uniform sampler2D tDiffuse; uniform float saturation; uniform float contrast; uniform float vignette;
      uniform vec3 shadowTint; uniform vec3 highTint; varying vec2 vUv;
      void main(){
        vec3 c = texture2D(tDiffuse, vUv).rgb;
        c = (c - 0.5) * contrast + 0.5;                    // Kontrast
        float l = dot(c, vec3(0.299, 0.587, 0.114));
        c = mix(vec3(l), c, saturation);                   // Sättigung
        c += shadowTint * (1.0 - smoothstep(0.0, 0.5, l)); // Schatten tonen (kühl/thematisch)
        c += highTint * smoothstep(0.5, 1.0, l);           // Lichter tonen (warm)
        float d = distance(vUv, vec2(0.5));
        c *= 1.0 - smoothstep(0.48, 0.86, d) * vignette;   // Vignette
        gl_FragColor = vec4(max(c, vec3(0.0)), 1.0);
      }`,
  };
  g.gradePass = new ShaderPass(GradeShader);
  g.composer.addPass(g.gradePass);
  // Pixel-Art-Look als letzter Pass
  g.pixelPass = new ShaderPass(PixelArtShader);
  g.pixelPass.uniforms.pixelSize.value = 4;
  g.pixelPass.enabled = false; // HD-2D: 3D-Welt scharf, Pixel-Look kommt von den Sprites
  g.composer.addPass(g.pixelPass);
  g._syncPixelResolution();
  g._syncGrade();
}

// Split-Toning an das Karten-Theme anpassen (nach Theme-Wechsel aufrufen)
export function _syncGrade(g) {
  if (!g.gradePass || !g.world) return;
  const t = g.world.theme || {};
  g.gradePass.uniforms.shadowTint.value.fromArray(t.gradeShadow || [0.0, 0.02, 0.07]);
  g.gradePass.uniforms.highTint.value.fromArray(t.gradeHigh || [0.06, 0.04, 0.0]);
}
export function _syncPixelResolution(g) {
  if (!g.pixelPass) return;
  const v = new THREE.Vector2();
  g.renderer.getDrawingBufferSize(v);
  g.pixelPass.uniforms.resolution.value.copy(v);
  // konstante Pixelgröße in CSS-Pixeln (über Pixelverhältnis skaliert) — kleiner = schärfer
  g.pixelPass.uniforms.pixelSize.value = Math.max(2, Math.round(3 * g.renderer.getPixelRatio()));
}
export function _makeSprite(g, key) {
  const im = new THREE.InstancedMesh(spriteQuad(1), spriteMaterial(key), 1);
  im.count = 1;
  im.frustumCulled = false;
  im.setColorAt(0, new THREE.Color(1, 1, 1));
  g.scene.add(im);
  return im;
}

// Helden-Sprites an die aktuelle Heldenwahl anpassen (eigener + Koop-Mitspieler).
// Material wird nur bei Wechsel getauscht (altes sauber entsorgt).
export function _syncHeroSprites(g) {
  const keyOf = (k) => (HEROES[k] ? 'hero_' + k : 'player');
  const want = keyOf(g.heroKey);
  if (g._heroSpriteKey !== want) {
    g._heroSpriteKey = want;
    g.playerSprite.material.dispose();
    g.playerSprite.material = spriteMaterial(want);
  }
  const wantR = keyOf(g._remoteHeroKey);
  if (g._remoteSpriteKey !== wantR) {
    g._remoteSpriteKey = wantR;
    g.remoteSprite.material.dispose();
    g.remoteSprite.material = spriteMaterial(wantR);
  }
}
export function _makeBlobShadow(g, scale = 2.2) {
  const geo = new THREE.PlaneGeometry(1, 1);
  geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: blobShadowTexture(), transparent: true, depthWrite: false }));
  mesh.scale.setScalar(scale);
  mesh.renderOrder = 1;
  g.scene.add(mesh);
  return mesh;
}
// Kamera-Rechtsachse (x,z) -> bestimmt links/rechts für Sprite-Spiegelung
export function _updateCamRight(g) {
  g.camera.updateMatrixWorld();
  const e = g.camera.matrixWorld.elements;
  let rx = e[0], rz = e[2];
  const l = Math.hypot(rx, rz) || 1;
  g._camRX = rx / l;
  g._camRZ = rz / l;
  if (g.enemies) { g.enemies.camRightX = g._camRX; g.enemies.camRightZ = g._camRZ; }
}
export function _placeSprite(g, im, p, scale, frame, flip) {
  if (!g._spq) { g._spq = new THREE.Quaternion(); g._spv = new THREE.Vector3(); g._sps = new THREE.Vector3(); g._spm = new THREE.Matrix4(); }
  g._spv.set(p.x, p.y, p.z);
  g._sps.set(scale, scale, scale);
  g._spm.compose(g._spv, g._spq, g._sps);
  im.setMatrixAt(0, g._spm);
  im.instanceMatrix.needsUpdate = true;
  const af = im.geometry.getAttribute('aFrame'); af.setX(0, frame); af.needsUpdate = true;
  const fl = im.geometry.getAttribute('aFlip'); fl.setX(0, flip); fl.needsUpdate = true;
}
// Blickrichtung eines Spielers aus seiner Bewegung (auf Kamera-Rechtsachse projiziert)
export function _heroFlip(g, pl, key) {
  const dir = (pl._mvx || 0) * (g._camRX ?? 1) + (pl._mvz || 0) * (g._camRZ ?? 0);
  if (dir > 0.05) g[key] = 1; else if (dir < -0.05) g[key] = -1;
  return g[key] || 1;
}
// Helden-Sprite einfärben: Helden-Tint (Charakter-Identität) bzw. rotes Aufblitzen bei Schaden
export function _tintHero(g, im, pl, heroKey) {
  if (!g._heroWhite) {
    g._heroWhite = new THREE.Color(1, 1, 1);
    g._heroFlash = new THREE.Color(2.8, 0.75, 0.65);
  }
  const base = (HEROES[heroKey] && HEROES[heroKey].tint) || g._heroWhite;
  im.setColorAt(0, pl.hitFlash > 0 ? g._heroFlash : base);
  im.instanceColor.needsUpdate = true;
}
export function _updateHeroSprites(g) {
  const fr = Math.floor(g.runElapsed * 7) % SPRITE_FRAMES;
  g.playerSprite.visible = true;
  g._placeSprite(g.playerSprite, g.player.position, 2.9, fr, g._heroFlip(g.player, '_pFlip'));
  g._tintHero(g.playerSprite, g.player, g.heroKey);
  g.playerShadow.visible = true;
  g.playerShadow.position.set(g.player.position.x, g.player.position.y + 0.06, g.player.position.z);
  g.remoteSprite.visible = !!g.role && !!g.remotePlayer;
  g.remoteShadow.visible = g.remoteSprite.visible;
  if (g.remoteSprite.visible) {
    g._placeSprite(g.remoteSprite, g.remotePlayer.position, 2.9, fr, g._heroFlip(g.remotePlayer, '_rFlip'));
    g._tintHero(g.remoteSprite, g.remotePlayer, g._remoteHeroKey);
    g.remoteShadow.position.set(g.remotePlayer.position.x, g.remotePlayer.position.y + 0.06, g.remotePlayer.position.z);
  }
}
// Alle Effekt-/Material-Shader einmal rendern (der Ladescreen verdeckt das) —
// verhindert die klassischen Mikro-Ruckler bei der ersten Explosion/Telegraph/Zahl im Kampf.
export function _prewarm(g) {
  const fx = g.fx;
  fx.record = false;
  fx.ring(0, 0, 2, 0xffffff);
  fx.slash(0, 0, 1.5, 0);
  fx.explosion(0, 0, 2);
  fx.bolt(0, 0);
  fx.telegraph(0, 0, 2, 0.4, 0);
  fx.telegraphSafe(3, 0, 2, 0.4, 0);
  fx.telegraphCone(0, 3, 1, 0, 3, 0.4, 0);
  fx.sparksBurst(0, 1, 0, 0xffffff, 6, 3);
  fx.dmgNumber(0, 2, 0, 123);
  g.weapons.prewarm();
  g.enemies._spawnBolt(0, 0, 0.1, 0, 1, 'prewarm');
  g.gems.spawn(0, 0, 1);
  for (const t of ['heal', 'magnet', 'nova', 'greed', 'chest', 'shrine']) g.pickups.spawnAt(t, 0, 0);
  fx.update(0.016);
  g.composer.render();
  // aufräumen: Effekte auslaufen lassen, Prewarm-Objekte entfernen
  for (let i = 0; i < 60; i++) fx.update(0.1);
  g.weapons.prewarmCleanup();
  g.enemies.hideBolts();
  g.gems.reset();
  g.pickups.reset();
}

export function _onResize(g) {
  const w = window.innerWidth;
  const h = window.innerHeight;
  g.camera.aspect = w / h;
  g.camera.updateProjectionMatrix();
  g.renderer.setSize(w, h);
  g.composer.setPixelRatio(g.renderer.getPixelRatio()); // Renderauflösung (Settings) mitziehen
  g.composer.setSize(w, h);
  if (g.bloom) g.bloom.setSize(w, h);
  g._syncPixelResolution();
  if (g.hud) g.hud.resize(w, h);
}
