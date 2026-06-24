/*<%% note:
# `<closure-template>`

Declarative submission spec for a `<target-closure>`. Holds the URL,
HTTP method, send behaviour, sections to package, hidden fields and
response handling for one or more button roles. Lives inside the
closure as a markup-only element (`display: none`) and is invoked by
the closure when a `<closure-btn>` fires.

Multiple templates may live inside one closure. The button's
`closure-template="…"` and `ct-role="…"` attributes pick which one
runs and which `<template-url>` / `<template-section>` set applies.

Think of it as the **recipe a `<closure-btn>` follows when it fires**: where to
POST, how to package the closure's forms, and what to do with the response — all
declared in markup instead of JavaScript, so a `<target-closure>` can run a
server workflow without a full page reload. It does not send binary uploads:
every field is repackaged into hidden inputs / JSON, so a file input needs a
native `<form enctype="multipart/form-data">` outside the closure flow.

## Attributes (on `<closure-template>`)

| Attribute | Description |
|---|---|
| `name="x"`                | template identity (matched by `closure-btn`'s `closure-template` attr) |
| `send-behavior="x"`       | `submit` (default) \| `submit-xform` \| `fetch` \| `fetch-json` \| `fetch-xform` |
| `parse="closure-response"`| pipe responses through `ClosureResponse` |
| `delegate-response`       | hand the response to the surrounding container (e.g. `<closure-lightbox>`) instead of writing it inline |

`submit-json` is intentionally **not** supported — there is no browser
enctype that produces a JSON body via form submit.

> **Note:** binary file uploads are **not** transported. The template
> repackages every field into a hidden-input form (and, in `fetch*` modes,
> URL-encodes or JSON-stringifies it), so an `<input type="file">` is
> serialized like any other field: the server receives the literal string
> `"[object File]"` as its value — never the file contents. That value is
> a reliable sentinel for "no real file was sent". Use a native
> `<form enctype="multipart/form-data">` outside the closure flow for
> actual uploads.

## Child elements

### `<template-url>` — destination

| Attribute | Description |
|---|---|
| `url="…"`                  | static URL |
| `dyn-url-id="id"`          | element whose value is read at submit time as the URL |
| `method="POST"`            | HTTP method (default `POST`) |
| `ct-role="x"`              | only applies when the firing button has this `ct-role` |
| `switch="<id> == v"`       | guard: only applies when the referenced control has this value (`!=` also supported) |
| `response-target-id="id"`  | element to receive the response body |
| `response-target-ok-id`    | overrides `response-target-id` on success |
| `response-target-fail-id`  | overrides `response-target-id` on failure |
| `response-lightbox-id`     | lightbox to receive `showResponse` / `showError` |
| `response-lightbox-ok-id`  | overrides on success |
| `response-lightbox-fail-id`| overrides on failure |
| `send-behavior="x"`        | per-role override of the template-level send-behavior |

URL resolution order: per-role `<template-url>` (dyn first, then static)
→ default `<template-url>` (dyn first, then static) → current page URL.

### `<template-section>` — data packaging

| Attribute | Description |
|---|---|
| `from-form="formName"` | name of the source form (matched against `<form name="…">`) |
| `name="x"`             | section key applied to fields when packaging |
| `mode="flat\|prefix\|json\|json-multi"` | how to flatten the section into the outgoing form |
| `prefix="x"`           | override the section name as the prefix (only with `mode="prefix"`) |
| `no-prefix`            | flatten without any prefix |
| `separator="x"`        | character between prefix and field (default `_`) |
| `switch="<id> == v"`   | guard (same syntax as `<template-url>`) |

### `<template-field>` — extra hidden fields

| Attribute | Description |
|---|---|
| `name="x"`           | hidden input name |
| `value="x"`          | static value |
| `dyn-value-id="id"`  | read value from another element at submit time |
| `switch="<id> == v"` | guard |

### `<template-loading>` — placeholder while in-flight

Inner HTML written into `response-target-*` while the request is open.
Cleared automatically when the response arrives.

### `<template-response-ok>` — success template

Inner HTML rendered into the response target on success.
Supports `{{code}}` and `{{text}}` substitutions for the HTTP status.

Add `target="id"` to render into a specific element. That target **wins**
over `response-target-id` / `response-target-ok-id`, which act only as the
**fallback** — the body is never injected into two places at once.

### `<template-response-fail>` — failure template

Inner HTML rendered on failure. Selected by best-match:

| Attribute | Description |
|---|---|
| `type="network\|http\|parse"` | match a specific failure family |
| `code="404"`                   | match a specific HTTP status |
| (none)                         | catch-all |

### `<template-lock-dirty>` / `<template-dirty-clean>`

Declarative dirty-state automation. Run after a request completes to
mark or clean the closure's dirty templates without code.

## Public methods

| Method | Description |
|---|---|
| `execute(role, forms, submittedForm, btnData)` | invoked by `<target-closure>` for the firing button |

## Behaviour

> **Note:** repeated field names (a checkbox group, `<select multiple>`)
> are **preserved**, not collapsed to the last value. In `fetch-json` they
> become a JSON **array** (`"roles":["admin","editor"]`); in `flat` /
> `prefix` packaging and `submit` / `fetch` modes they stay as multiple
> `name=…` pairs, matching native form encoding.

> **Note:** after a request the template dispatches a `closure-response-notify`
> event on the enclosing `<target-closure>` (via `_notifyClosure`), with detail
> `{ html, ok, status, role }` — `bubbles: false`. (Named to avoid clashing with
> the `<closure-response>` **element** the server sends, which is the opposite
> direction.) With `delegate-response` set it does **not** insert the response
> into a target at all and relies on this event, letting the lightbox or another
> container render the body itself.

> **Note:** having **no** destination (no `response-target*`, no
> `<template-response-ok/fail target>`, no `response-lightbox*`) is legitimate —
> e.g. a fire-and-forget save, server-driven `<closure-response>` directives that
> place content themselves, `delegate-response`, or handling everything from the
> `closure-response-notify` event. Nothing is lost: that event always carries the
> body (`detail.html`) and outcome (`detail.ok`) for both success and failure.

> **Note:** when no `<template-section>` is declared and a
> `submittedForm` is passed in (e.g. a native form submit captured by
> `<target-closure>`), `execute` packages **its** fields verbatim
> instead of inventing sections.

> **Note:** `<template-section>` is what declares **how gathered forms are
> packaged** — `group-behavior` only decides *which* forms are collected.
> So a button-triggered submit that gathers forms (`combine-sections` /
> `combine-children`) but declares **no** `<template-section>` sends only the
> button payload (`data-*`); the gathered forms' fields are **not** packaged.
> This is by design, but `execute` emits a `console.warn` in that case so the
> missing declaration doesn't read as silent data loss. To **silence it on
> purpose without changing behaviour**, declare an **empty** `<template-section>`:
> it packages into a name-less hidden input (which is never serialized), so
> nothing extra is sent — it just acknowledges the intent. Give the section a
> `name="x"` or `standalone-inputs` when you actually want the gathered fields
> sent.

> **Note:** the `ct-role` resolution always prefers a role-specific
> child (`<template-url ct-role="approve">`) over the catch-all
> (`<template-url>`). If the role-specific child has a `switch` guard
> that fails, the resolver does **not** fall through to the catch-all
> automatically — author guards accordingly.

---
%%>*/

class ClosureTemplate extends HTMLElement {
  connectedCallback() { this.style.display = 'none'; }

  execute(role, forms, submittedForm, btnData) {
    var sendBehavior = this._resolveSendBehavior(role);
    var url = this._resolveUrl(role);
    var method = this._resolveMethod(role);
    var sections = this._getSections(role);
    var fields = this._getFields(role);
    var responseAttrs = this._getResponseAttrs(role);

    // Collect data from forms
    var data = {};
    if (sections.length > 0 && forms.length > 0) {
      data = this._collectData(forms);
    } else if (forms.length > 0 && !submittedForm) {
      // Footgun guard: forms were gathered (group-behavior="combine-*") but no
      // <template-section> declares how to package them, so their fields would
      // be silently dropped (only the button payload / data-* still goes). This
      // is by design — sections drive packaging — but warn so the missing
      // declaration is obvious instead of a silent data black hole.
      console.warn('closure-template: ' + forms.length + ' form(s) were gathered via ' +
        'group-behavior but no <template-section> is declared — their fields will ' +
        'NOT be sent. Declare a <template-section> to package them, or an empty ' +
        '<template-section> to acknowledge this on purpose and silence the warning.');
    }

    // Merge button sections into data (before the form is packaged,
    // otherwise the button payload never reaches the server)
    if (btnData && btnData.sections) {
      for (var sec in btnData.sections) {
        if (!data[sec]) data[sec] = {};
        var secFields = btnData.sections[sec];
        for (var key in secFields) {
          data[sec][key] = secFields[key];
        }
      }
    }

    // Build the submission form
    var form = document.createElement('form');
    form.method = method;
    form.action = url;
    form.style.display = 'none';

    // If no sections, use the submitted form's data as-is
    if (sections.length === 0 && submittedForm) {
      new FormData(submittedForm).forEach(function(value, key) {
        var hidden = document.createElement('input');
        hidden.type = 'hidden';
        hidden.name = key;
        hidden.value = value;
        form.appendChild(hidden);
      });
    } else if (sections.length === 0) {
      // Button-triggered with no template-sections: emit the merged
      // button data flat (section-prefixed names, like btn-item URLs)
      for (var dsec in data) {
        for (var dkey in data[dsec]) {
          var dHidden = document.createElement('input');
          dHidden.type = 'hidden';
          dHidden.name = dsec ? dsec + '_' + dkey : dkey;
          dHidden.value = data[dsec][dkey];
          form.appendChild(dHidden);
        }
      }
    } else {
      // Package data per template-section
      this._packageSections(form, sections, data);
    }

    // Add template-fields
    fields.forEach(function(f) {
      var hidden = document.createElement('input');
      hidden.type = 'hidden';
      hidden.name = f.name;
      hidden.value = f.value;
      form.appendChild(hidden);
    });

    // Send
    var self = this;
    if (sendBehavior.startsWith('fetch')) {
      var fetchUrl = url || window.location.href;
      var fetchOpts = { method: method, credentials: 'same-origin' };
      var headers = this._getHeaders();

      if (sendBehavior === 'fetch-json') {
        var jsonData = {};
        new FormData(form).forEach(function(v, k) {
          // Preserve repeated names (checkbox groups, <select multiple>):
          // collapse to an array instead of keeping only the last value.
          // hasOwnProperty (not `k in`): `in` walks the prototype chain, so a
          // field named "toString"/"constructor"/… would falsely test true and
          // corrupt the value by concatenating with the inherited function.
          if (Object.prototype.hasOwnProperty.call(jsonData, k)) jsonData[k] = [].concat(jsonData[k], v);
          else jsonData[k] = v;
        });
        headers['Content-Type'] = 'application/json';
        fetchOpts.body = JSON.stringify(jsonData);
      } else {
        fetchOpts.body = new URLSearchParams(new FormData(form));
      }

      if (Object.keys(headers).length) fetchOpts.headers = headers;

      // In-flight guard: a double-click must not issue a second request.
      // The flag is set right before fetch so a throw in _showLoading
      // can't leave it stuck true.
      if (this._inFlight) return;
      self._showLoading(responseAttrs);
      this._inFlight = true;
      fetch(fetchUrl, fetchOpts).then(function(r) {
        self._inFlight = false;
        self._handleResponse(r, responseAttrs, role);
      }).catch(function(err) {
        self._inFlight = false;
        self._clearLoading(responseAttrs);
        self._handleFail('no-response', 0, err.message, responseAttrs);
      });
    } else {
      document.body.appendChild(form);
      form.submit();
      form.remove(); // submit is already initiated; drop the node so it
                     // can't orphan in <body> when the action is a
                     // download or opens a new tab (no navigation).
    }
  }

  // ---
  _resolveSendBehavior(role) {
    var urlEl = this._findUrlElement(role);
    if (urlEl && urlEl.hasAttribute('send-behavior')) {
      return urlEl.getAttribute('send-behavior');
    }
    return this.getAttribute('send-behavior') || 'submit';
  }

  // ---
  _resolveUrl(role) {
    var urlEl = this._findUrlElement(role);
    if (!urlEl) return '';
    var dynId = urlEl.getAttribute('dyn-url-id');
    if (dynId) {
      var el = document.getElementById(dynId);
      if (el) return el.value !== undefined ? el.value : el.textContent;
    }
    return urlEl.getAttribute('url') || '';
  }

  // ---
  _resolveMethod(role) {
    var urlEl = this._findUrlElement(role);
    if (urlEl && urlEl.hasAttribute('method')) {
      return urlEl.getAttribute('method');
    }
    return 'POST';
  }

  // ---
  _passesSwitch(el) {
    var switchId = el.getAttribute('ct-switch-id');
    if (!switchId) return true;
    var target = document.getElementById(switchId);
    if (!target) return false;
    return target.value === (el.getAttribute('ct-switch-value') || '');
  }

  // ---
  _findUrlElement(role) {
    var urls = this.querySelectorAll('template-url');
    var roleMatch = null;
    var defaultMatch = null;
    for (var i = 0; i < urls.length; i++) {
      if (!this._passesSwitch(urls[i])) continue;
      var r = urls[i].getAttribute('ct-role');
      if (r && r === role) { roleMatch = urls[i]; break; }
      if (!r && !defaultMatch) defaultMatch = urls[i];
    }
    return roleMatch || defaultMatch;
  }

  // ---
  _getSections(role) {
    var all = this.querySelectorAll('template-section');
    var roleItems = [];
    var defaultItems = [];
    var starItems = [];
    for (var i = 0; i < all.length; i++) {
      if (!this._passesSwitch(all[i])) continue;
      var r = all[i].getAttribute('ct-role');
      if (r === '*') { starItems.push(all[i]); }
      else if (r && r === role) { roleItems.push(all[i]); }
      else if (!r) { defaultItems.push(all[i]); }
    }
    // ct-role="*" always included. ct-role-specific overrides defaults.
    var result = starItems.concat(roleItems.length > 0 ? roleItems : defaultItems);
    return result;
  }

  // ---
  _getFields(role) {
    var all = this.querySelectorAll('template-field');
    var roleItems = [];
    var defaultItems = [];
    var starItems = [];
    for (var i = 0; i < all.length; i++) {
      if (!this._passesSwitch(all[i])) continue;
      var r = all[i].getAttribute('ct-role');
      var name = all[i].getAttribute('name') || '';
      var value = all[i].getAttribute('value') || '';
      var item = { name: name, value: value };
      if (r === '*') { starItems.push(item); }
      else if (r && r === role) { roleItems.push(item); }
      else if (!r) { defaultItems.push(item); }
    }
    return starItems.concat(roleItems.length > 0 ? roleItems : defaultItems);
  }

  // ---
  _getHeaders() {
    var headers = {};
    this.querySelectorAll('template-header').forEach(function(h) {
      var name = h.getAttribute('name') || '';
      var value = h.getAttribute('value') || '';
      if (name) headers[name] = value;
    });
    return headers;
  }

  // ---
  _shouldParseResponse() {
    var tr = this.querySelector('template-response');
    return tr && tr.getAttribute('parse') === 'closure-response';
  }

  // ---
  _shouldDelegateResponse() {
    var tr = this.querySelector('template-response');
    return tr && tr.hasAttribute('delegate-response');
  }

  // ---
  _getResponseAttrs(role) {
    var urlEl = this._findUrlElement(role);
    if (!urlEl) return {};
    var attrs = {};
    for (var i = 0; i < urlEl.attributes.length; i++) {
      var a = urlEl.attributes[i];
      if (a.name.startsWith('response-')) {
        attrs[a.name] = a.value;
      }
    }
    return attrs;
  }

  // ---
  _collectData(forms) {
    var data = {};
    forms.forEach(function(form) {
      var section = form.getAttribute('section') || '';
      if (!data[section]) data[section] = {};
      var target = data[section];
      new FormData(form).forEach(function(value, key) {
        // Preserve repeated names (checkbox groups, <select multiple>):
        // collapse to an array rather than overwriting with the last value.
        // hasOwnProperty (not `key in`): `in` walks the prototype chain, so a
        // field named "toString"/"constructor"/… would falsely test true and
        // corrupt the value by concatenating with the inherited function.
        if (Object.prototype.hasOwnProperty.call(target, key)) target[key] = [].concat(target[key], value);
        else target[key] = value;
      });
    });
    return data;
  }

  // ---
  _packageSections(form, sections, data) {
    // Track captured sections for "*" catch-all
    var capturedSections = {};
    sections.forEach(function(sec) {
      var s = sec.getAttribute('section') || '';
      if (s && s !== '*') capturedSections[s] = true;
    });

    var self = this;
    sections.forEach(function(sec) {
      var sectionName = sec.getAttribute('section') || '';
      var name = sec.getAttribute('name') || '';
      var noPrefix = sec.hasAttribute('no-prefix');
      var separator = sec.hasAttribute('prefix-separator') ? sec.getAttribute('prefix-separator') : '_';
      var standalone = sec.hasAttribute('standalone-inputs');

      // Determine which data sections to include
      var sectionData = {};
      if (sectionName === '*') {
        for (var key in data) {
          if (!capturedSections[key]) sectionData[key] = data[key];
        }
      } else if (sectionName === '') {
        sectionData = data;
      } else {
        if (data[sectionName]) sectionData[sectionName] = data[sectionName];
      }

      if (standalone) {
        for (var section in sectionData) {
          var fields = sectionData[section];
          var pfx = self._buildPrefix(section, noPrefix, separator);
          for (var field in fields) {
            // Array values (repeated names) emit one hidden input each, so
            // the native `name=a&name=b` semantics survive the repackaging.
            var fval = fields[field];
            var vals = Array.isArray(fval) ? fval : [fval];
            for (var vi = 0; vi < vals.length; vi++) {
              var hidden = document.createElement('input');
              hidden.type = 'hidden';
              hidden.name = pfx + field;
              hidden.value = vals[vi];
              form.appendChild(hidden);
            }
          }
        }
      } else {
        var result = {};
        for (var section in sectionData) {
          var fields = sectionData[section];
          var pfx = self._buildPrefix(section, noPrefix, separator);
          for (var field in fields) {
            result[pfx + field] = fields[field];
          }
        }
        var hidden = document.createElement('input');
        hidden.type = 'hidden';
        hidden.name = name;
        hidden.value = JSON.stringify(result);
        form.appendChild(hidden);
      }
    });
  }

  // ---
  _buildPrefix(section, noPrefix, separator) {
    if (noPrefix) return '';
    if (!section) return '';
    return section + separator;
  }

  // ---
  _handleResponse(response, responseAttrs, role) {
    var self = this;
    response.text().then(function(html) {
      // Ghost-response: the template (and its closure) was detached while the
      // request was in flight. ClosureResponse mutates the *live* global DOM
      // (getElementById/querySelector), so a dead component could pop
      // lightboxes / redirect out of nowhere. Default is to DISCARD; the app
      // can listen for `closure-ghost-response` (on document) and
      // preventDefault() to process it anyway.
      if (!self.isConnected) {
        var ghost = new CustomEvent('closure-ghost-response', {
          cancelable: true,
          detail: { html: html, status: response.status, ok: response.ok, role: role, source: self },
        });
        if (document.dispatchEvent(ghost)) return; // not prevented → discard
        // preventDefault() called → fall through and process it anyway
      }
      /*<%% if:mockup %%>*/
      console.log('DBG _handleResponse: delegate=', self._shouldDelegateResponse(), 'parse=', self._shouldParseResponse());
      console.log('DBG _handleResponse: responseAttrs=', responseAttrs);
      /*<%% end %%>*/
      self._clearLoading(responseAttrs);

      if (!response.ok) {
        var handled = self._handleFail(String(response.status), response.status, html, responseAttrs);
        if (handled) {
          // Still notify: closure-response-notify is a reliable "a response
          // settled" channel, so it fires even when a <template-response-fail>
          // rendered the error itself.
          self._executeDirtyClean(false, role);
          self._notifyClosure(html, response, role);
          return;
        }
      }

      // Delegate: skip parsing, let the target handle it
      if (response.ok && self._shouldDelegateResponse()) {
        /*<%% if:mockup %%>*/
        console.log('DBG: delegating response');
        /*<%% end %%>*/
        // Fall through — HTML goes to lightbox/target as-is, they parse it
      }
      // Parse closure-response directives if enabled
      else if (response.ok && self._shouldParseResponse()) {
        var closure = self.closest('target-closure');
        var result = ClosureResponse.process(html, closure);
        if (result) {
          if (result.handled) {
            self._executeDirtyClean(true, role);
            self._notifyClosure(html, response, role);
            return;
          }
          html = result.html;
        }
      }

      // Check template-response-ok
      if (response.ok) {
        var okEl = self._findResponseOk();
        if (okEl) {
          html = self._renderTemplate(okEl, response.status, html);
        }
      }

      var suffix = response.ok ? 'ok' : 'fail';

      // Lightbox
      var lbId = responseAttrs['response-lightbox-' + suffix + '-id']
              || responseAttrs['response-lightbox-id'];
      if (lbId) {
        var lb = document.getElementById(lbId);
        /*<%% if:mockup %%>*/
        console.log('DBG: lightbox id=', lbId, 'found=', !!lb, 'showResponse=', !!(lb && lb.showResponse));
        /*<%% end %%>*/
        if (lb) {
          if (response.ok) lb.showResponse(html);
          else lb.showError(html);
        }
      }

      // Target — a `<template-response-ok target>` WINS; the response-target-*
      // attributes are the **fallback** (used only when the ok template has no
      // target of its own), so the body is injected exactly once instead of
      // landing in two places. Mirrors how _handleFail resolves
      // `<template-response-fail target>` vs response-target-fail-id.
      var okEl = response.ok ? self._findResponseOk() : null;
      var targetId = (okEl && okEl.hasAttribute('target') && okEl.getAttribute('target'))
                  || responseAttrs['response-target-' + suffix + '-id']
                  || responseAttrs['response-target-id'];
      if (targetId) {
        var target = document.getElementById(targetId);
        if (target) target.innerHTML = html;
      }

      // Dirty clean
      self._executeDirtyClean(response.ok, role);
      self._notifyClosure(html, response, role);
    });
  }


  // ---
  _notifyClosure(html, response, role) {
    var closure = this.closest('target-closure');
    if (closure) {
      closure.dispatchEvent(new CustomEvent('closure-response-notify', {
        detail: { html: html, ok: response.ok, status: response.status, role: role },
        bubbles: false,
      }));
    }
  }

  // ---
  _showLoading(responseAttrs) {
    var loadingEl = this.querySelector('template-loading');
    if (!loadingEl) return;
    var html = loadingEl.innerHTML;
    var targetId = loadingEl.getAttribute('target');
    if (targetId) {
      var target = document.getElementById(targetId);
      if (target) target.innerHTML = html;
    } else {
      // Fallback to response targets
      var tId = responseAttrs['response-target-ok-id']
             || responseAttrs['response-target-id'];
      if (tId) {
        var t = document.getElementById(tId);
        if (t) t.innerHTML = html;
      }
      var lbId = responseAttrs['response-lightbox-ok-id']
              || responseAttrs['response-lightbox-id'];
      if (lbId) {
        var lb = document.getElementById(lbId);
        if (lb) lb.showResponse(html);
      }
    }
  }

  // ---
  _clearLoading(responseAttrs) {
    var loadingEl = this.querySelector('template-loading');
    if (!loadingEl) return;
    var targetId = loadingEl.getAttribute('target');
    if (targetId) {
      var target = document.getElementById(targetId);
      if (target) target.innerHTML = '';
    } else {
      var tId = responseAttrs['response-target-ok-id']
             || responseAttrs['response-target-id'];
      if (tId) {
        var t = document.getElementById(tId);
        if (t) t.innerHTML = '';
      }
    }
  }

  // ---
  _findResponseOk() {
    return this.querySelector('template-response-ok');
  }

  // ---
  _renderTemplate(el, code, text) {
    var content = el.cloneNode(true);
    content.querySelectorAll('[bind-response-code]').forEach(function(e) {
      e.textContent = String(code);
    });
    content.querySelectorAll('[bind-response-text]').forEach(function(e) {
      e.textContent = text;
    });
    return content.innerHTML;
  }

  // ---
  _handleFail(type, code, text, responseAttrs) {
    // Find matching template-response-fail
    var failEl = this._findFailTemplate(type, code);
    if (!failEl) return false;

    // Clone content and bind error data
    var content = failEl.cloneNode(true);
    content.querySelectorAll('[bind-error-code]').forEach(function(el) {
      el.textContent = String(code);
    });
    content.querySelectorAll('[bind-error-text]').forEach(function(el) {
      el.textContent = text;
    });

    var html = content.innerHTML;

    // Determine target
    var targetId = failEl.getAttribute('target');
    if (targetId) {
      var target = document.getElementById(targetId);
      if (target) target.innerHTML = html;
    } else {
      // Fallback: response-target-fail-id or response-lightbox-fail-id
      var lbId = responseAttrs['response-lightbox-fail-id']
              || responseAttrs['response-lightbox-id'];
      if (lbId) {
        var lb = document.getElementById(lbId);
        if (lb) lb.showError(html);
      }
      var tId = responseAttrs['response-target-fail-id']
             || responseAttrs['response-target-id'];
      if (tId) {
        var t = document.getElementById(tId);
        if (t) t.innerHTML = html;
      }
    }
    return true;
  }

  // ---
  _findFailTemplate(type, code) {
    var all = this.querySelectorAll('template-response-fail');
    var exactMatch = null;
    var rangeMatch = null;
    var noResponseMatch = null;

    for (var i = 0; i < all.length; i++) {
      var t = all[i].getAttribute('type') || '';
      if (t === type) { exactMatch = all[i]; break; }
      if (t === 'no-response' && type === 'no-response') { noResponseMatch = all[i]; }
      // Range match: 5xx, 4xx, etc.
      if (t.length === 3 && t.charAt(1) === 'x' && t.charAt(2) === 'x') {
        var rangeStart = parseInt(t.charAt(0)) * 100;
        if (code >= rangeStart && code < rangeStart + 100) {
          rangeMatch = all[i];
        }
      }
    }
    return exactMatch || rangeMatch || noResponseMatch;
  }

  // ---
  _executeDirtyClean(ok, role) {
    var cleans = this.querySelectorAll('template-dirty-clean');
    var closure = this.closest('target-closure');
    if (!closure) return;

    for (var i = 0; i < cleans.length; i++) {
      var result = cleans[i].getAttribute('result') || 'ok';
      if (result === 'always' || (result === 'ok' && ok)) {
        var templates = cleans[i].getAttribute('templates') || '';
        closure.cleanDirty(templates);
      }
    }
  }
}

customElements.define('closure-template', ClosureTemplate);
