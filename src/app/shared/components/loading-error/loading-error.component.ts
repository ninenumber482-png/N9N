import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

@Component({
  selector: 'app-loading-error',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (loading()) {
      <div class="bg-card border-border animate-pulse rounded-lg border p-5">
        <div class="space-y-3">
          @for (_ of skeletonRows(); track _) {
            <div class="h-10 rounded-lg bg-accent/30"></div>
          }
        </div>
      </div>
    } @else if (error()) {
      <div class="bg-card border-border rounded-lg border p-5">
        <div class="flex flex-col items-center gap-3 py-6">
          <p class="text-muted-foreground text-sm font-medium">{{ error() }}</p>
          <button
            (click)="retry.emit()"
            class="bg-card border-border text-foreground rounded-lg border px-3 py-1.5 text-xs font-medium">
            Retry
          </button>
        </div>
      </div>
    }
  `,
})
export class LoadingErrorComponent {
  loading = input.required<boolean>();
  error = input<string | null>(null);
  skeletonRows = input<number[]>([1, 2, 3, 4, 5]);
  retry = output<void>();
}
