import * as THREE from 'three';
import { Input } from './Input.js';
import { Assets } from './Assets.js';
import { Player } from './Player.js';
import { EnemyManager } from './EnemyManager.js';
import { Weapons, WEAPON_DEFS } from './Weapons.js';
import { Effects } from './Effects.js';
import { GemManager } from './GemManager.js';
import { PickupManager } from './PickupManager.js';
import { Upgrades } from './Upgrades.js';
import { Meta } from './Meta.js';
import { HUD } from './HUD.js';
import { GameAudio } from './Audio.js';
import { loadSettings } from './Settings.js';
import { loadSprites } from './spriteart.js';
import * as Visuals from './Visuals.js';
import * as UiScreens from './UiScreens.js';
import * as Coop from './Coop.js';
import * as RunControl from './RunControl.js';
import * as MainLoop from './MainLoop.js';

// Game = schlanker Orchestrator: Konstruktion, Asset-Preload und der Facade-Katalog.
// Die eigentliche Logik lebt in den Modulen (Visuals/UiScreens/Coop/RunControl/MainLoop),
// deren Funktionen die Game-Instanz als `g` erhalten. Delegates behalten die alten
// Methodennamen — Aufrufe über `g._name()` funktionieren modulübergreifend ohne Zyklen.

export class Game {
  constructor() {
    this.canvas = document.getElementById('game-canvas');
    this.mode = 'loading';
    this.role = null; // null=offline, 'host', 'client'
    this.clock = new THREE.Clock();
    this.runElapsed = 0;
    this.pendingLevelUps = 0; // P1 (lokal)
    this.pendingRemoteLevelUps = 0; // P2 (Gast)
    this._leveling = false;
    this._remoteCands = null;
    this._shopReturn = 'menu';
    this._snapAcc = 0;
    this._inAcc = 0;
    this.remotePlayer = null;
    this.weapons2 = null;
    this._authSelf = null;
    this._authRemote = null;
    this._clientPaused = false;
    // Level / Phasen
    this._selMap = 'valley';
    this._selDiff = 'normal';
    this.settings = loadSettings();
    this.heroKey = 'soldier'; // aktiver Held des laufenden Runs
    this._remoteHeroKey = 'soldier'; // Held des Mitspielers (Koop)
    try { this._selHero = localStorage.getItem('gothicHero') || 'soldier'; } catch (e) { this._selHero = 'soldier'; }
    this.mapKey = 'valley';
    this.difficulty = 'normal';
    this.phaseIndex = 0;
    this._phaseKills = 0;
    this.bossPhase = false;
    this.phaseStage = 'horde'; // 'horde' | 'mini' | 'final'
    this.levelWon = false;
    this.endless = false;
    this._finalBoss = null;
    this._miniBoss = null;

    this._initRenderer();
    this._initScene();
    this.input = new Input(this.canvas);
    window.addEventListener('resize', () => this._onResize());
    this._onResize();
    this._preload();
  }

  _initRenderer() { return Visuals._initRenderer(this); }

  _initScene() { return Visuals._initScene(this); }

  _syncPixelResolution() { return Visuals._syncPixelResolution(this); }

  _syncGrade() { return Visuals._syncGrade(this); }

  _prewarm() { return Visuals._prewarm(this); }

  _makeSprite(key) { return Visuals._makeSprite(this, key); }

  _makeBlobShadow(scale = 2.2) { return Visuals._makeBlobShadow(this, scale); }

  _updateCamRight() { return Visuals._updateCamRight(this); }

  _placeSprite(im, p, scale, frame, flip) { return Visuals._placeSprite(this, im, p, scale, frame, flip); }

  _heroFlip(pl, key) { return Visuals._heroFlip(this, pl, key); }

  _tintHero(im, pl, heroKey) { return Visuals._tintHero(this, im, pl, heroKey); }

  _syncHeroSprites() { return Visuals._syncHeroSprites(this); }

  _updateHeroSprites() { return Visuals._updateHeroSprites(this); }

  async _preload() {
    this.assets = new Assets();
    // Ladebalken: Modell = 80% des Fortschritts, Sprites = 20%
    const fill = document.getElementById('loading-fill');
    const pct = document.getElementById('loading-pct');
    const setP = (f) => {
      const v = Math.round(Math.max(0, Math.min(1, f)) * 100);
      if (fill) fill.style.width = `${v}%`;
      if (pct) pct.textContent = `${v}%`;
    };
    try {
      await this.assets.loadAll((f) => setP(f * 0.8));
      await loadSprites((f) => setP(0.8 + f * 0.2)); // echte Pixel-Art-Sprites (Gegner + Held)
      setP(1);
    } catch (e) {
      console.error('Asset-Ladefehler:', e);
    }
    this.player = new Player(this.scene, this.world, this.assets.createHero(1.9));
    // HD-2D: Spieler als Pixel-Sprite statt 3D-Modell
    this.player.group.visible = false;
    this.playerSprite = this._makeSprite('player');
    this.remoteSprite = this._makeSprite('player');
    this.remoteSprite.visible = false;
    // Blob-Schatten verankern die Helden-Sprites am Boden
    this.playerShadow = this._makeBlobShadow();
    this.remoteShadow = this._makeBlobShadow();
    this.remoteShadow.visible = false;

    this.playerLight = new THREE.PointLight(0xffe2b0, 10, 26, 1.4);
    this.scene.add(this.playerLight);
    this.playerFill = new THREE.DirectionalLight(0xfff0d8, 0.6);
    this.scene.add(this.playerFill);
    this.scene.add(this.playerFill.target);

    this.enemies = new EnemyManager(this.scene, this.world);
    this.enemies.onShake = (a) => this.camCtrl.addShake(a);
    this.enemies.onBossEnrage = (ph, name) => {
      this.hud.bossBanner(ph === 2 ? `${name} RAST VOR WUT!` : `${name} WIRD WÜTEND!`);
      this.hud.toast(ph === 2 ? '⚠ Boss-Enrage: Volle Wut — weiche den Angriffen aus!' : '⚠ Der Boss wird schneller und lernt einen neuen Angriff!', 'blood');
      this.audio.boss();
      this.hitStop(0.12);
    };
    this.enemies.bossAnnounce = (name) => {
      this.hud.bossBanner(`${name} ERSCHEINT`);
      this.hud.toast(`⚠ ${name} ERSCHEINT!`, 'blood');
      this.audio.boss();
      this.camCtrl.addShake(0.4);
    };
    this.enemies.onSafeZones = () => this._warnSafeZones();
    this.fx = new Effects(this.scene);
    this.fx.heightAt = (x, z) => this.world.getHeight(x, z); // Boden-Zonen folgen dem Gelände
    this.enemies.fx = this.fx; // Boss-Telegraphen
    this.weapons = new Weapons(this.scene);
    this.weapons.fx = this.fx;
    this.gems = new GemManager(this.scene, this.world);
    this.pickups = new PickupManager(this.scene, this.world);
    this.hud = new HUD(document.getElementById('hud'));
    this.audio = new GameAudio();
    this.upgrades = new Upgrades(document.getElementById('levelup'), (m, t) => this.hud.toast(m, t));
    this.meta = new Meta(document.getElementById('shop'), (m, t) => this.hud.toast(m, t));

    // Feedback geht über _toastFor an den Spieler, der das Item aufhebt (Host ODER Gast)
    this.pickups.handlers = {
      heal: (it, p) => {
        const who = p || this.player;
        who.heal(who.maxHp * 0.35);
        this._toastFor(who, 'Heiltrank — Leben aufgefüllt', 'gold', 'pickup');
      },
      magnet: (it, p) => {
        this.gems.attractAll();
        this._toastFor(p || this.player, 'Seelenruf — alle Edelsteine angezogen', 'gold', 'pickup');
      },
      nova: (it, p) => {
        const who = p || this.player;
        const dmg = 80 + who.level * 25;
        const ok = this._onKillFor(who);
        for (const e of this.enemies.allAlive()) {
          this.fx.sparksBurst(e.x, 1.0, e.z, 0xff6a3a, 3, 4);
          this.enemies.damage(e, dmg * who.might, null, ok);
        }
        this.fx.explosion(who.position.x, who.position.z, 8, 0xff5a3a);
        this._toastFor(who, 'Zorn der Barriere — Feinde getroffen!', 'blood', 'boss');
      },
      greed: (it, p) => {
        const who = p || this.player;
        const g = 20 + Math.floor(this.enemies.elapsed / 30) * 10;
        who.gold += g * who.goldMult;
        this._toastFor(who, `Erzader — +${g} Erz`, 'gold', 'pickup');
      },
      // Elite-Beute: Erz + eine zufällige eigene Waffe steigt eine Stufe (wie in VS-Truhen)
      chest: (it, p) => {
        const who = p || this.player;
        const wp = who === this.remotePlayer ? this.weapons2 : this.weapons;
        const g = 25 + Math.floor(this.enemies.elapsed / 20);
        who.gold += g * (who.goldMult || 1);
        const upgradable = wp.ownedList().filter((w) => !wp.isMax(w.id));
        if (upgradable.length) {
          const w = upgradable[Math.floor(Math.random() * upgradable.length)];
          wp.add(w.id);
          this._toastFor(who, `🎁 Truhe: ${WEAPON_DEFS[w.id].name} +1 Stufe · +${g} Erz!`, 'gold', 'chest');
        } else {
          this._toastFor(who, `🎁 Truhe: +${g} Erz!`, 'gold', 'chest');
        }
        this.fx.sparksBurst(it.x, 1.0, it.z, 0xffd24a, 16, 6);
        this.camCtrl.addShake(0.15);
      },
      // Schrein der Barriere: volle Heilung + 15s Schadens-Segen
      shrine: (it, p) => {
        const who = p || this.player;
        who.heal(who.maxHp);
        who.blessing = 15;
        this.fx.ring(it.x, it.z, 6, 0x86e0ff);
        this.fx.sparksBurst(it.x, 1.2, it.z, 0x86e0ff, 20, 7);
        this._toastFor(who, '🕯 Segen der Barriere — volle Heilung & +40% Schaden für 15s!', 'gold', 'levelup');
      },
    };

    this.remoteInput = {
      enabled: true, _x: 0, _z: 0, reviving: false,
      axis() { return { x: this._x, z: this._z }; },
      isDown: () => false, pressed: () => false, mouseDown: () => false, clicked: () => false,
      mouse: { wheel: 0, dx: 0, dy: 0 },
    };

    this._initNet();
    this.camCtrl.snap(this.player.position);
    this._wireUI();
    this._applySettings();
    this._installUnloadScore(); // Tab-Schließen mitten im Run wertet den Score noch
    this._prewarm(); // Shader hinter dem Ladescreen kompilieren (keine Erste-Nutzung-Ruckler)
    document.getElementById('loading').classList.add('hidden');
    this._bootFlow();
    this.clock.start();
    this.loop();
  }

  _makeOnKill(p) { return RunControl._makeOnKill(this, p); }
  _onKillFor(p) { return RunControl._onKillFor(this, p); }

  _initNet() { return Coop._initNet(this); }

  _openLobby() { return Coop._openLobby(this); }

  _lobbyConnect() { return Coop._lobbyConnect(this); }

  _renderLobbyList(list) { return Coop._renderLobbyList(this, list); }

  _enterLobbyRoom(role) { return Coop._enterLobbyRoom(this, role); }
  _setLobbySlot2(connected) { return Coop._setLobbySlot2(this, connected); }
  _setLobbyStatus(txt) { return Coop._setLobbyStatus(this, txt); }

  _lobbyCreate() { return Coop._lobbyCreate(this); }
  _lobbyJoinId(id) { return Coop._lobbyJoinId(this, id); }

  _ensureCoop() { return Coop._ensureCoop(this); }

  _onNetData(d) { return Coop._onNetData(this, d); }

  _wireUI() { return UiScreens._wireUI(this); }

  _applySettings() { return UiScreens._applySettings(this); }

  _wireSettings() { return UiScreens._wireSettings(this); }

  _openSettings(from) { return UiScreens._openSettings(this, from); }

  _closeSettings() { return UiScreens._closeSettings(this); }

  _musicTheme() { return RunControl._musicTheme(this); }

  _showMenu() { return UiScreens._showMenu(this); }

  _openCombos(from) { return UiScreens._openCombos(this, from); }

  _playerName() { return UiScreens._playerName(this); }
  _loadName() { return UiScreens._loadName(this); }
  _bootFlow() { return UiScreens._bootFlow(this); }
  _showNameScreen() { return UiScreens._showNameScreen(this); }
  _confirmName() { return UiScreens._confirmName(this); }
  _esc(s) { return UiScreens._esc(this, s); }
  _recordMeta(win) { return RunControl._recordMeta(this, win); }

  _recordScore(win) { return RunControl._recordScore(this, win); }
  _openLeaderboard() { return UiScreens._openLeaderboard(this); }
  _renderLeaderboard(sortBy) { return UiScreens._renderLeaderboard(this, sortBy); }
  _renderLbRows(el, scores, global) { return UiScreens._renderLbRows(this, el, scores, global); }

  _hasSave() { return RunControl._hasSave(this); }
  _saveRun() { return RunControl._saveRun(this); }
  _clearSave() { return RunControl._clearSave(this); }

  resumeRun() { return RunControl.resumeRun(this); }

  _onEsc() { return UiScreens._onEsc(this); }
  _openPause() { return UiScreens._openPause(this); }
  _resumeFromPause() { return UiScreens._resumeFromPause(this); }

  _peerPause(on) { return UiScreens._peerPause(this, on); }
  _saveAndQuit() { return UiScreens._saveAndQuit(this); }
  _quitToMenu() { return UiScreens._quitToMenu(this); }

  _renderSelectors(mapElId, diffElId, heroElId = null, heroDescId = null) { return UiScreens._renderSelectors(this, mapElId, diffElId, heroElId, heroDescId); }

  _renderHeroSelector(elId, descId, rerender) { return UiScreens._renderHeroSelector(this, elId, descId, rerender); }

  _sendHeroInfo() { return Coop._sendHeroInfo(this); }

  _toastFor(who, msg, type = 'gold', sound = null) { return Coop._toastFor(this, who, msg, type, sound); }
  _lobbyUpdate() { return Coop._lobbyUpdate(this); }

  _openMapSelect() { return UiScreens._openMapSelect(this); }

  _applyLevel(mapKey, diff) { return RunControl._applyLevel(this, mapKey, diff); }

  _startEndless() { return RunControl._startEndless(this); }

  _phaseTick(dt) { return RunControl._phaseTick(this, dt); }

  _updateMapSpecials(dt) { return RunControl._updateMapSpecials(this, dt); }

  _installUnloadScore() { return RunControl._installUnloadScore(this); }

  _phaseTarget() { return RunControl._phaseTarget(this); }

  _updateDps(dt, dealt, weapons) { return RunControl._updateDps(this, dt, dealt, weapons); }

  _warnSafeZones() { return RunControl._warnSafeZones(this); }

  _phaseText() { return RunControl._phaseText(this); }

  _winLevel() { return RunControl._winLevel(this); }

  _clientWin(d) { return RunControl._clientWin(this, d); }

  _playIntro() { return RunControl._playIntro(this); }

  _resetCommon() { return RunControl._resetCommon(this); }

  startRun(mapKey = this._selMap, diff = this._selDiff) { return RunControl.startRun(this, mapKey, diff); }

  _hostStart() { return Coop._hostStart(this); }

  _beginClientRun(d) { return Coop._beginClientRun(this, d); }

  _beginSpectate(d) { return Coop._beginSpectate(this, d); }

  _startSoloBroadcast() { return Coop._startSoloBroadcast(this); }

  _leaveOnline() { return Coop._leaveOnline(this); }

  _players() { return MainLoop._players(this); }

  _tickRevive(dt) { return Coop._tickRevive(this, dt); }

  _updateAllyPanel() { return Coop._updateAllyPanel(this); }

  _updateRevivePrompt() { return Coop._updateRevivePrompt(this); }

  _updateBuffs() { return Coop._updateBuffs(this); }

  _updateMateArrow() { return Coop._updateMateArrow(this); }

  _coopDeathWatch() { return Coop._coopDeathWatch(this); }

  _pingInput() { return Coop._pingInput(this); }
  _coopInput() { return Coop._coopInput(this); }
  _mashCount() { return Coop._mashCount(this); }
  _mouseWorld() { return Coop._mouseWorld(this); }
  _ping(x, z) { return Coop._ping(this, x, z); }
  _addPing(x, z) { return Coop._addPing(this, x, z); }
  _decayPings(dt) { return Coop._decayPings(this, dt); }
  _emote(i) { return Coop._emote(this, i); }
  _showEmote(who, i) { return Coop._showEmote(this, who, i); }

  _collectXp(value, who) { return RunControl._collectXp(this, value, who); }

  _maybeLevelUp() { return RunControl._maybeLevelUp(this); }

  _startLocalLevelUp() { return RunControl._startLocalLevelUp(this); }

  _presentLocal() { return RunControl._presentLocal(this); }

  _startRemoteLevelUp() { return RunControl._startRemoteLevelUp(this); }

  _sendRemoteChoices() { return RunControl._sendRemoteChoices(this); }

  _hostRerollRemote() { return RunControl._hostRerollRemote(this); }

  _hostBanishRemote(i) { return RunControl._hostBanishRemote(this, i); }

  _hostApplyRemotePick(i) { return RunControl._hostApplyRemotePick(this, i); }

  _endLevelUp() { return RunControl._endLevelUp(this); }

  _finishLevelUp() { return RunControl._finishLevelUp(this); }

  _resolveCombos() { return RunControl._resolveCombos(this); }

  _clientLevelUp(d) { return RunControl._clientLevelUp(this, d); }

  _dmgRowsHtml(dealt) { return RunControl._dmgRowsHtml(this, dealt); }

  _endRun() { return RunControl._endRun(this); }

  _clientGameOver(d) { return RunControl._clientGameOver(this, d); }

  openShop(from) { return UiScreens.openShop(this, from); }
  _afterShop() { return UiScreens._afterShop(this); }

  _sendSnapshot() { return Coop._sendSnapshot(this); }

  _applySnapshot(d) { return Coop._applySnapshot(this, d); }

  _camTarget() { return MainLoop._camTarget(this); }

  _drawMinimap() { return MainLoop._drawMinimap(this); }

  _drawCombatUI() { return MainLoop._drawCombatUI(this); }

  // -------------------------------------------------- Loop
  // Hit-Stop: kurzer Zeitlupen-Freeze für wuchtige Momente (Boss-Kill, Evolution, harter Treffer)
  hitStop(dur) {
    this._hitStopT = Math.max(this._hitStopT || 0, dur);
  }

  update() { return MainLoop.update(this); }

  _syncTouchUi() { return MainLoop._syncTouchUi(this); }

  _updatePlayHost(dt) { return MainLoop._updatePlayHost(this, dt); }

  _updatePlayClient(dt) { return MainLoop._updatePlayClient(this, dt); }

  loop() {
    this.update();
    requestAnimationFrame(() => this.loop());
  }

  _onResize() { return Visuals._onResize(this); }
}

