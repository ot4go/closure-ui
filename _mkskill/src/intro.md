---
mkskill:
  pos: 10
  in: "*"
---

# closure-ui

[![Build](https://github.com/pablo-botella/closure-ui/actions/workflows/build.yml/badge.svg)](https://github.com/pablo-botella/closure-ui/actions/workflows/build.yml)
[![Release](https://img.shields.io/github/v/release/pablo-botella/closure-ui)](https://github.com/pablo-botella/closure-ui/releases/latest)
[![License](https://img.shields.io/badge/License-MIT-blue)](LICENSE)

Seamless JS UI for application interfaces — a collection of vanilla Web
Components (no framework, no build step on the consumer side) for forms,
data grids, status bars, tabs, lightboxes and more.

Drop a single `<script>` tag and start using custom elements like
`<closure-data-grid>`, `<closure-form-row>` or `<closure-btn>` directly in
your HTML.

Everything is **opt-in**. The custom inputs are form-associated and submit
natively inside a plain `<form>`, and the display components (grids, tabs,
status bars, lightbox, clock…) need no extra wiring. The server-driven
"closure" workflow (`<target-closure>` / `<closure-template>`) and form
grouping are a **feature, not a requirement** — reach for them when you
want posting without a full reload, response directives or dirty-state
tracking. They shine with rich components like `<closure-data-grid>`
(dynamic fetch, row/footer action buttons, master-detail), but you can use
most of the library without ever touching them.

