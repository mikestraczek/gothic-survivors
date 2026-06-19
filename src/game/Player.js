import * as THREE from 'three';

// Survivors-Held: echtes glTF-Modell (Soldier) mit Idle/Run-Animation,
// Top-Down-Bewegung und Roguelite-Stats. Angriffe laufen automatisch (Weapons.js).
export class Player {
  constructor(scene, world, hero) {
    this.world = world;
    this.scene = scene;

    this.position = new THREE.Vector3(0, world.getHeight(0, 50), 50);
    this.yaw = Math.PI;
    this.radius = 0.6;
    this.dead = false;

    // ---- Basis-Stats (werden von Meta-Upgrades beim Run-Start modifiziert) ----
    this.base = {
      maxHp: 100,
      moveSpeed: 6.5,
      might: 1.0,
      area: 1.0,
      cooldownMult: 1.0,
      projSpeedMult: 1.0,
      pickupRadius: 3.5,
      armor: 0,
      amount: 0,
      hpRegen: 0.4,
      goldMult: 1.0,
    };
    this.resetStats();

    // Fortschritt
    this.level = 1;
    this.xp = 0;
    this.xpToNext = 6;
    this.gold = 0;
    this.kills = 0;

    // Kampf-/Trefferzustand
    this.iframe = 0;
    this.hitFlash = 0;
    this.moving = false;
    this.passivesTaken = new Set(); // für Waffen-Verschmelzungen
    this.passiveCounts = {}; // id -> Anzahl (für HUD)

    // ---- glTF-Modell ----
    this.group = hero.group;
    this.mixer = hero.mixer;
    this.actions = hero.actions;
    this.modelYawOffset = Math.PI; // Soldier schaut standardmäßig nach +Z
    this.scene.add(this.group);
    this.group.position.copy(this.position);

    this._setupAnims();
  }

  get alive() {
    return !this.dead;
  }

  resetStats() {
    // aktuelle Werte = Basis (Meta-Boni werden separat aufaddiert)
    this.maxHp = this.base.maxHp;
    this.hp = this.base.maxHp;
    this.moveSpeed = this.base.moveSpeed;
    this.might = this.base.might;
    this.area = this.base.area;
    this.cooldownMult = this.base.cooldownMult;
    this.projSpeedMult = this.base.projSpeedMult;
    this.pickupRadius = this.base.pickupRadius;
    this.armor = this.base.armor;
    this.amount = this.base.amount;
    this.hpRegen = this.base.hpRegen;
    this.goldMult = this.base.goldMult;
  }

  beginRun() {
    this.dead = false;
    this.group.rotation.z = 0;
    this.position.set(0, this.world.getHeight(0, 50), 50);
    this.yaw = Math.PI;
    this.resetStats();
    this.level = 1;
    this.xp = 0;
    this.xpToNext = 6;
    this.gold = 0;
    this.kills = 0;
    this.iframe = 0;
    this.hitFlash = 0;
    this.passivesTaken.clear();
    this.passiveCounts = {};
    this.group.position.copy(this.position);
  }

  serialize() {
    return {
      level: this.level, xp: this.xp, xpToNext: this.xpToNext, gold: this.gold, kills: this.kills,
      maxHp: this.maxHp, hp: this.hp, moveSpeed: this.moveSpeed, might: this.might, area: this.area,
      cooldownMult: this.cooldownMult, projSpeedMult: this.projSpeedMult, pickupRadius: this.pickupRadius,
      armor: this.armor, amount: this.amount, hpRegen: this.hpRegen, goldMult: this.goldMult,
      passives: [...this.passivesTaken], passiveCounts: { ...this.passiveCounts },
    };
  }

  applySave(d) {
    this.dead = false;
    this.group.rotation.z = 0;
    this.level = d.level; this.xp = d.xp; this.xpToNext = d.xpToNext; this.gold = d.gold; this.kills = d.kills;
    this.maxHp = d.maxHp; this.hp = d.hp; this.moveSpeed = d.moveSpeed; this.might = d.might; this.area = d.area;
    this.cooldownMult = d.cooldownMult; this.projSpeedMult = d.projSpeedMult; this.pickupRadius = d.pickupRadius;
    this.armor = d.armor; this.amount = d.amount; this.hpRegen = d.hpRegen; this.goldMult = d.goldMult;
    this.passivesTaken = new Set(d.passives || []);
    this.passiveCounts = { ...(d.passiveCounts || {}) };
  }

  _setupAnims() {
    // Mögliche Clip-Namen je nach Modell tolerant behandeln
    const find = (...names) => names.map((n) => this.actions[n]).find(Boolean) || null;
    this.idleAction = find('Idle', 'idle');
    this.runAction = find('Run', 'Running', 'run');
    this.walkAction = find('Walk', 'walk');
    this.current = null;
    this._play(this.idleAction);
  }

  _play(action) {
    if (!action || action === this.current) return;
    action.reset().fadeIn(0.2).play();
    if (this.current) this.current.fadeOut(0.2);
    this.current = action;
  }

  takeDamage(amount) {
    if (this.dead || this.iframe > 0) return 0;
    const dmg = Math.max(1, Math.round(amount - this.armor));
    this.hp = Math.max(0, this.hp - dmg);
    this.iframe = 0.45;
    this.hitFlash = 0.2;
    if (this.hp <= 0) this.dead = true;
    return dmg;
  }

  heal(n) {
    this.hp = Math.min(this.maxHp, this.hp + n);
  }

  addGold(n) {
    this.gold += n;
  }

  // gibt die Anzahl der ausgelösten Level-Ups zurück
  addXp(n) {
    this.xp += n;
    let levels = 0;
    while (this.xp >= this.xpToNext) {
      this.xp -= this.xpToNext;
      this.level++;
      // flachere XP-Kurve -> mehr Level-Ups & Upgrades, Mid-Game bleibt machbar
      this.xpToNext = Math.round(4 + this.level * 2.5 + Math.pow(this.level, 1.35));
      levels++;
    }
    return levels;
  }

  update(dt, input) {
    if (this.mixer) this.mixer.update(dt);
    if (this.dead) {
      // umfallen
      this.group.rotation.z = Math.min(Math.PI / 2.2, this.group.rotation.z + dt * 3);
      return;
    }

    if (this.iframe > 0) this.iframe -= dt;
    if (this.hitFlash > 0) this.hitFlash -= dt;
    if (this.hp < this.maxHp) this.hp = Math.min(this.maxHp, this.hp + this.hpRegen * dt);

    // Welt-achsen-Bewegung (Top-Down): W = -Z (oben am Bildschirm)
    const ax = input.axis();
    this.moving = ax.x !== 0 || ax.z !== 0;
    if (this.moving) {
      let dx = ax.x;
      let dz = ax.z;
      const len = Math.hypot(dx, dz) || 1;
      dx /= len;
      dz /= len;
      this.position.x += dx * this.moveSpeed * dt;
      this.position.z += dz * this.moveSpeed * dt;
      this.yaw = Math.atan2(dx, dz);
    }

    // Gelände & Grenzen
    this.position.y = this.world.getHeight(this.position.x, this.position.z);
    this.world.resolve(this.position, this.radius);
    this.position.y = this.world.getHeight(this.position.x, this.position.z);

    // Modell aktualisieren
    this.group.position.copy(this.position);
    this.group.rotation.y = this.yaw + this.modelYawOffset;

    // Animation
    this._play(this.moving ? this.runAction || this.walkAction || this.idleAction : this.idleAction);
  }
}
