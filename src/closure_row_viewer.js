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

## Per-child binding attributes

| Attribute on a descendant | Effect |
|---|---|
| `bind="field"`        | write `row[field]` into the element (`textContent`, `value` for inputs, `data-field` on `<closure-btn>` / `<closure-btn-item>`) |
| `bind="f1,f2"`        | on `<closure-btn>` only — set one `data-*` attribute per field |
| `bind-show="field"`   | show only when `row[field]` is truthy |
| `bind-show="field=v"` | show only when `row[field] === v` |
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
  <closure-btn ct-role="edit" bind="id">Edit</closure-btn>
</closure-row-viewer>
```

## Behaviour

> **Note:** elements with `[bind]` are hidden via `visibility: hidden`
> (so layout is preserved) when no row is selected. Elements with
> `[bind-show]` are hidden via `display: none`.

> **Note:** `<input>`, `<textarea>` and `<select>` receive the value via
> their `.value` property — useful for binding the selected row into an
> editable form. Other elements get `textContent` (or `innerHTML` when
> `bind-crlf` is set).

> **Note:** when a `<data-map>` resolution returns a `color` field, that
> colour is applied to the bound element's `style.color`. Cleared on the
> next bind without a colour.

---
%%>*/

class ClosureRowViewer extends HTMLElement {
  static _styleId = 'closure-row-viewer-default-style';
  static _style = [
    'closure-row-viewer { display: contents; }',
    'closure-row-viewer .rv-content { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }',
    'closure-row-viewer .rv-hidden { display: none; }',
  ].join('\n');

  connectedCallback() {
    if (!document.getElementById(ClosureRowViewer._styleId)) {
      const s = document.createElement('style');
      s.id = ClosureRowViewer._styleId;
      s.textContent = ClosureRowViewer._style;
      document.head.appendChild(s);
    }
    this._row = null;
    this._originalChildren = null;
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this._init(), { once: true });
    } else {
      this._init();
    }
  }

  _init() {
    // Save original children as template
    this._template = this.innerHTML;
    this._bindTarget();
    this._update();
  }

  _bindTarget() {
    const targetId = this.getAttribute('target');
    if (!targetId) return;
    const grid = document.getElementById(targetId);
    if (!grid) return;
    this._grid = grid;

    grid.addEventListener('row-select', e => {
      this._row = e.detail.row || null;
      this._update();
    });
    grid.addEventListener('row-focus', e => {
      this._row = e.detail.row || null;
      this._update();
    });

    // Sync with current selection if grid already has one
    if (grid.selectedRow) {
      this._row = grid.selectedRow;
      this._update();
    }
  }

  _update() {
    this.querySelectorAll('[bind]').forEach(el => {
      el.style.visibility = this._row ? 'visible' : 'hidden';
    });
    this.querySelectorAll('[bind-show]').forEach(el => {
      if (!this._row) el.style.display = 'none';
    });
    if (!this._row) return;

    // Conditional visibility: bind-show="field=value" or bind-show="field" (truthy)
    this.querySelectorAll('[bind-show]').forEach(el => {
      const cond = el.getAttribute('bind-show') || '';
      const eq = cond.indexOf('=');
      if (eq < 0) {
        // No "=" — show if field has a non-empty value
        const actual = String(this._row[cond] !== undefined ? this._row[cond] : '');
        el.style.display = actual ? '' : 'none';
      } else {
        const field = cond.substring(0, eq);
        const expected = cond.substring(eq + 1);
        const actual = String(this._row[field] !== undefined ? this._row[field] : '');
        el.style.display = actual === expected ? '' : 'none';
      }
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
        } else if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') {
          el.value = val;
        } else {
          const crlf = el.getAttribute('bind-crlf');
          if (crlf && val.includes('\n')) {
            el.innerHTML = val.replace(/\r?\n/g, crlf);
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
  get row() { return this._row; }
}

customElements.define('closure-row-viewer', ClosureRowViewer);
