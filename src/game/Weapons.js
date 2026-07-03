import * as THREE from 'three';

// Waffen-Definitionen: Werte skalieren per Formel mit dem Level.
export const WEAPON_DEFS = {
  heal: {
    name: 'Lebensfunke',
    desc: 'Heilt dich und Verbündete in der Nähe',
    maxLevel: 10,
    stats: (lv) => ({ heal: 4 + lv * 1.2, radius: 10, cd: Math.max(2.6, 4.4 - lv * 0.12) }),
  },
  whirl: {
    name: 'Klingenwirbel',
    desc: 'Schaden an allen Feinden in der Nähe',
    maxLevel: 10,
    stats: (lv) => ({ damage: 7 + lv * 5, radius: 2.8 + lv * 0.5, cd: Math.max(0.5, 1.4 - lv * 0.08) }),
  },
  axe: {
    name: 'Wurfaxt',
    desc: 'Wirbelnde Äxte durchbohren Feinde',
    maxLevel: 10,
    stats: (lv) => ({
      damage: 10 + lv * 6,
      count: 1 + Math.floor(lv / 2),
      pierce: 1 + Math.floor(lv / 3),
      cd: Math.max(0.45, 1.3 - lv * 0.07),
      speed: 20,
    }),
  },
  fireball: {
    name: 'Feuerball',
    desc: 'Explodiert mit Flächenschaden',
    maxLevel: 10,
    stats: (lv) => ({
      damage: 16 + lv * 9,
      count: 1 + Math.floor((lv - 1) / 3),
      area: 2.2 + lv * 0.3,
      cd: Math.max(0.8, 2.0 - lv * 0.08),
      speed: 13,
    }),
  },
  orbit: {
    name: 'Wächtergeister',
    desc: 'Kreisende Geister verletzen bei Berührung',
    maxLevel: 10,
    stats: (lv) => ({ damage: 6 + lv * 4, count: 2 + Math.floor(lv / 2), radius: 2.8 + lv * 0.3, speed: 2 + lv * 0.15 }),
  },
  lightning: {
    name: 'Blitzschlag',
    desc: 'Schlägt zufällige Feinde mit Wucht',
    maxLevel: 10,
    stats: (lv) => ({ damage: 22 + lv * 12, count: 1 + Math.floor(lv / 2), cd: Math.max(1.0, 2.4 - lv * 0.1), range: 17, area: 2.2 }),
  },
  frost: {
    name: 'Frostbann',
    desc: 'Frostwelle: Schaden + verlangsamt Feinde',
    maxLevel: 10,
    stats: (lv) => ({ damage: 8 + lv * 5, radius: 3.2 + lv * 0.5, cd: Math.max(0.7, 1.8 - lv * 0.1), slow: 1.4 }),
  },
  spear: {
    name: 'Knochenspeer',
    desc: 'Schneller Speer durchbohrt viele Feinde',
    maxLevel: 10,
    stats: (lv) => ({ damage: 14 + lv * 8, count: 1 + Math.floor(lv / 3), pierce: 3 + lv, cd: Math.max(0.5, 1.5 - lv * 0.09), speed: 30 }),
  },
  poison: {
    name: 'Giftwolke',
    desc: 'Hinterlässt ätzende Wolken (Schaden über Zeit)',
    maxLevel: 10,
    stats: (lv) => ({ damage: 5 + lv * 3, radius: 2.0 + lv * 0.25, life: 3 + lv * 0.3, cd: Math.max(0.9, 2.2 - lv * 0.1) }),
  },
  holy: {
    name: 'Weihrauch',
    desc: 'Heilige Aura schadet nahen Feinden ständig',
    maxLevel: 10,
    stats: (lv) => ({ damage: 6 + lv * 4, radius: 2.0 + lv * 0.35, cd: 0.5 }),
  },
  daggers: {
    name: 'Schattendolche',
    desc: 'Fächer schneller, durchbohrender Dolche',
    maxLevel: 10,
    stats: (lv) => ({ damage: 7 + lv * 4, count: 3 + lv, pierce: 2 + Math.floor(lv / 2), cd: Math.max(0.4, 1.1 - lv * 0.07), speed: 26 }),
  },
  meteor: {
    name: 'Meteor',
    desc: 'Einschläge mit Flächenschaden auf Feinde',
    maxLevel: 10,
    stats: (lv) => ({ damage: 20 + lv * 12, count: 1 + Math.floor(lv / 2), area: 2.6 + lv * 0.35, cd: Math.max(0.9, 2.2 - lv * 0.1), range: 22 }),
  },
};

// Kombinationen — zwei Rezept-Formen:
//  1) ZWEI Waffen (beide Maxlevel): `base` wird verstärkt (evolved), `consume` wird entfernt -> Slot frei.
//  2) Waffe (Maxlevel) + PASSIV (mehrfach genommen): `base` wird verstärkt, kein Slot frei, Passiv bleibt.
// Icons der verschmolzenen Formen (Anzeige in HUD/DPS/Endscreen)
export const COMBO_ICONS = {
  Gletscherdorn: '💠', Mahlstrom: '🌊', Schutzsegen: '🕊', 'Quell des Lebens': '⛲',
  Klingensturm: '🌪', 'Höllensturm': '🌋', 'Ewiger Winter': '🧊', Seuchenhagel: '☣️',
  Sternenregen: '🌠', 'Geweihte Klingen': '⚜️', Kataklysmus: '💥', 'Göttlicher Zorn': '🌩',
  'Urteil des Henkers': '⚖️', Sturmruf: '⛈', Pestwind: '🦠', Seelenwacht: '👻',
};
export const WEAPON_ICONS = { heal: '💚', whirl: '🌀', axe: '🪓', fireball: '🔥', orbit: '✦', lightning: '⚡', frost: '❄️', spear: '🦴', poison: '☠️', holy: '✝️', daggers: '🗡️', meteor: '☄️' };

export const COMBINATIONS = [
  { base: 'whirl', consume: 'axe', name: 'Klingensturm', desc: 'Der Wirbel schleudert zusätzlich Klingen nach außen' },
  { base: 'fireball', consume: 'lightning', name: 'Höllensturm', desc: 'Jeder Feuerball-Einschlag ruft einen Blitz herab' },
  { base: 'frost', consume: 'orbit', name: 'Ewiger Winter', desc: 'Frostwellen frieren Gegner mehr als doppelt so lange ein' },
  { base: 'spear', consume: 'poison', name: 'Seuchenhagel', desc: 'Speere ziehen ätzende Gift-Spuren hinter sich her' },
  { base: 'daggers', consume: 'meteor', name: 'Sternenregen', desc: 'Jede Dolch-Salve ruft zwei Mini-Meteore vom Himmel' },
  { base: 'holy', consume: 'daggers', name: 'Geweihte Klingen', desc: 'Die Aura wirft geweihte Dolche auf den nächsten Gegner' },
  { base: 'meteor', consume: 'fireball', name: 'Kataklysmus', desc: 'Einschläge lösen Schockwellen aus, die alles wegschleudern' },
  { base: 'holy', consume: 'lightning', name: 'Göttlicher Zorn', desc: 'Die Aura straft Gegner regelmäßig mit heiligen Blitzen' },
  { base: 'spear', consume: 'frost', name: 'Gletscherdorn', desc: 'Eisspeere frieren jeden Treffer ein' },
  { base: 'heal', consume: 'holy', name: 'Schutzsegen', desc: 'Heilpulse gewähren kurz einen Schutzschild (−55% Schaden)' },
  // Waffe + Passiv (3× genommen)
  { base: 'whirl', passive: 'speed', passiveCount: 3, name: 'Mahlstrom', desc: 'Der Wirbel saugt Gegner an, statt sie wegzustoßen' },
  { base: 'heal', passive: 'regen', passiveCount: 3, name: 'Quell des Lebens', desc: 'Heilpulse hinterlassen heilende Felder' },
  { base: 'axe', passive: 'might', passiveCount: 3, name: 'Urteil des Henkers', desc: 'Riesenäxte richten angeschlagene Gegner sofort hin' },
  { base: 'lightning', passive: 'proj', passiveCount: 3, name: 'Sturmruf', desc: 'Blitze springen als Kette auf weitere Gegner über' },
  { base: 'poison', passive: 'area', passiveCount: 3, name: 'Pestwind', desc: 'Giftwolken wandern mit dem Wind und verlangsamen' },
  { base: 'orbit', passive: 'hp', passiveCount: 3, name: 'Seelenwacht', desc: 'Jeder Geister-Treffer heilt dich (Lebensraub)' },
];

export class Weapons {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);

    this.owned = {}; // id -> { id, level, cdTimer }
    this.projectiles = [];
    // Client: reine Anzeige-Kopien der Host-Projektile (eigene Gruppe, nicht vom Tod-Ausblenden betroffen)
    this.projGhosts = [];
    this.ghostGroup = new THREE.Group();
    scene.add(this.ghostGroup);
    this.orbs = [];
    this.elapsed = 0;
    this.fx = null; // wird vom Game gesetzt (Effects.js)
    this._dealt = {}; // Schaden pro Waffe (für Endstatistik)
    this.ownedSince = {}; // id -> elapsed beim Erwerb (für DPS = Gesamtschaden / Besitzdauer)

    // ---- Persistenter Klingenwirbel (dezent, gibt den Helden frei) ----
    this.whirlBlades = [];
    this._whirlSpin = 0;
    // flache, metallische Klinge (keine „Kristalle" mehr)
    this._bladeGeo = new THREE.ConeGeometry(0.17, 1.1, 4);
    this._bladeGeo.scale(1, 1, 0.28); // flach -> Schwertklinge
    this._bladeMat = new THREE.MeshStandardMaterial({ color: 0xccd3df, metalness: 0.95, roughness: 0.28, emissive: 0x1c2838, emissiveIntensity: 0.45 });

    // Material-/Geometrie-Caches (leuchtend -> Bloom)
    this._axeGeo = new THREE.BoxGeometry(0.16, 0.55, 0.55);
    this._axeMat = new THREE.MeshStandardMaterial({ color: 0xeef2fa, metalness: 0.8, roughness: 0.25, emissive: 0x6a7a9a, emissiveIntensity: 0.8 });
    this._fireGeo = new THREE.SphereGeometry(0.4, 12, 10);
    this._fireMat = new THREE.MeshStandardMaterial({ color: 0xffae4a, emissive: 0xff5a10, emissiveIntensity: 3.0 });
    this._orbGeo = new THREE.SphereGeometry(0.34, 12, 10);
    this._orbMat = new THREE.MeshStandardMaterial({ color: 0xa8e0ff, emissive: 0x2a9aff, emissiveIntensity: 2.6, transparent: true, opacity: 0.95 });

    // Speer-Projektil
    this._spearGeo = new THREE.CylinderGeometry(0.05, 0.13, 1.6, 6);
    this._spearGeo.rotateX(Math.PI / 2);
    this._spearMat = new THREE.MeshStandardMaterial({ color: 0xeae0c8, emissive: 0x88aaff, emissiveIntensity: 0.7, roughness: 0.4 });

    // Giftwolken (persistent)
    this.clouds = [];
    this._cloudGeo = new THREE.SphereGeometry(1, 12, 10);
    this._cloudMat = new THREE.MeshStandardMaterial({ color: 0x6abf3a, emissive: 0x2a6a18, emissiveIntensity: 1.0, transparent: true, opacity: 0.38, depthWrite: false });

    // Weihrauch-Aura
    // depthTest:false -> die Weihrauch-Aura bleibt auf Hügeln immer sichtbar (kein Clipping ins Gelände)
    this._holyMat = new THREE.MeshBasicMaterial({ color: 0xfff0b0, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending });
    this.holyRing = new THREE.Mesh(new THREE.RingGeometry(0.5, 1.0, 40), this._holyMat);
    this.holyRing.rotation.x = -Math.PI / 2;
    this.holyRing.renderOrder = 3;
    this.holyRing.visible = false;
    this.group.add(this.holyRing);
  }

  // Shader-Prewarm: je ein Mesh pro Projektil-Material einmal rendern lassen,
  // damit die erste echte Nutzung im Kampf keinen Kompilier-Ruckler erzeugt.
  prewarm() {
    const pairs = [
      [this._bladeGeo, this._bladeMat], [this._axeGeo, this._axeMat], [this._fireGeo, this._fireMat],
      [this._orbGeo, this._orbMat], [this._spearGeo, this._spearMat], [this._cloudGeo, this._cloudMat],
    ];
    this._prewarmMeshes = pairs.map(([geo, mat]) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(0, 1.2, 0);
      this.group.add(m);
      return m;
    });
    this.holyRing.visible = true;
  }
  prewarmCleanup() {
    for (const m of this._prewarmMeshes || []) this.group.remove(m);
    this._prewarmMeshes = null;
    this.holyRing.visible = false;
  }

  serialize() {
    return { owned: this.ownedList().map((w) => ({ id: w.id, level: w.level, evolved: !!w.evolved, evoName: w.evoName })), dealt: { ...this._dealt } };
  }
  loadSave(data) {
    this.owned = {};
    this.ownedSince = {};
    for (const w of data.owned || []) { this.owned[w.id] = { id: w.id, level: w.level, evolved: !!w.evolved, evoName: w.evoName, evoIcon: w.evoName ? COMBO_ICONS[w.evoName] || '✨' : undefined, cdTimer: 0.3 }; this.ownedSince[w.id] = 0; }
    this._dealt = { ...(data.dealt || {}) };
    this._rebuildWhirl();
    this._rebuildOrbs();
  }

  // Loadout aus Snapshot setzen (Client) — baut Visuals nur bei Änderung neu.
  setLoadout(ld) {
    const sig = ld.map((w) => w.id + w.level + (w.evolved ? 'e' : '')).join(',');
    if (sig === this._ldSig) return;
    this._ldSig = sig;
    this.owned = {};
    for (const w of ld) {
      this.owned[w.id] = { id: w.id, level: w.level, evolved: !!w.evolved, evoName: w.evoName, evoIcon: w.evoName ? COMBO_ICONS[w.evoName] || '✨' : undefined, cdTimer: 0 };
      if (this.ownedSince[w.id] == null) this.ownedSince[w.id] = this.elapsed; // Client: Besitz-Zeitpunkt
    }
    this._rebuildWhirl();
    this._rebuildOrbs();
  }

  // Nur die dauerhaften Visuals (Wirbel/Geister/Aura) um einen Spieler zeichnen,
  // ohne Schaden/Cooldowns — für den Client (Gast sieht Waffen).
  renderVisualsOnly(dt, player) {
    this.elapsed += dt;
    const areaMult = player.area || 1;
    if (this.has('whirl')) {
      const s = WEAPON_DEFS.whirl.stats(this.level('whirl'));
      const r = s.radius * areaMult;
      this._whirlSpin += dt * (6 + this.level('whirl') * 0.5);
      const py = player.position.y;
      for (const o of this.whirlBlades) {
        const a = this._whirlSpin + o.off;
        o.mesh.position.set(player.position.x + Math.cos(a) * r, py + 0.95 + Math.sin(this._whirlSpin * 2 + o.off) * 0.12, player.position.z + Math.sin(a) * r);
        o.mesh.rotation.set(Math.PI / 2, -a, 0);
      }
    }
    if (this.has('orbit')) {
      const s = WEAPON_DEFS.orbit.stats(this.level('orbit'));
      const r = s.radius * areaMult;
      for (const o of this.orbs) {
        o.phase += dt * s.speed;
        o.mesh.position.set(player.position.x + Math.cos(o.phase) * r, player.position.y + 1.1, player.position.z + Math.sin(o.phase) * r);
      }
    }
    if (this.has('holy')) {
      const s = WEAPON_DEFS.holy.stats(this.level('holy'));
      const r = s.radius * areaMult * (this.owned.holy?.evolved ? 1.5 : 1);
      this.holyRing.visible = true;
      this.holyRing.position.set(player.position.x, player.position.y + 0.12, player.position.z);
      this.holyRing.scale.setScalar(r);
    }
  }

  evolve(id) {
    const w = this.owned[id];
    if (!w || w.evolved) return;
    w.evolved = true;
    if (id === 'whirl') this._rebuildWhirl();
    if (id === 'orbit') this._rebuildOrbs();
  }

  // Waffe entfernen (z. B. beim Kombinieren); persistente Visuals aufräumen.
  remove(id) {
    if (!this.owned[id]) return;
    delete this.owned[id];
    if (id === 'orbit') this._rebuildOrbs();
    if (id === 'whirl') this._rebuildWhirl();
    if (id === 'holy' && this.holyRing) this.holyRing.visible = false;
  }

  // Kombination möglich? base auf Maxlevel & unverschmolzen; zweite Zutat ist entweder
  // eine zweite Max-Waffe (consume) oder ein mehrfach genommenes Passiv (passive, braucht player).
  canCombine(c, player = null) {
    if (!this.has(c.base) || !this.isMax(c.base) || this.owned[c.base].evolved) return false;
    if (c.consume) return this.has(c.consume) && this.isMax(c.consume);
    if (c.passive) return !!player && (player.passiveCounts?.[c.passive] || 0) >= (c.passiveCount || 3);
    return false;
  }
  // Verschmelzen: consume entfernen (falls Waffen-Rezept), base verstärken.
  ally = null; // optionaler Getter auf den Verbündeten (Koop) — von Coop verdrahtet
  healZones = [];

  combine(c, player = null) {
    if (!this.canCombine(c, player)) return;
    if (c.consume) this.remove(c.consume);
    this.evolve(c.base);
    // verschmolzene Form merkt sich Namen + Icon (HUD/DPS/Endscreen zeigen die Evolution)
    const w = this.owned[c.base];
    if (w) {
      w.evoName = c.name;
      w.evoIcon = COMBO_ICONS[c.name] || '✨';
    }
  }

  // Anzeigename + Icon einer Waffe — verschmolzene Formen zeigen ihre Kombo-Identität
  displayInfo(id) {
    const w = this.owned[id];
    if (w && w.evolved && w.evoName) return { name: w.evoName, icon: w.evoIcon || '✨' };
    const def = WEAPON_DEFS[id];
    return { name: (def && def.name) || id, icon: WEAPON_ICONS[id] || '◆' };
  }

  // Schaden anwenden + der Waffe gutschreiben (für Endstatistik)
  _dmg(enemies, e, amount, knock, onKill, wid, slow) {
    const dealt = Math.min(amount, Math.max(0, e.hp));
    this._dealt[wid] = (this._dealt[wid] || 0) + dealt;
    enemies.damage(e, amount, knock, onKill, slow);
  }

  reset() {
    this.owned = {};
    this.healZones = [];
    this._dealt = {};
    this.ownedSince = {};
    for (const p of this.projectiles) {
      p.alive = false;
      p.mesh.visible = false;
    }
    for (const o of this.orbs) this.group.remove(o.mesh);
    this.orbs = [];
    for (const o of this.whirlBlades) this.group.remove(o.mesh);
    this.whirlBlades = [];
    for (const c of this.clouds) {
      c.alive = false;
      c.mesh.visible = false;
    }
    this.holyRing.visible = false;
    this.hideGhosts();
    this.elapsed = 0;
  }

  has(id) {
    return !!this.owned[id];
  }
  level(id) {
    return this.owned[id]?.level || 0;
  }
  isMax(id) {
    return this.has(id) && this.owned[id].level >= WEAPON_DEFS[id].maxLevel;
  }
  ownedList() {
    return Object.values(this.owned);
  }

  add(id) {
    if (this.owned[id]) {
      if (this.owned[id].level < WEAPON_DEFS[id].maxLevel) this.owned[id].level++;
    } else {
      this.owned[id] = { id, level: 1, cdTimer: 0.3 };
      if (this.ownedSince[id] == null) this.ownedSince[id] = this.elapsed; // Besitz-Zeitpunkt merken
    }
    if (id === 'orbit') this._rebuildOrbs();
    if (id === 'whirl') this._rebuildWhirl();
  }

  _rebuildWhirl() {
    for (const o of this.whirlBlades) this.group.remove(o.mesh);
    this.whirlBlades = [];
    const lv = this.level('whirl');
    if (!lv) return;
    // Klingensturm: goldglühende Klingen statt Stahl
    const wOwn = this.owned.whirl;
    const evolved = wOwn && wOwn.evolved;
    const maelstrom = evolved && wOwn.evoName === 'Mahlstrom';
    if (evolved && !this._bladeMatEvo) {
      this._bladeMatEvo = new THREE.MeshStandardMaterial({ color: 0xf0d8a0, metalness: 0.9, roughness: 0.25, emissive: 0xc88a20, emissiveIntensity: 1.1 });
    }
    if (maelstrom && !this._bladeMatIce) {
      this._bladeMatIce = new THREE.MeshStandardMaterial({ color: 0xbfe6ff, metalness: 0.7, roughness: 0.2, emissive: 0x2a7ac0, emissiveIntensity: 1.0 });
    }
    const mat = maelstrom ? this._bladeMatIce : evolved ? this._bladeMatEvo : this._bladeMat;
    const n = 2 + Math.floor(lv / 2); // wenige, mehr pro 2 Stufen
    for (let i = 0; i < n; i++) {
      const mesh = new THREE.Mesh(this._bladeGeo, mat);
      this.group.add(mesh);
      this.whirlBlades.push({ mesh, off: (i / n) * Math.PI * 2 });
    }
  }

  _rebuildOrbs() {
    for (const o of this.orbs) this.group.remove(o.mesh);
    this.orbs = [];
    const lv = this.level('orbit');
    if (!lv) return;
    const s = WEAPON_DEFS.orbit.stats(lv);
    const evolvedO = this.owned.orbit && this.owned.orbit.evolved;
    if (evolvedO && !this._orbMatEvo) {
      this._orbMatEvo = this._orbMat.clone();
      this._orbMatEvo.color.setHex(0x9df0b0);
      if (this._orbMatEvo.emissive) this._orbMatEvo.emissive.setHex(0x2e9a50);
    }
    for (let i = 0; i < s.count; i++) {
      const mesh = new THREE.Mesh(this._orbGeo, evolvedO ? this._orbMatEvo : this._orbMat);
      mesh.castShadow = true;
      this.group.add(mesh);
      this.orbs.push({ mesh, phase: (i / s.count) * Math.PI * 2 });
    }
  }

  // ---------------- Feuern ----------------
  _projGeo(kind) {
    return kind === 'fire' ? this._fireGeo : kind === 'spear' ? this._spearGeo : this._axeGeo;
  }
  _projMat(kind) {
    return kind === 'fire' ? this._fireMat : kind === 'spear' ? this._spearMat : this._axeMat;
  }

  _cloudY(c) {
    return c.y;
  }
  _spawnCloud(x, z, r, dmg, life, y) {
    let c = this.clouds.find((q) => !q.alive);
    if (!c) {
      const mesh = new THREE.Mesh(this._cloudGeo, this._cloudMat);
      c = { mesh, alive: false };
      this.clouds.push(c);
      this.group.add(mesh);
    }
    c.alive = true;
    c.x = x;
    c.z = z;
    c.y = (y ?? 0.6) + 0.5;
    c.r = r;
    c.dmg = dmg;
    c.life = life;
    c.maxLife = life;
    c.tick = 0.5;
    c.vx = 0;
    c.vz = 0;
    c.slow = 0;
    c.evo = false;
    c.mesh.visible = true;
    c.mesh.scale.setScalar(r * 0.7);
    c.mesh.position.set(x, c.y, z);
    return c;
  }

  _spawnProjectile(kind, x, z, vx, vz, dmg, pierce, radius, life) {
    let p = this.projectiles.find((q) => !q.alive);
    if (!p) {
      const mesh = new THREE.Mesh(this._projGeo(kind), this._projMat(kind));
      mesh.castShadow = true;
      p = { mesh, alive: false };
      this.projectiles.push(p);
      this.group.add(mesh);
    } else {
      p.mesh.geometry = this._projGeo(kind);
      p.mesh.material = this._projMat(kind);
    }
    p.alive = true;
    p.kind = kind;
    p.x = x;
    p.z = z;
    p.vx = vx;
    p.vz = vz;
    p.dmg = dmg;
    p.pierce = pierce;
    p.radius = radius;
    p.life = life;
    p.hit = new Set();
    // Pool-Reset: Flags des vorherigen Nutzers löschen (sonst boomerangt z. B. eine Axt)
    p.boomerang = false;
    p.owner = null;
    p.execute = 0;
    p.plague = false;
    p.storm = false;
    p._pl = 0;
    p.trailCol = 0;
    p.slowHit = 0;
    p.mesh.scale.setScalar(1);
    p.mesh.visible = true;
    p.mesh.position.set(x, 1.1, z);
    return p;
  }

  // ---- Multiplayer: Projektile serialisieren (Host) / als Ghosts anzeigen (Client) ----
  // Kompaktes Format je Projektil: [x, z, kindCode]  (axe=0, fire=1, spear=2)
  projSnapshot() {
    const out = [];
    for (const p of this.projectiles) {
      if (!p.alive) continue;
      out.push([Math.round(p.x * 10) / 10, Math.round(p.z * 10) / 10, p.kind === 'fire' ? 1 : p.kind === 'spear' ? 2 : 0]);
    }
    return out;
  }
  renderGhostProjectiles(list, dt) {
    const KINDS = ['axe', 'fire', 'spear'];
    let i = 0;
    for (; i < list.length; i++) {
      const x = list[i][0], z = list[i][1], kind = KINDS[list[i][2]] || 'axe';
      let g = this.projGhosts[i];
      if (!g) {
        g = { mesh: new THREE.Mesh(this._projGeo(kind), this._projMat(kind)), kind };
        g.mesh.castShadow = true;
        this.ghostGroup.add(g.mesh);
        this.projGhosts.push(g);
      } else if (g.kind !== kind) {
        g.mesh.geometry = this._projGeo(kind);
        g.mesh.material = this._projMat(kind);
        g.kind = kind;
      }
      g.mesh.visible = true;
      g.mesh.position.set(x, 1.1, z);
      g.mesh.rotation.y += dt * 18; // lokale Rotation fürs Auge (wie beim Host)
      g.mesh.rotation.x += dt * 12;
    }
    for (; i < this.projGhosts.length; i++) this.projGhosts[i].mesh.visible = false;
  }
  hideGhosts() {
    for (const g of this.projGhosts) g.mesh.visible = false;
  }

  update(dt, player, enemies, onKill) {
    this.elapsed += dt;
    const might = player.might * (player.dmgMult || 1); // dmgMult: Koop-Buffs (Last-Stand/Aura)
    const areaMult = player.area;
    const cdMult = player.cooldownMult;
    const extra = player.amount;

    // ---- Waffen-Cooldowns / Feuern ----
    for (const w of Object.values(this.owned)) {
      const def = WEAPON_DEFS[w.id];
      const s = def.stats(w.level);
      // Verschmelzung: deutlich stärker
      if (w.evolved) {
        s.damage *= 1.7;
        if (s.heal) s.heal *= 1.6;
        if (s.cd) s.cd *= 0.6;
        if (s.count) s.count += 2;
        if (s.radius) s.radius *= 1.5;
        if (s.area) s.area *= 1.5;
        if (s.pierce) s.pierce += 3;
      }
      w.cdTimer -= dt;

      if (w.id === 'orbit') continue; // dauerhaft aktiv (siehe unten)

      const cd = (s.cd ?? 1) * cdMult;
      if (w.cdTimer > 0) continue;
      w.cdTimer = cd;

      if (w.id === 'heal') {
        const targets = [player];
        if (this.ally) { const al = this.ally(); if (al && !al.dead) targets.push(al); }
        let any = false;
        for (const t of targets) {
          const near = t === player || Math.hypot(t.position.x - player.position.x, t.position.z - player.position.z) <= s.radius;
          if (!near) continue;
          if (t.hp < t.maxHp) { t.heal(s.heal); any = true; }
          // Schutzsegen: Puls legt kurzzeitig einen Schild um alle Geheilten
          if (w.evolved && w.evoName === 'Schutzsegen') { t.shieldT = Math.max(t.shieldT || 0, 1.5); any = true; }
          if (this.fx && near) { this.fx.ring(t.position.x, t.position.z, 1.6, 0x7ce68a); this.fx.sparksBurst(t.position.x, 1.2, t.position.z, 0x9df0a8, 6, 3); }
        }
        // Quell des Lebens: heilendes Feld am eigenen Standort
        if (w.evolved && w.evoName === 'Quell des Lebens') {
          this.healZones.push({ x: player.position.x, z: player.position.z, r: 2.6, t: 3, tick: 0 });
        }
        if (!any && !w.evolved) w.cdTimer = Math.min(w.cdTimer, 0.8); // alle voll -> bald erneut prüfen
      } else if (w.id === 'whirl') {
        const r = s.radius * areaMult;
        const dmg = s.damage * might;
        const maelstrom = w.evolved && w.evoName === 'Mahlstrom';
        const hit = enemies.inRadius(player.position.x, player.position.z, r + (maelstrom ? 2.2 : 0.6));
        for (const e of hit) {
          // Mahlstrom: SAUGT Gegner in den Wirbel, statt sie wegzustoßen
          const kb = maelstrom
            ? { x: (player.position.x - e.x) * 1.4, z: (player.position.z - e.z) * 1.4 }
            : { x: (e.x - player.position.x) * 1.5, z: (e.z - player.position.z) * 1.5 };
          this._dmg(enemies, e, dmg, kb, onKill, 'whirl');
          if (this.fx) this.fx.sparksBurst(e.x, 1.0, e.z, maelstrom ? 0x8fd8ff : 0xfff0c0, 3, 4);
        }
        if (this.fx) {
          this.fx.ring(player.position.x, player.position.z, r, maelstrom ? 0x6ad0ff : w.evolved ? 0xffd24a : 0xffb060);
          this.fx.slash(player.position.x, player.position.z, r, this._whirlSpin, maelstrom ? 0x9fe0ff : w.evolved ? 0xffe9b0 : 0xeaf2ff);
        }
        // Klingensturm: schleudert bei jedem Wirbel zwei Klingen nach außen
        if (w.evolved && !maelstrom) {
          for (let i = 0; i < 2; i++) {
            const a = this._whirlSpin * 2.7 + i * Math.PI;
            const pj = this._spawnProjectile('axe', player.position.x, player.position.z, Math.sin(a) * 16, Math.cos(a) * 16, dmg * 0.7, 2, 0.6 * areaMult, 0.9);
            pj.wid = 'whirl';
            pj.trailCol = 0xffd24a;
          }
        }
      } else if (w.id === 'axe') {
        const count = s.count + extra;
        const target = enemies.nearest(player.position.x, player.position.z);
        let baseAng = target ? Math.atan2(target.x - player.position.x, target.z - player.position.z) : player.yaw;
        for (let i = 0; i < count; i++) {
          const spread = (i - (count - 1) / 2) * 0.22;
          const a = baseAng + spread;
          const vx = Math.sin(a) * s.speed * player.projSpeedMult;
          const vz = Math.cos(a) * s.speed * player.projSpeedMult;
          const p = this._spawnProjectile('axe', player.position.x, player.position.z, vx, vz, s.damage * might, s.pierce, 0.7 * areaMult, 1.4);
          p.wid = 'axe';
          // Urteil des Henkers: Riesenäxte richten angeschlagene Nicht-Bosse sofort hin
          if (w.evolved) {
            p.execute = 0.2;
            p.mesh.scale.setScalar(1.8);
            p.trailCol = 0xffd24a;
          }
        }
      } else if (w.id === 'fireball') {
        const count = s.count + extra;
        for (let i = 0; i < count; i++) {
          const target = enemies.nearest(player.position.x, player.position.z, 40);
          let a;
          if (target) a = Math.atan2(target.x - player.position.x, target.z - player.position.z) + (i - (count - 1) / 2) * 0.3;
          else a = player.yaw + i;
          const vx = Math.sin(a) * s.speed * player.projSpeedMult;
          const vz = Math.cos(a) * s.speed * player.projSpeedMult;
          const p = this._spawnProjectile('fire', player.position.x, player.position.z, vx, vz, s.damage * might, 0, 0.6 * areaMult, 2.2);
          p.explodeR = s.area * areaMult;
          p.wid = 'fireball';
          p.storm = w.evolved; // Höllensturm: Einschlag ruft einen Blitz
          if (w.evolved) p.trailCol = 0xff4a10;
        }
      } else if (w.id === 'lightning') {
        const count = s.count + extra;
        // .slice(): inRadius liefert einen WIEDERVERWENDETEN Puffer — der innere Aufruf
        // unten würde die Kandidatenliste sonst mitten in der Schleife überschreiben
        const candidates = enemies.inRadius(player.position.x, player.position.z, s.range).slice();
        for (let i = 0; i < count && candidates.length; i++) {
          const e = candidates[Math.floor(Math.random() * candidates.length)];
          if (!e.alive) continue;
          if (this.fx) this.fx.bolt(e.x, e.z, 0xcfe6ff);
          const struck = enemies.inRadius(e.x, e.z, s.area * areaMult).slice();
          for (const t of struck) {
            this._dmg(enemies, t, s.damage * might, null, onKill, 'lightning');
          }
          // Sturmruf: der Blitz springt auf einen weiteren Gegner über
          if (w.evolved) {
            const jump = enemies.inRadius(e.x, e.z, 9).find((c) => c.alive && c !== e && !struck.includes(c));
            if (jump) {
              if (this.fx) this.fx.bolt(jump.x, jump.z, 0x9fd0ff);
              this._dmg(enemies, jump, s.damage * might * 0.6, null, onKill, 'lightning');
            }
          }
        }
      } else if (w.id === 'frost') {
        const r = s.radius * areaMult;
        const slowDur = w.evolved ? 3.2 : s.slow; // Ewiger Winter: friert deutlich länger ein
        for (const e of enemies.inRadius(player.position.x, player.position.z, r + 0.6)) {
          this._dmg(enemies, e, s.damage * might, null, onKill, 'frost', slowDur);
          if (this.fx) this.fx.sparksBurst(e.x, 0.9, e.z, w.evolved ? 0xeaffff : 0x9fe0ff, 2, 3);
        }
        if (this.fx) this.fx.ring(player.position.x, player.position.z, r, w.evolved ? 0xeaffff : 0x6ad0ff);
      } else if (w.id === 'spear') {
        const count = s.count + extra;
        const target = enemies.nearest(player.position.x, player.position.z);
        const baseAng = target ? Math.atan2(target.x - player.position.x, target.z - player.position.z) : player.yaw;
        const sp = s.speed * player.projSpeedMult;
        for (let i = 0; i < count; i++) {
          const a = baseAng + (i - (count - 1) / 2) * 0.3;
          const p = this._spawnProjectile('spear', player.position.x, player.position.z, Math.sin(a) * sp, Math.cos(a) * sp, s.damage * might, 9999, 0.7 * areaMult, 3.0);
          // Boomerang: fliegt raus und kehrt zum Besitzer zurück
          p.boomerang = true;
          p.phase = 'out';
          p.btime = 0;
          p.outTime = 0.42; // feste Auswurfzeit
          p.speed = sp;
          p.owner = player;
          p.wid = 'spear';
          const glacier = w.evolved && w.evoName === 'Gletscherdorn';
          p.plague = w.evolved && !glacier && i < 2; // Seuchenhagel: die vorderen Speere ziehen Gift-Spuren
          if (glacier) { p.slowHit = 1.6; p.trailCol = 0x9fe0ff; } // Gletscherdorn: Treffer frieren ein
          else if (w.evolved) p.trailCol = 0x9fe06a;
        }
      } else if (w.id === 'poison') {
        const target = enemies.nearest(player.position.x, player.position.z, 30);
        const tx = target ? target.x : player.position.x;
        const tz = target ? target.z : player.position.z;
        const ty = target ? target.y : player.position.y;
        const c = this._spawnCloud(tx, tz, s.radius * areaMult, s.damage * might, s.life, ty);
        // Pestwind: Wolken treiben mit dem Wind und verlangsamen Gegner
        if (w.evolved && c) {
          const wa = Math.random() * Math.PI * 2;
          c.vx = Math.cos(wa) * 1.6;
          c.vz = Math.sin(wa) * 1.6;
          c.slow = 1.0;
          c.evo = true;
        }
      } else if (w.id === 'holy') {
        const r = s.radius * areaMult;
        for (const e of enemies.inRadius(player.position.x, player.position.z, r)) {
          this._dmg(enemies, e, s.damage * might, null, onKill, 'holy');
        }
        if (w.evolved && w.evoName === 'Geweihte Klingen') {
          // wirft jeden Tick einen geweihten Dolch auf den nächsten Gegner
          const t = enemies.nearest(player.position.x, player.position.z, 22);
          if (t) {
            const a = Math.atan2(t.x - player.position.x, t.z - player.position.z);
            const pj = this._spawnProjectile('axe', player.position.x, player.position.z, Math.sin(a) * 26, Math.cos(a) * 26, s.damage * might * 2.2, 3, 0.5 * areaMult, 1.2);
            pj.wid = 'holy';
            pj.trailCol = 0xffe9b0;
          }
        } else if (w.evolved && w.evoName === 'Göttlicher Zorn') {
          // jeder zweite Tick: strafender Blitz auf einen Gegner im erweiterten Umkreis
          w._zorn = (w._zorn || 0) + 1;
          if (w._zorn % 2 === 0) {
            const cand = enemies.inRadius(player.position.x, player.position.z, r * 1.6);
            if (cand.length) {
              const t = cand[Math.floor(Math.random() * cand.length)];
              if (this.fx) this.fx.bolt(t.x, t.z, 0xfff0b0);
              this._dmg(enemies, t, s.damage * might * 3, null, onKill, 'holy');
            }
          }
        }
      } else if (w.id === 'daggers') {
        const count = s.count + extra;
        const target = enemies.nearest(player.position.x, player.position.z);
        const baseAng = target ? Math.atan2(target.x - player.position.x, target.z - player.position.z) : player.yaw;
        const sp = s.speed * player.projSpeedMult;
        for (let i = 0; i < count; i++) {
          const a = baseAng + (i - (count - 1) / 2) * 0.16;
          const p = this._spawnProjectile('axe', player.position.x, player.position.z, Math.sin(a) * sp, Math.cos(a) * sp, s.damage * might, s.pierce, 0.5 * areaMult, 1.3);
          p.wid = 'daggers';
          if (w.evolved) p.trailCol = 0x9fd8ff;
        }
        // Sternenregen: jede Salve ruft zwei Mini-Meteore auf zufällige Gegner
        if (w.evolved) {
          const cands = enemies.inRadius(player.position.x, player.position.z, 20).slice();
          for (let k = 0; k < 2 && cands.length; k++) {
            const t = cands[Math.floor(Math.random() * cands.length)];
            if (!t.alive) continue;
            if (this.fx) this.fx.explosion(t.x, t.z, 1.7, 0x9fd8ff);
            for (const q of enemies.inRadius(t.x, t.z, 1.7)) this._dmg(enemies, q, s.damage * might * 1.2, null, onKill, 'daggers');
          }
        }
      } else if (w.id === 'meteor') {
        const count = s.count + extra;
        const candidates = enemies.inRadius(player.position.x, player.position.z, s.range).slice(); // Puffer-Kopie (siehe lightning)
        for (let i = 0; i < count && candidates.length; i++) {
          const e = candidates[Math.floor(Math.random() * candidates.length)];
          if (!e.alive) continue;
          const ar = s.area * areaMult;
          for (const t of enemies.inRadius(e.x, e.z, ar).slice()) this._dmg(enemies, t, s.damage * might, { x: t.x - e.x, z: t.z - e.z }, onKill, 'meteor');
          if (this.fx) this.fx.explosion(e.x, e.z, ar, 0xff8a30);
          // Kataklysmus: Schockwelle — weiter Rückstoß + kurze Verlangsamung
          if (w.evolved) {
            for (const t of enemies.inRadius(e.x, e.z, ar * 1.8)) {
              this._dmg(enemies, t, s.damage * might * 0.25, { x: (t.x - e.x) * 5, z: (t.z - e.z) * 5 }, onKill, 'meteor', 0.9);
            }
            if (this.fx) this.fx.ring(e.x, e.z, ar * 1.8, 0xffc46a);
          }
        }
      }
    }

    // ---- Weihrauch-Aura (persistenter Ring) ----
    if (this.has('holy')) {
      const s = WEAPON_DEFS.holy.stats(this.level('holy'));
      const r = s.radius * areaMult * (this.owned.holy.evolved ? 1.5 : 1);
      this.holyRing.visible = true;
      this.holyRing.position.set(player.position.x, player.position.y + 0.12, player.position.z);
      this.holyRing.scale.setScalar(r);
      this.holyRing.material.opacity = 0.14 + 0.06 * (0.5 + 0.5 * Math.sin(this.elapsed * 5));
      if (this._holyBaseCol == null) this._holyBaseCol = this.holyRing.material.color.getHex();
      const hw = this.owned.holy;
      this.holyRing.material.color.setHex(hw.evolved ? (hw.evoName === 'Göttlicher Zorn' ? 0xfff0b0 : 0xffdf90) : this._holyBaseCol);
    }

    // ---- Giftwolken (Schaden über Zeit) ----
    for (const c of this.clouds) {
      if (!c.alive) continue;
      c.life -= dt;
      c.tick -= dt;
      const k = Math.max(0, c.life / c.maxLife);
      if (c.vx || c.vz) { // Pestwind: Drift
        c.x += c.vx * dt;
        c.z += c.vz * dt;
      }
      c.mesh.position.set(c.x, this._cloudY(c) + Math.sin(this.elapsed * 2 + c.x) * 0.1, c.z);
      c.mesh.scale.setScalar(c.r * (0.7 + 0.3 * k));
      if (c.evo && !this._cloudMatEvo) {
        this._cloudMatEvo = this._cloudMat.clone();
        this._cloudMatEvo.color.setHex(0xa8e04a);
      }
      c.mesh.material = c.evo ? this._cloudMatEvo : this._cloudMat;
      if (c.tick <= 0) {
        c.tick = 0.5;
        for (const e of enemies.inRadius(c.x, c.z, c.r)) this._dmg(enemies, e, c.dmg, null, onKill, 'poison', c.slow || undefined);
      }
      if (c.life <= 0) {
        c.alive = false;
        c.mesh.visible = false;
      }
    }

    // ---- Heilfelder (Quell des Lebens) ----
    if (this.healZones && this.healZones.length) {
      for (const z of this.healZones) {
        z.t -= dt;
        z.tick -= dt;
        if (z.tick <= 0) {
          z.tick = 0.5;
          if (this.fx) this.fx.ring(z.x, z.z, z.r, 0x7ce68a);
          const targets = [player];
          if (this.ally) { const al = this.ally(); if (al && !al.dead) targets.push(al); }
          for (const t of targets) {
            if (Math.hypot(t.position.x - z.x, t.position.z - z.z) <= z.r && t.hp < t.maxHp) t.heal(2);
          }
        }
      }
      this.healZones = this.healZones.filter((z) => z.t > 0);
    }

    // ---- Persistenter Klingenwirbel (dauerhaft sichtbar) ----
    if (this.has('whirl')) {
      const s = WEAPON_DEFS.whirl.stats(this.level('whirl'));
      const r = s.radius * areaMult;
      this._whirlSpin += dt * (6 + this.level('whirl') * 0.5);
      const py = player.position.y;
      for (const o of this.whirlBlades) {
        const a = this._whirlSpin + o.off;
        o.mesh.position.set(
          player.position.x + Math.cos(a) * r,
          py + 0.95 + Math.sin(this._whirlSpin * 2 + o.off) * 0.12,
          player.position.z + Math.sin(a) * r
        );
        // flach liegend, in Drehrichtung (tangential) zeigend
        o.mesh.rotation.set(Math.PI / 2, -a, 0);
      }
    }

    // ---- Orbit-Geister ----
    if (this.has('orbit')) {
      const s = WEAPON_DEFS.orbit.stats(this.level('orbit'));
      const r = s.radius * areaMult;
      const dmg = s.damage * might;
      for (const o of this.orbs) {
        o.phase += dt * s.speed;
        const ox = player.position.x + Math.cos(o.phase) * r;
        const oz = player.position.z + Math.sin(o.phase) * r;
        o.mesh.position.set(ox, player.position.y + 1.1, oz);
        for (const e of enemies.inRadius(ox, oz, 0.6 + e_r0)) {
          const last = e._orbHit || 0;
          if (this.elapsed - last > 0.35) {
            e._orbHit = this.elapsed;
            this._dmg(enemies, e, dmg, { x: (e.x - ox) * 3, z: (e.z - oz) * 3 }, onKill, 'orbit');
            const evoOrbit = this.owned.orbit && this.owned.orbit.evolved;
            if (evoOrbit) player.heal(1); // Seelenwacht: jeder Geister-Treffer heilt
            if (this.fx) this.fx.sparksBurst(e.x, 1.0, e.z, evoOrbit ? 0x8ff0a0 : 0x9fd8ff, 3, 4);
          }
        }
      }
    }

    // ---- Projektile ----
    for (const p of this.projectiles) {
      if (!p.alive) continue;

      // Boomerang: nach outTime umkehren und zum Besitzer zurücklenken
      if (p.boomerang) {
        p.btime += dt;
        if (p.phase === 'out' && p.btime > p.outTime) {
          p.phase = 'back';
          p.hit.clear(); // auf dem Rückweg dürfen Feinde erneut getroffen werden
        }
        if (p.phase === 'back' && p.owner) {
          const dx = p.owner.position.x - p.x;
          const dz = p.owner.position.z - p.z;
          const d = Math.hypot(dx, dz) || 1;
          p.vx = (dx / d) * p.speed;
          p.vz = (dz / d) * p.speed;
          if (d < 1.3) {
            this._killProj(p);
            continue;
          }
        }
      }

      p.x += p.vx * dt;
      p.z += p.vz * dt;
      p.life -= dt;
      p.mesh.position.set(p.x, 1.1, p.z);
      p.mesh.rotation.y += dt * 18;
      p.mesh.rotation.x += dt * 12;
      // Seuchenhagel: Gift-Spur entlang der Flugbahn
      if (p.plague) {
        p._pl = (p._pl || 0) + dt;
        if (p._pl > 0.3) {
          p._pl = 0;
          const gy = this.fx && this.fx.heightAt ? this.fx.heightAt(p.x, p.z) : 0;
          const tc = this._spawnCloud(p.x, p.z, 1.1, p.dmg * 0.12, 1.3, gy);
          if (tc) tc.evo = true;
        }
      }
      // Partikel-Schweife
      if (this.fx) {
        p._tr = (p._tr || 0) + dt;
        if (p._tr > 0.04) {
          p._tr = 0;
          if (p.kind === 'fire') this.fx.sparksBurst(p.x, 1.1, p.z, p.trailCol || 0xff8a2a, 2, 1.5);
          else if (p.kind === 'spear') this.fx.sparksBurst(p.x, 1.1, p.z, p.trailCol || 0xcfe0ff, 1, 1.2);
          else if (p.kind === 'axe') this.fx.sparksBurst(p.x, 1.1, p.z, p.trailCol || 0xbfc8d8, 1, 1.0);
        }
      }

      // Grenze / Lebensende
      if (p.life <= 0) {
        if (p.kind === 'fire') this._explode(p, enemies, onKill);
        this._killProj(p);
        continue;
      }
      const targets = enemies.inRadius(p.x, p.z, p.radius);
      for (const e of targets) {
        if (p.hit.has(e)) continue;
        if (p.kind === 'fire') {
          this._explode(p, enemies, onKill);
          this._killProj(p);
          break;
        } else {
          p.hit.add(e);
          let hitDmg = p.dmg;
          // Urteil des Henkers: Exekution — angeschlagene Nicht-Bosse sterben sofort
          if (p.execute && !e.def.boss && e.hp / e.maxHp < p.execute) {
            hitDmg = e.hp + (e.shield || 0) + 999;
            if (this.fx) this.fx.slash(e.x, e.z, 1.6, 0, 0xffd24a);
          }
          this._dmg(enemies, e, hitDmg, { x: p.vx * 0.3, z: p.vz * 0.3 }, onKill, p.wid || 'axe', p.slowHit || undefined);
          if (this.fx) this.fx.sparksBurst(e.x, 1.1, e.z, 0xffe0a0, 5, 5);
          p.pierce--;
          if (p.pierce < 0) {
            this._killProj(p);
            break;
          }
        }
      }
    }

  }

  _explode(p, enemies, onKill) {
    const r = p.explodeR || 1.5;
    if (this.fx) this.fx.explosion(p.x, p.z, r, p.storm ? 0xff5a18 : 0xffa030);
    for (const e of enemies.inRadius(p.x, p.z, r)) {
      this._dmg(enemies, e, p.dmg, { x: (e.x - p.x) * 2, z: (e.z - p.z) * 2 }, onKill, 'fireball');
    }
    // Höllensturm: Blitz schlägt in den Krater ein (+50% Blitzschaden, etwas größerer Radius)
    if (p.storm) {
      if (this.fx) this.fx.bolt(p.x, p.z, 0xcfe6ff);
      for (const e of enemies.inRadius(p.x, p.z, r * 1.25)) {
        this._dmg(enemies, e, p.dmg * 0.5, null, onKill, 'fireball');
      }
    }
  }

  _killProj(p) {
    p.alive = false;
    p.mesh.visible = false;
  }
}

// kleine Helfer (Radius-Toleranz für Orbit-Berührung)
const e_r0 = 0.4;
