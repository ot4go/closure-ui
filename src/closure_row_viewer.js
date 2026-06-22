/*<%% note:
# `<closure-row-viewer>`

Projects the currently selected (or focused) row of a
`<closure-data-grid>` onto its descendants through `bind` attributes.
Subscribes to the grid's `row-select` and `row-focus` events; while no
row is selected it hides every bound child.

## Attributes

| Attribute | Description |
|---|---|
| `target="id"` | id of the `<closure-data-grid>` to bind to |
| `keep-space` | hide all descendant `bind-show` / `bind-hide` toggles with `visibility` instead of `display` |

## Per-child binding attributes

| Attribute on a descendant | Effect |
|---|---|
| `bind="field"`        | write `row[field]` into the element (`textContent`, `.value` for value-bearing controls/components, `data-field` on `<closure-btn>` / `<closure-btn-item>`) |
| `bind="f1,f2"`        | on `<closure-btn>` only — set one `data-*` attribute per field |
| `bind-show="field"`   | show only when `row[field]` is truthy |
| `bind-show="field=v"` | show only when `row[field] === v` |
| `bind-hide="field"`   | hide when `row[field]` is truthy |
| `bind-hide="field=v"` | hide when `row[field] === v` |
| `bind-keep-space`     | on `bind-show` / `bind-hide`, hide with `visibility` instead of `display` |
| `bind-crlf="<br>"`    | when the bound text has line breaks, render via `innerHTML` with the given separator |
| `map-data-id="id"`    | resolve through a `<data-map>` for icon / label / color substitution |
| `map-show="icon"`     | with `map-data-id`, render only the icon part |
| `map-show="label"`    | with `map-data-id`, render only the label part |

## Properties

| Property | Description |
|---|---|
| `.row` (read-only) | the currently bound row object, or `null` |

## Example

```html
<closure-data-grid id="users-grid" …>…</closure-data-grid>

<closure-row-viewer target="users-grid">
  <span bind="username"></span>
  <span bind="role" map-data-id="role-map"></span>
  <span bind-show="active=1">✓ active</span>
  <span bind-show="active=0">✗ inactive</span>
  <span bind-hide="active">inactive only</span>
  <closure-btn ct-role="edit" bind="id">Edit</closure-btn>
</closure-row-viewer>
```

## Behaviour

> **Note:** elements with `[bind]` are hidden via `visibility: hidden`
> (so layout is preserved) when no row is selected. Elements with
> `[bind-show]` or `[bind-hide]` are hidden via `display: none`, unless
> the child has `bind-keep-space` or the viewer has `keep-space`.

> **Note:** `<input>`, `<textarea>`, `<select>` and custom components
> exposing a `.value` property receive the value via that property. This
> lets components such as `<status-kv>` update their value span without
> replacing their internal structure. Other elements get `textContent`
> (or `innerHTML` when `bind-crlf` is set).

> **Note:** when a `<data-map>` resolution returns a `color` field, that
> colour is applied to the bound element's `style.color`. Cleared on the
> next bind without a colour.

---
%%>*/

class ClosureRowViewer extends HTMLElement {
  static _styleId = 'closure-row-viewer-default-style';
  static _style = [
    'closure-row-viewer { display: contents; visibility: hidden; }',
    'closure-row-viewer .rv-content { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }',
    'closure-row-viewer .rv-hidden { display: none; }',
  ].join('\n');

  connectedCallback() {
    if (this._initialized) {
      // Reconnect: re-attach the grid listeners removed on disconnect
      // and re-sync with whatever was selected while we were detached
      this._attachGridListeners();
      if (this._grid) this._setRow(this._grid.selectedRow || null);
      return;
    }
    this._initialized = true;
    if (!document.getElementById(ClosureRowViewer._styleId)) {
      const s = document.createElement('style');
      s.id = ClosureRowViewer._styleId;
      s.textContent = ClosureRowViewer._style;
      document.head.appendChild(s);
    }
    this._row = null;
    this._originalChildren = null;
    this._pendingUpdate = false;
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this._init(), { once: true });
    } else {
      this._init();
    }
  }

  disconnectedCallback() {
    if (this._grid && this._onRowSelect) {
      this._grid.removeEventListener('row-select', this._onRowSelect);
      this._grid.removeEventListener('row-focus', this._onRowFocus);
    }
  }

  _attachGridListeners() {
    if (!this._grid || !this._onRowSelect) return;
    this._grid.addEventListener('row-select', this._onRowSelect);
    this._grid.addEventListener('row-focus', this._onRowFocus);
  }

  _init() {
    // Save original children as template
    this._template = this.innerHTML;
    this._bindTarget();
    this._scheduleUpdate();
  }

  _bindTarget() {
    const targetId = this.getAttribute('target');
    if (!targetId) return;
    const grid = document.getElementById(targetId);
    if (!grid) return;
    this._grid = grid;

    this._onRowSelect = e => this._setRow(e.detail.row || null);
    this._onRowFocus = e => this._setRow(e.detail.row || null);
    this._attachGridListeners();

    // Sync with current selection if grid already has one
    if (grid.selectedRow) {
      this._setRow(grid.selectedRow);
    }
  }

  _update() {
    this.style.visibility = 'visible';
    this.querySelectorAll('[bind]').forEach(el => {
      el.style.visibility = this._row ? 'visible' : 'hidden';
    });
    this.querySelectorAll('[bind-show]').forEach(el => {
      if (!this._row) this._setConditionalVisibility(el, false);
    });
    this.querySelectorAll('[bind-hide]').forEach(el => {
      if (!this._row) this._setConditionalVisibility(el, false);
    });
    if (!this._row) return;

    // Conditional visibility: bind-show / bind-hide with "field" or "field=value".
    this.querySelectorAll('[bind-show]').forEach(el => {
      this._setConditionalVisibility(el, this._matchesBindCondition(el.getAttribute('bind-show') || ''));
    });
    this.querySelectorAll('[bind-hide]').forEach(el => {
      this._setConditionalVisibility(el, !this._matchesBindCondition(el.getAttribute('bind-hide') || ''));
    });

    // Update spans/labels with bind (skip closure-btn elements — they use bind for data attributes only)
    this.querySelectorAll('[bind]').forEach(el => {
      const tag = el.tagName.toLowerCase();
      if (tag === 'closure-btn' || tag === 'closure-btn-item') return;
      const field = el.getAttribute('bind');
      if (!field) return;

      // Single field → display value
      if (!field.includes(',')) {
        const val = this._row[field] !== undefined ? String(this._row[field]) : '';
        const mapId = el.getAttribute('map-data-id');
        if (mapId) {
          const map = document.getElementById(mapId);
          const resolved = map ? map.resolve(val) : null;
          if (resolved) {
            const show = el.getAttribute('map-show') || '';
            let display = '';
            if (show === 'icon') display = resolved.icon || '';
            else if (show === 'label') display = resolved.label || '';
            else {
              if (resolved.icon) display += resolved.icon;
              if (resolved.label) display += (display ? ' ' : '') + resolved.label;
            }
            el.textContent = display || val;
            if (resolved.color) el.style.color = resolved.color;
            else el.style.color = '';
          } else {
            el.textContent = val;
            el.style.color = '';
          }
        } else if (this._usesValueProperty(el)) {
          el.value = val;
        } else {
          const crlf = el.getAttribute('bind-crlf');
          if (crlf && val.includes('\n')) {
            // val is row data — escape it so only the author-provided
            // crlf separator is interpreted as HTML
            const esc = val.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            el.innerHTML = esc.replace(/\r?\n/g, crlf);
          } else {
            el.textContent = val;
          }
        }
      }
    });

    // Update closure-btn / closure-btn-item data attributes from bind
    this.querySelectorAll('closure-btn[bind], closure-btn-item[bind]').forEach(el => {
      const fields = el.getAttribute('bind').split(',').map(s => s.trim()).filter(Boolean);
      fields.forEach(f => {
        const val = this._row[f] !== undefined ? String(this._row[f]) : '';
        el.setAttribute('data-' + f, val);
      });
    });
  }

  // ---
  _setRow(row) {
    if (row === this._row) return;
    this._row = row;
    this._scheduleUpdate();
  }

  // ---
  _scheduleUpdate() {
    if (this._pendingUpdate) return;
    this._pendingUpdate = true;
    requestAnimationFrame(() => {
      this._pendingUpdate = false;
      this._update();
    });
  }

  // ---
  _setConditionalVisibility(el, isVisible) {
    const keepSpace = this.hasAttribute('keep-space') || el.hasAttribute('bind-keep-space');
    if (isVisible) {
      el.style.display = '';
      el.style.visibility = 'visible';
    } else if (keepSpace) {
      el.style.display = '';
      el.style.visibility = 'hidden';
    } else {
      el.style.display = 'none';
      el.style.visibility = '';
    }
  }

  // ---
  _matchesBindCondition(cond) {
    const eq = cond.indexOf('=');
    if (eq < 0) {
      // Same truthiness as the grid: row values are strings, so "0" and
      // "false" must count as falsy
      const actual = String(this._row[cond] !== undefined ? this._row[cond] : '').trim().toLowerCase();
      return actual !== '' && actual !== '0' && actual !== 'false';
    }
    const field = cond.substring(0, eq);
    const expected = cond.substring(eq + 1);
    const actual = String(this._row[field] !== undefined ? this._row[field] : '');
    return actual === expected;
  }

  // ---
  _usesValueProperty(el) {
    const tag = el.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || ('value' in el && tag.includes('-'));
  }

  // ---
  get row() { return this._row; }
}

customElements.define('closure-row-viewer', ClosureRowViewer);
