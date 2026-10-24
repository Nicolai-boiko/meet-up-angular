import { Injectable, effect, inject, signal } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';

export type AppLang = 'ru' | 'en';

function initialLang(): AppLang {
  return localStorage.getItem('locale') === 'en' ? 'en' : 'ru';
}

@Injectable({ providedIn: 'root' })
export class LanguageService {
  private readonly transloco = inject(TranslocoService);
  private readonly langSignal = signal<AppLang>(initialLang());

  readonly lang = this.langSignal.asReadonly();

  constructor() {
    effect(() => {
      const lang = this.langSignal();
      this.transloco.setActiveLang(lang);
      localStorage.setItem('locale', lang);
      document.documentElement.lang = lang;
    });
  }

  set(lang: AppLang): void {
    this.langSignal.set(lang);
  }
}
