/*<%% note:
# `<session-keep-alive>`

Idle countdown for admin / bookkeeper portal sessions. Renders a small
`<closure-btn>` showing the remaining time before automatic logout.
Clicking the button extends the session (optionally consulting the
server). When the countdown reaches zero the page navigates to the
configured logoff URL.

## Attributes

| Attribute | Description |
|---|---|
| `timeout="seconds"`   | initial countdown in seconds (default `1800` — 30 min) |
| `warn-at="seconds"`   | switch the button to red warning when remaining ≤ this (default `60`) |
| `extend-url="path"`   | POST here on click to extend the **server** session; without it, the click only resets the client countdown |
| `expire-url="path"`   | POST here when the countdown reaches zero (browser navigates to whatever the server responds); without it, only the `session-expired` event fires |
| `activity-reset`      | also reset the countdown on any mouse / keyboard / touch activity |
| `data-*`              | sent as form fields with both `extend-url` and `expire-url` POSTs (e.g. `data-sid="…"`) |

### `extend-url` JSON contract

| Response | Meaning |
|---|---|
| `{"ok":true,  "until":"<ISO>"}`                                              | granted, set countdown from now until `until` |
| `{"ok":true,  "remaining":<seconds>}`                                        | granted, set countdown to `remaining` seconds |
| `{"ok":true}` (no `until` / `remaining`)                                     | granted, reset to `timeout` |
| `{"ok":false, "redirect":"<url>", "method":"POST"\|"GET", "payload":{…}}`    | denied — client navigates as instructed |

Anything else → `session-extend-failed` event, **no** countdown reset.

> **Clock skew — prefer `remaining`.** `until` is resolved against the
> **browser clock** (`new Date(until) − Date.now()`), so a user whose
> system clock is off will see the session end early or late. Return
> **`remaining`** (exact seconds, computed server-side) when the client
> clock can't be trusted — it is immune to skew. `until` stays available
> for convenience when the client clock is reliable. (This element does
> **not** reuse `<clock-display>`'s server-time offset: that offset is
> private per `<clock-display>` instance and may not be present on the
> page, so `remaining` is the robust path.)

## Events

| Event | Bubbles | Detail | Fired when |
|---|---|---|---|
| `session-expired`       | yes | (none)                    | countdown reaches zero (right before the `expire-url` POST, if any) |
| `session-extended`      | yes | server response (or none) | extend was granted (server `ok` or `extend-url` unset) |
| `session-extend-failed` | yes | server response (or `{}`) | extend fetch failed (network or server `!ok` without redirect) |

## Example

```html
<session-keep-alive
  timeout="900"
  warn-at="120"
  extend-url="/admin/keep-alive"
  expire-url="/admin/logoff"
  data-sid="abc123"
  activity-reset></session-keep-alive>
```

## CSS Variables

| Variable | Default | Used for |
|---|---|---|
| `--ska-warn-bg`     | `#fee2e2` | warn-state background |
| `--ska-warn-color`  | `#c00`    | warn-state text colour |

## Behaviour

> **Note:** every `data-*` attribute on the host is mirrored as a form
> field on **both** the extend POST and the expire POST. Use it to
> propagate identifiers (session id, csrf token, etc.) without extra
> wiring.

> **Note:** the warning state toggles automatically via the `warn` host
> attribute when the countdown crosses `warn-at`. Style it (or override
> the CSS variables above) to integrate with your colour scheme.

> **Note:** with `activity-reset`, the listeners are attached to the
> document with `passive: true` and removed on disconnect. They reset
> the countdown but do **not** call the server — only the explicit
> button click hits `extend-url`.

---
%%>*/
class SessionKeepAlive extends HTMLElement {
  static _styleId = 'session-keep-alive-default-style';
  static _style = [
    'session-keep-alive { display: inline-flex; align-self: stretch; }',
    'session-keep-alive closure-btn { display: inline-flex; align-self: stretch; }',
    'session-keep-alive .ska-stack { display: flex; flex-direction: column; align-items: center; line-height: 1.1; }',
    'session-keep-alive .ska-label { font-size: 11px; font-weight: 400; }',
    'session-keep-alive .ska-time { font-size: 14px; font-variant-numeric: tabular-nums; font-weight: 700; }',
    'session-keep-alive[warn] closure-btn {',
    '  --form-btn-bg: var(--ska-warn-bg, #fee2e2);',
    '  --form-btn-color: var(--ska-warn-color, #c00);',
    '}',
  ].join('\n');

  connectedCallback() {
    if (this._initialized) {
      // Reconnect: restart what disconnectedCallback tore down
      this._startTimer();
      if (this._onActivity) {
        ['mousemove', 'keydown', 'touchstart'].forEach((ev) => {
          document.addEventListener(ev, this._onActivity, { passive: true });
        });
      }
      return;
    }
    this._initialized = true;
    if (!document.getElementById(SessionKeepAlive._styleId)) {
      const s = document.createElement('style');
      s.id = SessionKeepAlive._styleId;
      s.textContent = SessionKeepAlive._style;
      document.head.appendChild(s);
    }

    this._timeout   = parseInt(this.getAttribute('timeout') || '1800', 10);
    this._warnAt    = parseInt(this.getAttribute('warn-at') || '60', 10);
    this._extendUrl = this.getAttribute('extend-url') || '';
    this._expireUrl = this.getAttribute('expire-url') || '';
    this._remaining = this._timeout;

    this._btn = document.createElement('closure-btn');
    this._btn.setAttribute('free', '');
    this._btn.className = 'small';
    this._btn.addEventListener('btn-action', () => this._extend());
    this.appendChild(this._btn);
    this._render();

    this._tick = this._tick.bind(this);
    this._timerActive = false;
    this._startTimer();

    if (this.hasAttribute('activity-reset')) {
      this._onActivity = () => this._reset();
      ['mousemove', 'keydown', 'touchstart'].forEach((ev) => {
        document.addEventListener(ev, this._onActivity, { passive: true });
      });
    }
  }

  disconnectedCallback() {
    this._stopTimer();
    if (this._onActivity) {
      ['mousemove', 'keydown', 'touchstart'].forEach((ev) => {
        document.removeEventListener(ev, this._onActivity);
      });
    }
  }

  _render() {
    const m = Math.floor(this._remaining / 60);
    const s = this._remaining % 60;
    const time = String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
    this._btn.innerHTML =
      '<div class="ska-stack">' +
        '<div class="ska-label">Stay logged in</div>' +
        '<div class="ska-time">' + time + '</div>' +
      '</div>';
    if (this._remaining <= this._warnAt) {
      this.setAttribute('warn', '');
    } else {
      this.removeAttribute('warn');
    }
  }

  _startTimer() {
    if (this._timerActive || this._remaining <= 0) return;
    this._timer = setInterval(this._tick, 1000);
    this._timerActive = true;
  }

  _stopTimer() {
    clearInterval(this._timer);
    this._timerActive = false;
  }

  _tick() {
    this._remaining--;
    if (this._remaining <= 0) {
      this._remaining = 0;
      this._stopTimer();
      this._render();
      this.dispatchEvent(new CustomEvent('session-expired', { bubbles: true }));
      this._logoff();
      return;
    }
    this._render();
  }

  _logoff() {
    if (!this._expireUrl) return;
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = this._expireUrl;
    form.style.display = 'none';
    for (const attr of this.attributes) {
      if (attr.name.startsWith('data-')) {
        const hidden = document.createElement('input');
        hidden.type = 'hidden';
        hidden.name = attr.name.slice(5);
        hidden.value = attr.value;
        form.appendChild(hidden);
      }
    }
    document.body.appendChild(form);
    form.submit();
    form.remove(); // drop the node post-submit so it can't orphan in
                   // <body> if the POST doesn't navigate the page away
  }

  _reset() {
    this._remaining = this._timeout;
    this._render();
    this._startTimer();
  }

  async _extend() {
    if (this._extendUrl) {
      let data;
      try {
        const fd = new FormData();
        for (const attr of this.attributes) {
          if (attr.name.startsWith('data-')) {
            fd.append(attr.name.slice(5), attr.value);
          }
        }
        const res = await fetch(this._extendUrl, { method: 'POST', body: fd });
        data = await res.json();
      } catch (e) {
        this.dispatchEvent(new CustomEvent('session-extend-failed', { bubbles: true }));
        return;
      }

      if (data && data.ok) {
        // Server granted: update countdown from until / remaining if provided.
        if (data.until) {
          const remainingMs = new Date(data.until).getTime() - Date.now();
          this._remaining = Math.max(0, Math.floor(remainingMs / 1000));
        } else if (data.remaining != null) {
          this._remaining = parseInt(data.remaining, 10);
        } else {
          this._remaining = this._timeout;
        }
        // A grant that is already exhausted (remaining 0 / until in the
        // past) is an expiry, not an extension
        if (this._remaining <= 0) {
          this._remaining = 0;
          this._stopTimer();
          this._render();
          this.dispatchEvent(new CustomEvent('session-expired', { bubbles: true }));
          this._logoff();
          return;
        }
        this._render();
        this._startTimer(); // the interval is stopped after expiry
        this.dispatchEvent(new CustomEvent('session-extended', { bubbles: true, detail: data }));
        return;
      }

      // ok=false: server may instruct the client to navigate elsewhere.
      if (data && data.redirect) {
        this._navigate(data.redirect, data.method || 'POST', data.payload || {});
        return;
      }
      this.dispatchEvent(new CustomEvent('session-extend-failed', { bubbles: true, detail: data || {} }));
      return;
    }

    // No extend-url: simply reset locally.
    this._reset();
    this.dispatchEvent(new CustomEvent('session-extended', { bubbles: true }));
  }

  _navigate(url, method, payload) {
    if (String(method).toUpperCase() === 'GET') {
      const qs = new URLSearchParams(payload || {}).toString();
      // Respect a query string the server already put on the URL (e.g.
      // "/login?reason=timeout") instead of appending a second "?".
      const sep = url.includes('?') ? '&' : '?';
      window.location.href = qs ? url + sep + qs : url;
      return;
    }
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = url;
    form.style.display = 'none';
    for (const k in (payload || {})) {
      const hidden = document.createElement('input');
      hidden.type = 'hidden';
      hidden.name = k;
      hidden.value = payload[k];
      form.appendChild(hidden);
    }
    document.body.appendChild(form);
    form.submit();
    form.remove(); // drop the node post-submit so it can't orphan in
                   // <body> if the POST doesn't navigate the page away
  }
}

customElements.define('session-keep-alive', SessionKeepAlive);
