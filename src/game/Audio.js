// Prozedurale, bewusst leise Soundeffekte über die Web Audio API
// (keine Audiodateien nötig). Master-Lautstärke niedrig; per M stummschaltbar.
export class GameAudio {
  constructor(volume = 0.22) {
    this.ctx = null;
    this.master = null;
    this.volume = volume;
    this.muted = false;
    this._last = {};
  }

  _ensure() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : this.volume;
    this.master.connect(this.ctx.destination);
  }

  // bei erster Nutzerinteraktion aufrufen (AudioContext braucht eine Geste)
  resume() {
    this._ensure();
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : this.volume;
    return this.muted;
  }

  _throttle(name, ms) {
    const t = performance.now();
    if (this._last[name] && t - this._last[name] < ms) return false;
    this._last[name] = t;
    return true;
  }

  _tone({ freq = 440, freq2 = null, type = 'sine', dur = 0.15, gain = 0.3, delay = 0 }) {
    if (!this.ctx || this.muted) return;
    const t0 = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (freq2) o.frequency.exponentialRampToValueAtTime(Math.max(1, freq2), t0 + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g);
    g.connect(this.master);
    o.start(t0);
    o.stop(t0 + dur + 0.03);
  }

  _noise({ dur = 0.12, gain = 0.2, freq = 900 }) {
    if (!this.ctx || this.muted) return;
    const t0 = this.ctx.currentTime;
    const n = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.value = gain;
    src.connect(f);
    f.connect(g);
    g.connect(this.master);
    src.start(t0);
  }

  // ---- Effekte ----
  kill() {
    if (!this._throttle('kill', 45)) return;
    this._noise({ dur: 0.09, gain: 0.16, freq: 1100 + Math.random() * 300 });
  }
  gem() {
    if (!this._throttle('gem', 40)) return;
    this._tone({ freq: 820 + Math.random() * 120, freq2: 1300, type: 'triangle', dur: 0.07, gain: 0.1 });
  }
  hurt() {
    if (!this._throttle('hurt', 160)) return;
    this._tone({ freq: 210, freq2: 80, type: 'sawtooth', dur: 0.18, gain: 0.22 });
    this._noise({ dur: 0.1, gain: 0.1, freq: 500 });
  }
  levelup() {
    this._tone({ freq: 523, dur: 0.12, gain: 0.18, type: 'triangle' });
    this._tone({ freq: 784, dur: 0.13, gain: 0.18, type: 'triangle', delay: 0.1 });
    this._tone({ freq: 1046, dur: 0.18, gain: 0.18, type: 'triangle', delay: 0.2 });
  }
  boss() {
    this._tone({ freq: 90, freq2: 55, type: 'sawtooth', dur: 0.85, gain: 0.3 });
    this._tone({ freq: 140, freq2: 90, type: 'square', dur: 0.6, gain: 0.12, delay: 0.05 });
  }
  pickup() {
    this._tone({ freq: 660, freq2: 990, type: 'sine', dur: 0.18, gain: 0.2 });
  }
  ui() {
    this._tone({ freq: 320, dur: 0.05, gain: 0.12, type: 'square' });
  }
}
