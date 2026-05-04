/*<%% note:
# `<closure-summary>`

Read-only renderer fed by a "source" element through a tiny one-way
contract. The summary asks the source for its initial HTML at connect
time; the source pushes updates by calling `refresh(html)` on the
summary when its state changes.

## Pairing

The two elements reference each other by id:

```html
<!-- source must implement getSummaryHTML() -->
<closure-checkbox-group id="privs" summary="priv-summary">…</closure-checkbox-group>

<closure-summary id="priv-summary" source="privs"></closure-summary>
```

The source must:
- expose `getSummaryHTML()` returning an HTML string,
- on every internal change, look up the element pointed at by its
  `summary` attribute and call its `refresh(...)` with the new HTML.

## Attributes

| Attribute | Description |
|---|---|
| `source="id"` | id of the source element |

## Methods

| Method | Description |
|---|---|
| `refresh(html)` | replace the rendered summary |

## CSS Variables

Consumed (for the shadow-DOM list styling):

| Variable | Default |
|---|---|
| `--summary-font-size`     | `12px` |
| `--summary-color`         | `inherit` |
| `--summary-indent`        | `1.2em` |
| `--summary-list-style`    | `disc` |
| `--summary-li-margin`     | `2px 0` |
| `--summary-strong-weight` | `bold` |

## Behaviour

> **Note:** the summary uses Shadow DOM and re-applies its base style
> on every `refresh(...)` — keep `getSummaryHTML()` cheap; expensive
> work belongs upstream in the source.

> **Note:** if the source isn't yet in the DOM at connect time, the
> initial render is skipped silently. The next `refresh(...)` call
> from the source will catch up.

---
%%>*/

class ClosureSummary extends HTMLElement {
  static _style = [
    ':host { display: block; font-size: var(--summary-font-size, 12px); color: var(--summary-color, inherit); }',
    'ul { padding-left: var(--summary-indent, 1.2em); list-style: var(--summary-list-style, disc); margin: 0; }',
    'li { margin: var(--summary-li-margin, 2px 0); }',
    'strong { font-weight: var(--summary-strong-weight, bold); }',
  ].join('\n');

  // ---
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  // ---
  connectedCallback() {
    var self = this;
    var init = function() { self._pair(); };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
      requestAnimationFrame(init);
    }
  }

  _pair() {
    var srcId = this.getAttribute('source');
    if (!srcId) return;
    var src = document.getElementById(srcId);
    if (src && typeof src.getSummaryHTML === 'function') {
      this.refresh(src.getSummaryHTML());
    }
  }

  refresh(html) {
    this.shadowRoot.innerHTML = '<style>' + ClosureSummary._style + '</style>' + (html || '');
  }
}

customElements.define('closure-summary', ClosureSummary);
