import { describe, it, expect } from 'vitest';
import { parseRecipeJsonLd } from '../parseRecipeJsonLd';

/** Wrap a JSON-LD payload in a minimal HTML document. */
function page(...blocks: string[]): string {
  const scripts = blocks
    .map((b) => `<script type="application/ld+json">${b}</script>`)
    .join('\n');
  return `<!doctype html><html><head>${scripts}</head><body></body></html>`;
}

describe('parseRecipeJsonLd', () => {
  it('extracts a modern recipeIngredient array and the recipe name', () => {
    const html = page(
      JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'Recipe',
        name: 'Banana Bread',
        recipeIngredient: ['2 ripe bananas', '1 cup flour', '  ', '1/2 cup sugar'],
      }),
    );

    expect(parseRecipeJsonLd(html)).toEqual({
      title: 'Banana Bread',
      // empty/whitespace-only entries are dropped, order preserved.
      ingredients: ['2 ripe bananas', '1 cup flour', '1/2 cup sugar'],
    });
  });

  it('falls back to the legacy `ingredients` property', () => {
    const html = page(
      JSON.stringify({
        '@type': 'Recipe',
        name: 'Old School Soup',
        ingredients: ['1 onion', '2 carrots'],
      }),
    );

    expect(parseRecipeJsonLd(html)).toEqual({
      title: 'Old School Soup',
      ingredients: ['1 onion', '2 carrots'],
    });
  });

  it('coerces a single ingredient string into a one-item list', () => {
    const html = page(
      JSON.stringify({ '@type': 'Recipe', name: 'Toast', recipeIngredient: '1 slice bread' }),
    );

    expect(parseRecipeJsonLd(html)).toEqual({ title: 'Toast', ingredients: ['1 slice bread'] });
  });

  it('finds the Recipe node inside an @graph wrapper', () => {
    const html = page(
      JSON.stringify({
        '@context': 'https://schema.org',
        '@graph': [
          { '@type': 'WebSite', name: 'Recipe Blog' },
          { '@type': 'Person', name: 'Chef' },
          { '@type': 'Recipe', name: 'Graph Cake', recipeIngredient: ['flour', 'eggs'] },
        ],
      }),
    );

    expect(parseRecipeJsonLd(html)).toEqual({
      title: 'Graph Cake',
      ingredients: ['flour', 'eggs'],
    });
  });

  it('matches when @type is an array containing "Recipe"', () => {
    const html = page(
      JSON.stringify({
        '@type': ['Thing', 'Recipe'],
        name: 'Array Type Pie',
        recipeIngredient: ['apples', 'cinnamon'],
      }),
    );

    expect(parseRecipeJsonLd(html)).toEqual({
      title: 'Array Type Pie',
      ingredients: ['apples', 'cinnamon'],
    });
  });

  it('scans multiple ld+json blocks and skips non-recipe ones', () => {
    const html = page(
      JSON.stringify({ '@type': 'Organization', name: 'Some Brand' }),
      JSON.stringify({ '@type': 'BreadcrumbList', itemListElement: [] }),
      JSON.stringify({
        '@type': 'Recipe',
        name: 'Third Block Stew',
        recipeIngredient: ['beef', 'potatoes'],
      }),
    );

    expect(parseRecipeJsonLd(html)).toEqual({
      title: 'Third Block Stew',
      ingredients: ['beef', 'potatoes'],
    });
  });

  it('handles a top-level array of nodes', () => {
    const html = page(
      JSON.stringify([
        { '@type': 'WebPage', name: 'Page' },
        { '@type': 'Recipe', name: 'Array Root Salad', recipeIngredient: ['lettuce'] },
      ]),
    );

    expect(parseRecipeJsonLd(html)).toEqual({
      title: 'Array Root Salad',
      ingredients: ['lettuce'],
    });
  });

  it('returns null for a page with no Recipe JSON-LD', () => {
    const html = page(JSON.stringify({ '@type': 'Article', name: 'Just an Article' }));
    expect(parseRecipeJsonLd(html)).toBeNull();
  });

  it('returns null for a page with no JSON-LD at all', () => {
    expect(parseRecipeJsonLd('<html><body><p>no structured data</p></body></html>')).toBeNull();
  });

  it('skips a Recipe node that has no ingredients', () => {
    const html = page(JSON.stringify({ '@type': 'Recipe', name: 'Empty Recipe' }));
    expect(parseRecipeJsonLd(html)).toBeNull();
  });

  it('tolerates a malformed block and still parses a valid later one', () => {
    const html = page(
      '{ this is not valid json }',
      JSON.stringify({ '@type': 'Recipe', name: 'Resilient Roast', recipeIngredient: ['chicken'] }),
    );

    expect(parseRecipeJsonLd(html)).toEqual({
      title: 'Resilient Roast',
      ingredients: ['chicken'],
    });
  });

  it('matches the type attribute case-insensitively with extra attributes', () => {
    const html =
      '<script id="x" Type="application/ld+json" data-foo="bar">' +
      JSON.stringify({ '@type': 'Recipe', name: 'Attr Soup', recipeIngredient: ['water'] }) +
      '</script>';

    expect(parseRecipeJsonLd(html)).toEqual({ title: 'Attr Soup', ingredients: ['water'] });
  });

  it('returns a null title when the recipe has ingredients but no name', () => {
    const html = page(JSON.stringify({ '@type': 'Recipe', recipeIngredient: ['salt'] }));
    expect(parseRecipeJsonLd(html)).toEqual({ title: null, ingredients: ['salt'] });
  });
});
