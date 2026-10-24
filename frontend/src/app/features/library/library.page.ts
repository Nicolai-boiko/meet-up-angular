import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectChange, MatSelectModule } from '@angular/material/select';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { AuthService } from '../../core/auth/auth.service';
import { ContentService } from '../../core/content/content.service';
import { LanguageService } from '../../core/i18n/language.service';
import { ContentItem, Tag } from '../../core/models';
import { ConfirmService } from '../../shared/confirm-dialog/confirm.service';
import { assetUrl } from '../../core/utils/asset-url';
import { getErrorMessage } from '../../core/utils/error.util';

@Component({
  selector: 'app-library',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    TranslocoPipe,
  ],
  templateUrl: './library.page.html',
  styleUrl: './library.page.scss',
})
export class LibraryPage implements OnInit {
  readonly auth = inject(AuthService);
  readonly content = inject(ContentService);
  private readonly confirm = inject(ConfirmService);
  private readonly fb = inject(FormBuilder);
  private readonly transloco = inject(TranslocoService);
  private readonly language = inject(LanguageService);

  readonly search = signal('');
  readonly showFavorites = signal(false);
  readonly sortKey = signal('createdAt_desc');
  readonly isEditing = signal(false);
  readonly editingId = signal<number | null>(null);
  readonly saving = signal(false);
  readonly saveError = signal<string | null>(null);

  readonly allTags = signal<Tag[]>([]);
  readonly selectedTagIds = signal<number[]>([]);
  readonly formTagIds = signal<number[]>([]);
  readonly newTagName = signal('');

  readonly selectedFile = signal<File | null>(null);
  readonly pendingCreateFiles = signal<File[]>([]);
  readonly pendingEditFiles = signal<File[]>([]);
  readonly assetUrl = assetUrl;

  readonly form = this.fb.nonNullable.group({
    title: ['', [Validators.required]],
    type: ['text'],
    mediaUrl: [''],
    body: [''],
  });

  readonly filteredItems = computed(() => {
    const query = this.search().trim().toLowerCase();
    const items = this.content.items();
    if (!query) {
      return items;
    }
    return items.filter(
      (item) =>
        item.title.toLowerCase().includes(query) ||
        (item.body ? item.body.toLowerCase().includes(query) : false),
    );
  });

  readonly remainingCount = computed(() =>
    Math.max(0, this.content.total() - this.content.items().length),
  );

  readonly embedUrl = computed(() => {
    const url = this.content.current()?.mediaUrl;
    if (!url) {
      return '';
    }
    const youtube = url.match(
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]+)/,
    );
    return youtube ? `https://www.youtube.com/embed/${youtube[1]}` : url;
  });

  ngOnInit(): void {
    void this.fetchFiltered();
    void this.loadTags();
  }

  selectItem(item: ContentItem): void {
    this.isEditing.set(false);
    this.editingId.set(null);
    this.content.setCurrent(item);
  }

  onSearchInput(event: Event): void {
    this.search.set((event.target as HTMLInputElement).value);
  }

  toggleFavorites(): void {
    this.showFavorites.update((value) => !value);
    void this.fetchFiltered();
  }

  onSortChange(event: MatSelectChange): void {
    const value = String(event.value);
    this.sortKey.set(value);
    const [sortBy = 'createdAt', sortOrder = 'desc'] = value.split('_');
    this.content.setSort(sortBy, sortOrder);
    void this.fetchFiltered();
  }

  toggleTagFilter(tagId: number): void {
    this.selectedTagIds.update((ids) => (ids.includes(tagId) ? [] : [tagId]));
    void this.fetchFiltered();
  }

  toggleFormTag(tagId: number): void {
    this.formTagIds.update((ids) =>
      ids.includes(tagId) ? ids.filter((id) => id !== tagId) : [...ids, tagId],
    );
  }

  onNewTagInput(event: Event): void {
    this.newTagName.set((event.target as HTMLInputElement).value);
  }

  async createAndAddTag(): Promise<void> {
    const name = this.newTagName().trim();
    if (!name) {
      return;
    }
    try {
      const tag = await this.content.createTag(name);
      this.allTags.update((tags) => [...tags, tag]);
      this.formTagIds.update((ids) => [...ids, tag.id]);
      this.newTagName.set('');
    } catch (error) {
      console.error('createAndAddTag error:', error);
    }
  }

  async handleToggleFavorite(item: ContentItem): Promise<void> {
    try {
      await this.content.toggleFavorite(item.id);
    } catch (error) {
      console.error('toggleFavorite error:', error);
    }
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.selectedFile.set(input.files?.[0] ?? null);
  }

  onPendingCreateSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    this.pendingCreateFiles.update((current) => [...current, ...files]);
    input.value = '';
  }

  onPendingEditSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    this.pendingEditFiles.update((current) => [...current, ...files]);
    input.value = '';
  }

  removePending(target: 'create' | 'edit', index: number): void {
    if (target === 'create') {
      this.pendingCreateFiles.update((files) => files.filter((_, i) => i !== index));
    } else {
      this.pendingEditFiles.update((files) => files.filter((_, i) => i !== index));
    }
  }

  openCreate(): void {
    this.editingId.set(null);
    this.form.reset({ title: '', type: 'text', mediaUrl: '', body: '' });
    this.selectedFile.set(null);
    this.pendingCreateFiles.set([]);
    this.pendingEditFiles.set([]);
    this.formTagIds.set([]);
    this.saveError.set(null);
    this.isEditing.set(true);
  }

  openEdit(): void {
    const item = this.content.current();
    if (!item) {
      return;
    }
    this.editingId.set(item.id);
    this.form.setValue({
      title: item.title,
      type: item.type,
      mediaUrl: item.mediaUrl ?? '',
      body: item.body ?? '',
    });
    this.selectedFile.set(null);
    this.pendingEditFiles.set([]);
    this.formTagIds.set((item.tags ?? []).map((tag) => tag.id));
    this.saveError.set(null);
    this.isEditing.set(true);
  }

  cancelEdit(): void {
    this.isEditing.set(false);
    this.editingId.set(null);
    this.pendingCreateFiles.set([]);
    this.pendingEditFiles.set([]);
    if (!this.content.current() && this.content.items().length > 0) {
      this.content.setCurrent(this.content.items()[0] ?? null);
    }
  }

  async handleSave(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid) {
      return;
    }

    this.saving.set(true);
    this.saveError.set(null);
    const value = this.form.getRawValue();
    const payload = {
      title: value.title,
      type: value.type,
      body: value.body || null,
      mediaUrl: value.mediaUrl || null,
      tagIds: this.formTagIds(),
      file: this.selectedFile(),
    };

    try {
      const editingId = this.editingId();
      if (editingId) {
        await this.content.update(editingId, {
          ...payload,
          files: this.pendingEditFiles().length ? this.pendingEditFiles() : undefined,
        });
        this.pendingEditFiles.set([]);
      } else {
        await this.content.create({
          ...payload,
          files: this.pendingCreateFiles().length ? this.pendingCreateFiles() : undefined,
        });
        this.pendingCreateFiles.set([]);
      }
      this.isEditing.set(false);
      this.editingId.set(null);
    } catch (error) {
      this.saveError.set(getErrorMessage(error, this.t('library.saveError')));
    } finally {
      this.saving.set(false);
    }
  }

  async handleDelete(): Promise<void> {
    const item = this.content.current();
    if (!item) {
      return;
    }
    const ok = await this.confirm.confirm(
      this.t('library.deleteMaterial'),
      this.transloco.translate('library.deleteConfirm', { title: item.title }),
      'danger',
    );
    if (!ok) {
      return;
    }
    try {
      await this.content.remove(item.id);
    } catch (error) {
      console.error('Delete error:', error);
    }
  }

  async handleDeleteFile(fileId: number): Promise<void> {
    const contentId = this.editingId() ?? this.content.current()?.id;
    if (!contentId) {
      return;
    }
    try {
      await this.content.deleteFile(contentId, fileId);
    } catch (error) {
      console.error('handleDeleteFile error:', error);
    }
  }

  loadMore(): void {
    void this.content.fetchMore(this.selectedTagIds()[0]);
  }

  typeIcon(type: string): string {
    if (type === 'video') {
      return '🎬';
    }
    if (type === 'link') {
      return '🔗';
    }
    if (type === 'file') {
      return '📁';
    }
    return '📄';
  }

  formatDate(value: string): string {
    const locale = this.language.lang() === 'en' ? 'en-US' : 'ru-RU';
    return new Date(value).toLocaleDateString(locale, {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  }

  formatFileSize(bytes: number | null): string {
    if (bytes == null) {
      return '';
    }
    const units =
      this.language.lang() === 'en'
        ? ['B', 'KB', 'MB', 'GB']
        : ['Б', 'КБ', 'МБ', 'ГБ'];
    if (bytes < 1024) {
      return `${bytes} ${units[0]}`;
    }
    if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)} ${units[1]}`;
    }
    return `${(bytes / (1024 * 1024)).toFixed(1)} ${units[2]}`;
  }

  private async fetchFiltered(): Promise<void> {
    await this.content.fetchPage(1, this.selectedTagIds()[0], this.showFavorites());
  }

  private async loadTags(): Promise<void> {
    try {
      this.allTags.set(await this.content.getTags());
    } catch (error) {
      console.error('loadTags error:', error);
    }
  }

  private t(key: string): string {
    return this.transloco.translate(key);
  }
}
