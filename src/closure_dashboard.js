/*<%% note:
# `<closure-dashboard>`

Dashboard shell: a fixed header (hamburger + linked title + free tool
area), a collapsible side navigation panel, and a client area that is
the only scroll container. One global control, declarative child tags:

```html
<closure-dashboard label="My App" logo-href="/">
  <dash-header>
    <clock-display small dot></clock-display>
  </dash-header>
  <dash-nav>
    <dash-nav-group label="Tracking">
      <dash-nav-item name="home" panel="home" selected>Home</dash-nav-item>
      <dash-nav-item name="reports" url="/dash/reports" panel="reports" badge="3">Reports</dash-nav-item>
    </dash-nav-group>
    <dash-nav-item name="about" url="/dash/about" lightbox>About</dash-nav-item>
    <dash-nav-item href="/help">Help</dash-nav-item>
    <hr>
    <form action="/search"><input name="q" placeholder="Search…"></form>
  </dash-nav>
  <dash-client>
    <p>Default region — shown when no panel item is selected.</p>
    <dash-panel name="home">…</dash-panel>
  </dash-client>
</closure-dashboard>
```

The layout is self-contained: the host is a flex column
(`--dash-height`, default `100dvh`), the header row never scrolls, and
`<dash-client>` scrolls on its own. No page CSS is ever needed; CSS
variables are optional restyling hooks.

**The closure machinery is opt-in, never required** (see the ladder
below): a dashboard of plain links, or of local panels, works with zero
`<target-closure>` involvement.

## Tags

| Tag | Role |
|---|---|
| `<closure-dashboard>` | the shell: layout, selection, fetch pipeline |
| `<dash-header>`       | free content, right-aligned in the fixed header |
| `<dash-nav>`          | the side panel: items, groups and free content (buttons, mini forms, `<hr>`…) |
| `<dash-nav-group>`    | titled, collapsible section of items (`label`, `collapsed`) |
| `<dash-nav-item>`     | a navigation entry (see modes below) |
| `<dash-client>`       | the client area; non-panel children form the *default region* |
| `<dash-panel>`        | named, state-preserving region of the client area |
| `<on-fetch-error>`    | declarative markup rendered into a failed, empty target — same vocabulary as the grid. As a direct child of a `<dash-panel>`: per-section error UI; as a direct child of `<dash-client>`: shell-wide. The panel-level one wins. Extracted at init, so a panel holding only its error template still counts as empty and fetches |

`<dash-header>`, `<dash-nav>`, `<dash-client>` and `<dash-panel>` are
plain declarative tags — the shell wires them; only
`<closure-dashboard>` is a custom element.

## `<closure-dashboard>` attributes

| Attribute | Description |
|---|---|
| `label="x"`      | app title in the header |
| `logo-src="x"`   | logo image rendered before the label (or alone, with no `label`); height via `--dash-logo-height` |
| `logo-href="x"`  | make the title (logo + label) a link |
| `title-align="center"` | center the title/logo in the bar (absolute centering — unaffected by the hamburger or the `<dash-header>` tools). Default: left, after the hamburger |
| `collapsed`      | boolean, reflected — side nav hidden. Toggled by the hamburger; the single source of truth |
| `closure="name"` | optional: name of the `<target-closure>` that receives default-region loads (default: first one found in the region) |

## `<dash-nav-item>` — navigation out and in

| Attribute | Description |
|---|---|
| `name="x"`   | identity for selection, `select(name)` and server directives |
| `href="x"`   | **out**: plain full navigation (GET) |
| `free`       | **out, form submit**: with `url`, the `<closure-btn free>` mode via the shared `closureFreeSubmit()` helper — the click builds a hidden form from the item's `data-*` (names prefixed by `section` when present), submits it and navigates to the response. Default method: **GET** (a nav item is navigation; fields → query string); write `post` for POST — `<dash-nav-item free post url="/logout">Sign out</dash-nav-item>`. `get`/`post`/`method=` as on `<closure-btn>` |
| `panel="x"`  | **in, no fetch**: show `<dash-panel name="x">`, hide the others; DOM state is preserved across switches |
| `url="x"`    | **in, fetch**: GET the url and render it — into the default region, or into the item's `panel` (first activation only; created if absent), or into `target`/`lightbox` below |
| `refresh`    | with `url`+`panel`: re-fetch on every activation, not just the first |
| `lazy`       | with `url`+`selected`: don't fetch on page load even if the target is empty — wait for the first real activation |
| `preload`    | with `url`+`panel`: the opposite of `lazy` — fetch at page load, in the background, into the still-hidden panel, so entering the section is instant |
| `target="sel"` | with `url`: render into the container matched by the CSS selector (looked up inside `<dash-client>` first, then document-wide) |
| `lightbox` / `lightbox="id"` | with `url`: show the response in a `<closure-lightbox>` (referenced by id, or a spawned throw-away one). Does **not** change the selection — it is an action, not a place |
| `selected`   | boolean, reflected — the active item |
| `badge="x"`  | counter/pill at the item's right edge (CSS-rendered) |
| `activate-on="event"` | activate this item whenever that `<signal-event>` name fires on `document` |
| `ct-role="x"` / `closure-template="x"` | **routed action mode** — the item inherits the `<closure-btn>` contract by duck typing: it switches place normally, then dispatches `btn-action` (itself as `detail.source`, exposing the standard `getBtnData()`) at the place's closure, which routes the POST through its `<closure-template>` and processes the response. The closure-native alternative to `url` — don't combine both on one item |
| `target-id="x"` | with `ct-role`: dispatch the `btn-action` at that element instead of the place's closure |
| `section="x"` / `data-*` | with `ct-role`: payload fields packaged by `getBtnData()`, exactly as on `<closure-btn>` |

Item content is light-DOM markup (text, an emoji/svg icon, `<b>`…).
Everything else inside `<dash-nav>` (buttons, forms, separators) is
rendered as free content: nav behavior applies only to items, and the
existing button/form machinery composes untouched:

- `<closure-btn free url="/x">` — the encapsulated POST form: click
  posts its `data-*` to the url (full navigation, "out").
- `<closure-btn ct-role="x" target-id="main">` — routed action "in":
  the `btn-action` is dispatched at a `<target-closure>` living in a
  panel/region, which posts through its template and processes the
  response there (directives, `<dashboard-response-item>`, signals).
- `<form closure="name">` — a mini form associated by name to a closure
  anywhere in the document; a plain `<form>` submits natively.

## Render targets and the opt-in ladder

Every rung is first-class; the next adds only what it names:

1. **Links only** (`href` items): classic multi-page app, zero JS semantics.
2. **Local panels** (`panel` items): everything travels in the initial
   page; switching preserves DOM state. Fully offline-capable.
3. **Fetch without closures** (`url` items): responses land via
   `innerHTML` in the default region / panel / `target` container.
4. **Closure mode**: if the receiving region, panel or container holds a
   `<target-closure>`, the response goes through `loadContent()` —
   templates, form association, dirty tracking and response directives
   come alive. Actions inside a panel scope to that panel's closure by
   plain nearest-closure association.

`url` **without** `panel` always re-fetches into the shared default
region. With `panel`, the fetch is lazy (first activation) and the
panel keeps its state; `refresh` re-fetches every time.

**When urls load** — a three-step eagerness scale, per item:

- **`preload`** (eager): fetched at page load, in the background, into
  its hidden panel. Requires `url`+`panel`.
- **default** (lazy): fetched on first activation. Exception: the
  initially `selected` item fetches at load when its target is empty
  (an auto-created panel) — a selected-but-empty landing would be
  useless. A panel (or the region) that carries server-rendered markup
  content counts as **loaded** and is not refetched, neither at load
  nor on first activation.
- **`lazy`** (explicit): suppresses even the selected-item exception —
  nothing loads until a real activation.

`refresh` is orthogonal and governs the **second and later**
activations: the first render (markup or first fetch) is fresh by
definition — `refresh` never causes a load-time refetch; it re-fetches
on every activation after that.

**Dirty protection:** an automatic (re)fetch never clobbers unsaved
edits. If the target's closure reports dirty state, the fetch is
skipped, the panel shows as-is (the edit lives), and `dash-dirty-skip`
fires — the app decides (ignore, confirm via `MsgConfirm`, or
`closure.cleanDirty('*')` + `select(name)` to force). The next
activation with a clean closure fetches normally.

**Closure responses:** rendering through a closure means
`loadContent()`, which runs `ClosureResponse.process()` — a fetched
`<closure-response>` document (directives, sections, subscribed tags)
is executed, not dumped as markup. In closure-less targets (ladder
rung 3) the response is plain HTML by design.

**Fetch failure handling** — the same ladder of options as the rest of
the library, most specific wins:

1. **Event** (programmatic): `dash-fetch-error` is cancelable —
   `preventDefault()` takes over completely (toast, `MsgAlert`, retry
   logic…) and suppresses everything below.
2. **Declarative markup**: an `<on-fetch-error>` direct child of the
   `<dash-panel>` (per-section), else of `<dash-client>` (shell-wide) —
   same vocabulary as `<closure-data-grid>` — supplies the HTML
   rendered into the failed target.
3. **Built-in notice**: with neither of the above, a never-**loaded**
   target (an auto-created panel, a bare region) shows a muted
   retryable notice. "Loaded" is the durable state set once — markup
   content counts at init; a successful fetch sets it — so the failure
   decision never has to sniff the DOM.
4. **Console**: the error is also logged (unless the event was
   prevented).

In every path the failed target is **not** marked loaded, so the next
activation retries; and a target holding real content is never touched
— an item with `refresh` whose re-fetches fail keeps showing the last
good content (the failure surfaces via the event / console, not by
destroying state).

## Methods / properties

| Member | Description |
|---|---|
| `select(name)` | activate the item programmatically (same pipeline as a click) |
| `collapse()` / `expand()` / `toggle()` | side nav visibility (sets/removes `collapsed`) |
| `selected` (getter) | `name` of the active item, or `''` |

## Events

| Event | Bubbles | Cancelable | Detail |
|---|---|---|---|
| `dash-nav`    | no | yes | `{ name, url }` — before activation; `preventDefault()` blocks it |
| `dash-loaded` | no | no  | `{ name, url }` — a fetch was rendered |
| `dash-toggle` | no | no  | `{ collapsed }` |
| `dash-fetch-error` | no | yes | `{ url, error, message }` — network-level fetch failure; `preventDefault()` takes over (suppresses the declarative/built-in error rendering and the console fallback). See "Fetch failure handling" below |
| `dash-dirty-skip` | no | no | `{ name, url }` — a (re)fetch was skipped because the target's closure is dirty (unsaved edits). Confirm + `cleanDirty()` + `select(name)` to force |

**Panel events**, fired on the `<dash-panel>` element itself so inner
content subscribes to its own ancestor without knowing names:

| Event | Detail |
|---|---|
| `panel-show`   | `{ name }` — the panel just became visible |
| `panel-hide`   | `{ name }` — the panel was switched away from |
| `panel-loaded` | `{ name, url }` — a `url`+`panel` fetch rendered into it |

## Signals (server → shell)

The shell listens on `document` for the well-known
`<signal-event name="dash-select" data-item="reports">` and runs the
full activation pipeline for that item. Additionally any item may
subscribe to a domain event via `activate-on="entry-created"` — the
server emits its domain signal without knowing item names; combined
with `refresh`, "dialog saved → section selected and fresh" is pure
markup. Listeners are armed at the deferred init (after
`DOMContentLoaded`), so signals arriving in server responses always
find them; a `<signal-event>` in the *initial static markup* may fire
too early to be heard.

## `<dashboard-response-item>` (subscribed closure tag)

When regions/panels hold closures, the shell subscribes this tag on
every closure it renders into — so any response can steer the shell:

| Attribute | Effect |
|---|---|
| `select="name"` | activate that item |
| `badge="name:value"` | set an item's badge (`value` empty ⇒ remove it) |
| `label="x"` | replace the header title |
| `type="collapse"` / `type="expand"` | drive the side nav |

## Example

See `examples/dashboard.html`. `url` items need the page served over
HTTP (`fetch` is blocked on `file://`); everything else works offline.

## CSS Variables

Premise: **CSS can be used, never needed.** Consumed (with fallbacks):
shared tokens `--border`, `--bg`, `--text`, `--text-muted`,
`--primary`, `--font`, `--radius`, plus:

| Variable | Default |
|---|---|
| `--dash-height`         | `100dvh` |
| `--dash-header-height`  | `48px` |
| `--dash-logo-height`    | `24px` |
| `--dash-nav-width`      | `220px` |
| `--dash-client-padding` | `16px` |
| `--dash-header-bg` / `--dash-nav-bg` | `var(--bg)` |
| `--dash-selected-bg`    | `var(--primary)` |
| `--dash-selected-text`  | `#fff` |

## Behaviour

> **Note:** `collapsed` is the single source of truth for the side nav
> (like `expanded` on `<closure-lazy-iframe>`): the hamburger, the
> scrim and `collapse()`/`expand()` only set or remove the attribute.

> **Note:** below 880px (fixed breakpoint — CSS variables cannot drive
> media queries) the nav starts collapsed; expanded, it overlays the
> client area with a scrim, and picking an item auto-collapses it.

> **Note:** the shell moves `<dash-header>` into the header bar and
> wraps the non-panel children of `<dash-client>` in an internal
> default-region container at init (the same move-on-connect approach
> as `<closure-lightbox>`). Panels stay where they are.

> **Note:** panels and tabs compose — putting a `<closure-tab-bar>`
> inside a `<dash-panel>` is the expected pattern. The two mechanisms
> cannot collide: different tags (`dash-panel[active]` vs
> `closure-tab[active]`), tag-scoped CSS and distinct events
> (`panel-*` vs `tab-change`). Tabs initialize normally inside a hidden
> panel and keep their active tab across panel switches. The shell only
> manages `<dash-panel>` elements that are **direct children** of
> `<dash-client>` — nested or fragment-delivered lookalikes are content.

> **Note:** an HTTP error response (4xx/5xx) with a body is rendered
> like any other (matching `<target-closure>`); only network-level
> failures leave the DOM untouched and fire `dash-fetch-error`.

---
%%>*/

class ClosureDashboard extends HTMLElement {
  static _styleId = 'closure-dashboard-default-style';
  static _style = [
    'closure-dashboard { display: flex; flex-direction: column; height: var(--dash-height, 100dvh); overflow: hidden; background: #fff; font-family: var(--font, sans-serif); }',
    'closure-dashboard .dsh-bar { display: flex; align-items: center; gap: 10px; height: var(--dash-header-height, 48px); padding: 0 12px; flex: none; position: relative; background: var(--dash-header-bg, var(--bg, #f9fafb)); border-bottom: 1px solid var(--border, #e5e7eb); }',
    'closure-dashboard .dsh-burger { border: none; background: none; cursor: pointer; font-size: 18px; line-height: 1; padding: 4px 6px; color: var(--text-muted, #6b7280); border-radius: var(--radius, 8px); }',
    'closure-dashboard .dsh-burger:hover { color: var(--text, #111827); background: rgba(0,0,0,0.06); }',
    'closure-dashboard .dsh-title { display: flex; align-items: center; gap: 8px; font-weight: 700; font-size: 15px; color: var(--text, #111827); text-decoration: none; }',
    'closure-dashboard a.dsh-title:hover { color: var(--primary, #4f46e5); }',
    'closure-dashboard .dsh-logo { display: block; height: var(--dash-logo-height, 24px); }',
    'closure-dashboard[title-align="center"] .dsh-title { position: absolute; left: 50%; transform: translateX(-50%); }',
    'closure-dashboard dash-header { margin-left: auto; display: flex; align-items: center; gap: 10px; }',
    'closure-dashboard .dsh-row { flex: 1; display: flex; min-height: 0; position: relative; }',
    'closure-dashboard dash-nav { width: var(--dash-nav-width, 220px); flex: none; overflow: auto; padding: 8px; display: flex; flex-direction: column; gap: 2px; background: var(--dash-nav-bg, var(--bg, #f9fafb)); border-right: 1px solid var(--border, #e5e7eb); box-sizing: border-box; }',
    'closure-dashboard[collapsed] dash-nav { display: none; }',
    'closure-dashboard dash-client { flex: 1; min-width: 0; overflow: auto; display: block; padding: var(--dash-client-padding, 16px); font-size: 14px; color: var(--text, #111827); }',
    'closure-dashboard dash-nav-item { display: flex; align-items: center; gap: 8px; padding: 8px 10px; border-radius: var(--radius, 8px); cursor: pointer; user-select: none; font-size: 14px; color: var(--text, #111827); }',
    'closure-dashboard dash-nav-item:hover { background: rgba(0,0,0,0.06); }',
    'closure-dashboard dash-nav-item[selected] { background: var(--dash-selected-bg, var(--primary, #4f46e5)); color: var(--dash-selected-text, #fff); }',
    'closure-dashboard dash-nav-item[badge]::after { content: attr(badge); margin-left: auto; font-size: 11px; line-height: 1; padding: 3px 7px; border-radius: 999px; background: var(--primary, #4f46e5); color: #fff; }',
    'closure-dashboard dash-nav-item[selected][badge]::after { background: rgba(255,255,255,0.25); }',
    'closure-dashboard dash-nav-group { display: block; margin-top: 8px; }',
    'closure-dashboard dash-nav-group::before { content: attr(label); display: block; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted, #6b7280); padding: 6px 10px 4px; cursor: pointer; }',
    'closure-dashboard dash-nav-group[collapsed] > * { display: none; }',
    'closure-dashboard dash-nav hr { border: none; border-top: 1px solid var(--border, #e5e7eb); margin: 8px 4px; width: auto; }',
    'closure-dashboard dash-nav form { display: block; padding: 4px 2px; }',
    'closure-dashboard dash-nav input { width: 100%; box-sizing: border-box; padding: 6px 8px; border: 1px solid var(--border, #e5e7eb); border-radius: var(--radius, 8px); font-family: var(--font, sans-serif); font-size: 13px; }',
    'closure-dashboard dash-panel { display: none; }',
    'closure-dashboard dash-panel[active] { display: block; }',
    'closure-dashboard .dsh-fetch-notice { color: var(--text-muted, #6b7280); font-size: 13px; padding: 24px; text-align: center; }',
    'closure-dashboard .dsh-scrim { display: none; }',
    '@media (max-width: 880px) {',
    '  closure-dashboard dash-nav { position: absolute; top: 0; bottom: 0; left: 0; z-index: 20; box-shadow: 4px 0 16px rgba(0,0,0,0.15); }',
    '  closure-dashboard:not([collapsed]) .dsh-scrim { display: block; position: absolute; inset: 0; z-index: 10; background: rgba(0,0,0,0.3); }',
    '}',
  ].join('\n');

  static get observedAttributes() { return ['label', 'collapsed']; }

  attributeChangedCallback(attr, oldVal, val) {
    if (attr === 'label') {
      if (this._labelEl) this._labelEl.textContent = val || '';
    } else if (attr === 'collapsed') {
      if (oldVal === val) return;
      if (this._burger) {
        this._burger.setAttribute('aria-expanded', val === null ? 'true' : 'false');
      }
      if (this._domReady) {
        this.dispatchEvent(new CustomEvent('dash-toggle', {
          detail: { collapsed: val !== null },
          bubbles: false,
        }));
      }
    }
  }

  connectedCallback() {
    if (this._initialized) return;
    this._initialized = true;
    if (!document.getElementById(ClosureDashboard._styleId)) {
      var s = document.createElement('style');
      s.id = ClosureDashboard._styleId;
      s.textContent = ClosureDashboard._style;
      document.head.appendChild(s);
    }
    var self = this;
    var init = function() { self._initDom(); };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
      requestAnimationFrame(init);
    }
  }

  _initDom() {
    if (this._domReady) return;
    var self = this;

    var navEl = this.querySelector('dash-nav');
    var clientEl = this.querySelector('dash-client');
    var headerEl = this.querySelector('dash-header');

    // Header bar: hamburger + title + free tools
    var bar = document.createElement('div');
    bar.className = 'dsh-bar';
    this._burger = document.createElement('button');
    this._burger.type = 'button';
    this._burger.className = 'dsh-burger';
    this._burger.textContent = '☰';
    this._burger.setAttribute('aria-label', 'Toggle navigation');
    this._burger.addEventListener('click', function() { self.toggle(); });
    bar.appendChild(this._burger);
    var logoHref = this.getAttribute('logo-href');
    this._titleEl = document.createElement(logoHref ? 'a' : 'span');
    this._titleEl.className = 'dsh-title';
    if (logoHref) this._titleEl.href = logoHref;
    var logoSrc = this.getAttribute('logo-src');
    if (logoSrc) {
      var logo = document.createElement('img');
      logo.className = 'dsh-logo';
      logo.src = logoSrc;
      logo.alt = this.getAttribute('label') || '';
      this._titleEl.appendChild(logo);
    }
    this._labelEl = document.createElement('span');
    this._labelEl.textContent = this.getAttribute('label') || '';
    this._titleEl.appendChild(this._labelEl);
    bar.appendChild(this._titleEl);
    if (headerEl) bar.appendChild(headerEl);

    // Content row: nav + scrim + client
    var row = document.createElement('div');
    row.className = 'dsh-row';
    this._nav = navEl;
    if (navEl) row.appendChild(navEl);
    var scrim = document.createElement('div');
    scrim.className = 'dsh-scrim';
    scrim.addEventListener('click', function() { self.collapse(); });
    row.appendChild(scrim);
    if (!clientEl) {
      clientEl = document.createElement('dash-client');
    }
    row.appendChild(clientEl);
    this._client = clientEl;

    // Declarative failure markup (grid vocabulary), most specific wins:
    // a direct <on-fetch-error> child of each <dash-panel> (per-section UI),
    // then one of <dash-client> (shell-wide). Captured and REMOVED at init —
    // so a panel holding only its error template still counts as empty
    // (and fetches), and later content replacements can't destroy them.
    var self0 = this;
    var extractOfe = function(parent) {
      var found = null;
      Array.prototype.forEach.call(parent.children, function(c) {
        if (!found && c.tagName === 'ON-FETCH-ERROR') found = c;
      });
      if (!found) return null;
      var html = found.innerHTML;
      found.remove();
      return html;
    };
    Array.prototype.forEach.call(clientEl.children, function(c) {
      if (c.tagName !== 'DASH-PANEL') return;
      c._dshOnFetchErrorHTML = extractOfe(c);
    });
    this._onFetchErrorHTML = extractOfe(clientEl);

    // Default region: gather the client's non-panel children
    this._region = document.createElement('div');
    this._region.className = 'dsh-region';
    var kids = Array.prototype.slice.call(clientEl.childNodes);
    clientEl.insertBefore(this._region, clientEl.firstChild);
    kids.forEach(function(n) {
      if (n.nodeType === 1 && n.tagName === 'DASH-PANEL') return;
      self._region.appendChild(n);
    });

    // Rebuild the host: bar + row (drop stray text nodes, keep panels via clientEl)
    this.innerHTML = '';
    this.appendChild(bar);
    this.appendChild(row);

    // Nav interaction: click + keyboard delegation
    if (navEl) {
      navEl.addEventListener('click', function(e) { self._onNavClick(e); });
      navEl.addEventListener('keydown', function(e) {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        var item = e.target.closest && e.target.closest('dash-nav-item');
        if (item) { e.preventDefault(); self._activate(item); }
      });
      this._items().forEach(function(item) {
        if (!item.hasAttribute('tabindex')) item.setAttribute('tabindex', '0');
        var ev = item.getAttribute('activate-on');
        if (ev) {
          document.addEventListener(ev, function() { self._activate(item); });
        }
        // closure-btn contract by duck typing: any btn-action source with a
        // getBtnData() is a valid closure button (see target-closure)
        item.getBtnData = function() {
          var section = item.getAttribute('section') || '';
          var fields = {};
          Array.prototype.forEach.call(item.attributes, function(a) {
            if (a.name.indexOf('data-') === 0) fields[a.name.slice(5)] = a.value;
          });
          var sections = {};
          sections[section] = fields;
          return {
            ctRole: item.getAttribute('ct-role') || '',
            closureTemplate: item.getAttribute('closure-template') || '',
            sections: sections,
          };
        };
      });
    }

    // Well-known signal: <signal-event name="dash-select" data-item="x">
    document.addEventListener('dash-select', function(e) {
      if (e.detail && e.detail.item) self.select(e.detail.item);
    });

    // Narrow screens start collapsed (set before _domReady: no event)
    this._mq = window.matchMedia('(max-width: 880px)');
    if (this._mq.matches) this.setAttribute('collapsed', '');
    this._burger.setAttribute('aria-expanded', this.hasAttribute('collapsed') ? 'false' : 'true');

    this._domReady = true;

    // Panels / region that carry server-rendered markup content start as
    // "loaded": they are neither refetched on load nor on first activation
    this._panels().forEach(function(p) {
      if (self._hasContent(p)) p._dshLoaded = true;
    });
    if (this._hasContent(this._region)) this._region._dshLoaded = true;

    // Apply the initial selection; its url is fetched only when the target
    // is empty (or the item asks for `refresh`)
    var initial = navEl && navEl.querySelector('dash-nav-item[selected]');
    if (initial) {
      var panel = this._applyPlace(initial);
      var url = initial.getAttribute('url');
      if (url && !initial.hasAttribute('lazy') &&
          !initial.hasAttribute('lightbox') && !initial.hasAttribute('target')) {
        var target = panel || this._region;
        // `refresh` governs the SECOND and later activations only: markup
        // content is fresh by definition at load, never refetched here
        if (!target._dshLoaded) {
          this._fetchInto(url, target, initial.getAttribute('name') || '', panel);
        }
      }
    } else {
      this._showPanel(null);
    }

    // Preload (the opposite of lazy): fetch url+panel items in the
    // background at load, into their still-hidden panels
    this._items().forEach(function(item) {
      if (item === initial || !item.hasAttribute('preload')) return;
      var u = item.getAttribute('url');
      var pn = item.getAttribute('panel');
      if (!u || !pn) return;
      var p = self._ensurePanel(pn);
      if (!p._dshLoaded) self._fetchInto(u, p, item.getAttribute('name') || '', p);
    });

    this._subscribeClosures();
  }

  _items() {
    return this._nav
      ? Array.prototype.slice.call(this._nav.querySelectorAll('dash-nav-item'))
      : [];
  }

  _onNavClick(e) {
    var item = e.target.closest && e.target.closest('dash-nav-item');
    if (item) { this._activate(item); return; }
    var group = e.target.closest && e.target.closest('dash-nav-group');
    // only the group's own box (its ::before label / padding) toggles it
    if (group && e.target === group) {
      if (group.hasAttribute('collapsed')) group.removeAttribute('collapsed');
      else group.setAttribute('collapsed', '');
    }
  }

  // Full activation pipeline (click, select(), signals share this path)
  _activate(item) {
    var name = item.getAttribute('name') || '';
    var url = item.getAttribute('url') || '';
    var href = item.getAttribute('href');
    var self = this;

    if (href) { window.location.href = href; return; }

    // Free mode: the same encapsulated form as <closure-btn free>, via the
    // shared closureFreeSubmit() helper — but nav items default to GET
    if (item.hasAttribute('free')) {
      if (url) closureFreeSubmit(item, url, 'get');
      return;
    }

    var e = new CustomEvent('dash-nav', {
      detail: { name: name, url: url },
      bubbles: false,
      cancelable: true,
    });
    if (!this.dispatchEvent(e)) return;

    // Dialog target: an action, not a place — selection untouched
    if (item.hasAttribute('lightbox')) {
      if (url) this._openLightbox(item, url);
      return;
    }

    var panel = this._applyPlace(item);

    // Routed closure action (inherited closure-btn behavior): fire
    // btn-action at the place's closure (or the explicit target-id) and let
    // the closure/template machinery do the POST + response processing
    if (item.hasAttribute('ct-role') || item.hasAttribute('closure-template')) {
      var destId = item.getAttribute('target-id');
      var dest = destId ? document.getElementById(destId)
        : this._resolveClosure(panel || this._region);
      if (dest) {
        dest.dispatchEvent(new CustomEvent('btn-action', {
          bubbles: true,
          detail: { source: item },
        }));
      }
      if (this._mq && this._mq.matches) this.collapse();
      return;
    }

    if (url) {
      var explicit = item.getAttribute('target');
      if (explicit) {
        var t = (this._client && this._client.querySelector(explicit)) || document.querySelector(explicit);
        if (t) {
          // arbitrary containers aren't seen by the init pass: mark their
          // markup content as "loaded" on first touch, so all later
          // decisions run on _dshLoaded alone
          if (t._dshLoaded === undefined) t._dshLoaded = this._hasContent(t);
          this._fetchInto(url, t, name, null);
        }
      } else if (panel) {
        if (!panel._dshLoaded || item.hasAttribute('refresh')) {
          this._fetchInto(url, panel, name, panel);
        }
      } else {
        this._fetchInto(url, this._region, name, null);
      }
    }

    // Overlay mode: picking an item puts the nav away
    if (this._mq && this._mq.matches) this.collapse();
  }

  // Selection + panel switching, no fetch. Returns the item's panel (or null).
  _applyPlace(item) {
    this._items().forEach(function(i) {
      if (i === item) i.setAttribute('selected', '');
      else i.removeAttribute('selected');
    });
    var panelName = item.getAttribute('panel');
    var panel = panelName ? this._ensurePanel(panelName) : null;
    this._showPanel(panel);
    return panel;
  }

  _hasContent(el) {
    return el.children.length > 0 || (el.textContent || '').trim() !== '';
  }

  // Only DIRECT children of <dash-client> are shell-managed panels, so
  // panel-like content deeper in the tree (or inside loaded fragments)
  // can never collide with the shell's switching.
  _panels() {
    if (!this._client) return [];
    return Array.prototype.filter.call(this._client.children, function(c) {
      return c.tagName === 'DASH-PANEL';
    });
  }

  _ensurePanel(name) {
    var panel = null;
    this._panels().forEach(function(p) {
      if (p.getAttribute('name') === name) panel = p;
    });
    if (!panel) {
      panel = document.createElement('dash-panel');
      panel.setAttribute('name', name);
      this._client.appendChild(panel);
    }
    return panel;
  }

  _showPanel(panel) {
    this._panels().forEach(function(p) {
      var on = (p === panel);
      if (on === p.hasAttribute('active')) return;
      if (on) {
        p.setAttribute('active', '');
        p.dispatchEvent(new CustomEvent('panel-show', { detail: { name: p.getAttribute('name') } }));
      } else {
        p.removeAttribute('active');
        p.dispatchEvent(new CustomEvent('panel-hide', { detail: { name: p.getAttribute('name') } }));
      }
    });
    if (this._region) this._region.style.display = panel ? 'none' : '';
  }

  // Two-arg then(): a throw inside cb (render errors) propagates normally
  // instead of being swallowed and misreported as a fetch failure — only
  // network-level rejections take the error path.
  _fetch(url, cb, onUnhandledFail) {
    var self = this;
    fetch(url).then(function(r) { return r.text(); }).then(cb, function(err) {
      var e = new CustomEvent('dash-fetch-error', {
        detail: { url: url, error: err, message: String(err && err.message || err) },
        bubbles: false,
        cancelable: true,
      });
      if (self.dispatchEvent(e)) {
        console.error('closure-dashboard: fetch failed', url, err);
        if (onUnhandledFail) onUnhandledFail(err);
      }
    });
  }

  _fetchInto(url, container, name, panel) {
    var self = this;
    // Never clobber unsaved edits: a dirty closure in the target blocks the
    // automatic (re)fetch. The app can listen, confirm, cleanDirty and
    // re-select if it wants to force it.
    var closure = this._resolveClosure(container);
    if (closure && closure._isDirty && closure._isDirty()) {
      this.dispatchEvent(new CustomEvent('dash-dirty-skip', {
        detail: { name: name, url: url },
        bubbles: false,
      }));
      return;
    }
    this._fetch(url, function(html) {
      self._renderInto(container, html);
      container._dshLoaded = true;
      self._subscribeClosures();
      if (panel) {
        panel.dispatchEvent(new CustomEvent('panel-loaded', {
          detail: { name: panel.getAttribute('name'), url: url },
        }));
      }
      self.dispatchEvent(new CustomEvent('dash-loaded', {
        detail: { name: name, url: url },
        bubbles: false,
      }));
    }, function() {
      // Unhandled failure: a blank selected panel with console-only feedback
      // strands the user. The decision is purely `_dshLoaded` — markup
      // content was converted into that state at init (or on first touch for
      // `target=` containers), so a never-loaded target (auto-created panel,
      // bare region, a previous failure notice) gets the declarative
      // <on-fetch-error> markup or the built-in notice, while a loaded one
      // is left untouched (house policy: never destroy good state on
      // errors). Still not marked loaded: the next activation retries.
      if (!container._dshLoaded) {
        container.innerHTML = container._dshOnFetchErrorHTML ||
          self._onFetchErrorHTML ||
          '<p class="dsh-fetch-notice">⚠ This section could not be loaded. Select it again to retry.</p>';
      }
    });
  }

  _resolveClosure(container) {
    var closure = null;
    var wanted = this.getAttribute('closure');
    if (wanted && container === this._region) {
      closure = container.querySelector('target-closure[name="' + wanted + '"]');
    }
    if (!closure) closure = container.querySelector('target-closure');
    return closure;
  }

  // Render through the container's closure when it has one (ladder rung 4).
  // loadContent() runs the response through ClosureResponse.process(), so a
  // <closure-response> document — directives, sections, subscribed tags —
  // is executed, not dumped as markup.
  _renderInto(container, html) {
    var closure = this._resolveClosure(container);
    if (closure && closure.loadContent) closure.loadContent(html);
    else container.innerHTML = html;
  }

  _openLightbox(item, url) {
    var self = this;
    var id = item.getAttribute('lightbox');
    this._fetch(url, function(html) {
      var lb = id ? document.getElementById(id) : null;
      var spawned = false;
      if (!lb) {
        lb = document.createElement('closure-lightbox');
        lb.setAttribute('title', (item.textContent || '').trim());
        document.body.appendChild(lb);
        spawned = true;
        lb.addEventListener('lb-close', function() { lb.remove(); }, { once: true });
      }
      if (!lb.showResponse(html) && spawned) lb.remove();
      else self._subscribeClosures();
    });
  }

  // Subscribe <dashboard-response-item> on every closure in the client area
  _subscribeClosures() {
    if (!this._client) return;
    var self = this;
    var closures = this._client.querySelectorAll('target-closure');
    Array.prototype.forEach.call(closures, function(c) {
      if (c._dshSubscribed || !c.subscribeTag) return;
      c.subscribeTag('dashboard-response-item', self);
      c._dshSubscribed = true;
    });
  }

  onClosureTag(tag, el) {
    if (tag !== 'dashboard-response-item') return;
    if (el.hasAttribute('select')) this.select(el.getAttribute('select'));
    if (el.hasAttribute('badge')) {
      var spec = el.getAttribute('badge');
      var i = spec.indexOf(':');
      if (i > 0) {
        var itemName = spec.slice(0, i);
        var value = spec.slice(i + 1);
        this._items().forEach(function(it) {
          if (it.getAttribute('name') !== itemName) return;
          if (value) it.setAttribute('badge', value);
          else it.removeAttribute('badge');
        });
      }
    }
    if (el.hasAttribute('label')) this.setAttribute('label', el.getAttribute('label'));
    switch (el.getAttribute('type') || '') {
    case 'collapse': this.collapse(); break;
    case 'expand': this.expand(); break;
    }
  }

  select(name) {
    var found = null;
    this._items().forEach(function(i) {
      if (i.getAttribute('name') === name) found = i;
    });
    if (found) this._activate(found);
  }

  get selected() {
    var sel = null;
    this._items().forEach(function(i) {
      if (i.hasAttribute('selected')) sel = i;
    });
    return sel ? (sel.getAttribute('name') || '') : '';
  }

  collapse() { this.setAttribute('collapsed', ''); }
  expand() { this.removeAttribute('collapsed'); }
  toggle() {
    if (this.hasAttribute('collapsed')) this.expand();
    else this.collapse();
  }
}

customElements.define('closure-dashboard', ClosureDashboard);
