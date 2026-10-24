import {
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { Socket } from 'socket.io-client';
import { AuthService } from '../../core/auth/auth.service';
import { LanguageService } from '../../core/i18n/language.service';
import { ChatMessage, Participant, Room } from '../../core/models';
import { RoomService } from '../../core/rooms/room.service';
import { SocketService } from '../../core/socket/socket.service';
import { AudioProcessorService } from '../../core/webrtc/audio-processor.service';
import { WebRtcService } from '../../core/webrtc/webrtc.service';
import { assetUrl } from '../../core/utils/asset-url';
import { getErrorMessage } from '../../core/utils/error.util';
import {
  AudioSettingsData,
  AudioSettingsDialog,
  AudioSettingsResult,
} from './audio-settings.dialog';

@Component({
  selector: 'app-video-room',
  imports: [RouterLink, MatButtonModule, TranslocoPipe],
  providers: [WebRtcService],
  templateUrl: './video-room.page.html',
  styleUrl: './video-room.page.scss',
})
export class VideoRoomPage implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly rooms = inject(RoomService);
  private readonly socketService = inject(SocketService);
  private readonly audio = inject(AudioProcessorService);
  private readonly dialog = inject(MatDialog);
  private readonly language = inject(LanguageService);
  private readonly transloco = inject(TranslocoService);

  readonly webrtc = inject(WebRtcService);

  private readonly slug = this.route.snapshot.paramMap.get('slug') ?? '';
  private readonly meetingId = this.route.snapshot.queryParamMap.get('meetingId');

  readonly roomTitle = signal('');
  readonly roomNotFound = signal(false);
  readonly passwordRequired = signal(false);
  readonly roomPassword = signal('');
  readonly passwordError = signal<string | null>(null);

  readonly showChat = signal(false);
  readonly chatInput = signal('');
  readonly chatMessages = signal<ChatMessage[]>([]);
  readonly unreadCount = signal(0);
  readonly mySocketId = signal('');
  readonly showSelfView = signal(true);
  readonly assetUrl = assetUrl;

  readonly gridColumns = computed(() => {
    const count = this.webrtc.participants().length;
    if (count <= 1) {
      return 1;
    }
    if (count <= 4) {
      return 2;
    }
    if (count <= 9) {
      return 3;
    }
    return 4;
  });

  private readonly selfVideo = viewChild<ElementRef<HTMLVideoElement>>('selfVideo');
  private readonly screenVideo = viewChild<ElementRef<HTMLVideoElement>>('screenVideo');
  private readonly chatList = viewChild<ElementRef<HTMLElement>>('chatList');

  private chatSocket: Socket | null = null;
  private readonly handleConnect = (): void => {
    this.mySocketId.set(this.chatSocket?.id ?? '');
  };
  private readonly handleNewMessage = (message: ChatMessage): void => {
    this.chatMessages.update((messages) => [...messages, message]);
    if (!this.showChat()) {
      this.unreadCount.update((count) => count + 1);
    }
  };

  constructor() {
    effect(() => {
      const element = this.selfVideo()?.nativeElement;
      const stream = this.webrtc.localStream();
      if (element && stream) {
        element.muted = true;
        element.playsInline = true;
        element.srcObject = stream;
      }
    });

    effect(() => {
      const element = this.screenVideo()?.nativeElement;
      const stream = this.webrtc.screenStream();
      if (element && stream) {
        element.muted = true;
        element.playsInline = true;
        element.srcObject = stream;
      }
    });

    effect(() => {
      this.chatMessages();
      this.showChat();
      const element = this.chatList()?.nativeElement;
      if (element) {
        queueMicrotask(() => element.scrollTo({ top: element.scrollHeight }));
      }
    });
  }

  async ngOnInit(): Promise<void> {
    this.webrtc.init(
      this.slug,
      this.auth.displayName(),
      this.auth.initials(),
      this.auth.profile()?.avatar ?? null,
    );

    this.chatSocket = this.socketService.connect();
    this.chatSocket.on('connect', this.handleConnect);
    this.chatSocket.on('new-message', this.handleNewMessage);
    this.handleConnect();

    await this.fetchRoomInfo();

    if (!this.passwordRequired()) {
      this.webrtc.join();
      await this.loadChatHistory();
    }
  }

  ngOnDestroy(): void {
    if (this.chatSocket) {
      this.chatSocket.off('connect', this.handleConnect);
      this.chatSocket.off('new-message', this.handleNewMessage);
    }
    this.audio.dispose();
    this.webrtc.leave();
  }

  toggleChat(): void {
    this.showChat.update((open) => !open);
    if (this.showChat()) {
      this.unreadCount.set(0);
    }
  }

  onChatInput(event: Event): void {
    this.chatInput.set((event.target as HTMLInputElement).value);
  }

  onPasswordInput(event: Event): void {
    this.roomPassword.set((event.target as HTMLInputElement).value);
  }

  sendChatMessage(event?: Event): void {
    event?.preventDefault();
    const text = this.chatInput().trim();
    if (!text || !this.chatSocket) {
      return;
    }

    const avatar = this.auth.profile()?.avatar;
    this.chatSocket.emit('send-message', {
      roomId: this.slug,
      text,
      userName: this.auth.displayName(),
      initials: this.auth.initials(),
      avatar: avatar && !avatar.startsWith('data:') ? avatar : null,
    });
    this.chatInput.set('');
  }

  async handleRoomPassword(event?: Event): Promise<void> {
    event?.preventDefault();
    const password = this.roomPassword().trim();
    if (!password) {
      return;
    }
    this.passwordError.set(null);
    try {
      await this.rooms.verifyPassword(this.slug, password);
      this.passwordRequired.set(false);
      this.webrtc.join();
      await this.loadChatHistory();
    } catch (error) {
      this.passwordError.set(getErrorMessage(error, this.t('video.wrongPassword')));
    }
  }

  async handleLeave(): Promise<void> {
    this.audio.dispose();
    this.webrtc.leave();
    await this.router.navigate(['/home']);
  }

  async openSettings(): Promise<void> {
    await this.audio.loadDevices();
    const stream = this.webrtc.localStream();
    const previousId = this.audio.selectedAudioInputId();

    if (!previousId && stream) {
      const settings = stream.getAudioTracks()[0]?.getSettings();
      this.audio.selectedAudioInputId.set(settings?.deviceId ?? '');
    }

    const ref = this.dialog.open<
      AudioSettingsDialog,
      AudioSettingsData,
      AudioSettingsResult
    >(AudioSettingsDialog, {
      data: {
        inputs: this.audio.audioInputs(),
        selectedId: this.audio.selectedAudioInputId(),
        noiseEnabled: this.audio.noiseSuppressionEnabled(),
      },
      width: '380px',
    });

    const result = await firstValueFrom(ref.afterClosed());
    if (!result) {
      return;
    }

    const selectedChanged = result.selectedId !== this.audio.selectedAudioInputId();
    this.audio.selectedAudioInputId.set(result.selectedId);
    this.audio.noiseSuppressionEnabled.set(result.noiseEnabled);

    const local = this.webrtc.localStream();
    if (!local) {
      return;
    }
    if (selectedChanged) {
      await this.audio.changeAudioInput(local);
    }
    await this.audio.syncPeerAudioTrack(local, (track) =>
      this.webrtc.replaceAudioTrackInPeers(track),
    );
  }

  formatChatTime(timestamp: string): string {
    const locale = this.language.lang() === 'en' ? 'en-US' : 'ru-RU';
    return new Date(timestamp).toLocaleTimeString(locale, {
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  participantName(participant: Participant): string {
    return (
      participant.displayName ||
      participant.userName ||
      this.t('video.participant')
    );
  }

  private async fetchRoomInfo(): Promise<void> {
    try {
      const meetingId = this.meetingId ? Number(this.meetingId) : undefined;
      const room = await this.rooms.getRoom(this.slug, meetingId);
      this.roomTitle.set(room.title);

      if (room.isPrivate && !room.hostId) {
        this.passwordRequired.set(true);
      }
    } catch (error) {
      if (error instanceof HttpErrorResponse && error.status === 404) {
        this.roomNotFound.set(true);
      }
      this.roomTitle.set(this.slug);
    }
  }

  private async loadChatHistory(): Promise<void> {
    try {
      const messages = await this.rooms.getMessages(this.slug, 50);
      this.chatMessages.set(messages);
    } catch (error) {
      console.error('loadChatHistory error:', error);
    }
  }

  private t(key: string): string {
    return this.transloco.translate(key);
  }
}
