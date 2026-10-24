import { Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { AuthService } from '../../core/auth/auth.service';
import { getErrorMessage } from '../../core/utils/error.util';

type AuthMode = 'login' | 'register' | 'forgotPassword' | 'resetPassword';

@Component({
  selector: 'app-auth',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    TranslocoPipe,
  ],
  templateUrl: './auth.page.html',
  styleUrl: './auth.page.scss',
})
export class AuthPage implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly fb = inject(FormBuilder);
  private readonly transloco = inject(TranslocoService);

  readonly mode = signal<AuthMode>('login');
  readonly error = signal<string | null>(null);
  readonly message = signal<string | null>(null);
  readonly sending = signal(false);
  readonly resetToken = signal('');

  readonly loginForm = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required]],
  });

  readonly registerForm = this.fb.nonNullable.group({
    name: ['', [Validators.required]],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]],
  });

  readonly forgotForm = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
  });

  readonly resetForm = this.fb.nonNullable.group({
    newPassword: ['', [Validators.required, Validators.minLength(6)]],
    confirmPassword: ['', [Validators.required]],
  });

  ngOnInit(): void {
    const query = this.route.snapshot.queryParamMap;
    if (query.get('mode') === 'reset' && query.get('token')) {
      this.resetToken.set(query.get('token') ?? '');
      this.mode.set('resetPassword');
    }
  }

  switchMode(mode: AuthMode): void {
    this.mode.set(mode);
    this.error.set(null);
    this.message.set(null);
    this.loginForm.reset();
    this.registerForm.reset();
    this.forgotForm.reset();
    this.resetForm.reset();
  }

  async handleLogin(): Promise<void> {
    this.loginForm.markAllAsTouched();
    if (this.loginForm.invalid) {
      return;
    }
    this.error.set(null);
    this.sending.set(true);
    try {
      await this.auth.login(this.loginForm.getRawValue());
      await this.router.navigate(['/home']);
    } catch (error) {
      this.error.set(getErrorMessage(error, this.t('auth.errors.login')));
    } finally {
      this.sending.set(false);
    }
  }

  async handleRegister(): Promise<void> {
    this.registerForm.markAllAsTouched();
    if (this.registerForm.invalid) {
      return;
    }
    this.error.set(null);
    this.sending.set(true);
    try {
      await this.auth.register(this.registerForm.getRawValue());
      await this.router.navigate(['/profile']);
    } catch (error) {
      this.error.set(getErrorMessage(error, this.t('auth.errors.register')));
    } finally {
      this.sending.set(false);
    }
  }

  async handleForgotPassword(): Promise<void> {
    this.forgotForm.markAllAsTouched();
    if (this.forgotForm.invalid) {
      return;
    }
    this.error.set(null);
    this.message.set(null);
    this.sending.set(true);
    try {
      await this.auth.forgotPassword(this.forgotForm.controls.email.value);
      this.message.set(this.t('auth.forgotSent'));
      this.forgotForm.reset();
    } catch (error) {
      this.error.set(getErrorMessage(error, this.t('auth.errors.send')));
    } finally {
      this.sending.set(false);
    }
  }

  async handleResetPassword(): Promise<void> {
    this.resetForm.markAllAsTouched();
    if (this.resetForm.invalid) {
      return;
    }
    if (
      this.resetForm.controls.newPassword.value !==
      this.resetForm.controls.confirmPassword.value
    ) {
      this.error.set(this.t('auth.errors.passwordsMatch'));
      return;
    }
    this.error.set(null);
    this.message.set(null);
    this.sending.set(true);
    try {
      await this.auth.resetPassword(
        this.resetToken(),
        this.resetForm.controls.newPassword.value,
      );
      this.message.set(this.t('auth.resetSuccess'));
      setTimeout(() => {
        this.switchMode('login');
        void this.router.navigate(['/auth']);
      }, 2000);
    } catch (error) {
      this.error.set(getErrorMessage(error, this.t('auth.errors.reset')));
    } finally {
      this.sending.set(false);
    }
  }

  private t(key: string): string {
    return this.transloco.translate(key);
  }
}
