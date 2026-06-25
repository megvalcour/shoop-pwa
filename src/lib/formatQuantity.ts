/**
 * Render an item quantity. With a unit it reads "2 lbs"; without one it falls
 * back to the bare "×2". A whitespace-only unit is treated as no unit. Single
 * source of truth so display surfaces stay free of formatting branches.
 */
export function formatQuantity(quantity: number, unit?: string): string {
  const u = unit?.trim();
  return u ? `${quantity} ${u}` : `×${quantity}`;
}
