import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  ApiMessage,
  AuthResponse,
  PasswordChangePayload,
  ProfileUpdatePayload,
  UserCredentials,
  UserProfile,
} from '../models';
import { TokenStorageService } from './token-storage.service';
import { TokenRefreshService } from './token-refresh.service';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly storage = inject(TokenStorageService);
  private readonly tokenRefresh = inject(TokenRefreshService);
  private readonly apiUrl = `${environment.apiBaseUrl}/api`;

  private readonly profileSignal = signal<UserProfile | null>(null);
  private readonly authReadySignal = signal(false);

  readonly profile = this.profileSignal.asReadonly();
  readonly authReady = this.authReadySignal.asReadonly();
  readonly userId = this.storage.userId;
  readonly isAuthenticated = computed(() => this.storage.token() !== null);
  readonly isAdmin = computed(() => this.storage.role() === 'ADMIN');

  readonly displayName = computed(() => {
    const profile = this.profileSignal();
    if (profile) {
      if (profile.firstName && profile.lastName) {
        return `${profile.firstName} ${profile.lastName}`;
      }
      if (profile.firstName) {
        return profile.firstName;
      }
      return profile.name;
    }
    const id = this.storage.userId();
    return id ? `${id}` : '?';
  });

  readonly initials = computed(() => {
    const profile = this.profileSignal();
    if (!profile) {
      return '?';
    }
    const first = profile.firstName?.charAt(0)?.toUpperCase() ?? '';
    const last = profile.lastName?.charAt(0)?.toUpperCase() ?? '';
    if (first || last) {
      return `${first}${last}`;
    }
    return profile.name?.charAt(0)?.toUpperCase() ?? '?';
  });

  async register(credentials: UserCredentials): Promise<void> {
    const response = await firstValueFrom(
      this.http.post<AuthResponse>(`${this.apiUrl}/auth/register`, credentials),
    );
    this.applyAuthResponse(response);
    await this.fetchProfile();
  }

  async login(credentials: UserCredentials): Promise<void> {
    const response = await firstValueFrom(
      this.http.post<AuthResponse>(`${this.apiUrl}/auth/login`, credentials),
    );
    this.applyAuthResponse(response);
    await this.fetchProfile();
  }

  async refreshAccessToken(): Promise<boolean> {
    const token = await this.tokenRefresh.refresh();
    return token !== null;
  }

  async logout(): Promise<void> {
    const refreshToken = this.storage.refreshToken();
    try {
      if (refreshToken) {
        await firstValueFrom(
          this.http.post<ApiMessage>(`${this.apiUrl}/auth/logout`, { refreshToken }),
        );
      }
    } catch {
    }
    this.clearAuthData();
  }

  async tryAutoLogin(): Promise<void> {
    const storedRefreshToken = this.storage.refreshToken();
    const storedUserId = this.storage.userId();

    if (storedRefreshToken && storedUserId) {
      const refreshed = await this.refreshAccessToken();
      if (refreshed) {
        await this.fetchProfile();
      }
    } else if (this.storage.token() && storedUserId) {
      await this.fetchProfile();
    }

    this.authReadySignal.set(true);
  }

  async fetchProfile(): Promise<void> {
    try {
      const profile = await firstValueFrom(this.http.get<UserProfile>(`${this.apiUrl}/profile`));
      this.profileSignal.set(profile);
      this.storage.setRole(profile.role || 'USER');
    } catch {
      this.clearAuthData();
    }
  }

  async updateProfile(data: ProfileUpdatePayload): Promise<UserProfile> {
    const profile = await firstValueFrom(
      this.http.put<UserProfile>(`${this.apiUrl}/profile`, data),
    );
    this.profileSignal.set(profile);
    this.storage.setRole(profile.role || 'USER');
    return profile;
  }

  async forgotPassword(email: string): Promise<string> {
    const response = await firstValueFrom(
      this.http.post<ApiMessage>(`${this.apiUrl}/auth/forgot-password`, { email }),
    );
    return response.message;
  }

  async resetPassword(token: string, newPassword: string): Promise<string> {
    const response = await firstValueFrom(
      this.http.post<ApiMessage>(`${this.apiUrl}/auth/reset-password`, { token, newPassword }),
    );
    return response.message;
  }

  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    await firstValueFrom(
      this.http.put<ApiMessage>(`${this.apiUrl}/profile/password`, {
        currentPassword,
        newPassword,
      }),
    );
  }

  async uploadAvatar(file: File): Promise<UserProfile> {
    const formData = new FormData();
    formData.append('avatar', file);
    const profile = await firstValueFrom(
      this.http.post<UserProfile>(`${this.apiUrl}/profile/avatar`, formData),
    );
    this.profileSignal.set(profile);
    return profile;
  }

  private applyAuthResponse(response: AuthResponse): void {
    this.storage.setTokens(
      response.token,
      String(response.userId),
      response.refreshToken,
      response.role,
    );
  }

  private clearAuthData(): void {
    this.storage.clear();
    this.profileSignal.set(null);
  }
}
