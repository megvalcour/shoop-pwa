/**
 * The AI prompt a user copies to generate a custom-store JSON file (ADR-0024).
 * Single source of truth shared by the "Copy prompt" button. The embedded
 * example is asserted to parse cleanly through `parseStoreImport` in a unit test,
 * so the prompt and validator can never drift out of lockstep.
 */
export const STORE_IMPORT_PROMPT = `You are helping me add a grocery store to a shopping-list app. Output ONLY a JSON object (no markdown, no code fences, no commentary) describing the store's aisles in their real walking order.

Use exactly this shape:

{
  "name": "Store name and location",
  "address": "Street address (optional)",
  "aisles": [
    {
      "number": "1",
      "label": "Produce",
      "items": ["banana", "spinach", "avocado", "apple", "carrot"]
    }
  ]
}

Rules:
- "name" is required and non-empty. Include the location so I can tell branches apart (e.g. "Trader Joe's — Cambridge").
- "address" is optional free text; omit it if you don't know it.
- "aisles" is required and must list every aisle/section in the order a shopper walks them, front to back.
- Each aisle needs a non-empty "label" (e.g. "Produce", "Dairy & Eggs", "Frozen", "Bakery").
- "number" is the aisle's display number or name. Use the real number when aisles are numbered; for named sections like Produce or Bakery, repeat the label.
- Each aisle should include an "items" array of 10–20 common grocery items found in that aisle. These teach the app to file my items into the right aisle, so pick representative, everyday items.
- Do not invent ids; the app generates its own.

The store I want to add is: [replace this with the grocery store name and location, e.g. "Trader Joe's — Cambridge, MA"]`;
