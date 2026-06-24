/*<%% note:
# `<closure-data-grid>`

Paginated data table that can take its rows from inline markup or from
a dynamic fetch. Renders a header, a scrollable body and pagination
controls. Selection and focus are tracked separately so consumers like
`<closure-row-viewer>` can react to either.

Use it whenever a server (or inline markup) owns a list and the page just needs
to **show, page and act on it**. The grid is display + interaction, not state:
it renders the rows it is given and emits `row-select` / `row-focus` for the
rest of the page to react to — the canonical pairing is a grid driving a
`<closure-row-viewer>` (master → detail), optionally fed by a `<filter-bar>`
through its `<query-param>`s. Inline mode suits data already on the page; dynamic
mode (`<query-definition>`) hands paging and filtering to the server.

It is **not** an editable spreadsheet: cells are not inputs and rows are not
mutated in place — row actions (`type="actions"`) fire closure directives or
templates, so every change round-trips through the server like the rest of the
library.

## Data sources

| Source | How |
|---|---|
| **Inline**  | `<g-row><g-col name="…">value</g-col></g-row>` children supply the rows |
| **Dynamic** | a `<query-definition url="…">` child (with optional `<query-param>` mappings) declares the request; refresh on demand |

Dynamic requests expect JSON by default. Set `response="g-row"` on
`<query-definition>` when the server returns `<g-row>` fragments.

## Children (configuration)

| Tag | Purpose |
|---|---|
| `<grid-col>`        | column definition (`name`, `label`, `width`, `align`, `fill`, `type`, `map-data-id`) |
| `<grid-key>`        | per-row identity (composed of one or more `name`s) |
| `<grid-footer-buttons>` | extra buttons in the pagination footer (`side="left|center|right"`) |
| `<grid-layout>`     | overrides `page-size`, scrolling mode, etc. |
| `<query-definition>`| dynamic-mode endpoint and defaults |
| `<query-param>`     | maps an external value (filter, etc.) into a query parameter |
| `<on-no-results>`   | markup rendered when the result set is empty |
| `<on-fetch-error>`  | markup rendered on network / HTTP error |
| `<filter-preset>`   | apply a predefined filter set to the grid |

(See [child elements](#closure-data-grid-children) below for details.)

## Sizing attributes

| Attribute | Description |
|---|---|
| `page-size="auto"` | sizes the grid to the available viewport height and derives row count from that height |
| `fill-reserve="N"` | with `page-size="auto"`, reserve `N` pixels below the grid |
| `fill-reserve="selector"` | reserve the live height of the matched element and relayout when it resizes |
| `fill-stop="selector"` | stop the grid at the matched element's top edge and relayout when it resizes |

When `fill-reserve="N"` is used and the next sibling is a
`<closure-row-viewer>`, `N` is treated as a minimum and the viewer's live
height is also measured.

## Master/detail

| Attribute | Description |
|---|---|
| `detail-of="gridId"` | apply a filter from the selected row of another grid |
| `detail-event="row-select"` | master event that triggers refresh (`row-select` by default) |
| `detail-rows="field.path"` | use an array already embedded in the selected master row instead of fetching |
| `detail-key="field"` | child filter field written from the selected master row |
| `detail-master-key="field"` | master row field to read; defaults to `detail-key` |

For separated requests, the master selection writes a filter in the
child. The child fetches exactly like any other `filter="fetch"` grid:

```html
<closure-data-grid id="shiftsGrid"
                   detail-of="masterDaysGrid"
                   detail-key="master_day_id"
                   filter="fetch">
  <query-definition url="/schedule/masterdays/sid:{{.Sid}}/" method="POST">
    <query-param name="action" value="shifts-grid-json"></query-param>
    <query-param name="master_day_id" bind="filter.master_day_id"></query-param>
  </query-definition>
</closure-data-grid>
```

If the server returns row markup instead of JSON:

```html
<query-definition url="/schedule/masterdays/sid:{{.Sid}}/" method="POST" response="g-row">
```

For bundled data, omit the query and point `detail-rows` at the array in
the selected row:

```html
<closure-data-grid id="shiftsGrid" detail-of="masterDaysGrid" detail-rows="shifts">
</closure-data-grid>
```

With `response="g-row"`, bundled child rows are represented with
`<g-detail>` inside the master row:

```html
<g-row>
  <g-col name="master_day_id">2401</g-col>
  <g-col name="date_str">Mon, May 11, 2026</g-col>
  <g-detail name="shifts">
    <g-row>
      <g-col name="day_work_shift_id">5001</g-col>
      <g-col name="workshift_name">Morning</g-col>
    </g-row>
  </g-detail>
</g-row>
```

For static rows that arrive in one flat list, use the same relation key.
The child applies the filter locally:

```html
<closure-data-grid id="shiftsGrid"
                   detail-of="masterDaysGrid"
                   detail-key="master_day_id">
  <g-row>
    <g-col name="master_day_id">2401</g-col>
    <g-col name="workshift_name">Morning</g-col>
  </g-row>
</closure-data-grid>
```

## Selection vs focus

| Action | Result | Event |
|---|---|---|
| Click / Tap | sets the **selected** row | `row-select` (detail: `{ row, index }`) |
| Arrow Up / Down | moves the **focused** row | `row-focus` (detail: `{ row, index }`) |
| Enter on focused | promotes focused → selected | `row-select` |

Selected and focused indexes can differ — useful for "previewing" with
the keyboard while the selection drives a side panel.

## Methods

| Method | Description |
|---|---|
| `refresh(opts)`        | reload data (`opts.goto = "<id>"` to scroll to a specific row after refresh) |
| `updateRow(data)`      | re-render the **selected** row in place from `data` (merged onto it) — no reload; no-op if nothing is selected |
| `.selectedRow` (getter)| the currently selected row object, or `null` |

## Events

| Event | Bubbles | Detail |
|---|---|---|
| `row-select` | yes | `{ row, index }` |
| `row-focus`  | yes | `{ row, index }` |
| `filter-change` (handled, not fired) | — | accepted from a paired `<closure-filter-bar>` |
| `refresh` (handled, not fired) | — | reloads the grid; `detail` is passed to `refresh()` (e.g. `goto`). Fired *at* the grid by id (`dispatch-event` / `signal-event`) |
| `refresh-row` (handled, not fired) | — | re-renders the **selected** row from `detail` (a `data-row` JSON string, or the `data-*` fields). Ignores events bubbling from children |

## Refreshing after an edit

A common flow: a row is edited in a `<closure-lightbox>`, and on success the
server response refreshes the grid declaratively — no full page reload. Drive
it from the closure response: `dispatch-event` fires a `refresh` (whole grid)
or `refresh-row` (just the edited row) **at the grid by id**, carrying data via
`data-*` (stripped of `data-`, kept kebab-case — the same convention as button
payloads; **not** the `dataset` camel-casing).

```html
<!-- close the dialog, then re-render only the edited row from the new data -->
<closure-response>
  <response-item type="close-lightbox" target-id="editBox"></response-item>
  <response-item type="dispatch-event" event="refresh-row" target-id="usersGrid"
                 data-row='{"id":42,"name":"Ana","status":"approved"}'></response-item>
</closure-response>
```

Use `refresh` (with optional `data-goto`) instead when several rows may have
changed; `refresh-row` only touches the selected row. The same events also pair
with a delayed `<signal-event name="refresh" target-id="usersGrid" delay="…">`
for polling.

## Cell buttons

Columns with `type="btn"` render one or more `<closure-btn>` definitions
inside each row. The `bind` attribute still provides action payload
fields. These optional attributes control per-row presentation:

| Attribute | Description |
|---|---|
| `show-bind="field"` | render the button only when `row[field]` is truthy and not `0` |
| `label-bind="field"` | visible button label from `row[field]` |
| `icon-bind="field"` | icon from `row[field]` |
| `title-bind="field"` | tooltip from `row[field]` |
| `width="x"` | fixed generated button width (`28` means `28px`; CSS lengths pass through) |
| `plain` / `plain-buttons` | render without the compact button frame |

When a `type="btn"` column has no explicit `grid-col width`, any
`width` declared on its child buttons contributes to the column's
auto-fit minimum width.

## Action menu columns

Columns with `type="actions"` render a compact menu button (`☰`) per row
that opens a dropdown of `<closure-btn-item>` actions:

```html
<grid-col label="" type="actions" width="44">
  <closure-btn-item icon="✎" data-action="edit"></closure-btn-item>
  <closure-btn-item icon="🗑" data-action="delete"></closure-btn-item>
</grid-col>
```

The dropdown uses the **HTML Popover API**, so it renders in the top
layer and is **not clipped** by the grid body's scroll container — the
menu on the last rows opens over the page instead of being cut off.
Outside-click / `Esc` dismissal and auto-closing any other open menu are
handled natively. Where the Popover API is unavailable it falls back to a
`position:fixed` panel positioned from the trigger's rect, so it **also
escapes the clipping** (only the native light-dismiss niceties differ).
Opening a row's menu selects that row, and choosing an item runs its action
against the selected row.

(For reference, `<grid-col type="…">` accepts `bool`, `btn`, `tags` and
`actions`; omit `type` for a plain text cell.)

## Tag columns

Columns with `type="tags"` render each value as a tag span. The row
field can be a CSV string, a JSON string, or an array from a JSON data
source:

```html
<grid-col name="problems" label="Problems" type="tags"></grid-col>
```

Supported values:

```json
"late,missing break"
["late", "missing break"]
[{"label":"late","color":"red"},{"label":"ok","class":"green"}]
```

Every tag receives `dg-tag` plus a color class. Text values are split
with `separator`, which defaults to comma. Tag cells wrap automatically,
so the row grows vertically when there are more tags than horizontal
space. Tags use a neutral gray style by default. Set `tag-color` on the
column to color every tag, or provide `color`, `class`, `variant`, or
`type` in object tag data to override a specific tag.

## Footer buttons

Add `<grid-footer-buttons>` as a direct child of the grid to place
buttons in the pagination footer. `side="left"` renders before the
pagination controls, `side="center"` renders between pagination and the
right-hand record counter, and `side="right"` renders after the counter
and built-in refresh button. If `side` is omitted, `right` is used.

Footer buttons are declared with `<closure-btn>` and execute against the
currently selected row:

```html
<closure-data-grid id="daysGrid" page-size="10">
  <grid-footer-buttons side="right">
    <closure-btn label="Issues"
                 icon="⚠"
                 mode="event"
                 event="open-issues"
                 bind="master_day_id"
                 data-action="open-issues"></closure-btn>
  </grid-footer-buttons>
</closure-data-grid>
```

## Example

```html
<closure-data-grid id="users">
  <grid-col name="username" label="User" width="20%"></grid-col>
  <grid-col name="role"     label="Role" width="15%" map-data-id="role-map"></grid-col>
  <grid-col name="active"   label="Status" width="10%" type="bool"></grid-col>
  <grid-key>username</grid-key>

  <query-definition url="/admin/users.json"></query-definition>
  <on-no-results><p>No users.</p></on-no-results>
</closure-data-grid>

<closure-row-viewer target="users">…</closure-row-viewer>
```

## Column sizing

`<grid-col width="...">` accepts:

| Value | Meaning |
|---|---|
| `width="120"` | `120px` (backwards-compatible numeric shorthand) |
| `width="12ch"` | any CSS length is passed through |
| `width="20%"` | percentage width |

If `width` is set and `align` is omitted, the grid keeps the legacy
behaviour of centering that column. Use `align="left"`,
`align="center"`, or `align="right"` to opt into a specific alignment.

For content-sized columns, add `auto-fit` to the grid. In this mode,
columns without `fill` are measured from their header/body text and the
column marked with `fill` receives the remaining horizontal space.

```html
<closure-data-grid id="periods" page-size="all" auto-fit>
  <grid-col name="from" label="From"></grid-col>
  <grid-col name="to"   label="To"></grid-col>
  <grid-col name="wd"   label="WD" align="right"></grid-col>
  <grid-col name="note" label="" fill></grid-col>

  <g-row>
    <g-col name="from">May 11, 2026</g-col>
    <g-col name="to">May 24, 2026</g-col>
    <g-col name="wd">14</g-col>
    <g-col name="note">Ready</g-col>
  </g-row>
</closure-data-grid>
```

Only `<grid-col>` supports `fill`; putting `fill` on `<g-col>` has no
effect because sizing is calculated per column, not per cell.

## CSS Variables

| Variable | Default |
|---|---|
| `--dg-border` | `var(--border, #e5e7eb)` |
| `--dg-bg`     | `#fff` |
| `--radius`    | `8px` |
| `--primary`   | `#4f46e5` |

## Behaviour

> **Note:** dynamic mode merges the live filter values from any paired
> `<closure-filter-bar>` into the request. Filter changes auto-call
> `refresh()` (resetting to page 1).

> **Note:** with `auto-page-size`, the grid measures its body and
> picks a `pageSize` that fills the viewport without overflow on first
> render. Manual `<grid-layout page-size="N">` always wins.

> **Note:** `<filter-preset>` lets the markup expose one-click filter
> sets that the consumer can wire to buttons; the preset writes back
> through the filter bar so the chips visually update.

---
%%>*/

class ClosureDataGrid extends HTMLElement {
  static _styleId = 'closure-data-grid-default-style';
  static _style = [
    'closure-data-grid { display: block; outline: none; }',
    'closure-data-grid .dg-wrap { border: 1px solid var(--dg-border, var(--border, #e5e7eb)); border-radius: var(--radius, 8px); overflow: hidden; background: var(--dg-bg, #fff); display: flex; flex-direction: column; transition: border-color 0.15s; }',
    'closure-data-grid:focus .dg-wrap { border-color: var(--primary, #4f46e5); }',
    'closure-data-grid .dg-thead-wrap { overflow: hidden; flex-shrink: 0; border-bottom: 1px solid var(--dg-border, var(--border, #e5e7eb)); }',
    'closure-data-grid .dg-table-wrap { flex: 1; overflow-x: auto; overflow-y: auto; scrollbar-width: none; }',
    'closure-data-grid .dg-table-wrap::-webkit-scrollbar { display: none; }',
    'closure-data-grid .dg-table { width: 100%; border-collapse: collapse; font-size: var(--dg-font-size, 13px); font-family: var(--dg-font, var(--font, sans-serif)); table-layout: fixed; }',
    'closure-data-grid .dg-head-table { table-layout: auto; }',
    'closure-data-grid .dg-table th { text-align: left; padding: var(--dg-padding, 6px 12px); font-size: 12px; font-weight: 600; color: var(--dg-color-header, var(--text, #111827)); background: var(--dg-bg-header, #f0f0f0); white-space: nowrap; user-select: none; cursor: pointer; border-right: 1px solid var(--dg-border, var(--border, #e5e7eb)); }',
    'closure-data-grid .dg-table th:last-child { border-right: none; }',
    'closure-data-grid .dg-table th:hover { color: var(--primary, #4f46e5); }',
    'closure-data-grid .dg-table td { padding: var(--dg-padding, 6px 12px); border-bottom: 1px solid var(--dg-border, var(--border, #e5e7eb)); border-right: 1px solid var(--dg-border, var(--border, #e5e7eb)); color: var(--dg-color, var(--text, #111827)); vertical-align: middle; }',
    'closure-data-grid .dg-table td:last-child { border-right: none; }',
    'closure-data-grid .dg-table tr:last-child td { border-bottom: none; }',
    'closure-data-grid .dg-table tr { cursor: pointer; }',
    'closure-data-grid .dg-table tr:focus { outline: none; }',
    'closure-data-grid .dg-table tr.focused td { background: var(--dg-bg-selected, #dde4fb); }',
    'closure-data-grid .dg-table tr.focused td:first-child { border-left: var(--dg-bar-width, 3px) solid var(--dg-bar-color, var(--primary, #4f46e5)); padding-left: 9px; }',
    'closure-data-grid .dg-table tr:not(.focused) td:first-child { border-left: var(--dg-bar-width, 3px) solid transparent; padding-left: 9px; }',
    'closure-data-grid .dg-table thead th:first-child { padding-left: 9px; border-left: none; }',
    'closure-data-grid .dg-col-collapse { max-width: 80px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }',
    'closure-data-grid .dg-pagination { display: flex; align-items: center; gap: 6px; padding: 8px 12px; border-top: 1px solid var(--dg-border, var(--border, #e5e7eb)); background: var(--dg-bg-header, #f0f0f0); font-size: 12px; font-family: var(--dg-font, var(--font, sans-serif)); color: var(--text-muted, #6b7280); }',
    'closure-data-grid .dg-pagination-group { display: inline-flex; align-items: center; gap: 6px; }',
    'closure-data-grid .dg-pagination-sep { flex: 1; }',
    'closure-data-grid .dg-page-btn { padding: 4px 10px; border: 1px solid var(--dg-border, var(--border, #e5e7eb)); border-radius: 4px; background: var(--dg-bg, #fff); cursor: pointer; font-size: 12px; font-family: var(--dg-font, var(--font, sans-serif)); color: var(--dg-color, var(--text, #111827)); }',
    'closure-data-grid .dg-page-btn:hover { background: var(--dg-bg-selected, #dde4fb); }',
    'closure-data-grid .dg-page-btn:disabled { opacity: 0.4; cursor: not-allowed; }',
    'closure-data-grid .dg-page-info { padding: 4px 10px; background: var(--primary, #4f46e5); color: #fff; border-radius: 4px; font-weight: 600; }',
    'closure-data-grid .dg-cell-btn { display: inline-flex; align-items: center; justify-content: center; box-sizing: border-box; min-width: 24px; min-height: 22px; padding: 2px 7px; border: 1px solid var(--dg-border, var(--border, #e5e7eb)); border-radius: 4px; background: var(--dg-bg, #fff); color: var(--dg-color, var(--text, #111827)); font: inherit; font-size: 12px; line-height: 1.2; cursor: pointer; }',
    'closure-data-grid .dg-cell-btn:hover { background: var(--dg-bg-selected, #dde4fb); border-color: var(--primary, #4f46e5); }',
    'closure-data-grid .dg-cell-btn.plain { min-width: 0; min-height: 0; padding: 0; border: none; border-radius: 0; background: transparent; font-size: inherit; }',
    'closure-data-grid .dg-cell-btn.plain:hover { background: transparent; border-color: transparent; color: var(--primary, #4f46e5); }',
    'closure-data-grid .dg-tags-cell { white-space: normal; vertical-align: top; }',
    'closure-data-grid .dg-tags { display: flex; align-items: flex-start; flex-wrap: wrap; gap: 4px; width: 100%; min-width: 0; }',
    'closure-data-grid .dg-tag { display: inline-flex; align-items: center; max-width: 100%; padding: 1px 7px; border: 1px solid #d1d5db; border-radius: 999px; font-size: 11px; line-height: 1.45; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; background: #f9fafb; color: #374151; }',
    'closure-data-grid .dg-tag-color-0, closure-data-grid .dg-tag-color-blue { background: #dbeafe; color: #1e3a8a; border-color: #bfdbfe; }',
    'closure-data-grid .dg-tag-color-1, closure-data-grid .dg-tag-color-green { background: #dcfce7; color: #166534; border-color: #bbf7d0; }',
    'closure-data-grid .dg-tag-color-2, closure-data-grid .dg-tag-color-yellow { background: #fef9c3; color: #854d0e; border-color: #fde68a; }',
    'closure-data-grid .dg-tag-color-3, closure-data-grid .dg-tag-color-red { background: #fee2e2; color: #991b1b; border-color: #fecaca; }',
    'closure-data-grid .dg-tag-color-4, closure-data-grid .dg-tag-color-purple { background: #f3e8ff; color: #6b21a8; border-color: #e9d5ff; }',
    'closure-data-grid .dg-tag-color-5, closure-data-grid .dg-tag-color-cyan { background: #cffafe; color: #155e75; border-color: #a5f3fc; }',
    'closure-data-grid .dg-tag-color-6, closure-data-grid .dg-tag-color-gray, closure-data-grid .dg-tag-color-grey { background: #f3f4f6; color: #374151; border-color: #e5e7eb; }',
    'closure-data-grid .dg-tag-color-7, closure-data-grid .dg-tag-color-pink { background: #fce7f3; color: #9d174d; border-color: #fbcfe8; }',
    'closure-data-grid .dg-no-results { padding: 20px; text-align: center; color: var(--text-muted, #6b7280); }',
  ].join('\n');

  connectedCallback() {
    if (this._initialized) {
      // Reconnect: restore the global listeners/observers dropped on disconnect
      if (this._onDocClick) document.addEventListener('click', this._onDocClick);
      if (this._onDocKeydown) document.addEventListener('keydown', this._onDocKeydown);
      if (this._onWinResize) window.addEventListener('resize', this._onWinResize);
      if (this._onScrollClosePanels) window.addEventListener('scroll', this._onScrollClosePanels, { capture: true, passive: true });
      // Observers only once the grid is built — _wrap is set in _build
      if (this._wrap) {
        this._setupAutoFitResizeObserver();
        this._setupFillObserver();
        this._setupMasterDetail();
      }
      return;
    }
    this._initialized = true;
    if (!document.getElementById(ClosureDataGrid._styleId)) {
      const s = document.createElement('style');
      s.id = ClosureDataGrid._styleId;
      s.textContent = ClosureDataGrid._style;
      document.head.appendChild(s);
    }
    this.tabIndex = 0;
    this.style.outline = 'none';
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this._init(), { once: true });
    } else {
      this._init();
    }
  }

  // ---
  disconnectedCallback() {
    if (this._onDocClick) document.removeEventListener('click', this._onDocClick);
    if (this._onDocKeydown) document.removeEventListener('keydown', this._onDocKeydown);
    if (this._onWinResize) window.removeEventListener('resize', this._onWinResize);
    if (this._onScrollClosePanels) window.removeEventListener('scroll', this._onScrollClosePanels, { capture: true });
    if (this._masterEl && this._onMasterEvent) {
      this._masterEl.removeEventListener(this._detailEvent, this._onMasterEvent);
      this._masterEl = null;
      this._masterDetailBound = false;
    }
    if (this._masterDetailRetry) { cancelAnimationFrame(this._masterDetailRetry); this._masterDetailRetry = 0; }
    if (this._fillObserverRetry) { cancelAnimationFrame(this._fillObserverRetry); this._fillObserverRetry = 0; }
    if (this._autoFitResizeObserver) { this._autoFitResizeObserver.disconnect(); this._autoFitResizeObserver = null; }
    if (this._fillResizeObserver) { this._fillResizeObserver.disconnect(); this._fillResizeObserver = null; }
  }

  // ---
  _init() {
    this._readDefinitions();
    this._currentPage = 1;
    this._selectedIdx = 0;
    this._kbNav = false;
    this._filters = {};
    this._ROW_H = 34;

    if (this._isDynamic) {
      this._allRows = [];
      this._rows = [];
      this._total = 0;
      this._build();
      if (!this._detailOf) this._fetchDynamic();
    } else if (this._isStaticByRequest) {
      this._allRows = [];
      this._rows = [];
      this._total = 0;
      this._build();
      if (!this._detailOf) this._fetchStatic();
    } else {
      this._readInlineData();
      this._build();
    }
  }

  // ---
  _readDefinitions() {
    this._cols = Array.from(this.querySelectorAll('grid-col')).map(el => ({
      name:     el.getAttribute('name'),
      label:    el.getAttribute('label') || '',
      type:     el.getAttribute('type') || 'text',
      mapId:    el.getAttribute('map-data-id') || '',
      width:    el.getAttribute('width') || '',
      align:    this._normalizeAlign(el.getAttribute('align') || ''),
      tagColor: el.getAttribute('tag-color') || el.getAttribute('color') || '',
      fill:     el.hasAttribute('fill'),
      collapse: el.hasAttribute('collapse'),
      key:      el.hasAttribute('key'),
      el:       el,
    }));
    this._keys = Array.from(this.querySelectorAll('grid-key')).map(el => ({
      keys:     (el.getAttribute('key') || '').split(',').map(k => k.trim()),
      url:      el.getAttribute('url') || '',
      action:   el.getAttribute('action') || '',
      mode:     el.getAttribute('mode') || 'navigate',
      bind:     (el.getAttribute('bind') || '').split(',').map(s => s.trim()).filter(Boolean),
      targetId: el.getAttribute('target-id') || '',
      eventName: el.getAttribute('event') || 'row-action',
      dataAttrs: this._readDataAttrs(el),
    }));
    this._noResults = this.querySelector('on-no-results');
    this._fetchError = this.querySelector('on-fetch-error');
    this._footerButtons = Array.from(this.children)
      .filter(el => el.tagName === 'GRID-FOOTER-BUTTONS')
      .map(el => ({
        side: this._normalizeFooterSide(el.getAttribute('side') || ''),
        el,
      }));

    // Query definition
    const qd = this.querySelector('query-definition');
    if (qd) {
      this._queryDef = {
        name:   qd.getAttribute('name') || 'data',
        url:    qd.getAttribute('url') || '',
        method: (qd.getAttribute('method') || 'POST').toUpperCase(),
        target: qd.getAttribute('target') || '_self',
        response: qd.getAttribute('response') || 'json',
        params: Array.from(qd.querySelectorAll('query-param')).map(p => ({
          name:  p.getAttribute('name'),
          value: p.getAttribute('value') || null,
          bind:  p.getAttribute('bind') || null,
        })),
      };
    } else {
      this._queryDef = null;
    }

    // Detect mode
    this._isStatic = this.hasAttribute('static');
    this._isDynamic = this._queryDef && !this._isStatic;
    this._isStaticByRequest = this._queryDef && this._isStatic;
    this._detailOf = this.getAttribute('detail-of') || '';
    this._detailEvent = this.getAttribute('detail-event') || 'row-select';
    this._detailRows = this.getAttribute('detail-rows') || '';
    this._detailKey = this.getAttribute('detail-key') || '';
    this._detailMasterKey = this.getAttribute('detail-master-key') || this._detailKey;
    this._detailFilters = {};
    this._masterRow = null;
  }

  // ---
  _readInlineData() {
    // Skip rows nested inside <g-detail> — those belong to their master
    // row, not to the top-level row set
    this._allRows = Array.from(this.querySelectorAll('g-row'))
      .filter(row => !row.closest('g-detail'))
      .map(row => this._rowObjectFromElement(row));
    this._filters = {};
    if (this._detailOf && this._detailKey) {
      this._rows = [];
      this._total = 0;
    } else {
      this._applyFilters();
    }
  }

  // ---
  _rowObjectFromElement(row) {
    const obj = {};
    Array.from(row.children).filter(child => child.tagName === 'G-COL').forEach(col => {
      // textContent, not innerHTML: cells render via textContent, so the
      // serialized form would show entities literally (AT&amp;T)
      obj[col.getAttribute('name')] = col.textContent.trim();
    });
    Array.from(row.children).filter(child => child.tagName === 'G-DETAIL').forEach(detail => {
      const name = detail.getAttribute('name');
      if (!name) return;
      obj[name] = Array.from(detail.querySelectorAll('g-row'))
        .filter(childRow => childRow.closest('g-detail') === detail)
        .map(childRow => this._rowObjectFromElement(childRow));
    });
    return obj;
  }

  // ---
  _applyFilters() {
    const f = this._filters;
    this._rows = this._allRows.filter(row => {
      for (const key of Object.keys(f)) {
        const val = f[key];
        if (!val) continue;
        if (key === 'q') {
          const q = val.toLowerCase();
          const match = Object.values(row).some(v => String(v).toLowerCase().includes(q));
          if (!match) return false;
        } else if (Array.isArray(val)) {
          // Multi-select: match if any selected value equals the cell — or, when
          // the cell is itself an array (e.g. a tags column from a JSON source),
          // if the two intersect. (Was `val.includes(',')`, which also mis-split
          // text like "García, Juan".)
          const cell = row[key];
          const cellVals = Array.isArray(cell)
            ? cell.map(String)
            : [String(cell == null ? '' : cell)];
          if (!val.some(v => cellVals.includes(String(v)))) return false;
        } else {
          if (String(row[key] || '') !== val) return false;
        }
      }
      return true;
    });
    this._total = this._rows.length;
  }

  // ---
  _resolveParams() {
    if (!this._queryDef) return {};
    const params = {};
    const ps = this.pageSize;
    this._queryDef.params.forEach(p => {
      if (p.value !== null) {
        params[p.name] = p.value;
      } else if (p.bind) {
        const parts = p.bind.split('.');
        const ns = parts[0];
        const key = parts[1];
        if (ns === 'grid') {
          if (key === 'offset') params[p.name] = (this._currentPage - 1) * ps;
          else if (key === 'limit') params[p.name] = ps;
          else if (key === 'page') params[p.name] = this._currentPage;
          else if (key === 'page_size') params[p.name] = ps;
          else if (key === 'goto_id') { if (this._gotoId) params[p.name] = this._gotoId; }
        } else if (ns === 'filter') {
          const v = (this._filters || {})[key];
          /*<%% if:mockup %%>*/ console.log('[resolveParams] filter.' + key + ' =', JSON.stringify(v), 'filters=', JSON.stringify(this._filters)); /*<%% end %%>*/
          // Multi-select arrays go to the server as CSV — wire format unchanged.
          if (v) params[p.name] = Array.isArray(v) ? v.join(',') : v;
        } else {
          const v = this._resolveExternalBind(parts);
          if (v !== undefined && v !== null && v !== '') params[p.name] = v;
        }
      }
    });
    return params;
  }

  // ---
  _resolveExternalBind(parts) {
    if (!parts || parts.length < 3) return undefined;
    const sourceId = parts[0] === 'master' ? this._detailOf : parts[0];
    if (!sourceId || parts[1] !== 'row') return undefined;
    const source = document.getElementById(sourceId);
    const row = source && source.selectedRow ? source.selectedRow : this._masterRow;
    if (!row) return undefined;
    return this._readPath(row, parts.slice(2).join('.'));
  }

  // ---
  _fetchStatic() {
    const qd = this._queryDef;
    const params = this._resolveParams();
    const url = qd.url;
    const method = qd.method;

    const fetchOpts = { method, credentials: 'same-origin' };
    if (method === 'GET') {
      const qs = new URLSearchParams(params).toString();
      var fetchUrl = url + (url.includes('?') ? '&' : '?') + qs;
    } else {
      fetchOpts.headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
      fetchOpts.body = new URLSearchParams(params).toString();
      var fetchUrl = url;
    }

    const seq = this._fetchSeq = (this._fetchSeq || 0) + 1;
    fetch(fetchUrl, fetchOpts)
      .then(r => this._readQueryResponse(r))
      .then(resp => {
        if (seq !== this._fetchSeq) return; // a newer request superseded this one
        if (resp.error) { this._showError(resp.error); return; }
        this._gotoId = null; // one-shot: don't resend on later requests
        this._allRows = resp.data || [];
        this._applyFilters();
        this._currentPage = 1;
        this._selectedIdx = 0;
        this._renderPage();
        this._syncColWidths();
      })
      .catch(err => {
        console.error('static fetch error:', err);
        if (seq === this._fetchSeq) this._showError(err.message);
      });
  }

  // ---
  _fetchDynamic() {
    const qd = this._queryDef;
    const params = this._resolveParams();
    const url = qd.url;
    const method = qd.method;

    const fetchOpts = { method, credentials: 'same-origin' };
    let fetchUrl = url;
    if (method === 'GET') {
      const qs = new URLSearchParams(params).toString();
      fetchUrl = url + (url.includes('?') ? '&' : '?') + qs;
    } else {
      fetchOpts.headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
      fetchOpts.body = new URLSearchParams(params).toString();
    }

    const seq = this._fetchSeq = (this._fetchSeq || 0) + 1;
    fetch(fetchUrl, fetchOpts)
      .then(r => this._readQueryResponse(r))
      .then(resp => {
        if (seq !== this._fetchSeq) return; // a newer request superseded this one
        if (resp.error) { this._showError(resp.error); return; }
        this._gotoId = null; // one-shot: don't resend on later requests
        const res = resp.result || {};
        this._rows = resp.data || [];
        this._total = res.total || this._rows.length;
        this._eof = res.eof || false;
        if (res.offset !== undefined) {
          const ps = this.pageSize;
          // Guard div-by-zero: page-size="all" with an empty result makes
          // pageSize 0 → res.offset / 0 = NaN → page=NaN on every later fetch.
          this._currentPage = ps > 0 ? Math.floor(res.offset / ps) + 1 : 1;
        }
        if (res.select_index !== undefined && res.select_index >= 0) {
          this._pendingFocusIdx = res.select_index;
        }
        this._renderPage(false, true);
        this._syncColWidths();
      })
      .catch(err => {
        console.error('dynamic fetch error:', err);
        if (seq === this._fetchSeq) {
          this._pendingFocusIdx = null; // don't let it leak into a later render
          this._showError(err.message);
        }
      });
  }

  // ---
  _readQueryResponse(response) {
    if (!this._queryDef || this._queryDef.response !== 'g-row') return response.json();
    return response.text().then(html => this._parseGRowResponse(html));
  }

  // ---
  _parseGRowResponse(html) {
    const tmp = document.createElement('template');
    tmp.innerHTML = html || '';
    const meta = tmp.content.querySelector('query-result');
    const rows = Array.from(tmp.content.querySelectorAll('g-row'))
      .filter(row => !row.closest('g-detail'))
      .map(row => this._rowObjectFromElement(row));
    const result = {};
    if (meta) {
      ['total', 'offset'].forEach(name => {
        if (meta.hasAttribute(name)) result[name] = parseInt(meta.getAttribute(name), 10) || 0;
      });
      if (meta.hasAttribute('eof')) result.eof = meta.getAttribute('eof') !== 'false';
      if (meta.hasAttribute('select-index')) result.select_index = parseInt(meta.getAttribute('select-index'), 10) || 0;
    }
    return { result, data: rows };
  }

  // ---
  _navigateWithParams() {
    const qd = this._queryDef;
    const params = this._resolveParams();
    const form = document.createElement('form');
    form.method = qd.method;
    form.action = qd.url;
    form.target = qd.target || '_self';
    form.style.display = 'none';
    for (const [k, v] of Object.entries(params)) {
      const input = document.createElement('input');
      input.type = 'hidden'; input.name = k; input.value = v;
      form.appendChild(input);
    }
    document.body.appendChild(form);
    form.submit();
    form.remove(); // submit is already initiated; drop the node so it
                   // can't orphan in <body> — this path may set
                   // form.target="_blank", which never navigates the page
  }

  // ---
  _showError(msg) {
    this._tbody.innerHTML = '';
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = this._cols.length;
    td.className = 'dg-no-results';
    if (this._fetchError) {
      td.innerHTML = this._fetchError.innerHTML;
    } else {
      td.textContent = msg || 'Error loading data';
    }
    tr.appendChild(td);
    this._tbody.appendChild(tr);
    this._updatePagination();
  }

  // ---
  _readDataAttrs(el) {
    const d = {};
    for (const attr of el.attributes) {
      if (attr.name.startsWith('data-')) d[attr.name.slice(5)] = attr.value;
    }
    return d;
  }

  // ---
  _cssLength(value) {
    const v = String(value || '').trim();
    if (!v) return '';
    if (/^-?\d+(\.\d+)?$/.test(v)) return v + 'px';
    return v;
  }

  // ---
  _normalizeAlign(value) {
    const align = String(value || '').trim().toLowerCase();
    return /^(left|center|right)$/.test(align) ? align : '';
  }

  // ---
  _normalizeFooterSide(value) {
    const side = String(value || '').trim().toLowerCase();
    return /^(left|center|right)$/.test(side) ? side : 'right';
  }

  // ---
  _applyColumnPresentation(el, col, isBodyCell) {
    if (col.width) {
      el.style.width = this._cssLength(col.width);
      if (isBodyCell) el.style.padding = '6px 4px';
    }
    if (col.align) {
      el.style.textAlign = col.align;
    } else if (col.width) {
      el.style.textAlign = 'center';
    }
  }

  // ---
  _cellContentWidth(cell) {
    // Prefer the batched cache (populated by _syncColWidths) so the
    // per-column auto-fit loop doesn't force a layout flush per cell; fall
    // back to a one-off measurement when there's no cache.
    if (this._widthCache && this._widthCache.has(cell)) return this._widthCache.get(cell);
    const cs = getComputedStyle(cell);
    const probe = document.createElement('span');
    probe.style.cssText = [
      'position:fixed',
      'left:-10000px',
      'top:-10000px',
      'visibility:hidden',
      'white-space:nowrap',
      'font:' + cs.font,
      'letter-spacing:' + cs.letterSpacing,
    ].join(';');
    probe.textContent = cell.textContent || '';
    document.body.appendChild(probe);
    const pad = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
    const width = Math.ceil(probe.getBoundingClientRect().width + pad + 2);
    probe.remove();
    return width;
  }

  // ---
  // Measure the text width of many cells with a SINGLE layout flush. The
  // previous path (append → getBoundingClientRect → remove, per cell, inside
  // the per-column loop) interleaved DOM writes with reads and forced one
  // reflow per cell — O(columns × rows) layout thrashing. Here every probe
  // goes into one offscreen container inserted once; the first read flushes
  // layout once and the rest are free (no mutation between reads). Returns a
  // Map(cell -> width) consumed by _cellContentWidth.
  _measureCellWidths(cells) {
    const cache = new Map();
    if (!cells.length) return cache;
    const container = document.createElement('div');
    // nowrap container + inline-block probes: each probe shrinks to its own
    // content width (a display:block child would stretch to the container).
    container.style.cssText = 'position:fixed;left:-10000px;top:-10000px;visibility:hidden;white-space:nowrap;';
    const probes = [];
    const pads = [];
    for (const cell of cells) {
      const cs = getComputedStyle(cell);
      const probe = document.createElement('span');
      probe.style.cssText = 'display:inline-block;white-space:nowrap;font:' + cs.font + ';letter-spacing:' + cs.letterSpacing + ';';
      probe.textContent = cell.textContent || '';
      container.appendChild(probe);
      probes.push(probe);
      pads.push(parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight));
    }
    document.body.appendChild(container); // single insertion → single layout invalidation
    for (let i = 0; i < cells.length; i++) {
      cache.set(cells[i], Math.ceil(probes[i].getBoundingClientRect().width + pads[i] + 2));
    }
    container.remove();
    return cache;
  }

  // ---
  _horizontalPadding(el) {
    if (!el) return 0;
    const cs = getComputedStyle(el);
    return (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
  }

  // ---
  _cssLengthPx(value, contextEl) {
    const css = this._cssLength(value);
    if (!css) return 0;
    if (css.endsWith('px')) return parseFloat(css) || 0;
    const probe = document.createElement('div');
    const cs = contextEl ? getComputedStyle(contextEl) : null;
    probe.style.cssText = [
      'position:fixed',
      'left:-10000px',
      'top:-10000px',
      'visibility:hidden',
      'box-sizing:border-box',
      'width:' + css,
      cs ? ('font:' + cs.font) : '',
    ].filter(Boolean).join(';');
    document.body.appendChild(probe);
    const width = probe.getBoundingClientRect().width;
    probe.remove();
    return width || 0;
  }

  // ---
  _buttonColumnMinWidth(col, th, columnCells) {
    if (!col || col.type !== 'btn') return 0;
    const items = Array.from(col.el.querySelectorAll('closure-btn'));
    if (!items.length) return 0;
    const context = columnCells[0] || th;
    const declaredWidth = items.reduce((sum, item) => {
      const width = this._cssLengthPx(item.getAttribute('width') || '', context);
      return sum + width;
    }, 0);
    if (declaredWidth <= 0) return 0;
    return Math.ceil(declaredWidth + this._horizontalPadding(context || th) + 2);
  }

  // ---
  _tagColumnMinWidth(col, th, columnCells) {
    if (!col || col.type !== 'tags' || !columnCells.length) return 0;
    const tagWidths = columnCells.flatMap(cell => {
      return Array.from(cell.querySelectorAll('.dg-tag')).map(tag => {
        return Math.ceil(tag.getBoundingClientRect().width + this._horizontalPadding(cell) + 2);
      });
    });
    return Math.max(this._cellContentWidth(th), ...tagWidths, 0);
  }

  // ---
  _autoFitColumnWidth(idx, ths, gridCol) {
    const columnCells = Array.from(this._tbody.querySelectorAll('tr td:nth-child(' + (idx + 1) + ')'));
    if (gridCol && gridCol.type === 'tags') {
      return this._tagColumnMinWidth(gridCol, ths[idx], columnCells);
    }
    return Math.max(
      this._cellContentWidth(ths[idx]),
      this._buttonColumnMinWidth(gridCol, ths[idx], columnCells),
      ...columnCells.map(cell => this._cellContentWidth(cell))
    );
  }

  // ---
  get pageSize() {
    const ps = this.getAttribute('page-size');
    if (!ps || ps === 'all') return this._total;
    if (ps === 'auto') return this._calcAutoPageSize();
    return parseInt(ps, 10) || this._total;
  }

  get totalPages() { return Math.max(1, Math.ceil(this._total / this.pageSize)); }

  // ---
  _calcAutoPageSize() {
    const wrap = this._wrap;
    if (!wrap) return 10;
    const theadH = this.hasAttribute('headless') ? 0 : (this._headTable ? this._headTable.offsetHeight : 32);
    const paginH = this.hasAttribute('footerless') ? 0 : (this._pagination ? this._pagination.offsetHeight : 36);
    const ROW_H = 34;
    const minRows = parseInt(this.getAttribute('min-rows'), 10) || 1;
    const maxRows = parseInt(this.getAttribute('max-rows'), 10) || 999;
    const available = wrap.clientHeight - theadH - paginH - 4;
    const calc = Math.floor(available / ROW_H);
    return Math.max(minRows, Math.min(maxRows, calc));
  }

  // ---
  _build() {
    // Clear children
    const origHTML = this.innerHTML;
    this.innerHTML = '';

    // Wrap
    this._wrap = document.createElement('div');
    this._wrap.className = 'dg-wrap';

    // Head table (skipped when the grid has the `headless` attribute)
    if (!this.hasAttribute('headless')) {
      const headWrap = document.createElement('div');
      headWrap.className = 'dg-thead-wrap';
      this._headTable = document.createElement('table');
      this._headTable.className = 'dg-table dg-head-table';
      const thead = document.createElement('thead');
      const headRow = document.createElement('tr');
      this._cols.forEach(col => {
        const th = document.createElement('th');
        this._applyColumnPresentation(th, col, false);
        if (col.collapse) th.className = 'dg-col-collapse';
        if (col.type === 'actions') {
          th.textContent = '⋮';
          th.title = col.label || 'Actions';
          th.style.textAlign = 'right';
        } else if (col.type === 'btn') {
          th.textContent = col.label || '';
          th.title = col.label || col.name;
        } else {
          th.textContent = col.label || '';
        }
        th.addEventListener('click', () => {
          this.dispatchEvent(new CustomEvent('header-click', { detail: { column: col.name }, bubbles: true }));
        });
        headRow.appendChild(th);
      });
      thead.appendChild(headRow);
      this._headTable.appendChild(thead);
      headWrap.appendChild(this._headTable);
      this._wrap.appendChild(headWrap);
    }

    // Body table
    this._bodyWrap = document.createElement('div');
    this._bodyWrap.className = 'dg-table-wrap';

    this._bodyTable = document.createElement('table');
    this._bodyTable.className = 'dg-table';
    this._tbody = document.createElement('tbody');
    this._bodyTable.appendChild(this._tbody);
    this._bodyWrap.appendChild(this._bodyTable);
    this._wrap.appendChild(this._bodyWrap);

    // Pagination (skipped when the grid has the `footerless` attribute)
    const ps = this.getAttribute('page-size');
    if (ps && ps !== 'all' && !this.hasAttribute('footerless')) {
      this._pagination = document.createElement('div');
      this._pagination.className = 'dg-pagination';
      this._buildPagination();
      this._wrap.appendChild(this._pagination);
    }

    this.appendChild(this._wrap);

    // Auto page-size: set height BEFORE first render
    if (ps === 'auto') {
      this._setAutoHeight();
    }

    // Render first page
    this._renderPage();
    this._syncColWidths();
    // max-rows cap: applies regardless of page-size mode (e.g. with
    // page-size="all" + static data, this limits visible rows and scrolls
    // the body for the rest).
    this._applyMaxHeight();

    // Events
    this._setupEvents();
    this._setupMasterDetail();
    this._setupAutoFitResizeObserver();
    this._setupFillObserver();

    // Auto-focus
    if (this.hasAttribute('autofocus')) this.focus();

    // Auto page-size: observe resize
    if (ps === 'auto' && !this._onWinResize) {
      this._onWinResize = () => this._refreshAutoLayout();
      window.addEventListener('resize', this._onWinResize);
    }
  }

  // ---
  _setupAutoFitResizeObserver() {
    if (!this.hasAttribute('auto-fit') || !window.ResizeObserver || this._autoFitResizeObserver) return;
    this._autoFitLastWidth = Math.floor(this._bodyWrap ? this._bodyWrap.clientWidth : this.clientWidth);
    this._autoFitResizeObserver = new ResizeObserver(() => {
      if (this._autoFitResizeRaf) cancelAnimationFrame(this._autoFitResizeRaf);
      this._autoFitResizeRaf = requestAnimationFrame(() => {
        const width = Math.floor(this._bodyWrap ? this._bodyWrap.clientWidth : this.clientWidth);
        if (!width || width === this._autoFitLastWidth) return;
        this._autoFitLastWidth = width;
        this._syncColWidths();
      });
    });
    this._autoFitResizeObserver.observe(this._bodyWrap || this);
  }

  // ---
  _setupMasterDetail() {
    if (!this._detailOf || this._masterDetailBound) return;
    const master = document.getElementById(this._detailOf);
    if (!master) {
      if (!this._masterDetailRetry) {
        this._masterDetailRetry = requestAnimationFrame(() => {
          this._masterDetailRetry = 0;
          this._setupMasterDetail();
        });
      }
      return;
    }
    this._masterDetailBound = true;
    this._masterEl = master;
    if (!this._onMasterEvent) {
      this._onMasterEvent = e => this._refreshFromMaster(e.detail ? e.detail.row : null);
    }
    master.addEventListener(this._detailEvent, this._onMasterEvent);
    this._refreshFromMaster(master.selectedRow || null);
  }

  // ---
  _refreshFromMaster(row) {
    this._masterRow = row || null;
    this._currentPage = 1;
    this._selectedIdx = 0;

    if (!this._masterRow) {
      if (this._detailKey) this._clearDetailFilterRows();
      else this._setRows([]);
      return;
    }

    if (this._detailRows) {
      const rows = this._readPath(this._masterRow, this._detailRows);
      this._setRows(Array.isArray(rows) ? rows : []);
      return;
    }

    if (this._detailKey) {
      const masterValue = this._readPath(this._masterRow, this._detailMasterKey);
      this._detailFilters = {};
      if (this._filters) delete this._filters[this._detailKey];
      if (masterValue !== undefined && masterValue !== null && masterValue !== '') {
        this._detailFilters[this._detailKey] = String(masterValue);
      }
      this._filters = { ...(this._filters || {}), ...this._detailFilters };
      this._applyFilterMode();
      return;
    }

    if (this._isDynamic) this._fetchDynamic();
    else if (this._isStaticByRequest) this._fetchStatic();
    else this._renderPage();
  }

  // ---
  _setRows(rows) {
    this._allRows = rows || [];
    this._applyFilters();
    this._renderPage();
    this._syncColWidths();
  }

  // ---
  _showRows(rows) {
    const allRows = this._allRows;
    this._allRows = rows || [];
    this._applyFilters();
    this._allRows = allRows;
    this._renderPage();
    this._syncColWidths();
  }

  // ---
  _clearDetailFilterRows() {
    if (this._detailKey) delete this._detailFilters[this._detailKey];
    if (this._detailKey && this._filters) delete this._filters[this._detailKey];
    if (this._isDynamic || this._isStaticByRequest) {
      this._rows = [];
      this._total = 0;
      this._renderPage(false, this._isDynamic);
      this._syncColWidths();
      return;
    }
    this._showRows([]);
  }

  // ---
  _applyFilterMode() {
    this._currentPage = 1;
    this._selectedIdx = 0;
    // Dynamic grids default to re-fetching with the live filter values —
    // their _allRows is empty, so local filtering would blank the grid
    const filterMode = this.getAttribute('filter') || (this._isDynamic ? 'fetch' : 'local');
    if (filterMode === 'fetch' && this._queryDef) {
      this._fetchDynamic();
    } else if (filterMode === 'navigate' && this._queryDef) {
      this._navigateWithParams();
    } else {
      this._applyFilters();
      this._renderPage();
      this._syncColWidths();
    }
  }

  // ---
  _readPath(obj, path) {
    if (!obj || !path) return undefined;
    return path.split('.').reduce((cur, part) => {
      if (cur === undefined || cur === null) return undefined;
      return cur[part];
    }, obj);
  }

  // ---
  _setupFillObserver() {
    if (this.getAttribute('page-size') !== 'auto' || !window.ResizeObserver || this._fillResizeObserver) return;
    const fillSelector = this.getAttribute('fill-stop') || this.getAttribute('fill-reserve') || '';
    const target = this._fillTargetElement();
    if (!target && (!fillSelector || parseInt(fillSelector, 10) > 0)) return;
    if (!target) {
      // The target may simply be rendered later (deferred), so we retry — but
      // a typo'd selector (e.g. fill-stop="#nope") would never match and loop
      // at 60fps forever. Cap the retries (~1s) and warn instead of burning CPU.
      if ((this._fillObserverRetries = (this._fillObserverRetries || 0) + 1) > 60) {
        console.warn('closure-data-grid: fill target "' + fillSelector +
          '" not found after ~1s — giving up (check fill-stop / fill-reserve).');
        return;
      }
      if (!this._fillObserverRetry) {
        this._fillObserverRetry = requestAnimationFrame(() => {
          this._fillObserverRetry = 0;
          this._setupFillObserver();
        });
      }
      return;
    }
    this._fillObserverRetries = 0; // target found — reset for any future re-setup
    this._fillResizeObserver = new ResizeObserver(() => {
      if (this._fillResizeRaf) cancelAnimationFrame(this._fillResizeRaf);
      this._fillResizeRaf = requestAnimationFrame(() => this._refreshAutoLayout());
    });
    this._fillResizeObserver.observe(target);
    this._renderedChildren(target).forEach(child => this._fillResizeObserver.observe(child));
  }

  // ---
  _refreshAutoLayout() {
    if (this.getAttribute('page-size') !== 'auto') return;
    this._setAutoHeight();
    const newTp = this.totalPages;
    if (this._currentPage > newTp) this._currentPage = newTp;
    this._renderPage();
    this._syncColWidths();
    this._updatePagination();
  }

  // ---
  _buildPagination() {
    const p = this._pagination;
    p.innerHTML = '';
    this._appendFooterButtons(p, 'left');

    const nav = document.createElement('div');
    nav.className = 'dg-pagination-group';
    const btns = ['⏮', '◀', '▶', '⏭'];
    const titles = ['First', 'Previous', 'Next', 'Last'];
    this._pageButtons = [];
    btns.forEach((icon, i) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'dg-page-btn';
      btn.tabIndex = -1;
      btn.title = titles[i];
      btn.textContent = icon;
      this._pageButtons.push(btn);
      nav.appendChild(btn);
    });
    this._pageInfo = document.createElement('span');
    this._pageInfo.className = 'dg-page-info';
    nav.insertBefore(this._pageInfo, this._pageButtons[2]);
    p.appendChild(nav);

    this._appendFooterButtons(p, 'center');

    const sep = document.createElement('div');
    sep.className = 'dg-pagination-sep';
    p.appendChild(sep);

    this._recordsInfo = document.createElement('span');
    p.appendChild(this._recordsInfo);

    if (this.hasAttribute('show-page-size')) {
      this._pageSizeInfo = document.createElement('span');
      this._pageSizeInfo.style.color = 'var(--text-muted, #6b7280)';
      p.appendChild(this._pageSizeInfo);
    }

    // Refresh button
    if (this.hasAttribute('refresh-button')) {
      const refreshBtn = document.createElement('button');
      refreshBtn.type = 'button';
      refreshBtn.className = 'dg-page-btn';
      refreshBtn.tabIndex = -1;
      refreshBtn.title = 'Refresh';
      refreshBtn.textContent = '↻';
      refreshBtn.addEventListener('click', () => {
        const e = new CustomEvent('grid-refresh', { bubbles: true, cancelable: true });
        if (this.dispatchEvent(e)) this.refresh();
      });
      p.appendChild(refreshBtn);
    }

    this._appendFooterButtons(p, 'right');

    // Button events
    this._pageButtons[0].addEventListener('click', () => this._goPage('first'));
    this._pageButtons[1].addEventListener('click', () => this._goPage(-1));
    this._pageButtons[2].addEventListener('click', () => this._goPage(+1));
    this._pageButtons[3].addEventListener('click', () => this._goPage('last'));
  }

  // ---
  _appendFooterButtons(parent, side) {
    const groups = (this._footerButtons || []).filter(group => group.side === side);
    if (!groups.length) return;
    const wrap = document.createElement('div');
    wrap.className = 'dg-pagination-group dg-footer-buttons dg-footer-buttons-' + side;
    groups.forEach(group => {
      Array.from(group.el.querySelectorAll('closure-btn')).forEach(item => {
        wrap.appendChild(this._createFooterButton(item));
      });
    });
    if (wrap.childNodes.length) parent.appendChild(wrap);
  }

  // ---
  _createFooterButton(item) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'dg-page-btn dg-footer-btn';
    btn.tabIndex = -1;
    const icon = item.getAttribute('icon') || '';
    const label = item.getAttribute('label') || item.textContent.trim();
    btn.textContent = [icon, label].filter(Boolean).join(icon && label ? ' ' : '') || '•';
    btn.title = item.getAttribute('title') || label || item.getAttribute('data-action') || '';
    const width = this._cssLength(item.getAttribute('width') || '');
    if (width) {
      btn.style.width = width;
      btn.style.minWidth = width;
      btn.style.maxWidth = width;
    }
    btn.addEventListener('click', e => {
      e.stopPropagation();
      this._executeAction(this._actionDefFromElement(item));
    });
    return btn;
  }

  // ---
  _updatePagination() {
    if (!this._pagination) return;
    const ps = this.pageSize;
    const tp = this.totalPages;
    this._pageInfo.textContent = this._currentPage + ' / ' + tp;
    const start = (this._currentPage - 1) * ps + 1;
    const end = Math.min(this._currentPage * ps, this._total);
    this._recordsInfo.textContent = this._total > 0 ? 'Records ' + start + '–' + end + ' of ' + this._total : 'No records';
    if (this._pageSizeInfo) this._pageSizeInfo.textContent = ' · ' + ps + '/p';
    this._pageButtons[0].disabled = this._currentPage === 1;
    this._pageButtons[1].disabled = this._currentPage === 1;
    this._pageButtons[2].disabled = this._currentPage >= tp;
    this._pageButtons[3].disabled = this._currentPage >= tp;

  }

  // ---
  _goPage(dir) {
    const tp = this.totalPages;
    const newPage = dir === 'first' ? 1 : dir === 'last' ? tp : this._currentPage + dir;
    if (newPage < 1 || newPage > tp) return;
    this._currentPage = newPage;
    const focusLast = (dir === -1 || dir === 'last');
    if (this._isDynamic) {
      // Applied after the fetch renders (server select-index wins if set)
      this._pendingFocusIdx = focusLast ? this.pageSize - 1 : 0;
      this._fetchDynamic();
    } else {
      this._renderPage(focusLast);
      this._syncColWidths();
    }
  }

  // ---
  _renderPage(focusLast, isDynamicData) {
    let pageRows;
    if (this._isDynamic) {
      // _rows always holds exactly the server's current page — slicing
      // by absolute offset would blank out pages > 1 (e.g. when the
      // auto-layout resize path re-renders)
      pageRows = this._rows;
    } else {
      const ps = this.pageSize;
      const start = (this._currentPage - 1) * ps;
      pageRows = this._rows.slice(start, start + ps);
    }

    this._tbody.innerHTML = '';

    if (pageRows.length === 0) {
      this._selectedIdx = -1;
      this._pendingFocusIdx = null;
      if (this._noResults) {
        const cell = document.createElement('td');
        cell.colSpan = this._cols.length;
        cell.className = 'dg-no-results';
        cell.innerHTML = this._noResults.innerHTML;
        const tr = document.createElement('tr');
        tr.appendChild(cell);
        this._tbody.appendChild(tr);
      }
      this._updatePagination();
      this._dispatchEmptySelection();
      return;
    }

    pageRows.forEach((row, i) => {
      const tr = this._createRow(row, i);
      tr.addEventListener('click', () => this._selectRow(i));
      this._tbody.appendChild(tr);
    });

    // Focus row — a pending index (server select-index, or paging
    // backwards in dynamic mode) takes precedence
    let focusIdx = focusLast ? pageRows.length - 1 : 0;
    if (this._pendingFocusIdx != null) {
      focusIdx = Math.max(0, Math.min(this._pendingFocusIdx, pageRows.length - 1));
      this._pendingFocusIdx = null;
    }
    this._selectRow(focusIdx);

    this._updatePagination();
  }

  // ---
  _createRow(row, i) {
    const tr = document.createElement('tr');
    this._cols.forEach(col => {
      const td = document.createElement('td');
      const val = row[col.name] === undefined || row[col.name] === null ? '' : row[col.name];

      if (col.collapse) { td.className = 'dg-col-collapse'; td.title = String(val); }
      this._applyColumnPresentation(td, col, true);

      if (col.mapId) {
        const map = document.getElementById(col.mapId);
        const resolved = map ? map.resolve(val) : null;
        if (resolved) {
          const span = document.createElement('span');
          span.textContent = resolved.icon || val;
          span.title = resolved.label || val;
          if (resolved.color) span.style.color = resolved.color;
          if (resolved.size) span.style.fontSize = resolved.size;
          td.appendChild(span);
        } else {
          td.textContent = val;
        }
      } else if (col.type === 'actions') {
        td.style.textAlign = 'right'; // match the right-aligned header (the ⋮)
        const items = Array.from(col.el.querySelectorAll('closure-btn-item'));
        const wrap = document.createElement('div');
        wrap.style.cssText = 'position:relative;display:inline-block;';
        const btn = document.createElement('button');
        btn.type = 'button'; btn.textContent = '☰'; btn.tabIndex = -1;
        btn.style.cssText = 'border:1px solid var(--dg-border,#e5e7eb);border-radius:4px;background:#fff;cursor:pointer;font-size:14px;padding:2px 6px;';
        const panel = document.createElement('div');
        // The Popover API renders the menu in the top layer, so it escapes
        // the grid body's overflow:auto clipping — the menu on the last
        // rows is no longer cut off. Where unsupported, the fallback uses
        // position:fixed (same trigger-rect positioning), which also escapes
        // the clipping — only the native light-dismiss niceties are lost.
        const usePopover = typeof panel.showPopover === 'function'
          && Object.prototype.hasOwnProperty.call(HTMLElement.prototype, 'popover');
        const panelLook = 'background:#fff;border:1px solid var(--dg-border,#e5e7eb);border-radius:6px;box-shadow:0 4px 16px rgba(0,0,0,0.12);z-index:100;overflow:hidden;';
        if (usePopover) {
          panel.popover = 'auto';
          // No inline display: the UA keeps [popover] hidden until open.
          // Position is fixed and recomputed from the trigger on each open.
          panel.style.cssText = 'position:fixed;margin:0;inset:auto;min-width:max-content;' + panelLook;
        } else {
          // Fallback also uses position:fixed (coords set per-open from the
          // trigger rect) so it escapes the grid's overflow clipping just like
          // the popover — last-row menus are no longer cut off on browsers
          // without the Popover API.
          panel.style.cssText = 'display:none;position:fixed;margin:0;inset:auto;min-width:max-content;' + panelLook;
        }
        const closePanel = () => {
          if (usePopover) { if (panel.matches(':popover-open')) panel.hidePopover(); }
          else { panel.style.display = 'none'; panel.classList.remove('dg-action-panel-open'); }
        };
        // Shared positioning (fixed coords from the trigger's viewport rect);
        // used by both the popover (on beforetoggle) and the fallback (on open).
        const positionPanel = () => {
          const r = btn.getBoundingClientRect();
          panel.style.left = 'auto';
          panel.style.right = (window.innerWidth - r.right) + 'px';
          if (r.bottom > window.innerHeight * 0.6) {
            panel.style.top = 'auto';
            panel.style.bottom = (window.innerHeight - r.top + 2) + 'px';
          } else {
            panel.style.bottom = 'auto';
            panel.style.top = (r.bottom + 2) + 'px';
          }
        };
        items.forEach(item => {
          const mi = document.createElement('button');
          mi.type = 'button'; mi.tabIndex = -1;
          mi.textContent = item.getAttribute('icon') || '•';
          mi.title = item.getAttribute('data-action') || '';
          mi.style.cssText = 'display:flex;align-items:center;justify-content:center;padding:8px 12px;cursor:pointer;font-size:16px;border:none;border-bottom:1px solid var(--dg-border,#e5e7eb);background:none;width:100%;';
          mi.addEventListener('click', (e) => {
            e.stopPropagation(); closePanel();
            this._selectRow(i);
            this._executeAction(this._actionDefFromElement(item));
          });
          panel.appendChild(mi);
        });
        if (panel.lastChild) panel.lastChild.style.borderBottom = 'none';
        if (usePopover) {
          // The invoker drives the toggle natively; the browser also gives
          // us light-dismiss (outside click / Esc) and auto-closes any other
          // open action menu for free.
          btn.popoverTargetElement = panel;
          panel.addEventListener('beforetoggle', (e) => {
            if (e.newState === 'open') positionPanel();
          });
          btn.addEventListener('click', () => { this._selectRow(i); });
        } else {
          btn.addEventListener('click', (e) => {
            e.stopPropagation(); this._selectRow(i);
            const open = panel.style.display === 'block';
            document.querySelectorAll('.dg-action-panel-open').forEach(p => { p.style.display = 'none'; p.classList.remove('dg-action-panel-open'); });
            if (!open) { panel.style.display = 'block'; panel.classList.add('dg-action-panel-open'); positionPanel(); }
          });
        }
        wrap.appendChild(btn); wrap.appendChild(panel);
        td.appendChild(wrap);
      } else if (col.type === 'btn') {
        const items = Array.from(col.el.querySelectorAll('closure-btn'));
        items.forEach(item => {
          if (!this._buttonVisibleForRow(item, row)) return;
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'dg-cell-btn';
          if (col.el.hasAttribute('plain-buttons') || item.hasAttribute('plain')) btn.classList.add('plain');
          const icon = this._buttonRowValue(item, row, 'icon-bind', item.getAttribute('icon') || '');
          const label = this._buttonRowValue(item, row, 'label-bind', item.textContent.trim());
          const title = this._buttonRowValue(item, row, 'title-bind', item.getAttribute('title') || item.getAttribute('label') || item.getAttribute('data-action') || '');
          btn.textContent = [icon, label].filter(Boolean).join(label && icon ? ' ' : '') || '•';
          btn.title = title;
          btn.tabIndex = -1;
          const width = this._cssLength(item.getAttribute('width') || '');
          if (width) {
            btn.style.width = width;
            btn.style.minWidth = width;
            btn.style.maxWidth = width;
          }
          btn.addEventListener('click', (e) => {
            e.stopPropagation(); this._selectRow(i);
            this._executeAction(this._actionDefFromElement(item));
          });
          td.appendChild(btn);
        });
      } else if (col.type === 'tags') {
        td.classList.add('dg-tags-cell');
        this._renderTagsCell(td, val, col);
      } else {
        td.textContent = val;
      }
      tr.appendChild(td);
    });
    return tr;
  }

  // ---
  _renderTagsCell(td, value, col) {
    const tags = this._parseTags(value, col);
    if (!tags.length) return;
    const wrap = document.createElement('span');
    wrap.className = 'dg-tags';
    tags.forEach((tag, idx) => {
      const span = document.createElement('span');
      span.className = 'dg-tag' + this._tagColorClass(tag, col);
      span.textContent = tag.label;
      if (tag.title) span.title = tag.title;
      wrap.appendChild(span);
    });
    td.appendChild(wrap);
  }

  // ---
  _parseTags(value, col) {
    if (value === undefined || value === null || value === '') return [];
    if (Array.isArray(value)) return value.map(item => this._normalizeTag(item)).filter(tag => tag.label);
    if (typeof value === 'object') return [this._normalizeTag(value)].filter(tag => tag.label);

    const text = String(value).trim();
    if (!text) return [];
    if ((text.startsWith('[') && text.endsWith(']')) || (text.startsWith('{') && text.endsWith('}'))) {
      try {
        const parsed = JSON.parse(text);
        return this._parseTags(parsed, col);
      } catch (_) {
        // Fall through to CSV parsing.
      }
    }

    const separator = this._tagSeparator(col);
    return text.split(separator)
      .map(part => part.trim())
      .filter(Boolean)
      .map(part => {
        const sep = part.includes('|') ? '|' : (part.includes(':') ? ':' : '');
        if (!sep) return this._normalizeTag(part);
        const pieces = part.split(sep);
        return this._normalizeTag({ label: pieces.shift().trim(), color: pieces.join(sep).trim() });
      })
      .filter(tag => tag.label);
  }

  // ---
  _tagSeparator(col) {
    const raw = col && col.el ? (col.el.getAttribute('separator') || ',') : ',';
    return raw === '' ? ',' : raw;
  }

  // ---
  _normalizeTag(item) {
    if (item === undefined || item === null) return { label: '' };
    if (typeof item !== 'object') return { label: String(item).trim() };
    const label = item.label !== undefined ? item.label
      : item.text !== undefined ? item.text
      : item.name !== undefined ? item.name
      : item.value !== undefined ? item.value
      : '';
    return {
      label: String(label).trim(),
      color: item.color || item.class || item.variant || item.type || '',
      title: item.title || '',
    };
  }

  // ---
  _tagColorClass(tag, col) {
    const raw = String(tag.color || (col ? col.tagColor : '') || '').trim();
    if (!raw) return '';
    return ' dg-tag-color-' + raw.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
  }

  // ---
  _buttonVisibleForRow(item, row) {
    const field = item.getAttribute('show-bind') || '';
    if (!field) return true;
    const value = this._readPath(row, field);
    return this._isTruthyCellValue(value);
  }

  // ---
  _buttonRowValue(item, row, attr, fallback) {
    const field = item.getAttribute(attr) || '';
    if (!field) return fallback || '';
    const value = this._readPath(row, field);
    return value === undefined || value === null ? '' : String(value);
  }

  // ---
  _isTruthyCellValue(value) {
    if (value === undefined || value === null || value === false) return false;
    const str = String(value).trim();
    return !!str && str !== '0' && str.toLowerCase() !== 'false';
  }

  // ---
  _selectRow(idx) {
    const rows = Array.from(this._tbody.querySelectorAll('tr'));
    // The "no results" placeholder is a <tr> too. Never select it: it has no
    // backing row, so row-select would fire with row: undefined and break
    // consumers (e.g. <closure-row-viewer> reading row.id). Guarding here (not
    // just the click handler) also covers the keyboard / programmatic paths.
    if (rows[idx] && rows[idx].querySelector('.dg-no-results')) return;
    const changed = this._selectedIdx !== idx;
    rows.forEach(r => r.classList.remove('focused'));
    if (rows[idx]) {
      rows[idx].classList.add('focused');
      this._selectedIdx = idx;
      const ps = this.pageSize;
      const absIdx = (this._currentPage - 1) * ps + idx;
      const rowData = this._isDynamic ? this._rows[idx] : this._rows[absIdx];
      this.dispatchEvent(new CustomEvent('row-select', {
        detail: { row: rowData, index: absIdx },
        bubbles: true,
      }));
      if (changed) {
        this.dispatchEvent(new CustomEvent('row-focus', {
          detail: { row: rowData, index: absIdx },
          bubbles: true,
        }));
      }
    }
  }

  // ---
  _moveFocus(idx) {
    const rows = Array.from(this._tbody.querySelectorAll('tr'));
    if (idx < 0 || idx >= rows.length) return false;
    this._selectRow(idx);

    // Scroll into view within body wrap
    const rowTop = rows[idx].offsetTop;
    const rowBot = rowTop + rows[idx].offsetHeight;
    const w = this._bodyWrap;
    if (rowTop < w.scrollTop) w.scrollTop = rowTop;
    else if (rowBot > w.scrollTop + w.clientHeight) w.scrollTop = rowBot - w.clientHeight;
    return true;
  }

  // ---
  _syncColWidths() {
    if (!this._headTable) return; // headless mode
    if (this.hasAttribute('auto-fit')) {
      let bodyCg = this._bodyTable.querySelector('colgroup');
      if (!bodyCg) { bodyCg = document.createElement('colgroup'); this._bodyTable.prepend(bodyCg); }
      this._headTable.style.tableLayout = 'auto';
      this._bodyTable.style.tableLayout = 'auto';
      bodyCg.innerHTML = '';
      const cells = Array.from(this._bodyTable.querySelectorAll('tbody tr:first-child td'));
      const ths = Array.from(this._headTable.querySelectorAll('th'));
      if (!cells.length || !ths.length) return;
      let headCg = this._headTable.querySelector('colgroup');
      if (!headCg) { headCg = document.createElement('colgroup'); this._headTable.prepend(headCg); }
      headCg.innerHTML = '';
      const fillIdxs = this._cols
        .map((gridCol, idx) => gridCol.fill ? idx : -1)
        .filter(idx => idx >= 0);
      // Batch-measure every header + body cell once (single reflow) so the
      // per-column _cellContentWidth calls below read from cache.
      this._widthCache = this._measureCellWidths(
        ths.concat(Array.from(this._bodyTable.querySelectorAll('tbody td')))
      );
      const widths = this._cols.map((gridCol, idx) => {
        const cssWidth = this._cssLength(gridCol.width);
        if (cssWidth) return cssWidth;
        if (fillIdxs.includes(idx)) return '';
        return this._autoFitColumnWidth(idx, ths, gridCol) + 'px';
      });
      const fixedWidth = widths.reduce((sum, width, idx) => {
        if (!width || fillIdxs.includes(idx) || !width.endsWith('px')) return sum;
        return sum + parseFloat(width);
      }, 0);
      const fillContentWidth = fillIdxs.reduce((sum, idx) => sum + this._autoFitColumnWidth(idx, ths, this._cols[idx]), 0);
      this._widthCache = null; // measurements consumed; don't hold stale cell refs
      const gridWidth = Math.floor(this._bodyWrap.clientWidth || this._wrap.clientWidth || this.clientWidth);
      const fillAvailable = Math.max(0, gridWidth - fixedWidth);
      if (fillIdxs.length) {
        // Distribute the exact total across fill columns (floor + spread the
        // leftover pixels) so the sum never exceeds the available width.
        // Math.ceil on every column could overshoot by up to (n-1)px and
        // trigger a spurious horizontal scrollbar in auto-fit mode.
        // TODO: a separate ~2px horizontal overflow remains even when the fill
        // sum is exact — it comes from the .dg-wrap / cell borders, which the
        // available-width calc doesn't subtract. Minor; not the rounding bug.
        const total = Math.max(fillContentWidth, fillAvailable);
        const base = Math.floor(total / fillIdxs.length);
        let extra = total - base * fillIdxs.length;
        fillIdxs.forEach(idx => { widths[idx] = (base + (extra-- > 0 ? 1 : 0)) + 'px'; });
      }
      const tableWidth = widths.reduce((sum, width) => {
        return width && width.endsWith('px') ? sum + parseFloat(width) : sum;
      }, 0);
      this._cols.forEach((gridCol, idx) => {
        const headCol = document.createElement('col');
        const bodyCol = document.createElement('col');
        if (widths[idx]) {
          headCol.style.width = widths[idx];
          bodyCol.style.width = widths[idx];
        }
        headCg.appendChild(headCol);
        bodyCg.appendChild(bodyCol);
      });
      if (tableWidth > 0) {
        this._headTable.style.width = tableWidth + 'px';
        this._bodyTable.style.width = tableWidth + 'px';
      }
      this._headTable.style.tableLayout = 'fixed';
      this._bodyTable.style.tableLayout = 'fixed';
    } else {
      this._headTable.style.tableLayout = '';
      this._bodyTable.style.tableLayout = '';
      this._headTable.style.width = '';
      this._bodyTable.style.width = '';
      const headCg = this._headTable.querySelector('colgroup');
      if (headCg) headCg.remove();
      const ths = Array.from(this._headTable.querySelectorAll('th'));
      if (!ths.length) return;
      let bodyCg = this._bodyTable.querySelector('colgroup');
      if (!bodyCg) { bodyCg = document.createElement('colgroup'); this._bodyTable.prepend(bodyCg); }
      bodyCg.innerHTML = '';
      ths.forEach(th => {
        const col = document.createElement('col');
        col.style.width = th.offsetWidth + 'px';
        bodyCg.appendChild(col);
      });
    }
  }

  // ---
  _dispatchEmptySelection() {
    this.dispatchEvent(new CustomEvent('row-select', {
      detail: { row: null, index: -1 },
      bubbles: true,
    }));
    this.dispatchEvent(new CustomEvent('row-focus', {
      detail: { row: null, index: -1 },
      bubbles: true,
    }));
  }

  // ---
  _applyMaxHeight() {
    const maxRows = parseInt(this.getAttribute('max-rows'), 10) || 0;
    if (maxRows <= 0 || !this._wrap) return;
    const theadH = this.hasAttribute('headless') ? 0 : (this._headTable ? this._headTable.offsetHeight : 32);
    const paginH = this.hasAttribute('footerless') ? 0 : (this._pagination ? this._pagination.offsetHeight : 36);
    const ROW_H = 34;
    this._wrap.style.maxHeight = (theadH + (ROW_H * maxRows) + paginH) + 'px';
  }

  // ---
  _setAutoHeight() {
    const wrap = this._wrap;
    const top = wrap.getBoundingClientRect().top + window.scrollY;
    const theadH = this.hasAttribute('headless') ? 0 : (this._headTable ? this._headTable.offsetHeight : 32);
    const paginH = this.hasAttribute('footerless') ? 0 : (this._pagination ? this._pagination.offsetHeight : 36);
    const ROW_H = 34;
    const minRows = parseInt(this.getAttribute('min-rows'), 10) || 1;
    const maxRows = parseInt(this.getAttribute('max-rows'), 10) || 0;
    const minH = theadH + (ROW_H * minRows) + paginH;

    const bottomH = this._fillBottomHeight();

    let available = window.innerHeight - top - bottomH;

    // Apply max-rows cap
    if (maxRows > 0) {
      const maxH = theadH + (ROW_H * maxRows) + paginH;
      available = Math.min(available, maxH);
    }

    wrap.style.height = Math.max(minH, available) + 'px';
  }

  // ---
  _fillBottomHeight() {
    const fillStop = this.getAttribute('fill-stop');
    if (fillStop) {
      let stopEl = null;
      try {
        stopEl = document.querySelector(fillStop);
      } catch (_) {
        stopEl = null;
      }
      if (!stopEl) return 0;
      const top = this._elementTop(stopEl);
      return top > 0 ? Math.max(0, window.innerHeight - top) : 0;
    }

    const reserve = this.getAttribute('fill-reserve') || '';
    const fillReserve = parseInt(reserve, 10);
    if (fillReserve > 0) {
      const target = this._implicitFillTargetElement();
      return target ? Math.max(fillReserve, this._elementHeight(target)) : fillReserve;
    }

    let reserveEl = null;
    try {
      reserveEl = reserve ? document.querySelector(reserve) : null;
    } catch (_) {
      reserveEl = null;
    }
    return reserveEl ? this._elementHeight(reserveEl) : 0;
  }

  // ---
  _fillTargetElement() {
    const selector = this.getAttribute('fill-stop') || this.getAttribute('fill-reserve') || '';
    if (!selector) return null;
    if (parseInt(selector, 10) > 0) return this._implicitFillTargetElement();
    try {
      return document.querySelector(selector);
    } catch (_) {
      return null;
    }
  }

  // ---
  _implicitFillTargetElement() {
    const next = this.nextElementSibling;
    return next && next.tagName === 'CLOSURE-ROW-VIEWER' ? next : null;
  }

  // ---
  _elementTop(el) {
    const rect = el.getBoundingClientRect();
    if (rect.width || rect.height) return rect.top;
    const first = this._firstRenderedChild(el);
    return first ? first.getBoundingClientRect().top : rect.top;
  }

  // ---
  _elementHeight(el) {
    const rect = el.getBoundingClientRect();
    if (rect.height) return Math.ceil(rect.height);
    const first = this._firstRenderedChild(el);
    const last = this._lastRenderedChild(el);
    if (!first || !last) return 0;
    return Math.ceil(last.getBoundingClientRect().bottom - first.getBoundingClientRect().top);
  }

  // ---
  _firstRenderedChild(el) {
    return this._renderedChildren(el)[0] || null;
  }

  // ---
  _lastRenderedChild(el) {
    const rendered = this._renderedChildren(el);
    return rendered[rendered.length - 1] || null;
  }

  // ---
  _renderedChildren(el) {
    return Array.from(el.children).filter(child => {
      const rect = child.getBoundingClientRect();
      return rect.width || rect.height;
    });
  }

  // ---
  _setupEvents() {
    // Click on body
    this._tbody.addEventListener('click', e => {
      const row = e.target.closest('tr');
      if (!row) return;
      const rows = Array.from(this._tbody.querySelectorAll('tr'));
      this._selectRow(rows.indexOf(row));
    });

    // Close action menus on click outside (kept as a named handler so
    // disconnectedCallback can remove it)
    this._onDocClick = () => {
      document.querySelectorAll('.dg-action-panel-open').forEach(p => { p.style.display = 'none'; p.classList.remove('dg-action-panel-open'); });
    };
    document.addEventListener('click', this._onDocClick);

    // Anchored action menus are position:fixed (to escape the table's clip), so
    // they don't track their row. Close any open one on scroll — grid body or
    // page — so it never floats detached. capture:true catches the (non-
    // bubbling) scroll from the inner body wrap as well as window scroll.
    this._onScrollClosePanels = () => {
      document.querySelectorAll('.dg-action-panel-open').forEach(p => { p.style.display = 'none'; p.classList.remove('dg-action-panel-open'); });
    };
    window.addEventListener('scroll', this._onScrollClosePanels, { capture: true, passive: true });

    // Mouseover
    this._tbody.addEventListener('mouseover', () => {
      this._bodyTable.classList.remove('kb-nav');
    });

    // Wheel
    this._bodyWrap.addEventListener('wheel', e => {
      if (!this._pagination) return;
      // Horizontal scroll (deltaY 0) must keep scrolling, not paginate
      if (e.deltaY === 0) return;
      e.preventDefault();
      if (e.deltaY > 0) this._goPage(+1);
      else this._goPage(-1);
    }, { passive: false });

    // Keyboard
    this._onDocKeydown = e => {
      if (!this.contains(document.activeElement) && document.activeElement !== this) return;
      const rows = this._tbody.querySelectorAll('tr');
      if (!rows.length) return;
      const lastIdx = rows.length - 1;

      // Check grid-key bindings first
      for (const gk of this._keys) {
        for (const keyDef of gk.keys) {
          if (this._matchKey(e, keyDef)) {
            e.preventDefault();
            if (gk.action === 'deselect') {
              rows.forEach(r => r.classList.remove('focused'));
              this._selectedIdx = -1;
              this.dispatchEvent(new CustomEvent('row-select', { detail: { row: null, index: -1 }, bubbles: true }));
              this.dispatchEvent(new CustomEvent('row-focus', { detail: { row: null, index: -1 }, bubbles: true }));
              return;
            }
            this._executeAction(gk);
            return;
          }
        }
      }

      this._bodyTable.classList.add('kb-nav');
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          if (!this._moveFocus(this._selectedIdx + 1) && this._pagination) this._goPage(+1);
          break;
        case 'ArrowUp':
          e.preventDefault();
          if (!this._moveFocus(this._selectedIdx - 1) && this._pagination) this._goPage(-1);
          break;
        case 'PageDown':
          e.preventDefault();
          if (this._selectedIdx === lastIdx && this._pagination) this._goPage(+1);
          else this._moveFocus(lastIdx);
          break;
        case 'PageUp':
          e.preventDefault();
          if (this._selectedIdx === 0 && this._pagination) this._goPage(-1);
          else this._moveFocus(0);
          break;
        case 'Home':
          if (e.ctrlKey) { e.preventDefault(); this._goPage('first'); }
          break;
        case 'End':
          if (e.ctrlKey) { e.preventDefault(); this._goPage('last'); }
          break;
      }
    };
    document.addEventListener('keydown', this._onDocKeydown);

    // Filter change
    this.addEventListener('filter-change', e => {
      this._filters = { ...(e.detail || {}), ...(this._detailFilters || {}) };
      this._applyFilterMode();
    });

    // Refresh whole grid — declarative trigger (e.g. a `dispatch-event` in a
    // response, or `<signal-event name="refresh" target-id="...">`). The
    // `e.target !== this` guard ignores same-name events bubbling from a child.
    this.addEventListener('refresh', e => {
      if (e.target !== this) return;
      this.refresh(e.detail || {}); // detail.goto scrolls back to a row
    });

    // Refresh just the selected row in place from server-provided data —
    // no full reload, keeps scroll/selection. Row comes as `data-row` JSON,
    // or as the remaining `data-*` fields merged onto the current row.
    this.addEventListener('refresh-row', e => {
      if (e.target !== this) return;
      const d = e.detail || {};
      let row = d;
      if (d.row) { try { row = JSON.parse(d.row); } catch (err) { return; } }
      this.updateRow(row);
    });

    // Header click
    if (this._headTable) {
      this._headTable.addEventListener('click', e => {
        // Already handled per-th in _build
      });
    }

    // Double click
    this._tbody.addEventListener('dblclick', e => {
      const row = e.target.closest('tr');
      if (!row) return;
      const rows = Array.from(this._tbody.querySelectorAll('tr'));
      this._selectRow(rows.indexOf(row));
      for (const gk of this._keys) {
        if (gk.keys.some(k => k.includes('dblclick'))) {
          this._executeAction(gk);
          return;
        }
      }
    });
  }

  // ---
  _executeAction(actionDef) {
    const row = this.selectedRow;
    const mode = actionDef.mode || 'navigate';
    const url = actionDef.url || '';
    const dataAttrs = actionDef.dataAttrs || {};
    const bindFields = actionDef.bind || [];
    const targetId = actionDef.targetId || '';

    // Build params: static data-* + bound row fields
    const params = { ...dataAttrs };
    if (row) {
      bindFields.forEach(f => { if (row[f] !== undefined) params[f] = row[f]; });
    }

    switch (mode) {
      case 'navigate': {
        const form = document.createElement('form');
        form.method = 'POST';
        form.style.display = 'none';
        if (url) form.action = url;
        for (const [k, v] of Object.entries(params)) {
          const input = document.createElement('input');
          input.type = 'hidden'; input.name = k; input.value = v;
          form.appendChild(input);
        }
        document.body.appendChild(form);
        form.submit();
        form.remove(); // drop the node post-submit so it can't orphan in
                       // <body> on a download / new-tab action
        break;
      }
      case 'dialog': {
        fetch(url, {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams(params).toString(),
        })
        .then(r => r.text())
        .then(html => {
          var lb = document.createElement('closure-lightbox');
          document.body.appendChild(lb);
          if (lb.showResponse(html)) {
            lb.addEventListener('lb-close', () => lb.remove(), { once: true });
          } else {
            lb.remove(); // a listener cancelled lb-response → never opened; don't orphan the node
          }
        })
        .catch(err => console.error('dialog fetch error:', err));
        break;
      }
      case 'refresh': {
        fetch(url, {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams(params).toString(),
        })
        .then(() => this.refresh())
        .catch(err => console.error('refresh fetch error:', err));
        break;
      }
      case 'event': {
        const dest = targetId ? document.getElementById(targetId) : this;
        const eventName = actionDef.eventName || 'row-action';
        if (dest) {
          dest.dispatchEvent(new CustomEvent(eventName, {
            detail: { action: dataAttrs.action || '', row: row || {}, params },
            bubbles: true,
          }));
        }
        break;
      }
    }
  }

  // ---
  _actionDefFromElement(el) {
    return {
      mode:      el.getAttribute('mode') || 'navigate',
      url:       el.getAttribute('url') || '',
      bind:      (el.getAttribute('bind') || '').split(',').map(s => s.trim()).filter(Boolean),
      targetId:  el.getAttribute('target-id') || '',
      eventName: el.getAttribute('event') || 'row-action',
      dataAttrs: this._readDataAttrs(el),
    };
  }

  // ---
  _matchKey(e, keyDef) {
    const parts = keyDef.split('+').map(p => p.trim().toLowerCase());
    let needCtrl = false, needShift = false, needAlt = false, mainKey = '';
    parts.forEach(p => {
      if (p === 'ctrl') needCtrl = true;
      else if (p === 'shift') needShift = true;
      else if (p === 'alt') needAlt = true;
      else mainKey = p;
    });
    if (needCtrl !== e.ctrlKey) return false;
    if (needShift !== e.shiftKey) return false;
    if (needAlt !== e.altKey) return false;
    const eKey = e.key === ' ' ? 'space' : e.key.toLowerCase();
    return eKey === mainKey;
  }

  // ---
  get selectedRow() {
    // Pre-init (e.g. probed by a row viewer before this grid's deferred
    // init ran): no rows yet, no selection
    if (!this._rows || this._selectedIdx < 0) return null;
    if (this._isDynamic) return this._rows[this._selectedIdx] || null;
    const ps = this.pageSize;
    const absIdx = (this._currentPage - 1) * ps + this._selectedIdx;
    return this._rows[absIdx] || null;
  }

  // ---
  // Re-render the currently selected row in place from new data (merged onto
  // the existing row) — for edit-in-dialog flows where the server returns the
  // updated row. Updates one <tr> without a full reload, preserving scroll and
  // selection. No-op when nothing is selected; for broader changes use
  // refresh(). Off-page / by-key updates are out of scope (use refresh()).
  updateRow(data) {
    if (this._selectedIdx < 0 || !data || typeof data !== 'object') return;
    const i = this._selectedIdx; // page-relative index of the visible row
    const absIdx = this._isDynamic ? i : (this._currentPage - 1) * this.pageSize + i;
    if (!this._rows || !this._rows[absIdx]) return;
    // Mutate the row object IN PLACE — in static mode this._rows shares object
    // references with this._allRows, so replacing it with a spread copy would
    // leave _allRows untouched and the edit would vanish on the next
    // _applyFilters() / _renderPage() (page change, search, etc.).
    const merged = Object.assign(this._rows[absIdx], data);
    const oldTr = this._tbody.querySelectorAll('tr')[i];
    if (!oldTr) return;
    const wasFocused = oldTr.classList.contains('focused');
    const tr = this._createRow(merged, i);
    tr.addEventListener('click', () => this._selectRow(i));
    if (wasFocused) tr.classList.add('focused');
    oldTr.replaceWith(tr);
    this._syncColWidths(); // re-fit columns (auto-fit only; no-op otherwise)
  }

  // ---
  refresh(opts) {
    this._currentPage = 1;
    this._selectedIdx = 0;
    if (opts && opts.goto) this._gotoId = opts.goto;
    if (this._isDynamic) {
      this._fetchDynamic();
    } else if (this._isStaticByRequest) {
      this._fetchStatic();
    } else {
      this._renderPage();
      this._syncColWidths();
    }
  }
}

customElements.define('closure-data-grid', ClosureDataGrid);
