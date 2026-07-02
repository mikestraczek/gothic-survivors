import { WEAPON_DEFS, COMBINATIONS } from './Weapons.js';

const MAX_WEAPONS = 4;

const PASSIVES = [
  { id: 'might', name: 'Stärke', sub: '+15% Schaden', apply: (p) => (p.might += 0.15) },
  { id: 'speed', name: 'Flinkheit', sub: '+8% Tempo', apply: (p) => (p.moveSpeed *= 1.08) },
  { id: 'hp', name: 'Vitalität', sub: '+25 max. Leben', apply: (p) => { p.maxHp += 25; p.heal(25); } },
  { id: 'armor', name: 'Panzerung', sub: '+2 Rüstung', apply: (p) => (p.armor += 2) },
  { id: 'cd', name: 'Hast', sub: '-8% Abklingzeit', apply: (p) => (p.cooldownMult = Math.max(0.4, p.cooldownMult - 0.08)) },
  { id: 'area', name: 'Wucht', sub: '+12% Wirkungsbereich', apply: (p) => (p.area += 0.12) },
  { id: 'pickup', name: 'Gier', sub: '+1 Aufnahmeradius', apply: (p) => (p.pickupRadius += 1) },
  { id: 'regen', name: 'Regeneration', sub: '+0,6 Leben/s', apply: (p) => (p.hpRegen += 0.6) },
  { id: 'proj', name: 'Geschwindigkeit', sub: '+15% Projektiltempo', apply: (p) => (p.projSpeedMult += 0.15) },
  { id: 'dash', name: 'Windschritt', sub: '−15% Ausweich-Cooldown, +Ladung (Stufe 1 & 3)', apply: (p) => {
      p.dodgeRecharge = Math.max(1.6, p.dodgeRecharge * 0.85);
      const taken = p.passiveCounts['dash'] || 0; // Anzahl VOR diesem Pick
      if (taken === 0 || taken === 2) { p.dodgeMax += 1; p.dodgeCharges += 1; }
    } },
  { id: 'amount', name: 'Vielzahl', sub: '+1 Projektil', rare: true, apply: (p) => (p.amount += 1) },
];

const WEAPON_ICON = { whirl: '🌀', axe: '🪓', fireball: '🔥', orbit: '✦', lightning: '⚡', frost: '❄️', spear: '🦴', poison: '☠️', holy: '✝️', daggers: '🗡️', meteor: '☄️' };
const PASSIVE_ICON = { might: '💪', speed: '👟', hp: '❤', armor: '🛡', cd: '⏱', area: '💥', pickup: '🧲', regen: '✚', proj: '➹', dash: '💨', amount: '✛' };

// für HUD-Tooltips
export const PASSIVE_INFO = Object.fromEntries(PASSIVES.map((p) => [p.id, { name: p.name, sub: p.sub, icon: PASSIVE_ICON[p.id] || '◆' }]));

export class Upgrades {
  constructor(el, toast) {
    this.el = el;
    this.toast = toast;
  }

  // Kandidaten für ein bestimmtes Spieler/Waffen-Paar erzeugen (mit apply-Closures).
  // rarity steuert die Karten-Optik; bid ist der Verbannungs-Schlüssel (Banish).
  generate(player, weapons, n = 3) {
    const out = [];
    const banned = player.banished || new Set();
    // Hinweis: Verschmelzungen laufen über das separate Kombinations-Popup (Game).
    // Waffen aufwerten
    for (const w of weapons.ownedList()) {
      if (weapons.isMax(w.id)) continue;
      if (banned.has('up:' + w.id)) continue;
      const def = WEAPON_DEFS[w.id];
      const toMax = w.level + 1 >= (def.maxLevel || 5);
      out.push({
        weight: 5, bid: 'up:' + w.id, rarity: toMax ? 'rare' : 'uncommon',
        icon: WEAPON_ICON[w.id], title: `${def.name} → Stufe ${w.level + 1}`, sub: def.desc,
        apply: () => weapons.add(w.id),
      });
    }
    // neue Waffen — Kombinieren entfernt eine Waffe, also wieder Platz
    if (weapons.ownedList().length < MAX_WEAPONS) {
      for (const id of Object.keys(WEAPON_DEFS)) {
        if (weapons.has(id)) continue;
        if (banned.has('new:' + id)) continue;
        if (player.lockedWeapons && player.lockedWeapons.has(id)) continue; // noch nicht freigeschaltet
        const def = WEAPON_DEFS[id];
        out.push({
          weight: 4, bid: 'new:' + id, rarity: 'uncommon',
          icon: WEAPON_ICON[id], title: `Neue Waffe: ${def.name}`, sub: def.desc,
          apply: () => weapons.add(id),
        });
      }
    }
    // Passive
    for (const pa of PASSIVES) {
      if (banned.has('pa:' + pa.id)) continue;
      out.push({
        weight: pa.rare ? 1 : 3, bid: 'pa:' + pa.id, rarity: pa.rare ? 'rare' : 'common',
        icon: PASSIVE_ICON[pa.id] || '◆',
        title: pa.name,
        sub: pa.sub,
        apply: () => {
          pa.apply(player);
          player.passivesTaken.add(pa.id);
          player.passiveCounts[pa.id] = (player.passiveCounts[pa.id] || 0) + 1;
        },
      });
    }
    return this._pick(out, n);
  }

  _pick(pool, n) {
    const chosen = [];
    while (chosen.length < n && pool.length) {
      let total = 0;
      for (const c of pool) total += c.weight;
      let r = Math.random() * total;
      let i = 0;
      for (; i < pool.length; i++) {
        r -= pool[i].weight;
        if (r <= 0) break;
      }
      chosen.push(pool.splice(Math.min(i, pool.length - 1), 1)[0]);
    }
    return chosen;
  }

  // Anzeige-Liste rendern; onPick(index) beim Klick. rerolls/onReroll und banishes/onBanish optional.
  // Banish: Button togglet den Verbannen-Modus, dann entfernt ein Karten-Klick die Option dauerhaft (Run).
  present(displayList, onPick, level, subtitle, rerolls = 0, onReroll = null, banishes = 0, onBanish = null) {
    const RARITY_LABEL = { common: 'Gewöhnlich', uncommon: 'Selten', rare: 'Rar', epic: 'Episch' };
    let html = `<div class="lvl-inner">
      <h2>${level ? 'STUFE ' + level : 'STUFENAUFSTIEG'}</h2>
      <p class="lvl-sub">${subtitle || 'Wähle eine Belohnung'}</p>
      <div class="lvl-choices">`;
    displayList.forEach((c, i) => {
      const rar = c.rarity || 'common';
      html += `<button class="lvl-choice r-${rar}" data-i="${i}">
        <div class="lc-icon">${c.icon || '◆'}</div>
        <div class="lc-text"><div class="lc-title">${c.title}</div><div class="lc-sub">${c.sub}</div><div class="lc-rar">${RARITY_LABEL[rar] || ''}</div></div>
      </button>`;
    });
    html += `</div><div class="lvl-actions">`;
    if (onReroll) {
      html += `<button id="lvl-reroll" class="secondary" ${rerolls > 0 ? '' : 'disabled'}>🎲 Neu würfeln (${rerolls})</button>`;
    }
    if (onBanish) {
      html += `<button id="lvl-banish" class="secondary" ${banishes > 0 ? '' : 'disabled'}>🚫 Verbannen (${banishes})</button>`;
    }
    html += `</div></div>`;
    this.el.innerHTML = html;
    this.el.classList.remove('hidden');
    let banishing = false;
    this.el.querySelectorAll('.lvl-choice').forEach((btn) => {
      btn.addEventListener('click', () => {
        const i = parseInt(btn.getAttribute('data-i'), 10);
        if (banishing) onBanish(i);
        else onPick(i);
      });
    });
    const rb = this.el.querySelector('#lvl-reroll');
    if (rb && onReroll) rb.addEventListener('click', () => onReroll());
    const bb = this.el.querySelector('#lvl-banish');
    if (bb && onBanish) {
      bb.addEventListener('click', () => {
        banishing = !banishing;
        this.el.querySelector('.lvl-inner').classList.toggle('banishing', banishing);
        bb.classList.toggle('active', banishing);
        if (this.toast && banishing) this.toast('Verbannen: Karte anklicken — sie erscheint diesen Run nicht mehr', 'gold');
      });
    }
  }

  // Mögliche Kombinationen (declined = überspringen; Key = base+Zutat).
  availableCombos(player, weapons, declined) {
    const out = [];
    for (const c of COMBINATIONS) {
      const key = c.base + '+' + (c.consume || c.passive);
      if (declined && declined.has(key)) continue;
      if (weapons.canCombine(c, player)) out.push({ key, base: c.base, consume: c.consume, passive: c.passive, passiveCount: c.passiveCount, name: c.name, desc: c.desc });
    }
    return out;
  }

  // "🌀 Klingenwirbel + 🪓 Wurfaxt → ✨ Klingensturm" bzw. "🪓 Wurfaxt + 💪 3× Stärke → ✨ …"
  _comboLine(c) {
    const wi = (id) => `${WEAPON_ICON[id] || '◆'} ${(WEAPON_DEFS[id] && WEAPON_DEFS[id].name) || id}`;
    const second = c.consume
      ? wi(c.consume)
      : `${PASSIVE_ICON[c.passive] || '◆'} ${c.passiveCount || 3}× ${(PASSIVE_INFO[c.passive] && PASSIVE_INFO[c.passive].name) || c.passive}`;
    return `<span class="combo-src">${wi(c.base)}</span> <span class="combo-plus">+</span> <span class="combo-src">${second}</span> <span class="combo-arrow">→</span> <span class="combo-res">✨ ${c.name}</span>`;
  }

  // Liste aller möglichen Kombinationen (für das Hauptmenü)
  combosListHtml() {
    return COMBINATIONS.map((c) => `<div class="combo-list-item">${this._comboLine(c)}<div class="combo-list-desc">${c.desc}</div></div>`).join('');
  }

  // Kombinations-Popup (Ja/Nein) — nutzt dasselbe Overlay wie der Stufenaufstieg.
  presentCombo(combo, onYes, onNo) {
    this.el.innerHTML = `<div class="lvl-inner">
      <h2>✨ KOMBINATION MÖGLICH</h2>
      <p class="lvl-sub">Verschmilz zwei Waffen zu einer stärkeren — danach wird ein Waffenslot frei.</p>
      <div class="lvl-choices">
        <div class="lvl-choice combo-card">
          <div class="lc-icon">✨</div>
          <div class="lc-text"><div class="lc-title">${combo.name}</div><div class="lc-sub">${combo.desc}</div><div class="combo-merge">${this._comboLine(combo)}</div></div>
        </div>
      </div>
      <div class="combo-actions">
        <button id="combo-yes">Kombinieren</button>
        <button id="combo-no" class="secondary">Nicht jetzt</button>
      </div>
    </div>`;
    this.el.classList.remove('hidden');
    this.el.querySelector('#combo-yes').addEventListener('click', () => onYes());
    this.el.querySelector('#combo-no').addEventListener('click', () => onNo());
  }

  close() {
    this.el.classList.add('hidden');
    this.el.innerHTML = '';
  }
}
