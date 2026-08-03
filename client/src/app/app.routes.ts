import { Routes } from '@angular/router';
import { authGuard } from './auth/auth.guard';

export const routes: Routes = [
  { path: '', loadComponent: () => import('./home/home.component').then((m) => m.HomeComponent) },
  { path: 'login', loadComponent: () => import('./auth/login/login.component').then((m) => m.LoginComponent) },
  { path: 'register', loadComponent: () => import('./auth/register/register.component').then((m) => m.RegisterComponent) },
  {
    path: 'search',
    canActivate: [authGuard],
    loadComponent: () => import('./search/search.component').then((m) => m.SearchComponent),
  },
  {
    path: 'history',
    canActivate: [authGuard],
    loadComponent: () => import('./history/history.component').then((m) => m.HistoryComponent),
  },
  { path: '**', redirectTo: '' },
];
