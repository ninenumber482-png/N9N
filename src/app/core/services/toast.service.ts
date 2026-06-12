import { Injectable } from '@angular/core';
import { Subject, BehaviorSubject } from 'rxjs';

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  title: string;
  message?: string;
  duration?: number;
  timestamp?: number;
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  private toastSubject = new Subject<ToastMessage>();
  private dismissSubject = new Subject<string>();
  private unreadSubject = new BehaviorSubject<number>(0);
  private historySubject = new BehaviorSubject<ToastMessage[]>([]);

  toast$ = this.toastSubject.asObservable();
  dismiss$ = this.dismissSubject.asObservable();
  unread$ = this.unreadSubject.asObservable();
  history$ = this.historySubject.asObservable();

  private idCounter = 0;
  private maxHistory = 50;
  private audioCtx: AudioContext | null = null;
  private _muted = false;

  get muted(): boolean {
    return this._muted;
  }

  toggleMute(): void {
    this._muted = !this._muted;
  }

  get unreadCount(): number {
    return this.unreadSubject.value;
  }

  get history(): ToastMessage[] {
    return this.historySubject.value;
  }

  private playSound(type: ToastMessage['type']): void {
    if (this._muted) return;
    try {
      if (!this.audioCtx) {
        this.audioCtx = new AudioContext();
      }
      const ctx = this.audioCtx;

      const playNote = (freq: number, startTime: number, dur: number, vol = 0.12) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(vol, startTime);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + dur);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(startTime);
        osc.stop(startTime + dur);
      };

      const now = ctx.currentTime;

      switch (type) {
        case 'success':
          // Pleasant ascending chime: C5 → E5 → G5
          playNote(523, now, 0.18, 0.1);
          playNote(659, now + 0.08, 0.18, 0.1);
          playNote(784, now + 0.16, 0.25, 0.12);
          break;
        case 'error':
          // Soft descending: E4 → C4
          playNote(330, now, 0.2, 0.1);
          playNote(262, now + 0.12, 0.25, 0.1);
          break;
        case 'warning':
          // Gentle double tap: A4
          playNote(440, now, 0.12, 0.08);
          playNote(440, now + 0.15, 0.12, 0.08);
          break;
        case 'info':
        default:
          // Single soft ping: C5
          playNote(523, now, 0.15, 0.08);
          break;
      }
    } catch {}
  }

  private show(type: ToastMessage['type'], title: string, message?: string, duration = 4000): string {
    const id = `toast-${++this.idCounter}-${Date.now()}`;
    const entry: ToastMessage = { id, type, title, message, duration, timestamp: Date.now() };
    this.toastSubject.next(entry);
    this.unreadSubject.next(this.unreadSubject.value + 1);
    this.addToHistory(entry);
    this.playSound(type);
    if (duration > 0) {
      setTimeout(() => this.dismiss(id), duration);
    }
    return id;
  }

  private addToHistory(entry: ToastMessage): void {
    const current = this.historySubject.value;
    const updated = [entry, ...current].slice(0, this.maxHistory);
    this.historySubject.next(updated);
  }

  success(title: string, message?: string, duration = 4000): string {
    return this.show('success', title, message, duration);
  }

  error(title: string, message?: string, duration = 5000): string {
    return this.show('error', title, message, duration);
  }

  info(title: string, message?: string, duration = 4000): string {
    return this.show('info', title, message, duration);
  }

  warning(title: string, message?: string, duration = 4000): string {
    return this.show('warning', title, message, duration);
  }

  dismiss(id: string): void {
    this.dismissSubject.next(id);
  }

  clearUnread(): void {
    this.unreadSubject.next(0);
  }

  clearHistory(): void {
    this.historySubject.next([]);
    this.unreadSubject.next(0);
  }

  /** Add to notification panel without toast popup/sound (pending queue seed). */
  addHistoryEntry(type: ToastMessage['type'], title: string, message?: string, bumpUnread = true): void {
    const entry: ToastMessage = {
      id: `hist-${++this.idCounter}-${Date.now()}`,
      type,
      title,
      message,
      timestamp: Date.now(),
    };
    this.addToHistory(entry);
    if (bumpUnread) {
      this.unreadSubject.next(this.unreadSubject.value + 1);
    }
  }
}
