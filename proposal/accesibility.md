# closure-ui — Accessibility Audit & Remediation Plan

**Status:** proposal / for cross-review
**Goal:** make closure-ui-built public pages able to score 100 on the
Lighthouse *Accessibility* category, without regressing the components that
already work.
**Audience of this doc:** a reviewer (Gemini) asked to challenge the findings,
catch false positives/negatives, and pressure-test the plan.

---

## 0. How to read this report

Lighthouse's *Accessibility* score is produced by **axe-core** running a fixed
set of **automated** rules. A huge amount of "good accessibility" (the full
WAI-ARIA Authoring Practices patterns) is **not** automatically tested by axe.

So every finding below is tagged by the only question that moves the score:

> **Does axe-core automatically fail this?**

- **Tier 1 — axe auto-failure.** Genuinely lowers the Lighthouse score. Must fix
  for a 100.
- **Tier 2 — genuine a11y, cheap, low-risk.** Not auto-scored, but small and
  safe; recommended.
- **Tier 3 — WAI-ARIA APG patterns.** Real screen-reader value, **not**
  auto-scored, and a large amount of behavioural code over components that
  already work. High regression risk. Opt-in only.

**Reviewer, please challenge the Tier assignments specifically** — i.e. tell us
if something in Tier 3 is actually an axe auto-failure (Tier 1), or if a Tier 1
item is in fact a false positive.

### Important framing caveat (please verify)
Two things commonly mistaken for failures that axe **passes**:
- A control wrapped in a `<label>` (implicit association) — **valid**, no
  `for`/`id` needed.
- A `<button>` whose accessible name comes from a `title` attribute — axe
  `button-name` accepts `title`, so title-only icon buttons **pass**.

A second, subtler trap drives the whole Tier 3 risk analysis:
**incomplete ARIA scores *worse* than clean simple markup.** `role="tab"`
without a `tablist` parent, `role="treeitem"` without a `tree`, or
`role="menuitem"` without a `menu` each trip `aria-required-parent` /
`aria-required-children` — *new* axe failures. The current plain markup passes;
a half-finished Tier 3 can drop the score below where it is today.

---

## 1. Methodology

Four parallel read-only audits over the 33 component sources in `src/`,
grouped by category (overlays, buttons/nav, grid/data, form controls), each
checking a fixed ARIA/keyboard/focus checklist. Every reported finding was then
**re-verified against the actual source** before being accepted here. The
verified findings are below; the noise (WAI-ARIA best-practice that axe does not
test, plus a few false positives) was filtered out into Tier 3 or dropped.

---

## 2. Tier 1 — Real axe auto-failures (must fix for 100)

### 2.1 Form fields have no associated label  — **CONFIRMED, highest impact**

**Components:** `closure-form-field`, `closure-form-row`
**Source:** `closure_form_row.js` `_build()` (~lines 175–201).

The row builds the field label as a **`<span class="cfr-label">`** and moves the
user's input markup into a `.cfr-body` wrapper:

```js
var labelEl = document.createElement('span');     // <-- span, not <label>
labelEl.className = 'cfr-label';
labelEl.textContent = labelText;
...
var body = document.createElement('div');
body.className = 'cfr-body';
while (field.firstChild) body.appendChild(field.firstChild);
field.appendChild(labelEl);
field.appendChild(body);
```

Rendered result for the documented usage:

```html
<closure-form-field label="Email">
  <span class="cfr-label">Email</span>
  <div class="cfr-body"><input type="email" name="email"></div>
</closure-form-field>
```

The `<input>` has a `name` but **no `id`**, and the label is a `<span>`, not a
`<label>` — no implicit wrapping either. Result: the control has **no accessible
name** → axe rule **`label`** ("Form elements do not have associated labels")
**fails**. This affects essentially every form built with the library.

**Proposed fix:** in `closure_form_row.js`, create the label as a real
`<label>` (keeping the `cfr-label` class so all CSS still applies — selectors
are class-based), then after moving children into `.cfr-body`, locate the first
labelable control and wire them:

- For native `<input>` / `<select>` / `<textarea>`: ensure it has an `id`
  (generate a unique one if missing), set `labelEl.htmlFor = control.id`.
- See 2.2 for `credential-pwd` and 2.3 for the checkbox tree/group, which are
  not natively labelable.

**Risk:** low. `<label>` as a flex-column child blockifies like the `<span>`
did; clicking it now focuses the field (a bonus). No CSS change needed.

**Open question for reviewer:** any field type where injecting an `id` could
collide with author-supplied ids or break server-side form handling? (We key
server fields off `name`, not `id`, so we believe not — please confirm.)

### 2.2 `credential-pwd` inner input has no accessible name — **CONFIRMED**

**Source:** `credential_password.js` (~lines 144–158).

`credential-pwd` is **not** a form-associated custom element (no
`ElementInternals`, no `static formAssociated`). It wraps a real
`<input type="password">` that is visually hidden (`position:absolute;
opacity:0; width:0; height:0; tabIndex=-1`) while the host (`tabIndex=0`)
handles keystrokes and renders bullet glyphs.

Because the inner input is `opacity:0` (not `display:none` / not
`aria-hidden`), it is still in the accessibility tree, so axe's `label` rule
applies to it — and it has no label.

**Constraint:** a `<label for="...">` only associates with *labelable* elements.
A custom element is not labelable, so `for` pointed at the `credential-pwd`
host will **not** work; we must name the inner input directly.

**Proposed fix options (please advise which you prefer):**
- **(A)** Give the row's `<label>` an `id` and have `closure-form-row` set
  `aria-labelledby="<labelId>"` on the credential-pwd's inner `<input>`.
  Timing: the row builds on `DOMContentLoaded`/`rAF`, by which point
  credential-pwd has initialised and `_input` exists — but the ordering is not
  guaranteed; the row may need to fall back to setting it on first paint.
- **(B)** `credential-pwd` grows an optional `label="..."` attribute that it
  mirrors onto the inner input as `aria-label`, keeping it self-sufficient for
  standalone use (outside `closure-form-row`).

We lean toward **(A) inside the row + (B) for standalone**, but want a second
opinion on the timing fragility of (A).

**Note on standalone:** if an author wraps the whole component in a `<label>`
(`<label>Password <credential-pwd></credential-pwd></label>`), the wrapping
label associates with the first labelable *descendant* — which is the inner
`<input type="password">`. That already satisfies axe. Worth documenting.

### 2.3 Tab-bar toggle checkbox nested inside the tab button — **VERIFY**

**Source:** `closure_tab_bar.js` `_syncButtons()` (~lines 220–249).

When a `<closure-tab>` uses `toggle="enable|disable"`, the bar builds the tab
button as a `<button class="ctb-btn">` and appends an
`<input type="checkbox">` **inside** that button:

```js
var btn = document.createElement('button');
...
if (toggle) {
  var chk = document.createElement('input');
  chk.type = 'checkbox';
  ...
  btn.appendChild(chk);   // interactive control inside an interactive control
}
```

An interactive control nested inside another interactive control is flagged by
axe rule **`nested-interactive`**. We believe this is a **Tier 1 auto-failure
whenever `toggle` is used** (independent of the tabs ARIA pattern).

**Reviewer: please confirm** axe's `nested-interactive` fires here, and whether
it fires only when the checkbox is present (toggle mode) or always.

**Proposed fix (design-level, not just attributes):** move the toggle checkbox
**out** of the `<button>` — render it as a sibling control adjacent to the tab
button, with its own `aria-label`. This also unblocks any future Tier 3 tabs
pattern (a `role="tab"` must not contain focusables).

### 2.4 Color contrast — **NEEDS MEASUREMENT, do not guess**

axe rule **`color-contrast`** is automated and a common score-killer. We did
**not** compute ratios statically (unreliable). Suspect spots in the default
token CSS:

- `--text-muted: #6b7280` on white ≈ 4.5–4.8:1 — borderline AA for normal text.
- Readonly form state `--cfr-ro-label: #999` on `--cfr-ro-bg: #f8f8f8`
  ≈ ~2.8:1 — **likely fails** AA, but it is a disabled/readonly presentation
  (axe may exempt disabled controls — verify).
- Tab inactive text `--text-muted` on `--tab-bg: #f5f5f5`.

**Action:** run a real Lighthouse/axe pass on a representative example page and
fix only the tokens it actually flags. Contrast is the one Tier 1 item we
**cannot** resolve by reading source.

---

## 3. Tier 2 — Genuine a11y, cheap, low-risk (recommended)

### 3.1 `closure-lightbox`
**Source:** `closure_lightbox.js` (dialog built ~lines 143–177; close ~268–275).

Already correct: native `<dialog>.showModal()` (built-in focus trap + Tab
cycling), `Esc` via the `cancel` event, real `<button>` close control.

Cheap improvements (not axe auto-failures — the `×` button already has the
accessible name "×", which technically passes `button-name`):

- Set `aria-label="Close"` on the `×` button (clearer than the glyph).
- Give the title an `id` and set `aria-labelledby` on the `<dialog>` so the
  dialog announces its purpose.
- **Return focus to the opener on `close()`** — store the trigger on open,
  restore on close. Genuine keyboard-UX win; native `<dialog>` does not do this
  for programmatically-opened dialogs.

**Risk:** minimal, isolated to one component.

---

## 4. Tier 3 — WAI-ARIA APG patterns (opt-in; NOT needed for Lighthouse 100)

These deliver real screen-reader quality but are **not** axe auto-scored, are
large behavioural changes over working components, and carry the
"incomplete-ARIA-scores-worse" risk. Documented here so they can be done
deliberately, one component at a time, later.

| Component | Work required | Specific danger |
|---|---|---|
| **closure-tab-bar** | `role=tablist/tab/tabpanel`, `aria-selected`, roving tabindex + arrow keys, generated ids for `aria-controls`/`aria-labelledby` | The `toggle` checkbox lives **inside** the tab button (see 2.3). A `role="tab"` must not contain focusables — fixing tabs **requires** the 2.3 redesign first, not just attributes. `_syncButtons()` rebuilds `innerHTML` on every change, wiping any roving-tabindex state — must be re-applied in that path. |
| **closure-checkbox-tree** | `role=tree/treeitem/group`, `aria-expanded`, `aria-checked`, arrow/Home/End/Space keyboard | Today the checkboxes are native `<input>` wrapped in `<label>` → **already pass axe**. Layering `role=treeitem`+`aria-checked` over a native checkbox creates **double semantics** (state announced twice) and risks scoring **worse** than the clean current markup. Large keyboard surface. |
| **closure-data-grid (action menu)** | `role=menu/menuitem`, `Esc`, focus-into-menu on open, roving | The grid **already binds arrow keys for row navigation** (~lines 1989–2006). A menu also wants arrows → **keyboard conflict**; the open menu must capture arrows and release them on close. Re-entrancy with the existing Popover API focus handling. |
| **closure-data-grid (headers / pagination)** | `aria-sort` on sortable headers (make them focusable buttons); `aria-current="page"` on the active page | **Low risk.** `aria-current` is trivial and safe; focusable sort headers need a small style/markup change. The one Tier 3 slice worth doing opportunistically. |
| **closure-btn (dropdown menu)** | `role=menu/menuitem` on the panel/items | Arrow-key nav already exists. Items are `closure-btn-item` custom elements; mis-applied `role=menuitem` → `aria-required-children`. Medium risk. |

Cross-cutting Tier 3 hazards:
1. **DOM rebuilds wipe ARIA/tabindex** — every state-change path must re-apply.
2. **ID generation** for `aria-controls`/`labelledby` needs a collision-proof
   counter across multiple instances.
3. **No automated test suite** — regressions are caught by eye, on the most-used
   components.
4. **Bundle grows** — mildly counter to the PageSpeed/Performance goal.

---

## 5. `ct-role` vs the ARIA `role` attribute — no conflict (clarification)

A naming question came up: does closure-ui misuse the `role` attribute? **No.**

- **`ct-role`** is closure-template's own routing attribute (which
  `<closure-template>` matches which button). Always `ct-`-prefixed; read via
  `getAttribute('ct-role')`. It is **never** written as the bare `role`.
- The **only** place the bare ARIA `role` is touched is *reading* it:
  `credential_password.js:278` does
  `this.closest('dialog, [role="dialog"], closure-lightbox, form')` — correct
  standard usage (find a dialog container).
- `name="role"` seen in grid/filter examples is **application data** (a "Role"
  column: admin/viewer), unrelated to ARIA.

Conclusion: the `role` namespace is **free** — adding ARIA `role="tab"` etc. in
Tier 3 will not collide with `ct-role`. Naming is *not* one of the Tier 3 risks.

---

## 6. Recommendation & open questions

**Recommended scope:** Tier 1 + Tier 2 (+ the safe slice of Tier 3:
`aria-current` / `aria-sort`). This reaches a Lighthouse Accessibility 100 with
minimal risk to working components; the rest of Tier 3 stays a proposal.

**Questions for the reviewer:**
1. Is **2.3 (nested-interactive in the tab toggle)** a confirmed axe
   auto-failure? Tier 1 or Tier 3?
2. For **2.2 (credential-pwd)**, is option (A) `aria-labelledby` from the row,
   (B) self-mirrored `aria-label`, or both, the right call — and is the build
   timing of (A) a real problem?
3. Any Tier 3 item that is actually axe-auto-scored and we mis-tiered?
4. Any Tier 1 item that is actually a false positive (axe already passes it)?
5. Contrast: anything obviously below 4.5:1 in the default tokens worth fixing
   pre-emptively, or strictly wait for a measured run?
