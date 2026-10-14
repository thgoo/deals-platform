export const CATEGORIES = [
  'smartphones', 'notebooks', 'tvs', 'monitors', 'tablets',
  'audio', 'games', 'hardware', 'peripherals', 'appliances',
  'home', 'office', 'fashion', 'beauty', 'supplements', 'food', 'others',
] as const;

export type Category = typeof CATEGORIES[number];
