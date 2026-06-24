/*<%% note:
# `<closure-data-source>`

Reactive data container that turns inline rows into a set of dependent
`<select>` populations. Renders nothing itself (`display: none`); the
real UI is the `<select>` elements it points at.

The data is declared inline using `<g-row><g-col name="…">value</g-col>`
children (same pattern as `<closure-data-grid>`). Each
`<observed-select>` child describes one population:
which select to fill, which row fields supply the option key and label,
and (optionally) which other select acts as a cascading filter.

Use it for **small, static cascading dropdowns** — country → state → city,
category → subcategory — where the options are known up front and a network
round-trip per change would be overkill. Because the rows are baked into the
HTML, it is not meant for large or live datasets: for those, fetch from the
server and populate the selects yourself.

## Attributes

None. Configuration lives in the children.

## Children

### `<g-row><g-col name="x">…</g-col></g-row>`

Each `<g-row>` is one row. Each `<g-col name="x">` cell becomes a
field; cell text is trimmed.

### `<observed-select>`

| Attribute | Description |
|---|---|
| `list-id="id"`           | id of the `<select>` to populate |
| `key-field="name"`       | row field used as option `value` |
| `label-field="name"`     | row field used as option text (defaults to key) |
| `filter-control="id"`    | id of another `<select>` whose value filters this one |
| `filter-field="name"`    | row field to compare with the filter control's value |
| `selected-value="x"`     | initial selection after the first population |
| `blank-value-key="x"`    | when present, prepend a blank option with this `value` |
| `blank-value-label="x"`  | label for the blank option (defaults to empty) |

## Example

```html
<closure-data-source>
  <g-row><g-col name="country">US</g-col><g-col name="country_name">United States</g-col><g-col name="state">NY</g-col><g-col name="state_name">New York</g-col></g-row>
  <g-row><g-col name="country">US</g-col><g-col name="country_name">United States</g-col><g-col name="state">CA</g-col><g-col name="state_name">California</g-col></g-row>
  <g-row><g-col name="country">CA</g-col><g-col name="country_name">Canada</g-col><g-col name="state">ON</g-col><g-col name="state_name">Ontario</g-col></g-row>

  <observed-select list-id="sel-country"
                   key-field="country" label-field="country_name"></observed-select>
  <observed-select list-id="sel-state"
                   key-field="state" label-field="state_name"
                   filter-control="sel-country" filter-field="country"></observed-select>
</closure-data-source>

<select id="sel-country"></select>
<select id="sel-state"></select>
```

## Behaviour

> **Note:** populated options are **deduplicated by key** — duplicate
> rows for the same country won't repeat the country option.

> **Note:** initial population uses `selected-value` if set; on every
> cascade after that, the dependent select resets to its blank entry
> (when one was declared) instead of preserving a now-illegal choice.

> **Note:** every population fires a non-bubbling `change` event on the
> populated select so further dependents update in turn.

---
%%>*/

class ClosureDataSource extends HTMLElement {

  // ---
  connectedCallback() {
    if (this._initialized) {
      // Reconnect: re-attach the control listeners removed on disconnect
      (this._controlBindings || []).forEach(function(cb) {
        cb.control.addEventListener('change', cb.fn);
      });
      return;
    }
    this._initialized = true;
    this.style.display = 'none';
    var self = this;
    var init = function() { self._build(); };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
      requestAnimationFrame(init);
    }
  }

  disconnectedCallback() {
    (this._controlBindings || []).forEach(function(cb) {
      cb.control.removeEventListener('change', cb.fn);
    });
  }

  _build() {
    this._data = this._parseRows();
    this._bindings = this._parseBindings();
    this._bindAll();
  }

  _parseRows() {
    var rows = [];
    var gRows = this.querySelectorAll('g-row');
    for (var i = 0; i < gRows.length; i++) {
      var row = {};
      var cols = gRows[i].querySelectorAll('g-col');
      for (var j = 0; j < cols.length; j++) {
        var name = cols[j].getAttribute('name');
        if (name) row[name] = cols[j].textContent.trim();
      }
      rows.push(row);
    }
    return rows;
  }

  _parseBindings() {
    var bindings = [];
    var obs = this.querySelectorAll('observed-select');
    for (var i = 0; i < obs.length; i++) {
      bindings.push({
        listId: obs[i].getAttribute('list-id') || '',
        keyField: obs[i].getAttribute('key-field') || '',
        labelField: obs[i].getAttribute('label-field') || '',
        filterControl: obs[i].getAttribute('filter-control') || '',
        filterField: obs[i].getAttribute('filter-field') || '',
        selectedValue: obs[i].getAttribute('selected-value') || '',
        blankKey: obs[i].hasAttribute('blank-value-key') ? (obs[i].getAttribute('blank-value-key') || '') : null,
        blankLabel: obs[i].getAttribute('blank-value-label') || '',
      });
    }
    return bindings;
  }

  _bindAll() {
    var self = this;
    this._controlBindings = [];
    // While the initial pass runs, cascaded repopulations (fired by the
    // synchronous change dispatch below) must still honor selected-value
    // — otherwise the outcome depends on declaration order
    this._initialBind = true;
    this._bindings.forEach(function(b) {
      var select = document.getElementById(b.listId);
      if (!select) return;

      if (b.filterControl) {
        var control = document.getElementById(b.filterControl);
        if (control) {
          var fn = function() {
            self._populateSelect(b, select, self._initialBind);
          };
          control.addEventListener('change', fn);
          self._controlBindings.push({ control: control, fn: fn });
        }
      }

      self._populateSelect(b, select, true);
    });
    this._initialBind = false;
  }

  _populateSelect(binding, select, initial) {
    var filterValue = '';
    if (binding.filterControl && binding.filterField) {
      var control = document.getElementById(binding.filterControl);
      if (control) filterValue = control.value;
    }

    var seen = Object.create(null); // plain {} has inherited keys ("constructor", …)
    var options = [];
    for (var i = 0; i < this._data.length; i++) {
      var row = this._data[i];

      if (binding.filterField && filterValue) {
        if (row[binding.filterField] !== filterValue) continue;
      }

      var key = row[binding.keyField] || '';
      var label = row[binding.labelField] || key;

      if (seen[key]) continue;
      seen[key] = true;
      options.push({ key: key, label: label });
    }

    select.innerHTML = '';

    if (binding.blankKey !== null) {
      var blank = document.createElement('option');
      blank.value = binding.blankKey;
      blank.textContent = binding.blankLabel;
      select.appendChild(blank);
    }

    for (var i = 0; i < options.length; i++) {
      var opt = document.createElement('option');
      opt.value = options[i].key;
      opt.textContent = options[i].label;
      select.appendChild(opt);
    }

    // On initial load: use selected-value. On cascade: reset to blank.
    if (initial && binding.selectedValue) {
      for (var i = 0; i < select.options.length; i++) {
        if (select.options[i].value === binding.selectedValue) {
          select.value = binding.selectedValue;
          break;
        }
      }
    } else if (binding.blankKey !== null) {
      select.value = binding.blankKey;
    }

    // Trigger change on dependents
    select.dispatchEvent(new Event('change', { bubbles: false }));
  }
}

customElements.define('closure-data-source', ClosureDataSource);
