import { Component, OnInit, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { MeetupService } from '../../core/meetups/meetup.service';
import { RoomService } from '../../core/rooms/room.service';
import { getErrorMessage } from '../../core/utils/error.util';

@Component({
  selector: 'app-create-call',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    TranslocoPipe,
  ],
  templateUrl: './create-call.page.html',
  styleUrl: './create-call.page.scss',
})
export class CreateCallPage implements OnInit {
  readonly meetups = inject(MeetupService);
  private readonly rooms = inject(RoomService);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);
  private readonly transloco = inject(TranslocoService);

  readonly creating = signal(false);
  readonly joining = signal(false);
  readonly roomError = signal<string | null>(null);
  readonly joinError = signal<string | null>(null);

  readonly createForm = this.fb.nonNullable.group({
    slug: ['', [Validators.required]],
    password: [''],
  });

  readonly joinForm = this.fb.nonNullable.group({
    slug: ['', [Validators.required]],
  });

  ngOnInit(): void {
    void this.meetups.fetchMeetups();
  }

  async createAndJoin(): Promise<void> {
    this.createForm.markAllAsTouched();
    if (this.createForm.invalid) {
      return;
    }
    const { slug, password } = this.createForm.getRawValue();
    const trimmedSlug = slug.trim();
    if (!trimmedSlug) {
      return;
    }

    this.creating.set(true);
    this.roomError.set(null);
    try {
      await this.rooms.createRoom({
        title: trimmedSlug,
        slug: trimmedSlug,
        ...(password.trim() ? { password: password.trim() } : {}),
      });
      await this.router.navigate(['/room', trimmedSlug]);
    } catch (error) {
      const fallback =
        error instanceof HttpErrorResponse && error.status === 409
          ? this.t('createCall.roomError')
          : this.t('createCall.roomError');
      this.roomError.set(getErrorMessage(error, fallback));
    } finally {
      this.creating.set(false);
    }
  }

  async joinRoom(): Promise<void> {
    this.joinForm.markAllAsTouched();
    if (this.joinForm.invalid) {
      return;
    }
    const slug = this.joinForm.controls.slug.value.trim();
    if (!slug) {
      return;
    }

    this.joining.set(true);
    this.joinError.set(null);
    try {
      await this.rooms.getRoom(slug);
      await this.router.navigate(['/room', slug]);
    } catch (error) {
      const fallback =
        error instanceof HttpErrorResponse && error.status === 404
          ? this.t('createCall.joinError')
          : this.t('createCall.joinErrorGeneric');
      this.joinError.set(fallback);
    } finally {
      this.joining.set(false);
    }
  }

  private t(key: string): string {
    return this.transloco.translate(key);
  }
}
