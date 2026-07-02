import * as THREE from 'three';
import { spriteQuad, spriteMaterial, SPRITE_FRAMES, blobShadowTexture } from './spriteart.js';

const MAX_PER_TYPE = 340;
const HARD_CAP = 320; // mehr Gegner gleichzeitig

// numerischer Grid-Schlüssel (keine String-Allokation pro Gegner/Frame); Arena passt in ±512 Zellen
const _gkey = (cx, cz) => (cx + 512) * 2048 + (cz + 512);

// Reihenfolge der Typen (Index = Snapshot-Code) — nur anhängen, nie umsortieren!
export const ETYPE_KEYS = [
  'scavenger', 'bloodfly', 'wolf', 'molerat', 'skeleton', 'ghoul', 'boss',
  'gargoyle', 'demon', 'troll', 'boss_bone', 'boss_demon',
  'shooter', 'exploder', 'splitter', 'zombling',
];

// ---- Eliten: seltene, verstärkte Varianten normaler Gegner mit Affix ----
const ELITE_KEYS = ['swift', 'shield', 'boom'];
const ELITE_TINT = {
  swift: new THREE.Color(0.7, 1.3, 2.2), // eisblau
  shield: new THREE.Color(2.0, 1.7, 0.7), // gold
  boom: new THREE.Color(2.2, 0.9, 0.55), // glutorange
};
const ELITE_NAMES = { swift: 'Windgepeitscht', shield: 'Gepanzert', boom: 'Explosiv' };

// Boss-Enrage-Tints je Phase (1 = angeschlagen, 2 = rasend)
const BOSS_PHASE_TINT = [null, new THREE.Color(1.5, 1.05, 0.9), new THREE.Color(1.9, 0.85, 0.7)];

// Bosse, die in Abständen rotierend erscheinen
const BOSS_TYPES = ['boss', 'boss_bone', 'boss_demon'];
const BOSS_NAMES = { boss: 'SCHATTENLÄUFER', boss_bone: 'KNOCHENKÖNIG', boss_demon: 'ERZDÄMON' };
const ENEMY_NAMES = {
  scavenger: 'Aasfresser', bloodfly: 'Blutfliege', wolf: 'Wolf', molerat: 'Maulwurfsratte',
  skeleton: 'Skelett', ghoul: 'Ghul', gargoyle: 'Gargyle', demon: 'Dämon', troll: 'Troll',
  boss: 'Schattenläufer', boss_bone: 'Knochenkönig', boss_demon: 'Erzdämon',
  shooter: 'Schwarzmagier', exploder: 'Höllenbrut', splitter: 'Moderleib', zombling: 'Modergänger',
};

const ETYPES = {
  scavenger: { hp: 9, speed: 2.6, dmg: 6, radius: 0.55, scale: 1.05, xp: 1, gold: 0.05, glow: 0x86b03a },
  bloodfly: { hp: 7, speed: 3.0, dmg: 7, radius: 0.5, scale: 0.95, xp: 2, gold: 0.07, fly: true, glow: 0xd02828 },
  wolf: { hp: 20, speed: 3.5, dmg: 9, radius: 0.6, scale: 1.15, xp: 3, gold: 0.09, glow: 0xe08018 },
  molerat: { hp: 32, speed: 2.2, dmg: 11, radius: 0.8, scale: 1.1, xp: 4, gold: 0.1, glow: 0xc89838 },
  skeleton: { hp: 46, speed: 2.5, dmg: 12, radius: 0.6, scale: 1.15, xp: 6, gold: 0.14, glow: 0x9fd8e6 },
  ghoul: { hp: 64, speed: 2.3, dmg: 15, radius: 0.7, scale: 1.2, xp: 9, gold: 0.18, glow: 0x7ec24a },
  // Spät-Gegner (tankiger, mehr XP)
  gargoyle: { hp: 85, speed: 2.7, dmg: 15, radius: 0.7, scale: 1.3, xp: 9, gold: 0.22, fly: true, glow: 0x7aa0d0 },
  demon: { hp: 110, speed: 3.1, dmg: 18, radius: 0.7, scale: 1.5, xp: 13, gold: 0.28, glow: 0xe85018 },
  troll: { hp: 190, speed: 1.8, dmg: 24, radius: 1.1, scale: 1.9, xp: 18, gold: 0.45, glow: 0x58a838 },
  // Bosse
  // Jeder Boss hat ein EIGENES Fähigkeiten-Set (fühlt sich anders an):
  //  Schattenläufer = Nahkämpfer (Slam/Kegel/Festwurzeln), Knochenkönig = Distanz/Bullet-Hell (Kugeln/Nova/Safe-Zonen),
  //  Erzdämon = aggressiver Allrounder (Slam/Nova/Kugeln/Festwurzeln).
  // Verhaltens-Archetypen: Schütze hält Abstand und feuert Kugeln, Höllenbrut rennt an und
  // detoniert (telegrafiert — vorher töten verhindert die Explosion), Moderleib zerfällt in Modergänger.
  shooter: { hp: 42, speed: 2.4, dmg: 11, radius: 0.6, scale: 1.2, xp: 8, gold: 0.2, ranged: true, glow: 0x9adcff },
  exploder: { hp: 26, speed: 3.6, dmg: 12, radius: 0.5, scale: 1.0, xp: 5, gold: 0.12, explode: { r: 3.2 }, glow: 0xff7a2a },
  splitter: { hp: 95, speed: 1.9, dmg: 16, radius: 0.9, scale: 1.55, xp: 10, gold: 0.24, split: { type: 'zombling', n: 2 }, glow: 0x86c86a },
  zombling: { hp: 12, speed: 3.3, dmg: 7, radius: 0.45, scale: 0.85, xp: 1, gold: 0.04, glow: 0x86c86a },
  boss: { hp: 1300, speed: 2.0, dmg: 26, radius: 2.0, scale: 2.6, xp: 60, gold: 5, boss: true, glow: 0xb030e0, abilities: ['slam', 'frontal', 'root'] },
  boss_bone: { hp: 1600, speed: 2.2, dmg: 28, radius: 1.8, scale: 1.8, xp: 75, gold: 6, boss: true, glow: 0xdce6f0, abilities: ['bolts', 'nova', 'safe'] },
  boss_demon: { hp: 2000, speed: 2.4, dmg: 32, radius: 1.9, scale: 2.0, xp: 90, gold: 7, boss: true, glow: 0xff3a14, abilities: ['slam', 'nova', 'bolts', 'root'] },
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

    // HD-2D: jeder Gegner ist ein Billboard-Pixel-Sprite (InstancedMesh je Typ).
    this._buildSpriteMeshes();

    // Blob-Schatten unter allen Gegnern (verankert die Sprites am Boden; ein Draw-Call)
    const shGeo = new THREE.PlaneGeometry(1, 1);
    shGeo.rotateX(-Math.PI / 2);
    this._shadowMesh = new THREE.InstancedMesh(
      shGeo,
      new THREE.MeshBasicMaterial({ map: blobShadowTexture(), transparent: true, depthWrite: false }),
      HARD_CAP + 60
    );
    this._shadowMesh.count = 0;
    this._shadowMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this._shadowMesh.frustumCulled = false;
    this._shadowMesh.renderOrder = 1;
    this.scene.add(this._shadowMesh);

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
    this.onShake = null; // vom Game gesetzt (Screen-Shake bei Einschlägen)
    this.onBossEnrage = null; // vom Game gesetzt (Banner/Sound bei Boss-Enrage)
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

  reset() {
    for (const e of this.enemies) e.alive = false;
    for (const key of ETYPE_KEYS) this.meshes[key].count = 0;
    this._shadowMesh.count = 0;
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
    if (t > 90) pool.push('exploder');
    if (t > 100) pool.push('skeleton', 'wolf');
    if (t > 120) pool.push('shooter');
    if (t > 150) pool.push('ghoul', 'skeleton');
    if (t > 160) pool.push('splitter');
    if (t > 180) pool.push('gargoyle');
    if (t > 220) pool.push('demon', 'ghoul');
    if (t > 250) pool.push('shooter', 'exploder');
    if (t > 270) pool.push('troll', 'demon');
    if (t > 330) pool.push('troll', 'gargoyle', 'demon', 'splitter');
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
    e.elite = null;
    e.tint = null;
    e.shield = 0;
    e.xpMult = 1;
    e.arming = null;
    e._shoot = null;
    e.bossPhase = 0;
    e._cyc = null;
    e._ci = null;
    e.id = this._nextId++;
    return e;
  }

  // Selten (ab ~90s bzw. Phase 2): normalen Gegner zur Elite mit Affix aufwerten
  _maybeElite(e) {
    if (!e || e.def.boss || e.type === 'zombling') return e;
    if (this.elapsed < 90 && this.phase < 1) return e;
    if (this._rnd() > 0.05) return e;
    const a = ELITE_KEYS[Math.floor(this._rnd() * ELITE_KEYS.length)];
    e.elite = a;
    e.maxHp = Math.round(e.maxHp * 3);
    e.hp = e.maxHp;
    e.scale *= 1.35;
    e.xpMult = 4;
    e.tint = ELITE_TINT[a];
    if (a === 'swift') e.speed *= 1.5;
    if (a === 'shield') e.shield = Math.round(e.maxHp * 0.5);
    return e;
  }
  eliteName(e) {
    return `${ELITE_NAMES[e.elite] || 'Elite'}: ${ENEMY_NAMES[e.type] || e.type}`;
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
      if (this.world.inBounds(x, z, 6)) return this.spawn(type, x, z);
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
      if (!this.world.inBounds(x, z, 6)) continue;
      let ok = true;
      for (const p of centers) { if (Math.hypot(x - p.x, z - p.z) < minDist) { ok = false; break; } }
      if (ok) return this._maybeElite(this.spawn(type, x, z));
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
    // wiederverwendete Puffer statt Allokationen pro Frame
    const centers = this._centers || (this._centers = []);
    centers.length = 0;
    for (const p of players) centers.push(p.position);
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

    // Separations-Grid — persistent & wiederverwendet (kein new Map() pro Frame).
    // Nach dem Update dient es auch den Waffen-Abfragen (inRadius) als Broadphase.
    const cell = 1.6;
    this._frame = (this._frame || 0) + 1;
    const grid = this._grid || (this._grid = new Map());
    if (this._frame % 1800 === 0) grid.clear(); // leere Buckets gelegentlich entsorgen
    else for (const arr of grid.values()) arr.length = 0;
    const key = _gkey;
    for (let i = 0; i < this.enemies.length; i++) {
      const e = this.enemies[i];
      if (!e.alive) continue;
      const k = key(Math.floor(e.x / cell), Math.floor(e.z / cell));
      let arr = grid.get(k);
      if (!arr) grid.set(k, (arr = []));
      arr.push(i);
    }
    this._gridFrame = this._frame;


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

      // ---- Verhaltens-Archetypen ----
      if (target) {
        if (e.def.ranged) {
          // Schütze: Abstand halten, aus der Distanz Kugeln feuern (dodgebar)
          if (d < 11) { dx = -dx; dz = -dz; }
          else if (d < 16) { dx = 0; dz = 0; }
          e._shoot = (e._shoot == null ? 1.2 + this._rnd() * 2 : e._shoot) - dt;
          if (e._shoot <= 0 && d < 26) {
            e._shoot = 2.4 + this._rnd() * 1.8;
            const ang = Math.atan2(tz - e.z, tx - e.x);
            this._spawnBolt(e.x, e.z, Math.cos(ang) * 7.5, Math.sin(ang) * 7.5, e.dmg, e.type);
            if (this.fx) this.fx.sparksBurst(e.x, e.y + 1.4, e.z, 0x9adcff, 5, 3);
          }
        } else if (e.def.explode) {
          // Höllenbrut: nah ran, kurz anschwellen (Telegraph), dann detonieren.
          // Wer sie vorher tötet, verhindert die Explosion.
          if (e.arming != null) {
            dx = 0; dz = 0;
            e.arming -= dt;
            if (e.arming <= 0) {
              e.alive = false;
              this._aoes.push({ type: 'circle', x: e.x, z: e.z, r: e.def.explode.r, dmg: Math.round(e.dmg * 1.8), delay: 0, src: e.type });
              continue;
            }
          } else if (d < 2.8) {
            e.arming = 0.85;
            if (this.fx) this.fx.telegraph(e.x, e.z, e.def.explode.r, 0.85, e.y);
          }
        }
      }

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
        this.world.clampBounds(e, 4);
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
          // Boss-Phasen: bei 66% und 33% HP Enrage — schneller, härter, eine Fähigkeit mehr
          const frac = e.hp / e.maxHp;
          const wantPhase = frac < 0.33 ? 2 : frac < 0.66 ? 1 : 0;
          if ((e.bossPhase || 0) < wantPhase) {
            e.bossPhase = wantPhase;
            e.speed *= 1.12;
            e.atk = Math.min(e.atk || 2, 0.6); // direkt der nächste Angriff
            e.tint = BOSS_PHASE_TINT[wantPhase];
            const cur = e._cyc || ab.filter((a) => a !== 'safe');
            const extra = ['nova', 'bolts', 'slam', 'frontal'].find((a) => !cur.includes(a));
            if (extra) e._cyc = cur.concat(extra);
            if (this.fx) {
              this.fx.ring(e.x, e.z, 8, 0xff3020);
              this.fx.sparksBurst(e.x, e.y + 1.6, e.z, 0xff5030, 28, 8);
            }
            if (this.onShake) this.onShake(0.45);
            if (this.onBossEnrage) this.onBossEnrage(wantPhase, ENEMY_NAMES[e.type] || 'Der Boss');
          }
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
                const spot = { x: ref.position.x + Math.cos(ang) * dist, z: ref.position.z + Math.sin(ang) * dist };
                this.world.clampBounds(spot, 5); // Safe-Zone muss erreichbar bleiben (Korridor!)
                spots.push({ x: spot.x, z: spot.z, r: 3.6 });
                if (this.fx) this.fx.telegraphSafe(spot.x, spot.z, 3.6, dur, this.world.getHeight(spot.x, spot.z));
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
              // Enrage-Phasen beschleunigen die Angriffsrotation deutlich
              e.atk = (2.6 + this._rnd() * 1.6) * (1 - 0.22 * (e.bossPhase || 0));
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
          if (this.onShake) this.onShake(0.3);
          for (const p of players) {
            if (!p.alive || p.dead) continue;
            const pdx = p.position.x - a.x, pdz = p.position.z - a.z;
            const d = Math.hypot(pdx, pdz);
            if (d < a.range && d > 0.001 && (pdx / d) * a.dx + (pdz / d) * a.dz > Math.cos(a.half)) p.takeDamage(a.dmg, a.src);
          }
        } else {
          if (this.fx) this.fx.explosion(a.x, a.z, a.r, 0xff5a3a);
          if (this.onShake) this.onShake(0.3);
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
    for (const b of this._bolts) {
      if (!b.alive) continue;
      b.life -= dt;
      b.x += b.vx * dt; b.z += b.vz * dt;
      let hit = false;
      for (const p of players) {
        if (!p.alive || p.dead) continue;
        if (Math.hypot(p.position.x - b.x, p.position.z - b.z) < b.r + p.radius) { p.takeDamage(b.dmg, b.src); hit = true; break; }
      }
      if (hit || b.life <= 0 || !this.world.inBounds(b.x, b.z, 0)) {
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
    let shadowIdx = 0;
    const shadowCap = this._shadowMesh.instanceMatrix.count;

    for (const e of list) {
      if (needAlive && !e.alive) continue;
      // Blob-Schatten am Boden (auch unter Fliegern)
      if (shadowIdx < shadowCap) {
        const ss = e.scale * (e.def.boss ? 2.6 : 1.7);
        _p.x = e.x; _p.y = e.y + 0.05; _p.z = e.z;
        _s.x = ss; _s.y = 1; _s.z = ss;
        this._tmpM.compose(_p, _q, _s);
        this._shadowMesh.setMatrixAt(shadowIdx++, this._tmpM);
      }
      const mesh = this.meshes[e.type];
      const idx = counters[e.type];
      if (idx >= mesh.instanceMatrix.count) continue;
      const def = e.def;
      // Sprite-Höhe in Welt-Einheiten; Füße auf dem Boden (Billboard verankert unten)
      let sc = e.scale * 3.1;
      if (e.arming) sc *= 1 + 0.22 * Math.sin(this.elapsed * 30); // Höllenbrut schwillt vor der Detonation an
      let y = e.y;
      if (def.fly) y += 1.4 + Math.sin(this.elapsed * 6 + e.phase) * 0.25; // Schweben
      _p.x = e.x; _p.y = y; _p.z = e.z;
      _s.x = sc; _s.y = sc; _s.z = sc;
      this._tmpM.compose(_p, _q, _s); // nur Position+Skalierung; Billboard im Shader
      mesh.setMatrixAt(idx, this._tmpM);
      mesh.setColorAt(idx, e.flash > 0 ? this._flash : e.tint || this._white);
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
    this._shadowMesh.count = shadowIdx;
    this._shadowMesh.instanceMatrix.needsUpdate = true;
  }

  // ---------- Multiplayer ----------
  // Host: Snapshot [id, typeIdx, x, z, hp255, flags] je lebendem Gegner.
  // flags: Bits 0-2 = Elite-Affix (Index+1), Bit 3 = Detonations-Anschwellen
  snapshot() {
    const out = [];
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const flags = (e.elite ? ELITE_KEYS.indexOf(e.elite) + 1 : 0) | (e.arming != null ? 8 : 0);
      out.push(e.id, ETYPE_KEYS.indexOf(e.type), Math.round(e.x * 20) / 20, Math.round(e.z * 20) / 20, Math.max(0, Math.round((e.hp / e.maxHp) * 255)), flags);
    }
    return out;
  }

  // Client: Snapshot in Ziel-Positionen der Ghosts überführen (id-stabil)
  setSnapshot(arr) {
    this._ghostGen++;
    const gen = this._ghostGen;
    for (let i = 0; i + 5 < arr.length; i += 6) {
      const id = arr[i];
      const type = ETYPE_KEYS[arr[i + 1]];
      const tx = arr[i + 2];
      const tz = arr[i + 3];
      let g = this._ghosts.get(id);
      if (!g) {
        g = { type, def: ETYPES[type], x: tx, z: tz, tx, tz, scale: ETYPES[type].scale, phase: (id * 1.37) % 10, _dx: 0, _dz: 1, flash: 0 };
        this._ghosts.set(id, g);
      }
      const flags = arr[i + 5] || 0;
      const elite = flags & 7;
      g.type = type;
      g.def = ETYPES[type];
      g.scale = g.def.scale * (elite ? 1.35 : 1);
      g.tint = elite ? ELITE_TINT[ELITE_KEYS[elite - 1]] : null;
      g.arming = !!(flags & 8);
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

  // Gegner im Radius. Nutzt das Separations-Grid als Broadphase (statt alle 320 zu scannen).
  // ACHTUNG: gibt einen WIEDERVERWENDETEN Puffer zurück — Ergebnis sofort verbrauchen,
  // nicht über den nächsten inRadius-Aufruf hinaus aufheben.
  inRadius(x, z, r) {
    const out = this._queryOut || (this._queryOut = []);
    out.length = 0;
    const rr = r * r;
    if (this._grid && this._gridFrame === this._frame) {
      const cell = 1.6;
      const m = r + 0.6; // Sicherheitsrand: Gegner bewegen sich nach dem Grid-Aufbau noch minimal
      const x0 = Math.floor((x - m) / cell);
      const x1 = Math.floor((x + m) / cell);
      const z0 = Math.floor((z - m) / cell);
      const z1 = Math.floor((z + m) / cell);
      for (let cx = x0; cx <= x1; cx++) {
        for (let cz = z0; cz <= z1; cz++) {
          const arr = this._grid.get(_gkey(cx, cz));
          if (!arr) continue;
          for (const j of arr) {
            const e = this.enemies[j];
            if (!e.alive) continue;
            if ((e.x - x) ** 2 + (e.z - z) ** 2 <= rr) out.push(e);
          }
        }
      }
      return out;
    }
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
    // Gepanzerte Eliten: Schild absorbiert zuerst (graue Zahlen)
    if (e.shield > 0) {
      const abs = Math.min(e.shield, amount);
      e.shield -= abs;
      amount -= abs;
      if (this.fx) this.fx.dmgNumber(e.x, e.y + e.scale * 2.6, e.z, abs, '#b9c4d4', false);
      if (amount <= 0) {
        e.flash = 0.12;
        return;
      }
    }
    e.hp -= amount;
    e.flash = 0.12;
    if (this.fx) this.fx.dmgNumber(e.x, e.y + e.scale * 2.6, e.z, amount, e.def.boss ? '#ffc46a' : '#ffe9a0', amount >= 100);
    if (slow) e.slow = slow;
    if (knock) {
      e.kx += knock.x;
      e.kz += knock.z;
    }
    if (e.hp <= 0) {
      e.alive = false;
      this.totalKills++;
      this._sinceKill = 0; // Kill beruhigt den Zorn (Anti-Kiting)
      // WICHTIG: onKill zuerst und Todes-Werte VOR spawn() sichern — spawn() darf den
      // soeben freigewordenen Pool-Slot von e sofort wiederverwenden und überschreibt
      // dann e.def/e.x/e.z (war die Crash-Ursache: e.def.split.n auf dem Zombling-Def).
      const split = e.def.split;
      const boom = e.elite === 'boom';
      const dx = e.x, dy = e.y, dz = e.z;
      const dDmg = e.dmg, dType = e.type;
      if (onKill) onKill(e);
      // Moderleib zerfällt in Modergänger
      if (split) {
        for (let i = 0; i < split.n; i++) {
          this.spawn(split.type, dx + (this._rnd() - 0.5) * 1.6, dz + (this._rnd() - 0.5) * 1.6);
        }
        if (this.fx) this.fx.sparksBurst(dx, dy + 0.8, dz, 0x86c86a, 10, 4);
      }
      // Explosiv-Elite: verzögerte Todes-Explosion (telegrafiert — wegrennen!)
      if (boom) {
        this._aoes.push({ type: 'circle', x: dx, z: dz, r: 3.4, dmg: Math.round(dDmg * 1.6), delay: 0.75, src: dType });
        if (this.fx) this.fx.telegraph(dx, dz, 3.4, 0.75, dy);
      }
    }
  }
}
