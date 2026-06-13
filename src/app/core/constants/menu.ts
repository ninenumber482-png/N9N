import { MenuItem } from 'src/app/core/models/menu.model';

export class Menu {
  public static pages: MenuItem[] = [
    {
      group: 'Dashboard',
      expanded: true,
      separator: false,
      items: [
        { icon: 'assets/icons/heroicons/outline/chart-pie.svg', label: 'Overview', route: '/overview' },
        { icon: 'assets/icons/heroicons/outline/users.svg', label: 'Management Member', route: '/users' },
      ],
    },
    {
      group: 'Finance',
      separator: true,
      expanded: true,
      collapsible: false,
      accent: 'finance',
      items: [
        { icon: 'assets/icons/heroicons/outline/arrow-sm-down.svg', label: 'Deposit', route: '/deposits' },
        { icon: 'assets/icons/heroicons/outline/arrow-sm-up.svg', label: 'Withdraw', route: '/withdrawals' },
        { icon: 'assets/icons/heroicons/outline/trending-up.svg', label: 'Turnover', route: '/turnover' },
        { icon: 'assets/icons/heroicons/outline/minus.svg', label: 'Saldo Manual', route: '/manual' },
        { icon: 'assets/icons/heroicons/outline/folder.svg', label: 'Transactions', route: '/transactions' },
        { icon: 'assets/icons/heroicons/outline/currency-dollar.svg', label: 'Wallets', route: '/wallets' },
      ],
    },
    {
      group: 'Marketplace',
      separator: true,
      expanded: true,
      collapsible: false,
      accent: 'marketplace',
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
        { icon: 'assets/icons/heroicons/outline/bell.svg', label: 'Support Tickets', route: '/tickets' },
        { icon: 'assets/icons/heroicons/outline/gift.svg', label: 'Referrals', route: '/referrals' },
      ],
    },
    {
      group: 'Compliance',
      separator: true,
      items: [
        { icon: 'assets/icons/heroicons/outline/bookmark.svg', label: 'Audit Log', route: '/audit' },
        {
          icon: 'assets/icons/heroicons/outline/shield-check.svg',
          label: 'Security Center',
          route: '/security-center',
        },
        {
          icon: 'assets/icons/heroicons/outline/exclamation-triangle.svg',
          label: 'Risk Management',
          route: '/risk-management',
        },
        { icon: 'assets/icons/heroicons/outline/lock-closed.svg', label: 'IP Whitelist', route: '/ip-whitelist' },
      ],
    },
    {
      group: 'Settings',
      separator: true,
      items: [
        { icon: 'assets/icons/heroicons/outline/cog.svg', label: 'Configuration', route: '/system' },
        {
          icon: 'assets/icons/heroicons/outline/shield-exclamation.svg',
          label: 'Role Management',
          route: '/role-management',
        },
        { icon: 'assets/icons/heroicons/outline/bell.svg', label: 'Popup Banners', route: '/popup-banner' },
        { icon: 'assets/icons/heroicons/outline/phone.svg', label: 'CS Contact', route: '/cs-contact' },
      ],
    },
  ];
}
