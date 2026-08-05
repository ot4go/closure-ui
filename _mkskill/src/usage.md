---
mkskill:
  pos: 30
  in: "*"
---

## Install

Two ways to get the bundle:

- **GitHub release** — download `closure-ui.min.js` (or the readable
  `closure-ui.js`) from the
  [latest release](https://github.com/pablo-botella/closure-ui/releases/latest);
  every release also carries version-stamped twins and `checksums.txt`.
- **npm** — `npm i closure-ui` (also pnpm/yarn/bun).

## Usage

Include the bundled script in your page:

```html
<script src="release/closure-ui.min.js"></script>
```

Or straight from a CDN — pin the exact version you tested:

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

