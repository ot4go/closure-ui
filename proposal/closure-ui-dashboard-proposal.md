# Building a tt4-style dashboard on closure-ui — control proposal

> Internal planning note. Status: **exploration / planning only** — nothing here
> is committed. The goal is to decide which existing `closure-ui` components tt4
> should adopt, and which **new custom tags** would make a dashboard like tt4
> almost free to build.
>
> Source material reviewed: `tt4/modules/tt4/templates/*.html`,
> `tt4/modules/tt4/static/tt4-*.css`, `tt4/modules/tt4/static/tt4-*.js`, and the
> full `closure-ui` component catalog (`closure-ui/doc/closure-ui.md`).
>
> **Update (2026-06-23):** reviewed against later closure-ui changes. Relevant
> deltas folded in below: `<clock-display>` gained `no-local` (hold `--:-- --`
> until the server sync, no local-time flash); `<closure-data-grid>` gained
> declarative `refresh` / `refresh-row` events + `updateRow()` (live row/grid
> refresh from a response — see `grid-updaterow-by-key-proposal.md`);
> `<signal-event>` gained `delay` (a DOM-bound timer node, handy for polling);
> `<credential-pwd>` now submits on Enter via the form's native default button
> and has a `clear-behavior` flag. The `<duration-timer>` server-sync note (§4.1)
> is **corrected**: `clock-display`'s offset is private per instance, not shared.

---

## 1. What tt4 is today (UI inventory)

tt4 is a server-rendered (Go `html/template`) time tracker. The whole UI is
hand-rolled HTML + a couple of small CSS/JS files. Five page types:

| Page | Key UI |
|---|---|
| **groups** (`groups.html`) | header, "new group" inline form, list of group cards |
| **projects** (`projects.html`) | header, breadcrumb, "new project" inline form, list of project cards |
| **list / clients** (`list.html`) | header, list of client cards |
| **project** (`project.html`) | header, breadcrumb, total bar + live clock, global IN/OUT input, tabs (Tasks / Reports), task cards with entry logs, daily report cards |
| **login / welcome** | centered auth card (logo + email/password), inline `<style>` |

Recurring hand-built patterns (each duplicated across templates):

1. **App header** — logo link, user e-mail, logout `⏻` link, `<hr>` separator.
   Repeated verbatim in `project.html`, `projects.html`, `groups.html`.
2. **Breadcrumb** — flex row of pill links, with an **inline SVG home icon**
   pasted into every template. Repeated in `project.html`, `projects.html`.
3. **List card** — name (link) + monospace total time + optional green "active
   task" badge + `client-active` highlight. The *same* card markup + CSS appears
   for groups, projects and clients (3×).
4. **Count-up timer** — `tt4-list.js` and `tt4-project.js` each re-implement
   `parseDuration` / `formatDuration` and a `setInterval` that ticks the active
   item's elapsed time every second. Two copies of the same stopwatch logic.
5. **Wall clock** — `tt4-project.js` `updateClock()` prints date + time every
   second into `#clock`.
6. **Entry log** — `.entries` block: monospace, color-coded by type
   (IN green / OUT red / NOTE blue), scrollable, with a **reverse-order toggle**
   whose state is persisted in `sessionStorage` and applied as a CSS class.
7. **Action buttons / forms** — every IN / OUT / START / STOP / NOTE / create
   action is a tiny `<form method="POST">` posting to `/api/...`, styled with
   `.btn-*` color classes.
8. **Metric bar** — the "total" panel: a big total-time value + optional cost +
   active indicator, side-by-side with the live clock.
9. **Day report** — a card per day: date + total on the header row, then a
   key/value list of task → duration.

Everything reloads the full page after each POST (classic form round-trip).

---

## 2. closure-ui design philosophy (so proposals fit the grain)

Any new control must match how the library already works:

- **Declarative custom tags, zero consumer CSS.** Pages are pure HTML; each
  component ships its own styling and is themed only through **CSS variables**
  (`--primary`, `--border`, `--text`, `--text-muted`, `--red`, `--green`,
  `--font`, `--font-mono`, …). See `examples/theming.html`.
- **Server-driven actions.** Buttons don't hand-write forms. A
  `<closure-btn ct-role="…">` fires a `btn-action` that the enclosing
  `<target-closure>` routes through a `<closure-template>` (URL + method +
  fields). The server replies with a `<closure-response>` document whose
  `<response-item>` directives the `ClosureResponse` engine executes
  (set-text, set-html, redirect, open-lightbox, clean-dirty, …). This is the
  central pattern and it replaces tt4's full-page POST/reload cycle.
- **Composition by parent/child tags** — `btn-grid` > `closure-btn`,
  `closure-data-grid` > `grid-col` / `g-row` / `g-col`,
  `closure-status-bar` > `status-part` / `status-kv`, etc.
- **A `density="sm|lg|xl"` token system** inherited from any ancestor.
- **Naming**: major workflow elements are `closure-*`; small primitives get
  plain names (`btn-grid`, `clock-display`, `data-map`, `credential-pwd`).
  New primitives below follow that convention.

---

## 3. Map tt4 → existing closure-ui components (reuse first)

Before proposing anything new, a large slice of tt4 maps directly onto
components that already exist. These should be **adopted as-is**:

| tt4 pattern | Existing closure-ui component | Notes |
|---|---|---|
| Tasks / Reports tabs | `<closure-tab-bar>` + `<closure-tab>` | drop the bespoke `showTab()` JS entirely |
| IN / OUT / START / STOP / NOTE buttons | `<closure-btn ct-role>` inside `<target-closure>` + `<closure-template>` | server replies with `<closure-response>`; no page reload |
| Button rows | `<btn-grid>` | grid layout + `--form-btn-*` theming |
| Login email/password | `<closure-form-row>` + `<closure-form-field>` + `<credential-pwd>` | `credential-pwd` defeats autofill; Enter now submits via the form's native default button, and `clear-behavior` picks soft (default) vs aggressive masking |
| "New project / group" inline form | `<closure-form-row>` + a `<closure-btn ct-role="create">` | (see also proposed `<inline-create>` sugar, §4.9) |
| Wall clock (`#clock`) | `<clock-display>` | live server-timezone clock; `small dot` variants. Add `no-local` to hold `--:-- --` until the sync (no local-time flash on load) |
| Day report task→duration list | `<closure-summary>` or `<closure-data-grid>` | summary for a compact read-only KV list; grid if it needs paging/sorting |
| Entry tables, if they grow | `<closure-data-grid>` (inline `g-row`/`g-col` or dynamic `query-definition`) | overkill for short logs (see proposed `<activity-log>`, §4.5). The grid now refreshes live from a response (`refresh` / `refresh-row` events) without a page reload |
| Logout link | `<closure-btn free url="/logout">` | `free` mode POSTs `data-*` to a URL |
| Session timeout handling | `<session-keep-alive>` | background keep-alive |
| Confirm "delete entry?" etc. | `<closure-lightbox>` (MsgConfirm/MsgAlert) | modal flows driven from responses |

**Net:** tabs, all buttons/forms, the login form and the wall clock are already
covered. What's missing is a small set of **display/dashboard primitives** that
tt4 currently re-implements by hand. Those are the proposals below.

---

## 4. Proposed new custom tags

Ordered by impact. P1 = remove the most duplicated hand-written code and unlock
the most reuse; P3 = nice-to-have sugar.

### 4.1 `<duration-timer>` — count-up stopwatch  **(P1)**

The single highest-value gap. tt4 hand-writes the same elapsed-seconds ticker
**twice** (`tt4-list.js`, `tt4-project.js`): parse `HH:MM:SS`, add a base, add
`now - start`, re-render every second. `clock-display` is a *wall clock* and does
**not** cover this — there is no count-up/elapsed component in the library.

```html
<!-- starts from a base of 02:15:00, keeps ticking because it's running -->
<duration-timer base="02:15:00" start="2026-06-22T09:00:00Z" running></duration-timer>

<!-- frozen total (not active) -->
<duration-timer base="01:42:33"></duration-timer>
```

| Attribute | Meaning |
|---|---|
| `base="HH:MM:SS"` or `base-seconds="N"` | accumulated time already on the clock |
| `start="<iso>"` | when the current run began; live time = `base + (now - start)` |
| `running` | tick every second; absent ⇒ render `base` statically |
| `format="hms\|hm\|clock"` | output format (default `HH:MM:SS`) |
| `paused` | hold the current value without advancing |

- Properties: `.seconds` (get/set), method `.stop()` / `.start(iso)`.
- Emits `tick` (throttled) and `lap` if we want split support later.
- For server-accurate ticking it would need a **shared** clock offset. Note
  `clock-display` computes its offset **privately per instance** (it is not
  exposed) — so either expose a shared offset helper first, or have
  `<duration-timer>` run its own `/api/time` sync. tt4 today trusts the browser
  clock, which is fine for elapsed time (drift over a work session is negligible).

**Before (tt4):** ~20 lines of duplicated JS per page + a hidden
`#active-start-time` input.
**After:** one tag; the active task's `.task-time` becomes
`<duration-timer base="…" start="…" running>`.

---

### 4.2 `<metric-card>` — labelled value / KPI tile  **(P1)**

tt4's "total" bar, each task's time, and each client's time are all the same
shape: a **label + a big value (+ optional secondary value / badge)**. A reusable
KPI tile is the backbone of any dashboard and the library has nothing like it.

```html
<metric-card label="Total time" accent="green">
  <duration-timer base="12:40:00" slot="value"></duration-timer>
  <span slot="sub">EUR 1,266.00</span>
  <span slot="badge">TASK active</span>
</metric-card>
```

| Attribute | Meaning |
|---|---|
| `label="x"` | caption above/below the value |
| `value="x"` | value (or use the `value` slot for rich content like a timer) |
| `sub="x"` | secondary line (cost, count, %) |
| `accent="green\|red\|primary\|gray"` | color emphasis (reuses shared tokens) |
| `icon="x"` | leading icon |
| `href="x"` | makes the whole card a navigable link |
| `active` | highlighted "currently running" state |

- A row of these is the dashboard's headline strip. Pairs naturally with
  `<duration-timer>` in the `value` slot.
- Theming via `--metric-bg`, `--metric-value-font`, plus the shared accent
  tokens.

---

### 4.3 `<list-card>` (in a `<card-list>`)  — clickable summary row  **(P1)**

The groups / projects / clients lists are the **same card markup repeated three
times** (`list.html`, `projects.html`, `groups.html`): a name link on the left, a
monospace metric on the right, an optional green "active" badge, and a
`*-active` highlight. This is begging to be one tag.

```html
<card-list>
  <list-card href="/g/acme" label="ACME" active>
    <duration-timer base="40:12:00" slot="meta"></duration-timer>
    <span slot="badge">Design sprint</span>
  </list-card>
  <list-card href="/g/globex" label="Globex">
    <span slot="meta">12:05:00</span>
  </list-card>
</card-list>
```

| `<list-card>` attribute | Meaning |
|---|---|
| `href="x"` | navigation target (whole row clickable) |
| `label="x"` | primary text |
| `active` | running/selected highlight (the green card in tt4) |
| `badge` slot | the "active task" pill |
| `meta` slot | right-aligned metric (time, count, cost) |

- `<card-list>` just owns spacing/hover/empty-state. An `empty-text` attribute
  renders tt4's *"No hay proyectos…"* placeholder automatically.
- Could optionally be data-driven later (feed from `<closure-data-source>`), but
  the slotted form covers tt4 today.

---

### 4.4 `<breadcrumb-trail>` + `<crumb>` — navigation header  **(P1)**

tt4 pastes the **same inline home-icon SVG** and pill-link markup into every
template. A breadcrumb component with a built-in home crumb removes that
copy-paste and standardizes the look.

```html
<breadcrumb-trail home-href="/">
  <crumb href="/g/acme">ACME</crumb>
  <crumb current>Website redesign</crumb>
</breadcrumb-trail>
```

| Attribute | Meaning |
|---|---|
| `home-href="x"` | renders the leading home icon as a link (icon built in) |
| `<crumb href>` | a link crumb |
| `<crumb current>` | the non-link trailing segment (current page) |

- Pure presentation; themes off the shared `--primary` / `--border` tokens to
  match tt4's pill style.
- Optional companion: an **`<app-header>`** (logo slot + user/email + logout
  `<closure-btn free>` + `<hr>`) since that block is also duplicated across the
  three list/project templates. Lower urgency than the breadcrumb but same
  rationale.

---

### 4.5 `<activity-log>` + `<log-entry>` — timestamped event feed  **(P2)**

tt4's `.entries` block is a scrollable, color-coded, **reversible** log of
timestamped IN/OUT/NOTE events. `closure-data-grid` is too heavy for a short
inline log; a focused component fits better and bakes in the reverse-order
behavior tt4 wires up by hand (incl. `sessionStorage` persistence).

```html
<activity-log reversible newest-first storage-key="tt4-order" max-height="120px">
  <log-entry type="in"   time="2026-06-22 09:00">IN</log-entry>
  <log-entry type="note" time="2026-06-22 09:30">Reviewed spec</log-entry>
  <log-entry type="out"  time="2026-06-22 11:15">OUT</log-entry>
</activity-log>
```

| Attribute | Meaning |
|---|---|
| `reversible` | show the order toggle |
| `newest-first` | default order |
| `storage-key="x"` | persist the order preference (session/local) |
| `max-height="x"` | scroll past this height |
| `<log-entry type="in\|out\|note">` | semantic type ⇒ built-in color (green/red/blue) |

- Type colors map to `--green` / `--red` / `--primary` so they're themeable.
- This directly retires tt4's `updateEntriesOrder()` + the `.reversed` CSS dance.

---

### 4.6 `<toggle-pref>` — persisted preference switch  **(P2)**

A generalization of tt4's "newest first" checkbox: a labelled toggle whose state
is persisted in storage and applied (as a class or attribute) to target
elements. Useful well beyond tt4 (compact mode, show/hide columns, dark mode…).

```html
<toggle-pref label="Newest first"
             storage-key="tt4-order"
             target-selector-all=".entries"
             toggle-class="reversed"
             default="on"></toggle-pref>
```

- Mirrors the existing `closure-btn client-action="set-value"` philosophy
  (local, no server round-trip, `target-selector*` resolution) but for a
  *persistent boolean*. If preferred, this could instead ship as a new
  `client-action` on `closure-btn` rather than a standalone tag.

---

### 4.7 `<action-bar>` — prominent input + action buttons  **(P2)**

tt4's "global-input" is a highlighted row: one text field + IN / OUT buttons that
POST together. It's composable today from a `<closure-form-row>` + `<btn-grid>`
inside a `<target-closure>`, but a thin wrapper makes the *"type a task, press
IN/OUT"* pattern a one-liner and standardizes the emphasized framing.

```html
<action-bar accent="primary" target-closure="entry">
  <input name="task" placeholder="Task name (default TASK)…">
  <closure-btn ct-role="in"  class="green">IN</closure-btn>
  <closure-btn ct-role="out" class="red">OUT</closure-btn>
</action-bar>
```

- Mostly layout + emphasis (the blue framed box). Real work is delegated to the
  closure system. Could be deferred if §4.2/§4.1 land first.

---

### 4.8 `<auth-card>` — centered login/welcome panel  **(P3)**

`login.html` and `welcome.html` both hand-write the same centered white card with
an inline `<style>` block. A small `<auth-card logo-src>` (logo + slot for the
form) removes the only inline CSS left in the app.

```html
<auth-card logo-src="/assets/logo.svg">
  <closure-form-row cols="*">
    <closure-form-field label="Email"><input type="email" name="email" required></closure-form-field>
    <closure-form-field label="Password"><credential-pwd name="password" required></credential-pwd></closure-form-field>
  </closure-form-row>
  <closure-btn ct-role="login" class="primary">Entrar</closure-btn>
</auth-card>
```

---

### 4.9 `<inline-create>` — one-line "create new" row  **(P3)**

Sugar for tt4's "new group / new project" pattern: a single text input + create
button that posts through a closure. Trivial, but it appears on two pages and the
shape is identical.

```html
<inline-create placeholder="New project…" ct-role="project-new" data-group-id="42"></inline-create>
```

---

## 5. Coverage summary

| tt4 hand-built piece | Resolution |
|---|---|
| Tabs, all action buttons/forms, login fields, wall clock, modals, session | **Existing** components (§3) |
| Count-up timer (×2 JS copies) | **New** `<duration-timer>` (P1) |
| Total bar / per-item metric | **New** `<metric-card>` (P1) |
| Group/project/client cards (×3) | **New** `<card-list>` / `<list-card>` (P1) |
| Breadcrumb + inline home SVG (×N) | **New** `<breadcrumb-trail>` / `<crumb>` (P1) |
| Entry log + reverse toggle | **New** `<activity-log>` / `<log-entry>` (P2) |
| Persisted order preference | **New** `<toggle-pref>` (P2) |
| Global IN/OUT input | **New** `<action-bar>` (P2) |
| Login/welcome card, new-item form | **New** `<auth-card>`, `<inline-create>` (P3) |

After P1 + P2, tt4's bespoke CSS/JS shrinks to almost nothing: the page becomes a
composition of declarative tags, and the same tags carry over to any other
dashboard.

---

## 6. Suggested build order

1. **`<duration-timer>`** — smallest, highest reuse, retires duplicated JS.
   (Server-accurate ticking needs a shared clock offset, which doesn't exist
   yet — see §4.1; trusting the browser clock is fine to start.)
2. **`<metric-card>`** + **`<card-list>`/`<list-card>`** — the dashboard's visual
   backbone; both consume `<duration-timer>` in a slot.
3. **`<breadcrumb-trail>`/`<crumb>`** (+ optional `<app-header>`) — kills the
   copy-pasted header/breadcrumb markup.
4. **`<activity-log>`/`<log-entry>`** + **`<toggle-pref>`** — the project page's
   event feed.
5. **`<action-bar>`**, then the P3 sugar (`<auth-card>`, `<inline-create>`).

Each is independent and themeable through the existing CSS-variable system, so
they can ship one at a time without touching the rest of the library.

---

## 7. Open questions

- **`<duration-timer>` source of truth** — trust the browser clock (fine for
  elapsed time) or sync to the server? There is **no shared clock offset** today
  (`clock-display`'s is private per instance), so server-accurate timers would
  first need a shared offset helper exposed. Trusting the browser clock is the
  pragmatic v1.
- **Data-driven vs slotted** — `<card-list>` / `<activity-log>` are shown here in
  slotted (server-rendered children) form, matching tt4's current Go templates.
  Do we also want a `<closure-data-source>`-fed mode for SPA-style refresh?
  (A declarative live-refresh path now exists — `<closure-data-grid>`'s
  `refresh` / `refresh-row` events, driven from a response or a delayed
  `<signal-event>` for polling — which a data-driven `<card-list>` / `<activity-log>`
  could mirror.)
- **`<toggle-pref>`: tag or `client-action`?** A standalone tag is more
  discoverable; a new `closure-btn`/checkbox `client-action` is more consistent
  with the existing local-action mechanism. Pick one.
- **Scope** — are these meant to live in `closure-ui` as general primitives, or
  in a tt4-specific layer on top? The P1/P2 set is generic enough to belong in
  `closure-ui`; the P3 items are closer to tt4-specific sugar.
</content>
</invoke>
