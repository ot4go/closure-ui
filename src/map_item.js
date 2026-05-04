/*<%% note:
# `<map-item>`

Single row of a `<data-map>` lookup. Renders nothing
(`display: none`); the element is a pure attribute carrier — every
attribute except the meta ones (`value`, `default`) is exposed as a
field of the resolved object.

## Attributes

| Attribute | Description |
|---|---|
| `value="x"`     | the lookup key (compared via `String(arg)`) |
| `default`       | catch-all row used when no `value` matches |
| any other       | becomes a field of the resolved object (e.g. `label`, `icon`, `color`) |

## Example

```html
<data-map>
  <map-item value="ok"   label="OK"   icon="✓" color="green"></map-item>
  <map-item value="ko"   label="KO"   icon="✗" color="red"></map-item>
  <map-item default       label="—"    icon="?" color="gray"></map-item>
</data-map>
```

## Behaviour

> **Note:** an item with `default` and no `value` acts as the
> fallback. If you also set a `value` on the default row, it can match
> by both — usually you don't want that, so leave `value` off.

---
%%>*/

customElements.define('map-item', class extends HTMLElement {
  connectedCallback() { this.style.display = 'none'; }
});
