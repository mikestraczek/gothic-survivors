import { WEAPON_DEFS } from './Weapons.js';
import { PICKUP_COLORS } from './PickupManager.js';
import { PASSIVE_INFO } from './Upgrades.js';

const WICON = { heal: '💚', whirl: '🌀', axe: '🪓', fireball: '🔥', orbit: '✦', lightning: '⚡', frost: '❄️', spear: '🦴', poison: '☠️', holy: '✝️', daggers: '🗡️', meteor: '☄️' };
const PICON = { might: '💪', speed: '👟', hp: '❤', armor: '🛡', cd: '⏱', area: '💥', pickup: '🧲', regen: '✚', proj: '➹', dash: '💨', amount: '✛' };

// kompakte Zahl (1234 -> 1,2k)
function fmt(n) {
  n = Math.round(n);
  if (n >= 1000000) return (n / 1000000).toFixed(1).replace('.', ',') + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1).replace('.', ',') + 'k';
  return '' + n;
}

export class HUD {
  constructor(el) {
    this.el = el;
    this.el.innerHTML = `
      <canvas id="hpbars"></canvas>
      <div id="xp-bar"><div id="xp-fill"></div><div id="xp-label"></div></div>
      <div id="top-center"><span id="timer">00:00</span><div id="phase-label"></div></div>
      <div id="wrath-meter" class="hidden"><span class="wrath-label">🔥 ZORN — töte Gegner!</span><div class="wrath-bar"><div class="wrath-fill"></div></div></div>
      <div id="top-right"><span id="kills">☠ 0</span> &nbsp; <span id="gold">⛏ 0</span> &nbsp; <span id="enemies"></span></div>
      <div id="boss-bar" class="hidden"><div id="boss-name"></div><div id="boss-hp"><div id="boss-hp-fill"></div></div></div>
      <div id="boss-banner" class="hidden"></div>
      <div id="bottom-left">
        <div id="buff-row" class="hidden"></div>
        <div id="weapon-row"></div>
        <div id="passive-row"></div>
        <div class="bar hp"><div class="bar-fill" id="hp-fill"></div><div class="bar-label" id="hp-label"></div></div>
        <div id="dodge-row" title="Ausweichen (Leertaste)"></div>
      </div>
      <div id="lowhp-vignette"></div>
      <div id="danger-overlay"></div>
      <div id="dps-panel"></div>
      <div id="hud-tooltip" class="hidden"></div>
      <div id="spectate-banner" class="hidden"></div>
      <div id="ally-panel" class="hidden"></div>
      <div id="revive-prompt" class="hidden"></div>
      <div id="mate-arrow" class="hidden"><span class="ma-icon">➤</span><span class="ma-dist"></span></div>
      <div id="peer-pause" class="hidden">⏸ Mitspieler ist im Menü — pausiert</div>
      <div id="root-prompt" class="hidden"><div class="root-txt">🌿 FESTGEWURZELT — Tasten hämmern!</div><div class="root-bar"><div class="root-fill"></div></div></div>
      <canvas id="minimap" width="170" height="170"></canvas>
      <div id="message-log"></div>
    `;
    this.$ = (id) => this.el.querySelector('#' + id);
    this.toasts = [];
    this._lastWeapons = '';
    this._lastPassives = '';
    this.mm = this.$('minimap').getContext('2d');
    this.hpCanvas = this.$('hpbars');
    this.hp = this.hpCanvas.getContext('2d');
    this._bannerUntil = 0;
    this._wireTooltips();
    this.resize(window.innerWidth, window.innerHeight);
  }

  // Tooltip beim Überfahren von Elementen mit data-tip (Waffen, Passive, DPS-Zeilen)
  _wireTooltips() {
    const tip = this.$('hud-tooltip');
    const hide = () => tip.classList.add('hidden');
    const onMove = (ev) => {
      const el = ev.target.closest('[data-tip]');
      if (!el) { hide(); return; }
      tip.innerHTML = el.getAttribute('data-tip');
      tip.classList.remove('hidden');
      const x = Math.min(ev.clientX + 14, window.innerWidth - tip.offsetWidth - 8);
      const y = Math.min(ev.clientY + 14, window.innerHeight - tip.offsetHeight - 8);
      tip.style.left = Math.max(8, x) + 'px';
      tip.style.top = Math.max(8, y) + 'px';
    };
    for (const id of ['weapon-row', 'passive-row', 'dps-panel', 'ally-panel', 'buff-row']) {
      const c = this.$(id);
      c.addEventListener('mousemove', onMove);
      c.addEventListener('mouseleave', hide);
    }
  }

  show() { this.el.classList.remove('hidden'); }
  hide() { this.el.classList.add('hidden'); }
  resize(w, h) {
    this.hpCanvas.width = w;
    this.hpCanvas.height = h;
  }

  setPhase(txt) {
    this.$('phase-label').textContent = txt || '';
  }

  // Map-weiter Boss-Angriff: ganzer Bildschirm pulsiert rot (sichere Zonen am Boden)
  setDanger(on) {
    this.$('danger-overlay').classList.toggle('on', !!on);
  }

  // Live-Schadensanzeige unten rechts: Waffe · Gesamtschaden · DPS
  setDps(entries) {
    const el = this.$('dps-panel');
    if (!entries || !entries.length) { el.innerHTML = ''; return; }
    let total = 0;
    for (const e of entries) total += e.total;
    let h = `<div class="dps-head"><span>Schaden</span><span>${fmt(total)}</span></div>`;
    for (const e of entries) {
      const def = WEAPON_DEFS[e.id] || {};
      const name = e.name || def.name || e.id;
      const icon = e.icon || WICON[e.id] || '◆';
      const tip = `<b>${name}</b><br>Gesamt: ${Math.round(e.total).toLocaleString('de-DE')}<br>DPS: ${Math.round(e.dps).toLocaleString('de-DE')}`;
      h += `<div class="dps-row" data-tip="${tip}"><span class="dps-ic">${icon}</span><span class="dps-name">${name}</span><span class="dps-tot">${fmt(e.total)}</span><span class="dps-val">${fmt(e.dps)}</span></div>`;
    }
    el.innerHTML = h;
  }

  // Dodge-Ladungen: gefüllte/leere Pips + Aufladebalken bei der nächsten Ladung
  setDodge(charges, max, frac) {
    let h = '<span class="dodge-icon">⟲</span>';
    for (let i = 0; i < max; i++) {
      if (i < charges) h += '<span class="pip full"></span>';
      else if (i === charges) h += `<span class="pip"><span class="pip-fill" style="width:${Math.round((frac || 0) * 100)}%"></span></span>`;
      else h += '<span class="pip"></span>';
    }
    this.$('dodge-row').innerHTML = h;
  }

  setSpectate(name, watchOnly = false) {
    const el = this.$('spectate-banner');
    if (name) {
      el.classList.remove('hidden');
      // Zuschauer sind nie „gefallen" — sie schauen nur zu
      el.textContent = watchOnly ? `👁 Du schaust ${name} zu — ESC zum Verlassen` : `Du bist gefallen — du beobachtest ${name}`;
    }
    else el.classList.add('hidden');
  }

  // Linkes Mitspieler-Panel: HP, Level, Waffen & Upgrades des Partners (Koop)
  setAlly(data) {
    const el = this.$('ally-panel');
    if (!data) { el.classList.add('hidden'); this._allySig = null; return; }
    el.classList.remove('hidden');
    const weapons = data.weapons || [];
    const pc = data.passives || {};
    const wsig = weapons.map((w) => w.id + w.level + (w.evolved ? 'e' : '')).join(',');
    const psig = Object.keys(pc).map((k) => k + pc[k]).join(',');
    const sig = `${data.level}|${wsig}|${psig}|${data.dead ? 1 : 0}`;
    if (sig !== this._allySig) {
      this._allySig = sig;
      const wIcons = weapons.map((w) => {
        const def = WEAPON_DEFS[w.id] || {};
        const name = (w.evolved && w.evoName) || def.name || w.id;
        const icon = (w.evolved && w.evoIcon) || WICON[w.id] || '◆';
        return `<div class="wicon sm" data-tip="<b>${name}</b> · ${w.evolved ? 'verschmolzen ★' : 'Stufe ' + w.level}"><span class="wi-emoji">${icon}</span><span class="wi-lv">${w.evolved ? '★' : w.level}</span></div>`;
      }).join('');
      const pIcons = Object.keys(pc).map((k) => {
        const pi = PASSIVE_INFO[k] || {};
        return `<div class="picon" data-tip="<b>${pi.name || k}</b> ×${pc[k]}"><span class="wi-emoji">${PICON[k] || '◆'}</span><span class="wi-lv">${pc[k]}</span></div>`;
      }).join('');
      el.innerHTML = `
        <div class="ally-head">🤝 Mitspieler · Stufe <b class="ally-lv">${data.level}</b></div>
        <div class="bar hp ally-hpbar"><div class="bar-fill ally-hp-fill"></div><div class="bar-label ally-hp-label"></div></div>
        <div class="ally-weapons">${wIcons || '<span class="ally-empty">—</span>'}</div>
        <div class="ally-passives">${pIcons}</div>
        <div class="ally-downed${data.dead ? '' : ' hidden'}"><span>⚰ GEFALLEN — Wiederbeleben</span><div class="revive-bar"><div class="revive-fill"></div></div></div>`;
    }
    const pct = Math.max(0, Math.min(100, (data.hp / data.maxHp) * 100));
    const fill = el.querySelector('.ally-hp-fill');
    if (fill) fill.style.width = pct + '%';
    const lab = el.querySelector('.ally-hp-label');
    if (lab) lab.textContent = `${Math.ceil(Math.max(0, data.hp))} / ${data.maxHp}`;
    el.classList.toggle('is-dead', !!data.dead);
    const rf = el.querySelector('.ally-downed .revive-fill');
    if (rf) rf.style.width = Math.round((data.reviveProg || 0) * 100) + '%';
  }

  // Zentraler Wiederbelebungs-Hinweis (Retter: „Halte E"; Gefallener: „Du wirst wiederbelebt…")
  setRevivePrompt(data) {
    const el = this.$('revive-prompt');
    if (!data) { el.classList.add('hidden'); this._revSig = null; return; }
    el.classList.remove('hidden');
    const sig = data.downed ? 'd' : 'r';
    if (sig !== this._revSig) {
      this._revSig = sig;
      const txt = data.downed ? '⏳ Du wirst wiederbelebt…' : '💚 Halte <b>E</b> — Mitspieler wiederbeleben';
      el.innerHTML = `<div class="revive-txt">${txt}</div><div class="revive-bar big"><div class="revive-fill"></div></div>`;
    }
    const rf = el.querySelector('.revive-fill');
    if (rf) rf.style.width = Math.round((data.prog || 0) * 100) + '%';
  }

  // Aktive Koop-Buffs (Last Stand, Nähe-Bonus …)
  setBuffs(list) {
    const el = this.$('buff-row');
    if (!list || !list.length) { if (this._buffSig !== '') { el.innerHTML = ''; el.classList.add('hidden'); this._buffSig = ''; } return; }
    const sig = list.map((b) => b.icon).join(',');
    if (sig === this._buffSig) return;
    this._buffSig = sig;
    el.classList.remove('hidden');
    el.innerHTML = list.map((b) => `<div class="buff" data-tip="<b>${b.name}</b><br>${b.desc || ''}"><span class="buff-ic">${b.icon}</span>${b.name}</div>`).join('');
  }

  // Host-Hinweis: der Gast ist gerade in seinem Menü (Spiel pausiert)
  setPeerPause(on) {
    this.$('peer-pause').classList.toggle('hidden', !on);
  }

  // Festwurzeln: Prompt + schrumpfender Balken (frac 1 = voll gewurzelt, 0 = frei)
  setRoot(frac) {
    const el = this.$('root-prompt');
    if (!frac || frac <= 0.01) { el.classList.add('hidden'); return; }
    el.classList.remove('hidden');
    el.querySelector('.root-fill').style.width = Math.round(Math.min(1, frac) * 100) + '%';
  }

  // Anti-Kiting: „Zorn"-Anzeige (frac 0..1). Gegner werden schneller, wenn zu lange kein Kill fällt.
  setWrath(frac) {
    const el = this.$('wrath-meter');
    if (!frac || frac <= 0.01) { el.classList.add('hidden'); return; }
    el.classList.remove('hidden');
    el.querySelector('.wrath-fill').style.width = Math.round(Math.min(1, frac) * 100) + '%';
    el.classList.toggle('high', frac > 0.6);
  }

  // Richtungspfeil zum Mitspieler (Bildschirmrand), Distanz in Metern
  setMateArrow(data) {
    const el = this.$('mate-arrow');
    if (!data) { el.classList.add('hidden'); return; }
    el.classList.remove('hidden');
    el.classList.toggle('dead', !!data.dead);
    el.style.left = data.x + 'px';
    el.style.top = data.y + 'px';
    const icon = el.querySelector('.ma-icon');
    if (icon) icon.style.transform = `rotate(${(data.angle * 180 / Math.PI).toFixed(1)}deg)`;
    const dist = el.querySelector('.ma-dist');
    if (dist) dist.textContent = `${data.dist}m`;
  }

  bossBanner(name) {
    const el = this.$('boss-banner');
    el.textContent = `⚠  ${name}  ⚠`;
    el.classList.remove('hidden');
    el.style.animation = 'none';
    void el.offsetWidth;
    el.style.animation = 'bossIn 0.5s ease-out';
    this._bannerUntil = performance.now() + 3200;
  }

  setBossBar(name, frac) {
    const el = this.$('boss-bar');
    if (name == null) { el.classList.add('hidden'); return; }
    el.classList.remove('hidden');
    this.$('boss-name').textContent = name;
    this.$('boss-hp-fill').style.width = Math.max(0, frac * 100) + '%';
  }

  // entries: [{sx, sy, frac, boss}] in Bildschirmkoordinaten
  drawEnemyBars(entries) {
    const c = this.hp;
    c.clearRect(0, 0, this.hpCanvas.width, this.hpCanvas.height);
    for (const e of entries) {
      const w = e.boss ? 60 : 22;
      const h = e.boss ? 6 : 3;
      const x = e.sx - w / 2;
      const y = e.sy;
      c.fillStyle = 'rgba(0,0,0,0.7)';
      c.fillRect(x - 1, y - 1, w + 2, h + 2);
      c.fillStyle = e.boss ? '#ff4030' : e.frac > 0.5 ? '#7ad04a' : e.frac > 0.25 ? '#e0c020' : '#d24030';
      c.fillRect(x, y, w * Math.max(0, e.frac), h);
    }
  }

  update(player, weapons, elapsed, enemyCount) {
    this.$('xp-fill').style.width = (player.xp / player.xpToNext) * 100 + '%';
    this.$('xp-label').textContent = `Stufe ${player.level}`;
    const m = Math.floor(elapsed / 60), s = Math.floor(elapsed % 60);
    this.$('timer').textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    this.$('kills').textContent = `☠ ${player.kills}`;
    this.$('gold').textContent = `⛏ ${Math.floor(player.gold)}`;
    this.$('enemies').textContent = `👹 ${enemyCount}`;
    const hpPct = (player.hp / player.maxHp) * 100;
    this.$('hp-fill').style.width = hpPct + '%';
    this.$('hp-label').textContent = `${Math.ceil(player.hp)} / ${player.maxHp}`;
    const lp = hpPct < 30 ? (30 - hpPct) / 30 : 0;
    const vg = this.$('lowhp-vignette');
    vg.style.setProperty('--lp', lp.toFixed(3));
    vg.classList.toggle('pulsing', lp > 0);

    const sig = weapons.ownedList().map((w) => w.id + w.level + (w.evolved ? 'e' : '') + (w.evoName || '')).join(',');
    if (sig !== this._lastWeapons) {
      this._lastWeapons = sig;
      this.$('weapon-row').innerHTML = weapons.ownedList().map((w) => {
        const def = WEAPON_DEFS[w.id] || {};
        const name = (w.evolved && w.evoName) || def.name || w.id;
        const icon = (w.evolved && w.evoIcon) || WICON[w.id] || '◆';
        const lv = w.evolved ? 'verschmolzen ★' : 'Stufe ' + w.level;
        const tip = `<b>${name}</b> · ${lv}<br>${def.desc || ''}`;
        return `<div class="wicon" data-tip="${tip}"><span class="wi-emoji">${icon}</span><span class="wi-lv">${w.evolved ? '★' : w.level}</span></div>`;
      }).join('');
    }

    const pc = player.passiveCounts || {};
    const psig = Object.keys(pc).map((k) => k + pc[k]).join(',');
    if (psig !== this._lastPassives) {
      this._lastPassives = psig;
      this.$('passive-row').innerHTML = Object.keys(pc).map((k) => {
        const pi = PASSIVE_INFO[k] || {};
        const tip = `<b>${pi.name || k}</b> ×${pc[k]}<br>${pi.sub || ''}`;
        return `<div class="picon" data-tip="${tip}"><span class="wi-emoji">${PICON[k] || '◆'}</span><span class="wi-lv">${pc[k]}</span></div>`;
      }).join('');
    }

    if (this._bannerUntil && performance.now() > this._bannerUntil) {
      this.$('boss-banner').classList.add('hidden');
      this._bannerUntil = 0;
    }

    const now = performance.now();
    this.toasts = this.toasts.filter((t) => { if (now - t.born > t.life) { t.node.remove(); return false; } return true; });
  }

  toast(msg, type = '') {
    const log = this.$('message-log');
    const node = document.createElement('div');
    node.className = 'toast' + (type ? ' ' + type : '');
    node.textContent = msg;
    log.appendChild(node);
    this.toasts.push({ node, born: performance.now(), life: 2600 });
    while (log.children.length > 4) log.removeChild(log.firstChild);
  }

  // self {x,z}, allies, enemies, pickups, pings
  drawMinimap(self, allies, enemies, pickups, pings, bounds) {
    const c = this.mm, S = 170, R = 75;
    c.clearRect(0, 0, S, S);
    c.fillStyle = 'rgba(8,10,14,0.6)';
    c.beginPath(); c.arc(S / 2, S / 2, S / 2 - 2, 0, Math.PI * 2); c.fill();
    c.strokeStyle = 'rgba(201,164,92,0.5)'; c.lineWidth = 2; c.stroke();
    const to = (x, z) => [S / 2 + ((x - self.x) / R) * (S / 2 - 6), S / 2 + ((z - self.z) / R) * (S / 2 - 6)];
    // Weltgrenze: gestrichelte rote Linie, auf den runden Minimap-Bereich geclippt
    if (bounds) {
      c.save();
      c.beginPath(); c.arc(S / 2, S / 2, S / 2 - 3, 0, Math.PI * 2); c.clip();
      c.strokeStyle = 'rgba(255,80,60,0.85)';
      c.lineWidth = 2;
      c.setLineDash([5, 4]);
      c.beginPath();
      const k = (S / 2 - 6) / R; // Welt-Einheiten -> Pixel
      if (bounds.kind === 'radial') {
        const [cx, cy] = to(0, 0);
        c.arc(cx, cy, bounds.r * k, 0, Math.PI * 2);
      } else {
        const [, top] = to(0, -bounds.halfZ);
        const [, bot] = to(0, bounds.halfZ);
        const [left] = to(-bounds.halfX, 0);
        const [right] = to(bounds.halfX, 0);
        c.moveTo(left, top); c.lineTo(right, top);
        c.moveTo(left, bot); c.lineTo(right, bot);
        c.moveTo(left, top); c.lineTo(left, bot);
        c.moveTo(right, top); c.lineTo(right, bot);
      }
      c.stroke();
      c.setLineDash([]);
      c.restore();
    }
    const dot = (x, z, col, r) => { const [px, py] = to(x, z); if (px < 2 || px > S - 2 || py < 2 || py > S - 2) return; c.fillStyle = col; c.beginPath(); c.arc(px, py, r, 0, Math.PI * 2); c.fill(); };
    for (const e of enemies) dot(e.x, e.z, e.boss ? '#ff3030' : '#d05a4a', e.boss ? 4 : 1.6);
    for (const p of pickups) dot(p.x, p.z, PICKUP_COLORS[p.t] || '#49e06a', 2.2);
    for (const a of allies) dot(a.x, a.z, a.dead ? '#777' : '#6aa6e6', 3.2);
    if (pings) for (const p of pings) { const r = 4 + (1 - Math.min(1, p.t / 3.5)) * 4; dot(p.x, p.z, '#49e0ff', r); }
    c.fillStyle = '#fff'; c.beginPath(); c.arc(S / 2, S / 2, 3.5, 0, Math.PI * 2); c.fill();
  }
}
