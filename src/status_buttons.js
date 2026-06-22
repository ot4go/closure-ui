/*<%% note:
# `<status-buttons>`

Auto-laying button group inside `<closure-status-bar>`. Picks the column
count that minimises empty cells, optionally stretches one button to
fill the trailing gap, and paints separator borders between cells.

## Attributes

| Attribute | Description |
|---|---|
| `flex="N"`           | flex grow factor (inline style) |
| `gap="x"`            | gap between buttons; bare numbers become px (default `2px`) |
| `wr="min,max"`       | width range (see [Helpers / `applyWidthRange`](#helpers)) |

## Children

Any button-like elements. Each child can opt in to stretching with:

| Attribute on child | Description |
|---|---|
| `stretch-priority="N"` | candidate for absorbing the trailing gap; lower N wins |

## Example

```html
<status-buttons gap="4">
  <closure-btn ct-role="approve" class="primary small">Approve</closure-btn>
  <closure-btn ct-role="reject"  class="red small">Reject</closure-btn>
  <closure-btn ct-role="defer"   class="small" stretch-priority="0">Defer</closure-btn>
</status-buttons>
```

## CSS Variables

| Variable | Default | Description |
|---|---|---|
| `--gap`     | `2px` | gap between buttons (mirrored from `gap` attribute) |
| `--border`  | `#d1d5db` | colour of the inter-cell separators |

## Behaviour

> **Note:** the layout runs in two modes. **Mode 1**: all buttons fit
> in one row at their natural width — only adds left-border separators.
> **Mode 2**: too wide — picks the column count with the fewest empty
> cells (preferring more columns on ties), then stretches the
> highest-priority candidate to fill them. If no child has
> `stretch-priority`, the last button stretches by default.

> **Note:** stretching may also fail if the candidate's row can't
> accommodate the extra cells without pushing siblings to a new row;
> in that case the algorithm falls back to a non-stretching layout.

> **Note:** the reflow is throttled by `_lastW` — repeat
> `ResizeObserver` callbacks at the same width are no-ops.

---
%%>*/

class StatusButtons extends HTMLElement {
  static _styleId = 'status-buttons-style';
  static _style = [
    'status-buttons {',
    '  display: flex;',
    '  flex-wrap: wrap;',
    '  flex: 0 1 auto;',
    '  align-self: stretch;',
    '  gap: var(--gap, 2px);',
    '  box-sizing: border-box;', /* Solo afecta a cómo se mide el ancho, no dibuja nada */
    '}',
  ].join('\n');

  connectedCallback() {
    if (this._initialized) {
      // Reconnect: resume observing instead of stacking a new observer
      if (this._resizeObserver) this._resizeObserver.observe(this);
      return;
    }
    this._initialized = true;
    if (!document.getElementById(StatusButtons._styleId)) {
      var s = document.createElement('style');
      s.id = StatusButtons._styleId;
      s.textContent = StatusButtons._style;
      document.head.appendChild(s);
    }
    var flex = this.getAttribute('flex');
    if (flex) this.style.flex = flex;

    var gap = this.getAttribute('gap');
    if (gap) this.style.setProperty('--gap', isNaN(gap) ? gap : gap + 'px');


    applyWidthRange(this);

    var self = this;
    this._reflowing = false;
    this._lastW = 0;
    requestAnimationFrame(function() { self._reflow(); });
    if (window.ResizeObserver) {
      this._resizeObserver = new ResizeObserver(function() {
        var w = self.clientWidth;
        if (w === self._lastW || self._reflowing) return;
        self._reflow();
      });
      this._resizeObserver.observe(this);
    }
  }

  disconnectedCallback() {
    if (this._resizeObserver) this._resizeObserver.disconnect();
  }

  // ---
  _reflow() {
    this._reflowing = true;
    var children = Array.from(this.children);
    if (!children.length) { this._reflowing = false; return; }
    var n = children.length;
    var borderColor = '1px solid var(--border, #d1d5db)';

    // Reset all styles
    children.forEach(function(c) {
      c.style.width = '';
      c.style.height = '';
      c.style.flex = '';
      c.style.borderLeft = '';
      c.style.borderBottom = '';
      c.style.boxSizing = 'border-box';
    });

    // Measure total natural width of all buttons
    var totalW = 0;
    var maxBtnW = 0;
    children.forEach(function(c) {
      var w = c.offsetWidth;
      totalW += w;
      if (w > maxBtnW) maxBtnW = w;
    });
    if (maxBtnW <= 0) maxBtnW = 40;

    var containerW = this.clientWidth;
    this._lastW = containerW;
    if (containerW <= 0) { this._reflowing = false; return; }

    // MODE 1: All fit in one row — natural sizes, just borders
    if (totalW <= containerW) {
      children.forEach(function(c, i) {
        c.style.borderLeft = (i === 0) ? 'none' : borderColor;
      });
      this._reflowing = false;
      return;
    }

    // MODE 2: Need grid
    // Calculate best columns: fit in available width, minimize huecos
    var maxCols = Math.max(1, Math.floor(containerW / maxBtnW));
    if (maxCols > n) maxCols = n;

    // Find cols with least huecos; on tie prefer more cols
    var cols = 1;
    var bestHuecos = n; // worst case: 1 col, 0 huecos but check anyway
    for (var tryC = 1; tryC <= maxCols; tryC++) {
      var tryRows = Math.ceil(n / tryC);
      var tryH = (tryC * tryRows) - n;
      if (tryH < bestHuecos || (tryH === bestHuecos && tryC > cols)) {
        bestHuecos = tryH;
        cols = tryC;
      }
    }
    var rows = Math.ceil(n / cols);
    var huecos = (cols * rows) - n;

    // Find stretch candidate by priority
    var stretchIdx = -1;
    if (huecos > 0) {
      stretchIdx = n - 1; // default: last button
      var bestPriority = Infinity;
      for (var i = 0; i < n; i++) {
        if (!children[i].hasAttribute('stretch-priority')) continue;
        var p = parseInt(children[i].getAttribute('stretch-priority'), 10);
        if (isNaN(p)) p = 999; // `|| 999` would turn priority 0 into 999
        if (p >= bestPriority) continue;
        // Check: can this button stretch without creating extra rows?
        // It stretches by taking `huecos` extra cells in its row.
        // Items after it shift down. New total rows must not increase.
        var rowOfBtn = Math.floor(i / cols);
        var posInRow = i % cols;
        var itemsAfter = n - i - 1;
        var colsUsedByBtnRow = posInRow + 1 + huecos; // btn takes extra
        if (colsUsedByBtnRow > cols) continue; // can't fit stretch in this row
        var remainingCells = (cols * rows) - (i + 1 + huecos); // cells left after stretched btn
        if (itemsAfter > remainingCells) continue; // would need extra row
        bestPriority = p;
        stretchIdx = i;
      }
    }

    // Build layout with stretch
    var layout = [];
    var colSpans = {}; // index -> colspan
    if (stretchIdx >= 0 && huecos > 0) {
      colSpans[stretchIdx] = 1 + huecos;
    }

    var col = 0;
    var currentRow = [];
    for (var i = 0; i < n; i++) {
      var span = colSpans[i] || 1;
      if (col + span > cols && currentRow.length > 0) {
        layout.push(currentRow);
        currentRow = [];
        col = 0;
      }
      currentRow.push({ el: children[i], span: span });
      col += span;
      if (col >= cols) {
        layout.push(currentRow);
        currentRow = [];
        col = 0;
      }
    }
    if (currentRow.length) layout.push(currentRow);

    // Apply grid widths and borders
    var colW = 100 / cols;
    for (var r = 0; r < layout.length; r++) {
      var row = layout[r];
      var isLastRow = (r === layout.length - 1);
      var colPos = 0;

      for (var c = 0; c < row.length; c++) {
        var item = row[c];
        var btn = item.el;
        var isFirstCol = (colPos === 0);

        btn.style.width = (colW * item.span) + '%';
        btn.style.borderLeft = isFirstCol ? 'none' : borderColor;
        btn.style.borderBottom = isLastRow ? 'none' : borderColor;
        btn.style.setProperty('--form-btn-width', '100%');
        btn.style.setProperty('--form-btn-height', '100%');

        colPos += item.span;
      }
    }
    this._reflowing = false;
  }

}

customElements.define('status-buttons', StatusButtons);
