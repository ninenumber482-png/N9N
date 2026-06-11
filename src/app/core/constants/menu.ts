import { MenuItem } from 'src/app/core/models/menu.model';

export class Menu {
  public static pages: MenuItem[] = [
    {
      group: 'Dashboard',
      expanded: true,
      separator: false,
      items: [
        { icon: 'assets/icons/heroicons/outline/chart-pie.svg', label: 'Overview', route: '/overview' },
        { icon: 'assets/icons/heroicons/outline/users.svg', label: 'Members', route: '/users' },
      ],
    },
    {
      group: 'Finance',
      separator: true,
      items: [
        { icon: 'assets/icons/heroicons/outline/arrow-sm-down.svg', label: 'Deposits & Withdrawals', route: '/wallet' },
        { icon: 'assets/icons/heroicons/outline/folder.svg', label: 'Transactions', route: '/transactions' },
        { icon: 'assets/icons/heroicons/outline/currency-dollar.svg', label: 'Wallets', route: '/wallets' },
        { icon: 'assets/icons/heroicons/outline/minus.svg', label: 'Balance Adjustment', route: '/member-balance' },
        { icon: 'assets/icons/heroicons/outline/trending-up.svg', label: 'Turnover', route: '/turnover' },
      ],
    },
    {
      group: 'Marketplace',
      separator: true,
      items: [
        { icon: 'assets/icons/heroicons/outline/cube.svg', label: '3D King Engine', route: '/3dking' },
        { icon: 'assets/icons/heroicons/outline/cursor-click.svg', label: 'Bet History', route: '/bets' },
        { icon: 'assets/icons/heroicons/outline/eye.svg', label: 'Session Monitor', route: '/session-monitor' },
        { icon: 'assets/icons/heroicons/outline/view-grid.svg', label: 'Gaming Overview', route: '/gaming' },
      ],
    },
    {
      group: 'Members',
      separator: true,
      items: [
        { icon: 'assets/icons/heroicons/outline/identification.svg', label: 'KYC Verification', route: '/kyc' },
        { icon: 'assets/icons/heroicons/outline/gift.svg', label: 'Referrals', route: '/referrals' },
        { icon: 'assets/icons/heroicons/outline/user-circle.svg', label: 'Password Reset', route: '/member-password' },
      ],
    },
    {
      group: 'Compliance',
      separator: true,
      items: [
        { icon: 'assets/icons/heroicons/outline/bookmark.svg', label: 'Audit Log', route: '/audit' },
        { icon: 'assets/icons/heroicons/outline/shield-check.svg', label: 'Security Center', route: '/security-center' },
        { icon: 'assets/icons/heroicons/outline/exclamation-triangle.svg', label: 'Risk Management', route: '/risk-management' },
        { icon: 'assets/icons/heroicons/outline/lock-closed.svg', label: 'IP Whitelist', route: '/ip-whitelist' },
      ],
    },
    {
      group: 'Settings',
      separator: true,
      items: [
        { icon: 'assets/icons/heroicons/outline/cog.svg', label: 'Configuration', route: '/system' },
        { icon: 'assets/icons/heroicons/outline/shield-exclamation.svg', label: 'Role Management', route: '/role-management' },
        { icon: 'assets/icons/heroicons/outline/bell.svg', label: 'Popup Banners', route: '/popup-banner' },
        { icon: 'assets/icons/heroicons/outline/phone.svg', label: 'CS Contact', route: '/cs-contact' },
      ],
    },
  ];
}
