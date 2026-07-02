import * as THREE from 'three';

// Aufsammelbare Welt-Items mit Sofort-Effekt.
const DEFS = {
  heal: { color: 0x49e06a, name: 'Heiltrank', desc: 'Leben aufgefüllt' },
  magnet: { color: 0x49b6ff, name: 'Seelenruf', desc: 'Alle Edelsteine angezogen' },
  nova: { color: 0xff5a3a, name: 'Zorn der Barriere', desc: 'Alle Feinde getroffen' },
  greed: { color: 0xffd24a, name: 'Erzader', desc: 'Erz gefunden' },
  chest: { color: 0xd8a02a, name: 'Truhe', desc: 'Beute aus Elite-Gegnern' },
  shrine: { color: 0x86e0ff, name: 'Schrein der Barriere', desc: 'Segen: Heilung + Schadens-Buff' },
};

// Reihenfolge für Snapshot-Codes — nur anhängen, nie umsortieren!
const SNAP_ORDER = ['heal', 'magnet', 'nova', 'greed', 'chest', 'shrine'];

function buildPickup(type) {
  const def = DEFS[type];
  const g = new THREE.Group();
  const emissive = (c, i = 1.6) =>
    new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: i, roughness: 0.3, metalness: 0.2 });

  // schwebender Sockel-Schein (Billboard-Ring am Boden)
  const halo = new THREE.Mesh(
    new THREE.RingGeometry(0.5, 0.7, 24),
    new THREE.MeshBasicMaterial({ color: def.color, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending })
  );
  halo.rotation.x = -Math.PI / 2;
  halo.position.y = 0.05;
  g.add(halo);

  if (type === 'heal') {
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.4, 12, 10), emissive(0x2aa048, 1.2));
    body.position.y = 0.9;
    const v = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.42, 0.12), emissive(0xffffff, 1.4));
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.12, 0.12), emissive(0xffffff, 1.4));
    v.position.y = h.position.y = 0.9;
    v.position.z = h.position.z = 0.42;
    g.add(body, v, h);
  } else if (type === 'magnet') {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.12, 8, 20), emissive(0x2a8aff, 1.6));
    ring.position.y = 0.95;
    ring.rotation.x = Math.PI / 2;
    const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.22, 0), emissive(0x9fd8ff, 2));
    core.position.y = 0.95;
    g.add(ring, core);
  } else if (type === 'nova') {
    const spike = new THREE.Mesh(new THREE.IcosahedronGeometry(0.42, 0), emissive(0xc83020, 1.8));
    spike.position.y = 0.95;
    g.add(spike);
  } else if (type === 'greed') {
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.42, 0), emissive(0xd8a82a, 1.8));
    gem.position.y = 0.95;
    g.add(gem);
  } else if (type === 'chest') {
    // Holztruhe mit goldenem Beschlag
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.5, 0.6), new THREE.MeshStandardMaterial({ color: 0x5a3a1c, roughness: 0.7 }));
    body.position.y = 0.45;
    const lid = new THREE.Mesh(new THREE.BoxGeometry(0.94, 0.24, 0.64), new THREE.MeshStandardMaterial({ color: 0x6e4824, roughness: 0.6 }));
    lid.position.y = 0.8;
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.98, 0.1, 0.66), emissive(0xd8a02a, 1.6));
    band.position.y = 0.62;
    g.add(body, lid, band);
  } else if (type === 'shrine') {
    // kleiner Obelisk mit schwebendem Licht
    const stone = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.34, 1.3, 6), new THREE.MeshStandardMaterial({ color: 0x4a505a, roughness: 0.8 }));
    stone.position.y = 0.65;
    const light = new THREE.Mesh(new THREE.OctahedronGeometry(0.24, 0), emissive(0x86e0ff, 2.4));
    light.position.y = 1.6;
    g.add(stone, light);
  }
  g.traverse((o) => {
    if (o.isMesh) o.castShadow = false;
  });
  return g;
}

export class PickupManager {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.items = [];
    this.spawnTimer = 18;
    this.elapsed = 0;
    this.handlers = {}; // { heal, magnet, nova, greed } -> fn
  }

  reset() {
    for (const it of this.items) {
      it.alive = false;
      it.group.visible = false;
    }
    this.spawnTimer = 18;
    this.elapsed = 0;
  }

  spawnAt(type, x, z) {
    if (!DEFS[type]) return;
    let it = this.items.find((p) => !p.alive && p.type === type);
    if (!it) {
      const group = buildPickup(type);
      it = { type, group, alive: false };
      this.items.push(it);
      this.scene.add(group);
    }
    it.alive = true;
    it.x = x;
    it.z = z;
    it.y = this.world.getHeight(x, z);
    it.phase = Math.random() * 6;
    it.group.visible = true;
    it.group.position.set(it.x, it.y, it.z);
  }

  // ---- Multiplayer ----
  snapshot() {
    const o = [];
    for (const it of this.items) {
      if (!it.alive) continue;
      o.push(SNAP_ORDER.indexOf(it.type), Math.round(it.x * 10) / 10, Math.round(it.z * 10) / 10);
    }
    return o;
  }
  applySnapshot(arr) {
    for (const it of this.items) {
      it.alive = false;
      it.group.visible = false;
    }
    for (let i = 0; i + 2 < arr.length; i += 3) {
      this.spawnAt(SNAP_ORDER[arr[i]], arr[i + 1], arr[i + 2]);
    }
  }
  animate(dt) {
    this.elapsed += dt;
    for (const it of this.items) {
      if (!it.alive) continue;
      it.group.position.y = it.y + 0.2 + Math.sin(this.elapsed * 2.5 + it.phase) * 0.18;
      it.group.rotation.y += dt * 1.6;
    }
  }

  spawnNear(player) {
    const pool = ['heal', 'heal', 'magnet', 'nova', 'greed'];
    const type = pool[Math.floor(Math.random() * pool.length)];
    for (let tries = 0; tries < 8; tries++) {
      const a = Math.random() * Math.PI * 2;
      const dist = 8 + Math.random() * 16;
      const x = player.position.x + Math.cos(a) * dist;
      const z = player.position.z + Math.sin(a) * dist;
      if (Math.hypot(x, z) < this.world.barrierRadius - 6) {
        this.spawnAt(type, x, z);
        return;
      }
    }
  }

  update(dt, players) {
    this.elapsed += dt;
    const anyAlive = players.some((p) => p.alive);
    if (anyAlive) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) {
        this.spawnTimer = 20 + Math.random() * 12;
        this.spawnNear(players[Math.floor(Math.random() * players.length)]);
      }
    }

    for (const it of this.items) {
      if (!it.alive) continue;
      it.group.position.y = it.y + 0.2 + Math.sin(this.elapsed * 2.5 + it.phase) * 0.18;
      it.group.rotation.y += dt * 1.6;

      for (const p of players) {
        if (!p.alive) continue;
        if (Math.hypot(p.position.x - it.x, p.position.z - it.z) < 1.8) {
          it.alive = false;
          it.group.visible = false;
          const fn = this.handlers[it.type];
          if (fn) fn(it, p);
          break;
        }
      }
    }
  }
}

export { DEFS as PICKUP_DEFS };
