import { Component, inject, signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { TranslocoPipe } from '@jsverse/transloco';

export interface AudioSettingsData {
  inputs: MediaDeviceInfo[];
  selectedId: string;
  noiseEnabled: boolean;
}

export interface AudioSettingsResult {
  selectedId: string;
  noiseEnabled: boolean;
}

@Component({
  selector: 'app-audio-settings-dialog',
  imports: [MatDialogModule, MatButtonModule, MatFormFieldModule, MatSelectModule, TranslocoPipe],
  template: `
    <h2 mat-dialog-title>{{ 'video.deviceSettings' | transloco }}</h2>
    <mat-dialog-content class="dialog-content">
      <mat-form-field appearance="outline">
        <mat-label>{{ 'video.selectMic' | transloco }}</mat-label>
        <mat-select
          [value]="selectedId()"
          (selectionChange)="selectedId.set($event.value)"
        >
          @for (input of data.inputs; track input.deviceId) {
            <mat-option [value]="input.deviceId">
              {{ input.label || ('video.noMicName' | transloco) }}
            </mat-option>
          }
        </mat-select>
      </mat-form-field>

      @if (!data.inputs.length) {
        <p class="muted">{{ 'video.noMicsFound' | transloco }}</p>
      }

      <mat-form-field appearance="outline">
        <mat-label>{{ 'video.noiseSuppression' | transloco }}</mat-label>
        <mat-select
          [value]="noiseEnabled()"
          (selectionChange)="noiseEnabled.set($event.value)"
        >
          <mat-option [value]="false">
            {{ 'video.noiseSuppressionOff' | transloco }}
          </mat-option>
          <mat-option [value]="true">
            {{ 'video.noiseSuppressionOn' | transloco }}
          </mat-option>
        </mat-select>
      </mat-form-field>
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-button type="button" (click)="dialogRef.close()">
        {{ 'common.cancel' | transloco }}
      </button>
      <button mat-flat-button type="button" (click)="apply()">
        {{ 'common.save' | transloco }}
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    .dialog-content {
      display: flex;
      flex-direction: column;
      gap: 8px;
      min-width: 300px;
    }
  `,
})
export class AudioSettingsDialog {
  readonly data = inject<AudioSettingsData>(MAT_DIALOG_DATA);
  readonly dialogRef = inject(MatDialogRef<AudioSettingsDialog, AudioSettingsResult>);

  readonly selectedId = signal(this.data.selectedId);
  readonly noiseEnabled = signal(this.data.noiseEnabled);

  apply(): void {
    this.dialogRef.close({
      selectedId: this.selectedId(),
      noiseEnabled: this.noiseEnabled(),
    });
  }
}
