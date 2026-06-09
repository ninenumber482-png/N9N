import { MenuItem } from 'src/app/core/models/menu.model';

export class Menu {
  public static pages: MenuItem[] = [
    {
      group: 'Main',
      expanded: true,
      separator: false,
      items: [
        { icon: 'assets/icons/heroicons/outline/chart-pie.svg', label: 'Overview', route: '/overview' },
        { icon: 'assets/icons/heroicons/outline/users.svg', label: 'Users', route: '/users' },
        { icon: 'assets/icons/heroicons/outline/gift.svg', label: 'Referrals', route: '/referrals' },
        { icon: 'assets/icons/heroicons/outline/lock-closed.svg', label: 'Reset Password', route: '/member-password' },
      ],
    },
    {
      group: 'Finance',
      separator: true,
      items: [
        { icon: 'assets/icons/heroicons/outline/arrow-sm-down.svg', label: 'Deposit / Withdraw', route: '/wallet' },
        { icon: 'assets/icons/heroicons/outline/currency-dollar.svg', label: 'Transactions', route: '/transactions' },
        { icon: 'assets/icons/heroicons/outline/view-grid.svg', label: 'Wallets', route: '/wallets' },
        { icon: 'assets/icons/heroicons/outline/minus.svg', label: 'Member Balance', route: '/member-balance' },
        { icon: 'assets/icons/heroicons/outline/trending-up.svg', label: 'Turnover', route: '/turnover' },
      ],
    },
    {
      group: 'Gaming',
      separator: true,
      items: [
        { icon: 'assets/icons/heroicons/outline/cube.svg', label: 'Gaming', route: '/gaming' },
        { icon: 'assets/icons/heroicons/outline/trending-up.svg', label: '3D King', route: '/3dking' },
        { icon: 'assets/icons/heroicons/outline/currency-dollar.svg', label: 'Bets', route: '/bets' },
        { icon: 'assets/icons/heroicons/outline/eye.svg', label: 'Session Monitor', route: '/session-monitor' },
      ],
    },
    {
      group: 'Compliance',
      separator: true,
      items: [
        { icon: 'assets/icons/heroicons/outline/identification.svg', label: 'KYC', route: '/kyc' },
        { icon: 'assets/icons/heroicons/outline/bookmark.svg', label: 'Audit Log', route: '/audit' },
        { icon: 'assets/icons/heroicons/outline/shield-check.svg', label: 'Security Center', route: '/security-center' },
        { icon: 'assets/icons/heroicons/outline/exclamation-triangle.svg', label: 'Risk Management', route: '/risk-management' },
        { icon: 'assets/icons/heroicons/outline/lock-closed.svg', label: 'IP Whitelist', route: '/ip-whitelist' },
        { icon: 'assets/icons/heroicons/outline/information-circle.svg', label: 'Popup Banner', route: '/popup-banner' },
      ],
    },
    {
      group: 'System',
      separator: true,
      items: [
        { icon: 'assets/icons/heroicons/outline/cog.svg', label: 'System', route: '/system' },
        { icon: 'assets/icons/heroicons/outline/shield-exclamation.svg', label: 'Role Management', route: '/role-management' },
        { icon: 'assets/icons/heroicons/outline/phone.svg', label: 'CS Contact', route: '/cs-contact' },
      ],
    },
  ];
}
