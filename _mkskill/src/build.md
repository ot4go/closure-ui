---
mkskill:
  pos: 50
  in: readme
---

## Build

Source files live in [`src/`](src/) and are assembled into a single bundle
via [miniskin](https://github.com/ot4go/miniskin). The build also copies
the generated documentation and produces a non-aggressively minified
variant.

Requirements:
- Go 1.22+

Run:

```
go -C .build run .
```

Outputs:
- `release/closure-ui.js` — concatenated bundle
- `release/closure-ui.min.js` — minified (whitespace/comments stripped;
  variable names preserved) via
  [`tdewolff/minify`](https://github.com/tdewolff/minify)
- `release/closure-ui.md` — generated component documentation

