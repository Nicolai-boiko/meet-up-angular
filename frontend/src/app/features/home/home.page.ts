import { Component, OnInit, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { TranslocoPipe } from '@jsverse/transloco';
import { AuthService } from '../../core/auth/auth.service';
import { LanguageService } from '../../core/i18n/language.service';
import { MeetupService } from '../../core/meetups/meetup.service';

interface HomeFeature {
  titleKey: string;
  descKey: string;
  link: string;
  icon: string;
}

@Component({
  selector: 'app-home',
  imports: [RouterLink, MatButtonModule, MatCardModule, TranslocoPipe],
  templateUrl: './home.page.html',
  styleUrl: './home.page.scss',
})
export class HomePage implements OnInit {
  readonly auth = inject(AuthService);
  readonly meetups = inject(MeetupService);
  private readonly language = inject(LanguageService);
  private readonly router = inject(Router);

  readonly features: HomeFeature[] = [
    {
      titleKey: 'home.videoCalls',
      descKey: 'home.videoCallsDesc',
      link: '/create-call',
      icon: 'M2 6a2 2 0 012-2h6a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V6zM14.553 7.106A1 1 0 0014 8v4a1 1 0 00.553.894l2 1A1 1 0 0018 13V7a1 1 0 00-1.447-.894l-2 1z',
    },
    {
      titleKey: 'home.knowledgeLibrary',
      descKey: 'home.knowledgeLibraryDesc',
      link: '/library',
      icon: 'M9 4.804A7.968 7.968 0 005.5 4c-1.255 0-2.443.29-3.5.804v10A7.969 7.969 0 015.5 14c1.669 0 3.218.51 4.5 1.385A7.962 7.962 0 0114.5 14c1.255 0 2.443.29 3.5.804v-10A7.968 7.968 0 0014.5 4c-1.255 0-2.443.29-3.5.804V12a1 1 0 11-2 0V4.804z',
    },
    {
      titleKey: 'home.scheduleCard',
      descKey: 'home.scheduleCardDesc',
      link: '/schedule',
      icon: 'M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zM4 8h12v8H4V8z',
    },
  ];

  ngOnInit(): void {
    if (this.auth.isAuthenticated()) {
      void this.meetups.fetchMeetups();
    }
  }

  formatMeetupDate(value: string): string {
    const date = new Date(value);
    const locale = this.language.lang() === 'en' ? 'en-US' : 'ru-RU';
    return `${date.toLocaleDateString(locale, {
      day: 'numeric',
      month: 'long',
      weekday: 'short',
    })} · ${date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}`;
  }

  goToSchedule(): void {
    void this.router.navigate(['/schedule']);
  }
}
