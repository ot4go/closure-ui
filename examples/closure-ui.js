

function applyWidthRange(el) {
  var wr = el.getAttribute('wr');
  if (!wr) return;
  var parts = wr.split(',');
  var min = (parts[0] || '').trim();
  var max = (parts[1] || '').trim();
  var isNatural = (min === '-' || min === '*' || min === '') && (max === '-' || max === '*' || max === '');
  if (isNatural) {
    el.style.flex = '0 0 auto';
  } else {
    if (min && min !== '-' && min !== '*') el.style.minWidth = min;
    if (max && max !== '-' && max !== '*') el.style.maxWidth = max;
  }
}


customElements.define('signal-event', class extends HTMLElement {
  connectedCallback() {
    this.style.display = 'none';
    if (!this.getAttribute('name')) { this.remove(); return; }
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

  static get observedAttributes() { return ['small', 'nodate', 'notime', 'dot', 'no-local']; }

  attributeChangedCallback() {
    // _elSource always exists after a build; _elTime is null with `notime`
    if (this._elSource) this._build();
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
    if (this.hasAttribute('no-local')) {
      // Hold the --:-- placeholder (size preserved, no layout shift) until the
      // server time arrives, then start ticking — no flash of local time.
      // _syncTime resolves even on failure (it falls back to local), so the
      // clock still starts; it just waits for the round-trip first.
      this._syncTime().then(() => {
        this._updateClock();
        this._timer = setInterval(() => this._updateClock(), 1000);
      });
    } else {
      this._syncTime();
      this._updateClock();
      this._timer = setInterval(() => this._updateClock(), 1000);
    }
  }

  async _syncTime() {
    if (window.mdclock_skip_sync_time || 0) { return; }

    try {
      const t0 = Date.now();
      const res = await fetch('/api/time?ts=' + Math.floor(t0 / 1000));
      if (!res.ok) throw new Error('HTTP ' + res.status); // error page is not a timestamp
      const t1 = Date.now();
      const txt = await res.text();
      // Parse timezone offset from server response (e.g. "-05:00" or "+01:00")
      const m = txt.match(/([+-]\d{2}):(\d{2})$/);
      // Sign comes from the string — parseInt("-00") is 0, which would
      // drop the minutes term for ±00:mm offsets
      this._tzOffsetMin = m
        ? (m[1].charAt(0) === '-' ? -1 : 1) * (Math.abs(parseInt(m[1], 10)) * 60 + parseInt(m[2], 10))
        : 0;
      const serverMs = new Date(txt).getTime();
      const roundtrip = (t1 - t0) / 2;
      this._offset = serverMs - t1 + roundtrip;
      this._elSource.textContent = this._dot ? '●' : 'Server Time';
    } catch {
      // Sync failed: fall back to the local clock, not UTC
      this._offset = 0;
      this._tzOffsetMin = -(new Date().getTimezoneOffset());
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


class CredentialPwd extends HTMLElement {
  static _styleId = 'credential-pwd-default-style';
  static _style = [
    'credential-pwd {',
    '  display: block;',
    '  width: 100%;',
    '  padding: 10px 12px;',
    '  border: 1px solid var(--border, #e5e7eb);',
    '  border-radius: 6px;',
    '  font-family: var(--font, sans-serif);',
    '  font-size: 14px;',
    '  color: var(--text, #111827);',
    '  background: #fff;',
    '  transition: border-color 0.15s, box-shadow 0.15s;',
    '  margin-bottom: 12px;',
    '  cursor: text;',
    '  min-height: 38px;',
    '}',
    'credential-pwd:focus {',
    '  outline: none;',
    '  border-color: var(--primary, #4f46e5);',
    '  box-shadow: 0 0 0 3px var(--primary-light, #e0e7ff);',
    '}',
    'credential-pwd.field-invalid {',
    '  border-color: var(--red, #dc2626);',
    '  box-shadow: 0 0 0 3px rgba(220, 38, 38, 0.2);',
    '}',
  ].join('\n');

  connectedCallback() {
    if (this._initialized) return;
    this._initialized = true;
    if (!document.getElementById(CredentialPwd._styleId)) {
      const s = document.createElement('style');
      s.id = CredentialPwd._styleId;
      s.textContent = CredentialPwd._style;
      document.head.appendChild(s);
    }
    this._value = '';
    this.pasted = false;
    this.tabIndex = 0;
    // attributeChangedCallback fires before init for parsed attributes —
    // apply an initial readonly here
    if (this.hasAttribute('readonly')) {
      this.tabIndex = -1;
      this.style.pointerEvents = 'none';
    }

    this._input = document.createElement('input');
    this._input.type = 'password';
    this._input.name = this.getAttribute('name') || '';
    this._input.tabIndex = -1;
    this._input.autocomplete = 'new-password';
    if (this.hasAttribute('required')) this._input.required = true;
    Object.assign(this._input.style, {
      position: 'absolute', opacity: '0', width: '0', height: '0', pointerEvents: 'none'
    });

    this._display = document.createElement('span');
    this._display.setAttribute('aria-hidden', 'true');

    this.appendChild(this._input);
    this.appendChild(this._display);

    // Show placeholder dots if has-value (existing password)
    this._hasValue = this.hasAttribute('has-value');
    if (this._hasValue) {
      this._display.textContent = '\u25CF\u25CF\u25CF\u25CF\u25CF\u25CF';
    }
    // clear-behavior controls WHEN a has-value placeholder is wiped:
    // 'edit' (default, soft) on the first keystroke / paste; 'focus'
    // (aggressive) the moment the field gains focus.
    this._clearOnFocus = this.getAttribute('clear-behavior') === 'focus';

    this._input.addEventListener('invalid', (e) => {
      e.preventDefault();
      this.classList.add('field-invalid');
    });

    this.addEventListener('focus', () => {
      // Aggressive mode (clear-behavior="focus") only: wipe the existing-
      // password placeholder on focus. Soft mode (default) defers the wipe
      // to the first keystroke / paste (see _onKeyDown / _onPaste), so
      // accidental focus or tabbing through never blanks it.
      if (this._hasValue && this._clearOnFocus) {
        this._hasValue = false;
        this._clear();
      }
    });
    this.addEventListener('keydown', (e) => this._onKeyDown(e));
    this.addEventListener('paste', (e) => this._onPaste(e));
  }

  static get observedAttributes() { return ['name', 'required', 'readonly']; }

  attributeChangedCallback(attr, _, val) {
    if (!this._input) return;
    if (attr === 'name') this._input.name = val;
    if (attr === 'required') this._input.required = val !== null;
    if (attr === 'readonly') {
      if (val !== null) {
        this.tabIndex = -1;
        this.style.pointerEvents = 'none';
      } else {
        this.tabIndex = 0;
        this.style.pointerEvents = '';
      }
    }
  }

  _clear() {
    this._value = '';
    this._input.value = '';
    this._render();
  }

  _onPaste(e) {
    const text = e.clipboardData.getData('text');
    if (!text) return;
    if (this._hasValue) this._hasValue = false; // first edit clears the placeholder state
    this._value = text;
    this._input.value = this._value;
    this.pasted = true;
    this.classList.remove('field-invalid');
    this._render();
    e.preventDefault();
  }

  _onKeyDown(e) {
    if (e.key === 'Tab') return;
    if (e.key === 'Backspace') {
      // Soft mode: first edit clears the has-value placeholder (no-op in
      // aggressive mode, where focus already cleared it).
      if (this._hasValue) { this._hasValue = false; this._value = ''; }
      if (this.pasted) { this.pasted = false; this._value = ''; }
      this._value = this._value.slice(0, -1);
    } else if (e.key === 'Enter') {
      // Priority: explicit enter-btn-id → the form's default action button
      // → plain form submit → advance focus. We CLICK the default button
      // rather than calling form.requestSubmit(): requestSubmit() carries no
      // submitter and is not equivalent to a real button click (and a
      // <closure-btn> is an <a>, not a type=submit) — that mismatch is why
      // Enter could "do nothing" on a form where clicking the button works.
      const btnId = this.getAttribute('enter-btn-id');
      if (btnId) {
        const btn = document.getElementById(btnId);
        if (btn) { e.preventDefault(); this._activate(btn); return; }
      }
      const form = this.closest('form');
      if (form) {
        e.preventDefault();
        // Behave like a native <input type=password>: Enter performs the
        // form's implicit submission — click the default submit button if
        // there is one, else submit the form directly. No closure coupling.
        const defBtn = form.querySelector(
          'button[type="submit"], input[type="submit"], button:not([type])'
        );
        if (defBtn) { defBtn.click(); return; }
        if (form.requestSubmit) form.requestSubmit();
        else form.submit();
      } else {
        this._focusNext();
      }
      return;
    } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      // Soft mode: first edit clears the has-value placeholder.
      if (this._hasValue) { this._hasValue = false; this._value = ''; }
      if (this.pasted) { this.pasted = false; this._value = ''; }
      this._value += e.key;
    } else {
      return;
    }
    this._input.value = this._value;
    this.classList.remove('field-invalid');
    this._render();
    e.preventDefault();
  }

  _focusNext() {
    // Scope the walk to the nearest container (dialog / lightbox / form) so
    // Enter never jumps focus out of the current context (e.g. into another
    // open dialog). Falls back to the whole document when there is none.
    var scope = this.closest('dialog, [role="dialog"], closure-lightbox, form') || document;
    var focusables = Array.from(scope.querySelectorAll(
      'input, select, textarea, button, a[href], [tabindex]'
    )).filter(function(el) {
      return el.tabIndex >= 0 && !el.disabled && el.offsetParent !== null;
    });
    var idx = focusables.indexOf(this);
    if (idx >= 0 && idx + 1 < focusables.length) focusables[idx + 1].focus();
  }

  // Activate an `enter-btn-id` target: a <closure-btn> handles the click on
  // its inner shadow anchor (which enforces disabled/readonly); any plain
  // element takes a host-level click.
  _activate(btn) {
    const anchor = btn.shadowRoot && btn.shadowRoot.querySelector('a');
    if (anchor) anchor.click();
    else btn.click();
  }

  // ---
  get value() { return this._value; }

  // ---
  set value(val) {
    this._value = val || '';
    this._input.value = this._value;
    this.pasted = false;
    this.classList.remove('field-invalid');
    this._render();
  }

  _render() {
    this._display.textContent = '\u25CF'.repeat(this._value.length);
  }
}

customElements.define('credential-pwd', CredentialPwd);


class BtnGrid extends HTMLElement {
  static _style = [
    ':host {',
    '  display: grid;',
    '  grid-template-columns: repeat(var(--btn-grid-cols, 3), 1fr);',
    '  gap: 14px;',
    '  margin-top: 0;',
    '  margin-bottom: 16px;',
    '  --form-btn-padding: 28px 16px;',
    '  --form-btn-font-size: 15px;',
    '  --form-btn-bg: #ffffff;',
    '  --form-btn-color: #111827;',
    '  --form-btn-radius: 10px;',
    '  --form-btn-shadow: 0 2px 8px rgba(0,0,0,0.10);',
    '  --form-btn-shadow-hover: 0 4px 16px rgba(0,0,0,0.16);',
    '  --form-btn-min-height: 110px;',
    '}',
  ].join('\n');
  connectedCallback() {
    // attachShadow throws on a second connect (DOM re-parenting)
    if (!this.shadowRoot) this.attachShadow({ mode: 'open' });
    this._render();
  }

  static get observedAttributes() { return ['cols', 'no-icon']; }

  attributeChangedCallback() {
    if (this.shadowRoot) this._render();
  }

  _render() {
    // Sanitize to a positive integer: a junk value (e.g. cols="banana")
    // would otherwise emit `repeat(banana, 1fr)` and break the layout.
    const cols = Math.max(1, parseInt(this.getAttribute('cols'), 10) || 3);
    // no-icon implies compact text-only buttons: the card sizing
    // (110px min-height, 28px padding) is designed around the icon
    const noIcon = this.hasAttribute('no-icon')
      ? '--form-btn-icon-display: none; --form-btn-min-height: 0; --form-btn-padding: 14px 16px;'
      : '';

    const style = document.createElement('style');
    style.textContent = BtnGrid._style +
      '\n:host { --btn-grid-cols: ' + cols + '; ' + noIcon + ' }';

    const slot = document.createElement('slot');

    this.shadowRoot.innerHTML = '';
    this.shadowRoot.appendChild(style);
    this.shadowRoot.appendChild(slot);
  }
}

customElements.define('btn-grid', BtnGrid);


class DataMap extends HTMLElement {
  connectedCallback() {
    this.style.display = 'none';
  }

  resolve(value) {
    const str = String(value);
    const items = this.querySelectorAll('map-item');
    for (const item of items) {
      if (item.getAttribute('value') === str) return this._read(item);
    }
    const def = this.querySelector('map-item[default]');
    return def ? this._read(def) : null;
  }

  _read(item) {
    const result = {};
    for (const attr of item.attributes) {
      if (attr.name !== 'value' && attr.name !== 'default') {
        result[attr.name] = attr.value;
      }
    }
    return result;
  }
}

customElements.define('data-map', DataMap);


customElements.define('map-item', class extends HTMLElement {
  connectedCallback() { this.style.display = 'none'; }
});


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
    
    var self = this;
    var i = 0;

    function processNext() {
      while (i < allChildren.length) {
        var child = allChildren[i++];
        var tagName = child.tagName.toLowerCase();
        
        if (tagName === 'closure-response-section') {
          // Sections carry content, not directives — placed below
          continue;
        }
        if (tagName === 'response-item') {
          var type = child.getAttribute('type') || '';
          if (type === 'delay') {
            var ms = parseInt(child.getAttribute('ms') || '0', 10);
            if (ms > 0) { setTimeout(processNext, ms); return; }
          } else {
            self._executeItem(child, type);
          }
        } else if (closure && closure.dispatchTags) {
          
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
      var el = document.querySelector(sel);
      if (el) results.push(el);
    }
    var selAll = item.getAttribute('target-selector-all');
    if (selAll) {
      document.querySelectorAll(selAll).forEach(function(el) { results.push(el); });
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
          body: new URLSearchParams(new FormData(form))
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
      
      var subs = self._tagSubscribers[tag];
      if (subs) {
        subs.forEach(function(obj) {
          
          obj.onClosureTag(tag, el);
        });
      }
    });
  }

  loadContent(html) {
    
    var result = ClosureResponse.process(html, this);
    
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
      // Append params to URL, no body
      if (opts.body) {
        var sep = url.includes('?') ? '&' : '?';
        url = url + sep + opts.body.toString();
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
          if (k in jsonData) jsonData[k] = [].concat(jsonData[k], v);
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
        if (key in target) target[key] = [].concat(target[key], value);
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
      
      self._clearLoading(responseAttrs);

      if (!response.ok) {
        var handled = self._handleFail(String(response.status), response.status, html, responseAttrs);
        if (handled) return;
      }

      // Delegate: skip parsing, let the target handle it
      if (response.ok && self._shouldDelegateResponse()) {
        
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
        
        if (lb) {
          if (response.ok) lb.showResponse(html);
          else lb.showError(html);
        }
      }

      // Target
      var targetId = responseAttrs['response-target-' + suffix + '-id']
                  || responseAttrs['response-target-id'];
      if (targetId) {
        var target = document.getElementById(targetId);
        if (target) target.innerHTML = html;
      }

      // template-response-ok with its own target
      if (response.ok) {
        var okEl = self._findResponseOk();
        if (okEl && okEl.hasAttribute('target')) {
          var okTarget = document.getElementById(okEl.getAttribute('target'));
          if (okTarget) okTarget.innerHTML = html;
        }
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
      closure.dispatchEvent(new CustomEvent('closure-response', {
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


class ClosureBtn extends HTMLElement {
  static _style = [
    ':host {',
    '  display: var(--form-btn-host-display, block);',
    '  min-height: var(--form-btn-min-height, 100px);',
    '  position: relative;',
    '}',
    'a {',
    '  padding: var(--form-btn-padding, 10px 20px);',
    '  border: none;',
    '  border-radius: var(--form-btn-radius, 6px);',
    '  cursor: pointer;',
    '  font-family: var(--font, sans-serif);',
    '  font-size: var(--form-btn-font-size, 14px);',
    '  font-weight: 600;',
    '  text-decoration: none;',
    '  display: flex;',
    '  align-items: center;',
    '  justify-content: center;',
    '  width: var(--form-btn-width, 100%);',
    '  height: var(--form-btn-height, auto);',
    '  box-sizing: border-box;',
    '  transition: background 0.15s, box-shadow 0.15s, transform 0.1s;',
    '  text-align: center;',
    '  gap: 10px;',
    '  flex-direction: var(--form-btn-direction, column);',
    '  background: var(--form-btn-bg, var(--primary, #4f46e5));',
    '  color: var(--form-btn-color, #fff);',
    '  box-shadow: var(--form-btn-shadow, none);',
    '}',
    'a span { font-size: var(--form-btn-icon-size, 2.4em); line-height: 1; display: var(--form-btn-icon-display, block); }',
    'a:hover {',
    '  box-shadow: var(--form-btn-shadow-hover, none);',
    '  transform: translateY(-1px);',
    '}',
    'a.disabled {',
    '  opacity: 0.4;',
    '  cursor: not-allowed;',
    '  pointer-events: none;',
    '}',
    ':host([readonly]) a {',
    '  visibility: hidden;',
    '}',
    'a.green { background: var(--green, #16a34a); color: #fff; }',
    'a.green:hover { background: var(--green-hover, #15803d); }',
    'a.gray { background: var(--gray, #6b7280); color: #fff; }',
    'a.gray:hover { background: var(--gray-hover, #4b5563); }',
    'a.primary { background: var(--primary, #4f46e5); color: #fff; }',
    'a.primary:hover { background: #4338ca; }',
    'a.red { background: var(--red, #dc2626); color: #fff; }',
    'a.red:hover { background: var(--red-hover, #b91c1c); }',
    'a.btn-full { width: 100%; }',
    'a.small { padding: 6px 12px; font-size: 12px; }',
    /* v-fill: make <a> stretch to host's full height so content centers */
    ':host([v-fill]) { display: flex; }',
    ':host([v-fill]) a { height: 100%; }',
    '.backdrop {',
    '  display: none;',
    '  position: fixed;',
    '  inset: 0;',
    '  background: rgba(0,0,0,0.4);',
    '  z-index: 998;',
    '}',
    '.backdrop.open { display: block; }',
    '.menu-panel {',
    '  display: none;',
    '  position: absolute;',
    '  top: 50%;',
    '  left: 50%;',
    '  transform: translate(-50%, -50%);',
    '  min-width: 200px;',
    '  background: #fff;',
    '  border: 1px solid var(--border, #e5e7eb);',
    '  border-radius: 8px;',
    '  box-shadow: 0 4px 20px rgba(0,0,0,0.15);',
    '  z-index: 999;',
    '  overflow: hidden;',
    '}',
    '.menu-panel.open { display: block; }',
    '.menu-panel-header {',
    '  padding: 12px 16px;',
    '  font-family: var(--font, sans-serif);',
    '  font-size: 13px;',
    '  font-weight: 700;',
    '  color: var(--text-muted, #6b7280);',
    '  text-transform: uppercase;',
    '  letter-spacing: 0.05em;',
    '  border-bottom: 1px solid var(--border, #e5e7eb);',
    '}',
    '@media (max-width: 600px) {',
    '  .menu-panel {',
    '    position: fixed;',
    '    left: 50%;',
    '    top: 50%;',
    '    transform: translate(-50%, -50%);',
    '    width: 90vw;',
    '    max-width: 360px;',
    '    border-radius: 12px;',
    '  }',
    '}',
  ].join('\n');

  connectedCallback() {
    if (!this._initialized) {
      this._initialized = true;
      this._boundDocClick = this._onDocClick.bind(this);
      this.attachShadow({ mode: 'open' });
      this._render();
    }
    // (Re-)register document listeners outside the init guard so they
    // survive a disconnect/reconnect cycle (e.g. DOM re-parenting)
    document.addEventListener('click', this._boundDocClick);
    if (this._menuKeydown) document.addEventListener('keydown', this._menuKeydown);
  }

  disconnectedCallback() {
    document.removeEventListener('click', this._boundDocClick);
    if (this._menuKeydown) document.removeEventListener('keydown', this._menuKeydown);
  }

  static get observedAttributes() { return ['icon', 'disabled', 'menu', 'nolabel', 'label', 'width', 'readonly']; }

  attributeChangedCallback() {
    if (this.shadowRoot) this._render();
  }

  _render() {
    const hasMenu = this.hasAttribute('menu');
    const disabledVal = this.getAttribute('disabled');
    const disabled = disabledVal === '' || disabledVal === 'disabled' || disabledVal === 'true';
    const readonly = this.hasAttribute('readonly');
    this.tabIndex = (disabled || readonly) ? -1 : 0;
    this.onkeydown = (e) => {
      if (e.key === 'Enter' || (hasMenu && e.key === ' ')) {
        // With the menu open and an item focused, let the document-level
        // keydown handler activate the item — clicking the anchor here
        // would just close the panel without dispatching anything
        if (hasMenu && e.key === 'Enter' && this._focusedItem &&
            this._panel && this._panel.classList.contains('open')) {
          return;
        }
        e.preventDefault();
        this.shadowRoot.querySelector('a').click();
      }
    };

    const style = document.createElement('style');
    style.textContent = ClosureBtn._style;

    const nolabel = this.hasAttribute('nolabel');
    const a = document.createElement('a');
    a.href = '#';
    a.tabIndex = -1;
    a.className = (this.getAttribute('class') || '') + (disabled ? ' disabled' : '');
    const width = this._cssLength(this.getAttribute('width') || '');
    if (width) {
      this.style.width = width;
      a.style.width = width;
      a.style.minWidth = width;
      a.style.maxWidth = width;
    } else {
      this.style.width = '';
    }
    if (nolabel && !this.hasAttribute('notooltip')) {
      const tooltip = this.getAttribute('label') || this.getAttribute('menu') || '';
      if (tooltip) a.title = tooltip;
    }

    const icon = this.getAttribute('icon');
    if (icon) {
      const iconSpan = document.createElement('span');
      iconSpan.setAttribute('aria-hidden', 'true');
      iconSpan.textContent = icon;
      a.appendChild(iconSpan);
    }

    const slot = document.createElement('slot');
    if (!nolabel) slot.innerHTML = '&nbsp;';

    if (hasMenu) {
      if (!nolabel) {
        const labelSlot = document.createElement('slot');
        labelSlot.name = 'label';
        labelSlot.innerHTML = this.getAttribute('menu') || '&nbsp;';
        a.appendChild(labelSlot);
      }

      const backdrop = document.createElement('div');
      backdrop.className = 'backdrop';

      const panel = document.createElement('div');
      panel.className = 'menu-panel';

      const header = document.createElement('div');
      header.className = 'menu-panel-header';
      header.textContent = this.getAttribute('menu') || '';
      panel.appendChild(header);
      panel.appendChild(slot);

      const toggle = (open) => {
        if (!open) {
          panel.style.top = '';
          panel.style.left = '';
          panel.style.transform = '';
          panel.style.position = '';
          this._focusItem(Array.from(this.querySelectorAll('closure-btn-item')), -1);
          this._focusedItem = null;
        }
        panel.classList.toggle('open', open);
        backdrop.classList.toggle('open', open);
        if (open) this._reposition(panel);
      };

      a.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!disabled && !readonly) toggle(!panel.classList.contains('open'));
      });

      backdrop.addEventListener('click', () => toggle(false));
      // Close the panel when a menu item is activated by mouse — the
      // item's own click handler (which dispatches) runs first
      if (this._menuItemClick) this.removeEventListener('click', this._menuItemClick);
      this._menuItemClick = (e) => {
        if (e.target.closest && e.target.closest('closure-btn-item')) toggle(false);
      };
      this.addEventListener('click', this._menuItemClick);
      // Keep a single document keydown listener per instance: remove the
      // previous one before re-rendering, and let disconnectedCallback
      // clean it up
      if (this._menuKeydown) document.removeEventListener('keydown', this._menuKeydown);
      this._menuKeydown = (e) => {
        if (!panel.classList.contains('open')) return;
        if (e.key === 'Escape') { toggle(false); return; }
        const items = Array.from(this.querySelectorAll('closure-btn-item:not([disabled])'));
        if (!items.length) return;
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault();
          let idx = items.indexOf(this._focusedItem || null);
          idx = e.key === 'ArrowDown' ? Math.min(idx + 1, items.length - 1) : Math.max(idx - 1, 0);
          this._focusItem(items, idx);
        } else if (e.key === 'Enter' && this._focusedItem) {
          e.preventDefault();
          this._focusedItem._dispatch();
          toggle(false);
        }
      };
      // While detached, disconnectedCallback already ran — let the next
      // connectedCallback re-register instead of leaking a doc listener
      if (this.isConnected) document.addEventListener('keydown', this._menuKeydown);

      this._panel = panel;
      this._backdrop = backdrop;
      this.shadowRoot.innerHTML = '';
      this.shadowRoot.appendChild(style);
      this.shadowRoot.appendChild(backdrop);
      this.shadowRoot.appendChild(a);
      this.shadowRoot.appendChild(panel);
    } else {
      // Drop any leftover menu state from a previous render
      if (this._menuKeydown) {
        document.removeEventListener('keydown', this._menuKeydown);
        this._menuKeydown = null;
      }
      if (this._menuItemClick) {
        this.removeEventListener('click', this._menuItemClick);
        this._menuItemClick = null;
      }
      this._panel = null;
      this._backdrop = null;
      this._focusedItem = null;

      a.appendChild(slot);

      if (this.hasAttribute('free')) {
        // Free mode: behave like form-btn (direct submit or btn-action)
        const url = this.getAttribute('url') || '';
        if (url) {
          var self = this;
          a.addEventListener('click', (e) => {
            e.preventDefault();
            if (disabled || readonly) return;
            const form = document.createElement('form');
            form.method = 'POST';
            form.action = url;
            form.style.display = 'none';
            for (const attr of self.attributes) {
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
            form.remove(); // drop the node post-submit so it can't orphan
                           // in <body> on a download / new-tab action
          });
        } else {
          a.addEventListener('click', (e) => {
            e.preventDefault();
            if (disabled || readonly) return;
            this._dispatch();
          });
        }
      } else {
        a.addEventListener('click', (e) => {
          e.preventDefault();
          if (disabled || readonly) return;
          this._dispatch();
        });
      }

      this.shadowRoot.innerHTML = '';
      this.shadowRoot.appendChild(style);
      this.shadowRoot.appendChild(a);
    }
  }

  _dispatch() {
    if (this._runClientAction()) return;
    const eventName = this.getAttribute('event') || 'btn-action';
    const targetId = this.getAttribute('target-id') || '';
    const dest = targetId ? document.getElementById(targetId) : this;
    if (dest) {
      dest.dispatchEvent(new CustomEvent(eventName, { bubbles: true }));
    }
  }

  _runClientAction() {
    const action = this.getAttribute('client-action') || '';
    if (action !== 'set-value') return false;

    const value = this.getAttribute('value') || '';
    this._resolveTargets().forEach(el => {
      el.value = value;
      // Assigning .value in JS does NOT fire input/change, so dirty-state
      // tracking (target-closure listens for them) and any other listeners
      // would miss the edit. Dispatch both, as a real user edit would.
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });
    return true;
  }

  _cssLength(value) {
    const v = String(value || '').trim();
    if (!v) return '';
    if (/^-?\d+(\.\d+)?$/.test(v)) return v + 'px';
    return v;
  }

  _resolveTargets() {
    const results = [];
    const id = this.getAttribute('target-id') || '';
    if (id) {
      const el = document.getElementById(id);
      if (el) results.push(el);
    }

    const selector = this.getAttribute('target-selector') || '';
    if (selector) {
      const el = document.querySelector(selector);
      if (el) results.push(el);
    }

    const selectorAll = this.getAttribute('target-selector-all') || '';
    if (selectorAll) {
      document.querySelectorAll(selectorAll).forEach(el => results.push(el));
    }

    return results;
  }

  getBtnData() {
    var section = this.getAttribute('section') || '';
    var fields = {};
    for (const attr of this.attributes) {
      if (attr.name.startsWith('data-')) fields[attr.name.slice(5)] = attr.value;
    }
    var sections = {};
    sections[section] = fields;
    return {
      ctRole: this.getAttribute('ct-role') || '',
      closureTemplate: this.getAttribute('closure-template') || '',
      sections: sections
    };
  }

  _focusItem(items, idx) {
    items.forEach((item, i) => item.toggleAttribute('focused', i === idx));
    this._focusedItem = items[idx] || null;
  }

  _reposition(panel) {
    // Narrow viewports use the centered-modal layout from the media
    // query — inline styles would override it, so clear them instead
    if (window.matchMedia('(max-width: 600px)').matches) {
      panel.style.transform = '';
      panel.style.position = '';
      panel.style.top = '';
      panel.style.left = '';
      return;
    }
    const hostRect = this.getBoundingClientRect();
    const pw = panel.offsetWidth;
    const ph = panel.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let left = hostRect.left + (hostRect.width - pw) / 2;
    let top = hostRect.top + (hostRect.height - ph) / 2;

    if (left < 8) left = 8;
    if (top < 8) top = 8;
    if (left + pw > vw - 8) left = vw - pw - 8;
    if (top + ph > vh - 8) top = vh - ph - 8;

    panel.style.transform = 'none';
    panel.style.position = 'fixed';
    panel.style.top = top + 'px';
    panel.style.left = left + 'px';
  }

  _onDocClick(e) {
    if (this._panel && !this.contains(e.target)) {
      this._panel.classList.remove('open');
      if (this._backdrop) this._backdrop.classList.remove('open');
    }
  }
}

customElements.define('closure-btn', ClosureBtn);


class ClosureBtnItem extends HTMLElement {
  static _style = [
    ':host {',
    '  display: block;',
    '  cursor: pointer;',
    '}',
    'a {',
    '  display: flex;',
    '  align-items: center;',
    '  gap: var(--btn-item-gap, 10px);',
    '  padding: var(--btn-item-padding, 10px 16px);',
    '  text-decoration: none;',
    '  font-family: var(--font, sans-serif);',
    '  font-size: var(--btn-item-font-size, 14px);',
    '  font-weight: 500;',
    '  color: var(--text, #111827);',
    '  transition: background 0.1s;',
    '  white-space: nowrap;',
    '}',
    'a:hover {',
    '  background: var(--primary-light, #e0e7ff);',
    '}',
    ':host([focused]) a {',
    '  background: var(--primary-light, #e0e7ff);',
    '  outline: 2px solid var(--primary, #4f46e5);',
    '  outline-offset: -2px;',
    '}',
    ':host([disabled]) { cursor: not-allowed; }',
    ':host([disabled]) a {',
    '  opacity: 0.4;',
    '  cursor: not-allowed;',
    '}',
    ':host([disabled]) a:hover { background: none; }',
    '.icon {',
    '  font-size: 1.2em;',
    '  line-height: 1;',
    '}',
  ].join('\n');

  connectedCallback() {
    if (this._initialized) return;
    this._initialized = true;
    this.attachShadow({ mode: 'open' });
    this._render();
    this.tabIndex = this.hasAttribute('disabled') ? -1 : 0;
  }

  static get observedAttributes() { return ['icon', 'disabled']; }

  attributeChangedCallback() {
    if (this.shadowRoot) {
      this._render();
      this.tabIndex = this.hasAttribute('disabled') ? -1 : 0;
    }
  }

  _render() {
    const style = document.createElement('style');
    style.textContent = ClosureBtnItem._style;

    const a = document.createElement('a');
    a.href = '#';

    const icon = this.getAttribute('icon');
    if (icon) {
      const iconSpan = document.createElement('span');
      iconSpan.className = 'icon';
      iconSpan.setAttribute('aria-hidden', 'true');
      iconSpan.textContent = icon;
      a.appendChild(iconSpan);
    }

    const slot = document.createElement('slot');
    a.appendChild(slot);

    const url = this.getAttribute('url') || '';
    if (url) {
      const self = this;
      a.addEventListener('click', (e) => {
        e.preventDefault();
        if (self.hasAttribute('disabled')) return;
        const form = document.createElement('form');
        form.method = 'POST';
        form.action = url;
        form.style.display = 'none';
        // Reuse the same merging logic as the btn-action path.
        const data = self.getBtnData();
        for (const section in data.sections) {
          const fields = data.sections[section];
          for (const name in fields) {
            const hidden = document.createElement('input');
            hidden.type = 'hidden';
            hidden.name = section ? section + '_' + name : name;
            hidden.value = fields[name];
            form.appendChild(hidden);
          }
        }
        document.body.appendChild(form);
        form.submit();
        form.remove(); // drop the node post-submit so it can't orphan in
                       // <body> on a download / new-tab action
      });
    } else {
      a.addEventListener('click', (e) => {
        e.preventDefault();
        this._dispatch();
      });
    }

    this.shadowRoot.innerHTML = '';
    this.shadowRoot.appendChild(style);
    this.shadowRoot.appendChild(a);
  }

  _dispatch() {
    if (this.hasAttribute('disabled')) return;
    var parent = this.closest('closure-btn');
    var eventName = this.getAttribute('event') || (parent && parent.getAttribute('event')) || 'btn-action';
    var targetId = this.getAttribute('target-id') || (parent && parent.getAttribute('target-id')) || '';
    var dest = targetId ? document.getElementById(targetId) : (parent || this);
    if (dest) {
      // detail.source carries the item so consumers (target-closure) use
      // the item's merged payload, not the parent button's
      dest.dispatchEvent(new CustomEvent(eventName, { bubbles: true, detail: { source: this } }));
    }
  }

  getBtnData() {
    var parent = this.closest('closure-btn');
    var section = this.getAttribute('section') || (parent && parent.getAttribute('section')) || '';
    var fields = {};
    if (parent) {
      for (const attr of parent.attributes) {
        if (attr.name.startsWith('data-')) fields[attr.name.slice(5)] = attr.value;
      }
    }
    for (const attr of this.attributes) {
      if (attr.name.startsWith('data-')) fields[attr.name.slice(5)] = attr.value;
    }
    var sections = {};
    sections[section] = fields;
    return {
      ctRole: this.getAttribute('ct-role') || (parent && parent.getAttribute('ct-role')) || '',
      closureTemplate: (parent && parent.getAttribute('closure-template')) || '',
      sections: sections
    };
  }
}

customElements.define('closure-btn-item', ClosureBtnItem);


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


class ClosureStatusBar extends HTMLElement {
  static _styleId = 'closure-status-bar-label-style';
  static _labelStyle = [
    'closure-status-bar > label {',
    '  flex: 1;',
    '  font-weight: 600;',
    '  font-size: 15px;',
    '  letter-spacing: 0.01em;',
    '  color: var(--text, #111827);',
    '  overflow: hidden;',
    '  text-overflow: ellipsis;',
    '  white-space: nowrap;',
    '  padding: 0 16px;',
    '  border-right: 2px solid var(--border, #d1d5db);',
    '  align-self: stretch;',
    '  display: flex;',
    '  align-items: center;',
    '}',
    'closure-status-bar > label[center] { justify-content: center; text-align: center; }',
    'closure-status-bar > label[right]  { justify-content: flex-end; text-align: right; }',
    'closure-status-bar > status-msg {',
    '  flex: 1;',
    '  font-size: 14px;',
    '  color: var(--text, #111827);',
    '  padding: 8px 16px;',
    '  border-right: 2px solid var(--border, #d1d5db);',
    '  align-self: stretch;',
    '  display: flex;',
    '  align-items: center;',
    '}',
    'closure-status-bar > status-msg ul, closure-status-bar > status-msg ol { padding-left: 1.4em; margin: 2px 0; }',
    'closure-status-bar > status-msg li { margin: 2px 0; }',
    'closure-status-bar > status-msg p  { margin: 2px 0; }',
  ].join('\n');

  static _style = [
    ':host {',
    '  display: flex;',
    '  align-items: stretch;',
    '  margin-bottom: 12px;',
    '  background: #f3f4f6;',
    '  border: 1px solid #d1d5db;',
    '  border-radius: 6px;',
    '  overflow: hidden;',
    '  min-height: 40px;',
    '  --form-btn-bg: #e5e7eb;',
    '  --form-btn-color: var(--text, #111827);',
    '  --form-btn-radius: 0;',
    '  --form-btn-padding: 0 16px;',
    '  --form-btn-shadow: none;',
    '  --form-btn-shadow-hover: none;',
    '  --form-btn-min-height: 0;',
    '  --form-btn-font-size: 14px;',
    '  --form-btn-direction: row;',
    '  --form-btn-icon-size: 1.2em;',
    '  --form-btn-host-display: flex;',
    '  --form-btn-height: 100%;',
    '  --form-btn-width: auto;',
    '}',
    ':host([type="primary"]) { background: #e0e7ff; border-color: #4f46e5; --form-btn-bg: #c7d2fe; }',
    ':host([type="info"])    { background: #e0f2fe; border-color: #0284c7; --form-btn-bg: #bae6fd; }',
    ':host([type="success"]) { background: #dcfce7; border-color: #16a34a; --form-btn-bg: #bbf7d0; }',
    ':host([type="warning"]) { background: #fef9c3; border-color: #ca8a04; --form-btn-bg: #fde68a; }',
    ':host([type="danger"])  { background: #fee2e2; border-color: #dc2626; --form-btn-bg: #fecaca; }',
    ':host([type="gray"])    { background: #f3f4f6; border-color: #6b7280; --form-btn-bg: #e5e7eb; }',
    ':host([type="white"])   { background: #ffffff; border-color: #e5e7eb; --form-btn-bg: #f3f4f6; }',
    ':host([type="default"]) { background: #f3f4f6; border-color: #d1d5db; --form-btn-bg: #e5e7eb; }',
  ].join('\n');

  connectedCallback() {
    if (!document.getElementById(ClosureStatusBar._styleId)) {
      var s = document.createElement('style');
      s.id = ClosureStatusBar._styleId;
      s.textContent = ClosureStatusBar._labelStyle;
      document.head.appendChild(s);
    }
    // attachShadow throws on a second connect (DOM re-parenting)
    if (!this.shadowRoot) this.attachShadow({ mode: 'open' });
    this._render();
  }

  static get observedAttributes() { return ['type']; }

  attributeChangedCallback() {
    if (this.shadowRoot) this._render();
  }

  // ---
  _render() {
    const style = document.createElement('style');
    style.textContent = ClosureStatusBar._style;
    const slot = document.createElement('slot');
    this.shadowRoot.innerHTML = '';
    this.shadowRoot.appendChild(style);
    this.shadowRoot.appendChild(slot);
  }
}

customElements.define('closure-status-bar', ClosureStatusBar);


class StatusMsg extends HTMLElement {
  connectedCallback() {
    // attachShadow throws on a second connect (DOM re-parenting)
    if (this.shadowRoot) return;
    this.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = [
      ':host {',
      '  display: contents;',
      '}',
      '::slotted(ul), ::slotted(ol) { padding-left: 1.2em; margin: 4px 0; }',
      '::slotted(p) { margin: 2px 0; }',
    ].join('\n');
    const slot = document.createElement('slot');
    this.shadowRoot.appendChild(style);
    this.shadowRoot.appendChild(slot);
  }
}

customElements.define('status-msg', StatusMsg);


class StatusPart extends HTMLElement {
  static _styleId = 'status-part-style';
  static _style = [
    'status-part {',
    '  flex: 1;',
    '  display: flex;',
    '  align-items: center;',
    '  padding: 0 12px;',
    '  overflow: hidden;',
    '  align-self: stretch;',
    '}',
    'status-part[border] { border-right: 2px solid var(--border, #d1d5db); }',
    'status-part[center] { justify-content: center; }',
    'status-part[right] { justify-content: flex-end; }',
    // layout="stack"
    'status-part[layout="stack"] { flex-direction: column; justify-content: center; gap: 2px; }',
    // layout="grid"
    'status-part[layout="grid"] { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; align-content: center; }',
    // layout="flow"
    'status-part[layout="flow"] { flex-wrap: wrap; gap: 4px; align-content: center; }',
    'status-part[layout="flow"] > * { flex: 0 1 auto; }',
    // layout="text"
    'status-part[layout="text"] { display: block; padding: 6px 12px; align-self: stretch; overflow: auto; }',
  ].join('\n');

  connectedCallback() {
    if (this._initialized) {
      // Reconnect: resume observing instead of stacking a new observer
      if (this._flowObserver) this._flowObserver.observe(this);
      return;
    }
    this._initialized = true;
    if (!document.getElementById(StatusPart._styleId)) {
      var s = document.createElement('style');
      s.id = StatusPart._styleId;
      s.textContent = StatusPart._style;
      document.head.appendChild(s);
    }

    var flex = this.getAttribute('flex');
    if (flex) this.style.flex = flex;

    var padding = this.getAttribute('padding');
    if (padding) this.style.padding = padding;

    applyWidthRange(this);

    // Flow layout: handle orphan stretching
    if (this.getAttribute('layout') === 'flow') {
      this._setupFlowObserver();
    }
  }

  disconnectedCallback() {
    if (this._flowObserver) this._flowObserver.disconnect();
  }

  // ---
  _setupFlowObserver() {
    var self = this;
    var reflow = function() { self._reflowOrphans(); };
    // Observe resize
    if (window.ResizeObserver) {
      this._flowObserver = new ResizeObserver(reflow);
      this._flowObserver.observe(this);
    }
    // Initial reflow after render
    requestAnimationFrame(reflow);
  }

  // ---
  _reflowOrphans() {
    var children = Array.from(this.children);
    if (!children.length) return;

    // Reset all widths
    children.forEach(function(c) { c.style.flex = ''; });

    // Find orphans (items on the last row that don't fill it)
    var containerWidth = this.clientWidth;
    if (containerWidth <= 0) return;

    var rows = [];
    var currentRow = [];
    var rowTop = null;

    children.forEach(function(c) {
      var rect = c.getBoundingClientRect();
      if (rowTop === null || Math.abs(rect.top - rowTop) > 2) {
        if (currentRow.length) rows.push(currentRow);
        currentRow = [c];
        rowTop = rect.top;
      } else {
        currentRow.push(c);
      }
    });
    if (currentRow.length) rows.push(currentRow);

    // If last row has fewer items than the row above, stretch those with stretch-priority
    if (rows.length < 2) return;
    var lastRow = rows[rows.length - 1];
    var prevRow = rows[rows.length - 2];
    if (lastRow.length >= prevRow.length) return;

    // Find stretchable orphans (those with stretch-priority)
    var stretchable = lastRow.filter(function(c) { return c.hasAttribute('stretch-priority'); });
    if (!stretchable.length) return;

    // Sort by priority (lower = stretch first)
    stretchable.sort(function(a, b) {
      return (parseInt(a.getAttribute('stretch-priority'), 10) || 999)
           - (parseInt(b.getAttribute('stretch-priority'), 10) || 999);
    });

    // Stretch: distribute remaining space
    stretchable.forEach(function(c) { c.style.flex = '1'; });
  }
}

customElements.define('status-part', StatusPart);


class StatusButtons extends HTMLElement {
  static _styleId = 'status-buttons-style';
  static _style = [
    'status-buttons {',
    '  display: flex;',
    '  flex-wrap: wrap;',
    '  flex: 0 1 auto;',
    '  align-self: stretch;',
    '  gap: var(--gap, 2px);',
    '  box-sizing: border-box;', /* Solo afecta a cómo se mide el ancho, no dibuja nada */
    '}',
  ].join('\n');

  connectedCallback() {
    if (this._initialized) {
      // Reconnect: resume observing instead of stacking a new observer
      if (this._resizeObserver) this._resizeObserver.observe(this);
      return;
    }
    this._initialized = true;
    if (!document.getElementById(StatusButtons._styleId)) {
      var s = document.createElement('style');
      s.id = StatusButtons._styleId;
      s.textContent = StatusButtons._style;
      document.head.appendChild(s);
    }
    var flex = this.getAttribute('flex');
    if (flex) this.style.flex = flex;

    var gap = this.getAttribute('gap');
    if (gap) this.style.setProperty('--gap', isNaN(gap) ? gap : gap + 'px');


    applyWidthRange(this);

    var self = this;
    this._reflowing = false;
    this._lastW = 0;
    requestAnimationFrame(function() { self._reflow(); });
    if (window.ResizeObserver) {
      this._resizeObserver = new ResizeObserver(function() {
        var w = self.clientWidth;
        if (w === self._lastW || self._reflowing) return;
        self._reflow();
      });
      this._resizeObserver.observe(this);
    }
  }

  disconnectedCallback() {
    if (this._resizeObserver) this._resizeObserver.disconnect();
  }

  // ---
  _reflow() {
    this._reflowing = true;
    var children = Array.from(this.children);
    if (!children.length) { this._reflowing = false; return; }
    var n = children.length;
    var borderColor = '1px solid var(--border, #d1d5db)';

    // Reset all styles
    children.forEach(function(c) {
      c.style.width = '';
      c.style.height = '';
      c.style.flex = '';
      c.style.borderLeft = '';
      c.style.borderBottom = '';
      c.style.boxSizing = 'border-box';
    });

    // Measure total natural width of all buttons
    var totalW = 0;
    var maxBtnW = 0;
    children.forEach(function(c) {
      var w = c.offsetWidth;
      totalW += w;
      if (w > maxBtnW) maxBtnW = w;
    });
    if (maxBtnW <= 0) maxBtnW = 40;

    var containerW = this.clientWidth;
    this._lastW = containerW;
    if (containerW <= 0) { this._reflowing = false; return; }

    // MODE 1: All fit in one row — natural sizes, just borders
    if (totalW <= containerW) {
      children.forEach(function(c, i) {
        c.style.borderLeft = (i === 0) ? 'none' : borderColor;
      });
      this._reflowing = false;
      return;
    }

    // MODE 2: Need grid
    // Calculate best columns: fit in available width, minimize huecos
    var maxCols = Math.max(1, Math.floor(containerW / maxBtnW));
    if (maxCols > n) maxCols = n;

    // Find cols with least huecos; on tie prefer more cols
    var cols = 1;
    var bestHuecos = n; // worst case: 1 col, 0 huecos but check anyway
    for (var tryC = 1; tryC <= maxCols; tryC++) {
      var tryRows = Math.ceil(n / tryC);
      var tryH = (tryC * tryRows) - n;
      if (tryH < bestHuecos || (tryH === bestHuecos && tryC > cols)) {
        bestHuecos = tryH;
        cols = tryC;
      }
    }
    var rows = Math.ceil(n / cols);
    var huecos = (cols * rows) - n;

    // Find stretch candidate by priority
    var stretchIdx = -1;
    if (huecos > 0) {
      stretchIdx = n - 1; // default: last button
      var bestPriority = Infinity;
      for (var i = 0; i < n; i++) {
        if (!children[i].hasAttribute('stretch-priority')) continue;
        var p = parseInt(children[i].getAttribute('stretch-priority'), 10);
        if (isNaN(p)) p = 999; // `|| 999` would turn priority 0 into 999
        if (p >= bestPriority) continue;
        // Check: can this button stretch without creating extra rows?
        // It stretches by taking `huecos` extra cells in its row.
        // Items after it shift down. New total rows must not increase.
        var rowOfBtn = Math.floor(i / cols);
        var posInRow = i % cols;
        var itemsAfter = n - i - 1;
        var colsUsedByBtnRow = posInRow + 1 + huecos; // btn takes extra
        if (colsUsedByBtnRow > cols) continue; // can't fit stretch in this row
        var remainingCells = (cols * rows) - (i + 1 + huecos); // cells left after stretched btn
        if (itemsAfter > remainingCells) continue; // would need extra row
        bestPriority = p;
        stretchIdx = i;
      }
    }

    // Build layout with stretch
    var layout = [];
    var colSpans = {}; // index -> colspan
    if (stretchIdx >= 0 && huecos > 0) {
      colSpans[stretchIdx] = 1 + huecos;
    }

    var col = 0;
    var currentRow = [];
    for (var i = 0; i < n; i++) {
      var span = colSpans[i] || 1;
      if (col + span > cols && currentRow.length > 0) {
        layout.push(currentRow);
        currentRow = [];
        col = 0;
      }
      currentRow.push({ el: children[i], span: span });
      col += span;
      if (col >= cols) {
        layout.push(currentRow);
        currentRow = [];
        col = 0;
      }
    }
    if (currentRow.length) layout.push(currentRow);

    // Apply grid widths and borders
    var colW = 100 / cols;
    for (var r = 0; r < layout.length; r++) {
      var row = layout[r];
      var isLastRow = (r === layout.length - 1);
      var colPos = 0;

      for (var c = 0; c < row.length; c++) {
        var item = row[c];
        var btn = item.el;
        var isFirstCol = (colPos === 0);

        btn.style.width = (colW * item.span) + '%';
        btn.style.borderLeft = isFirstCol ? 'none' : borderColor;
        btn.style.borderBottom = isLastRow ? 'none' : borderColor;
        btn.style.setProperty('--form-btn-width', '100%');
        btn.style.setProperty('--form-btn-height', '100%');

        colPos += item.span;
      }
    }
    this._reflowing = false;
  }

}

customElements.define('status-buttons', StatusButtons);


class StatusKv extends HTMLElement {
  static _styleId = 'status-kv-style';
  static _style = [
    'status-kv {',
    '  display: flex;',
    '  align-items: center;',
    '  gap: 6px;',
    '  padding: 0 12px;',
    '  flex: 1;',
    '  overflow: hidden;',
    '  border-right: 2px solid var(--border, #d1d5db);',
    '  align-self: stretch;',
    '}',
    'status-kv .kv-key {',
    '  font-size: 11px;',
    '  font-weight: 700;',
    '  color: var(--text-muted, #6b7280);',
    '  text-transform: uppercase;',
    '  letter-spacing: 0.05em;',
    '  white-space: nowrap;',
    '  flex-shrink: 0;',
    '}',
    'status-kv .kv-val {',
    '  font-size: 14px;',
    '  color: var(--text, #111827);',
    '  overflow: hidden;',
    '  text-overflow: ellipsis;',
    '  white-space: nowrap;',
    '}',
  ].join('\n');

  connectedCallback() {
    // Already built — a second connect would re-wrap the generated
    // markup and duplicate the key
    if (this._valEl) return;
    if (!document.getElementById(StatusKv._styleId)) {
      var s = document.createElement('style');
      s.id = StatusKv._styleId;
      s.textContent = StatusKv._style;
      document.head.appendChild(s);
    }
    var key = this.getAttribute('key') || '';
    var val = this.innerHTML;
    this.innerHTML = '';
    if (key) {
      var keyEl = document.createElement('span');
      keyEl.className = 'kv-key';
      keyEl.textContent = key;
      this.appendChild(keyEl);
    }
    var valEl = document.createElement('span');
    valEl.className = 'kv-val';
    this._prefix = this.getAttribute('prefix') || '';
    this._suffix = this.getAttribute('suffix') || '';
    if (this._prefix) {
      var prefixEl = document.createElement('span');
      prefixEl.className = 'kv-prefix';
      prefixEl.textContent = this._prefix;
      valEl.appendChild(prefixEl);
    }
    var valueEl = document.createElement('span');
    valueEl.className = 'kv-value';
    valueEl.innerHTML = val;
    this._valueEl = valueEl;
    valEl.appendChild(valueEl);
    if (this._suffix) {
      var suffixEl = document.createElement('span');
      suffixEl.className = 'kv-suffix';
      suffixEl.textContent = this._suffix;
      valEl.appendChild(suffixEl);
    }
    this._valEl = valEl;
    this.appendChild(valEl);

    applyWidthRange(this);
  }

  get value() { return this._valueEl ? this._valueEl.textContent : ''; }
  set value(v) { if (this._valueEl) this._valueEl.textContent = v; }
}

customElements.define('status-kv', StatusKv);


class ClosureFilterBar extends HTMLElement {
  static _styleId = 'closure-filter-bar-default-style';
  static _style = [
    'closure-filter-bar { display: contents; }',
    '.dg-closure-filter-bar { display: flex; align-items: center; gap: 6px; padding: 6px 12px; background: #fff; border-bottom: 1px solid var(--border, #e5e7eb); flex-wrap: wrap; font-size: 12px; }',
    'status-msg .dg-closure-filter-bar { padding: 0; background: none; border: none; margin: 0; }',
    '.dg-chip { display: inline-flex; align-items: center; gap: 4px; padding: 3px 8px; background: var(--primary-light, #e0e7ff); color: var(--primary, #4f46e5); border-radius: 99px; font-size: 12px; font-weight: 500; }',
    '.dg-chip button { background: none; border: none; cursor: pointer; color: var(--primary, #4f46e5); font-size: 13px; line-height: 1; padding: 0 0 0 2px; font-family: var(--font, sans-serif); }',
    '.dg-chip button:hover { color: var(--red, #dc2626); }',
  ].join('\n');

  connectedCallback() {
    if (this._initialized) {
      // Reconnect: restore the body-level lightbox removed on disconnect
      if (this._lb && !this._lb.isConnected) document.body.appendChild(this._lb);
      return;
    }
    this._initialized = true;
    if (!document.getElementById(ClosureFilterBar._styleId)) {
      const s = document.createElement('style');
      s.id = ClosureFilterBar._styleId;
      s.textContent = ClosureFilterBar._style;
      document.head.appendChild(s);
    }
    this._values = {};
    const init = () => {
      this._fields = Array.from(this.querySelectorAll('filter-field')).map(f => {
        const mapId = f.getAttribute('map-data-id') || '';
        let options;
        if (mapId) {
          const map = document.getElementById(mapId);
          if (map) {
            options = Array.from(map.querySelectorAll('map-item:not([default])')).map(mi => ({
              value: mi.getAttribute('value') || '',
              label: mi.getAttribute('label') || mi.getAttribute('value') || '',
            }));
          }
        }
        if (!options) {
          options = (f.getAttribute('options') || '').split(',').map(s => s.trim()).filter(Boolean).map(s => ({ value: s, label: s }));
        }
        return {
          name:    f.getAttribute('name'),
          label:   f.getAttribute('label'),
          type:    f.getAttribute('type') || 'select',
          options: options,
          noAll:   f.hasAttribute('no-all'),
        };
      });
      this._presets = Array.from(this.querySelectorAll('filter-preset')).map(p => {
        const preset = { label: p.getAttribute('label') || '', clear: p.hasAttribute('clear'), values: {} };
        for (const attr of p.attributes) {
          if (attr.name.startsWith('data-')) preset.values[attr.name.slice(5)] = attr.value;
        }
        return preset;
      });
      this._setValueBtns = Array.from(this.querySelectorAll('filter-set-value-btn')).map(b => ({
        target: b.getAttribute('target') || '',
        label:  b.getAttribute('label') || b.getAttribute('value') || '',
        value:  b.getAttribute('value') || '',
      }));
      this._build();
      // Values set programmatically before the deferred init ran
      if (this._pendingValues) {
        const pv = this._pendingValues;
        this._pendingValues = null;
        this.setValues(pv);
      }
    };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
      init();
    }
  }

  _build() {
    const icon  = this.hasAttribute('icon') ? this.getAttribute('icon') : '🔍';
    const label = this.hasAttribute('label') ? this.getAttribute('label') : 'Filter';
    const title = (icon ? icon + ' ' : '') + label;

    // Bar
    this._bar = document.createElement('div');
    this._bar.className = 'dg-closure-filter-bar';
    this._btn = document.createElement('button');
    this._btn.type = 'button';
    this._btn.className = 'dg-btn';
    this._btn.style.cssText = 'font-size:12px;padding:3px 10px;flex-shrink:0;';
    this._btn.textContent = title;
    var self = this;
    this._btn.addEventListener('click', () => {
      if (self._lb._body) {
        self._lb._body.innerHTML = '';
        self._lb._body.appendChild(self._filterForm);
      }
      self._lb.open({
        title: self.getAttribute('dialog-title') || title,
        buttons: [
          { label: self.getAttribute('cancel-label') || 'Cancel', action: 'cancel' },
          { label: self.getAttribute('apply-label') || 'Apply', action: 'apply', primary: true }
        ]
      });
    });
    this._chips = document.createElement('div');
    this._chips.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;align-items:center;';
    this._bar.appendChild(this._btn);
    this._bar.appendChild(this._chips);
    this.replaceChildren(this._bar);

    // Lightbox
    this._lb = document.createElement('closure-lightbox');
    this._lb.setAttribute('title', this.getAttribute('dialog-title') || title);
    this._lb.addEventListener('lb-close', e => {
      if (e.detail.action === 'apply') self._apply();
    });
    const form = document.createElement('form');

    const body = document.createElement('div');
    body.style.cssText = 'padding:16px;display:flex;flex-direction:column;gap:12px;font-family:var(--font,sans-serif);font-size:13px;';
    this._inputs = {};
    this._fields.forEach(f => {
      const fieldWrap = document.createElement('div');
      const lbl = document.createElement('label');
      lbl.textContent = f.label;
      lbl.style.cssText = 'display:block;font-weight:600;color:var(--text,#111827);';
      let input;
      if (f.type === 'select') {
        input = document.createElement('select');
        input.style.cssText = 'width:100%;margin-top:4px;padding:6px 8px;border:1px solid var(--border,#e5e7eb);border-radius:4px;font-size:13px;font-family:var(--font,sans-serif);';
        if (!f.noAll) {
          const all = document.createElement('option');
          all.value = ''; all.textContent = 'All';
          input.appendChild(all);
        }
        f.options.forEach(o => {
          const opt = document.createElement('option');
          opt.value = o.value;
          opt.textContent = o.label;
          input.appendChild(opt);
        });
        this._inputs[f.name] = input;
        lbl.appendChild(input);
      } else if (f.type === 'checkbox') {
        const wrap = document.createElement('div');
        wrap.style.cssText = 'margin-top:4px;display:flex;flex-direction:column;gap:4px;';
        const checkboxes = [];
        f.options.forEach(o => {
          const row = document.createElement('label');
          row.style.cssText = 'display:flex;align-items:center;gap:6px;font-weight:400;cursor:pointer;font-size:13px;';
          const cb = document.createElement('input');
          cb.type = 'checkbox';
          cb.value = o.value;
          row.appendChild(cb);
          row.appendChild(document.createTextNode(o.label));
          wrap.appendChild(row);
          checkboxes.push(cb);
        });
        // Virtual input: value getter/setter as comma-separated
        input = {
          _cbs: checkboxes,
          get value() { return this._cbs.filter(c => c.checked).map(c => c.value).join(','); },
          set value(v) {
            const vals = v ? v.split(',') : [];
            this._cbs.forEach(c => c.checked = vals.includes(c.value));
          },
        };
        this._inputs[f.name] = input;
        lbl.appendChild(wrap);
      } else {
        input = document.createElement('input');
        input.type = 'text';
        input.placeholder = 'Search…';
        input.style.cssText = 'width:100%;margin-top:4px;padding:6px 8px;border:1px solid var(--border,#e5e7eb);border-radius:4px;font-size:13px;font-family:var(--font,sans-serif);';
        this._inputs[f.name] = input;
        lbl.appendChild(input);
      }
      const setValueBtns = this._setValueBtns.filter(b => b.target === f.name);
      if (setValueBtns.length > 0) {
        const quickRow = document.createElement('div');
        quickRow.style.cssText = 'margin-top:6px;display:flex;gap:6px;flex-wrap:wrap;';
        setValueBtns.forEach(spec => {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'dg-btn';
          btn.style.cssText = 'font-size:11px;padding:3px 8px;';
          btn.textContent = spec.label;
          btn.addEventListener('click', () => {
            if (this._inputs[f.name]) this._inputs[f.name].value = spec.value;
          });
          quickRow.appendChild(btn);
        });
        fieldWrap.appendChild(quickRow);
      }
      fieldWrap.insertBefore(lbl, fieldWrap.firstChild);
      body.appendChild(fieldWrap);
    });
    form.appendChild(body);

    // Presets
    if (this._presets.length > 0) {
      const presetBar = document.createElement('div');
      presetBar.style.cssText = 'padding:8px 16px;border-top:1px solid var(--border,#e5e7eb);display:flex;gap:6px;flex-wrap:wrap;';
      this._presets.forEach(preset => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'dg-btn';
        btn.style.cssText = 'font-size:11px;padding:3px 8px;';
        btn.textContent = preset.label;
        btn.addEventListener('click', () => {
          if (preset.clear) {
            this._fields.forEach(f => { if (this._inputs[f.name]) this._inputs[f.name].value = ''; });
          } else {
            this._fields.forEach(f => {
              if (this._inputs[f.name]) {
                this._inputs[f.name].value = preset.values[f.name] || '';
              }
            });
          }
          this._apply();
          self._lb.close('preset');
        });
        presetBar.appendChild(btn);
      });
      form.appendChild(presetBar);
    }


    this._filterForm = form;
    document.body.appendChild(this._lb);
    this._renderChips();
  }

  disconnectedCallback() {
    // The lightbox lives in <body>; drop it with the bar so it doesn't
    // accumulate across mount/unmount cycles
    if (this._lb) this._lb.remove();
  }

  _apply() {
    if (!this._fields) return; // deferred init hasn't run yet
    this._fields.forEach(f => {
      this._values[f.name] = this._inputs[f.name].value.trim();
    });
    this._renderChips();
    this._dispatch();
  }

  _renderChips() {
    this._chips.innerHTML = '';
    let count = 0;
    this._fields.forEach(f => {
      const v = this._values[f.name] || '';
      if (!v) return;
      count++;
      const chip = document.createElement('span');
      chip.className = 'dg-chip';
      const strong = document.createElement('strong');
      // Checkbox fields store CSV — map each part to its option label
      const labels = v.split(',').map(part => {
        const opt = f.options.find(o => o.value === part);
        return opt ? opt.label : part;
      });
      strong.textContent = labels.join(', ');
      const x = document.createElement('button');
      x.type = 'button'; x.title = 'Remove'; x.textContent = '×';
      x.addEventListener('click', () => {
        this._values[f.name] = '';
        if (this._inputs[f.name]) this._inputs[f.name].value = '';
        this._renderChips();
        this._dispatch();
      });
      chip.append(f.label + ': ', strong, x);
      this._chips.appendChild(chip);
    });
    if (count === 0) {
      const none = document.createElement('span');
      none.style.cssText = 'color:var(--text-muted,#6b7280);font-style:italic';
      none.textContent = 'no filter';
      this._chips.appendChild(none);
    }
  }

  // Normalised view of the filter values: multi-value (checkbox) fields become
  // arrays (not a CSV string) so consumers never guess "comma means multi-
  // select" — which would mangle text values that contain commas. Used by both
  // the `filter-change` event and the public `values` getter so they agree.
  _normalizedValues() {
    const out = { ...this._values };
    (this._fields || []).forEach(f => {
      if (f.type === 'checkbox' && typeof out[f.name] === 'string' && out[f.name] !== '') {
        out[f.name] = out[f.name].split(',');
      }
    });
    return out;
  }

  _dispatch() {
    const targetId = this.getAttribute('target');
    const dest = targetId ? document.getElementById(targetId) : this;
    if (!dest) return;
    dest.dispatchEvent(new CustomEvent('filter-change', { detail: this._normalizedValues(), bubbles: false }));
  }

  get values() { return this._normalizedValues(); }

  setValues(obj) {
    if (!this._fields) { this._pendingValues = obj; return; } // applied after init
    this._fields.forEach(f => {
      var val = obj[f.name] !== undefined ? String(obj[f.name]) : '';
      this._values[f.name] = val;
      if (this._inputs[f.name]) this._inputs[f.name].value = val;
    });
    this._renderChips();
    this._dispatch();
  }
}

customElements.define('closure-filter-bar', ClosureFilterBar);


['grid-col', 'grid-footer-buttons', 'g-row', 'g-col', 'g-detail', 'grid-key', 'query-definition', 'query-param',
 'on-no-results', 'on-fetch-error', 'grid-layout', 'filter-preset',
 'filter-set-value-btn'].forEach(tag => {
  if (!customElements.get(tag)) {
    customElements.define(tag, class extends HTMLElement {
      connectedCallback() { this.style.display = 'none'; }
    });
  }
});


class ClosureDataGrid extends HTMLElement {
  static _styleId = 'closure-data-grid-default-style';
  static _style = [
    'closure-data-grid { display: block; outline: none; }',
    'closure-data-grid .dg-wrap { border: 1px solid var(--dg-border, var(--border, #e5e7eb)); border-radius: var(--radius, 8px); overflow: hidden; background: var(--dg-bg, #fff); display: flex; flex-direction: column; transition: border-color 0.15s; }',
    'closure-data-grid:focus .dg-wrap { border-color: var(--primary, #4f46e5); }',
    'closure-data-grid .dg-thead-wrap { overflow: hidden; flex-shrink: 0; border-bottom: 1px solid var(--dg-border, var(--border, #e5e7eb)); }',
    'closure-data-grid .dg-table-wrap { flex: 1; overflow-x: auto; overflow-y: auto; scrollbar-width: none; }',
    'closure-data-grid .dg-table-wrap::-webkit-scrollbar { display: none; }',
    'closure-data-grid .dg-table { width: 100%; border-collapse: collapse; font-size: var(--dg-font-size, 13px); font-family: var(--dg-font, var(--font, sans-serif)); table-layout: fixed; }',
    'closure-data-grid .dg-head-table { table-layout: auto; }',
    'closure-data-grid .dg-table th { text-align: left; padding: var(--dg-padding, 6px 12px); font-size: 12px; font-weight: 600; color: var(--dg-color-header, var(--text, #111827)); background: var(--dg-bg-header, #f0f0f0); white-space: nowrap; user-select: none; cursor: pointer; border-right: 1px solid var(--dg-border, var(--border, #e5e7eb)); }',
    'closure-data-grid .dg-table th:last-child { border-right: none; }',
    'closure-data-grid .dg-table th:hover { color: var(--primary, #4f46e5); }',
    'closure-data-grid .dg-table td { padding: var(--dg-padding, 6px 12px); border-bottom: 1px solid var(--dg-border, var(--border, #e5e7eb)); border-right: 1px solid var(--dg-border, var(--border, #e5e7eb)); color: var(--dg-color, var(--text, #111827)); vertical-align: middle; }',
    'closure-data-grid .dg-table td:last-child { border-right: none; }',
    'closure-data-grid .dg-table tr:last-child td { border-bottom: none; }',
    'closure-data-grid .dg-table tr { cursor: pointer; }',
    'closure-data-grid .dg-table tr:focus { outline: none; }',
    'closure-data-grid .dg-table tr.focused td { background: var(--dg-bg-selected, #dde4fb); }',
    'closure-data-grid .dg-table tr.focused td:first-child { border-left: var(--dg-bar-width, 3px) solid var(--dg-bar-color, var(--primary, #4f46e5)); padding-left: 9px; }',
    'closure-data-grid .dg-table tr:not(.focused) td:first-child { border-left: var(--dg-bar-width, 3px) solid transparent; padding-left: 9px; }',
    'closure-data-grid .dg-table thead th:first-child { padding-left: 9px; border-left: none; }',
    'closure-data-grid .dg-col-collapse { max-width: 80px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }',
    'closure-data-grid .dg-pagination { display: flex; align-items: center; gap: 6px; padding: 8px 12px; border-top: 1px solid var(--dg-border, var(--border, #e5e7eb)); background: var(--dg-bg-header, #f0f0f0); font-size: 12px; font-family: var(--dg-font, var(--font, sans-serif)); color: var(--text-muted, #6b7280); }',
    'closure-data-grid .dg-pagination-group { display: inline-flex; align-items: center; gap: 6px; }',
    'closure-data-grid .dg-pagination-sep { flex: 1; }',
    'closure-data-grid .dg-page-btn { padding: 4px 10px; border: 1px solid var(--dg-border, var(--border, #e5e7eb)); border-radius: 4px; background: var(--dg-bg, #fff); cursor: pointer; font-size: 12px; font-family: var(--dg-font, var(--font, sans-serif)); color: var(--dg-color, var(--text, #111827)); }',
    'closure-data-grid .dg-page-btn:hover { background: var(--dg-bg-selected, #dde4fb); }',
    'closure-data-grid .dg-page-btn:disabled { opacity: 0.4; cursor: not-allowed; }',
    'closure-data-grid .dg-page-info { padding: 4px 10px; background: var(--primary, #4f46e5); color: #fff; border-radius: 4px; font-weight: 600; }',
    'closure-data-grid .dg-cell-btn { display: inline-flex; align-items: center; justify-content: center; box-sizing: border-box; min-width: 24px; min-height: 22px; padding: 2px 7px; border: 1px solid var(--dg-border, var(--border, #e5e7eb)); border-radius: 4px; background: var(--dg-bg, #fff); color: var(--dg-color, var(--text, #111827)); font: inherit; font-size: 12px; line-height: 1.2; cursor: pointer; }',
    'closure-data-grid .dg-cell-btn:hover { background: var(--dg-bg-selected, #dde4fb); border-color: var(--primary, #4f46e5); }',
    'closure-data-grid .dg-cell-btn.plain { min-width: 0; min-height: 0; padding: 0; border: none; border-radius: 0; background: transparent; font-size: inherit; }',
    'closure-data-grid .dg-cell-btn.plain:hover { background: transparent; border-color: transparent; color: var(--primary, #4f46e5); }',
    'closure-data-grid .dg-tags-cell { white-space: normal; vertical-align: top; }',
    'closure-data-grid .dg-tags { display: flex; align-items: flex-start; flex-wrap: wrap; gap: 4px; width: 100%; min-width: 0; }',
    'closure-data-grid .dg-tag { display: inline-flex; align-items: center; max-width: 100%; padding: 1px 7px; border: 1px solid #d1d5db; border-radius: 999px; font-size: 11px; line-height: 1.45; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; background: #f9fafb; color: #374151; }',
    'closure-data-grid .dg-tag-color-0, closure-data-grid .dg-tag-color-blue { background: #dbeafe; color: #1e3a8a; border-color: #bfdbfe; }',
    'closure-data-grid .dg-tag-color-1, closure-data-grid .dg-tag-color-green { background: #dcfce7; color: #166534; border-color: #bbf7d0; }',
    'closure-data-grid .dg-tag-color-2, closure-data-grid .dg-tag-color-yellow { background: #fef9c3; color: #854d0e; border-color: #fde68a; }',
    'closure-data-grid .dg-tag-color-3, closure-data-grid .dg-tag-color-red { background: #fee2e2; color: #991b1b; border-color: #fecaca; }',
    'closure-data-grid .dg-tag-color-4, closure-data-grid .dg-tag-color-purple { background: #f3e8ff; color: #6b21a8; border-color: #e9d5ff; }',
    'closure-data-grid .dg-tag-color-5, closure-data-grid .dg-tag-color-cyan { background: #cffafe; color: #155e75; border-color: #a5f3fc; }',
    'closure-data-grid .dg-tag-color-6, closure-data-grid .dg-tag-color-gray, closure-data-grid .dg-tag-color-grey { background: #f3f4f6; color: #374151; border-color: #e5e7eb; }',
    'closure-data-grid .dg-tag-color-7, closure-data-grid .dg-tag-color-pink { background: #fce7f3; color: #9d174d; border-color: #fbcfe8; }',
    'closure-data-grid .dg-no-results { padding: 20px; text-align: center; color: var(--text-muted, #6b7280); }',
  ].join('\n');

  connectedCallback() {
    if (this._initialized) {
      // Reconnect: restore the global listeners/observers dropped on disconnect
      if (this._onDocClick) document.addEventListener('click', this._onDocClick);
      if (this._onDocKeydown) document.addEventListener('keydown', this._onDocKeydown);
      if (this._onWinResize) window.addEventListener('resize', this._onWinResize);
      // Observers only once the grid is built — _wrap is set in _build
      if (this._wrap) {
        this._setupAutoFitResizeObserver();
        this._setupFillObserver();
        this._setupMasterDetail();
      }
      return;
    }
    this._initialized = true;
    if (!document.getElementById(ClosureDataGrid._styleId)) {
      const s = document.createElement('style');
      s.id = ClosureDataGrid._styleId;
      s.textContent = ClosureDataGrid._style;
      document.head.appendChild(s);
    }
    this.tabIndex = 0;
    this.style.outline = 'none';
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this._init(), { once: true });
    } else {
      this._init();
    }
  }

  // ---
  disconnectedCallback() {
    if (this._onDocClick) document.removeEventListener('click', this._onDocClick);
    if (this._onDocKeydown) document.removeEventListener('keydown', this._onDocKeydown);
    if (this._onWinResize) window.removeEventListener('resize', this._onWinResize);
    if (this._masterEl && this._onMasterEvent) {
      this._masterEl.removeEventListener(this._detailEvent, this._onMasterEvent);
      this._masterEl = null;
      this._masterDetailBound = false;
    }
    if (this._masterDetailRetry) { cancelAnimationFrame(this._masterDetailRetry); this._masterDetailRetry = 0; }
    if (this._fillObserverRetry) { cancelAnimationFrame(this._fillObserverRetry); this._fillObserverRetry = 0; }
    if (this._autoFitResizeObserver) { this._autoFitResizeObserver.disconnect(); this._autoFitResizeObserver = null; }
    if (this._fillResizeObserver) { this._fillResizeObserver.disconnect(); this._fillResizeObserver = null; }
  }

  // ---
  _init() {
    this._readDefinitions();
    this._currentPage = 1;
    this._selectedIdx = 0;
    this._kbNav = false;
    this._filters = {};
    this._ROW_H = 34;

    if (this._isDynamic) {
      this._allRows = [];
      this._rows = [];
      this._total = 0;
      this._build();
      if (!this._detailOf) this._fetchDynamic();
    } else if (this._isStaticByRequest) {
      this._allRows = [];
      this._rows = [];
      this._total = 0;
      this._build();
      if (!this._detailOf) this._fetchStatic();
    } else {
      this._readInlineData();
      this._build();
    }
  }

  // ---
  _readDefinitions() {
    this._cols = Array.from(this.querySelectorAll('grid-col')).map(el => ({
      name:     el.getAttribute('name'),
      label:    el.getAttribute('label') || '',
      type:     el.getAttribute('type') || 'text',
      mapId:    el.getAttribute('map-data-id') || '',
      width:    el.getAttribute('width') || '',
      align:    this._normalizeAlign(el.getAttribute('align') || ''),
      tagColor: el.getAttribute('tag-color') || el.getAttribute('color') || '',
      fill:     el.hasAttribute('fill'),
      collapse: el.hasAttribute('collapse'),
      key:      el.hasAttribute('key'),
      el:       el,
    }));
    this._keys = Array.from(this.querySelectorAll('grid-key')).map(el => ({
      keys:     (el.getAttribute('key') || '').split(',').map(k => k.trim()),
      url:      el.getAttribute('url') || '',
      action:   el.getAttribute('action') || '',
      mode:     el.getAttribute('mode') || 'navigate',
      bind:     (el.getAttribute('bind') || '').split(',').map(s => s.trim()).filter(Boolean),
      targetId: el.getAttribute('target-id') || '',
      eventName: el.getAttribute('event') || 'row-action',
      dataAttrs: this._readDataAttrs(el),
    }));
    this._noResults = this.querySelector('on-no-results');
    this._fetchError = this.querySelector('on-fetch-error');
    this._footerButtons = Array.from(this.children)
      .filter(el => el.tagName === 'GRID-FOOTER-BUTTONS')
      .map(el => ({
        side: this._normalizeFooterSide(el.getAttribute('side') || ''),
        el,
      }));

    // Query definition
    const qd = this.querySelector('query-definition');
    if (qd) {
      this._queryDef = {
        name:   qd.getAttribute('name') || 'data',
        url:    qd.getAttribute('url') || '',
        method: (qd.getAttribute('method') || 'POST').toUpperCase(),
        target: qd.getAttribute('target') || '_self',
        response: qd.getAttribute('response') || 'json',
        params: Array.from(qd.querySelectorAll('query-param')).map(p => ({
          name:  p.getAttribute('name'),
          value: p.getAttribute('value') || null,
          bind:  p.getAttribute('bind') || null,
        })),
      };
    } else {
      this._queryDef = null;
    }

    // Detect mode
    this._isStatic = this.hasAttribute('static');
    this._isDynamic = this._queryDef && !this._isStatic;
    this._isStaticByRequest = this._queryDef && this._isStatic;
    this._detailOf = this.getAttribute('detail-of') || '';
    this._detailEvent = this.getAttribute('detail-event') || 'row-select';
    this._detailRows = this.getAttribute('detail-rows') || '';
    this._detailKey = this.getAttribute('detail-key') || '';
    this._detailMasterKey = this.getAttribute('detail-master-key') || this._detailKey;
    this._detailFilters = {};
    this._masterRow = null;
  }

  // ---
  _readInlineData() {
    // Skip rows nested inside <g-detail> — those belong to their master
    // row, not to the top-level row set
    this._allRows = Array.from(this.querySelectorAll('g-row'))
      .filter(row => !row.closest('g-detail'))
      .map(row => this._rowObjectFromElement(row));
    this._filters = {};
    if (this._detailOf && this._detailKey) {
      this._rows = [];
      this._total = 0;
    } else {
      this._applyFilters();
    }
  }

  // ---
  _rowObjectFromElement(row) {
    const obj = {};
    Array.from(row.children).filter(child => child.tagName === 'G-COL').forEach(col => {
      // textContent, not innerHTML: cells render via textContent, so the
      // serialized form would show entities literally (AT&amp;T)
      obj[col.getAttribute('name')] = col.textContent.trim();
    });
    Array.from(row.children).filter(child => child.tagName === 'G-DETAIL').forEach(detail => {
      const name = detail.getAttribute('name');
      if (!name) return;
      obj[name] = Array.from(detail.querySelectorAll('g-row'))
        .filter(childRow => childRow.closest('g-detail') === detail)
        .map(childRow => this._rowObjectFromElement(childRow));
    });
    return obj;
  }

  // ---
  _applyFilters() {
    const f = this._filters;
    this._rows = this._allRows.filter(row => {
      for (const key of Object.keys(f)) {
        const val = f[key];
        if (!val) continue;
        if (key === 'q') {
          const q = val.toLowerCase();
          const match = Object.values(row).some(v => String(v).toLowerCase().includes(q));
          if (!match) return false;
        } else if (Array.isArray(val)) {
          // Multi-select: match if any selected value equals the cell — or, when
          // the cell is itself an array (e.g. a tags column from a JSON source),
          // if the two intersect. (Was `val.includes(',')`, which also mis-split
          // text like "García, Juan".)
          const cell = row[key];
          const cellVals = Array.isArray(cell)
            ? cell.map(String)
            : [String(cell == null ? '' : cell)];
          if (!val.some(v => cellVals.includes(String(v)))) return false;
        } else {
          if (String(row[key] || '') !== val) return false;
        }
      }
      return true;
    });
    this._total = this._rows.length;
  }

  // ---
  _resolveParams() {
    if (!this._queryDef) return {};
    const params = {};
    const ps = this.pageSize;
    this._queryDef.params.forEach(p => {
      if (p.value !== null) {
        params[p.name] = p.value;
      } else if (p.bind) {
        const parts = p.bind.split('.');
        const ns = parts[0];
        const key = parts[1];
        if (ns === 'grid') {
          if (key === 'offset') params[p.name] = (this._currentPage - 1) * ps;
          else if (key === 'limit') params[p.name] = ps;
          else if (key === 'page') params[p.name] = this._currentPage;
          else if (key === 'page_size') params[p.name] = ps;
          else if (key === 'goto_id') { if (this._gotoId) params[p.name] = this._gotoId; }
        } else if (ns === 'filter') {
          const v = (this._filters || {})[key];
          
          // Multi-select arrays go to the server as CSV — wire format unchanged.
          if (v) params[p.name] = Array.isArray(v) ? v.join(',') : v;
        } else {
          const v = this._resolveExternalBind(parts);
          if (v !== undefined && v !== null && v !== '') params[p.name] = v;
        }
      }
    });
    return params;
  }

  // ---
  _resolveExternalBind(parts) {
    if (!parts || parts.length < 3) return undefined;
    const sourceId = parts[0] === 'master' ? this._detailOf : parts[0];
    if (!sourceId || parts[1] !== 'row') return undefined;
    const source = document.getElementById(sourceId);
    const row = source && source.selectedRow ? source.selectedRow : this._masterRow;
    if (!row) return undefined;
    return this._readPath(row, parts.slice(2).join('.'));
  }

  // ---
  _fetchStatic() {
    const qd = this._queryDef;
    const params = this._resolveParams();
    const url = qd.url;
    const method = qd.method;

    const fetchOpts = { method, credentials: 'same-origin' };
    if (method === 'GET') {
      const qs = new URLSearchParams(params).toString();
      var fetchUrl = url + (url.includes('?') ? '&' : '?') + qs;
    } else {
      fetchOpts.headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
      fetchOpts.body = new URLSearchParams(params).toString();
      var fetchUrl = url;
    }

    const seq = this._fetchSeq = (this._fetchSeq || 0) + 1;
    fetch(fetchUrl, fetchOpts)
      .then(r => this._readQueryResponse(r))
      .then(resp => {
        if (seq !== this._fetchSeq) return; // a newer request superseded this one
        if (resp.error) { this._showError(resp.error); return; }
        this._gotoId = null; // one-shot: don't resend on later requests
        this._allRows = resp.data || [];
        this._applyFilters();
        this._currentPage = 1;
        this._selectedIdx = 0;
        this._renderPage();
        this._syncColWidths();
      })
      .catch(err => {
        console.error('static fetch error:', err);
        if (seq === this._fetchSeq) this._showError(err.message);
      });
  }

  // ---
  _fetchDynamic() {
    const qd = this._queryDef;
    const params = this._resolveParams();
    const url = qd.url;
    const method = qd.method;

    const fetchOpts = { method, credentials: 'same-origin' };
    let fetchUrl = url;
    if (method === 'GET') {
      const qs = new URLSearchParams(params).toString();
      fetchUrl = url + (url.includes('?') ? '&' : '?') + qs;
    } else {
      fetchOpts.headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
      fetchOpts.body = new URLSearchParams(params).toString();
    }

    const seq = this._fetchSeq = (this._fetchSeq || 0) + 1;
    fetch(fetchUrl, fetchOpts)
      .then(r => this._readQueryResponse(r))
      .then(resp => {
        if (seq !== this._fetchSeq) return; // a newer request superseded this one
        if (resp.error) { this._showError(resp.error); return; }
        this._gotoId = null; // one-shot: don't resend on later requests
        const res = resp.result || {};
        this._rows = resp.data || [];
        this._total = res.total || this._rows.length;
        this._eof = res.eof || false;
        if (res.offset !== undefined) {
          const ps = this.pageSize;
          // Guard div-by-zero: page-size="all" with an empty result makes
          // pageSize 0 → res.offset / 0 = NaN → page=NaN on every later fetch.
          this._currentPage = ps > 0 ? Math.floor(res.offset / ps) + 1 : 1;
        }
        if (res.select_index !== undefined && res.select_index >= 0) {
          this._pendingFocusIdx = res.select_index;
        }
        this._renderPage(false, true);
        this._syncColWidths();
      })
      .catch(err => {
        console.error('dynamic fetch error:', err);
        if (seq === this._fetchSeq) {
          this._pendingFocusIdx = null; // don't let it leak into a later render
          this._showError(err.message);
        }
      });
  }

  // ---
  _readQueryResponse(response) {
    if (!this._queryDef || this._queryDef.response !== 'g-row') return response.json();
    return response.text().then(html => this._parseGRowResponse(html));
  }

  // ---
  _parseGRowResponse(html) {
    const tmp = document.createElement('template');
    tmp.innerHTML = html || '';
    const meta = tmp.content.querySelector('query-result');
    const rows = Array.from(tmp.content.querySelectorAll('g-row'))
      .filter(row => !row.closest('g-detail'))
      .map(row => this._rowObjectFromElement(row));
    const result = {};
    if (meta) {
      ['total', 'offset'].forEach(name => {
        if (meta.hasAttribute(name)) result[name] = parseInt(meta.getAttribute(name), 10) || 0;
      });
      if (meta.hasAttribute('eof')) result.eof = meta.getAttribute('eof') !== 'false';
      if (meta.hasAttribute('select-index')) result.select_index = parseInt(meta.getAttribute('select-index'), 10) || 0;
    }
    return { result, data: rows };
  }

  // ---
  _navigateWithParams() {
    const qd = this._queryDef;
    const params = this._resolveParams();
    const form = document.createElement('form');
    form.method = qd.method;
    form.action = qd.url;
    form.target = qd.target || '_self';
    form.style.display = 'none';
    for (const [k, v] of Object.entries(params)) {
      const input = document.createElement('input');
      input.type = 'hidden'; input.name = k; input.value = v;
      form.appendChild(input);
    }
    document.body.appendChild(form);
    form.submit();
    form.remove(); // submit is already initiated; drop the node so it
                   // can't orphan in <body> — this path may set
                   // form.target="_blank", which never navigates the page
  }

  // ---
  _showError(msg) {
    this._tbody.innerHTML = '';
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = this._cols.length;
    td.className = 'dg-no-results';
    if (this._fetchError) {
      td.innerHTML = this._fetchError.innerHTML;
    } else {
      td.textContent = msg || 'Error loading data';
    }
    tr.appendChild(td);
    this._tbody.appendChild(tr);
    this._updatePagination();
  }

  // ---
  _readDataAttrs(el) {
    const d = {};
    for (const attr of el.attributes) {
      if (attr.name.startsWith('data-')) d[attr.name.slice(5)] = attr.value;
    }
    return d;
  }

  // ---
  _cssLength(value) {
    const v = String(value || '').trim();
    if (!v) return '';
    if (/^-?\d+(\.\d+)?$/.test(v)) return v + 'px';
    return v;
  }

  // ---
  _normalizeAlign(value) {
    const align = String(value || '').trim().toLowerCase();
    return /^(left|center|right)$/.test(align) ? align : '';
  }

  // ---
  _normalizeFooterSide(value) {
    const side = String(value || '').trim().toLowerCase();
    return /^(left|center|right)$/.test(side) ? side : 'right';
  }

  // ---
  _applyColumnPresentation(el, col, isBodyCell) {
    if (col.width) {
      el.style.width = this._cssLength(col.width);
      if (isBodyCell) el.style.padding = '6px 4px';
    }
    if (col.align) {
      el.style.textAlign = col.align;
    } else if (col.width) {
      el.style.textAlign = 'center';
    }
  }

  // ---
  _cellContentWidth(cell) {
    // Prefer the batched cache (populated by _syncColWidths) so the
    // per-column auto-fit loop doesn't force a layout flush per cell; fall
    // back to a one-off measurement when there's no cache.
    if (this._widthCache && this._widthCache.has(cell)) return this._widthCache.get(cell);
    const cs = getComputedStyle(cell);
    const probe = document.createElement('span');
    probe.style.cssText = [
      'position:fixed',
      'left:-10000px',
      'top:-10000px',
      'visibility:hidden',
      'white-space:nowrap',
      'font:' + cs.font,
      'letter-spacing:' + cs.letterSpacing,
    ].join(';');
    probe.textContent = cell.textContent || '';
    document.body.appendChild(probe);
    const pad = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
    const width = Math.ceil(probe.getBoundingClientRect().width + pad + 2);
    probe.remove();
    return width;
  }

  // ---
  // Measure the text width of many cells with a SINGLE layout flush. The
  // previous path (append → getBoundingClientRect → remove, per cell, inside
  // the per-column loop) interleaved DOM writes with reads and forced one
  // reflow per cell — O(columns × rows) layout thrashing. Here every probe
  // goes into one offscreen container inserted once; the first read flushes
  // layout once and the rest are free (no mutation between reads). Returns a
  // Map(cell -> width) consumed by _cellContentWidth.
  _measureCellWidths(cells) {
    const cache = new Map();
    if (!cells.length) return cache;
    const container = document.createElement('div');
    // nowrap container + inline-block probes: each probe shrinks to its own
    // content width (a display:block child would stretch to the container).
    container.style.cssText = 'position:fixed;left:-10000px;top:-10000px;visibility:hidden;white-space:nowrap;';
    const probes = [];
    const pads = [];
    for (const cell of cells) {
      const cs = getComputedStyle(cell);
      const probe = document.createElement('span');
      probe.style.cssText = 'display:inline-block;white-space:nowrap;font:' + cs.font + ';letter-spacing:' + cs.letterSpacing + ';';
      probe.textContent = cell.textContent || '';
      container.appendChild(probe);
      probes.push(probe);
      pads.push(parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight));
    }
    document.body.appendChild(container); // single insertion → single layout invalidation
    for (let i = 0; i < cells.length; i++) {
      cache.set(cells[i], Math.ceil(probes[i].getBoundingClientRect().width + pads[i] + 2));
    }
    container.remove();
    return cache;
  }

  // ---
  _horizontalPadding(el) {
    if (!el) return 0;
    const cs = getComputedStyle(el);
    return (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
  }

  // ---
  _cssLengthPx(value, contextEl) {
    const css = this._cssLength(value);
    if (!css) return 0;
    if (css.endsWith('px')) return parseFloat(css) || 0;
    const probe = document.createElement('div');
    const cs = contextEl ? getComputedStyle(contextEl) : null;
    probe.style.cssText = [
      'position:fixed',
      'left:-10000px',
      'top:-10000px',
      'visibility:hidden',
      'box-sizing:border-box',
      'width:' + css,
      cs ? ('font:' + cs.font) : '',
    ].filter(Boolean).join(';');
    document.body.appendChild(probe);
    const width = probe.getBoundingClientRect().width;
    probe.remove();
    return width || 0;
  }

  // ---
  _buttonColumnMinWidth(col, th, columnCells) {
    if (!col || col.type !== 'btn') return 0;
    const items = Array.from(col.el.querySelectorAll('closure-btn'));
    if (!items.length) return 0;
    const context = columnCells[0] || th;
    const declaredWidth = items.reduce((sum, item) => {
      const width = this._cssLengthPx(item.getAttribute('width') || '', context);
      return sum + width;
    }, 0);
    if (declaredWidth <= 0) return 0;
    return Math.ceil(declaredWidth + this._horizontalPadding(context || th) + 2);
  }

  // ---
  _tagColumnMinWidth(col, th, columnCells) {
    if (!col || col.type !== 'tags' || !columnCells.length) return 0;
    const tagWidths = columnCells.flatMap(cell => {
      return Array.from(cell.querySelectorAll('.dg-tag')).map(tag => {
        return Math.ceil(tag.getBoundingClientRect().width + this._horizontalPadding(cell) + 2);
      });
    });
    return Math.max(this._cellContentWidth(th), ...tagWidths, 0);
  }

  // ---
  _autoFitColumnWidth(idx, ths, gridCol) {
    const columnCells = Array.from(this._tbody.querySelectorAll('tr td:nth-child(' + (idx + 1) + ')'));
    if (gridCol && gridCol.type === 'tags') {
      return this._tagColumnMinWidth(gridCol, ths[idx], columnCells);
    }
    return Math.max(
      this._cellContentWidth(ths[idx]),
      this._buttonColumnMinWidth(gridCol, ths[idx], columnCells),
      ...columnCells.map(cell => this._cellContentWidth(cell))
    );
  }

  // ---
  get pageSize() {
    const ps = this.getAttribute('page-size');
    if (!ps || ps === 'all') return this._total;
    if (ps === 'auto') return this._calcAutoPageSize();
    return parseInt(ps, 10) || this._total;
  }

  get totalPages() { return Math.max(1, Math.ceil(this._total / this.pageSize)); }

  // ---
  _calcAutoPageSize() {
    const wrap = this._wrap;
    if (!wrap) return 10;
    const theadH = this.hasAttribute('headless') ? 0 : (this._headTable ? this._headTable.offsetHeight : 32);
    const paginH = this.hasAttribute('footerless') ? 0 : (this._pagination ? this._pagination.offsetHeight : 36);
    const ROW_H = 34;
    const minRows = parseInt(this.getAttribute('min-rows'), 10) || 1;
    const maxRows = parseInt(this.getAttribute('max-rows'), 10) || 999;
    const available = wrap.clientHeight - theadH - paginH - 4;
    const calc = Math.floor(available / ROW_H);
    return Math.max(minRows, Math.min(maxRows, calc));
  }

  // ---
  _build() {
    // Clear children
    const origHTML = this.innerHTML;
    this.innerHTML = '';

    // Wrap
    this._wrap = document.createElement('div');
    this._wrap.className = 'dg-wrap';

    // Head table (skipped when the grid has the `headless` attribute)
    if (!this.hasAttribute('headless')) {
      const headWrap = document.createElement('div');
      headWrap.className = 'dg-thead-wrap';
      this._headTable = document.createElement('table');
      this._headTable.className = 'dg-table dg-head-table';
      const thead = document.createElement('thead');
      const headRow = document.createElement('tr');
      this._cols.forEach(col => {
        const th = document.createElement('th');
        this._applyColumnPresentation(th, col, false);
        if (col.collapse) th.className = 'dg-col-collapse';
        if (col.type === 'actions') {
          th.textContent = '⋮';
          th.title = col.label || 'Actions';
          th.style.textAlign = 'right';
        } else if (col.type === 'btn') {
          th.textContent = col.label || '';
          th.title = col.label || col.name;
        } else {
          th.textContent = col.label || '';
        }
        th.addEventListener('click', () => {
          this.dispatchEvent(new CustomEvent('header-click', { detail: { column: col.name }, bubbles: true }));
        });
        headRow.appendChild(th);
      });
      thead.appendChild(headRow);
      this._headTable.appendChild(thead);
      headWrap.appendChild(this._headTable);
      this._wrap.appendChild(headWrap);
    }

    // Body table
    this._bodyWrap = document.createElement('div');
    this._bodyWrap.className = 'dg-table-wrap';

    this._bodyTable = document.createElement('table');
    this._bodyTable.className = 'dg-table';
    this._tbody = document.createElement('tbody');
    this._bodyTable.appendChild(this._tbody);
    this._bodyWrap.appendChild(this._bodyTable);
    this._wrap.appendChild(this._bodyWrap);

    // Pagination (skipped when the grid has the `footerless` attribute)
    const ps = this.getAttribute('page-size');
    if (ps && ps !== 'all' && !this.hasAttribute('footerless')) {
      this._pagination = document.createElement('div');
      this._pagination.className = 'dg-pagination';
      this._buildPagination();
      this._wrap.appendChild(this._pagination);
    }

    this.appendChild(this._wrap);

    // Auto page-size: set height BEFORE first render
    if (ps === 'auto') {
      this._setAutoHeight();
    }

    // Render first page
    this._renderPage();
    this._syncColWidths();
    // max-rows cap: applies regardless of page-size mode (e.g. with
    // page-size="all" + static data, this limits visible rows and scrolls
    // the body for the rest).
    this._applyMaxHeight();

    // Events
    this._setupEvents();
    this._setupMasterDetail();
    this._setupAutoFitResizeObserver();
    this._setupFillObserver();

    // Auto-focus
    if (this.hasAttribute('autofocus')) this.focus();

    // Auto page-size: observe resize
    if (ps === 'auto' && !this._onWinResize) {
      this._onWinResize = () => this._refreshAutoLayout();
      window.addEventListener('resize', this._onWinResize);
    }
  }

  // ---
  _setupAutoFitResizeObserver() {
    if (!this.hasAttribute('auto-fit') || !window.ResizeObserver || this._autoFitResizeObserver) return;
    this._autoFitLastWidth = Math.floor(this._bodyWrap ? this._bodyWrap.clientWidth : this.clientWidth);
    this._autoFitResizeObserver = new ResizeObserver(() => {
      if (this._autoFitResizeRaf) cancelAnimationFrame(this._autoFitResizeRaf);
      this._autoFitResizeRaf = requestAnimationFrame(() => {
        const width = Math.floor(this._bodyWrap ? this._bodyWrap.clientWidth : this.clientWidth);
        if (!width || width === this._autoFitLastWidth) return;
        this._autoFitLastWidth = width;
        this._syncColWidths();
      });
    });
    this._autoFitResizeObserver.observe(this._bodyWrap || this);
  }

  // ---
  _setupMasterDetail() {
    if (!this._detailOf || this._masterDetailBound) return;
    const master = document.getElementById(this._detailOf);
    if (!master) {
      if (!this._masterDetailRetry) {
        this._masterDetailRetry = requestAnimationFrame(() => {
          this._masterDetailRetry = 0;
          this._setupMasterDetail();
        });
      }
      return;
    }
    this._masterDetailBound = true;
    this._masterEl = master;
    if (!this._onMasterEvent) {
      this._onMasterEvent = e => this._refreshFromMaster(e.detail ? e.detail.row : null);
    }
    master.addEventListener(this._detailEvent, this._onMasterEvent);
    this._refreshFromMaster(master.selectedRow || null);
  }

  // ---
  _refreshFromMaster(row) {
    this._masterRow = row || null;
    this._currentPage = 1;
    this._selectedIdx = 0;

    if (!this._masterRow) {
      if (this._detailKey) this._clearDetailFilterRows();
      else this._setRows([]);
      return;
    }

    if (this._detailRows) {
      const rows = this._readPath(this._masterRow, this._detailRows);
      this._setRows(Array.isArray(rows) ? rows : []);
      return;
    }

    if (this._detailKey) {
      const masterValue = this._readPath(this._masterRow, this._detailMasterKey);
      this._detailFilters = {};
      if (this._filters) delete this._filters[this._detailKey];
      if (masterValue !== undefined && masterValue !== null && masterValue !== '') {
        this._detailFilters[this._detailKey] = String(masterValue);
      }
      this._filters = { ...(this._filters || {}), ...this._detailFilters };
      this._applyFilterMode();
      return;
    }

    if (this._isDynamic) this._fetchDynamic();
    else if (this._isStaticByRequest) this._fetchStatic();
    else this._renderPage();
  }

  // ---
  _setRows(rows) {
    this._allRows = rows || [];
    this._applyFilters();
    this._renderPage();
    this._syncColWidths();
  }

  // ---
  _showRows(rows) {
    const allRows = this._allRows;
    this._allRows = rows || [];
    this._applyFilters();
    this._allRows = allRows;
    this._renderPage();
    this._syncColWidths();
  }

  // ---
  _clearDetailFilterRows() {
    if (this._detailKey) delete this._detailFilters[this._detailKey];
    if (this._detailKey && this._filters) delete this._filters[this._detailKey];
    if (this._isDynamic || this._isStaticByRequest) {
      this._rows = [];
      this._total = 0;
      this._renderPage(false, this._isDynamic);
      this._syncColWidths();
      return;
    }
    this._showRows([]);
  }

  // ---
  _applyFilterMode() {
    this._currentPage = 1;
    this._selectedIdx = 0;
    // Dynamic grids default to re-fetching with the live filter values —
    // their _allRows is empty, so local filtering would blank the grid
    const filterMode = this.getAttribute('filter') || (this._isDynamic ? 'fetch' : 'local');
    if (filterMode === 'fetch' && this._queryDef) {
      this._fetchDynamic();
    } else if (filterMode === 'navigate' && this._queryDef) {
      this._navigateWithParams();
    } else {
      this._applyFilters();
      this._renderPage();
      this._syncColWidths();
    }
  }

  // ---
  _readPath(obj, path) {
    if (!obj || !path) return undefined;
    return path.split('.').reduce((cur, part) => {
      if (cur === undefined || cur === null) return undefined;
      return cur[part];
    }, obj);
  }

  // ---
  _setupFillObserver() {
    if (this.getAttribute('page-size') !== 'auto' || !window.ResizeObserver || this._fillResizeObserver) return;
    const fillSelector = this.getAttribute('fill-stop') || this.getAttribute('fill-reserve') || '';
    const target = this._fillTargetElement();
    if (!target && (!fillSelector || parseInt(fillSelector, 10) > 0)) return;
    if (!target) {
      // The target may simply be rendered later (deferred), so we retry — but
      // a typo'd selector (e.g. fill-stop="#nope") would never match and loop
      // at 60fps forever. Cap the retries (~1s) and warn instead of burning CPU.
      if ((this._fillObserverRetries = (this._fillObserverRetries || 0) + 1) > 60) {
        console.warn('closure-data-grid: fill target "' + fillSelector +
          '" not found after ~1s — giving up (check fill-stop / fill-reserve).');
        return;
      }
      if (!this._fillObserverRetry) {
        this._fillObserverRetry = requestAnimationFrame(() => {
          this._fillObserverRetry = 0;
          this._setupFillObserver();
        });
      }
      return;
    }
    this._fillObserverRetries = 0; // target found — reset for any future re-setup
    this._fillResizeObserver = new ResizeObserver(() => {
      if (this._fillResizeRaf) cancelAnimationFrame(this._fillResizeRaf);
      this._fillResizeRaf = requestAnimationFrame(() => this._refreshAutoLayout());
    });
    this._fillResizeObserver.observe(target);
    this._renderedChildren(target).forEach(child => this._fillResizeObserver.observe(child));
  }

  // ---
  _refreshAutoLayout() {
    if (this.getAttribute('page-size') !== 'auto') return;
    this._setAutoHeight();
    const newTp = this.totalPages;
    if (this._currentPage > newTp) this._currentPage = newTp;
    this._renderPage();
    this._syncColWidths();
    this._updatePagination();
  }

  // ---
  _buildPagination() {
    const p = this._pagination;
    p.innerHTML = '';
    this._appendFooterButtons(p, 'left');

    const nav = document.createElement('div');
    nav.className = 'dg-pagination-group';
    const btns = ['⏮', '◀', '▶', '⏭'];
    const titles = ['First', 'Previous', 'Next', 'Last'];
    this._pageButtons = [];
    btns.forEach((icon, i) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'dg-page-btn';
      btn.tabIndex = -1;
      btn.title = titles[i];
      btn.textContent = icon;
      this._pageButtons.push(btn);
      nav.appendChild(btn);
    });
    this._pageInfo = document.createElement('span');
    this._pageInfo.className = 'dg-page-info';
    nav.insertBefore(this._pageInfo, this._pageButtons[2]);
    p.appendChild(nav);

    this._appendFooterButtons(p, 'center');

    const sep = document.createElement('div');
    sep.className = 'dg-pagination-sep';
    p.appendChild(sep);

    this._recordsInfo = document.createElement('span');
    p.appendChild(this._recordsInfo);

    if (this.hasAttribute('show-page-size')) {
      this._pageSizeInfo = document.createElement('span');
      this._pageSizeInfo.style.color = 'var(--text-muted, #6b7280)';
      p.appendChild(this._pageSizeInfo);
    }

    // Refresh button
    if (this.hasAttribute('refresh-button')) {
      const refreshBtn = document.createElement('button');
      refreshBtn.type = 'button';
      refreshBtn.className = 'dg-page-btn';
      refreshBtn.tabIndex = -1;
      refreshBtn.title = 'Refresh';
      refreshBtn.textContent = '↻';
      refreshBtn.addEventListener('click', () => {
        const e = new CustomEvent('grid-refresh', { bubbles: true, cancelable: true });
        if (this.dispatchEvent(e)) this.refresh();
      });
      p.appendChild(refreshBtn);
    }

    this._appendFooterButtons(p, 'right');

    // Button events
    this._pageButtons[0].addEventListener('click', () => this._goPage('first'));
    this._pageButtons[1].addEventListener('click', () => this._goPage(-1));
    this._pageButtons[2].addEventListener('click', () => this._goPage(+1));
    this._pageButtons[3].addEventListener('click', () => this._goPage('last'));
  }

  // ---
  _appendFooterButtons(parent, side) {
    const groups = (this._footerButtons || []).filter(group => group.side === side);
    if (!groups.length) return;
    const wrap = document.createElement('div');
    wrap.className = 'dg-pagination-group dg-footer-buttons dg-footer-buttons-' + side;
    groups.forEach(group => {
      Array.from(group.el.querySelectorAll('closure-btn')).forEach(item => {
        wrap.appendChild(this._createFooterButton(item));
      });
    });
    if (wrap.childNodes.length) parent.appendChild(wrap);
  }

  // ---
  _createFooterButton(item) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'dg-page-btn dg-footer-btn';
    btn.tabIndex = -1;
    const icon = item.getAttribute('icon') || '';
    const label = item.getAttribute('label') || item.textContent.trim();
    btn.textContent = [icon, label].filter(Boolean).join(icon && label ? ' ' : '') || '•';
    btn.title = item.getAttribute('title') || label || item.getAttribute('data-action') || '';
    const width = this._cssLength(item.getAttribute('width') || '');
    if (width) {
      btn.style.width = width;
      btn.style.minWidth = width;
      btn.style.maxWidth = width;
    }
    btn.addEventListener('click', e => {
      e.stopPropagation();
      this._executeAction(this._actionDefFromElement(item));
    });
    return btn;
  }

  // ---
  _updatePagination() {
    if (!this._pagination) return;
    const ps = this.pageSize;
    const tp = this.totalPages;
    this._pageInfo.textContent = this._currentPage + ' / ' + tp;
    const start = (this._currentPage - 1) * ps + 1;
    const end = Math.min(this._currentPage * ps, this._total);
    this._recordsInfo.textContent = this._total > 0 ? 'Records ' + start + '–' + end + ' of ' + this._total : 'No records';
    if (this._pageSizeInfo) this._pageSizeInfo.textContent = ' · ' + ps + '/p';
    this._pageButtons[0].disabled = this._currentPage === 1;
    this._pageButtons[1].disabled = this._currentPage === 1;
    this._pageButtons[2].disabled = this._currentPage >= tp;
    this._pageButtons[3].disabled = this._currentPage >= tp;

  }

  // ---
  _goPage(dir) {
    const tp = this.totalPages;
    const newPage = dir === 'first' ? 1 : dir === 'last' ? tp : this._currentPage + dir;
    if (newPage < 1 || newPage > tp) return;
    this._currentPage = newPage;
    const focusLast = (dir === -1 || dir === 'last');
    if (this._isDynamic) {
      // Applied after the fetch renders (server select-index wins if set)
      this._pendingFocusIdx = focusLast ? this.pageSize - 1 : 0;
      this._fetchDynamic();
    } else {
      this._renderPage(focusLast);
      this._syncColWidths();
    }
  }

  // ---
  _renderPage(focusLast, isDynamicData) {
    let pageRows;
    if (this._isDynamic) {
      // _rows always holds exactly the server's current page — slicing
      // by absolute offset would blank out pages > 1 (e.g. when the
      // auto-layout resize path re-renders)
      pageRows = this._rows;
    } else {
      const ps = this.pageSize;
      const start = (this._currentPage - 1) * ps;
      pageRows = this._rows.slice(start, start + ps);
    }

    this._tbody.innerHTML = '';

    if (pageRows.length === 0) {
      this._selectedIdx = -1;
      this._pendingFocusIdx = null;
      if (this._noResults) {
        const cell = document.createElement('td');
        cell.colSpan = this._cols.length;
        cell.className = 'dg-no-results';
        cell.innerHTML = this._noResults.innerHTML;
        const tr = document.createElement('tr');
        tr.appendChild(cell);
        this._tbody.appendChild(tr);
      }
      this._updatePagination();
      this._dispatchEmptySelection();
      return;
    }

    pageRows.forEach((row, i) => {
      const tr = this._createRow(row, i);
      tr.addEventListener('click', () => this._selectRow(i));
      this._tbody.appendChild(tr);
    });

    // Focus row — a pending index (server select-index, or paging
    // backwards in dynamic mode) takes precedence
    let focusIdx = focusLast ? pageRows.length - 1 : 0;
    if (this._pendingFocusIdx != null) {
      focusIdx = Math.max(0, Math.min(this._pendingFocusIdx, pageRows.length - 1));
      this._pendingFocusIdx = null;
    }
    this._selectRow(focusIdx);

    this._updatePagination();
  }

  // ---
  _createRow(row, i) {
    const tr = document.createElement('tr');
    this._cols.forEach(col => {
      const td = document.createElement('td');
      const val = row[col.name] === undefined || row[col.name] === null ? '' : row[col.name];

      if (col.collapse) { td.className = 'dg-col-collapse'; td.title = String(val); }
      this._applyColumnPresentation(td, col, true);

      if (col.mapId) {
        const map = document.getElementById(col.mapId);
        const resolved = map ? map.resolve(val) : null;
        if (resolved) {
          const span = document.createElement('span');
          span.textContent = resolved.icon || val;
          span.title = resolved.label || val;
          if (resolved.color) span.style.color = resolved.color;
          if (resolved.size) span.style.fontSize = resolved.size;
          td.appendChild(span);
        } else {
          td.textContent = val;
        }
      } else if (col.type === 'actions') {
        const items = Array.from(col.el.querySelectorAll('closure-btn-item'));
        const wrap = document.createElement('div');
        wrap.style.cssText = 'position:relative;display:inline-block;';
        const btn = document.createElement('button');
        btn.type = 'button'; btn.textContent = '☰'; btn.tabIndex = -1;
        btn.style.cssText = 'border:1px solid var(--dg-border,#e5e7eb);border-radius:4px;background:#fff;cursor:pointer;font-size:14px;padding:2px 6px;';
        const panel = document.createElement('div');
        // The Popover API renders the menu in the top layer, so it escapes
        // the grid body's overflow:auto clipping — the menu on the last
        // rows is no longer cut off. Where unsupported, the fallback uses
        // position:fixed (same trigger-rect positioning), which also escapes
        // the clipping — only the native light-dismiss niceties are lost.
        const usePopover = typeof panel.showPopover === 'function'
          && Object.prototype.hasOwnProperty.call(HTMLElement.prototype, 'popover');
        const panelLook = 'background:#fff;border:1px solid var(--dg-border,#e5e7eb);border-radius:6px;box-shadow:0 4px 16px rgba(0,0,0,0.12);z-index:100;overflow:hidden;';
        if (usePopover) {
          panel.popover = 'auto';
          // No inline display: the UA keeps [popover] hidden until open.
          // Position is fixed and recomputed from the trigger on each open.
          panel.style.cssText = 'position:fixed;margin:0;inset:auto;min-width:max-content;' + panelLook;
        } else {
          // Fallback also uses position:fixed (coords set per-open from the
          // trigger rect) so it escapes the grid's overflow clipping just like
          // the popover — last-row menus are no longer cut off on browsers
          // without the Popover API.
          panel.style.cssText = 'display:none;position:fixed;margin:0;inset:auto;min-width:max-content;' + panelLook;
        }
        const closePanel = () => {
          if (usePopover) { if (panel.matches(':popover-open')) panel.hidePopover(); }
          else { panel.style.display = 'none'; panel.classList.remove('dg-action-panel-open'); }
        };
        // Shared positioning (fixed coords from the trigger's viewport rect);
        // used by both the popover (on beforetoggle) and the fallback (on open).
        const positionPanel = () => {
          const r = btn.getBoundingClientRect();
          panel.style.left = 'auto';
          panel.style.right = (window.innerWidth - r.right) + 'px';
          if (r.bottom > window.innerHeight * 0.6) {
            panel.style.top = 'auto';
            panel.style.bottom = (window.innerHeight - r.top + 2) + 'px';
          } else {
            panel.style.bottom = 'auto';
            panel.style.top = (r.bottom + 2) + 'px';
          }
        };
        items.forEach(item => {
          const mi = document.createElement('button');
          mi.type = 'button'; mi.tabIndex = -1;
          mi.textContent = item.getAttribute('icon') || '•';
          mi.title = item.getAttribute('data-action') || '';
          mi.style.cssText = 'display:flex;align-items:center;justify-content:center;padding:8px 12px;cursor:pointer;font-size:16px;border:none;border-bottom:1px solid var(--dg-border,#e5e7eb);background:none;width:100%;';
          mi.addEventListener('click', (e) => {
            e.stopPropagation(); closePanel();
            this._selectRow(i);
            this._executeAction(this._actionDefFromElement(item));
          });
          panel.appendChild(mi);
        });
        if (panel.lastChild) panel.lastChild.style.borderBottom = 'none';
        if (usePopover) {
          // The invoker drives the toggle natively; the browser also gives
          // us light-dismiss (outside click / Esc) and auto-closes any other
          // open action menu for free.
          btn.popoverTargetElement = panel;
          panel.addEventListener('beforetoggle', (e) => {
            if (e.newState === 'open') positionPanel();
          });
          btn.addEventListener('click', () => { this._selectRow(i); });
        } else {
          btn.addEventListener('click', (e) => {
            e.stopPropagation(); this._selectRow(i);
            const open = panel.style.display === 'block';
            document.querySelectorAll('.dg-action-panel-open').forEach(p => { p.style.display = 'none'; p.classList.remove('dg-action-panel-open'); });
            if (!open) { panel.style.display = 'block'; panel.classList.add('dg-action-panel-open'); positionPanel(); }
          });
        }
        wrap.appendChild(btn); wrap.appendChild(panel);
        td.appendChild(wrap);
      } else if (col.type === 'btn') {
        const items = Array.from(col.el.querySelectorAll('closure-btn'));
        items.forEach(item => {
          if (!this._buttonVisibleForRow(item, row)) return;
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'dg-cell-btn';
          if (col.el.hasAttribute('plain-buttons') || item.hasAttribute('plain')) btn.classList.add('plain');
          const icon = this._buttonRowValue(item, row, 'icon-bind', item.getAttribute('icon') || '');
          const label = this._buttonRowValue(item, row, 'label-bind', item.textContent.trim());
          const title = this._buttonRowValue(item, row, 'title-bind', item.getAttribute('title') || item.getAttribute('label') || item.getAttribute('data-action') || '');
          btn.textContent = [icon, label].filter(Boolean).join(label && icon ? ' ' : '') || '•';
          btn.title = title;
          btn.tabIndex = -1;
          const width = this._cssLength(item.getAttribute('width') || '');
          if (width) {
            btn.style.width = width;
            btn.style.minWidth = width;
            btn.style.maxWidth = width;
          }
          btn.addEventListener('click', (e) => {
            e.stopPropagation(); this._selectRow(i);
            this._executeAction(this._actionDefFromElement(item));
          });
          td.appendChild(btn);
        });
      } else if (col.type === 'tags') {
        td.classList.add('dg-tags-cell');
        this._renderTagsCell(td, val, col);
      } else {
        td.textContent = val;
      }
      tr.appendChild(td);
    });
    return tr;
  }

  // ---
  _renderTagsCell(td, value, col) {
    const tags = this._parseTags(value, col);
    if (!tags.length) return;
    const wrap = document.createElement('span');
    wrap.className = 'dg-tags';
    tags.forEach((tag, idx) => {
      const span = document.createElement('span');
      span.className = 'dg-tag' + this._tagColorClass(tag, col);
      span.textContent = tag.label;
      if (tag.title) span.title = tag.title;
      wrap.appendChild(span);
    });
    td.appendChild(wrap);
  }

  // ---
  _parseTags(value, col) {
    if (value === undefined || value === null || value === '') return [];
    if (Array.isArray(value)) return value.map(item => this._normalizeTag(item)).filter(tag => tag.label);
    if (typeof value === 'object') return [this._normalizeTag(value)].filter(tag => tag.label);

    const text = String(value).trim();
    if (!text) return [];
    if ((text.startsWith('[') && text.endsWith(']')) || (text.startsWith('{') && text.endsWith('}'))) {
      try {
        const parsed = JSON.parse(text);
        return this._parseTags(parsed, col);
      } catch (_) {
        // Fall through to CSV parsing.
      }
    }

    const separator = this._tagSeparator(col);
    return text.split(separator)
      .map(part => part.trim())
      .filter(Boolean)
      .map(part => {
        const sep = part.includes('|') ? '|' : (part.includes(':') ? ':' : '');
        if (!sep) return this._normalizeTag(part);
        const pieces = part.split(sep);
        return this._normalizeTag({ label: pieces.shift().trim(), color: pieces.join(sep).trim() });
      })
      .filter(tag => tag.label);
  }

  // ---
  _tagSeparator(col) {
    const raw = col && col.el ? (col.el.getAttribute('separator') || ',') : ',';
    return raw === '' ? ',' : raw;
  }

  // ---
  _normalizeTag(item) {
    if (item === undefined || item === null) return { label: '' };
    if (typeof item !== 'object') return { label: String(item).trim() };
    const label = item.label !== undefined ? item.label
      : item.text !== undefined ? item.text
      : item.name !== undefined ? item.name
      : item.value !== undefined ? item.value
      : '';
    return {
      label: String(label).trim(),
      color: item.color || item.class || item.variant || item.type || '',
      title: item.title || '',
    };
  }

  // ---
  _tagColorClass(tag, col) {
    const raw = String(tag.color || (col ? col.tagColor : '') || '').trim();
    if (!raw) return '';
    return ' dg-tag-color-' + raw.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
  }

  // ---
  _buttonVisibleForRow(item, row) {
    const field = item.getAttribute('show-bind') || '';
    if (!field) return true;
    const value = this._readPath(row, field);
    return this._isTruthyCellValue(value);
  }

  // ---
  _buttonRowValue(item, row, attr, fallback) {
    const field = item.getAttribute(attr) || '';
    if (!field) return fallback || '';
    const value = this._readPath(row, field);
    return value === undefined || value === null ? '' : String(value);
  }

  // ---
  _isTruthyCellValue(value) {
    if (value === undefined || value === null || value === false) return false;
    const str = String(value).trim();
    return !!str && str !== '0' && str.toLowerCase() !== 'false';
  }

  // ---
  _selectRow(idx) {
    const rows = Array.from(this._tbody.querySelectorAll('tr'));
    const changed = this._selectedIdx !== idx;
    rows.forEach(r => r.classList.remove('focused'));
    if (rows[idx]) {
      rows[idx].classList.add('focused');
      this._selectedIdx = idx;
      const ps = this.pageSize;
      const absIdx = (this._currentPage - 1) * ps + idx;
      const rowData = this._isDynamic ? this._rows[idx] : this._rows[absIdx];
      this.dispatchEvent(new CustomEvent('row-select', {
        detail: { row: rowData, index: absIdx },
        bubbles: true,
      }));
      if (changed) {
        this.dispatchEvent(new CustomEvent('row-focus', {
          detail: { row: rowData, index: absIdx },
          bubbles: true,
        }));
      }
    }
  }

  // ---
  _moveFocus(idx) {
    const rows = Array.from(this._tbody.querySelectorAll('tr'));
    if (idx < 0 || idx >= rows.length) return false;
    this._selectRow(idx);

    // Scroll into view within body wrap
    const rowTop = rows[idx].offsetTop;
    const rowBot = rowTop + rows[idx].offsetHeight;
    const w = this._bodyWrap;
    if (rowTop < w.scrollTop) w.scrollTop = rowTop;
    else if (rowBot > w.scrollTop + w.clientHeight) w.scrollTop = rowBot - w.clientHeight;
    return true;
  }

  // ---
  _syncColWidths() {
    if (!this._headTable) return; // headless mode
    if (this.hasAttribute('auto-fit')) {
      let bodyCg = this._bodyTable.querySelector('colgroup');
      if (!bodyCg) { bodyCg = document.createElement('colgroup'); this._bodyTable.prepend(bodyCg); }
      this._headTable.style.tableLayout = 'auto';
      this._bodyTable.style.tableLayout = 'auto';
      bodyCg.innerHTML = '';
      const cells = Array.from(this._bodyTable.querySelectorAll('tbody tr:first-child td'));
      const ths = Array.from(this._headTable.querySelectorAll('th'));
      if (!cells.length || !ths.length) return;
      let headCg = this._headTable.querySelector('colgroup');
      if (!headCg) { headCg = document.createElement('colgroup'); this._headTable.prepend(headCg); }
      headCg.innerHTML = '';
      const fillIdxs = this._cols
        .map((gridCol, idx) => gridCol.fill ? idx : -1)
        .filter(idx => idx >= 0);
      // Batch-measure every header + body cell once (single reflow) so the
      // per-column _cellContentWidth calls below read from cache.
      this._widthCache = this._measureCellWidths(
        ths.concat(Array.from(this._bodyTable.querySelectorAll('tbody td')))
      );
      const widths = this._cols.map((gridCol, idx) => {
        const cssWidth = this._cssLength(gridCol.width);
        if (cssWidth) return cssWidth;
        if (fillIdxs.includes(idx)) return '';
        return this._autoFitColumnWidth(idx, ths, gridCol) + 'px';
      });
      const fixedWidth = widths.reduce((sum, width, idx) => {
        if (!width || fillIdxs.includes(idx) || !width.endsWith('px')) return sum;
        return sum + parseFloat(width);
      }, 0);
      const fillContentWidth = fillIdxs.reduce((sum, idx) => sum + this._autoFitColumnWidth(idx, ths, this._cols[idx]), 0);
      this._widthCache = null; // measurements consumed; don't hold stale cell refs
      const gridWidth = Math.floor(this._bodyWrap.clientWidth || this._wrap.clientWidth || this.clientWidth);
      const fillAvailable = Math.max(0, gridWidth - fixedWidth);
      if (fillIdxs.length) {
        // Distribute the exact total across fill columns (floor + spread the
        // leftover pixels) so the sum never exceeds the available width.
        // Math.ceil on every column could overshoot by up to (n-1)px and
        // trigger a spurious horizontal scrollbar in auto-fit mode.
        // TODO: a separate ~2px horizontal overflow remains even when the fill
        // sum is exact — it comes from the .dg-wrap / cell borders, which the
        // available-width calc doesn't subtract. Minor; not the rounding bug.
        const total = Math.max(fillContentWidth, fillAvailable);
        const base = Math.floor(total / fillIdxs.length);
        let extra = total - base * fillIdxs.length;
        fillIdxs.forEach(idx => { widths[idx] = (base + (extra-- > 0 ? 1 : 0)) + 'px'; });
      }
      const tableWidth = widths.reduce((sum, width) => {
        return width && width.endsWith('px') ? sum + parseFloat(width) : sum;
      }, 0);
      this._cols.forEach((gridCol, idx) => {
        const headCol = document.createElement('col');
        const bodyCol = document.createElement('col');
        if (widths[idx]) {
          headCol.style.width = widths[idx];
          bodyCol.style.width = widths[idx];
        }
        headCg.appendChild(headCol);
        bodyCg.appendChild(bodyCol);
      });
      if (tableWidth > 0) {
        this._headTable.style.width = tableWidth + 'px';
        this._bodyTable.style.width = tableWidth + 'px';
      }
      this._headTable.style.tableLayout = 'fixed';
      this._bodyTable.style.tableLayout = 'fixed';
    } else {
      this._headTable.style.tableLayout = '';
      this._bodyTable.style.tableLayout = '';
      this._headTable.style.width = '';
      this._bodyTable.style.width = '';
      const headCg = this._headTable.querySelector('colgroup');
      if (headCg) headCg.remove();
      const ths = Array.from(this._headTable.querySelectorAll('th'));
      if (!ths.length) return;
      let bodyCg = this._bodyTable.querySelector('colgroup');
      if (!bodyCg) { bodyCg = document.createElement('colgroup'); this._bodyTable.prepend(bodyCg); }
      bodyCg.innerHTML = '';
      ths.forEach(th => {
        const col = document.createElement('col');
        col.style.width = th.offsetWidth + 'px';
        bodyCg.appendChild(col);
      });
    }
  }

  // ---
  _dispatchEmptySelection() {
    this.dispatchEvent(new CustomEvent('row-select', {
      detail: { row: null, index: -1 },
      bubbles: true,
    }));
    this.dispatchEvent(new CustomEvent('row-focus', {
      detail: { row: null, index: -1 },
      bubbles: true,
    }));
  }

  // ---
  _applyMaxHeight() {
    const maxRows = parseInt(this.getAttribute('max-rows'), 10) || 0;
    if (maxRows <= 0 || !this._wrap) return;
    const theadH = this.hasAttribute('headless') ? 0 : (this._headTable ? this._headTable.offsetHeight : 32);
    const paginH = this.hasAttribute('footerless') ? 0 : (this._pagination ? this._pagination.offsetHeight : 36);
    const ROW_H = 34;
    this._wrap.style.maxHeight = (theadH + (ROW_H * maxRows) + paginH) + 'px';
  }

  // ---
  _setAutoHeight() {
    const wrap = this._wrap;
    const top = wrap.getBoundingClientRect().top + window.scrollY;
    const theadH = this.hasAttribute('headless') ? 0 : (this._headTable ? this._headTable.offsetHeight : 32);
    const paginH = this.hasAttribute('footerless') ? 0 : (this._pagination ? this._pagination.offsetHeight : 36);
    const ROW_H = 34;
    const minRows = parseInt(this.getAttribute('min-rows'), 10) || 1;
    const maxRows = parseInt(this.getAttribute('max-rows'), 10) || 0;
    const minH = theadH + (ROW_H * minRows) + paginH;

    const bottomH = this._fillBottomHeight();

    let available = window.innerHeight - top - bottomH;

    // Apply max-rows cap
    if (maxRows > 0) {
      const maxH = theadH + (ROW_H * maxRows) + paginH;
      available = Math.min(available, maxH);
    }

    wrap.style.height = Math.max(minH, available) + 'px';
  }

  // ---
  _fillBottomHeight() {
    const fillStop = this.getAttribute('fill-stop');
    if (fillStop) {
      let stopEl = null;
      try {
        stopEl = document.querySelector(fillStop);
      } catch (_) {
        stopEl = null;
      }
      if (!stopEl) return 0;
      const top = this._elementTop(stopEl);
      return top > 0 ? Math.max(0, window.innerHeight - top) : 0;
    }

    const reserve = this.getAttribute('fill-reserve') || '';
    const fillReserve = parseInt(reserve, 10);
    if (fillReserve > 0) {
      const target = this._implicitFillTargetElement();
      return target ? Math.max(fillReserve, this._elementHeight(target)) : fillReserve;
    }

    let reserveEl = null;
    try {
      reserveEl = reserve ? document.querySelector(reserve) : null;
    } catch (_) {
      reserveEl = null;
    }
    return reserveEl ? this._elementHeight(reserveEl) : 0;
  }

  // ---
  _fillTargetElement() {
    const selector = this.getAttribute('fill-stop') || this.getAttribute('fill-reserve') || '';
    if (!selector) return null;
    if (parseInt(selector, 10) > 0) return this._implicitFillTargetElement();
    try {
      return document.querySelector(selector);
    } catch (_) {
      return null;
    }
  }

  // ---
  _implicitFillTargetElement() {
    const next = this.nextElementSibling;
    return next && next.tagName === 'CLOSURE-ROW-VIEWER' ? next : null;
  }

  // ---
  _elementTop(el) {
    const rect = el.getBoundingClientRect();
    if (rect.width || rect.height) return rect.top;
    const first = this._firstRenderedChild(el);
    return first ? first.getBoundingClientRect().top : rect.top;
  }

  // ---
  _elementHeight(el) {
    const rect = el.getBoundingClientRect();
    if (rect.height) return Math.ceil(rect.height);
    const first = this._firstRenderedChild(el);
    const last = this._lastRenderedChild(el);
    if (!first || !last) return 0;
    return Math.ceil(last.getBoundingClientRect().bottom - first.getBoundingClientRect().top);
  }

  // ---
  _firstRenderedChild(el) {
    return this._renderedChildren(el)[0] || null;
  }

  // ---
  _lastRenderedChild(el) {
    const rendered = this._renderedChildren(el);
    return rendered[rendered.length - 1] || null;
  }

  // ---
  _renderedChildren(el) {
    return Array.from(el.children).filter(child => {
      const rect = child.getBoundingClientRect();
      return rect.width || rect.height;
    });
  }

  // ---
  _setupEvents() {
    // Click on body
    this._tbody.addEventListener('click', e => {
      const row = e.target.closest('tr');
      if (!row) return;
      const rows = Array.from(this._tbody.querySelectorAll('tr'));
      this._selectRow(rows.indexOf(row));
    });

    // Close action menus on click outside (kept as a named handler so
    // disconnectedCallback can remove it)
    this._onDocClick = () => {
      document.querySelectorAll('.dg-action-panel-open').forEach(p => { p.style.display = 'none'; p.classList.remove('dg-action-panel-open'); });
    };
    document.addEventListener('click', this._onDocClick);

    // Mouseover
    this._tbody.addEventListener('mouseover', () => {
      this._bodyTable.classList.remove('kb-nav');
    });

    // Wheel
    this._bodyWrap.addEventListener('wheel', e => {
      if (!this._pagination) return;
      // Horizontal scroll (deltaY 0) must keep scrolling, not paginate
      if (e.deltaY === 0) return;
      e.preventDefault();
      if (e.deltaY > 0) this._goPage(+1);
      else this._goPage(-1);
    }, { passive: false });

    // Keyboard
    this._onDocKeydown = e => {
      if (!this.contains(document.activeElement) && document.activeElement !== this) return;
      const rows = this._tbody.querySelectorAll('tr');
      if (!rows.length) return;
      const lastIdx = rows.length - 1;

      // Check grid-key bindings first
      for (const gk of this._keys) {
        for (const keyDef of gk.keys) {
          if (this._matchKey(e, keyDef)) {
            e.preventDefault();
            if (gk.action === 'deselect') {
              rows.forEach(r => r.classList.remove('focused'));
              this._selectedIdx = -1;
              this.dispatchEvent(new CustomEvent('row-select', { detail: { row: null, index: -1 }, bubbles: true }));
              this.dispatchEvent(new CustomEvent('row-focus', { detail: { row: null, index: -1 }, bubbles: true }));
              return;
            }
            this._executeAction(gk);
            return;
          }
        }
      }

      this._bodyTable.classList.add('kb-nav');
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          if (!this._moveFocus(this._selectedIdx + 1) && this._pagination) this._goPage(+1);
          break;
        case 'ArrowUp':
          e.preventDefault();
          if (!this._moveFocus(this._selectedIdx - 1) && this._pagination) this._goPage(-1);
          break;
        case 'PageDown':
          e.preventDefault();
          if (this._selectedIdx === lastIdx && this._pagination) this._goPage(+1);
          else this._moveFocus(lastIdx);
          break;
        case 'PageUp':
          e.preventDefault();
          if (this._selectedIdx === 0 && this._pagination) this._goPage(-1);
          else this._moveFocus(0);
          break;
        case 'Home':
          if (e.ctrlKey) { e.preventDefault(); this._goPage('first'); }
          break;
        case 'End':
          if (e.ctrlKey) { e.preventDefault(); this._goPage('last'); }
          break;
      }
    };
    document.addEventListener('keydown', this._onDocKeydown);

    // Filter change
    this.addEventListener('filter-change', e => {
      this._filters = { ...(e.detail || {}), ...(this._detailFilters || {}) };
      this._applyFilterMode();
    });

    // Refresh whole grid — declarative trigger (e.g. a `dispatch-event` in a
    // response, or `<signal-event name="refresh" target-id="...">`). The
    // `e.target !== this` guard ignores same-name events bubbling from a child.
    this.addEventListener('refresh', e => {
      if (e.target !== this) return;
      this.refresh(e.detail || {}); // detail.goto scrolls back to a row
    });

    // Refresh just the selected row in place from server-provided data —
    // no full reload, keeps scroll/selection. Row comes as `data-row` JSON,
    // or as the remaining `data-*` fields merged onto the current row.
    this.addEventListener('refresh-row', e => {
      if (e.target !== this) return;
      const d = e.detail || {};
      let row = d;
      if (d.row) { try { row = JSON.parse(d.row); } catch (err) { return; } }
      this.updateRow(row);
    });

    // Header click
    if (this._headTable) {
      this._headTable.addEventListener('click', e => {
        // Already handled per-th in _build
      });
    }

    // Double click
    this._tbody.addEventListener('dblclick', e => {
      const row = e.target.closest('tr');
      if (!row) return;
      const rows = Array.from(this._tbody.querySelectorAll('tr'));
      this._selectRow(rows.indexOf(row));
      for (const gk of this._keys) {
        if (gk.keys.some(k => k.includes('dblclick'))) {
          this._executeAction(gk);
          return;
        }
      }
    });
  }

  // ---
  _executeAction(actionDef) {
    const row = this.selectedRow;
    const mode = actionDef.mode || 'navigate';
    const url = actionDef.url || '';
    const dataAttrs = actionDef.dataAttrs || {};
    const bindFields = actionDef.bind || [];
    const targetId = actionDef.targetId || '';

    // Build params: static data-* + bound row fields
    const params = { ...dataAttrs };
    if (row) {
      bindFields.forEach(f => { if (row[f] !== undefined) params[f] = row[f]; });
    }

    switch (mode) {
      case 'navigate': {
        const form = document.createElement('form');
        form.method = 'POST';
        form.style.display = 'none';
        if (url) form.action = url;
        for (const [k, v] of Object.entries(params)) {
          const input = document.createElement('input');
          input.type = 'hidden'; input.name = k; input.value = v;
          form.appendChild(input);
        }
        document.body.appendChild(form);
        form.submit();
        form.remove(); // drop the node post-submit so it can't orphan in
                       // <body> on a download / new-tab action
        break;
      }
      case 'dialog': {
        fetch(url, {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams(params).toString(),
        })
        .then(r => r.text())
        .then(html => {
          var lb = document.createElement('closure-lightbox');
          document.body.appendChild(lb);
          if (lb.showResponse(html)) {
            lb.addEventListener('lb-close', () => lb.remove(), { once: true });
          } else {
            lb.remove(); // a listener cancelled lb-response → never opened; don't orphan the node
          }
        })
        .catch(err => console.error('dialog fetch error:', err));
        break;
      }
      case 'refresh': {
        fetch(url, {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams(params).toString(),
        })
        .then(() => this.refresh())
        .catch(err => console.error('refresh fetch error:', err));
        break;
      }
      case 'event': {
        const dest = targetId ? document.getElementById(targetId) : this;
        const eventName = actionDef.eventName || 'row-action';
        if (dest) {
          dest.dispatchEvent(new CustomEvent(eventName, {
            detail: { action: dataAttrs.action || '', row: row || {}, params },
            bubbles: true,
          }));
        }
        break;
      }
    }
  }

  // ---
  _actionDefFromElement(el) {
    return {
      mode:      el.getAttribute('mode') || 'navigate',
      url:       el.getAttribute('url') || '',
      bind:      (el.getAttribute('bind') || '').split(',').map(s => s.trim()).filter(Boolean),
      targetId:  el.getAttribute('target-id') || '',
      eventName: el.getAttribute('event') || 'row-action',
      dataAttrs: this._readDataAttrs(el),
    };
  }

  // ---
  _matchKey(e, keyDef) {
    const parts = keyDef.split('+').map(p => p.trim().toLowerCase());
    let needCtrl = false, needShift = false, needAlt = false, mainKey = '';
    parts.forEach(p => {
      if (p === 'ctrl') needCtrl = true;
      else if (p === 'shift') needShift = true;
      else if (p === 'alt') needAlt = true;
      else mainKey = p;
    });
    if (needCtrl !== e.ctrlKey) return false;
    if (needShift !== e.shiftKey) return false;
    if (needAlt !== e.altKey) return false;
    const eKey = e.key === ' ' ? 'space' : e.key.toLowerCase();
    return eKey === mainKey;
  }

  // ---
  get selectedRow() {
    // Pre-init (e.g. probed by a row viewer before this grid's deferred
    // init ran): no rows yet, no selection
    if (!this._rows || this._selectedIdx < 0) return null;
    if (this._isDynamic) return this._rows[this._selectedIdx] || null;
    const ps = this.pageSize;
    const absIdx = (this._currentPage - 1) * ps + this._selectedIdx;
    return this._rows[absIdx] || null;
  }

  // ---
  // Re-render the currently selected row in place from new data (merged onto
  // the existing row) — for edit-in-dialog flows where the server returns the
  // updated row. Updates one <tr> without a full reload, preserving scroll and
  // selection. No-op when nothing is selected; for broader changes use
  // refresh(). Off-page / by-key updates are out of scope (use refresh()).
  updateRow(data) {
    if (this._selectedIdx < 0 || !data || typeof data !== 'object') return;
    const i = this._selectedIdx; // page-relative index of the visible row
    const absIdx = this._isDynamic ? i : (this._currentPage - 1) * this.pageSize + i;
    if (!this._rows || !this._rows[absIdx]) return;
    const merged = { ...this._rows[absIdx], ...data };
    this._rows[absIdx] = merged;
    const oldTr = this._tbody.querySelectorAll('tr')[i];
    if (!oldTr) return;
    const wasFocused = oldTr.classList.contains('focused');
    const tr = this._createRow(merged, i);
    tr.addEventListener('click', () => this._selectRow(i));
    if (wasFocused) tr.classList.add('focused');
    oldTr.replaceWith(tr);
    this._syncColWidths(); // re-fit columns (auto-fit only; no-op otherwise)
  }

  // ---
  refresh(opts) {
    this._currentPage = 1;
    this._selectedIdx = 0;
    if (opts && opts.goto) this._gotoId = opts.goto;
    if (this._isDynamic) {
      this._fetchDynamic();
    } else if (this._isStaticByRequest) {
      this._fetchStatic();
    } else {
      this._renderPage();
      this._syncColWidths();
    }
  }
}

customElements.define('closure-data-grid', ClosureDataGrid);


class ClosureRowViewer extends HTMLElement {
  static _styleId = 'closure-row-viewer-default-style';
  static _style = [
    'closure-row-viewer { display: contents; visibility: hidden; }',
    'closure-row-viewer .rv-content { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }',
    'closure-row-viewer .rv-hidden { display: none; }',
  ].join('\n');

  connectedCallback() {
    if (this._initialized) {
      // Reconnect: re-attach the grid listeners removed on disconnect
      // and re-sync with whatever was selected while we were detached
      this._attachGridListeners();
      if (this._grid) this._setRow(this._grid.selectedRow || null);
      return;
    }
    this._initialized = true;
    if (!document.getElementById(ClosureRowViewer._styleId)) {
      const s = document.createElement('style');
      s.id = ClosureRowViewer._styleId;
      s.textContent = ClosureRowViewer._style;
      document.head.appendChild(s);
    }
    this._row = null;
    this._originalChildren = null;
    this._pendingUpdate = false;
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this._init(), { once: true });
    } else {
      this._init();
    }
  }

  disconnectedCallback() {
    if (this._grid && this._onRowSelect) {
      this._grid.removeEventListener('row-select', this._onRowSelect);
      this._grid.removeEventListener('row-focus', this._onRowFocus);
    }
  }

  _attachGridListeners() {
    if (!this._grid || !this._onRowSelect) return;
    this._grid.addEventListener('row-select', this._onRowSelect);
    this._grid.addEventListener('row-focus', this._onRowFocus);
  }

  _init() {
    // Save original children as template
    this._template = this.innerHTML;
    this._bindTarget();
    this._scheduleUpdate();
  }

  _bindTarget() {
    const targetId = this.getAttribute('target');
    if (!targetId) return;
    const grid = document.getElementById(targetId);
    if (!grid) return;
    this._grid = grid;

    this._onRowSelect = e => this._setRow(e.detail.row || null);
    this._onRowFocus = e => this._setRow(e.detail.row || null);
    this._attachGridListeners();

    // Sync with current selection if grid already has one
    if (grid.selectedRow) {
      this._setRow(grid.selectedRow);
    }
  }

  _update() {
    this.style.visibility = 'visible';
    this.querySelectorAll('[bind]').forEach(el => {
      el.style.visibility = this._row ? 'visible' : 'hidden';
    });
    this.querySelectorAll('[bind-show]').forEach(el => {
      if (!this._row) this._setConditionalVisibility(el, false);
    });
    this.querySelectorAll('[bind-hide]').forEach(el => {
      if (!this._row) this._setConditionalVisibility(el, false);
    });
    if (!this._row) return;

    // Conditional visibility: bind-show / bind-hide with "field" or "field=value".
    this.querySelectorAll('[bind-show]').forEach(el => {
      this._setConditionalVisibility(el, this._matchesBindCondition(el.getAttribute('bind-show') || ''));
    });
    this.querySelectorAll('[bind-hide]').forEach(el => {
      this._setConditionalVisibility(el, !this._matchesBindCondition(el.getAttribute('bind-hide') || ''));
    });

    // Update spans/labels with bind (skip closure-btn elements — they use bind for data attributes only)
    this.querySelectorAll('[bind]').forEach(el => {
      const tag = el.tagName.toLowerCase();
      if (tag === 'closure-btn' || tag === 'closure-btn-item') return;
      const field = el.getAttribute('bind');
      if (!field) return;

      // Single field → display value
      if (!field.includes(',')) {
        const val = this._row[field] !== undefined ? String(this._row[field]) : '';
        const mapId = el.getAttribute('map-data-id');
        if (mapId) {
          const map = document.getElementById(mapId);
          const resolved = map ? map.resolve(val) : null;
          if (resolved) {
            const show = el.getAttribute('map-show') || '';
            let display = '';
            if (show === 'icon') display = resolved.icon || '';
            else if (show === 'label') display = resolved.label || '';
            else {
              if (resolved.icon) display += resolved.icon;
              if (resolved.label) display += (display ? ' ' : '') + resolved.label;
            }
            el.textContent = display || val;
            if (resolved.color) el.style.color = resolved.color;
            else el.style.color = '';
          } else {
            el.textContent = val;
            el.style.color = '';
          }
        } else if (this._usesValueProperty(el)) {
          el.value = val;
        } else {
          const crlf = el.getAttribute('bind-crlf');
          if (crlf && val.includes('\n')) {
            // val is row data — escape it so only the author-provided
            // crlf separator is interpreted as HTML
            const esc = val.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            el.innerHTML = esc.replace(/\r?\n/g, crlf);
          } else {
            el.textContent = val;
          }
        }
      }
    });

    // Update closure-btn / closure-btn-item data attributes from bind
    this.querySelectorAll('closure-btn[bind], closure-btn-item[bind]').forEach(el => {
      const fields = el.getAttribute('bind').split(',').map(s => s.trim()).filter(Boolean);
      fields.forEach(f => {
        const val = this._row[f] !== undefined ? String(this._row[f]) : '';
        el.setAttribute('data-' + f, val);
      });
    });
  }

  // ---
  _setRow(row) {
    if (row === this._row) return;
    this._row = row;
    this._scheduleUpdate();
  }

  // ---
  _scheduleUpdate() {
    if (this._pendingUpdate) return;
    this._pendingUpdate = true;
    requestAnimationFrame(() => {
      this._pendingUpdate = false;
      this._update();
    });
  }

  // ---
  _setConditionalVisibility(el, isVisible) {
    const keepSpace = this.hasAttribute('keep-space') || el.hasAttribute('bind-keep-space');
    if (isVisible) {
      el.style.display = '';
      el.style.visibility = 'visible';
    } else if (keepSpace) {
      el.style.display = '';
      el.style.visibility = 'hidden';
    } else {
      el.style.display = 'none';
      el.style.visibility = '';
    }
  }

  // ---
  _matchesBindCondition(cond) {
    const eq = cond.indexOf('=');
    if (eq < 0) {
      // Same truthiness as the grid: row values are strings, so "0" and
      // "false" must count as falsy
      const actual = String(this._row[cond] !== undefined ? this._row[cond] : '').trim().toLowerCase();
      return actual !== '' && actual !== '0' && actual !== 'false';
    }
    const field = cond.substring(0, eq);
    const expected = cond.substring(eq + 1);
    const actual = String(this._row[field] !== undefined ? this._row[field] : '');
    return actual === expected;
  }

  // ---
  _usesValueProperty(el) {
    const tag = el.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || ('value' in el && tag.includes('-'));
  }

  // ---
  get row() { return this._row; }
}

customElements.define('closure-row-viewer', ClosureRowViewer);


class CbtItem extends HTMLElement {}
customElements.define('cbt-item', CbtItem);


class CheckboxTree extends HTMLElement {
  static formAssociated = true;

  static _styleId = 'closure-checkbox-tree-default-style';
  static _style = [
    'closure-checkbox-tree { display: block; }',
    'cbt-item { display: none; }',
  ].join('\n');

  static get observedAttributes() { return ['readonly']; }

  constructor() {
    super();
    this._internals = this.attachInternals();
    this.attachShadow({ mode: 'open' });
  }

  // ---
  attributeChangedCallback(name) {
    if (name === 'readonly' && this.isConnected) {
      this._applyReadonly();
    }
  }

  // ---
  _applyReadonly() {
    var ro = this.hasAttribute('readonly');
    this.shadowRoot.querySelectorAll('input[type="checkbox"]').forEach(function(cb) {
      cb.disabled = ro;
    });
    this.shadowRoot.querySelectorAll('closure-btn-item').forEach(function(btn) {
      if (ro) btn.setAttribute('disabled', '');
      else btn.removeAttribute('disabled');
    });
  }

  // ---
  connectedCallback() {
    if (this._initialized) return;
    this._initialized = true;
    if (!document.getElementById(CheckboxTree._styleId)) {
      var s = document.createElement('style');
      s.id = CheckboxTree._styleId;
      s.textContent = CheckboxTree._style;
      document.head.appendChild(s);
    }
    var self = this;
    var init = function() { self._build(); };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
      requestAnimationFrame(init);
    }
  }

  // ---
  _build() {
    this._buildTreeData();
    if (this.hasAttribute('expanded')) {
      this._renderExpanded();
    } else {
      this._renderCollapsed();
    }

    // Load from data island
    this._loadFromSrc();
    this._updateFormValue();

    // A readonly attribute parsed before the build ran on an empty
    // shadow root — re-apply it now that the checkboxes exist
    if (this.hasAttribute('readonly')) this._applyReadonly();
  }

  // ---
  _buildTreeData() {
    this._treeRoot = document.createElement('ul');
    this._treeRoot.className = 'cbt-root';
    var items = this.querySelectorAll(':scope > cbt-item');
    var self = this;
    // Paths include the tree's name (`/<treeName>/<item>/…`) — that's
    // the prefix _loadFromSrc and the group's flat setValues filter by
    var treeName = this.getAttribute('name') || '';
    var base = treeName ? '/' + treeName : '';
    items.forEach(function(item) {
      self._treeRoot.appendChild(self._buildNode(item, base));
    });

    // Listen for checkbox changes on the tree
    this._treeRoot.addEventListener('change', function(e) {
      if (e.target.type !== 'checkbox') return;
      self._cascadeDown(e.target);
      self._cascadeUp(e.target);
      self._updateFormValue();
      if (!self.hasAttribute('expanded')) self._updateCollapsedState();
      self.dispatchEvent(new Event('change', { bubbles: true }));
    });
  }

  // ---
  _renderExpanded() {
    var shadow = this.shadowRoot;
    shadow.innerHTML = '';

    var style = document.createElement('style');
    style.textContent = [
      ':host { display: block; }',
      'ul { list-style: none; padding-left: 20px; margin: 0; }',
      '.cbt-root { padding-left: 0; }',
      'li { margin: 4px 0; }',
      'label { cursor: pointer; user-select: none; }',
    ].join('\n');
    shadow.appendChild(style);
    shadow.appendChild(this._treeRoot);
  }

  // ---
  _renderCollapsed() {
    var shadow = this.shadowRoot;
    shadow.innerHTML = '';
    var self = this;

    var lblAll = this.getAttribute('label-all') || 'All';
    var lblNone = this.getAttribute('label-none') || 'None';
    var lblCustom = this.getAttribute('label-custom') || 'Custom';
    var rootLabel = this.getAttribute('label') || this.getAttribute('name') || '';

    var style = document.createElement('style');
    style.textContent = [
      ':host { display: block; }',
      '.cbt-collapsed { display: inline-flex; align-items: center; gap: 0; padding: 2px 0; }',
      '.cbt-label { font-weight: 600; padding-right: 6px; font-size: 13px; }',
      '.cbt-bar { display: inline-flex; border: 1px solid var(--border, #ccc); border-radius: 3px; overflow: hidden; gap: 0; }',
      '.cbt-bar closure-btn-item { display: block; border-right: 1px solid var(--border, #ccc); --btn-item-padding: 2px 8px; --btn-item-font-size: 11px; --btn-item-gap: 4px; --primary-light: #d0d0d0; margin: 0; }',
      '.cbt-bar closure-btn-item:last-child { border-right: none; }',
      'closure-btn-item[active] { background: #4a90d9; --text: #fff; --primary-light: #3a7bc8; }',
      'closure-btn-item:not([active]) { background: #f5f5f5; }',
      // Hidden tree for data
      'ul { list-style: none; padding-left: 20px; margin: 0; display: none; }',
      '.cbt-root { padding-left: 0; }',
      'li { margin: 4px 0; }',
      'label { cursor: pointer; user-select: none; }',
    ].join('\n');
    shadow.appendChild(style);

    // Collapsed bar
    var bar = document.createElement('div');
    bar.className = 'cbt-collapsed';

    var labelSpan = document.createElement('span');
    labelSpan.className = 'cbt-label';
    labelSpan.textContent = rootLabel;
    bar.appendChild(labelSpan);

    this._btnAll = document.createElement('closure-btn-item');
    this._btnAll.setAttribute('data-action', 'all');
    this._btnAll.textContent = lblAll;

    this._btnNone = document.createElement('closure-btn-item');
    this._btnNone.setAttribute('data-action', 'none');
    this._btnNone.textContent = lblNone;

    this._btnCustom = document.createElement('closure-btn-item');
    this._btnCustom.setAttribute('data-action', 'custom');
    this._btnCustom.textContent = lblCustom;

    var btnBar = document.createElement('div');
    btnBar.className = 'cbt-bar';
    btnBar.appendChild(this._btnAll);
    btnBar.appendChild(this._btnNone);
    btnBar.appendChild(this._btnCustom);
    bar.appendChild(btnBar);

    btnBar.addEventListener('btn-action', function(e) {
      var action = e.target.getAttribute('data-action');
      if (action === 'all') {
        self.checkAll();
        self._updateCollapsedState();
        self.dispatchEvent(new Event('change', { bubbles: true }));
      } else if (action === 'none') {
        self.uncheckAll();
        self._updateCollapsedState();
        self.dispatchEvent(new Event('change', { bubbles: true }));
      } else if (action === 'custom') {
        self._openCustomDialog();
      }
    });

    shadow.appendChild(bar);

    // Hidden tree (keeps checkbox state)
    shadow.appendChild(this._treeRoot);

    this._updateCollapsedState();
  }

  // ---
  _updateCollapsedState() {
    if (this.hasAttribute('expanded')) return;
    var vt = this._computeRootVt();
    if (this._btnAll) { vt === 1 ? this._btnAll.setAttribute('active', '') : this._btnAll.removeAttribute('active'); }
    if (this._btnNone) { vt === 0 ? this._btnNone.setAttribute('active', '') : this._btnNone.removeAttribute('active'); }
    if (this._btnCustom) { vt === 2 ? this._btnCustom.setAttribute('active', '') : this._btnCustom.removeAttribute('active'); }
  }

  // ---
  _openCustomDialog() {
    var self = this;

    // Create lightbox with tree clone
    var lb = document.createElement('closure-lightbox');
    var title = this.getAttribute('label') || this.getAttribute('name') || 'Custom';
    lb.setAttribute('title', title);
    document.body.appendChild(lb);

    // Clone tree for editing
    var treeClone = this._treeRoot.cloneNode(true);
    treeClone.className = 'cbt-dlg-tree';
    // Sync checked state to clone
    var origCbs = this._treeRoot.querySelectorAll('input[type="checkbox"]');
    var cloneCbs = treeClone.querySelectorAll('input[type="checkbox"]');
    for (var i = 0; i < origCbs.length; i++) {
      cloneCbs[i].checked = origCbs[i].checked;
      cloneCbs[i].indeterminate = origCbs[i].indeterminate;
    }

    // Cascade in clone
    treeClone.addEventListener('change', function(e) {
      if (e.target.type !== 'checkbox') return;
      var cb = e.target;
      // cascade down
      var li = cb.closest('li');
      if (li) {
        var nested = li.querySelector('ul');
        if (nested) {
          nested.querySelectorAll('input[type="checkbox"]').forEach(function(c) {
            c.checked = cb.checked;
            c.indeterminate = false;
          });
        }
      }
      // cascade up
      self._cascadeUpIn(cb, treeClone);
    });

    // Wrap in div for styling
    var wrapper = document.createElement('div');
    var wrapStyle = document.createElement('style');
    wrapStyle.textContent = [
      'ul { list-style: none; padding-left: 20px; margin: 0; }',
      '.cbt-dlg-tree { padding-left: 0; }',
      'li { margin: 4px 0; }',
      'label { cursor: pointer; user-select: none; }',
    ].join('\n');
    wrapper.appendChild(wrapStyle);
    wrapper.appendChild(treeClone);

    lb.addEventListener('lb-close', function(e) {
      if (e.detail.action === 'ok') {
        var cloneCbs = treeClone.querySelectorAll('input[type="checkbox"]');
        var origCbs = self._treeRoot.querySelectorAll('input[type="checkbox"]');
        for (var i = 0; i < origCbs.length; i++) {
          origCbs[i].checked = cloneCbs[i].checked;
          origCbs[i].indeterminate = cloneCbs[i].indeterminate;
        }
        self._updateFormValue();
        self._updateCollapsedState();
        self.dispatchEvent(new Event('change', { bubbles: true }));
      }
      lb.remove();
    }, { once: true });

    // Defer open — lightbox needs a frame to initialize its dialog
    requestAnimationFrame(function() {
      requestAnimationFrame(function() {
        lb.open({
          title: title,
          content: '',
          buttons: [
            { label: 'Cancel', action: 'cancel' },
            { label: 'OK', action: 'ok', primary: true },
          ],
        });
        lb._body.innerHTML = '';
        lb._body.appendChild(wrapper);
      });
    });
  }

  // ---
  _cascadeUpIn(cb, container) {
    var li = cb.closest('li');
    if (!li) return;
    var parentUl = li.parentElement;
    if (!parentUl || parentUl.tagName !== 'UL') return;
    var parentLi = parentUl.parentElement;
    if (!parentLi || parentLi.tagName !== 'LI') return;
    if (!container.contains(parentLi)) return;
    var parentCb = parentLi.querySelector(':scope > label input[type="checkbox"]');
    if (!parentCb) return;

    var siblings = parentUl.querySelectorAll(':scope > li > label input[type="checkbox"]');
    var checked = 0;
    var hasIndeterminate = false;
    for (var i = 0; i < siblings.length; i++) {
      if (siblings[i].checked) checked++;
      if (siblings[i].indeterminate) hasIndeterminate = true;
    }

    if (hasIndeterminate || (checked > 0 && checked < siblings.length)) {
      parentCb.checked = false;
      parentCb.indeterminate = true;
    } else if (checked === siblings.length) {
      parentCb.checked = true;
      parentCb.indeterminate = false;
    } else {
      parentCb.checked = false;
      parentCb.indeterminate = false;
    }

    this._cascadeUpIn(parentCb, container);
  }

  // ---
  _buildNode(cbtItem, parentPath) {
    var name = cbtItem.getAttribute('name') || '';
    var label = cbtItem.getAttribute('label') || name;
    var tip = cbtItem.getAttribute('tip') || '';
    var path = parentPath + '/' + name;
    var children = cbtItem.querySelectorAll(':scope > cbt-item');
    var hasChildren = children.length > 0;

    var li = document.createElement('li');
    var lbl = document.createElement('label');
    if (tip) lbl.title = tip;

    var cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.dataset.name = name;
    cb.dataset.path = path;
    cb.dataset.leaf = hasChildren ? '0' : '1';

    lbl.appendChild(cb);
    lbl.appendChild(document.createTextNode(' ' + label));
    li.appendChild(lbl);

    if (hasChildren) {
      var ul = document.createElement('ul');
      var self = this;
      children.forEach(function(child) {
        ul.appendChild(self._buildNode(child, path));
      });
      li.appendChild(ul);
    }

    return li;
  }

  // ---
  _cascadeDown(cb) {
    var li = cb.closest('li');
    if (!li) return;
    var nested = li.querySelector('ul');
    if (!nested) return;
    nested.querySelectorAll('input[type="checkbox"]').forEach(function(child) {
      child.checked = cb.checked;
      child.indeterminate = false;
    });
  }

  // ---
  _cascadeUp(cb) {
    var li = cb.closest('li');
    if (!li) return;
    var parentUl = li.parentElement;
    if (!parentUl || parentUl.tagName !== 'UL') return;
    var parentLi = parentUl.parentElement;
    if (!parentLi || parentLi.tagName !== 'LI') return;
    var parentCb = parentLi.querySelector(':scope > label input[type="checkbox"]');
    if (!parentCb) return;

    var siblings = parentUl.querySelectorAll(':scope > li > label input[type="checkbox"]');
    var checked = 0;
    var hasIndeterminate = false;
    for (var i = 0; i < siblings.length; i++) {
      if (siblings[i].checked) checked++;
      if (siblings[i].indeterminate) hasIndeterminate = true;
    }

    if (hasIndeterminate || (checked > 0 && checked < siblings.length)) {
      parentCb.checked = false;
      parentCb.indeterminate = true;
    } else if (checked === siblings.length) {
      parentCb.checked = true;
      parentCb.indeterminate = false;
    } else {
      parentCb.checked = false;
      parentCb.indeterminate = false;
    }

    this._cascadeUp(parentCb);
  }

  // ---
  _updateIndeterminate() {
    var lists = this._treeRoot.querySelectorAll('ul');
    for (var i = lists.length - 1; i >= 0; i--) {
      var parentLi = lists[i].parentElement;
      if (!parentLi || parentLi.tagName !== 'LI') continue;
      var parentCb = parentLi.querySelector(':scope > label input[type="checkbox"]');
      if (!parentCb) continue;
      var children = lists[i].querySelectorAll(':scope > li > label input[type="checkbox"]');
      var checked = 0;
      var hasIndeterminate = false;
      for (var j = 0; j < children.length; j++) {
        if (children[j].checked) checked++;
        if (children[j].indeterminate) hasIndeterminate = true;
      }
      if (hasIndeterminate || (checked > 0 && checked < children.length)) {
        parentCb.checked = false;
        parentCb.indeterminate = true;
      } else if (checked === children.length) {
        parentCb.checked = true;
        parentCb.indeterminate = false;
      } else {
        parentCb.checked = false;
        parentCb.indeterminate = false;
      }
    }
  }

  // ---
  _computeVt(cb) {
    var li = cb.closest('li');
    var nested = li ? li.querySelector('ul') : null;
    if (!nested) return null;
    var children = nested.querySelectorAll(':scope > li > label input[type="checkbox"]');
    var checked = 0;
    var hasIndeterminate = false;
    for (var i = 0; i < children.length; i++) {
      if (children[i].checked) checked++;
      if (children[i].indeterminate) hasIndeterminate = true;
    }
    if (checked === 0 && !hasIndeterminate) return 0;
    if (checked === children.length && !hasIndeterminate) return 1;
    return 2;
  }

  // ---
  _computeRootVt() {
    var rootCbs = this._treeRoot.querySelectorAll('.cbt-root > li > label input[type="checkbox"]');
    var checked = 0;
    var hasIndeterminate = false;
    for (var i = 0; i < rootCbs.length; i++) {
      if (rootCbs[i].checked) checked++;
      if (rootCbs[i].indeterminate) hasIndeterminate = true;
    }
    if (rootCbs.length === 0) return 0;
    if (checked === 0 && !hasIndeterminate) return 0;
    if (checked === rootCbs.length && !hasIndeterminate) return 1;
    return 2;
  }

  // ---
  _isSendOnlyActive() {
    if (this.hasAttribute('send-only-active')) return true;
    var group = this.closest('closure-checkbox-group');
    return group && group.hasAttribute('send-only-active');
  }

  // ---
  getValues() {
    var result = [];
    if (!this._treeRoot) return result;
    var self = this;
    var onlyActive = this._isSendOnlyActive();

    this._treeRoot.querySelectorAll('input[type="checkbox"]').forEach(function(cb) {
      var path = cb.dataset.path;
      var isLeaf = cb.dataset.leaf === '1';
      if (isLeaf) {
        var v = cb.checked ? 1 : 0;
        if (!onlyActive || v) result.push([path, v, null]);
      } else {
        var vt = self._computeVt(cb);
        if (!onlyActive || vt) result.push([path, null, vt]);
      }
    });

    return result;
  }

  // ---
  setValues(arr) {
    if (!arr) return;

    // Build lookup by path
    var lookup = {};
    for (var i = 0; i < arr.length; i++) {
      lookup[arr[i][0]] = arr[i];
    }

    // Reset all
    this._treeRoot.querySelectorAll('input[type="checkbox"]').forEach(function(cb) {
      cb.checked = false;
      cb.indeterminate = false;
    });

    // Parents with vt=1: check all descendants
    this._treeRoot.querySelectorAll('input[type="checkbox"]').forEach(function(cb) {
      var entry = lookup[cb.dataset.path];
      if (!entry) return;
      if (cb.dataset.leaf === '0' && entry[2] === 1) {
        cb.checked = true;
        cb.indeterminate = false;
        var li = cb.closest('li');
        if (li) {
          li.querySelectorAll('input[type="checkbox"]').forEach(function(c) {
            c.checked = true;
            c.indeterminate = false;
          });
        }
      }
    });

    // Leaf values
    this._treeRoot.querySelectorAll('input[type="checkbox"]').forEach(function(cb) {
      if (cb.dataset.leaf !== '1') return;
      var entry = lookup[cb.dataset.path];
      if (entry) {
        cb.checked = !!entry[1];
        cb.indeterminate = false;
      }
    });

    // Fix indeterminate states bottom-up
    this._updateIndeterminate();
    if (!this.hasAttribute('expanded')) this._updateCollapsedState();
    this._updateFormValue();
  }

  // ---
  _loadFromSrc() {
    var srcId = this.getAttribute('src');
    if (!srcId) {
      var group = this.closest('closure-checkbox-group');
      if (group) srcId = group.getAttribute('src');
    }
    if (!srcId) return;
    var el = document.getElementById(srcId);
    if (!el) return;
    try {
      var data = JSON.parse(el.textContent);
      if (!Array.isArray(data)) return;
      var prefix = '/' + (this.getAttribute('name') || '') + '/';
      var subset = data.filter(function(entry) {
        return entry[0].indexOf(prefix) === 0;
      });
      if (subset.length > 0) this.setValues(subset);
    } catch (e) {}
  }

  // ---
  _buildSummaryUL(parentUl) {
    var html = '';
    var children = parentUl.querySelectorAll(':scope > li');
    for (var i = 0; i < children.length; i++) {
      var li = children[i];
      var cb = li.querySelector(':scope > label input[type="checkbox"]');
      if (!cb) continue;
      var label = cb.dataset.name;
      // Use the label text from the <label> element
      var lblEl = cb.parentElement;
      if (lblEl) label = lblEl.textContent.trim();
      // label is data-derived text and ends up in innerHTML — escape it
      label = String(label || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      var nested = li.querySelector(':scope > ul');
      if (nested) {
        var sub = this._buildSummaryUL(nested);
        if (cb.checked || cb.indeterminate) {
          html += '<li><strong>' + label + '</strong>' + sub + '</li>';
        }
      } else {
        if (cb.checked) {
          html += '<li>' + label + '</li>';
        }
      }
    }
    return html ? '<ul>' + html + '</ul>' : '';
  }

  // ---
  getSummaryHTML() {
    if (!this._treeRoot) return '';
    return this._buildSummaryUL(this._treeRoot);
  }

  // ---
  _notifySummary() {
    var source = this.closest('closure-checkbox-group') || this;
    var sid = source.getAttribute('summary');
    if (sid) {
      var t = document.getElementById(sid);
      if (t && typeof t.refresh === 'function') t.refresh(source.getSummaryHTML());
    }
  }

  // ---
  _updateFormValue() {
    var group = this.closest('closure-checkbox-group');
    if (group) { group._updateFormValue(); return; }
    this._internals.setFormValue(JSON.stringify(this.getValues()));
    this._notifySummary();
  }

  // ---
  get value() {
    return JSON.stringify(this.getValues());
  }

  // Setter so a server `set-value` (el.value = "[[path,v,vt],…]") actually
  // restores the tree instead of silently no-opping on a getter-only property.
  set value(v) {
    try { this.setValues(typeof v === 'string' ? JSON.parse(v) : v); } catch (e) {}
  }

  // ---
  checkAll() {
    this._treeRoot.querySelectorAll('input[type="checkbox"]').forEach(function(cb) {
      cb.checked = true;
      cb.indeterminate = false;
    });
    if (!this.hasAttribute('expanded')) this._updateCollapsedState();
    this._updateFormValue();
  }

  // ---
  uncheckAll() {
    this._treeRoot.querySelectorAll('input[type="checkbox"]').forEach(function(cb) {
      cb.checked = false;
      cb.indeterminate = false;
    });
    if (!this.hasAttribute('expanded')) this._updateCollapsedState();
    this._updateFormValue();
  }
}

customElements.define('closure-checkbox-tree', CheckboxTree);


class CheckboxGroup extends HTMLElement {
  static formAssociated = true;

  static _styleId = 'closure-checkbox-group-default-style';
  static _style = [
    'closure-checkbox-group { display: block; }',
  ].join('\n');

  static get observedAttributes() { return ['readonly']; }

  constructor() {
    super();
    this._internals = this.attachInternals();
  }

  // ---
  attributeChangedCallback(name) {
    if (name === 'readonly' && this.isConnected) {
      this._applyReadonly();
    }
  }

  _applyReadonly() {
    var ro = this.hasAttribute('readonly');
    this._getTrees().forEach(function(tree) {
      if (ro) tree.setAttribute('readonly', '');
      else tree.removeAttribute('readonly');
    });
  }

  // ---
  connectedCallback() {
    if (this._initialized) return;
    this._initialized = true;
    if (!document.getElementById(CheckboxGroup._styleId)) {
      var s = document.createElement('style');
      s.id = CheckboxGroup._styleId;
      s.textContent = CheckboxGroup._style;
      document.head.appendChild(s);
    }
    var self = this;
    this.addEventListener('change', function() { self._updateFormValue(); });
    var init = function() {
      self._loadFromSrc();
      self._updateFormValue();
      // A readonly attribute parsed before the children existed had
      // nothing to propagate to — re-apply it now
      if (self.hasAttribute('readonly')) self._applyReadonly();
    };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
      requestAnimationFrame(init);
    }
  }

  _loadFromSrc() {
    var srcId = this.getAttribute('src');
    if (!srcId) return;
    var el = document.getElementById(srcId);
    if (!el) return;
    try {
      var data = JSON.parse(el.textContent);
      if (data && (Array.isArray(data) ? data.length > 0 : Object.keys(data).length > 0)) {
        this.setValues(data);
      }
    } catch (e) { }
  }

  _getTrees() {
    return this.querySelectorAll('closure-checkbox-tree');
  }

  _getData() {
    var trees = this._getTrees();
    var output = this.getAttribute('output') || 'flat';

    if (output === 'sections') {
      var obj = {};
      trees.forEach(function(tree) {
        obj[tree.getAttribute('name') || ''] = tree.getValues();
      });
      return obj;
    }

    // flat
    var arr = [];
    trees.forEach(function(tree) {
      var vals = tree.getValues();
      for (var i = 0; i < vals.length; i++) arr.push(vals[i]);
    });
    return arr;
  }

  _updateFormValue() {
    this._internals.setFormValue(JSON.stringify(this._getData()));
    var sid = this.getAttribute('summary');
    if (sid) {
      var t = document.getElementById(sid);
      if (t && typeof t.refresh === 'function') t.refresh(this.getSummaryHTML());
    }
  }

  getSummaryHTML() {
    var html = '';
    this._getTrees().forEach(function(tree) {
      html += tree.getSummaryHTML();
    });
    return html;
  }

  // ---
  get value() {
    return JSON.stringify(this._getData());
  }

  // Setter so a server `set-value` (el.value = JSON) restores the group instead
  // of silently no-opping on a getter-only property.
  set value(v) {
    try { this.setValues(typeof v === 'string' ? JSON.parse(v) : v); } catch (e) {}
  }

  getValues() {
    return this._getData();
  }

  setValues(data) {
    var trees = this._getTrees();
    var output = this.getAttribute('output') || 'flat';

    if (output === 'sections' && data && !Array.isArray(data)) {
      trees.forEach(function(tree) {
        var name = tree.getAttribute('name') || '';
        if (data[name]) tree.setValues(data[name]);
      });
    } else if (Array.isArray(data)) {
      trees.forEach(function(tree) {
        var prefix = '/' + (tree.getAttribute('name') || '') + '/';
        var subset = data.filter(function(entry) {
          return entry[0].indexOf(prefix) === 0;
        });
        if (subset.length > 0) tree.setValues(subset);
      });
    }

    this._updateFormValue();
  }

  checkAll() {
    this._getTrees().forEach(function(tree) { tree.checkAll(); });
    this._updateFormValue();
  }

  uncheckAll() {
    this._getTrees().forEach(function(tree) { tree.uncheckAll(); });
    this._updateFormValue();
  }
}

customElements.define('closure-checkbox-group', CheckboxGroup);


class ClosureTab extends HTMLElement {
  static get observedAttributes() { return ['hidden', 'disabled', 'label', 'icon']; }

  attributeChangedCallback() {
    var bar = this.closest('closure-tab-bar');
    if (bar && bar._built) bar._syncButtons();
  }
}

customElements.define('closure-tab', ClosureTab);


class ClosureTabBar extends HTMLElement {
  static _styleId = 'closure-tab-bar-default-style';
  static _style = [
    'closure-tab-bar { display: block; }',
    'closure-tab { display: none; }',
    'closure-tab[active] { display: block; padding: 14px 16px; border: 1px solid var(--border, #ccc); border-top: none; background: var(--tab-bg-active, #fff); border-radius: 0 0 4px 4px; }',
    'closure-tab-bar .ctb-bar { display: flex; gap: 0; border-bottom: 1px solid var(--border, #ccc); margin-bottom: 0; }',
    'closure-tab-bar .ctb-btn { padding: 6px 14px; border: 1px solid var(--border, #ccc); border-bottom: none; background: var(--tab-bg, #f5f5f5); cursor: pointer; font-family: var(--font, sans-serif); font-size: 13px; font-weight: 500; color: var(--text-muted, #6b7280); border-radius: 4px 4px 0 0; margin-right: -1px; position: relative; }',
    'closure-tab-bar .ctb-btn:hover { background: var(--tab-bg-hover, #e8e8e8); }',
    'closure-tab-bar .ctb-btn.active { background: var(--tab-bg-active, #fff); color: var(--text, #111827); border-bottom: 1px solid var(--tab-bg-active, #fff); margin-bottom: -1px; z-index: 1; }',
    'closure-tab-bar .ctb-btn[disabled] { opacity: 0.4; cursor: default; }',
    'closure-tab-bar .ctb-btn .ctb-chk { margin-right: 4px; vertical-align: middle; }',
    'closure-tab[toggled-off] > *:not(input[type="hidden"]) { visibility: hidden; }',
  ].join('\n');

  connectedCallback() {
    if (this._initialized) return;
    this._initialized = true;
    if (!document.getElementById(ClosureTabBar._styleId)) {
      var s = document.createElement('style');
      s.id = ClosureTabBar._styleId;
      s.textContent = ClosureTabBar._style;
      document.head.appendChild(s);
    }
    var self = this;
    var init = function() { self._build(); };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
      requestAnimationFrame(init);
    }
  }

  _build() {
    this._built = true;

    // Create button bar
    this._bar = document.createElement('div');
    this._bar.className = 'ctb-bar';
    this.insertBefore(this._bar, this.firstChild);

    this._syncButtons();

    // Activate initial tab
    var active = this.getAttribute('active');
    var tabs = this._getTabs();
    if (!active && tabs.length > 0) active = tabs[0].getAttribute('name');
    if (active) this.select(active);

    // Delegate clicks
    var self = this;
    this._bar.addEventListener('click', function(e) {
      var btn = e.target.closest('.ctb-btn');
      if (!btn || btn.disabled) return;
      self.select(btn.dataset.name);
    });

    // Bind show-source checkboxes
    this._bindShowSources();
  }

  _getTabs() {
    var result = [];
    var children = this.children;
    for (var i = 0; i < children.length; i++) {
      if (children[i].tagName === 'CLOSURE-TAB') result.push(children[i]);
    }
    return result;
  }

  _bindShowSources() {
    var self = this;
    this._getTabs().forEach(function(tab) {
      var srcId = tab.getAttribute('show-source');
      if (!srcId) return;
      var src = document.getElementById(srcId);
      if (!src) return;
      // Apply initial state
      self._applyShowSource(tab, src.checked);
      // Listen for changes
      src.addEventListener('change', function() {
        self._applyShowSource(tab, src.checked);
      });
    });
  }

  _applyShowSource(tab, visible) {
    if (visible) {
      tab.removeAttribute('hidden');
    } else {
      tab.setAttribute('hidden', '');
      // If this tab was active, select the first visible tab
      if (tab.hasAttribute('active')) {
        var tabs = this._getTabs();
        for (var i = 0; i < tabs.length; i++) {
          if (!tabs[i].hasAttribute('hidden')) {
            this.select(tabs[i].getAttribute('name'));
            break;
          }
        }
      }
    }
    this._syncButtons();
  }

  _getTabByName(name) {
    var tabs = this._getTabs();
    for (var i = 0; i < tabs.length; i++) {
      if (tabs[i].getAttribute('name') === name) return tabs[i];
    }
    return null;
  }

  _syncButtons() {
    if (!this._bar) return;
    var tabs = this._getTabs();
    var activeName = this.getActive();

    this._bar.innerHTML = '';
    var self = this;
    tabs.forEach(function(tab) {
      var name = tab.getAttribute('name') || '';
      var label = tab.getAttribute('label') || name;
      var icon = tab.getAttribute('icon') || '';
      var isHidden = tab.hasAttribute('hidden');
      var isDisabled = tab.hasAttribute('disabled');
      var toggle = tab.getAttribute('toggle');

      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ctb-btn';
      btn.dataset.name = name;

      if (toggle) {
        var chk = document.createElement('input');
        chk.type = 'checkbox';
        chk.className = 'ctb-chk';
        chk.dataset.tab = name;
        // Preserve the tab's current state across rebuilds — only apply
        // the default ('disable' starts on, 'enable' starts off) once
        var isOn;
        if (tab._toggleInit) {
          isOn = !tab.hasAttribute('toggled-off');
        } else {
          isOn = (toggle === 'disable');
          tab._toggleInit = true;
        }
        // Checkbox semantics: enable → check to enable; disable → check
        // to disable (so it starts unchecked while the panel is on)
        chk.checked = (toggle === 'enable') ? isOn : !isOn;
        self._applyToggle(tab, isOn);
        chk.addEventListener('click', function(e) { e.stopPropagation(); });
        chk.addEventListener('change', function() {
          var on = (toggle === 'enable') ? chk.checked : !chk.checked;
          self._applyToggle(tab, on);
        });
        btn.appendChild(chk);
      }

      if (icon) btn.appendChild(document.createTextNode(icon + ' ' + label));
      else btn.appendChild(document.createTextNode(label));
      if (isDisabled) btn.disabled = true;
      if (isHidden) btn.style.display = 'none';
      if (name === activeName) btn.classList.add('active');
      self._bar.appendChild(btn);
    });
  }

  select(name) {
    var tabs = this._getTabs();
    var prev = this.getActive();

    // No-op when nothing matches — don't deactivate the current tab
    var found = tabs.some(function(tab) { return tab.getAttribute('name') === name; });
    if (!found) return;

    tabs.forEach(function(tab) {
      if (tab.getAttribute('name') === name) {
        tab.setAttribute('active', '');
      } else {
        tab.removeAttribute('active');
      }
    });

    // Update buttons
    if (this._bar) {
      var btns = this._bar.querySelectorAll('.ctb-btn');
      for (var i = 0; i < btns.length; i++) {
        btns[i].classList.toggle('active', btns[i].dataset.name === name);
      }
    }

    if (prev !== name) {
      this.dispatchEvent(new CustomEvent('tab-change', {
        bubbles: true,
        detail: { name: name, prev: prev },
      }));
    }
  }

  _applyToggle(tab, on) {
    if (on) {
      tab.removeAttribute('toggled-off');
    } else {
      tab.setAttribute('toggled-off', '');
    }
    var targetId = tab.getAttribute('toggle-target');
    if (targetId) {
      var hidden = document.getElementById(targetId);
      if (hidden) hidden.value = on ? '1' : '0';
    }
  }

  getActive() {
    var tabs = this._getTabs();
    for (var i = 0; i < tabs.length; i++) {
      if (tabs[i].hasAttribute('active')) return tabs[i].getAttribute('name');
    }
    return '';
  }
}

customElements.define('closure-tab-bar', ClosureTabBar);


class ClosureSummary extends HTMLElement {
  static _style = [
    ':host { display: block; font-size: var(--summary-font-size, 12px); color: var(--summary-color, inherit); }',
    'ul { padding-left: var(--summary-indent, 1.2em); list-style: var(--summary-list-style, disc); margin: 0; }',
    'li { margin: var(--summary-li-margin, 2px 0); }',
    'strong { font-weight: var(--summary-strong-weight, bold); }',
  ].join('\n');

  // ---
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  // ---
  connectedCallback() {
    var self = this;
    var init = function() { self._pair(); };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
      requestAnimationFrame(init);
    }
  }

  _pair() {
    var srcId = this.getAttribute('source');
    if (!srcId) return;
    var src = document.getElementById(srcId);
    if (src && typeof src.getSummaryHTML === 'function') {
      this.refresh(src.getSummaryHTML());
    }
  }

  refresh(html) {
    this.shadowRoot.innerHTML = '<style>' + ClosureSummary._style + '</style>' + (html || '');
  }
}

customElements.define('closure-summary', ClosureSummary);


class ClosureFormField extends HTMLElement {
  static get observedAttributes() { return ['label', 'required', 'warning', 'error']; }

  attributeChangedCallback() {
    if (this._labelEl) {
      this._labelEl.textContent = this.getAttribute('label') || '';
      if (this.hasAttribute('required')) {
        this._labelEl.classList.add('cfr-required');
      } else {
        this._labelEl.classList.remove('cfr-required');
      }
    }
    this._updateState();
  }

  _updateState() {
    var hasError = this.hasAttribute('error');
    var hasWarning = this.hasAttribute('warning');
    var errorMsg = this.getAttribute('error') || '';
    var warningMsg = this.getAttribute('warning') || '';

    // Update message element
    if (!this._msgEl && this._built) {
      this._msgEl = document.createElement('span');
      this._msgEl.className = 'cfr-msg';
      this.appendChild(this._msgEl);
    }
    if (this._msgEl) {
      if (hasError) {
        this._msgEl.textContent = errorMsg;
        this._msgEl.className = 'cfr-msg cfr-error-msg';
        this._msgEl.style.display = errorMsg ? 'block' : 'none';
      } else if (hasWarning) {
        this._msgEl.textContent = warningMsg;
        this._msgEl.className = 'cfr-msg cfr-warning-msg';
        this._msgEl.style.display = warningMsg ? 'block' : 'none';
      } else {
        this._msgEl.textContent = '';
        this._msgEl.style.display = 'none';
      }
    }
  }
}

customElements.define('closure-form-field', ClosureFormField);


class ClosureFormRow extends HTMLElement {
  static _styleId = 'closure-form-row-default-style';
  static _style = [
    // Size presets via [density] on any ancestor
    '[density="sm"] { --cfr-font: 11px; --cfr-label-font: 9px; --cfr-padding: 2px 4px; --cfr-gap: 6px; --cfr-row-mb: 4px; --cfr-msg-font: 8px; --cfr-pwd-h: 18px; --cfr-pwd-lh: 12px; }',
    '[density="lg"] { --cfr-font: 15px; --cfr-label-font: 12px; --cfr-padding: 6px 10px; --cfr-gap: 14px; --cfr-row-mb: 10px; --cfr-msg-font: 12px; --cfr-pwd-h: 30px; --cfr-pwd-lh: 20px; }',
    '[density="xl"] { --cfr-font: 18px; --cfr-label-font: 14px; --cfr-padding: 10px 14px; --cfr-gap: 18px; --cfr-row-mb: 14px; --cfr-msg-font: 13px; --cfr-pwd-h: 40px; --cfr-pwd-lh: 24px; }',
    // Layout
    'closure-form-row { display: block; margin-bottom: var(--cfr-row-mb, 6px); }',
    'closure-form-row .cfr-grid { display: grid; }',
    'closure-form-row .cfr-flex { display: flex; }',
    'closure-form-row[wrap] .cfr-flex { flex-wrap: wrap; }',
    'closure-form-row[cfr-collapsed] { grid-template-columns: 1fr !important; }',
    'closure-form-row[cfr-collapsed] .cfr-flex { flex-wrap: wrap; }',
    'closure-form-row[cfr-collapsed] closure-form-field { flex: 1 0 100%; }',
    'closure-form-row[cfr-collapsed] closure-form-field[hide-on-collapse] { display: none; }',
    'closure-form-field { display: flex; flex-direction: column; min-width: 0; }',
    'closure-form-field[labels-side] { flex-direction: row; align-items: center; gap: var(--cfr-gap, 6px); }',
    'closure-form-field .cfr-label { font-size: var(--cfr-label-font, 11px); font-weight: bold; margin-bottom: 2px; color: var(--text-muted, #555); }',
    'closure-form-field[labels-side] .cfr-label { margin-bottom: 0; min-width: var(--cfr-label-width, 80px); }',
    'closure-form-field[labels-right] { flex-direction: row-reverse; align-items: center; gap: var(--cfr-gap, 6px); }',
    'closure-form-field[labels-right] .cfr-label { margin-bottom: 0; }',
    'closure-form-field .cfr-required::after { content: " *"; color: var(--red, #c00); }',
    'closure-form-field .cfr-body { flex: 1; min-width: 0; }',
    'closure-form-field[labels-chk] { justify-content: flex-end; }',
    'closure-form-field[labels-chk] .cfr-body { flex: none; }',
    'closure-form-field[labels-chk] .cfr-body input { width: auto; }',
    'closure-form-field .cfr-body input, closure-form-field .cfr-body select, closure-form-field .cfr-body textarea { font-size: var(--cfr-font, 13px); padding: var(--cfr-padding, 4px 6px); width: 100%; box-sizing: border-box; }',
    'closure-form-field .cfr-body textarea { resize: vertical; }',
    'closure-form-field .cfr-body credential-pwd { margin-bottom: 0; padding: var(--cfr-padding, 4px 6px); min-height: 0; height: var(--cfr-pwd-h, 23px); box-sizing: border-box; border-radius: 3px; font-size: var(--cfr-font, 13px); overflow: hidden; white-space: nowrap; line-height: var(--cfr-pwd-lh, 15px); }',
    // States
    'closure-form-field[warning] .cfr-body input, closure-form-field[warning] .cfr-body select, closure-form-field[warning] .cfr-body textarea, closure-form-field[warning] .cfr-body credential-pwd { border-color: var(--warning, #d97706); }',
    'closure-form-field[error] .cfr-body input, closure-form-field[error] .cfr-body select, closure-form-field[error] .cfr-body textarea, closure-form-field[error] .cfr-body credential-pwd { border-color: var(--red, #c00); }',
    'closure-form-field .cfr-msg { font-size: var(--cfr-msg-font, 10px); margin-top: 2px; display: none; }',
    'closure-form-field .cfr-warning-msg { color: var(--warning, #d97706); }',
    'closure-form-field .cfr-error-msg { color: var(--red, #c00); }',
    // Readonly mode
    'closure-form-field.cfr-ro .cfr-body input, closure-form-field.cfr-ro .cfr-body select, closure-form-field.cfr-ro .cfr-body textarea { background: var(--cfr-ro-bg, #f8f8f8); color: var(--cfr-ro-color, #666); border-color: var(--cfr-ro-border, #e5e5e5); cursor: default; }',
    'closure-form-field.cfr-ro .cfr-body credential-pwd { background: var(--cfr-ro-bg, #f8f8f8); color: var(--cfr-ro-color, #666); border-color: var(--cfr-ro-border, #e5e5e5); cursor: default; }',
    'closure-form-field.cfr-ro .cfr-label { color: var(--cfr-ro-label, #999); }',
  ].join('\n');

  connectedCallback() {
    if (this._initialized) {
      // Reconnect: resume observing instead of rebuilding and stacking
      // another observer
      if (this._minObserver) this._minObserver.observe(this);
      return;
    }
    this._initialized = true;
    if (!document.getElementById(ClosureFormRow._styleId)) {
      var s = document.createElement('style');
      s.id = ClosureFormRow._styleId;
      s.textContent = ClosureFormRow._style;
      document.head.appendChild(s);
    }
    var self = this;
    var init = function() { self._build(); };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
      requestAnimationFrame(init);
    }
  }

  disconnectedCallback() {
    if (this._minObserver) this._minObserver.disconnect();
  }

  _build() {
    var cols = this.getAttribute('cols');
    var labels = this.getAttribute('labels') || 'top';
    var gap = this.getAttribute('gap') || '10px';
    var fields = this._getFields();

    // Wrap fields in label + body structure
    var self = this;
    fields.forEach(function(field) {
      if (field._built) return;
      field._built = true;

      var labelText = field.getAttribute('label') || '';
      var labelEl = document.createElement('span');
      labelEl.className = 'cfr-label';
      labelEl.textContent = labelText;
      if (field.hasAttribute('required')) labelEl.classList.add('cfr-required');
      field._labelEl = labelEl;

      // Wrap existing content in body div
      var body = document.createElement('div');
      body.className = 'cfr-body';
      while (field.firstChild) body.appendChild(field.firstChild);

      field.appendChild(labelEl);
      field.appendChild(body);

      var fieldLabels = field.getAttribute('labels') || labels;
      if (fieldLabels === 'side' || fieldLabels === 'left') field.setAttribute('labels-side', '');
      if (fieldLabels === 'right') field.setAttribute('labels-right', '');
      if (fieldLabels === 'checkbox-right') { field.setAttribute('labels-right', ''); field.setAttribute('labels-chk', ''); }
      if (fieldLabels === 'checkbox-left') { field.setAttribute('labels-side', ''); field.setAttribute('labels-chk', ''); }

      field._updateState();
    });

    // Apply layout
    if (cols) {
      this._applyGrid(cols, gap);
    } else {
      this._applyFlex(gap, fields);
    }

    // Responsive collapse
    var minWidth = this.getAttribute('min');
    if (minWidth && !this._minObserver) {
      var self = this;
      var minPx = parseFloat(minWidth);
      this._minObserver = new ResizeObserver(function(entries) {
        var w = entries[0].contentRect.width;
        if (w < minPx) {
          self.setAttribute('cfr-collapsed', '');
        } else {
          self.removeAttribute('cfr-collapsed');
        }
      });
      this._minObserver.observe(this);
    }
  }

  _getFields() {
    var result = [];
    var children = this.children;
    for (var i = 0; i < children.length; i++) {
      if (children[i].tagName === 'CLOSURE-FORM-FIELD') result.push(children[i]);
    }
    return result;
  }

  _parseCols(cols) {
    return cols.split(',').map(function(c) {
      c = c.trim();
      if (c === '*') return '1fr';
      if (/^\d+$/.test(c)) return c + 'fr';
      return c;
    }).join(' ');
  }

  _applyGrid(cols, gap) {
    this.style.display = 'grid';
    this.style.gridTemplateColumns = this._parseCols(cols);
    this.style.gap = gap;
    this._getFields().forEach(function(field) {
      var min = field.getAttribute('min');
      var max = field.getAttribute('max');
      if (min) field.style.minWidth = min;
      if (max) field.style.maxWidth = max;
    });
  }

  _applyFlex(gap, fields) {
    this.style.display = 'flex';
    this.style.gap = gap;

    fields.forEach(function(field) {
      var flex = field.getAttribute('flex');
      var width = field.getAttribute('width');
      var min = field.getAttribute('min');
      var max = field.getAttribute('max');
      if (width) {
        field.style.flex = '0 0 ' + width;
        field.style.width = width;
      } else if (flex) {
        field.style.flex = flex;
      } else {
        field.style.flex = '1';
      }
      if (min) field.style.minWidth = min;
      if (max) field.style.maxWidth = max;
    });
  }
}

customElements.define('closure-form-row', ClosureFormRow);


class ClosureDataSource extends HTMLElement {

  // ---
  connectedCallback() {
    if (this._initialized) {
      // Reconnect: re-attach the control listeners removed on disconnect
      (this._controlBindings || []).forEach(function(cb) {
        cb.control.addEventListener('change', cb.fn);
      });
      return;
    }
    this._initialized = true;
    this.style.display = 'none';
    var self = this;
    var init = function() { self._build(); };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
      requestAnimationFrame(init);
    }
  }

  disconnectedCallback() {
    (this._controlBindings || []).forEach(function(cb) {
      cb.control.removeEventListener('change', cb.fn);
    });
  }

  _build() {
    this._data = this._parseRows();
    this._bindings = this._parseBindings();
    this._bindAll();
  }

  _parseRows() {
    var rows = [];
    var gRows = this.querySelectorAll('g-row');
    for (var i = 0; i < gRows.length; i++) {
      var row = {};
      var cols = gRows[i].querySelectorAll('g-col');
      for (var j = 0; j < cols.length; j++) {
        var name = cols[j].getAttribute('name');
        if (name) row[name] = cols[j].textContent.trim();
      }
      rows.push(row);
    }
    return rows;
  }

  _parseBindings() {
    var bindings = [];
    var obs = this.querySelectorAll('observed-select');
    for (var i = 0; i < obs.length; i++) {
      bindings.push({
        listId: obs[i].getAttribute('list-id') || '',
        keyField: obs[i].getAttribute('key-field') || '',
        labelField: obs[i].getAttribute('label-field') || '',
        filterControl: obs[i].getAttribute('filter-control') || '',
        filterField: obs[i].getAttribute('filter-field') || '',
        selectedValue: obs[i].getAttribute('selected-value') || '',
        blankKey: obs[i].hasAttribute('blank-value-key') ? (obs[i].getAttribute('blank-value-key') || '') : null,
        blankLabel: obs[i].getAttribute('blank-value-label') || '',
      });
    }
    return bindings;
  }

  _bindAll() {
    var self = this;
    this._controlBindings = [];
    // While the initial pass runs, cascaded repopulations (fired by the
    // synchronous change dispatch below) must still honor selected-value
    // — otherwise the outcome depends on declaration order
    this._initialBind = true;
    this._bindings.forEach(function(b) {
      var select = document.getElementById(b.listId);
      if (!select) return;

      if (b.filterControl) {
        var control = document.getElementById(b.filterControl);
        if (control) {
          var fn = function() {
            self._populateSelect(b, select, self._initialBind);
          };
          control.addEventListener('change', fn);
          self._controlBindings.push({ control: control, fn: fn });
        }
      }

      self._populateSelect(b, select, true);
    });
    this._initialBind = false;
  }

  _populateSelect(binding, select, initial) {
    var filterValue = '';
    if (binding.filterControl && binding.filterField) {
      var control = document.getElementById(binding.filterControl);
      if (control) filterValue = control.value;
    }

    var seen = Object.create(null); // plain {} has inherited keys ("constructor", …)
    var options = [];
    for (var i = 0; i < this._data.length; i++) {
      var row = this._data[i];

      if (binding.filterField && filterValue) {
        if (row[binding.filterField] !== filterValue) continue;
      }

      var key = row[binding.keyField] || '';
      var label = row[binding.labelField] || key;

      if (seen[key]) continue;
      seen[key] = true;
      options.push({ key: key, label: label });
    }

    select.innerHTML = '';

    if (binding.blankKey !== null) {
      var blank = document.createElement('option');
      blank.value = binding.blankKey;
      blank.textContent = binding.blankLabel;
      select.appendChild(blank);
    }

    for (var i = 0; i < options.length; i++) {
      var opt = document.createElement('option');
      opt.value = options[i].key;
      opt.textContent = options[i].label;
      select.appendChild(opt);
    }

    // On initial load: use selected-value. On cascade: reset to blank.
    if (initial && binding.selectedValue) {
      for (var i = 0; i < select.options.length; i++) {
        if (select.options[i].value === binding.selectedValue) {
          select.value = binding.selectedValue;
          break;
        }
      }
    } else if (binding.blankKey !== null) {
      select.value = binding.blankKey;
    }

    // Trigger change on dependents
    select.dispatchEvent(new Event('change', { bubbles: false }));
  }
}

customElements.define('closure-data-source', ClosureDataSource);


class FingerprintHands extends HTMLElement {
  static _sizes = { sm: 80, md: 120, lg: 160, xl: 220, xxl: 300 };
  static _fingers = ['l1','l2','l3','l4','l5','r1','r2','r3','r4','r5'];
  static _navOrder = ['l5','l4','l3','l2','l1','r1','r2','r3','r4','r5'];
  static _style = [
    ':host { display: inline-flex; gap: 8px; outline: none; }',
    ':host(:focus-visible) { outline: 2px solid var(--fh-focus-ring, #3b82f6); outline-offset: 4px; border-radius: 4px; }',
    '.fh-label { text-align: center; font-weight: bold; font-size: 10px; color: var(--text-muted, #888); }',
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
