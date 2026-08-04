import { Routes } from '@angular/router';
import { authGuard } from './auth/auth.guard';

export const routes: Routes = [
  { path: '', loadComponent: () => import('./search/search.component').then((m) => m.SearchComponent) },
  { path: 'login', loadComponent: () => import('./auth/login/login.component').then((m) => m.LoginComponent) },
  { path: 'register', loadComponent: () => import('./auth/register/register.component').then((m) => m.RegisterComponent) },
  { path: 'settings', loadComponent: () => import('./settings/settings.component').then((m) => m.SettingsComponent) },
  { path: 'search', redirectTo: '', pathMatch: 'full' },
  {
    path: 'history',
    canActivate: [authGuard],
    loadComponent: () => import('./history/history.component').then((m) => m.HistoryComponent),
  },
  {
    path: 'saved',
    canActivate: [authGuard],
    loadComponent: () => import('./saved/saved.component').then((m) => m.SavedComponent),
  },
  { path: '**', redirectTo: '' },
];
