import { Injectable, inject, signal } from '@angular/core';
import { Socket } from 'socket.io-client';
import { Participant } from '../models';
import { SocketService } from '../socket/socket.service';

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

const SIGNALING_EVENTS = [
  'user-connected',
  'offer',
  'answer',
  'ice-candidate',
  'user-info',
  'media-state',
  'user-disconnected',
] as const;

interface OfferPayload {
  from: string;
  offer: RTCSessionDescriptionInit;
}

interface AnswerPayload {
  from: string;
  answer: RTCSessionDescriptionInit;
}

interface IceCandidatePayload {
  from: string;
  candidate: RTCIceCandidateInit;
}

interface UserInfoMessage {
  id: string;
  name: string;
  init: string;
  avatar?: string | null;
}

interface MediaStateMessage {
  id: string;
  muted: boolean;
  videoOff: boolean;
}

@Injectable()
export class WebRtcService {
  private readonly socketService = inject(SocketService);
  private socket: Socket | null = null;
  private readonly peers = new Map<string, RTCPeerConnection>();

  private roomSlug = '';
  private myName = '';
  private myInit = '?';
  private myAvatar: string | null = null;

  readonly localStream = signal<MediaStream | null>(null);
  readonly screenStream = signal<MediaStream | null>(null);
  readonly participants = signal<Participant[]>([]);
  readonly isMuted = signal(false);
  readonly isVideoOff = signal(false);
  readonly isScreenSharing = signal(false);
  readonly isConnecting = signal(true);
  readonly mediaDenied = signal(false);
  readonly error = signal<string | null>(null);

  init(roomSlug: string, myName: string, myInit: string, myAvatar: string | null): void {
    this.roomSlug = roomSlug;
    this.myName = myName;
    this.myInit = myInit;
    this.myAvatar = myAvatar;
  }

  join(): void {
    this.socket = this.socketService.connect();
    this.registerSignalingHandlers();
    this.socket.emit('join-room', this.roomSlug);
    this.isConnecting.set(false);
  }

  async enableMedia(kinds?: { video?: boolean; audio?: boolean }): Promise<void> {
    try {
      const wantAudio = kinds?.audio ?? true;
      const stream = await navigator.mediaDevices.getUserMedia({
        video: kinds?.video ?? true,
        audio: wantAudio
          ? { noiseSuppression: false, autoGainControl: false, echoCancellation: true }
          : false,
      });
      this.localStream.set(stream);
      this.mediaDenied.set(false);
      this.isMuted.set(false);
      this.isVideoOff.set(stream.getVideoTracks().length === 0);
      this.addLocalTracksToAllPeers();
      this.broadcastMediaState();
      await this.renegotiateAllPeers();
    } catch (error) {
      this.mediaDenied.set(true);
      console.error('Failed to get media:', error);
    }
  }

  toggleMute(): void {
    const track = this.localStream()?.getAudioTracks()[0];
    if (!track) {
      return;
    }
    track.enabled = !track.enabled;
    this.isMuted.set(!track.enabled);
    this.broadcastMediaState();
  }

  toggleVideo(): void {
    const track = this.localStream()?.getVideoTracks()[0];
    if (!track) {
      return;
    }
    track.enabled = !track.enabled;
    this.isVideoOff.set(!track.enabled);
    this.broadcastMediaState();
  }

  async toggleScreenShare(): Promise<void> {
    if (this.isScreenSharing()) {
      this.stopScreenShare();
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      this.screenStream.set(stream);
      this.isScreenSharing.set(true);
      const screenTrack = stream.getVideoTracks()[0];
      if (!screenTrack) {
        return;
      }

      this.peers.forEach((pc) => {
        const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
        if (sender) {
          void sender.replaceTrack(screenTrack);
        } else {
          pc.addTrack(screenTrack, stream);
          void this.renegotiateSinglePeer(pc);
        }
      });
      screenTrack.onended = () => this.stopScreenShare();
    } catch (error) {
      console.error('Screen share error:', error);
    }
  }

  async replaceAudioTrackInPeers(newTrack: MediaStreamTrack): Promise<void> {
    for (const pc of this.peers.values()) {
      try {
        const sender = pc.getSenders().find((s) => s.track?.kind === 'audio');
        if (sender) {
          await sender.replaceTrack(newTrack);
        }
      } catch (error) {
        console.error('Failed to replace audio track for a peer:', error);
      }
    }
  }

  leave(): void {
    this.peers.forEach((pc) => pc.close());
    this.peers.clear();

    this.localStream()?.getTracks().forEach((track) => track.stop());
    this.localStream.set(null);

    this.screenStream()?.getTracks().forEach((track) => track.stop());
    this.screenStream.set(null);

    if (this.socket) {
      SIGNALING_EVENTS.forEach((event) => this.socket?.off(event));
    }
    this.socketService.disconnect();
    this.socket = null;

    this.participants.set([]);
    this.isConnecting.set(true);
    this.mediaDenied.set(false);
    this.isMuted.set(false);
    this.isVideoOff.set(false);
    this.isScreenSharing.set(false);
  }

  private registerSignalingHandlers(): void {
    if (!this.socket) {
      return;
    }

    this.socket.on('user-connected', (remoteSocketId: string) => {
      void this.handleUserConnected(remoteSocketId);
    });

    this.socket.on('offer', (payload: OfferPayload) => {
      void this.handleOffer(payload);
    });

    this.socket.on('answer', (payload: AnswerPayload) => {
      void this.handleAnswer(payload);
    });

    this.socket.on('ice-candidate', (payload: IceCandidatePayload) => {
      void this.handleIceCandidate(payload);
    });

    this.socket.on('user-info', (message: UserInfoMessage) => {
      this.participants.update((list) =>
        list.map((participant) =>
          participant.socketId === message.id
            ? {
                ...participant,
                displayName: message.name,
                userName: message.name,
                initials: message.init,
                avatar: message.avatar ?? null,
              }
            : participant,
        ),
      );
    });

    this.socket.on('media-state', (message: MediaStateMessage) => {
      this.participants.update((list) =>
        list.map((participant) =>
          participant.socketId === message.id
            ? { ...participant, isMuted: message.muted, isVideoOff: message.videoOff }
            : participant,
        ),
      );
    });

    this.socket.on('user-disconnected', (remoteSocketId: string) => {
      this.removeParticipant(remoteSocketId);
    });
  }

  private async handleUserConnected(remoteSocketId: string): Promise<void> {
    this.ensureParticipant(remoteSocketId);
    const pc = this.createPeerConnection(remoteSocketId);
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      this.socket?.emit('offer', { target: remoteSocketId, offer });
      this.broadcastUserInfo(remoteSocketId);
      this.broadcastMediaState();
    } catch (error) {
      console.error('Error creating offer:', error);
    }
  }

  private async handleOffer(payload: OfferPayload): Promise<void> {
    this.ensureParticipant(payload.from);
    const pc = this.peers.get(payload.from) ?? this.createPeerConnection(payload.from);

    try {
      await pc.setRemoteDescription(new RTCSessionDescription(payload.offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      this.socket?.emit('answer', { target: payload.from, answer });
      this.broadcastUserInfo(payload.from);
      this.broadcastMediaState();
    } catch (error) {
      console.error('Error handling offer:', error);
    }
  }

  private async handleAnswer(payload: AnswerPayload): Promise<void> {
    const pc = this.peers.get(payload.from);
    if (!pc) {
      return;
    }
    try {
      await pc.setRemoteDescription(new RTCSessionDescription(payload.answer));
    } catch (error) {
      console.error('Error handling answer:', error);
    }
  }

  private async handleIceCandidate(payload: IceCandidatePayload): Promise<void> {
    const pc = this.peers.get(payload.from);
    if (!pc) {
      return;
    }
    try {
      await pc.addIceCandidate(new RTCIceCandidate(payload.candidate));
    } catch (error) {
      console.error('Error adding ICE candidate:', error);
    }
  }

  private createPeerConnection(remoteId: string): RTCPeerConnection {
    const pc = new RTCPeerConnection(RTC_CONFIG);

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.socket?.emit('ice-candidate', {
          target: remoteId,
          candidate: event.candidate,
        });
      }
    };

    pc.ontrack = (event) => {
      const stream = event.streams[0];
      if (stream) {
        this.updateParticipantStream(remoteId, stream);
      }
    };

    pc.oniceconnectionstatechange = () => {
      if (
        pc.iceConnectionState === 'disconnected' ||
        pc.iceConnectionState === 'failed'
      ) {
        this.removeParticipant(remoteId);
      }
    };

    const local = this.localStream();
    if (local) {
      local.getTracks().forEach((track) => pc.addTrack(track, local));
    }

    this.peers.set(remoteId, pc);
    return pc;
  }

  private addLocalTracksToAllPeers(): void {
    const local = this.localStream();
    if (!local) {
      return;
    }
    this.peers.forEach((pc) => {
      local.getTracks().forEach((track) => {
        const already = pc.getSenders().some((sender) => sender.track?.kind === track.kind);
        if (!already) {
          pc.addTrack(track, local);
        }
      });
    });
  }

  private ensureParticipant(socketId: string): void {
    this.participants.update((list) => {
      if (list.some((participant) => participant.socketId === socketId)) {
        return list;
      }
      return [
        ...list,
        {
          socketId,
          userName: '',
          displayName: '',
          initials: '?',
          avatar: this.myAvatar,
          stream: undefined,
          isMuted: false,
          isVideoOff: false,
          isScreenSharing: false,
        },
      ];
    });
  }

  private updateParticipantStream(socketId: string, stream: MediaStream): void {
    this.ensureParticipant(socketId);
    this.participants.update((list) =>
      list.map((participant) =>
        participant.socketId === socketId ? { ...participant, stream } : participant,
      ),
    );
  }

  private removeParticipant(socketId: string): void {
    const pc = this.peers.get(socketId);
    if (pc) {
      pc.close();
      this.peers.delete(socketId);
    }
    this.participants.update((list) =>
      list.filter((participant) => participant.socketId !== socketId),
    );
  }

  private broadcastUserInfo(remoteId: string): void {
    if (!this.myName) {
      return;
    }
    const avatar =
      this.myAvatar && !this.myAvatar.startsWith('data:') ? this.myAvatar : null;
    this.socket?.emit('user-info', {
      to: remoteId,
      name: this.myName,
      init: this.myInit,
      avatar,
    });
  }

  private broadcastMediaState(): void {
    this.peers.forEach((_, remoteId) => {
      this.socket?.emit('media-state', {
        to: remoteId,
        muted: this.isMuted(),
        videoOff: this.isVideoOff(),
      });
    });
  }

  private async renegotiateAllPeers(): Promise<void> {
    for (const [remoteId, pc] of this.peers.entries()) {
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        this.socket?.emit('offer', { target: remoteId, offer });
      } catch (error) {
        console.error('Renegotiation error:', error);
      }
    }
  }

  private async renegotiateSinglePeer(target: RTCPeerConnection): Promise<void> {
    try {
      const offer = await target.createOffer();
      await target.setLocalDescription(offer);
      for (const [remoteId, pc] of this.peers.entries()) {
        if (pc === target) {
          this.socket?.emit('offer', { target: remoteId, offer });
          break;
        }
      }
    } catch (error) {
      console.error('Renegotiation error:', error);
    }
  }

  private stopScreenShare(): void {
    this.screenStream()?.getTracks().forEach((track) => track.stop());
    this.screenStream.set(null);
    this.isScreenSharing.set(false);

    const cameraTrack = this.localStream()?.getVideoTracks()[0];
    if (cameraTrack) {
      this.peers.forEach((pc) => {
        const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
        if (sender) {
          void sender.replaceTrack(cameraTrack);
        } else {
          const local = this.localStream();
          if (local) {
            pc.addTrack(cameraTrack, local);
            void this.renegotiateSinglePeer(pc);
          }
        }
      });
      return;
    }

    this.peers.forEach((pc) => {
      const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
      if (sender) {
        pc.removeTrack(sender);
      }
    });
  }
}
