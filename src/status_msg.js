/*<%% note:
# `<status-msg>`

Message slot for `<closure-status-bar>`. Uses `display: contents` so it
contributes no box of its own — its children inherit the parent bar's
flex slot. Adds gentle shadow-DOM styling to slotted `<ul>`, `<ol>` and
`<p>` so multi-line messages stay readable inside the bar.

No attributes, no methods, no events.

## Example

```html
<closure-status-bar type="info">
  <label>Tip</label>
  <status-msg>
    <p>Press <kbd>Ctrl</kbd>+<kbd>S</kbd> to save.</p>
  </status-msg>
</closure-status-bar>
```

---
%%>*/

class StatusMsg extends HTMLElement {
  connectedCallback() {
    // attachShadow throws on a second connect (DOM re-parenting)
    if (this.shadowRoot) return;
    this.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = [
      ':host {',
      '  display: contents;',
      '}',
      '::slotted(ul), ::slotted(ol) { padding-left: 1.2em; margin: 4px 0; }',
      '::slotted(p) { margin: 2px 0; }',
    ].join('\n');
    const slot = document.createElement('slot');
    this.shadowRoot.appendChild(style);
    this.shadowRoot.appendChild(slot);
  }
}

customElements.define('status-msg', StatusMsg);
