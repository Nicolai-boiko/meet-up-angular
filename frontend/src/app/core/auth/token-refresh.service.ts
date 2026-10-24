import { Injectable, inject } from '@angular/core';
import { HttpBackend, HttpHeaders, HttpRequest, HttpResponse } from '@angular/common/http';
import { filter, firstValueFrom, take } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthResponse } from '../models';
import { TokenStorageService } from './token-storage.service';

// Запрос идёт через HttpBackend, минуя интерсепторы (иначе рекурсия),
// а параллельные 401 ждут один общий Promise
@Injectable({ providedIn: 'root' })
export class TokenRefreshService {
  private readonly backend = inject(HttpBackend);
  private readonly storage = inject(TokenStorageService);
  private refreshPromise: Promise<string | null> | null = null;

  refresh(): Promise<string | null> {
    const refreshToken = this.storage.refreshToken();
    if (!refreshToken) {
      return Promise.resolve(null);
    }
    if (!this.refreshPromise) {
      this.refreshPromise = this.performRefresh(refreshToken).finally(() => {
        this.refreshPromise = null;
      });
    }
    return this.refreshPromise;
  }

  private async performRefresh(refreshToken: string): Promise<string | null> {
    const request = new HttpRequest(
      'POST',
      `${environment.apiBaseUrl}/api/auth/refresh`,
      { refreshToken },
      { headers: new HttpHeaders({ 'Content-Type': 'application/json' }) },
    );

    try {
      const response = await firstValueFrom(
        this.backend.handle(request).pipe(
          filter((event): event is HttpResponse<AuthResponse> => event instanceof HttpResponse),
          take(1),
        ),
      );
      const body = response.body;
      if (!body?.token) {
        this.storage.clear();
        return null;
      }
      this.storage.setTokens(body.token, String(body.userId), body.refreshToken, body.role);
      return body.token;
    } catch (error) {
      console.error('Token refresh failed', error);
      this.storage.clear();
      return null;
    }
  }
}
