/*<%% note:
# `<signal-event>`

Aseptic one-shot event dispatcher. Used to deliver named signals from a
streamed HTML response (or any other HTML payload) to JavaScript listeners
on the page. The element never renders (`display: none`); on connect it
reads its `name` and `data-*` attributes, dispatches a `CustomEvent` (on
`document` by default — or a named element via `target-id`), and removes
itself. With `delay` it acts as a declarative, DOM-bound **timer**: the
signal fires after the delay unless the node is removed first.

By default it is decoupled — no registry, dispatches on `document`, no
bubbling. Listeners subscribe with the standard DOM API:
`document.addEventListener(name, handler)`. `target-id` opts into a
specific element only when you need one.

## Attributes

| Attribute | Description |
|---|---|
| `name="x"`  | event name passed to `CustomEvent` (required) |
| `bubbles`   | if present, the event bubbles (default: `false`) |
| `target-id="x"` | dispatch on the element with this id instead of `document` (resolved **when the event fires**; a missing id logs `console.warn` and skips dispatch). Pair with `bubbles` so it still reaches `document` |
| `delay="N"` | fire `N` ms after connect instead of immediately — a declarative timer. Removing the node (or replacing its container) before then cancels it |
| `no-cancel` | **special cases** — with `delay`, keep the timer running even if the node is removed (opts out of cancel-on-disconnect; the signal then fires from a detached node) |
| `data-*`    | every `data-*` becomes a key of `event.detail`, with the `data-` prefix stripped; the key keeps its original kebab-case |

## Example

```html
<signal-event name="need-fingerprint"
              data-token="abc123"
              data-employee-id="42"></signal-event>
```

```js
document.addEventListener('need-fingerprint', (e) => {
  const token      = e.detail['token'];
  const employeeId = e.detail['employee-id'];
  // …
});
```

Delayed, targeted signal — a self-contained, non-blocking timer node:

```html
<!-- 5s after this lands, poke #live-grid; the rest of the payload runs now -->
<signal-event name="auto-refresh" target-id="live-grid" delay="5000"></signal-event>
```

## Behaviour

> **Note:** the element fires once and removes itself. For a script to
> receive the event the matching `addEventListener` must already be
> registered when the signal fires — in a streamed response, place the
> subscribing `<script>` earlier in the document than the `<signal-event>`.

> **Note:** by default the event is dispatched on `document` — the emitter
> need not know who listens (the point of the pub/sub split), and a scoped
> listener filters inside its handler. For a **targeted** dispatch prefer
> the `ClosureResponse` directives `dispatch-event` / `trigger-click`;
> `target-id` here exists mainly for the `delay` case (a delayed, targeted
> signal those synchronous directives can't express) and for HTML inserted
> outside the `closure-response` flow.

> **Note — timer bound to the node.** `delay="N"` fires the signal `N` ms
> after connect. Its lifetime is the node's: remove the `<signal-event>`
> (or replace its container with another response) and the pending dispatch
> is **cancelled** — declarative cancellation. A `target-id` is resolved
> **when it fires** (after the delay), so the DOM is settled by then; a
> missing id logs `console.warn` and skips.
>
> For special cases where the signal must outlive its node, add
> `no-cancel`: the timer keeps running after removal and fires from a
> detached node (held in memory until it does). Use sparingly — it gives
> up the "remove the node to cancel" guarantee.
>
> ⚠️ A delayed signal is **lost if the page navigates** (a `redirect` /
> full reload clears the timer). Use `delay` only for in-page signals; for
> something that must survive navigation, schedule it server-side.

---
%%>*/

customElements.define('signal-event', class extends HTMLElement {
  connectedCallback() {
    this.style.display = 'none';
    if (!this.getAttribute('name')) { this.remove(); return; }
    // A `no-cancel` timer survives disconnect (see disconnectedCallback). If the
    // node is reconnected while that timer is still pending, don't arm a second
    // one — the original still fires (and self-removes); a duplicate would
    // dispatch the signal twice from a node that's about to vanish.
    if (this._timer) return;
    // `delay="N"` (ms) turns this into a declarative timer bound to the node:
    // the event fires N ms after connect. Without it, fires immediately (in
    // document order, like any other directive — a same-response `redirect`
    // would lose a still-pending dispatch).
    const delay = parseInt(this.getAttribute('delay'), 10);
    if (delay > 0) this._timer = setTimeout(() => this._fire(), delay);
    else this._fire();
  }

  disconnectedCallback() {
    // By default the timer lives and dies with the node: removing a pending
    // <signal-event> (or replacing its container) cancels the dispatch.
    // `no-cancel` opts out — the delayed signal still fires after removal.
    if (this._timer && !this.hasAttribute('no-cancel')) {
      clearTimeout(this._timer);
      this._timer = null;
    }
  }

  _fire() {
    this._timer = null;
    const name = this.getAttribute('name');
    const detail = {};
    for (const attr of this.attributes) {
      if (attr.name.startsWith('data-')) {
        detail[attr.name.slice(5)] = attr.value;
      }
    }
    const target = this._resolveTarget();
    if (target) {
      target.dispatchEvent(new CustomEvent(name, {
        detail,
        bubbles: this.hasAttribute('bubbles')
      }));
    }
    this.remove();
  }

  // target-id (resolved at fire time) dispatches on that element; a missing
  // id warns and skips. Otherwise the default broadcast target is document.
  _resolveTarget() {
    const id = this.getAttribute('target-id');
    if (id) {
      const el = document.getElementById(id);
      if (!el) {
        console.warn('signal-event: target-id "' + id + '" not found; event "' +
          this.getAttribute('name') + '" not dispatched');
      }
      return el;
    }
    return document;
  }
});
