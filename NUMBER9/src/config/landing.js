/* Landing Page Configuration — Single Source of Truth */

/* Neutral trust badges (SVG icons rendered in LandingPage) — replaces real
   bank brand logos to avoid trademark/misleading-partnership risk. */
export const TRUST = [
  { icon: 'licensed', labelKey: 'landing.trust_licensed' },
  { icon: 'secure', labelKey: 'landing.trust_secure' },
  { icon: 'encrypted', labelKey: 'landing.trust_encrypted' },
  { icon: 'payout', labelKey: 'landing.trust_payout' },
  { icon: 'support', labelKey: 'landing.trust_support' },
  { icon: 'fair', labelKey: 'landing.trust_fair' },
];

export const VALUES = [
  { icon: 'integrity', titleKey: 'landing.value_integrity', descKey: 'landing.value_integrity_desc' },
  { icon: 'collaboration', titleKey: 'landing.value_collaboration', descKey: 'landing.value_collaboration_desc' },
  { icon: 'innovation', titleKey: 'landing.value_innovation', descKey: 'landing.value_innovation_desc' },
  { icon: 'excellence', titleKey: 'landing.value_excellence', descKey: 'landing.value_excellence_desc' },
];

export const STATS = [
  { icon: 'countries', value: '50+', labelKey: 'landing.stat_countries' },
  { icon: 'partners', value: '200+', labelKey: 'landing.stat_partners' },
  { icon: 'years', value: '10+', labelKey: 'landing.stat_experience' },
  { icon: 'opportunities', value: '∞', labelKey: 'landing.stat_opportunities' },
];
