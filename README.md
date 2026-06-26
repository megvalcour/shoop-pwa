![Version](https://img.shields.io/badge/version-1.15.0-084887?style=flat-square)
![PWA](https://img.shields.io/badge/PWA-ready-5a0fc8?style=flat-square&logo=pwa&logoColor=white)
![Offline First](https://img.shields.io/badge/offline-first-22c55e?style=flat-square)
![React](https://img.shields.io/badge/React-19-61dafb?style=flat-square&logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178c6?style=flat-square&logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-7-646cff?style=flat-square&logo=vite&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-v4-06b6d4?style=flat-square&logo=tailwindcss&logoColor=white)
![Deployed on Cloudflare Pages](https://img.shields.io/badge/Cloudflare_Pages-deployed-f38020?style=flat-square&logo=cloudflare&logoColor=white)

# Shoop

Shoop is a personal progressive web app for smart creation, organization, and management of your shopping lists. It leverages browser storage and serverless functions to make a lightning-fast user experience that works online and off.

Features include:

- Auto-sort your items into aisles for easier shopping (leverages a tiny, in-browser LLM via `@huggingface/transformers`)
- Share recipes online to Shoop to auto-add ingredients into your next shopping list.
- Multi-store suport - switch between stores and your list carries over.
- Sort store aisles and departments so your list mimics how you personally walk to store.
- Autopopulate lists with default items to capture those things you buy every time.

---

## Live Demo

**[shoop-pwa.pages.dev](https://shoop-pwa.pages.dev)**

The app is installable as a PWA: in Chrome/Safari, open the link and choose "Add to Home Screen." Once installed, it works entirely offline.

---

## Quick Start

**Prerequisites**

- Node.js v20

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

## Git Workflow

Development happens directly on `main` or via short-lived feature branches.

All commits must follow [Conventional Commits](https://www.conventionalcommits.org/) — every subject is `type: description` (e.g. `feat: add multi-store toggle`). The type drives automated versioning: `feat` cuts a minor release, `fix` cuts a patch, and a `BREAKING CHANGE` footer cuts a major.

## Releases

**Production deployment** runs automatically: merges to `main` trigger GitHub Actions, which uses `semantic-release` to derive a semver version from Conventional Commits, tags the release, and deploys to Cloudflare Pages.

See [`docs/releases.md`](docs/releases.md) for the full pipeline details.

**4. Start the dev server**

```bash
npm run dev
```

---

## Available Scripts

| Command                | Description                              |
| ---------------------- | ---------------------------------------- |
| `npm run dev`          | Start the Vite dev server with HMR       |
| `npm run build`        | Typecheck + production build             |
| `npm run preview`      | Serve the production build locally       |
| `npm run validate`     | Typecheck + lint + unit tests (one shot) |
| `npm run typecheck`    | TypeScript type checking only            |
| `npm run lint`         | ESLint                                   |
| `npm run test`         | Vitest unit tests                        |
| `npm run test:e2e`     | Playwright end-to-end tests              |
| `npm run format:check` | Prettier formatting check                |

> `npm run validate` does **not** run the Playwright suite. Run `test:e2e` separately to confirm UI and offline behavior.

---

## Documentation

| Doc                                    | Purpose                                                                     |
| -------------------------------------- | --------------------------------------------------------------------------- |
| [`docs/releases.md`](docs/releases.md) | CI/CD pipeline, deployment, versioning, and semantic-release setup          |
| [`docs/adrs/`](docs/adrs/)             | Architecture Decision Records — the why behind every major technical choice |
| [`docs/prd/`](docs/prd/)               | Original product requirements                                               |
| [`PLAN.md`](PLAN.md)                   | Current development status and backlog                                      |

---

## License

This is a private personal project. All rights reserved.

---

## Credits

App icon (`public/favicon.svg`) uses the "cart-shopping" glyph from [Font Awesome Free](https://fontawesome.com/), licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
