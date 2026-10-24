import { Routes } from '@angular/router';
import { adminGuard, authGuard } from './core/auth/auth.guards';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'home' },
  {
    path: 'home',
    loadComponent: () => import('./features/home/home.page').then((m) => m.HomePage),
  },
  {
    path: 'auth',
    loadComponent: () => import('./features/auth/auth.page').then((m) => m.AuthPage),
  },
  {
    path: 'profile',
    canActivate: [authGuard],
    loadComponent: () => import('./features/profile/profile.page').then((m) => m.ProfilePage),
  },
  {
    path: 'create-call',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/create-call/create-call.page').then((m) => m.CreateCallPage),
  },
  {
    path: 'room/:slug',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/video-room/video-room.page').then((m) => m.VideoRoomPage),
  },
  {
    path: 'library',
    canActivate: [authGuard],
    loadComponent: () => import('./features/library/library.page').then((m) => m.LibraryPage),
  },
  {
    path: 'schedule',
    canActivate: [authGuard],
    loadComponent: () => import('./features/schedule/schedule.page').then((m) => m.SchedulePage),
  },
  {
    path: 'admin',
    canActivate: [adminGuard],
    loadComponent: () => import('./features/admin/admin.page').then((m) => m.AdminPage),
  },
  { path: '**', redirectTo: 'home' },
];
