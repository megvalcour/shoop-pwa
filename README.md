![Version](https://img.shields.io/badge/version-1.15.0-084887?style=flat-square)
![PWA](https://img.shields.io/badge/PWA-ready-5a0fc8?style=flat-square&logo=pwa&logoColor=white)
![Offline First](https://img.shields.io/badge/offline-first-22c55e?style=flat-square)
![React](https://img.shields.io/badge/React-19-61dafb?style=flat-square&logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178c6?style=flat-square&logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-7-646cff?style=flat-square&logo=vite&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-v4-06b6d4?style=flat-square&logo=tailwindcss&logoColor=white)
![Deployed on Cloudflare Pages](https://img.shields.io/badge/Cloudflare_Pages-deployed-f38020?style=flat-square&logo=cloudflare&logoColor=white)

# Shoop

A personal progressive web app for managing a weekly grocery shopping list — organized by store aisle, works fully offline, and lives on your home screen.

Shoop is built for one person and one phone. There is no account, no server, and no sync — all data is stored locally in IndexedDB. Add items, check them off as you shop, and import recipes to populate your list automatically.

---

## Live Demo

**[shoop-pwa.pages.dev](https://shoop-pwa.pages.dev)**

The app is installable as a PWA: in Chrome/Safari, open the link and choose "Add to Home Screen." Once installed, it works entirely offline.

---

## Quick Start

**Prerequisites**
- Node.js 18 or later
- npm 9 or later
- Git

**1. Clone the repository**

```bash
git clone https://github.com/megvalcour/shoop-pwa.git
cd shoop-pwa
```

**2. Install dependencies**

```bash
npm install
```

**3. Set up environment variables**

```bash
cp .env.example .env.local
```

The only variable required for local development is `VITE_IMPORT_TOKEN`. You can leave it empty to disable recipe import, or set it to any string to enable the feature locally. See [`docs/releases.md`](docs/releases.md) for production setup details.

**4. Start the dev server**

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## Available Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start the Vite dev server with HMR |
| `npm run build` | Typecheck + production build |
| `npm run preview` | Serve the production build locally |
| `npm run validate` | Typecheck + lint + unit tests (one shot) |
| `npm run typecheck` | TypeScript type checking only |
| `npm run lint` | ESLint |
| `npm run test` | Vitest unit tests |
| `npm run test:e2e` | Playwright end-to-end tests |
| `npm run format:check` | Prettier formatting check |
| `npm run verify:version` | Assert semver minor matches DB schema version |

> `npm run validate` does **not** run the Playwright suite. Run `test:e2e` separately to confirm UI and offline behavior.

---

## Documentation

| Doc | Purpose |
|---|---|
| [`docs/releases.md`](docs/releases.md) | CI/CD pipeline, deployment, versioning, and semantic-release setup |
| [`docs/adrs/`](docs/adrs/) | Architecture Decision Records — the why behind every major technical choice |
| [`docs/prd/`](docs/prd/) | Original product requirements |
| [`PLAN.md`](PLAN.md) | Current development status and backlog |

---

## Features

### Default List
Maintain a standing list of items you buy regularly. Items are grouped by aisle automatically. Add new items by typing a description — the in-browser AI (HuggingFace `all-MiniLM-L6-v2` via WASM) classifies the item into the right aisle without any network call.

### Shopping Lists
Create on-demand shopping lists with a single tap. Seed a new list from your default list in one action, then add one-off items on the fly. Each list is independent — start a new one each trip without disturbing the last.

### Smart Aisle Matching
Semantic embedding model runs fully in-browser via WebAssembly. No API key, no network required after the model is cached. Layered matching (aliases → embeddings) keeps common items snappy.

### AI-Powered Recipe Import
Paste a recipe URL and Shoop extracts the ingredient list, classifies each item into an aisle, and adds everything to your active shopping list. Duplicate items increment quantity rather than creating a second row.

### Item Quantities & Units
Every item carries an integer quantity and an optional free-text unit (e.g. "2 cups"). A quantity stepper is available on both the default list and shopping lists. Adding a duplicate item — manually or via recipe import — increments the existing entry instead of creating a duplicate.

### Multi-Store Support
Switch between stores from the navigation bar. Each store has its own aisle layout. New stores can be added or configured from Settings. Items are scoped to their store.

### Manual Aisle Override
When the AI gets it wrong, override the aisle assignment inline. Drag-and-drop reordering is also available to arrange aisles to match how you actually walk the store.

### Shopping View
Items are displayed in aisle order — the order you encounter them in the store. Tap an item to check it off instantly (optimistic update, no spinner). Checked items collapse. Everything persists locally.

### PWA Lifecycle
Installable on iOS and Android. Service worker precaches all static assets and the HuggingFace model weights so the app functions identically online or off. Background updates are delivered silently.

### Settings
- Manage stores (add, rename, delete)
- Reset the app to a clean state
- View app version and DB schema version

---

## License

This is a private personal project. All rights reserved.

---

## Credits

App icon (`public/favicon.svg`) uses the "cart-shopping" glyph from [Font Awesome Free](https://fontawesome.com/), licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
