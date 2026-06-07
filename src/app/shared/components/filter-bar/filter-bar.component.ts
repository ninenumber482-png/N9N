import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { InputTextModule } from 'primeng/inputtext';

@Component({
  selector: 'app-filter-bar',
  standalone: true,
  imports: [FormsModule, InputTextModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-wrap gap-2 items-center">
      @if (showSearch()) {
        <input
          pInputText
          [ngModel]="search()"
          (ngModelChange)="searchChange.emit($event)"
          [placeholder]="placeholder()"
          class="!w-48 !text-xs !py-1.5 !px-2.5" />
      }
      <ng-content />
    </div>
  `,
})
export class FilterBarComponent {
  search = input<string>('');
  placeholder = input<string>('Cari...');
  showSearch = input<boolean>(true);
  searchChange = output<string>();
}
