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

## Shared design tokens

The theming premise is **CSS can be used, never needed**: every component
ships complete defaults and consumes these shared tokens with the *same*
canonical fallback everywhere, so with zero page CSS the library looks
homogeneous — and declaring the tokens once (on `:root`, a wrapper, or an
element) re-themes everything in one stroke. See `examples/theming.html`.

| Token | Canonical default | Role |
|---|---|---|
| `--primary`       | `#4f46e5`    | accent: primary buttons, focus rings, selection |
| `--primary-light` | `#e0e7ff`    | soft accent: focus glow, hover washes |
| `--border`        | `#e5e7eb`    | every border and separator |
| `--bg`            | `#f9fafb`    | chrome surfaces: headers, footers, nav panels |
| `--text`          | `#111827`    | primary text |
| `--text-muted`    | `#6b7280`    | secondary text, labels, icons at rest |
| `--red`           | `#dc2626`    | errors, destructive actions, required marks |
| `--green`         | `#16a34a`    | success, active/live indicators |
| `--warning`       | `#d97706`    | warnings |
| `--font`          | `sans-serif` | UI text |
| `--font-mono`     | `monospace`  | tabular/timestamp text |
| `--radius`        | `8px`        | corner rounding of container components |

On top of the shared tokens, each component exposes its own prefixed hooks
(`--dash-*`, `--dg-*`, `--tab-*`, `--form-btn-*`, `--cfr-*`, `--summary-*`,
`--ska-*`, `--fh-*`, `--btn-item-*`, `--lazy-iframe-*`) — documented in its
own *CSS Variables* table. Component hooks with a semantic twin default
**through** the shared token (e.g. `--dg-border` → `var(--border)`,
`--ska-warn-color` → `var(--red)`), so the global palette wins unless the
component hook is set explicitly.

## `closureFreeSubmit(el, url, defaultMethod, opts?)`

The one encapsulated hidden-form submit of the library: builds a hidden
form targeting `url`, fills its fields, submits it — a full navigation to
the response — and removes the form node so it can't orphan in `<body>`
on a download / new-tab action.

Callers: `<closure-btn free url>` (default **POST** — an action button),
`<closure-btn-item url>` (POST, payload via its parent-merging
`getBtnData()`), `<dash-nav-item free url>` (default **GET** —
navigation), `<session-keep-alive>` (logoff POST and server-instructed
redirects), `<closure-data-grid>` (query-definition navigation and row
`navigate` actions) and `<closure-lazy-iframe post>` (form submitted
**into** the named frame via `opts.target`).

Method resolution, in precedence order (attribute steps need `el`):

1. boolean quick attributes on `el`: `post`, then `get`
2. `method="get|post"` on `el`
3. the caller's `defaultMethod`

Fields, first match wins:

1. `opts.fields` — caller-computed payload, names used as-is
2. `el.getBtnData()` when present — the closure-btn contract, keeping
   the source's own payload semantics (e.g. parent-menu merge),
   `section_`-prefixed
3. `el`'s `data-*` attributes, `section_`-prefixed when `el` has `section`

Extras: `el` may be `null` (pure caller-driven submit);
`opts.target` sets `form.target` (e.g. `_blank`); a GET submit is native
— the fields **replace** any query already on `url` — unless `preserve`
(the `opts.preserve` flag or a `preserve` attribute on `el`, mirroring
captured GET forms) folds the url's existing query params in as leading
fields so they survive. A GET with **no fields at all** (and no
`opts.target`) skips the form entirely and navigates plainly — no bare
`?` is appended to the url.

---
%%>*/

function closureFreeSubmit(el, url, defaultMethod, opts) {
  opts = opts || {};
  var method = defaultMethod || 'post';
  if (el) {
    method = el.hasAttribute('post') ? 'post'
      : el.hasAttribute('get') ? 'get'
      : (el.getAttribute('method') || method);
  }
  var isGet = String(method).toLowerCase() === 'get';
  var form = document.createElement('form');
  form.method = isGet ? 'GET' : 'POST';
  if (url) form.action = url;
  if (opts.target) form.target = opts.target;
  form.style.display = 'none';

  var addField = function(name, value) {
    var hidden = document.createElement('input');
    hidden.type = 'hidden';
    hidden.name = name;
    hidden.value = value;
    form.appendChild(hidden);
  };

  // `preserve`: a native GET submit REPLACES the url's query string — fold
  // the existing query params in as leading fields so they survive (same
  // semantics as the `preserve` opt-in on captured GET forms)
  if (isGet && (opts.preserve || (el && el.hasAttribute('preserve')))) {
    var qi = (url || '').indexOf('?');
    if (qi >= 0) {
      new URLSearchParams(url.slice(qi + 1)).forEach(function(v, k) { addField(k, v); });
    }
  }

  if (opts.fields) {
    // Caller-computed payload (grid query params, server-sent payloads…):
    // names are final, no section prefixing
    for (var k in opts.fields) addField(k, opts.fields[k]);
  } else if (el && typeof el.getBtnData === 'function') {
    // Sources with the closure-btn contract keep their own payload
    // semantics — e.g. <closure-btn-item> merges the parent menu's data-*
    var sections = el.getBtnData().sections;
    for (var section in sections) {
      var fields = sections[section];
      for (var name in fields) {
        addField(section ? section + '_' + name : name, fields[name]);
      }
    }
  } else if (el) {
    // Plain elements: one field per data-* attribute, `section`-prefixed
    var sec = el.getAttribute('section') || '';
    Array.prototype.forEach.call(el.attributes, function(attr) {
      if (attr.name.indexOf('data-') !== 0) return;
      addField(sec ? sec + '_' + attr.name.slice(5) : attr.name.slice(5), attr.value);
    });
  }

  // GET with no fields at all: don't build a form — a fieldless GET submit
  // would append a bare "?" to the url. Plain navigation instead.
  if (isGet && !form.children.length && !opts.target) {
    window.location.href = url;
    return;
  }

  document.body.appendChild(form);
  form.submit();
  form.remove(); // drop the node post-submit so it can't orphan
                 // in <body> on a download / new-tab action
}

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
