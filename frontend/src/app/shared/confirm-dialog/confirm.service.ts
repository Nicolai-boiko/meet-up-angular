import { Injectable, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';
import { ConfirmDialogComponent, ConfirmDialogData } from './confirm-dialog.component';

@Injectable({ providedIn: 'root' })
export class ConfirmService {
  private readonly dialog = inject(MatDialog);

  async confirm(
    title: string,
    message?: string,
    variant: ConfirmDialogData['variant'] = 'info',
  ): Promise<boolean> {
    const ref = this.dialog.open<ConfirmDialogComponent, ConfirmDialogData, boolean>(
      ConfirmDialogComponent,
      { data: { title, message, variant }, width: '420px', autoFocus: 'dialog' },
    );
    const result = await firstValueFrom(ref.afterClosed());
    return result === true;
  }
}
