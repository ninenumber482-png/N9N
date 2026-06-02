import { Component, EventEmitter, input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  imports: [CommonModule],
  template: `
    @if (open()) {
      <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
        (click)="onBackdropClick()" role="dialog" aria-modal="true">
        <div class="relative w-full max-w-sm rounded-2xl border border-white/[0.06] bg-[#0e1017] p-6 text-center shadow-[0_0_60px_rgba(0,0,0,0.6)]"
          (click)="$event.stopPropagation()">

          @if (icon()) {
            <div class="mb-4 flex justify-center">
              <div [class]="'rounded-xl p-3 ' + iconBgClass()">
                <span class="text-2xl">{{ icon() }}</span>
              </div>
            </div>
          }

          @if (title()) {
            <h3 class="text-lg font-extrabold tracking-tight text-white">{{ title() }}</h3>
          }

          @if (message()) {
            <p class="mt-2 text-sm leading-relaxed text-zinc-400">{{ message() }}</p>
          }

          <div class="mt-6 flex items-center gap-3">
            <button
              (click)="cancel()"
              [disabled]="loading()"
              class="flex-1 h-11 rounded-xl border border-white/8 bg-white/[0.03] text-sm font-bold text-zinc-400 hover:border-white/20 hover:bg-white/[0.06] hover:text-white transition-all active:scale-[0.97] disabled:opacity-30 disabled:cursor-not-allowed"
            >
              {{ cancelText() || 'Cancel' }}
            </button>
            <button
              (click)="confirm()"
              [disabled]="loading()"
              [class]="'flex-1 h-11 rounded-xl text-sm font-extrabold text-white transition-all active:scale-[0.97] disabled:opacity-30 disabled:cursor-not-allowed ' + confirmBgClass()"
            >
              @if (loading()) {
                <span class="inline-flex items-center justify-center gap-2">
                  <svg class="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  {{ loadingText() || 'Processing' }}
                </span>
              } @else {
                {{ confirmText() || 'Confirm' }}
              }
            </button>
          </div>
        </div>
      </div>
    }
  `,
})
export class ConfirmDialogComponent {
  open = input(false);
  title = input('');
  message = input('');
  icon = input('');
  iconBg = input('bg-primary/10');
  confirmText = input('Confirm');
  cancelText = input('Cancel');
  loading = input(false);
  loadingText = input('Processing…');
  confirmVariant = input<'primary' | 'danger' | 'success' | 'warning'>('primary');

  @Output() onConfirm = new EventEmitter<void>();
  @Output() onCancel = new EventEmitter<void>();

  iconBgClass() {
    return this.iconBg();
  }

  confirmBgClass() {
    switch (this.confirmVariant()) {
      case 'danger':
        return 'bg-red-500 hover:bg-red-400 shadow-[0_0_20px_rgba(239,68,68,0.15)]';
      case 'success':
        return 'bg-emerald-500 hover:bg-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.15)]';
      case 'warning':
        return 'bg-amber-500 hover:bg-amber-400 shadow-[0_0_20px_rgba(245,158,11,0.15)]';
      default:
        return 'bg-primary hover:bg-primary/80 shadow-[0_0_20px_rgba(225,29,72,0.15)]';
    }
  }

  confirm() { this.onConfirm.emit(); }
  cancel() { this.onCancel.emit(); }

  onBackdropClick() {
    if (!this.loading()) this.cancel();
  }
}
