# `closure-data-grid` — `updateRow(key, data)` by key (cross-page) — proposal

> Internal planning note. Status: **exploration / planning only** — nothing here
> is committed. It scopes the "C" tier of the grid single-row refresh work:
> updating **any** row by its identity, even when it is not the selected row and
> not on the current page.
>
> Source reviewed: `closure-ui/src/closure_data_grid.js` (the `_rows` model,
> `_createRow`, `<grid-key>`, `_isDynamic`, pagination, `refresh`/`updateRow`).

---

## 1. What already exists

Two tiers of refresh ship today (the "A" and "B" of the edit-in-dialog flow):

| Tier | API | Scope |
|---|---|---|
| **A** | `refresh` event → `refresh(opts)` | reloads the whole grid (re-fetch), `opts.goto` scrolls back |
| **B** | `refresh-row` event → `updateRow(data)` | re-renders the **selected / visible** row in place from `data`, no reload |

`updateRow(data)` (B) works on `this._selectedIdx`: it merges `data` onto the
selected row, replaces that one `<tr>` via `_createRow`, and keeps scroll /
selection. It is the efficient path for "the user edited the row they had
open".

## 2. The gap

B only touches the **selected, visible** row. Real apps need to update a row
that is **not** selected and possibly **on another page**:

- A websocket / SSE push: "row 4021 changed" — the user may be on page 3.
- A background job result that updates an arbitrary record.
- A bulk action that the server reports row-by-row.

For those you currently have only **A** (full reload), which throws away scroll,
selection and is a server round-trip.

The goal: `updateRow(key, data)` — find the row by its **identity**, update its
backing data, and re-render its `<tr>` **iff it is currently visible** (else just
update the data so it renders correctly when navigated to).

## 3. Row identity — the prerequisite

The grid already declares per-row identity with `<grid-key>` (one or more
column `name`s):

```html
<grid-key>username</grid-key>          <!-- single-field key -->
<grid-key>tenant_id,user_id</grid-key> <!-- composite key -->
```

**Caveat to resolve first:** the current `this._keys` parsing in the source is
the **keyboard-binding** interpretation (`<grid-key key="Delete" action="…">`),
not the row-identity one. A clean `_rowKey(row)` helper is needed:

```js
// composite identity string for a row, from the <grid-key> field name(s)
_rowKey(row) {
  return this._identityFields.map(f => String(row[f] ?? '')).join('');
}
```

…and the caller's `key` is matched against it (a single value for a single-field
key, or the composite form for multi-field keys).

## 4. The hard limitation — dynamic vs inline data

This is the crux and must be stated up front:

| Grid mode | `_rows` holds | Off-page row available client-side? |
|---|---|---|
| **Inline** (`<g-row>` / static) | **all** rows | ✅ yes |
| **Dynamic** (`<query-definition>` fetch) | **only the current page** | ❌ no |

So:

- **Inline grids:** `updateRow(key, data)` is fully meaningful — find the row in
  the complete `_allRows`, update it, re-render if on the visible page.
- **Dynamic grids:** an off-page row's data **is not in the browser**. You
  cannot update what you don't have. The honest options for dynamic + off-page:
  1. **No-op** (update only if the row happens to be on the current page).
  2. Fall back to `refresh()` (re-fetch — back to tier A).
  3. A **targeted re-fetch** of just that row (needs a per-row endpoint) — a
     separate, larger feature.

**Recommendation:** scope `updateRow(key, data)` to **update where the data
lives** — full support for inline grids and for dynamic rows **on the current
page**; for dynamic off-page rows, no-op and `log()` that it was skipped (so it
never silently pretends to have updated). Document the limitation loudly.

## 5. Proposed API

Overload the existing method and the event:

```js
// (existing) update the selected row
grid.updateRow(data);

// (new) update a specific row by its <grid-key> identity
grid.updateRow(key, data);
```

Detection: if called with two args (or the first is a string/number), treat it
as `(key, data)`; one object arg keeps the current selected-row behaviour.

Declarative trigger (extends the existing `refresh-row` event):

```html
<!-- server push: update row 4021 wherever it is -->
<response-item type="dispatch-event" event="refresh-row" target-id="usersGrid"
               data-key="4021"
               data-row='{"id":4021,"status":"approved"}'></response-item>
```

- `data-key` present → key-based `updateRow(key, row)`.
- `data-key` absent → selected-row `updateRow(row)` (today's behaviour).

## 6. Implementation sketch (inline + current-page dynamic)

```js
updateRow(keyOrData, maybeData) {
  // resolve (key, data) vs (data-for-selected)
  let key = null, data;
  if (maybeData !== undefined || typeof keyOrData !== 'object') { key = keyOrData; data = maybeData; }
  else { data = keyOrData; }

  // locate the absolute index in the backing store
  let absIdx;
  if (key == null) absIdx = this._selectedAbsIdx();          // tier B path
  else absIdx = this._rows.findIndex(r => this._rowKey(r) === this._normalizeKey(key));
  if (absIdx < 0 || !data) return;                           // not in client data → no-op

  const merged = { ...this._rows[absIdx], ...data };
  this._rows[absIdx] = merged;

  // re-render only if that absolute index maps to a visible page-relative <tr>
  const i = this._pageRelativeIndex(absIdx);
  if (i >= 0) {
    const oldTr = this._tbody.querySelectorAll('tr')[i];
    if (oldTr) {
      const tr = this._createRow(merged, i);
      tr.addEventListener('click', () => this._selectRow(i));
      if (oldTr.classList.contains('focused')) tr.classList.add('focused');
      oldTr.replaceWith(tr);
      this._syncColWidths();
    }
  }
}
```

New helpers needed: `_rowKey(row)`, `_normalizeKey(key)`, `_pageRelativeIndex(absIdx)`,
`_selectedAbsIdx()`. All small and self-contained.

## 7. Edge cases

- **Composite keys** (`<grid-key>a,b</grid-key>`): the caller passes a matching
  composite (e.g. `data-key="tenantAu42"` or a structured form to define).
- **Duplicate keys** (mis-declared identity): update the first match; optionally
  warn.
- **Sorting / paging shifts**: re-render uses the live page-relative index at
  call time, so it is correct regardless of current page.
- **Selection unaffected**: updating a non-selected row must not move selection;
  only its `<tr>` content changes.
- **Dynamic off-page**: no-op + `log` (per §4) — never a silent false success.

## 8. Phasing

1. Land `_rowKey(row)` / identity resolution (also useful for `goto`).
2. `updateRow(key, data)` for **inline** grids + **current-page dynamic** rows.
3. (Later, separate) targeted per-row re-fetch for dynamic off-page rows — needs
   a server endpoint contract.

## 9. Open questions

- **Composite-key wire format** for the `data-key` attribute (separator vs JSON).
- Should an off-page dynamic update **auto-fall back to `refresh()`**, or stay a
  no-op? (Auto-refresh is convenient but turns a "cheap" call into a round-trip.)
- Should `updateRow` optionally **re-emit `row-select`** when it updates the
  selected row, so a bound `<closure-row-viewer>` refreshes? (Today it does not,
  to avoid master/detail side effects — could be an opt-in flag.)
