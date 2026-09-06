/**
 * Unit sanitization and formatting utilities.
 * Prevents typos like "100kg", "500 100kg", or numbers inside unit strings.
 */

export const STANDARD_UNITS = [
  'kg',
  'g',
  'l',
  'ml',
  'pieces',
  'bundles',
  'trays',
  'boxes',
  'bags',
] as const;

export type StandardUnit = typeof STANDARD_UNITS[number];

/**
 * Strips all digits, commas, dots, dashes, and extra spaces so no numbers can ever appear in a unit string.
 * E.g., "100kg" -> "kg", "500  100kg" -> "kg", "500 g" -> "g", "kgs" -> "kg".
 */
export function cleanUnit(rawUnit?: string | null): string {
  if (!rawUnit) return 'kg';

  // Strip ALL digits and numerical punctuation globally
  let cleaned = rawUnit.trim().replace(/[\d\.\,\-]+/g, '').trim().toLowerCase();

  // Normalize common variations
  if (cleaned === 'kgs' || cleaned === 'kilo' || cleaned === 'kilogram' || cleaned === 'kilograms') {
    return 'kg';
  }
  if (cleaned === 'grams' || cleaned === 'gm' || cleaned === 'gms') {
    return 'g';
  }
  if (cleaned === 'liters' || cleaned === 'litres' || cleaned === 'ltr' || cleaned === 'ltrs') {
    return 'l';
  }
  if (cleaned === 'milliliters' || cleaned === 'millilitres') {
    return 'ml';
  }
  if (cleaned === 'pcs' || cleaned === 'piece') {
    return 'pieces';
  }
  if (cleaned === 'bundle') {
    return 'bundles';
  }
  if (cleaned === 'tray') {
    return 'trays';
  }
  if (cleaned === 'box') {
    return 'boxes';
  }
  if (cleaned === 'bag') {
    return 'bags';
  }

  // If after stripping digits nothing is left (e.g. user typed "100"), default to "kg"
  return cleaned || 'kg';
}

/**
 * Format a unit for clean display, stripping any historical prefix numbers
 * stored in the database like "100kg" -> "kg".
 */
export function formatUnitDisplay(rawUnit?: string | null): string {
  return cleanUnit(rawUnit);
}

/**
 * Formats a quantity with its unit cleanly.
 * Guarantees output like "500 kg" instead of "500 100kg".
 */
export function formatQuantityWithUnit(
  quantity: number | undefined | null,
  rawUnit?: string | null
): string {
  const num = typeof quantity === 'number' && !isNaN(quantity) ? quantity : 0;
  const unit = formatUnitDisplay(rawUnit);
  return `${num.toLocaleString()} ${unit}`;
}
