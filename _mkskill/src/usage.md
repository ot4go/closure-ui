---
mkskill:
  pos: 30
  in: "*"
---

## Usage

Include the bundled script in your page:

```html
<script src="release/closure-ui.min.js"></script>
```

Or take it from npm (`npm i closure-ui` — also pnpm/yarn/bun) or straight
from a CDN — pin the exact version you tested:

```html
<script src="https://cdn.jsdelivr.net/npm/closure-ui@0/closure-ui.min.js"></script>
```

Then use any of the elements:

```html
<btn-grid cols="2">
  <closure-btn ct-role="save">Save</closure-btn>
  <closure-btn ct-role="cancel">Cancel</closure-btn>
</btn-grid>

<clock-display small dot></clock-display>
```

Full per-component documentation (attributes, events, CSS variables,
examples) is generated into [`release/closure-ui.md`](release/closure-ui.md).

