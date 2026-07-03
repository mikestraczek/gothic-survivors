import { WEAPON_DEFS, COMBINATIONS, COMBO_ICONS } from './Weapons.js';

const MAX_WEAPONS = 4;

// Passive: Basiswert × Raritäts-Faktor (beim Generieren ausgewürfelt) — höhere Seltenheit = bessere Werte.
// sub(f) baut den Kartentext mit den echten Zahlen; apply(p, f) wendet den skalierten Wert an.
const pct = (v) => `${Math.round(v * 100)}%`;
const PASSIVES = [
  { id: 'might', name: 'Stärke', sub: (f) => `+${pct(0.12 * f)} Schaden`, apply: (p, f) => (p.might += 0.12 * f) },
  { id: 'speed', name: 'Flinkheit', sub: (f) => `+${pct(0.07 * f)} Tempo`, apply: (p, f) => (p.moveSpeed *= 1 + 0.07 * f) },
  { id: 'hp', name: 'Vitalität', sub: (f) => `+${Math.round(20 * f)} max. Leben`, apply: (p, f) => { p.maxHp += Math.round(20 * f); p.heal(Math.round(20 * f)); } },
  { id: 'armor', name: 'Panzerung', sub: (f) => `+${Math.round(1.6 * f)} Rüstung`, apply: (p, f) => (p.armor += Math.round(1.6 * f)) },
  { id: 'cd', name: 'Hast', sub: (f) => `-${pct(0.065 * f)} Abklingzeit`, apply: (p, f) => (p.cooldownMult = Math.max(0.4, p.cooldownMult - 0.065 * f)) },
  { id: 'area', name: 'Wucht', sub: (f) => `+${pct(0.1 * f)} Wirkungsbereich`, apply: (p, f) => (p.area += 0.1 * f) },
  { id: 'pickup', name: 'Gier', sub: (f) => `+${(0.9 * f).toFixed(1).replace('.', ',')} Aufnahmeradius`, apply: (p, f) => (p.pickupRadius += 0.9 * f) },
  { id: 'regen', name: 'Regeneration', sub: (f) => `+${(0.5 * f).toFixed(1).replace('.', ',')} Leben/s`, apply: (p, f) => (p.hpRegen += 0.5 * f) },
  { id: 'proj', name: 'Geschwindigkeit', sub: (f) => `+${pct(0.12 * f)} Projektiltempo`, apply: (p, f) => (p.projSpeedMult += 0.12 * f) },
  { id: 'dash', name: 'Windschritt', sub: (f) => `−${pct(0.12 * f)} Ausweich-Cooldown, +Ladung (Stufe 1 & 3)`, apply: (p, f) => {
      p.dodgeRecharge = Math.max(1.6, p.dodgeRecharge * (1 - 0.12 * f));
      const taken = p.passiveCounts['dash'] || 0; // Anzahl VOR diesem Pick
      if (taken === 0 || taken === 2) { p.dodgeMax += 1; p.dodgeCharges += 1; }
    } },
  { id: 'amount', name: 'Vielzahl', sub: () => '+1 Projektil', rare: true, apply: (p) => (p.amount += 1) },
];

// Raritäts-Roll für Passive: 62% gewöhnlich, 28% selten (×1,35), 10% rar (×1,8)
function rollRarity() {
  const r = Math.random();
  if (r < 0.62) return { rarity: 'common', f: 1 };
  if (r < 0.9) return { rarity: 'uncommon', f: 1.35 };
  return { rarity: 'rare', f: 1.8 };
}

const WEAPON_ICON = { heal: '💚', whirl: '🌀', axe: '🪓', fireball: '🔥', orbit: '✦', lightning: '⚡', frost: '❄️', spear: '🦴', poison: '☠️', holy: '✝️', daggers: '🗡️', meteor: '☄️' };
const PASSIVE_ICON = { might: '💪', speed: '👟', hp: '❤', armor: '🛡', cd: '⏱', area: '💥', pickup: '🧲', regen: '✚', proj: '➹', dash: '💨', amount: '✛' };

// für HUD-Tooltips
export const PASSIVE_INFO = Object.fromEntries(PASSIVES.map((p) => [p.id, { name: p.name, sub: p.sub(1), icon: PASSIVE_ICON[p.id] || '◆' }]));

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
    // Hinweis auf Karten: „diese Wahl führt zu einer Kombination mit deinem Bestand"
    const hintFor = (wid) => {
      const hints = [];
      for (const c of COMBINATIONS) {
        if (c.base === wid && !(weapons.owned[wid] && weapons.owned[wid].evolved)) {
          if (c.consume && weapons.has(c.consume)) hints.push(`🔗 ${COMBO_ICONS[c.name] || '✨'} <b>${c.name}</b> — mit ${WEAPON_DEFS[c.consume].name}`);
          else if (c.passive && (player.passiveCounts[c.passive] || 0) > 0) hints.push(`🔗 ${COMBO_ICONS[c.name] || '✨'} <b>${c.name}</b> — mit ${(PASSIVE_INFO[c.passive] && PASSIVE_INFO[c.passive].name) || c.passive} (3×)`);
        } else if (c.consume === wid && weapons.has(c.base) && !(weapons.owned[c.base] && weapons.owned[c.base].evolved)) {
          hints.push(`🔗 ${COMBO_ICONS[c.name] || '✨'} <b>${c.name}</b> — mit ${WEAPON_DEFS[c.base].name}`);
        }
      }
      return hints.length ? `<div class="lc-hint">${hints.join('<br>')}</div>` : '';
    };
    // Hinweis: Verschmelzungen laufen über das separate Kombinations-Popup (Game).
    // Waffen aufwerten
    for (const w of weapons.ownedList()) {
      if (weapons.isMax(w.id)) continue;
      if (banned.has('up:' + w.id)) continue;
      const def = WEAPON_DEFS[w.id];
      const toMax = w.level + 1 >= (def.maxLevel || 10);
      out.push({
        weight: 5, bid: 'up:' + w.id, rarity: toMax ? 'rare' : 'uncommon',
        icon: WEAPON_ICON[w.id], title: `${def.name} → Stufe ${w.level + 1}`, sub: def.desc + hintFor(w.id),
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
          icon: WEAPON_ICON[id], title: `Neue Waffe: ${def.name}`, sub: def.desc + hintFor(id),
          apply: () => weapons.add(id),
        });
      }
    }
    // Passive — Rarität wird gewürfelt und skaliert den Wert
    for (const pa of PASSIVES) {
      if (banned.has('pa:' + pa.id)) continue;
      const roll = pa.rare ? { rarity: 'rare', f: 1 } : rollRarity();
      out.push({
        weight: pa.rare ? 1 : 3, bid: 'pa:' + pa.id, rarity: roll.rarity,
        icon: PASSIVE_ICON[pa.id] || '◆',
        title: pa.name,
        sub: pa.sub(roll.f) + COMBINATIONS.filter((c) => c.passive === pa.id && weapons.has(c.base) && !(weapons.owned[c.base] && weapons.owned[c.base].evolved)).map((c) => `<div class="lc-hint">🔗 ${COMBO_ICONS[c.name] || '✨'} <b>${c.name}</b> — mit ${WEAPON_DEFS[c.base].name} (3× nötig)</div>`).join(''),
        apply: () => {
          pa.apply(player, roll.f);
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
        <span class="lc-key">${i + 1}</span>
        <div class="lc-icon">${c.icon || '◆'}</div>
        <div class="lc-text"><div class="lc-title">${c.title}</div><div class="lc-sub">${c.sub}</div><div class="lc-rar">${RARITY_LABEL[rar] || ''}</div></div>
      </button>`;
    });
    html += `</div><div class="lvl-actions">`;
    if (onReroll) {
      html += `<button id="lvl-reroll" class="secondary" ${rerolls > 0 ? '' : 'disabled'}>🎲 Neu würfeln (R · ${rerolls})</button>`;
    }
    if (onBanish) {
      html += `<button id="lvl-banish" class="secondary" ${banishes > 0 ? '' : 'disabled'}>🚫 Verbannen (B · ${banishes})</button>`;
    }
    html += `<button id="lvl-combos" class="secondary">📖 Kombinationen (K)</button>`;
    html += `</div><div id="lvl-combo-list" class="hidden">${this.combosListHtml()}</div></div>`;
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
    const toggleBanish = () => {
      if (!onBanish || banishes <= 0) return;
      banishing = !banishing;
      this.el.querySelector('.lvl-inner').classList.toggle('banishing', banishing);
      if (bb) bb.classList.toggle('active', banishing);
      if (this.toast && banishing) this.toast('Verbannen: Karte anklicken — sie erscheint diesen Run nicht mehr', 'gold');
    };
    if (bb && onBanish) bb.addEventListener('click', toggleBanish);
    // Kombinations-Nachschlagewerk direkt im Level-Up (ohne die Auswahl zu verlieren)
    const cb = this.el.querySelector('#lvl-combos');
    const toggleCombos = () => this.el.querySelector('#lvl-combo-list').classList.toggle('hidden');
    if (cb) cb.addEventListener('click', toggleCombos);
    // Einhand-Bedienung: 1-3 wählen, R = Neu würfeln, B = Verbannen, K = Kombinationen
    this._removeKeys();
    this._keyHandler = (e) => {
      if (e.repeat) return;
      const n = { Digit1: 0, Digit2: 1, Digit3: 2, Numpad1: 0, Numpad2: 1, Numpad3: 2 }[e.code];
      if (n != null && n < displayList.length) {
        e.preventDefault();
        if (banishing) onBanish(n);
        else onPick(n);
      } else if (e.code === 'KeyR' && onReroll && rerolls > 0) onReroll();
      else if (e.code === 'KeyB') toggleBanish();
      else if (e.code === 'KeyK') toggleCombos();
    };
    window.addEventListener('keydown', this._keyHandler);
  }

  _removeKeys() {
    if (this._keyHandler) {
      window.removeEventListener('keydown', this._keyHandler);
      this._keyHandler = null;
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
    return `<span class="combo-src">${wi(c.base)}</span> <span class="combo-plus">+</span> <span class="combo-src">${second}</span> <span class="combo-arrow">→</span> <span class="combo-res">${COMBO_ICONS[c.name] || '✨'} ${c.name}</span>`;
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
          <div class="lc-icon">${COMBO_ICONS[combo.name] || '✨'}</div>
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
    this._removeKeys();
    this._keyHandler = (e) => {
      if (e.code === 'Enter' || e.code === 'Digit1' || e.code === 'Numpad1') onYes();
      else if (e.code === 'Escape' || e.code === 'Digit2' || e.code === 'Numpad2') onNo();
    };
    window.addEventListener('keydown', this._keyHandler);
  }

  close() {
    this._removeKeys();
    this.el.classList.add('hidden');
    this.el.innerHTML = '';
  }
}
