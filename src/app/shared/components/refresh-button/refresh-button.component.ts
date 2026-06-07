import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

@Component({
  selector: 'app-refresh-button',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button
      (click)="clicked.emit()"
      [disabled]="loading()"
      class="bg-card border-border text-muted-foreground hover:text-foreground rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors flex items-center gap-1.5 disabled:opacity-50">
      <svg class="h-3.5 w-3.5" [class.animate-spin]="loading()" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
      </svg>
      {{ label() }}
    </button>
  `,
})
export class RefreshButtonComponent {
  loading = input.required<boolean>();
  label = input<string>('Refresh');
  clicked = output<void>();
}
