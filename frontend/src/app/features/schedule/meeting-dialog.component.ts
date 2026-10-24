import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectChange, MatSelectModule } from '@angular/material/select';
import { RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { LanguageService } from '../../core/i18n/language.service';
import { MeetupService } from '../../core/meetups/meetup.service';
import {
  Meetup,
  MeetupCreatePayload,
  MeetupUpdatePayload,
  RecurrenceScope,
  RecurrenceType,
  RoomSummary,
  UserSummary,
} from '../../core/models';
import { ConfirmService } from '../../shared/confirm-dialog/confirm.service';
import { assetUrl } from '../../core/utils/asset-url';
import { getErrorMessage } from '../../core/utils/error.util';
import { environment } from '../../../environments/environment';

export interface MeetingDialogData {
  meeting: Meetup | null;
  create: boolean;
  users: UserSummary[];
  rooms: RoomSummary[];
}

type DialogMode = 'view' | 'edit' | 'create';

@Component({
  selector: 'app-meeting-dialog',
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    RouterLink,
    TranslocoPipe,
  ],
  templateUrl: './meeting-dialog.component.html',
  styleUrl: './meeting-dialog.component.scss',
})
export class MeetingDialogComponent implements OnInit {
  readonly data = inject<MeetingDialogData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject(MatDialogRef<MeetingDialogComponent, boolean>);
  private readonly auth = inject(AuthService);
  private readonly meetups = inject(MeetupService);
  private readonly confirm = inject(ConfirmService);
  private readonly fb = inject(FormBuilder);
  private readonly transloco = inject(TranslocoService);
  private readonly language = inject(LanguageService);
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `${environment.apiBaseUrl}/api`;

  readonly mode = signal<DialogMode>(this.data.create ? 'create' : 'view');
  readonly viewMeeting = signal<Meetup | null>(this.data.meeting);
  readonly saving = signal(false);
  readonly formError = signal<string | null>(null);

  readonly recurrenceEnabled = signal(false);
  readonly recurrenceType = signal<RecurrenceType>('WEEKLY');
  readonly recurrenceEndDate = signal('');
  readonly editScope = signal<RecurrenceScope>('this');
  readonly participantIds = signal<number[]>([]);
  readonly roomId = signal<number | null>(null);
  readonly assetUrl = assetUrl;

  readonly authUserId = computed(() => this.auth.profile()?.id ?? null);
  readonly availableUsers = computed(() =>
    this.data.users.filter((user) => user.id !== this.authUserId()),
  );
  readonly acceptedParticipants = computed(() =>
    (this.viewMeeting()?.participants ?? []).filter((p) => p.status === 'ACCEPTED'),
  );
  readonly invitedParticipants = computed(() =>
    (this.viewMeeting()?.participants ?? []).filter((p) => p.status === 'INVITED'),
  );
  readonly declinedParticipants = computed(() =>
    (this.viewMeeting()?.participants ?? []).filter((p) => p.status === 'DECLINED'),
  );

  readonly form = this.fb.nonNullable.group({
    title: ['', [Validators.required]],
    description: [''],
    startTime: ['', [Validators.required]],
    endTime: ['', [Validators.required]],
  });

  ngOnInit(): void {
    if (this.mode() === 'create') {
      this.resetFormForCreate();
    } else if (this.data.create === false && this.data.meeting === null) {
      this.dialogRef.close(false);
    }
  }

  timeError(): string | null {
    const { startTime, endTime } = this.form.getRawValue();
    if (!startTime || !endTime) {
      return null;
    }
    return new Date(endTime) <= new Date(startTime) ? this.t('schedule.timeError') : null;
  }

  onParticipantsChange(event: MatSelectChange): void {
    this.participantIds.set((event.value as number[]) ?? []);
  }

  onRoomChange(event: MatSelectChange): void {
    this.roomId.set((event.value as number | null) ?? null);
  }

  onRecurrenceTypeChange(event: MatSelectChange): void {
    this.recurrenceType.set(event.value as RecurrenceType);
  }

  onRecurrenceEndInput(event: Event): void {
    this.recurrenceEndDate.set((event.target as HTMLInputElement).value);
  }

  setScope(scope: RecurrenceScope): void {
    this.editScope.set(scope);
  }

  openEdit(): void {
    const meeting = this.viewMeeting();
    if (!meeting) {
      return;
    }
    this.form.setValue({
      title: meeting.title,
      description: meeting.description ?? '',
      startTime: this.toLocalDateTimeStr(new Date(meeting.startTime)),
      endTime: this.toLocalDateTimeStr(new Date(meeting.endTime)),
    });
    this.roomId.set(meeting.roomId);
    this.participantIds.set(
      (meeting.participants ?? [])
        .filter((participant) => participant.status !== 'DECLINED')
        .map((participant) => participant.id),
    );
    this.formError.set(null);

    if (this.isRecurringParent(meeting)) {
      this.recurrenceEnabled.set(true);
      this.recurrenceType.set(meeting.recurrenceType ?? 'WEEKLY');
      this.recurrenceEndDate.set(
        meeting.recurrenceEndDate
          ? new Date(meeting.recurrenceEndDate).toISOString().split('T')[0] ?? ''
          : '',
      );
    } else {
      this.recurrenceEnabled.set(false);
      this.recurrenceType.set('WEEKLY');
      this.recurrenceEndDate.set('');
    }
    this.editScope.set('this');
    this.mode.set('edit');
  }

  cancelEdit(): void {
    if (this.viewMeeting()) {
      this.mode.set('view');
    } else {
      this.dialogRef.close(false);
    }
  }

  async handleSave(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.timeError()) {
      this.formError.set(this.t('schedule.formTitleRequired'));
      return;
    }

    this.saving.set(true);
    this.formError.set(null);
    const value = this.form.getRawValue();
    const payload: MeetupUpdatePayload = {
      title: value.title,
      description: value.description || null,
      startTime: new Date(value.startTime).toISOString(),
      endTime: new Date(value.endTime).toISOString(),
      roomId: this.roomId(),
      participantIds: this.participantIds(),
    };

    try {
      const editing = this.mode() === 'edit' ? this.viewMeeting() : null;
      if (editing) {
        if (this.isPartOfSeries(editing)) {
          payload.scope = this.editScope();
        }
        if (this.recurrenceEnabled()) {
          payload.recurrenceType = this.recurrenceType();
          payload.recurrenceEndDate = this.recurrenceEndDate()
            ? new Date(this.recurrenceEndDate()).toISOString()
            : null;
        } else if (this.isRecurringParent(editing)) {
          payload.recurrenceType = null;
          payload.recurrenceEndDate = null;
        }
        await this.meetups.updateMeetup(editing.id, payload);
      } else {
        if (this.recurrenceEnabled()) {
          payload.recurrenceType = this.recurrenceType();
          payload.recurrenceEndDate = this.recurrenceEndDate()
            ? new Date(this.recurrenceEndDate()).toISOString()
            : null;
        }
        await this.meetups.createMeetup(payload as MeetupCreatePayload);
      }
      this.dialogRef.close(true);
    } catch (error) {
      this.formError.set(getErrorMessage(error, this.t('schedule.saveError')));
    } finally {
      this.saving.set(false);
    }
  }

  async handleDelete(meeting: Meetup): Promise<void> {
    if (this.isRecurringParent(meeting)) {
      const choice = await this.confirm.confirm(
        this.t('schedule.deleteSeriesTitle'),
        this.transloco.translate('schedule.deleteSeriesMessage', { title: meeting.title }),
        'danger',
      );
      if (!choice) {
        return;
      }
      await this.meetups.deleteMeetup(meeting.id, 'all');
    } else if (this.isRecurringChild(meeting)) {
      const ok = await this.confirm.confirm(
        this.t('schedule.deleteChildTitle'),
        this.transloco.translate('schedule.deleteChildMessage', { title: meeting.title }),
        'danger',
      );
      if (!ok) {
        return;
      }
      await this.meetups.deleteMeetup(meeting.id, 'this');
    } else {
      const ok = await this.confirm.confirm(
        this.t('schedule.deleteConfirm'),
        this.transloco.translate('schedule.deleteMessage', { title: meeting.title }),
        'danger',
      );
      if (!ok) {
        return;
      }
      await this.meetups.deleteMeetup(meeting.id);
    }
    this.dialogRef.close(true);
  }

  async handleJoin(meeting: Meetup): Promise<void> {
    try {
      const updated = await this.meetups.joinMeetup(meeting.id);
      this.viewMeeting.set(updated);
    } catch (error) {
      console.error('Join error:', error);
    }
  }

  async handleDecline(meeting: Meetup): Promise<void> {
    try {
      const updated = await this.meetups.declineMeetup(meeting.id);
      this.viewMeeting.set(updated);
    } catch (error) {
      console.error('Decline error:', error);
    }
  }

  async handleExportIcs(meeting: Meetup): Promise<void> {
    try {
      const blob = await firstValueFrom(
        this.http.get(`${this.apiUrl}/meetups/${meeting.id}/ics`, {
          responseType: 'blob',
        }),
      );
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `meetup-${meeting.id}.ics`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Export ICS failed:', error);
      this.formError.set(this.t('schedule.exportFailed'));
    }
  }

  handleGoogleCalendar(meeting: Meetup): void {
    const start = this.formatGoogleDate(meeting.startTime);
    const end = this.formatGoogleDate(meeting.endTime);
    const text = encodeURIComponent(meeting.title);

    let description = meeting.description ?? '';
    if (meeting.host) {
      const hostName =
        [meeting.host.firstName, meeting.host.lastName].filter(Boolean).join(' ') ||
        meeting.host.name;
      const organizer = `${this.t('schedule.organizer')}: ${hostName}`;
      description = description ? `${description}\n\n${organizer}` : organizer;
    }
    const details = encodeURIComponent(description);

    let location = '';
    if (meeting.room) {
      const roomUrl = `${window.location.origin}/room/${meeting.room.slug}${
        meeting.room.isPrivate ? `?meetingId=${meeting.id}` : ''
      }`;
      location = encodeURIComponent(`${meeting.room.title}\n${roomUrl}`);
    }

    const url = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${text}&dates=${start}/${end}&details=${details}&location=${location}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  isHost(meeting: Meetup): boolean {
    const userId = this.authUserId();
    return userId !== null && meeting.hostId === userId;
  }

  isParticipant(meeting: Meetup): boolean {
    const userId = this.authUserId();
    return userId !== null && this.meetups.isParticipant(meeting, userId);
  }

  isInvited(meeting: Meetup): boolean {
    const userId = this.authUserId();
    return userId !== null && this.meetups.isInvited(meeting, userId);
  }

  isRecurringParent(meeting: Meetup): boolean {
    return meeting.recurrenceType !== null;
  }

  isRecurringChild(meeting: Meetup): boolean {
    return meeting.parentMeetingId !== null;
  }

  isPartOfSeries(meeting: Meetup): boolean {
    return this.isRecurringParent(meeting) || this.isRecurringChild(meeting);
  }

  formatRecurrence(meeting: Meetup): string {
    if (!meeting.recurrenceType) {
      return '';
    }
    const label = this.t(`schedule.${meeting.recurrenceType.toLowerCase()}`);
    if (!meeting.recurrenceEndDate) {
      return label;
    }
    const end = new Date(meeting.recurrenceEndDate).toLocaleDateString(this.dateLocale(), {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    return `${label} — ${end}`;
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
    if (first || last) {
      return `${first}${last}`;
    }
    return user.name.charAt(0).toUpperCase();
  }

  formatDateTime(value: string): string {
    return new Date(value).toLocaleDateString(this.dateLocale(), {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  private resetFormForCreate(): void {
    const start = new Date();
    const end = new Date();
    end.setHours(end.getHours() + 1);
    this.form.reset({
      title: '',
      description: '',
      startTime: this.toLocalDateTimeStr(start),
      endTime: this.toLocalDateTimeStr(end),
    });
    this.roomId.set(null);
    this.participantIds.set([]);
    this.recurrenceEnabled.set(false);
    this.recurrenceType.set('WEEKLY');
    this.recurrenceEndDate.set('');
    this.editScope.set('this');
    this.formError.set(null);
  }

  private formatGoogleDate(value: string): string {
    return new Date(value)
      .toISOString()
      .replace(/[-:]/g, '')
      .replace(/\.\d{3}/, '');
  }

  private toLocalDateTimeStr(date: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
      date.getHours(),
    )}:${pad(date.getMinutes())}`;
  }

  private dateLocale(): string {
    return this.language.lang() === 'en' ? 'en-US' : 'ru-RU';
  }

  private t(key: string): string {
    return this.transloco.translate(key);
  }
}
