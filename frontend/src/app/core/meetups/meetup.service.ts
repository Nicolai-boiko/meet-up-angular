import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  Meetup,
  MeetupCreatePayload,
  MeetupQueryParams,
  MeetupUpdatePayload,
  MeetingParticipantStatus,
  PaginatedResponse,
} from '../models';

@Injectable({ providedIn: 'root' })
export class MeetupService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `${environment.apiBaseUrl}/api`;
  private readonly pageSize = 20;

  private readonly itemsSignal = signal<Meetup[]>([]);
  private readonly loadingSignal = signal(false);
  private readonly selectedUserIdsSignal = signal<number[]>([]);
  private readonly pageSignal = signal(1);
  private readonly totalSignal = signal(0);
  private readonly hasMoreSignal = signal(false);

  readonly items = this.itemsSignal.asReadonly();
  readonly loading = this.loadingSignal.asReadonly();
  readonly selectedUserIds = this.selectedUserIdsSignal.asReadonly();
  readonly page = this.pageSignal.asReadonly();
  readonly total = this.totalSignal.asReadonly();
  readonly hasMore = this.hasMoreSignal.asReadonly();

  readonly upcomingMeetups = computed(() =>
    this.itemsSignal()
      .filter((meetup) => new Date(meetup.startTime) > new Date())
      .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()),
  );

  readonly pastMeetups = computed(() =>
    this.itemsSignal()
      .filter((meetup) => new Date(meetup.endTime) <= new Date())
      .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime()),
  );

  readonly calendarItems = computed(() =>
    this.itemsSignal().map((meetup) => ({
      ...meetup,
      participants: meetup.participants?.filter((p) => p.status !== 'DECLINED') ?? [],
    })),
  );

  getMeetupById(id: number): Meetup | null {
    return this.itemsSignal().find((meetup) => meetup.id === id) ?? null;
  }

  getParticipantStatus(meetup: Meetup, userId: number): MeetingParticipantStatus | null {
    return meetup.participants?.find((p) => p.id === userId)?.status ?? null;
  }

  isParticipant(meetup: Meetup, userId: number): boolean {
    return this.getParticipantStatus(meetup, userId) === 'ACCEPTED';
  }

  isInvited(meetup: Meetup, userId: number): boolean {
    return this.getParticipantStatus(meetup, userId) === 'INVITED';
  }

  isDeclined(meetup: Meetup, userId: number): boolean {
    return this.getParticipantStatus(meetup, userId) === 'DECLINED';
  }

  isHost(meetup: Meetup, userId: number): boolean {
    return meetup.hostId === userId;
  }

  setSelectedUsers(ids: number[]): void {
    this.selectedUserIdsSignal.set(ids);
  }

  async fetchMeetups(userIds?: number[]): Promise<void> {
    this.loadingSignal.set(true);
    try {
      const ids = userIds ?? this.selectedUserIdsSignal();
      const data = await firstValueFrom(
        this.http.get<PaginatedResponse<Meetup>>(`${this.apiUrl}/meetups`, {
          params: this.buildParams({ page: 1, limit: this.pageSize }, ids),
        }),
      );
      this.applyPage(data);
    } catch (error) {
      console.error('Failed to fetch meetups', error);
    } finally {
      this.loadingSignal.set(false);
    }
  }

  async fetchAllForCalendar(userIds?: number[]): Promise<void> {
    this.loadingSignal.set(true);
    try {
      const ids = userIds ?? this.selectedUserIdsSignal();
      const data = await firstValueFrom(
        this.http.get<PaginatedResponse<Meetup>>(`${this.apiUrl}/meetups`, {
          params: this.buildParams({ page: 1, limit: 200 }, ids),
        }),
      );
      this.itemsSignal.set(data.items);
      this.totalSignal.set(data.total);
      this.hasMoreSignal.set(false);
    } catch (error) {
      console.error('Failed to fetch meetups for calendar', error);
    } finally {
      this.loadingSignal.set(false);
    }
  }

  async fetchMore(): Promise<void> {
    if (!this.hasMoreSignal()) {
      return;
    }
    try {
      const data = await firstValueFrom(
        this.http.get<PaginatedResponse<Meetup>>(`${this.apiUrl}/meetups`, {
          params: this.buildParams(
            { page: this.pageSignal() + 1, limit: this.pageSize },
            this.selectedUserIdsSignal(),
          ),
        }),
      );
      this.itemsSignal.update((items) => [...items, ...data.items]);
      this.pageSignal.set(data.page);
      this.totalSignal.set(data.total);
      this.hasMoreSignal.set(data.page < data.totalPages);
    } catch (error) {
      console.error('Failed to fetch more meetups', error);
    }
  }

  async createMeetup(payload: MeetupCreatePayload): Promise<Meetup> {
    const response = await firstValueFrom(
      this.http.post<{ message: string; data: Meetup }>(`${this.apiUrl}/meetups`, payload),
    );
    this.itemsSignal.update((items) => [response.data, ...items]);
    this.totalSignal.update((total) => total + 1);
    return response.data;
  }

  async updateMeetup(id: number, payload: MeetupUpdatePayload): Promise<Meetup> {
    const response = await firstValueFrom(
      this.http.put<{ message: string; data: Meetup }>(`${this.apiUrl}/meetups/${id}`, payload),
    );
    if (payload.scope && payload.scope !== 'this') {
      await this.fetchAllForCalendar();
    } else {
      this.replaceItem(response.data);
    }
    return response.data;
  }

  async deleteMeetup(id: number, scope?: MeetupUpdatePayload['scope']): Promise<void> {
    await firstValueFrom(
      this.http.delete(`${this.apiUrl}/meetups/${id}`, { body: { scope } }),
    );
    if (scope && scope !== 'this') {
      await this.fetchAllForCalendar();
    } else {
      this.itemsSignal.update((items) => items.filter((meetup) => meetup.id !== id));
      this.totalSignal.update((total) => Math.max(0, total - 1));
    }
  }

  async joinMeetup(id: number): Promise<Meetup> {
    const response = await firstValueFrom(
      this.http.post<{ message: string; data: Meetup }>(`${this.apiUrl}/meetups/${id}/join`, {}),
    );
    this.replaceItem(response.data);
    return response.data;
  }

  async declineMeetup(id: number): Promise<Meetup> {
    const response = await firstValueFrom(
      this.http.post<{ message: string; data: Meetup }>(
        `${this.apiUrl}/meetups/${id}/decline`,
        {},
      ),
    );
    this.replaceItem(response.data);
    return response.data;
  }

  private buildParams(params: MeetupQueryParams, ids: number[]): HttpParams {
    let httpParams = new HttpParams()
      .set('page', String(params.page))
      .set('limit', String(params.limit));
    if (ids.length > 0) {
      httpParams = httpParams.set('userIds', ids.join(','));
    }
    return httpParams;
  }

  private applyPage(data: PaginatedResponse<Meetup>): void {
    this.itemsSignal.set(data.items);
    this.pageSignal.set(data.page);
    this.totalSignal.set(data.total);
    this.hasMoreSignal.set(data.page < data.totalPages);
  }

  private replaceItem(updated: Meetup): void {
    this.itemsSignal.update((items) =>
      items.map((meetup) => (meetup.id === updated.id ? updated : meetup)),
    );
  }
}
