/*<%% note:
# `<cbt-item>`

Structure-only element used inside `<closure-checkbox-tree>`. Carries
the metadata for one node of the tree (name, label, tip) and may
nest other `<cbt-item>` children to form sub-branches. The element
itself never renders — it's the parent tree that paints checkboxes
into its Shadow DOM based on this markup.

## Attributes

| Attribute | Description |
|---|---|
| `name="x"`  | node identifier; combined with parent names to build the path |
| `label="x"` | display text in the tree |
| `tip="x"`   | optional tooltip / description (shown via `title`) |

## Example

```html
<closure-checkbox-tree name="reports">
  <cbt-item name="weekly"  label="Weekly"  tip="Tuesday morning"></cbt-item>
  <cbt-item name="monthly" label="Monthly">
    <cbt-item name="payroll"   label="Payroll"></cbt-item>
    <cbt-item name="inventory" label="Inventory"></cbt-item>
  </cbt-item>
</closure-checkbox-tree>
```

## Behaviour

> **Note:** the path of a node is the leading-slash join of its
> ancestors' `name`s (including the tree's `name`). Two siblings can
> share a `name` value across different branches without colliding —
> the tree disambiguates by full path.

---
%%>*/

class CbtItem extends HTMLElement {}
customElements.define('cbt-item', CbtItem);
