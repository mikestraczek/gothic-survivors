// Prozedurale Soundeffekte + Musik über die Web Audio API (keine Audiodateien nötig).
// Zwei Busse: SFX und Musik, getrennt regelbar (Settings). Per M komplett stummschaltbar.
//
// Musik-Engine: Lookahead-Scheduler (Web-Audio-Standardmuster) mit Themes je Karte
// ('valley', 'swamp'), Boss-Modus ('boss') und Menü-Drone ('menu').

const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);

// Theme-Daten: Akkorde als MIDI-Noten, Tempo (Sekunden pro Beat), Klangfarbe
const THEMES = {
  menu: {
    beat: 1.5, chords: [[45, 52, 57], [43, 50, 55]], barsPerChord: 2,
    padType: 'triangle', padGain: 0.16, bass: true, melody: 0.06, melodyNotes: [69, 72, 76, 79], perc: false, cutoff: 700,
  },
  valley: {
    beat: 1.1, chords: [[45, 52, 57, 60], [41, 48, 53, 57], [43, 50, 55, 59], [45, 52, 57, 60]], barsPerChord: 4,
    padType: 'triangle', padGain: 0.15, bass: true, melody: 0.14, melodyNotes: [69, 72, 74, 76, 79, 81], perc: false, cutoff: 950,
  },
  swamp: {
    beat: 1.35, chords: [[38, 44, 50, 56], [36, 43, 48, 54], [38, 45, 50, 53], [34, 41, 47, 50]], barsPerChord: 4,
    padType: 'sawtooth', padGain: 0.09, bass: true, melody: 0.1, melodyNotes: [62, 65, 68, 71, 74], perc: false, cutoff: 620,
  },
  boss: {
    beat: 0.46, chords: [[41, 48, 53], [40, 47, 52], [41, 48, 53], [44, 50, 56]], barsPerChord: 4,
    padType: 'sawtooth', padGain: 0.1, bass: true, melody: 0.16, melodyNotes: [65, 68, 70, 72, 75], perc: true, cutoff: 1300,
  },
};

export class GameAudio {
  constructor(volume = 0.22) {
    this.ctx = null;
    this.master = null;
    this.sfxBus = null;
    this.musicBus = null;
    this.volume = volume;
    this.sfxVolume = 1.0; // relativ zum Master (Settings)
    this.musicVolume = 0.5;
    this.muted = false;
    this._last = {};
    // Musik-Zustand
    this._mode = null;
    this._timer = null;
    this._nextT = 0;
    this._step = 0;
  }

  _ensure() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : this.volume;
    this.master.connect(this.ctx.destination);
    this.sfxBus = this.ctx.createGain();
    this.sfxBus.gain.value = this.sfxVolume;
    this.sfxBus.connect(this.master);
    this.musicBus = this.ctx.createGain();
    this.musicBus.gain.value = this.musicVolume;
    this.musicBus.connect(this.master);
    // atmosphärisches Echo auf dem Musik-Bus
    this._delay = this.ctx.createDelay(1.5);
    this._delay.delayTime.value = 0.42;
    this._fb = this.ctx.createGain();
    this._fb.gain.value = 0.32;
    this._delay.connect(this._fb);
    this._fb.connect(this._delay);
    this._delayIn = this.ctx.createGain();
    this._delayIn.gain.value = 0.5;
    this._delayIn.connect(this._delay);
    this._delay.connect(this.musicBus);
  }

  // bei erster Nutzerinteraktion aufrufen (AudioContext braucht eine Geste)
  resume() {
    this._ensure();
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    // Musik ggf. nachstarten, falls setMusic vor der ersten Geste kam
    if (this._mode && !this._timer) this._startScheduler();
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : this.volume;
    return this.muted;
  }

  setSfxVolume(v) {
    this.sfxVolume = Math.max(0, Math.min(1, v));
    if (this.sfxBus) this.sfxBus.gain.value = this.sfxVolume;
  }
  setMusicVolume(v) {
    this.musicVolume = Math.max(0, Math.min(1, v));
    if (this.musicBus) this.musicBus.gain.value = this.musicVolume;
  }

  // -------------------------------------------------- Musik
  // mode: 'menu' | 'valley' | 'swamp' | 'boss' | null (aus)
  setMusic(mode) {
    if (this._mode === mode) return;
    this._mode = mode;
    this._step = 0;
    if (!mode) {
      this._stopScheduler();
      return;
    }
    this._ensure();
    if (!this.ctx) return;
    if (!this._timer) this._startScheduler();
    else this._nextT = Math.max(this._nextT, this.ctx.currentTime + 0.05);
  }

  _startScheduler() {
    if (!this.ctx) return;
    this._nextT = this.ctx.currentTime + 0.1;
    this._timer = setInterval(() => this._schedule(), 120);
  }
  _stopScheduler() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
  }

  _schedule() {
    if (!this.ctx || !this._mode || this.ctx.state !== 'running') return;
    const th = THEMES[this._mode];
    if (!th) return;
    while (this._nextT < this.ctx.currentTime + 0.5) {
      this._playStep(th, this._nextT, this._step);
      this._nextT += th.beat;
      this._step++;
    }
  }

  // Ein Beat des aktuellen Themes: Pad-Akkord (am Taktanfang), Bass, sparsame Melodie, Boss-Percussion
  _playStep(th, t, step) {
    const bar = Math.floor(step / 4);
    const beatInBar = step % 4;
    const chord = th.chords[Math.floor(bar / th.barsPerChord) % th.chords.length];

    if (beatInBar === 0) {
      // Pad: Akkord mit langsamem Attack/Release, zwei leicht verstimmte Oszillatoren je Note
      const dur = th.beat * 4 * th.barsPerChord * 0.28;
      for (const n of chord) {
        for (const det of [-4, 4]) {
          const o = this.ctx.createOscillator();
          o.type = th.padType;
          o.frequency.value = midi(n);
          o.detune.value = det;
          const f = this.ctx.createBiquadFilter();
          f.type = 'lowpass';
          f.frequency.value = th.cutoff;
          const g = this.ctx.createGain();
          g.gain.setValueAtTime(0.0001, t);
          g.gain.exponentialRampToValueAtTime(th.padGain / chord.length, t + dur * 0.35);
          g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
          o.connect(f);
          f.connect(g);
          g.connect(this.musicBus);
          o.start(t);
          o.stop(t + dur + 0.05);
        }
      }
    }

    // Bass: Grundton, im Boss-Modus treibende Achtel
    if (th.bass && (beatInBar === 0 || (th.perc && beatInBar === 2))) {
      const o = this.ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = midi(chord[0] - 12);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.22, t + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, t + th.beat * (th.perc ? 0.9 : 3.2));
      o.connect(g);
      g.connect(this.musicBus);
      o.start(t);
      o.stop(t + th.beat * 3.5);
    }

    // sparsame Melodie-Noten mit Echo
    if (Math.random() < th.melody) {
      const n = th.melodyNotes[(Math.random() * th.melodyNotes.length) | 0];
      const o = this.ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = midi(n);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.12, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + th.beat * 1.6);
      o.connect(g);
      g.connect(this.musicBus);
      g.connect(this._delayIn);
      o.start(t);
      o.stop(t + th.beat * 1.8);
    }

    // Boss: Kick auf jedem Beat, Noise-Hat dazwischen
    if (th.perc) {
      const k = this.ctx.createOscillator();
      k.type = 'sine';
      k.frequency.setValueAtTime(130, t);
      k.frequency.exponentialRampToValueAtTime(38, t + 0.12);
      const kg = this.ctx.createGain();
      kg.gain.setValueAtTime(0.5, t);
      kg.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
      k.connect(kg);
      kg.connect(this.musicBus);
      k.start(t);
      k.stop(t + 0.16);
      // Hat (kurzes Rauschen) auf der Off-Beat-Hälfte
      const ht = t + th.beat * 0.5;
      const n = Math.floor(this.ctx.sampleRate * 0.04);
      const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / n);
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      const hf = this.ctx.createBiquadFilter();
      hf.type = 'highpass';
      hf.frequency.value = 5000;
      const hg = this.ctx.createGain();
      hg.gain.value = 0.1;
      src.connect(hf);
      hf.connect(hg);
      hg.connect(this.musicBus);
      src.start(ht);
    }
  }

  // -------------------------------------------------- SFX-Bausteine
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
    g.connect(this.sfxBus);
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
    g.connect(this.sfxBus);
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
  chest() {
    this._tone({ freq: 392, freq2: 784, type: 'triangle', dur: 0.22, gain: 0.2 });
    this._tone({ freq: 988, dur: 0.14, gain: 0.14, type: 'sine', delay: 0.16 });
  }
}
