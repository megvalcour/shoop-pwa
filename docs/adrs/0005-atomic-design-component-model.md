# Organize Components Using the Atomic Design Hierarchy

## Status

Accepted

## The Problem

We need a component architecture that enforces reusability boundaries and keeps business logic out of primitive UI elements from the start.

## The Solution

Organize components using the Atomic Design hierarchy (Atoms → Molecules → Organisms → Templates), where lower layers have no knowledge of higher layers or application stores.

## Options Considered

- Feature-folder structure (components co-located with routes)
- Flat `components/` directory with no hierarchy
- **Atomic Design: Atoms → Molecules → Organisms → Templates**

## Rationale

Atomic Design provides an intuitive, well-documented layering rule: lower layers have no knowledge of higher layers or application stores. This prevents the creep of IndexedDB calls and Zustand imports into buttons and inputs. The four-level hierarchy (Atoms, Molecules, Organisms, Templates) maps cleanly onto this app's UI complexity without requiring a fifth "Pages" layer given React Router owns route rendering.

## Notes

- **Atoms** (`src/components/atoms/`): Button, Checkbox, Input, Badge, Icon — no business logic.
- **Molecules** (`src/components/molecules/`): GroceryItem, AisleGroup, SearchBar — compose atoms, no direct store access.
- **Organisms** (`src/components/organisms/`): DefaultListEditor, WeeklyListBuilder, ShoppingView, AddItemForm — may import TanStack Query hooks and Zustand stores.
- **Templates** (`src/components/templates/`): AppShell — page layout and wireframe only.
