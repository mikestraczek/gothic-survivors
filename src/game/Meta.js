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

export class Meta {
  constructor(el, toast) {
    this.el = el;
    this.toast = toast;
    this.data = this._load();
  }

  _load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) {
      /* ignore */
    }
    return { gold: 0, upgrades: {} };
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
