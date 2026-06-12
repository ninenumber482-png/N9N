import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { AuthComponent } from 'src/app/modules/auth/auth.component';
import { SignInComponent } from 'src/app/modules/auth/pages/sign-in/sign-in.component';
import { TwoFactorComponent } from 'src/app/modules/auth/pages/two-factor/two-factor.component';
import { NewPasswordComponent } from 'src/app/modules/auth/pages/new-password/new-password.component';
import { ForbiddenComponent } from 'src/app/modules/auth/pages/forbidden/forbidden.component';
import { MfaGuard } from 'src/app/core/guards/mfa.guard';

const routes: Routes = [
  {
    path: '',
    component: AuthComponent,
    children: [
      { path: '', redirectTo: 'sign-in', pathMatch: 'full' },
      { path: 'sign-in', component: SignInComponent },
      { path: 'two-factor', component: TwoFactorComponent, canActivate: [MfaGuard] },
      { path: 'new-password', component: NewPasswordComponent },
      { path: 'forbidden', component: ForbiddenComponent },
      { path: '**', redirectTo: 'sign-in', pathMatch: 'full' },
    ],
  },
];

@NgModule({
  imports: [
    RouterModule.forChild(routes),
    SignInComponent,
    TwoFactorComponent,
    NewPasswordComponent,
    ForbiddenComponent,
  ],
  exports: [RouterModule],
})
export class AuthRoutingModule {}
