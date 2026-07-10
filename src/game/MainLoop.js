import * as THREE from 'three';
import { SNAP_HZ, INPUT_HZ, INTRO_DUR } from './constants.js';

// Frame-Loop: zentraler update() plus Host-/Client-Spielzweig, Minimap/Kampf-UI,
// Touch-UI-Sichtbarkeit. Funktionen nehmen die Game-Instanz `g`.

export function _players(g) {
  return g.role ? [g.player, g.remotePlayer] : [g.player];
}
export function _camTarget(g) {
  if (g.role && g.player.dead && g.remotePlayer && !g.remotePlayer.dead) return g.remotePlayer.position;
  return g.player.position;
}
export function _drawMinimap(g) {
  const self = g.player.position;
  const allies = g.role ? [{ x: g.remotePlayer.position.x, z: g.remotePlayer.position.z, dead: g.remotePlayer.dead }] : [];
  let enemies;
  if (g.role === 'client') enemies = (g.enemies._ghostList || []).map((gh) => ({ x: gh.x, z: gh.z, boss: gh.def && gh.def.boss }));
  else enemies = g.enemies.enemies.filter((e) => e.alive).map((e) => ({ x: e.x, z: e.z, boss: e.def.boss }));
  // Truhen bleiben eine Überraschung — nicht auf der Minimap; alle anderen Items mit Typ (Farbe)
  const pickups = g.pickups.items.filter((it) => it.alive && it.type !== 'chest').map((it) => ({ x: it.x, z: it.z, t: it.type }));
  // Weltgrenze für die Minimap (radiale Arena oder Korridor)
  const bounds = g.world.theme.bounds === 'corridor'
    ? { kind: 'corridor', halfZ: 13, halfX: 380 }
    : { kind: 'radial', r: g.world.barrierRadius };
  const storm = (g._shrink && g._stormR != null && bounds.kind === 'radial') ? g._stormR : null;
  g.hud.drawMinimap(self, allies, enemies, pickups, g._pings, bounds, storm);
}
// Lebensbalken über beschädigten Gegnern + Boss-Balken oben
export function _drawCombatUI(g) {
  const cam = g.camera;
  const w = window.innerWidth;
  const h = window.innerHeight;
  const v = g._projV || (g._projV = new THREE.Vector3());
  const client = g.role === 'client';
  const src = client ? g.enemies._ghostList || [] : g.enemies.enemies;
  const px = g.player.position.x;
  const pz = g.player.position.z;
  const list = [];
  for (const e of src) {
    if (!client && !e.alive) continue;
    const def = e.def;
    const boss = !!(def && def.boss);
    const frac = client ? (e.hpFrac ?? 1) : e.hp / e.maxHp;
    if (frac >= 0.999 && !boss) continue; // nur beschädigte (Boss immer)
    const top = e.y + (def ? def.scale : 1) * 2.0 + (boss ? 2.2 : 0.5);
    v.set(e.x, top, e.z).project(cam);
    if (v.z > 1 || v.x < -1.05 || v.x > 1.05 || v.y < -1.05 || v.y > 1.05) continue;
    const dx = e.x - px;
    const dz = e.z - pz;
    list.push({ sx: (v.x * 0.5 + 0.5) * w, sy: (-v.y * 0.5 + 0.5) * h, frac, boss, d2: dx * dx + dz * dz });
  }
  list.sort((a, b) => a.d2 - b.d2);
  g.hud.drawEnemyBars(list.slice(0, 60));
  const bi = g.enemies.bossInfo(client);
  g.hud.setBossBar(bi ? bi.name : null, bi ? bi.frac : 0);
  // Musik: Boss-Theme solange ein Boss lebt, sonst Karten-Theme
  if (g.mode === 'play') g.audio.setMusic(bi ? 'boss' : g._musicTheme());
  // Boss-Erscheinen beim Gast (Host kündigt schon via bossAnnounce an)
  if (bi && !g._bossSeen) {
    g._bossSeen = true;
    if (client) {
      g.hud.bossBanner(`${bi.name} ERSCHEINT`);
      g.audio.boss();
    }
  } else if (!bi) {
    g._bossSeen = false;
  }
}
export function update(g) {
  const rawDt = Math.min(0.05, g.clock.getDelta());
  g._rawDt = rawDt; // Rohzeit (ungestreckt) — der Cinematic-Director führt seine Timeline damit
  // Sprite-Animations-Uhr: läuft IMMER lokal weiter — der Client bekommt runElapsed
  // nur sekundengenau aus Snapshots, damit ruckelte die Helden-Animation beim Gast
  g._animT = (g._animT || 0) + rawDt;
  // Gameplay-Attestierung: alle 15 s ein Heartbeat an den Server (belegt den Kill-Verlauf
  // für die Bestenliste — ohne diesen Strom zählen keine Kills)
  if (g.mode === 'play' && g._runToken && g.meta && g.meta.online && !g._specOnly && !g._versus) {
    g._hbAcc = (g._hbAcc || 0) + rawDt;
    if (g._hbAcc >= 15) { g._hbAcc = 0; g._sendHeartbeat(); }
  }
  // Level-Up-Auswahl per Taste 1-3: derselbe Tastendruck liegt im nächsten Frame noch im
  // Input-Puffer und würde sofort ein Emote (Digit1-4) auslösen -> kurz stummschalten
  if (g._lastMode === 'levelup' && g.mode !== 'levelup') g._emoteMuteUntil = performance.now() + 400;
  g._lastMode = g.mode;
  let dt = rawDt;
  if (g._hitStopT > 0) {
    g._hitStopT -= rawDt;
    dt = rawDt * 0.06; // fast eingefroren, aber nicht hart 0 (Kamera/Effekte atmen weiter)
  } else if (g.timeScale != null && g.timeScale !== 1) {
    dt = rawDt * g.timeScale; // globale Zeitlupe (Cinematic-Director)
  }
  if (g._introT > 0) { g._introT = Math.max(0, g._introT - dt); g.camCtrl.zoom = 1 + 1.2 * (g._introT / INTRO_DUR); }
  const camp = g._camTarget ? g._camTarget() : (g.player && g.player.position);
  g.world.update(dt, g.world.time + dt, camp); // Wetter folgt dem Kamera-Ziel
  if (g.player && g.playerLight) {
    g.playerLight.position.set(camp.x, camp.y + 5, camp.z);
    g.playerFill.position.set(camp.x + 6, camp.y + 14, camp.z + 6);
    g.playerFill.target.position.set(camp.x, camp.y, camp.z);
  }
  // Bei offenem Level-Up-/Pause-Menü Simulation einfrieren -> Boss-Telegraphen (Einschläge/Safe-Zonen)
  // bleiben sichtbar stehen, statt in der Menüzeit auszulaufen.
  const frozen = g.mode === 'levelup' || g.mode === 'paused' || (g.role === 'client' && g._clientPaused);
  if (g.fx) g.fx.update(frozen ? 0 : dt);

  if (g.mode === 'play') g._autoQuality(); // FPS-Wächter: Renderauflösung dynamisch
  if (g.mode === 'play' || g.mode === 'levelup') {
    // Endgame-Sichtbarkeit: je voller das Feld, desto dezenter Funken & Bloom
    const alive = g.role === 'client' ? g.enemies.ghostCount : g.enemies.aliveCount;
    const crowd = Math.min(1, Math.max(0, (alive - 40) / 100)); // ab 40 Gegnern dämpfen
    g.fx.crowd = crowd;
    if (g.bloom && g._bloomBase == null) g._bloomBase = g.bloom.strength;
    if (g.bloom && g._bloomBase != null) g.bloom.strength = g._bloomBase * (1 - 0.6 * crowd);
  }
  if (g.mode === 'play' && g.role !== 'client') g._updatePlayHost(dt);
  else if (g.mode === 'play' && g.role === 'client') g._updatePlayClient(dt);
  else {
    if (g.player) {
      g.player.mixer.update(dt);
      if (g.role && g.remotePlayer) g.remotePlayer.mixer.update(dt);
      g.camCtrl.update(dt, null, g._camTarget());
    }
    g.hud.setDanger(false);
    g.hud.setWrath(0);
  }

  // Sturmwand (Modus „Letzter Überlebender"): dauerhafte Grenze der sicheren Zone — Host wie Gast
  if (g._shrink && g.mode === 'play' && g._stormR != null) g.world.updateStorm(g._stormR);
  else g.world.hideStorm();

  // Koop-Features: Buffs, Panel, Revive-Hinweis, Mate-Pfeil, Tod-Meldung, Ping/Emote-Eingabe
  // Ping funktioniert in Solo UND Koop
  if (g.mode === 'play') g._pingInput();
  g._decayPings(dt);
  g.hud.setRoot(g.mode === 'play' && g.player.rooted > 0 ? g.player.rooted : 0);

  if (g.role && g.remotePlayer) {
    g._updateBuffs();
    const buffs = [];
    if (g.player.lastStand) buffs.push({ icon: '🔥', name: 'Last Stand', desc: '+30% Schaden, +25% Tempo — bis dein Mate wieder steht' });
    if (g.player.aura) buffs.push({ icon: '✨', name: 'Nähe-Bonus', desc: '+12% Schaden & Extra-Regeneration in Mate-Nähe' });
    g.hud.setBuffs(buffs);
    g._updateAllyPanel();
    g._updateRevivePrompt();
    g._updateMateArrow();
    g._coopDeathWatch();
    g._coopInput();
  } else {
    g.hud.setAlly(null);
    g.hud.setRevivePrompt(null);
    g.hud.setMateArrow(null);
    g.hud.setBuffs(null);
  }

  // Verletzungs-Feedback: Sound + Shake + Hit-Stop + rote Schadenszahl (funktioniert auch beim Gast,
  // dessen HP autoritativ per Snapshot kommen)
  if (g.mode === 'play' && g.player) {
    if (g._lastHp == null) g._lastHp = g.player.hp;
    if (!g.player.dead && g.player.hp < g._lastHp - 2) {
      g.audio.hurt();
      g.camCtrl.addShake(0.3);
      g.hitStop(0.05);
      g.player.hitFlash = 0.2;
      const lost = Math.round(g._lastHp - g.player.hp);
      const pp = g.player.position;
      const wasRec = g.fx.record;
      g.fx.record = false; // lokales Feedback, nicht an den Gast doppeln
      g.fx.dmgNumber(pp.x, pp.y + 3.4, pp.z, lost, '#ff5a4a', lost >= 25);
      g.fx.record = wasRec;
    }
    g._lastHp = g.player.hp;
    const dashing = g.player.dashTime > 0;
    if (dashing && !g._wasDash) {
      g.fx.sparksBurst(g.player.position.x, 1.0, g.player.position.z, 0xcfe6ff, 8, 7);
      g.audio.pickup();
    }
    g._wasDash = dashing;
  }

  g._syncTouchUi();
  g.input.endFrame();
  // Cinematic-Director: übernimmt NACH der Simulation die Kamera (Position/Blick/FOV),
  // steuert Slow-Mo, Spawns und Titelkarten — direkt vor dem Render, damit er alles überschreibt.
  if (g._cine) g._cine.update(g._rawDt);
  g.composer.render();
}
// Touch-Steuerung nur während des Spielens einblenden
export function _syncTouchUi(g) {
  const want = g.input.isTouch && (g.mode === 'play' || g.mode === 'levelup' || g.mode === 'paused');
  if (want !== g._touchUiOn) {
    g._touchUiOn = want;
    const el = document.getElementById('touch-ui');
    if (el) el.classList.toggle('hidden', !want);
  }
}
export function _updatePlayHost(g, dt) {
  g.runElapsed += dt;
  const co = g.role === 'host';
  g.player.update(dt, g.input);
  if (g.player.rooted > 0) g.player.mashFree(0.2 *g._mashCount());
  if (co) g.remotePlayer.update(dt, g.remoteInput);
  if (co) g._tickRevive(dt);
  g.camCtrl.update(dt, g.input, g._camTarget());
  g._updateCamRight();

  const ps = g._players();
  // Schrein-Segen: Timer runterzählen; solo den Schadensbonus direkt setzen
  // (im Koop rechnet _updateBuffs den Segen mit ein)
  for (const p of ps) if (p.blessing > 0) p.blessing -= dt;
  if (!co) {
    g.player.dmgMult = g.player.blessing > 0 ? 1.4 : 1;
    // Map-Special-Tempofaktoren (Boost-Pad, Morast, Panzer)
    g.player.speedMult = (g.player.boost > 0 ? 1.5 : 1) * (g.player.mud ? 0.72 : 1) * (g.player.vehicle ? 0.95 : 1);
  }
  g._updateMapSpecials(dt);
  g.enemies.update(dt, ps, null);
  // Gefallene Spieler greifen NICHT an (Waffen aus, Visuals versteckt)
  g.weapons.group.visible = !g.player.dead;
  if (!g.player.dead) g.weapons.update(dt, g.player, g.enemies, g._onKillP1);
  if (co) {
    g.weapons2.group.visible = !g.remotePlayer.dead;
    if (!g.remotePlayer.dead) g.weapons2.update(dt, g.remotePlayer, g.enemies, g._onKillP2);
  }
  g.gems.update(dt, ps, (v, who) => g._collectXp(v, who));
  g.pickups.update(dt, ps);

  // Spectate-Banner für den Host, wenn er tot ist
  if (co && g.player.dead && !g.remotePlayer.dead) g.hud.setSpectate('deinen Mitspieler');
  else g.hud.setSpectate(null);
  g._updateMateBeacon(dt);

  g.hud.update(g.player, g.weapons, g.runElapsed, g.enemies.aliveCount);
  g.hud.setPhase(g._phaseText());
  g.hud.setDodge(g.player.dodgeCharges, g.player.dodgeMax, g.player.dodgeTimer / g.player.dodgeRecharge);
  g.hud.setDanger(g.enemies._aoes.some((a) => a.type === 'safe'));
  g.hud.setWrath(g.enemies.wrathFrac());
  g._updateHeroSprites();
  g._updateDps(dt, g.weapons._dealt, g.weapons);
  if (g.role === 'host') {
    g._dpsSendAcc = (g._dpsSendAcc || 0) + dt;
    if (g._dpsSendAcc >= 0.5) { g._dpsSendAcc = 0; g.net.send({ k: 'dps', d: g.weapons2._dealt }); }
  }
  g._mmAcc = (g._mmAcc || 0) + dt;
  if (g._mmAcc >= 1 / 15) {
    g._mmAcc = 0;
    g._drawMinimap(); // Minimap ~15 Hz statt jeder Frame (Canvas-2D ist teuer)
  }
  g._drawCombatUI();

  // Phasen-/Boss-/Sieg-Logik
  g._phaseTick(dt);
  if (g.mode !== 'play') return; // Sieg eingetreten

  // Autospeichern (alle 15s)
  g._autosaveAcc = (g._autosaveAcc || 0) + dt;
  if (g._autosaveAcc > 15) {
    g._autosaveAcc = 0;
    if (!g._runToken) g._fetchRunToken(); // Token nachholen (z. B. Server war kurz weg)
    if (!g.player.dead) {
      // localStorage schreibt synchron -> in die Idle-Zeit verlegen (verhindert Mikro-Ruckler)
      if (window.requestIdleCallback) requestIdleCallback(() => g._saveRun(), { timeout: 2000 });
      else setTimeout(() => g._saveRun(), 0);
    }
  }

  if (co) {
    g._snapAcc += dt;
    if (g._snapAcc >= 1 / SNAP_HZ) { g._snapAcc = 0; g._sendSnapshot(); }
  } else if (g._broadcasting && g.net && g.net.connected) {
    // Solo-Broadcast: nur senden (und Effekte aufzeichnen), wenn wirklich jemand zuschaut
    const want = (g.net.watchers || 0) > 0;
    g.fx.record = want;
    if (want) {
      g._snapAcc += dt;
      if (g._snapAcc >= 1 / 10) { g._snapAcc = 0; g._sendSnapshot(); }
    }
  }

  if (ps.every((p) => p.dead)) g._endRun();
  else g._maybeLevelUp();
}
export function _updatePlayClient(g, dt) {
  const spectating = g.player.dead && g.remotePlayer && !g.remotePlayer.dead;
  if (!g._clientPaused && !g.player.dead) g.player.update(dt, g.input);
  else g.player.mixer.update(dt);
  if (g._authSelf) {
    const k = Math.min(1, dt * 6);
    g.player.position.x += (g._authSelf.x - g.player.position.x) * k;
    g.player.position.z += (g._authSelf.z - g.player.position.z) * k;
    g.player.position.y = g.world.getHeight(g.player.position.x, g.player.position.z);
    g.player.group.position.copy(g.player.position);
  }
  if (g._authRemote && g.remotePlayer) {
    const r = g.remotePlayer;
    const k = Math.min(1, dt * 9);
    const moving = Math.hypot(g._authRemote.x - r.position.x, g._authRemote.z - r.position.z) > 0.03;
    r.position.x += (g._authRemote.x - r.position.x) * k;
    r.position.z += (g._authRemote.z - r.position.z) * k;
    r.position.y = g.world.getHeight(r.position.x, r.position.z);
    r.yaw = g._authRemote.yaw;
    r.group.position.copy(r.position);
    r.group.rotation.y = r.yaw + r.modelYawOffset;
    r._play(r.dead ? r.idleAction : moving ? r.runAction || r.idleAction : r.idleAction);
    if (r.dead) r.group.rotation.z = Math.min(Math.PI / 2.2, r.group.rotation.z + dt * 3);
    r.mixer.update(dt);
  }

  // Gegner flüssig interpolieren + Waffen-Visuals beider Spieler
  g._updateCamRight();
  g.enemies.clientRender(dt);
  g.weapons.group.visible = !g.player.dead;
  if (!g.player.dead) g.weapons.renderVisualsOnly(dt, g.player);
  g.weapons2.group.visible = !g.remotePlayer.dead;
  if (!g.remotePlayer.dead) g.weapons2.renderVisualsOnly(dt, g.remotePlayer);
  g.weapons.renderGhostProjectiles(g._ghostProj || [], dt); // fliegende Projektile beider Spieler
  g.enemies.renderBoltGhosts(g._ghostBolts || [], dt); // Boss-Kugeln
  g.pickups.animate(dt);

  if (g._specOnly) g.hud.setSpectate(g._specName || 'dem Runner', true);
  else g.hud.setSpectate(spectating ? 'deinen Mitspieler' : null);
  g._updateMateBeacon(dt);
  g.camCtrl.update(dt, g.input, g._camTarget());
  g.hud.update(g.player, g.weapons, g.runElapsed, g.enemies.ghostCount);
  g.hud.setPhase(g._phaseText());
  g.hud.setDodge(g.player.dodgeCharges, g.player.dodgeMax, g.player.dodgeTimer / g.player.dodgeRecharge);
  g.hud.setDanger(!!g._clientDanger);
  g.hud.setWrath(g._clientWrath || 0);
  g._updateHeroSprites();
  if (g._clientDanger && !g._prevClientDanger) g._warnSafeZones();
  g._prevClientDanger = g._clientDanger;
  g._updateDps(dt, g._clientDealt || {}, g.weapons);
  g._mmAcc = (g._mmAcc || 0) + dt;
  if (g._mmAcc >= 1 / 15) {
    g._mmAcc = 0;
    g._drawMinimap(); // Minimap ~15 Hz statt jeder Frame (Canvas-2D ist teuer)
  }
  g._drawCombatUI();

  if (g._specOnly) return; // Zuschauer senden keine Eingaben
  if (!g._clientPaused && !g.player.dead && g.input.pressed('Space')) g._pendingDodge = true;
  // Festwurzeln: Tastenhämmern lokal (Vorhersage) + gesammelt an den Host senden
  if (g.player.rooted > 0) { const m = g._mashCount(); if (m) { g.player.mashFree(0.2 *m); g._mashAcc = (g._mashAcc || 0) + m; } }
  g._inAcc += dt;
  if (g._inAcc >= 1 / INPUT_HZ) {
    g._inAcc = 0;
    const ax = g._clientPaused || g.player.dead ? { x: 0, z: 0 } : g.input.axis();
    const rv = !g._clientPaused && !g.player.dead && (g.input.isDown('KeyE') || g.input.isTouch) ? 1 : 0;
    g.net.send({ k: 'in', x: ax.x, z: ax.z, dodge: g._pendingDodge ? 1 : 0, rv, mash: g._mashAcc || 0 });
    g._pendingDodge = false;
    g._mashAcc = 0;
  }
}
