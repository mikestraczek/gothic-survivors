import * as THREE from 'three';

// Hoch angesetzte Top-Down-Verfolgerkamera (Vampire-Survivors-Stil).
export class SurvivorsCamera {
  constructor(camera) {
    this.camera = camera;
    // näher dran: tieferer, kürzerer Versatz
    this.offset = new THREE.Vector3(0, 13, 9);
    this.zoom = 1;
    this._desired = new THREE.Vector3();
    this._look = new THREE.Vector3();
  }

  snap(playerPos) {
    this._desired.copy(playerPos).add(this.offset.clone().multiplyScalar(this.zoom));
    this.camera.position.copy(this._desired);
    this.camera.lookAt(playerPos.x, playerPos.y + 1, playerPos.z);
  }

  update(dt, input, playerPos) {
    if (input && input.mouse.wheel !== 0) {
      // Mausrad: näher (0.6) bis weiter weg (1.8)
      this.zoom = Math.max(0.6, Math.min(1.8, this.zoom + input.mouse.wheel * 0.08));
    }
    this._desired.copy(playerPos).add(this.offset.clone().multiplyScalar(this.zoom));
    // weiches Nachziehen
    const k = 1 - Math.pow(0.0008, dt);
    this.camera.position.lerp(this._desired, k);
    this._look.set(playerPos.x, playerPos.y + 1, playerPos.z);
    this.camera.lookAt(this._look);
  }
}
