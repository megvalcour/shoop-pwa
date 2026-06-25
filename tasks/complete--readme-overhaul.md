---
step: 6
substep: 1
status: implementing
class: lightweight
e2e_required: false
clarifications: |
  User wants: overview, demo link (https://shoop-pwa.pages.dev), quick start (prereqs/clone/install/dev),
  available features, license info, fun badges (tech stack, production ready, version, etc).
---

# README Overhaul

## Relevant ADRs
None constrain documentation content.

## Plan

- [ ] Write new README.md with:
  - Badges row (version, PWA, React, TypeScript, Vite, Tailwind, Cloudflare, offline-first)
  - Overview section
  - Live Demo section (link to shoop-pwa.pages.dev)
  - Features section (all shipped features from completed tasks)
  - Quick Start section (prerequisites, clone, install, env setup, dev server)
  - Available Scripts table
  - License section
- [ ] Remove Documentation Audit from PLAN.md backlog
- [ ] Verify markdown renders cleanly (smoke check)

**Review**: Approved by fresh session. Ready to implement.
