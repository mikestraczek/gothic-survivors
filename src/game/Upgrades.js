import { WEAPON_DEFS, EVOLUTIONS } from './Weapons.js';

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

export class Upgrades {
  constructor(el, toast) {
    this.el = el;
    this.toast = toast;
  }

  // Kandidaten für ein bestimmtes Spieler/Waffen-Paar erzeugen (mit apply-Closures).
  generate(player, weapons, n = 3) {
    const out = [];
    // Verschmelzungen (höchste Priorität)
    for (const w of weapons.ownedList()) {
      if (weapons.canEvolve(w.id, player)) {
        const ev = EVOLUTIONS[w.id];
        out.push({ weight: 40, icon: '✨', title: `Verschmelzung: ${ev.name}`, sub: ev.desc, apply: () => weapons.evolve(w.id) });
      }
    }
    // Waffen aufwerten
    for (const w of weapons.ownedList()) {
      if (weapons.isMax(w.id)) continue;
      const def = WEAPON_DEFS[w.id];
      out.push({ weight: 5, icon: WEAPON_ICON[w.id], title: `${def.name} → Stufe ${w.level + 1}`, sub: def.desc, apply: () => weapons.add(w.id) });
    }
    // neue Waffen
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

  // Anzeige-Liste rendern; onPick(index) wird beim Klick aufgerufen (kein apply hier).
  present(displayList, onPick, level, subtitle) {
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
    html += `</div></div>`;
    this.el.innerHTML = html;
    this.el.classList.remove('hidden');
    this.el.querySelectorAll('.lvl-choice').forEach((btn) => {
      btn.addEventListener('click', () => onPick(parseInt(btn.getAttribute('data-i'), 10)));
    });
  }

  close() {
    this.el.classList.add('hidden');
    this.el.innerHTML = '';
  }
}
