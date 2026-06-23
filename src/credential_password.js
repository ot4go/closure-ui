/*<%% note:
# `<credential-pwd>`

Masked password input with paste-friendly behaviour. Wraps a hidden
`<input type="password">` so the value participates in form submission,
while showing bullet glyphs (`●`) to the user. Designed to defeat
stored-credential autofill on shared admin screens.

It is meant to be a drop-in, **more secure `<input type="password">`**: it
works inside a plain native `<form>` — submission, validation and Enter all
behave as they would for a native password field, **with no dependency on
the closure system**. The closure-specific hooks (`enter-btn-id`) are
optional extras for dialogs, not requirements.

## Attributes

| Attribute | Description |
|---|---|
| `name="x"` | form-field name (mirrored on the inner `<input>`) |
| `required` | mirrors HTML `required` validation |
| `readonly` | disables interaction (`tabIndex=-1`, `pointer-events: none`) |
| `has-value` | preload bullet placeholder (an existing password is on file) |
| `clear-behavior="edit\|focus"` | when a `has-value` field wipes its placeholder — `edit` (soft, **default**) on the first keystroke / paste; `focus` (aggressive) the moment it gains focus |
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

> **Note:** a `has-value` instance shows a bullet placeholder for the
> existing (server-held) password; it never holds the plaintext, so the
> user always types the **whole** new password to change it. *When* the
> placeholder is wiped depends on `clear-behavior`:
> - **`edit` (default, soft):** the placeholder survives focus / tabbing and
>   is wiped on the **first keystroke or paste** — accidental focus never
>   blanks it.
> - **`focus` (aggressive):** the placeholder is wiped the moment the field
>   gains focus — for shared-screen admin panels where a stale value must
>   not linger.

> **Note:** on paste, the whole pasted string replaces the value and
> `pasted=true` is exposed. **Backspace then clears the entire pasted
> value** (no character-by-character editing). Type-after-paste also wipes
> the pasted content.

> **Note:** Enter mirrors a native `<input type="password">`. Priority:
> the `enter-btn-id` target if set (for dialogs / `<closure-btn>`s that sit
> outside the form — it clicks the element, routing a `<closure-btn>`
> through its `ct-role`); else the form's **implicit submission** — it
> clicks the default submit button (`[type="submit"]` or a typeless
> `<button>`) if present, else submits the form directly; else, with no
> enclosing form, it advances focus.
>
> A `<closure-btn>` action button (an `<a>`, not a `type=submit`) is **not**
> auto-discovered as the default — point `enter-btn-id` at it. Keeping the
> component free of closure-specific button discovery is intentional: it
> stays a drop-in native password field.

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
    // clear-behavior controls WHEN a has-value placeholder is wiped:
    // 'edit' (default, soft) on the first keystroke / paste; 'focus'
    // (aggressive) the moment the field gains focus.
    this._clearOnFocus = this.getAttribute('clear-behavior') === 'focus';

    this._input.addEventListener('invalid', (e) => {
      e.preventDefault();
      this.classList.add('field-invalid');
    });

    this.addEventListener('focus', () => {
      // Aggressive mode (clear-behavior="focus") only: wipe the existing-
      // password placeholder on focus. Soft mode (default) defers the wipe
      // to the first keystroke / paste (see _onKeyDown / _onPaste), so
      // accidental focus or tabbing through never blanks it.
      if (this._hasValue && this._clearOnFocus) {
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
    if (this._hasValue) this._hasValue = false; // first edit clears the placeholder state
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
      // Soft mode: first edit clears the has-value placeholder (no-op in
      // aggressive mode, where focus already cleared it).
      if (this._hasValue) { this._hasValue = false; this._value = ''; }
      if (this.pasted) { this.pasted = false; this._value = ''; }
      this._value = this._value.slice(0, -1);
    } else if (e.key === 'Enter') {
      // Priority: explicit enter-btn-id → the form's default action button
      // → plain form submit → advance focus. We CLICK the default button
      // rather than calling form.requestSubmit(): requestSubmit() carries no
      // submitter and is not equivalent to a real button click (and a
      // <closure-btn> is an <a>, not a type=submit) — that mismatch is why
      // Enter could "do nothing" on a form where clicking the button works.
      const btnId = this.getAttribute('enter-btn-id');
      if (btnId) {
        const btn = document.getElementById(btnId);
        if (btn) { e.preventDefault(); this._activate(btn); return; }
      }
      const form = this.closest('form');
      if (form) {
        e.preventDefault();
        // Behave like a native <input type=password>: Enter performs the
        // form's implicit submission — click the default submit button if
        // there is one, else submit the form directly. No closure coupling.
        const defBtn = form.querySelector(
          'button[type="submit"], input[type="submit"], button:not([type])'
        );
        if (defBtn) { defBtn.click(); return; }
        if (form.requestSubmit) form.requestSubmit();
        else form.submit();
      } else {
        this._focusNext();
      }
      return;
    } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      // Soft mode: first edit clears the has-value placeholder.
      if (this._hasValue) { this._hasValue = false; this._value = ''; }
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
    // Scope the walk to the nearest container (dialog / lightbox / form) so
    // Enter never jumps focus out of the current context (e.g. into another
    // open dialog). Falls back to the whole document when there is none.
    var scope = this.closest('dialog, [role="dialog"], closure-lightbox, form') || document;
    var focusables = Array.from(scope.querySelectorAll(
      'input, select, textarea, button, a[href], [tabindex]'
    )).filter(function(el) {
      return el.tabIndex >= 0 && !el.disabled && el.offsetParent !== null;
    });
    var idx = focusables.indexOf(this);
    if (idx >= 0 && idx + 1 < focusables.length) focusables[idx + 1].focus();
  }

  // Activate an `enter-btn-id` target: a <closure-btn> handles the click on
  // its inner shadow anchor (which enforces disabled/readonly); any plain
  // element takes a host-level click.
  _activate(btn) {
    const anchor = btn.shadowRoot && btn.shadowRoot.querySelector('a');
    if (anchor) anchor.click();
    else btn.click();
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
