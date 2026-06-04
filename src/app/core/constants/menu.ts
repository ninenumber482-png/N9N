import { MenuItem } from '../models/menu.model';

export class Menu {
  public static pages: MenuItem[] = [
    {
      group: 'Main',
      separator: false,
      items: [
        { icon: 'assets/icons/heroicons/outline/chart-pie.svg', label: 'Overview', route: '/overview' },
        { icon: 'assets/icons/heroicons/outline/users.svg', label: 'Users', route: '/users' },
        { icon: 'assets/icons/heroicons/outline/gift.svg', label: 'Referrals', route: '/referrals' },
      ],
    },
    {
      group: 'Finance',
      separator: true,
      items: [
        { icon: 'assets/icons/heroicons/outline/credit-card.svg', label: 'Wallet', route: '/wallet' },
        { icon: 'assets/icons/heroicons/outline/currency-dollar.svg', label: 'Transactions', route: '/transactions' },
        { icon: 'assets/icons/heroicons/outline/cube.svg', label: 'Wallets', route: '/wallets' },
      ],
    },
    {
      group: 'Gaming',
      separator: true,
      items: [
        { icon: 'assets/icons/heroicons/outline/trending-up.svg', label: 'Gaming', route: '/gaming' },
        { icon: 'assets/icons/heroicons/outline/trending-up.svg', label: '3D King', route: '/3dking' },
        { icon: 'assets/icons/heroicons/outline/chart-pie.svg', label: 'Bets', route: '/bets' },
        { icon: 'assets/icons/heroicons/outline/monitor.svg', label: 'Session Monitor', route: '/session-monitor' },
      ],
    },
    {
      group: 'Compliance',
      separator: true,
      items: [
        { icon: 'assets/icons/heroicons/outline/identification.svg', label: 'KYC', route: '/kyc' },
        { icon: 'assets/icons/heroicons/outline/cursor-click.svg', label: 'Audit Log', route: '/audit' },
        { icon: 'assets/icons/heroicons/outline/shield-check.svg', label: 'Security Center', route: '/security-center' },
        { icon: 'assets/icons/heroicons/outline/exclamation-triangle.svg', label: 'Risk Management', route: '/risk-management' },
      ],
    },
    {
      group: 'System',
      separator: true,
      items: [
        { icon: 'assets/icons/heroicons/outline/cog.svg', label: 'System', route: '/system' },
        { icon: 'assets/icons/heroicons/outline/phone.svg', label: 'CS Contact', route: '/cs-contact' },
      ],
    },
  ];
}
