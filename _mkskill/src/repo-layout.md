---
mkskill:
  pos: 60
  in: readme
---

## Repository layout

```
src/                 component sources (one .js per element)
src/_source.list     bundle order
src/_doc.list        documentation order
src/generated/       intermediate output from miniskin
.build/              Go program that drives the build
.github/workflows/   CI workflows (build on push, release on tag)
release/             build outputs (JS bundle, minified, docs; not tracked)
doc/                 tracked copy of the generated documentation
examples/            self-contained demo pages (open directly in a browser);
                     examples/closure-ui.js is refreshed by each build
```

