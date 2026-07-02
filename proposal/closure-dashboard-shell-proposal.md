# `<closure-dashboard>` — dashboard shell (fixed header + side nav + client area)

> Internal planning note. Status: **exploration / planning only** — nothing here
> is committed. Companion to `closure-ui-dashboard-proposal.md`, which catalogs
> dashboard *content* primitives (metric cards, timers, breadcrumbs…). This note
> covers the missing piece around them: the **layout shell** — a classic
> dashboard frame with a fixed header, a collapsible side navigation panel, and
> a scrollable client area wired to the closure system.

---

## 1. Motivation

Every dashboard page hand-builds the same frame: a header pinned to the top, a
nav column on the left, and a content region that scrolls independently. Doing
this by hand means page-level CSS (viewport sizing, scroll containment,
responsive collapse) — exactly what closure-ui pages are not supposed to carry.
The shell belongs in a component that ships its own layout, is themed through
CSS variables, and connects navigation to content through the existing
`<target-closure>` machinery instead of full page reloads.

The tt4 proposal already flags the duplicated app header (§4.4 "optional
companion: `<app-header>`"). This proposal absorbs that idea into a single
**global control with dedicated child tags** — the same composition style as
`closure-status-bar` > `status-part` or `closure-data-grid` > `grid-col`.

A hard requirement up front: **the closure machinery is available, never
mandatory**. The shell must be fully usable as a dumb layout with plain links
(§4 rung 1) — connected forms, templates and response directives are opt-in
rungs on top, not assumptions baked into the design.

---

## 2. Anatomy

One global element, three regions declared as children:

```html
<closure-dashboard label="tt4 — Time Tracker" logo-href="/">

  <dash-header>
    <!-- free content, right-aligned in the fixed header -->
    <clock-display small dot></clock-display>
    <closure-btn free class="small" url="/logoff">⏻</closure-btn>
  </dash-header>

  <dash-nav>
    <dash-nav-group label="Tracking">
      <dash-nav-item name="home"     url="/dash/home" selected>Home</dash-nav-item>
      <dash-nav-item name="projects" url="/dash/projects" badge="3">Projects</dash-nav-item>
    </dash-nav-group>
    <dash-nav-item name="reports" url="/dash/reports">Reports</dash-nav-item>
    <dash-nav-item panel="settings">Settings</dash-nav-item> <!-- local panel, no fetch -->
    <dash-nav-item href="/help">Help</dash-nav-item>   <!-- plain full navigation -->

    <!-- free content mixes with the selector: buttons, mini forms… -->
    <closure-btn free class="small" url="/api/punch">Quick IN</closure-btn>
    <form closure="main">
      <input name="q" placeholder="Search…">
    </form>
  </dash-nav>

  <dash-client>
    <target-closure name="main">
      …initial server-rendered content…
    </target-closure>
    <dash-panel name="settings">
      …in-page panel, shown when its nav item is picked…
    </dash-panel>
  </dash-client>

</closure-dashboard>
```

```
┌──────────────────────────────────────┐
│ ☰  ◆ tt4 — Time Tracker    12:03 ⏻  │  ← fixed header (never scrolls)
├──────────┬───────────────────────────┤
│ TRACKING │                           │
│  Home    │      client area          │
│  Projects│   (its own scrollbar)     │
│ Reports  │                           │
│ Help     │                           │
└──────────┴───────────────────────────┘
   side nav (collapsible via ☰)
```

Layout strategy: the host is a flex column sized to the viewport
(`height: 100dvh` by default, overridable), the header is a fixed-height row,
and the nav + client row takes the rest with `min-height: 0`; the client area
is the **only** scroll container (`overflow: auto`). The header is therefore
"fixed" without `position: fixed` — no page-level CSS, no scroll bleed.
Shadow DOM like the newer components; the three child tags are assigned to
named shadow slots by tag name.

---

## 3. The tags

### 3.1 `<closure-dashboard>` (global control)

| Attribute | Description |
|---|---|
| `label="x"`      | app title in the header |
| `logo-href="x"`  | makes the title/logo a home link |
| `collapsed`      | boolean, reflected — side nav hidden. The hamburger toggles it; source of truth like `expanded` on `<closure-lazy-iframe>` |
| `closure="name"` | optional: name of the target-closure that receives nav loads (default: first `<target-closure>` inside `<dash-client>`) |

| Method / property | Description |
|---|---|
| `select(name)`            | activate the item programmatically (same path as a click) |
| `collapse()` / `expand()` / `toggle()` | side nav visibility |
| `selected` (getter)       | `name` of the active item |

| Event | Bubbles | Cancelable | Detail |
|---|---|---|---|
| `dash-nav`    | no | yes | `{ name, url }` — before loading; `preventDefault()` blocks the load and the selection change |
| `dash-loaded` | no | no  | `{ name, url }` — response rendered into the closure |
| `dash-toggle` | no | no  | `{ collapsed }` |

### 3.2 `<dash-header>`

Free-content region rendered at the right end of the fixed header (clock, user
menu, logout…). Pure slot — no behavior of its own. The hamburger, logo and
`label` are built into the shell, not into this tag.

### 3.3 `<dash-nav>` / `<dash-nav-group>` / `<dash-nav-item>`

Navigation is **out and in**: an item either leaves the page (`href`), or
navigates inside the dashboard — by switching to an in-page panel (`panel`)
or by fetching content (`url`). The three modes mix freely in one nav.

| `<dash-nav-item>` attribute | Description |
|---|---|
| `name="x"`   | identity for selection / `select(name)` / server directives |
| `url="x"`    | **fetch mode (in)**: GET the url, render the response into the client area (through its closure when present, §4), mark selected — no page reload |
| `panel="x"`  | **panel mode (in)**: show the `<dash-panel name="x">` in the client area, hide the other panels — no fetch at all, tab-bar style but vertical |
| `url` + `panel` | **fetch-into-panel mode (in)**: first selection GETs the url into that panel (created automatically if absent from the markup); later selections just switch panels, keeping DOM state. The `<closure-lazy-iframe>` doctrine applied to panels: load on first visit, alive thereafter |
| `refresh`    | with `url`+`panel`: re-fetch on **every** selection instead of only the first (for always-fresh sections) |
| `target="sel"` | with `url`: render into an arbitrary **container** matched by the CSS selector (resolved inside `<dash-client>` first, then document-wide) instead of the default region — same `target-selector` spirit as `closure-btn` client actions |
| `lightbox` / `lightbox="id"` | with `url`: render into a **dialog** — the referenced `<closure-lightbox>` (or a spawned throw-away one) via its existing `showResponse()`. The item does not change the selection: it is an action, not a place |
| `href="x"`   | **link mode (out)**: plain full navigation (server re-renders the shell with the new `selected`) |
| `activate-on="event"` | activate this item when that `<signal-event>` name fires on `document` (see "The dialog answers back", §3.3) — combined with `refresh`, activation re-fetches |
| `selected`   | boolean, reflected — the active item |
| `badge="x"`  | small counter/pill at the item's right edge |
| `icon` slot  | optional leading icon |

`url` **without** `panel` targets the shared default region (§ below) and
replaces its content on each navigation — the right shape when sections are
cheap server renders and holding N loaded sections in the DOM isn't wanted.
With `panel`, each section gets its own preserved region. Both shapes mix in
one nav.

**The render target generalizes to dialogs and containers.** A fetched
response can land in: the default region (`url` alone), a preserved panel
(`url`+`panel`), an arbitrary container (`url`+`target="sel"`), or a dialog
(`url`+`lightbox`). The dialog path reuses what the library already has —
`<closure-lightbox>.showResponse()` and the same philosophy as the
`response-lightbox` attribute on captured forms/anchors — the shell adds no
new dialog machinery. In every case the container/dialog resolves its own
closure if it has one (ladder, §4).

**The dialog answers back with `<signal-event>`.** A lightbox hosting a
closure is a self-contained action; when it completes, the server's response
can carry a `<signal-event>` — the existing one-shot dispatcher that fires
its `CustomEvent` on `document` when parsed and removes itself. That is the
decoupled return channel from dialog to dashboard: the shell, a panel, or a
grid subscribes by event name and reacts — refresh a panel (`refresh` on a
grid already works this way), update state, re-fetch a section — without the
dialog knowing anything about who listens. Combined with
`<dashboard-response-item>` (§3.4) for shell-directed effects, a "New entry"
dialog flow is: item opens lightbox → form posts through the lightbox's
closure → response says `<signal-event name="entry-created" data-id="42">` +
`<lightbox-response-item type="close">` → the Reports panel hears
`entry-created` and refreshes. Every piece of that chain already exists.

A signal must also be able to **activate a selector item**. Two declarative
paths, both cheap:

- **Well-known signal, handled by the shell**: the shell registers (on
  connect, so before any response parses) a `document` listener for
  `dash-select`; `<signal-event name="dash-select" data-item="reports">` in
  any response — dialog or panel — runs the same pipeline as a click on
  `select("reports")`, including the item's fetch/refresh semantics.
- **Per-item subscription (sugar)**: `<dash-nav-item activate-on="entry-created">`
  activates itself when that domain event fires — the server emits its
  domain signal and doesn't need to know nav item names. With `refresh`, the
  activation re-fetches, so "dialog saved → Reports selected and fresh" is
  pure markup.

### `<dash-panel>`

`<dash-panel name="x">` — a named in-page region of `<dash-client>`, hidden
until its nav item selects it (the initially `selected` item's panel starts
visible). Panels hold anything — including their own `<target-closure>` — and
keep their DOM state while hidden (a form mid-edit survives switching away
and back). Content that is *not* inside any `<dash-panel>` behaves as the
default region: visible when no panel item is selected, and the render target
for `url` items.

**Panel events** — the piece that makes signal-driven flows work. Fired on
the `<dash-panel>` element itself, so inner content subscribes on its own
ancestor without knowing any names:

| Event | Bubbles | Cancelable | Detail |
|---|---|---|---|
| `panel-show`   | no | no | `{ name }` — the panel just became the visible one |
| `panel-hide`   | no | no | `{ name }` — the panel was switched away from |
| `panel-loaded` | no | no | `{ name, url }` — a `url`+`panel` fetch just rendered into it |

Typical wiring: a grid inside the Reports panel listens for `panel-show` on
its enclosing panel and refreshes if a domain signal was heard while hidden —
or simply always. No new event *mechanism* anywhere: `<signal-event>` already
delivers server pushes on `document`; panel events are just the local
lifecycle hooks content needs to react at the right moment.

`<dash-nav-group label="x" collapsed?>` — titled, optionally collapsible
section of items. Presentation only.

Item content is light-DOM text/HTML (like `status-kv`), so labels can carry
markup.

**The sidebar is not items-only.** `<dash-nav>` accepts arbitrary free
content interleaved with items and groups — action buttons
(`<closure-btn free>`), mini forms (a quick-search `<form closure>`, an
`<inline-create>` from the tt4 proposal), separators (`<hr>`), status bits
(`<clock-display small>`)… Nav behavior (selection, url/panel/href handling)
applies **only** to `<dash-nav-item>`; everything else is rendered as-is,
with the nav providing consistent spacing/width so those pieces need no
page CSS. Mini forms follow the same opt-in ladder as everything else
(§4): a plain `<form>` submits natively; add `closure="…"` only when the
app wants the server-driven flow.

### 3.4 `<dashboard-response-item>` (subscribed closure tag)

Following the `<lightbox-response-item>` pattern, the shell subscribes to the
client closure so the **server can drive the shell** declaratively from any
response:

| Attribute | Effect |
|---|---|
| `select="name"` | move the selection (e.g. after a redirect-ish flow) |
| `badge="name:value"` | update an item's badge (`value` empty ⇒ remove) |
| `label="x"` | replace the header title |
| `type="collapse"` / `type="expand"` | drive the side nav |

---

## 4. Connection to the client area — an opt-in ladder

**Guiding principle (same doctrine as `<target-closure>`, "optional by
design"): the shell having access to the heavy machinery — connected forms,
templates, response directives — does not mean an app has to use any of it.**
Each rung below is a complete, first-class way to use the dashboard; the next
rung is opt-in and adds only what it names. A plain-links dashboard is not a
degraded mode.

1. **Pure layout (`href` items, no fetch at all).** The shell is just frame +
   navigation: every item is a normal link, the server re-renders the page and
   marks `selected`. Classic multi-page app; zero closure involvement, zero
   custom JS semantics.
2. **Local panels (`panel` items, still no fetch).** Everything travels in the
   initial page; items switch `<dash-panel>` regions in and out, keeping their
   DOM state. An offline/SPA-less dashboard — and the mode a `file://` example
   page can demo fully.
3. **Fragment loading without closures (`url` items, plain client area).**
   The shell GETs the url and writes the response into `<dash-client>`'s
   innerHTML. No `<target-closure>` required anywhere — this is a first-class
   mode, not a fallback.
4. **Closure mode (`url` items + a `<target-closure>` in the client).** Same
   pipeline, but the response goes through `closure.loadContent(html)` so
   templates, form association, dirty tracking and response directives
   (including `<dashboard-response-item>`, §3.4) come alive. Only apps that
   want the server-driven workflow take this rung.

The click pipeline for an `url` item:

```
click → dash-nav (cancelable) → fetch GET url
      → closure.loadContent(html)   — or client innerHTML on rung 2
      → item marked selected → dash-loaded
```

- The render target is resolved like `<closure-lightbox>` does: the
  `<target-closure>` inside `<dash-client>` (or the one named by the
  `closure` attribute) if present, otherwise the client area directly.
- With `url`+`panel` (§3.3), the render target is **that panel** instead of
  the default region — through the panel's own `<target-closure>` when it has
  one, innerHTML otherwise. Same ladder, scoped per panel.

### Panel-scoped actions

Actions living inside a panel will very likely want to be **scoped to that
panel**: a form submitted in "Reports" must render its response in Reports —
not in the default region, not in another panel, and it must not disturb
them. The design leans on `<target-closure>` semantics, which already provide
exactly this boundary:

- **A panel with its own `<target-closure>` is a self-contained world.**
  Nearest-closure association means every `<form closure>`, `<closure-btn
  ct-role>` and template inside belongs to the panel's closure; responses
  land in the panel, dirty state is tracked per panel, and sibling panels
  (whose DOM is merely hidden, §3.3) are untouched.
- **Server fragments can ship their scope with them**: a fragment loaded via
  `url`+`panel` may itself contain a `<target-closure>` + templates, and
  `loadContent()` re-arms it — so per-panel scoping needs nothing from the
  shell beyond rendering into the right panel.
- **Closures per panel are still opt-in** (§4 ladder): a panel of static
  content, or one whose forms submit natively, needs no closure at all.
- **Shell directives keep working from inside panels**: the shell subscribes
  `<dashboard-response-item>` on the panel closures it knows about (same
  mechanism `<closure-lightbox>` uses on its inner closure), so a panel's
  response can still move the selection or update badges — the *shell* is the
  one thing a panel is allowed to steer.
- Open question (added to §9): should the shell offer an optional **dirty
  guard** — refuse/confirm switching away from a panel whose closure is dirty?
  DOM state already survives the switch, so nothing is lost either way; a
  guard would only make the pending edit visible.
- Network errors follow the house policy already defined for captured
  fetches: leave the DOM untouched, dispatch a cancelable
  `closure-fetch-error`-style event, console fallback if unhandled. The
  half-filled form in the client area survives a failed nav click.
- Content loaded this way can itself contain closures, grids, tabs — it is a
  normal `loadContent()`; and its responses can steer the shell via
  `<dashboard-response-item>` (§3.4).
- `href` and `url` items mix freely in one nav (§2 example: Help is a plain
  link next to closure-loaded sections).

Deliberately **out**: no History/URL-bar integration (pushState) in v1 — it
drags in deep-linking and popstate semantics. Apps that need real URLs per
section use `href` items instead. Revisit later if needed (open question).

---

## 5. Layout behavior

- **Fixed header**: constant height (`--dash-header-height`, 48px), holds
  hamburger ☰, logo/label (linked via `logo-href`), and the `<dash-header>`
  slot right-aligned.
- **Side nav**: fixed width (`--dash-nav-width`, 220px), scrolls on its own if
  the item list overflows. `collapsed` hides it; the client area takes the
  full row.
- **Client area**: the only scroll container; padding via
  `--dash-client-padding` so loaded fragments never need layout CSS.
- **Responsive**: below `--dash-break` (~880px, media-query in the shadow
  style) the nav starts collapsed and, when expanded, **overlays** the client
  area with a scrim; picking an item auto-collapses. Same markup, no page CSS.
- **Sizing**: `height: 100dvh` default so a bare page works; a container that
  sets an explicit height on the host wins (same "stretch to container"
  doctrine as `<closure-lazy-iframe>`).

## 6. CSS variables

Premise (library-wide): **CSS can be used, but is never needed.** The shell
ships complete defaults — a bare page with only the markup in §2 must look
like a finished dashboard. All the variables below are optional restyling
hooks, and light-DOM content (nav free content, panels, client fragments) can
additionally be styled by normal page CSS if an app chooses to.

Consumed (with fallbacks): shared tokens `--border`, `--bg`, `--text`,
`--text-muted`, `--primary`, `--font`, `--radius`; plus
`--dash-header-height` (48px), `--dash-nav-width` (220px),
`--dash-client-padding` (16px), `--dash-break` (880px, if variables prove
usable in the media query — otherwise a fixed breakpoint, documented),
`--dash-nav-bg` / `--dash-header-bg` (default `--bg`),
`--dash-selected-bg` / `--dash-selected-text` (default derived from
`--primary`).

---

## 7. Example page & demo server

`examples/dashboard.html` (pure HTML, as always): the shell with 3–4 nav
items. Static mode works from `file://` by pointing `url` items at… nothing —
so the offline demo uses `href`-less items plus a small note, **or** the demo
runs against `examples/server` (like `grid-dynamic.html` already does), which
gains a couple of `/dash/*` endpoints returning HTML fragments. Both variants
on one page: a static shell to see the layout, and a server-wired one for the
real closure flow.

---

## 8. Build order

1. Shell + layout (header/nav/client, collapse, responsive) with `href` items
   only — pure presentation, no closure wiring.
2. `url` items → closure pipeline (`dash-nav`/`dash-loaded`, error policy),
   `select(name)`.
3. `<dashboard-response-item>` server directives + badges.
4. `<dash-nav-group>` collapsible groups.

Each step ships independently; 1+2 already cover the classic dashboard.

## 9. Open questions

- **History integration** — should `url` items optionally `pushState` so
  back/forward and deep links work (`history` attribute on the shell)?
  Deferred from v1 (§4), but the answer shapes whether `name` must be unique
  and URL-derivable.
- **Selection persistence** — on full reload the server marks `selected` in
  the HTML it renders. Is that enough (it matches the server-driven grain), or
  do we want optional `storage-key` client persistence like the proposed
  `<toggle-pref>`?
- **Nav data source** — slotted items only (server-rendered, like tt4), or
  also a `<closure-data-source>`-fed mode for dynamic menus? Slotted-only for
  v1.
- **Second sidebar / right panel** — some dashboards have a right-hand
  inspector panel. Ignore, or reserve a `<dash-aside>` tag name now so the
  slot layout doesn't need reshuffling later?
- **Where does `<breadcrumb-trail>` live** (tt4 proposal §4.4) — inside the
  fixed header, or at the top of the client content? Leaning client content
  (it changes with each loaded fragment anyway).
- **Dirty guard on panel switch** (§4 "Panel-scoped actions") — optional
  `guard-dirty` on the shell (or per item) that intercepts `dash-nav` when
  the current panel's closure is dirty and asks via
  `ClosureLightbox.MsgConfirm`? Or leave it entirely to apps, which can
  already implement it by listening to the cancelable `dash-nav`?
