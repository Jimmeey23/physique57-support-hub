# Physique 57 — Support & Ticket Hub

[![Tests](https://github.com/Jimmeey23/physique57-support-hub/actions/workflows/ci.yml/badge.svg)](https://github.com/Jimmeey23/physique57-support-hub/actions/workflows/ci.yml)
[![Deploy site](https://github.com/Jimmeey23/physique57-support-hub/actions/workflows/deploy.yml/badge.svg)](https://github.com/Jimmeey23/physique57-support-hub/actions/workflows/deploy.yml)
[![Live demo](https://img.shields.io/badge/live%20demo-physique57--support--hub-1f5bff?logo=githubpages)](https://jimmeey23.github.io/physique57-support-hub/)

> **Independent demo, not affiliated with Physique 57 or Momence.** The brand names are used only to
> describe what the product vocabulary was compiled against; they are their owners' trademarks. Every
> person in this repo is synthetic — the members, coaches, studios, bookings and tickets are generated
> demo records, and the taxonomy and field plan in `data/` are this project's own working documents.
> Nothing is posted anywhere: the running app keeps its board in your browser's `localStorage`, and the
> Momence surface is served from `src/data.json` behind the same read contract the real API documents.

The 14-category / 296-sub-category taxonomy and the 3,152-row intake-field plan are compiled into
`src/data.json`. The app renders them as a triage grid, generates a bespoke form per sub-category,
links the form into a Momence-shaped member/class directory, files a routed ticket with running
SLA clocks, and tracks the whole board on one dashboard — including repeat-report counting,
resolution capture, review-before-filing, and a settings layer for appearance and integrations.

## Run it

```bash
npm install
npm run dev      # vite dev server, 0.0.0.0:5173
npm run build    # production bundle in dist/
npm test         # 486 assertions: 171 logic/render · 125 + 104 driven interactions · 86 in a real DOM
npm run data     # regenerate src/data.json from the Phase-1 CSVs, then enrich it
npm run enrich   # just re-fold the reference repo's constants into src/data.json
```

## Ship it

The repo is self-contained, so a clone can run and rebuild everything without the sandbox it grew in:

```bash
git remote add origin https://github.com/<you>/physique57-support-hub.git
git push -u origin main
```

`.github/workflows/ci.yml` runs the full 486-assertion suite on every push and pull request;
`.github/workflows/deploy.yml` runs it again, builds `dist/` and publishes it to GitHub Pages, so a
merge to `main` is the deploy — the site lives at
<https://jimmeey23.github.io/physique57-support-hub/> and Pages is configured with
**Source: GitHub Actions** (`build_type: workflow`), which is the only setting the workflow needs.
`base: './'` in `vite.config.js` is what lets the same build sit under the `/physique57-support-hub/`
subpath a project site is served from: the deployed shell asks for `./assets/index-*.js`, not `/assets/…`.

`npm run data` rebuilds `src/data.json` from the two CSV deliverables, which are vendored in `data/`
(1.1 MB of intake-field rows and the taxonomy) rather than left in a scratch folder; `docs/` keeps the
matching human-readable plans and the historic label mapping. The reference repo's `constants.ts` is read
only when `IRIS_REPO` points at a checkout — without it the committed `src/constants.json` is reused, so
regeneration is deterministic offline. `src/data.json` itself is committed on purpose: it is the app's
runtime store, and there is no build step between cloning and a working demo.

Everything is client-side. Tickets and workspace choices live in `localStorage`
(`p57.hub.v1.tickets`, `.archived`, `.theme`, `.prefs`); nothing is posted anywhere. On a first run
the board self-seeds 16 demo tickets so it is never empty.

## Screens

| View | What it does |
| --- | --- |
| **Raise a ticket** | Two-step triage grid — 14 category cards, then that category's sub-categories. Each card previews its desk, escalation chain, SLA tier and how often that issue appeared in the 464-ticket historic log. Filtering shows skeleton rows rather than swapping the grid. |
| **Intake** | A form generated from the field plan for that exact sub-category: sections, required counters, per-studio room lists, conditional fields that appear only when their parent is answered, and **linked lookups** for member/class/ticket fields. The side panel shows where the ticket will go, which clock it starts on, and which directory records are attached. |
| **Review before filing** | Nothing is created until the desk reads the whole ticket back: the routing chain, both clocks, every answered field grouped by section, the linked records, and any blocker with a jump-to-field button. |
| **Live queue** | Every open ticket: filter by status / priority / studio / department / owner, sort, expand a row for the full answer set, log a first response, escalate, change status, resolve through the capture panel, link a repeat report, open the member or class record, copy a handover note, export. |
| **Analytics** | First-response attainment, median clocks, live breaches, load by category / priority / owner / studio, and a studio × weekday filing heat. |
| **Settings** | Appearance (theme, three surface presets, three densities, motion switches), the SLA model compared side by side with the reference repo's, the integration state for Momence (with a real list/page/detail probe of the local dataset), and what the build knows. |

Shortcut row: `⌘K` command palette (every category, hot sub-category, owner, view) · `/` search ·
`n` new ticket · `q` queue · `c` class desk · `r` trainers · `i` analytics · `s` settings · `t` theme
· `?` help · `Esc` back.

## Linked lookups (the Momence layer)

`src/momence.js` mirrors the reference implementation's module contract — `listMomence(module,
{query, page, pageSize, startAfter, startBefore, locationId, studio, upcoming})` and
`detailMomence(module, id)` returning `{item, related, source, page, hasMore, errors}` — but serves
a deterministic local dataset (65 members, ~160 classes across a rolling two-week schedule, 43
membership packages, bookings, notes and sales) because this is a static build with no server and
no studio credentials. `source: 'demo'` is what drives every "Demo records are read-only · connect
Momence" affordance, exactly as the reference behaves before a connection. Pointing the same call
sites at the real API replaces two functions; no field, form or ticket shape changes.

- **Field types.** 232 fields in the plan are linked lookups (`module: member | session | ticket`)
  instead of free text: `member_name`, `member_email`, `member_id`, `class_date`, `session_point`,
  `linked_ticket`, `valet_ticket`, `ticket_vendor` and their sub-category twins.
- **Values stay plain text.** A picked record is stored as `Priya Mehta [#481102] ·
  priya@example.com`, so validation, handover text, exports and old tickets keep working;
  `decodeLookup` turns it back into a record for the chip, the panel and the modal.
- **Picking fills the form.** Choosing a member writes name/email/phone/ID/membership; choosing a
  class writes format, trainer, studio, start time and the taxonomy's own "when" phrasing.
- **Gating.** A staff-reported ticket must name a member, and a class-impacted ticket must link a
  class — the same two rules the reference enforces, surfaced as an inline blocker rather than a
  silent skip.
- **Ticket search, not typing.** `linked_ticket` verifies the number against the board ("matched" /
  "not on this board"), and `⌘`-clicking *find a ticket* opens the merge question instead.
- **Repeat reports.** Linking increments `recurrenceCount` and appends a dated note to the ticket
  already open; a class-blocking repeat raises its priority; three reports auto-escalate to L1. One
  fault keeps one clock.

## Modals

`src/modals.jsx` + `src/lookups.jsx`: review-before-file, resolution capture (root cause, action,
outcome, member follow-up, prevention, owner notes — cause and action are required), repeat-report
linking with a live preview of what merging will do, member and class record viewers
(overview / memberships / bookings / notes / sign-ups / cancellations / check-ins / raw payload
tree), the settings workspace, the guided powerCycle report, and the command palette.

The guided report asks the reference repo's own `CYCLE_INTAKE_QUESTIONS` and cites its SC3 part
catalogue (tools and torque per part); answers land on whichever fields the open sub-category
actually has, so the same template works on a cycle-fault form and on a generic one.

## The intake form

`src/forms.jsx` renders whatever `buildFieldPlan` generated — it never hand-codes a field, so the
3,152-row plan is the only source of truth. Fields are grouped into the sections the taxonomy
implies, each collapsible with its own answered-counter, under one progress band; the grid is
`repeat(auto-fill, minmax(268px, 1fr))` so 46 fields on a wide desk fill the page instead of
forming a column of orphans.

Every answer type gets a control that suits the question, all of them sharing one box (39px tall,
same padding, tabular numerals where numbers matter): text, textarea (collapses to 3 rows, expands
on focus with a character count), number with ± steppers, url with a parsed host chip, single
choice as a native select with the option count beside it, small enums as radio cards, **two-way
answers as a switch** (`city_rate`, any 2-option field) with the native radios kept underneath so
the value serialises identically, and **multi-select as a chip set** with a live `n of m picked`
counter, a filter box, all/clear and a disabled mirror select. Dates use one `datetime-local`
styled like every other control plus backdating shortcuts and a human read-back line. Each field
carries a `data-tip` tooltip (CSS-only, so no JS listener per field) and an `auto / required /
conditional / optional` badge.

The reporter block is **prefilled from the desk identity** remembered on this device
(`DESK_PERSONAS` → `reporterFields` → `withReporterDefaults`), with the studio's shared mailbox when
the reporter is a member and the person's own address when it is staff; a member linked from the
directory outranks both. Prefill never overwrites a typed answer, and it marks what it wrote with
an `auto` chip that disappears the moment the desk edits the field.

`TicketSheet` (opened by clicking a ticket) is the same record read the other way: narrative line,
both SLA clocks live in the header, two sentences of description built only from stored answers,
four outcome tiles, every answer grouped and numbered under the section that asked it, the
lifecycle rail with the stages already reached, the routing chain, the class block with its read-only
roster, the resolution record, and the desk's actions in the footer.

## How tickets are built

`src/core.js` is the model; the UI never computes routing or timing itself.

- **Routing** follows the desk rules given for this rollout, not the repo's old scoring model:
  - Studio ops · amenities · repair/maintenance · facilities · vendors · AMCs · equipment · SOPs → **Zahur Shaikh** (Mumbai), L1 Saachi → L2 Mitali. Bengaluru → **Shifa Ali**, escalating into Saachi/Mitali.
  - Trainers · method · class method · music → **Mrigakshi + Vivaran** (Mumbai), **Pushyank** (Bengaluru), escalating to **Anisha Shah**.
  - Membership · pricing · discounts · sales · client servicing · freezes · class experience → **Akshay Rane** (Kemps/Courtside) / **Shipra Pinge** (Bandra Supreme HQ) / **Api Serou** (Bengaluru); Mumbai escalates to **Jimmeey Gondaa**, Bengaluru L1 Shifa → L2 Jimmeey.
  - Marketing · PR · collabs · Barrepreneur · ambassadors → **Shaina**, then **Reyna**.
  - Accounts & finance → **Gaurav Sogam**, then **Sachin Nalawade**.
  - Tech / IT / systems → **Zahur first in both cities**, then **Milind (IT)**.
  - Class scheduling follows the training chain; trainer-swap requests follow the ops chain.
- **Priority** starts at the sub-category's taxonomy tier. The reporter's answers may only *raise*
  it (immediate danger or injury language → critical; blocked class, "could not proceed",
  8+ members affected, churn risk, confirmed staff involvement → at least high). An egress/hazard
  sub-category floors at critical. `inferPriority` is pure, so the same rules apply to imports.
- **SLA** is two clocks per ticket, first response and resolution, taken from the taxonomy tier
  (critical 0.5h/4h · high 2h/12h · medium 8h/48h · low 24h/120h; safety P1 15 min/2 h; any
  sub-category with ≥10 historic tickets tightened to a 2 h first response). An open clock shows
  `ok / risk / breach` — never "met"; "met" is reserved for a closed ticket that actually made it.
  A missing `hours` block falls back to the priority tier so an old or hand-edited record can't
  crash the board. Settings → SLA shows the reference repo's single-clock hours next to these.

## Generated data

`scripts/gen-data.mjs` builds `src/data.json` from the two Phase-1 CSVs: 14 categories, 296
sub-categories, 23 universal fields + 3,129 sub-specific rows, studios and their room plans.
`scripts/enrich-repo.mjs` (`npm run enrich`, also chained onto `npm run data`) reads
`/home/user/build/artifacts/repo/src/lib/constants.ts` — the same file the reference app uses — and:

- writes `src/constants.json`: studios (with `momenceLocationId`), 24 class formats, 23 studio
  areas + 26 named rooms from the studio layouts, 12 systems, 20 trainers, 43 membership
  packages, 33 equipment types, the occurred/reported-by vocabularies, `STATUS_LABELS`,
  `PRIORITY_SLA_HOURS`, the cycle intake questions and the SC3 parts catalogue;
- folds those lists into the existing option pools (`trainer`, `asset_type`, `systems`,
  `occurred_relative`, `reporter_type`, `membership`, `asset_condition`, …) instead of shipping
  near-duplicates of them;
- converts the member/class/ticket fields into linked lookups.

It is read-only on the repo and idempotent: a field that stops being a lookup is restored to its
plain select, and every list is deduped, so re-running never leaves stale types or duplicate
options. Interned option lists are widened **in place** — a pool shared by more than one field id is
forked instead, so trainer names can never leak into an unrelated Yes/No list.

- `subFields["Category|||Sub-category"]` is the list of extra fields for that form; the universal
  block is prepended by `forms.jsx`.
- A field marked conditional carries `dependsOn` (or `condText` prose, resolved at render time by
  `conditions.js`) and stays hidden until that parent is answered. Such a field is never also
  `required`, so a form can never hide something it then blocks submit on.
- Option lists are stored once in `opts` and referenced by `optsRef`; `core.js` hydrates them in
  place at import (4,613 field rows share 134 distinct lists — the payload is ~23% smaller).

## Skin

One component set, two skins, driven entirely by custom properties on `<html>` — nothing in the app
hard-codes a colour, and `index.html` reads the saved prefs before first paint so a dark desk never
flashes white.

| Token layer | Light | Dark |
| --- | --- | --- |
| Paper | `--bg #ffffff`, `--bg2 #f3f5f9`, `--card2 #f7f9fc`, sunken wells `--sunk` | matte `--bg #08090b`, `--card #101319`, `--sunk #0a0c10` |
| Accent | one blue family — `--brand #1f5bff`, `--brand2 #4b8bff`, `--brand3 #0a3ed1` | neon `--brand #38d2ff` with `--brand2 #4f8dff` and `--accent #57ffb9` |
| Text | `--ink #070d1a` on white (≈19:1) | `--ink #eef3fb` on matte black (≈17:1) |
| Depth | blue-tinted three-layer shadows, `--hair` inner lines | deeper blacks plus a brand-coloured halo in `--shadow-lg` |
| Risk | `--crit #d92746`, `--high #bd6f0b`, `--ok #0d8a5f` | `--crit #ff5470`, `--high #ffc861`, `--ok #38f0a4` |

Contrast on a filled control follows the theme (`--onbrand`), so a selected chip stays legible as
white-on-blue in the light and ink-on-neon in the dark.

**Modals** are lifted glass: `color-mix` scrim with `blur(18px) saturate(1.6)`, `--r3` radius, a
gradient header with a lit hairline under it, `overflow:hidden` so nothing escapes the rounded
corner, a blurred footer, and a spring entry (`modal-pop`, `cubic-bezier(.22,1.16,.32,1)`) that
settles instead of sliding.

**Motion** is layered, never decorative-only: a drifting ambient wash behind the app, a hairline that
travels the topbar, a sheen that crosses a button on hover, `rise` waves through the triage and
settings grids, chips that lift, clocks that pulse `alarm` when a ticket breaches, a spring tick on
every row and switch, focus rings on `:focus-visible`. `@media (prefers-reduced-motion:reduce)` and
the workspace's motion switch (`<html data-motion=calm>`) turn all of it off.

**Elements** are reworked through tokens: raised fields with a blue focus ring, real select carets
(an inline SVG data-URI, recoloured per theme), pill nav with a lit current tab, segmented filters,
chips, avatar stacks, inset wells for anything that holds a list, and tabular numerals wherever a
number should line up. The three surface presets re-tune the same tokens — `editorial` drops the
lifts, `glass` turns the cards translucent, `contrast` strips glow and thickens the lines for the
front-desk iPad in sunlight.

## Tests

`test/run.mjs` — logic + render assertions: every routing rule above, priority inference in both
directions, SLA state transitions, handover/export text, the form-composition rules, the Momence
contract (paging, query, studio/upcoming scoping, 404 on a missing record, related memberships,
bookings and notes, populate-member/populate-session, reference round-trip and ranking), the desk
identity (email derivation, which persona a subject implies, that a linked member outranks a guess,
that prefill only fills what is empty, refreshes a stale auto value and drops the badge on an edit),
the narrative line (derived, capped, unique across identical reports) and `describeTicket`, plus
server-rendering `App`, `FormEngine`, every modal, `TicketSheet`, `Countdown`, `Pill`,
`OwnerCell`… and asserting on the markup (including that no raw SVG source or `undefined` leaks
into it).

`test/browser.mjs` — the same app mounted in a real DOM (esbuild + jsdom), so the sheet is checked
where React actually paints: the stylesheet parses and reaches the elements, every class the markup
uses has a rule and every rule reaches markup (417 class tokens, 1,133 rules, no dead weight and
none left unstyled), the class desk, roster, trainer grid, modal chrome, clocks and
responsive/density rules behave as written, and the board survives an unmount/remount cycle. The
form gets the same treatment: computed styles prove text, number, url, search, time, date,
`datetime-local`, select and textarea all resolve to one box (the bug the desk reported), the grid
resolves, the staggered entry has an off switch, the empty-submit shake and the answered tick are
real rules, every tooltip is a sentence that never leaks as copy, chips/switch/stepper/date
shortcuts respond to clicks, and neither the page nor a toast renders markup as text. The skin has arithmetic behind it too: contrast is computed from
the token blocks and asserted (main text ≥ 12:1, every accent and status colour ≥ 4.5:1 on paper, in
wells and on the grid gray — 54 combinations), the light skin must be `#ffffff` and the dark one
matte, and no rule may hard-code white onto a filled control.

`test/flow.mjs` + `test/flow2.mjs` — the same components driven by real clicks and typed answers
through `react-test-renderer`. Half 1: open a category → pick a sub-category → submit an empty form
(refused, nothing written) → answer every control type → review → file → find the ticket → log a
first response → escalate → change status → resolve through the capture panel → then the lookup
half: search a member, open their record and its tabs, search the board for a ticket to link,
verify the reference, file it, and prove the older ticket counted the repeat. Half 2 runs on a fresh mount (React state can otherwise re-persist over a reset store) and covers the
Bengaluru and Bandra client-servicing desks, cross-city routing, the guided cycle template, settings
presets, the motion switches (proving appearance settings change the render, not only storage), insights
reconciliation and reload recovery, and the form half on its own mount: sections and the progress band,
the prefilled reporter block with its `auto` chip, switching desk identity re-painting only what nobody
touched, the date control with its shortcuts, a gated two-way answer arriving as a switch, all/clear/filter
on a multi-select, then filing that ticket and reading it back as a sheet — narrative line, both clocks,
the lifecycle rail, grouped answers and an action taken from the sheet.

Both harnesses bundle the real `src/` through esbuild (`test/harness.mjs`) — they execute the code
the browser gets, not a re-implementation of it.
