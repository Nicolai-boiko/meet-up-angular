import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { ChartData, ChartOptions } from 'chart.js';
import { AuthService } from '../../core/auth/auth.service';
import { AdminService } from '../../core/admin/admin.service';
import { LanguageService } from '../../core/i18n/language.service';
import { ThemeService } from '../../core/theme/theme.service';
import { AdminStats, ContentItem, RoomSummary, UserSummary } from '../../core/models';
import { RoomService } from '../../core/rooms/room.service';
import { UserService } from '../../core/users/user.service';
import { ConfirmService } from '../../shared/confirm-dialog/confirm.service';
import { ChartComponent } from '../../shared/chart/chart.component';
import { assetUrl } from '../../core/utils/asset-url';

type AdminTab = 'dashboard' | 'users' | 'content' | 'rooms';

@Component({
  selector: 'app-admin',
  imports: [MatButtonModule, TranslocoPipe, ChartComponent],
  templateUrl: './admin.page.html',
  styleUrl: './admin.page.scss',
})
export class AdminPage implements OnInit {
  readonly auth = inject(AuthService);
  private readonly admin = inject(AdminService);
  private readonly usersService = inject(UserService);
  private readonly roomsService = inject(RoomService);
  private readonly confirm = inject(ConfirmService);
  private readonly theme = inject(ThemeService);
  private readonly language = inject(LanguageService);
  private readonly transloco = inject(TranslocoService);
  private readonly router = inject(Router);

  readonly activeTab = signal<AdminTab>('dashboard');

  readonly tabs = [
    { key: 'dashboard', labelKey: 'admin.tabDashboard' },
    { key: 'users', labelKey: 'admin.tabUsers' },
    { key: 'content', labelKey: 'admin.tabContent' },
    { key: 'rooms', labelKey: 'admin.tabRooms' },
  ] as const;

  readonly dashLoading = signal(false);
  readonly stats = signal<AdminStats | null>(null);

  readonly userItems = signal<UserSummary[]>([]);
  readonly usersLoading = signal(false);
  readonly usersPage = signal(1);
  readonly usersTotal = signal(0);
  readonly usersHasMore = signal(false);
  readonly searchUsers = signal('');
  readonly userSortBy = signal('name');
  readonly userSortOrder = signal<'asc' | 'desc'>('asc');
  private readonly usersPageSize = 20;

  readonly contentItems = signal<ContentItem[]>([]);
  readonly contentLoading = signal(false);
  readonly selectedContentIds = signal<number[]>([]);

  readonly roomItems = signal<RoomSummary[]>([]);
  readonly roomsLoading = signal(false);
  readonly selectedRoomIds = signal<number[]>([]);

  readonly lineOptions: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
  };

  readonly barOptions: ChartOptions<'bar'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
  };

  readonly doughnutOptions: ChartOptions<'doughnut'> = {
    responsive: true,
    maintainAspectRatio: false,
  };

  readonly usersChartData = computed<ChartData<'line'> | null>(() => {
    this.theme.theme();
    const stats = this.stats();
    if (!stats?.usersByDay.length) {
      return null;
    }
    const palette = this.palette();
    return {
      labels: stats.usersByDay.map((entry) =>
        new Date(entry.date).toLocaleDateString(this.dateLocale(), {
          day: 'numeric',
          month: 'short',
        }),
      ),
      datasets: [
        {
          label: this.t('admin.chartUsers'),
          data: stats.usersByDay.map((entry) => entry.count),
          borderColor: palette[0],
          backgroundColor: this.withAlpha(palette[0] ?? '', 0.2),
          fill: true,
          tension: 0.3,
        },
      ],
    };
  });

  readonly authorsChartData = computed<ChartData<'bar'> | null>(() => {
    this.theme.theme();
    const stats = this.stats();
    if (!stats?.topAuthors.length) {
      return null;
    }
    const palette = this.palette();
    return {
      labels: stats.topAuthors.map((author) => author.name),
      datasets: [
        {
          label: this.t('admin.chartMaterials'),
          data: stats.topAuthors.map((author) => author.count),
          backgroundColor: stats.topAuthors.map(
            (_, index) => palette[index % palette.length] ?? palette[0] ?? '',
          ),
        },
      ],
    };
  });

  readonly typeChartData = computed<ChartData<'doughnut'> | null>(() => {
    this.theme.theme();
    const stats = this.stats();
    if (!stats?.contentByType.length) {
      return null;
    }
    const palette = this.palette();
    return {
      labels: stats.contentByType.map((entry) => this.typeLabel(entry.type)),
      datasets: [
        {
          label: this.t('admin.chartMaterials'),
          data: stats.contentByType.map((entry) => entry.count),
          backgroundColor: palette,
          borderWidth: 1,
        },
      ],
    };
  });

  readonly tagsChartData = computed<ChartData<'doughnut'> | null>(() => {
    this.theme.theme();
    const stats = this.stats();
    if (!stats?.contentByTag.length) {
      return null;
    }
    const palette = this.palette();
    return {
      labels: stats.contentByTag.map((entry) => entry.tagName),
      datasets: [
        {
          label: this.t('admin.chartMaterials'),
          data: stats.contentByTag.map((entry) => entry.count),
          backgroundColor: palette,
          borderWidth: 1,
        },
      ],
    };
  });

  readonly assetUrl = assetUrl;

  ngOnInit(): void {
    if (!this.auth.isAdmin()) {
      void this.router.navigate(['/home']);
      return;
    }
    void this.loadDashboard();
  }

  switchTab(tab: AdminTab): void {
    this.activeTab.set(tab);
    if (tab === 'dashboard') {
      void this.loadDashboard();
    } else if (tab === 'users') {
      void this.loadUsers(1);
    } else if (tab === 'content') {
      void this.loadContent();
    } else {
      void this.loadRooms();
    }
  }

  async loadDashboard(): Promise<void> {
    if (this.stats() && !this.dashLoading()) {
      return;
    }
    this.dashLoading.set(true);
    try {
      this.stats.set(await this.admin.getStats());
    } catch (error) {
      console.error('loadDashboard error:', error);
    } finally {
      this.dashLoading.set(false);
    }
  }

  onSearchUsers(event: Event): void {
    this.searchUsers.set((event.target as HTMLInputElement).value);
    void this.loadUsers(1);
  }

  toggleUserSort(field: string): void {
    if (this.userSortBy() === field) {
      this.userSortOrder.update((order) => (order === 'asc' ? 'desc' : 'asc'));
    } else {
      this.userSortBy.set(field);
      this.userSortOrder.set('asc');
    }
    void this.loadUsers(1);
  }

  async loadMoreUsers(): Promise<void> {
    if (!this.usersHasMore() || this.usersLoading()) {
      return;
    }
    await this.loadUsers(this.usersPage() + 1, true);
  }

  async promoteUser(user: UserSummary): Promise<void> {
    const ok = await this.confirm.confirm(
      this.t('admin.promoteConfirm'),
      this.transloco.translate('admin.promoteDesc', { name: this.userDisplayName(user) }),
    );
    if (!ok) {
      return;
    }
    await this.usersService.updateRole(user.id, 'ADMIN');
    await this.loadUsers(1);
  }

  async demoteUser(user: UserSummary): Promise<void> {
    const ok = await this.confirm.confirm(
      this.t('admin.demoteConfirm'),
      this.transloco.translate('admin.demoteDesc', { name: this.userDisplayName(user) }),
    );
    if (!ok) {
      return;
    }
    await this.usersService.updateRole(user.id, 'USER');
    await this.loadUsers(1);
  }

  toggleContentSelect(id: number): void {
    this.selectedContentIds.update((ids) =>
      ids.includes(id) ? ids.filter((existing) => existing !== id) : [...ids, id],
    );
  }

  toggleAllContent(): void {
    const items = this.contentItems();
    this.selectedContentIds.set(
      this.selectedContentIds().length === items.length ? [] : items.map((item) => item.id),
    );
  }

  async deleteSelectedContent(): Promise<void> {
    const ids = this.selectedContentIds();
    if (!ids.length) {
      return;
    }
    const ok = await this.confirm.confirm(
      this.t('admin.deleteContentConfirm'),
      this.transloco.translate('admin.deleteContentDesc', { count: String(ids.length) }),
      'danger',
    );
    if (!ok) {
      return;
    }
    await this.admin.bulkDeleteContent(ids);
    this.contentItems.update((items) => items.filter((item) => !ids.includes(item.id)));
    this.selectedContentIds.set([]);
  }

  toggleRoomSelect(id: number): void {
    this.selectedRoomIds.update((ids) =>
      ids.includes(id) ? ids.filter((existing) => existing !== id) : [...ids, id],
    );
  }

  toggleAllRooms(): void {
    const rooms = this.roomItems();
    this.selectedRoomIds.set(
      this.selectedRoomIds().length === rooms.length ? [] : rooms.map((room) => room.id),
    );
  }

  async deleteSelectedRooms(): Promise<void> {
    const ids = this.selectedRoomIds();
    if (!ids.length) {
      return;
    }
    const ok = await this.confirm.confirm(
      this.t('admin.deleteRoomsConfirm'),
      this.transloco.translate('admin.deleteRoomsDesc', { count: String(ids.length) }),
      'danger',
    );
    if (!ok) {
      return;
    }
    await this.admin.bulkDeleteRooms(ids);
    this.roomItems.update((rooms) => rooms.filter((room) => !ids.includes(room.id)));
    this.selectedRoomIds.set([]);
  }

  userDisplayName(user: UserSummary): string {
    if (user.firstName && user.lastName) {
      return `${user.firstName} ${user.lastName}`;
    }
    if (user.firstName) {
      return user.firstName;
    }
    return user.name;
  }

  userInitials(user: UserSummary): string {
    const first = user.firstName?.charAt(0)?.toUpperCase() ?? '';
    const last = user.lastName?.charAt(0)?.toUpperCase() ?? '';
    return first || last ? `${first}${last}` : user.name.charAt(0).toUpperCase();
  }

  formatStorage(bytes: number): string {
    const units =
      this.language.lang() === 'en'
        ? ['B', 'KB', 'MB', 'GB']
        : ['Б', 'КБ', 'МБ', 'ГБ'];
    if (!bytes) {
      return `0 ${units[0]}`;
    }
    if (bytes < 1024) {
      return `${bytes} ${units[0]}`;
    }
    if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)} ${units[1]}`;
    }
    if (bytes < 1024 * 1024 * 1024) {
      return `${(bytes / (1024 * 1024)).toFixed(1)} ${units[2]}`;
    }
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} ${units[3]}`;
  }

  formatDate(value: string): string {
    return new Date(value).toLocaleDateString(this.dateLocale(), {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  }

  private async loadUsers(page: number, append = false): Promise<void> {
    this.usersLoading.set(true);
    try {
      const response = await this.usersService.listUsers({
        page,
        limit: this.usersPageSize,
        sortBy: this.userSortBy(),
        sortOrder: this.userSortOrder(),
        search: this.searchUsers() || undefined,
      });
      this.userItems.update((items) => (append ? [...items, ...response.items] : response.items));
      this.usersPage.set(response.page);
      this.usersTotal.set(response.total);
      this.usersHasMore.set(response.page < response.totalPages);
    } catch (error) {
      console.error('loadUsers error:', error);
    } finally {
      this.usersLoading.set(false);
    }
  }

  private async loadContent(): Promise<void> {
    this.contentLoading.set(true);
    try {
      this.contentItems.set(await this.admin.getContent(100));
      this.selectedContentIds.set([]);
    } catch (error) {
      console.error('loadContent error:', error);
    } finally {
      this.contentLoading.set(false);
    }
  }

  private async loadRooms(): Promise<void> {
    this.roomsLoading.set(true);
    try {
      this.roomItems.set(await this.roomsService.listRooms());
      this.selectedRoomIds.set([]);
    } catch (error) {
      console.error('loadRooms error:', error);
    } finally {
      this.roomsLoading.set(false);
    }
  }

  private typeLabel(type: string): string {
    const key = `library.type${type.charAt(0).toUpperCase()}${type.slice(1)}`;
    const translated = this.t(key);
    return translated === key ? type : translated;
  }

  private palette(): string[] {
    return [
      this.resolveColor('--mat-sys-primary', '#005cbb'),
      this.resolveColor('--mat-sys-tertiary', '#00696d'),
      this.resolveColor('--mat-sys-secondary', '#565e71'),
      this.resolveColor('--mat-sys-error', '#ba1a1a'),
      this.resolveColor('--mat-sys-outline', '#73777f'),
      this.resolveColor('--mat-sys-primary-fixed-dim', '#93c5fd'),
    ];
  }

  // Canvas не понимает light-dark(...) — резолвим токен через временный элемент
  private resolveColor(name: string, fallback: string): string {
    const probe = document.createElement('span');
    probe.style.color = `var(${name})`;
    probe.style.display = 'none';
    document.body.appendChild(probe);
    const resolved = getComputedStyle(probe).color;
    probe.remove();
    return resolved && resolved !== 'rgba(0, 0, 0, 0)' ? resolved : fallback;
  }

  private withAlpha(color: string, alpha: number): string {
    if (/^#[0-9a-f]{6}$/i.test(color)) {
      const hex = Math.round(alpha * 255)
        .toString(16)
        .padStart(2, '0');
      return `${color}${hex}`;
    }
    if (color.startsWith('rgb(')) {
      return color.replace('rgb(', 'rgba(').replace(')', `, ${alpha})`);
    }
    return color;
  }

  private dateLocale(): string {
    return this.language.lang() === 'en' ? 'en-US' : 'ru-RU';
  }

  private t(key: string): string {
    return this.transloco.translate(key);
  }
}
