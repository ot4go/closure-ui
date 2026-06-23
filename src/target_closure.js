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

> **Optional by design — a feature, not a requirement.** The whole
> closure / template / form-grouping layer is opt-in. The custom inputs
> (`credential-pwd`, `closure-checkbox-tree`, `closure-checkbox-group`,
> `fingerprint-hands`) are form-associated and submit **natively** inside
> a plain `<form>`, and every display component (grids, tabs, status bars,
> lightbox, clock…) works with no closure at all. Reach for
> `<target-closure>` only when you want the server-driven workflow:
> posting without a full reload, response directives, dirty-state
> tracking, or combining several forms. Form grouping in particular is
> opt-in — the default is `group-behavior="none"`, and a plain `<form>`
> with no `closure` attribute always submits natively, untouched.

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

> **Note:** captured form submits are sent URL-encoded (not
> `multipart/form-data`), so **binary file uploads are not transported**.
> An `<input type="file">` is serialized like any other field, so the
> server receives the literal string `"[object File]"` as its value (a
> reliable "no real file" sentinel), never the contents. Use a plain
> native `<form enctype="multipart/form-data">` (no `closure` attribute,
> capture off) for file uploads.

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
| `unsubscribeTag(tagName, obj)` | remove a tag subscriber (e.g. a `<closure-lightbox>` on disconnect) |
| `dispatchTags(tags)`         | invoked by `ClosureResponse` to deliver the elements its subscribers requested |
| `loadContent(html)`          | replace inner HTML, re-resolve templates and forms, re-arm dirty / submit hooks |
| `cleanDirty(templates)`      | clear dirty flag — `"*"` for all, or `"a,b"` |

## Events

| Event | Bubbles | Cancelable | Detail |
|---|---|---|---|
| `closure-response-notify` | no | no | `{ html, ok, status, role }` — fired on the closure by `<closure-template>` after **every** settled response (`ok` true/false); the only exception is a closure detached mid-flight (see `closure-ghost-response`) |
| `closure-fetch-error` | yes | yes | `{ url, error, message }` — a **captured** submit / anchor fetch failed at the network level |
| `closure-ghost-response` (fired on `document`) | — | yes | `{ html, …, source }` — a response arrived for a closure/template **detached mid-flight**. Discarded by default; **`preventDefault()` to process it anyway**. Also fired by `<closure-template>` |

(Native `beforeunload` is hooked when at least one template inside
declares `<template-lock-dirty block-unload>` — see below.)

### Captured GET forms

A captured `method="GET"` form follows native HTML semantics: the form data
**replaces** any query string already on the `action` (it is not appended). So
`<form method="GET" action="/search?tipo=admin">` submitting `q=juan` requests
`/search?q=juan`, not `/search?tipo=admin&q=juan` — matching what the browser
would do natively. (Captured anchors keep their `href` query intact.)

Add **`preserve`** to the form to opt out and **keep** the action's existing
query, appending the form data instead (`/search?tipo=admin&q=juan`) — for the
cases where the `action` carries fixed params you want to retain.

### Network errors on captured fetches

When a captured form submit or anchor click (`capture-inner-content`) fails
at the **network** level, the closure does **not** replace its body — doing
so would destroy the user's half-filled form. Instead it dispatches a
cancelable `closure-fetch-error` event and leaves the DOM untouched, so the
action stays retryable.

**The error policy is yours to define.** Listen for the event and show a
toast, open a `<closure-lightbox>`, offer a retry, or ignore it — the
component imposes nothing. Call `preventDefault()` to signal you handled it;
otherwise the closure logs the error to the console as a fallback.

```js
myClosure.addEventListener('closure-fetch-error', (e) => {
  e.preventDefault();                  // take over — suppress the console fallback
  showToast('Network error — please retry', e.detail.message);
});
```

> **Note:** this covers only **network-level** failures (the `fetch`
> rejected). An HTTP error *response* (4xx/5xx) that carries a body — e.g.
> server-rendered validation HTML — is still rendered into the closure as
> before; that path is unchanged.

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

> **Note:** captured submits / anchor clicks (`capture-inner-content`)
> are guarded against re-entry — while one fetch is open a second
> capture is ignored, so a fast double-click can't fire duplicate
> requests. (Template-routed posts have their own equivalent guard.)

> **Ghost responses.** A `fetch` resolves even if the closure (or template)
> was removed from the DOM while the request was in flight — a SPA navigating
> away, a container replaced by another response. Because `ClosureResponse`
> mutates the **live, global** DOM (`getElementById` / `querySelector`),
> processing a dead component's response could pop a lightbox or redirect out
> of nowhere. So the default is to **discard** it. To override, listen on
> `document` for `closure-ghost-response` and `preventDefault()` — the
> response is then processed as usual (use this if a late redirect / side
> effect must still apply). `detail` carries the `html` and the originating
> element as `source`.
>
> ```js
> document.addEventListener('closure-ghost-response', (e) => {
>   if (shouldStillApply(e.detail)) e.preventDefault(); // process it anyway
> });
> ```

---
%%>*/


class TargetClosure extends HTMLElement {
  connectedCallback() {
    // Re-arm the window-level beforeunload guard on EVERY connect: a SPA that
    // detaches and re-attaches the closure would otherwise lose it (the heavy
    // init below is gated by _initialized, and element-level listeners survive
    // re-attachment — but a window listener does not). addEventListener dedupes
    // by (type, listener), so re-adding the same bound handler is a no-op.
    if (!this._boundBeforeUnload) this._boundBeforeUnload = this._onBeforeUnload.bind(this);
    window.addEventListener('beforeunload', this._boundBeforeUnload);

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
      // Get data from the button — or from the btn-item that triggered
      // it, carried in detail.source (items dispatch on their parent)
      var source = (e.detail && e.detail.source && e.detail.source.getBtnData) ? e.detail.source
        : (e.target.getBtnData ? e.target : btn);
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

      // Only forms that opt in with the `closure` attribute are routed
      // to a template; `closure="name"` must match this closure's name
      var closureName = form.getAttribute('closure');
      var bound = form.hasAttribute('closure') &&
        (closureName === '' || closureName === (this.getAttribute('name') || ''));
      if (bound) {
        var template = this._findTemplate('');
        if (template) {
          e.preventDefault();
          template.execute('', this._collectForms(), form);
          return;
        }
      }

      // Not closure-bound (or no template): check capture-inner-content
      var mode = this.getAttribute('capture-inner-content') || 'none';
      if (mode === 'forms' || mode === 'all' ||
          (mode === 'targeted' && form.hasAttribute('response-lightbox'))) {
        e.preventDefault();
        this._fetchAndReplace(form.action || window.location.href, {
          method: form.method || 'POST',
          body: new URLSearchParams(new FormData(form)),
          preserveQuery: form.hasAttribute('preserve')
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

  unsubscribeTag(tagName, obj) {
    var subs = this._tagSubscribers[tagName.toLowerCase()];
    if (!subs) return;
    var i = subs.indexOf(obj);
    if (i >= 0) subs.splice(i, 1);
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
        // Iterate a COPY: a subscriber's onClosureTag may remove itself (a
        // lightbox closing → disconnectedCallback → unsubscribeTag → splice),
        // which would shift indices and silently skip the next subscriber.
        subs.slice().forEach(function(obj) {
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
    // In-flight guard: a captured submit / anchor click must not issue a
    // second request while the first is open (e.g. a fast double-click).
    // Mirrors the guard <closure-template> already has for its own posts.
    if (this._captureInFlight) return;
    opts = opts || {};
    opts.credentials = opts.credentials || 'same-origin';
    var method = (opts.method || 'GET').toUpperCase();
    if (method === 'GET' || method === 'HEAD') {
      if (opts.body) {
        if (opts.preserveQuery) {
          // Opt-out (`preserve` on the form): keep the action's existing query
          // string and append the form data to it, instead of the W3C replace.
          var sep = url.includes('?') ? '&' : '?';
          url = url + sep + opts.body.toString();
        } else {
          // W3C: a native GET form submission DISCARDS any query string already
          // on the action and replaces it with the form data — match that.
          url = url.split('#')[0].split('?')[0] + '?' + opts.body.toString();
        }
        delete opts.body;
      }
    }
    this._captureInFlight = true;
    fetch(url, opts).then(function(r) {
      // Error bodies (e.g. validation HTML on 4xx) are still rendered
      return r.text();
    }).then(function(html) {
      self._captureInFlight = false;
      // Ghost-response: the closure was detached mid-flight (SPA tore it down).
      // loadContent runs ClosureResponse, which mutates the live global DOM, so
      // by default we DISCARD; the app can listen for `closure-ghost-response`
      // (on document) and preventDefault() to process it anyway.
      if (!self.isConnected) {
        var ghost = new CustomEvent('closure-ghost-response', {
          cancelable: true,
          detail: { url: url, html: html, source: self },
        });
        if (document.dispatchEvent(ghost)) return; // not prevented → discard
      }
      // loadContent re-wires templates/forms and runs closure-response
      // directives — a bare innerHTML would insert them inert
      self.loadContent(html);
    }).catch(function(err) {
      self._captureInFlight = false;
      if (!self.isConnected) return; // detached — nothing to surface to
      // Don't wipe the closure body on a transient network error — it holds
      // the user's half-filled form. Surface a cancelable event so the app
      // can show a toast / offer a retry; call preventDefault() to take over.
      // If nobody handles it, the form simply stays put (and is retryable).
      var ev = new CustomEvent('closure-fetch-error', {
        bubbles: true,
        cancelable: true,
        detail: { url: url, error: err, message: err.message },
      });
      var taken = !self.dispatchEvent(ev); // dispatchEvent → false when preventDefault was called
      if (!taken) console.error('target-closure fetch failed:', err);
    });
  }

  _markDirty() {
    // Mark every named template dirty so dirty-template="x" scoping and
    // <template-dirty-clean templates="x"> have keys to act on; fall
    // back to _default when the closure has no named templates
    var self = this;
    var named = false;
    this.querySelectorAll('closure-template').forEach(function(t) {
      if (t.closest('target-closure') !== self) return;
      var name = t.getAttribute('name');
      if (name) { self._dirtyTemplates[name] = true; named = true; }
    });
    if (!named) this._dirtyTemplates['_default'] = true;
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
        var hands = fields[i].querySelectorAll('fingerprint-hands');
        for (var h = 0; h < hands.length; h++) {
          hands[h].setAttribute('readonly', '');
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
