import { environment } from '../../../environments/environment';

// Бэкенд хранит пути вида /uploads/..., добавляем origin API
export function assetUrl(path: string | null | undefined): string {
  if (!path) {
    return '';
  }
  if (/^(https?:|data:|blob:)/.test(path)) {
    return path;
  }
  return `${environment.apiBaseUrl}${path}`;
}
