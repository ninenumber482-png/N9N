import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { InputTextModule } from 'primeng/inputtext';
import { AngularSvgIconModule } from 'angular-svg-icon';

@Component({
  selector: 'app-filter-bar',
  standalone: true,
  imports: [FormsModule, InputTextModule, AngularSvgIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex w-full flex-col gap-3 rounded-lg border border-border bg-card p-3 lg:flex-row lg:items-center lg:justify-between">
      @if (showSearch()) {
        <div class="relative w-full lg:max-w-sm">
          <svg-icon
            src="assets/icons/heroicons/outline/magnifying-glass.svg"
            svgClass="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"></svg-icon>
          <input
            pInputText
            type="search"
            [ngModel]="search()"
            (ngModelChange)="searchChange.emit($event)"
            (keyup.enter)="searchSubmit.emit()"
            [placeholder]="placeholder()"
            class="!h-10 !w-full !rounded-md !border-border !bg-background !py-2 !pl-10 !pr-3 !text-sm" />
        </div>
      }
      <div class="flex w-full flex-wrap items-center gap-2 lg:w-auto lg:justify-end">
        <ng-content />
      </div>
    </div>
  `,
})
export class FilterBarComponent {
  search = input<string>('');
  placeholder = input<string>('Cari...');
  showSearch = input<boolean>(true);
  searchChange = output<string>();
  searchSubmit = output<void>();
}
