---
mkskill:
  pos: 40
  in: readme
---

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

