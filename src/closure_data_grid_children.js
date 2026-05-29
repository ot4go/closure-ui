/*<%% note:
# `<closure-data-grid>` children

Markup-only elements consumed by `<closure-data-grid>`. Every one
renders `display: none` and exists purely to carry attributes the grid
reads on initialise. Defined together because they share the same
trivial implementation and are always loaded as a set.

## Tags

| Tag | Purpose |
|---|---|
| `<grid-col>`         | column descriptor: `name`, `label`, `width`, `align`, `fill`, `type`, `map-data-id` |
| `<grid-key>`         | per-row identity (text content is one or more `name`s, comma-separated) |
| `<grid-layout>`      | layout overrides: `page-size`, scroll mode, `auto-page-size` |
| `<g-row>`            | one row of inline data (contains `<g-col>` cells) |
| `<g-col>`            | one cell inside `<g-row>`; `name="…"` matches a `<grid-col>` |
| `<query-definition>` | dynamic-mode endpoint: `url`, default headers / params |
| `<query-param>`      | maps an external value (filter, etc.) into a query parameter |
| `<on-no-results>`    | markup rendered when the grid has no rows |
| `<on-fetch-error>`   | markup rendered on dynamic-mode fetch failure |
| `<filter-preset>`    | predefined filter set the grid can apply via UI |

## Example

```html
<closure-data-grid>
  <!-- columns -->
  <grid-col name="username" label="User"></grid-col>
  <grid-col name="role"     label="Role" map-data-id="role-map"></grid-col>

  <!-- inline rows -->
  <g-row><g-col name="username">jdoe</g-col><g-col name="role">admin</g-col></g-row>
  <g-row><g-col name="username">asmith</g-col><g-col name="role">viewer</g-col></g-row>

  <!-- empty / error states -->
  <on-no-results><p>No rows.</p></on-no-results>
  <on-fetch-error><p>Could not load.</p></on-fetch-error>
</closure-data-grid>
```

## `<grid-col>` sizing attributes

| Attribute | Purpose |
|---|---|
| `width="N"` | fixed width in pixels |
| `width="12ch"` / `width="20%"` | CSS length passed through |
| `align="left\|center\|right"` | explicit text alignment |
| `fill` | in an `auto-fit` grid, this column absorbs remaining width |

`fill` belongs on `<grid-col>`, not on `<g-col>`.

## Behaviour

> **Note:** the `customElements.define` calls are guarded — re-loading
> the bundle multiple times in the same document does not throw. Useful
> for hot-reloaded mockup pages.

> **Note:** none of these elements have any logic of their own. The
> grid reads their attributes synchronously on initialise; mutating
> them later does **not** trigger a re-read — call
> `<closure-data-grid>`'s `refresh()` to re-evaluate.

---
%%>*/

['grid-col', 'g-row', 'g-col', 'grid-key', 'query-definition', 'query-param',
 'on-no-results', 'on-fetch-error', 'grid-layout', 'filter-preset'].forEach(tag => {
  if (!customElements.get(tag)) {
    customElements.define(tag, class extends HTMLElement {
      connectedCallback() { this.style.display = 'none'; }
    });
  }
});
