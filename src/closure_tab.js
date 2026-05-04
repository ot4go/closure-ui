/*<%% note:
# `<closure-tab>`

A single tab panel inside `<closure-tab-bar>`. Holds the panel content
and the metadata (label, icon, disabled, hidden, toggle behaviour) the
parent bar uses to paint its trigger button.

## Attributes

| Attribute | Description |
|---|---|
| `name="x"`            | tab identifier (used by `select(name)`) |
| `label="x"`           | button text |
| `icon="x"`            | button icon (prepended to label) |
| `disabled`            | tab cannot be selected |
| `hidden`              | tab button hidden (panel hidden too) |
| `toggle="enable"`     | adds a checkbox to the button; panel starts disabled, check to enable |
| `toggle="disable"`    | adds a checkbox to the button; panel starts enabled, check to disable |
| `toggle-target="id"`  | hidden input to keep in sync with the toggle (writes `0`/`1`) |
| `show-source="id"`    | external checkbox whose state shows / hides this tab |

The parent bar listens to attribute changes (`hidden`, `disabled`,
`label`, `icon`) and re-renders its button row.

## Example

```html
<closure-tab-bar>
  <closure-tab name="overview" label="Overview" icon="🏠">…</closure-tab>
  <closure-tab name="advanced" label="Advanced"
               toggle="enable" toggle-target="advanced-on">
    <input type="hidden" id="advanced-on" name="advanced_enabled" value="0">
    …
  </closure-tab>
</closure-tab-bar>
```

## Behaviour

> **Note:** disabling a `closure-tab` does **not** dispatch
> `tab-change` if it was active — the bar will refuse to select the
> disabled tab on subsequent clicks but the panel stays in its current
> visibility state until the user picks another tab.

> **Note:** `toggled-off` (the attribute set when the toggle is off)
> hides every direct child except `<input type="hidden">` so the panel
> still submits its hidden value while showing nothing.

---
%%>*/

class ClosureTab extends HTMLElement {
  static get observedAttributes() { return ['hidden', 'disabled', 'label', 'icon']; }

  attributeChangedCallback() {
    var bar = this.closest('closure-tab-bar');
    if (bar && bar._built) bar._syncButtons();
  }
}

customElements.define('closure-tab', ClosureTab);
