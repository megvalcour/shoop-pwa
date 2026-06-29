[![Version](https://img.shields.io/github/v/release/megvalcour/shoop-pwa?sort=semver&style=flat-square&label=version&color=084887)](https://github.com/megvalcour/shoop-pwa/releases)
[![CI](https://img.shields.io/github/actions/workflow/status/megvalcour/shoop-pwa/deploy.yaml?branch=main&style=flat-square&label=CI)](https://github.com/megvalcour/shoop-pwa/actions/workflows/deploy.yaml)
![Coverage](https://img.shields.io/endpoint?url=https://gist.githubusercontent.com/megvalcour/2774b806c9efd2fd5dad92f904017621/raw/shoop-coverage.json&style=flat-square)
![React](https://img.shields.io/github/package-json/dependency-version/megvalcour/shoop-pwa/react?style=flat-square&logo=react&logoColor=white&label=React&color=61dafb)
![TypeScript](https://img.shields.io/github/package-json/dependency-version/megvalcour/shoop-pwa/dev/typescript?style=flat-square&logo=typescript&logoColor=white&label=TypeScript&color=3178c6)
![Vite](https://img.shields.io/github/package-json/dependency-version/megvalcour/shoop-pwa/dev/vite?style=flat-square&logo=vite&logoColor=white&label=Vite&color=646cff)
![Tailwind CSS](https://img.shields.io/github/package-json/dependency-version/megvalcour/shoop-pwa/tailwindcss?style=flat-square&logo=tailwindcss&logoColor=white&label=Tailwind%20CSS&color=06b6d4)

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

**4. Start the dev server**

```bash
npm run dev
```

The only variable required for local development is `VITE_IMPORT_TOKEN`. You can leave it empty to disable recipe import, or set it to any string to enable the feature locally. See [`docs/releases.md`](docs/releases.md) for production setup details.

## Git Workflow

Development happens directly on `main` or via short-lived feature branches.

All commits must follow [Conventional Commits](https://www.conventionalcommits.org/) — every subject is `type: description` (e.g. `feat: add multi-store toggle`). The type drives automated versioning: `feat` cuts a minor release, `fix` cuts a patch, and a `BREAKING CHANGE` footer cuts a major.

## Releases

**Production deployment** runs automatically: merges to `main` trigger GitHub Actions, which uses `semantic-release` to derive a semver version from Conventional Commits, tags the release, and deploys to Cloudflare Pages.

See [`docs/releases.md`](docs/releases.md) for the full pipeline details.

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

## E2E Tests in Non-standard Environments

`npm run test:e2e` assumes Playwright can resolve a matching Chromium build. In environments where the pre-installed Chromium version doesn't match the pinned `@playwright/test` revision (e.g. Claude Code web sessions), set the env var below to point at the actual binary and Playwright will use it directly:

```bash
export PW_CHROMIUM_EXECUTABLE_PATH=/path/to/chrome
npm run test:e2e
```

In Claude Code web sessions this is handled automatically by `.claude/hooks/session-start.sh`, which runs on session start and writes the correct path to the session environment. CI is unaffected — the var is unset there and Playwright falls back to its own browser resolution after `npx playwright install --with-deps chromium`.

---

## License

This is a private personal project. All rights reserved.

---

## Credits

App icon (`public/favicon.svg`) uses the "cart-shopping" glyph from [Font Awesome Free](https://fontawesome.com/), licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
