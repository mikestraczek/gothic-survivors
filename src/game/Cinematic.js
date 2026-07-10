// Cinematic-Director: legt über einen echten Solo-Run eine choreografierte Kamera,
// Letterbox, Titel-Einblendungen und Slow-Motion — fertiges Trailer-Material für YouTube.
// Aufnahme via Screen-Recorder (OBS). Start: 🎬-Button im Menü oder window.__game.startCinematic().
//
// Ablauf: startCinematic() bootstrappt einen normalen Run (echtes Gameplay: Waffen feuern,
// Horde schwärmt, Effekte), schaltet dann in den Director-Modus. Der Director übernimmt jeden
// Frame NACH der Simulation die Kamera (setzt Position/Blick/FOV direkt) und steuert Spawns,
// Zeitlupe und die Titelkarten entlang einer festen Shot-Liste. Am Ende zurück ins Menü —
// ohne die Bestenliste zu werten (runElapsed wird genullt, Save gelöscht).

// -------------------------------------------------- Mathe-Helfer
const lerp = (a, b, t) => a + (b - a) * t;
const smoother = (t) => t * t * t * (t * (t * 6 - 15) + 10); // sanftes Ein-/Ausblenden der Fahrt

// Zwei Kamera-Zustände (Offset zum Fokus, Blickversatz, FOV) über t mischen
function tween(A, B, t) {
  return {
    off: [lerp(A.off[0], B.off[0], t), lerp(A.off[1], B.off[1], t), lerp(A.off[2], B.off[2], t)],
    look: [lerp(A.look[0], B.look[0], t), lerp(A.look[1], B.look[1], t), lerp(A.look[2], B.look[2], t)],
    fov: lerp(A.fov, B.fov, t),
  };
}

// Ring aus Gegnern um den Spieler — hält die Horde dicht fürs Bild
function spawnRing(g, types, count, radius, jitter = 0) {
  const p = g.player.position;
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    const r = radius + (Math.sin(i * 12.9898) * 43758.5453 % 1) * jitter;
    const type = types[i % types.length];
    g.enemies.spawn(type, p.x + Math.cos(a) * r, p.z + Math.sin(a) * r);
  }
}

function grant(g, ids) {
  for (const id of ids) { try { g.weapons.add(id); } catch (e) { /* Waffe evtl. gesperrt */ } }
}

const SWARM = ['scavenger', 'bloodfly', 'wolf', 'skeleton', 'ghoul', 'zombling', 'demon'];

// -------------------------------------------------- Shot-Liste (~42 s)
function buildShots() {
  return [
    // 0 — Cold Open: hohe Luftaufnahme über die Welt, langsam herabsinkend
    {
      dur: 6,
      A: { off: [0, 44, 30], look: [0, 1, 0], fov: 42 },
      B: { off: [3, 30, 22], look: [0, 1, 0], fov: 46 },
      enter(g, d) {
        d.title('IM BANN DER BARRIERE', '', '', 4.2);
        grant(g, ['orbit', 'whirl']);
        spawnRing(g, SWARM, 10, 26, 6);
      },
    },
    // 1 — Held-Reveal: dichte Umkreisung des Helden
    {
      dur: 6,
      orbit: { a0: -0.75, a1: 0.55, r0: 11, r1: 9, h0: 6.5, h1: 5.2, look: [0, 1.5, 0], f0: 40, f1: 45 },
      enter(g, d) {
        d.title('GOTHIC', 'SURVIVORS', 'Im Bann der Barriere', 5);
        grant(g, ['fireball', 'lightning']);
        spawnRing(g, SWARM, 12, 15, 4);
      },
    },
    // 2 — Die Horde: aufziehen & enthüllen, wie es sich zuzieht
    {
      dur: 7,
      A: { off: [0, 15, 12], look: [0, 1, 0], fov: 48 },
      B: { off: [1, 27, 21], look: [0, 1, 0], fov: 55 },
      enter(g, d) {
        d.title('', 'DIE HORDE ERWACHT', '', 3.5);
        grant(g, ['frost', 'poison']);
        spawnRing(g, SWARM, 18, 11, 3);
        spawnRing(g, SWARM, 20, 20, 5);
        g._bloomBase = 0.62;
      },
    },
    // 3 — Combat-Crescendo: tiefe, treibende Kamera + Zeitlupen-Treffer
    {
      dur: 9,
      handheld: true,
      A: { off: [-13, 8, 4], look: [0, 1.2, 0], fov: 50 },
      B: { off: [12, 9, 7], look: [0, 1.2, 0], fov: 54 },
      enter(g, d) {
        grant(g, ['meteor', 'holy', 'daggers', 'spear']);
        if ('might' in g.player) g.player.might = Math.max(g.player.might || 1, 4);
        spawnRing(g, SWARM, 22, 12, 4);
      },
      beats: [
        { at: 0.06, do: (g, d) => d.title('', 'ÜBERLEBE.', '', 3) },
        { at: 0.52, do: (g, d) => { d.slowmo(0.32); d.punch(0.55); g.hitStop(0.05); } },
        { at: 0.74, do: (g, d) => d.slowmo(1) },
      ],
    },
    // 4 — Boss-Reveal: tiefer Winkel, Zeitlupe, der Boss erhebt sich
    {
      dur: 8,
      focusShift: [3, 0, -4],
      A: { off: [2, 5, 13], look: [0, 2.2, 0], fov: 46 },
      B: { off: [1, 6.5, 9], look: [0, 2.2, 0], fov: 50 },
      enter(g, d) {
        const p = g.player.position;
        const bx = p.x + 6, bz = p.z - 8;
        g.enemies.spawn('boss_demon', bx, bz);
        g.fx.explosion(bx, bz, 9, 0xff3a14);
        g.fx.ring(bx, bz, 7, 0xff5a2a);
        g.fx.sparksBurst(bx, 1.5, bz, 0xff6a3a, 30, 9);
        d.punch(0.85);
        g.hitStop(0.12);
        d.slowmo(0.5);
        if (g.audio && g.audio.boss) g.audio.boss();
        d.title('', '9 MODI · CO-OP · ENDLOS', 'Ein Held gegen die Barriere', 4.5);
      },
      beats: [
        { at: 0.5, do: (g, d) => d.slowmo(1) },
      ],
    },
    // 5 — Logo-Out: epische Weitweite, End-Titel & Call-to-Action
    {
      dur: 6,
      A: { off: [2, 17, 14], look: [0, 1.5, 0], fov: 40 },
      B: { off: [0, 40, 32], look: [0, 1.5, 0], fov: 36 },
      enter(g, d) {
        d.title('GOTHIC SURVIVORS', '', 'Jetzt spielen', 5.5);
        g._bloomBase = 0.7;
      },
    },
  ];
}

// -------------------------------------------------- Director
class CinematicDirector {
  constructor(g) {
    this.g = g;
    this.active = true;
    this.t = 0;
    this.shots = buildShots();
    this.total = this.shots.reduce((s, sh) => s + sh.dur, 0);
    this._idx = -1;
    this._shotStart = 0;
    this._beatsFired = new Set();
    this._spawnAcc = 0;
    // Zeitlupe (sanft geregelt)
    this._tsTarget = 1;
    // Screen-Shake (eigene Trauma, unabhängig von der Verfolgerkamera)
    this.shake = 0;
    this._shakeT = 0;
    this._handheldT = 0;
    // Titelkarte
    this._titleT = 0;
    this._titleShow = false;
    this.cine = document.getElementById('cine');
    this.cineText = this.cine && this.cine.querySelector('.cine-text');
    this.cineFade = this.cine && this.cine.querySelector('.cine-fade');
    this.elKicker = this.cine && this.cine.querySelector('.cine-kicker');
    this.elTitle = this.cine && this.cine.querySelector('.cine-title');
    this.elSub = this.cine && this.cine.querySelector('.cine-sub');
  }

  punch(a) { this.shake = Math.min(1, this.shake + a); }
  slowmo(target) { this._tsTarget = target; }

  title(kicker, title, sub, hold = 3.5) {
    if (this.elKicker) this.elKicker.textContent = kicker || '';
    if (this.elTitle) this.elTitle.textContent = title || '';
    if (this.elSub) this.elSub.textContent = sub || '';
    // Reflow -> Einblend-Animation sauber neu starten
    if (this.cineText) { this.cineText.classList.remove('show'); void this.cineText.offsetWidth; }
    this._titleShow = true;
    this._titleT = hold;
  }

  // pro Frame, mit ECHTER (ungestreckter) Zeit — die Fahrt läuft weiter, während die Welt in Zeitlupe geht
  update(rawDt) {
    const g = this.g;
    if (!this.active) return;
    try {
      // Simulation im Griff behalten: nie ins Level-Up/Pause kippen, Held unsterblich, kein Auto-Save
      this._maintain(g);

      this.t += rawDt;

      // aktuellen Shot bestimmen (nach kumulierten Dauern)
      let acc = 0, idx = this.shots.length - 1, start = this.total - this.shots[idx].dur;
      for (let i = 0; i < this.shots.length; i++) {
        if (this.t < acc + this.shots[i].dur) { idx = i; start = acc; break; }
        acc += this.shots[i].dur;
      }
      const shot = this.shots[idx];
      if (idx !== this._idx) {
        this._idx = idx;
        this._shotStart = start;
        this._beatsFired = new Set();
        if (shot.enter) shot.enter(g, this);
      }
      const u = Math.min(1, Math.max(0, (this.t - this._shotStart) / shot.dur));

      // Beats (einmalige Ereignisse innerhalb eines Shots)
      if (shot.beats) {
        for (let i = 0; i < shot.beats.length; i++) {
          if (u >= shot.beats[i].at && !this._beatsFired.has(i)) {
            this._beatsFired.add(i);
            shot.beats[i].do(g, this);
          }
        }
      }

      // Zeitlupe sanft nachregeln
      g.timeScale += (this._tsTarget - g.timeScale) * Math.min(1, rawDt * 8);

      // Kamera aus dem Shot berechnen
      const p = g.player.position;
      const fs = shot.focusShift || [0, 0, 0];
      const fx = p.x + fs[0], fy = p.y + fs[1], fz = p.z + fs[2];
      let s;
      if (shot.orbit) {
        const o = shot.orbit, e = smoother(u);
        const ang = lerp(o.a0, o.a1, e), r = lerp(o.r0, o.r1, e), h = lerp(o.h0, o.h1, e);
        s = { off: [Math.sin(ang) * r, h, Math.cos(ang) * r], look: o.look, fov: lerp(o.f0, o.f1, e) };
      } else {
        s = tween(shot.A, shot.B, smoother(u));
      }
      const cam = g.camera;
      cam.position.set(fx + s.off[0], fy + s.off[1], fz + s.off[2]);
      // sanftes Handheld-Wackeln in Action-Shots
      if (shot.handheld) {
        this._handheldT += rawDt;
        cam.position.x += Math.sin(this._handheldT * 1.7) * 0.25;
        cam.position.y += Math.cos(this._handheldT * 1.3) * 0.18;
      }
      cam.lookAt(fx + s.look[0], fy + s.look[1], fz + s.look[2]);
      if (Math.abs(cam.fov - s.fov) > 0.001) { cam.fov = s.fov; cam.updateProjectionMatrix(); }

      // Screen-Shake nach dem lookAt
      if (this.shake > 0) {
        this._shakeT += rawDt * 30;
        const sh = this.shake * this.shake;
        cam.position.x += (Math.sin(this._shakeT * 1.1) + Math.sin(this._shakeT * 2.3) * 0.5) * 0.4 * sh;
        cam.position.y += (Math.cos(this._shakeT * 1.7) + Math.sin(this._shakeT * 2.9) * 0.5) * 0.3 * sh;
        cam.rotation.z += 0.02 * sh * Math.sin(this._shakeT * 3.7);
        this.shake = Math.max(0, this.shake - rawDt * 1.6);
      }

      // dichte Horde am Leben halten (in den Kampf-Shots)
      if (idx >= 2 && idx <= 4) {
        this._spawnAcc += rawDt;
        if (this._spawnAcc > 0.7) {
          this._spawnAcc = 0;
          if (g.enemies.aliveCount < 95) spawnRing(g, SWARM, 6, 14, 4);
        }
      }

      // Titelkarte ein-/ausblenden
      if (this._titleT > 0) { this._titleT -= rawDt; if (this._titleT <= 0) this._titleShow = false; }
      if (this.cineText) this.cineText.classList.toggle('show', this._titleShow);

      // Ein-/Ausblende gegen Schwarz (Anfang & Ende)
      if (this.cineFade) {
        let fade = 0;
        if (this.t < 0.9) fade = 1 - this.t / 0.9;
        else if (this.t > this.total - 1.2) fade = Math.min(1, (this.t - (this.total - 1.2)) / 1.2);
        this.cineFade.style.opacity = fade.toFixed(3);
      }

      // Ende erreicht -> zurück ins Menü
      if (this.t >= this.total) stopCinematic(g);
    } catch (err) {
      console.error('Cinematic-Fehler:', err);
      stopCinematic(g);
    }
  }

  // Simulation für den Trailer bändigen
  _maintain(g) {
    // nie in Level-Up/Pause kippen (der Guard in _maybeLevelUp verhindert das schon,
    // hier die Absicherung falls doch ein Overlay auftaucht)
    if (g.mode !== 'play') { g.mode = 'play'; }
    g.pendingLevelUps = 0;
    g.pendingRemoteLevelUps = 0;
    // Auto-Save nie auslösen (Zähler jeden Frame zurücksetzen)
    g._autosaveAcc = 0;
    // Held unsterblich halten
    if (g.player) { g.player.hp = g.player.maxHp; g.player.dead = false; }
  }
}

// -------------------------------------------------- Lebenszyklus
export function startCinematic(g) {
  if (g._cineActive) return;
  if (!g.player) return; // erst nach dem Laden verfügbar
  // Einen echten Solo-Run starten (Standard-Auswahl) -> echtes Kampf-Gameplay
  g.startRun(g._selMap, g._selDiff, 'campaign');

  g._cineActive = true;
  g._runToken = null; // keine Heartbeats/Attestierung fürs Cinematic
  g.input.enabled = false; // Zuschauen: keine versehentliche Steuerung
  g._introT = 0; // Run-Intro-Zoom abschalten (Director führt die Kamera)

  // Held für ein volles Bild hochziehen (unsterblich + kräftig)
  g.player.maxHp = 100000; g.player.hp = 100000;
  if ('might' in g.player) g.player.might = Math.max(g.player.might || 1, 3);

  // Run-Intro-Overlay & HUD verstecken
  const intro = document.getElementById('intro');
  if (intro) intro.classList.add('hidden');
  clearTimeout(g._introTimer);
  g.hud.hide();

  // filmisches Grading merken & verstärken (beim Beenden zurückgesetzt)
  const gp = g.gradePass && g.gradePass.uniforms;
  if (gp) {
    g._cineGrade = { vignette: gp.vignette.value, contrast: gp.contrast.value, saturation: gp.saturation.value };
    gp.vignette.value = 0.5;
    gp.contrast.value = 1.18;
    gp.saturation.value = 1.3;
  }
  g._cineExposure = g.renderer.toneMappingExposure;
  g.renderer.toneMappingExposure = 1.5;
  g._cineBloomStrength = g.bloom ? g.bloom.strength : null; // Originalstärke fürs Zurücksetzen
  g._bloomBase = 0.55;

  // Letterbox einblenden
  const cine = document.getElementById('cine');
  if (cine) { cine.classList.remove('hidden'); void cine.offsetWidth; cine.classList.add('show'); }

  // Esc bricht ab
  g._cineEsc = (e) => { if (e.key === 'Escape') { e.stopPropagation(); stopCinematic(g); } };
  window.addEventListener('keydown', g._cineEsc, true);

  g._cine = new CinematicDirector(g);
  g.timeScale = 1;
}

export function stopCinematic(g) {
  if (!g._cineActive) return;
  g._cineActive = false;
  g._cine = null;
  g.timeScale = 1;

  // Grading/Belichtung/Bloom zurücksetzen
  const gp = g.gradePass && g.gradePass.uniforms;
  if (gp && g._cineGrade) {
    gp.vignette.value = g._cineGrade.vignette;
    gp.contrast.value = g._cineGrade.contrast;
    gp.saturation.value = g._cineGrade.saturation;
  }
  if (g._cineExposure != null) g.renderer.toneMappingExposure = g._cineExposure;
  if (g.bloom && g._cineBloomStrength != null) g.bloom.strength = g._cineBloomStrength;
  g._bloomBase = null; // nächster echter Run leitet die Bloom-Basis neu aus der Originalstärke ab

  // Letterbox/Overlay verstecken
  const cine = document.getElementById('cine');
  if (cine) {
    cine.classList.remove('show');
    cine.classList.add('hidden');
    const fade = cine.querySelector('.cine-fade'); if (fade) fade.style.opacity = '0';
    const text = cine.querySelector('.cine-text'); if (text) text.classList.remove('show');
  }

  if (g._cineEsc) { window.removeEventListener('keydown', g._cineEsc, true); g._cineEsc = null; }

  // Steuerung zurück, Kamera-Zoom normal
  g.input.enabled = true;
  g.camCtrl.zoom = 1;
  g.pendingLevelUps = 0;
  g.pendingRemoteLevelUps = 0;

  // WICHTIG: Cinematic-Run NICHT in die Bestenliste werten und keinen Save hinterlassen
  g.runElapsed = 0;
  g.levelWon = false;
  g._clearSave();
  g._quitToMenu();
}
