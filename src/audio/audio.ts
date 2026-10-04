/**
 * Procedural audio: every sound effect is synthesized (no asset files). Music is a generative, layered
 * score whose stems crossfade with the game's mood (explore / factory / danger / combat / boss / dungeon).
 */
type Mood = 'explore' | 'factory' | 'danger' | 'combat' | 'boss' | 'dungeon';

export class Audio {
  ctx: AudioContext | null = null;
  master!: GainNode;
  sfxBus!: GainNode;
  musicBus!: GainNode;
  ambBus!: GainNode;
  private noiseBuf!: AudioBuffer;
  private reverb!: ConvolverNode;
  private layers: Record<string, GainNode> = {};
  private mood: Mood = 'explore';
  private nextBeat = 0;
  private beat = 0;
  private machineHum: GainNode | null = null;
  private windGain: GainNode | null = null;
  private lastPlay = new Map<string, number>();
  volumes = { master: 0.8, music: 0.5, sfx: 0.8 };
  listener = { x: 0, y: 0 };

  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4;
    this.master.connect(comp).connect(ctx.destination);
    this.sfxBus = ctx.createGain(); this.sfxBus.connect(this.master);
    this.musicBus = ctx.createGain(); this.musicBus.connect(this.master);
    this.ambBus = ctx.createGain(); this.ambBus.connect(this.master);
    // noise buffer
    this.noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    // synthetic reverb impulse
    this.reverb = ctx.createConvolver();
    const ir = ctx.createBuffer(2, ctx.sampleRate * 2.5, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const ch = ir.getChannelData(c); for (let i = 0; i < ch.length; i++) ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / ch.length, 2.6); }
    this.reverb.buffer = ir;
    const revGain = ctx.createGain(); revGain.gain.value = 0.35;
    this.reverb.connect(revGain).connect(this.master);
    for (const name of ['drone', 'pad', 'bells', 'drums', 'pulse', 'brass']) {
      const g = ctx.createGain(); g.gain.value = 0; g.connect(this.musicBus);
      if (name === 'bells' || name === 'pad' || name === 'brass') g.connect(this.reverb);
      this.layers[name] = g;
    }
    this.startDrone();
    this.startAmbience();
    this.applyVolumes();
    this.setMood('explore');
  }

  resume() { this.ctx?.resume(); }

  applyVolumes() {
    if (!this.ctx) return;
    this.master.gain.value = this.volumes.master;
    this.musicBus.gain.value = this.volumes.music * 0.55;
    this.sfxBus.gain.value = this.volumes.sfx;
    this.ambBus.gain.value = this.volumes.sfx * 0.6;
  }

  setMood(m: Mood) {
    if (!this.ctx) { this.mood = m; return; }
    this.mood = m;
    const targets: Record<Mood, Record<string, number>> = {
      explore: { drone: 0.35, pad: 0.3, bells: 0.25, drums: 0, pulse: 0, brass: 0 },
      factory: { drone: 0.25, pad: 0.2, bells: 0.12, drums: 0, pulse: 0.3, brass: 0 },
      danger: { drone: 0.4, pad: 0.15, bells: 0, drums: 0.3, pulse: 0.35, brass: 0.1 },
      combat: { drone: 0.4, pad: 0.1, bells: 0, drums: 0.45, pulse: 0.3, brass: 0.15 },
      boss: { drone: 0.5, pad: 0.1, bells: 0, drums: 0.6, pulse: 0.4, brass: 0.4 },
      dungeon: { drone: 0.55, pad: 0.15, bells: 0.15, drums: 0, pulse: 0, brass: 0 },
    };
    const t = this.ctx.currentTime;
    for (const [k, v] of Object.entries(targets[m])) {
      const g = this.layers[k].gain;
      g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(v, t + 2.5);
    }
  }
  getMood() { return this.mood; }

  private drone!: { oscs: OscillatorNode[]; filter: BiquadFilterNode };
  private startDrone() {
    const ctx = this.ctx!;
    const filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 380; filter.Q.value = 2;
    filter.connect(this.layers.drone);
    const oscs = [55, 55.4, 82.4].map((f, i) => {
      const o = ctx.createOscillator(); o.type = i === 2 ? 'triangle' : 'sawtooth'; o.frequency.value = f;
      const g = ctx.createGain(); g.gain.value = i === 2 ? 0.25 : 0.18; o.connect(g).connect(filter); o.start(); return o;
    });
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.05;
    const lg = ctx.createGain(); lg.gain.value = 160; lfo.connect(lg).connect(filter.frequency); lfo.start();
    this.drone = { oscs, filter };
  }

  private startAmbience() {
    const ctx = this.ctx!;
    // machine hum bed
    const hum = ctx.createOscillator(); hum.type = 'sawtooth'; hum.frequency.value = 48;
    const hf = ctx.createBiquadFilter(); hf.type = 'lowpass'; hf.frequency.value = 220;
    const hg = ctx.createGain(); hg.gain.value = 0;
    hum.connect(hf).connect(hg).connect(this.ambBus); hum.start();
    this.machineHum = hg;
    // wind
    const n = ctx.createBufferSource(); n.buffer = this.noiseBuf; n.loop = true;
    const wf = ctx.createBiquadFilter(); wf.type = 'bandpass'; wf.frequency.value = 500; wf.Q.value = 0.6;
    const wg = ctx.createGain(); wg.gain.value = 0.04;
    n.connect(wf).connect(wg).connect(this.ambBus); n.start();
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.08; const lg = ctx.createGain(); lg.gain.value = 300; lfo.connect(lg).connect(wf.frequency); lfo.start();
    this.windGain = wg;
  }

  /** Called each frame with environment state for ambience. */
  ambience(machines: number, weather: string, dungeon: boolean) {
    if (!this.ctx || !this.machineHum || !this.windGain) return;
    const t = this.ctx.currentTime;
    this.machineHum.gain.setTargetAtTime(Math.min(0.12, machines * 0.006), t, 0.5);
    const wind = dungeon ? 0.015 : weather === 'storm' || weather === 'riftstorm' ? 0.12 : weather === 'rain' ? 0.08 : 0.035;
    this.windGain.gain.setTargetAtTime(wind, t, 1);
  }

  /** Music scheduler (call every frame). */
  tick() {
    const ctx = this.ctx;
    if (!ctx) return;
    const tempo = this.mood === 'boss' ? 0.32 : this.mood === 'combat' || this.mood === 'danger' ? 0.38 : 0.6;
    while (this.nextBeat < ctx.currentTime + 0.2) {
      if (this.nextBeat < ctx.currentTime) this.nextBeat = ctx.currentTime + 0.05;
      this.scheduleBeat(this.nextBeat, this.beat);
      this.nextBeat += tempo;
      this.beat++;
    }
  }

  private scale = [0, 3, 5, 7, 10, 12, 15]; // minor pentatonic-ish
  private scheduleBeat(t: number, b: number) {
    const ctx = this.ctx!;
    const root = this.mood === 'dungeon' ? 41.2 : 55;
    const bar = Math.floor(b / 8);
    const chordRoots = [0, -4, 3, -2];
    const cr = chordRoots[bar % 4];
    // pad: chord every bar
    if (b % 8 === 0) for (const iv of [0, 7, 12, 15]) this.note(this.layers.pad, root * 4 * Math.pow(2, (cr + iv) / 12), t, 4.5, 'triangle', 0.05, 1.5);
    // bells: sparse melody
    if (b % 2 === 0 && Math.random() < 0.45) {
      const n = this.scale[(Math.random() * this.scale.length) | 0];
      this.note(this.layers.bells, root * 8 * Math.pow(2, (cr + n) / 12), t, 2.2, 'sine', 0.06, 0.005);
    }
    // pulse: mechanical ostinato
    if (b % 1 === 0) this.note(this.layers.pulse, root * 2 * Math.pow(2, (cr + (b % 4 === 2 ? 7 : 0)) / 12), t, 0.18, 'square', 0.05, 0.005, 900);
    // drums
    if (b % 4 === 0 || (this.mood === 'boss' && b % 4 === 3)) this.kick(t);
    if (b % 4 === 2) this.snare(t);
    if (this.mood === 'boss' || this.mood === 'combat') this.hat(t + 0.15);
    // brass stabs
    if (b % 8 === 0 || (this.mood === 'boss' && b % 8 === 6)) for (const iv of [0, 7]) this.note(this.layers.brass, root * 2 * Math.pow(2, (cr + iv) / 12), t, 0.9, 'sawtooth', 0.08, 0.03, 700);
    // drone pitch follows chord
    for (const [i, o] of this.drone.oscs.entries()) o.frequency.setTargetAtTime((i === 2 ? root * 1.5 : root) * Math.pow(2, cr / 12) * (i === 1 ? 1.007 : 1), t, 1.5);
    void ctx;
  }

  private note(dest: AudioNode, freq: number, t: number, dur: number, type: OscillatorType, vol: number, attack: number, lp?: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq;
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node: AudioNode = o;
    if (lp) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp; o.connect(f); node = f; }
    node.connect(g).connect(dest);
    o.start(t); o.stop(t + dur + 0.05);
  }
  private kick(t: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator(); o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.25);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    o.connect(g).connect(this.layers.drums); o.start(t); o.stop(t + 0.4);
  }
  private snare(t: number) {
    const ctx = this.ctx!;
    const n = ctx.createBufferSource(); n.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1500;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.25, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    n.connect(f).connect(g).connect(this.layers.drums); n.start(t, Math.random()); n.stop(t + 0.25);
  }
  private hat(t: number) {
    const ctx = this.ctx!;
    const n = ctx.createBufferSource(); n.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7000;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.06, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    n.connect(f).connect(g).connect(this.layers.drums); n.start(t, Math.random()); n.stop(t + 0.08);
  }

  // ───────────────────────── SFX
  play(name: string, x?: number, y?: number, vol = 1) {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    // throttle identical sounds to avoid stacking (thousands of turret shots)
    const last = this.lastPlay.get(name) ?? 0;
    const minGap = THROTTLE[name] ?? 0.03;
    if (now - last < minGap) return;
    this.lastPlay.set(name, now);
    let pan = 0, att = 1;
    if (x !== undefined && y !== undefined) {
      const dx = x - this.listener.x, dy = y - this.listener.y;
      const d = Math.hypot(dx, dy);
      att = Math.max(0, 1 - d / 28);
      if (att <= 0.01) return;
      pan = Math.max(-1, Math.min(1, dx / 14));
    }
    const out = ctx.createGain(); out.gain.value = vol * att;
    const p = ctx.createStereoPanner(); p.pan.value = pan;
    out.connect(p).connect(this.sfxBus);
    const recipe = SFX[name];
    if (recipe) recipe(this, out, now);
  }

  // building blocks for recipes
  noise(dest: AudioNode, t: number, dur: number, vol: number, filter: BiquadFilterType, freq: number, freqEnd?: number, q = 1) {
    const ctx = this.ctx!;
    const n = ctx.createBufferSource(); n.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = filter; f.frequency.setValueAtTime(freq, t); if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t + dur); f.Q.value = q;
    const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    n.connect(f).connect(g).connect(dest); n.start(t, Math.random() * 1.5); n.stop(t + dur + 0.02);
  }
  tone(dest: AudioNode, t: number, dur: number, vol: number, type: OscillatorType, f0: number, f1?: number, attack = 0.005) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, t); if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(dest); o.start(t); o.stop(t + dur + 0.02);
  }
  toReverb(dest: GainNode) { dest.connect(this.reverb); }
}

const THROTTLE: Record<string, number> = { turret: 0.06, hit: 0.04, pickup: 0.05, coin: 0.05, metal_hit: 0.1, zap: 0.08, spit: 0.08, whiff: 0.1, mine: 0.1, chop: 0.1, enemy_hit: 0.06 };

type Recipe = (a: Audio, out: GainNode, t: number) => void;
const SFX: Record<string, Recipe> = {
  swing: (a, o, t) => a.noise(o, t, 0.16, 0.35, 'bandpass', 900, 2600, 1.5),
  hit: (a, o, t) => { a.noise(o, t, 0.12, 0.5, 'lowpass', 2200, 300); a.tone(o, t, 0.12, 0.35, 'sine', 160, 60); },
  heavy_hit: (a, o, t) => { a.noise(o, t, 0.3, 0.6, 'lowpass', 900, 100); a.tone(o, t, 0.3, 0.5, 'sine', 90, 35); },
  enemy_hit: (a, o, t) => a.noise(o, t, 0.1, 0.35, 'lowpass', 1400, 200),
  whiff: (a, o, t) => a.noise(o, t, 0.12, 0.2, 'bandpass', 600, 1400, 2),
  hurt: (a, o, t) => { a.noise(o, t, 0.18, 0.5, 'lowpass', 1200, 200); a.tone(o, t, 0.18, 0.3, 'triangle', 200, 90); },
  block: (a, o, t) => { a.tone(o, t, 0.25, 0.3, 'square', 1200, 900); a.noise(o, t, 0.08, 0.3, 'highpass', 3000); },
  dodge: (a, o, t) => a.noise(o, t, 0.22, 0.25, 'bandpass', 400, 1200, 0.8),
  skill: (a, o, t) => { a.noise(o, t, 0.25, 0.3, 'bandpass', 500, 2500); a.tone(o, t, 0.2, 0.2, 'sawtooth', 220, 440); },
  windup: (a, o, t) => a.tone(o, t, 0.3, 0.2, 'sawtooth', 80, 160),
  slam: (a, o, t) => { a.tone(o, t, 0.6, 0.8, 'sine', 70, 28); a.noise(o, t, 0.5, 0.6, 'lowpass', 600, 80); a.toReverb(o); },
  judgement: (a, o, t) => { a.tone(o, t, 1.2, 0.9, 'sine', 55, 20); a.noise(o, t, 1.0, 0.8, 'lowpass', 1200, 60); a.tone(o, t, 0.6, 0.3, 'sawtooth', 220, 55); a.toReverb(o); },
  bulwark: (a, o, t) => { a.tone(o, t, 0.6, 0.3, 'triangle', 220, 330, 0.05); a.tone(o, t, 0.6, 0.2, 'triangle', 330, 495, 0.05); },
  horn: (a, o, t) => { for (const f of [110, 165, 220]) a.tone(o, t, 1.4, 0.18, 'sawtooth', f, f * 1.02, 0.15); a.toReverb(o); },
  explosion: (a, o, t) => { a.noise(o, t, 0.9, 0.9, 'lowpass', 1600, 60); a.tone(o, t, 0.5, 0.6, 'sine', 90, 25); },
  crate: (a, o, t) => { a.noise(o, t, 0.2, 0.4, 'bandpass', 700, 300, 2); a.tone(o, t, 0.1, 0.2, 'square', 300, 120); },
  turret: (a, o, t) => { a.noise(o, t, 0.08, 0.35, 'bandpass', 2400, 800, 3); a.tone(o, t, 0.06, 0.15, 'square', 500, 200); },
  zap: (a, o, t) => { a.noise(o, t, 0.25, 0.4, 'highpass', 2500); a.tone(o, t, 0.2, 0.25, 'sawtooth', 1800, 300); },
  thunder: (a, o, t) => { a.noise(o, t, 2.2, 0.9, 'lowpass', 900, 40); a.toReverb(o); },
  spit: (a, o, t) => a.noise(o, t, 0.15, 0.3, 'bandpass', 1200, 400, 4),
  summon: (a, o, t) => { a.tone(o, t, 0.8, 0.25, 'sine', 300, 80, 0.2); a.noise(o, t, 0.6, 0.2, 'bandpass', 800, 200, 3); a.toReverb(o); },
  blink: (a, o, t) => a.tone(o, t, 0.2, 0.25, 'sine', 1800, 400),
  roar: (a, o, t) => { a.tone(o, t, 1.6, 0.6, 'sawtooth', 70, 45, 0.2); a.noise(o, t, 1.4, 0.5, 'lowpass', 700, 150); a.toReverb(o); },
  charge: (a, o, t) => a.noise(o, t, 0.8, 0.5, 'lowpass', 400, 900),
  flame: (a, o, t) => a.noise(o, t, 0.8, 0.5, 'bandpass', 600, 1800, 0.7),
  build: (a, o, t) => { a.tone(o, t, 0.12, 0.3, 'square', 220, 180); a.tone(o, t + 0.08, 0.12, 0.25, 'square', 330, 280); a.noise(o, t, 0.15, 0.2, 'bandpass', 1500); },
  deconstruct: (a, o, t) => { a.tone(o, t, 0.15, 0.25, 'square', 330, 160); a.noise(o, t, 0.12, 0.2, 'bandpass', 1000); },
  mine: (a, o, t) => { a.tone(o, t, 0.08, 0.3, 'square', 900 + Math.random() * 300, 500); a.noise(o, t, 0.1, 0.3, 'bandpass', 3000); },
  chop: (a, o, t) => { a.noise(o, t, 0.12, 0.45, 'bandpass', 500, 300, 3); a.tone(o, t, 0.08, 0.25, 'triangle', 200, 120); },
  pickup: (a, o, t) => a.tone(o, t, 0.08, 0.15, 'triangle', 700, 1100),
  pickup_equip: (a, o, t) => { a.tone(o, t, 0.12, 0.2, 'triangle', 520, 780); a.noise(o, t, 0.1, 0.15, 'highpass', 4000); },
  coin: (a, o, t) => { a.tone(o, t, 0.1, 0.15, 'square', 1800, 1800); a.tone(o, t + 0.06, 0.15, 0.12, 'square', 2400, 2400); },
  rare_drop: (a, o, t) => { for (const [i, f] of [660, 880].entries()) a.tone(o, t + i * 0.08, 0.5, 0.2, 'sine', f, f); a.toReverb(o); },
  legendary: (a, o, t) => { for (const [i, f] of [440, 554, 659, 880].entries()) a.tone(o, t + i * 0.09, 1.4, 0.22, 'sine', f, f); a.tone(o, t, 1.6, 0.25, 'sawtooth', 110, 110, 0.3); a.toReverb(o); },
  levelup: (a, o, t) => { for (const [i, f] of [392, 523, 659, 784].entries()) a.tone(o, t + i * 0.1, 0.9, 0.2, 'triangle', f, f); a.toReverb(o); },
  research: (a, o, t) => { for (const [i, f] of [523, 659, 784, 1046].entries()) a.tone(o, t + i * 0.12, 1.1, 0.18, 'sine', f, f); a.toReverb(o); },
  quest: (a, o, t) => { for (const [i, f] of [330, 440, 554].entries()) a.tone(o, t + i * 0.14, 1.0, 0.2, 'triangle', f, f); a.toReverb(o); },
  alarm: (a, o, t) => { for (let i = 0; i < 3; i++) a.tone(o, t + i * 0.35, 0.3, 0.3, 'sawtooth', 440, 330); },
  death: (a, o, t) => { a.tone(o, t, 2.5, 0.4, 'sawtooth', 110, 40, 0.1); a.toReverb(o); },
  drink: (a, o, t) => { for (let i = 0; i < 3; i++) a.tone(o, t + i * 0.09, 0.08, 0.15, 'sine', 400 + i * 80, 300); },
  throw: (a, o, t) => a.noise(o, t, 0.2, 0.25, 'bandpass', 300, 900),
  chest: (a, o, t) => { a.tone(o, t, 0.3, 0.25, 'square', 180, 120); a.tone(o, t + 0.2, 0.8, 0.2, 'sine', 660, 660); a.toReverb(o); },
  craft: (a, o, t) => a.tone(o, t, 0.1, 0.15, 'triangle', 600, 800),
  click: (a, o, t) => a.tone(o, t, 0.04, 0.12, 'square', 1200, 900),
  error: (a, o, t) => a.tone(o, t, 0.15, 0.2, 'square', 200, 150),
  metal_hit: (a, o, t) => { a.tone(o, t, 0.2, 0.2, 'square', 700, 400); a.noise(o, t, 0.1, 0.2, 'highpass', 2000); },
  reactor: (a, o, t) => { a.tone(o, t, 3, 0.5, 'sawtooth', 40, 120, 1); a.noise(o, t, 3, 0.3, 'lowpass', 100, 2000); a.toReverb(o); },
};
