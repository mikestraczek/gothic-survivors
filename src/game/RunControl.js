import { WEAPON_DEFS } from './Weapons.js';
import { HEROES, applyHero } from './Heroes.js';
import { DIFFS, PHASES, KILLS_PER_PHASE, MINI_BOSSES, INTRO_DUR } from './constants.js';

// Run-Lebenszyklus: Start/Reset/Speichern/Fortsetzen, Phasen-/Boss-Flow, Endlos-Modus,
// Level-Up-Flow (lokal + Gast), Verschmelzungen, Run-Ende (Sieg/Tod) + Score/Meta.
// Funktionen nehmen die Game-Instanz `g`.

// jeder Gegner-Tod schreibt Kills/Erz dem jeweiligen Spieler gut
export function _makeOnKill(g, p) {
  return (e) => {
    p.kills++;
    g._phaseKills++;
    g.audio.kill();
    p.gold += (e.def.gold || 0) * (e.xpMult || 1) * (p.goldMult || 1) * 0.55; // Erz ist kostbar
    g.fx.sparksBurst(e.x, e.y + 0.6, e.z, e.def.boss ? 0xff5a3a : 0xc89060, e.def.boss ? 26 : 7, e.def.boss ? 9 : 5);
    if (e.def.boss) {
      g._bossKills = (g._bossKills || 0) + 1;
      const gv = Math.max(8, Math.round(e.def.xp / 6));
      for (let i = 0; i < 9; i++) g.gems.spawn(e.x + (Math.random() - 0.5) * 5, e.z + (Math.random() - 0.5) * 5, gv);
      p.gold += 3 * (p.goldMult || 1);
      g.fx.explosion(e.x, e.z, 6, 0x9a4aff);
      g.camCtrl.addShake(0.55);
      g.hitStop(0.16);
      g.pickups.spawnAt('heal', e.x + 2, e.z);
      g.pickups.spawnAt('greed', e.x - 2, e.z);
      g.hud.toast('BOSS BESIEGT!', 'gold');
    } else {
      g.gems.spawn(e.x, e.z, e.def.xp * (e.xpMult || 1));
      if (e.elite) {
        g.fx.explosion(e.x, e.z, 3, 0xffd24a);
        g.camCtrl.addShake(0.25);
        // Truhen sind besonders — nur ~30% der Eliten lassen eine fallen
        if (Math.random() < 0.3) {
          g.pickups.spawnAt('chest', e.x, e.z);
          g.hud.toast(`⭐ ${g.enemies.eliteName(e)} besiegt — eine Truhe!`, 'gold');
        } else {
          g.hud.toast(`⭐ ${g.enemies.eliteName(e)} besiegt!`, 'gold');
        }
      }
    }
  };
}
export function _onKillFor(g, p) {
  return p === g.remotePlayer ? g._onKillP2 : g._onKillP1;
}
// Musik-Theme des aktuellen Levels
export function _musicTheme(g) {
  return (g.world && g.world.theme && g.world.theme.music) || (g.mapKey === 'swamp' ? 'swamp' : 'valley');
}
// Run-Statistiken in die Meta-Progression einrechnen + neue Achievements feiern
export function _recordMeta(g, win) {
  if (g._specOnly) return; // Zuschauer werten nichts
  const fresh = g.meta.recordRun({
    time: g.runElapsed,
    kills: g.player.kills,
    level: g.player.level,
    win,
    bossKills: g._bossKills || 0,
    evolves: g._evolvesThisRun || 0,
    goldEarned: Math.floor(g.player.gold),
    map: g.mapKey,
  });
  let delay = 400;
  for (const a of fresh) {
    setTimeout(() => {
      g.hud.toast(`🎖 Erfolg „${a.name}" — ${a.unlock} freigeschaltet!`, 'gold');
      g.audio.levelup();
    }, delay);
    delay += 900;
  }
}
// Tab-Schließen mitten im Run: Ergebnis noch schnell werten (sendBeacon überlebt das Entladen).
// Einmalig aus Game._preload registriert.
export function _installUnloadScore(g) {
  window.addEventListener('pagehide', () => {
    if (g._specOnly) return;
    if (!(g.mode === 'play' || g.mode === 'paused' || g.mode === 'levelup')) return;
    if (g.runElapsed < 20) return;
    const entry = {
      name: g._playerName(),
      time: Math.round(g.runElapsed),
      kills: g.player.kills,
      level: g.player.level,
      gold: Math.floor(g.player.gold),
      map: g.mapKey,
      coop: !!g.role,
      win: false,
      ts: Date.now(),
    };
    try {
      const scores = JSON.parse(localStorage.getItem('gothicScores') || '[]');
      scores.push(entry);
      scores.sort((a, b) => b.time - a.time);
      localStorage.setItem('gothicScores', JSON.stringify(scores.slice(0, 100)));
    } catch (e) { /* ignore */ }
    try {
      navigator.sendBeacon('/api/scores', new Blob([JSON.stringify(entry)], { type: 'application/json' }));
    } catch (e) { /* ignore */ }
  });
}

// Ergebnis eines Runs speichern: lokal (Cache) + an den Server (Postgres, best effort)
export function _recordScore(g, win) {
  if (g._specOnly) return; // Zuschauer werten nichts
  const coop = !!g.role;
  const entry = {
    name: g._playerName(),
    time: Math.round(g.runElapsed),
    kills: g.player.kills,
    level: g.player.level,
    gold: Math.floor(g.player.gold),
    map: g.mapKey,
    coop,
    win: !!win,
    ts: Date.now(),
  };
  // Koop: der Host meldet EINEN Team-Eintrag (beide Spieler zusammengezählt)
  if (coop && g.role === 'host' && g.remotePlayer) {
    entry.name = `${g._playerName()} & ${g._remoteName || 'Mitspieler'}`;
    entry.kills = g.player.kills + (g.remotePlayer.kills || 0);
    entry.level = Math.max(g.player.level, g.remotePlayer.level || 1);
    entry.gold = Math.floor(g.player.gold + (g.remotePlayer.gold || 0));
  }
  try {
    const scores = JSON.parse(localStorage.getItem('gothicScores') || '[]');
    scores.push(entry);
    scores.sort((a, b) => b.time - a.time);
    localStorage.setItem('gothicScores', JSON.stringify(scores.slice(0, 100)));
  } catch (e) { /* ignore */ }
  // Gast postet nicht — der Team-Eintrag des Hosts zählt (verhindert Doppel-Einträge)
  if (coop && g.role === 'client') return;
  try {
    fetch('/api/scores', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(entry) }).catch(() => {});
  } catch (e) { /* offline: nur lokal */ }
}
// -------------------------------------------------- Speichern / Fortsetzen
export function _hasSave(g) {
  try { return !!localStorage.getItem('gothicSurvivorsRun'); } catch { return false; }
}
export function _saveRun(g) {
  try {
    const data = {
      v: 2, player: g.player.serialize(), weapons: g.weapons.serialize(),
      elapsed: g.runElapsed, enemyElapsed: g.enemies.elapsed,
      map: g.mapKey, diff: g.difficulty, phaseIndex: g.phaseIndex, phaseKills: g._phaseKills, phaseStage: g.phaseStage, endless: g.endless,
      hero: g.heroKey, bossKills: g._bossKills || 0, evolves: g._evolvesThisRun || 0,
    };
    localStorage.setItem('gothicSurvivorsRun', JSON.stringify(data));
  } catch (e) { /* ignore */ }
}
export function _clearSave(g) {
  try { localStorage.removeItem('gothicSurvivorsRun'); } catch (e) {}
}
export function resumeRun(g) {
  let data;
  try { data = JSON.parse(localStorage.getItem('gothicSurvivorsRun')); } catch { return; }
  if (!data) return;
  g.role = null;
  if (g.remotePlayer) g.remotePlayer.group.visible = false;
  document.getElementById('start-screen').classList.add('hidden');
  document.getElementById('death-screen').classList.add('hidden');
  document.getElementById('win-screen').classList.add('hidden');
  g._applyLevel(data.map || 'valley', data.diff || 'normal');
  g.heroKey = data.hero || 'soldier';
  g._syncHeroSprites();
  g._bossKills = data.bossKills || 0;
  g._evolvesThisRun = data.evolves || 0;
  g.player.beginRun();
  g.player.applySave(data.player);
  g.player.lockedWeapons = g.meta.lockedWeaponSet();
  g.enemies.reset();
  g.gems.reset();
  g.pickups.reset();
  g.weapons.reset();
  g.weapons.loadSave(data.weapons);
  g.enemies.setDifficulty(DIFFS[g.difficulty] ? DIFFS[g.difficulty].mult : 1);
  g.runElapsed = data.elapsed || 0;
  g.enemies.elapsed = data.enemyElapsed || 0; // Schwierigkeit weiterführen
  g.phaseIndex = data.phaseIndex || 0;
  g._phaseKills = data.phaseKills || 0;
  g.enemies.phase = g.phaseIndex;
  g.endless = !!data.endless;
  g.phaseStage = data.phaseStage || 'horde';
  const c = g.player.position;
  if (g.endless) {
    g.enemies.autoBoss = true;
    g.enemies.spawnEnabled = true;
    g.enemies.bossTimer = 60;
    g.phaseStage = 'horde';
  } else if (g.phaseStage === 'final') {
    g.bossPhase = true;
    g.enemies.spawnScale = 0.6;
    const bt = (g.world.theme && g.world.theme.finalBoss) || 'boss';
    g._finalBoss = g.enemies.spawnBoss(bt, c.x, c.z, 2.6 * g.enemies.diff, 1.25, 'ENDBOSS');
  } else if (g.phaseStage === 'mini') {
    g.bossPhase = true;
    g.enemies.spawnScale = 0.55;
    const type = MINI_BOSSES[g.phaseIndex % MINI_BOSSES.length];
    g._miniBoss = g.enemies.spawnBoss(type, c.x, c.z, (0.4 + g.phaseIndex * 0.28) * g.enemies.diff, 0.75, 'ANFÜHRER');
  }
  g.pendingLevelUps = 0;
  g.pendingRemoteLevelUps = 0;
  g._leveling = false;
  g._onKillP1 = g._makeOnKill(g.player);
  g._lastHp = g.player.hp;
  g.fx.record = false; // Solo-Fortsetzung: keine Aufnahme
  g.fx.drain();
  g.hud.setSpectate(null);
  g.camCtrl.snap(g.player.position);
  g.hud.show();
  g.hud.toast('Run fortgesetzt!', 'gold');
  g.input.enabled = true;
  g._autosaveAcc = 0;
  g.mode = 'play';
  g.audio.setMusic(g._musicTheme());
}
export function _applyLevel(g, mapKey, diff) {
  g.mapKey = mapKey;
  g.difficulty = diff;
  if (g.world.themeKey !== mapKey) g.world.applyTheme(mapKey);
  g._syncGrade(); // Split-Toning ans Karten-Theme anpassen
  g.enemies.setDifficulty(DIFFS[diff] ? DIFFS[diff].mult : 1);
  g.enemies.autoBoss = false;
  g.enemies.spawnEnabled = true;
  g.enemies.spawnScale = 1;
  g.enemies.phase = 0;
  g.phaseIndex = 0;
  g._phaseKills = 0;
  g.bossPhase = false;
  g.phaseStage = 'horde'; // 'horde' | 'mini' | 'final'
  g.levelWon = false;
  g.endless = false;
  g._finalBoss = null;
  g._miniBoss = null;
}
export function _startEndless(g) {
  document.getElementById('win-screen').classList.add('hidden');
  g.endless = true;
  g.levelWon = false;
  g.bossPhase = false;
  g._finalBoss = null;
  g.enemies.spawnEnabled = true;
  g.enemies.spawnScale = 1;
  g.enemies.autoBoss = true; // wiederkehrende Bosse
  g.enemies.bossTimer = 55;
  g.enemies.bossInterval = 70; // Bosse kommen häufiger als im normalen Lauf (100)
  g._endlessTime = 0;
  g._endlessRamp = 0;
  g.player.dead = false;
  g.player.hp = g.player.maxHp;
  g.player.group.rotation.z = 0;
  if (g.role) {
    g.remotePlayer.dead = false;
    g.remotePlayer.hp = g.remotePlayer.maxHp;
    g.remotePlayer.group.rotation.z = 0;
  }
  g._lastHp = g.player.hp;
  g.input.enabled = true;
  g.mode = 'play';
  g.audio.levelup();
  g.hud.toast('ENDLOS-MODUS — überlebe so lange du kannst!', 'gold');
  g._playIntro();
  if (g.role === 'host') g.net.send({ k: 'endless' });
}
export function _phaseTick(g, dt) {
  if (g.endless) {
    g._endlessRamp = (g._endlessRamp || 0) + dt;
    g._endlessTime = (g._endlessTime || 0) + dt;
    if (g._endlessRamp > 14) {
      g._endlessRamp = 0;
      g.enemies.phase++; // zähere Gegner + mehr Spawns (schneller als zuvor)
    }
    // immer mehr Gegner gleichzeitig, je länger man überlebt (steiler)
    g.enemies.spawnScale = 1 + g._endlessTime / 45;
    g.enemies.maxAlive = 800;
    return;
  }
  if (g.levelWon) return;
  const c = g.player.position;
  if (g.phaseStage === 'horde') {
    // Gegner-Quota erfüllt -> Mini-Boss (Anführer) der Phase
    if (g._phaseKills >= g._phaseTarget()) {
      g.phaseStage = 'mini';
      g.bossPhase = true;
      g.enemies.spawnScale = 0.55; // weniger Adds, aber es kommen welche nach
      const type = MINI_BOSSES[g.phaseIndex % MINI_BOSSES.length];
      const mult = (0.4 + g.phaseIndex * 0.28) * g.enemies.diff;
      g._miniBoss = g.enemies.spawnBoss(type, c.x, c.z, mult, 0.75, 'ANFÜHRER');
      g.hud.toast('Anführer der Phase erschienen — besiege ihn!', 'blood');
    }
  } else if (g.phaseStage === 'mini') {
    if (g._miniBoss && !g._miniBoss.alive) {
      g.phaseIndex++;
      g._phaseKills = 0;
      g._miniBoss = null;
      if (g.phaseIndex >= PHASES) {
        g.phaseStage = 'final';
        g.enemies.spawnScale = 0.6;
        const bt = (g.world.theme && g.world.theme.finalBoss) || 'boss';
        g._finalBoss = g.enemies.spawnBoss(bt, c.x, c.z, 2.6 * g.enemies.diff, 1.25, 'ENDBOSS');
        g.hud.toast('DER ENDBOSS ERSCHEINT — schließe das Level ab!', 'blood');
      } else {
        g.phaseStage = 'horde';
        g.bossPhase = false;
        g.enemies.spawnScale = 1;
        g.enemies.phase = g.phaseIndex;
        g.hud.toast(`Phase ${g.phaseIndex + 1} von ${PHASES}`, 'gold');
        // Run-Event: Schrein der Barriere erscheint nach jedem besiegten Anführer
        const sa = Math.random() * Math.PI * 2;
        g.pickups.spawnAt('shrine', c.x + Math.cos(sa) * 9, c.z + Math.sin(sa) * 9);
        g.hud.toast('🕯 Ein Schrein der Barriere ist erschienen!', 'gold');

      }
    }
  } else if (g.phaseStage === 'final') {
    if (g._finalBoss && !g._finalBoss.alive) g._winLevel();
  }
}
export function _phaseTarget(g) {
  return KILLS_PER_PHASE[Math.min(g.phaseIndex, KILLS_PER_PHASE.length - 1)];
}
// Live-DPS: gleitender Mittelwert je Waffe aus dem kumulierten Schaden
// DPS = Gesamtschaden der Waffe / Zeit seit sie im Besitz ist (stabil, kein gleitender Mittelwert)
export function _updateDps(g, dt, dealt, weapons) {
  const tr = g._dps || (g._dps = { acc: 0 });
  tr.acc += dt;
  if (tr.acc < 0.25) return; // nur ~4x/s neu rendern
  tr.acc = 0;
  const elapsed = weapons ? weapons.elapsed : g.runElapsed;
  const since = (weapons && weapons.ownedSince) || {};
  const entries = [];
  for (const wid of Object.keys(dealt || {})) {
    const cur = dealt[wid];
    if (cur <= 0) continue;
    const dur = Math.max(1, elapsed - (since[wid] || 0));
    const info = weapons && weapons.displayInfo ? weapons.displayInfo(wid) : null;
    entries.push({ id: wid, total: cur, dps: cur / dur, name: info && info.name, icon: info && info.icon });
  }
  entries.sort((a, b) => b.total - a.total);
  g.hud.setDps(entries);
}
export function _warnSafeZones(g) {
  g.hud.bossBanner('IN DIE GRÜNEN ZONEN!');
  g.hud.toast('⚠ Grüne Fläche = sicher — sofort reinlaufen!', 'gold');
  g.audio.boss();
}
export function _phaseText(g) {
  if (g.endless) return 'ENDLOS';
  if (g.phaseStage === 'final') return 'ENDBOSS';
  const ph = `Phase ${Math.min(g.phaseIndex + 1, PHASES)}/${PHASES}`;
  if (g.phaseStage === 'mini') return `${ph} · ANFÜHRER`;
  return `${ph} · ${g._phaseKills}/${g._phaseTarget()}`;
}
export function _winLevel(g) {
  if (g._broadcasting) { g.net.send({ k: 'over', t: g.runElapsed, host: { lv: g.player.level, ki: g.player.kills }, guest: { lv: 0, ki: 0 }, dmg: {}, gk: g.enemies.displayName(g.player.lastHitBy) }); }
  g.mode = 'won';
  g.levelWon = true;
  g.input.enabled = false;
  g.audio.setMusic('menu');
  g.hud.setSpectate(null);
  g.hud.setBossBar(null);
  g._recordScore(true);
  g._recordMeta(true);
  g._clearSave();
  g.audio.levelup();
  const earned = Math.floor(g.player.gold);
  g.meta.addGold(earned);
  const m = Math.floor(g.runElapsed / 60), s = Math.floor(g.runElapsed % 60);
  let rows = `<div>Du — Stufe <b>${g.player.level}</b>, ${g.player.kills} Kills</div>`;
  if (g.role) rows += `<div>Mitspieler — Stufe <b>${g.remotePlayer.level}</b>, ${g.remotePlayer.kills} Kills</div>`;
  document.getElementById('win-stats').innerHTML = `
    <div>Zeit: <b>${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}</b></div>
    ${rows}
    <div class="death-gold">⛏ ${earned} Erz verdient &nbsp;·&nbsp; Gesamt: ${g.meta.gold}</div>
    <div class="dmg-breakdown">${g._dmgRowsHtml(g.weapons._dealt)}</div>`;
  document.getElementById('win-replay').classList.toggle('hidden', !!g.role); // Nochmal nur Solo
  document.getElementById('win-endless').classList.remove('hidden'); // Endlos: Solo + Host
  document.getElementById('win-screen').classList.remove('hidden');
  if (g.role === 'host') g.net.send({ k: 'won', t: g.runElapsed, host: { lv: g.player.level, ki: g.player.kills }, guest: { lv: g.remotePlayer.level, ki: g.remotePlayer.kills }, dmg: g.weapons2._dealt });
}
export function _clientWin(g, d) {
  g.mode = 'won';
  g.input.enabled = false;
  g.audio.setMusic('menu');
  g.hud.setSpectate(null);
  g.hud.setBossBar(null);
  g.weapons.hideGhosts();
  g.enemies.hideBolts();
  g.runElapsed = d.t || g.runElapsed;
  g._recordScore(true);
  g._recordMeta(true);
  const earned = Math.floor(g.player.gold);
  g.meta.addGold(earned);
  const m = Math.floor((d.t || 0) / 60), s = Math.floor((d.t || 0) % 60);
  document.getElementById('win-stats').innerHTML = `
    <div>Zeit: <b>${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}</b></div>
    <div>Du — Stufe <b>${d.guest.lv}</b>, ${d.guest.ki} Kills</div>
    <div>Mitspieler — Stufe <b>${d.host.lv}</b>, ${d.host.ki} Kills</div>
    <div class="death-gold">⛏ ${earned} Erz verdient &nbsp;·&nbsp; Gesamt: ${g.meta.gold}</div>
    <div class="dmg-breakdown">${g._dmgRowsHtml(d.dmg || g.weapons._dealt)}</div>`;
  document.getElementById('win-replay').classList.add('hidden');
  document.getElementById('win-endless').classList.add('hidden');
  document.getElementById('win-screen').classList.remove('hidden');
}
// -------------------------------------------------- Run-Start
// Cinematisches Intro beim Run-Start: Titel-Reveal + Kamera zieht sanft heran
export function _playIntro(g) {
  const el = document.getElementById('intro');
  if (el) {
    const theme = (g.world.theme && g.world.theme.name) || 'Die Kolonie';
    const diff = (DIFFS[g.difficulty] && DIFFS[g.difficulty].name) || '';
    el.querySelector('.intro-title').textContent = theme;
    el.querySelector('.intro-sub').textContent = diff ? `${diff} · Überlebe im Bann der Barriere` : 'Überlebe im Bann der Barriere';
    el.classList.remove('hidden', 'play');
    void el.offsetWidth; // Reflow -> Animation sauber neu starten
    el.classList.add('play');
    clearTimeout(g._introTimer);
    g._introTimer = setTimeout(() => el.classList.add('hidden'), Math.round(INTRO_DUR * 1000 + 200));
  }
  // Kamera weit setzen; die Zoom-Fahrt zieht sie im Loop heran
  g._introT = INTRO_DUR;
  g.camCtrl.zoom = 2.2;
  g.camCtrl.snap((g._camTarget ? g._camTarget() : g.player.position));
}
export function _resetCommon(g) {
  g.enemies.reset();
  g.gems.reset();
  g.pickups.reset();
  g.weapons.reset();
  g.weapons.add((HEROES[g.heroKey] || HEROES.soldier).start); // Startwaffe des Helden
  g.runElapsed = 0;
  g._bossKills = 0;
  g._evolvesThisRun = 0;
  g.pendingLevelUps = 0;
  g.pendingRemoteLevelUps = 0;
  g._leveling = false;
  g._dps = null;
  g._clientDealt = {};
  g._dpsSendAcc = 0;
  g._reviveProg = 0;
  g._clientRevive = 0;
  g.remoteInput.reviving = false;
  g._prevRemoteDead = false;
  g._lastStandActive = false;
  g._pings = [];
  // Solo: keine Effekt-Aufnahme nötig (Host schaltet sie danach ein)
  g.fx.record = false;
  g.fx.drain();
  g.hud.setDps([]);
  g.hud.setSpectate(null);
}
export function startRun(g, mapKey = g._selMap, diff = g._selDiff) {
  g.role = null;
  if (g.remotePlayer) g.remotePlayer.group.visible = false;
  document.getElementById('start-screen').classList.add('hidden');
  document.getElementById('death-screen').classList.add('hidden');
  document.getElementById('win-screen').classList.add('hidden');
  document.getElementById('shop').classList.add('hidden');
  g._applyLevel(mapKey, diff);
  g.player.beginRun();
  g.meta.applyToPlayer(g.player);
  g.heroKey = g._selHero;
  applyHero(g.player, g.heroKey);
  g._syncHeroSprites();
  g.player.lockedWeapons = g.meta.lockedWeaponSet();
  g._resetCommon();
  g._onKillP1 = g._makeOnKill(g.player);
  g._lastHp = g.player.hp;
  g.camCtrl.snap(g.player.position);
  g.hud.show();
  g.hud.toast(`${g.world.theme.name} · ${DIFFS[diff].name} — Phase 1/${PHASES}`, 'gold');
  g.input.enabled = true;
  g.mode = 'play';
  g._specOnly = false;
  g._broadcasting = false;
  g._watchers = 0;
  g.audio.setMusic(g._musicTheme());
  g._playIntro();
  g._startSoloBroadcast(); // Run im Lobby-Browser beobachtbar machen (best effort)
}
export function _collectXp(g, value, who) {
  g.audio.gem();
  const lv = who.addXp(value);
  if (who === g.player) g.pendingLevelUps += lv;
  else g.pendingRemoteLevelUps += lv;
}
// -------------------------------------------------- Level-Up (unabhängig je Spieler)
export function _maybeLevelUp(g) {
  if (g._leveling) return;
  if (g.pendingLevelUps > 0 || g.pendingRemoteLevelUps > 0) {
    // abgelehnte Kombinationen je Level-Up-Sequenz zurücksetzen (später erneut anbieten)
    g._declinedCombos = new Set();
    g._declinedRemoteCombos = new Set();
  }
  if (g.pendingLevelUps > 0) g._startLocalLevelUp();
  else if (g.pendingRemoteLevelUps > 0) g._startRemoteLevelUp();
}
export function _startLocalLevelUp(g) {
  g._leveling = true;
  g.audio.levelup();
  g.mode = 'levelup';
  g.input.enabled = false;
  if (g.role === 'host') g.net.send({ k: 'pause', on: true });
  g._presentLocal();
}
export function _presentLocal(g) {
  const cands = g.upgrades.generate(g.player, g.weapons);
  g.upgrades.present(
    cands.map((c) => ({ icon: c.icon, title: c.title, sub: c.sub, rarity: c.rarity })),
    (i) => {
      cands[i].apply();
      g.upgrades.close();
      g.pendingLevelUps = Math.max(0, g.pendingLevelUps - 1);
      g._endLevelUp();
    },
    g.player.level,
    'Dein Stufenaufstieg',
    g.player.rerolls,
    () => {
      if (g.player.rerolls > 0) {
        g.player.rerolls--;
        g._presentLocal();
      }
    },
    g.player.banishes,
    (i) => {
      if (g.player.banishes > 0 && cands[i] && cands[i].bid) {
        g.player.banishes--;
        g.player.banished.add(cands[i].bid);
        g.audio.ui();
        g._presentLocal();
      }
    }
  );
}
export function _startRemoteLevelUp(g) {
  g._leveling = true;
  g.mode = 'levelup';
  g.input.enabled = false;
  g._sendRemoteChoices();
  g.hud.toast('Mitspieler wählt ein Upgrade…', 'gold');
}
export function _sendRemoteChoices(g) {
  g._remoteCands = g.upgrades.generate(g.remotePlayer, g.weapons2);
  g.net.send({
    k: 'lvlup',
    choices: g._remoteCands.map((c) => ({ icon: c.icon, title: c.title, sub: c.sub, rarity: c.rarity })),
    level: g.remotePlayer.level,
    rerolls: g.remotePlayer.rerolls,
    banishes: g.remotePlayer.banishes,
  });
}
export function _hostRerollRemote(g) {
  if (g.remotePlayer.rerolls > 0) {
    g.remotePlayer.rerolls--;
    g._sendRemoteChoices();
  }
}
export function _hostBanishRemote(g, i) {
  const rp = g.remotePlayer;
  if (rp.banishes > 0 && g._remoteCands && g._remoteCands[i] && g._remoteCands[i].bid) {
    rp.banishes--;
    rp.banished.add(g._remoteCands[i].bid);
    g._sendRemoteChoices();
  }
}
export function _hostApplyRemotePick(g, i) {
  if (g._remoteCands && g._remoteCands[i]) g._remoteCands[i].apply();
  g._remoteCands = null;
  g.pendingRemoteLevelUps = Math.max(0, g.pendingRemoteLevelUps - 1);
  g._endLevelUp();
}
export function _endLevelUp(g) {
  if (g.pendingLevelUps > 0) return g._startLocalLevelUp();
  if (g.pendingRemoteLevelUps > 0) return g._startRemoteLevelUp();
  if (g._resolveCombos()) return; // erst Kombinationen anbieten
  g._finishLevelUp();
}
export function _finishLevelUp(g) {
  g._leveling = false;
  g.mode = 'play';
  g.input.enabled = true;
  if (g.role === 'host') g.net.send({ k: 'pause', on: false });
}
// Bietet anstehende Verschmelzungen an (eine nach der anderen). true = Popup gezeigt, Spiel bleibt pausiert.
export function _resolveCombos(g) {
  const local = g.upgrades.availableCombos(g.player, g.weapons, g._declinedCombos);
  if (local.length) {
    const c = local[0];
    g.mode = 'levelup';
    g.input.enabled = false;
    g.upgrades.presentCombo(
      c,
      () => {
        g.weapons.combine(c, g.player);
        g._evolvesThisRun = (g._evolvesThisRun || 0) + 1;
        g.audio.levelup();
        g.hud.toast(`${c.name} — verschmolzen! Waffenslot frei.`, 'gold');
        const pp = g.player.position;
        g.fx.ring(pp.x, pp.z, 6, 0xffd24a);
        g.fx.sparksBurst(pp.x, pp.y + 1.2, pp.z, 0xffd24a, 24, 8);
        g.camCtrl.addShake(0.35);
        g.hitStop(0.2);
        g.upgrades.close();
        g._endLevelUp();
      },
      () => { g._declinedCombos.add(c.key); g.upgrades.close(); g._endLevelUp(); }
    );
    return true;
  }
  // Koop: Kombination des Gastes (Host erkennt sie über weapons2)
  if (g.role === 'host') {
    const rem = g.upgrades.availableCombos(g.remotePlayer, g.weapons2, g._declinedRemoteCombos);
    if (rem.length) {
      g._pendingRemoteCombo = rem[0];
      g.net.send({ k: 'combo', key: rem[0].key, base: rem[0].base, consume: rem[0].consume, passive: rem[0].passive, passiveCount: rem[0].passiveCount, name: rem[0].name, desc: rem[0].desc });
      g.hud.toast('Mitspieler entscheidet über eine Kombination…', 'gold');
      return true;
    }
  }
  return false;
}
// Client: eigener Stufenaufstieg (Auswahl lokal, Ergebnis an Host)
export function _clientLevelUp(g, d) {
  g.audio.levelup();
  g.mode = 'levelup';
  g.input.enabled = false;
  g.upgrades.present(
    d.choices,
    (i) => {
      g.net.send({ k: 'pick', i });
      g.upgrades.close();
      g.mode = 'play';
      g.input.enabled = true;
    },
    d.level,
    'Dein Stufenaufstieg',
    d.rerolls || 0,
    () => g.net.send({ k: 'reroll' }),
    d.banishes || 0,
    (i) => g.net.send({ k: 'banish', i })
  );
}
// -------------------------------------------------- Ende
export function _dmgRowsHtml(g, dealt) {
  const ents = Object.entries(dealt || {}).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  if (!ents.length) return '';
  let h = '<div class="dmg-title">Schaden pro Waffe</div>';
  for (const [id, v] of ents) {
    const info = g.weapons && g.weapons.displayInfo ? g.weapons.displayInfo(id) : null;
    const name = (info && info.name) || (WEAPON_DEFS[id] && WEAPON_DEFS[id].name) || id;
    h += `<div class="dmg-row"><span>${name}</span><span>${Math.round(v).toLocaleString('de-DE')}</span></div>`;
  }
  return h;
}
export function _endRun(g) {
  if (g._broadcasting) { g.net.send({ k: 'over', t: g.runElapsed, host: { lv: g.player.level, ki: g.player.kills }, guest: { lv: 0, ki: 0 }, dmg: {}, gk: g.enemies.displayName(g.player.lastHitBy) }); }
  g.mode = 'dead';
  g.input.enabled = false;
  g.audio.setMusic('menu');
  g.hud.setSpectate(null);
  g._recordScore(false);
  g._recordMeta(false);
  g._clearSave(); // beendeter Run ist nicht mehr fortsetzbar
  const earned = Math.floor(g.player.gold);
  g.meta.addGold(earned);
  const m = Math.floor(g.runElapsed / 60);
  const s = Math.floor(g.runElapsed % 60);
  const killer = g.enemies.displayName(g.player.lastHitBy);
  let rows = `<div>Du — Stufe <b>${g.player.level}</b>, ${g.player.kills} Kills</div>`;
  if (g.role) rows += `<div>Mitspieler — Stufe <b>${g.remotePlayer.level}</b>, ${g.remotePlayer.kills} Kills</div>`;
  document.getElementById('death-stats').innerHTML = `
    <div>Überlebt: <b>${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}</b></div>
    <div class="death-killer">☠ Gefallen durch <b>${killer}</b></div>
    ${rows}
    <div class="death-gold">⛏ ${earned} Erz verdient &nbsp;·&nbsp; Gesamt: ${g.meta.gold}</div>
    <div class="dmg-breakdown">${g._dmgRowsHtml(g.weapons._dealt)}</div>`;
  document.getElementById('retry-button').classList.toggle('hidden', !!g.role); // Neuer Run nur Solo
  document.getElementById('death-shop-button').classList.toggle('hidden', !!g.role);
  document.getElementById('death-screen').classList.remove('hidden');
  if (g.role === 'host') {
    g.net.send({ k: 'over', t: g.runElapsed, host: { lv: g.player.level, ki: g.player.kills }, guest: { lv: g.remotePlayer.level, ki: g.remotePlayer.kills }, dmg: g.weapons2._dealt, gk: g.enemies.displayName(g.remotePlayer.lastHitBy) });
  }
}
export function _clientGameOver(g, d) {
  g.mode = 'dead';
  g.input.enabled = false;
  g.audio.setMusic('menu');
  g.hud.setSpectate(null);
  g.weapons.hideGhosts();
  g.enemies.hideBolts();
  g.runElapsed = d.t || g.runElapsed;
  g._recordScore(false);
  g._recordMeta(false);
  const earned = Math.floor(g.player.gold);
  g.meta.addGold(earned);
  const m = Math.floor((d.t || 0) / 60);
  const s = Math.floor((d.t || 0) % 60);
  document.getElementById('death-stats').innerHTML = `
    <div>Überlebt: <b>${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}</b></div>
    <div class="death-killer">☠ Gefallen durch <b>${d.gk || 'einem Gegner'}</b></div>
    <div>Du — Stufe <b>${d.guest.lv}</b>, ${d.guest.ki} Kills</div>
    <div>Mitspieler — Stufe <b>${d.host.lv}</b>, ${d.host.ki} Kills</div>
    <div class="death-gold">⛏ ${earned} Erz verdient &nbsp;·&nbsp; Gesamt: ${g.meta.gold}</div>
    <div class="dmg-breakdown">${g._dmgRowsHtml(d.dmg || g.weapons._dealt)}</div>`;
  document.getElementById('retry-button').classList.add('hidden');
  document.getElementById('death-shop-button').classList.add('hidden');
  document.getElementById('death-screen').classList.remove('hidden');
}

// -------------------------------------------------- Map-Specials (Host-seitig, je Karte eins)
// Frontlinie: fahrbarer Panzer · Hohlweg: durchrasende Lore · Neon-Distrikt: Boost-Pads ·
// Sumpf: Morast bremst · Tal: die Barriere schleudert Blitze auf Gegner.
export function _updateMapSpecials(g, dt) {
  const w = g.world;
  const ps = g._players();

  // Boost-/Morast-Zustand aller Spieler
  for (const p of ps) {
    if (p.boost > 0) p.boost -= dt;
    p.mud = false;
    if (w.bogPools && !p.dead) {
      for (const pool of w.bogPools) {
        if (Math.hypot(p.position.x - pool.x, p.position.z - pool.z) < pool.r) { p.mud = true; break; }
      }
    }
  }

  // --- Frontlinie 1944: Panzer (mehrere, mit Respawn-Timer) ---
  if (w.tanks) {
    for (const t of w.tanks) {
      const driver = ps.find((p) => p.vehicle && p.vehicle.tank === t);
      if (driver) {
        driver.vehicle.t -= dt;
        t.group.visible = true;
        t.group.position.set(driver.position.x, driver.position.y, driver.position.z);
        t.group.rotation.y = -driver.yaw + Math.PI / 2; // Rohr in Blickrichtung (Modell zeigt +X)
        // Ketten überrollen alles
        const crushed = g.enemies.inRadius(driver.position.x, driver.position.z, 2.0);
        const ok = g._onKillFor(driver);
        for (const e of crushed) g.enemies.damage(e, 160 * dt + 2, { x: (e.x - driver.position.x) * 2, z: (e.z - driver.position.z) * 2 }, ok);
        // Kanone feuert automatisch auf den nächsten Gegner
        driver.vehicle.gun -= dt;
        if (driver.vehicle.gun <= 0) {
          driver.vehicle.gun = 1.6;
          const tgt = g.enemies.nearest(driver.position.x, driver.position.z, 18);
          if (tgt) {
            g.fx.explosion(tgt.x, tgt.z, 3, 0xffa040);
            g.camCtrl.addShake(0.16);
            g.audio.kill();
            for (const e of g.enemies.inRadius(tgt.x, tgt.z, 3)) g.enemies.damage(e, 90, null, ok);
          }
        }
        if (driver.vehicle.t <= 0) {
          driver.vehicle = null;
          t.group.visible = false;
          t.respawn = 45; // Nachschub rollt automatisch an
          g._toastFor(driver, '🛢 Treibstoff leer — Panzer verlassen (Nachschub in 45s)', 'gold');
        }
        continue;
      }
      if (t.taken) {
        // verbraucht: Respawn-Timer läuft
        t.respawn -= dt;
        if (t.respawn <= 0) {
          t.taken = false;
          t.group.visible = true;
          t.group.position.set(t.homeX, w.getHeight(t.homeX, t.homeZ), t.homeZ);
          t.group.rotation.y = 0;
          t.collider.r = 1.6;
          t.collider.x = t.homeX;
          t.collider.z = t.homeZ;
          g.hud.toast('🛡 Nachschub: Ein neuer Panzer ist eingetroffen!', 'gold');
        }
        continue;
      }
      // Einsteigen
      for (const p of ps) {
        if (p.dead || p.vehicle) continue;
        if (Math.hypot(p.position.x - t.group.position.x, p.position.z - t.group.position.z) < 2.4) {
          t.taken = true;
          t.respawn = 45;
          t.collider.r = 0;
          p.vehicle = { t: 22, gun: 0.6, tank: t };
          g._toastFor(p, '🛡 PANZER! 22 Sekunden — überrolle alles!', 'gold', 'levelup');
          g.camCtrl.addShake(0.3);
          break;
        }
      }
    }
  }

  // --- Hohlweg: Minen-Lore rast durch ---
  if (w.lore) {
    const lo = w.lore;
    if (!lo.active) {
      lo.timer -= dt;
      if (lo.timer <= 0) {
        lo.active = true;
        lo.dir = Math.random() > 0.5 ? 1 : -1;
        lo.x = -lo.dir * 375;
        lo.timer = 12 + Math.random() * 8; // rollt deutlich öfter
        g.hud.toast('⚠ LORE IM ANMARSCH — runter vom Gleis!', 'blood');
        g.audio.boss();
      }
    } else {
      lo.x += lo.dir * 30 * dt;
      lo.group.visible = true;
      lo.group.position.set(lo.x, w.getHeight(lo.x, 0) + 0.1, 0);
      // überrollt Gegner (mit Wucht) …
      const hit = g.enemies.inRadius(lo.x, 0, 1.8);
      for (const e of hit) g.enemies.damage(e, 400 * dt + 50, { x: lo.dir * 6, z: e.z > 0 ? 4 : -4 }, g._onKillP1);
      // … und unvorsichtige Spieler
      for (const p of ps) {
        if (!p.dead && Math.abs(p.position.z) < 1.3 && Math.abs(p.position.x - lo.x) < 1.7) p.takeDamage(22, 'lore');
      }
      if (Math.abs(lo.x) > 378) {
        lo.active = false;
        lo.group.visible = false;
      }
    }
  }

  // --- Neon-Distrikt: Boost-Pads ---
  if (w.boostPads) {
    for (const pad of w.boostPads) {
      pad.cd = Math.max(0, pad.cd - dt);
      if (pad.cd > 0) continue;
      for (const p of ps) {
        if (p.dead) continue;
        if (Math.hypot(p.position.x - pad.x, p.position.z - pad.z) < 1.5) {
          pad.cd = 3.5;
          p.boost = 3.5;
          g.fx.ring(pad.x, pad.z, 3, 0x2fd0ff);
          g._toastFor(p, '⚡ Boost!', 'gold', 'pickup');
          break;
        }
      }
    }
  }

  // --- Tal der Kolonie: die Barriere zürnt (Blitz auf einen zufälligen Gegner) ---
  if (g.mapKey === 'valley') {
    g._barrierBoltT = (g._barrierBoltT ?? 14) - dt;
    if (g._barrierBoltT <= 0) {
      g._barrierBoltT = 14 + Math.random() * 8;
      const list = g.enemies.inRadius(g.player.position.x, g.player.position.z, 26);
      // Kettenblitz: bis zu 3 zufällige Ziele
      const n = Math.min(3, list.length);
      for (let i = 0; i < n; i++) {
        const e = list[Math.floor(Math.random() * list.length)];
        if (!e.alive) continue;
        g.fx.bolt(e.x, e.z);
        g.enemies.damage(e, 180, null, g._onKillP1);
      }
      if (n) {
        g.hud.toast('⚡ Die Barriere zürnt!', 'gold');
        g.audio.kill();
      }
    }
  }

  // --- Sumpf: Gift-Geysire — Tümpel speien periodisch und verätzen Gegner darin ---
  if (w.bogPools) {
    g._geyserT = (g._geyserT ?? 6) - dt;
    if (g._geyserT <= 0) {
      g._geyserT = 7 + Math.random() * 5;
      const pool = w.bogPools[Math.floor(Math.random() * w.bogPools.length)];
      g.fx.ring(pool.x, pool.z, pool.r, 0x6abf3a);
      g.fx.sparksBurst(pool.x, 0.8, pool.z, 0x6abf3a, 16, 6);
      const hit = g.enemies.inRadius(pool.x, pool.z, pool.r);
      for (const e of hit) g.enemies.damage(e, 45, null, g._onKillP1, 1.2);
      if (hit.length) g.hud.toast('🫧 Gift-Geysir!', 'gold');
    }
  }
}
