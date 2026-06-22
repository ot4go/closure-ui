/*<%% note:
# `<closure-btn-item>`

Menu item for the `<closure-btn menu="…">` dropdown. Behaves like a
mini-button: clicking it dispatches the same action event as its parent
button (or POSTs to its own `url`), inheriting fields the user did not
override.

## Attributes

| Attribute | Description |
|---|---|
| `ct-role="x"`   | role for template matching (overrides the parent button's `ct-role`) |
| `icon="x"`      | icon text rendered before the label |
| `disabled`      | disabled visual + skips focus |
| `url="x"`       | when set, click POSTs the merged `data-*` to this URL instead of dispatching the event |
| `event="x"`     | event name to dispatch (defaults to parent's `event` then to `btn-action`) |
| `target-id="x"` | element to receive the dispatched event (defaults to parent's `target-id` then to the parent button) |
| `section="x"`   | section key when packaging `data-*` (defaults to parent's `section`) |
| `data-*`        | merged on top of parent's `data-*` (item wins on conflicts) |

## Methods

| Method | Description |
|---|---|
| `getBtnData()` | merged payload `{ ctRole, closureTemplate, sections: { [section]: { …data-* } } }` |

## Example

```html
<closure-btn menu="Row actions" icon="⋯">
  <closure-btn-item ct-role="edit"   icon="✎" data-id="42">Edit</closure-btn-item>
  <closure-btn-item ct-role="delete" icon="🗑" data-id="42" class="red">Delete</closure-btn-item>
</closure-btn>
```

## CSS Variables

Consumed (with fallbacks):

| Variable | Default |
|---|---|
| `--btn-item-gap`        | `10px` |
| `--btn-item-padding`    | `10px 16px` |
| `--btn-item-font-size`  | `14px` |
| `--font`                | `sans-serif` |
| `--text`                | `#111827` |
| `--primary`             | `#4f46e5` |
| `--primary-light`       | `#e0e7ff` |

## Behaviour

> **Note:** the cascading data merge means the parent button's `data-*`
> attributes apply to **every** item by default. An item can shadow any
> single field by re-declaring `data-<name>` on itself.

> **Note:** when `url` is set, the inner anchor builds and submits a
> hidden form with the merged section-prefixed fields. This bypasses
> `<target-closure>` entirely — useful for "free" actions like signing
> out from inside a dropdown.

---
%%>*/

class ClosureBtnItem extends HTMLElement {
  static _style = [
    ':host {',
    '  display: block;',
    '  cursor: pointer;',
    '}',
    'a {',
    '  display: flex;',
    '  align-items: center;',
    '  gap: var(--btn-item-gap, 10px);',
    '  padding: var(--btn-item-padding, 10px 16px);',
    '  text-decoration: none;',
    '  font-family: var(--font, sans-serif);',
    '  font-size: var(--btn-item-font-size, 14px);',
    '  font-weight: 500;',
    '  color: var(--text, #111827);',
    '  transition: background 0.1s;',
    '  white-space: nowrap;',
    '}',
    'a:hover {',
    '  background: var(--primary-light, #e0e7ff);',
    '}',
    ':host([focused]) a {',
    '  background: var(--primary-light, #e0e7ff);',
    '  outline: 2px solid var(--primary, #4f46e5);',
    '  outline-offset: -2px;',
    '}',
    ':host([disabled]) { cursor: not-allowed; }',
    ':host([disabled]) a {',
    '  opacity: 0.4;',
    '  cursor: not-allowed;',
    '}',
    ':host([disabled]) a:hover { background: none; }',
    '.icon {',
    '  font-size: 1.2em;',
    '  line-height: 1;',
    '}',
  ].join('\n');

  connectedCallback() {
    if (this._initialized) return;
    this._initialized = true;
    this.attachShadow({ mode: 'open' });
    this._render();
    this.tabIndex = this.hasAttribute('disabled') ? -1 : 0;
  }

  static get observedAttributes() { return ['icon', 'disabled']; }

  attributeChangedCallback() {
    if (this.shadowRoot) {
      this._render();
      this.tabIndex = this.hasAttribute('disabled') ? -1 : 0;
    }
  }

  _render() {
    const style = document.createElement('style');
    style.textContent = ClosureBtnItem._style;

    const a = document.createElement('a');
    a.href = '#';

    const icon = this.getAttribute('icon');
    if (icon) {
      const iconSpan = document.createElement('span');
      iconSpan.className = 'icon';
      iconSpan.setAttribute('aria-hidden', 'true');
      iconSpan.textContent = icon;
      a.appendChild(iconSpan);
    }

    const slot = document.createElement('slot');
    a.appendChild(slot);

    const url = this.getAttribute('url') || '';
    if (url) {
      const self = this;
      a.addEventListener('click', (e) => {
        e.preventDefault();
        if (self.hasAttribute('disabled')) return;
        const form = document.createElement('form');
        form.method = 'POST';
        form.action = url;
        form.style.display = 'none';
        // Reuse the same merging logic as the btn-action path.
        const data = self.getBtnData();
        for (const section in data.sections) {
          const fields = data.sections[section];
          for (const name in fields) {
            const hidden = document.createElement('input');
            hidden.type = 'hidden';
            hidden.name = section ? section + '_' + name : name;
            hidden.value = fields[name];
            form.appendChild(hidden);
          }
        }
        document.body.appendChild(form);
        form.submit();
      });
    } else {
      a.addEventListener('click', (e) => {
        e.preventDefault();
        this._dispatch();
      });
    }

    this.shadowRoot.innerHTML = '';
    this.shadowRoot.appendChild(style);
    this.shadowRoot.appendChild(a);
  }

  _dispatch() {
    if (this.hasAttribute('disabled')) return;
    var parent = this.closest('closure-btn');
    var eventName = this.getAttribute('event') || (parent && parent.getAttribute('event')) || 'btn-action';
    var targetId = this.getAttribute('target-id') || (parent && parent.getAttribute('target-id')) || '';
    var dest = targetId ? document.getElementById(targetId) : (parent || this);
    if (dest) {
      // detail.source carries the item so consumers (target-closure) use
      // the item's merged payload, not the parent button's
      dest.dispatchEvent(new CustomEvent(eventName, { bubbles: true, detail: { source: this } }));
    }
  }

  getBtnData() {
    var parent = this.closest('closure-btn');
    var section = this.getAttribute('section') || (parent && parent.getAttribute('section')) || '';
    var fields = {};
    if (parent) {
      for (const attr of parent.attributes) {
        if (attr.name.startsWith('data-')) fields[attr.name.slice(5)] = attr.value;
      }
    }
    for (const attr of this.attributes) {
      if (attr.name.startsWith('data-')) fields[attr.name.slice(5)] = attr.value;
    }
    var sections = {};
    sections[section] = fields;
    return {
      ctRole: this.getAttribute('ct-role') || (parent && parent.getAttribute('ct-role')) || '',
      closureTemplate: (parent && parent.getAttribute('closure-template')) || '',
      sections: sections
    };
  }
}

customElements.define('closure-btn-item', ClosureBtnItem);
