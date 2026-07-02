// Permanente Meta-Progression (Roguelite) — gespeichert in localStorage.
// Währung = magisches Erz, gesammelt über alle Runs.
const KEY = 'gothicSurvivorsMeta_v1';

const META = [
  { id: 'hp', name: 'Zähigkeit', sub: '+20 Start-Leben/Stufe', max: 5, cost: (l) => 40 + l * 45, apply: (p, l) => (p.maxHp += 20 * l) },
  { id: 'spd', name: 'Schnelligkeit', sub: '+4% Tempo/Stufe', max: 5, cost: (l) => 50 + l * 50, apply: (p, l) => (p.moveSpeed *= 1 + 0.04 * l) },
  { id: 'might', name: 'Macht', sub: '+6% Schaden/Stufe', max: 5, cost: (l) => 60 + l * 55, apply: (p, l) => (p.might += 0.06 * l) },
  { id: 'armor', name: 'Panzerung', sub: '+1 Rüstung/Stufe', max: 5, cost: (l) => 50 + l * 50, apply: (p, l) => (p.armor += l) },
  { id: 'cd', name: 'Hast', sub: '-3% Abklingzeit/Stufe', max: 4, cost: (l) => 70 + l * 65, apply: (p, l) => (p.cooldownMult = Math.max(0.5, p.cooldownMult - 0.03 * l)) },
  { id: 'pickup', name: 'Magnetismus', sub: '+0,5 Aufnahmeradius/Stufe', max: 4, cost: (l) => 40 + l * 40, apply: (p, l) => (p.pickupRadius += 0.5 * l) },
  { id: 'regen', name: 'Lebenskraft', sub: '+0,3 Regen/s/Stufe', max: 4, cost: (l) => 60 + l * 55, apply: (p, l) => (p.hpRegen += 0.3 * l) },
  { id: 'greed', name: 'Gier', sub: '+10% Erz/Stufe', max: 3, cost: (l) => 80 + l * 75, apply: (p, l) => (p.goldMult = (p.goldMult || 1) + 0.1 * l) },
  { id: 'reroll', name: 'Würfelglück', sub: '+1 Neuwurf je Run/Stufe', max: 3, cost: (l) => 90 + l * 80, apply: (p, l) => (p.rerolls = (p.rerolls || 0) + l) },
];

// ---- Achievements: schalten Helden, Waffen und Karten frei ----
// check(stats) prüft gegen die kumulierten Statistiken (über alle Runs).
export const ACHIEVEMENTS = [
  { id: 'first_win', name: 'Bezwinger des Tals', desc: 'Schließe ein Level ab', unlock: 'Karte: Sumpf der Bruderschaft', check: (s) => s.wins >= 1 },
  { id: 'kills_500', name: 'Schlächter', desc: 'Erlege insgesamt 500 Gegner', unlock: 'Heldin: Die Jägerin', check: (s) => s.totalKills >= 500 },
  { id: 'survive_10', name: 'Unbeugsam', desc: 'Überlebe 10 Minuten in einem Run', unlock: 'Held: Der Templer', check: (s) => s.bestTime >= 600 },
  { id: 'level_20', name: 'Aufgestiegen', desc: 'Erreiche Stufe 20 in einem Run', unlock: 'Held: Der Schatten', check: (s) => s.bestLevel >= 20 },
  { id: 'evolve', name: 'Verschmelzer', desc: 'Führe eine Waffen-Verschmelzung durch', unlock: 'Waffe: Meteor', check: (s) => s.evolves >= 1 },
  { id: 'boss_10', name: 'Anführer-Schreck', desc: 'Besiege 10 Bosse oder Anführer', unlock: 'Waffe: Giftwolke', check: (s) => s.bossKills >= 10 },
  { id: 'gold_1000', name: 'Erzbaron', desc: 'Sammle insgesamt 1000 Erz', unlock: 'Waffe: Wächtergeister', check: (s) => s.totalGold >= 1000 },
];

// Was hängt an welchem Achievement?
const HERO_REQ = { hunter: 'kills_500', templar: 'survive_10', shadow: 'level_20' };
const WEAPON_REQ = { meteor: 'evolve', poison: 'boss_10', orbit: 'gold_1000' };
const MAP_REQ = { swamp: 'first_win' };

const EMPTY_STATS = { wins: 0, totalKills: 0, bestTime: 0, bestLevel: 0, evolves: 0, bossKills: 0, totalGold: 0 };

export class Meta {
  constructor(el, toast) {
    this.el = el;
    this.toast = toast;
    this.data = this._load();
  }

  _load() {
    let data = null;
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) data = JSON.parse(raw);
    } catch (e) {
      /* ignore */
    }
    if (!data) data = { gold: 0, upgrades: {} };
    if (!data.stats) {
      // Migration für Bestandsspieler: Statistiken aus der lokalen Bestenliste ableiten,
      // damit bereits Erspieltes (Siege, Kills) nicht verloren geht.
      data.stats = { ...EMPTY_STATS };
      try {
        const scores = JSON.parse(localStorage.getItem('gothicScores') || '[]');
        for (const s of scores) {
          if (s.win) data.stats.wins++;
          data.stats.totalKills += s.kills || 0;
          data.stats.bestTime = Math.max(data.stats.bestTime, s.time || 0);
          data.stats.bestLevel = Math.max(data.stats.bestLevel, s.level || 0);
          data.stats.totalGold += s.gold || 0;
        }
      } catch (e) { /* ignore */ }
    }
    if (!data.achievements) data.achievements = {};
    return data;
  }
  _save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.data));
    } catch (e) {
      /* ignore */
    }
  }

  get gold() {
    return Math.floor(this.data.gold);
  }
  addGold(n) {
    this.data.gold += n;
    this._save();
  }
  level(id) {
    return this.data.upgrades[id] || 0;
  }

  applyToPlayer(player) {
    for (const u of META) {
      const l = this.level(u.id);
      if (l > 0) u.apply(player, l);
    }
    player.hp = player.maxHp;
  }

  // ---- Achievements & Unlocks ----
  hasAchievement(id) {
    return !!this.data.achievements[id];
  }
  heroUnlocked(key) {
    const req = HERO_REQ[key];
    return !req || this.hasAchievement(req);
  }
  mapUnlocked(key) {
    const req = MAP_REQ[key];
    return !req || this.hasAchievement(req);
  }
  heroReq(key) {
    const a = ACHIEVEMENTS.find((x) => x.id === HERO_REQ[key]);
    return a ? a.desc : '';
  }
  mapReq(key) {
    const a = ACHIEVEMENTS.find((x) => x.id === MAP_REQ[key]);
    return a ? a.desc : '';
  }
  // Waffen, die noch NICHT freigeschaltet sind (für den Level-Up-Pool)
  lockedWeaponSet() {
    const out = new Set();
    for (const [wid, req] of Object.entries(WEAPON_REQ)) {
      if (!this.hasAchievement(req)) out.add(wid);
    }
    return out;
  }

  // Run-Ergebnis in die kumulierten Statistiken einrechnen und neue Achievements prüfen.
  // Gibt die Liste frisch freigeschalteter Achievements zurück (für Toasts).
  recordRun({ time = 0, kills = 0, level = 0, win = false, bossKills = 0, evolves = 0, goldEarned = 0 }) {
    const s = this.data.stats;
    if (win) s.wins++;
    s.totalKills += kills;
    s.bestTime = Math.max(s.bestTime, Math.round(time));
    s.bestLevel = Math.max(s.bestLevel, level);
    s.bossKills += bossKills;
    s.evolves += evolves;
    s.totalGold += Math.max(0, Math.round(goldEarned));
    const fresh = [];
    for (const a of ACHIEVEMENTS) {
      if (!this.data.achievements[a.id] && a.check(s)) {
        this.data.achievements[a.id] = true;
        fresh.push(a);
      }
    }
    this._save();
    return fresh;
  }

  // Achievement-Liste als HTML (für den Erfolge-Screen)
  achievementsHtml() {
    return ACHIEVEMENTS.map((a) => {
      const done = this.hasAchievement(a.id);
      return `<div class="ach-item ${done ? 'done' : ''}">
        <div class="ach-icon">${done ? '🏆' : '🔒'}</div>
        <div class="ach-text">
          <div class="ach-name">${a.name}</div>
          <div class="ach-desc">${a.desc}</div>
          <div class="ach-unlock">${done ? 'Freigeschaltet' : 'Schaltet frei'}: ${a.unlock}</div>
        </div>
      </div>`;
    }).join('');
  }

  buy(id) {
    const u = META.find((m) => m.id === id);
    if (!u) return;
    const l = this.level(id);
    if (l >= u.max) return;
    const cost = u.cost(l);
    if (this.data.gold < cost) {
      this.toast('Nicht genug Erz', 'blood');
      return;
    }
    this.data.gold -= cost;
    this.data.upgrades[id] = l + 1;
    this._save();
    this.toast(`${u.name} Stufe ${l + 1}`, 'gold');
    this.render();
  }

  render() {
    let html = `<div class="shop-inner">
      <h2>Halle der Erzbarone</h2>
      <p class="shop-sub">Permanente Verbesserungen · Erz bleibt über alle Runs erhalten</p>
      <div class="shop-gold">⛏ ${this.gold} Erz</div>
      <div class="shop-grid">`;
    for (const u of META) {
      const l = this.level(u.id);
      const maxed = l >= u.max;
      const cost = maxed ? 0 : u.cost(l);
      const afford = this.data.gold >= cost;
      html += `<div class="shop-item">
        <div class="si-head"><span class="si-name">${u.name}</span><span class="si-lv">${l}/${u.max}</span></div>
        <div class="si-sub">${u.sub}</div>
        <button class="si-buy" data-id="${u.id}" ${maxed || !afford ? 'disabled' : ''}>
          ${maxed ? 'MAX' : '⛏ ' + cost}
        </button>
      </div>`;
    }
    html += `</div>
      <button id="shop-close" class="shop-close-btn">Zurück</button>
    </div>`;
    this.el.innerHTML = html;

    this.el.querySelectorAll('.si-buy').forEach((btn) => {
      btn.addEventListener('click', () => this.buy(btn.getAttribute('data-id')));
    });
    const closeBtn = this.el.querySelector('#shop-close');
    if (closeBtn) closeBtn.addEventListener('click', () => this.hide());
  }

  show() {
    this.render();
    this.el.classList.remove('hidden');
  }
  hide() {
    this.el.classList.add('hidden');
    if (this.onClose) this.onClose();
  }
}
