# Use React Router v7 in Library Mode for Client-Side Routing

## Status

Accepted

## The Problem

We need client-side routing between the app's views (weekly list, default list, store management) without introducing server-side rendering complexity.

## The Solution

Use React Router v7 in library mode for pure client-side SPA routing, with no server runtime or SSR.

## Options Considered

- React Router v7 in framework mode (requires a server runtime or SSR adapter)
- TanStack Router (file-based, type-safe, but heavier setup for a small app)
- Next.js App Router (SSR-first, overkill for a fully offline PWA)
- **React Router v7 in library mode — pure client-side SPA routing, no server required**

## Rationale

Library mode gives us the full React Router v7 API (loaders, actions, nested routes) while rendering entirely in the browser. There is no server to manage, no hydration mismatch surface, and the build output is a static bundle that can be served from any CDN or local file server. This aligns with the app's offline-first, zero-infrastructure constraint.

## Notes

- Route components live in `src/routes/`.
- The router is instantiated in the app entry point; no file-based routing convention is enforced.
