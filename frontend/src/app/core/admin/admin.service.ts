import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AdminStats, ContentItem, PaginatedResponse } from '../models';

@Injectable({ providedIn: 'root' })
export class AdminService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `${environment.apiBaseUrl}/api`;

  getStats(): Promise<AdminStats> {
    return firstValueFrom(this.http.get<AdminStats>(`${this.apiUrl}/admin/stats`));
  }

  async getContent(limit = 100): Promise<ContentItem[]> {
    const response = await firstValueFrom(
      this.http.get<PaginatedResponse<ContentItem>>(`${this.apiUrl}/content`, {
        params: new HttpParams().set('limit', String(limit)),
      }),
    );
    return response.items;
  }

  async bulkDeleteContent(ids: number[]): Promise<number> {
    const response = await firstValueFrom(
      this.http.post<{ deleted: number }>(`${this.apiUrl}/content/bulk-delete`, { ids }),
    );
    return response.deleted;
  }

  async bulkDeleteRooms(ids: number[]): Promise<number> {
    const response = await firstValueFrom(
      this.http.post<{ deleted: number }>(`${this.apiUrl}/rooms/bulk-delete`, { ids }),
    );
    return response.deleted;
  }
}
