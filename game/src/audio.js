// Sol Bay: all-synthesized WebAudio — no audio files, no network.
export class AudioSystem {
  constructor(game) {
    this.game = game;
    this.ctx = null;
    this.master = null;
    this.engineOsc = null;
    this.engineFilter = null;
    this.engineGain = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.sirenTimer = null;
    this.sirenHigh = false;
    this.musicOn = false;
    this.musicTimer = null;
    this.musicStep = 0;
    this._noiseBuffer = null;
  }

  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
      // Music may have been requested before the first gesture created the
      // context; start its scheduler now that the context exists.
      if (this.musicOn) this.setMusic(true);
    } catch (e) {
      this.ctx = null;
    }
  }

  _muted() {
    return !!(this.game.state && this.game.state.muted);
  }

  _noise() {
    if (this._noiseBuffer) return this._noiseBuffer;
    const len = this.ctx.sampleRate * 0.5;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this._noiseBuffer = buf;
    return buf;
  }

  _tone(freq, dur, type, vol, when) {
    if (!this.ctx || this._muted()) return;
    const t0 = when !== undefined ? when : this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(vol, t0 + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  setEngine(speed01, on) {
    if (!this.ctx) return;
    if (!on || this._muted()) {
      if (this.engineGain) this.engineGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
      return;
    }
    if (!this.engineOsc) {
      this.engineOsc = this.ctx.createOscillator();
      this.engineOsc.type = 'sawtooth';
      this.engineFilter = this.ctx.createBiquadFilter();
      this.engineFilter.type = 'lowpass';
      this.engineFilter.frequency.value = 600;
      this.engineGain = this.ctx.createGain();
      this.engineGain.gain.value = 0;
      this.engineOsc.connect(this.engineFilter);
      this.engineFilter.connect(this.engineGain);
      this.engineGain.connect(this.master);
      this.engineOsc.start();
    }
    const s = Math.max(0, Math.min(1, speed01 || 0));
    const t = this.ctx.currentTime;
    this.engineOsc.frequency.setTargetAtTime(55 + s * 165, t, 0.08);
    this.engineFilter.frequency.setTargetAtTime(350 + s * 1400, t, 0.08);
    this.engineGain.gain.setTargetAtTime(0.045 + s * 0.05, t, 0.1);
  }

  siren(on) {
    if (!this.ctx) return;
    if (!on) {
      if (this.sirenTimer) { clearInterval(this.sirenTimer); this.sirenTimer = null; }
      if (this.sirenGain) this.sirenGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
      return;
    }
    if (this.sirenTimer) return;
    if (!this.sirenOsc) {
      this.sirenOsc = this.ctx.createOscillator();
      this.sirenOsc.type = 'square';
      this.sirenOsc.frequency.value = 700;
      this.sirenGain = this.ctx.createGain();
      this.sirenGain.gain.value = 0;
      this.sirenOsc.connect(this.sirenGain);
      this.sirenGain.connect(this.master);
      this.sirenOsc.start();
    }
    this.sirenGain.gain.setTargetAtTime(0.035, this.ctx.currentTime, 0.1);
    this.sirenTimer = setInterval(() => {
      if (!this.sirenOsc || this._muted()) return;
      this.sirenHigh = !this.sirenHigh;
      this.sirenOsc.frequency.setTargetAtTime(this.sirenHigh ? 950 : 700, this.ctx.currentTime, 0.05);
    }, 450);
  }

  gunshot() {
    if (!this.ctx || this._muted()) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this._noise();
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 900;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.35, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start(t);
    src.stop(t + 0.16);
    this._tone(90, 0.12, 'sine', 0.3, t);
  }

  crash() {
    if (!this.ctx || this._muted()) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this._noise();
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 500;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.4, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start(t);
    src.stop(t + 0.4);
  }

  chime() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this._tone(660, 0.18, 'sine', 0.18, t);
    this._tone(880, 0.28, 'sine', 0.18, t + 0.12);
  }

  jingle() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((f, i) => this._tone(f, 0.32, 'triangle', 0.2, t + i * 0.14));
  }

  setMusic(on) {
    this.musicOn = !!on;
    if (!this.ctx) return;
    if (!on) {
      if (this.musicTimer) { clearInterval(this.musicTimer); this.musicTimer = null; }
      return;
    }
    if (this.musicTimer) return;
    // Slow bassline + pad: one bar every 2.4 s, stepped by a timer.
    const bass = [55, 55, 65.41, 49];
    const pad = [220, 261.63, 329.63];
    this.musicStep = 0;
    this.musicTimer = setInterval(() => {
      if (!this.ctx || !this.musicOn || this._muted()) return;
      const t = this.ctx.currentTime;
      const root = bass[this.musicStep % bass.length];
      this._tone(root, 2.2, 'triangle', 0.07, t);
      this._tone(root * 2, 2.2, 'sine', 0.03, t);
      if (this.musicStep % 2 === 0) {
        pad.forEach((f) => this._tone(f, 2.0, 'sine', 0.02, t));
      }
      this.musicStep += 1;
    }, 600);
  }

  update(dt) {
    if (!this.ctx) return;
    if (this._muted()) {
      if (this.engineGain) this.engineGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
      if (this.sirenGain) this.sirenGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
    }
  }
}
