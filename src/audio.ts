import type { SoundName } from './game';

/** Major pentatonic steps (semitones): every seat on a bus climbs one note, so a bus
 *  filling up sounds like a little run toward the "full" chord. */
const LADDER = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26, 28];
const LADDER_ROOT = 392; // G4

export function boardPitch(seat: number): number {
  const i = Math.max(0, Math.min(LADDER.length - 1, seat - 1));
  return LADDER_ROOT * 2 ** (LADDER[i] / 12);
}

/** Short vibrations on phones that support it (Android; iOS ignores it). */
const HAPTICS: Partial<Record<SoundName, number | number[]>> = {
  tap: 8,
  bump: 25,
  park: 12,
  full: [15, 30, 20],
  unlock: [10, 20, 10],
  win: [20, 40, 20, 40, 60],
  lose: 120,
  close: [30, 30, 60],
};

interface ToneOpts {
  type?: OscillatorType;
  vol?: number;
  slideTo?: number;
  delay?: number;
  /** Lowpass cutoff, for softer, rounder tones. */
  cutoff?: number;
  /** How much goes to the reverb (0-1). */
  wet?: number;
}

/** Tiny synthesized sound effects; no audio files needed. Everything runs through a
 *  compressor so stacked sounds don't clip, with a little reverb for space. */
export class Sfx {
  muted = false;
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private reverb: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private lastBoard = 0;

  unlock(): void {
    if (!this.ctx) {
      try {
        this.ctx = new AudioContext();
        this.buildMix(this.ctx);
      } catch {
        this.ctx = null;
        return;
      }
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  private buildMix(ctx: AudioContext): void {
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.knee.value = 12;
    comp.ratio.value = 4;
    comp.attack.value = 0.003;
    comp.release.value = 0.15;
    comp.connect(ctx.destination);

    this.master = ctx.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(comp);

    // Synthetic room: a short burst of decaying noise as the impulse response.
    const len = Math.floor(ctx.sampleRate * 0.9);
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3;
    }
    const conv = ctx.createConvolver();
    conv.buffer = ir;
    this.reverb = ctx.createGain();
    this.reverb.gain.value = 0.35;
    this.reverb.connect(conv).connect(comp);

    this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const n = this.noise.getChannelData(0);
    for (let i = 0; i < n.length; i++) n[i] = Math.random() * 2 - 1;
  }

  private tone(freq: number, dur: number, o: ToneOpts = {}): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || this.muted) return;
    const { type = 'sine', vol = 0.08, slideTo, delay = 0, cutoff, wet = 0.15 } = o;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    // A few ms of attack instead of a hard start: no clicks.
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(vol, t + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let out: AudioNode = osc.connect(gain);
    if (cutoff) {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = cutoff;
      out = gain.connect(lp);
    }
    out.connect(this.master);
    if (this.reverb && wet > 0) {
      const send = ctx.createGain();
      send.gain.value = wet;
      out.connect(send).connect(this.reverb);
    }
    osc.start(t);
    osc.stop(t + dur + 0.03);
  }

  /** Filtered noise swept upward: an airy "fwoosh" with no pitch to clash with the music. */
  private whoosh(dur: number, vol: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.noise || this.muted) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 1.2;
    bp.frequency.setValueAtTime(350, t);
    bp.frequency.exponentialRampToValueAtTime(2600, t + dur);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(vol, t + dur * 0.35);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(bp).connect(gain).connect(this.master);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  private buzz(name: SoundName): void {
    const pattern = HAPTICS[name];
    if (pattern === undefined || this.muted) return;
    try {
      navigator.vibrate?.(pattern);
    } catch {
      // vibration blocked or unsupported
    }
  }

  play(name: SoundName, detail?: number): void {
    if (!this.ctx || this.muted) return;
    this.buzz(name);
    switch (name) {
      case 'board': {
        // Boarding runs ~22 passengers a second; keep each blip tiny so the run stays clean.
        const now = performance.now();
        if (now - this.lastBoard < 38) return;
        this.lastBoard = now;
        this.tone(boardPitch(detail ?? 1), 0.07, { type: 'triangle', vol: 0.06, wet: 0.1 });
        break;
      }
      case 'tap':
        this.tone(1800, 0.025, { type: 'square', vol: 0.025, cutoff: 3000, wet: 0 });
        break;
      case 'bump':
        this.tone(150, 0.14, { type: 'square', vol: 0.07, slideTo: 90, cutoff: 900, wet: 0.05 });
        break;
      case 'go':
        // Engine rev off the line.
        this.tone(110, 0.22, { type: 'sawtooth', vol: 0.05, slideTo: 260, cutoff: 1100, wet: 0.08 });
        break;
      case 'park':
        // Brakes and a soft thunk.
        this.tone(190, 0.12, { type: 'triangle', vol: 0.1, slideTo: 120, wet: 0.05 });
        this.tone(2400, 0.04, { type: 'square', vol: 0.015, cutoff: 4000, wet: 0 });
        break;
      case 'full':
        // Sparkly major chord as the last seat fills.
        [784, 988, 1175, 1568].forEach((f, i) =>
          this.tone(f, 0.28, { type: 'triangle', vol: 0.07, delay: i * 0.035, wet: 0.3 }),
        );
        break;
      case 'depart':
        // Soft whoosh as it pulls away, plus a quiet pickup in the boarding ladder's key.
        this.whoosh(0.32, 0.05);
        this.tone(587, 0.12, { type: 'triangle', vol: 0.04, delay: 0.05, wet: 0.3 });
        this.tone(784, 0.22, { type: 'triangle', vol: 0.05, delay: 0.13, wet: 0.35 });
        break;
      case 'reveal':
        this.tone(500, 0.15, { vol: 0.08, slideTo: 1000, wet: 0.2 });
        break;
      case 'error':
        this.tone(200, 0.18, { type: 'square', vol: 0.05, slideTo: 150, cutoff: 1200 });
        break;
      case 'booster':
        this.tone(400, 0.3, { vol: 0.08, slideTo: 1200, wet: 0.3 });
        break;
      case 'unlock':
        this.tone(900, 0.06, { type: 'square', vol: 0.04, cutoff: 3000 });
        this.tone(1350, 0.14, { type: 'triangle', vol: 0.08, delay: 0.06, wet: 0.25 });
        break;
      case 'close':
        // Low whoosh, then a bright sparkle as the clock is beaten.
        this.tone(160, 0.5, { type: 'sawtooth', vol: 0.06, slideTo: 55, cutoff: 800 });
        [1046, 1318, 1568, 2093].forEach((f, i) =>
          this.tone(f, 0.2, { vol: 0.07, delay: 0.25 + i * 0.07, wet: 0.35 }),
        );
        break;
      case 'win':
        [523, 659, 784, 1046].forEach((f, i) =>
          this.tone(f, 0.26, { type: 'triangle', vol: 0.1, delay: i * 0.12, wet: 0.3 }),
        );
        this.tone(1568, 0.6, { type: 'sine', vol: 0.06, delay: 0.48, wet: 0.45 });
        break;
      case 'lose':
        [392, 330, 262].forEach((f, i) =>
          this.tone(f, 0.32, { type: 'sawtooth', vol: 0.05, delay: i * 0.18, cutoff: 1200, wet: 0.2 }),
        );
        break;
    }
  }
}
