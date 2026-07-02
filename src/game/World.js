import * as THREE from 'three';
import { bumpTexture, groundBumpTexture } from './textures.js';

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
    trunk: 0x3a2a1a, foliage: 0x24341c, rockMat: 0x575250, grassMat: 0x4a5a30, stone: 0x6b6358,
    terrain: 'valley', vegStyle: 'pine', layout: 'ruins', treeCount: 70, rockCount: 26, grassCount: 600, water: false,
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
    trunk: 0x241c12, foliage: 0x2a3a22, rockMat: 0x444a38, grassMat: 0x3a4a28, stone: 0x4a4e40,
    terrain: 'swamp', vegStyle: 'dead', layout: 'bog', treeCount: 70, rockCount: 18, grassCount: 360, water: true, waterColor: 0x16321f,
    finalBoss: 'boss_demon',
  },
};
export const MAP_LIST = [
  { key: 'valley', name: 'Tal der Kolonie' },
  { key: 'swamp', name: 'Sumpf der Bruderschaft' },
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
    this._buildSky();
    this._buildLights();
    this._buildTerrain();
    this._buildBarrier();
    this._buildCamp();
    this._buildVegetation();
    this._buildGraveyard();
    if (this.theme.layout !== 'bog') this._buildOldCamp();
    this._buildWeather();
  }

  // --------------------------------------------------------------- Wetter & Atmosphäre
  // Sumpf: fallender Regen · Tal: treibende Glühwürmchen. Beides instanziert,
  // folgt dem Kamera-Ziel (center in update) — wirkt überall in der Arena.
  _buildWeather() {
    this.weather = null;
    if (this.theme.terrain === 'swamp') {
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
    this._wm = this._wm || new THREE.Matrix4();
    this._wq = this._wq || new THREE.Quaternion();
    this._wqTilt = this._wqTilt || new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0.14));
    this._ws = this._ws || new THREE.Vector3(1, 1, 1);
    this._wp = this._wp || new THREE.Vector3();
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
      for (let i = 0; i < w.parts.length; i++) {
        const m = w.parts[i];
        const px = cx + m.x + Math.sin(elapsed * m.speed + m.phase) * 2.4;
        const pz = cz + m.z + Math.cos(elapsed * m.speed * 0.8 + m.phase) * 2.4;
        const py = cy + m.y + Math.sin(elapsed * 0.7 + m.phase * 2) * 0.8;
        const pulse = 0.7 + 0.5 * Math.sin(elapsed * 2.2 + m.phase * 3); // Glimmen
        this._wp.set(px, py, pz);
        this._ws.setScalar(Math.max(0.15, pulse));
        this._wm.compose(this._wp, this._wq, this._ws);
        w.im.setMatrixAt(i, this._wm);
      }
    }
    w.im.instanceMatrix.needsUpdate = true;
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

    // Mond
    const moon = new THREE.Mesh(
      new THREE.CircleGeometry(18, 32),
      new THREE.MeshBasicMaterial({ color: 0xdfe4ee, fog: false })
    );
    moon.position.set(-160, 150, -260);
    moon.lookAt(0, 0, 0);
    this.group.add(moon);
    const moonGlow = new THREE.Mesh(
      new THREE.CircleGeometry(34, 32),
      new THREE.MeshBasicMaterial({ color: 0x8fa0c8, transparent: true, opacity: 0.25, fog: false })
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
    const size = 320;
    const seg = 200;
    const geo = new THREE.PlaneGeometry(size, size, seg, seg);
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
      const r2 = Math.hypot(x, z);
      if (r2 < 30) c = c.lerp(cDirt, 0.4); // getrampelter Boden im Lager
      colors.push(c.r, c.g, c.b);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.computeVertexNormals();

    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 1.0,
      metalness: 0.0,
      flatShading: false,
      bumpMap: groundBumpTexture(),
      bumpScale: 0.5,
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
    const dome = new THREE.Mesh(geo, this.barrierMat);
    this.group.add(dome);
    this.barrierRadius = BARRIER_RADIUS;
  }

  // --------------------------------------------------------------- Arena (themen-spezifisch)
  _place(mesh, x, z, yOffset = 0) {
    mesh.position.set(x, terrainHeight(x, z) + yOffset, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.group.add(mesh);
    return mesh;
  }

  _buildCamp() {
    if (this.theme.layout === 'bog') this._bogFeatures();
    else this._ruinFeatures();

    // Lagerfeuer als zentrale Lichtquellen (beide Karten)
    this._buildCampfire(0, 6);
    this._buildCampfire(-20, 24);

    const torchSpots =
      this.theme.layout === 'bog'
        ? [[-12, 10], [14, 8], [-2, -18], [24, 4], [-26, 18]]
        : [[-10, 12], [12, 12], [-24, 0], [24, 2], [0, -16], [-14, -16], [16, -14], [6, 26], [-30, 16]];
    for (const [tx, tz] of torchSpots) this._buildTorch(tx, tz);
  }

  // Tal: Stein-Ruinen & Pfeiler (3D)
  _ruinFeatures() {
    const stone = new THREE.MeshStandardMaterial({ color: this.theme.stone, roughness: 1.0, bumpMap: bumpTexture(), bumpScale: 0.5 });
    const ruins = [[-22, 10, 0.5, 6], [18, 16, 1.2, 5], [-30, -14, 0.3, 7], [26, -10, 2.0, 6], [8, -28, 0.8, 5], [-14, 30, 1.6, 5], [34, 20, 0.4, 6], [-36, 22, 1.1, 5]];
    for (const [rx, rz, rot, len] of ruins) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(len, 2.6, 1.2), stone);
      wall.rotation.y = rot;
      this._place(wall, rx, rz, 1.3);
      this.colliders.push({ x: rx, z: rz, r: 1.8 });
    }
    const pillars = [[-8, -6, 1.0], [10, 4, 1.4], [0, 18, 1.1], [-18, -2, 1.2], [20, 8, 0.9], [-26, 14, 1.3], [16, -18, 1.1], [-6, -22, 1.0], [28, 0, 1.2], [-32, 4, 0.9]];
    for (const [sx, sz, sc] of pillars) {
      const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.5 * sc, 0.65 * sc, 4.2 * sc, 8), stone);
      this._place(pillar, sx, sz, 2.1 * sc);
      const cap = new THREE.Mesh(new THREE.BoxGeometry(1.4 * sc, 0.5, 1.4 * sc), stone);
      this._place(cap, sx, sz, 4.2 * sc + 0.25);
      this.colliders.push({ x: sx, z: sz, r: 0.8 * sc });
    }
  }

  // Sumpf: Wassertümpel, Holzpfähle, versunkene Steinblöcke (3D)
  _bogFeatures() {
    const wood = new THREE.MeshStandardMaterial({ color: 0x2a2014, roughness: 1, bumpMap: bumpTexture(), bumpScale: 0.4 });
    const stone = new THREE.MeshStandardMaterial({ color: this.theme.stone, roughness: 1, bumpMap: bumpTexture(), bumpScale: 0.5 });
    const water = new THREE.MeshStandardMaterial({ color: this.theme.waterColor || 0x16321f, roughness: 0.2, metalness: 0.35, transparent: true, opacity: 0.82 });
    const pools = [[-14, 8, 5], [16, -6, 6], [-26, -16, 7], [26, 16, 5], [2, 28, 6], [-30, 22, 4.5], [12, -26, 5.5], [-4, -6, 4]];
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

  _buildTorch(x, z) {
    const y = terrainHeight(x, z);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 3.0, 6), new THREE.MeshStandardMaterial({ color: 0x3a2a18, roughness: 1 }));
    post.position.set(x, y + 1.5, z);
    post.castShadow = true;
    this.group.add(post);
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.36, 1.0, 8), new THREE.MeshBasicMaterial({ color: 0xffae3a, fog: false }));
    flame.position.set(x, y + 3.3, z);
    this.group.add(flame);
    const light = new THREE.PointLight(0xff9a3a, 2.4, 26, 2);
    light.position.set(x, y + 3.4, z);
    this.group.add(light);
    this.torchLights.push({ light, flame, base: 2.4, x, z, seed: Math.random() * 10 });
  }

  _buildCampfire(x, z) {
    const y = terrainHeight(x, z);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.28, 6, 16), new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 1 }));
    ring.rotation.x = Math.PI / 2;
    ring.position.set(x, y + 0.2, z);
    this.group.add(ring);
    const fire = new THREE.Mesh(new THREE.ConeGeometry(1.0, 2.2, 8), new THREE.MeshBasicMaterial({ color: 0xffb347, fog: false }));
    fire.position.set(x, y + 1.2, z);
    this.group.add(fire);
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

    // Bäume (3D): Tal = breite Nadelbäume; Sumpf = hohe kahle Bäume
    const treeCount = this.theme.treeCount;
    const trunkGeo = dead ? new THREE.CylinderGeometry(0.18, 0.4, 9, 6) : new THREE.CylinderGeometry(0.4, 0.6, 6, 6);
    const trunkMat = new THREE.MeshStandardMaterial({ color: this.theme.trunk, roughness: 1, bumpMap: bumpTexture(), bumpScale: 0.45 });
    const folGeo = dead ? new THREE.ConeGeometry(1.5, 2.6, 6) : new THREE.ConeGeometry(3, 8, 7);
    const folMat = new THREE.MeshStandardMaterial({ color: this.theme.foliage, roughness: 1 });
    const trunkY = dead ? 4.5 : 3;
    const folY = dead ? 8.4 : 9;
    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, treeCount);
    const foliage = new THREE.InstancedMesh(folGeo, folMat, treeCount);
    trunks.castShadow = true;
    foliage.castShadow = true;
    let placed = 0, tries = 0;
    while (placed < treeCount && tries < treeCount * 8) {
      tries++;
      const a = rnd() * Math.PI * 2;
      const dist = 32 + rnd() * 95;
      const x = Math.cos(a) * dist, z = Math.sin(a) * dist;
      if (Math.hypot(x, z) > BARRIER_RADIUS - 8) continue;
      const y = terrainHeight(x, z);
      const sc = 0.7 + rnd() * 0.9;
      q.identity(); s.set(sc, sc, sc);
      p.set(x, y + trunkY * sc, z); m.compose(p, q, s); trunks.setMatrixAt(placed, m);
      p.set(x, y + folY * sc, z); m.compose(p, q, s); foliage.setMatrixAt(placed, m);
      this.colliders.push({ x, z, r: 0.7 * sc });
      placed++;
    }
    trunks.count = placed; foliage.count = placed;
    this.group.add(trunks, foliage);

    // Felsen (3D)
    const rockCount = this.theme.rockCount;
    const rockGeo = new THREE.DodecahedronGeometry(1.4, 0);
    const rockMat = new THREE.MeshStandardMaterial({ color: this.theme.rockMat, roughness: 1, flatShading: true, bumpMap: bumpTexture(), bumpScale: 0.5 });
    const rocks = new THREE.InstancedMesh(rockGeo, rockMat, rockCount);
    rocks.castShadow = true; rocks.receiveShadow = true;
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
      if (sc > 1.1) this.colliders.push({ x, z, r: sc });
      rp++;
    }
    rocks.count = rp;
    this.group.add(rocks);

    // Grasbüschel / Schilf (Billboards, instanziert, kein Schatten)
    const grassCount = this.theme.grassCount;
    const bladeGeo = new THREE.PlaneGeometry(1.1, 1.0);
    const grassMat = new THREE.MeshStandardMaterial({
      color: this.theme.grassMat,
      roughness: 1,
      side: THREE.DoubleSide,
      transparent: true,
      alphaTest: 0.3,
    });
    const grass = new THREE.InstancedMesh(bladeGeo, grassMat, grassCount);
    let gp = 0;
    for (let i = 0; i < grassCount; i++) {
      const a = rnd() * Math.PI * 2;
      const dist = 6 + rnd() * 110;
      const x = Math.cos(a) * dist;
      const z = Math.sin(a) * dist;
      if (Math.hypot(x, z) > BARRIER_RADIUS - 4) continue;
      const y = terrainHeight(x, z);
      const gs = 0.7 + rnd() * 0.9;
      const gy = dead ? 2.2 : 1; // Schilf höher
      p.set(x, y + 0.5 * gy, z);
      q.setFromEuler(new THREE.Euler(0, rnd() * Math.PI, 0));
      s.set(gs, gs * gy, gs);
      m.compose(p, q, s);
      grass.setMatrixAt(gp, m);
      gp++;
    }
    grass.count = gp;
    this.group.add(grass);
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
    // innerhalb der Barriere halten
    const r = Math.hypot(pos.x, pos.z);
    const maxR = BARRIER_RADIUS - 4;
    if (r > maxR) {
      pos.x *= maxR / r;
      pos.z *= maxR / r;
    }
  }

  // --------------------------------------------------------------- Update
  update(dt, elapsed, center = null) {
    this.time = elapsed;
    if (this.barrierMat) this.barrierMat.uniforms.uTime.value = elapsed;
    this._updateWeather(dt, elapsed, center);
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
