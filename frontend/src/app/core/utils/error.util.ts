import { HttpErrorResponse } from '@angular/common/http';

export function getErrorMessage(error: unknown, fallback = 'Unknown error'): string {
  if (error instanceof HttpErrorResponse) {
    const body = error.error as { message?: string } | null;
    return body?.message ?? error.message ?? fallback;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return typeof error === 'string' ? error : fallback;
}
