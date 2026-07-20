/*<%% note:
# `<fingerprint-hands>`

Two-hand SVG diagram for capturing or displaying which fingerprints have
been recorded. Shadow DOM, `formAssociated`. Each finger is independently
selectable / toggleable.

Finger naming: `l1`–`l5` for the left hand (`l1`=thumb), `r1`–`r5` for
the right hand (`r1`=thumb).

Use it as a form-associated **state diagram** for a biometric-capture workflow:
it shows, per finger, whether a print has been recorded and — with `toggle` —
lets an operator mark fingers by hand, e.g. an enrolment screen that pairs it
with an external scanner driving the state. As a `formAssociated` control it
carries a `name` and posts its per-finger string with the form, like any input.

It does **not** read or capture actual fingerprints — there is no scanner
integration here; it only renders and edits the *recorded / not-recorded* state
you feed it (via attributes, `value`, or clicks).

## Attributes

| Attribute | Description |
|---|---|
| `size="sm\|md\|lg\|xl\|xxl"` | overall size (default `md`) — 80 / 120 / 160 / 220 / 300 px |
| `name="x"`                   | form field name (read by ElementInternals) |
| `toggle`                     | clicks / Space / Enter flip the finger between on/off |
| `readonly`                   | every finger renders but isn't interactive |
| `l1` … `l5`, `r1` … `r5`     | per-finger state — `1`/`on` = captured (green), `0`/`off` = empty (grey), `-1`/`disabled` = palm-coloured & ignored by the form |
| `value="l1:1,l2:0,…"`        | bulk-set state via the form value format |

When an attribute is absent, the finger defaults to `off`.

## Form value

```
l1:1,l2:0,l3:0,l4:0,l5:0,r1:1,r2:0,r3:0,r4:0,r5:0
```

Disabled fingers are encoded as `-1` so the server can distinguish
"not captured" from "not applicable".

## Properties

| Property | Description |
|---|---|
| `.value` (get) | the form-value string above |
| `.value` (set) | parses the form-value format and applies it as attributes |

## Events

| Event | Bubbles | Detail |
|---|---|---|
| `finger-click` | yes | `{ finger, state }` (state after the click) |

Fired on click, on Space, and on Enter when the focus indicator is on a
non-disabled finger.

## Example

```html
<fingerprint-hands size="lg" name="fingers"
                   l1="1" l3="on" l4="disabled"
                   toggle></fingerprint-hands>
```

## CSS Variables

| Variable | Default | Used for |
|---|---|---|
| `--fh-captured`        | `#4ade80` | captured fill |
| `--fh-captured-stroke` | `#22c55e` | captured stroke |
| `--fh-empty`           | `#e5e5e5` | empty fill |
| `--fh-empty-stroke`    | `#bbb`    | empty stroke |
| `--fh-palm`            | `#f5f5f5` | palm + disabled fill |
| `--fh-palm-stroke`     | `#ddd`    | palm + disabled stroke |
| `--fh-focus`           | `#3b82f6` | finger focus stroke |
| `--fh-focus-ring`      | `#3b82f6` | host focus ring |
| `--text-muted`         | `#6b7280`    | "Left" / "Right" labels |

## Behaviour

> **Note:** keyboard navigation walks the fingers in anatomical order
> (left pinky → left thumb → right thumb → right pinky), wrapping at
> both ends and skipping disabled fingers.

> **Note:** the host gets `tabindex="0"` automatically. The visual focus
> ring uses `:focus-visible` so it appears for keyboard users only.

> **Note:** without `toggle` the click still fires `finger-click` but
> doesn't change state — useful for read-only displays where the host
> wants to react to clicks externally.

---
%%>*/

class FingerprintHands extends HTMLElement {
  static _sizes = { sm: 80, md: 120, lg: 160, xl: 220, xxl: 300 };
  static _fingers = ['l1','l2','l3','l4','l5','r1','r2','r3','r4','r5'];
  static _navOrder = ['l5','l4','l3','l2','l1','r1','r2','r3','r4','r5'];
  static _style = [
    ':host { display: inline-flex; gap: 8px; outline: none; }',
    ':host(:focus-visible) { outline: 2px solid var(--fh-focus-ring, #3b82f6); outline-offset: 4px; border-radius: 4px; }',
    '.fh-label { text-align: center; font-weight: bold; font-size: 10px; color: var(--text-muted, #6b7280); }',
    '[data-finger].fh-focus { stroke: var(--fh-focus, #3b82f6); stroke-width: 3; }',
  ].join('\n');

  static formAssociated = true;

  static get observedAttributes() { return ['l1','l2','l3','l4','l5','r1','r2','r3','r4','r5','size','toggle','readonly']; }

  // ---
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    if (typeof ElementInternals !== 'undefined' && this.attachInternals) {
      this._internals = this.attachInternals();
    }
    this._focusIdx = -1;
  }

  // ---
  connectedCallback() {
    if (this._initialized) {
      // Reconnect: re-attach the listeners removed on disconnect
      if (this._onKey) this.addEventListener('keydown', this._onKey);
      if (this._onFocus) this.addEventListener('focus', this._onFocus);
      if (this._onBlur) this.addEventListener('blur', this._onBlur);
      return;
    }
    this._initialized = true;
    if (!this.hasAttribute('tabindex')) this.setAttribute('tabindex', '0');
    if (this.hasAttribute('value')) this.value = this.getAttribute('value');
    this._render();
    this._updateFormValue();
    this._bindKeyboard();
  }

  // ---
  disconnectedCallback() {
    if (this._onKey) this.removeEventListener('keydown', this._onKey);
    if (this._onFocus) this.removeEventListener('focus', this._onFocus);
    if (this._onBlur) this.removeEventListener('blur', this._onBlur);
  }

  // ---
  attributeChangedCallback() {
    if (this.isConnected) {
      this._render();
      this._updateFormValue();
    }
  }

  _getState(finger) {
    if (!this.hasAttribute(finger)) return 'off';
    var v = (this.getAttribute(finger) || '').toLowerCase();
    if (v === '1' || v === 'on' || v === '') return 'on';
    if (v === 'disabled' || v === '-1') return 'disabled';
    return 'off'; // "0", "off", or anything else
  }

  _updateFormValue() {
    if (!this._internals) return;
    var parts = [];
    var fingers = FingerprintHands._fingers;
    for (var i = 0; i < fingers.length; i++) {
      var state = this._getState(fingers[i]);
      parts.push(fingers[i] + ':' + (state === 'on' ? '1' : state === 'disabled' ? '-1' : '0'));
    }
    this._internals.setFormValue(parts.join(','));
  }

  // ---
  get value() {
    var parts = [];
    var fingers = FingerprintHands._fingers;
    for (var i = 0; i < fingers.length; i++) {
      var state = this._getState(fingers[i]);
      parts.push(fingers[i] + ':' + (state === 'on' ? '1' : state === 'disabled' ? '-1' : '0'));
    }
    return parts.join(',');
  }

  // ---
  set value(str) {
    if (!str) return;
    var pairs = str.split(',');
    for (var i = 0; i < pairs.length; i++) {
      var kv = pairs[i].split(':');
      if (kv.length !== 2) continue;
      var key = kv[0].trim();
      // Only accept known finger names — anything else would let a
      // value string set arbitrary attributes (e.g. onclick handlers)
      if (FingerprintHands._fingers.indexOf(key) === -1) continue;
      this.setAttribute(key, kv[1].trim());
    }
  }

  _bindKeyboard() {
    if (this._onKey) return; // already bound
    var self = this;
    var nav = FingerprintHands._navOrder;

    this._onFocus = function() {
      if (self._focusIdx < 0) self._focusIdx = self._nextNav(-1, 1);
      self._updateFocusVisual();
    };
    this._onBlur = function() {
      self._focusIdx = -1;
      self._updateFocusVisual();
    };
    this._onKey = function(e) {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        self._focusIdx = self._nextNav(self._focusIdx, 1);
        self._updateFocusVisual();
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        self._focusIdx = self._nextNav(self._focusIdx, -1);
        self._updateFocusVisual();
      } else if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        if (self._focusIdx < 0 || self.hasAttribute('readonly')) return;
        var finger = nav[self._focusIdx];
        var state = self._getState(finger);
        if (self.hasAttribute('toggle') && state !== 'disabled') {
          self.setAttribute(finger, state === 'on' ? '0' : '1');
        }
        self.dispatchEvent(new CustomEvent('finger-click', {
          detail: { finger: finger, state: self._getState(finger) },
          bubbles: true
        }));
      }
    };
    this.addEventListener('focus', this._onFocus);
    this.addEventListener('blur', this._onBlur);
    this.addEventListener('keydown', this._onKey);
  }

  _nextNav(from, dir) {
    var nav = FingerprintHands._navOrder;
    var i = from;
    for (var n = 0; n < nav.length; n++) {
      i = i + dir;
      if (i >= nav.length) i = 0;
      if (i < 0) i = nav.length - 1;
      if (this._getState(nav[i]) !== 'disabled') return i;
    }
    return -1; // all disabled
  }

  _updateFocusVisual() {
    this.shadowRoot.querySelectorAll('[data-finger].fh-focus').forEach(function(el) {
      el.classList.remove('fh-focus');
    });
    if (this._focusIdx < 0) return;
    var finger = FingerprintHands._navOrder[this._focusIdx];
    var el = this.shadowRoot.querySelector('[data-finger="' + finger + '"]');
    if (el) el.classList.add('fh-focus');
  }

  _render() {
    var sz = FingerprintHands._sizes[this.getAttribute('size') || 'md'] || 120;
    var h = Math.round(sz * 1.33);
    var self = this;

    var isReadonly = self.hasAttribute('readonly');
    var fillOn = 'var(--fh-captured, #4ade80)';
    var strokeOn = 'var(--fh-captured-stroke, #22c55e)';
    var fillOff = 'var(--fh-empty, #e5e5e5)';
    var strokeOff = 'var(--fh-empty-stroke, #bbb)';
    var palmFill = 'var(--fh-palm, #f5f5f5)';
    var palmStroke = 'var(--fh-palm-stroke, #ddd)';

    function f(id) {
      var state = self._getState(id);
      var cursor = (isReadonly || state === 'disabled') ? 'default' : 'pointer';
      var attrs = 'data-finger="' + id + '" style="cursor:' + cursor + '" ';
      if (state === 'disabled') return attrs + 'fill="' + palmFill + '" stroke="' + palmStroke + '"';
      if (state === 'on') return attrs + 'fill="' + fillOn + '" stroke="' + strokeOn + '"';
      return attrs + 'fill="' + fillOff + '" stroke="' + strokeOff + '"';
    }

    var palm = '<path fill="' + palmFill + '" stroke="' + palmStroke + '" stroke-width="1" d="M30,130 Q20,130 20,140 L20,200 Q20,230 50,230 L130,230 Q160,230 160,200 L160,140 Q160,130 150,130 Z"/>';

    var leftSvg = '<svg width="' + sz + '" height="' + h + '" viewBox="0 0 180 240">' + palm +
      '<rect ' + f('l5') + ' stroke-width="1.5" x="22" y="70" width="24" height="65" rx="12"/>' +
      '<rect ' + f('l4') + ' stroke-width="1.5" x="50" y="40" width="24" height="95" rx="12"/>' +
      '<rect ' + f('l3') + ' stroke-width="1.5" x="78" y="25" width="24" height="110" rx="12"/>' +
      '<rect ' + f('l2') + ' stroke-width="1.5" x="106" y="45" width="24" height="90" rx="12"/>' +
      '<ellipse ' + f('l1') + ' stroke-width="1.5" cx="148" cy="155" rx="18" ry="35" transform="rotate(25,148,155)"/>' +
      '</svg>';

    var rightSvg = '<svg width="' + sz + '" height="' + h + '" viewBox="0 0 180 240">' + palm +
      '<rect ' + f('r2') + ' stroke-width="1.5" x="22" y="45" width="24" height="90" rx="12"/>' +
      '<rect ' + f('r3') + ' stroke-width="1.5" x="50" y="25" width="24" height="110" rx="12"/>' +
      '<rect ' + f('r4') + ' stroke-width="1.5" x="78" y="40" width="24" height="95" rx="12"/>' +
      '<rect ' + f('r5') + ' stroke-width="1.5" x="106" y="70" width="24" height="65" rx="12"/>' +
      '<ellipse ' + f('r1') + ' stroke-width="1.5" cx="32" cy="155" rx="18" ry="35" transform="rotate(-25,32,155)"/>' +
      '</svg>';

    var labelSize = Math.max(9, Math.round(sz * 0.08));
    this.shadowRoot.innerHTML =
      '<style>' + FingerprintHands._style + '</style>' +
      '<div><div class="fh-label" style="font-size:' + labelSize + 'px">Left</div>' + leftSvg + '</div>' +
      '<div><div class="fh-label" style="font-size:' + labelSize + 'px">Right</div>' + rightSvg + '</div>';

    // Click handler: toggle + dispatch finger-click event (skip if readonly)
    if (!isReadonly) {
      this.shadowRoot.querySelectorAll('[data-finger]').forEach(function(el) {
        el.addEventListener('click', function() {
          var finger = el.getAttribute('data-finger');
          var state = self._getState(finger);
          if (state === 'disabled') return;
          if (self.hasAttribute('toggle')) {
            self.setAttribute(finger, state === 'on' ? '0' : '1');
          }
          self.dispatchEvent(new CustomEvent('finger-click', {
            detail: { finger: finger, state: self._getState(finger) },
            bubbles: true
          }));
        });
      });
    }

    // Re-apply focus visual after render
    this._updateFocusVisual();
  }
}

customElements.define('fingerprint-hands', FingerprintHands);
