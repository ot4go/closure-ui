/*<%% note:
# `<data-map>`

Declarative value-to-attributes lookup table. Renders nothing
(`display: none`) — it's a markup-only store consumed by other
components (typically `<closure-row-viewer>` and `<closure-data-grid>`)
to translate raw row values into icon / label / colour or any other
attribute set.

## Children

A list of `<map-item>` elements. See `<map-item>` for the per-row
attributes.

## Methods

| Method | Description |
|---|---|
| `resolve(value)` | returns the attribute set of the first `<map-item value="…">` whose `value` equals the stringified argument; otherwise the row marked `default`; otherwise `null` |

The returned object excludes the `value` and `default` meta-attributes
— only domain attributes (`label`, `icon`, `color`, …) are present.

## Example

```html
<data-map id="status-styles">
  <map-item value="ok"   label="OK"     icon="✓" color="green"></map-item>
  <map-item value="warn" label="Warn"   icon="!" color="amber"></map-item>
  <map-item default      label="Other"  icon="?" color="gray"></map-item>
</data-map>

<script>
  const styles = document.getElementById('status-styles').resolve('warn');
  // → { label: 'Warn', icon: '!', color: 'amber' }
</script>
```

## Behaviour

> **Note:** comparisons are **string-based**. Numbers are coerced via
> `String(value)`, so `resolve(0)` matches `<map-item value="0">` but
> not `<map-item value="false">`.

> **Note:** consumers that pass values through `<data-map>` typically
> read both the result object and a `map-show="icon|label"` attribute
> on themselves to choose which fields to render — see
> `<closure-row-viewer>`.

---
%%>*/

class DataMap extends HTMLElement {
  connectedCallback() {
    this.style.display = 'none';
  }

  resolve(value) {
    const str = String(value);
    const items = this.querySelectorAll('map-item');
    for (const item of items) {
      if (item.getAttribute('value') === str) return this._read(item);
    }
    const def = this.querySelector('map-item[default]');
    return def ? this._read(def) : null;
  }

  _read(item) {
    const result = {};
    for (const attr of item.attributes) {
      if (attr.name !== 'value' && attr.name !== 'default') {
        result[attr.name] = attr.value;
      }
    }
    return result;
  }
}

customElements.define('data-map', DataMap);
