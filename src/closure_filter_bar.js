/*<%% note:
# `<closure-filter-bar>`

Configurable filter UI: a chip strip showing the active values, a
"Filter" button that opens a `<closure-lightbox>` with the form, and an
optional list of one-click presets. Dispatches `filter-change` on the
configured target so a paired `<closure-data-grid>` (or any consumer)
can refetch.

## Attributes

| Attribute | Description |
|---|---|
| `target="id"`     | element to receive `filter-change` (default: self) |
| `icon="x"`        | trigger button icon (default `🔍`) |
| `label="x"`       | trigger button label (default `Filter`) |
| `dialog-title="x"`| lightbox header text |
| `cancel-label="x"`| cancel button text (default `Cancel`) |
| `apply-label="x"` | apply button text (default `Apply`) |

## Children

### `<filter-field>`

| Attribute | Description |
|---|---|
| `name="x"`         | field key in the values object |
| `label="x"`        | display label |
| `type="select"`    | dropdown (default) |
| `type="checkbox"`  | checkbox |
| `type="text"`      | free text input |
| `options="a,b,c"`  | inline options for `select` |
| `map-data-id="id"` | populate options from a `<data-map>` (map-item: `value` / `label`) |
| `no-all`           | omit the leading "All" empty option |

### `<filter-preset>`

| Attribute | Description |
|---|---|
| `label="x"`         | preset chip label |
| `data-<field>="v"`  | values to apply when the preset is selected |
| `clear`             | preset that resets all fields |

## Events

| Event | Bubbles | Detail |
|---|---|---|
| `filter-change` | no | `{ field: value, … }` |

Fired on the configured target after Apply or after the user removes a
chip.

## Properties / Methods

| Member | Description |
|---|---|
| `.values` (get) | shallow copy of the current filter values |
| `setValues(obj)`| programmatic update; refreshes chips and dispatches `filter-change` |

## Example

```html
<closure-filter-bar target="users-grid" dialog-title="Filter users">
  <filter-field name="status" label="Status"
                options="active,disabled,pending"></filter-field>
  <filter-field name="role"   label="Role"
                map-data-id="role-map"></filter-field>
  <filter-field name="search" label="Search"  type="text"></filter-field>

  <filter-preset label="Only active" data-status="active"></filter-preset>
  <filter-preset label="Reset" clear></filter-preset>
</closure-filter-bar>
```

## CSS Variables

| Variable | Default |
|---|---|
| `--border`        | `#e5e7eb` |
| `--primary`       | `#4f46e5` |
| `--primary-light` | `#e0e7ff` |
| `--red`           | `#dc2626` |
| `--text-muted`    | `#6b7280` |
| `--font`          | `sans-serif` |

## Behaviour

> **Note:** the bar is rendered with `display: contents` — it adds the
> chip strip + trigger button as siblings in the parent layout.
> Dropping it inside a `<status-msg>` slot uses a slightly different
> stylesheet (no padding / borders) so it integrates cleanly with a
> `<closure-status-bar>`.

> **Note:** the lightbox is appended to `<body>`, **not** kept as a
> child of the filter-bar. This avoids style leakage but means the
> filter-bar must remain in the document for the lightbox to reach it.

> **Note:** when both `options` and `map-data-id` are set, the data-map
> wins; the inline list is only used as fallback.

---
%%>*/

class ClosureFilterBar extends HTMLElement {
  static _styleId = 'closure-filter-bar-default-style';
  static _style = [
    'closure-filter-bar { display: contents; }',
    '.dg-closure-filter-bar { display: flex; align-items: center; gap: 6px; padding: 6px 12px; background: #fff; border-bottom: 1px solid var(--border, #e5e7eb); flex-wrap: wrap; font-size: 12px; }',
    'status-msg .dg-closure-filter-bar { padding: 0; background: none; border: none; margin: 0; }',
    '.dg-chip { display: inline-flex; align-items: center; gap: 4px; padding: 3px 8px; background: var(--primary-light, #e0e7ff); color: var(--primary, #4f46e5); border-radius: 99px; font-size: 12px; font-weight: 500; }',
    '.dg-chip button { background: none; border: none; cursor: pointer; color: var(--primary, #4f46e5); font-size: 13px; line-height: 1; padding: 0 0 0 2px; font-family: var(--font, sans-serif); }',
    '.dg-chip button:hover { color: var(--red, #dc2626); }',
  ].join('\n');

  connectedCallback() {
    if (this._initialized) return;
    this._initialized = true;
    if (!document.getElementById(ClosureFilterBar._styleId)) {
      const s = document.createElement('style');
      s.id = ClosureFilterBar._styleId;
      s.textContent = ClosureFilterBar._style;
      document.head.appendChild(s);
    }
    this._values = {};
    const init = () => {
      this._fields = Array.from(this.querySelectorAll('filter-field')).map(f => {
        const mapId = f.getAttribute('map-data-id') || '';
        let options;
        if (mapId) {
          const map = document.getElementById(mapId);
          if (map) {
            options = Array.from(map.querySelectorAll('map-item:not([default])')).map(mi => ({
              value: mi.getAttribute('value') || '',
              label: mi.getAttribute('label') || mi.getAttribute('value') || '',
            }));
          }
        }
        if (!options) {
          options = (f.getAttribute('options') || '').split(',').map(s => s.trim()).filter(Boolean).map(s => ({ value: s, label: s }));
        }
        return {
          name:    f.getAttribute('name'),
          label:   f.getAttribute('label'),
          type:    f.getAttribute('type') || 'text',
          options: options,
          noAll:   f.hasAttribute('no-all'),
        };
      });
      this._presets = Array.from(this.querySelectorAll('filter-preset')).map(p => {
        const preset = { label: p.getAttribute('label') || '', clear: p.hasAttribute('clear'), values: {} };
        for (const attr of p.attributes) {
          if (attr.name.startsWith('data-')) preset.values[attr.name.slice(5)] = attr.value;
        }
        return preset;
      });
      this._build();
    };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
      init();
    }
  }

  _build() {
    const icon  = this.getAttribute('icon')  || '🔍';
    const label = this.getAttribute('label') || 'Filter';

    // Bar
    this._bar = document.createElement('div');
    this._bar.className = 'dg-closure-filter-bar';
    this._btn = document.createElement('button');
    this._btn.type = 'button';
    this._btn.className = 'dg-btn';
    this._btn.style.cssText = 'font-size:12px;padding:3px 10px;flex-shrink:0;';
    this._btn.textContent = icon + ' ' + label;
    var self = this;
    this._btn.addEventListener('click', () => {
      if (self._lb._body) {
        self._lb._body.innerHTML = '';
        self._lb._body.appendChild(self._filterForm);
      }
      self._lb.open({
        title: self.getAttribute('dialog-title') || (icon + ' ' + label),
        buttons: [
          { label: self.getAttribute('cancel-label') || 'Cancel', action: 'cancel' },
          { label: self.getAttribute('apply-label') || 'Apply', action: 'apply', primary: true }
        ]
      });
    });
    this._chips = document.createElement('div');
    this._chips.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;align-items:center;';
    this._bar.appendChild(this._btn);
    this._bar.appendChild(this._chips);
    this.replaceChildren(this._bar);

    // Lightbox
    this._lb = document.createElement('closure-lightbox');
    this._lb.setAttribute('title', this.getAttribute('dialog-title') || (icon + ' ' + label));
    this._lb.addEventListener('lb-close', e => {
      if (e.detail.action === 'apply') self._apply();
    });
    const form = document.createElement('form');

    const body = document.createElement('div');
    body.style.cssText = 'padding:16px;display:flex;flex-direction:column;gap:12px;font-family:var(--font,sans-serif);font-size:13px;';
    this._inputs = {};
    this._fields.forEach(f => {
      const lbl = document.createElement('label');
      lbl.textContent = f.label;
      lbl.style.cssText = 'display:block;font-weight:600;color:var(--text,#111827);';
      let input;
      if (f.type === 'select') {
        input = document.createElement('select');
        input.style.cssText = 'width:100%;margin-top:4px;padding:6px 8px;border:1px solid var(--border,#e5e7eb);border-radius:4px;font-size:13px;font-family:var(--font,sans-serif);';
        if (!f.noAll) {
          const all = document.createElement('option');
          all.value = ''; all.textContent = 'All';
          input.appendChild(all);
        }
        f.options.forEach(o => {
          const opt = document.createElement('option');
          opt.value = o.value;
          opt.textContent = o.label;
          input.appendChild(opt);
        });
        this._inputs[f.name] = input;
        lbl.appendChild(input);
      } else if (f.type === 'checkbox') {
        const wrap = document.createElement('div');
        wrap.style.cssText = 'margin-top:4px;display:flex;flex-direction:column;gap:4px;';
        const checkboxes = [];
        f.options.forEach(o => {
          const row = document.createElement('label');
          row.style.cssText = 'display:flex;align-items:center;gap:6px;font-weight:400;cursor:pointer;font-size:13px;';
          const cb = document.createElement('input');
          cb.type = 'checkbox';
          cb.value = o.value;
          row.appendChild(cb);
          row.appendChild(document.createTextNode(o.label));
          wrap.appendChild(row);
          checkboxes.push(cb);
        });
        // Virtual input: value getter/setter as comma-separated
        input = {
          _cbs: checkboxes,
          get value() { return this._cbs.filter(c => c.checked).map(c => c.value).join(','); },
          set value(v) {
            const vals = v ? v.split(',') : [];
            this._cbs.forEach(c => c.checked = vals.includes(c.value));
          },
        };
        this._inputs[f.name] = input;
        lbl.appendChild(wrap);
      } else {
        input = document.createElement('input');
        input.type = 'text';
        input.placeholder = 'Search…';
        input.style.cssText = 'width:100%;margin-top:4px;padding:6px 8px;border:1px solid var(--border,#e5e7eb);border-radius:4px;font-size:13px;font-family:var(--font,sans-serif);';
        this._inputs[f.name] = input;
        lbl.appendChild(input);
      }
      body.appendChild(lbl);
    });
    form.appendChild(body);

    // Presets
    if (this._presets.length > 0) {
      const presetBar = document.createElement('div');
      presetBar.style.cssText = 'padding:8px 16px;border-top:1px solid var(--border,#e5e7eb);display:flex;gap:6px;flex-wrap:wrap;';
      this._presets.forEach(preset => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'dg-btn';
        btn.style.cssText = 'font-size:11px;padding:3px 8px;';
        btn.textContent = preset.label;
        btn.addEventListener('click', () => {
          if (preset.clear) {
            this._fields.forEach(f => { if (this._inputs[f.name]) this._inputs[f.name].value = ''; });
          } else {
            this._fields.forEach(f => {
              if (this._inputs[f.name]) {
                this._inputs[f.name].value = preset.values[f.name] || '';
              }
            });
          }
          this._apply();
          self._lb.close('preset');
        });
        presetBar.appendChild(btn);
      });
      form.appendChild(presetBar);
    }


    this._filterForm = form;
    document.body.appendChild(this._lb);
    this._renderChips();
  }

  _apply() {
    this._fields.forEach(f => {
      this._values[f.name] = this._inputs[f.name].value.trim();
    });
    this._renderChips();
    this._dispatch();
  }

  _renderChips() {
    this._chips.innerHTML = '';
    let count = 0;
    this._fields.forEach(f => {
      const v = this._values[f.name] || '';
      if (!v) return;
      count++;
      const chip = document.createElement('span');
      chip.className = 'dg-chip';
      const strong = document.createElement('strong');
      const optMatch = f.options.find(o => o.value === v);
      strong.textContent = optMatch ? optMatch.label : v;
      const x = document.createElement('button');
      x.type = 'button'; x.title = 'Remove'; x.textContent = '×';
      x.addEventListener('click', () => {
        this._values[f.name] = '';
        if (this._inputs[f.name]) this._inputs[f.name].value = '';
        this._renderChips();
        this._dispatch();
      });
      chip.append(f.label + ': ', strong, x);
      this._chips.appendChild(chip);
    });
    if (count === 0) {
      const none = document.createElement('span');
      none.style.cssText = 'color:var(--text-muted,#6b7280);font-style:italic';
      none.textContent = 'no filter';
      this._chips.appendChild(none);
    }
  }

  _dispatch() {
    const targetId = this.getAttribute('target');
    const dest = targetId ? document.getElementById(targetId) : this;
    if (dest) dest.dispatchEvent(new CustomEvent('filter-change', { detail: { ...this._values }, bubbles: false }));
  }

  get values() { return { ...this._values }; }

  setValues(obj) {
    this._fields.forEach(f => {
      var val = obj[f.name] !== undefined ? String(obj[f.name]) : '';
      this._values[f.name] = val;
      if (this._inputs[f.name]) this._inputs[f.name].value = val;
    });
    this._renderChips();
    this._dispatch();
  }
}

customElements.define('closure-filter-bar', ClosureFilterBar);
