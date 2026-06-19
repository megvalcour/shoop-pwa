interface AisleColor {
  color: string;
  tint: string;
}

const AISLE_COLOR_RULES: Array<{ keywords: string[]; color: string; tint: string }> = [
  { keywords: ['produce', 'fruit', 'veg'],            color: '#16a34a', tint: '#e7f6ec' },
  { keywords: ['dairy', 'egg'],                        color: '#2563eb', tint: '#e8eefc' },
  { keywords: ['cereal', 'breakfast', 'granola'],      color: '#ea7a07', tint: '#fdefe0' },
  { keywords: ['pasta', 'sauce'],                      color: '#dc2626', tint: '#fce9e9' },
  { keywords: ['baking', 'coffee', 'oil', 'sugar'],   color: '#7c3aed', tint: '#f0eafc' },
  { keywords: ['chip', 'snack', 'cracker'],            color: '#db2777', tint: '#fce8f1' },
  { keywords: ['frozen'],                              color: '#0891b2', tint: '#e4f4f8' },
  { keywords: ['bread', 'bakery'],                     color: '#d97706', tint: '#fcefdd' },
  { keywords: ['meat', 'seafood', 'deli'],             color: '#be123c', tint: '#fbe7ec' },
  { keywords: ['household', 'cleaning', 'paper'],      color: '#475569', tint: '#eef1f5' },
];

const FALLBACK: AisleColor = { color: '#64748b', tint: '#eef1f5' };

export function aisleColorFor(label: string): AisleColor {
  const lower = label.toLowerCase();
  for (const rule of AISLE_COLOR_RULES) {
    if (rule.keywords.some((kw) => lower.includes(kw))) {
      return { color: rule.color, tint: rule.tint };
    }
  }
  return FALLBACK;
}
