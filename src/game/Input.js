// Zentrale Eingabe-Verwaltung: Tastatur + Maus (Pointer Lock für Kamera).
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.justPressed = new Set();
    this.mouse = { dx: 0, dy: 0, wheel: 0 };
    this.buttons = new Set(); // 0 = links, 2 = rechts
    this.justClicked = new Set();
    this.locked = false;
    this.enabled = true; // wird bei offenen Menüs für Bewegung deaktiviert

    this._onKeyDown = (e) => {
      if (e.repeat) return;
      const k = e.code;
      if (!this.keys.has(k)) this.justPressed.add(k);
      this.keys.add(k);
      // Standard-Browser-Aktionen für Spieltasten unterdrücken
      if (['Space', 'Tab'].includes(k)) e.preventDefault();
    };
    this._onKeyUp = (e) => this.keys.delete(e.code);

    this._onMouseMove = (e) => {
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

  // Bewegungs-Achsen (nur wenn enabled)
  axis() {
    if (!this.enabled) return { x: 0, z: 0 };
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
