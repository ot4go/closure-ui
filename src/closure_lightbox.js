/*<%% note:
# `<closure-lightbox>`

Native `<dialog>`-based modal that hosts a `<target-closure>` body.
Uses `display: contents` so the host doesn't take layout space — the
inner `<dialog>` is what the user sees. After connect, any
`<target-closure>` child is moved into the dialog body and the lightbox
subscribes to its `<lightbox-response-item>` tag so the server can
control title and open/close declaratively.

## Attributes

| Attribute | Description |
|---|---|
| `title="x"` | initial dialog title |

## Methods

| Method | Description |
|---|---|
| `open({ title?, content?, buttons? })`        | open dialog; optionally set title, content, footer buttons |
| `close(action?)`                              | close with the given `action` (default `"close"`) |
| `setTitle(html)`                              | replace the title (HTML allowed) |
| `setContent(html)`                            | replace the body (routes through the inner closure when present) |
| `showResponse(html)`                          | set body + open; fires cancelable `lb-response` first. **Returns `true` if it opened, `false` if a listener cancelled it** (so a caller that created the lightbox can remove it instead of leaking the node) |
| `showError(html)`                             | set body + open; fires cancelable `lb-error` first. Returns `true`/`false` like `showResponse` |
| **static** `MsgAlert(msg, title?)`            | spawn a one-OK alert lightbox; auto-removes on close |
| **static** `MsgConfirm(msg, title?)`          | spawn an OK/Cancel lightbox; resolves a Promise → `true` (OK) / `false` |

## Events

| Event | Bubbles | Cancelable | Detail |
|---|---|---|---|
| `lb-close`     | no | no  | `{ action }` |
| `lb-response`  | no | yes | `{ html }` |
| `lb-error`     | no | yes | `{ html }` |

`action` is one of `"close"` (X button), `"cancel"` (Esc), `"server"`
(closed by a `<lightbox-response-item type="close">`), `"timeout"` (auto
delay close), `"ok"` (alert/confirm OK), or any custom value passed to
`close()` / declared on a footer button.

## Subscribed closure tags

`<lightbox-response-item>`:

| Attribute | Effect |
|---|---|
| `title="x"`     | replace title (text) |
| `title-html="x"`| replace title (HTML) |
| `type="open"`   | show the dialog |
| `type="close"`  | close, with `action` (default `"server"`) |
| `type="delay"`  | auto-close after `ms` (action `"timeout"`) |

## Example

```html
<closure-lightbox title="Edit user">
  <target-closure name="edit">
    <closure-template>…</closure-template>
    <form closure>…</form>
  </target-closure>
</closure-lightbox>

<script>
  // Server-style usage
  document.querySelector('closure-lightbox').showResponse(html);

  // Programmatic confirm
  ClosureLightbox.MsgConfirm('Delete user 42?').then(ok => {
    if (ok) doDelete();
  });
</script>
```

## CSS Variables

Consumed (with fallbacks):

| Variable | Default |
|---|---|
| `--border`     | `#e5e7eb` |
| `--bg`         | `#f9fafb` |
| `--text`       | `#111827` |
| `--text-muted` | `#6b7280` |
| `--font`       | `sans-serif` |
| `--radius`     | `8px` |
| `--primary`    | `#4f46e5` |
| `--red`        | `#dc2626` |

## Behaviour

> **Note:** the dialog is built once on connect and the inner
> `<target-closure>` is *moved* into it. After that, calling
> `setContent()` / `showResponse()` writes through the closure's
> `loadContent()` so its template / form bindings stay intact.

> **Note:** `showResponse` / `showError` events are **cancelable** —
> a listener that calls `preventDefault()` blocks both the body update
> and the `showModal()` call. Useful for client-side validation gates.

> **Note:** Esc fires the dialog's `cancel` event which the lightbox
> intercepts and closes with `action: "cancel"`. The browser's default
> Esc-closes-dialog behaviour is suppressed so the close path is uniform.

---
%%>*/

class ClosureLightbox extends HTMLElement {
  static _styleId = 'closure-lightbox-default-style';
  static _style = [
    'closure-lightbox { display: contents; }',
    'closure-lightbox dialog:not([open]) { display: none; }',
    'closure-lightbox dialog[open] { border: 1px solid var(--border, #e5e7eb); border-radius: var(--radius, 8px); padding: 0; min-width: 320px; max-width: 90vw; max-height: 90vh; box-shadow: 0 8px 32px rgba(0,0,0,0.18); overflow: hidden; display: flex; flex-direction: column; }',
    'closure-lightbox dialog::backdrop { background: rgba(0,0,0,0.4); }',
    'closure-lightbox .lb-header { display: flex; align-items: center; padding: 12px 16px; border-bottom: 1px solid var(--border, #e5e7eb); background: var(--bg, #f9fafb); }',
    'closure-lightbox .lb-title { flex: 1; font-weight: 700; font-size: 15px; font-family: var(--font, sans-serif); color: var(--text, #111827); }',
    'closure-lightbox .lb-close { border: none; background: none; font-size: 20px; cursor: pointer; color: var(--text-muted, #6b7280); padding: 0 0 0 12px; line-height: 1; }',
    'closure-lightbox .lb-close:hover { color: var(--red, #dc2626); }',
    'closure-lightbox .lb-body { flex: 1; overflow: auto; padding: 16px; font-family: var(--font, sans-serif); font-size: 14px; color: var(--text, #111827); }',
    'closure-lightbox .lb-footer { display: flex; gap: 8px; justify-content: flex-end; padding: 10px 16px; border-top: 1px solid var(--border, #e5e7eb); background: var(--bg, #f9fafb); }',
  ].join('\n');

  static get observedAttributes() { return ['title']; }

  attributeChangedCallback(attr, _, val) {
    if (attr === 'title' && this._titleEl) {
      this._titleEl.textContent = val || '';
    }
  }

  connectedCallback() {
    if (this._initialized) return;
    this._initialized = true;
    if (!document.getElementById(ClosureLightbox._styleId)) {
      var s = document.createElement('style');
      s.id = ClosureLightbox._styleId;
      s.textContent = ClosureLightbox._style;
      document.head.appendChild(s);
    }

    this._action = 'close';
    this._dlg = document.createElement('dialog');

    // Header
    var header = document.createElement('div');
    header.className = 'lb-header';
    this._titleEl = document.createElement('span');
    this._titleEl.className = 'lb-title';
    this._titleEl.textContent = this.getAttribute('title') || '';
    var closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'lb-close';
    closeBtn.textContent = '\u00d7';
    var self = this;
    closeBtn.addEventListener('click', function() { self.close('close'); });
    header.appendChild(this._titleEl);
    header.appendChild(closeBtn);

    // Body
    this._body = document.createElement('div');
    this._body.className = 'lb-body';

    // Footer
    this._footer = document.createElement('div');
    this._footer.className = 'lb-footer';
    this._footer.style.display = 'none';

    this._dlg.appendChild(header);
    this._dlg.appendChild(this._body);
    this._dlg.appendChild(this._footer);

    // Escape key
    this._dlg.addEventListener('cancel', function(e) {
      e.preventDefault();
      self.close('cancel');
    });

    // Defer: move closure into body, build dialog, subscribe
    var init = function() { self._initDom(); };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
      requestAnimationFrame(init);
    }
  }

  // Moves the closure into the body and attaches the dialog. Deferred on
  // connect, but open()/showResponse()/showError() force it synchronously
  // so showModal() never runs on a detached dialog.
  _initDom() {
    // _dlg only exists after connectedCallback built it; the flag is set
    // last so a premature call doesn't poison the later deferred init
    if (this._domReady || !this._dlg) return;
    var closure = this.querySelector('target-closure');
    if (closure) {
      this._body.appendChild(closure);
      this._closure = closure;
    }
    this.innerHTML = '';
    this.appendChild(this._dlg);
    this._domReady = true;
    // Subscribe after everything is in the DOM
    var self = this;
    requestAnimationFrame(function() { self._subscribeToClosure(); });
  }

  _subscribeToClosure() {
    if (!this._closure || !this._closure.subscribeTag) return;
    this._closure.subscribeTag('lightbox-response-item', this);
  }

  disconnectedCallback() {
    // Defensive lifecycle cleanup: drop our tag subscription on removal. Today
    // the closure is our own inner one and dies with us (no real leak), but
    // unsubscribing keeps subscribe/unsubscribe symmetric and is robust if the
    // lightbox is ever pointed at a longer-lived (e.g. page-level) closure.
    if (this._closure && this._closure.unsubscribeTag) {
      this._closure.unsubscribeTag('lightbox-response-item', this);
    }
  }

  onClosureTag(tag, el) {
    if (tag !== 'lightbox-response-item') return;
    var type = el.getAttribute('type') || '';
    /*<%% if:mockup %%>*/
    console.log('DBG onClosureTag: type=', type, 'title attr=', el.getAttribute('title'), 'all attrs=', Array.from(el.attributes).map(function(a) { return a.name + '=' + a.value; }));
    /*<%% end %%>*/
    var self = this;

    // Process attributes directly — no type needed for simple cases
    if (el.hasAttribute('title')) {
      this._titleEl.textContent = el.getAttribute('title');
    }
    if (el.hasAttribute('title-html')) {
      this._titleEl.innerHTML = el.getAttribute('title-html');
    }

    switch (type) {
    case 'open':
      this._initDom();
      if (!this._dlg.open) this._dlg.showModal();
      break;
    case 'close':
      this.close(el.getAttribute('action') || 'server');
      break;
    case 'delay':
      var ms = parseInt(el.getAttribute('ms') || '0', 10);
      if (ms > 0) setTimeout(function() { self.close('timeout'); }, ms);
      break;
    }
  }

  open(opts) {
    opts = opts || {};
    this._initDom();
    this._action = 'close';
    if (opts.title) this._titleEl.textContent = opts.title;
    if (opts.content) {
      if (this._closure) this._closure.innerHTML = opts.content;
      else this._body.innerHTML = opts.content;
    }
    if (opts.buttons) this._buildButtons(opts.buttons);
    else this._footer.style.display = 'none';
    this._dlg.showModal();
  }

  close(action) {
    this._action = action || 'close';
    this._dlg.close();
    this.dispatchEvent(new CustomEvent('lb-close', {
      detail: { action: this._action },
      bubbles: false,
    }));
  }

  showResponse(html) {
    /*<%% if:mockup %%>*/
    console.log('DBG showResponse: _closure=', !!this._closure, '_body=', !!this._body);
    /*<%% end %%>*/
    var e = new CustomEvent('lb-response', {
      detail: { html: html },
      bubbles: false,
      cancelable: true,
    });
    if (this.dispatchEvent(e)) {
      this._initDom();
      if (this._closure) this._closure.loadContent(html);
      else this._body.innerHTML = html;
      if (!this._dlg.open) this._dlg.showModal();
      return true;
    }
    return false; // a listener cancelled lb-response — modal not opened
  }

  showError(html) {
    var e = new CustomEvent('lb-error', {
      detail: { html: html },
      bubbles: false,
      cancelable: true,
    });
    if (this.dispatchEvent(e)) {
      this._initDom();
      if (this._closure) this._closure.loadContent(html);
      else this._body.innerHTML = html;
      if (!this._dlg.open) this._dlg.showModal();
      return true;
    }
    return false; // a listener cancelled lb-error — modal not opened
  }

  setContent(html) {
    if (this._closure) this._closure.loadContent(html);
    else this._body.innerHTML = html;
  }

  setTitle(html) {
    this._titleEl.innerHTML = html;
  }

  _buildButtons(buttons) {
    this._footer.innerHTML = '';
    this._footer.style.display = 'flex';
    var self = this;
    buttons.forEach(function(b) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = b.label || '';
      btn.style.cssText = 'padding:6px 16px;border:1px solid var(--border,#e5e7eb);border-radius:4px;cursor:pointer;font-family:var(--font,sans-serif);font-size:13px;';
      if (b.primary) btn.style.cssText += 'background:var(--primary,#4f46e5);color:#fff;border-color:var(--primary,#4f46e5);';
      btn.addEventListener('click', function() { self.close(b.action || b.label.toLowerCase()); });
      self._footer.appendChild(btn);
    });
  }

  // msg is plain text — escape it so caller data can't inject markup
  static _escapeMsg(msg) {
    var d = document.createElement('div');
    d.textContent = String(msg);
    return d.innerHTML;
  }

  static MsgAlert(msg, title) {
    var lb = document.createElement('closure-lightbox');
    document.body.appendChild(lb);
    lb.open({
      title: title || 'Alert',
      content: '<p>' + ClosureLightbox._escapeMsg(msg) + '</p>',
      buttons: [{ label: 'OK', action: 'ok', primary: true }],
    });
    lb.addEventListener('lb-close', function() { lb.remove(); }, { once: true });
    return lb;
  }

  static MsgConfirm(msg, title) {
    return new Promise(function(resolve) {
      var lb = document.createElement('closure-lightbox');
      document.body.appendChild(lb);
      lb.open({
        title: title || 'Confirm',
        content: '<p>' + ClosureLightbox._escapeMsg(msg) + '</p>',
        buttons: [
          { label: 'Cancel', action: 'cancel' },
          { label: 'OK', action: 'ok', primary: true },
        ],
      });
      lb.addEventListener('lb-close', function(e) {
        resolve(e.detail.action === 'ok');
        lb.remove();
      }, { once: true });
    });
  }
}

customElements.define('closure-lightbox', ClosureLightbox);
