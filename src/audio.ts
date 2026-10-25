import type { SoundName } from './game';

/** Tiny synthesized sound effects; no audio files needed. */
export class Sfx {
  muted = false;
  private ctx: AudioContext | null = null;
  private lastBoard = 0;

  unlock(): void {
    if (!this.ctx) {
      try {
        this.ctx = new AudioContext();
      } catch {
        return;
      }
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  private tone(freq: number, dur: number, type: OscillatorType, vol: number, slideTo?: number, delay = 0) {
    const ctx = this.ctx;
    if (!ctx || this.muted) return;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  play(name: SoundName): void {
    if (!this.ctx || this.muted) return;
    switch (name) {
      case 'board': {
        const now = performance.now();
        if (now - this.lastBoard < 70) return;
        this.lastBoard = now;
        this.tone(700 + Math.random() * 300, 0.05, 'sine', 0.05);
        break;
      }
      case 'bump':
        this.tone(140, 0.14, 'square', 0.08, 90);
        break;
      case 'go':
        this.tone(220, 0.18, 'sawtooth', 0.05, 440);
        break;
      case 'park':
        this.tone(520, 0.08, 'triangle', 0.08);
        break;
      case 'full':
        this.tone(660, 0.09, 'triangle', 0.09);
        this.tone(880, 0.12, 'triangle', 0.09, undefined, 0.08);
        break;
      case 'reveal':
        this.tone(500, 0.15, 'sine', 0.08, 1000);
        break;
      case 'error':
        this.tone(200, 0.18, 'square', 0.06, 150);
        break;
      case 'booster':
        this.tone(400, 0.25, 'sine', 0.08, 1200);
        break;
      case 'win':
        [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.22, 'triangle', 0.1, undefined, i * 0.12));
        break;
      case 'unlock':
        this.tone(900, 0.06, 'square', 0.05);
        this.tone(1350, 0.12, 'triangle', 0.08, undefined, 0.06);
        break;
      case 'close':
        // Low whoosh, then a bright sparkle as the clock is beaten.
        this.tone(160, 0.5, 'sawtooth', 0.07, 55);
        [1046, 1318, 1568, 2093].forEach((f, i) => this.tone(f, 0.18, 'sine', 0.07, undefined, 0.25 + i * 0.07));
        break;
      case 'lose':
        [392, 330, 262].forEach((f, i) => this.tone(f, 0.3, 'sawtooth', 0.06, undefined, i * 0.18));
        break;
    }
  }
}
