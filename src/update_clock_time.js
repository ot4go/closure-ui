/*<%% note:
# `<clock-display>`

Live wall-clock element synced to the server's configured timezone.

On connect, issues `GET /api/time?ts=<unix>` and uses the response to
compute a clock offset (factoring in the round-trip latency). After that
the time ticks every second from the local clock plus that offset.
Falls back to the local clock if the sync request fails or the global
`window.mdclock_skip_sync_time` is truthy.

The displayed time uses the **server's** timezone, not the browser's.

## Attributes

| Attribute | Description |
|---|---|
| `small`  | compact layout (smaller font, no margin) |
| `nodate` | hide the date row |
| `notime` | hide the time row |
| `dot`    | replace the "Server Time" label with a tiny `●` indicator; combined with `small`, renders time + dot inline |

## Format

- Time: 12-hour `HH:MM AM/PM`.
- Date: en-US long form, e.g. `Monday, January 02 2026`.

## Example

```html
<!-- Hero clock -->
<clock-display></clock-display>

<!-- Compact header indicator -->
<clock-display small dot notime></clock-display>
```

## CSS Variables

Consumed (with fallbacks):

| Variable | Default |
|---|---|
| `--font-mono`  | `monospace` |
| `--text`       | `#111827`   |
| `--text-muted` | `#6b7280`   |
| `--green`      | `#16a34a`   |

## Behaviour

> **Note:** the clock-server sync runs once per element instance (on
> connect). To force a resync, remove and re-insert the element. There is
> no public re-sync method.

> **Note:** set `window.mdclock_skip_sync_time = 1` early (before the
> element connects) to disable the network call entirely — useful in
> mockups and in tests where `/api/time` is not served.

> **Note:** font sizes also break responsively at viewport widths of
> 768px (36px) and 500px (28px) via `@media` rules.

---
%%>*/

class ClockDisplay extends HTMLElement {
  static _styleId = 'clock-display-default-style';
  static _style = [
    'clock-display {',
    '  display: block;',
    '  text-align: center;',
    '  margin-bottom: 20px;',
    '}',
    'clock-display[small] {',
    '  margin-bottom: 0;',
    '}',
    'clock-display .clock-time {',
    '  font-family: var(--font-mono, monospace);',
    '  font-size: 48px;',
    '  font-weight: 700;',
    '  color: var(--text, #111827);',
    '  letter-spacing: -1px;',
    '}',
    'clock-display[small] .clock-time {',
    '  font-size: 18px;',
    '  letter-spacing: 0;',
    '}',
    'clock-display .clock-date {',
    '  font-size: 14px;',
    '  color: var(--text-muted, #6b7280);',
    '  margin-top: 4px;',
    '}',
    'clock-display[small] .clock-date {',
    '  font-size: 11px;',
    '  margin-top: 1px;',
    '}',
    'clock-display .clock-source {',
    '  font-size: 11px;',
    '  color: var(--green, #16a34a);',
    '  font-weight: 600;',
    '  margin-top: 4px;',
    '  letter-spacing: 0.5px;',
    '}',
    'clock-display[dot] .clock-source {',
    '  font-size: 8px;',
    '  letter-spacing: 0;',
    '}',
    'clock-display[small][dot] {',
    '  display: flex;',
    '  align-items: baseline;',
    '  gap: 4px;',
    '}',
    'clock-display[small][dot] .clock-date {',
    '  display: none;',
    '}',
    '@media (max-width: 768px) {',
    '  clock-display .clock-time { font-size: 36px; }',
    '}',
    '@media (max-width: 500px) {',
    '  clock-display .clock-time { font-size: 28px; }',
    '}',
  ].join('\n');
  connectedCallback() {
    if (!document.getElementById(ClockDisplay._styleId)) {
      var s = document.createElement('style');
      s.id = ClockDisplay._styleId;
      s.textContent = ClockDisplay._style;
      document.head.appendChild(s);
    }
    this._build();
  }

  static get observedAttributes() { return ['small', 'nodate', 'notime', 'dot']; }

  attributeChangedCallback() {
    if (this._elTime) this._build();
  }

  disconnectedCallback() {
    clearInterval(this._timer);
  }

  _build() {
    const nodate = this.hasAttribute('nodate');
    const notime = this.hasAttribute('notime');
    const dot    = this.hasAttribute('dot');

    this.innerHTML =
      (notime ? '' : '<div class="clock-time">--:-- --</div>') +
      (nodate ? '' : '<div class="clock-date"></div>') +
      '<div class="clock-source"></div>';

    this._elTime   = notime ? null : this.querySelector('.clock-time');
    this._elDate   = nodate ? null : this.querySelector('.clock-date');
    this._elSource = this.querySelector('.clock-source');
    this._offset   = 0;
    this._tzOffsetMin = -(new Date().getTimezoneOffset());
    this._dot      = dot;

    clearInterval(this._timer);
    this._syncTime();
    this._updateClock();
    this._timer = setInterval(() => this._updateClock(), 1000);
  }

  async _syncTime() {
    if (window.mdclock_skip_sync_time || 0) { return; }

    try {
      const t0 = Date.now();
      const res = await fetch('/api/time?ts=' + Math.floor(t0 / 1000));
      const t1 = Date.now();
      const txt = await res.text();
      // Parse timezone offset from server response (e.g. "-05:00" or "+01:00")
      const m = txt.match(/([+-]\d{2}):(\d{2})$/);
      this._tzOffsetMin = m ? (parseInt(m[1]) * 60 + parseInt(m[2]) * Math.sign(parseInt(m[1]))) : 0;
      const serverMs = new Date(txt).getTime();
      const roundtrip = (t1 - t0) / 2;
      this._offset = serverMs - t1 + roundtrip;
      this._elSource.textContent = this._dot ? '●' : 'Server Time';
    } catch {
      this._offset = 0;
      this._tzOffsetMin = 0;
    }
  }

  _serverNow() {
    // Return a Date adjusted to the server's configured timezone
    var utcMs = Date.now() + this._offset;
    return new Date(utcMs + (this._tzOffsetMin + new Date(utcMs).getTimezoneOffset()) * 60000);
  }

  _updateClock() {
    const now = this._serverNow();
    const h = now.getHours(), m = now.getMinutes();
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    if (this._elTime) {
      this._elTime.textContent =
        String(h12).padStart(2, '0') + ':' + String(m).padStart(2, '0') + ' ' + ampm;
    }
    if (this._elDate) {
      this._elDate.textContent =
        now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: '2-digit' });
    }
  }
}

customElements.define('clock-display', ClockDisplay);
