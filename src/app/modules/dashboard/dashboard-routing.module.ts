import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { DashboardComponent } from 'src/app/modules/dashboard/dashboard.component';
import { RoleGuard } from 'src/app/core/guards/role.guard';
import { OverviewComponent } from 'src/app/modules/dashboard/pages/overview/overview.component';
import { UsersComponent } from 'src/app/modules/dashboard/pages/users/users.component';
import { TransactionsComponent } from 'src/app/modules/dashboard/pages/transactions/transactions.component';
import { WalletAdminComponent } from 'src/app/modules/dashboard/pages/wallet-admin/wallet-admin.component';
import { WalletsComponent } from 'src/app/modules/dashboard/pages/wallets/wallets.component';
import { BetsComponent } from 'src/app/modules/dashboard/pages/bets/bets.component';
import { KycComponent } from 'src/app/modules/dashboard/pages/kyc/kyc.component';
import { AuditComponent } from 'src/app/modules/dashboard/pages/audit/audit.component';
import { ReferralsComponent } from 'src/app/modules/dashboard/pages/referrals/referrals.component';
import { ThreeDKingComponent } from 'src/app/modules/dashboard/pages/3dking/3dking.component';
import { CsContactComponent } from 'src/app/modules/dashboard/pages/cs-contact/cs-contact.component';
import { GamingComponent } from 'src/app/modules/dashboard/pages/gaming/gaming.component';
import { SessionMonitorComponent } from 'src/app/modules/dashboard/pages/session-monitor/session-monitor.component';
import { SecurityCenterComponent } from 'src/app/modules/dashboard/pages/security-center/security-center.component';
import { RiskManagementComponent } from 'src/app/modules/dashboard/pages/risk-management/risk-management.component';
import { SystemComponent } from 'src/app/modules/dashboard/pages/system/system.component';
import { IpWhitelistComponent } from 'src/app/modules/dashboard/pages/ip-whitelist/ip-whitelist.component';
import { PopupBannerComponent } from 'src/app/modules/dashboard/pages/popup-banner/popup-banner.component';
import { RoleManagementComponent } from 'src/app/modules/dashboard/pages/role-management/role-management.component';
import { NotFoundComponent } from 'src/app/shared/components/not-found/not-found.component';

const routes: Routes = [
  {
    path: '',
    component: DashboardComponent,
    children: [
      { path: '', redirectTo: 'overview', pathMatch: 'full' },
      { path: 'overview', component: OverviewComponent },
      { path: 'gaming', component: GamingComponent },
      { path: 'users', component: UsersComponent },
      { path: 'transactions', component: TransactionsComponent },
      { path: 'wallet', redirectTo: 'deposits', pathMatch: 'full' },
      { path: 'wallets', component: WalletsComponent, canActivate: [RoleGuard], data: { requiredRole: 'admin' } },
      { path: 'deposits', component: WalletAdminComponent, canActivate: [RoleGuard], data: { requiredRole: 'admin' } },
      { path: 'withdrawals', component: WalletAdminComponent, canActivate: [RoleGuard], data: { requiredRole: 'admin' } },
      { path: 'turnover', component: WalletAdminComponent, canActivate: [RoleGuard], data: { requiredRole: 'admin' } },
      { path: 'manual', component: WalletAdminComponent, canActivate: [RoleGuard], data: { requiredRole: 'admin' } },
      { path: 'bets', component: BetsComponent },
      { path: 'kyc', component: KycComponent },
      { path: 'audit', component: AuditComponent },
      { path: 'referrals', component: ReferralsComponent },
      { path: '3dking', component: ThreeDKingComponent },
      { path: 'cs-contact', component: CsContactComponent },
      { path: 'session-monitor', component: SessionMonitorComponent },
      { path: 'security-center', component: SecurityCenterComponent },
      { path: 'risk-management', component: RiskManagementComponent },
      { path: 'system', component: SystemComponent, canActivate: [RoleGuard], data: { requiredRole: 'admin' } },
      { path: 'member-password', redirectTo: 'users', pathMatch: 'full' },
      { path: 'member-balance', redirectTo: 'manual', pathMatch: 'full' },
      { path: 'ip-whitelist', component: IpWhitelistComponent, canActivate: [RoleGuard], data: { requiredRole: 'admin' } },
      { path: 'popup-banner', component: PopupBannerComponent, canActivate: [RoleGuard], data: { requiredRole: 'admin' } },
      { path: 'role-management', component: RoleManagementComponent, canActivate: [RoleGuard], data: { requiredRole: 'superadmin' } },
      { path: '404', component: NotFoundComponent },
      { path: '**', component: NotFoundComponent },
    ],
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class DashboardRoutingModule {}
