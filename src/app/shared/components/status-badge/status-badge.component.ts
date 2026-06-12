import { NgClass } from '@angular/common';
import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { badgeClass, badgeLabel } from 'src/app/shared/utils/status-badge.helper';

@Component({
  selector: 'app-status-badge',
  standalone: true,
  imports: [NgClass],
  template: `<span class="n9-badge" [ngClass]="classes" [title]="value">{{ label }}</span>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StatusBadgeComponent {
  @Input() value: string | null | undefined = '';
  @Input() severity?: 'success' | 'info' | 'warn' | 'danger' | 'secondary' | 'contrast';

  get classes(): string {
    return badgeClass(this.value ?? '', this.severity);
  }

  get label(): string {
    return badgeLabel(this.value);
  }
}
