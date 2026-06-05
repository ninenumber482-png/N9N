import { Injectable, signal } from '@angular/core';
import { Theme } from 'src/app/models/theme.model';
import { effect } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class ThemeService {
  public theme = signal<Theme>({ mode: 'dark', color: 'base', direction: 'ltr' });

  constructor() {
    this.loadTheme();
    effect(() => {
      this.setConfig();
    });
  }

  private loadTheme() {
    const theme = localStorage.getItem('theme');
    if (theme) {
      try {
        this.theme.set(JSON.parse(theme));
      } catch {
        // Corrupted theme would throw during root-service init → blank app.
        localStorage.removeItem('theme');
      }
    }
  }

  private setConfig() {
    this.setLocalStorage();
    this.setThemeClass();
    this.setRTL();
  }

  public get isDark(): boolean {
    return this.theme().mode == 'dark';
  }

  public isDarkMode(): boolean {
    return this.theme().mode == 'dark';
  }

  public toggleTheme(): void {
    const newMode = this.theme().mode === 'dark' ? 'light' : 'dark';
    this.theme.set({ ...this.theme(), mode: newMode });
  }

  private setThemeClass() {
    document.querySelector('html')!.className = this.theme().mode;
    document.querySelector('html')!.setAttribute('data-theme', this.theme().color);
  }

  private setLocalStorage() {
    localStorage.setItem('theme', JSON.stringify(this.theme()));
  }

  private setRTL() {
    document.querySelector('html')!.setAttribute('dir', this.theme().direction);
    this.setLocalStorage();
  }
}
