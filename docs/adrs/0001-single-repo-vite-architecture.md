# Use a Single-Repo Vite + React Architecture

## Status

Accepted

## The Problem

We need a build setup for a personal PWA that is simple to maintain without monorepo tooling overhead.

## Options Considered

- Monorepo (Nx, Turborepo) with separate packages for app, shared logic, and assets
- Create React App (deprecated, limited PWA support)
- **Single-repo Vite + React — all app logic, assets, and config in a unified root**

## Rationale

A monorepo adds orchestration complexity (task runners, inter-package versioning, workspace symlinks) that is not justified for a single-user personal app. Vite provides fast HMR, first-class PWA support via `vite-plugin-pwa`, and minimal config. Keeping everything in one root means zero cross-package coordination and a single `tsconfig` / `eslint` surface.

## Notes

- PWA manifest and service worker live in `public/`.
- Vite config is the single source of truth for path aliases, build targets, and asset handling.
