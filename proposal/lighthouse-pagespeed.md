# closure-ui — Lighthouse / PageSpeed Insights Strategy (4×100)

**Status:** proposal / for cross-review
**Goal:** a public website built with closure-ui should be *able* to score
**100 / 100 / 100 / 100** on PageSpeed Insights (Performance, Accessibility,
Best Practices, SEO) — i.e. the library must not be the reason any category
drops, and should actively help where it can.
**Audience of this doc:** a reviewer (Gemini) asked to challenge the analysis.

> The Accessibility category has its own detailed report:
> [`accesibility.md`](./accesibility.md). This document is the umbrella and
> only summarises the A category.

---

## 0. Whose score is it anyway?

Lighthouse scores a **page**, not a library. Many audits are entirely in the
hands of the consuming site (image sizes, server response time, meta tags,
HTTPS). This doc separates:

- **Library-owned** — things closure-ui can win or lose on its own.
- **Page-owned** — the consuming site's responsibility; we only document the
  guidance.

The reviewer's job: flag anywhere we've claimed library-owned when it's really
page-owned, or vice versa.

---

## 1. The build pipeline (ground truth, often misunderstood)

There are **two distinct steps**, and only the second one minifies:

```
1. miniskin.MiniskinRun("./src", ".")     // .build/main.go
   → ASSEMBLES src/*.js (per _source.list) into:
       release/closure-ui.js      (readable, comments intact)
       doc/closure-ui.md          (extracted from the <%% note: %%> blocks)
       examples/closure-ui.js
   miniskin does NOT minify — it concatenates + extracts docs.

2. minifyJS("release/closure-ui.js", "release/closure-ui.min.js")
   → tdewolff/minify  with  js.Minifier{KeepVarNames: true}
   → THIS strips whitespace + comments → release/closure-ui.min.js
```

So: **miniskin = the "linker"; tdewolff = the actual minifier.**
`KeepVarNames: true` means "strip whitespace/comments but **do not rename**
variables" (and tdewolff never mangles object *properties* like `this._foo`
regardless).

### Measured sizes
| Artifact | Raw | gzip |
|---|---|---|
| `release/closure-ui.min.js` | 184,133 B | **43,142 B** |
| `release/closure-ui.js` (unmin) | 279,831 B | 62,526 B |

---

## 2. The minification question — settled

**Q: Could we be penalised for *insufficient* minification (i.e. for not
mangling names)?**
**A: No.**

Lighthouse's **"Minify JavaScript"** audit measures exactly one thing: bytes
recoverable by removing **whitespace and comments**. Our `.min.js` already has
zero comments and collapsed whitespace (verified: 0 `/* */`, 0 `//`, content is
one long line) → estimated savings ≈ 0 → **the audit passes**.

**Name/property mangling is *not* measured by that audit.** Keeping
`_tagSubscribers` instead of `a` triggers no penalty; Lighthouse neither knows
nor cares about identifier length.

### Why we deliberately do NOT enable aggressive mangling
- **Zero Lighthouse benefit** (above).
- **Marginal real benefit:** gzip already collapses repeated identifiers; the
  estimated extra win is a few KB *gzipped*.
- **Real cost:** property-mangling (`^_` mangle) is fragile against any
  reflection, string-keyed access, or public API surface
  (`getBtnData`, `onClosureTag*`, event `detail` keys) and would need a
  hand-maintained whitelist. Not worth it for a marginal, non-scoring gain.

**Conclusion: mangling is a red herring for the 4×100 goal. The current
tdewolff `KeepVarNames:true` build is correct.**

---

## 3. Performance (the one library-owned perf risk: bundle size)

### 3.1 The bundle is fine *if deferred*
43 KB gzipped of JS is not a Performance problem **when it does not block
render**. Guidance (page-owned, but we must document it):

```html
<script src="closure-ui.min.js" defer></script>   <!-- or type="module" -->
```

`defer` / `type=module` keep the script off the critical rendering path, so it
does not hurt **LCP / FCP / TBT**. The relevant audits ("Eliminate
render-blocking resources", "Reduce unused JavaScript", main-thread work) then
read the library as non-blocking.

### 3.2 "Reduce unused JavaScript" — the real (only) library perf diagnostic
The bundle is **monolithic**: all ~32 components ship even if a page uses three.
Lighthouse's **"Reduce unused JavaScript"** can list the unused portion. Notes:

- It is an **opportunity/diagnostic**, weighted modestly in the Performance
  score — not a hard fail, and small in absolute KB once gzipped + deferred.
- The fix is **tree-shaking / per-component builds**, *not* minification.
- **Proposed future work (separate proposal):** an optional per-component or
  "pick your tags" build so a landing page can ship only what it uses. Out of
  scope here; flagged so it isn't confused with the mangling question.

### 3.3 Architecture actually *helps* performance
closure-ui is server-driven and progressive-enhancement oriented
(`<target-closure>` / `<closure-template>` swap server HTML). The meaningful
content can be present in the initial HTML and enhanced afterwards, which is
favourable for **LCP** and for **SEO** (§6). The custom elements style
themselves via injected `<style>` + CSS variables (no consumer CSS), so there is
no separate render-blocking stylesheet the author must manage.

**Open question for reviewer:** does the per-component `<style>` injection on
first `connectedCallback` cause any layout-shift (**CLS**) risk we should
measure? Components inject their stylesheet into `<head>` at connect time.

### 3.4 Page-owned perf (document, don't own)
Images (sizing/format/lazy-load), font loading, server TTFB, caching headers,
third-party scripts. Out of the library's control.

---

## 4. Accessibility — see `accesibility.md`

Summary of that report: the only **axe auto-failure** the library introduces is
**form fields without an associated label** (`closure-form-field` /
`closure-form-row` build a `<span>` label with no `for`/`id`), plus the related
`credential-pwd` inner-input naming, a suspected **`nested-interactive`** in the
tab-bar toggle checkbox, and **color-contrast** (needs a measured run). Fixing
those reaches Accessibility 100. Full WAI-ARIA patterns (tabs/tree/menus) are
real but **not axe-scored** and higher-risk — deferred. Details, tiers, dangers
and open questions live in [`accesibility.md`](./accesibility.md).

---

## 5. Best Practices

Mostly page-owned (HTTPS, no mixed content, valid source maps, no deprecated
browser APIs), but two are library-relevant:

- **Clean console.** Lighthouse fails this category on console errors. The
  library's diagnostics are deliberately `console.warn` (not `error`) and only
  fire on genuine misconfiguration. **Action:** audit that no code path logs an
  `error` (or unhandled rejection) on the happy path.
- **No deprecated APIs / no `unload`.** The library uses `beforeunload`
  (session-keep-alive / dirty-form guard), which is acceptable; it must not use
  the deprecated `unload` event. **Action:** confirm.
- **Trusted Types / CSP compatibility.** Components inject `<style>` and set
  `innerHTML` from server responses (`ClosureResponse`). On a strict-CSP site
  this can surface. **Open question:** do we want a documented CSP recipe
  (style-src / a nonce hook) so a hardened site can still hit Best Practices
  100?

---

## 6. SEO

Almost entirely **page-owned** (title/meta description, crawlable links, valid
`hreflang`, `robots`, structured data). Library-relevant points:

- **Progressive enhancement helps.** Because content can be server-rendered HTML
  that closure-ui enhances (rather than client-rendered from scratch), the
  initial document is crawlable without executing JS — good for the
  "document has a meta description / crawlable content" audits.
- **Custom elements are SEO-neutral.** Unknown tags render their light-DOM
  children; text content inside `<closure-*>` elements is in the DOM and
  indexable. No Shadow-DOM content hiding for the text-bearing components
  (the few Shadow-DOM ones — e.g. `closure-summary` — render author-provided
  HTML, still in the DOM).
- **Action:** confirm no component sets `hidden` / `display:none` on
  meaningful content in a way that would hide indexable text at initial paint.

---

## 7. Recommendation & open questions

**Recommended path to 4×100:**
1. **Accessibility:** apply Tier 1 + Tier 2 from `accesibility.md`. (The only
   category where the library actively fails today.)
2. **Performance:** ship `defer`/`module` guidance; the deferred 43 KB gzip is
   fine. Treat per-component/tree-shaken builds as a *separate* future proposal,
   not a blocker.
3. **Best Practices / SEO:** mostly verification — clean console, no `unload`,
   document a CSP recipe; everything else is page-owned guidance.
4. **Do not** enable property mangling — no score benefit, real fragility.

**Questions for the reviewer:**
1. Is "Reduce unused JavaScript" weighted enough that a monolithic 43 KB
   (deferred) bundle realistically costs Performance points on a thin page, or
   is it negligible until the page is otherwise perfect?
2. Any Lighthouse audit we've mis-assigned (library-owned vs page-owned)?
3. CSP / Trusted Types: worth a first-class recipe for Best Practices 100, or
   leave to the consuming site?
4. CLS from first-connect `<style>` injection — real risk or non-issue in
   practice?
5. Anything in the four categories the library could *fail* that this document
   misses entirely?
