// Sol Bay: all-synthesized WebAudio — no audio files, no network.
//
// Sol Bay's own radio stations — names, moods and tracks are the city's,
// not anyone else's. Each station is a WebAudio recipe: a bassline, a pad
// and a pluck, all synthesised.
const STATIONS = [
  {
    name: 'BAY 98.5 · Dusk FM',
    stepMs: 700,
    bass: [55.00, 55.00, 65.41, 49.00],
    pad: [220.00, 261.63, 329.63],
    pluck: [440.00, 523.25, 659.25],
    tracks: ['Sunset Drive', 'Neon Tide', 'Last Light'],
  },
  {
    name: 'SOL 107 · Street Beats',
    stepMs: 380,
    bass: [55.00, 65.41, 49.00, 58.27],
    pad: [220.00, 277.18, 329.63],
    pluck: [440.00, 554.37, 659.25],
    tracks: ['Coast Road', 'Midnight Run', 'Bay Hustle'],
  },
  {
    name: 'PIER 88 · Tide FM',
    stepMs: 520,
    bass: [49.00, 43.65, 55.00, 49.00],
    pad: [196.00, 246.94, 293.66],
    pluck: [392.00, 493.88, 587.33],
    tracks: ['Salt Air', 'Low Tide', 'Harbour Lights'],
  },
];

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
    this.station = 0; // index into STATIONS
    this.trackIndex = 0;
    this._userMuted = false; // the player pressed M to turn the radio off
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

  /** The current station recipe. */
  currentStation() {
    return STATIONS[this.station % STATIONS.length];
  }

  currentTrack() {
    const st = this.currentStation();
    return st.tracks[this.trackIndex % st.tracks.length];
  }

  _updateRadioHud() {
    if (!this.game.hud) return;
    if (this.musicOn) {
      this.game.hud.setRadio(this.currentStation().name, this.currentTrack());
    } else {
      this.game.hud.setRadio('', '');
    }
  }

  /** Turn the radio on or off. `byUser` records a manual M-key mute. */
  setMusic(on, byUser) {
    this.musicOn = !!on;
    if (byUser) this._userMuted = !on;
    if (!this.ctx) { this._updateRadioHud(); return; }
    if (!on) {
      if (this.musicTimer) { clearInterval(this.musicTimer); this.musicTimer = null; }
      this._updateRadioHud();
      return;
    }
    if (this.musicTimer) { this._updateRadioHud(); return; }
    // The current station's recipe: bassline + pad + pluck, stepped by a timer.
    const st = this.currentStation();
    this.musicStep = 0;
    this.musicTimer = setInterval(() => {
      if (!this.ctx || !this.musicOn || this._muted()) return;
      const t = this.ctx.currentTime;
      const i = this.musicStep;
      const root = st.bass[i % st.bass.length];
      const stepSec = st.stepMs / 1000;
      this._tone(root, stepSec * 1.2, 'triangle', 0.07, t);
      this._tone(root * 2, stepSec * 1.2, 'sine', 0.03, t);
      if (i % 8 === 0) {
        st.pad.forEach((f) => this._tone(f, stepSec * 4, 'sine', 0.02, t));
      }
      if (i % 2 === 0) {
        this._tone(st.pluck[(i / 2) % st.pluck.length], stepSec * 0.8, 'sine', 0.05, t);
      }
      // A new track every 32 steps.
      if (i > 0 && i % 32 === 0) {
        this.trackIndex = (this.trackIndex + 1) % st.tracks.length;
        this._updateRadioHud();
      }
      this.musicStep += 1;
    }, st.stepMs);
    this._updateRadioHud();
  }

  /** M key: toggle the radio on/off. */
  toggleMusic() {
    this.setMusic(!this.musicOn, true);
  }

  /** R key: switch to the next Sol Bay station (turns the radio on). */
  nextStation() {
    this.station = (this.station + 1) % STATIONS.length;
    this.trackIndex = 0;
    this._userMuted = false;
    if (this.musicTimer) { clearInterval(this.musicTimer); this.musicTimer = null; }
    this.setMusic(true);
    if (this.game.hud) {
      this.game.hud.toast('Radio: ' + this.currentStation().name + ' — ' + this.currentTrack());
    }
  }

  update(dt) {
    if (!this.ctx) return;
    if (this._muted()) {
      if (this.engineGain) this.engineGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
      if (this.sirenGain) this.sirenGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
    }
    // The radio comes on by itself once the player is driving — unless the
    // player turned it off with M.
    if (!this.musicOn && !this._userMuted && this.game.player && this.game.player.inVehicle) {
      this.setMusic(true);
    }
  }
}
