/*<%% note:
# `ClosureResponse` (global object)

Processes server-response HTML for closure directives. Not a custom
element — it's a singleton object exposed on `window` and called by
`<closure-template>` when its `<template-response parse="closure-response">`
child is present.

The processor parses the response HTML looking for a top-level
`<closure-response>`. If none is found it returns `null` and the caller
uses the HTML verbatim. Otherwise it executes each declarative directive
inside (`<response-item>`) in order, optionally distributing content to
named sections.

## Public API

| Method | Purpose |
|---|---|
| `process(html, closure)` | main entry — see `<closure-template>` |

Returns:
- `null` — no `<closure-response>` in `html`; caller renders `html` itself
- `{ handled: true }` — sections mode, response was fully placed
- `{ handled: false, html: "…" }` — non-sections, caller may insert `html`

## Markup the processor recognises

```html
<closure-response [sections]>
  <response-item type="…" target-id="…" key="…" value="…" …></response-item>
  …
  <closure-response-section target-id="…" [raw]>
    <!-- HTML to render into target; may contain nested closure-response -->
  </closure-response-section>
  …
  <!-- Tags whose name was registered with closure.subscribeTag(...)
       are forwarded to the corresponding subscriber instead of being
       interpreted as response-items. -->
</closure-response>
```

Attributes on `<closure-response>`:

| Attribute | Description |
|---|---|
| `sections` | enable `<closure-response-section>` placement mode |
| `raw`      | skip parsing entirely; emit inner HTML verbatim |

Attributes on `<closure-response-section>`:

| Attribute | Description |
|---|---|
| `target-id="x"`            | `getElementById` destination |
| `target-selector="css"`    | `querySelector` destination |
| `target-selector-all="css"`| `querySelectorAll` destinations |
| `raw`                      | write content verbatim, skip nested parsing |

## `<response-item>` types

Every item supports the same target-resolution attributes
(`target-id`, `target-selector`, `target-selector-all`) — multiple may
coexist; results are concatenated.

### DOM
`hide`, `show` (`display="…"`), `clear-content`, `remove`,
`add-class`, `remove-class`, `toggle-class` (uses `key`),
`set-style` (uses `key` / `value`), `set-text`, `set-html`, `set-value`,
`set-attribute` (`key` / `value`), `remove-attribute` (`key`).

`set-value` sets `.checked` on checkbox / radio targets (truthy values are
`"1"`, `"true"` or `"on"`) and `.value` on every other element.

### Navigation
`redirect` (`url`), `refresh`, `push-state` / `replace-state`
(`url`, `state`), `go-back`, `open-url` (`url`, `target`).

### Lightbox
`close-lightbox` (closes nearest `[open]` lightbox or the targeted one),
`open-lightbox` (calls `.open()` on each target).

### Storage
`set-local-storage` / `set-session-storage` (`key`, `value`),
`remove-local-storage` / `remove-session-storage`
(by `key`, `pattern="ab*c"` glob, or `regex`),
`clear-local-storage` / `clear-session-storage`,
`set-cookie` (`key`, `value`, `path`, `max-age`, `secure`, `same-site`),
`remove-cookie` (`key` or `pattern` glob, optional `path`).

### Events
`dispatch-event` (`event="name"`, all `data-*` go to `detail`),
`trigger-click`.

### Forms
`reset-form`, `submit-form`, `focus` (focuses first target).

### Timing
`delay` (`ms="N"` — pauses the queue for N milliseconds),
`auto-redirect` (`url`, `ms`).

### Closure
`clean-dirty` (`templates="*"` or `"a,b"`),
`mark-dirty`,
`execute-template` (`closure-template`, `ct-role`).

## Behaviour

> **Security — trusted HTML only.** `set-html`, `set-text`'s sibling
> content actions and `<closure-response-section>` render server-provided
> markup **as HTML via `innerHTML`** (this is the point of the engine, like
> `htmx`). Treat every response body as **trusted**: it is the server's job
> to escape any user-derived data before sending it. Never route
> third-party / user-controlled HTML through `ClosureResponse` unescaped —
> use `set-text` (which uses `textContent`) for untrusted strings.

> **Note:** the queue executes synchronously **except** for `type="delay"`,
> which yields via `setTimeout` and resumes the rest of the queue in the
> callback. Subsequent items therefore run after the delay.
>
> When it resumes, the queue is **dropped if the owning closure was detached
> during the pause** (e.g. its container was replaced by a newer response), so a
> delayed item can't inject stale content into a torn-down context. Caveats: a
> dialog that is merely *hidden* (not removed from the DOM) stays connected, so
> its queue still resumes; and a full-page `redirect` clears the pending timer
> on unload regardless. Use `delay` for in-page sequencing, not as a guarantee
> that the tail runs.

> **Note:** elements whose tag is **not** `<response-item>` are forwarded
> to handlers registered with `closure.subscribeTag(tagName, obj)`. This
> is how `<closure-lightbox>` claims the `<lightbox-response-item>` tag
> without `ClosureResponse` knowing about it.

> **Note:** `<closure-response-section raw>` skips the recursive parse —
> useful when a section legitimately contains literal `<closure-response>`
> text (e.g. documentation pages).

---
%%>*/

var ClosureResponse = {

  process: function(html, closure) {
    var tmp = document.createElement('div');
    tmp.innerHTML = html;
    var cr = tmp.querySelector('closure-response');
    if (!cr) return null;

    // Raw: don't parse, pass through
    if (cr.hasAttribute('raw')) {
      cr.remove();
      return { handled: false, html: tmp.innerHTML };
    }

    // Process direct children in order — response-items execute, tags
    // dispatch. Deeper descendants belong to sections (placed later) or
    // to nested closure-responses (processed recursively), never here.
    var allChildren = Array.from(cr.children);
    /*<%% if:mockup %%>*/
    console.log('DBG process: cr.innerHTML=', cr.innerHTML);
    console.log('DBG process: found', allChildren.length, 'children in closure-response');
    allChildren.forEach(function(c) { console.log('DBG process child:', c.tagName.toLowerCase(), c.outerHTML.substring(0, 100)); });
    console.log('DBG process: closure=', !!closure, 'dispatchTags=', !!(closure && closure.dispatchTags));
    if (closure) console.log('DBG process: closure subscribers=', Object.keys(closure._tagSubscribers || {}));
    /*<%% end %%>*/
    var self = this;
    var i = 0;

    function processNext() {
      while (i < allChildren.length) {
        var child = allChildren[i++];
        var tagName = child.tagName.toLowerCase();
        /*<%% if:mockup %%>*/
        console.log('DBG processNext:', tagName);
        /*<%% end %%>*/
        if (tagName === 'closure-response-section') {
          // Sections carry content, not directives — placed below
          continue;
        }
        if (tagName === 'response-item') {
          var type = child.getAttribute('type') || '';
          if (type === 'delay') {
            var ms = parseInt(child.getAttribute('ms') || '0', 10);
            if (ms > 0) {
              // Resume the queue after the pause — but bail if the owning
              // closure was torn down meanwhile (its container got replaced by
              // a newer response), so we don't inject stale content. NOTE: only
              // catches a *detached* closure; a dialog merely hidden (not
              // removed) stays connected, and a full-page redirect clears this
              // timer on unload anyway.
              setTimeout(function() {
                if (closure && !closure.isConnected) return;
                processNext();
              }, ms);
              return;
            }
          } else {
            self._executeItem(child, type);
          }
        } else if (closure && closure.dispatchTags) {
          /*<%% if:mockup %%>*/
          console.log('DBG dispatching tag:', tagName, 'to closure');
          /*<%% end %%>*/
          closure.dispatchTags([child]);
        }
      }
    }
    processNext();

    // Check for sections (direct children only — nested ones belong to
    // their own closure-response and are placed by the recursive pass)
    if (cr.hasAttribute('sections')) {
      var sections = Array.from(cr.children).filter(function(el) {
        return el.tagName.toLowerCase() === 'closure-response-section';
      });
      for (var s = 0; s < sections.length; s++) {
        this._processSection(sections[s], closure);
      }
      return { handled: true };
    }

    // No sections: return remaining content (without the closure-response element)
    cr.remove();
    return { handled: false, html: tmp.innerHTML };
  },

  _processSection: function(section, closure) {
    var html = section.innerHTML;

    // Raw: pass content as-is, no processing
    if (section.hasAttribute('raw')) {
      var targets = this._resolveTargets(section);
      for (var i = 0; i < targets.length; i++) {
        if (targets[i].loadContent) targets[i].loadContent(html);
        else targets[i].innerHTML = html;
      }
      return;
    }

    // Recursively process nested closure-response (keep the closure so
    // subscribed tags inside nested responses still reach their handlers)
    var nested = this.process(html, closure);
    if (nested && nested.handled) return;
    var content = nested ? nested.html : html;

    // Distribute to targets
    var targets = this._resolveTargets(section);
    for (var i = 0; i < targets.length; i++) {
      targets[i].innerHTML = content;
    }
  },

  _executeItem: function(item, type) {
    var targets = this._resolveTargets(item);
    var key = item.getAttribute('key') || '';
    var value = item.getAttribute('value') || '';

    switch (type) {
    // --- DOM ---
    case 'hide':
      targets.forEach(function(el) { el.style.display = 'none'; });
      break;
    case 'show':
      var display = item.getAttribute('display') || '';
      targets.forEach(function(el) { el.style.display = display; });
      break;
    case 'clear-content':
      targets.forEach(function(el) { el.innerHTML = ''; });
      break;
    case 'remove':
      targets.forEach(function(el) { el.remove(); });
      break;
    case 'add-class':
      targets.forEach(function(el) { el.classList.add(key); });
      break;
    case 'remove-class':
      targets.forEach(function(el) { el.classList.remove(key); });
      break;
    case 'toggle-class':
      targets.forEach(function(el) { el.classList.toggle(key); });
      break;
    case 'set-style':
      targets.forEach(function(el) { el.style[key] = value; });
      break;
    case 'set-text':
      targets.forEach(function(el) { el.textContent = value; });
      break;
    case 'set-html':
      targets.forEach(function(el) { el.innerHTML = value; });
      break;
    case 'set-value':
      targets.forEach(function(el) {
        // Native checkbox/radio toggle via .checked; .value alone would
        // not change their checked state. Truthy = "1"/"true"/"on".
        if (el.type === 'checkbox' || el.type === 'radio') {
          el.checked = (value === '1' || value === 'true' || value === 'on');
        } else {
          el.value = value;
        }
      });
      break;
    case 'set-attribute':
      targets.forEach(function(el) { el.setAttribute(key, value); });
      break;
    case 'remove-attribute':
      targets.forEach(function(el) { el.removeAttribute(key); });
      break;

    // --- Navigation ---
    case 'redirect':
      window.location.href = item.getAttribute('url') || '';
      break;
    case 'refresh':
      window.location.reload();
      break;
    case 'push-state':
      history.pushState(
        { page: item.getAttribute('state') || '' },
        '',
        item.getAttribute('url') || ''
      );
      break;
    case 'replace-state':
      history.replaceState(
        { page: item.getAttribute('state') || '' },
        '',
        item.getAttribute('url') || ''
      );
      break;
    case 'go-back':
      history.back();
      break;
    case 'open-url':
      window.open(
        item.getAttribute('url') || '',
        item.getAttribute('target') || '_blank'
      );
      break;

    // --- Lightbox ---
    case 'close-lightbox':
      var lb = targets.length ? targets[0] : document.querySelector('light-box dialog[open], closure-lightbox dialog[open]');
      if (lb && lb.closest && lb.closest('light-box')) lb.closest('light-box').close('server');
      else if (lb && lb.close) lb.close('server');
      break;
    case 'open-lightbox':
      targets.forEach(function(el) { if (el.open) el.open(); });
      break;

    // --- Storage ---
    case 'set-local-storage':
      localStorage.setItem(key, value);
      break;
    case 'remove-local-storage':
      this._removeStorage(localStorage, item);
      break;
    case 'clear-local-storage':
      localStorage.clear();
      break;
    case 'set-session-storage':
      sessionStorage.setItem(key, value);
      break;
    case 'remove-session-storage':
      this._removeStorage(sessionStorage, item);
      break;
    case 'clear-session-storage':
      sessionStorage.clear();
      break;
    case 'set-cookie':
      var cookie = key + '=' + encodeURIComponent(value);
      if (item.getAttribute('path')) cookie += '; path=' + item.getAttribute('path');
      if (item.getAttribute('max-age')) cookie += '; max-age=' + item.getAttribute('max-age');
      if (item.hasAttribute('secure')) cookie += '; secure';
      if (item.getAttribute('same-site')) cookie += '; samesite=' + item.getAttribute('same-site');
      document.cookie = cookie;
      break;
    case 'remove-cookie':
      this._removeCookies(item);
      break;

    // --- Events ---
    case 'dispatch-event':
      var eventName = item.getAttribute('event') || '';
      var detail = {};
      for (var a = 0; a < item.attributes.length; a++) {
        if (item.attributes[a].name.startsWith('data-')) {
          detail[item.attributes[a].name.slice(5)] = item.attributes[a].value;
        }
      }
      targets.forEach(function(el) {
        el.dispatchEvent(new CustomEvent(eventName, { detail: detail, bubbles: false }));
      });
      break;
    case 'trigger-click':
      targets.forEach(function(el) { el.click(); });
      break;

    // --- Forms ---
    case 'reset-form':
      targets.forEach(function(el) { if (el.reset) el.reset(); });
      break;
    case 'submit-form':
      targets.forEach(function(el) { if (el.submit) el.submit(); });
      break;
    case 'focus':
      if (targets.length) targets[0].focus();
      break;

    // --- Timing ---
    case 'auto-redirect':
      var ms = parseInt(item.getAttribute('ms') || '3000', 10);
      var url = item.getAttribute('url') || '';
      setTimeout(function() { window.location.href = url; }, ms);
      break;

    // --- Closure ---
    case 'clean-dirty':
      var templates = item.getAttribute('templates') || '*';
      targets.forEach(function(el) { if (el.cleanDirty) el.cleanDirty(templates); });
      break;
    case 'mark-dirty':
      targets.forEach(function(el) { if (el._markDirty) el._markDirty(); });
      break;
    case 'execute-template':
      var tmplName = item.getAttribute('closure-template') || '';
      var role = item.getAttribute('ct-role') || '';
      targets.forEach(function(el) {
        if (el._findTemplate) {
          var tmpl = el._findTemplate(tmplName);
          if (tmpl) tmpl.execute(role, el._collectForms());
        }
      });
      break;

    // --- Target (set default target for content) ---
    case 'target':
      // Handled by caller, not here
      break;
    }
  },

  _resolveTargets: function(item) {
    var results = [];
    var id = item.getAttribute('target-id');
    if (id) {
      var el = document.getElementById(id);
      if (el) results.push(el);
    }
    var sel = item.getAttribute('target-selector');
    if (sel) {
      // Selectors arrive from the server — a malformed one (e.g. an unescaped
      // id like "#123-row") throws a DOMException. Swallow it so one bad
      // selector can't abort the whole response queue mid-render.
      try {
        var el = document.querySelector(sel);
        if (el) results.push(el);
      } catch (e) {
        console.warn('closure-response: invalid target-selector', sel, e);
      }
    }
    var selAll = item.getAttribute('target-selector-all');
    if (selAll) {
      try {
        document.querySelectorAll(selAll).forEach(function(el) { results.push(el); });
      } catch (e) {
        console.warn('closure-response: invalid target-selector-all', selAll, e);
      }
    }
    return results;
  },

  _removeStorage: function(storage, item) {
    var key = item.getAttribute('key');
    if (key) { storage.removeItem(key); return; }

    var pattern = item.getAttribute('pattern');
    var regex = item.getAttribute('regex');
    var re = null;

    if (pattern) {
      re = new RegExp('^' + pattern.replace(/\*/g, '.*').replace(/\?/g, '.') + '$');
    } else if (regex) {
      re = new RegExp(regex);
    }

    if (re) {
      var toRemove = [];
      for (var i = 0; i < storage.length; i++) {
        var k = storage.key(i);
        if (re.test(k)) toRemove.push(k);
      }
      toRemove.forEach(function(k) { storage.removeItem(k); });
    }
  },

  _removeCookies: function(item) {
    var key = item.getAttribute('key');
    var pattern = item.getAttribute('pattern');
    var path = item.getAttribute('path') || '/';

    if (key) {
      document.cookie = key + '=; max-age=0; path=' + path;
      return;
    }

    if (pattern) {
      var re = new RegExp('^' + pattern.replace(/\*/g, '.*').replace(/\?/g, '.') + '$');
      document.cookie.split(';').forEach(function(c) {
        var name = c.split('=')[0].trim();
        if (re.test(name)) {
          document.cookie = name + '=; max-age=0; path=' + path;
        }
      });
    }
  }
};
