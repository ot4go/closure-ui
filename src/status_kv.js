/*<%% note:
# `<status-kv>`

Key / value pair for `<closure-status-bar>`. The key is rendered as an
uppercase, muted, fixed-width label; the value as the bar's normal text.
The original inner HTML of the host becomes the value content on connect.

## Attributes

| Attribute | Description |
|---|---|
| `key="x"`      | uppercase muted label on the left |
| `prefix="x"`  | fixed text before the value |
| `suffix="x"`  | fixed text after the value |
| `wr="min,max"` | width range (see [Helpers / `applyWidthRange`](#helpers)) |

## Properties

| Property | Description |
|---|---|
| `.value` (get/set) | text content of the value span |

## Example

```html
<status-kv key="user">jdoe</status-kv>
<status-kv key="run">2026-05-02 17:21</status-kv>
<status-kv key="D" prefix="range " suffix=" days">14</status-kv>

<script>
  document.querySelector('status-kv[key="user"]').value = 'admin';
</script>
```

## CSS Variables

| Variable | Default |
|---|---|
| `--text-muted` | `#6b7280` |
| `--text`       | `#111827` |
| `--border`     | `#d1d5db` |

## Behaviour

> **Note:** on connect the host's existing innerHTML is **moved** into a
> `.kv-val` span. Subsequent writes to the host's `innerHTML` would
> overwrite both the key and value spans — use `.value` (or
> `querySelector('.kv-val').innerHTML`) to update.

---
%%>*/

class StatusKv extends HTMLElement {
  static _styleId = 'status-kv-style';
  static _style = [
    'status-kv {',
    '  display: flex;',
    '  align-items: center;',
    '  gap: 6px;',
    '  padding: 0 12px;',
    '  flex: 1;',
    '  overflow: hidden;',
    '  border-right: 2px solid var(--border, #d1d5db);',
    '  align-self: stretch;',
    '}',
    'status-kv .kv-key {',
    '  font-size: 11px;',
    '  font-weight: 700;',
    '  color: var(--text-muted, #6b7280);',
    '  text-transform: uppercase;',
    '  letter-spacing: 0.05em;',
    '  white-space: nowrap;',
    '  flex-shrink: 0;',
    '}',
    'status-kv .kv-val {',
    '  font-size: 14px;',
    '  color: var(--text, #111827);',
    '  overflow: hidden;',
    '  text-overflow: ellipsis;',
    '  white-space: nowrap;',
    '}',
  ].join('\n');

  connectedCallback() {
    if (!document.getElementById(StatusKv._styleId)) {
      var s = document.createElement('style');
      s.id = StatusKv._styleId;
      s.textContent = StatusKv._style;
      document.head.appendChild(s);
    }
    var key = this.getAttribute('key') || '';
    var val = this.innerHTML;
    this.innerHTML = '';
    if (key) {
      var keyEl = document.createElement('span');
      keyEl.className = 'kv-key';
      keyEl.textContent = key;
      this.appendChild(keyEl);
    }
    var valEl = document.createElement('span');
    valEl.className = 'kv-val';
    this._prefix = this.getAttribute('prefix') || '';
    this._suffix = this.getAttribute('suffix') || '';
    if (this._prefix) {
      var prefixEl = document.createElement('span');
      prefixEl.className = 'kv-prefix';
      prefixEl.textContent = this._prefix;
      valEl.appendChild(prefixEl);
    }
    var valueEl = document.createElement('span');
    valueEl.className = 'kv-value';
    valueEl.innerHTML = val;
    this._valueEl = valueEl;
    valEl.appendChild(valueEl);
    if (this._suffix) {
      var suffixEl = document.createElement('span');
      suffixEl.className = 'kv-suffix';
      suffixEl.textContent = this._suffix;
      valEl.appendChild(suffixEl);
    }
    this._valEl = valEl;
    this.appendChild(valEl);

    applyWidthRange(this);
  }

  get value() { return this._valueEl ? this._valueEl.textContent : ''; }
  set value(v) { if (this._valueEl) this._valueEl.textContent = v; }
}

customElements.define('status-kv', StatusKv);
