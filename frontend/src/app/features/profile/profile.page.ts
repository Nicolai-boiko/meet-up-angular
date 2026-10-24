import { Component, OnInit, effect, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { AuthService } from '../../core/auth/auth.service';
import { assetUrl } from '../../core/utils/asset-url';
import { getErrorMessage } from '../../core/utils/error.util';

const MAX_AVATAR_SIZE = 2 * 1024 * 1024;

@Component({
  selector: 'app-profile',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    TranslocoPipe,
  ],
  templateUrl: './profile.page.html',
  styleUrl: './profile.page.scss',
})
export class ProfilePage implements OnInit {
  readonly auth = inject(AuthService);
  private readonly fb = inject(FormBuilder);
  private readonly transloco = inject(TranslocoService);

  readonly saving = signal(false);
  readonly changingPassword = signal(false);
  readonly profileError = signal<string | null>(null);
  readonly profileSuccess = signal<string | null>(null);
  readonly passwordError = signal<string | null>(null);
  readonly passwordSuccess = signal<string | null>(null);
  readonly assetUrl = assetUrl;

  readonly profileForm = this.fb.nonNullable.group({
    firstName: [''],
    lastName: [''],
    birthDate: [''],
  });

  readonly passwordForm = this.fb.nonNullable.group({
    currentPassword: ['', [Validators.required]],
    newPassword: ['', [Validators.required, Validators.minLength(6)]],
  });

  constructor() {
    effect(() => {
      const profile = this.auth.profile();
      if (profile) {
        this.profileForm.patchValue(
          {
            firstName: profile.firstName ?? '',
            lastName: profile.lastName ?? '',
            birthDate: profile.birthDate ? profile.birthDate.split('T')[0] : '',
          },
          { emitEvent: false },
        );
      }
    });
  }

  ngOnInit(): void {
    if (!this.auth.profile()) {
      void this.auth.fetchProfile();
    }
  }

  async handleUpdateProfile(): Promise<void> {
    this.saving.set(true);
    this.profileError.set(null);
    this.profileSuccess.set(null);
    try {
      const value = this.profileForm.getRawValue();
      await this.auth.updateProfile({
        firstName: value.firstName || null,
        lastName: value.lastName || null,
        birthDate: value.birthDate || null,
      });
      this.flashSuccess('profileSuccess', 'profile.saved');
    } catch (error) {
      this.profileError.set(getErrorMessage(error, this.t('profile.saveError')));
    } finally {
      this.saving.set(false);
    }
  }

  async handleChangePassword(): Promise<void> {
    this.passwordForm.markAllAsTouched();
    if (this.passwordForm.invalid) {
      return;
    }
    this.changingPassword.set(true);
    this.passwordError.set(null);
    this.passwordSuccess.set(null);
    try {
      const value = this.passwordForm.getRawValue();
      await this.auth.changePassword(value.currentPassword, value.newPassword);
      this.passwordForm.reset();
      this.flashSuccess('passwordSuccess', 'profile.changed');
    } catch (error) {
      this.passwordError.set(getErrorMessage(error, this.t('profile.passwordError')));
    } finally {
      this.changingPassword.set(false);
    }
  }

  async handleAvatarUpload(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) {
      return;
    }
    if (file.size > MAX_AVATAR_SIZE) {
      this.profileError.set(this.t('profile.uploadError'));
      return;
    }
    try {
      await this.auth.uploadAvatar(file);
    } catch (error) {
      this.profileError.set(getErrorMessage(error, this.t('profile.avatarError')));
    }
  }

  async removeAvatar(): Promise<void> {
    try {
      await this.auth.updateProfile({ avatar: null });
    } catch (error) {
      this.profileError.set(getErrorMessage(error, this.t('profile.avatarError')));
    }
  }

  private flashSuccess(
    target: 'profileSuccess' | 'passwordSuccess',
    key: string,
  ): void {
    const setter = target === 'profileSuccess' ? this.profileSuccess : this.passwordSuccess;
    setter.set(this.t(key));
    setTimeout(() => setter.set(null), 3000);
  }

  private t(key: string): string {
    return this.transloco.translate(key);
  }
}
