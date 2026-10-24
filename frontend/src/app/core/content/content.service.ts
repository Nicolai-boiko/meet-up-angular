import { Injectable, inject, signal } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  ContentCreatePayload,
  ContentFile,
  ContentItem,
  ContentUpdatePayload,
  PaginatedResponse,
  Tag,
} from '../models';

@Injectable({ providedIn: 'root' })
export class ContentService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `${environment.apiBaseUrl}/api`;
  private readonly pageSize = 20;

  private readonly itemsSignal = signal<ContentItem[]>([]);
  private readonly currentSignal = signal<ContentItem | null>(null);
  private readonly loadingSignal = signal(false);
  private readonly loadingMoreSignal = signal(false);
  private readonly pageSignal = signal(1);
  private readonly totalSignal = signal(0);
  private readonly hasMoreSignal = signal(false);
  private readonly sortBySignal = signal('createdAt');
  private readonly sortOrderSignal = signal('desc');

  readonly items = this.itemsSignal.asReadonly();
  readonly current = this.currentSignal.asReadonly();
  readonly loading = this.loadingSignal.asReadonly();
  readonly loadingMore = this.loadingMoreSignal.asReadonly();
  readonly page = this.pageSignal.asReadonly();
  readonly total = this.totalSignal.asReadonly();
  readonly hasMore = this.hasMoreSignal.asReadonly();
  readonly sortBy = this.sortBySignal.asReadonly();
  readonly sortOrder = this.sortOrderSignal.asReadonly();

  setCurrent(item: ContentItem | null): void {
    this.currentSignal.set(item);
  }

  setSort(sortBy: string, sortOrder: string): void {
    this.sortBySignal.set(sortBy);
    this.sortOrderSignal.set(sortOrder);
  }

  async fetchPage(pageNumber: number, tagId?: number, favorites = false): Promise<void> {
    this.loadingSignal.set(true);
    try {
      const data = await firstValueFrom(
        this.http.get<PaginatedResponse<ContentItem>>(`${this.apiUrl}/content`, {
          params: this.buildParams(pageNumber, tagId, favorites),
        }),
      );
      this.itemsSignal.set(data.items);
      this.pageSignal.set(data.page);
      this.totalSignal.set(data.total);
      this.hasMoreSignal.set(data.page < data.totalPages);
    } catch (error) {
      console.error('fetchPage error:', error);
    } finally {
      this.loadingSignal.set(false);
    }
  }

  async fetchMore(tagId?: number): Promise<void> {
    if (this.loadingMoreSignal() || !this.hasMoreSignal()) {
      return;
    }
    this.loadingMoreSignal.set(true);
    try {
      const data = await firstValueFrom(
        this.http.get<PaginatedResponse<ContentItem>>(`${this.apiUrl}/content`, {
          params: this.buildParams(this.pageSignal() + 1, tagId, false),
        }),
      );
      this.itemsSignal.update((items) => [...items, ...data.items]);
      this.pageSignal.set(data.page);
      this.totalSignal.set(data.total);
      this.hasMoreSignal.set(data.page < data.totalPages);
    } catch (error) {
      console.error('fetchMore error:', error);
    } finally {
      this.loadingMoreSignal.set(false);
    }
  }

  async fetchById(id: number): Promise<void> {
    try {
      const item = await firstValueFrom(this.http.get<ContentItem>(`${this.apiUrl}/content/${id}`));
      this.currentSignal.set(item);
      this.itemsSignal.update((items) =>
        items.map((existing) => (existing.id === id ? item : existing)),
      );
    } catch (error) {
      console.error('fetchById error:', error);
    }
  }

  async create(payload: ContentCreatePayload): Promise<ContentItem> {
    let item: ContentItem;

    if (payload.file || payload.files?.length) {
      item = await firstValueFrom(
        this.http.post<ContentItem>(`${this.apiUrl}/content`, this.toFormData(payload)),
      );
    } else {
      item = await firstValueFrom(
        this.http.post<ContentItem>(`${this.apiUrl}/content`, {
          title: payload.title,
          type: payload.type,
          body: payload.body,
          mediaUrl: payload.mediaUrl,
          tagIds: payload.tagIds,
        }),
      );
    }

    this.itemsSignal.update((items) => [item, ...items]);
    this.totalSignal.update((total) => total + 1);
    this.currentSignal.set(item);
    return item;
  }

  async update(id: number, payload: ContentUpdatePayload): Promise<ContentItem> {
    let item: ContentItem;

    if (payload.file || payload.files?.length) {
      item = await firstValueFrom(
        this.http.put<ContentItem>(`${this.apiUrl}/content/${id}`, this.toFormData(payload)),
      );
    } else {
      item = await firstValueFrom(
        this.http.put<ContentItem>(`${this.apiUrl}/content/${id}`, {
          title: payload.title,
          type: payload.type,
          body: payload.body,
          mediaUrl: payload.mediaUrl,
          tagIds: payload.tagIds,
        }),
      );
    }

    this.currentSignal.set(item);
    this.itemsSignal.update((items) =>
      items.map((existing) => (existing.id === id ? item : existing)),
    );
    return item;
  }

  async toggleFavorite(id: number): Promise<boolean> {
    const response = await firstValueFrom(
      this.http.post<{ favorited: boolean }>(`${this.apiUrl}/content/${id}/favorite`, {}),
    );
    const favorited = response.favorited;

    this.itemsSignal.update((items) =>
      items.map((item) => (item.id === id ? { ...item, isFavorited: favorited } : item)),
    );
    this.currentSignal.update((item) =>
      item && item.id === id ? { ...item, isFavorited: favorited } : item,
    );
    return favorited;
  }

  async uploadFile(contentId: number, file: File): Promise<ContentFile> {
    const formData = new FormData();
    formData.append('file', file);
    const uploaded = await firstValueFrom(
      this.http.post<ContentFile>(`${this.apiUrl}/content/${contentId}/files`, formData),
    );

    const addFile = (item: ContentItem | null): ContentItem | null =>
      item && item.id === contentId
        ? { ...item, files: [...(item.files ?? []), uploaded] }
        : item;

    this.itemsSignal.update((items) => items.map(addFile).filter((item) => item !== null));
    this.currentSignal.update(addFile);
    return uploaded;
  }

  async deleteFile(contentId: number, fileId: number): Promise<void> {
    await firstValueFrom(
      this.http.delete(`${this.apiUrl}/content/${contentId}/files/${fileId}`),
    );

    const removeFile = (item: ContentItem | null): ContentItem | null =>
      item && item.id === contentId
        ? { ...item, files: item.files?.filter((file) => file.id !== fileId) }
        : item;

    this.itemsSignal.update((items) => items.map(removeFile).filter((item) => item !== null));
    this.currentSignal.update(removeFile);
  }

  async remove(id: number): Promise<void> {
    await firstValueFrom(this.http.delete(`${this.apiUrl}/content/${id}`));
    this.itemsSignal.update((items) => items.filter((item) => item.id !== id));
    this.totalSignal.update((total) => Math.max(0, total - 1));
    this.currentSignal.update((item) => (item?.id === id ? null : item));
  }

  async getTags(): Promise<Tag[]> {
    return firstValueFrom(this.http.get<Tag[]>(`${this.apiUrl}/tags`));
  }

  async createTag(name: string): Promise<Tag> {
    return firstValueFrom(this.http.post<Tag>(`${this.apiUrl}/tags`, { name }));
  }

  private buildParams(pageNumber: number, tagId?: number, favorites = false): HttpParams {
    let params = new HttpParams()
      .set('page', String(pageNumber))
      .set('limit', String(this.pageSize))
      .set('sortBy', this.sortBySignal())
      .set('sortOrder', this.sortOrderSignal());

    if (tagId) {
      params = params.set('tagId', String(tagId));
    }
    if (favorites) {
      params = params.set('favorites', '1');
    }
    return params;
  }

  private toFormData(payload: ContentCreatePayload | ContentUpdatePayload): FormData {
    const formData = new FormData();

    if (payload.title !== undefined) {
      formData.append('title', payload.title);
    }
    if (payload.type !== undefined) {
      formData.append('type', payload.type);
    }
    if (payload.body !== undefined) {
      formData.append('body', payload.body ?? '');
    }
    if (payload.mediaUrl !== undefined) {
      formData.append('mediaUrl', payload.mediaUrl ?? '');
    }
    payload.tagIds?.forEach((id) => formData.append('tagIds', String(id)));
    if (payload.file) {
      formData.append('file', payload.file);
    }
    payload.files?.forEach((file) => formData.append('files', file));

    return formData;
  }
}
