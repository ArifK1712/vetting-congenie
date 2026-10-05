# Vetting — Phase 1 prototype

A standalone, high-fidelity prototype of the accreditation Vetting module
(functional specification v2.0, Phase 1 only — no auto rules or fast-track).
All data is mock data generated in the browser and kept in `localStorage`.

## Run

```bash
npm install
npm run dev          # http://localhost:3000 → /en/queue
```

Other scripts: `npm test` (domain + seed tests), `npm run typecheck`,
`npm run lint`, `npm run i18n:check` (every locale has every key),
`npm run screens` (Playwright screenshots of key screens in all locales) and
`npm run e2e` (two-tab action test: claim, live update, approve, reject, escalate). Both need the dev server running.

## Using the prototype

- **Persona switcher** (top end of the header): view the product as a Reviewer,
  Team Lead, Compliance Officer, Operations Manager or Administrator.
  Permissions, visible data and navigation change with the persona.
- **Language**: English / العربية in the header. Arabic is a full RTL layout.
- **Two people at once**: open the app in two tabs and pick a different persona in each
  (Omar and Maya share the General Security Team). Claims and decisions in one tab
  appear in the other within seconds; a stale tab locks its actions until you reload.
- **Reset demo data**: in the persona menu. Data is deterministic, so a reset
  always gives the same requests.

## Structure

| Path | What lives there |
|---|---|
| `src/domain/` | Pure TypeScript rules: types, status machine, team routing, conditions, screening/matching, field access projection, queue, progress |
| `src/mocks/seed/` | Deterministic seed: events, registrations, teams, workflows, lists, ~400 requests run through the real routing and screening engine |
| `src/store/` | Zustand store (persisted, versioned) and viewer/permission hooks |
| `src/features/` | Screens: `queue/`, `request-detail/`, shared `requests/` parts |
| `src/components/ui/` | Design-system primitives (Button, Status, FilterMenu, Tabs, Menu…) |
| `src/components/shell/` | App shell: sidebar, header, providers |
| `src/design/globals.css` | Design tokens (colour, type scale, RTL overrides) |
| `src/i18n/`, `messages/` | next-intl routing, locale config, formatting, translations |

## Conventions

- No user-facing text in components — everything goes through `messages/<locale>.json`.
- Layout uses logical properties only (`ms-/me-/ps-/pe-/start-/end-/text-start`).
  Directional icons use `<DirIcon>` so they mirror in RTL.
- Dates and numbers go through `useFormat()`; Arabic uses the Gregorian calendar and Latin digits.
- Components never receive fields the viewer may not see: `projectAttendee()` strips them first.
