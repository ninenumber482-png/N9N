import { Injectable, inject } from '@angular/core';
import { AdminService } from 'src/app/core/services/admin.service';
import { utcMs } from 'src/shared/utils/utc';

const LS_KEY = 'n9_health_chime';
// Engine is "healthy" if the latest king_results is younger than this (≈ one session + slack).
const SESSION_FRESH_MS = 390_000;

interface ChimeSettings {
  enabled: boolean;
  intervalMin: number;
}

/**
 * Periodic "boarding-call" health heartbeat for the admin operator.
 * Every N minutes it checks engine health and plays an airport-style chime
 * (pleasant ding-dong when healthy, low alert when stale). Web Audio only,
 * settings persisted per-browser in localStorage. No DB, no network beyond
 * the health probe. Start() once globally (DashboardComponent).
 */
@Injectable({ providedIn: 'root' })
export class HealthChimeService {
  private admin = inject(AdminService);
  private audioCtx: AudioContext | null = null;
  private timer?: ReturnType<typeof setInterval>;
  private gestureBound = false;
  private chimeBuffer: AudioBuffer | null = null;
  private chimeLoading = false;

  enabled = true;
  intervalMin = 10;
  lastChimeAt: number | null = null;
  lastHealthy: boolean | null = null;

  readonly intervalOptions = [5, 10, 15, 30, 60];

  constructor() {
    this.load();
    this.bindGesture();
  }

  private load(): void {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return;
      const s = JSON.parse(raw) as Partial<ChimeSettings>;
      if (typeof s.enabled === 'boolean') this.enabled = s.enabled;
      if (typeof s.intervalMin === 'number' && s.intervalMin > 0) this.intervalMin = s.intervalMin;
    } catch {
      /* corrupt/no settings — keep defaults */
    }
  }

  private save(): void {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({ enabled: this.enabled, intervalMin: this.intervalMin }));
    } catch {
      /* storage unavailable — ignore */
    }
  }

  /** Unlock/resume AudioContext on the first user gesture (browser autoplay policy). */
  private bindGesture(): void {
    if (this.gestureBound || typeof window === 'undefined') return;
    this.gestureBound = true;
    const unlock = () => {
      try {
        if (!this.audioCtx) this.audioCtx = new AudioContext();
        void this.audioCtx.resume();
        void this.loadChime();
      } catch {
        /* ignore */
      }
    };
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
  }

  /** Start (or restart) the heartbeat timer. Idempotent — safe to call repeatedly. */
  start(): void {
    this.stop();
    if (!this.enabled) return;
    const ms = Math.max(1, this.intervalMin) * 60_000;
    this.timer = setInterval(() => void this.tick(), ms);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  setEnabled(v: boolean): void {
    this.enabled = v;
    this.save();
    this.start();
  }

  setIntervalMin(v: number): void {
    this.intervalMin = v;
    this.save();
    this.start();
  }

  /** Manual test — runs one heartbeat now (health probe + chime). */
  async test(): Promise<void> {
    await this.tick();
  }

  private async tick(): Promise<void> {
    let healthy = true;
    try {
      const res = (await this.admin.getLatestKingResult()) as Array<{ created_at?: string }> | null;
      const ts = utcMs(res?.[0]?.created_at);
      healthy = ts > 0 && Date.now() - ts < SESSION_FRESH_MS;
    } catch {
      healthy = false;
    }
    this.lastHealthy = healthy;
    this.lastChimeAt = Date.now();
    if (healthy) this.playBoardingCall();
    else this.playAlert();
  }

  private ctx(): AudioContext | null {
    try {
      if (!this.audioCtx) this.audioCtx = new AudioContext();
      if (this.audioCtx.state === 'suspended') void this.audioCtx.resume();
      return this.audioCtx;
    } catch {
      return null;
    }
  }

  /** Soft bell note with attack + exponential decay. */
  private note(freq: number, start: number, dur: number, vol = 0.12): void {
    const ctx = this.audioCtx;
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(vol, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(start);
    osc.stop(start + dur);
  }

  /** Lazy-load the real airport-chime MP3 into an AudioBuffer (once). */
  private async loadChime(): Promise<void> {
    if (this.chimeBuffer || this.chimeLoading || typeof fetch === 'undefined') return;
    const ctx = this.ctx();
    if (!ctx) return;
    this.chimeLoading = true;
    try {
      const url = new URL('assets/sounds/airport-chime.mp3', document.baseURI).href;
      const buf = await (await fetch(url)).arrayBuffer();
      this.chimeBuffer = await ctx.decodeAudioData(buf);
    } catch {
      /* asset unavailable — synth fallback will be used */
    } finally {
      this.chimeLoading = false;
    }
  }

  /** Play the real chime MP3 if decoded. Returns false if not ready. */
  private playChimeFile(): boolean {
    const ctx = this.audioCtx;
    if (!ctx || !this.chimeBuffer) return false;
    const src = ctx.createBufferSource();
    const gain = ctx.createGain();
    gain.gain.value = 0.9;
    src.buffer = this.chimeBuffer;
    src.connect(gain);
    gain.connect(ctx.destination);
    src.start();
    return true;
  }

  /** Warm bell: fundamental + soft octave partial + long decay (PA-speaker timbre). */
  private bell(freq: number, start: number, dur: number, vol = 0.12): void {
    const ctx = this.audioCtx;
    if (!ctx) return;
    for (const [mult, v] of [
      [1, vol],
      [2, vol * 0.3],
      [3, vol * 0.12],
    ] as const) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq * mult;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(v, start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + dur);
    }
  }

  /** Airport "attention please" chime — real MP3 if decoded, else synth bells (descending C major). */
  private playBoardingCall(): void {
    const ctx = this.ctx();
    if (!ctx) return;
    if (this.playChimeFile()) return;
    void this.loadChime(); // prepare for next time
    const t = ctx.currentTime + 0.03;
    this.bell(1047, t + 0.0, 0.9, 0.12); // C6
    this.bell(784, t + 0.48, 0.9, 0.12); // G5
    this.bell(659, t + 0.96, 1.0, 0.12); // E5
    this.bell(523, t + 1.5, 1.5, 0.13); // C5 (resolve, long)
  }

  /** Stale/unhealthy: low triple beep to grab attention. */
  private playAlert(): void {
    const ctx = this.ctx();
    if (!ctx) return;
    const t = ctx.currentTime + 0.02;
    this.note(330, t, 0.18, 0.13);
    this.note(330, t + 0.26, 0.18, 0.13);
    this.note(294, t + 0.54, 0.42, 0.14);
  }
}
