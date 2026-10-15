import { Routes } from '@angular/router';
import { authGuard } from './core/guards';

// Every feature is loaded on demand so the first download stays small.
export const routes: Routes = [
  { path: 'login', loadComponent: () => import('./features/auth/login.component').then(m => m.LoginComponent) },
  {
    path: '', canActivate: [authGuard],
    loadComponent: () => import('./layout/shell.component').then(m => m.ShellComponent),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      { path: 'dashboard', loadComponent: () => import('./features/dashboard/dashboard.component').then(m => m.DashboardComponent) },
      {
        path: 'patient', loadComponent: () => import('./features/patient/patient-tabs.component').then(m => m.PatientTabsComponent),
        children: [
          { path: '', pathMatch: 'full', redirectTo: 'registration' },
          { path: 'registration', loadComponent: () => import('./features/patient/registration.component').then(m => m.RegistrationComponent) },
          { path: 'search', loadComponent: () => import('./features/patient/search.component').then(m => m.SearchComponent) },
          { path: 'outsource', loadComponent: () => import('./features/patient/outsource.component').then(m => m.OutsourceComponent) }
        ]
      }
    ]
  },
  { path: '**', redirectTo: '' }
];
