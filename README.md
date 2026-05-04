# closure-ui

[![Build](https://github.com/ot4go/closure-ui/actions/workflows/build.yml/badge.svg)](https://github.com/ot4go/closure-ui/actions/workflows/build.yml)
[![Release](https://img.shields.io/github/v/release/ot4go/closure-ui)](https://github.com/ot4go/closure-ui/releases/latest)
[![License](https://img.shields.io/badge/License-MIT-blue)](LICENSE)

Seamless JS UI for application interfaces — a collection of vanilla Web
Components (no framework, no build step on the consumer side) for forms,
data grids, status bars, tabs, lightboxes and more.

Drop a single `<script>` tag and start using custom elements like
`<closure-data-grid>`, `<closure-form-row>` or `<closure-btn>` directly in
your HTML.

## Contents

- [Usage](#usage)
- [Components](#components)
- [Build](#build)
- [Repository layout](#repository-layout)
- [License](#license)

## Usage

Include the bundled script in your page:

```html
<script src="release/closure-ui.min.js"></script>
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

## Components

| Element | Purpose |
|---|---|
| `<btn-grid>` | grid layout for action buttons |
| `<clock-display>` | live wall-clock synced to the server's timezone |
| `<credential-pwd>` | password field with paste/typing handling |
| `<data-map>` / `<map-item>` | declarative key/value map |
| `<target-closure>` | wires a button to a remote endpoint |
| `<closure-template>` | reusable HTML template fragment |
| `<closure-btn>` / `<closure-btn-item>` | action buttons |
| `<closure-lightbox>` | modal lightbox |
| `<closure-status-bar>` + `<status-msg>` / `<status-part>` / `<status-buttons>` / `<status-kv>` | status bar with composable parts |
| `<closure-filter-bar>` | filter input row for data grids |
| `<closure-data-grid>` (+ children) / `<closure-row-viewer>` | data grid and row detail viewer |
| `<closure-checkbox-tree>` / `<cbt-item>` / `<closure-checkbox-group>` | checkbox tree and groups |
| `<closure-tab-bar>` / `<closure-tab>` | tabs |
| `<closure-summary>` | collapsible summary panel |
| `<closure-form-row>` / `<closure-form-field>` | form layout primitives |
| `<closure-data-source>` | shared data source for grids and forms |
| `<fingerprint-hands>` | fingerprint UI affordance |
| `<session-keep-alive>` | keeps a session alive in the background |
| `ClosureResponse` | global object for handling responses from `<target-closure>` |

Plus a small set of shared helpers (e.g. `applyWidthRange`, clock-time
utilities) loaded before the components.

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

## Repository layout

```
src/                 component sources (one .js per element)
src/_source.list     bundle order
src/_doc.list        documentation order
src/generated/       intermediate output from miniskin
.build/              Go program that drives the build
.github/workflows/   CI workflows (build on push, release on tag)
release/             build outputs (JS bundle, minified, docs)
```

## License

MIT — see [LICENSE](LICENSE).
