/*<%% note:
# `<closure-checkbox-group>`

Bundles several `<closure-checkbox-tree>` instances into one
form-associated field. Submits a single value containing every tree's
selections, either as a concatenated flat list or as an object keyed
by tree name.

Use it when a form needs **several related checkbox trees submitted together as
one field** — e.g. permissions split into sections by resource type — without
wiring each tree's value by hand. The trees stay independent: the group only
concatenates their values into one payload; it does not cascade or share
selection state between them.

## Attributes

| Attribute | Description |
|---|---|
| `name="x"`           | form field name |
| `output="flat"`      | flat array (default) — every tree's leaves concatenated |
| `output="sections"`  | object `{ treeName: [[path, v, vt], …] }` |
| `readonly`           | propagates `readonly` to every child tree |
| `src="id"`           | id of an element whose `textContent` is parsed as JSON to seed initial values |
| `summary="id"`       | id of a paired `<closure-summary>` to refresh on changes |

## Children

`<closure-checkbox-tree>` elements (see [`<closure-checkbox-tree>`](#closure-checkbox-tree)).

## Form value

Same JSON serialisation as `<closure-checkbox-tree>` but combined:

- **flat**: `[ [path, v, vt], … ]` from every tree, in DOM order
- **sections**: `{ "tree-1": [...], "tree-2": [...] }`

In `flat` mode each path begins with `/<treeName>/…` so the server
can still demultiplex.

## Properties

| Property | Description |
|---|---|
| `.value` (get) | the JSON string above |

## Methods

| Method | Description |
|---|---|
| `getValues()`        | structured data (array or object depending on `output`) |
| `setValues(data)`    | restore from a matching shape |
| `checkAll()`         | check every leaf in every tree |
| `uncheckAll()`       | clear every leaf in every tree |
| `getSummaryHTML()`   | concatenated summary of every tree (consumed by `<closure-summary>`) |

## Events

| Event | Bubbles | Detail |
|---|---|---|
| `change` | yes (from the trees) | (none) |

## Example

```html
<closure-checkbox-group name="privileges" output="sections" summary="priv-summary">
  <closure-checkbox-tree name="users">
    <cbt-item name="view"   label="View users"></cbt-item>
    <cbt-item name="edit"   label="Edit users"></cbt-item>
  </closure-checkbox-tree>
  <closure-checkbox-tree name="reports">
    <cbt-item name="view"   label="View reports"></cbt-item>
    <cbt-item name="export" label="Export reports"></cbt-item>
  </closure-checkbox-tree>
</closure-checkbox-group>

<closure-summary id="priv-summary" source="privileges"></closure-summary>
```

## Behaviour

> **Note:** the group is `formAssociated` itself (via ElementInternals)
> — when the form serialises, the group submits one field; its child
> trees do not submit individually.

> **Note:** in `flat` mode, `setValues(data)` filters entries by their
> leading `/<treeName>/` so each tree gets only its own subset. Cross-tree
> noise is silently ignored.

> **Note:** `src` is read once on connect. To re-seed later, call
> `setValues(...)` with the new payload.

---
%%>*/

class CheckboxGroup extends HTMLElement {
  static formAssociated = true;

  static _styleId = 'closure-checkbox-group-default-style';
  static _style = [
    'closure-checkbox-group { display: block; }',
  ].join('\n');

  static get observedAttributes() { return ['readonly']; }

  constructor() {
    super();
    this._internals = this.attachInternals();
  }

  // ---
  attributeChangedCallback(name) {
    if (name === 'readonly' && this.isConnected) {
      this._applyReadonly();
    }
  }

  _applyReadonly() {
    var ro = this.hasAttribute('readonly');
    this._getTrees().forEach(function(tree) {
      if (ro) tree.setAttribute('readonly', '');
      else tree.removeAttribute('readonly');
    });
  }

  // ---
  connectedCallback() {
    if (this._initialized) return;
    this._initialized = true;
    if (!document.getElementById(CheckboxGroup._styleId)) {
      var s = document.createElement('style');
      s.id = CheckboxGroup._styleId;
      s.textContent = CheckboxGroup._style;
      document.head.appendChild(s);
    }
    var self = this;
    this.addEventListener('change', function() { self._updateFormValue(); });
    var init = function() {
      self._loadFromSrc();
      self._updateFormValue();
      // A readonly attribute parsed before the children existed had
      // nothing to propagate to — re-apply it now
      if (self.hasAttribute('readonly')) self._applyReadonly();
    };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
      requestAnimationFrame(init);
    }
  }

  _loadFromSrc() {
    var srcId = this.getAttribute('src');
    if (!srcId) return;
    var el = document.getElementById(srcId);
    if (!el) return;
    try {
      var data = JSON.parse(el.textContent);
      if (data && (Array.isArray(data) ? data.length > 0 : Object.keys(data).length > 0)) {
        this.setValues(data);
      }
    } catch (e) { }
  }

  _getTrees() {
    return this.querySelectorAll('closure-checkbox-tree');
  }

  _getData() {
    var trees = this._getTrees();
    var output = this.getAttribute('output') || 'flat';

    if (output === 'sections') {
      var obj = {};
      trees.forEach(function(tree) {
        obj[tree.getAttribute('name') || ''] = tree.getValues();
      });
      return obj;
    }

    // flat
    var arr = [];
    trees.forEach(function(tree) {
      var vals = tree.getValues();
      for (var i = 0; i < vals.length; i++) arr.push(vals[i]);
    });
    return arr;
  }

  _updateFormValue() {
    this._internals.setFormValue(JSON.stringify(this._getData()));
    var sid = this.getAttribute('summary');
    if (sid) {
      var t = document.getElementById(sid);
      if (t && typeof t.refresh === 'function') t.refresh(this.getSummaryHTML());
    }
  }

  getSummaryHTML() {
    var html = '';
    this._getTrees().forEach(function(tree) {
      html += tree.getSummaryHTML();
    });
    return html;
  }

  // ---
  get value() {
    return JSON.stringify(this._getData());
  }

  // Setter so a server `set-value` (el.value = JSON) restores the group instead
  // of silently no-opping on a getter-only property.
  set value(v) {
    try { this.setValues(typeof v === 'string' ? JSON.parse(v) : v); } catch (e) {}
  }

  getValues() {
    return this._getData();
  }

  setValues(data) {
    var trees = this._getTrees();
    var output = this.getAttribute('output') || 'flat';

    if (output === 'sections' && data && !Array.isArray(data)) {
      trees.forEach(function(tree) {
        var name = tree.getAttribute('name') || '';
        if (data[name]) tree.setValues(data[name]);
      });
    } else if (Array.isArray(data)) {
      trees.forEach(function(tree) {
        var prefix = '/' + (tree.getAttribute('name') || '') + '/';
        var subset = data.filter(function(entry) {
          return entry[0].indexOf(prefix) === 0;
        });
        if (subset.length > 0) tree.setValues(subset);
      });
    }

    this._updateFormValue();
  }

  checkAll() {
    this._getTrees().forEach(function(tree) { tree.checkAll(); });
    this._updateFormValue();
  }

  uncheckAll() {
    this._getTrees().forEach(function(tree) { tree.uncheckAll(); });
    this._updateFormValue();
  }
}

customElements.define('closure-checkbox-group', CheckboxGroup);
