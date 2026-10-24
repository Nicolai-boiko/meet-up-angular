import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatSelectModule } from '@angular/material/select';
import { TranslocoPipe } from '@jsverse/transloco';
import { AuthService } from '../../../core/auth/auth.service';
import { ThemeService } from '../../../core/theme/theme.service';
import { AppLang, LanguageService } from '../../../core/i18n/language.service';
import { assetUrl } from '../../../core/utils/asset-url';

@Component({
  selector: 'app-header',
  imports: [
    RouterLink,
    RouterLinkActive,
    MatToolbarModule,
    MatButtonModule,
    MatSelectModule,
    TranslocoPipe,
  ],
  templateUrl: './header.html',
  styleUrl: './header.scss',
})
export class HeaderComponent {
  readonly auth = inject(AuthService);
  readonly theme = inject(ThemeService);
  readonly language = inject(LanguageService);
  private readonly router = inject(Router);

  readonly mobileMenuOpen = signal(false);
  readonly assetUrl = assetUrl;

  toggleMobileMenu(): void {
    this.mobileMenuOpen.update((open) => !open);
  }

  closeMobileMenu(): void {
    this.mobileMenuOpen.set(false);
  }

  setLang(lang: AppLang): void {
    this.language.set(lang);
  }

  async logout(): Promise<void> {
    await this.auth.logout();
    this.closeMobileMenu();
    await this.router.navigate(['/auth']);
  }
}
