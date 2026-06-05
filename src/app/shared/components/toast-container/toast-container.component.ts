import { ChangeDetectionStrategy, Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { ToastService, ToastMessage } from 'src/app/core/services/toast.service';

@Component({
  selector: 'app-toast-container',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="fixed top-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none">
      @for (toast of toasts; track toast.id) {
        <div
          class="pointer-events-auto max-w-sm rounded-xl border p-4 shadow-2xl backdrop-blur-sm transform transition-all duration-300 ease-out animate-slide-in"
          [class.border-emerald-500/30]="toast.type === 'success'"
          [class.bg-emerald-500/10]="toast.type === 'success'"
          [class.border-red-500/30]="toast.type === 'error'"
          [class.bg-red-500/10]="toast.type === 'error'"
          [class.border-sky-500/30]="toast.type === 'info'"
          [class.bg-sky-500/10]="toast.type === 'info'"
          [class.border-amber-500/30]="toast.type === 'warning'"
          [class.bg-amber-500/10]="toast.type === 'warning'"
        >
          <div class="flex items-start gap-3">
            <!-- Icon -->
            <div class="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
              [class.bg-emerald-500/20]="toast.type === 'success'"
              [class.bg-red-500/20]="toast.type === 'error'"
              [class.bg-sky-500/20]="toast.type === 'info'"
              [class.bg-amber-500/20]="toast.type === 'warning'"
            >
              @switch (toast.type) {
                @case ('success') {
                  <svg class="h-4 w-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                }
                @case ('error') {
                  <svg class="h-4 w-4 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                }
                @case ('info') {
                  <svg class="h-4 w-4 text-sky-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                }
                @case ('warning') {
                  <svg class="h-4 w-4 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                }
              }
            </div>

            <!-- Content -->
            <div class="flex-1 min-w-0">
              <p class="text-sm font-semibold text-white">{{ toast.title }}</p>
              @if (toast.message) {
                <p class="mt-1 text-xs text-white/60">{{ toast.message }}</p>
              }
            </div>

            <!-- Close -->
            <button
              (click)="remove(toast.id)"
              class="-mr-1 -mt-1 flex h-6 w-6 items-center justify-center rounded-full text-white/40 hover:text-white/70 transition-colors"
            >
              <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    @keyframes slide-in {
      from { opacity: 0; transform: translateX(100%) scale(0.95); }
      to { opacity: 1; transform: translateX(0) scale(1); }
    }
    .animate-slide-in {
      animation: slide-in 0.3s ease-out;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ToastContainerComponent implements OnInit, OnDestroy {
  toasts: ToastMessage[] = [];
  private subs: Subscription[] = [];

  constructor(private toastService: ToastService) {}

  ngOnInit() {
    this.subs.push(
      this.toastService.toast$.subscribe(t => {
        this.toasts = [...this.toasts, t];
      })
    );
    this.subs.push(
      this.toastService.dismiss$.subscribe(id => {
        this.toasts = this.toasts.filter(t => t.id !== id);
      })
    );
  }

  remove(id: string) {
    this.toastService.dismiss(id);
  }

  ngOnDestroy() {
    this.subs.forEach(s => s.unsubscribe());
  }
}
