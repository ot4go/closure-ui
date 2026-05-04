/*<%% note:
# `<closure-form-field>`

A single labelled field inside a `<closure-form-row>`. Wraps its
content in a `.cfr-body` so the row can stack a label above
(or beside) it. Surfaces validation hints (`error`, `warning`,
`required`) and a hidden inline message that the parent row updates.

## Attributes

| Attribute | Description |
|---|---|
| `label="x"`         | label text (rendered in a `.cfr-label` span) |
| `labels="top\|side\|left\|right\|checkbox-left\|checkbox-right"` | per-field override of the row's label position |
| `flex="N"`          | flex grow factor (only when the row is **not** using `cols`) |
| `width="Npx"`       | fixed width (only when the row is **not** using `cols`) |
| `min="Npx"`         | minimum width |
| `max="Npx"`         | maximum width |
| `required`          | adds the trailing `*` indicator on the label |
| `error="x"`         | red border + the message in `.cfr-msg`; takes priority over `warning` |
| `warning="x"`       | amber border + the message in `.cfr-msg` |
| `hide-on-collapse`  | hide this field when the parent row is in collapsed mode |

The label, body wrapper and message span are created by the parent
`<closure-form-row>` on first build — see that component for the full
structural contract.

## Children

Whatever input markup belongs in the body — typically `<input>`,
`<select>`, `<textarea>`, `<credential-pwd>`, `<closure-checkbox-tree>`,
`<closure-checkbox-group>`, `<fingerprint-hands>`. Every direct
descendant gets moved into the `.cfr-body` wrapper at build time.

## Example

```html
<closure-form-row cols="*,2*">
  <closure-form-field label="Email" required>
    <input type="email" name="email">
  </closure-form-field>
  <closure-form-field label="Password" labels="top" warning="Must be at least 12 characters">
    <credential-pwd name="password" required></credential-pwd>
  </closure-form-field>
</closure-form-row>
```

## Behaviour

> **Note:** changing `error` / `warning` after build re-renders the
> message span only; `required` flips the label suffix on the fly. The
> field's children are **not** rebuilt — once moved into `.cfr-body`,
> they stay there.

> **Note:** `error` always wins over `warning` when both are present.
> Clearing both hides the message span (`display: none`).

> **Note:** `flex`, `width`, `min`, `max` are interpreted by the parent
> `<closure-form-row>`. With `cols` set on the row, only `min` / `max`
> have any effect.

---
%%>*/

class ClosureFormField extends HTMLElement {
  static get observedAttributes() { return ['label', 'required', 'warning', 'error']; }

  attributeChangedCallback() {
    if (this._labelEl) {
      this._labelEl.textContent = this.getAttribute('label') || '';
      if (this.hasAttribute('required')) {
        this._labelEl.classList.add('cfr-required');
      } else {
        this._labelEl.classList.remove('cfr-required');
      }
    }
    this._updateState();
  }

  _updateState() {
    var hasError = this.hasAttribute('error');
    var hasWarning = this.hasAttribute('warning');
    var errorMsg = this.getAttribute('error') || '';
    var warningMsg = this.getAttribute('warning') || '';

    // Update message element
    if (!this._msgEl && this._built) {
      this._msgEl = document.createElement('span');
      this._msgEl.className = 'cfr-msg';
      this.appendChild(this._msgEl);
    }
    if (this._msgEl) {
      if (hasError) {
        this._msgEl.textContent = errorMsg;
        this._msgEl.className = 'cfr-msg cfr-error-msg';
        this._msgEl.style.display = errorMsg ? 'block' : 'none';
      } else if (hasWarning) {
        this._msgEl.textContent = warningMsg;
        this._msgEl.className = 'cfr-msg cfr-warning-msg';
        this._msgEl.style.display = warningMsg ? 'block' : 'none';
      } else {
        this._msgEl.textContent = '';
        this._msgEl.style.display = 'none';
      }
    }
  }
}

customElements.define('closure-form-field', ClosureFormField);
