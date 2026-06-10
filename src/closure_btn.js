/*<%% note:
# `<closure-btn>`

Action button for the target-closure system. Renders a styled anchor
inside a shadow DOM. By default a click dispatches a bubbling
`btn-action` event that the enclosing `<target-closure>` picks up to
route the request to the matching `<closure-template>`. With the `menu`
attribute it becomes a dropdown that hosts `<closure-btn-item>` children.

## Attributes

| Attribute | Description |
|---|---|
| `ct-role="x"`           | role used to match a `<closure-template>` template URL / response |
| `closure-template="x"`  | name of a specific `<closure-template>` to invoke |
| `icon="x"`              | icon text rendered above/before the label |
| `label="x"`             | tooltip text used together with `nolabel` |
| `width="x"`             | fixed visual button width (`28` means `28px`; CSS lengths pass through) |
| `nolabel`               | hide the label, show only the icon (tooltip = `label` or `menu`) |
| `notooltip`             | when `nolabel`, suppress the tooltip |
| `menu="x"`              | turn the button into a dropdown; `x` is the panel header text |
| `disabled`              | disabled visual + non-interactive (also `disabled="true"`/`""`) |
| `readonly`              | rendered but hidden (used to keep grid alignment) |
| `class="primary\|red\|green\|gray\|small"` | colour / size variants |
| `free`                  | bypass target-closure: click POSTs to `url` (or fires the event itself) |
| `url="x"`               | (with `free`) destination URL of the auto-generated POST form |
| `event="x"`             | event name to dispatch (default `btn-action`) |
| `target-id="x"`         | element to receive the dispatched event (default: self) |
| `target-selector="css"` | selector target for local client actions |
| `target-selector-all="css"` | selector targets for local client actions |
| `section="x"`           | section key when packaging `data-*` for the closure |
| `data-*`                | included in `getBtnData()`'s payload section |

## Events

| Event | Bubbles | Cancelable | Detail |
|---|---|---|---|
| `btn-action` (or custom `event`) | yes | no | none |

`<target-closure>` reads the button's `getBtnData()` to extract
`ct-role`, `closure-template` and `data-*` fields when handling the event.

## Methods

| Method | Description |
|---|---|
| `getBtnData()` | `{ ctRole, closureTemplate, sections: { [section]: { …data-* fields } } }` |

## Example

```html
<!-- Standard target-closure button -->
<closure-btn ct-role="save" icon="💾" class="primary" data-id="42">
  Save
</closure-btn>

<!-- Free-mode: posts data-* to /logout -->
<closure-btn free url="/logout" class="red">
  Sign out
</closure-btn>

<!-- Dropdown menu -->
<closure-btn menu="Actions" icon="⋯">
  <closure-btn-item ct-role="export" icon="📥">Export</closure-btn-item>
  <closure-btn-item ct-role="archive" icon="🗄️">Archive</closure-btn-item>
</closure-btn>
```

## Local client actions

`client-action="set-value"` writes `value` to the resolved target's
`.value` property without a server round trip and without dispatching
the normal `btn-action` event.

```html
<input id="year" type="text">

<closure-btn client-action="set-value" target-id="year" value="2026" class="small">
  2026
</closure-btn>
```

Targets can be selected with `target-id`, `target-selector`, or
`target-selector-all`. This mirrors the server-side
`<response-item type="set-value">` action, but runs entirely in the
browser.

## CSS Variables

Consumed for styling the inner anchor (every value falls back if unset):

| Variable | Default | Description |
|---|---|---|
| `--form-btn-host-display`   | `block`              | host `display` |
| `--form-btn-min-height`     | `100px`              | host minimum height |
| `--form-btn-padding`        | `10px 20px`          | inner padding |
| `--form-btn-font-size`      | `14px`               | label font size |
| `--form-btn-radius`         | `6px`                | border radius |
| `--form-btn-bg`             | `var(--primary,#4f46e5)` | background |
| `--form-btn-color`          | `#fff`               | text colour |
| `--form-btn-shadow`         | `none`               | resting shadow |
| `--form-btn-shadow-hover`   | `none`               | hover shadow |
| `--form-btn-direction`      | `column`             | flex direction inside the anchor |
| `--form-btn-icon-size`      | `2.4em`              | icon font size |
| `--form-btn-icon-display`   | `block`              | icon span display (`btn-grid no-icon` sets `none`) |
| `--form-btn-width`          | `100%`               | anchor width |
| `--form-btn-height`         | `auto`               | anchor height |

Class variants apply built-in colours and sizes:
`primary`, `red`, `green`, `gray`, `small`.

## Behaviour

> **Note:** the dropdown panel re-positions itself with `position: fixed`
> and clamps to the viewport with an 8px margin so it never overflows the
> screen. On widths ≤ 600px it switches to a centered modal layout.

> **Note:** Enter on the host activates the anchor; Space also activates
> when in `menu` mode. Arrow Up/Down + Enter move focus through items;
> Esc closes the panel.

> **Note:** `readonly` keeps the host laid out (visibility: hidden) so it
> still occupies the grid cell. Use `disabled` if you want the button
> visually present but inactive.

---
%%>*/

class ClosureBtn extends HTMLElement {
  static _style = [
    ':host {',
    '  display: var(--form-btn-host-display, block);',
    '  min-height: var(--form-btn-min-height, 100px);',
    '  position: relative;',
    '}',
    'a {',
    '  padding: var(--form-btn-padding, 10px 20px);',
    '  border: none;',
    '  border-radius: var(--form-btn-radius, 6px);',
    '  cursor: pointer;',
    '  font-family: var(--font, sans-serif);',
    '  font-size: var(--form-btn-font-size, 14px);',
    '  font-weight: 600;',
    '  text-decoration: none;',
    '  display: flex;',
    '  align-items: center;',
    '  justify-content: center;',
    '  width: var(--form-btn-width, 100%);',
    '  height: var(--form-btn-height, auto);',
    '  box-sizing: border-box;',
    '  transition: background 0.15s, box-shadow 0.15s, transform 0.1s;',
    '  text-align: center;',
    '  gap: 10px;',
    '  flex-direction: var(--form-btn-direction, column);',
    '  background: var(--form-btn-bg, var(--primary, #4f46e5));',
    '  color: var(--form-btn-color, #fff);',
    '  box-shadow: var(--form-btn-shadow, none);',
    '}',
    'a span { font-size: var(--form-btn-icon-size, 2.4em); line-height: 1; display: var(--form-btn-icon-display, block); }',
    'a:hover {',
    '  box-shadow: var(--form-btn-shadow-hover, none);',
    '  transform: translateY(-1px);',
    '}',
    'a.disabled {',
    '  opacity: 0.4;',
    '  cursor: not-allowed;',
    '  pointer-events: none;',
    '}',
    ':host([readonly]) a {',
    '  visibility: hidden;',
    '}',
    'a.green { background: var(--green, #16a34a); color: #fff; }',
    'a.green:hover { background: var(--green-hover, #15803d); }',
    'a.gray { background: var(--gray, #6b7280); color: #fff; }',
    'a.gray:hover { background: var(--gray-hover, #4b5563); }',
    'a.primary { background: var(--primary, #4f46e5); color: #fff; }',
    'a.primary:hover { background: #4338ca; }',
    'a.red { background: var(--red, #dc2626); color: #fff; }',
    'a.red:hover { background: var(--red-hover, #b91c1c); }',
    'a.btn-full { width: 100%; }',
    'a.small { padding: 6px 12px; font-size: 12px; }',
    /* v-fill: make <a> stretch to host's full height so content centers */
    ':host([v-fill]) { display: flex; }',
    ':host([v-fill]) a { height: 100%; }',
    '.backdrop {',
    '  display: none;',
    '  position: fixed;',
    '  inset: 0;',
    '  background: rgba(0,0,0,0.4);',
    '  z-index: 998;',
    '}',
    '.backdrop.open { display: block; }',
    '.menu-panel {',
    '  display: none;',
    '  position: absolute;',
    '  top: 50%;',
    '  left: 50%;',
    '  transform: translate(-50%, -50%);',
    '  min-width: 200px;',
    '  background: #fff;',
    '  border: 1px solid var(--border, #e5e7eb);',
    '  border-radius: 8px;',
    '  box-shadow: 0 4px 20px rgba(0,0,0,0.15);',
    '  z-index: 999;',
    '  overflow: hidden;',
    '}',
    '.menu-panel.open { display: block; }',
    '.menu-panel-header {',
    '  padding: 12px 16px;',
    '  font-family: var(--font, sans-serif);',
    '  font-size: 13px;',
    '  font-weight: 700;',
    '  color: var(--text-muted, #6b7280);',
    '  text-transform: uppercase;',
    '  letter-spacing: 0.05em;',
    '  border-bottom: 1px solid var(--border, #e5e7eb);',
    '}',
    '@media (max-width: 600px) {',
    '  .menu-panel {',
    '    position: fixed;',
    '    left: 50%;',
    '    top: 50%;',
    '    transform: translate(-50%, -50%);',
    '    width: 90vw;',
    '    max-width: 360px;',
    '    border-radius: 12px;',
    '  }',
    '}',
  ].join('\n');

  connectedCallback() {
    if (this._initialized) return;
    this._initialized = true;
    this._boundDocClick = this._onDocClick.bind(this);
    this.attachShadow({ mode: 'open' });
    this._render();
    document.addEventListener('click', this._boundDocClick);
  }

  disconnectedCallback() {
    document.removeEventListener('click', this._boundDocClick);
  }

  static get observedAttributes() { return ['icon', 'disabled', 'menu', 'nolabel', 'label', 'width']; }

  attributeChangedCallback() {
    if (this.shadowRoot) this._render();
  }

  _render() {
    const hasMenu = this.hasAttribute('menu');
    const disabledVal = this.getAttribute('disabled');
    const disabled = disabledVal === '' || disabledVal === 'disabled' || disabledVal === 'true';
    const readonly = this.hasAttribute('readonly');
    this.tabIndex = (disabled || readonly) ? -1 : 0;
    this.onkeydown = (e) => {
      if (e.key === 'Enter' || (hasMenu && e.key === ' ')) {
        e.preventDefault();
        this.shadowRoot.querySelector('a').click();
      }
    };

    const style = document.createElement('style');
    style.textContent = ClosureBtn._style;

    const nolabel = this.hasAttribute('nolabel');
    const a = document.createElement('a');
    a.href = '#';
    a.tabIndex = -1;
    a.className = (this.getAttribute('class') || '') + (disabled ? ' disabled' : '');
    const width = this._cssLength(this.getAttribute('width') || '');
    if (width) {
      this.style.width = width;
      a.style.width = width;
      a.style.minWidth = width;
      a.style.maxWidth = width;
    } else {
      this.style.width = '';
    }
    if (nolabel && !this.hasAttribute('notooltip')) {
      const tooltip = this.getAttribute('label') || this.getAttribute('menu') || '';
      if (tooltip) a.title = tooltip;
    }

    const icon = this.getAttribute('icon');
    if (icon) {
      const iconSpan = document.createElement('span');
      iconSpan.setAttribute('aria-hidden', 'true');
      iconSpan.textContent = icon;
      a.appendChild(iconSpan);
    }

    const slot = document.createElement('slot');
    if (!nolabel) slot.innerHTML = '&nbsp;';

    if (hasMenu) {
      if (!nolabel) {
        const labelSlot = document.createElement('slot');
        labelSlot.name = 'label';
        labelSlot.innerHTML = this.getAttribute('menu') || '&nbsp;';
        a.appendChild(labelSlot);
      }

      const backdrop = document.createElement('div');
      backdrop.className = 'backdrop';

      const panel = document.createElement('div');
      panel.className = 'menu-panel';

      const header = document.createElement('div');
      header.className = 'menu-panel-header';
      header.textContent = this.getAttribute('menu') || '';
      panel.appendChild(header);
      panel.appendChild(slot);

      const toggle = (open) => {
        if (!open) {
          panel.style.top = '';
          panel.style.left = '';
          panel.style.transform = '';
          panel.style.position = '';
          this._focusItem(Array.from(this.querySelectorAll('closure-btn-item')), -1);
          this._focusedItem = null;
        }
        panel.classList.toggle('open', open);
        backdrop.classList.toggle('open', open);
        if (open) this._reposition(panel);
      };

      a.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!disabled && !readonly) toggle(!panel.classList.contains('open'));
      });

      backdrop.addEventListener('click', () => toggle(false));
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') { toggle(false); return; }
        if (!panel.classList.contains('open')) return;
        const items = Array.from(this.querySelectorAll('closure-btn-item:not([disabled])'));
        if (!items.length) return;
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault();
          let idx = items.indexOf(this._focusedItem || null);
          idx = e.key === 'ArrowDown' ? Math.min(idx + 1, items.length - 1) : Math.max(idx - 1, 0);
          this._focusItem(items, idx);
        } else if (e.key === 'Enter' && this._focusedItem) {
          e.preventDefault();
          this._focusedItem._dispatch();
        }
      });

      this._panel = panel;
      this._backdrop = backdrop;
      this.shadowRoot.innerHTML = '';
      this.shadowRoot.appendChild(style);
      this.shadowRoot.appendChild(backdrop);
      this.shadowRoot.appendChild(a);
      this.shadowRoot.appendChild(panel);
    } else {
      a.appendChild(slot);

      if (this.hasAttribute('free')) {
        // Free mode: behave like form-btn (direct submit or btn-action)
        const url = this.getAttribute('url') || '';
        if (url) {
          var self = this;
          a.addEventListener('click', (e) => {
            e.preventDefault();
            if (disabled || readonly) return;
            const form = document.createElement('form');
            form.method = 'POST';
            form.action = url;
            form.style.display = 'none';
            for (const attr of self.attributes) {
              if (attr.name.startsWith('data-')) {
                const hidden = document.createElement('input');
                hidden.type = 'hidden';
                hidden.name = attr.name.slice(5);
                hidden.value = attr.value;
                form.appendChild(hidden);
              }
            }
            document.body.appendChild(form);
            form.submit();
          });
        } else {
          a.addEventListener('click', (e) => {
            e.preventDefault();
            if (disabled || readonly) return;
            this._dispatch();
          });
        }
      } else {
        a.addEventListener('click', (e) => {
          e.preventDefault();
          if (disabled || readonly) return;
          this._dispatch();
        });
      }

      this.shadowRoot.innerHTML = '';
      this.shadowRoot.appendChild(style);
      this.shadowRoot.appendChild(a);
    }
  }

  _dispatch() {
    if (this._runClientAction()) return;
    const eventName = this.getAttribute('event') || 'btn-action';
    const targetId = this.getAttribute('target-id') || '';
    const dest = targetId ? document.getElementById(targetId) : this;
    if (dest) {
      dest.dispatchEvent(new CustomEvent(eventName, { bubbles: true }));
    }
  }

  _runClientAction() {
    const action = this.getAttribute('client-action') || '';
    if (action !== 'set-value') return false;

    const value = this.getAttribute('value') || '';
    this._resolveTargets().forEach(el => {
      el.value = value;
    });
    return true;
  }

  _cssLength(value) {
    const v = String(value || '').trim();
    if (!v) return '';
    if (/^-?\d+(\.\d+)?$/.test(v)) return v + 'px';
    return v;
  }

  _resolveTargets() {
    const results = [];
    const id = this.getAttribute('target-id') || '';
    if (id) {
      const el = document.getElementById(id);
      if (el) results.push(el);
    }

    const selector = this.getAttribute('target-selector') || '';
    if (selector) {
      const el = document.querySelector(selector);
      if (el) results.push(el);
    }

    const selectorAll = this.getAttribute('target-selector-all') || '';
    if (selectorAll) {
      document.querySelectorAll(selectorAll).forEach(el => results.push(el));
    }

    return results;
  }

  getBtnData() {
    var section = this.getAttribute('section') || '';
    var fields = {};
    for (const attr of this.attributes) {
      if (attr.name.startsWith('data-')) fields[attr.name.slice(5)] = attr.value;
    }
    var sections = {};
    sections[section] = fields;
    return {
      ctRole: this.getAttribute('ct-role') || '',
      closureTemplate: this.getAttribute('closure-template') || '',
      sections: sections
    };
  }

  _focusItem(items, idx) {
    items.forEach((item, i) => item.toggleAttribute('focused', i === idx));
    this._focusedItem = items[idx] || null;
  }

  _reposition(panel) {
    const hostRect = this.getBoundingClientRect();
    const pw = panel.offsetWidth;
    const ph = panel.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let left = hostRect.left + (hostRect.width - pw) / 2;
    let top = hostRect.top + (hostRect.height - ph) / 2;

    if (left < 8) left = 8;
    if (top < 8) top = 8;
    if (left + pw > vw - 8) left = vw - pw - 8;
    if (top + ph > vh - 8) top = vh - ph - 8;

    panel.style.transform = 'none';
    panel.style.position = 'fixed';
    panel.style.top = top + 'px';
    panel.style.left = left + 'px';
  }

  _onDocClick(e) {
    if (this._panel && !this.contains(e.target)) {
      this._panel.classList.remove('open');
      if (this._backdrop) this._backdrop.classList.remove('open');
    }
  }
}

customElements.define('closure-btn', ClosureBtn);
