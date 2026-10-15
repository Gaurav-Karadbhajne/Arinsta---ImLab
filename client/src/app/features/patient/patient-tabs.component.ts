import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-patient-tabs', standalone: true, changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
  <nav class="tabs">
    <a routerLink="registration" routerLinkActive="on">Registration</a>
    <a routerLink="search" routerLinkActive="on">Search</a>
    <a routerLink="outsource" routerLinkActive="on">Outsource Test</a>
  </nav>
  <router-outlet />`
})
export class PatientTabsComponent {}
