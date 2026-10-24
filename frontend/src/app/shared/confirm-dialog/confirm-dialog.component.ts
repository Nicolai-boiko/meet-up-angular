import { Component, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { TranslocoPipe } from '@jsverse/transloco';

export interface ConfirmDialogData {
  title: string;
  message?: string;
  variant?: 'info' | 'danger';
  confirmLabel?: string;
  cancelLabel?: string;
}

@Component({
  selector: 'app-confirm-dialog',
  imports: [MatDialogModule, MatButtonModule, TranslocoPipe],
  template: `
    <h2 mat-dialog-title>{{ data.title }}</h2>
    <mat-dialog-content>
      @if (data.message) {
        <p class="message">{{ data.message }}</p>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" (click)="dialogRef.close(false)">
        {{ data.cancelLabel || ('common.cancel' | transloco) }}
      </button>
      <button
        mat-flat-button
        type="button"
        [color]="data.variant === 'danger' ? 'warn' : 'primary'"
        (click)="dialogRef.close(true)"
      >
        {{ data.confirmLabel || ('common.confirm' | transloco) }}
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    .message {
      margin: 0;
      white-space: pre-line;
    }
  `,
})
export class ConfirmDialogComponent {
  readonly data = inject<ConfirmDialogData>(MAT_DIALOG_DATA);
  readonly dialogRef = inject(MatDialogRef<ConfirmDialogComponent, boolean>);
}
