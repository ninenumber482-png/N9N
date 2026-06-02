import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { DashboardComponent } from './dashboard.component';
import { RoleGuard } from '../../core/guards/role.guard';
import { OverviewComponent } from './pages/overview/overview.component';
import { UsersComponent } from './pages/users/users.component';
import { TransactionsComponent } from './pages/transactions/transactions.component';
import { DepositsComponent } from './pages/deposits/deposits.component';
import { WithdrawalsComponent } from './pages/withdrawals/withdrawals.component';
import { WalletsComponent } from './pages/wallets/wallets.component';
import { BetsComponent } from './pages/bets/bets.component';
import { KycComponent } from './pages/kyc/kyc.component';
import { AuditComponent } from './pages/audit/audit.component';
import { ReferralsComponent } from './pages/referrals/referrals.component';
import { ThreeDKingComponent } from './pages/3dking/3dking.component';
import { CsContactComponent } from './pages/cs-contact/cs-contact.component';
import { GamingComponent } from './pages/gaming/gaming.component';
import { SessionMonitorComponent } from './pages/session-monitor/session-monitor.component';
import { TurnoverComponent } from './pages/turnover/turnover.component';
import { SecurityCenterComponent } from './pages/security-center/security-center.component';
import { RiskManagementComponent } from './pages/risk-management/risk-management.component';
import { SystemComponent } from './pages/system/system.component';

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
      { path: 'deposits', component: DepositsComponent },
      { path: 'withdrawals', component: WithdrawalsComponent },
      { path: 'wallets', component: WalletsComponent },
      { path: 'bets', component: BetsComponent },
      { path: 'kyc', component: KycComponent },
      { path: 'audit', component: AuditComponent },
      { path: 'referrals', component: ReferralsComponent },
      { path: '3dking', component: ThreeDKingComponent },
      { path: 'cs-contact', component: CsContactComponent },
      { path: 'session-monitor', component: SessionMonitorComponent },
      { path: 'turnover', component: TurnoverComponent },
      { path: 'security-center', component: SecurityCenterComponent },
      { path: 'risk-management', component: RiskManagementComponent },
      { path: 'system', component: SystemComponent, canActivate: [RoleGuard], data: { requiredRole: 'admin' } },
      { path: '**', redirectTo: 'errors/404' },
    ],
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class DashboardRoutingModule {}
