import { Injectable, signal } from '@angular/core';
import type { DenoiseHandle } from 'denoise-voice-clarity';

@Injectable({ providedIn: 'root' })
export class AudioProcessorService {
  readonly audioInputs = signal<MediaDeviceInfo[]>([]);
  readonly selectedAudioInputId = signal('');
  readonly noiseSuppressionEnabled = signal(false);

  private denoiser: DenoiseHandle | null = null;

  async loadDevices(): Promise<void> {
    const devices = await navigator.mediaDevices.enumerateDevices();
    this.audioInputs.set(devices.filter((device) => device.kind === 'audioinput'));
  }

  async changeAudioInput(currentStream: MediaStream): Promise<void> {
    const selectedId = this.selectedAudioInputId();
    if (!selectedId) {
      return;
    }

    let newStream: MediaStream;
    try {
      newStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: { exact: selectedId },
          noiseSuppression: false,
          autoGainControl: false,
          echoCancellation: true,
        },
      });
    } catch (error) {
      console.error('Failed to access new microphone:', error);
      return;
    }

    const newTrack = newStream.getAudioTracks()[0];
    if (!newTrack) {
      console.error('New microphone returned no audio track');
      return;
    }

    const oldTrack = currentStream.getAudioTracks()[0];
    if (oldTrack) {
      currentStream.removeTrack(oldTrack);
      oldTrack.stop();
    }
    currentStream.addTrack(newTrack);
  }

  async syncPeerAudioTrack(
    rawStream: MediaStream,
    replaceAudioInPeers: (track: MediaStreamTrack) => Promise<void>,
  ): Promise<void> {
    const rawTrack = rawStream.getAudioTracks()[0];
    if (!rawTrack) {
      return;
    }

    await this.destroyDenoiser();

    if (!this.noiseSuppressionEnabled()) {
      await replaceAudioInPeers(rawTrack);
      return;
    }

    try {
      // Динамический импорт — много-мегабайтный WASM не попадает в основной бандл
      const { createDenoisedStream, isVoiceClaritySupported } = await import(
        'denoise-voice-clarity'
      );

      if (!isVoiceClaritySupported()) {
        console.warn('[noise-suppression] DeepFilterNet is not supported in this browser');
        await replaceAudioInPeers(rawTrack);
        return;
      }

      this.denoiser = await createDenoisedStream(rawStream, {
        enabled: true,
        attenuationLimitDb: 30,
        presenceGainDb: 4,
      });
      await replaceAudioInPeers(this.denoiser.track);
    } catch (error) {
      console.error('[noise-suppression] failed to enable:', error);
      await replaceAudioInPeers(rawTrack);
    }
  }

  dispose(): void {
    void this.destroyDenoiser();
  }

  private async destroyDenoiser(): Promise<void> {
    if (!this.denoiser) {
      return;
    }
    const active = this.denoiser;
    this.denoiser = null;
    await active.destroy();
  }
}
