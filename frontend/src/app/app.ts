import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { HeaderComponent } from './shared/layout/header/header';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, HeaderComponent, TranslocoPipe],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {}
