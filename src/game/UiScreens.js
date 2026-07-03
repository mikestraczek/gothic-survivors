import { MAP_LIST } from './World.js';
import { saveSettings } from './Settings.js';
import { HEROES, HERO_KEYS } from './Heroes.js';
import { Net } from '../net/Net.js';
import { DIFFS } from './constants.js';

// Menü-/Screen-Logik: Hauptmenü, Name, Optionen, Pause, Bestenliste, Kombinationen,
// Karten-/Helden-Auswahl, Shop-Navigation. Funktionen nehmen die Game-Instanz `g`.

// -------------------------------------------------- UI
export function _wireUI(g) {
  document.getElementById('start-button').addEventListener('click', () => g._openMapSelect());
  document.getElementById('resume-button').addEventListener('click', () => g.resumeRun());
  document.getElementById('shop-button').addEventListener('click', () => g.openShop('menu'));
  document.getElementById('combos-button').addEventListener('click', () => g._openCombos('menu'));
  const pauseCombos = document.getElementById('pause-combos');
  if (pauseCombos) pauseCombos.addEventListener('click', () => g._openCombos('pause'));
  document.getElementById('combos-back').addEventListener('click', () => {
    document.getElementById('combos-screen').classList.add('hidden');
    const back = g._combosReturn === 'pause' ? 'pause-screen' : 'start-screen';
    document.getElementById(back).classList.remove('hidden');
  });
  document.getElementById('online-button').addEventListener('click', () => g._openLobby());
  const nameEl = document.getElementById('player-name');
  if (nameEl) {
    g._loadName();
    const updName = () => {
      const v = nameEl.value.trim();
      try { localStorage.setItem('gothicName', v); } catch (e) {}
      const btn = document.getElementById('name-confirm');
      if (btn) btn.disabled = v.length === 0;
    };
    nameEl.addEventListener('input', updName);
    nameEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') g._confirmName(); });
  }
  const nameConfirm = document.getElementById('name-confirm');
  if (nameConfirm) nameConfirm.addEventListener('click', () => g._confirmName());
  const changeName = document.getElementById('change-name');
  if (changeName) changeName.addEventListener('click', () => g._showNameScreen());
  document.getElementById('leaderboard-button').addEventListener('click', () => g._openLeaderboard());
  document.getElementById('achievements-button').addEventListener('click', () => {
    document.getElementById('start-screen').classList.add('hidden');
    document.getElementById('ach-list').innerHTML = g.meta.statsHtml() + g.meta.achievementsHtml();
    document.getElementById('achievements-screen').classList.remove('hidden');
  });
  document.getElementById('ach-back').addEventListener('click', () => {
    document.getElementById('achievements-screen').classList.add('hidden');
    g._showMenu();
  });
  document.getElementById('lb-back').addEventListener('click', () => { document.getElementById('leaderboard-screen').classList.add('hidden'); g._showMenu(); });
  document.getElementById('lb-tab-time').addEventListener('click', () => { document.getElementById('lb-tab-time').classList.add('active'); document.getElementById('lb-tab-kills').classList.remove('active'); g._renderLeaderboard('time'); });
  document.getElementById('lb-tab-kills').addEventListener('click', () => { document.getElementById('lb-tab-kills').classList.add('active'); document.getElementById('lb-tab-time').classList.remove('active'); g._renderLeaderboard('kills'); });
  document.getElementById('lb-mode-solo').addEventListener('click', () => { g._lbMode = 'solo'; document.getElementById('lb-mode-solo').classList.add('active'); document.getElementById('lb-mode-coop').classList.remove('active'); g._renderLeaderboard(g._lbSort || 'time'); });
  document.getElementById('lb-mode-coop').addEventListener('click', () => { g._lbMode = 'coop'; document.getElementById('lb-mode-coop').classList.add('active'); document.getElementById('lb-mode-solo').classList.remove('active'); g._renderLeaderboard(g._lbSort || 'time'); });
  document.getElementById('map-start').addEventListener('click', () => { document.getElementById('map-screen').classList.add('hidden'); g.startRun(g._selMap, g._selDiff); });
  document.getElementById('map-back').addEventListener('click', () => { document.getElementById('map-screen').classList.add('hidden'); g._showMenu(); });
  document.getElementById('win-menu').addEventListener('click', () => { document.getElementById('win-screen').classList.add('hidden'); g._quitToMenu(); });
  document.getElementById('win-replay').addEventListener('click', () => { document.getElementById('win-screen').classList.add('hidden'); g.startRun(g.mapKey, g.difficulty); });
  document.getElementById('win-endless').addEventListener('click', () => g._startEndless());
  document.getElementById('death-menu').addEventListener('click', () => { document.getElementById('death-screen').classList.add('hidden'); g._quitToMenu(); });
  document.getElementById('pause-resume').addEventListener('click', () => g._resumeFromPause());
  document.getElementById('pause-save').addEventListener('click', () => g._saveAndQuit());
  document.getElementById('pause-menu').addEventListener('click', () => g._quitToMenu());
  document.getElementById('pause-leave').addEventListener('click', () => { g.net.close(); g._leaveOnline(); document.getElementById('pause-screen').classList.add('hidden'); });
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Escape') g._onEsc();
    else if (e.code === 'KeyM') g.hud.toast(g.audio.toggleMute() ? 'Ton aus' : 'Ton an', 'gold');
  });
  // AudioContext bei erster Geste aktivieren
  const wake = () => g.audio.resume();
  window.addEventListener('pointerdown', wake);
  window.addEventListener('keydown', wake);
  document.getElementById('retry-button').addEventListener('click', () => g.startRun(g.mapKey, g.difficulty));
  document.getElementById('death-shop-button').addEventListener('click', () => g.openShop('death'));
  document.getElementById('lobby-create').addEventListener('click', () => g._lobbyCreate());
  document.getElementById('lobby-refresh').addEventListener('click', () => { if (g.net.connected) g.net.list(); });
  document.getElementById('lobby-start').addEventListener('click', () => g._hostStart());
  document.getElementById('lobby-back').addEventListener('click', () => {
    g.net.close();
    document.getElementById('lobby').classList.add('hidden');
    g._showMenu();
  });
  g.meta.onClose = () => g._afterShop();
  const lsv = document.getElementById('lobby-server');
  if (lsv) lsv.placeholder = Net.defaultUrl();
  g._wireSettings();
}
// -------------------------------------------------- Optionen
export function _applySettings(g) {
  const s = g.settings;
  g.audio.setSfxVolume(s.sfxVol);
  g.audio.setMusicVolume(s.musicVol);
  g.camCtrl.shakeScale = s.shake ? 1 : 0;
  if (g.fx) g.fx.showDmg = s.dmgNumbers;
  if (g.fx) g.fx.photoSafe = !!s.photoSafe;
  if (g.bloom) {
    g.bloom.enabled = s.bloom;
    g.bloom.strength = s.photoSafe ? 0.2 : 0.38; // Photosafe: deutlich weniger Glühen
  }
  document.body.classList.toggle('photosafe', !!s.photoSafe);
  if (g.pixelPass) g.pixelPass.enabled = s.pixelArt;
  if (g.renderer.shadowMap.enabled !== s.shadows) {
    g.renderer.shadowMap.enabled = s.shadows;
    g.scene.traverse((o) => { if (o.isMesh && o.material) o.material.needsUpdate = true; });
  }
  // Renderauflösung: skaliert den PixelRatio — größter Performance-Hebel für schwache Geräte
  const pr = Math.min(window.devicePixelRatio, 2) * (s.renderScale || 1) * (g._aq ? [1, 0.85, 0.7, 0.55][g._aq.level] : 1);
  if (Math.abs(g.renderer.getPixelRatio() - pr) > 0.001) {
    g.renderer.setPixelRatio(pr);
    g._onResize();
  }
}
export function _wireSettings(g) {
  const btn = document.getElementById('settings-button');
  if (btn) btn.addEventListener('click', () => g._openSettings('menu'));
  const pbtn = document.getElementById('pause-settings');
  if (pbtn) pbtn.addEventListener('click', () => g._openSettings('pause'));
  document.getElementById('settings-back').addEventListener('click', () => g._closeSettings());
  const save = () => {
    saveSettings(g.settings);
    g._applySettings();
  };
  const bindRange = (id, key) => {
    const el = document.getElementById(id);
    el.addEventListener('input', () => {
      g.settings[key] = el.value / 100;
      document.getElementById(id + '-val').textContent = `${el.value}%`;
      save();
    });
  };
  const bindToggle = (id, key) => {
    const el = document.getElementById(id);
    el.addEventListener('change', () => {
      g.settings[key] = el.checked;
      save();
      g.audio.ui();
    });
  };
  bindRange('set-music', 'musicVol');
  bindRange('set-scale', 'renderScale');
  bindRange('set-sfx', 'sfxVol');
  bindToggle('set-shake', 'shake');
  bindToggle('set-dmg', 'dmgNumbers');
  bindToggle('set-shadows', 'shadows');
  bindToggle('set-bloom', 'bloom');
  bindToggle('set-pixel', 'pixelArt');
  bindToggle('set-photosafe', 'photoSafe');
}
export function _openSettings(g, from) {
  g._settingsReturn = from;
  const s = g.settings;
  document.getElementById('set-music').value = Math.round(s.musicVol * 100);
  document.getElementById('set-music-val').textContent = `${Math.round(s.musicVol * 100)}%`;
  document.getElementById('set-sfx').value = Math.round(s.sfxVol * 100);
  document.getElementById('set-sfx-val').textContent = `${Math.round(s.sfxVol * 100)}%`;
  document.getElementById('set-scale').value = Math.round((s.renderScale || 1) * 100);
  document.getElementById('set-scale-val').textContent = `${Math.round((s.renderScale || 1) * 100)}%`;
  document.getElementById('set-shake').checked = s.shake;
  document.getElementById('set-dmg').checked = s.dmgNumbers;
  document.getElementById('set-shadows').checked = s.shadows;
  document.getElementById('set-bloom').checked = s.bloom;
  document.getElementById('set-pixel').checked = s.pixelArt;
  document.getElementById('set-photosafe').checked = !!s.photoSafe;
  document.getElementById(from === 'pause' ? 'pause-screen' : 'start-screen').classList.add('hidden');
  document.getElementById('settings-screen').classList.remove('hidden');
}
export function _closeSettings(g) {
  document.getElementById('settings-screen').classList.add('hidden');
  document.getElementById(g._settingsReturn === 'pause' ? 'pause-screen' : 'start-screen').classList.remove('hidden');
}
export function _showMenu(g) {
  g.mode = 'menu';
  if (g.audio) g.audio.setMusic('menu');
  clearTimeout(g._introTimer);
  const intro = document.getElementById('intro');
  if (intro) intro.classList.add('hidden');
  g._introT = 0;
  const ms = document.getElementById('menu-stats');
  if (ms) ms.textContent = `Gesammeltes Erz: ${g.meta.gold}`;
  const mn = document.getElementById('menu-name');
  if (mn) mn.textContent = g._playerName();
  document.getElementById('resume-button').classList.toggle('hidden', !g._hasSave());
  document.getElementById('start-screen').classList.remove('hidden');
}
// Kombinationen-Übersicht — aus dem Hauptmenü ODER dem Pause-Menü aufrufbar
export function _openCombos(g, from) {
  g._combosReturn = from;
  document.getElementById('combos-list').innerHTML = g.upgrades.combosListHtml();
  document.getElementById(from === 'pause' ? 'pause-screen' : 'start-screen').classList.add('hidden');
  document.getElementById('combos-screen').classList.remove('hidden');
}
// -------------------------------------------------- Name & Bestenliste
export function _playerName(g) {
  const el = document.getElementById('player-name');
  return ((el && el.value.trim()) || '') || 'Anonym';
}
export function _loadName(g) {
  try { const n = localStorage.getItem('gothicName'); if (n) document.getElementById('player-name').value = n; } catch (e) {}
}
// Start: ohne gespeicherten Namen zuerst den Pflicht-Namens-Screen zeigen
export function _bootFlow(g) {
  // Einmalige Fotosensitivitäts-Warnung VOR allem anderen (viele Licht-/Blitzeffekte!)
  let ack = false;
  try { ack = localStorage.getItem('gothicEpilepsyAck') === '1'; } catch (e) {}
  if (!ack) {
    const scr = document.getElementById('epilepsy-screen');
    scr.classList.remove('hidden');
    document.getElementById('epilepsy-ok').addEventListener('click', () => {
      try { localStorage.setItem('gothicEpilepsyAck', '1'); } catch (e) {}
      scr.classList.add('hidden');
      g.audio.ui();
      _bootName(g);
    }, { once: true });
    return;
  }
  _bootName(g);
}
function _bootName(g) {
  let name = '';
  try { name = (localStorage.getItem('gothicName') || '').trim(); } catch (e) {}
  if (name) g._showMenu();
  else g._showNameScreen();
}
export function _showNameScreen(g) {
  g.mode = 'menu';
  document.getElementById('start-screen').classList.add('hidden');
  const el = document.getElementById('player-name');
  const btn = document.getElementById('name-confirm');
  if (btn) btn.disabled = ((el && el.value.trim().length) || 0) === 0;
  document.getElementById('name-screen').classList.remove('hidden');
  try { el.focus(); } catch (e) {}
}
export function _confirmName(g) {
  const el = document.getElementById('player-name');
  const v = ((el && el.value) || '').trim();
  if (!v) { if (el) el.focus(); return; } // Pflicht: ohne Namen kein Weiter
  try { localStorage.setItem('gothicName', v); } catch (e) {}
  document.getElementById('name-screen').classList.add('hidden');
  g._showMenu();
}
export function _esc(g, s) {
  return String(s).replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
}
export function _openLeaderboard(g) {
  document.getElementById('start-screen').classList.add('hidden');
  document.getElementById('leaderboard-screen').classList.remove('hidden');
  document.getElementById('lb-tab-time').classList.add('active');
  document.getElementById('lb-tab-kills').classList.remove('active');
  g._renderLeaderboard('time');
}
// Server-Bestenliste laden (Postgres); leer/offline -> lokale Liste anzeigen
export async function _renderLeaderboard(g, sortBy) {
  g._lbSort = sortBy;
  const mode = g._lbMode || 'solo';
  const wantCoop = mode === 'coop';
  const el = document.getElementById('lb-list');
  el.innerHTML = '<div class="lb-empty">Lade…</div>';
  let server = null;
  try {
    const r = await fetch(`/api/scores?sort=${sortBy}&limit=50`);
    if (r.ok) { const data = await r.json(); if (Array.isArray(data)) server = data; }
  } catch (e) { /* Server nicht erreichbar */ }
  if (g._lbSort !== sortBy || (g._lbMode || 'solo') !== mode) return; // Tab wurde inzwischen gewechselt
  const byMode = (list) => list.filter((s) => !!s.coop === wantCoop);
  if (server && server.length) {
    const rows = byMode(server);
    if (rows.length) { g._renderLbRows(el, rows, true); return; }
  }
  // leer oder offline -> lokale Liste
  let local = [];
  try { local = JSON.parse(localStorage.getItem('gothicScores') || '[]'); } catch (e) {}
  local = byMode(local);
  local.sort((a, b) => (sortBy === 'kills' ? b.kills - a.kills : b.time - a.time));
  g._renderLbRows(el, local.slice(0, 15), false);
}
export function _renderLbRows(g, el, scores, global) {
  if (!scores || !scores.length) { el.innerHTML = '<div class="lb-empty">Noch keine Einträge — überlebe einen Run!</div>'; return; }
  const fmtT = (t) => `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
  let h = `<div class="lb-src">${global ? '🌐 Global' : '💾 Lokal (Server offline)'}</div>`;
  h += `<div class="lb-row lb-head"><span class="lb-rank">#</span><span class="lb-name">Name</span><span class="lb-val">Zeit</span><span class="lb-val">Kills</span><span class="lb-val">Stufe</span></div>`;
  scores.slice(0, 15).forEach((s, i) => {
    const nm = s.coop ? `🤝 ${g._esc(s.name)}` : g._esc(s.name);
    h += `<div class="lb-row"><span class="lb-rank">${i + 1}</span><span class="lb-name">${nm}${s.win ? ' 🏆' : ''}</span><span class="lb-val">${fmtT(s.time)}</span><span class="lb-val">${s.kills}</span><span class="lb-val">${s.level}</span></div>`;
  });
  el.innerHTML = h;
}
// -------------------------------------------------- Pause
export function _onEsc(g) {
  // Offene Unter-Screens (Kombinationen/Optionen) schließt ESC zuerst — zurück zur
  // richtigen Ebene (Pause bzw. Hauptmenü), statt das Spiel mit offenem Fenster fortzusetzen.
  const combos = document.getElementById('combos-screen');
  if (combos && !combos.classList.contains('hidden')) {
    combos.classList.add('hidden');
    document.getElementById(g._combosReturn === 'pause' ? 'pause-screen' : 'start-screen').classList.remove('hidden');
    return;
  }
  const settings = document.getElementById('settings-screen');
  if (settings && !settings.classList.contains('hidden')) {
    g._closeSettings();
    return;
  }
  if (g._specOnly && (g.mode === 'play' || g.mode === 'levelup')) { g._leaveOnline(); return; } // Zuschauer: ESC = raus
  if (g.mode === 'play') g._openPause();
  else if (g.mode === 'paused') g._resumeFromPause();
}
export function _openPause(g) {
  g.mode = 'paused';
  g.input.enabled = false;
  if (g.role === 'host' || g._broadcasting) g.net.send({ k: 'pause', on: true });
  if (g.role === 'client') g.net.send({ k: 'gpause', on: true }); // Host mit-pausieren
  const isClient = g.role === 'client';
  document.getElementById('pause-save').classList.toggle('hidden', isClient);
  document.getElementById('pause-menu').classList.toggle('hidden', isClient);
  document.getElementById('pause-leave').classList.toggle('hidden', !isClient);
  document.getElementById('pause-screen').classList.remove('hidden');
}
export function _resumeFromPause(g) {
  document.getElementById('pause-screen').classList.add('hidden');
  g.mode = 'play';
  g.input.enabled = true;
  if (g.role === 'host' || g._broadcasting) g.net.send({ k: 'pause', on: false });
  if (g.role === 'client') g.net.send({ k: 'gpause', on: false });
}
// Host: Gast hat sein Menü geöffnet/geschlossen -> Simulation mit-pausieren
export function _peerPause(g, on) {
  g._peerPaused = on;
  if (on) {
    if (g.mode === 'play') { g.mode = 'paused'; g.input.enabled = false; }
    g.hud.setPeerPause(true);
  } else {
    g.hud.setPeerPause(false);
    const ownPause = !document.getElementById('pause-screen').classList.contains('hidden');
    if (g.mode === 'paused' && !ownPause && !g._leveling) { g.mode = 'play'; g.input.enabled = true; }
  }
}
export function _saveAndQuit(g) {
  if (g._broadcasting) { g.net.close(); g._broadcasting = false; g._watchers = 0; }
  g._saveRun();
  document.getElementById('pause-screen').classList.add('hidden');
  if (g.role) g.net.close();
  g.role = null;
  if (g.remotePlayer) g.remotePlayer.group.visible = false;
  g.hud.hide();
  g._showMenu();
}
export function _quitToMenu(g) {
  if (g._broadcasting) { g.net.close(); g._broadcasting = false; g._watchers = 0; }
  // „Hauptmenü" aus einem laufenden Run = Run beenden -> Ergebnis zählt (wichtig für Endlos!)
  if ((g.mode === 'paused' || g.mode === 'play' || g.mode === 'levelup') && g.runElapsed > 20 && !g._specOnly && !g.levelWon) {
    g._recordScore(false);
    g._recordMeta(false);
    g._clearSave();
    g.hud.toast('Run beendet — Ergebnis in der Bestenliste gewertet', 'gold');
  }
  document.getElementById('pause-screen').classList.add('hidden');
  if (g.role) g.net.close();
  g.role = null;
  if (g.remotePlayer) g.remotePlayer.group.visible = false;
  g.hud.hide();
  g._showMenu();
}
// -------------------------------------------------- Map-/Schwierigkeits-/Heldenwahl
export function _renderSelectors(g, mapElId, diffElId, heroElId = null, heroDescId = null) {
  const mapEl = document.getElementById(mapElId);
  const diffEl = document.getElementById(diffElId);
  if (mapEl) {
    // gesperrte Karten (Achievements) mit 🔒 und Bedingung anzeigen
    if (!g.meta.mapUnlocked(g._selMap)) g._selMap = 'valley';
    mapEl.innerHTML = MAP_LIST.map((m) => {
      const locked = !g.meta.mapUnlocked(m.key);
      return `<button class="sel-btn ${m.key === g._selMap ? 'active' : ''} ${locked ? 'locked' : ''}" data-map="${m.key}" ${locked ? `disabled title="${g.meta.mapReq(m.key)}"` : ''}>${locked ? '🔒 ' : ''}${m.name}</button>`;
    }).join('');
    mapEl.querySelectorAll('[data-map]').forEach((b) => b.addEventListener('click', () => { g._selMap = b.getAttribute('data-map'); g._renderSelectors(mapElId, diffElId, heroElId, heroDescId); g._lobbyUpdate(); }));
  }
  if (diffEl) {
    if (!g.meta.diffUnlocked(g._selDiff)) g._selDiff = 'normal';
    diffEl.innerHTML = Object.keys(DIFFS).map((k) => {
      const locked = !g.meta.diffUnlocked(k);
      return `<button class="sel-btn ${k === g._selDiff ? 'active' : ''} ${locked ? 'locked' : ''}" data-diff="${k}" ${locked ? `disabled title="${g.meta.diffReq(k)}"` : ''}>${locked ? '🔒 ' : ''}${DIFFS[k].name}</button>`;
    }).join('');
    diffEl.querySelectorAll('[data-diff]:not([disabled])').forEach((b) => b.addEventListener('click', () => { g._selDiff = b.getAttribute('data-diff'); g._renderSelectors(mapElId, diffElId, heroElId, heroDescId); g._lobbyUpdate(); }));
  }
  if (heroElId) g._renderHeroSelector(heroElId, heroDescId, () => g._renderSelectors(mapElId, diffElId, heroElId, heroDescId));
}
export function _renderHeroSelector(g, elId, descId, rerender) {
  const el = document.getElementById(elId);
  if (!el) return;
  if (!g.meta.heroUnlocked(g._selHero)) g._selHero = 'soldier';
  el.innerHTML = HERO_KEYS.map((k) => {
    const h = HEROES[k];
    const locked = !g.meta.heroUnlocked(k);
    const face = `<img class="hero-face" src="sprites/${h.sprite || 'knight_m'}_f0.png" alt="" />`;
    return `<button class="sel-btn hero-btn ${k === g._selHero ? 'active' : ''} ${locked ? 'locked' : ''}" data-hero="${k}" ${locked ? `disabled title="${g.meta.heroReq(k)}"` : ''}>${locked ? '🔒' : face} ${h.name}</button>`;
  }).join('');
  const desc = document.getElementById(descId);
  if (desc) desc.textContent = (HEROES[g._selHero] || HEROES.soldier).desc;
  el.querySelectorAll('[data-hero]').forEach((b) => b.addEventListener('click', () => {
    g._selHero = b.getAttribute('data-hero');
    try { localStorage.setItem('gothicHero', g._selHero); } catch (e) {}
    // Gast in der Lobby: neue Heldenwahl direkt an den Host melden
    if (g.net && g.net.role === 'client' && g.net.connected) g._sendHeroInfo();
    rerender();
  }));
}
export function _openMapSelect(g) {
  document.getElementById('start-screen').classList.add('hidden');
  g._renderSelectors('map-maps', 'map-diffs', 'map-heroes', 'map-hero-desc');
  document.getElementById('map-screen').classList.remove('hidden');
}
export function openShop(g, from) {
  g._shopReturn = from;
  g.mode = 'shop';
  document.getElementById('start-screen').classList.add('hidden');
  document.getElementById('death-screen').classList.add('hidden');
  g.meta.show();
}
export function _afterShop(g) {
  if (g._shopReturn === 'death') {
    g.mode = 'dead';
    document.getElementById('death-screen').classList.remove('hidden');
  } else g._showMenu();
}
