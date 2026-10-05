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
`npm run e2e` (two-tab action test: claim, live update, approve, reject, escalate) and
`npm run e2e:teams` (create, deactivate rules, field access reaching Request Detail,
two-tab edit conflict, read-only lead) and `npm run e2e:workflows` (create, publish
checks, publish, allot with a clash, versions, undo, unsaved-changes guard, edit conflict) and
`npm run e2e:blacklist` (add from a request, second-person approval, badge suspension,
not approving, removal, import) and `npm run e2e:watchlist` (add from a request, marks and
emails, a lead clearing a match, move to blacklist, removal, import) and `npm run e2e:matches`
(confirm, not the same person, suspended badge, link from Request Detail). Screenshots and e2e need the dev server running.

## Using the prototype

- **Persona switcher** (top end of the header): view the product as a Reviewer,
  Team Lead, Compliance Officer, Operations Manager or Administrator.
  Permissions, visible data and navigation change with the persona.
- **Language**: English / العربية in the header. Arabic is a full RTL layout.
- **Two people at once**: open the app in two tabs and pick a different persona in each
  (Omar and Maya share the General Security Team). Claims and decisions in one tab
  appear in the other within seconds; a stale tab locks its actions until you reload.
- **Teams** (Sara edits; Lina and Daniel see them read-only): list, detail
  (Overview, Members, Used in stages, History) and the create / edit form with the
  field-access matrix. Saving field access changes what members see on Request
  Detail straight away; a team with open requests or a live stage can't be deactivated.
- **Workflows** (English only, by product decision; stays English and left-to-right
  when the app is in Arabic): list with coverage check, and a builder with a block
  palette, React Flow canvas, settings panel, publish checks, versions and allotment.
  Sara edits and publishes; Daniel sees workflows read-only. Media has unpublished
  draft changes and Contractor Night Access is an unfinished draft, for demoing.
- **Blacklist** (English only, like Workflows): list with filters, a "Waiting for approval"
  queue, add / edit form (also from a request's "Add to blacklist"), entry detail with the
  proposed-change comparison, matches and history, and CSV import with a row check. Arif and
  Sara can both propose and approve, but never their own proposal: propose as one, approve
  as the other. Approving re-checks current requests and suspends matching approved badges.
- **Watchlist** (English only): list with level, on-match action and match counts; add /
  edit form (saved directly, no second approval; also from a request's "Add to watchlist");
  entry detail with matches you can clear as "Not the same person"; move to blacklist;
  CSV import. Saving marks matching requests (never suspends badges). "Mark and add a review
  stage" inserts one extra stage before final approval. Sara and Arif manage; Lina views.
- **Match Review** (English only): open blacklist matches, ID matches first, with a side-by-side
  applicant / entry comparison. Confirm rejects the request as Blacklisted (or revokes a
  suspended badge); Not the same person sends it back to its stage (or restores the badge) and
  the pair never matches again. Arif and Sara decide.
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
