export interface MenuItem {
  group: string;
  separator?: boolean;
  selected?: boolean;
  active?: boolean;
  expanded?: boolean;
  /** When false, group stays open — no collapse chevron (Finance, Marketplace). */
  collapsible?: boolean;
  /** Sidebar accent strip for key sections. */
  accent?: 'finance' | 'marketplace';
  items: Array<SubMenuItem>;
}

export interface SubMenuItem {
  icon?: string;
  label?: string;
  route?: string | null;
  expanded?: boolean;
  active?: boolean;
  badgeCount?: number;
  children?: Array<SubMenuItem>;
}
