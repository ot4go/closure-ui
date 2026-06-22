/*<%% note:
# `<btn-grid>`

Shadow-DOM grid layout for action buttons.

Slots its children into a CSS grid with a configurable column count.
Provides default visual variables (`--form-btn-*`) consumed by `<closure-btn>`.

## Attributes

| Attribute | Description |
|---|---|
| `cols="N"` | number of grid columns (default `3`) |
| `no-icon`  | hide icons inside slotted buttons and switch to compact text-only sizing (sets `--form-btn-icon-display: none`, `--form-btn-min-height: 0`, `--form-btn-padding: 14px 16px`) |



## Children

Any block-level button-like elements. Typically `<closure-btn>` instances.

## Example

```html
<btn-grid cols="2">
  <closure-btn ct-role="save">Save</closure-btn>
  <closure-btn ct-role="cancel">Cancel</closure-btn>
</btn-grid>
```

## CSS Variables

`<btn-grid>` declares defaults for these variables that slotted
`<closure-btn>` children consume. Override on the host (or any
ancestor) to customise the appearance:

| Variable | Default | Description |
|---|---|---|
| `--form-btn-padding`      | `28px 16px`                    | button inner padding |
| `--form-btn-font-size`    | `15px`                         | button label size |
| `--form-btn-bg`           | `#ffffff`                      | background colour |
| `--form-btn-color`        | `#111827`                      | text colour |
| `--form-btn-radius`       | `10px`                         | border radius |
| `--form-btn-shadow`       | `0 2px 8px rgba(0,0,0,0.10)`   | resting shadow |
| `--form-btn-shadow-hover` | `0 4px 16px rgba(0,0,0,0.16)`  | hover shadow |
| `--form-btn-min-height`   | `110px`                        | minimum height |

Override example:

```css
btn-grid {
  --form-btn-bg: #4f46e5;
  --form-btn-color: #fff;
  --form-btn-radius: 4px;
}
```

> **Note:** the `--form-btn-*` variables are only consumed by slotted
> `<closure-btn>` children. Plain `<button>` or other block-level elements
> are laid out by the grid but won't pick up the visual defaults — style
> them yourself.

> **Note:** `gap` (14px) and the top/bottom margins are not exposed as
> CSS variables. To change them, override directly on the host:
> ```css
> btn-grid { gap: 20px; margin-bottom: 24px; }
> ```

---
%%>*/

class BtnGrid extends HTMLElement {
  static _style = [
    ':host {',
    '  display: grid;',
    '  grid-template-columns: repeat(var(--btn-grid-cols, 3), 1fr);',
    '  gap: 14px;',
    '  margin-top: 0;',
    '  margin-bottom: 16px;',
    '  --form-btn-padding: 28px 16px;',
    '  --form-btn-font-size: 15px;',
    '  --form-btn-bg: #ffffff;',
    '  --form-btn-color: #111827;',
    '  --form-btn-radius: 10px;',
    '  --form-btn-shadow: 0 2px 8px rgba(0,0,0,0.10);',
    '  --form-btn-shadow-hover: 0 4px 16px rgba(0,0,0,0.16);',
    '  --form-btn-min-height: 110px;',
    '}',
  ].join('\n');
  connectedCallback() {
    // attachShadow throws on a second connect (DOM re-parenting)
    if (!this.shadowRoot) this.attachShadow({ mode: 'open' });
    this._render();
  }

  static get observedAttributes() { return ['cols', 'no-icon']; }

  attributeChangedCallback() {
    if (this.shadowRoot) this._render();
  }

  _render() {
    const cols = this.getAttribute('cols') || '3';
    // no-icon implies compact text-only buttons: the card sizing
    // (110px min-height, 28px padding) is designed around the icon
    const noIcon = this.hasAttribute('no-icon')
      ? '--form-btn-icon-display: none; --form-btn-min-height: 0; --form-btn-padding: 14px 16px;'
      : '';

    const style = document.createElement('style');
    style.textContent = BtnGrid._style +
      '\n:host { --btn-grid-cols: ' + cols + '; ' + noIcon + ' }';

    const slot = document.createElement('slot');

    this.shadowRoot.innerHTML = '';
    this.shadowRoot.appendChild(style);
    this.shadowRoot.appendChild(slot);
  }
}

customElements.define('btn-grid', BtnGrid);
