import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

import { Input } from './Input.js';
import { World, MAP_LIST } from './World.js';
import { Assets } from './Assets.js';
import { Player } from './Player.js';
import { SurvivorsCamera } from './SurvivorsCamera.js';
import { EnemyManager } from './EnemyManager.js';
import { Weapons, WEAPON_DEFS } from './Weapons.js';
import { Effects } from './Effects.js';
import { GemManager } from './GemManager.js';
import { PickupManager } from './PickupManager.js';
import { Upgrades } from './Upgrades.js';
import { Meta } from './Meta.js';
import { HUD } from './HUD.js';
import { GameAudio } from './Audio.js';
import { Net } from '../net/Net.js';

const SNAP_HZ = 20;
const INPUT_HZ = 22;
const PHASES = 3; // Phasen pro Level, dann finaler Boss
const PHASE_DUR = 55; // Sekunden je Phase
const DIFFS = { normal: { mult: 1.0, name: 'Normal' }, hard: { mult: 1.65, name: 'Schwer' } };

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
    this.mapKey = 'valley';
    this.difficulty = 'normal';
    this.phaseIndex = 0;
    this.phaseTimer = PHASE_DUR;
    this.bossPhase = false;
    this.levelWon = false;
    this.endless = false;
    this._finalBoss = null;

    this._initRenderer();
    this._initScene();
    this.input = new Input(this.canvas);
    window.addEventListener('resize', () => this._onResize());
    this._onResize();
    this._preload();
  }

  _initRenderer() {
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.45;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
  }

  _initScene() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 1000);
    this.world = new World(this.scene, this.renderer);
    this.camCtrl = new SurvivorsCamera(this.camera);
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.62, 0.7, 0.62);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
  }

  async _preload() {
    this.assets = new Assets();
    try {
      await this.assets.loadAll();
    } catch (e) {
      console.error('Asset-Ladefehler:', e);
    }
    this.player = new Player(this.scene, this.world, this.assets.createHero(1.9));

    this.playerLight = new THREE.PointLight(0xffe2b0, 10, 26, 1.4);
    this.scene.add(this.playerLight);
    this.playerFill = new THREE.DirectionalLight(0xfff0d8, 0.6);
    this.scene.add(this.playerFill);
    this.scene.add(this.playerFill.target);

    this.enemies = new EnemyManager(this.scene, this.world);
    this.enemies.bossAnnounce = (name) => {
      this.hud.bossBanner(`${name} ERSCHEINT`);
      this.hud.toast(`⚠ ${name} ERSCHEINT!`, 'blood');
      this.audio.boss();
    };
    this.fx = new Effects(this.scene);
    this.weapons = new Weapons(this.scene);
    this.weapons.fx = this.fx;
    this.gems = new GemManager(this.scene, this.world);
    this.pickups = new PickupManager(this.scene, this.world);
    this.hud = new HUD(document.getElementById('hud'));
    this.audio = new GameAudio();
    this.upgrades = new Upgrades(document.getElementById('levelup'), (m, t) => this.hud.toast(m, t));
    this.meta = new Meta(document.getElementById('shop'), (m, t) => this.hud.toast(m, t));

    this.pickups.handlers = {
      heal: (it, p) => {
        const who = p || this.player;
        who.heal(who.maxHp * 0.35);
        this.audio.pickup();
        this.hud.toast('Heiltrank — Leben aufgefüllt', 'gold');
      },
      magnet: () => {
        this.gems.attractAll();
        this.audio.pickup();
        this.hud.toast('Seelenruf — alle Edelsteine angezogen', 'gold');
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
        this.audio.boss();
        this.hud.toast('Zorn der Barriere — Feinde getroffen!', 'blood');
      },
      greed: (it, p) => {
        const who = p || this.player;
        const g = 20 + Math.floor(this.enemies.elapsed / 30) * 10;
        who.gold += g * who.goldMult;
        this.audio.pickup();
        this.hud.toast(`Erzader — +${g} Erz`, 'gold');
      },
    };

    this.remoteInput = {
      enabled: true, _x: 0, _z: 0,
      axis() { return { x: this._x, z: this._z }; },
      isDown: () => false, pressed: () => false, mouseDown: () => false, clicked: () => false,
      mouse: { wheel: 0, dx: 0, dy: 0 },
    };

    this._initNet();
    this.camCtrl.snap(this.player.position);
    this._wireUI();
    document.getElementById('loading').classList.add('hidden');
    this._showMenu();
    this.clock.start();
    this.loop();
  }

  // jeder Gegner-Tod schreibt Kills/Erz dem jeweiligen Spieler gut
  _makeOnKill(p) {
    return (e) => {
      p.kills++;
      this.audio.kill();
      p.gold += (e.def.gold || 0) * (p.goldMult || 1);
      this.fx.sparksBurst(e.x, e.y + 0.6, e.z, e.def.boss ? 0xff5a3a : 0xc89060, e.def.boss ? 26 : 7, e.def.boss ? 9 : 5);
      if (e.def.boss) {
        const gv = Math.max(8, Math.round(e.def.xp / 6));
        for (let i = 0; i < 9; i++) this.gems.spawn(e.x + (Math.random() - 0.5) * 5, e.z + (Math.random() - 0.5) * 5, gv);
        p.gold += 5 * (p.goldMult || 1);
        this.fx.explosion(e.x, e.z, 6, 0x9a4aff);
        this.pickups.spawnAt('heal', e.x + 2, e.z);
        this.pickups.spawnAt('greed', e.x - 2, e.z);
        this.hud.toast('BOSS BESIEGT!', 'gold');
      } else {
        this.gems.spawn(e.x, e.z, e.def.xp);
      }
    };
  }
  _onKillFor(p) {
    return p === this.remotePlayer ? this._onKillP2 : this._onKillP1;
  }

  // -------------------------------------------------- Netzwerk / Lobby
  _initNet() {
    this.net = new Net();
    this.net.onCreated = (code) => {
      const box = document.getElementById('lobby-code');
      box.classList.remove('hidden');
      box.innerHTML = `<div class="code-row"><input id="code-field" readonly value="${code}" /><button id="copy-code">Kopieren</button></div><div class="code-hint">Code antippen markiert ihn · oder „Kopieren"</div>`;
      const field = document.getElementById('code-field');
      field.addEventListener('click', () => { field.select(); field.setSelectionRange(0, 99); });
      document.getElementById('copy-code').addEventListener('click', () => this._copyCode());
      document.getElementById('lobby-status').textContent = 'Warte auf Mitspieler…';
      document.getElementById('lobby-start').classList.add('hidden');
    };
    this.net.onPeerJoined = () => {
      document.getElementById('lobby-status').textContent = 'Mitspieler verbunden! Bereit.';
      document.getElementById('lobby-start').classList.remove('hidden');
    };
    this.net.onJoined = () => {
      document.getElementById('lobby-status').textContent = 'Verbunden — warte auf Host-Start…';
    };
    this.net.onPeerLeft = () => {
      this.hud.toast('Mitspieler hat die Lobby verlassen', 'blood');
      if (this.mode === 'play' || this.mode === 'levelup') this._leaveOnline();
      else document.getElementById('lobby-status').textContent = 'Mitspieler getrennt.';
    };
    this.net.onError = (msg) => {
      document.getElementById('lobby-status').textContent = 'Fehler: ' + msg;
    };
    this.net.onData = (d) => this._onNetData(d);
  }

  _openLobby() {
    this.mode = 'lobby';
    document.getElementById('start-screen').classList.add('hidden');
    document.getElementById('lobby').classList.remove('hidden');
    document.getElementById('lobby-status').textContent = 'Erstelle eine Lobby oder tritt mit einem Code bei.';
    document.getElementById('lobby-start').classList.add('hidden');
    const box = document.getElementById('lobby-code');
    box.classList.add('hidden');
    box.innerHTML = '';
    this._renderSelectors('lobby-maps', 'lobby-diffs');
  }

  _copyCode() {
    const code = this.net.code;
    if (!code) return;
    const btn = document.getElementById('copy-code');
    const done = (ok) => {
      if (btn) {
        btn.textContent = ok ? 'Kopiert!' : 'Strg+C';
        setTimeout(() => { if (btn) btn.textContent = 'Kopieren'; }, 1500);
      }
    };
    const fallback = () => {
      const f = document.getElementById('code-field');
      let ok = false;
      if (f) {
        f.focus();
        f.select();
        f.setSelectionRange(0, 99);
        try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      }
      done(ok);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(code).then(() => done(true)).catch(fallback);
    } else {
      fallback();
    }
  }
  async _lobbyCreate() {
    document.getElementById('lobby-status').textContent = 'Verbinde…';
    try { await this.net.connect(document.getElementById('lobby-server').value || undefined); this.net.create(); } catch (e) {}
  }
  async _lobbyJoin() {
    const code = document.getElementById('lobby-code-input').value.trim().toUpperCase();
    if (!code) return;
    document.getElementById('lobby-status').textContent = 'Verbinde…';
    try { await this.net.connect(document.getElementById('lobby-server').value || undefined); this.net.join(code); } catch (e) {}
  }

  _ensureCoop() {
    if (!this.remotePlayer) this.remotePlayer = new Player(this.scene, this.world, this.assets.createHero(1.9, 0x6aa6e6));
    this.remotePlayer.group.visible = true;
    if (!this.weapons2) {
      this.weapons2 = new Weapons(this.scene);
      this.weapons2.fx = this.fx;
    }
  }

  _onNetData(d) {
    if (!d) return;
    if (d.k === 'start' && this.net.role === 'client') this._beginClientRun(d);
    else if (d.k === 'in' && this.role === 'host') { this.remoteInput._x = d.x; this.remoteInput._z = d.z; }
    else if (d.k === 'snap' && this.role === 'client') this._applySnapshot(d);
    else if (d.k === 'won' && this.role === 'client') this._clientWin(d);
    else if (d.k === 'endless' && this.role === 'client') {
      this.endless = true;
      this.player.dead = false;
      document.getElementById('win-screen').classList.add('hidden');
      this.input.enabled = true;
      this.mode = 'play';
      this.hud.toast('ENDLOS-MODUS!', 'gold');
    }
    else if (d.k === 'pause' && this.role === 'client') {
      this._clientPaused = d.on;
      this.hud.toast(d.on ? 'Mitspieler wählt ein Upgrade…' : 'Weiter geht’s!', 'gold');
    } else if (d.k === 'lvlup' && this.role === 'client') this._clientLevelUp(d);
    else if (d.k === 'pick' && this.role === 'host') this._hostApplyRemotePick(d.i);
    else if (d.k === 'over' && this.role === 'client') this._clientGameOver(d);
  }

  // -------------------------------------------------- UI
  _wireUI() {
    document.getElementById('start-button').addEventListener('click', () => this._openMapSelect());
    document.getElementById('resume-button').addEventListener('click', () => this.resumeRun());
    document.getElementById('shop-button').addEventListener('click', () => this.openShop('menu'));
    document.getElementById('online-button').addEventListener('click', () => this._openLobby());
    document.getElementById('map-start').addEventListener('click', () => { document.getElementById('map-screen').classList.add('hidden'); this.startRun(this._selMap, this._selDiff); });
    document.getElementById('map-back').addEventListener('click', () => { document.getElementById('map-screen').classList.add('hidden'); this._showMenu(); });
    document.getElementById('win-menu').addEventListener('click', () => { document.getElementById('win-screen').classList.add('hidden'); this._quitToMenu(); });
    document.getElementById('win-replay').addEventListener('click', () => { document.getElementById('win-screen').classList.add('hidden'); this.startRun(this.mapKey, this.difficulty); });
    document.getElementById('win-endless').addEventListener('click', () => this._startEndless());
    document.getElementById('death-menu').addEventListener('click', () => { document.getElementById('death-screen').classList.add('hidden'); this._quitToMenu(); });
    document.getElementById('pause-resume').addEventListener('click', () => this._resumeFromPause());
    document.getElementById('pause-save').addEventListener('click', () => this._saveAndQuit());
    document.getElementById('pause-menu').addEventListener('click', () => this._quitToMenu());
    document.getElementById('pause-leave').addEventListener('click', () => { this.net.close(); this._leaveOnline(); document.getElementById('pause-screen').classList.add('hidden'); });
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape') this._onEsc();
      else if (e.code === 'KeyM') this.hud.toast(this.audio.toggleMute() ? 'Ton aus' : 'Ton an', 'gold');
    });
    // AudioContext bei erster Geste aktivieren
    const wake = () => this.audio.resume();
    window.addEventListener('pointerdown', wake);
    window.addEventListener('keydown', wake);
    document.getElementById('retry-button').addEventListener('click', () => this.startRun(this.mapKey, this.difficulty));
    document.getElementById('death-shop-button').addEventListener('click', () => this.openShop('death'));
    document.getElementById('lobby-create').addEventListener('click', () => this._lobbyCreate());
    document.getElementById('lobby-join').addEventListener('click', () => this._lobbyJoin());
    document.getElementById('lobby-start').addEventListener('click', () => this._hostStart());
    document.getElementById('lobby-back').addEventListener('click', () => {
      this.net.close();
      document.getElementById('lobby').classList.add('hidden');
      this._showMenu();
    });
    this.meta.onClose = () => this._afterShop();
    const lsv = document.getElementById('lobby-server');
    if (lsv) lsv.placeholder = Net.defaultUrl();
  }

  _showMenu() {
    this.mode = 'menu';
    const ms = document.getElementById('menu-stats');
    if (ms) ms.textContent = `Gesammeltes Erz: ${this.meta.gold}`;
    document.getElementById('resume-button').classList.toggle('hidden', !this._hasSave());
    document.getElementById('start-screen').classList.remove('hidden');
  }

  // -------------------------------------------------- Speichern / Fortsetzen
  _hasSave() {
    try { return !!localStorage.getItem('gothicSurvivorsRun'); } catch { return false; }
  }
  _saveRun() {
    try {
      const data = {
        v: 2, player: this.player.serialize(), weapons: this.weapons.serialize(),
        elapsed: this.runElapsed, enemyElapsed: this.enemies.elapsed,
        map: this.mapKey, diff: this.difficulty, phaseIndex: this.phaseIndex, phaseTimer: this.phaseTimer, bossPhase: this.bossPhase, endless: this.endless,
      };
      localStorage.setItem('gothicSurvivorsRun', JSON.stringify(data));
    } catch (e) { /* ignore */ }
  }
  _clearSave() {
    try { localStorage.removeItem('gothicSurvivorsRun'); } catch (e) {}
  }

  resumeRun() {
    let data;
    try { data = JSON.parse(localStorage.getItem('gothicSurvivorsRun')); } catch { return; }
    if (!data) return;
    this.role = null;
    if (this.remotePlayer) this.remotePlayer.group.visible = false;
    document.getElementById('start-screen').classList.add('hidden');
    document.getElementById('death-screen').classList.add('hidden');
    document.getElementById('win-screen').classList.add('hidden');
    this._applyLevel(data.map || 'valley', data.diff || 'normal');
    this.player.beginRun();
    this.player.applySave(data.player);
    this.enemies.reset();
    this.gems.reset();
    this.pickups.reset();
    this.weapons.reset();
    this.weapons.loadSave(data.weapons);
    this.enemies.setDifficulty(DIFFS[this.difficulty] ? DIFFS[this.difficulty].mult : 1);
    this.runElapsed = data.elapsed || 0;
    this.enemies.elapsed = data.enemyElapsed || 0; // Schwierigkeit weiterführen
    this.phaseIndex = data.phaseIndex || 0;
    this.phaseTimer = data.phaseTimer || PHASE_DUR;
    this.enemies.phase = this.phaseIndex;
    this.endless = !!data.endless;
    if (this.endless) {
      this.enemies.autoBoss = true;
      this.enemies.spawnEnabled = true;
      this.enemies.bossTimer = 60;
    } else if (data.bossPhase) {
      this.bossPhase = true;
      this.enemies.spawnEnabled = false;
      const c = this.player.position;
      const bt = (this.world.theme && this.world.theme.finalBoss) || 'boss';
      this._finalBoss = this.enemies.spawnFinalBoss(bt, c.x, c.z, 2.4 * this.enemies.diff);
    }
    this.pendingLevelUps = 0;
    this.pendingRemoteLevelUps = 0;
    this._leveling = false;
    this._onKillP1 = this._makeOnKill(this.player);
    this._lastHp = this.player.hp;
    this.hud.setSpectate(null);
    this.camCtrl.snap(this.player.position);
    this.hud.show();
    this.hud.toast('Run fortgesetzt!', 'gold');
    this.input.enabled = true;
    this._autosaveAcc = 0;
    this.mode = 'play';
  }

  // -------------------------------------------------- Pause
  _onEsc() {
    if (this.mode === 'play') this._openPause();
    else if (this.mode === 'paused') this._resumeFromPause();
  }
  _openPause() {
    this.mode = 'paused';
    this.input.enabled = false;
    if (this.role === 'host') this.net.send({ k: 'pause', on: true });
    const isClient = this.role === 'client';
    document.getElementById('pause-save').classList.toggle('hidden', isClient);
    document.getElementById('pause-menu').classList.toggle('hidden', isClient);
    document.getElementById('pause-leave').classList.toggle('hidden', !isClient);
    document.getElementById('pause-screen').classList.remove('hidden');
  }
  _resumeFromPause() {
    document.getElementById('pause-screen').classList.add('hidden');
    this.mode = 'play';
    this.input.enabled = true;
    if (this.role === 'host') this.net.send({ k: 'pause', on: false });
  }
  _saveAndQuit() {
    this._saveRun();
    document.getElementById('pause-screen').classList.add('hidden');
    if (this.role) this.net.close();
    this.role = null;
    if (this.remotePlayer) this.remotePlayer.group.visible = false;
    this.hud.hide();
    this._showMenu();
  }
  _quitToMenu() {
    document.getElementById('pause-screen').classList.add('hidden');
    if (this.role) this.net.close();
    this.role = null;
    if (this.remotePlayer) this.remotePlayer.group.visible = false;
    this.hud.hide();
    this._showMenu();
  }

  // -------------------------------------------------- Map-/Schwierigkeitswahl
  _renderSelectors(mapElId, diffElId) {
    const mapEl = document.getElementById(mapElId);
    const diffEl = document.getElementById(diffElId);
    if (mapEl) {
      mapEl.innerHTML = MAP_LIST.map((m) => `<button class="sel-btn ${m.key === this._selMap ? 'active' : ''}" data-map="${m.key}">${m.name}</button>`).join('');
      mapEl.querySelectorAll('[data-map]').forEach((b) => b.addEventListener('click', () => { this._selMap = b.getAttribute('data-map'); this._renderSelectors(mapElId, diffElId); }));
    }
    if (diffEl) {
      diffEl.innerHTML = Object.keys(DIFFS).map((k) => `<button class="sel-btn ${k === this._selDiff ? 'active' : ''}" data-diff="${k}">${DIFFS[k].name}</button>`).join('');
      diffEl.querySelectorAll('[data-diff]').forEach((b) => b.addEventListener('click', () => { this._selDiff = b.getAttribute('data-diff'); this._renderSelectors(mapElId, diffElId); }));
    }
  }

  _openMapSelect() {
    document.getElementById('start-screen').classList.add('hidden');
    this._renderSelectors('map-maps', 'map-diffs');
    document.getElementById('map-screen').classList.remove('hidden');
  }

  _applyLevel(mapKey, diff) {
    this.mapKey = mapKey;
    this.difficulty = diff;
    if (this.world.themeKey !== mapKey) this.world.applyTheme(mapKey);
    this.enemies.setDifficulty(DIFFS[diff] ? DIFFS[diff].mult : 1);
    this.enemies.autoBoss = false;
    this.enemies.spawnEnabled = true;
    this.enemies.phase = 0;
    this.phaseIndex = 0;
    this.phaseTimer = PHASE_DUR;
    this.bossPhase = false;
    this.levelWon = false;
    this.endless = false;
    this._finalBoss = null;
  }

  _startEndless() {
    document.getElementById('win-screen').classList.add('hidden');
    this.endless = true;
    this.levelWon = false;
    this.bossPhase = false;
    this._finalBoss = null;
    this.enemies.spawnEnabled = true;
    this.enemies.autoBoss = true; // wiederkehrende Bosse
    this.enemies.bossTimer = 60;
    this.player.dead = false;
    this.player.hp = this.player.maxHp;
    this.player.group.rotation.z = 0;
    if (this.role) {
      this.remotePlayer.dead = false;
      this.remotePlayer.hp = this.remotePlayer.maxHp;
      this.remotePlayer.group.rotation.z = 0;
    }
    this._lastHp = this.player.hp;
    this.input.enabled = true;
    this.mode = 'play';
    this.audio.levelup();
    this.hud.toast('ENDLOS-MODUS — überlebe so lange du kannst!', 'gold');
    if (this.role === 'host') this.net.send({ k: 'endless' });
  }

  _phaseTick(dt) {
    if (this.endless) {
      this._endlessRamp = (this._endlessRamp || 0) + dt;
      if (this._endlessRamp > 40) {
        this._endlessRamp = 0;
        this.enemies.phase++;
      }
      return;
    }
    if (this.levelWon) return;
    if (!this.bossPhase) {
      this.phaseTimer -= dt;
      if (this.phaseTimer <= 0) {
        this.phaseIndex++;
        if (this.phaseIndex >= PHASES) {
          this.bossPhase = true;
          this.enemies.spawnEnabled = false; // Fokus auf den Boss
          const c = this.player.position;
          const bt = (this.world.theme && this.world.theme.finalBoss) || 'boss';
          this._finalBoss = this.enemies.spawnFinalBoss(bt, c.x, c.z, 2.4 * this.enemies.diff);
          this.hud.toast('FINALER BOSS — besiege ihn, um das Level zu schaffen!', 'blood');
        } else {
          this.phaseTimer = PHASE_DUR;
          this.enemies.phase = this.phaseIndex;
          this.hud.toast(`Phase ${this.phaseIndex + 1} von ${PHASES}`, 'gold');
        }
      }
    } else if (this._finalBoss && !this._finalBoss.alive) {
      this._winLevel();
    }
  }

  _phaseText() {
    if (this.endless) return 'ENDLOS';
    return this.bossPhase ? 'BOSS-PHASE' : `Phase ${Math.min(this.phaseIndex + 1, PHASES)}/${PHASES}`;
  }

  _winLevel() {
    this.mode = 'won';
    this.levelWon = true;
    this.input.enabled = false;
    this.hud.setSpectate(null);
    this.hud.setBossBar(null);
    this._clearSave();
    this.audio.levelup();
    const earned = Math.floor(this.player.gold);
    this.meta.addGold(earned);
    const m = Math.floor(this.runElapsed / 60), s = Math.floor(this.runElapsed % 60);
    let rows = `<div>Du — Stufe <b>${this.player.level}</b>, ${this.player.kills} Kills</div>`;
    if (this.role) rows += `<div>Mitspieler — Stufe <b>${this.remotePlayer.level}</b>, ${this.remotePlayer.kills} Kills</div>`;
    document.getElementById('win-stats').innerHTML = `
      <div>Zeit: <b>${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}</b></div>
      ${rows}
      <div class="death-gold">⛏ ${earned} Erz verdient &nbsp;·&nbsp; Gesamt: ${this.meta.gold}</div>
      <div class="dmg-breakdown">${this._dmgRowsHtml(this.weapons._dealt)}</div>`;
    document.getElementById('win-replay').classList.toggle('hidden', !!this.role); // Nochmal nur Solo
    document.getElementById('win-endless').classList.remove('hidden'); // Endlos: Solo + Host
    document.getElementById('win-screen').classList.remove('hidden');
    if (this.role === 'host') this.net.send({ k: 'won', t: this.runElapsed, host: { lv: this.player.level, ki: this.player.kills }, guest: { lv: this.remotePlayer.level, ki: this.remotePlayer.kills }, dmg: this.weapons2._dealt });
  }

  _clientWin(d) {
    this.mode = 'won';
    this.input.enabled = false;
    this.hud.setSpectate(null);
    this.hud.setBossBar(null);
    const earned = Math.floor(this.player.gold);
    this.meta.addGold(earned);
    const m = Math.floor((d.t || 0) / 60), s = Math.floor((d.t || 0) % 60);
    document.getElementById('win-stats').innerHTML = `
      <div>Zeit: <b>${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}</b></div>
      <div>Du — Stufe <b>${d.guest.lv}</b>, ${d.guest.ki} Kills</div>
      <div>Mitspieler — Stufe <b>${d.host.lv}</b>, ${d.host.ki} Kills</div>
      <div class="death-gold">⛏ ${earned} Erz verdient &nbsp;·&nbsp; Gesamt: ${this.meta.gold}</div>
      <div class="dmg-breakdown">${this._dmgRowsHtml(d.dmg || this.weapons._dealt)}</div>`;
    document.getElementById('win-replay').classList.add('hidden');
    document.getElementById('win-endless').classList.add('hidden');
    document.getElementById('win-screen').classList.remove('hidden');
  }

  // -------------------------------------------------- Run-Start
  _resetCommon() {
    this.enemies.reset();
    this.gems.reset();
    this.pickups.reset();
    this.weapons.reset();
    this.weapons.add('whirl');
    this.runElapsed = 0;
    this.pendingLevelUps = 0;
    this.pendingRemoteLevelUps = 0;
    this._leveling = false;
    this.hud.setSpectate(null);
  }

  startRun(mapKey = this._selMap, diff = this._selDiff) {
    this.role = null;
    if (this.remotePlayer) this.remotePlayer.group.visible = false;
    document.getElementById('start-screen').classList.add('hidden');
    document.getElementById('death-screen').classList.add('hidden');
    document.getElementById('win-screen').classList.add('hidden');
    document.getElementById('shop').classList.add('hidden');
    this._applyLevel(mapKey, diff);
    this.player.beginRun();
    this.meta.applyToPlayer(this.player);
    this._resetCommon();
    this._onKillP1 = this._makeOnKill(this.player);
    this._lastHp = this.player.hp;
    this.camCtrl.snap(this.player.position);
    this.hud.show();
    this.hud.toast(`${this.world.theme.name} · ${DIFFS[diff].name} — Phase 1/${PHASES}`, 'gold');
    this.input.enabled = true;
    this.mode = 'play';
  }

  _hostStart() {
    this.role = 'host';
    this._ensureCoop();
    document.getElementById('lobby').classList.add('hidden');
    document.getElementById('win-screen').classList.add('hidden');
    this._applyLevel(this._selMap, this._selDiff);
    this.player.beginRun();
    this.remotePlayer.beginRun();
    this.meta.applyToPlayer(this.player);
    this.player.position.set(-3, this.world.getHeight(-3, 50), 50);
    this.remotePlayer.position.set(3, this.world.getHeight(3, 50), 50);
    this._resetCommon();
    this.weapons2.reset();
    this.weapons2.add('whirl');
    this._onKillP1 = this._makeOnKill(this.player);
    this._onKillP2 = this._makeOnKill(this.remotePlayer);
    this._lastHp = this.player.hp;
    this.remoteInput._x = 0;
    this.remoteInput._z = 0;
    this.net.send({ k: 'start', map: this._selMap, diff: this._selDiff });
    this.camCtrl.snap(this.player.position);
    this.hud.show();
    this.hud.toast('Koop gestartet! Jeder levelt selbst.', 'gold');
    this.input.enabled = true;
    this.mode = 'play';
  }

  _beginClientRun(d) {
    this.role = 'client';
    this._ensureCoop();
    document.getElementById('lobby').classList.add('hidden');
    document.getElementById('win-screen').classList.add('hidden');
    if (d && d.map && this.world.themeKey !== d.map) this.world.applyTheme(d.map);
    this.mapKey = d ? d.map : 'valley';
    this.difficulty = d ? d.diff : 'normal';
    this._lastHp = 100;
    this.player.beginRun();
    this.remotePlayer.beginRun();
    this.player.position.set(3, this.world.getHeight(3, 50), 50); // self = P2
    this.enemies.reset();
    this.gems.reset();
    this.pickups.reset();
    this.weapons.reset();
    this.weapons2.reset();
    this.weapons._ldSig = null;
    this.weapons2._ldSig = null;
    this.runElapsed = 0;
    this._clientPaused = false;
    this.hud.setSpectate(null);
    this.camCtrl.snap(this.player.position);
    this.hud.show();
    this.hud.toast('Mit der Lobby verbunden!', 'gold');
    this.input.enabled = true;
    this.mode = 'play';
  }

  _leaveOnline() {
    this.role = null;
    this.mode = 'menu';
    if (this.remotePlayer) this.remotePlayer.group.visible = false;
    document.getElementById('start-screen').classList.remove('hidden');
    document.getElementById('lobby').classList.add('hidden');
    document.getElementById('levelup').classList.add('hidden');
  }

  _players() {
    return this.role ? [this.player, this.remotePlayer] : [this.player];
  }

  _collectXp(value, who) {
    this.audio.gem();
    const lv = who.addXp(value);
    if (who === this.player) this.pendingLevelUps += lv;
    else this.pendingRemoteLevelUps += lv;
  }

  // -------------------------------------------------- Level-Up (unabhängig je Spieler)
  _maybeLevelUp() {
    if (this._leveling) return;
    if (this.pendingLevelUps > 0) this._startLocalLevelUp();
    else if (this.pendingRemoteLevelUps > 0) this._startRemoteLevelUp();
  }

  _startLocalLevelUp() {
    this._leveling = true;
    this.audio.levelup();
    this.mode = 'levelup';
    this.input.enabled = false;
    if (this.role === 'host') this.net.send({ k: 'pause', on: true });
    const cands = this.upgrades.generate(this.player, this.weapons);
    this.upgrades.present(
      cands.map((c) => ({ icon: c.icon, title: c.title, sub: c.sub })),
      (i) => {
        cands[i].apply();
        this.upgrades.close();
        this.pendingLevelUps = Math.max(0, this.pendingLevelUps - 1);
        this._endLevelUp();
      },
      this.player.level,
      'Dein Stufenaufstieg'
    );
  }

  _startRemoteLevelUp() {
    this._leveling = true;
    this.mode = 'levelup';
    this.input.enabled = false;
    this._remoteCands = this.upgrades.generate(this.remotePlayer, this.weapons2);
    this.net.send({ k: 'lvlup', choices: this._remoteCands.map((c) => ({ icon: c.icon, title: c.title, sub: c.sub })), level: this.remotePlayer.level });
    this.hud.toast('Mitspieler wählt ein Upgrade…', 'gold');
  }

  _hostApplyRemotePick(i) {
    if (this._remoteCands && this._remoteCands[i]) this._remoteCands[i].apply();
    this._remoteCands = null;
    this.pendingRemoteLevelUps = Math.max(0, this.pendingRemoteLevelUps - 1);
    this._endLevelUp();
  }

  _endLevelUp() {
    if (this.pendingLevelUps > 0) return this._startLocalLevelUp();
    if (this.pendingRemoteLevelUps > 0) return this._startRemoteLevelUp();
    this._leveling = false;
    this.mode = 'play';
    this.input.enabled = true;
    if (this.role === 'host') this.net.send({ k: 'pause', on: false });
  }

  // Client: eigener Stufenaufstieg (Auswahl lokal, Ergebnis an Host)
  _clientLevelUp(d) {
    this.audio.levelup();
    this.mode = 'levelup';
    this.input.enabled = false;
    this.upgrades.present(
      d.choices,
      (i) => {
        this.net.send({ k: 'pick', i });
        this.upgrades.close();
        this.mode = 'play';
        this.input.enabled = true;
      },
      d.level,
      'Dein Stufenaufstieg'
    );
  }

  // -------------------------------------------------- Ende
  _dmgRowsHtml(dealt) {
    const ents = Object.entries(dealt || {}).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
    if (!ents.length) return '';
    let h = '<div class="dmg-title">Schaden pro Waffe</div>';
    for (const [id, v] of ents) {
      const name = (WEAPON_DEFS[id] && WEAPON_DEFS[id].name) || id;
      h += `<div class="dmg-row"><span>${name}</span><span>${Math.round(v).toLocaleString('de-DE')}</span></div>`;
    }
    return h;
  }

  _endRun() {
    this.mode = 'dead';
    this.input.enabled = false;
    this.hud.setSpectate(null);
    this._clearSave(); // beendeter Run ist nicht mehr fortsetzbar
    const earned = Math.floor(this.player.gold);
    this.meta.addGold(earned);
    const m = Math.floor(this.runElapsed / 60);
    const s = Math.floor(this.runElapsed % 60);
    let rows = `<div>Du — Stufe <b>${this.player.level}</b>, ${this.player.kills} Kills</div>`;
    if (this.role) rows += `<div>Mitspieler — Stufe <b>${this.remotePlayer.level}</b>, ${this.remotePlayer.kills} Kills</div>`;
    document.getElementById('death-stats').innerHTML = `
      <div>Überlebt: <b>${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}</b></div>
      ${rows}
      <div class="death-gold">⛏ ${earned} Erz verdient &nbsp;·&nbsp; Gesamt: ${this.meta.gold}</div>
      <div class="dmg-breakdown">${this._dmgRowsHtml(this.weapons._dealt)}</div>`;
    document.getElementById('retry-button').classList.toggle('hidden', !!this.role); // Neuer Run nur Solo
    document.getElementById('death-shop-button').classList.toggle('hidden', !!this.role);
    document.getElementById('death-screen').classList.remove('hidden');
    if (this.role === 'host') {
      this.net.send({ k: 'over', t: this.runElapsed, host: { lv: this.player.level, ki: this.player.kills }, guest: { lv: this.remotePlayer.level, ki: this.remotePlayer.kills }, dmg: this.weapons2._dealt });
    }
  }

  _clientGameOver(d) {
    this.mode = 'dead';
    this.input.enabled = false;
    this.hud.setSpectate(null);
    const earned = Math.floor(this.player.gold);
    this.meta.addGold(earned);
    const m = Math.floor((d.t || 0) / 60);
    const s = Math.floor((d.t || 0) % 60);
    document.getElementById('death-stats').innerHTML = `
      <div>Überlebt: <b>${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}</b></div>
      <div>Du — Stufe <b>${d.guest.lv}</b>, ${d.guest.ki} Kills</div>
      <div>Mitspieler — Stufe <b>${d.host.lv}</b>, ${d.host.ki} Kills</div>
      <div class="death-gold">⛏ ${earned} Erz verdient &nbsp;·&nbsp; Gesamt: ${this.meta.gold}</div>
      <div class="dmg-breakdown">${this._dmgRowsHtml(d.dmg || this.weapons._dealt)}</div>`;
    document.getElementById('retry-button').classList.add('hidden');
    document.getElementById('death-shop-button').classList.add('hidden');
    document.getElementById('death-screen').classList.remove('hidden');
  }

  openShop(from) {
    this._shopReturn = from;
    this.mode = 'shop';
    document.getElementById('start-screen').classList.add('hidden');
    document.getElementById('death-screen').classList.add('hidden');
    this.meta.show();
  }
  _afterShop() {
    if (this._shopReturn === 'death') {
      this.mode = 'dead';
      document.getElementById('death-screen').classList.remove('hidden');
    } else this._showMenu();
  }

  // -------------------------------------------------- Snapshot
  _sendSnapshot() {
    const enc = (p) => [Math.round(p.position.x * 20) / 20, Math.round(p.position.z * 20) / 20, Math.round(p.yaw * 100) / 100, Math.round(p.hp), p.maxHp, p.dead ? 1 : 0];
    const stat = (p) => [p.level, p.xp, p.xpToNext, p.kills, Math.floor(p.gold)];
    const ld = (w) => w.ownedList().map((x) => ({ id: x.id, l: x.level, e: x.evolved ? 1 : 0 }));
    this.net.send({
      k: 'snap',
      pl: [enc(this.player), enc(this.remotePlayer)],
      en: this.enemies.snapshot(),
      gm: this.gems.snapshot(),
      pk: this.pickups.snapshot(),
      fx: this.fx.drain(),
      p1: stat(this.player),
      p2: stat(this.remotePlayer),
      ld1: ld(this.weapons),
      ld2: ld(this.weapons2),
      pa2: this.remotePlayer.passiveCounts,
      ph: this.phaseIndex,
      bp: this.bossPhase ? 1 : 0,
      t: Math.round(this.runElapsed),
    });
  }

  _applySnapshot(d) {
    const host = d.pl[0]; // P1
    const self = d.pl[1]; // P2 = ich
    this._authRemote = { x: host[0], z: host[1], yaw: host[2] };
    this.remotePlayer.hp = host[3]; this.remotePlayer.maxHp = host[4]; this.remotePlayer.dead = host[5] === 1;
    this._authSelf = { x: self[0], z: self[1] };
    this.player.hp = self[3]; this.player.maxHp = self[4]; this.player.dead = self[5] === 1;
    this.runElapsed = d.t || 0;
    if (d.p2) { this.player.level = d.p2[0]; this.player.xp = d.p2[1]; this.player.xpToNext = d.p2[2]; this.player.kills = d.p2[3]; this.player.gold = d.p2[4]; }
    if (d.p1) { this.remotePlayer.level = d.p1[0]; this.remotePlayer.kills = d.p1[3]; }
    if (d.pa2) this.player.passiveCounts = d.pa2; // eigene Passive im HUD
    if (d.ph != null) this.phaseIndex = d.ph;
    this.bossPhase = !!d.bp;
    // eigene Waffen = ld2, Host-Waffen = ld1
    if (d.ld2) this.weapons.setLoadout(d.ld2.map((w) => ({ id: w.id, level: w.l, evolved: !!w.e })));
    if (d.ld1) this.weapons2.setLoadout(d.ld1.map((w) => ({ id: w.id, level: w.l, evolved: !!w.e })));
    this.enemies.setSnapshot(d.en || []);
    this.gems.applySnapshot(d.gm || [], 0);
    this.pickups.applySnapshot(d.pk || []);
    if (d.fx) this.fx.replay(d.fx);
  }

  _camTarget() {
    if (this.role && this.player.dead && this.remotePlayer && !this.remotePlayer.dead) return this.remotePlayer.position;
    return this.player.position;
  }

  _drawMinimap() {
    const self = this.player.position;
    const allies = this.role ? [{ x: this.remotePlayer.position.x, z: this.remotePlayer.position.z, dead: this.remotePlayer.dead }] : [];
    let enemies;
    if (this.role === 'client') enemies = (this.enemies._ghostList || []).map((g) => ({ x: g.x, z: g.z, boss: g.def && g.def.boss }));
    else enemies = this.enemies.enemies.filter((e) => e.alive).map((e) => ({ x: e.x, z: e.z, boss: e.def.boss }));
    const pickups = this.pickups.items.filter((it) => it.alive).map((it) => ({ x: it.x, z: it.z }));
    this.hud.drawMinimap(self, allies, enemies, pickups);
  }

  // Lebensbalken über beschädigten Gegnern + Boss-Balken oben
  _drawCombatUI() {
    const cam = this.camera;
    const w = window.innerWidth;
    const h = window.innerHeight;
    const v = this._projV || (this._projV = new THREE.Vector3());
    const client = this.role === 'client';
    const src = client ? this.enemies._ghostList || [] : this.enemies.enemies;
    const px = this.player.position.x;
    const pz = this.player.position.z;
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
    this.hud.drawEnemyBars(list.slice(0, 60));
    const bi = this.enemies.bossInfo(client);
    this.hud.setBossBar(bi ? bi.name : null, bi ? bi.frac : 0);
    // Boss-Erscheinen beim Gast (Host kündigt schon via bossAnnounce an)
    if (bi && !this._bossSeen) {
      this._bossSeen = true;
      if (client) {
        this.hud.bossBanner(`${bi.name} ERSCHEINT`);
        this.audio.boss();
      }
    } else if (!bi) {
      this._bossSeen = false;
    }
  }

  // -------------------------------------------------- Loop
  update() {
    const dt = Math.min(0.05, this.clock.getDelta());
    this.world.update(dt, this.world.time + dt);
    const camp = this._camTarget ? this._camTarget() : this.player.position;
    if (this.player && this.playerLight) {
      this.playerLight.position.set(camp.x, camp.y + 5, camp.z);
      this.playerFill.position.set(camp.x + 6, camp.y + 14, camp.z + 6);
      this.playerFill.target.position.set(camp.x, camp.y, camp.z);
    }
    if (this.fx) this.fx.update(dt);

    if (this.mode === 'play' && this.role !== 'client') this._updatePlayHost(dt);
    else if (this.mode === 'play' && this.role === 'client') this._updatePlayClient(dt);
    else {
      if (this.player) {
        this.player.mixer.update(dt);
        if (this.remotePlayer && this.remotePlayer.group.visible) this.remotePlayer.mixer.update(dt);
        this.camCtrl.update(dt, null, this._camTarget());
      }
    }

    // Verletzungs-Sound (Leben sinkt deutlich)
    if (this.mode === 'play' && this.player) {
      if (this._lastHp == null) this._lastHp = this.player.hp;
      if (!this.player.dead && this.player.hp < this._lastHp - 2) this.audio.hurt();
      this._lastHp = this.player.hp;
    }

    this.input.endFrame();
    this.composer.render();
  }

  _updatePlayHost(dt) {
    this.runElapsed += dt;
    const co = this.role === 'host';
    this.player.update(dt, this.input);
    if (co) this.remotePlayer.update(dt, this.remoteInput);
    this.camCtrl.update(dt, this.input, this._camTarget());

    const ps = this._players();
    this.enemies.update(dt, ps, null);
    this.weapons.update(dt, this.player, this.enemies, this._onKillP1);
    if (co) this.weapons2.update(dt, this.remotePlayer, this.enemies, this._onKillP2);
    this.gems.update(dt, ps, (v, who) => this._collectXp(v, who));
    this.pickups.update(dt, ps);

    // Spectate-Banner für den Host, wenn er tot ist
    if (co && this.player.dead && !this.remotePlayer.dead) this.hud.setSpectate('deinen Mitspieler');
    else this.hud.setSpectate(null);

    this.hud.update(this.player, this.weapons, this.runElapsed, this.enemies.aliveCount);
    this.hud.setPhase(this._phaseText());
    this._drawMinimap();
    this._drawCombatUI();

    // Phasen-/Boss-/Sieg-Logik
    this._phaseTick(dt);
    if (this.mode !== 'play') return; // Sieg eingetreten

    // Autospeichern (alle 15s)
    this._autosaveAcc = (this._autosaveAcc || 0) + dt;
    if (this._autosaveAcc > 15) {
      this._autosaveAcc = 0;
      if (!this.player.dead) this._saveRun();
    }

    if (co) {
      this._snapAcc += dt;
      if (this._snapAcc >= 1 / SNAP_HZ) { this._snapAcc = 0; this._sendSnapshot(); }
    }

    if (ps.every((p) => p.dead)) this._endRun();
    else this._maybeLevelUp();
  }

  _updatePlayClient(dt) {
    const spectating = this.player.dead && this.remotePlayer && !this.remotePlayer.dead;
    if (!this._clientPaused && !this.player.dead) this.player.update(dt, this.input);
    else this.player.mixer.update(dt);
    if (this._authSelf) {
      const k = Math.min(1, dt * 6);
      this.player.position.x += (this._authSelf.x - this.player.position.x) * k;
      this.player.position.z += (this._authSelf.z - this.player.position.z) * k;
      this.player.position.y = this.world.getHeight(this.player.position.x, this.player.position.z);
      this.player.group.position.copy(this.player.position);
    }
    if (this._authRemote && this.remotePlayer) {
      const r = this.remotePlayer;
      const k = Math.min(1, dt * 9);
      const moving = Math.hypot(this._authRemote.x - r.position.x, this._authRemote.z - r.position.z) > 0.03;
      r.position.x += (this._authRemote.x - r.position.x) * k;
      r.position.z += (this._authRemote.z - r.position.z) * k;
      r.position.y = this.world.getHeight(r.position.x, r.position.z);
      r.yaw = this._authRemote.yaw;
      r.group.position.copy(r.position);
      r.group.rotation.y = r.yaw + r.modelYawOffset;
      r._play(r.dead ? r.idleAction : moving ? r.runAction || r.idleAction : r.idleAction);
      if (r.dead) r.group.rotation.z = Math.min(Math.PI / 2.2, r.group.rotation.z + dt * 3);
      r.mixer.update(dt);
    }

    // Gegner flüssig interpolieren + Waffen-Visuals beider Spieler
    this.enemies.clientRender(dt);
    this.weapons.renderVisualsOnly(dt, this.player);
    this.weapons2.renderVisualsOnly(dt, this.remotePlayer);
    this.pickups.animate(dt);

    this.hud.setSpectate(spectating ? 'deinen Mitspieler' : null);
    this.camCtrl.update(dt, this.input, this._camTarget());
    this.hud.update(this.player, this.weapons, this.runElapsed, this.enemies.ghostCount);
    this.hud.setPhase(this._phaseText());
    this._drawMinimap();
    this._drawCombatUI();

    this._inAcc += dt;
    if (this._inAcc >= 1 / INPUT_HZ) {
      this._inAcc = 0;
      const ax = this._clientPaused || this.player.dead ? { x: 0, z: 0 } : this.input.axis();
      this.net.send({ k: 'in', x: ax.x, z: ax.z });
    }
  }

  loop() {
    this.update();
    requestAnimationFrame(() => this.loop());
  }

  _onResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
    if (this.bloom) this.bloom.setSize(w, h);
    if (this.hud) this.hud.resize(w, h);
  }
}
