import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

// Pixel-Art / HD-2D-Look: rastert das fertige Bild auf ein Pixelgitter + leichte Farbquantisierung.
const PixelArtShader = {
  uniforms: { tDiffuse: { value: null }, resolution: { value: new THREE.Vector2(1, 1) }, pixelSize: { value: 4 }, levels: { value: 32 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform vec2 resolution; uniform float pixelSize; uniform float levels; varying vec2 vUv;
    void main(){
      vec2 dxy = pixelSize / resolution;
      vec2 coord = dxy * (floor(vUv / dxy) + 0.5);
      vec3 c = texture2D(tDiffuse, coord).rgb;
      c = floor(c * levels + 0.5) / levels; // sanfte Farbquantisierung (Retro-Look)
      gl_FragColor = vec4(c, 1.0);
    }`,
};

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
import { spriteQuad, spriteMaterial, SPRITE_FRAMES, loadSprites } from './spriteart.js';
import { Net } from '../net/Net.js';

const SNAP_HZ = 20;
const INPUT_HZ = 22;
const REVIVE_RANGE = 2.8; // Nähe zum gefallenen Mate für Wiederbelebung
const REVIVE_TIME = 3.0; // Sekunden Halten für eine Wiederbelebung
const AURA_RANGE = 7; // Nähe-Aura wirkt, wenn beide Spieler enger als das beieinander sind
const INTRO_DUR = 2.6; // Dauer des Start-Intros (Kamera-Flourish + Titel)
const EMOTES = ['🆘 Hilfe!', '👍 Danke!', '💎 Sammeln!', '⚠ Achtung!']; // Quick-Emotes (Tasten 1–4)
const PHASES = 3; // Phasen pro Level, dann finaler Boss
const KILLS_PER_PHASE = [55, 80, 110]; // Gegner pro Phase erlegen, dann Mini-Boss
const MINI_BOSSES = ['boss', 'boss_bone', 'boss_demon']; // Phasen-Anführer
const BASE_REROLLS = 3;
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
    this.bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.32, 0.5, 0.82);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    // Pixel-Art-Look als letzter Pass
    this.pixelPass = new ShaderPass(PixelArtShader);
    this.pixelPass.uniforms.pixelSize.value = 4;
    this.pixelPass.enabled = false; // HD-2D: 3D-Welt scharf, Pixel-Look kommt von den Sprites
    this.composer.addPass(this.pixelPass);
    this._syncPixelResolution();
  }

  _syncPixelResolution() {
    if (!this.pixelPass) return;
    const v = new THREE.Vector2();
    this.renderer.getDrawingBufferSize(v);
    this.pixelPass.uniforms.resolution.value.copy(v);
    // konstante Pixelgröße in CSS-Pixeln (über Pixelverhältnis skaliert) — kleiner = schärfer
    this.pixelPass.uniforms.pixelSize.value = Math.max(2, Math.round(3 * this.renderer.getPixelRatio()));
  }

  _makeSprite(key) {
    const im = new THREE.InstancedMesh(spriteQuad(1), spriteMaterial(key), 1);
    im.count = 1;
    im.frustumCulled = false;
    im.setColorAt(0, new THREE.Color(1, 1, 1));
    this.scene.add(im);
    return im;
  }

  // Kamera-Rechtsachse (x,z) -> bestimmt links/rechts für Sprite-Spiegelung
  _updateCamRight() {
    this.camera.updateMatrixWorld();
    const e = this.camera.matrixWorld.elements;
    let rx = e[0], rz = e[2];
    const l = Math.hypot(rx, rz) || 1;
    this._camRX = rx / l;
    this._camRZ = rz / l;
    if (this.enemies) { this.enemies.camRightX = this._camRX; this.enemies.camRightZ = this._camRZ; }
  }

  _placeSprite(im, p, scale, frame, flip) {
    if (!this._spq) { this._spq = new THREE.Quaternion(); this._spv = new THREE.Vector3(); this._sps = new THREE.Vector3(); this._spm = new THREE.Matrix4(); }
    this._spv.set(p.x, p.y, p.z);
    this._sps.set(scale, scale, scale);
    this._spm.compose(this._spv, this._spq, this._sps);
    im.setMatrixAt(0, this._spm);
    im.instanceMatrix.needsUpdate = true;
    const af = im.geometry.getAttribute('aFrame'); af.setX(0, frame); af.needsUpdate = true;
    const fl = im.geometry.getAttribute('aFlip'); fl.setX(0, flip); fl.needsUpdate = true;
  }

  // Blickrichtung eines Spielers aus seiner Bewegung (auf Kamera-Rechtsachse projiziert)
  _heroFlip(pl, key) {
    const dir = (pl._mvx || 0) * (this._camRX ?? 1) + (pl._mvz || 0) * (this._camRZ ?? 0);
    if (dir > 0.05) this[key] = 1; else if (dir < -0.05) this[key] = -1;
    return this[key] || 1;
  }

  _updateHeroSprites() {
    const fr = Math.floor(this.runElapsed * 7) % SPRITE_FRAMES;
    this.playerSprite.visible = true;
    this._placeSprite(this.playerSprite, this.player.position, 2.9, fr, this._heroFlip(this.player, '_pFlip'));
    this.remoteSprite.visible = !!this.role && !!this.remotePlayer;
    if (this.remoteSprite.visible) this._placeSprite(this.remoteSprite, this.remotePlayer.position, 2.9, fr, this._heroFlip(this.remotePlayer, '_rFlip'));
  }

  async _preload() {
    this.assets = new Assets();
    try {
      await this.assets.loadAll();
      await loadSprites(); // echte Pixel-Art-Sprites (Gegner + Held)
    } catch (e) {
      console.error('Asset-Ladefehler:', e);
    }
    this.player = new Player(this.scene, this.world, this.assets.createHero(1.9));
    // HD-2D: Spieler als Pixel-Sprite statt 3D-Modell
    this.player.group.visible = false;
    this.playerSprite = this._makeSprite('player');
    this.remoteSprite = this._makeSprite('player');
    this.remoteSprite.visible = false;

    this.playerLight = new THREE.PointLight(0xffe2b0, 10, 26, 1.4);
    this.scene.add(this.playerLight);
    this.playerFill = new THREE.DirectionalLight(0xfff0d8, 0.6);
    this.scene.add(this.playerFill);
    this.scene.add(this.playerFill.target);

    this.enemies = new EnemyManager(this.scene, this.world);
    await this.enemies.loadModels(); // echte animierte Modelle (VAT) backen
    this.enemies.bossAnnounce = (name) => {
      this.hud.bossBanner(`${name} ERSCHEINT`);
      this.hud.toast(`⚠ ${name} ERSCHEINT!`, 'blood');
      this.audio.boss();
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
      enabled: true, _x: 0, _z: 0, reviving: false,
      axis() { return { x: this._x, z: this._z }; },
      isDown: () => false, pressed: () => false, mouseDown: () => false, clicked: () => false,
      mouse: { wheel: 0, dx: 0, dy: 0 },
    };

    this._initNet();
    this.camCtrl.snap(this.player.position);
    this._wireUI();
    document.getElementById('loading').classList.add('hidden');
    this._bootFlow();
    this.clock.start();
    this.loop();
  }

  // jeder Gegner-Tod schreibt Kills/Erz dem jeweiligen Spieler gut
  _makeOnKill(p) {
    return (e) => {
      p.kills++;
      this._phaseKills++;
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
    this.net.onCreated = () => {
      this._enterLobbyRoom('host');
      this._setLobbySlot2(false);
      document.getElementById('lobby-start').classList.add('hidden');
      this._setLobbyStatus('Warte auf Mitspieler…');
    };
    this.net.onPeerJoined = () => {
      this._setLobbySlot2(true);
      this._setLobbyStatus('Mitspieler verbunden — bereit zum Start!');
      document.getElementById('lobby-start').classList.remove('hidden');
      if (this.audio && this.audio.pickup) this.audio.pickup();
    };
    this.net.onJoined = () => {
      this._enterLobbyRoom('client');
      this._setLobbyStatus('Verbunden — warte auf Host-Start…');
    };
    this.net.onPeerLeft = () => {
      this.hud.toast('Mitspieler hat die Lobby verlassen', 'blood');
      if (this.mode === 'play' || this.mode === 'levelup' || this.mode === 'paused') this._leaveOnline();
      else { this._setLobbySlot2(false); document.getElementById('lobby-start').classList.add('hidden'); this._setLobbyStatus('Mitspieler getrennt — warte…'); }
    };
    this.net.onError = (msg) => this._setLobbyStatus('Fehler: ' + msg);
    this.net.onLobbyList = (list) => { if (this.mode === 'lobby') this._renderLobbyList(list); };
    this.net.onData = (d) => this._onNetData(d);
  }

  async _openLobby() {
    this.mode = 'lobby';
    document.getElementById('start-screen').classList.add('hidden');
    document.getElementById('lobby').classList.remove('hidden');
    document.getElementById('lobby-entry').classList.remove('hidden');
    document.getElementById('lobby-room').classList.add('hidden');
    document.getElementById('lobby-start').classList.add('hidden');
    this._setLobbyStatus('');
    this._renderSelectors('lobby-maps', 'lobby-diffs');
    document.getElementById('lobby-list').innerHTML = '<div class="lobby-empty">Verbinde…</div>';
    if (await this._lobbyConnect()) this.net.list();
  }

  // Verbindet mit dem Server (falls noch nicht verbunden). Gibt true bei Erfolg.
  async _lobbyConnect() {
    if (this.net.connected) return true;
    try {
      await this.net.connect(document.getElementById('lobby-server').value || undefined);
      return true;
    } catch (e) {
      document.getElementById('lobby-list').innerHTML = '<div class="lobby-empty">Server nicht erreichbar — läuft <code>npm run server</code>?</div>';
      return false;
    }
  }

  // Offene Lobbys anzeigen (mit Beitreten-Button je Zeile)
  _renderLobbyList(list) {
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
    el.querySelectorAll('.li-join').forEach((b) => b.addEventListener('click', () => this._lobbyJoinId(b.getAttribute('data-id'))));
  }

  // Warteraum betreten (Host oder Client)
  _enterLobbyRoom(role) {
    document.getElementById('lobby-entry').classList.add('hidden');
    document.getElementById('lobby-room').classList.remove('hidden');
    document.getElementById('lobby-host-opts').classList.toggle('hidden', role !== 'host'); // nur Host wählt Karte
    document.getElementById('lp-state-1').textContent = role === 'host' ? 'Du' : 'Verbunden';
    document.getElementById('lp-state-2').textContent = role === 'client' ? 'Du' : 'Warte…';
    if (role === 'client') this._setLobbySlot2(true);
  }
  _setLobbySlot2(connected) {
    const slot = document.getElementById('lp-slot-2');
    const dot = document.getElementById('lp-dot-2');
    const state = document.getElementById('lp-state-2');
    if (slot) slot.classList.toggle('ready', connected);
    if (dot) dot.classList.toggle('on', connected);
    if (state && this.net.role === 'host') state.textContent = connected ? 'Verbunden' : 'Warte…';
  }
  _setLobbyStatus(txt) {
    const el = document.getElementById('lobby-status');
    if (el) el.textContent = txt;
  }

  async _lobbyCreate() {
    if (!(await this._lobbyConnect())) return;
    this.net.create(this._selMap, this._selDiff);
  }
  async _lobbyJoinId(id) {
    if (!id || !(await this._lobbyConnect())) return;
    this._setLobbyStatus('Trete bei…');
    this.net.join(id);
  }

  _ensureCoop() {
    if (!this.remotePlayer) this.remotePlayer = new Player(this.scene, this.world, this.assets.createHero(1.9, 0x6aa6e6));
    // HD-2D: der Mitspieler wird als Pixel-Sprite gezeigt — rohes 3D-Modell bleibt versteckt
    this.remotePlayer.group.visible = false;
    if (!this.weapons2) {
      this.weapons2 = new Weapons(this.scene);
      this.weapons2.fx = this.fx;
    }
  }

  _onNetData(d) {
    if (!d) return;
    if (d.k === 'ping') { this._addPing(d.x, d.z); return; } // Team-Ping (beide Rollen)
    if (d.k === 'emote') { this._showEmote('mate', d.i); return; }
    if (d.k === 'start' && this.net.role === 'client') this._beginClientRun(d);
    else if (d.k === 'in' && this.role === 'host') { this.remoteInput._x = d.x; this.remoteInput._z = d.z; this.remoteInput.reviving = !!d.rv; if (d.dodge) this.remotePlayer.dodge(); if (d.mash) this.remotePlayer.mashFree(0.2 *d.mash); }
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
    else if (d.k === 'reroll' && this.role === 'host') this._hostRerollRemote();
    else if (d.k === 'combo' && this.role === 'client') {
      this.mode = 'levelup';
      this.input.enabled = false;
      this.upgrades.presentCombo(
        { key: d.key, base: d.base, consume: d.consume, name: d.name, desc: d.desc },
        () => { this.net.send({ k: 'comboPick', yes: 1 }); this.upgrades.close(); this.mode = 'play'; this.input.enabled = true; },
        () => { this.net.send({ k: 'comboPick', yes: 0 }); this.upgrades.close(); this.mode = 'play'; this.input.enabled = true; }
      );
    } else if (d.k === 'comboPick' && this.role === 'host') {
      const c = this._pendingRemoteCombo;
      if (c) {
        if (d.yes) this.weapons2.combine(c);
        else this._declinedRemoteCombos.add(c.key);
      }
      this._pendingRemoteCombo = null;
      this._endLevelUp();
    } else if (d.k === 'dps' && this.role === 'client') this._clientDealt = d.d || {};
    else if (d.k === 'gpause' && this.role === 'host') this._peerPause(d.on);
    else if (d.k === 'over' && this.role === 'client') this._clientGameOver(d);
  }

  // -------------------------------------------------- UI
  _wireUI() {
    document.getElementById('start-button').addEventListener('click', () => this._openMapSelect());
    document.getElementById('resume-button').addEventListener('click', () => this.resumeRun());
    document.getElementById('shop-button').addEventListener('click', () => this.openShop('menu'));
    document.getElementById('combos-button').addEventListener('click', () => this._openCombos('menu'));
    const pauseCombos = document.getElementById('pause-combos');
    if (pauseCombos) pauseCombos.addEventListener('click', () => this._openCombos('pause'));
    document.getElementById('combos-back').addEventListener('click', () => {
      document.getElementById('combos-screen').classList.add('hidden');
      const back = this._combosReturn === 'pause' ? 'pause-screen' : 'start-screen';
      document.getElementById(back).classList.remove('hidden');
    });
    document.getElementById('online-button').addEventListener('click', () => this._openLobby());
    const nameEl = document.getElementById('player-name');
    if (nameEl) {
      this._loadName();
      const updName = () => {
        const v = nameEl.value.trim();
        try { localStorage.setItem('gothicName', v); } catch (e) {}
        const btn = document.getElementById('name-confirm');
        if (btn) btn.disabled = v.length === 0;
      };
      nameEl.addEventListener('input', updName);
      nameEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') this._confirmName(); });
    }
    const nameConfirm = document.getElementById('name-confirm');
    if (nameConfirm) nameConfirm.addEventListener('click', () => this._confirmName());
    const changeName = document.getElementById('change-name');
    if (changeName) changeName.addEventListener('click', () => this._showNameScreen());
    document.getElementById('leaderboard-button').addEventListener('click', () => this._openLeaderboard());
    document.getElementById('lb-back').addEventListener('click', () => { document.getElementById('leaderboard-screen').classList.add('hidden'); this._showMenu(); });
    document.getElementById('lb-tab-time').addEventListener('click', () => { document.getElementById('lb-tab-time').classList.add('active'); document.getElementById('lb-tab-kills').classList.remove('active'); this._renderLeaderboard('time'); });
    document.getElementById('lb-tab-kills').addEventListener('click', () => { document.getElementById('lb-tab-kills').classList.add('active'); document.getElementById('lb-tab-time').classList.remove('active'); this._renderLeaderboard('kills'); });
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
    document.getElementById('lobby-refresh').addEventListener('click', () => { if (this.net.connected) this.net.list(); });
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
    clearTimeout(this._introTimer);
    const intro = document.getElementById('intro');
    if (intro) intro.classList.add('hidden');
    this._introT = 0;
    const ms = document.getElementById('menu-stats');
    if (ms) ms.textContent = `Gesammeltes Erz: ${this.meta.gold}`;
    const mn = document.getElementById('menu-name');
    if (mn) mn.textContent = this._playerName();
    document.getElementById('resume-button').classList.toggle('hidden', !this._hasSave());
    document.getElementById('start-screen').classList.remove('hidden');
  }

  // Kombinationen-Übersicht — aus dem Hauptmenü ODER dem Pause-Menü aufrufbar
  _openCombos(from) {
    this._combosReturn = from;
    document.getElementById('combos-list').innerHTML = this.upgrades.combosListHtml();
    document.getElementById(from === 'pause' ? 'pause-screen' : 'start-screen').classList.add('hidden');
    document.getElementById('combos-screen').classList.remove('hidden');
  }

  // -------------------------------------------------- Name & Bestenliste
  _playerName() {
    const el = document.getElementById('player-name');
    return ((el && el.value.trim()) || '') || 'Anonym';
  }
  _loadName() {
    try { const n = localStorage.getItem('gothicName'); if (n) document.getElementById('player-name').value = n; } catch (e) {}
  }
  // Start: ohne gespeicherten Namen zuerst den Pflicht-Namens-Screen zeigen
  _bootFlow() {
    let name = '';
    try { name = (localStorage.getItem('gothicName') || '').trim(); } catch (e) {}
    if (name) this._showMenu();
    else this._showNameScreen();
  }
  _showNameScreen() {
    this.mode = 'menu';
    document.getElementById('start-screen').classList.add('hidden');
    const el = document.getElementById('player-name');
    const btn = document.getElementById('name-confirm');
    if (btn) btn.disabled = ((el && el.value.trim().length) || 0) === 0;
    document.getElementById('name-screen').classList.remove('hidden');
    try { el.focus(); } catch (e) {}
  }
  _confirmName() {
    const el = document.getElementById('player-name');
    const v = ((el && el.value) || '').trim();
    if (!v) { if (el) el.focus(); return; } // Pflicht: ohne Namen kein Weiter
    try { localStorage.setItem('gothicName', v); } catch (e) {}
    document.getElementById('name-screen').classList.add('hidden');
    this._showMenu();
  }
  _esc(s) {
    return String(s).replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
  }
  // Ergebnis eines Runs speichern: lokal (Cache) + an den Server (Postgres, best effort)
  _recordScore(win) {
    const entry = {
      name: this._playerName(),
      time: Math.round(this.runElapsed),
      kills: this.player.kills,
      level: this.player.level,
      gold: Math.floor(this.player.gold),
      map: this.mapKey,
      coop: !!this.role,
      win: !!win,
      ts: Date.now(),
    };
    try {
      const scores = JSON.parse(localStorage.getItem('gothicScores') || '[]');
      scores.push(entry);
      scores.sort((a, b) => b.time - a.time);
      localStorage.setItem('gothicScores', JSON.stringify(scores.slice(0, 100)));
    } catch (e) { /* ignore */ }
    try {
      fetch('/api/scores', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(entry) }).catch(() => {});
    } catch (e) { /* offline: nur lokal */ }
  }
  _openLeaderboard() {
    document.getElementById('start-screen').classList.add('hidden');
    document.getElementById('leaderboard-screen').classList.remove('hidden');
    document.getElementById('lb-tab-time').classList.add('active');
    document.getElementById('lb-tab-kills').classList.remove('active');
    this._renderLeaderboard('time');
  }
  // Server-Bestenliste laden (Postgres); leer/offline -> lokale Liste anzeigen
  async _renderLeaderboard(sortBy) {
    this._lbSort = sortBy;
    const el = document.getElementById('lb-list');
    el.innerHTML = '<div class="lb-empty">Lade…</div>';
    let server = null;
    try {
      const r = await fetch(`/api/scores?sort=${sortBy}&limit=15`);
      if (r.ok) { const data = await r.json(); if (Array.isArray(data)) server = data; }
    } catch (e) { /* Server nicht erreichbar */ }
    if (this._lbSort !== sortBy) return; // Tab wurde inzwischen gewechselt
    if (server && server.length) { this._renderLbRows(el, server, true); return; }
    // leer oder offline -> lokale Liste
    let local = [];
    try { local = JSON.parse(localStorage.getItem('gothicScores') || '[]'); } catch (e) {}
    local.sort((a, b) => (sortBy === 'kills' ? b.kills - a.kills : b.time - a.time));
    this._renderLbRows(el, local.slice(0, 15), false);
  }
  _renderLbRows(el, scores, global) {
    if (!scores || !scores.length) { el.innerHTML = '<div class="lb-empty">Noch keine Einträge — überlebe einen Run!</div>'; return; }
    const fmtT = (t) => `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
    let h = `<div class="lb-src">${global ? '🌐 Global' : '💾 Lokal (Server offline)'}</div>`;
    h += `<div class="lb-row lb-head"><span class="lb-rank">#</span><span class="lb-name">Name</span><span class="lb-val">Zeit</span><span class="lb-val">Kills</span><span class="lb-val">Stufe</span></div>`;
    scores.slice(0, 15).forEach((s, i) => {
      h += `<div class="lb-row"><span class="lb-rank">${i + 1}</span><span class="lb-name">${this._esc(s.name)}${s.coop ? ' 👥' : ''}${s.win ? ' 🏆' : ''}</span><span class="lb-val">${fmtT(s.time)}</span><span class="lb-val">${s.kills}</span><span class="lb-val">${s.level}</span></div>`;
    });
    el.innerHTML = h;
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
        map: this.mapKey, diff: this.difficulty, phaseIndex: this.phaseIndex, phaseKills: this._phaseKills, phaseStage: this.phaseStage, endless: this.endless,
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
    this._phaseKills = data.phaseKills || 0;
    this.enemies.phase = this.phaseIndex;
    this.endless = !!data.endless;
    this.phaseStage = data.phaseStage || 'horde';
    const c = this.player.position;
    if (this.endless) {
      this.enemies.autoBoss = true;
      this.enemies.spawnEnabled = true;
      this.enemies.bossTimer = 60;
      this.phaseStage = 'horde';
    } else if (this.phaseStage === 'final') {
      this.bossPhase = true;
      this.enemies.spawnScale = 0.6;
      const bt = (this.world.theme && this.world.theme.finalBoss) || 'boss';
      this._finalBoss = this.enemies.spawnBoss(bt, c.x, c.z, 2.6 * this.enemies.diff, 1.25, 'ENDBOSS');
    } else if (this.phaseStage === 'mini') {
      this.bossPhase = true;
      this.enemies.spawnScale = 0.55;
      const type = MINI_BOSSES[this.phaseIndex % MINI_BOSSES.length];
      this._miniBoss = this.enemies.spawnBoss(type, c.x, c.z, (0.4 + this.phaseIndex * 0.28) * this.enemies.diff, 0.75, 'ANFÜHRER');
    }
    this.pendingLevelUps = 0;
    this.pendingRemoteLevelUps = 0;
    this._leveling = false;
    this._onKillP1 = this._makeOnKill(this.player);
    this._lastHp = this.player.hp;
    this.fx.record = false; // Solo-Fortsetzung: keine Aufnahme
    this.fx.drain();
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
    if (this.role === 'client') this.net.send({ k: 'gpause', on: true }); // Host mit-pausieren
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
    if (this.role === 'client') this.net.send({ k: 'gpause', on: false });
  }

  // Host: Gast hat sein Menü geöffnet/geschlossen -> Simulation mit-pausieren
  _peerPause(on) {
    this._peerPaused = on;
    if (on) {
      if (this.mode === 'play') { this.mode = 'paused'; this.input.enabled = false; }
      this.hud.setPeerPause(true);
    } else {
      this.hud.setPeerPause(false);
      const ownPause = !document.getElementById('pause-screen').classList.contains('hidden');
      if (this.mode === 'paused' && !ownPause && !this._leveling) { this.mode = 'play'; this.input.enabled = true; }
    }
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
      mapEl.querySelectorAll('[data-map]').forEach((b) => b.addEventListener('click', () => { this._selMap = b.getAttribute('data-map'); this._renderSelectors(mapElId, diffElId); this._lobbyUpdate(); }));
    }
    if (diffEl) {
      diffEl.innerHTML = Object.keys(DIFFS).map((k) => `<button class="sel-btn ${k === this._selDiff ? 'active' : ''}" data-diff="${k}">${DIFFS[k].name}</button>`).join('');
      diffEl.querySelectorAll('[data-diff]').forEach((b) => b.addEventListener('click', () => { this._selDiff = b.getAttribute('data-diff'); this._renderSelectors(mapElId, diffElId); this._lobbyUpdate(); }));
    }
  }
  // Host: geänderte Karte/Schwierigkeit im Warteraum an die Lobby-Liste melden
  _lobbyUpdate() {
    if (this.net && this.net.role === 'host' && this.net.connected) this.net.updateLobby(this._selMap, this._selDiff);
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
    this.enemies.spawnScale = 1;
    this.enemies.phase = 0;
    this.phaseIndex = 0;
    this._phaseKills = 0;
    this.bossPhase = false;
    this.phaseStage = 'horde'; // 'horde' | 'mini' | 'final'
    this.levelWon = false;
    this.endless = false;
    this._finalBoss = null;
    this._miniBoss = null;
  }

  _startEndless() {
    document.getElementById('win-screen').classList.add('hidden');
    this.endless = true;
    this.levelWon = false;
    this.bossPhase = false;
    this._finalBoss = null;
    this.enemies.spawnEnabled = true;
    this.enemies.spawnScale = 1;
    this.enemies.autoBoss = true; // wiederkehrende Bosse
    this.enemies.bossTimer = 55;
    this.enemies.bossInterval = 70; // Bosse kommen häufiger als im normalen Lauf (100)
    this._endlessTime = 0;
    this._endlessRamp = 0;
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
    this._playIntro();
    if (this.role === 'host') this.net.send({ k: 'endless' });
  }

  _phaseTick(dt) {
    if (this.endless) {
      this._endlessRamp = (this._endlessRamp || 0) + dt;
      this._endlessTime = (this._endlessTime || 0) + dt;
      if (this._endlessRamp > 14) {
        this._endlessRamp = 0;
        this.enemies.phase++; // zähere Gegner + mehr Spawns (schneller als zuvor)
      }
      // immer mehr Gegner gleichzeitig, je länger man überlebt (steiler)
      this.enemies.spawnScale = 1 + this._endlessTime / 45;
      this.enemies.maxAlive = 800;
      return;
    }
    if (this.levelWon) return;
    const c = this.player.position;
    if (this.phaseStage === 'horde') {
      // Gegner-Quota erfüllt -> Mini-Boss (Anführer) der Phase
      if (this._phaseKills >= this._phaseTarget()) {
        this.phaseStage = 'mini';
        this.bossPhase = true;
        this.enemies.spawnScale = 0.55; // weniger Adds, aber es kommen welche nach
        const type = MINI_BOSSES[this.phaseIndex % MINI_BOSSES.length];
        const mult = (0.4 + this.phaseIndex * 0.28) * this.enemies.diff;
        this._miniBoss = this.enemies.spawnBoss(type, c.x, c.z, mult, 0.75, 'ANFÜHRER');
        this.hud.toast('Anführer der Phase erschienen — besiege ihn!', 'blood');
      }
    } else if (this.phaseStage === 'mini') {
      if (this._miniBoss && !this._miniBoss.alive) {
        this.phaseIndex++;
        this._phaseKills = 0;
        this._miniBoss = null;
        if (this.phaseIndex >= PHASES) {
          this.phaseStage = 'final';
          this.enemies.spawnScale = 0.6;
          const bt = (this.world.theme && this.world.theme.finalBoss) || 'boss';
          this._finalBoss = this.enemies.spawnBoss(bt, c.x, c.z, 2.6 * this.enemies.diff, 1.25, 'ENDBOSS');
          this.hud.toast('DER ENDBOSS ERSCHEINT — schließe das Level ab!', 'blood');
        } else {
          this.phaseStage = 'horde';
          this.bossPhase = false;
          this.enemies.spawnScale = 1;
          this.enemies.phase = this.phaseIndex;
          this.hud.toast(`Phase ${this.phaseIndex + 1} von ${PHASES}`, 'gold');
        }
      }
    } else if (this.phaseStage === 'final') {
      if (this._finalBoss && !this._finalBoss.alive) this._winLevel();
    }
  }

  _phaseTarget() {
    return KILLS_PER_PHASE[Math.min(this.phaseIndex, KILLS_PER_PHASE.length - 1)];
  }

  // Live-DPS: gleitender Mittelwert je Waffe aus dem kumulierten Schaden
  // DPS = Gesamtschaden der Waffe / Zeit seit sie im Besitz ist (stabil, kein gleitender Mittelwert)
  _updateDps(dt, dealt, weapons) {
    const tr = this._dps || (this._dps = { acc: 0 });
    tr.acc += dt;
    if (tr.acc < 0.25) return; // nur ~4x/s neu rendern
    tr.acc = 0;
    const elapsed = weapons ? weapons.elapsed : this.runElapsed;
    const since = (weapons && weapons.ownedSince) || {};
    const entries = [];
    for (const wid of Object.keys(dealt || {})) {
      const cur = dealt[wid];
      if (cur <= 0) continue;
      const dur = Math.max(1, elapsed - (since[wid] || 0));
      entries.push({ id: wid, total: cur, dps: cur / dur });
    }
    entries.sort((a, b) => b.total - a.total);
    this.hud.setDps(entries);
  }

  _warnSafeZones() {
    this.hud.bossBanner('IN DIE GRÜNEN ZONEN!');
    this.hud.toast('⚠ Grüne Fläche = sicher — sofort reinlaufen!', 'gold');
    this.audio.boss();
  }

  _phaseText() {
    if (this.endless) return 'ENDLOS';
    if (this.phaseStage === 'final') return 'ENDBOSS';
    const ph = `Phase ${Math.min(this.phaseIndex + 1, PHASES)}/${PHASES}`;
    if (this.phaseStage === 'mini') return `${ph} · ANFÜHRER`;
    return `${ph} · ${this._phaseKills}/${this._phaseTarget()}`;
  }

  _winLevel() {
    this.mode = 'won';
    this.levelWon = true;
    this.input.enabled = false;
    this.hud.setSpectate(null);
    this.hud.setBossBar(null);
    this._recordScore(true);
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
    this.weapons.hideGhosts();
    this.enemies.hideBolts();
    this.runElapsed = d.t || this.runElapsed;
    this._recordScore(true);
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
  // Cinematisches Intro beim Run-Start: Titel-Reveal + Kamera zieht sanft heran
  _playIntro() {
    const el = document.getElementById('intro');
    if (el) {
      const theme = (this.world.theme && this.world.theme.name) || 'Die Kolonie';
      const diff = (DIFFS[this.difficulty] && DIFFS[this.difficulty].name) || '';
      el.querySelector('.intro-title').textContent = theme;
      el.querySelector('.intro-sub').textContent = diff ? `${diff} · Überlebe im Bann der Barriere` : 'Überlebe im Bann der Barriere';
      el.classList.remove('hidden', 'play');
      void el.offsetWidth; // Reflow -> Animation sauber neu starten
      el.classList.add('play');
      clearTimeout(this._introTimer);
      this._introTimer = setTimeout(() => el.classList.add('hidden'), Math.round(INTRO_DUR * 1000 + 200));
    }
    // Kamera weit setzen; die Zoom-Fahrt zieht sie im Loop heran
    this._introT = INTRO_DUR;
    this.camCtrl.zoom = 2.2;
    this.camCtrl.snap((this._camTarget ? this._camTarget() : this.player.position));
  }

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
    this._dps = null;
    this._clientDealt = {};
    this._dpsSendAcc = 0;
    this._reviveProg = 0;
    this._clientRevive = 0;
    this.remoteInput.reviving = false;
    this._prevRemoteDead = false;
    this._lastStandActive = false;
    this._pings = [];
    // Solo: keine Effekt-Aufnahme nötig (Host schaltet sie danach ein)
    this.fx.record = false;
    this.fx.drain();
    this.hud.setDps([]);
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
    this._playIntro();
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
    // Koop-Host: alle transienten Effekte aufzeichnen -> per Snapshot an den Gast senden
    this.fx.record = true;
    // Koop ist fordernder als Solo (zwei Spieler zusammen sind stärker): mehr Gegner + zähere Werte
    this.enemies.coopScale = 1.35;
    this.enemies.diff *= 1.18;
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
    this._playIntro();
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
    this._reviveProg = 0;
    this._clientRevive = 0;
    this._prevRemoteDead = false;
    this._lastStandActive = false;
    this._pings = [];
    this._ghostProj = [];
    this._ghostBolts = [];
    // Client rendert nur -> keine eigene Effekt-Aufnahme, spielt die des Hosts ab
    this.fx.record = false;
    this.fx.drain();
    this.hud.setSpectate(null);
    this.camCtrl.snap(this.player.position);
    this.hud.show();
    this.hud.toast('Mit der Lobby verbunden!', 'gold');
    this.input.enabled = true;
    this.mode = 'play';
    this._playIntro();
  }

  _leaveOnline() {
    if (this.net) this.net.close();
    this.role = null;
    this.mode = 'menu';
    if (this.weapons) this.weapons.hideGhosts();
    if (this.enemies) this.enemies.hideBolts();
    if (this.remotePlayer) this.remotePlayer.group.visible = false;
    document.getElementById('start-screen').classList.remove('hidden');
    document.getElementById('lobby').classList.add('hidden');
    document.getElementById('levelup').classList.add('hidden');
  }

  _players() {
    return this.role ? [this.player, this.remotePlayer] : [this.player];
  }

  // -------------------------------------------------- Wiederbelebung (Nähe + Halten)
  // Host-autoritativ: genau ein Gefallener kann vom lebenden Mate wiederbelebt werden.
  _tickRevive(dt) {
    let downed = null, reviver = null, held = false;
    if (this.player.dead && !this.remotePlayer.dead) { downed = this.player; reviver = this.remotePlayer; held = !!this.remoteInput.reviving; }
    else if (this.remotePlayer.dead && !this.player.dead) { downed = this.remotePlayer; reviver = this.player; held = this.input.isDown('KeyE'); }
    if (!downed) { this._reviveProg = 0; return; }
    const near = Math.hypot(reviver.position.x - downed.position.x, reviver.position.z - downed.position.z) < REVIVE_RANGE;
    if (near && held) this._reviveProg = Math.min(1, (this._reviveProg || 0) + dt / REVIVE_TIME);
    else this._reviveProg = Math.max(0, (this._reviveProg || 0) - dt / REVIVE_TIME * 0.7); // Abbruch fällt langsam ab
    if (this._reviveProg >= 1) {
      downed.dead = false;
      downed.hp = Math.max(1, Math.round(downed.maxHp * 0.5));
      downed.iframe = 2.0; // kurzer Schutz nach dem Aufstehen
      downed.group.rotation.z = 0;
      this._reviveProg = 0;
      this.audio.levelup();
      this.hud.toast('Mitspieler wiederbelebt! 💚', 'gold');
    }
  }

  // Linkes Mitspieler-Panel: HP, Level, Waffen & Upgrades des Partners
  _updateAllyPanel() {
    const rp = this.remotePlayer;
    const prog = rp.dead ? (this.role === 'client' ? (this._clientRevive || 0) : (this._reviveProg || 0)) : 0;
    this.hud.setAlly({
      level: rp.level,
      hp: rp.hp, maxHp: rp.maxHp,
      dead: rp.dead,
      weapons: this.weapons2 ? this.weapons2.ownedList() : [],
      passives: rp.passiveCounts || {},
      reviveProg: prog,
    });
  }

  // Zentraler Hinweis: entweder „Halte E zum Wiederbeleben" (Retter) oder „Du wirst wiederbelebt…" (Gefallener)
  _updateRevivePrompt() {
    const me = this.player, ally = this.remotePlayer;
    const prog = this.role === 'client' ? (this._clientRevive || 0) : (this._reviveProg || 0);
    if (me.dead && ally && !ally.dead) { this.hud.setRevivePrompt({ prog, downed: true }); return; }
    const canRevive = ally && ally.dead && !me.dead &&
      Math.hypot(me.position.x - ally.position.x, me.position.z - ally.position.z) < REVIVE_RANGE;
    this.hud.setRevivePrompt(canRevive ? { prog, downed: false } : null);
  }

  // Koop-Buffs: Last-Stand (Mate am Boden -> stärker) + Nähe-Aura (nah beieinander -> Bonus)
  _updateBuffs() {
    const a = this.player, b = this.remotePlayer;
    const near = !a.dead && !b.dead && Math.hypot(a.position.x - b.position.x, a.position.z - b.position.z) < AURA_RANGE;
    for (const [self, other] of [[a, b], [b, a]]) {
      const lastStand = !self.dead && other.dead;
      self.dmgMult = (lastStand ? 1.3 : 1) * (near ? 1.12 : 1);
      self.speedMult = lastStand ? 1.25 : 1;
      self.aura = near;
      self.lastStand = lastStand;
    }
    const mine = this.player.lastStand;
    if (mine && !this._lastStandActive) this.hud.toast('🔥 Last Stand — verstärkt, bis dein Mate wieder steht!', 'gold');
    this._lastStandActive = mine;
  }

  // Richtungspfeil zum Mitspieler (nur wenn er off-screen oder gefallen ist)
  _updateMateArrow() {
    const mate = this.remotePlayer;
    const w = window.innerWidth, h = window.innerHeight;
    const v = this._projMate || (this._projMate = new THREE.Vector3());
    v.set(mate.position.x, mate.position.y + 1.2, mate.position.z).project(this.camera);
    let bx = v.x, by = v.y;
    const behind = v.z > 1;
    if (behind) { bx = -bx; by = -by; }
    const onScreen = !behind && Math.abs(bx) < 0.9 && Math.abs(by) < 0.9;
    if (onScreen && !mate.dead) { this.hud.setMateArrow(null); return; } // sichtbar & lebendig -> kein Pfeil nötig
    const m = Math.max(Math.abs(bx), Math.abs(by)) || 1;
    const ex = bx / m, ey = by / m;
    const margin = 0.82;
    const sx = (ex * margin * 0.5 + 0.5) * w;
    const sy = (-ey * margin * 0.5 + 0.5) * h;
    const angle = Math.atan2(-ey, ex); // Bildschirm-Radiant (0 = rechts, y nach unten)
    const dist = Math.round(Math.hypot(mate.position.x - this.player.position.x, mate.position.z - this.player.position.z));
    this.hud.setMateArrow({ x: sx, y: sy, angle, dist, dead: mate.dead });
  }

  // Meldung, wenn der Mitspieler gerade fällt
  _coopDeathWatch() {
    const rd = this.remotePlayer.dead;
    if (rd && !this._prevRemoteDead) {
      this.hud.bossBanner('MITSPIELER GEFALLEN');
      this.hud.toast('☠ Mitspieler gefallen — eile hin und belebe ihn (E)!', 'blood');
      this.audio.hurt();
    }
    this._prevRemoteDead = rd;
  }

  // Ping (Q) + Emotes (1–4)
  // Ping an die Maus-Position in der Landschaft (Linksklick oder Q) — Solo & Koop
  _pingInput() {
    if (this.input.clicked(0) || this.input.pressed('KeyQ')) {
      const p = this._mouseWorld();
      if (p) this._ping(p.x, p.z);
    }
  }
  // Emotes nur im Koop (an den Mitspieler)
  _coopInput() {
    if (this.mode !== 'play') return;
    for (let i = 1; i <= 4; i++) if (this.input.pressed('Digit' + i)) this._emote(i);
  }
  // Anzahl frischer Tastendrücke diesen Frame (fürs Losreißen aus dem Festwurzeln)
  _mashCount() {
    let n = 0;
    for (const c of ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space']) if (this.input.pressed(c)) n++;
    return n;
  }
  // Maus-Bildschirmposition -> Weltpunkt auf dem Boden (Strahl gegen Ebene y=0)
  _mouseWorld() {
    const w = window.innerWidth, h = window.innerHeight;
    const ndc = this._ndc || (this._ndc = new THREE.Vector2());
    ndc.set((this.input.mouse.x / w) * 2 - 1, -(this.input.mouse.y / h) * 2 + 1);
    const ray = this._ray || (this._ray = new THREE.Raycaster());
    ray.setFromCamera(ndc, this.camera);
    const plane = this._groundPlane || (this._groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0));
    const pt = this._rayPt || (this._rayPt = new THREE.Vector3());
    if (ray.ray.intersectPlane(plane, pt)) return { x: pt.x, z: pt.z };
    return null;
  }
  _ping(x, z) { this._addPing(x, z); if (this.role) this.net.send({ k: 'ping', x, z }); }
  _addPing(x, z) {
    (this._pings || (this._pings = [])).push({ x, z, t: 3.5 });
    this.hud.toast('📍 Team-Ping', 'gold');
    this.audio.pickup();
    if (this.fx) { const was = this.fx.record; this.fx.record = false; this.fx.ring(x, z, 5.5, 0x49e0ff); this.fx.record = was; }
  }
  _decayPings(dt) {
    if (!this._pings || !this._pings.length) return;
    for (const p of this._pings) p.t -= dt;
    this._pings = this._pings.filter((p) => p.t > 0);
  }
  _emote(i) { this._showEmote('self', i); this.net.send({ k: 'emote', i }); }
  _showEmote(who, i) {
    const txt = EMOTES[(i | 0) - 1] || '…';
    this.hud.toast((who === 'mate' ? '🗨 Mitspieler: ' : '🗨 Du: ') + txt, 'gold');
    this.audio.pickup();
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
    if (this.pendingLevelUps > 0 || this.pendingRemoteLevelUps > 0) {
      // abgelehnte Kombinationen je Level-Up-Sequenz zurücksetzen (später erneut anbieten)
      this._declinedCombos = new Set();
      this._declinedRemoteCombos = new Set();
    }
    if (this.pendingLevelUps > 0) this._startLocalLevelUp();
    else if (this.pendingRemoteLevelUps > 0) this._startRemoteLevelUp();
  }

  _startLocalLevelUp() {
    this._leveling = true;
    this.audio.levelup();
    this.mode = 'levelup';
    this.input.enabled = false;
    if (this.role === 'host') this.net.send({ k: 'pause', on: true });
    this._presentLocal();
  }

  _presentLocal() {
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
      'Dein Stufenaufstieg',
      this.player.rerolls,
      () => {
        if (this.player.rerolls > 0) {
          this.player.rerolls--;
          this._presentLocal();
        }
      }
    );
  }

  _startRemoteLevelUp() {
    this._leveling = true;
    this.mode = 'levelup';
    this.input.enabled = false;
    this._sendRemoteChoices();
    this.hud.toast('Mitspieler wählt ein Upgrade…', 'gold');
  }

  _sendRemoteChoices() {
    this._remoteCands = this.upgrades.generate(this.remotePlayer, this.weapons2);
    this.net.send({ k: 'lvlup', choices: this._remoteCands.map((c) => ({ icon: c.icon, title: c.title, sub: c.sub })), level: this.remotePlayer.level, rerolls: this.remotePlayer.rerolls });
  }

  _hostRerollRemote() {
    if (this.remotePlayer.rerolls > 0) {
      this.remotePlayer.rerolls--;
      this._sendRemoteChoices();
    }
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
    if (this._resolveCombos()) return; // erst Kombinationen anbieten
    this._finishLevelUp();
  }

  _finishLevelUp() {
    this._leveling = false;
    this.mode = 'play';
    this.input.enabled = true;
    if (this.role === 'host') this.net.send({ k: 'pause', on: false });
  }

  // Bietet anstehende Verschmelzungen an (eine nach der anderen). true = Popup gezeigt, Spiel bleibt pausiert.
  _resolveCombos() {
    const local = this.upgrades.availableCombos(this.player, this.weapons, this._declinedCombos);
    if (local.length) {
      const c = local[0];
      this.mode = 'levelup';
      this.input.enabled = false;
      this.upgrades.presentCombo(
        c,
        () => { this.weapons.combine(c); this.audio.levelup(); this.hud.toast(`${c.name} — verschmolzen! Waffenslot frei.`, 'gold'); this.upgrades.close(); this._endLevelUp(); },
        () => { this._declinedCombos.add(c.key); this.upgrades.close(); this._endLevelUp(); }
      );
      return true;
    }
    // Koop: Kombination des Gastes (Host erkennt sie über weapons2)
    if (this.role === 'host') {
      const rem = this.upgrades.availableCombos(this.remotePlayer, this.weapons2, this._declinedRemoteCombos);
      if (rem.length) {
        this._pendingRemoteCombo = rem[0];
        this.net.send({ k: 'combo', key: rem[0].key, base: rem[0].base, consume: rem[0].consume, name: rem[0].name, desc: rem[0].desc });
        this.hud.toast('Mitspieler entscheidet über eine Kombination…', 'gold');
        return true;
      }
    }
    return false;
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
      'Dein Stufenaufstieg',
      d.rerolls || 0,
      () => this.net.send({ k: 'reroll' })
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
    this._recordScore(false);
    this._clearSave(); // beendeter Run ist nicht mehr fortsetzbar
    const earned = Math.floor(this.player.gold);
    this.meta.addGold(earned);
    const m = Math.floor(this.runElapsed / 60);
    const s = Math.floor(this.runElapsed % 60);
    const killer = this.enemies.displayName(this.player.lastHitBy);
    let rows = `<div>Du — Stufe <b>${this.player.level}</b>, ${this.player.kills} Kills</div>`;
    if (this.role) rows += `<div>Mitspieler — Stufe <b>${this.remotePlayer.level}</b>, ${this.remotePlayer.kills} Kills</div>`;
    document.getElementById('death-stats').innerHTML = `
      <div>Überlebt: <b>${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}</b></div>
      <div class="death-killer">☠ Gefallen durch <b>${killer}</b></div>
      ${rows}
      <div class="death-gold">⛏ ${earned} Erz verdient &nbsp;·&nbsp; Gesamt: ${this.meta.gold}</div>
      <div class="dmg-breakdown">${this._dmgRowsHtml(this.weapons._dealt)}</div>`;
    document.getElementById('retry-button').classList.toggle('hidden', !!this.role); // Neuer Run nur Solo
    document.getElementById('death-shop-button').classList.toggle('hidden', !!this.role);
    document.getElementById('death-screen').classList.remove('hidden');
    if (this.role === 'host') {
      this.net.send({ k: 'over', t: this.runElapsed, host: { lv: this.player.level, ki: this.player.kills }, guest: { lv: this.remotePlayer.level, ki: this.remotePlayer.kills }, dmg: this.weapons2._dealt, gk: this.enemies.displayName(this.remotePlayer.lastHitBy) });
    }
  }

  _clientGameOver(d) {
    this.mode = 'dead';
    this.input.enabled = false;
    this.hud.setSpectate(null);
    this.weapons.hideGhosts();
    this.enemies.hideBolts();
    this.runElapsed = d.t || this.runElapsed;
    this._recordScore(false);
    const earned = Math.floor(this.player.gold);
    this.meta.addGold(earned);
    const m = Math.floor((d.t || 0) / 60);
    const s = Math.floor((d.t || 0) % 60);
    document.getElementById('death-stats').innerHTML = `
      <div>Überlebt: <b>${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}</b></div>
      <div class="death-killer">☠ Gefallen durch <b>${d.gk || 'einem Gegner'}</b></div>
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
    const enc = (p) => [Math.round(p.position.x * 20) / 20, Math.round(p.position.z * 20) / 20, Math.round(p.yaw * 100) / 100, Math.round(p.hp), p.maxHp, p.dead ? 1 : 0, Math.round((p.rooted || 0) * 10) / 10];
    const stat = (p) => [p.level, p.xp, p.xpToNext, p.kills, Math.floor(p.gold)];
    const ld = (w) => w.ownedList().map((x) => ({ id: x.id, l: x.level, e: x.evolved ? 1 : 0 }));
    this.net.send({
      k: 'snap',
      pl: [enc(this.player), enc(this.remotePlayer)],
      en: this.enemies.snapshot(),
      gm: this.gems.snapshot(),
      pk: this.pickups.snapshot(),
      fx: this.fx.drain(),
      pj: this.weapons.projSnapshot().concat(this.weapons2.projSnapshot()), // fliegende Projektile beider Spieler
      bo: this.enemies.boltSnapshot(), // Boss-Kugeln
      p1: stat(this.player),
      p2: stat(this.remotePlayer),
      ld1: ld(this.weapons),
      ld2: ld(this.weapons2),
      pa1: this.player.passiveCounts, // Host-Passive (fürs Mitspieler-Panel beim Gast)
      pa2: this.remotePlayer.passiveCounts,
      ph: this.phaseIndex,
      phk: this._phaseKills, // eigener Key — nicht mehr mit Pickups (pk) kollidieren
      rv: Math.round((this._reviveProg || 0) * 100) / 100, // Wiederbelebungs-Fortschritt
      bp: this.bossPhase ? 1 : 0,
      st: this.phaseStage,
      dg: this.enemies._aoes.some((a) => a.type === 'safe') ? 1 : 0,
      wr: Math.round(this.enemies.wrathFrac() * 100) / 100,
      t: Math.round(this.runElapsed),
    });
  }

  _applySnapshot(d) {
    const host = d.pl[0]; // P1
    const self = d.pl[1]; // P2 = ich
    this._authRemote = { x: host[0], z: host[1], yaw: host[2] };
    this.remotePlayer.hp = host[3]; this.remotePlayer.maxHp = host[4]; this.remotePlayer.dead = host[5] === 1;
    this.remotePlayer.rooted = host[6] || 0;
    this._authSelf = { x: self[0], z: self[1] };
    this.player.hp = self[3]; this.player.maxHp = self[4]; this.player.dead = self[5] === 1;
    this.player.rooted = self[6] || 0;
    this.runElapsed = d.t || 0;
    if (d.p2) { this.player.level = d.p2[0]; this.player.xp = d.p2[1]; this.player.xpToNext = d.p2[2]; this.player.kills = d.p2[3]; this.player.gold = d.p2[4]; }
    if (d.p1) { this.remotePlayer.level = d.p1[0]; this.remotePlayer.kills = d.p1[3]; }
    if (d.pa2) this.player.passiveCounts = d.pa2; // eigene Passive im HUD
    if (d.pa1) this.remotePlayer.passiveCounts = d.pa1; // Host-Passive fürs Mitspieler-Panel
    this._clientRevive = d.rv || 0; // Wiederbelebungs-Fortschritt (vom Host)
    if (d.ph != null) this.phaseIndex = d.ph;
    if (d.phk != null) this._phaseKills = d.phk;
    this.bossPhase = !!d.bp;
    if (d.st) this.phaseStage = d.st;
    this._clientDanger = !!d.dg;
    this._clientWrath = d.wr || 0;
    // eigene Waffen = ld2, Host-Waffen = ld1
    if (d.ld2) this.weapons.setLoadout(d.ld2.map((w) => ({ id: w.id, level: w.l, evolved: !!w.e })));
    if (d.ld1) this.weapons2.setLoadout(d.ld1.map((w) => ({ id: w.id, level: w.l, evolved: !!w.e })));
    this.enemies.setSnapshot(d.en || []);
    this.gems.applySnapshot(d.gm || [], 0);
    this.pickups.applySnapshot(d.pk || []);
    if (d.fx) this.fx.replay(d.fx);
    this._ghostProj = d.pj || []; // fliegende Projektile für die Ghost-Anzeige
    this._ghostBolts = d.bo || []; // Boss-Kugeln
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
    this.hud.drawMinimap(self, allies, enemies, pickups, this._pings);
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
    if (this._introT > 0) { this._introT = Math.max(0, this._introT - dt); this.camCtrl.zoom = 1 + 1.2 * (this._introT / INTRO_DUR); }
    this.world.update(dt, this.world.time + dt);
    const camp = this._camTarget ? this._camTarget() : this.player.position;
    if (this.player && this.playerLight) {
      this.playerLight.position.set(camp.x, camp.y + 5, camp.z);
      this.playerFill.position.set(camp.x + 6, camp.y + 14, camp.z + 6);
      this.playerFill.target.position.set(camp.x, camp.y, camp.z);
    }
    // Bei offenem Level-Up-/Pause-Menü Simulation einfrieren -> Boss-Telegraphen (Einschläge/Safe-Zonen)
    // bleiben sichtbar stehen, statt in der Menüzeit auszulaufen.
    const frozen = this.mode === 'levelup' || this.mode === 'paused' || (this.role === 'client' && this._clientPaused);
    if (this.fx) this.fx.update(frozen ? 0 : dt);

    if (this.mode === 'play' && this.role !== 'client') this._updatePlayHost(dt);
    else if (this.mode === 'play' && this.role === 'client') this._updatePlayClient(dt);
    else {
      if (this.player) {
        this.player.mixer.update(dt);
        if (this.role && this.remotePlayer) this.remotePlayer.mixer.update(dt);
        this.camCtrl.update(dt, null, this._camTarget());
      }
      this.hud.setDanger(false);
      this.hud.setWrath(0);
    }

    // Koop-Features: Buffs, Panel, Revive-Hinweis, Mate-Pfeil, Tod-Meldung, Ping/Emote-Eingabe
    // Ping funktioniert in Solo UND Koop
    if (this.mode === 'play') this._pingInput();
    this._decayPings(dt);
    this.hud.setRoot(this.mode === 'play' && this.player.rooted > 0 ? this.player.rooted : 0);

    if (this.role && this.remotePlayer) {
      this._updateBuffs();
      const buffs = [];
      if (this.player.lastStand) buffs.push({ icon: '🔥', name: 'Last Stand', desc: '+30% Schaden, +25% Tempo — bis dein Mate wieder steht' });
      if (this.player.aura) buffs.push({ icon: '✨', name: 'Nähe-Bonus', desc: '+12% Schaden & Extra-Regeneration in Mate-Nähe' });
      this.hud.setBuffs(buffs);
      this._updateAllyPanel();
      this._updateRevivePrompt();
      this._updateMateArrow();
      this._coopDeathWatch();
      this._coopInput();
    } else {
      this.hud.setAlly(null);
      this.hud.setRevivePrompt(null);
      this.hud.setMateArrow(null);
      this.hud.setBuffs(null);
    }

    // Verletzungs-Sound + Dash-Feedback
    if (this.mode === 'play' && this.player) {
      if (this._lastHp == null) this._lastHp = this.player.hp;
      if (!this.player.dead && this.player.hp < this._lastHp - 2) this.audio.hurt();
      this._lastHp = this.player.hp;
      const dashing = this.player.dashTime > 0;
      if (dashing && !this._wasDash) {
        this.fx.sparksBurst(this.player.position.x, 1.0, this.player.position.z, 0xcfe6ff, 8, 7);
        this.audio.pickup();
      }
      this._wasDash = dashing;
    }

    this.input.endFrame();
    this.composer.render();
  }

  _updatePlayHost(dt) {
    this.runElapsed += dt;
    const co = this.role === 'host';
    this.player.update(dt, this.input);
    if (this.player.rooted > 0) this.player.mashFree(0.2 *this._mashCount());
    if (co) this.remotePlayer.update(dt, this.remoteInput);
    if (co) this._tickRevive(dt);
    this.camCtrl.update(dt, this.input, this._camTarget());
    this._updateCamRight();

    const ps = this._players();
    this.enemies.update(dt, ps, null);
    // Gefallene Spieler greifen NICHT an (Waffen aus, Visuals versteckt)
    this.weapons.group.visible = !this.player.dead;
    if (!this.player.dead) this.weapons.update(dt, this.player, this.enemies, this._onKillP1);
    if (co) {
      this.weapons2.group.visible = !this.remotePlayer.dead;
      if (!this.remotePlayer.dead) this.weapons2.update(dt, this.remotePlayer, this.enemies, this._onKillP2);
    }
    this.gems.update(dt, ps, (v, who) => this._collectXp(v, who));
    this.pickups.update(dt, ps);

    // Spectate-Banner für den Host, wenn er tot ist
    if (co && this.player.dead && !this.remotePlayer.dead) this.hud.setSpectate('deinen Mitspieler');
    else this.hud.setSpectate(null);

    this.hud.update(this.player, this.weapons, this.runElapsed, this.enemies.aliveCount);
    this.hud.setPhase(this._phaseText());
    this.hud.setDodge(this.player.dodgeCharges, this.player.dodgeMax, this.player.dodgeTimer / this.player.dodgeRecharge);
    this.hud.setDanger(this.enemies._aoes.some((a) => a.type === 'safe'));
    this.hud.setWrath(this.enemies.wrathFrac());
    this._updateHeroSprites();
    this._updateDps(dt, this.weapons._dealt, this.weapons);
    if (this.role === 'host') {
      this._dpsSendAcc = (this._dpsSendAcc || 0) + dt;
      if (this._dpsSendAcc >= 0.5) { this._dpsSendAcc = 0; this.net.send({ k: 'dps', d: this.weapons2._dealt }); }
    }
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
    this._updateCamRight();
    this.enemies.clientRender(dt);
    this.weapons.group.visible = !this.player.dead;
    if (!this.player.dead) this.weapons.renderVisualsOnly(dt, this.player);
    this.weapons2.group.visible = !this.remotePlayer.dead;
    if (!this.remotePlayer.dead) this.weapons2.renderVisualsOnly(dt, this.remotePlayer);
    this.weapons.renderGhostProjectiles(this._ghostProj || [], dt); // fliegende Projektile beider Spieler
    this.enemies.renderBoltGhosts(this._ghostBolts || [], dt); // Boss-Kugeln
    this.pickups.animate(dt);

    this.hud.setSpectate(spectating ? 'deinen Mitspieler' : null);
    this.camCtrl.update(dt, this.input, this._camTarget());
    this.hud.update(this.player, this.weapons, this.runElapsed, this.enemies.ghostCount);
    this.hud.setPhase(this._phaseText());
    this.hud.setDodge(this.player.dodgeCharges, this.player.dodgeMax, this.player.dodgeTimer / this.player.dodgeRecharge);
    this.hud.setDanger(!!this._clientDanger);
    this.hud.setWrath(this._clientWrath || 0);
    this._updateHeroSprites();
    if (this._clientDanger && !this._prevClientDanger) this._warnSafeZones();
    this._prevClientDanger = this._clientDanger;
    this._updateDps(dt, this._clientDealt || {}, this.weapons);
    this._drawMinimap();
    this._drawCombatUI();

    if (!this._clientPaused && !this.player.dead && this.input.pressed('Space')) this._pendingDodge = true;
    // Festwurzeln: Tastenhämmern lokal (Vorhersage) + gesammelt an den Host senden
    if (this.player.rooted > 0) { const m = this._mashCount(); if (m) { this.player.mashFree(0.2 *m); this._mashAcc = (this._mashAcc || 0) + m; } }
    this._inAcc += dt;
    if (this._inAcc >= 1 / INPUT_HZ) {
      this._inAcc = 0;
      const ax = this._clientPaused || this.player.dead ? { x: 0, z: 0 } : this.input.axis();
      const rv = !this._clientPaused && !this.player.dead && this.input.isDown('KeyE') ? 1 : 0;
      this.net.send({ k: 'in', x: ax.x, z: ax.z, dodge: this._pendingDodge ? 1 : 0, rv, mash: this._mashAcc || 0 });
      this._pendingDodge = false;
      this._mashAcc = 0;
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
    this._syncPixelResolution();
    if (this.hud) this.hud.resize(w, h);
  }
}
