import * as THREE from 'three';

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
    fog: 0x1a2030, fogD: 0.0052,
    sky: [0x10131f, 0x1d2436, 0x2a2418],
    hemiSky: 0x7888b0, hemiGround: 0x32301f, hemiI: 1.15,
    ambient: 0x44506a, ambientI: 0.62, moonCol: 0xb8c4e0, moonI: 1.2,
    grass: 0x3c4a2a, grass2: 0x2d3a22, dirt: 0x5a4a30, rock: 0x47433c,
    barrierA: 0x6a2fa0, barrierB: 0x2f7aa0,
    trunk: 0x3a2a1a, foliage: 0x24341c, rockMat: 0x575250, grassMat: 0x4a5a30, stone: 0x6b6358,
    terrain: 'valley', vegStyle: 'pine', layout: 'ruins', treeCount: 140, rockCount: 70, grassCount: 600, water: false,
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
    terrain: 'swamp', vegStyle: 'dead', layout: 'bog', treeCount: 120, rockCount: 40, grassCount: 360, water: true, waterColor: 0x16321f,
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
    this.spawns = { npcs: [], enemies: [], items: [] };
    this.time = 0;
    this.themeKey = themeKey;
    this.theme = THEMES[themeKey] || THEMES.valley;
    setTerrainVariant(this.theme.terrain);
    this.group = new THREE.Group();
    scene.add(this.group);
    this._build();
    this._defineSpawns();
  }

  _build() {
    this._buildSky();
    this._buildLights();
    this._buildTerrain();
    this._buildBarrier();
    this._buildCamp();
    this._buildVegetation();
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
      roughness: 0.95,
      metalness: 0.0,
      flatShading: false,
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
          float a = fres * 0.45 + band * 0.18;
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

  // Tal: Stein-Ruinen & Monolithen
  _ruinFeatures() {
    const stone = new THREE.MeshStandardMaterial({ color: this.theme.stone, roughness: 0.95 });
    const ruins = [
      [-22, 10, 0.5, 6], [18, 16, 1.2, 5], [-30, -14, 0.3, 7], [26, -10, 2.0, 6],
      [8, -28, 0.8, 5], [-14, 30, 1.6, 5], [34, 20, 0.4, 6], [-36, 22, 1.1, 5],
    ];
    for (const [rx, rz, rot, len] of ruins) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(len, 2.6, 1.2), stone.clone());
      wall.rotation.y = rot;
      this._place(wall, rx, rz, 1.0);
      this.colliders.push({ x: rx, z: rz, r: 1.8 });
    }
    const stones = [
      [-8, -6, 1.0], [10, 4, 1.4], [0, 18, 1.1], [-18, -2, 1.2], [20, 8, 0.9],
      [-26, 14, 1.3], [16, -18, 1.1], [-6, -22, 1.0], [28, 0, 1.2], [-32, 4, 0.9],
    ];
    for (const [sx, sz, sc] of stones) {
      const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.9 * sc, 1.2 * sc, 3.6 * sc, 6), stone.clone());
      this._place(pillar, sx, sz, 1.8 * sc);
      const cap = new THREE.Mesh(new THREE.ConeGeometry(1.1 * sc, 1.0, 6), stone.clone());
      this._place(cap, sx, sz, 3.6 * sc + 0.4);
      this.colliders.push({ x: sx, z: sz, r: 1.1 * sc });
    }
  }

  // Sumpf: Wassertümpel, Holzpfähle, versunkene Steinblöcke
  _bogFeatures() {
    const wood = new THREE.MeshStandardMaterial({ color: 0x2a2014, roughness: 1 });
    const stone = new THREE.MeshStandardMaterial({ color: this.theme.stone, roughness: 1 });
    const water = new THREE.MeshStandardMaterial({ color: this.theme.waterColor || 0x16321f, roughness: 0.2, metalness: 0.35, transparent: true, opacity: 0.82 });

    // Wassertümpel (flache Scheiben knapp über dem Boden)
    const pools = [[-14, 8, 5], [16, -6, 6], [-26, -16, 7], [26, 16, 5], [2, 28, 6], [-30, 22, 4.5], [12, -26, 5.5], [-4, -6, 4]];
    for (const [px, pz, pr] of pools) {
      const w = new THREE.Mesh(new THREE.CircleGeometry(pr, 22), water);
      w.rotation.x = -Math.PI / 2;
      w.position.set(px, terrainHeight(px, pz) + 0.15, pz);
      w.receiveShadow = false;
      this.group.add(w);
    }

    // Holzpfähle / tote Stümpfe (leichte Hindernisse)
    const stakes = [[-8, 14, 2.2], [10, 4, 1.8], [0, 20, 2.6], [-20, 2, 2.0], [22, 10, 2.3], [-28, 16, 1.7], [18, -16, 2.4], [-6, -20, 1.9], [30, -2, 2.1], [6, -30, 2.0]];
    for (const [sx, sz, h] of stakes) {
      const stk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.38, h, 6), wood.clone());
      stk.rotation.z = (Math.random() - 0.5) * 0.25;
      this._place(stk, sx, sz, h / 2);
      this.colliders.push({ x: sx, z: sz, r: 0.5 });
    }

    // versunkene Steinblöcke
    const blocks = [[-20, 12], [22, -12], [6, -28], [-32, 24], [14, 22]];
    for (const [bx, bz] of blocks) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(3, 2.2, 3), stone.clone());
      b.rotation.y = Math.random() * Math.PI;
      this._place(b, bx, bz, 0.5); // halb versunken
      this.colliders.push({ x: bx, z: bz, r: 2 });
    }
  }

  _buildTorch(x, z) {
    const y = terrainHeight(x, z);
    const post = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.22, 3.2, 6),
      new THREE.MeshStandardMaterial({ color: 0x3a2a18, roughness: 1 })
    );
    post.position.set(x, y + 1.6, z);
    post.castShadow = true;
    this.group.add(post);

    const flame = new THREE.Mesh(
      new THREE.ConeGeometry(0.4, 1.1, 8),
      new THREE.MeshBasicMaterial({ color: 0xffae3a, fog: false })
    );
    flame.position.set(x, y + 3.5, z);
    this.group.add(flame);

    const light = new THREE.PointLight(0xff9a3a, 2.4, 26, 2);
    light.position.set(x, y + 3.6, z);
    this.group.add(light);
    this.torchLights.push({ light, flame, base: 2.4, x, z, seed: Math.random() * 10 });
  }

  _buildCampfire(x, z) {
    const y = terrainHeight(x, z);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(1.6, 0.3, 6, 16),
      new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 1 })
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.set(x, y + 0.2, z);
    this.group.add(ring);
    const fire = new THREE.Mesh(
      new THREE.ConeGeometry(1.1, 2.4, 8),
      new THREE.MeshBasicMaterial({ color: 0xffb347, fog: false })
    );
    fire.position.set(x, y + 1.3, z);
    this.group.add(fire);
    const light = new THREE.PointLight(0xff8a2a, 4.5, 40, 2);
    light.position.set(x, y + 2.2, z);
    this.group.add(light);
    this.torchLights.push({ light, flame: fire, base: 4.5, x, z, seed: 5.5 });
    this.colliders.push({ x, z, r: 1.8 });
  }

  // --------------------------------------------------------------- Vegetation
  _buildVegetation() {
    let seed = 9001;
    const rnd = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };

    const dead = this.theme.vegStyle === 'dead';
    const treeCount = this.theme.treeCount;
    // Tal = breite Nadelbäume; Sumpf = hohe, kahle, dünne Bäume mit dunkler Krone
    const trunkGeo = dead ? new THREE.CylinderGeometry(0.18, 0.4, 9, 6) : new THREE.CylinderGeometry(0.4, 0.6, 6, 6);
    const trunkMat = new THREE.MeshStandardMaterial({ color: this.theme.trunk, roughness: 1 });
    const folGeo = dead ? new THREE.ConeGeometry(1.5, 2.6, 6) : new THREE.ConeGeometry(3, 8, 7);
    const folMat = new THREE.MeshStandardMaterial({ color: this.theme.foliage, roughness: 1 });
    const trunkY = dead ? 4.5 : 3;
    const folY = dead ? 8.4 : 9;

    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, treeCount);
    const foliage = new THREE.InstancedMesh(folGeo, folMat, treeCount);
    trunks.castShadow = true;
    foliage.castShadow = true;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const p = new THREE.Vector3();

    let placed = 0;
    let tries = 0;
    while (placed < treeCount && tries < treeCount * 8) {
      tries++;
      const a = rnd() * Math.PI * 2;
      const dist = 32 + rnd() * 95;
      const x = Math.cos(a) * dist;
      const z = Math.sin(a) * dist;
      if (Math.hypot(x, z) > BARRIER_RADIUS - 8) continue;
      const y = terrainHeight(x, z);
      const sc = 0.7 + rnd() * 0.9;

      p.set(x, y + trunkY * sc, z);
      q.identity();
      s.set(sc, sc, sc);
      m.compose(p, q, s);
      trunks.setMatrixAt(placed, m);

      p.set(x, y + folY * sc, z);
      m.compose(p, q, s);
      foliage.setMatrixAt(placed, m);

      this.colliders.push({ x, z, r: 0.7 * sc });
      placed++;
    }
    trunks.count = placed;
    foliage.count = placed;
    this.group.add(trunks, foliage);

    // Felsen
    const rockCount = this.theme.rockCount;
    const rockGeo = new THREE.DodecahedronGeometry(1.4, 0);
    const rockMat = new THREE.MeshStandardMaterial({ color: this.theme.rockMat, roughness: 1, flatShading: true });
    const rocks = new THREE.InstancedMesh(rockGeo, rockMat, rockCount);
    rocks.castShadow = true;
    rocks.receiveShadow = true;
    let rp = 0;
    for (let i = 0; i < rockCount; i++) {
      const a = rnd() * Math.PI * 2;
      const dist = 30 + rnd() * 100;
      const x = Math.cos(a) * dist;
      const z = Math.sin(a) * dist;
      if (Math.hypot(x, z) > BARRIER_RADIUS - 5) continue;
      const y = terrainHeight(x, z);
      const sc = 0.6 + rnd() * 1.8;
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

  // --------------------------------------------------------------- Spawns
  _defineSpawns() {
    // NPCs: id (Dialog), name, x, z, rot
    this.spawns.npcs = [
      { id: 'diego', name: 'Diego', x: 4, z: 40 },
      { id: 'thorus', name: 'Thorus', x: 2, z: 26 },
      { id: 'nek', name: 'Nek', x: -16, z: 34 },
    ];
    // Gegner
    this.spawns.enemies = [
      { type: 'scavenger', x: 30, z: 55 },
      { type: 'scavenger', x: 45, z: 48 },
      { type: 'scavenger', x: 52, z: 62 },
      { type: 'scavenger', x: 20, z: 70 },
      { type: 'molerat', x: -40, z: 50 },
      { type: 'molerat', x: -55, z: 40 },
      { type: 'scavenger', x: -30, z: 65 },
    ];
    // Beute in der Welt
    this.spawns.items = [
      { id: 'apple', x: 8, z: 42 },
      { id: 'meat', x: -2, z: 30 },
      { id: 'ore', x: 18, z: 30 },
      { id: 'shortSword', x: -12, z: 18 },
      { id: 'diggerClothes', x: 6, z: 20 },
      { id: 'healPotion', x: -20, z: -8 },
      { id: 'ore', x: 22, z: 38 },
      { id: 'bread', x: 10, z: 36 },
    ];
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
  update(dt, elapsed) {
    this.time = elapsed;
    if (this.barrierMat) this.barrierMat.uniforms.uTime.value = elapsed;
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
