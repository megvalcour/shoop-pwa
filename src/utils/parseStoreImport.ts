/**
 * Pure parser/validator for a user-authored store import (ADR-0024). Takes the
 * raw text from a file upload or a paste, validates its shape against the JSON
 * contract, and returns either a normalized `ParsedStoreImport` or a list of
 * human-readable errors. Does no IO and touches no React/IndexedDB — id/slug
 * minting (which needs the existing-store list) lives in the import hook, not
 * here — so this module is fully unit-testable.
 */

/** A normalized aisle ready for id minting in the import hook. */
export interface ParsedStoreAisle {
  /** Display key for the aisle; defaults to `index + 1` when omitted. */
  number: string;
  label: string;
  sortOrder: number;
  /** Representative item names (canonicalized: lowercased/trimmed), deduped. */
  items: string[];
}

export interface ParsedStoreImport {
  name: string;
  address: string;
  aisles: ParsedStoreAisle[];
}

export type StoreImportResult =
  | { ok: true; store: ParsedStoreImport }
  | { ok: false; errors: string[] };

/** Slugify a store name into a URL/lookup-safe slug. Pure; no de-dup here. */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseStoreImport(rawText: string): StoreImportResult {
  const trimmed = rawText.trim();
  if (!trimmed) {
    return { ok: false, errors: ['Paste or upload a store JSON file first.'] };
  }

  let data: unknown;
  try {
    data = JSON.parse(trimmed);
  } catch {
    return {
      ok: false,
      errors: ["That isn't valid JSON. Check for a stray comma or missing bracket."],
    };
  }

  const errors: string[] = [];

  if (!isObject(data)) {
    return { ok: false, errors: ['The JSON must be an object with a name and aisles.'] };
  }

  const name = typeof data.name === 'string' ? data.name.trim() : '';
  if (!name) errors.push('The store needs a non-empty "name".');

  const address = typeof data.address === 'string' ? data.address.trim() : '';

  const rawAisles = data.aisles;
  const parsedAisles: ParsedStoreAisle[] = [];
  if (!Array.isArray(rawAisles) || rawAisles.length === 0) {
    errors.push('The store needs an "aisles" array with at least one aisle.');
  } else {
    rawAisles.forEach((rawAisle, index) => {
      if (!isObject(rawAisle)) {
        errors.push(`Aisle ${index + 1} must be an object with a "label".`);
        return;
      }
      const label = typeof rawAisle.label === 'string' ? rawAisle.label.trim() : '';
      if (!label) {
        errors.push(`Aisle ${index + 1} needs a non-empty "label".`);
        return;
      }
      const number =
        typeof rawAisle.number === 'string' && rawAisle.number.trim()
          ? rawAisle.number.trim()
          : typeof rawAisle.number === 'number'
            ? String(rawAisle.number)
            : String(index + 1);

      const items: string[] = [];
      const seen = new Set<string>();
      if (Array.isArray(rawAisle.items)) {
        for (const rawItem of rawAisle.items) {
          if (typeof rawItem !== 'string') continue;
          const canonical = rawItem.trim().toLowerCase();
          if (!canonical || seen.has(canonical)) continue;
          seen.add(canonical);
          items.push(canonical);
        }
      }

      parsedAisles.push({ number, label, sortOrder: index, items });
    });
  }

  if (errors.length > 0) return { ok: false, errors };

  return { ok: true, store: { name, address, aisles: parsedAisles } };
}
