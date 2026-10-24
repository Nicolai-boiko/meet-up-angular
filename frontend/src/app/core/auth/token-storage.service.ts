import { Injectable, signal } from '@angular/core';
import { AppRole } from '../models';

const TOKEN_KEY = 'token';
const REFRESH_TOKEN_KEY = 'refreshToken';
const USER_ID_KEY = 'userId';
const ROLE_KEY = 'role';

@Injectable({ providedIn: 'root' })
export class TokenStorageService {
  private readonly tokenSignal = signal<string | null>(localStorage.getItem(TOKEN_KEY));
  private readonly refreshTokenSignal = signal<string | null>(
    localStorage.getItem(REFRESH_TOKEN_KEY),
  );
  private readonly userIdSignal = signal<string | null>(localStorage.getItem(USER_ID_KEY));
  private readonly roleSignal = signal<AppRole>(
    (localStorage.getItem(ROLE_KEY) as AppRole | null) ?? 'USER',
  );

  readonly token = this.tokenSignal.asReadonly();
  readonly refreshToken = this.refreshTokenSignal.asReadonly();
  readonly userId = this.userIdSignal.asReadonly();
  readonly role = this.roleSignal.asReadonly();

  setTokens(
    token: string,
    userId: string,
    refreshToken?: string | null,
    role?: string | null,
  ): void {
    this.tokenSignal.set(token);
    this.userIdSignal.set(userId);
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_ID_KEY, userId);

    if (refreshToken) {
      this.refreshTokenSignal.set(refreshToken);
      localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
    }
    if (role) {
      this.setRole(role);
    }
  }

  setRole(role: string): void {
    const normalized: AppRole = role === 'ADMIN' ? 'ADMIN' : 'USER';
    this.roleSignal.set(normalized);
    localStorage.setItem(ROLE_KEY, normalized);
  }

  clear(): void {
    this.tokenSignal.set(null);
    this.refreshTokenSignal.set(null);
    this.userIdSignal.set(null);
    this.roleSignal.set('USER');
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    localStorage.removeItem(USER_ID_KEY);
    localStorage.removeItem(ROLE_KEY);
  }
}
