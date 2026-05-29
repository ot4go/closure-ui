/*<%% note:
# `<closure-data-grid>`

Paginated data table that can take its rows from inline markup or from
a dynamic fetch. Renders a header, a scrollable body and pagination
controls. Selection and focus are tracked separately so consumers like
`<closure-row-viewer>` can react to either.

## Data sources

| Source | How |
|---|---|
| **Inline**  | `<g-row><g-col name="…">value</g-col></g-row>` children supply the rows |
| **Dynamic** | a `<query-definition url="…">` child (with optional `<query-param>` mappings) declares the request; refresh on demand |

## Children (configuration)

| Tag | Purpose |
|---|---|
| `<grid-col>`        | column definition (`name`, `label`, `width`, `align`, `fill`, `type`, `map-data-id`) |
| `<grid-key>`        | per-row identity (composed of one or more `name`s) |
| `<grid-layout>`     | overrides `page-size`, scrolling mode, etc. |
| `<query-definition>`| dynamic-mode endpoint and defaults |
| `<query-param>`     | maps an external value (filter, etc.) into a query parameter |
| `<on-no-results>`   | markup rendered when the result set is empty |
| `<on-fetch-error>`  | markup rendered on network / HTTP error |
| `<filter-preset>`   | apply a predefined filter set to the grid |

(See [child elements](#closure-data-grid-children) below for details.)

## Selection vs focus

| Action | Result | Event |
|---|---|---|
| Click / Tap | sets the **selected** row | `row-select` (detail: `{ row, index }`) |
| Arrow Up / Down | moves the **focused** row | `row-focus` (detail: `{ row, index }`) |
| Enter on focused | promotes focused → selected | `row-select` |

Selected and focused indexes can differ — useful for "previewing" with
the keyboard while the selection drives a side panel.

## Methods

| Method | Description |
|---|---|
| `refresh(opts)`        | reload data (`opts.goto = "<id>"` to scroll to a specific row after refresh) |
| `.selectedRow` (getter)| the currently selected row object, or `null` |

## Events

| Event | Bubbles | Detail |
|---|---|---|
| `row-select` | yes | `{ row, index }` |
| `row-focus`  | yes | `{ row, index }` |
| `filter-change` (handled, not fired) | — | accepted from a paired `<closure-filter-bar>` |

## Example

```html
<closure-data-grid id="users">
  <grid-col name="username" label="User" width="20%"></grid-col>
  <grid-col name="role"     label="Role" width="15%" map-data-id="role-map"></grid-col>
  <grid-col name="active"   label="Status" width="10%" type="bool"></grid-col>
  <grid-key>username</grid-key>

  <query-definition url="/admin/users.json"></query-definition>
  <on-no-results><p>No users.</p></on-no-results>
</closure-data-grid>

<closure-row-viewer target="users">…</closure-row-viewer>
```

## Column sizing

`<grid-col width="...">` accepts:

| Value | Meaning |
|---|---|
| `width="120"` | `120px` (backwards-compatible numeric shorthand) |
| `width="12ch"` | any CSS length is passed through |
| `width="20%"` | percentage width |

If `width` is set and `align` is omitted, the grid keeps the legacy
behaviour of centering that column. Use `align="left"`,
`align="center"`, or `align="right"` to opt into a specific alignment.

For content-sized columns, add `auto-fit` to the grid. In this mode,
columns without `fill` are measured from their header/body text and the
column marked with `fill` receives the remaining horizontal space.

```html
<closure-data-grid id="periods" page-size="all" auto-fit>
  <grid-col name="from" label="From"></grid-col>
  <grid-col name="to"   label="To"></grid-col>
  <grid-col name="wd"   label="WD" align="right"></grid-col>
  <grid-col name="note" label="" fill></grid-col>

  <g-row>
    <g-col name="from">May 11, 2026</g-col>
    <g-col name="to">May 24, 2026</g-col>
    <g-col name="wd">14</g-col>
    <g-col name="note">Ready</g-col>
  </g-row>
</closure-data-grid>
```

Only `<grid-col>` supports `fill`; putting `fill` on `<g-col>` has no
effect because sizing is calculated per column, not per cell.

## CSS Variables

| Variable | Default |
|---|---|
| `--dg-border` | `var(--border, #e5e7eb)` |
| `--dg-bg`     | `#fff` |
| `--radius`    | `8px` |
| `--primary`   | `#4f46e5` |

## Behaviour

> **Note:** dynamic mode merges the live filter values from any paired
> `<closure-filter-bar>` into the request. Filter changes auto-call
> `refresh()` (resetting to page 1).

> **Note:** with `auto-page-size`, the grid measures its body and
> picks a `pageSize` that fills the viewport without overflow on first
> render. Manual `<grid-layout page-size="N">` always wins.

> **Note:** `<filter-preset>` lets the markup expose one-click filter
> sets that the consumer can wire to buttons; the preset writes back
> through the filter bar so the chips visually update.

---
%%>*/

class ClosureDataGrid extends HTMLElement {
  static _styleId = 'closure-data-grid-default-style';
  static _style = [
    'closure-data-grid { display: block; outline: none; }',
    'closure-data-grid .dg-wrap { border: 1px solid var(--dg-border, var(--border, #e5e7eb)); border-radius: var(--radius, 8px); overflow: hidden; background: var(--dg-bg, #fff); display: flex; flex-direction: column; transition: border-color 0.15s; }',
    'closure-data-grid:focus .dg-wrap { border-color: var(--primary, #4f46e5); }',
    'closure-data-grid .dg-thead-wrap { overflow: hidden; flex-shrink: 0; border-bottom: 1px solid var(--dg-border, var(--border, #e5e7eb)); }',
    'closure-data-grid .dg-table-wrap { flex: 1; overflow-x: auto; overflow-y: auto; scrollbar-width: none; }',
    'closure-data-grid .dg-table-wrap::-webkit-scrollbar { display: none; }',
    'closure-data-grid .dg-table { width: 100%; border-collapse: collapse; font-size: var(--dg-font-size, 13px); font-family: var(--dg-font, var(--font, sans-serif)); table-layout: fixed; }',
    'closure-data-grid .dg-head-table { table-layout: auto; }',
    'closure-data-grid .dg-table th { text-align: left; padding: var(--dg-padding, 6px 12px); font-size: 12px; font-weight: 600; color: var(--dg-color-header, var(--text, #111827)); background: var(--dg-bg-header, #f0f0f0); white-space: nowrap; user-select: none; cursor: pointer; border-right: 1px solid var(--dg-border, var(--border, #e5e7eb)); }',
    'closure-data-grid .dg-table th:last-child { border-right: none; }',
    'closure-data-grid .dg-table th:hover { color: var(--primary, #4f46e5); }',
    'closure-data-grid .dg-table td { padding: var(--dg-padding, 6px 12px); border-bottom: 1px solid var(--dg-border, var(--border, #e5e7eb)); border-right: 1px solid var(--dg-border, var(--border, #e5e7eb)); color: var(--dg-color, var(--text, #111827)); vertical-align: middle; }',
    'closure-data-grid .dg-table td:last-child { border-right: none; }',
    'closure-data-grid .dg-table tr:last-child td { border-bottom: none; }',
    'closure-data-grid .dg-table tr { cursor: pointer; }',
    'closure-data-grid .dg-table tr:focus { outline: none; }',
    'closure-data-grid .dg-table tr.focused td { background: var(--dg-bg-selected, #dde4fb); }',
    'closure-data-grid .dg-table tr.focused td:first-child { border-left: var(--dg-bar-width, 3px) solid var(--dg-bar-color, var(--primary, #4f46e5)); padding-left: 9px; }',
    'closure-data-grid .dg-table tr:not(.focused) td:first-child { border-left: var(--dg-bar-width, 3px) solid transparent; padding-left: 9px; }',
    'closure-data-grid .dg-table thead th:first-child { padding-left: 9px; border-left: none; }',
    'closure-data-grid .dg-col-collapse { max-width: 80px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }',
    'closure-data-grid .dg-pagination { display: flex; align-items: center; gap: 6px; padding: 8px 12px; border-top: 1px solid var(--dg-border, var(--border, #e5e7eb)); background: var(--dg-bg-header, #f0f0f0); font-size: 12px; font-family: var(--dg-font, var(--font, sans-serif)); color: var(--text-muted, #6b7280); }',
    'closure-data-grid .dg-pagination-sep { flex: 1; }',
    'closure-data-grid .dg-page-btn { padding: 4px 10px; border: 1px solid var(--dg-border, var(--border, #e5e7eb)); border-radius: 4px; background: var(--dg-bg, #fff); cursor: pointer; font-size: 12px; font-family: var(--dg-font, var(--font, sans-serif)); color: var(--dg-color, var(--text, #111827)); }',
    'closure-data-grid .dg-page-btn:hover { background: var(--dg-bg-selected, #dde4fb); }',
    'closure-data-grid .dg-page-btn:disabled { opacity: 0.4; cursor: not-allowed; }',
    'closure-data-grid .dg-page-info { padding: 4px 10px; background: var(--primary, #4f46e5); color: #fff; border-radius: 4px; font-weight: 600; }',
    'closure-data-grid .dg-no-results { padding: 20px; text-align: center; color: var(--text-muted, #6b7280); }',
  ].join('\n');

  connectedCallback() {
    if (this._initialized) return;
    this._initialized = true;
    if (!document.getElementById(ClosureDataGrid._styleId)) {
      const s = document.createElement('style');
      s.id = ClosureDataGrid._styleId;
      s.textContent = ClosureDataGrid._style;
      document.head.appendChild(s);
    }
    this.tabIndex = 0;
    this.style.outline = 'none';
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this._init(), { once: true });
    } else {
      this._init();
    }
  }

  // ---
  _init() {
    this._readDefinitions();
    this._currentPage = 1;
    this._selectedIdx = 0;
    this._kbNav = false;
    this._filters = {};
    this._ROW_H = 34;

    if (this._isDynamic) {
      this._allRows = [];
      this._rows = [];
      this._total = 0;
      this._build();
      this._fetchDynamic();
    } else if (this._isStaticByRequest) {
      this._allRows = [];
      this._rows = [];
      this._total = 0;
      this._build();
      this._fetchStatic();
    } else {
      this._readInlineData();
      this._build();
    }
  }

  // ---
  _readDefinitions() {
    this._cols = Array.from(this.querySelectorAll('grid-col')).map(el => ({
      name:     el.getAttribute('name'),
      label:    el.getAttribute('label') || '',
      type:     el.getAttribute('type') || 'text',
      mapId:    el.getAttribute('map-data-id') || '',
      width:    el.getAttribute('width') || '',
      align:    this._normalizeAlign(el.getAttribute('align') || ''),
      fill:     el.hasAttribute('fill'),
      collapse: el.hasAttribute('collapse'),
      key:      el.hasAttribute('key'),
      el:       el,
    }));
    this._keys = Array.from(this.querySelectorAll('grid-key')).map(el => ({
      keys:     (el.getAttribute('key') || '').split(',').map(k => k.trim()),
      url:      el.getAttribute('url') || '',
      action:   el.getAttribute('action') || '',
      mode:     el.getAttribute('mode') || 'navigate',
      bind:     (el.getAttribute('bind') || '').split(',').map(s => s.trim()).filter(Boolean),
      targetId: el.getAttribute('target-id') || '',
      eventName: el.getAttribute('event') || 'row-action',
      dataAttrs: this._readDataAttrs(el),
    }));
    this._noResults = this.querySelector('on-no-results');
    this._fetchError = this.querySelector('on-fetch-error');

    // Query definition
    const qd = this.querySelector('query-definition');
    if (qd) {
      this._queryDef = {
        name:   qd.getAttribute('name') || 'data',
        url:    qd.getAttribute('url') || '',
        method: (qd.getAttribute('method') || 'POST').toUpperCase(),
        target: qd.getAttribute('target') || '_self',
        params: Array.from(qd.querySelectorAll('query-param')).map(p => ({
          name:  p.getAttribute('name'),
          value: p.getAttribute('value') || null,
          bind:  p.getAttribute('bind') || null,
        })),
      };
    } else {
      this._queryDef = null;
    }

    // Detect mode
    this._isStatic = this.hasAttribute('static');
    this._isDynamic = this._queryDef && !this._isStatic;
    this._isStaticByRequest = this._queryDef && this._isStatic;
  }

  // ---
  _readInlineData() {
    this._allRows = Array.from(this.querySelectorAll('g-row')).map(row => {
      const obj = {};
      row.querySelectorAll('g-col').forEach(col => {
        obj[col.getAttribute('name')] = col.innerHTML.trim();
      });
      return obj;
    });
    this._filters = {};
    this._applyFilters();
  }

  // ---
  _applyFilters() {
    const f = this._filters;
    this._rows = this._allRows.filter(row => {
      for (const key of Object.keys(f)) {
        const val = f[key];
        if (!val) continue;
        if (key === 'q') {
          const q = val.toLowerCase();
          const match = Object.values(row).some(v => String(v).toLowerCase().includes(q));
          if (!match) return false;
        } else if (val.includes(',')) {
          const vals = val.split(',');
          if (!vals.includes(String(row[key] || ''))) return false;
        } else {
          if (String(row[key] || '') !== val) return false;
        }
      }
      return true;
    });
    this._total = this._rows.length;
  }

  // ---
  _resolveParams() {
    if (!this._queryDef) return {};
    const params = {};
    const ps = this.pageSize;
    this._queryDef.params.forEach(p => {
      if (p.value !== null) {
        params[p.name] = p.value;
      } else if (p.bind) {
        const [ns, key] = p.bind.split('.');
        if (ns === 'grid') {
          if (key === 'offset') params[p.name] = (this._currentPage - 1) * ps;
          else if (key === 'limit') params[p.name] = ps;
          else if (key === 'page') params[p.name] = this._currentPage;
          else if (key === 'page_size') params[p.name] = ps;
          else if (key === 'goto_id') { if (this._gotoId) params[p.name] = this._gotoId; }
        } else if (ns === 'filter') {
          const v = (this._filters || {})[key];
          /*<%% if:mockup %%>*/ console.log('[resolveParams] filter.' + key + ' =', JSON.stringify(v), 'filters=', JSON.stringify(this._filters)); /*<%% end %%>*/
          if (v) params[p.name] = v;
        }
      }
    });
    return params;
  }

  // ---
  _fetchStatic() {
    const qd = this._queryDef;
    const params = this._resolveParams();
    const url = qd.url;
    const method = qd.method;

    const fetchOpts = { method, credentials: 'same-origin' };
    if (method === 'GET') {
      const qs = new URLSearchParams(params).toString();
      var fetchUrl = url + (url.includes('?') ? '&' : '?') + qs;
    } else {
      fetchOpts.headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
      fetchOpts.body = new URLSearchParams(params).toString();
      var fetchUrl = url;
    }

    fetch(fetchUrl, fetchOpts)
      .then(r => r.json())
      .then(resp => {
        if (resp.error) { this._showError(resp.error); return; }
        this._allRows = resp.data || [];
        this._applyFilters();
        this._currentPage = 1;
        this._selectedIdx = 0;
        this._renderPage();
        this._syncColWidths();
      })
      .catch(err => {
        console.error('static fetch error:', err);
        this._showError(err.message);
      });
  }

  // ---
  _fetchDynamic() {
    const qd = this._queryDef;
    const params = this._resolveParams();
    const url = qd.url;
    const method = qd.method;

    const fetchOpts = { method, credentials: 'same-origin' };
    let fetchUrl = url;
    if (method === 'GET') {
      const qs = new URLSearchParams(params).toString();
      fetchUrl = url + (url.includes('?') ? '&' : '?') + qs;
    } else {
      fetchOpts.headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
      fetchOpts.body = new URLSearchParams(params).toString();
    }

    fetch(fetchUrl, fetchOpts)
      .then(r => r.json())
      .then(resp => {
        if (resp.error) { this._showError(resp.error); return; }
        const res = resp.result || {};
        this._rows = resp.data || [];
        this._total = res.total || this._rows.length;
        this._eof = res.eof || false;
        if (res.offset !== undefined) {
          const ps = this.pageSize;
          this._currentPage = Math.floor(res.offset / ps) + 1;
        }
        if (res.select_index !== undefined && res.select_index >= 0) {
          this._selectedIdx = res.select_index;
        }
        this._renderPage(false, true);
        this._syncColWidths();
      })
      .catch(err => {
        console.error('dynamic fetch error:', err);
        this._showError(err.message);
      });
  }

  // ---
  _navigateWithParams() {
    const qd = this._queryDef;
    const params = this._resolveParams();
    const form = document.createElement('form');
    form.method = qd.method;
    form.action = qd.url;
    form.target = qd.target || '_self';
    form.style.display = 'none';
    for (const [k, v] of Object.entries(params)) {
      const input = document.createElement('input');
      input.type = 'hidden'; input.name = k; input.value = v;
      form.appendChild(input);
    }
    document.body.appendChild(form);
    form.submit();
  }

  // ---
  _showError(msg) {
    this._tbody.innerHTML = '';
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = this._cols.length;
    td.className = 'dg-no-results';
    if (this._fetchError) {
      td.innerHTML = this._fetchError.innerHTML;
    } else {
      td.textContent = msg || 'Error loading data';
    }
    tr.appendChild(td);
    this._tbody.appendChild(tr);
    this._updatePagination();
  }

  // ---
  _readDataAttrs(el) {
    const d = {};
    for (const attr of el.attributes) {
      if (attr.name.startsWith('data-')) d[attr.name.slice(5)] = attr.value;
    }
    return d;
  }

  // ---
  _cssLength(value) {
    const v = String(value || '').trim();
    if (!v) return '';
    if (/^-?\d+(\.\d+)?$/.test(v)) return v + 'px';
    return v;
  }

  // ---
  _normalizeAlign(value) {
    const align = String(value || '').trim().toLowerCase();
    return /^(left|center|right)$/.test(align) ? align : '';
  }

  // ---
  _applyColumnPresentation(el, col, isBodyCell) {
    if (col.width) {
      el.style.width = this._cssLength(col.width);
      if (isBodyCell) el.style.padding = '6px 4px';
    }
    if (col.align) {
      el.style.textAlign = col.align;
    } else if (col.width) {
      el.style.textAlign = 'center';
    }
  }

  // ---
  _cellContentWidth(cell) {
    const cs = getComputedStyle(cell);
    const probe = document.createElement('span');
    probe.style.cssText = [
      'position:fixed',
      'left:-10000px',
      'top:-10000px',
      'visibility:hidden',
      'white-space:nowrap',
      'font:' + cs.font,
      'letter-spacing:' + cs.letterSpacing,
    ].join(';');
    probe.textContent = cell.textContent || '';
    document.body.appendChild(probe);
    const pad = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
    const width = Math.ceil(probe.getBoundingClientRect().width + pad + 2);
    probe.remove();
    return width;
  }

  // ---
  _autoFitColumnWidth(idx, ths) {
    const columnCells = Array.from(this._tbody.querySelectorAll('tr td:nth-child(' + (idx + 1) + ')'));
    return Math.max(this._cellContentWidth(ths[idx]), ...columnCells.map(cell => this._cellContentWidth(cell)));
  }

  // ---
  get pageSize() {
    const ps = this.getAttribute('page-size');
    if (!ps || ps === 'all') return this._total;
    if (ps === 'auto') return this._calcAutoPageSize();
    return parseInt(ps, 10) || this._total;
  }

  get totalPages() { return Math.max(1, Math.ceil(this._total / this.pageSize)); }

  // ---
  _calcAutoPageSize() {
    const wrap = this._wrap;
    if (!wrap) return 10;
    const theadH = this.hasAttribute('headless') ? 0 : (this._headTable ? this._headTable.offsetHeight : 32);
    const paginH = this.hasAttribute('footerless') ? 0 : (this._pagination ? this._pagination.offsetHeight : 36);
    const ROW_H = 34;
    const minRows = parseInt(this.getAttribute('min-rows'), 10) || 1;
    const maxRows = parseInt(this.getAttribute('max-rows'), 10) || 999;
    const available = wrap.clientHeight - theadH - paginH - 4;
    const calc = Math.floor(available / ROW_H);
    return Math.max(minRows, Math.min(maxRows, calc));
  }

  // ---
  _build() {
    // Clear children
    const origHTML = this.innerHTML;
    this.innerHTML = '';

    // Wrap
    this._wrap = document.createElement('div');
    this._wrap.className = 'dg-wrap';

    // Head table (skipped when the grid has the `headless` attribute)
    if (!this.hasAttribute('headless')) {
      const headWrap = document.createElement('div');
      headWrap.className = 'dg-thead-wrap';
      this._headTable = document.createElement('table');
      this._headTable.className = 'dg-table dg-head-table';
      const thead = document.createElement('thead');
      const headRow = document.createElement('tr');
      this._cols.forEach(col => {
        const th = document.createElement('th');
        this._applyColumnPresentation(th, col, false);
        if (col.collapse) th.className = 'dg-col-collapse';
        if (col.type === 'actions') {
          th.textContent = '⋮';
          th.title = col.label || 'Actions';
          th.style.textAlign = 'right';
        } else if (col.type === 'btn') {
          th.textContent = '';
          th.title = col.label || col.name;
        } else {
          th.textContent = col.label || '';
        }
        th.addEventListener('click', () => {
          this.dispatchEvent(new CustomEvent('header-click', { detail: { column: col.name }, bubbles: true }));
        });
        headRow.appendChild(th);
      });
      thead.appendChild(headRow);
      this._headTable.appendChild(thead);
      headWrap.appendChild(this._headTable);
      this._wrap.appendChild(headWrap);
    }

    // Body table
    this._bodyWrap = document.createElement('div');
    this._bodyWrap.className = 'dg-table-wrap';

    this._bodyTable = document.createElement('table');
    this._bodyTable.className = 'dg-table';
    this._tbody = document.createElement('tbody');
    this._bodyTable.appendChild(this._tbody);
    this._bodyWrap.appendChild(this._bodyTable);
    this._wrap.appendChild(this._bodyWrap);

    // Pagination (skipped when the grid has the `footerless` attribute)
    const ps = this.getAttribute('page-size');
    if (ps && ps !== 'all' && !this.hasAttribute('footerless')) {
      this._pagination = document.createElement('div');
      this._pagination.className = 'dg-pagination';
      this._buildPagination();
      this._wrap.appendChild(this._pagination);
    }

    this.appendChild(this._wrap);

    // Auto page-size: set height BEFORE first render
    if (ps === 'auto') {
      this._setAutoHeight();
    }

    // Render first page
    this._renderPage();
    this._syncColWidths();
    // max-rows cap: applies regardless of page-size mode (e.g. with
    // page-size="all" + static data, this limits visible rows and scrolls
    // the body for the rest).
    this._applyMaxHeight();

    // Events
    this._setupEvents();
    this._setupAutoFitResizeObserver();

    // Auto-focus
    if (this.hasAttribute('autofocus')) this.focus();

    // Auto page-size: observe resize
    if (ps === 'auto') {
      window.addEventListener('resize', () => {
        this._setAutoHeight();
        const oldPage = this._currentPage;
        const newTp = this.totalPages;
        if (this._currentPage > newTp) this._currentPage = newTp;
        this._renderPage();
        this._syncColWidths();
        this._updatePagination();
      });
    }
  }

  // ---
  _setupAutoFitResizeObserver() {
    if (!this.hasAttribute('auto-fit') || !window.ResizeObserver || this._autoFitResizeObserver) return;
    this._autoFitLastWidth = Math.floor(this._bodyWrap ? this._bodyWrap.clientWidth : this.clientWidth);
    this._autoFitResizeObserver = new ResizeObserver(() => {
      if (this._autoFitResizeRaf) cancelAnimationFrame(this._autoFitResizeRaf);
      this._autoFitResizeRaf = requestAnimationFrame(() => {
        const width = Math.floor(this._bodyWrap ? this._bodyWrap.clientWidth : this.clientWidth);
        if (!width || width === this._autoFitLastWidth) return;
        this._autoFitLastWidth = width;
        this._syncColWidths();
      });
    });
    this._autoFitResizeObserver.observe(this._bodyWrap || this);
  }

  // ---
  _buildPagination() {
    const p = this._pagination;
    p.innerHTML = '';
    const btns = ['⏮', '◀', '▶', '⏭'];
    const titles = ['First', 'Previous', 'Next', 'Last'];
    this._pageButtons = [];
    btns.forEach((icon, i) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'dg-page-btn';
      btn.tabIndex = -1;
      btn.title = titles[i];
      btn.textContent = icon;
      this._pageButtons.push(btn);
      p.appendChild(btn);
    });
    this._pageInfo = document.createElement('span');
    this._pageInfo.className = 'dg-page-info';
    p.insertBefore(this._pageInfo, this._pageButtons[2]);

    const sep = document.createElement('div');
    sep.className = 'dg-pagination-sep';
    p.appendChild(sep);

    this._recordsInfo = document.createElement('span');
    p.appendChild(this._recordsInfo);

    if (this.hasAttribute('show-page-size')) {
      this._pageSizeInfo = document.createElement('span');
      this._pageSizeInfo.style.color = 'var(--text-muted, #6b7280)';
      p.appendChild(this._pageSizeInfo);
    }

    // Refresh button
    if (this.hasAttribute('refresh-button')) {
      const refreshBtn = document.createElement('button');
      refreshBtn.type = 'button';
      refreshBtn.className = 'dg-page-btn';
      refreshBtn.tabIndex = -1;
      refreshBtn.title = 'Refresh';
      refreshBtn.textContent = '↻';
      refreshBtn.addEventListener('click', () => {
        const e = new CustomEvent('grid-refresh', { bubbles: true, cancelable: true });
        if (this.dispatchEvent(e)) this.refresh();
      });
      p.appendChild(refreshBtn);
    }

    // Button events
    this._pageButtons[0].addEventListener('click', () => this._goPage('first'));
    this._pageButtons[1].addEventListener('click', () => this._goPage(-1));
    this._pageButtons[2].addEventListener('click', () => this._goPage(+1));
    this._pageButtons[3].addEventListener('click', () => this._goPage('last'));
  }

  // ---
  _updatePagination() {
    if (!this._pagination) return;
    const ps = this.pageSize;
    const tp = this.totalPages;
    this._pageInfo.textContent = this._currentPage + ' / ' + tp;
    const start = (this._currentPage - 1) * ps + 1;
    const end = Math.min(this._currentPage * ps, this._total);
    this._recordsInfo.textContent = this._total > 0 ? 'Records ' + start + '–' + end + ' of ' + this._total : 'No records';
    if (this._pageSizeInfo) this._pageSizeInfo.textContent = ' · ' + ps + '/p';
    this._pageButtons[0].disabled = this._currentPage === 1;
    this._pageButtons[1].disabled = this._currentPage === 1;
    this._pageButtons[2].disabled = this._currentPage >= tp;
    this._pageButtons[3].disabled = this._currentPage >= tp;

  }

  // ---
  _goPage(dir) {
    const tp = this.totalPages;
    const newPage = dir === 'first' ? 1 : dir === 'last' ? tp : this._currentPage + dir;
    if (newPage < 1 || newPage > tp) return;
    this._currentPage = newPage;
    const focusLast = (dir === -1 || dir === 'last');
    if (this._isDynamic) {
      this._selectedIdx = focusLast ? this.pageSize - 1 : 0;
      this._fetchDynamic();
    } else {
      this._renderPage(focusLast);
      this._syncColWidths();
    }
  }

  // ---
  _renderPage(focusLast, isDynamicData) {
    let pageRows;
    if (isDynamicData && this._isDynamic) {
      pageRows = this._rows; // already paginated by server
    } else {
      const ps = this.pageSize;
      const start = (this._currentPage - 1) * ps;
      pageRows = this._rows.slice(start, start + ps);
    }

    this._tbody.innerHTML = '';

    if (pageRows.length === 0) {
      if (this._noResults) {
        const cell = document.createElement('td');
        cell.colSpan = this._cols.length;
        cell.className = 'dg-no-results';
        cell.innerHTML = this._noResults.innerHTML;
        const tr = document.createElement('tr');
        tr.appendChild(cell);
        this._tbody.appendChild(tr);
      }
      this._updatePagination();
      return;
    }

    pageRows.forEach((row, i) => {
      const tr = this._createRow(row, i);
      tr.addEventListener('click', () => this._selectRow(i));
      this._tbody.appendChild(tr);
    });

    // Focus row
    const focusIdx = focusLast ? pageRows.length - 1 : 0;
    this._selectRow(focusIdx);

    this._updatePagination();
  }

  // ---
  _createRow(row, i) {
    const tr = document.createElement('tr');
    this._cols.forEach(col => {
      const td = document.createElement('td');
      const val = row[col.name] || '';

      if (col.collapse) { td.className = 'dg-col-collapse'; td.title = val; }
      this._applyColumnPresentation(td, col, true);

      if (col.mapId) {
        const map = document.getElementById(col.mapId);
        const resolved = map ? map.resolve(val) : null;
        if (resolved) {
          const span = document.createElement('span');
          span.textContent = resolved.icon || val;
          span.title = resolved.label || val;
          if (resolved.color) span.style.color = resolved.color;
          if (resolved.size) span.style.fontSize = resolved.size;
          td.appendChild(span);
        } else {
          td.textContent = val;
        }
      } else if (col.type === 'actions') {
        const items = Array.from(col.el.querySelectorAll('closure-btn-item'));
        const wrap = document.createElement('div');
        wrap.style.cssText = 'position:relative;display:inline-block;';
        const btn = document.createElement('button');
        btn.type = 'button'; btn.textContent = '☰'; btn.tabIndex = -1;
        btn.style.cssText = 'border:1px solid var(--dg-border,#e5e7eb);border-radius:4px;background:#fff;cursor:pointer;font-size:14px;padding:2px 6px;';
        const panel = document.createElement('div');
        panel.style.cssText = 'display:none;position:absolute;right:0;top:100%;margin-top:2px;background:#fff;border:1px solid var(--dg-border,#e5e7eb);border-radius:6px;box-shadow:0 4px 16px rgba(0,0,0,0.12);z-index:100;overflow:hidden;';
        items.forEach(item => {
          const mi = document.createElement('button');
          mi.type = 'button'; mi.tabIndex = -1;
          mi.textContent = item.getAttribute('icon') || '•';
          mi.title = item.getAttribute('data-action') || '';
          mi.style.cssText = 'display:flex;align-items:center;justify-content:center;padding:8px 12px;cursor:pointer;font-size:16px;border:none;border-bottom:1px solid var(--dg-border,#e5e7eb);background:none;width:100%;';
          mi.addEventListener('click', (e) => {
            e.stopPropagation(); panel.style.display = 'none';
            this._selectRow(i);
            this._executeAction(this._actionDefFromElement(item));
          });
          panel.appendChild(mi);
        });
        if (panel.lastChild) panel.lastChild.style.borderBottom = 'none';
        btn.addEventListener('click', (e) => {
          e.stopPropagation(); this._selectRow(i);
          const open = panel.style.display === 'block';
          document.querySelectorAll('.dg-action-panel-open').forEach(p => { p.style.display = 'none'; p.classList.remove('dg-action-panel-open'); });
          if (!open) { panel.style.display = 'block'; panel.classList.add('dg-action-panel-open'); }
        });
        wrap.appendChild(btn); wrap.appendChild(panel);
        td.appendChild(wrap);
      } else if (col.type === 'btn') {
        const items = Array.from(col.el.querySelectorAll('closure-btn'));
        items.forEach(item => {
          const btn = document.createElement('span');
          btn.textContent = item.getAttribute('icon') || '•';
          btn.title = item.getAttribute('data-action') || ''; btn.tabIndex = -1;
          btn.style.cssText = 'cursor:pointer;font-size:16px;';
          btn.addEventListener('click', (e) => {
            e.stopPropagation(); this._selectRow(i);
            this._executeAction(this._actionDefFromElement(item));
          });
          td.appendChild(btn);
        });
      } else {
        td.textContent = val;
      }
      tr.appendChild(td);
    });
    return tr;
  }

  // ---
  _selectRow(idx) {
    const rows = Array.from(this._tbody.querySelectorAll('tr'));
    const changed = this._selectedIdx !== idx;
    rows.forEach(r => r.classList.remove('focused'));
    if (rows[idx]) {
      rows[idx].classList.add('focused');
      this._selectedIdx = idx;
      const ps = this.pageSize;
      const absIdx = (this._currentPage - 1) * ps + idx;
      const rowData = this._isDynamic ? this._rows[idx] : this._rows[absIdx];
      this.dispatchEvent(new CustomEvent('row-select', {
        detail: { row: rowData, index: absIdx },
        bubbles: true,
      }));
      if (changed) {
        this.dispatchEvent(new CustomEvent('row-focus', {
          detail: { row: rowData, index: absIdx },
          bubbles: true,
        }));
      }
    }
  }

  // ---
  _moveFocus(idx) {
    const rows = Array.from(this._tbody.querySelectorAll('tr'));
    if (idx < 0 || idx >= rows.length) return false;
    this._selectRow(idx);

    // Scroll into view within body wrap
    const rowTop = rows[idx].offsetTop;
    const rowBot = rowTop + rows[idx].offsetHeight;
    const w = this._bodyWrap;
    if (rowTop < w.scrollTop) w.scrollTop = rowTop;
    else if (rowBot > w.scrollTop + w.clientHeight) w.scrollTop = rowBot - w.clientHeight;
    return true;
  }

  // ---
  _syncColWidths() {
    if (!this._headTable) return; // headless mode
    if (this.hasAttribute('auto-fit')) {
      let bodyCg = this._bodyTable.querySelector('colgroup');
      if (!bodyCg) { bodyCg = document.createElement('colgroup'); this._bodyTable.prepend(bodyCg); }
      this._headTable.style.tableLayout = 'auto';
      this._bodyTable.style.tableLayout = 'auto';
      bodyCg.innerHTML = '';
      const cells = Array.from(this._bodyTable.querySelectorAll('tbody tr:first-child td'));
      const ths = Array.from(this._headTable.querySelectorAll('th'));
      if (!cells.length || !ths.length) return;
      let headCg = this._headTable.querySelector('colgroup');
      if (!headCg) { headCg = document.createElement('colgroup'); this._headTable.prepend(headCg); }
      headCg.innerHTML = '';
      const fillIdxs = this._cols
        .map((gridCol, idx) => gridCol.fill ? idx : -1)
        .filter(idx => idx >= 0);
      const widths = this._cols.map((gridCol, idx) => {
        const cssWidth = this._cssLength(gridCol.width);
        if (cssWidth) return cssWidth;
        if (fillIdxs.includes(idx)) return '';
        return this._autoFitColumnWidth(idx, ths) + 'px';
      });
      const fixedWidth = widths.reduce((sum, width, idx) => {
        if (!width || fillIdxs.includes(idx) || !width.endsWith('px')) return sum;
        return sum + parseFloat(width);
      }, 0);
      const fillContentWidth = fillIdxs.reduce((sum, idx) => sum + this._autoFitColumnWidth(idx, ths), 0);
      const gridWidth = Math.floor(this._bodyWrap.clientWidth || this._wrap.clientWidth || this.clientWidth);
      const fillAvailable = Math.max(0, gridWidth - fixedWidth);
      if (fillIdxs.length) {
        const fillWidth = Math.ceil(Math.max(fillContentWidth, fillAvailable) / fillIdxs.length);
        fillIdxs.forEach(idx => { widths[idx] = fillWidth + 'px'; });
      }
      const tableWidth = widths.reduce((sum, width) => {
        return width && width.endsWith('px') ? sum + parseFloat(width) : sum;
      }, 0);
      this._cols.forEach((gridCol, idx) => {
        const headCol = document.createElement('col');
        const bodyCol = document.createElement('col');
        if (widths[idx]) {
          headCol.style.width = widths[idx];
          bodyCol.style.width = widths[idx];
        }
        headCg.appendChild(headCol);
        bodyCg.appendChild(bodyCol);
      });
      if (tableWidth > 0) {
        this._headTable.style.width = tableWidth + 'px';
        this._bodyTable.style.width = tableWidth + 'px';
      }
      this._headTable.style.tableLayout = 'fixed';
      this._bodyTable.style.tableLayout = 'fixed';
    } else {
      this._headTable.style.tableLayout = '';
      this._bodyTable.style.tableLayout = '';
      this._headTable.style.width = '';
      this._bodyTable.style.width = '';
      const headCg = this._headTable.querySelector('colgroup');
      if (headCg) headCg.remove();
      const ths = Array.from(this._headTable.querySelectorAll('th'));
      if (!ths.length) return;
      let bodyCg = this._bodyTable.querySelector('colgroup');
      if (!bodyCg) { bodyCg = document.createElement('colgroup'); this._bodyTable.prepend(bodyCg); }
      bodyCg.innerHTML = '';
      ths.forEach(th => {
        const col = document.createElement('col');
        col.style.width = th.offsetWidth + 'px';
        bodyCg.appendChild(col);
      });
    }
  }

  // ---
  _applyMaxHeight() {
    const maxRows = parseInt(this.getAttribute('max-rows'), 10) || 0;
    if (maxRows <= 0 || !this._wrap) return;
    const theadH = this.hasAttribute('headless') ? 0 : (this._headTable ? this._headTable.offsetHeight : 32);
    const paginH = this.hasAttribute('footerless') ? 0 : (this._pagination ? this._pagination.offsetHeight : 36);
    const ROW_H = 34;
    this._wrap.style.maxHeight = (theadH + (ROW_H * maxRows) + paginH) + 'px';
  }

  // ---
  _setAutoHeight() {
    const wrap = this._wrap;
    const top = wrap.getBoundingClientRect().top + window.scrollY;
    const theadH = this.hasAttribute('headless') ? 0 : (this._headTable ? this._headTable.offsetHeight : 32);
    const paginH = this.hasAttribute('footerless') ? 0 : (this._pagination ? this._pagination.offsetHeight : 36);
    const ROW_H = 34;
    const minRows = parseInt(this.getAttribute('min-rows'), 10) || 1;
    const maxRows = parseInt(this.getAttribute('max-rows'), 10) || 0;
    const minH = theadH + (ROW_H * minRows) + paginH;

    // Calculate bottom margin: fill-stop > fill-reserve > 0
    let bottomH = 0;
    const fillStop = this.getAttribute('fill-stop');
    const fillReserve = parseInt(this.getAttribute('fill-reserve'), 10);
    if (fillStop) {
      const stopEl = document.querySelector(fillStop);
      if (stopEl) bottomH = window.innerHeight - stopEl.getBoundingClientRect().top;
    } else if (fillReserve > 0) {
      bottomH = fillReserve;
    }

    let available = window.innerHeight - top - bottomH;

    // Apply max-rows cap
    if (maxRows > 0) {
      const maxH = theadH + (ROW_H * maxRows) + paginH;
      available = Math.min(available, maxH);
    }

    wrap.style.height = Math.max(minH, available) + 'px';
  }

  // ---
  _setupEvents() {
    // Click on body
    this._tbody.addEventListener('click', e => {
      const row = e.target.closest('tr');
      if (!row) return;
      const rows = Array.from(this._tbody.querySelectorAll('tr'));
      this._selectRow(rows.indexOf(row));
    });

    // Close action menus on click outside
    document.addEventListener('click', () => {
      document.querySelectorAll('.dg-action-panel-open').forEach(p => { p.style.display = 'none'; p.classList.remove('dg-action-panel-open'); });
    });

    // Mouseover
    this._tbody.addEventListener('mouseover', () => {
      this._bodyTable.classList.remove('kb-nav');
    });

    // Wheel
    this._bodyWrap.addEventListener('wheel', e => {
      if (!this._pagination) return;
      e.preventDefault();
      if (e.deltaY > 0) this._goPage(+1);
      else this._goPage(-1);
    }, { passive: false });

    // Keyboard
    document.addEventListener('keydown', e => {
      if (!this.contains(document.activeElement) && document.activeElement !== this) return;
      const rows = this._tbody.querySelectorAll('tr');
      if (!rows.length) return;
      const lastIdx = rows.length - 1;

      // Check grid-key bindings first
      for (const gk of this._keys) {
        for (const keyDef of gk.keys) {
          if (this._matchKey(e, keyDef)) {
            e.preventDefault();
            if (gk.action === 'deselect') {
              rows.forEach(r => r.classList.remove('focused'));
              this._selectedIdx = -1;
              this.dispatchEvent(new CustomEvent('row-select', { detail: { row: null, index: -1 }, bubbles: true }));
              this.dispatchEvent(new CustomEvent('row-focus', { detail: { row: null, index: -1 }, bubbles: true }));
              return;
            }
            this._executeAction(gk);
            return;
          }
        }
      }

      this._bodyTable.classList.add('kb-nav');
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          if (!this._moveFocus(this._selectedIdx + 1) && this._pagination) this._goPage(+1);
          break;
        case 'ArrowUp':
          e.preventDefault();
          if (!this._moveFocus(this._selectedIdx - 1) && this._pagination) this._goPage(-1);
          break;
        case 'PageDown':
          e.preventDefault();
          if (this._selectedIdx === lastIdx && this._pagination) this._goPage(+1);
          else this._moveFocus(lastIdx);
          break;
        case 'PageUp':
          e.preventDefault();
          if (this._selectedIdx === 0 && this._pagination) this._goPage(-1);
          else this._moveFocus(0);
          break;
        case 'Home':
          if (e.ctrlKey) { e.preventDefault(); this._goPage('first'); }
          break;
        case 'End':
          if (e.ctrlKey) { e.preventDefault(); this._goPage('last'); }
          break;
      }
    });

    // Filter change
    this.addEventListener('filter-change', e => {
      this._filters = e.detail || {};
      this._currentPage = 1;
      this._selectedIdx = 0;
      const filterMode = this.getAttribute('filter') || 'local';
      if (filterMode === 'fetch' && this._queryDef) {
        this._fetchDynamic();
      } else if (filterMode === 'navigate' && this._queryDef) {
        this._navigateWithParams();
      } else {
        this._applyFilters();
        this._renderPage();
        this._syncColWidths();
      }
    });

    // Header click
    if (this._headTable) {
      this._headTable.addEventListener('click', e => {
        // Already handled per-th in _build
      });
    }

    // Double click
    this._tbody.addEventListener('dblclick', e => {
      const row = e.target.closest('tr');
      if (!row) return;
      const rows = Array.from(this._tbody.querySelectorAll('tr'));
      this._selectRow(rows.indexOf(row));
      for (const gk of this._keys) {
        if (gk.keys.some(k => k.includes('dblclick'))) {
          this._executeAction(gk);
          return;
        }
      }
    });
  }

  // ---
  _executeAction(actionDef) {
    const row = this.selectedRow;
    const mode = actionDef.mode || 'navigate';
    const url = actionDef.url || '';
    const dataAttrs = actionDef.dataAttrs || {};
    const bindFields = actionDef.bind || [];
    const targetId = actionDef.targetId || '';

    // Build params: static data-* + bound row fields
    const params = { ...dataAttrs };
    if (row) {
      bindFields.forEach(f => { if (row[f] !== undefined) params[f] = row[f]; });
    }

    switch (mode) {
      case 'navigate': {
        const form = document.createElement('form');
        form.method = 'POST';
        form.style.display = 'none';
        if (url) form.action = url;
        for (const [k, v] of Object.entries(params)) {
          const input = document.createElement('input');
          input.type = 'hidden'; input.name = k; input.value = v;
          form.appendChild(input);
        }
        document.body.appendChild(form);
        form.submit();
        break;
      }
      case 'dialog': {
        fetch(url, {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams(params).toString(),
        })
        .then(r => r.text())
        .then(html => {
          var lb = document.createElement('closure-lightbox');
          document.body.appendChild(lb);
          lb.showResponse(html);
          lb.addEventListener('lb-close', () => lb.remove(), { once: true });
        })
        .catch(err => console.error('dialog fetch error:', err));
        break;
      }
      case 'refresh': {
        fetch(url, {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams(params).toString(),
        })
        .then(() => this.refresh())
        .catch(err => console.error('refresh fetch error:', err));
        break;
      }
      case 'event': {
        const dest = targetId ? document.getElementById(targetId) : this;
        const eventName = actionDef.eventName || 'row-action';
        if (dest) {
          dest.dispatchEvent(new CustomEvent(eventName, {
            detail: { action: dataAttrs.action || '', row: row || {}, params },
            bubbles: true,
          }));
        }
        break;
      }
    }
  }

  // ---
  _actionDefFromElement(el) {
    return {
      mode:      el.getAttribute('mode') || 'navigate',
      url:       el.getAttribute('url') || '',
      bind:      (el.getAttribute('bind') || '').split(',').map(s => s.trim()).filter(Boolean),
      targetId:  el.getAttribute('target-id') || '',
      eventName: el.getAttribute('event') || 'row-action',
      dataAttrs: this._readDataAttrs(el),
    };
  }

  // ---
  _matchKey(e, keyDef) {
    const parts = keyDef.split('+').map(p => p.trim().toLowerCase());
    let needCtrl = false, needShift = false, needAlt = false, mainKey = '';
    parts.forEach(p => {
      if (p === 'ctrl') needCtrl = true;
      else if (p === 'shift') needShift = true;
      else if (p === 'alt') needAlt = true;
      else mainKey = p;
    });
    if (needCtrl !== e.ctrlKey) return false;
    if (needShift !== e.shiftKey) return false;
    if (needAlt !== e.altKey) return false;
    const eKey = e.key === ' ' ? 'space' : e.key.toLowerCase();
    return eKey === mainKey;
  }

  // ---
  get selectedRow() {
    if (this._selectedIdx < 0) return null;
    if (this._isDynamic) return this._rows[this._selectedIdx] || null;
    const ps = this.pageSize;
    const absIdx = (this._currentPage - 1) * ps + this._selectedIdx;
    return this._rows[absIdx] || null;
  }

  // ---
  refresh(opts) {
    this._currentPage = 1;
    this._selectedIdx = 0;
    if (opts && opts.goto) this._gotoId = opts.goto;
    if (this._isDynamic) {
      this._fetchDynamic();
    } else if (this._isStaticByRequest) {
      this._fetchStatic();
    } else {
      this._renderPage();
      this._syncColWidths();
    }
  }
}

customElements.define('closure-data-grid', ClosureDataGrid);
