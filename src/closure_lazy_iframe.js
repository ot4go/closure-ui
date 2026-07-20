/*<%% note:
# `<closure-lazy-iframe>`

Collapsible iframe panel. Renders a header with a label and an
expand/collapse chevron button; the body hosts an `<iframe>` whose
`src` is **only assigned the first time the panel is expanded** — until
then no frame exists and the embedded page costs nothing. The panel
starts collapsed unless the `expanded` attribute is present.

The iframe stretches to the panel body: give the host (or its
container) a height and the frame fills it; with no explicit height the
body falls back to `--lazy-iframe-height` (320px). Collapsing only
hides the body — the loaded document stays alive, so re-expanding is
instant. Call `unload()` to actually drop the frame.

Light-DOM children are slotted into the body as a placeholder and stay
visible until the iframe fires its first `load` (default placeholder:
"Loading…").

## Attributes

| Attribute | Description |
|---|---|
| `label="x"`   | header label |
| `src="url"`   | iframe URL — assigned on first expand |
| `expanded`    | boolean; present = open. Reflected: toggle it to open/close |
| `iframe-title="x"` | copied to the iframe's `title` (accessibility) |
| `data-*` / `section="x"` | form fields (`section_`-prefixed when `section` is set): when present, loading goes through a hidden form (shared `closureFreeSubmit()`) submitted **into** the named frame with the applicable method — GET (default): the fields become the frame url's query string; POST: they travel in the body. Without fields (and without `post`) the `src` is simply assigned |
| `post` / `method="post"` | use **POST** for the frame-targeted form. For heavy server-generated reports whose parameters don't belong in a URL |
| `name`, `allow`, `sandbox`, `referrerpolicy`, `allowfullscreen` | copied verbatim to the iframe when it is created. In `post` mode the frame needs a `name` — an internal one is generated if the attribute is absent |

## Methods / properties

| Member | Description |
|---|---|
| `expand()` / `collapse()` / `toggle()` | change panel state (sets/removes `expanded`) |
| `unload()`          | collapse and remove the iframe; the next expand re-creates it and reloads `src` |
| `expanded` (getter) | `true` while expanded |
| `loaded` (getter)   | `true` once the iframe exists (src assigned) |
| `iframe` (getter)   | the inner `<iframe>` element, or `null` before first expand / after `unload()` |

## Events

| Event | Bubbles | Cancelable | Detail |
|---|---|---|---|
| `lzi-toggle` | no | no  | `{ expanded }` |
| `lzi-load`   | no | yes | `{ src }` — fired before the iframe is created; `preventDefault()` expands the panel without loading (the next expand retries) |
| `lzi-loaded` | no | no  | `{ src }` — the iframe fired its `load` event |

## Example

```html
<!-- collapsed by default: the report only loads when the user expands -->
<closure-lazy-iframe label="Sales report" src="/reports/sales.html">
  <p>The report loads when you expand this panel.</p>  <!-- placeholder -->
</closure-lazy-iframe>

<!-- starts open, loads immediately -->
<closure-lazy-iframe label="Map" src="https://maps.example.com/embed" expanded></closure-lazy-iframe>

<!-- POST-loaded report: params travel as form fields, not in the URL -->
<closure-lazy-iframe label="Annual report" src="/reports/annual"
                     post data-year="2026" data-scope="all"></closure-lazy-iframe>

<script>
  var panel = document.querySelector('closure-lazy-iframe');
  panel.addEventListener('lzi-loaded', function(e) {
    console.log('frame ready:', e.detail.src);
  });
  panel.expand();   // same as panel.setAttribute('expanded', '')
</script>
```

## CSS Variables

Consumed (with fallbacks):

| Variable | Default |
|---|---|
| `--lazy-iframe-height` | `320px` (body height when the host has none) |
| `--lazy-iframe-bg` | `#fff` (body background) |
| `--border`     | `#e5e7eb` |
| `--bg`         | `#f9fafb` |
| `--text`       | `#111827` |
| `--text-muted` | `#6b7280` |
| `--font`       | `sans-serif` |
| `--radius`     | `8px` |

## Behaviour

> **Note:** the `expanded` attribute is the single source of truth:
> `expand()` / `collapse()` / the header click only set or remove it and
> the attribute callback does the work (show/hide via `:host([expanded])`
> CSS, lazy load, events). Server-rendered markup can therefore open the
> panel by simply including the attribute.

> **Note:** the host is a flex column: when the container gives it a
> height, the body (and iframe) stretch to fill it; otherwise the body
> takes `--lazy-iframe-height`. The frame always fills the body 100%.

> **Note:** changing `src` after the iframe exists writes through and
> navigates the frame; changing it before first expand just updates
> what will be loaded. When loading goes through the form (fields
> present, or `post`), the write-through **re-submits** with the
> current `data-*` values; on POST, `unload()` + expand re-POSTs —
> inherent to POST navigation, as is the browser's confirm on a manual
> frame reload.

> **Note:** an initial `expanded` set in markup fires its `lzi-*` events
> during upgrade, before page scripts can typically listen — read the
> `expanded` / `loaded` properties instead of relying on those events.

---
%%>*/

class ClosureLazyIframe extends HTMLElement {
  static _style = [
    ':host { display: flex; flex-direction: column; border: 1px solid var(--border, #e5e7eb); border-radius: var(--radius, 8px); overflow: hidden; background: var(--bg, #f9fafb); font-family: var(--font, sans-serif); }',
    '.lzi-header { display: flex; align-items: center; padding: 8px 12px; cursor: pointer; user-select: none; }',
    '.lzi-label { flex: 1; font-weight: 600; font-size: 14px; color: var(--text, #111827); }',
    '.lzi-toggle { border: none; background: none; cursor: pointer; font-size: 14px; color: var(--text-muted, #6b7280); padding: 0 0 0 12px; line-height: 1; }',
    '.lzi-toggle:hover { color: var(--text, #111827); }',
    '.lzi-body { display: none; position: relative; flex: 1 1 auto; height: var(--lazy-iframe-height, 320px); border-top: 1px solid var(--border, #e5e7eb); background: var(--lazy-iframe-bg, #fff); }',
    ':host([expanded]) .lzi-body { display: block; }',
    'iframe { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; display: block; }',
    '.lzi-ph { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; overflow: auto; color: var(--text-muted, #6b7280); font-size: 13px; }',
  ].join('\n');

  // host attributes copied verbatim to the iframe at creation time
  static _passthrough = ['name', 'allow', 'sandbox', 'referrerpolicy', 'allowfullscreen'];

  static _seq = 0; // for generated frame names in post mode

  static get observedAttributes() { return ['label', 'src', 'expanded']; }

  // ---
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    var style = document.createElement('style');
    style.textContent = ClosureLazyIframe._style;

    var header = document.createElement('div');
    header.className = 'lzi-header';
    this._labelEl = document.createElement('span');
    this._labelEl.className = 'lzi-label';
    this._toggleBtn = document.createElement('button');
    this._toggleBtn.type = 'button';
    this._toggleBtn.className = 'lzi-toggle';
    header.appendChild(this._labelEl);
    header.appendChild(this._toggleBtn);

    this._body = document.createElement('div');
    this._body.className = 'lzi-body';
    this._ph = document.createElement('div');
    this._ph.className = 'lzi-ph';
    var slot = document.createElement('slot');
    slot.textContent = 'Loading…'; // fallback when there are no light children
    this._ph.appendChild(slot);
    this._body.appendChild(this._ph);

    this.shadowRoot.appendChild(style);
    this.shadowRoot.appendChild(header);
    this.shadowRoot.appendChild(this._body);

    this._iframe = null;
    var self = this;
    // the button click bubbles up to the header, one handler covers both
    header.addEventListener('click', function() { self.toggle(); });
    this._syncHeader();
  }

  attributeChangedCallback(attr, oldVal, val) {
    switch (attr) {
    case 'label':
      this._labelEl.textContent = val || '';
      break;
    case 'src':
      // write-through once the frame exists; before that the attribute
      // is simply what the first expand will load
      if (this._iframe && val) this._navigateFrame(val);
      break;
    case 'expanded':
      if (oldVal === val) return; // e.g. expand() while already expanded
      this._syncHeader();
      var expanded = val !== null;
      // state change first, lazy load second — a lzi-toggle listener can
      // still cancel the lzi-load that follows
      this.dispatchEvent(new CustomEvent('lzi-toggle', {
        detail: { expanded: expanded },
        bubbles: false,
      }));
      if (expanded && !this._iframe) this._load();
      break;
    }
  }

  _syncHeader() {
    var open = this.hasAttribute('expanded');
    this._toggleBtn.textContent = open ? '▾' : '▸';
    this._toggleBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    this._toggleBtn.setAttribute('aria-label', open ? 'Collapse' : 'Expand');
  }

  _load() {
    var src = this.getAttribute('src');
    if (!src) return;
    var e = new CustomEvent('lzi-load', {
      detail: { src: src },
      bubbles: false,
      cancelable: true,
    });
    if (!this.dispatchEvent(e)) return; // cancelled — the next expand retries

    var f = document.createElement('iframe');
    if (this.hasAttribute('iframe-title')) {
      f.title = this.getAttribute('iframe-title');
    }
    var self = this;
    ClosureLazyIframe._passthrough.forEach(function(a) {
      if (self.hasAttribute(a)) f.setAttribute(a, self.getAttribute(a));
    });
    f.addEventListener('load', function() {
      // In post mode the frame is inserted src-less, so its initial
      // about:blank commit also fires `load` — ignore it (about:blank is
      // always same-origin readable; a real cross-origin response throws
      // on the access and is treated as loaded)
      try {
        if (f.contentWindow.location.href === 'about:blank') return;
      } catch (e) { /* cross-origin: a real document loaded */ }
      self._ph.style.display = 'none';
      self.dispatchEvent(new CustomEvent('lzi-loaded', {
        // f.src is empty in post mode — report the requested url instead
        detail: { src: f.src || self._loadedUrl || '' },
        bubbles: false,
      }));
    });
    this._iframe = f;
    if (this._viaForm()) {
      // Form loads submit INTO the frame: it must be named and connected
      // before the submit
      if (!f.name) f.name = 'lzi-frame-' + (++ClosureLazyIframe._seq);
      this._body.appendChild(f);
      this._navigateFrame(src);
    } else {
      // fieldless GET: assign src before insertion — no about:blank phase
      this._navigateFrame(src);
      this._body.appendChild(f);
    }
  }

  _isPost() {
    return this.hasAttribute('post') ||
      (this.getAttribute('method') || '').toLowerCase() === 'post';
  }

  _hasFields() {
    return Array.prototype.some.call(this.attributes, function(a) {
      return a.name.indexOf('data-') === 0;
    });
  }

  // With fields (data-*) — or with `post` — loading always goes through the
  // shared hidden form submitted INTO the named frame, with whichever
  // method applies (GET: fields → the frame url's query; POST: fields →
  // body). A fieldless GET is a plain src assignment.
  _viaForm() {
    return this._isPost() || this._hasFields();
  }

  _navigateFrame(url) {
    this._loadedUrl = url;
    if (this._viaForm()) {
      closureFreeSubmit(this, url, this._isPost() ? 'post' : 'get',
        { target: this._iframe.name });
    } else {
      this._iframe.src = url;
    }
  }

  get expanded() { return this.hasAttribute('expanded'); }
  get loaded() { return !!this._iframe; }
  get iframe() { return this._iframe; }

  expand() { this.setAttribute('expanded', ''); }
  collapse() { this.removeAttribute('expanded'); }
  toggle() {
    if (this.expanded) this.collapse();
    else this.expand();
  }

  unload() {
    this.collapse();
    if (!this._iframe) return;
    this._iframe.remove();
    this._iframe = null;
    this._ph.style.display = ''; // placeholder returns for the reload
  }
}

customElements.define('closure-lazy-iframe', ClosureLazyIframe);
