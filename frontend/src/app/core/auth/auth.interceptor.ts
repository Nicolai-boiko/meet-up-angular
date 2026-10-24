import {
  HttpContextToken,
  HttpErrorResponse,
  HttpInterceptorFn,
} from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, from, switchMap, throwError } from 'rxjs';
import { TokenStorageService } from './token-storage.service';
import { TokenRefreshService } from './token-refresh.service';

const RETRIED_AFTER_REFRESH = new HttpContextToken<boolean>(() => false);

const AUTH_ENDPOINTS = [
  '/auth/login',
  '/auth/register',
  '/auth/refresh',
  '/auth/forgot-password',
  '/auth/reset-password',
];

export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const storage = inject(TokenStorageService);
  const tokenRefresh = inject(TokenRefreshService);
  const token = storage.token();

  const authorized = token
    ? request.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
    : request;

  return next(authorized).pipe(
    catchError((error: HttpErrorResponse) => {
      const isAuthEndpoint = AUTH_ENDPOINTS.some((path) => request.url.includes(path));
      if (
        error.status !== 401 ||
        isAuthEndpoint ||
        request.context.get(RETRIED_AFTER_REFRESH)
      ) {
        return throwError(() => error);
      }

      return from(tokenRefresh.refresh()).pipe(
        switchMap((newToken) => {
          if (!newToken) {
            return throwError(() => error);
          }
          return next(
            request.clone({
              setHeaders: { Authorization: `Bearer ${newToken}` },
              context: request.context.set(RETRIED_AFTER_REFRESH, true),
            }),
          );
        }),
      );
    }),
  );
};
