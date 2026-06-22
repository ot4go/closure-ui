/*<%% note:
# `<closure-checkbox-tree>`

Cascading checkbox tree with Shadow DOM. The structure is declared in
light DOM via `<cbt-item>` children; the actual checkboxes are
rendered inside the shadow root. `formAssociated`, so the tree
participates in form submission as a single field.

Two visual modes:

| Mode | Trigger | Shows |
|---|---|---|
| **Collapsed** | default | root label + three buttons `All(1)` / `None(0)` / `Custom(2)`; `Custom` opens a `<closure-lightbox>` with the full tree |
| **Expanded**  | `expanded` attr | full checkbox tree inline |

## Attributes

| Attribute | Description |
|---|---|
| `name="x"`              | tree name (used in paths and as the form field name) |
| `expanded`              | render the full tree inline instead of the collapsed pill |
| `readonly`              | disable every checkbox in shadow DOM |
| `label-all="All"`       | label for the All state |
| `label-none="None"`     | label for the None state |
| `label-custom="Custom"` | label for the Custom state |

## Children

`<cbt-item>` elements (see [`<cbt-item>`](#cbt-item)). May nest to any
depth; intermediate items become parent rows that aggregate the state
of their descendants.

## Form value

The form value is a minified JSON string with the shape:

```json
[ [path, v, vt], … ]
```

| Field | Meaning |
|---|---|
| `path` | leading-slash path through the tree, e.g. `/section/sub-1` |
| `v`    | leaf value — `0` (off) or non-zero (on); `null` for parents |
| `vt`   | tree value — `0` (none), `1` (all), `2` (custom); `null` for leaves |

## Properties

| Property | Description |
|---|---|
| `.value` (get) | the JSON string above |

## Methods

| Method | Description |
|---|---|
| `getValues()`     | array of `[path, v, vt]` for all nodes |
| `setValues(arr)`  | restore from `[[path, v, vt], …]` |
| `checkAll()`      | check every leaf |
| `uncheckAll()`    | uncheck every leaf |
| `getSummaryHTML()`| markdown-ish summary used by `<closure-summary>` |

## Events

| Event | Bubbles | Detail |
|---|---|---|
| `change` | yes | (none) |

Fired on any leaf or parent state change.

## Example

```html
<closure-checkbox-tree name="privileges">
  <cbt-item name="users" label="Users">
    <cbt-item name="view"   label="View"></cbt-item>
    <cbt-item name="edit"   label="Edit"></cbt-item>
    <cbt-item name="delete" label="Delete" tip="Permanent"></cbt-item>
  </cbt-item>
  <cbt-item name="reports" label="Reports">
    <cbt-item name="view"   label="View"></cbt-item>
    <cbt-item name="export" label="Export"></cbt-item>
  </cbt-item>
</closure-checkbox-tree>
```

## Behaviour

> **Note:** the **Custom** button opens a `<closure-lightbox>`
> containing the expanded tree. Picks made there commit on close.
> The collapsed/expanded distinction is purely visual — the form value
> format is identical in both modes.

> **Note:** parent rows have **tri-state** semantics: an indeterminate
> visual state when descendants are mixed, fully checked when every
> descendant is on, fully unchecked when every descendant is off.

> **Note:** `setValues` ignores entries whose `path` doesn't exist in
> the current tree. Useful when restoring data from a wider permission
> set than is currently displayed.

---
%%>*/

class CheckboxTree extends HTMLElement {
  static formAssociated = true;

  static _styleId = 'closure-checkbox-tree-default-style';
  static _style = [
    'closure-checkbox-tree { display: block; }',
    'cbt-item { display: none; }',
  ].join('\n');

  static get observedAttributes() { return ['readonly']; }

  constructor() {
    super();
    this._internals = this.attachInternals();
    this.attachShadow({ mode: 'open' });
  }

  // ---
  attributeChangedCallback(name) {
    if (name === 'readonly' && this.isConnected) {
      this._applyReadonly();
    }
  }

  // ---
  _applyReadonly() {
    var ro = this.hasAttribute('readonly');
    this.shadowRoot.querySelectorAll('input[type="checkbox"]').forEach(function(cb) {
      cb.disabled = ro;
    });
    this.shadowRoot.querySelectorAll('closure-btn-item').forEach(function(btn) {
      if (ro) btn.setAttribute('disabled', '');
      else btn.removeAttribute('disabled');
    });
  }

  // ---
  connectedCallback() {
    if (this._initialized) return;
    this._initialized = true;
    if (!document.getElementById(CheckboxTree._styleId)) {
      var s = document.createElement('style');
      s.id = CheckboxTree._styleId;
      s.textContent = CheckboxTree._style;
      document.head.appendChild(s);
    }
    var self = this;
    var init = function() { self._build(); };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
      requestAnimationFrame(init);
    }
  }

  // ---
  _build() {
    this._buildTreeData();
    if (this.hasAttribute('expanded')) {
      this._renderExpanded();
    } else {
      this._renderCollapsed();
    }

    // Load from data island
    this._loadFromSrc();
    this._updateFormValue();

    // A readonly attribute parsed before the build ran on an empty
    // shadow root — re-apply it now that the checkboxes exist
    if (this.hasAttribute('readonly')) this._applyReadonly();
  }

  // ---
  _buildTreeData() {
    this._treeRoot = document.createElement('ul');
    this._treeRoot.className = 'cbt-root';
    var items = this.querySelectorAll(':scope > cbt-item');
    var self = this;
    // Paths include the tree's name (`/<treeName>/<item>/…`) — that's
    // the prefix _loadFromSrc and the group's flat setValues filter by
    var treeName = this.getAttribute('name') || '';
    var base = treeName ? '/' + treeName : '';
    items.forEach(function(item) {
      self._treeRoot.appendChild(self._buildNode(item, base));
    });

    // Listen for checkbox changes on the tree
    this._treeRoot.addEventListener('change', function(e) {
      if (e.target.type !== 'checkbox') return;
      self._cascadeDown(e.target);
      self._cascadeUp(e.target);
      self._updateFormValue();
      if (!self.hasAttribute('expanded')) self._updateCollapsedState();
      self.dispatchEvent(new Event('change', { bubbles: true }));
    });
  }

  // ---
  _renderExpanded() {
    var shadow = this.shadowRoot;
    shadow.innerHTML = '';

    var style = document.createElement('style');
    style.textContent = [
      ':host { display: block; }',
      'ul { list-style: none; padding-left: 20px; margin: 0; }',
      '.cbt-root { padding-left: 0; }',
      'li { margin: 4px 0; }',
      'label { cursor: pointer; user-select: none; }',
    ].join('\n');
    shadow.appendChild(style);
    shadow.appendChild(this._treeRoot);
  }

  // ---
  _renderCollapsed() {
    var shadow = this.shadowRoot;
    shadow.innerHTML = '';
    var self = this;

    var lblAll = this.getAttribute('label-all') || 'All';
    var lblNone = this.getAttribute('label-none') || 'None';
    var lblCustom = this.getAttribute('label-custom') || 'Custom';
    var rootLabel = this.getAttribute('label') || this.getAttribute('name') || '';

    var style = document.createElement('style');
    style.textContent = [
      ':host { display: block; }',
      '.cbt-collapsed { display: inline-flex; align-items: center; gap: 0; padding: 2px 0; }',
      '.cbt-label { font-weight: 600; padding-right: 6px; font-size: 13px; }',
      '.cbt-bar { display: inline-flex; border: 1px solid var(--border, #ccc); border-radius: 3px; overflow: hidden; gap: 0; }',
      '.cbt-bar closure-btn-item { display: block; border-right: 1px solid var(--border, #ccc); --btn-item-padding: 2px 8px; --btn-item-font-size: 11px; --btn-item-gap: 4px; --primary-light: #d0d0d0; margin: 0; }',
      '.cbt-bar closure-btn-item:last-child { border-right: none; }',
      'closure-btn-item[active] { background: #4a90d9; --text: #fff; --primary-light: #3a7bc8; }',
      'closure-btn-item:not([active]) { background: #f5f5f5; }',
      // Hidden tree for data
      'ul { list-style: none; padding-left: 20px; margin: 0; display: none; }',
      '.cbt-root { padding-left: 0; }',
      'li { margin: 4px 0; }',
      'label { cursor: pointer; user-select: none; }',
    ].join('\n');
    shadow.appendChild(style);

    // Collapsed bar
    var bar = document.createElement('div');
    bar.className = 'cbt-collapsed';

    var labelSpan = document.createElement('span');
    labelSpan.className = 'cbt-label';
    labelSpan.textContent = rootLabel;
    bar.appendChild(labelSpan);

    this._btnAll = document.createElement('closure-btn-item');
    this._btnAll.setAttribute('data-action', 'all');
    this._btnAll.textContent = lblAll;

    this._btnNone = document.createElement('closure-btn-item');
    this._btnNone.setAttribute('data-action', 'none');
    this._btnNone.textContent = lblNone;

    this._btnCustom = document.createElement('closure-btn-item');
    this._btnCustom.setAttribute('data-action', 'custom');
    this._btnCustom.textContent = lblCustom;

    var btnBar = document.createElement('div');
    btnBar.className = 'cbt-bar';
    btnBar.appendChild(this._btnAll);
    btnBar.appendChild(this._btnNone);
    btnBar.appendChild(this._btnCustom);
    bar.appendChild(btnBar);

    btnBar.addEventListener('btn-action', function(e) {
      var action = e.target.getAttribute('data-action');
      if (action === 'all') {
        self.checkAll();
        self._updateCollapsedState();
        self.dispatchEvent(new Event('change', { bubbles: true }));
      } else if (action === 'none') {
        self.uncheckAll();
        self._updateCollapsedState();
        self.dispatchEvent(new Event('change', { bubbles: true }));
      } else if (action === 'custom') {
        self._openCustomDialog();
      }
    });

    shadow.appendChild(bar);

    // Hidden tree (keeps checkbox state)
    shadow.appendChild(this._treeRoot);

    this._updateCollapsedState();
  }

  // ---
  _updateCollapsedState() {
    if (this.hasAttribute('expanded')) return;
    var vt = this._computeRootVt();
    if (this._btnAll) { vt === 1 ? this._btnAll.setAttribute('active', '') : this._btnAll.removeAttribute('active'); }
    if (this._btnNone) { vt === 0 ? this._btnNone.setAttribute('active', '') : this._btnNone.removeAttribute('active'); }
    if (this._btnCustom) { vt === 2 ? this._btnCustom.setAttribute('active', '') : this._btnCustom.removeAttribute('active'); }
  }

  // ---
  _openCustomDialog() {
    var self = this;

    // Create lightbox with tree clone
    var lb = document.createElement('closure-lightbox');
    var title = this.getAttribute('label') || this.getAttribute('name') || 'Custom';
    lb.setAttribute('title', title);
    document.body.appendChild(lb);

    // Clone tree for editing
    var treeClone = this._treeRoot.cloneNode(true);
    treeClone.className = 'cbt-dlg-tree';
    // Sync checked state to clone
    var origCbs = this._treeRoot.querySelectorAll('input[type="checkbox"]');
    var cloneCbs = treeClone.querySelectorAll('input[type="checkbox"]');
    for (var i = 0; i < origCbs.length; i++) {
      cloneCbs[i].checked = origCbs[i].checked;
      cloneCbs[i].indeterminate = origCbs[i].indeterminate;
    }

    // Cascade in clone
    treeClone.addEventListener('change', function(e) {
      if (e.target.type !== 'checkbox') return;
      var cb = e.target;
      // cascade down
      var li = cb.closest('li');
      if (li) {
        var nested = li.querySelector('ul');
        if (nested) {
          nested.querySelectorAll('input[type="checkbox"]').forEach(function(c) {
            c.checked = cb.checked;
            c.indeterminate = false;
          });
        }
      }
      // cascade up
      self._cascadeUpIn(cb, treeClone);
    });

    // Wrap in div for styling
    var wrapper = document.createElement('div');
    var wrapStyle = document.createElement('style');
    wrapStyle.textContent = [
      'ul { list-style: none; padding-left: 20px; margin: 0; }',
      '.cbt-dlg-tree { padding-left: 0; }',
      'li { margin: 4px 0; }',
      'label { cursor: pointer; user-select: none; }',
    ].join('\n');
    wrapper.appendChild(wrapStyle);
    wrapper.appendChild(treeClone);

    lb.addEventListener('lb-close', function(e) {
      if (e.detail.action === 'ok') {
        var cloneCbs = treeClone.querySelectorAll('input[type="checkbox"]');
        var origCbs = self._treeRoot.querySelectorAll('input[type="checkbox"]');
        for (var i = 0; i < origCbs.length; i++) {
          origCbs[i].checked = cloneCbs[i].checked;
          origCbs[i].indeterminate = cloneCbs[i].indeterminate;
        }
        self._updateFormValue();
        self._updateCollapsedState();
        self.dispatchEvent(new Event('change', { bubbles: true }));
      }
      lb.remove();
    }, { once: true });

    // Defer open — lightbox needs a frame to initialize its dialog
    requestAnimationFrame(function() {
      requestAnimationFrame(function() {
        lb.open({
          title: title,
          content: '',
          buttons: [
            { label: 'Cancel', action: 'cancel' },
            { label: 'OK', action: 'ok', primary: true },
          ],
        });
        lb._body.innerHTML = '';
        lb._body.appendChild(wrapper);
      });
    });
  }

  // ---
  _cascadeUpIn(cb, container) {
    var li = cb.closest('li');
    if (!li) return;
    var parentUl = li.parentElement;
    if (!parentUl || parentUl.tagName !== 'UL') return;
    var parentLi = parentUl.parentElement;
    if (!parentLi || parentLi.tagName !== 'LI') return;
    if (!container.contains(parentLi)) return;
    var parentCb = parentLi.querySelector(':scope > label input[type="checkbox"]');
    if (!parentCb) return;

    var siblings = parentUl.querySelectorAll(':scope > li > label input[type="checkbox"]');
    var checked = 0;
    var hasIndeterminate = false;
    for (var i = 0; i < siblings.length; i++) {
      if (siblings[i].checked) checked++;
      if (siblings[i].indeterminate) hasIndeterminate = true;
    }

    if (hasIndeterminate || (checked > 0 && checked < siblings.length)) {
      parentCb.checked = false;
      parentCb.indeterminate = true;
    } else if (checked === siblings.length) {
      parentCb.checked = true;
      parentCb.indeterminate = false;
    } else {
      parentCb.checked = false;
      parentCb.indeterminate = false;
    }

    this._cascadeUpIn(parentCb, container);
  }

  // ---
  _buildNode(cbtItem, parentPath) {
    var name = cbtItem.getAttribute('name') || '';
    var label = cbtItem.getAttribute('label') || name;
    var tip = cbtItem.getAttribute('tip') || '';
    var path = parentPath + '/' + name;
    var children = cbtItem.querySelectorAll(':scope > cbt-item');
    var hasChildren = children.length > 0;

    var li = document.createElement('li');
    var lbl = document.createElement('label');
    if (tip) lbl.title = tip;

    var cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.dataset.name = name;
    cb.dataset.path = path;
    cb.dataset.leaf = hasChildren ? '0' : '1';

    lbl.appendChild(cb);
    lbl.appendChild(document.createTextNode(' ' + label));
    li.appendChild(lbl);

    if (hasChildren) {
      var ul = document.createElement('ul');
      var self = this;
      children.forEach(function(child) {
        ul.appendChild(self._buildNode(child, path));
      });
      li.appendChild(ul);
    }

    return li;
  }

  // ---
  _cascadeDown(cb) {
    var li = cb.closest('li');
    if (!li) return;
    var nested = li.querySelector('ul');
    if (!nested) return;
    nested.querySelectorAll('input[type="checkbox"]').forEach(function(child) {
      child.checked = cb.checked;
      child.indeterminate = false;
    });
  }

  // ---
  _cascadeUp(cb) {
    var li = cb.closest('li');
    if (!li) return;
    var parentUl = li.parentElement;
    if (!parentUl || parentUl.tagName !== 'UL') return;
    var parentLi = parentUl.parentElement;
    if (!parentLi || parentLi.tagName !== 'LI') return;
    var parentCb = parentLi.querySelector(':scope > label input[type="checkbox"]');
    if (!parentCb) return;

    var siblings = parentUl.querySelectorAll(':scope > li > label input[type="checkbox"]');
    var checked = 0;
    var hasIndeterminate = false;
    for (var i = 0; i < siblings.length; i++) {
      if (siblings[i].checked) checked++;
      if (siblings[i].indeterminate) hasIndeterminate = true;
    }

    if (hasIndeterminate || (checked > 0 && checked < siblings.length)) {
      parentCb.checked = false;
      parentCb.indeterminate = true;
    } else if (checked === siblings.length) {
      parentCb.checked = true;
      parentCb.indeterminate = false;
    } else {
      parentCb.checked = false;
      parentCb.indeterminate = false;
    }

    this._cascadeUp(parentCb);
  }

  // ---
  _updateIndeterminate() {
    var lists = this._treeRoot.querySelectorAll('ul');
    for (var i = lists.length - 1; i >= 0; i--) {
      var parentLi = lists[i].parentElement;
      if (!parentLi || parentLi.tagName !== 'LI') continue;
      var parentCb = parentLi.querySelector(':scope > label input[type="checkbox"]');
      if (!parentCb) continue;
      var children = lists[i].querySelectorAll(':scope > li > label input[type="checkbox"]');
      var checked = 0;
      var hasIndeterminate = false;
      for (var j = 0; j < children.length; j++) {
        if (children[j].checked) checked++;
        if (children[j].indeterminate) hasIndeterminate = true;
      }
      if (hasIndeterminate || (checked > 0 && checked < children.length)) {
        parentCb.checked = false;
        parentCb.indeterminate = true;
      } else if (checked === children.length) {
        parentCb.checked = true;
        parentCb.indeterminate = false;
      } else {
        parentCb.checked = false;
        parentCb.indeterminate = false;
      }
    }
  }

  // ---
  _computeVt(cb) {
    var li = cb.closest('li');
    var nested = li ? li.querySelector('ul') : null;
    if (!nested) return null;
    var children = nested.querySelectorAll(':scope > li > label input[type="checkbox"]');
    var checked = 0;
    var hasIndeterminate = false;
    for (var i = 0; i < children.length; i++) {
      if (children[i].checked) checked++;
      if (children[i].indeterminate) hasIndeterminate = true;
    }
    if (checked === 0 && !hasIndeterminate) return 0;
    if (checked === children.length && !hasIndeterminate) return 1;
    return 2;
  }

  // ---
  _computeRootVt() {
    var rootCbs = this._treeRoot.querySelectorAll('.cbt-root > li > label input[type="checkbox"]');
    var checked = 0;
    var hasIndeterminate = false;
    for (var i = 0; i < rootCbs.length; i++) {
      if (rootCbs[i].checked) checked++;
      if (rootCbs[i].indeterminate) hasIndeterminate = true;
    }
    if (rootCbs.length === 0) return 0;
    if (checked === 0 && !hasIndeterminate) return 0;
    if (checked === rootCbs.length && !hasIndeterminate) return 1;
    return 2;
  }

  // ---
  _isSendOnlyActive() {
    if (this.hasAttribute('send-only-active')) return true;
    var group = this.closest('closure-checkbox-group');
    return group && group.hasAttribute('send-only-active');
  }

  // ---
  getValues() {
    var result = [];
    if (!this._treeRoot) return result;
    var self = this;
    var onlyActive = this._isSendOnlyActive();

    this._treeRoot.querySelectorAll('input[type="checkbox"]').forEach(function(cb) {
      var path = cb.dataset.path;
      var isLeaf = cb.dataset.leaf === '1';
      if (isLeaf) {
        var v = cb.checked ? 1 : 0;
        if (!onlyActive || v) result.push([path, v, null]);
      } else {
        var vt = self._computeVt(cb);
        if (!onlyActive || vt) result.push([path, null, vt]);
      }
    });

    return result;
  }

  // ---
  setValues(arr) {
    if (!arr) return;

    // Build lookup by path
    var lookup = {};
    for (var i = 0; i < arr.length; i++) {
      lookup[arr[i][0]] = arr[i];
    }

    // Reset all
    this._treeRoot.querySelectorAll('input[type="checkbox"]').forEach(function(cb) {
      cb.checked = false;
      cb.indeterminate = false;
    });

    // Parents with vt=1: check all descendants
    this._treeRoot.querySelectorAll('input[type="checkbox"]').forEach(function(cb) {
      var entry = lookup[cb.dataset.path];
      if (!entry) return;
      if (cb.dataset.leaf === '0' && entry[2] === 1) {
        cb.checked = true;
        cb.indeterminate = false;
        var li = cb.closest('li');
        if (li) {
          li.querySelectorAll('input[type="checkbox"]').forEach(function(c) {
            c.checked = true;
            c.indeterminate = false;
          });
        }
      }
    });

    // Leaf values
    this._treeRoot.querySelectorAll('input[type="checkbox"]').forEach(function(cb) {
      if (cb.dataset.leaf !== '1') return;
      var entry = lookup[cb.dataset.path];
      if (entry) {
        cb.checked = !!entry[1];
        cb.indeterminate = false;
      }
    });

    // Fix indeterminate states bottom-up
    this._updateIndeterminate();
    if (!this.hasAttribute('expanded')) this._updateCollapsedState();
    this._updateFormValue();
  }

  // ---
  _loadFromSrc() {
    var srcId = this.getAttribute('src');
    if (!srcId) {
      var group = this.closest('closure-checkbox-group');
      if (group) srcId = group.getAttribute('src');
    }
    if (!srcId) return;
    var el = document.getElementById(srcId);
    if (!el) return;
    try {
      var data = JSON.parse(el.textContent);
      if (!Array.isArray(data)) return;
      var prefix = '/' + (this.getAttribute('name') || '') + '/';
      var subset = data.filter(function(entry) {
        return entry[0].indexOf(prefix) === 0;
      });
      if (subset.length > 0) this.setValues(subset);
    } catch (e) {}
  }

  // ---
  _buildSummaryUL(parentUl) {
    var html = '';
    var children = parentUl.querySelectorAll(':scope > li');
    for (var i = 0; i < children.length; i++) {
      var li = children[i];
      var cb = li.querySelector(':scope > label input[type="checkbox"]');
      if (!cb) continue;
      var label = cb.dataset.name;
      // Use the label text from the <label> element
      var lblEl = cb.parentElement;
      if (lblEl) label = lblEl.textContent.trim();
      // label is data-derived text and ends up in innerHTML — escape it
      label = String(label || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      var nested = li.querySelector(':scope > ul');
      if (nested) {
        var sub = this._buildSummaryUL(nested);
        if (cb.checked || cb.indeterminate) {
          html += '<li><strong>' + label + '</strong>' + sub + '</li>';
        }
      } else {
        if (cb.checked) {
          html += '<li>' + label + '</li>';
        }
      }
    }
    return html ? '<ul>' + html + '</ul>' : '';
  }

  // ---
  getSummaryHTML() {
    if (!this._treeRoot) return '';
    return this._buildSummaryUL(this._treeRoot);
  }

  // ---
  _notifySummary() {
    var source = this.closest('closure-checkbox-group') || this;
    var sid = source.getAttribute('summary');
    if (sid) {
      var t = document.getElementById(sid);
      if (t && typeof t.refresh === 'function') t.refresh(source.getSummaryHTML());
    }
  }

  // ---
  _updateFormValue() {
    var group = this.closest('closure-checkbox-group');
    if (group) { group._updateFormValue(); return; }
    this._internals.setFormValue(JSON.stringify(this.getValues()));
    this._notifySummary();
  }

  // ---
  get value() {
    return JSON.stringify(this.getValues());
  }

  // ---
  checkAll() {
    this._treeRoot.querySelectorAll('input[type="checkbox"]').forEach(function(cb) {
      cb.checked = true;
      cb.indeterminate = false;
    });
    if (!this.hasAttribute('expanded')) this._updateCollapsedState();
    this._updateFormValue();
  }

  // ---
  uncheckAll() {
    this._treeRoot.querySelectorAll('input[type="checkbox"]').forEach(function(cb) {
      cb.checked = false;
      cb.indeterminate = false;
    });
    if (!this.hasAttribute('expanded')) this._updateCollapsedState();
    this._updateFormValue();
  }
}

customElements.define('closure-checkbox-tree', CheckboxTree);
