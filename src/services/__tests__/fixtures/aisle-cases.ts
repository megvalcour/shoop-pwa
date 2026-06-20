// Representative query → expected-aisle cases for the oxford-62 layout.
//
// `expected` is the aisle `number` (department key) from oxford-62.json, NOT the
// IndexedDB id. Every case here is resolvable by the deterministic lexical
// fast-path (exact catalog phrase or authored alias), so it can be asserted
// without loading the WASM model. These pin the two reported bugs (produce and
// the cheese case) plus a sample of every other department and numbered aisle.

export interface AisleCase {
  query: string;
  expected: string;
  label: string;
}

export const AISLE_CASES: AisleCase[] = [
  // Non-numbered departments — these were dropped entirely by the old filter.
  { query: 'bananas', expected: 'Produce Dept', label: 'produce: catalog plural' },
  { query: 'fresh fruit', expected: 'Produce Dept', label: 'produce: catalog phrase' },
  { query: 'apple', expected: 'Produce Dept', label: 'produce: alias' },
  { query: 'lettuce', expected: 'Produce Dept', label: 'produce: alias' },
  { query: 'onion', expected: 'Produce Dept', label: 'produce: alias' },
  { query: 'avocado', expected: 'Produce Dept', label: 'produce: alias' },
  { query: 'fresh mozzarella', expected: 'Cheese Case', label: 'cheese case: containment' },
  { query: 'brie', expected: 'Cheese Case', label: 'cheese case: alias' },
  { query: 'feta', expected: 'Cheese Case', label: 'cheese case: alias' },
  { query: 'ground beef', expected: 'Meat Dept', label: 'meat: alias' },
  { query: 'chicken breast', expected: 'Meat Dept', label: 'meat: alias' },
  { query: 'bacon', expected: 'Meat Dept', label: 'meat: alias' },
  { query: 'salmon', expected: 'Deli/Fish Dept', label: 'deli/fish: alias' },
  { query: 'shrimp', expected: 'Deli/Fish Dept', label: 'deli/fish: alias' },
  { query: 'sliced ham', expected: 'Deli/Fish Dept', label: 'deli/fish: alias' },
  { query: 'sourdough', expected: 'Front Corner', label: 'bakery: alias' },
  { query: 'croissant', expected: 'Front Corner', label: 'bakery: alias' },
  { query: 'ice cream', expected: 'Freezer Wall', label: 'freezer wall: catalog phrase' },
  { query: 'popsicles', expected: 'Freezer Wall', label: 'freezer wall: alias' },
  { query: 'frozen pizza', expected: '19', label: 'frozen foods: alias' },

  // Numbered aisles — sample across the store.
  { query: 'milk', expected: '1', label: 'dairy: alias (catalog is "milk: fluid")' },
  { query: 'ketchup', expected: '2', label: 'condiments: catalog phrase' },
  { query: 'cereal', expected: '3', label: 'cereal: catalog phrase' },
  { query: 'pasta', expected: '4', label: 'pasta: catalog phrase' },
  { query: 'coffee', expected: '6', label: 'baking & beverages: catalog phrase' },
  { query: 'shampoo', expected: '10', label: 'personal care: alias' },
  { query: 'potato chips', expected: '18', label: 'chips & snacks: catalog phrase' },
];
