import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ChatMessage, CreateRoomPayload, Room, RoomSummary } from '../models';

@Injectable({ providedIn: 'root' })
export class RoomService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `${environment.apiBaseUrl}/api`;

  listRooms(): Promise<RoomSummary[]> {
    return firstValueFrom(this.http.get<RoomSummary[]>(`${this.apiUrl}/rooms`));
  }

  getRoom(slug: string, meetingId?: number): Promise<Room> {
    let params = new HttpParams();
    if (meetingId !== undefined) {
      params = params.set('meetingId', String(meetingId));
    }
    return firstValueFrom(this.http.get<Room>(`${this.apiUrl}/rooms/${slug}`, { params }));
  }

  verifyPassword(slug: string, password: string): Promise<{ ok: boolean }> {
    return firstValueFrom(
      this.http.post<{ ok: boolean }>(`${this.apiUrl}/rooms/${slug}/verify`, { password }),
    );
  }

  createRoom(payload: CreateRoomPayload): Promise<Room> {
    return firstValueFrom(this.http.post<Room>(`${this.apiUrl}/rooms`, payload));
  }

  setActive(id: number, isActive: boolean): Promise<Room> {
    return firstValueFrom(this.http.put<Room>(`${this.apiUrl}/rooms/${id}`, { isActive }));
  }

  deleteRoom(id: number): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`${this.apiUrl}/rooms/${id}`));
  }

  bulkDelete(ids: number[]): Promise<{ deleted: number }> {
    return firstValueFrom(
      this.http.post<{ deleted: number }>(`${this.apiUrl}/rooms/bulk-delete`, { ids }),
    );
  }

  getMessages(slug: string, limit = 50): Promise<ChatMessage[]> {
    return firstValueFrom(
      this.http.get<ChatMessage[]>(`${this.apiUrl}/rooms/${slug}/messages`, {
        params: new HttpParams().set('limit', String(limit)),
      }),
    );
  }
}
