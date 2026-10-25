# Interactive Character Sheets — architecture

## Audit (2026-10-26)

The current `main` branch is a Vite + TypeScript Owlbear Rodeo SDK v2 extension. `src/main.ts` is a single large module for token selection, room-metadata character templates, and token-copy synchronization. The current interface is entirely token-centric; it does not import JSON or render a character sheet. `public/manifest.json` is version 0.1.3 and Pages deploys on pushes to `main`.

## New product model

- GM imports a D&D 5e character JSON file and sees a validated preview before saving.
- Each imported character has a stable extension ID and an assignment to an Owlbear room player ID.
- Players see only the sheet assigned to their own player ID; the GM can open and edit every sheet.
- The sheet UI is structured into Overview, Abilities, Skills & Saves, Combat, Inventory, Features, Spells, and Notes when matching data exists.
- Unknown fields remain available in a raw-data/unsupported-fields panel instead of being silently discarded.
- Import adapters are isolated from UI code. D&D 5e is the first adapter; later formats can be added without rewriting the sheet UI.

## Security and storage constraints

Owlbear room metadata is shared room data and documented as limited to under 16 kB total. It must not be treated as a private per-player database. Filtering the UI alone is not a security boundary: if every client receives every character's full JSON, a player could inspect another sheet through developer tools.

Therefore the first branch introduces the import/normalization foundation and UI architecture, but a production implementation of strict privacy needs a trusted storage/API layer that authenticates the Owlbear player and authorizes each read/write on the server. Do not put full private sheets in room metadata or pretend client-side filtering makes them secret. Until that backend exists, mark the feature as a prototype and do not claim strict confidentiality.

## Data model (target)

- `CharacterSheet`: `id`, `name`, `system` (`dnd5e`), `ownerPlayerId`, `normalized`, `sourceFormat`, `updatedAt`.
- `normalized` has typed common D&D 5e fields plus `raw` for source fields not mapped yet.
- Editing updates a specific sheet field and records the latest update timestamp. GM can edit any sheet; a player can edit only the sheet assigned to their own player ID.
- Import is size-limited, parses JSON safely, rejects non-object roots, and never executes imported content.

## Acceptance criteria

1. Invalid JSON produces a readable error and no partial save.
2. Common D&D 5e fields normalize across source variants (ability scores, HP, AC, level, proficiency, skills, equipment, spells).
3. Unknown fields survive import/export.
4. GM can assign and reassign sheets to room players.
5. Player UI shows only the current player's assigned sheet.
6. Authorization is enforced by a trusted backend before claiming that other sheets are inaccessible.
7. `npm run build` passes and multi-client behavior is tested in a real Owlbear room.
