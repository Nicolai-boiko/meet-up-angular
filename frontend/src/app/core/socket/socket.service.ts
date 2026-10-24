import { Injectable } from '@angular/core';
import { Socket, io } from 'socket.io-client';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class SocketService {
  private socket: Socket | null = null;

  connect(): Socket {
    if (!this.socket) {
      this.socket = io(environment.apiBaseUrl || window.location.origin, {
        transports: ['websocket', 'polling'],
        autoConnect: false,
      });
    }
    if (!this.socket.connected) {
      this.socket.connect();
    }
    return this.socket;
  }

  get current(): Socket | null {
    return this.socket;
  }

  disconnect(): void {
    if (this.socket?.connected) {
      this.socket.disconnect();
    }
    this.socket = null;
  }
}
