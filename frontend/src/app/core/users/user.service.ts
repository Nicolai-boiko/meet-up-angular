import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AppRole, PaginatedResponse, UserQueryParams, UserSummary } from '../models';

@Injectable({ providedIn: 'root' })
export class UserService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `${environment.apiBaseUrl}/api`;

  async listUsers(
    params: Partial<UserQueryParams> & { limit?: number } = {},
  ): Promise<PaginatedResponse<UserSummary>> {
    let httpParams = new HttpParams();
    if (params.page !== undefined) {
      httpParams = httpParams.set('page', String(params.page));
    }
    if (params.limit !== undefined) {
      httpParams = httpParams.set('limit', String(params.limit));
    }
    if (params.sortBy) {
      httpParams = httpParams.set('sortBy', params.sortBy);
    }
    if (params.sortOrder) {
      httpParams = httpParams.set('sortOrder', params.sortOrder);
    }
    if (params.search) {
      httpParams = httpParams.set('search', params.search);
    }

    return firstValueFrom(
      this.http.get<PaginatedResponse<UserSummary>>(`${this.apiUrl}/users`, {
        params: httpParams,
      }),
    );
  }

  async updateRole(id: number, role: AppRole): Promise<UserSummary> {
    const response = await firstValueFrom(
      this.http.put<{ message: string; user: UserSummary }>(
        `${this.apiUrl}/users/${id}/role`,
        { role },
      ),
    );
    return response.user;
  }
}
