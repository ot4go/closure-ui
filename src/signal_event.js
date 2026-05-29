/*<%% note:
# `<signal-event>`

Aseptic one-shot event dispatcher. Used to deliver named signals from a
streamed HTML response (or any other HTML payload) to JavaScript listeners
on the page. The element never renders (`display: none`); on connect it
reads its `name` and `data-*` attributes, dispatches a `CustomEvent` on
`document`, and removes itself from the DOM.

It is intentionally decoupled — no registry of its own, no target lookup,
no bubbling by default. Listeners subscribe with the standard DOM API:
`document.addEventListener(name, handler)`.

## Attributes

| Attribute | Description |
|---|---|
| `name="x"`  | event name passed to `CustomEvent` (required) |
| `bubbles`   | if present, the event bubbles (default: `false`) |
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

## Behaviour

> **Note:** the element fires exactly once, in `connectedCallback`, and
> removes itself afterwards. For a script to receive the event the
> matching `addEventListener` must already be registered when the element
> is parsed — in a streamed response, place the `<script>` that
> subscribes earlier in the document than the `<signal-event>` tags that
> trigger it.

> **Note:** the event is dispatched on `document`. There is no
> `target-id` attribute — the emitter does not know who listens, that is
> the point of the pub/sub split. If a listener wants to scope itself, it
> filters inside its handler.

---
%%>*/

customElements.define('signal-event', class extends HTMLElement {
  connectedCallback() {
    this.style.display = 'none';
    const name = this.getAttribute('name');
    if (!name) { this.remove(); return; }
    const detail = {};
    for (const attr of this.attributes) {
      if (attr.name.startsWith('data-')) {
        detail[attr.name.slice(5)] = attr.value;
      }
    }
    document.dispatchEvent(new CustomEvent(name, {
      detail,
      bubbles: this.hasAttribute('bubbles')
    }));
    this.remove();
  }
});
