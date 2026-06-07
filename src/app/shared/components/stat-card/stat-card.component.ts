import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-stat-card',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="bg-card border-border rounded-lg border p-4">
      <p class="text-muted-foreground text-[10px] font-bold uppercase tracking-widest">{{ label() }}</p>
      <p class="mt-2 text-2xl font-black text-foreground">{{ value() }}</p>
      @if (description()) {
        <p class="mt-1 text-[10px] font-semibold text-muted-foreground">{{ description() }}</p>
      }
    </div>
  `,
})
export class StatCardComponent {
  label = input.required<string>();
  value = input.required<string | number | null>();
  description = input<string>('');
}
