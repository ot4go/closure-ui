/*<%% note:
# `<status-part>`

Flexible cell inside `<closure-status-bar>`. Useful for arbitrary content
that doesn't fit `<status-msg>`, `<status-kv>` or `<status-buttons>`.
Inherits the bar's height and exposes layout presets.

## Attributes

| Attribute | Description |
|---|---|
| `flex="N"`             | flex grow factor (inline style) |
| `padding="x"`          | inline padding override |
| `wr="min,max"`         | width range (see [Helpers / `applyWidthRange`](#helpers)) |
| `border`               | right-border separator |
| `center`               | center the contents horizontally |
| `right`                | right-align the contents |
| `layout="stack"`       | column flex (label above value, etc.) |
| `layout="grid"`        | 2-column grid (e.g. label / value pairs) |
| `layout="flow"`        | wrap children; orphan-stretch via `stretch-priority` |
| `layout="text"`        | block layout, scrollable, for free prose |

Inside `layout="flow"`, any child with `stretch-priority="N"` may grow
to fill the trailing gap on the last row (lower N = stretches first).

## Example

```html
<status-part layout="grid">
  <small>Started</small><strong>09:00</strong>
  <small>Ended</small><strong>17:00</strong>
</status-part>

<status-part layout="flow">
  <span>tag-1</span>
  <span>tag-2</span>
  <span stretch-priority="0">filler tag</span>
</status-part>
```

## Behaviour

> **Note:** `layout="flow"` installs a `ResizeObserver`. On every resize
> it measures the children, identifies orphans on the last row (rows with
> fewer items than the row above) and stretches the orphan with the
> lowest `stretch-priority` to consume the trailing space. Items without
> the attribute are never stretched.

> **Note:** `wr` resolves through the shared `applyWidthRange()` helper
> in `closure_helper_functions.js` — same semantics as in `<status-kv>`
> and `<status-buttons>`.

---
%%>*/

class StatusPart extends HTMLElement {
  static _styleId = 'status-part-style';
  static _style = [
    'status-part {',
    '  flex: 1;',
    '  display: flex;',
    '  align-items: center;',
    '  padding: 0 12px;',
    '  overflow: hidden;',
    '  align-self: stretch;',
    '}',
    'status-part[border] { border-right: 2px solid var(--border, #d1d5db); }',
    'status-part[center] { justify-content: center; }',
    'status-part[right] { justify-content: flex-end; }',
    // layout="stack"
    'status-part[layout="stack"] { flex-direction: column; justify-content: center; gap: 2px; }',
    // layout="grid"
    'status-part[layout="grid"] { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; align-content: center; }',
    // layout="flow"
    'status-part[layout="flow"] { flex-wrap: wrap; gap: 4px; align-content: center; }',
    'status-part[layout="flow"] > * { flex: 0 1 auto; }',
    // layout="text"
    'status-part[layout="text"] { display: block; padding: 6px 12px; align-self: stretch; overflow: auto; }',
  ].join('\n');

  connectedCallback() {
    if (this._initialized) {
      // Reconnect: resume observing instead of stacking a new observer
      if (this._flowObserver) this._flowObserver.observe(this);
      return;
    }
    this._initialized = true;
    if (!document.getElementById(StatusPart._styleId)) {
      var s = document.createElement('style');
      s.id = StatusPart._styleId;
      s.textContent = StatusPart._style;
      document.head.appendChild(s);
    }

    var flex = this.getAttribute('flex');
    if (flex) this.style.flex = flex;

    var padding = this.getAttribute('padding');
    if (padding) this.style.padding = padding;

    applyWidthRange(this);

    // Flow layout: handle orphan stretching
    if (this.getAttribute('layout') === 'flow') {
      this._setupFlowObserver();
    }
  }

  disconnectedCallback() {
    if (this._flowObserver) this._flowObserver.disconnect();
  }

  // ---
  _setupFlowObserver() {
    var self = this;
    // Debounce into the next frame: never write layout (style.flex) inside
    // the ResizeObserver callback. Doing so synchronously is what triggers
    // the "ResizeObserver loop completed with undelivered notifications"
    // warning and can feed the observer back on fractional-DPI / zoomed
    // displays. One reflow per frame, max.
    var schedule = function() {
      if (self._reflowScheduled) return;
      self._reflowScheduled = true;
      requestAnimationFrame(function() {
        self._reflowScheduled = false;
        if (self.isConnected) self._reflowOrphans();
      });
    };
    // Observe resize
    if (window.ResizeObserver) {
      this._flowObserver = new ResizeObserver(schedule);
      this._flowObserver.observe(this);
    }
    // Initial reflow after render
    schedule();
  }

  // ---
  _reflowOrphans() {
    var children = Array.from(this.children);
    if (!children.length) return;

    // Reset all widths
    children.forEach(function(c) { c.style.flex = ''; });

    // Find orphans (items on the last row that don't fill it)
    var containerWidth = this.clientWidth;
    if (containerWidth <= 0) return;

    var rows = [];
    var currentRow = [];
    var rowTop = null;

    children.forEach(function(c) {
      var rect = c.getBoundingClientRect();
      if (rowTop === null || Math.abs(rect.top - rowTop) > 2) {
        if (currentRow.length) rows.push(currentRow);
        currentRow = [c];
        rowTop = rect.top;
      } else {
        currentRow.push(c);
      }
    });
    if (currentRow.length) rows.push(currentRow);

    // If last row has fewer items than the row above, stretch those with stretch-priority
    if (rows.length < 2) return;
    var lastRow = rows[rows.length - 1];
    var prevRow = rows[rows.length - 2];
    if (lastRow.length >= prevRow.length) return;

    // Find stretchable orphans (those with stretch-priority)
    var stretchable = lastRow.filter(function(c) { return c.hasAttribute('stretch-priority'); });
    if (!stretchable.length) return;

    // Sort by priority (lower = stretch first)
    stretchable.sort(function(a, b) {
      return (parseInt(a.getAttribute('stretch-priority'), 10) || 999)
           - (parseInt(b.getAttribute('stretch-priority'), 10) || 999);
    });

    // Stretch: distribute remaining space
    stretchable.forEach(function(c) { c.style.flex = '1'; });
  }
}

customElements.define('status-part', StatusPart);
