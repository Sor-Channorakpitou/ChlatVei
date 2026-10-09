import { Routes } from '@angular/router';
import { adminGuard, signedInGuard } from './core/auth';

/**
 * Citizen pages are the default. The admin area is a separate, lazily loaded
 * section so citizens never download admin code.
 */
export const routes: Routes = [
  { path: '', loadComponent: () => import('./citizen/home').then((m) => m.HomePage) },
  { path: 'services/:slug', loadComponent: () => import('./citizen/service-detail').then((m) => m.ServiceDetailPage) },
  { path: 'services/:slug/feedback', loadComponent: () => import('./citizen/feedback').then((m) => m.FeedbackPage) },
  { path: 'checklists', canActivate: [signedInGuard], loadComponent: () => import('./citizen/checklists').then((m) => m.ChecklistsPage) },
  { path: 'checklists/:id', canActivate: [signedInGuard], loadComponent: () => import('./citizen/checklist').then((m) => m.ChecklistPage) },
  { path: 'signin', loadComponent: () => import('./citizen/auth-pages').then((m) => m.SignInPage) },
  { path: 'register', loadComponent: () => import('./citizen/auth-pages').then((m) => m.RegisterPage) },
  { path: 'account', canActivate: [signedInGuard], loadComponent: () => import('./citizen/account').then((m) => m.AccountPage) },
  {
    path: 'admin',
    canActivate: [adminGuard],
    loadComponent: () => import('./admin/admin-shell').then((m) => m.AdminShell),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'review' },
      { path: 'review', loadComponent: () => import('./admin/review').then((m) => m.ReviewPage) },
      { path: 'dashboard', loadComponent: () => import('./admin/dashboard').then((m) => m.DashboardPage) },
      { path: 'sources', loadComponent: () => import('./admin/sources').then((m) => m.SourcesPage) },
    ],
  },
  { path: '**', redirectTo: '' },
];
