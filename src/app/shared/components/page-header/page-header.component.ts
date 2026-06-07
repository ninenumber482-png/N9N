import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { AngularSvgIconModule } from 'angular-svg-icon';

@Component({
  selector: 'app-page-header',
  standalone: true,
  imports: [AngularSvgIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-3">
        <div class="page-header-icon">
          <svg-icon [src]="'assets/icons/heroicons/outline/' + icon() + '.svg'" svgClass="h-4 w-4"></svg-icon>
        </div>
        <div>
          <h1 class="max-sm:text-lg sm:text-xl font-bold text-foreground tracking-tight">{{ title() }}</h1>
          @if (subtitle()) {
            <p class="text-muted-foreground mt-0.5 text-xs">{{ subtitle() }}</p>
          }
        </div>
      </div>
      <ng-content />
    </div>
  `,
})
export class PageHeaderComponent {
  icon = input.required<string>();
  title = input.required<string>();
  subtitle = input<string>('');
}
