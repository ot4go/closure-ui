/*<%% note:
# `<closure-form-row>`

Responsive form row that lays out `<closure-form-field>` children in a
CSS grid (when `cols` is given) or flex (when not). Optionally
collapses to a single column when its width drops below `min`.
Light-DOM only — styles are injected once into `<head>`.

## Attributes

| Attribute | Description |
|---|---|
| `cols="*,4em,6em"` | grid template — `*` becomes `1fr`, integers become `Nfr`, anything else passes verbatim |
| `labels="top"`     | labels above fields (default) |
| `labels="side"` / `labels="left"` | labels to the left, inline with the field |
| `labels="right"`   | labels to the right |
| `labels="checkbox-left"` / `labels="checkbox-right"` | label-as-side variants for checkbox layouts |
| `gap="10px"`       | gap between fields (default `10px`) |
| `min="600px"`      | when narrower than this, collapse to one column (sets `cfr-collapsed`) |
| `wrap`             | flex layout: allow rows to wrap |

## Children

`<closure-form-field>` elements (see [`<closure-form-field>`](#closure-form-field)).

## Density

The row inherits `--cfr-*` variables from any ancestor with a
`density="sm\|lg\|xl"` attribute, so a single attribute on a wrapper
re-skins every form below. Available presets:

| Density | Effect |
|---|---|
| `sm` | smaller font / tighter padding / shorter rows |
| `lg` | larger font / roomier padding / taller rows |
| `xl` | extra large |

## Example

```html
<div density="lg">
  <closure-form-row cols="*,4em,6em" gap="14px" min="500px">
    <closure-form-field label="First name" required>
      <input type="text" name="fname">
    </closure-form-field>
    <closure-form-field label="MI">
      <input type="text" name="mi" maxlength="1">
    </closure-form-field>
    <closure-form-field label="DOB">
      <input type="date" name="dob">
    </closure-form-field>
  </closure-form-row>
</div>
```

## CSS Variables

The row both **declares defaults** for its density tokens and
**consumes** the same tokens when laying things out:

| Variable | Default (md) | sm | lg | xl |
|---|---|---|---|---|
| `--cfr-font`        | `13px`       | `11px` | `15px` | `18px` |
| `--cfr-label-font`  | `11px`       | `9px`  | `12px` | `14px` |
| `--cfr-padding`     | `4px 6px`    | `2px 4px` | `6px 10px` | `10px 14px` |
| `--cfr-gap`         | `6px`        | `6px`  | `14px` | `18px` |
| `--cfr-row-mb`      | `6px`        | `4px`  | `10px` | `14px` |
| `--cfr-msg-font`    | `10px`       | `8px`  | `12px` | `13px` |
| `--cfr-pwd-h`       | `23px`       | `18px` | `30px` | `40px` |
| `--cfr-pwd-lh`      | `15px`       | `12px` | `20px` | `24px` |
| `--cfr-label-width` | `80px`       |        |        |        |
| `--cfr-ro-bg`       | `#f8f8f8`    |        |        |        |
| `--cfr-ro-color`    | `#666`       |        |        |        |
| `--cfr-ro-border`   | `#e5e5e5`    |        |        |        |
| `--cfr-ro-label`    | `#999`       |        |        |        |
| `--text-muted`      | `#555`       |        |        |        |
| `--red`             | `#c00`       |        |        |        |
| `--warning`         | `#d97706`    |        |        |        |

## Behaviour

> **Note:** when `cols` is set the row uses CSS Grid and ignores per-field
> `width`/`flex` (only `min` and `max` apply). Without `cols` the row
> uses flex and each field's `width`/`flex`/`min`/`max` decide its size.

> **Note:** `min` installs a `ResizeObserver` and toggles the
> `cfr-collapsed` attribute on the host. Children with
> `hide-on-collapse` disappear in that mode — useful for secondary
> fields on narrow screens.

> **Note:** field-level error / warning messages are written into a
> single `.cfr-msg` span the row creates lazily after build. Setting
> both `error` and `warning` on the same field shows the error message.

---
%%>*/

class ClosureFormRow extends HTMLElement {
  static _styleId = 'closure-form-row-default-style';
  static _style = [
    // Size presets via [density] on any ancestor
    '[density="sm"] { --cfr-font: 11px; --cfr-label-font: 9px; --cfr-padding: 2px 4px; --cfr-gap: 6px; --cfr-row-mb: 4px; --cfr-msg-font: 8px; --cfr-pwd-h: 18px; --cfr-pwd-lh: 12px; }',
    '[density="lg"] { --cfr-font: 15px; --cfr-label-font: 12px; --cfr-padding: 6px 10px; --cfr-gap: 14px; --cfr-row-mb: 10px; --cfr-msg-font: 12px; --cfr-pwd-h: 30px; --cfr-pwd-lh: 20px; }',
    '[density="xl"] { --cfr-font: 18px; --cfr-label-font: 14px; --cfr-padding: 10px 14px; --cfr-gap: 18px; --cfr-row-mb: 14px; --cfr-msg-font: 13px; --cfr-pwd-h: 40px; --cfr-pwd-lh: 24px; }',
    // Layout
    'closure-form-row { display: block; margin-bottom: var(--cfr-row-mb, 6px); }',
    'closure-form-row .cfr-grid { display: grid; }',
    'closure-form-row .cfr-flex { display: flex; }',
    'closure-form-row[wrap] .cfr-flex { flex-wrap: wrap; }',
    'closure-form-row[cfr-collapsed] { grid-template-columns: 1fr !important; }',
    'closure-form-row[cfr-collapsed] .cfr-flex { flex-wrap: wrap; }',
    'closure-form-row[cfr-collapsed] closure-form-field { flex: 1 0 100%; }',
    'closure-form-row[cfr-collapsed] closure-form-field[hide-on-collapse] { display: none; }',
    'closure-form-field { display: flex; flex-direction: column; min-width: 0; }',
    'closure-form-field[labels-side] { flex-direction: row; align-items: center; gap: var(--cfr-gap, 6px); }',
    'closure-form-field .cfr-label { font-size: var(--cfr-label-font, 11px); font-weight: bold; margin-bottom: 2px; color: var(--text-muted, #555); }',
    'closure-form-field[labels-side] .cfr-label { margin-bottom: 0; min-width: var(--cfr-label-width, 80px); }',
    'closure-form-field[labels-right] { flex-direction: row-reverse; align-items: center; gap: var(--cfr-gap, 6px); }',
    'closure-form-field[labels-right] .cfr-label { margin-bottom: 0; }',
    'closure-form-field .cfr-required::after { content: " *"; color: var(--red, #c00); }',
    'closure-form-field .cfr-body { flex: 1; min-width: 0; }',
    'closure-form-field[labels-chk] { justify-content: flex-end; }',
    'closure-form-field[labels-chk] .cfr-body { flex: none; }',
    'closure-form-field[labels-chk] .cfr-body input { width: auto; }',
    'closure-form-field .cfr-body input, closure-form-field .cfr-body select, closure-form-field .cfr-body textarea { font-size: var(--cfr-font, 13px); padding: var(--cfr-padding, 4px 6px); width: 100%; box-sizing: border-box; }',
    'closure-form-field .cfr-body textarea { resize: vertical; }',
    'closure-form-field .cfr-body credential-pwd { margin-bottom: 0; padding: var(--cfr-padding, 4px 6px); min-height: 0; height: var(--cfr-pwd-h, 23px); box-sizing: border-box; border-radius: 3px; font-size: var(--cfr-font, 13px); overflow: hidden; white-space: nowrap; line-height: var(--cfr-pwd-lh, 15px); }',
    // States
    'closure-form-field[warning] .cfr-body input, closure-form-field[warning] .cfr-body select, closure-form-field[warning] .cfr-body textarea, closure-form-field[warning] .cfr-body credential-pwd { border-color: var(--warning, #d97706); }',
    'closure-form-field[error] .cfr-body input, closure-form-field[error] .cfr-body select, closure-form-field[error] .cfr-body textarea, closure-form-field[error] .cfr-body credential-pwd { border-color: var(--red, #c00); }',
    'closure-form-field .cfr-msg { font-size: var(--cfr-msg-font, 10px); margin-top: 2px; display: none; }',
    'closure-form-field .cfr-warning-msg { color: var(--warning, #d97706); }',
    'closure-form-field .cfr-error-msg { color: var(--red, #c00); }',
    // Readonly mode
    'closure-form-field.cfr-ro .cfr-body input, closure-form-field.cfr-ro .cfr-body select, closure-form-field.cfr-ro .cfr-body textarea { background: var(--cfr-ro-bg, #f8f8f8); color: var(--cfr-ro-color, #666); border-color: var(--cfr-ro-border, #e5e5e5); cursor: default; }',
    'closure-form-field.cfr-ro .cfr-body credential-pwd { background: var(--cfr-ro-bg, #f8f8f8); color: var(--cfr-ro-color, #666); border-color: var(--cfr-ro-border, #e5e5e5); cursor: default; }',
    'closure-form-field.cfr-ro .cfr-label { color: var(--cfr-ro-label, #999); }',
  ].join('\n');

  connectedCallback() {
    if (this._initialized) {
      // Reconnect: resume observing instead of rebuilding and stacking
      // another observer
      if (this._minObserver) this._minObserver.observe(this);
      return;
    }
    this._initialized = true;
    if (!document.getElementById(ClosureFormRow._styleId)) {
      var s = document.createElement('style');
      s.id = ClosureFormRow._styleId;
      s.textContent = ClosureFormRow._style;
      document.head.appendChild(s);
    }
    var self = this;
    var init = function() { self._build(); };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
      requestAnimationFrame(init);
    }
  }

  disconnectedCallback() {
    if (this._minObserver) this._minObserver.disconnect();
  }

  _build() {
    var cols = this.getAttribute('cols');
    var labels = this.getAttribute('labels') || 'top';
    var gap = this.getAttribute('gap') || '10px';
    var fields = this._getFields();

    // Wrap fields in label + body structure
    var self = this;
    fields.forEach(function(field) {
      if (field._built) return;
      field._built = true;

      var labelText = field.getAttribute('label') || '';
      var labelEl = document.createElement('span');
      labelEl.className = 'cfr-label';
      labelEl.textContent = labelText;
      if (field.hasAttribute('required')) labelEl.classList.add('cfr-required');
      field._labelEl = labelEl;

      // Wrap existing content in body div
      var body = document.createElement('div');
      body.className = 'cfr-body';
      while (field.firstChild) body.appendChild(field.firstChild);

      field.appendChild(labelEl);
      field.appendChild(body);

      var fieldLabels = field.getAttribute('labels') || labels;
      if (fieldLabels === 'side' || fieldLabels === 'left') field.setAttribute('labels-side', '');
      if (fieldLabels === 'right') field.setAttribute('labels-right', '');
      if (fieldLabels === 'checkbox-right') { field.setAttribute('labels-right', ''); field.setAttribute('labels-chk', ''); }
      if (fieldLabels === 'checkbox-left') { field.setAttribute('labels-side', ''); field.setAttribute('labels-chk', ''); }

      field._updateState();
    });

    // Apply layout
    if (cols) {
      this._applyGrid(cols, gap);
    } else {
      this._applyFlex(gap, fields);
    }

    // Responsive collapse
    var minWidth = this.getAttribute('min');
    if (minWidth && !this._minObserver) {
      var self = this;
      var minPx = parseFloat(minWidth);
      this._minObserver = new ResizeObserver(function(entries) {
        var w = entries[0].contentRect.width;
        if (w < minPx) {
          self.setAttribute('cfr-collapsed', '');
        } else {
          self.removeAttribute('cfr-collapsed');
        }
      });
      this._minObserver.observe(this);
    }
  }

  _getFields() {
    var result = [];
    var children = this.children;
    for (var i = 0; i < children.length; i++) {
      if (children[i].tagName === 'CLOSURE-FORM-FIELD') result.push(children[i]);
    }
    return result;
  }

  _parseCols(cols) {
    return cols.split(',').map(function(c) {
      c = c.trim();
      if (c === '*') return '1fr';
      if (/^\d+$/.test(c)) return c + 'fr';
      return c;
    }).join(' ');
  }

  _applyGrid(cols, gap) {
    this.style.display = 'grid';
    this.style.gridTemplateColumns = this._parseCols(cols);
    this.style.gap = gap;
    this._getFields().forEach(function(field) {
      var min = field.getAttribute('min');
      var max = field.getAttribute('max');
      if (min) field.style.minWidth = min;
      if (max) field.style.maxWidth = max;
    });
  }

  _applyFlex(gap, fields) {
    this.style.display = 'flex';
    this.style.gap = gap;

    fields.forEach(function(field) {
      var flex = field.getAttribute('flex');
      var width = field.getAttribute('width');
      var min = field.getAttribute('min');
      var max = field.getAttribute('max');
      if (width) {
        field.style.flex = '0 0 ' + width;
        field.style.width = width;
      } else if (flex) {
        field.style.flex = flex;
      } else {
        field.style.flex = '1';
      }
      if (min) field.style.minWidth = min;
      if (max) field.style.maxWidth = max;
    });
  }
}

customElements.define('closure-form-row', ClosureFormRow);
