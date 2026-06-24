/*<%% note:
# `<closure-status-bar>`

Horizontal status bar that slots its children into a flex layout. Acts
as a colour preset host: each `type` value paints both the background
and border, and re-themes inner button defaults via `--form-btn-bg`.
The slotted children are typically `<label>`, `<status-msg>`,
`<status-part>`, `<status-kv>` and `<status-buttons>`.

Use it as a single themed strip to surface the **state of a workflow** — a result
message, a few key/value facts, and the actions that follow — kept visually
together via a `type` colour preset. It is purely presentational: it lays out and
themes whatever you slot into it (`<status-msg>`, `<status-kv>`, `<status-part>`,
`<status-buttons>`) but holds no state of its own; the content is driven from
outside, usually a closure response.

## Attributes

| Attribute | Description |
|---|---|
| `type="primary"` | indigo |
| `type="info"`    | sky-blue |
| `type="success"` | green |
| `type="warning"` | amber |
| `type="danger"`  | red |
| `type="gray"`    | medium grey |
| `type="white"`   | white background |
| `type="default"` | (no attr) light grey |

## Children

Composable from these elements (each its own custom element):

| Tag | Role |
|---|---|
| `<label>`         | bold leading title cell (right-bordered) |
| `<status-msg>`    | flexible message slot with light styling |
| `<status-part>`   | flexible cell with `flex` / `padding` / `wr` / `layout` controls |
| `<status-kv>`     | uppercase-key + value pair |
| `<status-buttons>`| auto-laying button group |

## Example

```html
<closure-status-bar type="success">
  <label>Payroll</label>
  <status-msg>Posted 142 payslips</status-msg>
  <status-kv key="run">2026-05-02 17:21</status-kv>
  <status-buttons>
    <closure-btn ct-role="undo" class="small">Undo</closure-btn>
    <closure-btn ct-role="export" class="small">Export</closure-btn>
  </status-buttons>
</closure-status-bar>
```

## CSS Variables

Consumed (host-level):

| Variable | Default |
|---|---|
| `--text`   | `#111827` |
| `--border` | `#d1d5db` |

Re-themed automatically by `type=...` attributes (background, border,
`--form-btn-bg`).

## Behaviour

> **Note:** the host uses `display: flex` with `align-items: stretch`,
> so each child fills the bar's full height. `<status-buttons>` and
> `<status-part>` propagate this height to their grandchildren via
> `--form-btn-height: 100%`.

> **Note:** styling for direct slotted `<label>` and `<status-msg>`
> children is injected once into the document head (id
> `closure-status-bar-label-style`) so it can target light-DOM elements
> outside the shadow root.

---
%%>*/

class ClosureStatusBar extends HTMLElement {
  static _styleId = 'closure-status-bar-label-style';
  static _labelStyle = [
    'closure-status-bar > label {',
    '  flex: 1;',
    '  font-weight: 600;',
    '  font-size: 15px;',
    '  letter-spacing: 0.01em;',
    '  color: var(--text, #111827);',
    '  overflow: hidden;',
    '  text-overflow: ellipsis;',
    '  white-space: nowrap;',
    '  padding: 0 16px;',
    '  border-right: 2px solid var(--border, #d1d5db);',
    '  align-self: stretch;',
    '  display: flex;',
    '  align-items: center;',
    '}',
    'closure-status-bar > label[center] { justify-content: center; text-align: center; }',
    'closure-status-bar > label[right]  { justify-content: flex-end; text-align: right; }',
    'closure-status-bar > status-msg {',
    '  flex: 1;',
    '  font-size: 14px;',
    '  color: var(--text, #111827);',
    '  padding: 8px 16px;',
    '  border-right: 2px solid var(--border, #d1d5db);',
    '  align-self: stretch;',
    '  display: flex;',
    '  align-items: center;',
    '}',
    'closure-status-bar > status-msg ul, closure-status-bar > status-msg ol { padding-left: 1.4em; margin: 2px 0; }',
    'closure-status-bar > status-msg li { margin: 2px 0; }',
    'closure-status-bar > status-msg p  { margin: 2px 0; }',
  ].join('\n');

  static _style = [
    ':host {',
    '  display: flex;',
    '  align-items: stretch;',
    '  margin-bottom: 12px;',
    '  background: #f3f4f6;',
    '  border: 1px solid #d1d5db;',
    '  border-radius: 6px;',
    '  overflow: hidden;',
    '  min-height: 40px;',
    '  --form-btn-bg: #e5e7eb;',
    '  --form-btn-color: var(--text, #111827);',
    '  --form-btn-radius: 0;',
    '  --form-btn-padding: 0 16px;',
    '  --form-btn-shadow: none;',
    '  --form-btn-shadow-hover: none;',
    '  --form-btn-min-height: 0;',
    '  --form-btn-font-size: 14px;',
    '  --form-btn-direction: row;',
    '  --form-btn-icon-size: 1.2em;',
    '  --form-btn-host-display: flex;',
    '  --form-btn-height: 100%;',
    '  --form-btn-width: auto;',
    '}',
    ':host([type="primary"]) { background: #e0e7ff; border-color: #4f46e5; --form-btn-bg: #c7d2fe; }',
    ':host([type="info"])    { background: #e0f2fe; border-color: #0284c7; --form-btn-bg: #bae6fd; }',
    ':host([type="success"]) { background: #dcfce7; border-color: #16a34a; --form-btn-bg: #bbf7d0; }',
    ':host([type="warning"]) { background: #fef9c3; border-color: #ca8a04; --form-btn-bg: #fde68a; }',
    ':host([type="danger"])  { background: #fee2e2; border-color: #dc2626; --form-btn-bg: #fecaca; }',
    ':host([type="gray"])    { background: #f3f4f6; border-color: #6b7280; --form-btn-bg: #e5e7eb; }',
    ':host([type="white"])   { background: #ffffff; border-color: #e5e7eb; --form-btn-bg: #f3f4f6; }',
    ':host([type="default"]) { background: #f3f4f6; border-color: #d1d5db; --form-btn-bg: #e5e7eb; }',
  ].join('\n');

  connectedCallback() {
    if (!document.getElementById(ClosureStatusBar._styleId)) {
      var s = document.createElement('style');
      s.id = ClosureStatusBar._styleId;
      s.textContent = ClosureStatusBar._labelStyle;
      document.head.appendChild(s);
    }
    // attachShadow throws on a second connect (DOM re-parenting)
    if (!this.shadowRoot) this.attachShadow({ mode: 'open' });
    this._render();
  }

  static get observedAttributes() { return ['type']; }

  attributeChangedCallback() {
    if (this.shadowRoot) this._render();
  }

  // ---
  _render() {
    const style = document.createElement('style');
    style.textContent = ClosureStatusBar._style;
    const slot = document.createElement('slot');
    this.shadowRoot.innerHTML = '';
    this.shadowRoot.appendChild(style);
    this.shadowRoot.appendChild(slot);
  }
}

customElements.define('closure-status-bar', ClosureStatusBar);
