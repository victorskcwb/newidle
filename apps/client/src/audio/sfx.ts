import type { Rarity } from '@abismo/content';

export type SoundName =
  | 'hit'
  | 'crit'
  | 'miss'
  | 'hurt'
  | 'kill'
  | 'potion'
  | 'levelUp'
  | 'card'
  | 'bossAppear'
  | 'bossDefeat'
  | `drop_${Rarity}`;

/** Simultaneous sounds allowed per 100 ms, so fast fights do not turn into noise. */
const MAX_PER_WINDOW = 4;

/**
 * Recorded samples from Kenney's RPG Audio, Impact Sounds and Interface Sounds (CC0, in
 * assets/vendor/kenney-audio), a random variant each time with a slight pitch change; the
 * fanfares (level up, boss, legendary) layer a synthesized chord over them. Until a sample
 * has loaded, the synthesized version plays. The context starts on the first tap or key
 * press (browsers block audio before a gesture).
 */
const SAMPLES: Partial<Record<SoundName, { files: string[]; gain: number }>> = {
  hit: {
    files: [
      'impactMetal_medium_000',
      'impactMetal_medium_001',
      'impactMetal_medium_002',
      'knifeSlice',
      'knifeSlice2',
    ],
    gain: 0.55,
  },
  crit: {
    files: ['impactMetal_heavy_000', 'impactMetal_heavy_001', 'impactPlate_heavy_000'],
    gain: 0.75,
  },
  miss: { files: ['drawKnife1', 'drawKnife2', 'drawKnife3'], gain: 0.35 },
  hurt: {
    files: ['impactPunch_medium_000', 'impactPunch_medium_001', 'impactPunch_heavy_000'],
    gain: 0.6,
  },
  kill: { files: ['impactSoft_heavy_000', 'impactSoft_medium_000'], gain: 0.6 },
  potion: { files: ['impactGlass_light_000', 'impactGlass_light_001'], gain: 0.55 },
  levelUp: { files: ['confirmation_004'], gain: 0.7 },
  card: { files: ['bookFlip1', 'pluck_001'], gain: 0.6 },
  bossAppear: { files: ['impactBell_heavy_000'], gain: 0.8 },
  bossDefeat: { files: ['confirmation_002'], gain: 0.7 },
  drop_common: { files: ['cloth1', 'cloth2'], gain: 0.35 },
  drop_magic: { files: ['handleCoins', 'handleCoins2'], gain: 0.45 },
  drop_rare: { files: ['glass_001'], gain: 0.55 },
  drop_epic: { files: ['glass_003', 'maximize_006'], gain: 0.6 },
  drop_legendary: { files: ['confirmation_001'], gain: 0.8 },
};
/** Sounds that keep their synthesized layer on top of the sample. */
const LAYERED = new Set<SoundName>([
  'levelUp',
  'bossAppear',
  'bossDefeat',
  'drop_legendary',
  'drop_epic',
]);
export class Sfx {
  private ctx: AudioContext | null = null;
  private buffers = new Map<string, AudioBuffer>();
  private master: GainNode | null = null;
  private windowStart = 0;
  private inWindow = 0;
  enabled = true;
  volume = 0.5;

  constructor() {
    const unlock = () => {
      this.ensure();
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
  }

  private ensure() {
    if (this.ctx) return;
    try {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
      this.loadSamples(this.ctx);
    } catch {
      this.ctx = null;
    }
  }

  private loadSamples(ctx: AudioContext) {
    const files = new Set(Object.values(SAMPLES).flatMap((s) => s.files));
    for (const name of files) {
      void fetch(`vendor/kenney-audio/${name}.ogg`)
        .then((r) => r.arrayBuffer())
        .then((data) => ctx.decodeAudioData(data))
        .then((buffer) => this.buffers.set(name, buffer))
        .catch(() => undefined);
    }
  }

  /** Plays a random loaded variant; false when none is ready yet. */
  private sample(name: SoundName, at: number): boolean {
    const spec = SAMPLES[name];
    if (!spec) return false;
    const ready = spec.files.map((f) => this.buffers.get(f)).filter((b) => b !== undefined);
    if (ready.length === 0) return false;
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    // Presentation only: Math.random is fine outside the engine.
    src.buffer = ready[Math.floor(Math.random() * ready.length)]!;
    src.playbackRate.value = 0.92 + Math.random() * 0.16;
    const g = ctx.createGain();
    g.gain.value = spec.gain;
    src.connect(g).connect(this.master!);
    src.start(at);
    return true;
  }

  setVolume(enabled: boolean, volume: number) {
    this.enabled = enabled;
    this.volume = volume;
  }

  play(name: SoundName) {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.enabled || this.volume <= 0 || document.hidden) return;
    const now = ctx.currentTime;
    if (now - this.windowStart > 0.1) {
      this.windowStart = now;
      this.inWindow = 0;
    }
    if (++this.inWindow > MAX_PER_WINDOW && !name.startsWith('drop_') && name !== 'levelUp') return;
    this.master.gain.value = this.volume * 0.35;
    if (this.sample(name, now) && !LAYERED.has(name)) return;
    switch (name) {
      case 'hit':
        this.noise(now, 0.06, 1800, 0.5);
        this.tone(now, 140, 70, 0.08, 'triangle', 0.5);
        break;
      case 'crit':
        this.noise(now, 0.09, 3000, 0.7);
        this.tone(now, 320, 120, 0.14, 'square', 0.35);
        break;
      case 'miss':
        this.noise(now, 0.08, 5000, 0.15);
        break;
      case 'hurt':
        this.tone(now, 110, 60, 0.12, 'sawtooth', 0.3);
        break;
      case 'kill':
        this.tone(now, 420, 160, 0.18, 'triangle', 0.35);
        break;
      case 'potion':
        this.tone(now, 500, 900, 0.12, 'sine', 0.3);
        this.tone(now + 0.08, 700, 1100, 0.1, 'sine', 0.2);
        break;
      case 'levelUp':
        this.arpeggio(now, [523, 659, 784, 1047], 0.08, 'square', 0.25);
        break;
      case 'card':
        this.arpeggio(now, [880, 1175, 1568], 0.07, 'sine', 0.35);
        break;
      case 'bossAppear':
        this.tone(now, 70, 55, 0.9, 'sawtooth', 0.35);
        this.tone(now, 105, 82, 0.9, 'triangle', 0.25);
        break;
      case 'bossDefeat':
        this.arpeggio(now, [392, 523, 659, 784, 1047], 0.1, 'square', 0.3);
        break;
      case 'drop_common':
        this.tone(now, 660, 660, 0.06, 'sine', 0.15);
        break;
      case 'drop_magic':
        this.tone(now, 880, 990, 0.1, 'sine', 0.25);
        break;
      case 'drop_rare':
        this.arpeggio(now, [880, 1320], 0.08, 'sine', 0.3);
        break;
      case 'drop_epic':
        this.arpeggio(now, [784, 988, 1319], 0.08, 'triangle', 0.35);
        break;
      case 'drop_legendary':
        this.arpeggio(now, [523, 659, 784, 1047, 1319, 1568], 0.09, 'square', 0.3);
        this.tone(now, 130, 130, 1.2, 'triangle', 0.25);
        break;
    }
  }

  private tone(
    at: number,
    from: number,
    to: number,
    dur: number,
    type: OscillatorType,
    gain: number,
  ) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, at);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), at + dur);
    g.gain.setValueAtTime(gain, at);
    g.gain.exponentialRampToValueAtTime(0.001, at + dur);
    osc.connect(g).connect(this.master!);
    osc.start(at);
    osc.stop(at + dur + 0.02);
  }

  private arpeggio(at: number, notes: number[], step: number, type: OscillatorType, gain: number) {
    notes.forEach((f, i) => this.tone(at + i * step, f, f, step * 1.8, type, gain));
  }

  private noise(at: number, dur: number, cutoff: number, gain: number) {
    const ctx = this.ctx!;
    const buffer = ctx.createBuffer(
      1,
      Math.max(1, Math.floor(ctx.sampleRate * dur)),
      ctx.sampleRate,
    );
    const data = buffer.getChannelData(0);
    // Presentation only: Math.random is fine outside the engine.
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(filter).connect(g).connect(this.master!);
    src.start(at);
  }
}

/** One shared instance for the whole page. */
export const sfx = new Sfx();
