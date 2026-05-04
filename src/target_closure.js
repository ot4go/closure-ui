/*<%% note:
# `<target-closure>`

Independent container for one logical workflow: a body of forms and
buttons, plus the `<closure-template>` declarations that describe how
each button posts and what to do with the response. Closures may be
nested — each is independent, and forms inside a child closure belong
to the child, not the parent.

A closure also tracks **dirty state** per template (so observed UI like
"unsaved changes" badges or beforeunload prompts can react), exposes a
**tag subscription** API for plugins like `<closure-lightbox>`, and can
optionally **capture** form submits / anchor clicks happening inside
its tree.

## Attributes

| Attribute | Description |
|---|---|
| `name="x"`                       | identity for `<form closure="name">` association from outside |
| `group-behavior="x"`             | how forms are gathered for submission — `none` (default), `combine-sections`, `combine-children` |
| `capture-inner-content="x"`      | which inner submits/clicks the closure intercepts — `none` (default), `targeted`, `forms`, `anchors`, `all` |

### `group-behavior` values

| Value | Effect |
|---|---|
| `none`              | each form is submitted on its own |
| `combine-sections`  | gather forms by section, **skip nested closures** |
| `combine-children`  | gather every form in the subtree, **including nested closures** |

### `capture-inner-content` values

| Value | Effect |
|---|---|
| `none`     | no capture (forms / anchors behave natively) |
| `targeted` | only forms/anchors with a `response-lightbox` attribute |
| `forms`    | every `<form>` submit inside |
| `anchors`  | every `<a>` click inside |
| `all`      | forms + anchors |

### Form association

| Markup | Belongs to |
|---|---|
| `<form closure>`              | the nearest enclosing closure |
| `<form closure="name">`       | the closure with that `name` (anywhere in the doc) |
| `<form>` (no `closure` attr)  | nothing — submits natively |

### Observable dirty-state attributes

Place on **any** descendant of a closure:

| Attribute | Effect |
|---|---|
| `dirty-show="show"` | visible when the closure is dirty, hidden when clean |
| `dirty-show="hide"` | hidden when dirty, visible when clean |
| `dirty-template="name"` | scope the watch to one template (default: any) |

## Public methods

| Method | Description |
|---|---|
| `subscribeTag(tagName, obj)` | route every `<tagName>` element in a server response to `obj.onClosureTag(tagName, el)` |
| `dispatchTags(tags)`         | invoked by `ClosureResponse` to deliver the elements its subscribers requested |
| `loadContent(html)`          | replace inner HTML, re-resolve templates and forms, re-arm dirty / submit hooks |
| `cleanDirty(templates)`      | clear dirty flag — `"*"` for all, or `"a,b"` |

## Events

| Event | Bubbles | Cancelable | Detail |
|---|---|---|---|
| `closure-template-response` | yes | no | `{ html, status, role }` — emitted by `<closure-template>` after a request |

(Native `beforeunload` is hooked when at least one template inside
declares `<template-lock-dirty block-unload>` — see below.)

## Inner declarative elements

Most of the workflow is configured via children. The reference for
each lives next to its component:

| Tag | Where to read more |
|---|---|
| `<closure-template>` and its children | see [`<closure-template>`](#closure-template) |
| `<closure-btn>`, `<closure-btn-item>` | see those entries — buttons fire roles handled by templates |
| `<closure-lightbox>`                  | uses `subscribeTag` to claim `<lightbox-response-item>` |

For brevity, only the closure-specific bits are listed here.

### Buttons inside a closure

| Attribute | Effect |
|---|---|
| `ct-role="x"`           | match the `<template-url>` / `<template-section>` whose `ct-role` is `x` |
| `closure-template="x"`  | aim a specific `<closure-template name="x">` (default: the first template) |

Without `ct-role`, the default `<template-url>` (and ct-role-less items)
are used.

### Dirty-state automation

| Element | Purpose |
|---|---|
| `<template-lock-dirty>` (inside a `<closure-template>`)   | control beforeunload blocking and per-role dirty filters |
| `<template-dirty-clean>` (inside a `<closure-template>`)  | declare when the dirty flag is cleared (on `result="ok"` or `result="always"`) and which templates to clean (`"*"` or `"a,b"`) |

`<template-lock-dirty>` accepts:

| Attribute | Description |
|---|---|
| `block-unload`     | hook `beforeunload` to confirm navigation when dirty |
| `message="x"`      | message text (browsers usually ignore custom strings now, but the prompt fires) |
| `ct-role="x"`      | only block when this role's template is dirty |
| `ignore`           | explicitly do **not** block for this role |

## Example

```html
<target-closure name="user-edit" group-behavior="combine-sections">
  <closure-template name="save">
    <template-url url="/admin/users/save" method="POST"
                  response-lightbox-id="result"></template-url>
    <template-section section="profile" mode="prefix"></template-section>
    <template-section section="prefs"   mode="json" name="prefs_json"></template-section>
    <template-field name="csrf" dyn-value-id="csrf-token"></template-field>
    <template-lock-dirty block-unload></template-lock-dirty>
    <template-dirty-clean result="ok" templates="save"></template-dirty-clean>
  </closure-template>

  <form closure section="profile">…</form>
  <form closure section="prefs">…</form>

  <btn-grid>
    <closure-btn ct-role="save" class="primary">Save</closure-btn>
    <closure-btn ct-role="cancel">Cancel</closure-btn>
  </btn-grid>

  <span dirty-show="show">●</span>
</target-closure>
```

## Behaviour

> **Note:** `subscribeTag` is the extension point for new
> response-driven elements. `<closure-lightbox>` uses it to receive
> `<lightbox-response-item>` from the server without
> `ClosureResponse` needing to know about lightboxes. Subscribers must
> implement `onClosureTag(tagName, element)`.

> **Note:** `_setReadonly` propagates the read-only state through all
> familiar field types — text inputs (`readOnly`), checkboxes / radios
> / selects (`disabled`), `credential-pwd`, `closure-checkbox-tree`,
> `closure-checkbox-group` and `fingerprint-hands`. Use
> `<template-edit-mode readonly section="…">` (or `section="*"`) inside
> a `<closure-template>` to declare this lock at markup time.

> **Note:** `loadContent(html)` rewires every template and form inside
> after replacing HTML, so server-pushed bodies (e.g. lightbox results)
> stay fully reactive.

---
%%>*/


class TargetClosure extends HTMLElement {
  connectedCallback() {
    if (this._initialized) return;
    this._initialized = true;
    this.style.display = 'contents';
    this._dirtyTemplates = this._dirtyTemplates || {};
    this._tagSubscribers = this._tagSubscribers || {};

    // Button actions (closure-btn with ct-role)
    this.addEventListener('btn-action', e => {
      if (e.target.closest('target-closure') !== this) return;
      var btn = e.target.closest('closure-btn');
      if (!btn || btn.hasAttribute('free')) return;
      // Get data from the button (or btn-item that triggered it)
      var source = e.target.getBtnData ? e.target : btn;
      var btnData = source.getBtnData();
      var role = btnData.ctRole;
      var templateName = btnData.closureTemplate;
      var template = this._findTemplate(templateName);
      if (template) {
        if (btn.hasAttribute('clean-dirty')) this.cleanDirty('*');
        template.execute(role, this._collectForms(), null, btnData);
      }
    });

    // Capture inner form submits
    this.addEventListener('submit', e => {
      if (e.target.closest('target-closure') !== this) return;
      var form = e.target;

      // If there's a template, route to it
      var template = this._findTemplate('');
      if (template) {
        e.preventDefault();
        template.execute('', this._collectForms(), form);
        return;
      }

      // No template: check capture-inner-content
      var mode = this.getAttribute('capture-inner-content') || 'none';
      if (mode === 'forms' || mode === 'all' ||
          (mode === 'targeted' && form.hasAttribute('response-lightbox'))) {
        e.preventDefault();
        this._fetchAndReplace(form.action || window.location.href, {
          method: form.method || 'POST',
          body: new URLSearchParams(new FormData(form))
        });
      }
    });

    // Capture inner anchor clicks
    this.addEventListener('click', e => {
      var a = e.target.closest('a[href]');
      if (!a) return;
      if (a.closest('target-closure') !== this) return;
      var mode = this.getAttribute('capture-inner-content') || 'none';
      if (mode === 'anchors' || mode === 'all' ||
          (mode === 'targeted' && a.hasAttribute('response-lightbox'))) {
        e.preventDefault();
        this._fetchAndReplace(a.href);
      }
    });

    // Dirty tracking
    this.addEventListener('input', e => {
      if (e.target.closest('target-closure') === this) this._markDirty();
    });
    this.addEventListener('change', e => {
      if (e.target.closest('target-closure') === this) this._markDirty();
    });

    // beforeunload
    this._boundBeforeUnload = this._onBeforeUnload.bind(this);
    window.addEventListener('beforeunload', this._boundBeforeUnload);

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => { this._updateDirtyVisibility(); this._applyEditMode(); }, { once: true });
    } else {
      this._updateDirtyVisibility();
      this._applyEditMode();
    }
  }

  // ---
  disconnectedCallback() {
    window.removeEventListener('beforeunload', this._boundBeforeUnload);
  }

  subscribeTag(tagName, obj) {
    var tag = tagName.toLowerCase();
    if (!this._tagSubscribers[tag]) this._tagSubscribers[tag] = [];
    this._tagSubscribers[tag].push(obj);
  }

  dispatchTags(tags) {
    if (!tags) return;
    var self = this;
    tags.forEach(function(el) {
      var tag = el.tagName.toLowerCase();
      /*<%% if:mockup %%>*/
      console.log('DBG dispatchTags: tag=', tag, 'subs=', (self._tagSubscribers[tag] || []).length, 'allSubs=', Object.keys(self._tagSubscribers));
      /*<%% end %%>*/
      var subs = self._tagSubscribers[tag];
      if (subs) {
        subs.forEach(function(obj) {
          /*<%% if:mockup %%>*/
          console.log('DBG dispatchTags: calling onClosureTag on', obj.tagName || obj.constructor.name);
          /*<%% end %%>*/
          obj.onClosureTag(tag, el);
        });
      }
    });
  }

  loadContent(html) {
    /*<%% if:mockup %%>*/
    console.log('DBG loadContent: html has closure-response=', html.indexOf('closure-response') >= 0, 'subscribers=', Object.keys(this._tagSubscribers));
    /*<%% end %%>*/
    var result = ClosureResponse.process(html, this);
    /*<%% if:mockup %%>*/
    console.log('DBG loadContent: result=', result);
    /*<%% end %%>*/
    if (result) {
      if (result.handled) return;
      html = result.html;
    }
    this.innerHTML = html;
  }

  _findTemplate(name) {
    var self = this;
    var all = Array.from(this.querySelectorAll('closure-template')).filter(function(t) {
      return t.closest('target-closure') === self;
    });
    if (!all.length) return null;
    if (name) {
      for (var i = 0; i < all.length; i++) {
        if (all[i].getAttribute('name') === name) return all[i];
      }
    }
    return all[0];
  }

  _collectForms() {
    var behavior = this.getAttribute('group-behavior') || 'none';
    if (behavior === 'none') return [];
    var self = this;
    var result = [];

    this.querySelectorAll('form[closure]').forEach(function(f) {
      if (behavior === 'combine-sections' && f.closest('target-closure') !== self) return;
      // combine-children: include all nested forms too
      result.push(f);
    });

    // External forms by name
    var name = this.getAttribute('name');
    if (name) {
      document.querySelectorAll('form[closure="' + name + '"]').forEach(function(f) {
        if (!self.contains(f)) result.push(f);
      });
    }

    return result;
  }

  _fetchAndReplace(url, opts) {
    var self = this;
    opts = opts || {};
    opts.credentials = opts.credentials || 'same-origin';
    var method = (opts.method || 'GET').toUpperCase();
    if (method === 'GET' || method === 'HEAD') {
      // Append params to URL, no body
      if (opts.body) {
        var sep = url.includes('?') ? '&' : '?';
        url = url + sep + opts.body.toString();
        delete opts.body;
      }
    }
    fetch(url, opts).then(function(r) {
      return r.text().then(function(html) {
        self.innerHTML = html;
      });
    }).catch(function(err) {
      self.innerHTML = '<p style="color:red;">Connection error: ' + err.message + '</p>';
    });
  }

  _markDirty() {
    this._dirtyTemplates['_default'] = true;
    this._updateDirtyVisibility();
  }

  cleanDirty(templates) {
    if (templates === '*' || templates === '') {
      this._dirtyTemplates = {};
    } else {
      var names = templates.split(',');
      for (var i = 0; i < names.length; i++) {
        delete this._dirtyTemplates[names[i].trim()];
      }
    }
    this._updateDirtyVisibility();
  }

  _isDirty(templateName) {
    if (!templateName) return Object.keys(this._dirtyTemplates).length > 0;
    return !!this._dirtyTemplates[templateName];
  }

  _updateDirtyVisibility() {
    var self = this;
    this.querySelectorAll('[dirty-show]').forEach(function(el) {
      if (el.closest('target-closure') !== self) return;
      var templateName = el.getAttribute('dirty-template') || '';
      var dirty = self._isDirty(templateName);
      var show = el.getAttribute('dirty-show');
      if (show === 'show') {
        el.style.display = dirty ? '' : 'none';
      } else if (show === 'hide') {
        el.style.display = dirty ? 'none' : '';
      }
    });
  }

  _applyEditMode() {
    var self = this;
    this.querySelectorAll('closure-template').forEach(function(t) {
      if (t.closest('target-closure') !== self) return;
      t.querySelectorAll('template-edit-mode[readonly]').forEach(function(em) {
        var section = em.getAttribute('section') || '*';
        self._setReadonly(section);
      });
    });
  }

  _setReadonly(section) {
    var self = this;
    var forms = this.querySelectorAll('form[closure]');
    forms.forEach(function(form) {
      if (form.closest('target-closure') !== self) return;
      var formSection = form.getAttribute('section') || '';
      if (section !== '*' && formSection !== section) return;

      var fields = form.querySelectorAll('closure-form-field');
      for (var i = 0; i < fields.length; i++) {
        fields[i].classList.add('cfr-ro');
        var inputs = fields[i].querySelectorAll('input, select, textarea');
        for (var j = 0; j < inputs.length; j++) {
          inputs[j].tabIndex = -1;
          if (inputs[j].type === 'checkbox' || inputs[j].type === 'radio') {
            inputs[j].disabled = true;
          } else if (inputs[j].tagName === 'SELECT') {
            inputs[j].disabled = true;
          } else {
            inputs[j].readOnly = true;
          }
        }
        var pwds = fields[i].querySelectorAll('credential-pwd');
        for (var k = 0; k < pwds.length; k++) {
          pwds[k].setAttribute('readonly', '');
          pwds[k].tabIndex = -1;
        }
        var trees = fields[i].querySelectorAll('closure-checkbox-tree');
        for (var t = 0; t < trees.length; t++) {
          trees[t].setAttribute('readonly', '');
        }
        var groups = fields[i].querySelectorAll('closure-checkbox-group');
        for (var g = 0; g < groups.length; g++) {
          groups[g].setAttribute('readonly', '');
        }
      }
    });
  }

  _onBeforeUnload(e) {
    if (!this._isDirty()) return;
    // Check if any template has template-lock-dirty with block-unload
    var self = this;
    var shouldBlock = false;
    this.querySelectorAll('closure-template').forEach(function(t) {
      if (t.closest('target-closure') !== self) return;
      var locks = t.querySelectorAll('template-lock-dirty[block-unload]');
      for (var i = 0; i < locks.length; i++) {
        if (locks[i].hasAttribute('ignore')) continue;
        shouldBlock = true;
      }
    });
    if (shouldBlock) e.preventDefault();
  }
}

customElements.define('target-closure', TargetClosure);
