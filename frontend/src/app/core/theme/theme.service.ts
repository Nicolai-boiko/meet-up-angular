import { Injectable, computed, effect, signal } from '@angular/core';

export type Theme = 'light' | 'dark';

function initialTheme(): Theme {
  const stored = localStorage.getItem('theme');
  if (stored === 'light' || stored === 'dark') {
    return stored;
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly themeSignal = signal<Theme>(initialTheme());

  readonly theme = this.themeSignal.asReadonly();
  readonly isDark = computed(() => this.themeSignal() === 'dark');

  constructor() {
    effect(() => {
      const theme = this.themeSignal();
      document.documentElement.classList.toggle('dark', theme === 'dark');
      localStorage.setItem('theme', theme);
    });
  }

  toggle(): void {
    this.themeSignal.update((theme) => (theme === 'light' ? 'dark' : 'light'));
  }

  set(theme: Theme): void {
    this.themeSignal.set(theme);
  }
}
