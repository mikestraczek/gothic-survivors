// Zentrale Eingabe-Verwaltung: Tastatur + Maus (Pointer Lock für Kamera) + Touch.
// Touch: linke Bildschirmhälfte = virtueller Joystick, rechte Hälfte/Button = Ausweichen (Space).
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.justPressed = new Set();
    this.mouse = { dx: 0, dy: 0, wheel: 0, x: window.innerWidth / 2, y: window.innerHeight / 2 };
    this.buttons = new Set(); // 0 = links, 2 = rechts
    this.justClicked = new Set();
    this.locked = false;
    this.enabled = true; // wird bei offenen Menüs für Bewegung deaktiviert
    this.isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    this._joy = { id: null, sx: 0, sy: 0, x: 0, z: 0, active: false };
    if (this.isTouch) this._bindTouch();

    this._onKeyDown = (e) => {
      if (e.repeat) return;
      const k = e.code;
      if (!this.keys.has(k)) this.justPressed.add(k);
      this.keys.add(k);
      // Standard-Browser-Aktionen für Spieltasten unterdrücken — aber NICHT in
      // Textfeldern (sonst kann man weder tabben noch Leerzeichen tippen)
      const inField = e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA');
      if (!inField && ['Space', 'Tab'].includes(k)) e.preventDefault();
    };
    this._onKeyUp = (e) => this.keys.delete(e.code);

    this._onMouseMove = (e) => {
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
      if (this.locked) {
        this.mouse.dx += e.movementX;
        this.mouse.dy += e.movementY;
      }
    };
    this._onMouseDown = (e) => {
      this.buttons.add(e.button);
      this.justClicked.add(e.button);
    };
    this._onMouseUp = (e) => this.buttons.delete(e.button);
    this._onWheel = (e) => {
      this.mouse.wheel += Math.sign(e.deltaY);
    };
    this._onContext = (e) => e.preventDefault();

    this._onLockChange = () => {
      this.locked = document.pointerLockElement === this.canvas;
    };

    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('mousemove', this._onMouseMove);
    window.addEventListener('mousedown', this._onMouseDown);
    window.addEventListener('mouseup', this._onMouseUp);
    window.addEventListener('wheel', this._onWheel, { passive: true });
    window.addEventListener('contextmenu', this._onContext);
    document.addEventListener('pointerlockchange', this._onLockChange);
  }

  // ---- Touch-Steuerung ----
  // Handler hängen am Canvas: Menü-Overlays liegen darüber und fangen ihre Taps selbst.
  _bindTouch() {
    const R = 56; // Joystick-Radius in px
    const base = () => document.getElementById('joy-base');
    const knob = () => document.getElementById('joy-knob');
    const placeBase = (x, y) => {
      const b = base();
      if (!b) return;
      b.style.left = `${x}px`;
      b.style.top = `${y}px`;
      b.classList.add('on');
    };
    const moveKnob = (dx, dy) => {
      const k = knob();
      if (k) k.style.transform = `translate(${dx}px, ${dy}px)`;
    };
    const releaseJoy = () => {
      this._joy.id = null;
      this._joy.x = 0;
      this._joy.z = 0;
      this._joy.active = false;
      const b = base();
      if (b) b.classList.remove('on');
      moveKnob(0, 0);
    };

    this.canvas.addEventListener('touchstart', (e) => {
      for (const t of e.changedTouches) {
        if (t.clientX < window.innerWidth * 0.5 && this._joy.id == null) {
          this._joy.id = t.identifier;
          this._joy.sx = t.clientX;
          this._joy.sy = t.clientY;
          this._joy.active = true;
          placeBase(t.clientX, t.clientY);
        } else {
          // rechte Hälfte: Ausweichen bzw. Losreißen aus dem Festwurzeln
          this.justPressed.add('Space');
        }
      }
      e.preventDefault(); // verhindert Scrollen + synthetische Maus-Events
    }, { passive: false });

    this.canvas.addEventListener('touchmove', (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier !== this._joy.id) continue;
        let dx = t.clientX - this._joy.sx;
        let dy = t.clientY - this._joy.sy;
        const l = Math.hypot(dx, dy);
        if (l > R) { dx *= R / l; dy *= R / l; }
        moveKnob(dx, dy);
        // Deadzone, dann normalisieren (Bildschirm-Y = Welt-Z)
        this._joy.x = Math.abs(dx) > 6 ? dx / R : 0;
        this._joy.z = Math.abs(dy) > 6 ? dy / R : 0;
      }
      e.preventDefault();
    }, { passive: false });

    const end = (e) => {
      for (const t of e.changedTouches) if (t.identifier === this._joy.id) releaseJoy();
      e.preventDefault();
    };
    this.canvas.addEventListener('touchend', end, { passive: false });
    this.canvas.addEventListener('touchcancel', end, { passive: false });

    // dedizierter Ausweich-Button (bottom-right, immer sichtbar auf Touch)
    const dodgeBtn = document.getElementById('touch-dodge');
    if (dodgeBtn) {
      dodgeBtn.addEventListener('touchstart', (e) => {
        this.justPressed.add('Space');
        e.preventDefault();
      }, { passive: false });
    }
  }

  requestPointerLock() {
    if (!this.locked && this.canvas.requestPointerLock) {
      this.canvas.requestPointerLock();
    }
  }
  exitPointerLock() {
    if (this.locked && document.exitPointerLock) document.exitPointerLock();
  }

  isDown(code) {
    return this.keys.has(code);
  }
  pressed(code) {
    return this.justPressed.has(code);
  }
  mouseDown(btn) {
    return this.buttons.has(btn);
  }
  clicked(btn) {
    return this.justClicked.has(btn);
  }

  // Bewegungs-Achsen (nur wenn enabled) — Tastatur oder virtueller Joystick
  axis() {
    if (!this.enabled) return { x: 0, z: 0 };
    if (this._joy.active && (this._joy.x || this._joy.z)) return { x: this._joy.x, z: this._joy.z };
    let x = 0;
    let z = 0;
    if (this.isDown('KeyW')) z -= 1;
    if (this.isDown('KeyS')) z += 1;
    if (this.isDown('KeyA')) x -= 1;
    if (this.isDown('KeyD')) x += 1;
    return { x, z };
  }

  // Am Ende jedes Frames aufrufen: Maus-Delta & "just"-Zustände zurücksetzen.
  endFrame() {
    this.mouse.dx = 0;
    this.mouse.dy = 0;
    this.mouse.wheel = 0;
    this.justPressed.clear();
    this.justClicked.clear();
  }
}
