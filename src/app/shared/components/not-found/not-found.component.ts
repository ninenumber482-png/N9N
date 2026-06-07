import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-not-found',
  standalone: true,
  imports: [CommonModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col items-center justify-center py-20">
      <div class="text-8xl font-black text-primary/30 mb-4">404</div>
      <h1 class="text-2xl font-bold text-foreground mb-2">Halaman Tidak Ditemukan</h1>
      <p class="text-muted-foreground mb-8 text-sm">Halaman yang Anda cari tidak ada atau telah dipindahkan.</p>
      <a routerLink="/overview" class="bg-primary text-primary-foreground rounded-lg px-6 py-3 text-sm font-bold transition-opacity hover:opacity-90">
        Kembali ke Dashboard
      </a>
    </div>
  `,
})
export class NotFoundComponent {}
