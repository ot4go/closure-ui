/*<%% note:
# Helpers

Functions shared by closure-ui components. Loaded first in `_source.list`
so they are available before any component that calls them.

## `applyWidthRange(el)`

Reads the `wr="min,max"` attribute on `el` and applies it as inline
`min-width` / `max-width`. Used by `<status-part>`, `<status-buttons>` and
`<status-kv>` to expose a uniform width-range hint without each component
duplicating the parser.

| `wr` value | Effect |
|---|---|
| absent / empty                  | nothing |
| `*,*` / `-,-` (natural)         | `flex: 0 0 auto` (use intrinsic size) |
| `100px,300px`                   | both `min-width` and `max-width` |
| `100px,*` or `100px,-`          | only `min-width` |
| `*,300px` or `-,300px`          | only `max-width` |

`*` and `-` are interchangeable as "unset / unbounded" sentinels.

---
%%>*/

function applyWidthRange(el) {
  var wr = el.getAttribute('wr');
  if (!wr) return;
  var parts = wr.split(',');
  var min = (parts[0] || '').trim();
  var max = (parts[1] || '').trim();
  var isNatural = (min === '-' || min === '*' || min === '') && (max === '-' || max === '*' || max === '');
  if (isNatural) {
    el.style.flex = '0 0 auto';
  } else {
    if (min && min !== '-' && min !== '*') el.style.minWidth = min;
    if (max && max !== '-' && max !== '*') el.style.maxWidth = max;
  }
}
