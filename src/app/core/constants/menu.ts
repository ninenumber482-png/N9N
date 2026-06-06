import { MenuItem } from 'src/app/core/models/menu.model';

export class Menu {
  public static pages: MenuItem[] = [
    {
      group: 'Main',
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
        { icon: 'assets/icons/heroicons/outline/credit-card.svg', label: 'Wallet', route: '/wallet' },
        { icon: 'assets/icons/heroicons/outline/currency-dollar.svg', label: 'Transactions', route: '/transactions' },
        { icon: 'assets/icons/heroicons/outline/plus.svg', label: 'Adjust Saldo', route: '/member-balance' },
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
        { icon: 'assets/icons/heroicons/outline/lock-closed.svg', label: 'IP Whitelist', route: '/ip-whitelist' },
        { icon: 'assets/icons/heroicons/outline/photograph.svg', label: 'Popup Banner', route: '/popup-banner' },
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
