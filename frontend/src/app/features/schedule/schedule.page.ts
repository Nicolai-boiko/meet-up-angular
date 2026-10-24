import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatSelectChange, MatSelectModule } from '@angular/material/select';
import { TranslocoPipe } from '@jsverse/transloco';
import { AuthService } from '../../core/auth/auth.service';
import { LanguageService } from '../../core/i18n/language.service';
import { MeetupService } from '../../core/meetups/meetup.service';
import { Meetup, RoomSummary, UserSummary } from '../../core/models';
import { RoomService } from '../../core/rooms/room.service';
import { UserService } from '../../core/users/user.service';
import {
  MeetingDialogComponent,
  MeetingDialogData,
} from './meeting-dialog.component';

type MeetingStatus = 'host' | 'participant' | 'invited' | 'other';

interface CalendarDay {
  date: Date;
  dayNumber: number;
  isCurrentMonth: boolean;
  meetings: Meetup[];
}

@Component({
  selector: 'app-schedule',
  imports: [MatButtonModule, MatSelectModule, TranslocoPipe],
  templateUrl: './schedule.page.html',
  styleUrl: './schedule.page.scss',
})
export class SchedulePage implements OnInit {
  readonly meetups = inject(MeetupService);
  private readonly auth = inject(AuthService);
  private readonly usersService = inject(UserService);
  private readonly roomsService = inject(RoomService);
  private readonly language = inject(LanguageService);
  private readonly dialog = inject(MatDialog);

  readonly currentDate = signal(new Date());
  readonly selectedDay = signal<Date | null>(null);
  readonly search = signal('');
  readonly users = signal<UserSummary[]>([]);
  readonly rooms = signal<RoomSummary[]>([]);

  readonly authUserId = computed(() => this.auth.profile()?.id ?? null);
  readonly selectedUserIds = this.meetups.selectedUserIds;

  readonly dayNames = computed(() => {
    const base = new Date(2024, 0, 1);
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(base);
      date.setDate(base.getDate() + index);
      return date.toLocaleDateString(this.dateLocale(), { weekday: 'short' });
    });
  });

  readonly monthLabel = computed(() =>
    this.currentDate().toLocaleDateString(this.dateLocale(), {
      month: 'long',
      year: 'numeric',
    }),
  );

  readonly filteredItems = computed(() => {
    const query = this.search().toLowerCase().trim();
    const items = this.meetups.calendarItems();
    if (!query) {
      return items;
    }
    return items.filter((meeting) => meeting.title.toLowerCase().includes(query));
  });

  readonly calendarDays = computed<CalendarDay[]>(() => {
    const current = this.currentDate();
    const year = current.getFullYear();
    const month = current.getMonth();
    const firstDay = new Date(year, month, 1);
    const dayOfWeek = firstDay.getDay();
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const start = new Date(year, month, 1 + mondayOffset);
    const items = this.filteredItems();

    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      return {
        date: new Date(date),
        dayNumber: date.getDate(),
        isCurrentMonth: date.getMonth() === month,
        meetings: this.getMeetingsForDay(date, items),
      };
    });
  });

  readonly selectedDayMeetings = computed(() => {
    const day = this.selectedDay();
    if (!day) {
      return [];
    }
    return this.getMeetingsForDay(day, this.filteredItems());
  });

  ngOnInit(): void {
    void this.meetups.fetchAllForCalendar();
    void this.loadUsers();
    void this.loadRooms();
  }

  onSearchInput(event: Event): void {
    this.search.set((event.target as HTMLInputElement).value);
  }

  onFilterUsersChange(event: MatSelectChange): void {
    const ids = (event.value as number[]) ?? [];
    this.meetups.setSelectedUsers(ids);
    void this.meetups.fetchAllForCalendar(ids);
  }

  clearUsers(): void {
    this.meetups.setSelectedUsers([]);
    void this.meetups.fetchAllForCalendar([]);
  }

  prevMonth(): void {
    const current = this.currentDate();
    this.currentDate.set(new Date(current.getFullYear(), current.getMonth() - 1, 1));
  }

  nextMonth(): void {
    const current = this.currentDate();
    this.currentDate.set(new Date(current.getFullYear(), current.getMonth() + 1, 1));
  }

  goToday(): void {
    this.currentDate.set(new Date());
    this.selectedDay.set(new Date());
  }

  selectDay(day: CalendarDay): void {
    if (day.isCurrentMonth) {
      this.selectedDay.set(day.date);
    }
  }

  isToday(date: Date): boolean {
    return date.toDateString() === new Date().toDateString();
  }

  isSelectedDay(date: Date): boolean {
    return this.selectedDay()?.toDateString() === date.toDateString();
  }

  formatDayHeader(date: Date): string {
    return date.toLocaleDateString(this.dateLocale(), {
      day: 'numeric',
      month: 'long',
      weekday: 'short',
    });
  }

  formatTime(value: string): string {
    return new Date(value).toLocaleTimeString(this.dateLocale(), {
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  statusOf(meeting: Meetup): MeetingStatus {
    const userId = this.authUserId();
    if (userId === null) {
      return 'other';
    }
    if (meeting.hostId === userId) {
      return 'host';
    }
    if (this.meetups.isParticipant(meeting, userId)) {
      return 'participant';
    }
    if (this.meetups.isInvited(meeting, userId)) {
      return 'invited';
    }
    return 'other';
  }

  isInvitedForDay(meeting: Meetup): boolean {
    const userId = this.authUserId();
    return userId !== null && this.meetups.isInvited(meeting, userId);
  }

  isPartOfSeries(meeting: Meetup): boolean {
    return meeting.recurrenceType !== null || meeting.parentMeetingId !== null;
  }

  openCreate(): void {
    this.openDialog(null, true);
  }

  openDetail(meeting: Meetup): void {
    this.openDialog(this.meetups.getMeetupById(meeting.id) ?? meeting, false);
  }

  private openDialog(meeting: Meetup | null, create: boolean): void {
    this.dialog.open<MeetingDialogComponent, MeetingDialogData, boolean>(
      MeetingDialogComponent,
      {
        data: { meeting, create, users: this.users(), rooms: this.rooms() },
        width: '640px',
        maxWidth: '95vw',
        maxHeight: '92vh',
        autoFocus: 'dialog',
      },
    );
  }

  private getMeetingsForDay(date: Date, items: Meetup[]): Meetup[] {
    const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);

    return items.filter((meeting) => {
      const start = new Date(meeting.startTime);
      const end = new Date(meeting.endTime);
      return start < dayEnd && end > dayStart;
    });
  }

  private async loadUsers(): Promise<void> {
    try {
      const response = await this.usersService.listUsers({ limit: 1000 });
      this.users.set(response.items);
    } catch (error) {
      console.error('Failed to load users', error);
    }
  }

  private async loadRooms(): Promise<void> {
    try {
      this.rooms.set(await this.roomsService.listRooms());
    } catch {
      this.rooms.set([]);
    }
  }

  private dateLocale(): string {
    return this.language.lang() === 'en' ? 'en-US' : 'ru-RU';
  }
}
