/**
 * Pure, network-free extraction of schema.org `Recipe` data from an HTML
 * document's JSON-LD blocks. Used by the `/api/import-recipe` Pages Function
 * (and unit-tested in isolation — no DOM, no fetch).
 *
 * The parser is deliberately tolerant: pages embed JSON-LD in many shapes
 * (bare object, array of nodes, an `@graph` wrapper, `@type` as a string or an
 * array, several `<script>` blocks). It walks every block, flattens the node
 * graph, and returns the first node typed as a `Recipe` that actually carries
 * ingredients. When nothing usable is found it returns `null` so the handler
 * can answer with a typed "no recipe found" (422).
 */

export interface ParsedRecipe {
  /** The recipe's `name`, when present — used to seed a new-list title. */
  title: string | null;
  /** Cleaned, non-empty ingredient strings in document order. */
  ingredients: string[];
}

/**
 * Extract the raw text of every `<script type="application/ld+json">` block.
 * Attribute order and surrounding whitespace vary across sites, so the match
 * is intentionally loose; malformed blocks are tolerated downstream by the
 * `JSON.parse` guard in {@link parseRecipeJsonLd}.
 */
function extractJsonLdBlocks(html: string): string[] {
  const blockPattern =
    /<script\b[^>]*\btype\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  const blocks: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = blockPattern.exec(html)) !== null) {
    const body = match[1].trim();
    if (body) blocks.push(body);
  }
  return blocks;
}

/**
 * Flatten an arbitrary JSON-LD value into a list of candidate object nodes,
 * expanding both top-level arrays and `@graph` wrappers.
 */
function collectNodes(value: unknown): Record<string, unknown>[] {
  const nodes: Record<string, unknown>[] = [];
  const visit = (current: unknown): void => {
    if (Array.isArray(current)) {
      for (const entry of current) visit(entry);
      return;
    }
    if (current && typeof current === 'object') {
      const node = current as Record<string, unknown>;
      nodes.push(node);
      if (Array.isArray(node['@graph'])) {
        for (const entry of node['@graph']) visit(entry);
      }
    }
  };
  visit(value);
  return nodes;
}

/** True when a node's `@type` is `"Recipe"` (string) or includes it (array). */
function isRecipeNode(node: Record<string, unknown>): boolean {
  const type = node['@type'];
  if (typeof type === 'string') return type === 'Recipe';
  if (Array.isArray(type)) return type.includes('Recipe');
  return false;
}

/** Coerce `recipeIngredient` / legacy `ingredients` into a clean string list. */
function coerceIngredients(value: unknown): string[] {
  const raw =
    typeof value === 'string'
      ? [value]
      : Array.isArray(value)
        ? value.filter((entry): entry is string => typeof entry === 'string')
        : [];
  return raw.map((entry) => entry.trim()).filter((entry) => entry.length > 0);
}

export function parseRecipeJsonLd(html: string): ParsedRecipe | null {
  for (const block of extractJsonLdBlocks(html)) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(block);
    } catch {
      // Skip blocks that aren't valid JSON; other blocks may still parse.
      continue;
    }

    for (const node of collectNodes(parsed)) {
      if (!isRecipeNode(node)) continue;

      // Prefer the modern `recipeIngredient`; fall back to legacy `ingredients`.
      const ingredients = coerceIngredients(
        node.recipeIngredient !== undefined ? node.recipeIngredient : node.ingredients,
      );
      if (ingredients.length === 0) continue;

      const name = node.name;
      const title = typeof name === 'string' && name.trim().length > 0 ? name.trim() : null;
      return { title, ingredients };
    }
  }

  return null;
}

