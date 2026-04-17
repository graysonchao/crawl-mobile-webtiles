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

    // Zoom controls + debug + hide, grouped on the right.
    var rightGroup = el('div', 'mwt-right-group');

    var zoomOut = document.createElement('button');
    zoomOut.type = 'button';
    zoomOut.textContent = '−';
    zoomOut.className = 'mwt-toggle mwt-zoom-btn';
    zoomOut.title = 'Zoom out';
    zoomOut.addEventListener('click', function () { bumpZoom(-0.15); });
    rightGroup.appendChild(zoomOut);

    var zoomLabel = document.createElement('span');
    zoomLabel.className = 'mwt-zoom-label';
    zoomLabel.id = 'mwt-zoom-label';
    zoomLabel.textContent = formatZoom(loadZoom());
    rightGroup.appendChild(zoomLabel);

    var zoomIn = document.createElement('button');
    zoomIn.type = 'button';
    zoomIn.textContent = '+';
    zoomIn.className = 'mwt-toggle mwt-zoom-btn';
    zoomIn.title = 'Zoom in';
    zoomIn.addEventListener('click', function () { bumpZoom(+0.15); });
    rightGroup.appendChild(zoomIn);

    var debugBtn = document.createElement('button');
    debugBtn.type = 'button';
    debugBtn.textContent = '…';
    debugBtn.className = 'mwt-toggle';
    debugBtn.title = 'Copy DOM snapshot to clipboard';
    debugBtn.addEventListener('click', dumpDomSnapshot);
    rightGroup.appendChild(debugBtn);

    var toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.textContent = '▾';
    toggle.className = 'mwt-toggle';
    toggle.title = 'Hide keyboard';
    toggle.addEventListener('click', function () {
      root.classList.toggle('mwt-hidden');
      toggle.textContent = root.classList.contains('mwt-hidden') ? '▴' : '▾';
    });
    rightGroup.appendChild(toggle);

    topbar.appendChild(rightGroup);
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
    document.body.classList.add('mwt-mobile');
    applyZoom(loadZoom());
    setMode('game');
    renderMods();
    installGameStateWatcher();
    patchWebtilesLayoutMetrics();

    // Nudge webtiles to re-layout now that we've changed the available
    // space (it listens for window resize and calls fit_to).
    setTimeout(function () {
      try { window.dispatchEvent(new Event('resize')); } catch (_) {}
    }, 50);
  }

  // --------------------------------------------------------------------------
  // mwt-in-game toggle
  //
  // Our aggressive layout rules (fixed #game, scaled #dungeon, fixed
  // #message_pane, hidden #banner/#footer) must only apply when the
  // in-game view is live. Otherwise they paint a black #game box over
  // the lobby. We detect "in-game" by the presence of #dungeon or
  // #stats, plus a visible #game wrapper, and watch for DOM changes.
  // --------------------------------------------------------------------------

  function isInGame() {
    // Fast path: #dungeon only exists when the game view is actually
    // rendered. Skip getComputedStyle on the hot path so this is cheap
    // enough to call from a throttled observer during gameplay.
    var d = document.getElementById('dungeon');
    if (d && (d.offsetWidth > 0 || d.width > 0)) return true;
    var s = document.getElementById('stats');
    if (s && s.offsetWidth > 0) return true;
    return false;
  }

  var lastInGame = false;
  function updateInGameClass() {
    var now = isInGame();
    document.body.classList.toggle('mwt-in-game', now);
    if (now) {
      // Re-apply zoom every tick while in-game. Cheap (just an inline
      // style assignment) and defends against webtiles rewriting the
      // canvas element's style during layout() recomputations.
      applyZoomToDungeon(loadZoom());
    }
    if (now && !lastInGame) {
      forceDungeonResize();
      setTimeout(forceDungeonResize, 120);
      setTimeout(forceDungeonResize, 500);
    }
    lastInGame = now;
  }

  function forceDungeonResize() {
    var c = document.getElementById('dungeon');
    if (c) {
      // Clear both inline CSS sizes (which webtiles sets on every fit_to)
      // and the canvas's width/height attributes (the drawing buffer).
      // Without zeroing the buffer, webtiles may measure the too-tall
      // current canvas when recomputing and re-derive the same wrong size.
      c.style.removeProperty('width');
      c.style.removeProperty('height');
      try {
        if (c.width && c.width > 0) c.setAttribute('width', '1');
        if (c.height && c.height > 0) c.setAttribute('height', '1');
      } catch (_) {}
    }
    try { window.dispatchEvent(new Event('resize')); } catch (_) {}
  }

  function installGameStateWatcher() {
    updateInGameClass();
    // MutationObserver on body subtree fires every time webtiles appends
    // a message, updates a stat span, etc. — many times per turn. Coalesce
    // into a single rAF-scheduled check so we never run updateInGameClass
    // more than once per frame. Also scope attribute watching to the
    // #game root swap (display/class) rather than the whole subtree, which
    // is where in-game entry/exit signals live anyway.
    var pending = false;
    function schedule() {
      if (pending) return;
      pending = true;
      requestAnimationFrame(function () {
        pending = false;
        updateInGameClass();
      });
    }
    try {
      // Watch only the direct children of body for add/remove (the game/
      // lobby/crt root swaps) and watch #game itself for style/display
      // flips. Don't observe subtree — a 30-cells-per-turn canvas update
      // fans out to hundreds of notifications we don't care about.
      var coarseMo = new MutationObserver(schedule);
      coarseMo.observe(document.body, { childList: true });
      var game = document.getElementById('game');
      if (game) {
        var fineMo = new MutationObserver(schedule);
        fineMo.observe(game, { attributes: true, attributeFilter: ['style', 'class'] });
      }
    } catch (_) { /* rely on slow polling + hashchange below */ }
    setInterval(updateInGameClass, 2500);
    window.addEventListener('hashchange', updateInGameClass);
    window.addEventListener('orientationchange', forceDungeonResize);
    installDungeonReapplyWatcher();
  }

  // Observe the canvas's width/height attributes so we re-apply zoom
  // every time webtiles rebuilds the canvas (fit_to runs), since that
  // can reset inline styles.
  function installDungeonReapplyWatcher() {
    var tries = 0;
    (function hook() {
      var d = document.getElementById('dungeon');
      if (!d) {
        if (++tries < 120) return setTimeout(hook, 100);
        return;
      }
      try {
        var mo = new MutationObserver(function () {
          requestAnimationFrame(function () { applyZoomToDungeon(loadZoom()); });
        });
        mo.observe(d, { attributes: true, attributeFilter: ['width', 'height', 'style'] });
      } catch (_) {}
    })();
  }

  // --------------------------------------------------------------------------
  // Patch jQuery measurements that webtiles' layout() function uses so
  // fit_to() gets mobile-correct values.
  //
  // Desktop layout assumes:
  //   remaining_width  = window_width  - $("#stats").outerWidth()
  //   remaining_height = window_height - $("#messages").outerHeight()
  //   dungeon_renderer.fit_to(remaining_width, remaining_height, 17)
  //
  // Our mobile CSS stacks #stats vertically as a 100vw strip at the top,
  // and #message_pane as a fixed 78px band above the on-screen keyboard.
  // So the desktop math gives remaining_width = 0 and remaining_height =
  // way too tall, and fit_to produces a broken 300x1782 canvas buffer.
  //
  // Intercept the two measurement calls on #stats and #messages so they
  // report the values that make `window - X = our actual dungeon area`.
  // --------------------------------------------------------------------------

  function patchWebtilesLayoutMetrics() {
    var attempts = 0;
    (function tryPatch() {
      var jq = window.jQuery || window.$;
      if (!jq || !jq.fn) {
        if (++attempts < 200) return setTimeout(tryPatch, 75);
        return;
      }
      if (jq.fn.__mwtPatched) return;
      jq.fn.__mwtPatched = true;

      var origOW = jq.fn.outerWidth;
      var origOH = jq.fn.outerHeight;

      jq.fn.outerWidth = function () {
        if (
          document.body.classList.contains('mwt-in-game')
          && this.length === 1
          && this[0]
          && this[0].id === 'stats'
        ) {
          // We want remaining_width = window.innerWidth, so stats appears
          // to have zero width in the horizontal layout math.
          return 0;
        }
        return origOW.apply(this, arguments);
      };

      jq.fn.outerHeight = function () {
        if (
          document.body.classList.contains('mwt-in-game')
          && this.length === 1
          && this[0]
          && this[0].id === 'messages'
        ) {
          // We want remaining_height = innerHeight - msg = actual dungeon
          // area. Dungeon area = innerHeight - keyboard - stats - message.
          // So msg (as reported to layout()) should be keyboard + stats + msg.
          var kbdH = cssPx('--mwt-kbd-h', 280);
          var msgH = cssPx('--mwt-msg-h', 78);
          var statsEl = document.getElementById('stats');
          var statsH = statsEl ? statsEl.getBoundingClientRect().height : 90;
          return Math.max(80, Math.round(kbdH + statsH + msgH));
        }
        return origOH.apply(this, arguments);
      };
    })();
  }

  function cssPx(varName, fallback) {
    var v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue(varName));
    return isFinite(v) && v > 0 ? v : fallback;
  }

  // --------------------------------------------------------------------------
  // Zoom (CSS scale on #dungeon, persisted in localStorage)
  // --------------------------------------------------------------------------

  function loadZoom() {
    var v = parseFloat(localStorage.getItem('mwt-zoom'));
    if (!(v > 0.5 && v < 4)) v = 1.75;
    return v;
  }
  function saveZoom(v) {
    try { localStorage.setItem('mwt-zoom', String(v)); } catch (_) {}
  }
  function applyZoom(v) {
    document.documentElement.style.setProperty('--mwt-zoom', String(v));
    applyZoomToDungeon(v);
    var lbl = document.getElementById('mwt-zoom-label');
    if (lbl) lbl.textContent = formatZoom(v);
  }

  function formatZoom(v) {
    return v.toFixed(2).replace(/\.?0+$/, '') + '×';
  }

  function applyZoomToDungeon(v) {
    var d = document.getElementById('dungeon');
    if (!d) return;
    // Direct property assignment is the universally-supported path for
    // non-standard CSS properties like `zoom`. setProperty() is allowed
    // to silently reject unknown property names, so belt-and-suspenders
    // with both.
    d.style.zoom = String(v);
    try { d.style.setProperty('zoom', String(v), 'important'); } catch (_) {}
  }
  function bumpZoom(delta) {
    var cur = loadZoom();
    var next = Math.max(0.75, Math.min(3.5, Math.round((cur + delta) * 100) / 100));
    saveZoom(next);
    applyZoom(next);
  }

  // --------------------------------------------------------------------------
  // Debug: dump DOM structure so the user can share it if layout is off.
  // --------------------------------------------------------------------------

  function dumpDomSnapshot() {
    var ids = ['game','left_column','right_column','dungeon','dungeon_pane','stats','stats_titleline','message_pane','messages_container','messages','minimap_block','minimap','monster_list','action-panel','chat','crt','crt-container','lobby','loader','ui-stack'];
    var savedZoom = null;
    try { savedZoom = localStorage.getItem('mwt-zoom'); } catch (_) {}
    var dungeon = document.getElementById('dungeon');
    var zoomInfo = {
      saved: savedZoom,
      cssVar: getComputedStyle(document.documentElement).getPropertyValue('--mwt-zoom').trim(),
      dungeonInlineZoom: dungeon ? (dungeon.style.zoom || null) : null,
      dungeonComputedZoom: dungeon ? (getComputedStyle(dungeon).zoom || null) : null,
      dungeonParentId: dungeon && dungeon.parentNode ? (dungeon.parentNode.id || dungeon.parentNode.tagName) : null,
    };
    // Walk #game's direct children so we can see who else is competing
    // for flex space. Lists the DOM order with id/tag/display/size/flex.
    var gameKids = [];
    var g = document.getElementById('game');
    if (g) {
      for (var i = 0; i < g.children.length; i++) {
        var k = g.children[i];
        var cs = getComputedStyle(k);
        var r = k.getBoundingClientRect();
        gameKids.push({
          i: i,
          id: k.id || null,
          tag: k.tagName,
          cls: k.className || null,
          display: cs.display,
          flex: cs.flex,
          position: cs.position,
          w: Math.round(r.width),
          h: Math.round(r.height),
        });
      }
    }
    var summary = { url: location.href, innerWidth: innerWidth, innerHeight: innerHeight, dpr: devicePixelRatio, inGame: isInGame(), zoom: zoomInfo, gameKids: gameKids };
    ids.forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) { summary[id] = null; return; }
      var r = el.getBoundingClientRect();
      var cs = getComputedStyle(el);
      var entry = {
        display: cs.display,
        w: Math.round(r.width),
        h: Math.round(r.height),
        top: Math.round(r.top),
        left: Math.round(r.left),
        children: el.children.length,
        tag: el.tagName,
      };
      // Canvas-specific: capture the drawing buffer dims (width/height
      // attributes) and the inline style dims, which are often different
      // from the rendered size and tell us what fit_to decided.
      if (el.tagName === 'CANVAS') {
        entry.bufW = el.width;
        entry.bufH = el.height;
        entry.styleW = el.style.width || null;
        entry.styleH = el.style.height || null;
      }
      // Also capture any inline style dims on non-canvas nodes for diffing.
      if (el.style && (el.style.width || el.style.height)) {
        entry.styleW = el.style.width || null;
        entry.styleH = el.style.height || null;
      }
      summary[id] = entry;
    });
    var text = JSON.stringify(summary, null, 2);
    console.log('[mwt] DOM snapshot:\n' + text);
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text);
      }
    } catch (_) {}
    alert('DOM snapshot copied to clipboard (also in console).');
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
