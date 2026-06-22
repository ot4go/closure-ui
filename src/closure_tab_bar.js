/*<%% note:
# `<closure-tab-bar>`

Tab control that manages a set of `<closure-tab>` panels. Renders a
button bar above the panels; the active tab's panel is shown, the rest
are hidden. No Shadow DOM — buttons are added in light DOM.

## Attributes

| Attribute | Description |
|---|---|
| `active="name"` | initially active tab (default: first tab) |

## Children

`<closure-tab>` elements (see [`<closure-tab>`](#closure-tab) for
attributes).

## Methods

| Method | Description |
|---|---|
| `select(name)` | activate the tab with that `name`; no-op if no match |
| `getActive()`  | returns the `name` of the currently active tab (or `""`) |

## Events

| Event | Bubbles | Detail |
|---|---|---|
| `tab-change` | yes | `{ name, prev }` |

Fired when the active tab changes (programmatically or via click). Not
fired when the user re-clicks the already-active tab.

## Example

```html
<closure-tab-bar active="signin">
  <closure-tab name="contact" label="Contact" icon="✉">
    <p>Get in touch…</p>
  </closure-tab>
  <closure-tab name="signin" label="Sign in" toggle="enable" toggle-target="signin-on">
    <input type="hidden" id="signin-on" name="signin_enabled" value="1">
    <p>Sign-in form…</p>
  </closure-tab>
</closure-tab-bar>
```

## CSS Variables

| Variable | Default | Used for |
|---|---|---|
| `--border`         | `#ccc`    | bar bottom + button border |
| `--font`           | `sans-serif` | button font |
| `--text`           | `#111827` | active button text |
| `--text-muted`     | `#6b7280` | inactive button text |
| `--tab-bg`         | `#f5f5f5` | inactive button background |
| `--tab-bg-hover`   | `#e8e8e8` | hover background |
| `--tab-bg-active`  | `#fff`    | active button background |

## Behaviour

> **Note:** the bar lazily initialises on `DOMContentLoaded` (or
> `requestAnimationFrame` if the document is already parsed). Adding
> `<closure-tab>` children **after** that runs requires calling
> `_syncButtons()` manually — there's no MutationObserver.

> **Note:** when a tab uses `toggle="enable\|disable"`, clicking the
> in-button checkbox also writes `0`/`1` into `toggle-target` (when set),
> so the dirty form value reflects the panel's enabled state.

> **Note:** when `show-source` flips the active tab to `hidden`, the bar
> automatically advances selection to the first still-visible tab.

> **Note:** the active panel ships with a default frame — padding,
> a border matching the bar (`--border`) and a `--tab-bg-active`
> background — so the tabs look connected out of the box with no
> page CSS. Override `closure-tab[active]` to restyle it.

---
%%>*/

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
