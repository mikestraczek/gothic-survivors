import * as THREE from 'three';
import { Player } from './Player.js';
import { Weapons } from './Weapons.js';
import { MAP_LIST } from './World.js';
import { HEROES, applyHero } from './Heroes.js';
import { Net } from '../net/Net.js';
import { DIFFS, EMOTES, REVIVE_RANGE, REVIVE_TIME, AURA_RANGE } from './constants.js';

// Online-Koop: Netz/Lobby, Snapshots (Host->Gast), Koop-Features (Revive/Buffs/
// Ally-Panel/Mate-Pfeil) sowie Ping/Emotes. Funktionen nehmen die Game-Instanz `g`.

// -------------------------------------------------- Netzwerk / Lobby
export function _initNet(g) {
  g.net = new Net();
  g.net.onCreated = () => {
    g._enterLobbyRoom('host');
    g._setLobbySlot2(false);
    document.getElementById('lobby-start').classList.add('hidden');
    g._setLobbyStatus('Warte auf Mitspieler…');
  };
  g.net.onPeerJoined = () => {
    g._setLobbySlot2(true);
    g._setLobbyStatus('Mitspieler verbunden — bereit zum Start!');
    document.getElementById('lobby-start').classList.remove('hidden');
    if (g.audio && g.audio.pickup) g.audio.pickup();
  };
  g.net.onJoined = () => {
    g._enterLobbyRoom('client');
    g._setLobbyStatus('Verbunden — warte auf Host-Start…');
    g._sendHeroInfo(); // Held + Waffen-Unlocks an den Host melden
  };
  g.net.onPeerLeft = () => {
    g.hud.toast('Mitspieler hat die Lobby verlassen', 'blood');
    if (g.mode === 'play' || g.mode === 'levelup' || g.mode === 'paused') g._leaveOnline();
    else { g._setLobbySlot2(false); document.getElementById('lobby-start').classList.add('hidden'); g._setLobbyStatus('Mitspieler getrennt — warte…'); }
  };
  g.net.onError = (msg) => g._setLobbyStatus('Fehler: ' + msg);
  g.net.onLobbyList = (list) => { if (g.mode === 'lobby') g._renderLobbyList(list); };
  g.net.onData = (d) => g._onNetData(d);
}
export async function _openLobby(g) {
  g.mode = 'lobby';
  document.getElementById('start-screen').classList.add('hidden');
  document.getElementById('lobby').classList.remove('hidden');
  document.getElementById('lobby-entry').classList.remove('hidden');
  document.getElementById('lobby-room').classList.add('hidden');
  document.getElementById('lobby-start').classList.add('hidden');
  g._setLobbyStatus('');
  g._renderSelectors('lobby-maps', 'lobby-diffs', 'lobby-heroes', 'lobby-hero-desc');
  document.getElementById('lobby-list').innerHTML = '<div class="lobby-empty">Verbinde…</div>';
  if (await g._lobbyConnect()) g.net.list();
}
// Verbindet mit dem Server (falls noch nicht verbunden). Gibt true bei Erfolg.
export async function _lobbyConnect(g) {
  if (g.net.connected) return true;
  try {
    await g.net.connect(document.getElementById('lobby-server').value || undefined);
    return true;
  } catch (e) {
    document.getElementById('lobby-list').innerHTML = '<div class="lobby-empty">Server nicht erreichbar — läuft <code>npm run server</code>?</div>';
    return false;
  }
}
// Offene Lobbys anzeigen (mit Beitreten-Button je Zeile)
export function _renderLobbyList(g, list) {
  const el = document.getElementById('lobby-list');
  if (!el) return;
  if (!list || !list.length) { el.innerHTML = '<div class="lobby-empty">Keine offenen Lobbys — erstelle eine!</div>'; return; }
  const mapName = (k) => { const m = MAP_LIST.find((x) => x.key === k); return m ? m.name : k; };
  const diffName = (k) => (DIFFS[k] ? DIFFS[k].name : k);
  el.innerHTML = list.map((l) => `
    <div class="lobby-item">
      <div class="li-info"><div class="li-map">🗺️ ${mapName(l.map)}</div><div class="li-diff">${diffName(l.diff)}</div></div>
      <button class="li-join" data-id="${l.id}">Beitreten</button>
    </div>`).join('');
  el.querySelectorAll('.li-join').forEach((b) => b.addEventListener('click', () => g._lobbyJoinId(b.getAttribute('data-id'))));
}
// Warteraum betreten (Host oder Client)
export function _enterLobbyRoom(g, role) {
  document.getElementById('lobby-entry').classList.add('hidden');
  document.getElementById('lobby-room').classList.remove('hidden');
  document.getElementById('lobby-host-opts').classList.toggle('hidden', role !== 'host'); // nur Host wählt Karte
  document.getElementById('lp-state-1').textContent = role === 'host' ? 'Du' : 'Verbunden';
  document.getElementById('lp-state-2').textContent = role === 'client' ? 'Du' : 'Warte…';
  if (role === 'client') g._setLobbySlot2(true);
}
export function _setLobbySlot2(g, connected) {
  const slot = document.getElementById('lp-slot-2');
  const dot = document.getElementById('lp-dot-2');
  const state = document.getElementById('lp-state-2');
  if (slot) slot.classList.toggle('ready', connected);
  if (dot) dot.classList.toggle('on', connected);
  if (state && g.net.role === 'host') state.textContent = connected ? 'Verbunden' : 'Warte…';
}
export function _setLobbyStatus(g, txt) {
  const el = document.getElementById('lobby-status');
  if (el) el.textContent = txt;
}
export async function _lobbyCreate(g) {
  if (!(await g._lobbyConnect())) return;
  g.net.create(g._selMap, g._selDiff);
}
export async function _lobbyJoinId(g, id) {
  if (!id || !(await g._lobbyConnect())) return;
  g._setLobbyStatus('Trete bei…');
  g.net.join(id);
}
export function _ensureCoop(g) {
  if (!g.remotePlayer) g.remotePlayer = new Player(g.scene, g.world, g.assets.createHero(1.9, 0x6aa6e6));
  // HD-2D: der Mitspieler wird als Pixel-Sprite gezeigt — rohes 3D-Modell bleibt versteckt
  g.remotePlayer.group.visible = false;
  if (!g.weapons2) {
    g.weapons2 = new Weapons(g.scene);
    g.weapons2.fx = g.fx;
  }
}
export function _onNetData(g, d) {
  if (!d) return;
  if (d.k === 'ping') { g._addPing(d.x, d.z); return; } // Team-Ping (beide Rollen)
  if (d.k === 'emote') { g._showEmote('mate', d.i); return; }
  if (d.k === 'hero') { g._remoteHero = d.key; g._remoteLocked = d.locked || []; return; } // Heldenwahl des Gastes
  if (d.k === 'start' && g.net.role === 'client') g._beginClientRun(d);
  else if (d.k === 'in' && g.role === 'host') { g.remoteInput._x = d.x; g.remoteInput._z = d.z; g.remoteInput.reviving = !!d.rv; if (d.dodge) g.remotePlayer.dodge(); if (d.mash) g.remotePlayer.mashFree(0.2 *d.mash); }
  else if (d.k === 'snap' && g.role === 'client') g._applySnapshot(d);
  else if (d.k === 'won' && g.role === 'client') g._clientWin(d);
  else if (d.k === 'endless' && g.role === 'client') {
    g.endless = true;
    g.player.dead = false;
    document.getElementById('win-screen').classList.add('hidden');
    g.input.enabled = true;
    g.mode = 'play';
    g.hud.toast('ENDLOS-MODUS!', 'gold');
  }
  else if (d.k === 'pause' && g.role === 'client') {
    g._clientPaused = d.on;
    g.hud.toast(d.on ? 'Mitspieler wählt ein Upgrade…' : 'Weiter geht’s!', 'gold');
  } else if (d.k === 'lvlup' && g.role === 'client') g._clientLevelUp(d);
  else if (d.k === 'pick' && g.role === 'host') g._hostApplyRemotePick(d.i);
  else if (d.k === 'reroll' && g.role === 'host') g._hostRerollRemote();
  else if (d.k === 'banish' && g.role === 'host') g._hostBanishRemote(d.i);
  else if (d.k === 'combo' && g.role === 'client') {
    g.mode = 'levelup';
    g.input.enabled = false;
    g.upgrades.presentCombo(
      { key: d.key, base: d.base, consume: d.consume, passive: d.passive, passiveCount: d.passiveCount, name: d.name, desc: d.desc },
      () => { g.net.send({ k: 'comboPick', yes: 1 }); g._evolvesThisRun = (g._evolvesThisRun || 0) + 1; g.upgrades.close(); g.mode = 'play'; g.input.enabled = true; },
      () => { g.net.send({ k: 'comboPick', yes: 0 }); g.upgrades.close(); g.mode = 'play'; g.input.enabled = true; }
    );
  } else if (d.k === 'comboPick' && g.role === 'host') {
    const c = g._pendingRemoteCombo;
    if (c) {
      if (d.yes) g.weapons2.combine(c, g.remotePlayer);
      else g._declinedRemoteCombos.add(c.key);
    }
    g._pendingRemoteCombo = null;
    g._endLevelUp();
  } else if (d.k === 'dps' && g.role === 'client') g._clientDealt = d.d || {};
  else if (d.k === 'toast' && g.role === 'client') {
    g.hud.toast(d.m, d.t || 'gold');
    const snd = { chest: 1, pickup: 1, levelup: 1, boss: 1 }[d.s] ? d.s : null;
    if (snd) g.audio[snd]();
  }
  else if (d.k === 'gpause' && g.role === 'host') g._peerPause(d.on);
  else if (d.k === 'over' && g.role === 'client') g._clientGameOver(d);
}
export function _sendHeroInfo(g) {
  g.net.send({ k: 'hero', key: g._selHero, locked: [...g.meta.lockedWeaponSet()] });
}
// Host: geänderte Karte/Schwierigkeit im Warteraum an die Lobby-Liste melden
export function _lobbyUpdate(g) {
  if (g.net && g.net.role === 'host' && g.net.connected) g.net.updateLobby(g._selMap, g._selDiff);
}
export function _hostStart(g) {
  g.role = 'host';
  g._ensureCoop();
  document.getElementById('lobby').classList.add('hidden');
  document.getElementById('win-screen').classList.add('hidden');
  g._applyLevel(g._selMap, g._selDiff);
  g.player.beginRun();
  g.remotePlayer.beginRun();
  g.meta.applyToPlayer(g.player);
  g.heroKey = g._selHero;
  applyHero(g.player, g.heroKey);
  g.player.lockedWeapons = g.meta.lockedWeaponSet();
  // Held des Gastes (per 'hero'-Nachricht gemeldet) auf den Remote-Spieler anwenden
  g._remoteHeroKey = g._remoteHero || 'soldier';
  applyHero(g.remotePlayer, g._remoteHeroKey);
  g._syncHeroSprites();
  g.remotePlayer.lockedWeapons = new Set(g._remoteLocked || []);
  const sp = g.world.spawnPoint();
  g.player.position.set(sp.x - 3, g.world.getHeight(sp.x - 3, sp.z), sp.z);
  g.remotePlayer.position.set(sp.x + 3, g.world.getHeight(sp.x + 3, sp.z), sp.z);
  g._resetCommon();
  g.weapons2.reset();
  g.weapons2.add((HEROES[g._remoteHeroKey] || HEROES.soldier).start);
  // Koop-Host: alle transienten Effekte aufzeichnen -> per Snapshot an den Gast senden
  g.fx.record = true;
  // Koop ist fordernder als Solo (zwei Spieler zusammen sind stärker): mehr Gegner + zähere Werte
  g.enemies.coopScale = 1.35;
  g.enemies.diff *= 1.18;
  g._onKillP1 = g._makeOnKill(g.player);
  g._onKillP2 = g._makeOnKill(g.remotePlayer);
  g._lastHp = g.player.hp;
  g.remoteInput._x = 0;
  g.remoteInput._z = 0;
  g.net.send({ k: 'start', map: g._selMap, diff: g._selDiff, hero: g.heroKey });
  g.camCtrl.snap(g.player.position);
  g.hud.show();
  g.hud.toast('Koop gestartet! Jeder levelt selbst.', 'gold');
  g.input.enabled = true;
  g.mode = 'play';
  g.audio.setMusic(g._musicTheme());
  g._playIntro();
}
export function _beginClientRun(g, d) {
  g.role = 'client';
  g._ensureCoop();
  document.getElementById('lobby').classList.add('hidden');
  document.getElementById('win-screen').classList.add('hidden');
  if (d && d.map && g.world.themeKey !== d.map) g.world.applyTheme(d.map);
  g._syncGrade();
  g.mapKey = d ? d.map : 'valley';
  g.difficulty = d ? d.diff : 'normal';
  g.heroKey = g._selHero; // eigener Held (Stats kommen autoritativ vom Host)
  g._remoteHeroKey = (d && d.hero) || 'soldier';
  g._syncHeroSprites();
  g._lastHp = 100;
  g.player.beginRun();
  g.remotePlayer.beginRun();
  const spc = g.world.spawnPoint();
  g.player.position.set(spc.x + 3, g.world.getHeight(spc.x + 3, spc.z), spc.z); // self = P2
  g.enemies.reset();
  g.gems.reset();
  g.pickups.reset();
  g.weapons.reset();
  g.weapons2.reset();
  g.weapons._ldSig = null;
  g.weapons2._ldSig = null;
  g.runElapsed = 0;
  g._clientPaused = false;
  g._reviveProg = 0;
  g._clientRevive = 0;
  g._prevRemoteDead = false;
  g._lastStandActive = false;
  g._pings = [];
  g._ghostProj = [];
  g._ghostBolts = [];
  // Client rendert nur -> keine eigene Effekt-Aufnahme, spielt die des Hosts ab
  g.fx.record = false;
  g.fx.drain();
  g.hud.setSpectate(null);
  g.camCtrl.snap(g.player.position);
  g.hud.show();
  g.hud.toast('Mit der Lobby verbunden!', 'gold');
  g.input.enabled = true;
  g.mode = 'play';
  g.audio.setMusic(g._musicTheme());
  g._playIntro();
}
export function _leaveOnline(g) {
  if (g.net) g.net.close();
  g.role = null;
  g.mode = 'menu';
  if (g.weapons) g.weapons.hideGhosts();
  if (g.enemies) g.enemies.hideBolts();
  if (g.remotePlayer) g.remotePlayer.group.visible = false;
  document.getElementById('start-screen').classList.remove('hidden');
  document.getElementById('lobby').classList.add('hidden');
  document.getElementById('levelup').classList.add('hidden');
}
// -------------------------------------------------- Wiederbelebung (Nähe + Halten)
// Host-autoritativ: genau ein Gefallener kann vom lebenden Mate wiederbelebt werden.
export function _tickRevive(g, dt) {
  let downed = null, reviver = null, held = false;
  if (g.player.dead && !g.remotePlayer.dead) { downed = g.player; reviver = g.remotePlayer; held = !!g.remoteInput.reviving; }
  else if (g.remotePlayer.dead && !g.player.dead) { downed = g.remotePlayer; reviver = g.player; held = g.input.isDown('KeyE') || g.input.isTouch; } // Touch: Nähe genügt
  if (!downed) { g._reviveProg = 0; return; }
  const near = Math.hypot(reviver.position.x - downed.position.x, reviver.position.z - downed.position.z) < REVIVE_RANGE;
  if (near && held) g._reviveProg = Math.min(1, (g._reviveProg || 0) + dt / REVIVE_TIME);
  else g._reviveProg = Math.max(0, (g._reviveProg || 0) - dt / REVIVE_TIME * 0.7); // Abbruch fällt langsam ab
  if (g._reviveProg >= 1) {
    downed.dead = false;
    downed.hp = Math.max(1, Math.round(downed.maxHp * 0.5));
    downed.iframe = 2.0; // kurzer Schutz nach dem Aufstehen
    downed.group.rotation.z = 0;
    g._reviveProg = 0;
    g.audio.levelup();
    g.hud.toast('Mitspieler wiederbelebt! 💚', 'gold');
  }
}
// Linkes Mitspieler-Panel: HP, Level, Waffen & Upgrades des Partners
export function _updateAllyPanel(g) {
  const rp = g.remotePlayer;
  const prog = rp.dead ? (g.role === 'client' ? (g._clientRevive || 0) : (g._reviveProg || 0)) : 0;
  g.hud.setAlly({
    level: rp.level,
    hp: rp.hp, maxHp: rp.maxHp,
    dead: rp.dead,
    weapons: g.weapons2 ? g.weapons2.ownedList() : [],
    passives: rp.passiveCounts || {},
    reviveProg: prog,
  });
}
// Zentraler Hinweis: entweder „Halte E zum Wiederbeleben" (Retter) oder „Du wirst wiederbelebt…" (Gefallener)
export function _updateRevivePrompt(g) {
  const me = g.player, ally = g.remotePlayer;
  const prog = g.role === 'client' ? (g._clientRevive || 0) : (g._reviveProg || 0);
  if (me.dead && ally && !ally.dead) { g.hud.setRevivePrompt({ prog, downed: true }); return; }
  const canRevive = ally && ally.dead && !me.dead &&
    Math.hypot(me.position.x - ally.position.x, me.position.z - ally.position.z) < REVIVE_RANGE;
  g.hud.setRevivePrompt(canRevive ? { prog, downed: false } : null);
}
// Koop-Buffs: Last-Stand (Mate am Boden -> stärker) + Nähe-Aura (nah beieinander -> Bonus)
export function _updateBuffs(g) {
  const a = g.player, b = g.remotePlayer;
  const near = !a.dead && !b.dead && Math.hypot(a.position.x - b.position.x, a.position.z - b.position.z) < AURA_RANGE;
  for (const [self, other] of [[a, b], [b, a]]) {
    const lastStand = !self.dead && other.dead;
    self.dmgMult = (lastStand ? 1.3 : 1) * (near ? 1.12 : 1) * (self.blessing > 0 ? 1.4 : 1);
    self.speedMult = (lastStand ? 1.25 : 1) * (self.boost > 0 ? 1.5 : 1) * (self.mud ? 0.72 : 1) * (self.vehicle ? 0.95 : 1);
    self.aura = near;
    self.lastStand = lastStand;
  }
  const mine = g.player.lastStand;
  if (mine && !g._lastStandActive) g.hud.toast('🔥 Last Stand — verstärkt, bis dein Mate wieder steht!', 'gold');
  g._lastStandActive = mine;
}
// Richtungspfeil zum Mitspieler (nur wenn er off-screen oder gefallen ist)
export function _updateMateArrow(g) {
  const mate = g.remotePlayer;
  const w = window.innerWidth, h = window.innerHeight;
  const v = g._projMate || (g._projMate = new THREE.Vector3());
  v.set(mate.position.x, mate.position.y + 1.2, mate.position.z).project(g.camera);
  let bx = v.x, by = v.y;
  const behind = v.z > 1;
  if (behind) { bx = -bx; by = -by; }
  const onScreen = !behind && Math.abs(bx) < 0.9 && Math.abs(by) < 0.9;
  if (onScreen && !mate.dead) { g.hud.setMateArrow(null); return; } // sichtbar & lebendig -> kein Pfeil nötig
  const m = Math.max(Math.abs(bx), Math.abs(by)) || 1;
  const ex = bx / m, ey = by / m;
  const margin = 0.82;
  const sx = (ex * margin * 0.5 + 0.5) * w;
  const sy = (-ey * margin * 0.5 + 0.5) * h;
  const angle = Math.atan2(-ey, ex); // Bildschirm-Radiant (0 = rechts, y nach unten)
  const dist = Math.round(Math.hypot(mate.position.x - g.player.position.x, mate.position.z - g.player.position.z));
  g.hud.setMateArrow({ x: sx, y: sy, angle, dist, dead: mate.dead });
}
// Meldung, wenn der Mitspieler gerade fällt
export function _coopDeathWatch(g) {
  const rd = g.remotePlayer.dead;
  if (rd && !g._prevRemoteDead) {
    g.hud.bossBanner('MITSPIELER GEFALLEN');
    g.hud.toast('☠ Mitspieler gefallen — eile hin und belebe ihn (E)!', 'blood');
    g.audio.hurt();
  }
  g._prevRemoteDead = rd;
}
// Ping (Q) + Emotes (1–4)
// Ping an die Maus-Position in der Landschaft (Linksklick oder Q) — Solo & Koop
export function _pingInput(g) {
  if (g.input.clicked(0) || g.input.pressed('KeyQ')) {
    const p = g._mouseWorld();
    if (p) g._ping(p.x, p.z);
  }
}
// Emotes nur im Koop (an den Mitspieler)
export function _coopInput(g) {
  if (g.mode !== 'play') return;
  for (let i = 1; i <= 4; i++) if (g.input.pressed('Digit' + i)) g._emote(i);
}
// Anzahl frischer Tastendrücke diesen Frame (fürs Losreißen aus dem Festwurzeln)
export function _mashCount(g) {
  let n = 0;
  for (const c of ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space']) if (g.input.pressed(c)) n++;
  return n;
}
// Maus-Bildschirmposition -> Weltpunkt auf dem Boden (Strahl gegen Ebene y=0)
export function _mouseWorld(g) {
  const w = window.innerWidth, h = window.innerHeight;
  const ndc = g._ndc || (g._ndc = new THREE.Vector2());
  ndc.set((g.input.mouse.x / w) * 2 - 1, -(g.input.mouse.y / h) * 2 + 1);
  const ray = g._ray || (g._ray = new THREE.Raycaster());
  ray.setFromCamera(ndc, g.camera);
  const plane = g._groundPlane || (g._groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0));
  const pt = g._rayPt || (g._rayPt = new THREE.Vector3());
  if (ray.ray.intersectPlane(plane, pt)) return { x: pt.x, z: pt.z };
  return null;
}
export function _ping(g, x, z) { g._addPing(x, z); if (g.role) g.net.send({ k: 'ping', x, z }); }
export function _addPing(g, x, z) {
  (g._pings || (g._pings = [])).push({ x, z, t: 3.5 });
  g.hud.toast('📍 Team-Ping', 'gold');
  g.audio.pickup();
  if (g.fx) { const was = g.fx.record; g.fx.record = false; g.fx.ring(x, z, 5.5, 0x49e0ff); g.fx.record = was; }
}
export function _decayPings(g, dt) {
  if (!g._pings || !g._pings.length) return;
  for (const p of g._pings) p.t -= dt;
  g._pings = g._pings.filter((p) => p.t > 0);
}
export function _emote(g, i) { g._showEmote('self', i); g.net.send({ k: 'emote', i }); }
export function _showEmote(g, who, i) {
  const txt = EMOTES[(i | 0) - 1] || '…';
  g.hud.toast((who === 'mate' ? '🗨 Mitspieler: ' : '🗨 Du: ') + txt, 'gold');
  g.audio.pickup();
}
// -------------------------------------------------- Snapshot
export function _sendSnapshot(g) {
  const enc = (p) => [Math.round(p.position.x * 20) / 20, Math.round(p.position.z * 20) / 20, Math.round(p.yaw * 100) / 100, Math.round(p.hp), p.maxHp, p.dead ? 1 : 0, Math.round((p.rooted || 0) * 10) / 10, p.vehicle ? 1 : 0];
  const stat = (p) => [p.level, p.xp, p.xpToNext, p.kills, Math.floor(p.gold)];
  const ld = (w) => w.ownedList().map((x) => ({ id: x.id, l: x.level, e: x.evolved ? 1 : 0 }));
  g.net.send({
    k: 'snap',
    pl: [enc(g.player), enc(g.remotePlayer)],
    en: g.enemies.snapshot(),
    gm: g.gems.snapshot(),
    pk: g.pickups.snapshot(),
    fx: g.fx.drain(),
    pj: g.weapons.projSnapshot().concat(g.weapons2.projSnapshot()), // fliegende Projektile beider Spieler
    bo: g.enemies.boltSnapshot(), // Boss-Kugeln
    p1: stat(g.player),
    p2: stat(g.remotePlayer),
    ld1: ld(g.weapons),
    ld2: ld(g.weapons2),
    pa1: g.player.passiveCounts, // Host-Passive (fürs Mitspieler-Panel beim Gast)
    pa2: g.remotePlayer.passiveCounts,
    ph: g.phaseIndex,
    phk: g._phaseKills, // eigener Key — nicht mehr mit Pickups (pk) kollidieren
    rv: Math.round((g._reviveProg || 0) * 100) / 100, // Wiederbelebungs-Fortschritt
    bp: g.bossPhase ? 1 : 0,
    st: g.phaseStage,
    dg: g.enemies._aoes.some((a) => a.type === 'safe') ? 1 : 0,
    wr: Math.round(g.enemies.wrathFrac() * 100) / 100,
    t: Math.round(g.runElapsed),
    // Map-Specials (Panzer/Lore) für die Gast-Anzeige
    ms: {
      tk: g.world.tank ? [g.world.tank.group.visible ? 1 : 0, Math.round(g.world.tank.group.position.x * 10) / 10, Math.round(g.world.tank.group.position.z * 10) / 10, Math.round(g.world.tank.group.rotation.y * 100) / 100] : 0,
      lo: g.world.lore && g.world.lore.active ? Math.round(g.world.lore.x * 10) / 10 : null,
    },
  });
}
export function _applySnapshot(g, d) {
  const host = d.pl[0]; // P1
  const self = d.pl[1]; // P2 = ich
  g._authRemote = { x: host[0], z: host[1], yaw: host[2] };
  g.remotePlayer.hp = host[3]; g.remotePlayer.maxHp = host[4]; g.remotePlayer.dead = host[5] === 1;
  g.remotePlayer.rooted = host[6] || 0;
  g.remotePlayer.vehicle = host[7] ? { t: 1 } : null; // nur fürs Sprite-Ausblenden
  g._authSelf = { x: self[0], z: self[1] };
  g.player.hp = self[3]; g.player.maxHp = self[4]; g.player.dead = self[5] === 1;
  g.player.rooted = self[6] || 0;
  g.player.vehicle = self[7] ? { t: 1 } : null;
  g.runElapsed = d.t || 0;
  if (d.p2) { g.player.level = d.p2[0]; g.player.xp = d.p2[1]; g.player.xpToNext = d.p2[2]; g.player.kills = d.p2[3]; g.player.gold = d.p2[4]; }
  if (d.p1) { g.remotePlayer.level = d.p1[0]; g.remotePlayer.kills = d.p1[3]; }
  if (d.pa2) g.player.passiveCounts = d.pa2; // eigene Passive im HUD
  if (d.pa1) g.remotePlayer.passiveCounts = d.pa1; // Host-Passive fürs Mitspieler-Panel
  g._clientRevive = d.rv || 0; // Wiederbelebungs-Fortschritt (vom Host)
  if (d.ph != null) g.phaseIndex = d.ph;
  if (d.phk != null) g._phaseKills = d.phk;
  g.bossPhase = !!d.bp;
  if (d.st) g.phaseStage = d.st;
  g._clientDanger = !!d.dg;
  g._clientWrath = d.wr || 0;
  // eigene Waffen = ld2, Host-Waffen = ld1
  if (d.ld2) g.weapons.setLoadout(d.ld2.map((w) => ({ id: w.id, level: w.l, evolved: !!w.e })));
  if (d.ld1) g.weapons2.setLoadout(d.ld1.map((w) => ({ id: w.id, level: w.l, evolved: !!w.e })));
  g.enemies.setSnapshot(d.en || []);
  g.gems.applySnapshot(d.gm || [], 0);
  g.pickups.applySnapshot(d.pk || []);
  if (d.fx) g.fx.replay(d.fx);
  // Map-Special-Visuals (Panzer folgt Fahrer, Lore rast durch)
  if (d.ms) {
    if (g.world.tank && d.ms.tk) {
      const [vis, tx, tz, ry] = d.ms.tk;
      g.world.tank.group.visible = vis === 1;
      g.world.tank.group.position.set(tx, g.world.getHeight(tx, tz), tz);
      g.world.tank.group.rotation.y = ry;
    }
    if (g.world.lore) {
      const lx = d.ms.lo;
      g.world.lore.group.visible = lx != null;
      if (lx != null) g.world.lore.group.position.set(lx, g.world.getHeight(lx, 0) + 0.1, 0);
    }
  }
  g._ghostProj = d.pj || []; // fliegende Projektile für die Ghost-Anzeige
  g._ghostBolts = d.bo || []; // Boss-Kugeln
}

// Feedback an den RICHTIGEN Spieler: Der Host simuliert auch die Pickups des Gastes —
// dessen Toasts/Sounds müssen übers Netz zu ihm, nicht auf den Host-Bildschirm.
export function _toastFor(g, who, msg, type = 'gold', sound = null) {
  if (g.role === 'host' && who === g.remotePlayer) {
    g.net.send({ k: 'toast', m: msg, t: type, s: sound });
    return;
  }
  g.hud.toast(msg, type);
  if (sound && g.audio[sound]) g.audio[sound]();
}
