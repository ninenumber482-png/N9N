import { Injectable } from '@angular/core';
import { Subject, Observable } from 'rxjs';

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  title: string;
  message?: string;
  duration?: number;
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  private toastSubject = new Subject<ToastMessage>();
  private dismissSubject = new Subject<string>();

  toast$ = this.toastSubject.asObservable();
  dismiss$ = this.dismissSubject.asObservable();

  private idCounter = 0;

  private show(type: ToastMessage['type'], title: string, message?: string, duration = 4000): string {
    const id = `toast-${++this.idCounter}-${Date.now()}`;
    this.toastSubject.next({ id, type, title, message, duration });
    if (duration > 0) {
      setTimeout(() => this.dismiss(id), duration);
    }
    return id;
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
}
