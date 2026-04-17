/*
 * crawl-mobile-webtiles injected client.
 *
 * Renders a touch keyboard overlay over the upstream DCSS webtiles UI and
 * translates taps into synthetic KeyboardEvent objects that the upstream
 * client already knows how to handle (the webtiles client reads event.which
 * and forwards a `{msg:"key",keycode:N}` WebSocket message to the server).
 *
 * Key layouts are inspired by the jbak2-crawl Android layout: vi-keys in a
 * 3x3 D-pad, sticky Ctrl/Shift/Alt, plus secondary QWERTY/symbol/function
 * panels for text entry (login, naming, chat, etc.).
 */
(function () {
  'use strict';

  if (window.__mwtInstalled) return;
  window.__mwtInstalled = true;

  // --------------------------------------------------------------------------
  // Key dispatch
  // --------------------------------------------------------------------------

  // Map of "logical name" -> { key, code, which }
  // `which` follows legacy browser conventions because the webtiles client
  // reads event.which for non-character keys.
  var SPECIAL = {
    Escape:    { key: 'Escape',    code: 'Escape',    which: 27 },
    Enter:     { key: 'Enter',     code: 'Enter',     which: 13 },
    Tab:       { key: 'Tab',       code: 'Tab',       which: 9 },
    Backspace: { key: 'Backspace', code: 'Backspace', which: 8 },
    Delete:    { key: 'Delete',    code: 'Delete',    which: 46 },
    Space:     { key: ' ',         code: 'Space',     which: 32, char: ' ' },
    ArrowLeft: { key: 'ArrowLeft', code: 'ArrowLeft', which: 37 },
    ArrowUp:   { key: 'ArrowUp',   code: 'ArrowUp',   which: 38 },
    ArrowRight:{ key: 'ArrowRight',code: 'ArrowRight',which: 39 },
    ArrowDown: { key: 'ArrowDown', code: 'ArrowDown', which: 40 },
    Home:      { key: 'Home',      code: 'Home',      which: 36 },
    End:       { key: 'End',       code: 'End',       which: 35 },
    PageUp:    { key: 'PageUp',    code: 'PageUp',    which: 33 },
    PageDown:  { key: 'PageDown',  code: 'PageDown',  which: 34 },
  };

  function functionKey(n) {
    return { key: 'F' + n, code: 'F' + n, which: 111 + n };
  }

  function codeForChar(ch) {
    if (/^[a-zA-Z]$/.test(ch)) return 'Key' + ch.toUpperCase();
    if (/^[0-9]$/.test(ch)) return 'Digit' + ch;
    return '';
  }

  // Dispatch a KeyboardEvent stack (keydown + optional keypress + keyup).
  // For printable characters we emit keypress too because older webtiles
  // code paths still read it. For non-character keys (Esc, arrows, etc.)
  // we emit only keydown/keyup.
  function dispatchKey(spec, mods) {
    mods = mods || {};
    var target = document.activeElement || document.body || document;
    if (target && target.nodeType !== 1 && target !== document) target = document;

    // If focus is on a real text input, let the browser handle it natively
    // (the user can use their IME); we only synthesize for game play.
    if (isTextInput(target) && !mods.force) {
      insertIntoInput(target, spec, mods);
      return;
    }

    var which = spec.which;
    var key = spec.key;
    var code = spec.code || codeForChar(key);
    var charCode = 0;

    // For printable keys we need the correct keyCode and charCode.
    if (key && key.length === 1) {
      var ch = key;
      if (mods.shift) ch = ch.toUpperCase();
      else if (/^[A-Z]$/.test(ch)) ch = ch.toLowerCase();
      var shifted = applyShift(ch, mods.shift);
      key = shifted;
      charCode = shifted.charCodeAt(0);
      // keyCode for letters/digits uses uppercase ASCII.
      if (/^[a-zA-Z]$/.test(shifted)) which = shifted.toUpperCase().charCodeAt(0);
      else if (/^[0-9]$/.test(shifted)) which = shifted.charCodeAt(0);
      else which = which || shifted.charCodeAt(0);
    } else if (spec.char) {
      charCode = spec.char.charCodeAt(0);
    }

    var init = {
      bubbles: true,
      cancelable: true,
      key: key,
      code: code,
      keyCode: which,
      which: which,
      charCode: charCode,
      ctrlKey: !!mods.ctrl,
      shiftKey: !!mods.shift,
      altKey: !!mods.alt,
      metaKey: false,
    };

    fireKey(target, 'keydown', init);
    if (key && key.length === 1 && !mods.ctrl && !mods.alt) {
      var pressInit = Object.assign({}, init, { keyCode: charCode, which: charCode });
      fireKey(target, 'keypress', pressInit);
    }
    fireKey(target, 'keyup', init);
  }

  function fireKey(target, type, init) {
    var ev;
    try {
      ev = new KeyboardEvent(type, init);
    } catch (e) {
      ev = document.createEvent('KeyboardEvent');
      ev.initEvent(type, init.bubbles, init.cancelable);
    }
    // keyCode/which/charCode are readonly on the constructed event, so
    // pin them via defineProperty so the upstream client sees real values.
    defProp(ev, 'keyCode', init.keyCode || 0);
    defProp(ev, 'which', init.which || 0);
    defProp(ev, 'charCode', init.charCode || 0);
    defProp(ev, 'key', init.key);
    defProp(ev, 'code', init.code);
    target.dispatchEvent(ev);
  }

  function defProp(obj, name, value) {
    try {
      Object.defineProperty(obj, name, { configurable: true, get: function () { return value; } });
    } catch (_) { /* ignore */ }
  }

  var SHIFT_MAP = {
    '1':'!', '2':'@', '3':'#', '4':'$', '5':'%',
    '6':'^', '7':'&', '8':'*', '9':'(', '0':')',
    '-':'_', '=':'+', '[':'{', ']':'}', '\\':'|',
    ';':':', "'":'"', ',':'<', '.':'>', '/':'?', '`':'~',
  };

  function applyShift(ch, shift) {
    if (!shift) return ch;
    if (SHIFT_MAP[ch]) return SHIFT_MAP[ch];
    if (/^[a-z]$/.test(ch)) return ch.toUpperCase();
    return ch;
  }

  function isTextInput(el) {
    if (!el || el === document) return false;
    if (el.isContentEditable) return true;
    var tag = (el.tagName || '').toLowerCase();
    if (tag === 'textarea') return true;
    if (tag === 'input') {
      var t = (el.type || 'text').toLowerCase();
      return ['text','password','email','search','url','tel','number'].indexOf(t) >= 0;
    }
    return false;
  }

  function insertIntoInput(el, spec, mods) {
    if (spec.key === 'Backspace') {
      if (el.isContentEditable) {
        document.execCommand('delete');
      } else {
        var v = el.value || '';
        el.value = v.slice(0, -1);
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }
      return;
    }
    if (spec.key === 'Enter') {
      dispatchKey(spec, Object.assign({}, mods, { force: true }));
      return;
    }
    if (spec.key && spec.key.length === 1) {
      var ch = spec.key;
      if (mods.shift) ch = applyShift(ch, true);
      if (el.isContentEditable) {
        document.execCommand('insertText', false, ch);
      } else {
        el.value = (el.value || '') + ch;
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }
  }

  // --------------------------------------------------------------------------
  // Modifier state (sticky)
  // --------------------------------------------------------------------------

  var mods = { ctrl: false, shift: false, alt: false };
  var modLock = { ctrl: false, shift: false, alt: false }; // caps-style lock

  function toggleMod(name, lock) {
    if (lock) {
      modLock[name] = !modLock[name];
      mods[name] = modLock[name];
    } else {
      mods[name] = !mods[name];
    }
    renderMods();
  }

  function consumeMods() {
    var used = { ctrl: mods.ctrl, shift: mods.shift, alt: mods.alt };
    for (var k in mods) {
      if (!modLock[k]) mods[k] = false;
    }
    renderMods();
    return used;
  }

  function renderMods() {
    for (var k in mods) {
      var el = root.querySelector('.mwt-mod-' + k);
      if (!el) continue;
      el.classList.toggle('mwt-sticky', mods[k] && !modLock[k]);
      el.classList.toggle('mwt-pressed', modLock[k]);
    }
  }

  // --------------------------------------------------------------------------
  // Key descriptor helpers
  // --------------------------------------------------------------------------

  // char(ch, sub?) -> printable character key
  function c(ch, sub) {
    return { label: ch, sub: sub || '', kind: 'char', key: ch };
  }
  // cmd(ch, sub, altKey?) -> character with a description below
  function cmd(ch, sub) { return c(ch, sub); }
  // spc(name, label, sub?) -> special key (Esc, Tab, ...)
  function spc(name, label, sub) {
    return { label: label, sub: sub || '', kind: 'special', special: name };
  }
  // shortcut for a character to emit with a preset modifier (e.g. Ctrl+F)
  function mk(ch, sub, pre) {
    return { label: ch.toUpperCase(), sub: sub, kind: 'char', key: ch, preMods: pre };
  }

  // --------------------------------------------------------------------------
  // Layouts
  // --------------------------------------------------------------------------

  // Game panel: D-pad on the left, action grid on the right.
  // Movement keys use vi-keys so they work in both console and tiles modes.
  var GAME_DPAD = [
    [c('y'), c('k','N'),       c('u')],
    [c('h'), cmd('.','wait'),  c('l')],
    [c('b'), c('j','S'),       c('n')],
  ];

  var GAME_ACTIONS = [
    [cmd('i','inv'),  cmd('g','get'),  cmd('o','auto')],
    [cmd('5','rest'), cmd('s','search'),cmd('x','look')],
    [cmd(',','pick'), cmd('<','up'),   cmd('>','down')],
  ];

  // Action panel: second page of frequently used game commands.
  var ACTION_GRID = [
    [cmd('w','wield'),  cmd('W','wear'),   cmd('P','put on'), cmd('q','quaff')],
    [cmd('r','read'),   cmd('z','cast'),   cmd('Z','spells'), cmd('M','memo')],
    [cmd('a','abil'),   cmd('v','evoke'),  cmd('V','vers'),   cmd('t','throw')],
    [cmd('f','fire'),   cmd('p','pray'),   cmd('e','eat'),    cmd('D','dissect')],
    [cmd('C','close'),  cmd('O','open'),   cmd('X','map'),    cmd('@','char')],
    [mk('g','travel',{ctrl:true}), mk('f','search',{ctrl:true}), mk('a','autofight',{ctrl:true}), mk('x','rest',{ctrl:true})],
  ];

  // QWERTY panel for name entry / chat.
  var QWERTY = [
    ['q','w','e','r','t','y','u','i','o','p'],
    ['a','s','d','f','g','h','j','k','l'],
    ['z','x','c','v','b','n','m'],
  ].map(function (row) { return row.map(function (ch) { return c(ch); }); });

  // Symbols / numbers panel.
  var SYMBOLS = [
    [c('1'),c('2'),c('3'),c('4'),c('5'),c('6'),c('7'),c('8'),c('9'),c('0')],
    [c('-'),c('='),c('['),c(']'),c('\\'),c(';'),c("'"),c(','),c('.'),c('/')],
    [c('!'),c('@'),c('#'),c('$'),c('%'),c('^'),c('&'),c('*'),c('('),c(')')],
    [c('<'),c('>'),c('?'),c('+'),c('_'),c('{'),c('}'),c('|'),c(':'),c('"')],
  ];

  // Function key panel.
  var FKEYS = [
    [1,2,3,4,5,6].map(function (n) { return { label: 'F'+n, kind: 'fkey', n: n }; }),
    [7,8,9,10,11,12].map(function (n) { return { label: 'F'+n, kind: 'fkey', n: n }; }),
  ];

  // --------------------------------------------------------------------------
  // DOM
  // --------------------------------------------------------------------------

  var root;           // #mwt-kbd
  var panels = {};    // modeName -> element
  var currentMode = 'game';

  function build() {
    root = document.createElement('div');
    root.id = 'mwt-kbd';

    var topbar = el('div', 'mwt-topbar');
    var modeSwitch = el('div', 'mwt-mode-switch');
    ['game', 'action', 'abc', 'sym', 'fn'].forEach(function (m) {
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = modeLabel(m);
      b.dataset.mode = m;
      b.addEventListener('click', function () { setMode(m); });
      b.className = 'mwt-mode-btn';
      modeSwitch.appendChild(b);
    });
    topbar.appendChild(modeSwitch);

    var toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.textContent = '▾';
    toggle.className = 'mwt-toggle';
    toggle.title = 'Hide keyboard';
    toggle.addEventListener('click', function () {
      root.classList.toggle('mwt-hidden');
      toggle.textContent = root.classList.contains('mwt-hidden') ? '▴' : '▾';
    });
    topbar.appendChild(toggle);
    root.appendChild(topbar);

    panels.game   = buildGamePanel();
    panels.action = buildGridPanel(ACTION_GRID);
    panels.abc    = buildAlphaPanel();
    panels.sym    = buildGridPanel(SYMBOLS);
    panels.fn     = buildGridPanel(FKEYS);

    Object.keys(panels).forEach(function (k) {
      panels[k].classList.add('mwt-panel');
      panels[k].dataset.mode = k;
      root.appendChild(panels[k]);
    });

    root.appendChild(buildBottomBar());

    document.body.appendChild(root);
    document.body.classList.add('mwt-kbd-visible');
    setMode('game');
    renderMods();
  }

  function modeLabel(m) {
    return { game: 'Game', action: 'Act', abc: 'abc', sym: '123', fn: 'Fn' }[m] || m;
  }

  function el(tag, cls) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    return e;
  }

  function buildGamePanel() {
    var p = el('div');
    var row = el('div', 'mwt-row');

    var dpad = el('div', 'mwt-dpad');
    GAME_DPAD.forEach(function (r) {
      r.forEach(function (k) {
        dpad.appendChild(makeKey(k, { dir: true }));
      });
    });
    row.appendChild(dpad);

    var sep = el('div', 'mwt-sep');
    row.appendChild(sep);

    var actions = el('div', 'mwt-actions');
    GAME_ACTIONS.forEach(function (r) {
      r.forEach(function (k) { actions.appendChild(makeKey(k)); });
    });
    row.appendChild(actions);

    p.appendChild(row);
    return p;
  }

  function buildGridPanel(grid) {
    var p = el('div');
    grid.forEach(function (row) {
      var r = el('div', 'mwt-row');
      row.forEach(function (k) { r.appendChild(makeKey(k)); });
      p.appendChild(r);
    });
    return p;
  }

  function buildAlphaPanel() {
    var p = el('div');
    QWERTY.forEach(function (row, i) {
      var r = el('div', 'mwt-row');
      if (i === 2) {
        // Shift + letters + Backspace
        var shift = makeKey(spc('shift-toggle', '⇧', ''), { special: 'shift-toggle' });
        r.appendChild(shift);
      }
      row.forEach(function (k) { r.appendChild(makeKey(k)); });
      if (i === 2) {
        r.appendChild(makeKey(spc('Backspace', '⌫', '')));
      }
      p.appendChild(r);
    });
    // last row: spacer with comma/period/?
    var r = el('div', 'mwt-row');
    r.appendChild(makeKey(c(',')));
    r.appendChild(makeKey(c('.')));
    r.appendChild(makeKey(c('?')));
    r.appendChild(makeKey(c('!')));
    r.appendChild(makeKey(c("'")));
    r.appendChild(makeKey(c('"')));
    r.appendChild(makeKey(c('-')));
    r.appendChild(makeKey(c(':')));
    p.appendChild(r);
    return p;
  }

  function buildBottomBar() {
    var bar = el('div', 'mwt-bottom');
    var keys = [
      { label: 'Esc', kind: 'special', special: 'Escape' },
      { label: 'Tab', kind: 'special', special: 'Tab' },
      { label: 'Ctrl', kind: 'mod', mod: 'ctrl' },
      { label: '⇧', kind: 'mod', mod: 'shift' },
      { label: 'Alt', kind: 'mod', mod: 'alt' },
      { label: 'Space', kind: 'special', special: 'Space', wide: 3 },
      { label: '⌫', kind: 'special', special: 'Backspace' },
      { label: '↵', kind: 'special', special: 'Enter', wide: 2 },
    ];
    keys.forEach(function (k) { bar.appendChild(makeKey(k, { bottom: true })); });
    return bar;
  }

  function setMode(m) {
    currentMode = m;
    Object.keys(panels).forEach(function (k) {
      panels[k].classList.toggle('mwt-panel-active', k === m);
    });
    root.querySelectorAll('.mwt-mode-btn').forEach(function (b) {
      b.classList.toggle('mwt-mode-active', b.dataset.mode === m);
    });
  }

  // --------------------------------------------------------------------------
  // Key construction + event wiring
  // --------------------------------------------------------------------------

  function makeKey(k, opts) {
    opts = opts || {};
    var btn = el('div', 'mwt-key');
    if (opts.dir) btn.classList.add('mwt-dir');
    if (k.wide) btn.classList.add('mwt-wide-' + k.wide);
    if (k.kind === 'mod') btn.classList.add('mwt-mod-' + k.mod);

    var main = el('div', 'mwt-key-main');
    main.textContent = k.label;
    btn.appendChild(main);
    if (k.sub) {
      var sub = el('div', 'mwt-key-sub');
      sub.textContent = k.sub;
      btn.appendChild(sub);
    }

    attachPress(btn, function (e) { onKeyPress(k, e); });

    // Sticky modifiers support double-tap to lock (caps-lock style).
    if (k.kind === 'mod') {
      var lastTap = 0;
      btn.addEventListener('click', function () {
        var now = Date.now();
        if (now - lastTap < 320) {
          toggleMod(k.mod, true);
        }
        lastTap = now;
      });
    }

    return btn;
  }

  // Attach a low-latency tap handler that also works for mouse desktop testing.
  function attachPress(btn, fn) {
    var fired = false;
    btn.addEventListener('touchstart', function (e) {
      fired = true;
      btn.classList.add('mwt-pressed');
      fn(e);
      e.preventDefault();
    }, { passive: false });
    btn.addEventListener('touchend', function (e) {
      btn.classList.remove('mwt-pressed');
      e.preventDefault();
    }, { passive: false });
    btn.addEventListener('touchcancel', function () {
      btn.classList.remove('mwt-pressed');
    });
    btn.addEventListener('mousedown', function (e) {
      if (fired) { fired = false; return; }
      btn.classList.add('mwt-pressed');
      fn(e);
    });
    btn.addEventListener('mouseup', function () {
      btn.classList.remove('mwt-pressed');
    });
    btn.addEventListener('mouseleave', function () {
      btn.classList.remove('mwt-pressed');
    });
  }

  function onKeyPress(k, ev) {
    if (k.kind === 'mod') {
      // single-tap: temporary hold, cleared after next key
      toggleMod(k.mod, false);
      return;
    }
    if (k.kind === 'special' && k.special === 'shift-toggle') {
      toggleMod('shift', false);
      return;
    }
    var spec;
    if (k.kind === 'special') {
      spec = SPECIAL[k.special];
      if (!spec) return;
    } else if (k.kind === 'fkey') {
      spec = functionKey(k.n);
    } else if (k.kind === 'char') {
      spec = { key: k.key, code: codeForChar(k.key), which: k.key.charCodeAt(0) };
    } else {
      return;
    }
    var preMods = k.preMods || {};
    var usedMods = consumeMods();
    var finalMods = {
      ctrl:  !!(preMods.ctrl  || usedMods.ctrl),
      shift: !!(preMods.shift || usedMods.shift),
      alt:   !!(preMods.alt   || usedMods.alt),
    };
    dispatchKey(spec, finalMods);
  }

  // --------------------------------------------------------------------------
  // Startup
  // --------------------------------------------------------------------------

  function start() {
    if (document.body) build();
    else document.addEventListener('DOMContentLoaded', build);
  }

  // Keep viewport stable when virtual keyboard opens for inputs
  if ('visualViewport' in window) {
    window.visualViewport.addEventListener('resize', function () {
      if (!root) return;
      var vv = window.visualViewport;
      root.style.bottom = Math.max(0, window.innerHeight - vv.height - vv.offsetTop) + 'px';
    });
  }

  start();
})();
