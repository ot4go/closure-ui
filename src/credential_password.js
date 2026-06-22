/*<%% note:
# `<credential-pwd>`

Masked password input with paste-friendly behaviour. Wraps a hidden
`<input type="password">` so the value participates in form submission,
while showing bullet glyphs (`●`) to the user. Designed to defeat
stored-credential autofill on shared admin screens.

## Attributes

| Attribute | Description |
|---|---|
| `name="x"` | form-field name (mirrored on the inner `<input>`) |
| `required` | mirrors HTML `required` validation |
| `readonly` | disables interaction (`tabIndex=-1`, `pointer-events: none`) |
| `has-value` | preload bullet placeholder (an existing password is on file) |
| `enter-btn-id="x"` | element activated by Enter (e.g. a `<closure-btn>` outside the form, as in dialogs) |

## Properties

| Property | Description |
|---|---|
| `.value` (get/set) | plaintext value |
| `.pasted` (bool)   | `true` if the current value came from a paste |

## Events

The native `invalid` event is intercepted: instead of letting the browser
show its tooltip, the host gets the `.field-invalid` class so callers
can style it.

## Example

```html
<form>
  <credential-pwd name="password" required></credential-pwd>
  <credential-pwd name="new_password" has-value></credential-pwd>
  <button type="submit">Save</button>
</form>
```

## CSS Variables

Consumed (with fallbacks):

| Variable | Default |
|---|---|
| `--border`        | `#e5e7eb` |
| `--font`          | `sans-serif` |
| `--text`          | `#111827` |
| `--primary`       | `#4f46e5` |
| `--primary-light` | `#e0e7ff` |
| `--red`           | `#dc2626` |

## Behaviour

> **Note:** the first focus on a `has-value` instance **wipes** the bullet
> placeholder and starts a fresh input. There is no edit-in-place mode —
> the user must type the whole new password.

> **Note:** on paste, the whole pasted string replaces the value and
> `pasted=true` is exposed. **Backspace then clears the entire pasted
> value** (no character-by-character editing). Type-after-paste also wipes
> the pasted content.

> **Note:** Enter activates, in priority order: the `enter-btn-id`
> target (use this in dialogs where the action button sits outside the
> form), else the enclosing `<form>`'s submit (inside a closure this
> routes through the template), else it moves focus to the next
> focusable element.

---
%%>*/

class CredentialPwd extends HTMLElement {
  static _styleId = 'credential-pwd-default-style';
  static _style = [
    'credential-pwd {',
    '  display: block;',
    '  width: 100%;',
    '  padding: 10px 12px;',
    '  border: 1px solid var(--border, #e5e7eb);',
    '  border-radius: 6px;',
    '  font-family: var(--font, sans-serif);',
    '  font-size: 14px;',
    '  color: var(--text, #111827);',
    '  background: #fff;',
    '  transition: border-color 0.15s, box-shadow 0.15s;',
    '  margin-bottom: 12px;',
    '  cursor: text;',
    '  min-height: 38px;',
    '}',
    'credential-pwd:focus {',
    '  outline: none;',
    '  border-color: var(--primary, #4f46e5);',
    '  box-shadow: 0 0 0 3px var(--primary-light, #e0e7ff);',
    '}',
    'credential-pwd.field-invalid {',
    '  border-color: var(--red, #dc2626);',
    '  box-shadow: 0 0 0 3px rgba(220, 38, 38, 0.2);',
    '}',
  ].join('\n');

  connectedCallback() {
    if (this._initialized) return;
    this._initialized = true;
    if (!document.getElementById(CredentialPwd._styleId)) {
      const s = document.createElement('style');
      s.id = CredentialPwd._styleId;
      s.textContent = CredentialPwd._style;
      document.head.appendChild(s);
    }
    this._value = '';
    this.pasted = false;
    this.tabIndex = 0;
    // attributeChangedCallback fires before init for parsed attributes —
    // apply an initial readonly here
    if (this.hasAttribute('readonly')) {
      this.tabIndex = -1;
      this.style.pointerEvents = 'none';
    }

    this._input = document.createElement('input');
    this._input.type = 'password';
    this._input.name = this.getAttribute('name') || '';
    this._input.tabIndex = -1;
    this._input.autocomplete = 'new-password';
    if (this.hasAttribute('required')) this._input.required = true;
    Object.assign(this._input.style, {
      position: 'absolute', opacity: '0', width: '0', height: '0', pointerEvents: 'none'
    });

    this._display = document.createElement('span');
    this._display.setAttribute('aria-hidden', 'true');

    this.appendChild(this._input);
    this.appendChild(this._display);

    // Show placeholder dots if has-value (existing password)
    this._hasValue = this.hasAttribute('has-value');
    if (this._hasValue) {
      this._display.textContent = '\u25CF\u25CF\u25CF\u25CF\u25CF\u25CF';
    }

    this._input.addEventListener('invalid', (e) => {
      e.preventDefault();
      this.classList.add('field-invalid');
    });

    this.addEventListener('focus', () => {
      // Only the first focus on a has-value instance wipes the bullet
      // placeholder — refocusing must not discard what the user typed
      if (this._hasValue) {
        this._hasValue = false;
        this._clear();
      }
    });
    this.addEventListener('keydown', (e) => this._onKeyDown(e));
    this.addEventListener('paste', (e) => this._onPaste(e));
  }

  static get observedAttributes() { return ['name', 'required', 'readonly']; }

  attributeChangedCallback(attr, _, val) {
    if (!this._input) return;
    if (attr === 'name') this._input.name = val;
    if (attr === 'required') this._input.required = val !== null;
    if (attr === 'readonly') {
      if (val !== null) {
        this.tabIndex = -1;
        this.style.pointerEvents = 'none';
      } else {
        this.tabIndex = 0;
        this.style.pointerEvents = '';
      }
    }
  }

  _clear() {
    this._value = '';
    this._input.value = '';
    this._render();
  }

  _onPaste(e) {
    const text = e.clipboardData.getData('text');
    if (!text) return;
    this._value = text;
    this._input.value = this._value;
    this.pasted = true;
    this.classList.remove('field-invalid');
    this._render();
    e.preventDefault();
  }

  _onKeyDown(e) {
    if (e.key === 'Tab') return;
    if (e.key === 'Backspace') {
      if (this.pasted) { this.pasted = false; this._value = ''; }
      this._value = this._value.slice(0, -1);
    } else if (e.key === 'Enter') {
      // Priority: explicit enter-btn-id → enclosing form submit →
      // advance focus. Covers dialogs where the action button lives
      // outside the form.
      const btnId = this.getAttribute('enter-btn-id');
      if (btnId) {
        const btn = document.getElementById(btnId);
        if (btn) {
          e.preventDefault();
          // closure-btn handles clicks on its inner shadow anchor (which
          // enforces disabled/readonly); plain elements take a host click
          const anchor = btn.shadowRoot && btn.shadowRoot.querySelector('a');
          if (anchor) anchor.click();
          else btn.click();
          return;
        }
      }
      const form = this.closest('form');
      if (form) {
        e.preventDefault();
        if (form.requestSubmit) form.requestSubmit();
        else form.submit();
      } else {
        this._focusNext();
      }
      return;
    } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      if (this.pasted) { this.pasted = false; this._value = ''; }
      this._value += e.key;
    } else {
      return;
    }
    this._input.value = this._value;
    this.classList.remove('field-invalid');
    this._render();
    e.preventDefault();
  }

  _focusNext() {
    var focusables = Array.from(document.querySelectorAll(
      'input, select, textarea, button, a[href], [tabindex]'
    )).filter(function(el) {
      return el.tabIndex >= 0 && !el.disabled && el.offsetParent !== null;
    });
    var idx = focusables.indexOf(this);
    if (idx >= 0 && idx + 1 < focusables.length) focusables[idx + 1].focus();
  }

  // ---
  get value() { return this._value; }

  // ---
  set value(val) {
    this._value = val || '';
    this._input.value = this._value;
    this.pasted = false;
    this.classList.remove('field-invalid');
    this._render();
  }

  _render() {
    this._display.textContent = '\u25CF'.repeat(this._value.length);
  }
}

customElements.define('credential-pwd', CredentialPwd);
