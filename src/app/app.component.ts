import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { NgxSonnerToaster } from 'ngx-sonner';
import { ThemeService } from 'src/app/core/services/theme.service';
@Component({
  selector: 'app-root',
  standalone: true,
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css'],
  imports: [RouterOutlet, NgxSonnerToaster],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent {
  themeService = inject(ThemeService);

  title = 'Number9 System D';
}
