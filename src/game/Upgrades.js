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
  { id: 'amount', name: 'Vielzahl', sub: '+1 Projektil', rare: true, apply: (p) => (p.amount += 1) },
];

const WEAPON_ICON = { whirl: '🌀', axe: '🪓', fireball: '🔥', orbit: '✦', lightning: '⚡', frost: '❄️', spear: '🦴', poison: '☠️', holy: '✝️' };
const PASSIVE_ICON = { might: '💪', speed: '👟', hp: '❤', armor: '🛡', cd: '⏱', area: '💥', pickup: '🧲', regen: '✚', proj: '➹', amount: '✛' };

// für HUD-Tooltips
export const PASSIVE_INFO = Object.fromEntries(PASSIVES.map((p) => [p.id, { name: p.name, sub: p.sub, icon: PASSIVE_ICON[p.id] || '◆' }]));

export class Upgrades {
  constructor(el, toast) {
    this.el = el;
    this.toast = toast;
  }

  // Kandidaten für ein bestimmtes Spieler/Waffen-Paar erzeugen (mit apply-Closures).
  generate(player, weapons, n = 3) {
    const out = [];
    // Hinweis: Verschmelzungen laufen über das separate Kombinations-Popup (Game).
    // Waffen aufwerten
    for (const w of weapons.ownedList()) {
      if (weapons.isMax(w.id)) continue;
      const def = WEAPON_DEFS[w.id];
      out.push({ weight: 5, icon: WEAPON_ICON[w.id], title: `${def.name} → Stufe ${w.level + 1}`, sub: def.desc, apply: () => weapons.add(w.id) });
    }
    // neue Waffen — Kombinieren entfernt eine Waffe, also wieder Platz
    if (weapons.ownedList().length < MAX_WEAPONS) {
      for (const id of Object.keys(WEAPON_DEFS)) {
        if (weapons.has(id)) continue;
        const def = WEAPON_DEFS[id];
        out.push({ weight: 4, icon: WEAPON_ICON[id], title: `Neue Waffe: ${def.name}`, sub: def.desc, apply: () => weapons.add(id) });
      }
    }
    // Passive
    for (const pa of PASSIVES) {
      out.push({
        weight: pa.rare ? 1 : 3,
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

  // Anzeige-Liste rendern; onPick(index) beim Klick. rerolls/onReroll optional.
  present(displayList, onPick, level, subtitle, rerolls = 0, onReroll = null) {
    let html = `<div class="lvl-inner">
      <h2>${level ? 'STUFE ' + level : 'STUFENAUFSTIEG'}</h2>
      <p class="lvl-sub">${subtitle || 'Wähle eine Belohnung'}</p>
      <div class="lvl-choices">`;
    displayList.forEach((c, i) => {
      html += `<button class="lvl-choice" data-i="${i}">
        <div class="lc-icon">${c.icon || '◆'}</div>
        <div class="lc-text"><div class="lc-title">${c.title}</div><div class="lc-sub">${c.sub}</div></div>
      </button>`;
    });
    html += `</div>`;
    if (onReroll) {
      html += `<button id="lvl-reroll" class="secondary" ${rerolls > 0 ? '' : 'disabled'}>🎲 Neu würfeln (${rerolls})</button>`;
    }
    html += `</div>`;
    this.el.innerHTML = html;
    this.el.classList.remove('hidden');
    this.el.querySelectorAll('.lvl-choice').forEach((btn) => {
      btn.addEventListener('click', () => onPick(parseInt(btn.getAttribute('data-i'), 10)));
    });
    const rb = this.el.querySelector('#lvl-reroll');
    if (rb && onReroll) rb.addEventListener('click', () => onReroll());
  }

  // Mögliche Waffen-Kombinationen (declined = überspringen, Key = base+consume).
  availableCombos(player, weapons, declined) {
    const out = [];
    for (const c of COMBINATIONS) {
      const key = c.base + '+' + c.consume;
      if (declined && declined.has(key)) continue;
      if (weapons.canCombine(c)) out.push({ key, base: c.base, consume: c.consume, name: c.name, desc: c.desc });
    }
    return out;
  }

  // "🌀 Klingenwirbel + 🪓 Wurfaxt → ✨ Klingensturm"
  _comboLine(c) {
    const wi = (id) => `${WEAPON_ICON[id] || '◆'} ${(WEAPON_DEFS[id] && WEAPON_DEFS[id].name) || id}`;
    return `<span class="combo-src">${wi(c.base)}</span> <span class="combo-plus">+</span> <span class="combo-src">${wi(c.consume)}</span> <span class="combo-arrow">→</span> <span class="combo-res">✨ ${c.name}</span>`;
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
