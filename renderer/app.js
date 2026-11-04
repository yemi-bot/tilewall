'use strict';

(function () {
  const tw = window.tw;
  const { computeLayout } = window.TWLayout;
  const { splitInput, normalizeUrl } = window.TWUrls;
  const FILL = window.TWFill;
  const ICON = window.TWIcons;

  const PARTITION = 'persist:tilewall';
  const LAYOUTS = ['grid', 'focus', 'solo'];
  const LAYOUT_NAMES = { grid: 'Grid', focus: 'Focus', solo: 'Solo' };
  const GAPS = [0, 2, 6];
  const FOLLOW_DWELL_MS = 450;
  // main.js passes adfix=0 when the YouTube ad layer is switched off (A/B tests)
  const AD_FIX = !/[?&]adfix=0/.test(location.search);

  const state = {
    tiles: [], // { id, url, mode: 'fill' | 'page', title }
    layout: 'grid',
    prevLayout: 'grid',
    mainId: null,
    audioId: null,
    muteAll: false,
    gap: 2,
    followMouse: false,
    adblock: true,
    clean: false,
  };

  // id -> { t, el, wv, ready, firstLoadDone, rect, barTimer }
  const recs = new Map();

  const $ = (sel, root) => (root || document).querySelector(sel);
  const stage = $('#stage');
  const empty = $('#empty');
  const emptyInput = $('#empty-input');
  const dock = $('#dock');
  const dockHot = $('#dock-hot');
  const addInput = $('#add-input');
  const help = $('#help');
  const toastEl = $('#toast');
  const toastText = $('#toast-text');
  const toastAction = $('#toast-action');
  const shield = $('#drag-shield');

  function newId() {
    return 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  // ---------- saving ----------

  let saveTimer = null;
  let started = false;

  function snapshot() {
    return {
      tiles: state.tiles.map(({ id, url, mode, title }) => ({ id, url, mode, title })),
      layout: state.layout,
      prevLayout: state.prevLayout,
      mainId: state.mainId,
      audioId: state.audioId,
      muteAll: state.muteAll,
      gap: state.gap,
      followMouse: state.followMouse,
      adblock: state.adblock,
      clean: state.clean,
    };
  }

  function scheduleSave() {
    if (!started) return; // never overwrite the saved file before it has been read
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveTimer = null;
      tw.saveState(snapshot());
    }, 250);
  }

  // Closing the window: write the latest state right now, not 250 ms from now.
  window.addEventListener('beforeunload', () => {
    if (!started) return;
    clearTimeout(saveTimer);
    tw.saveStateNow(snapshot());
  });

  function restore(data) {
    if (!data || typeof data !== 'object') return;
    const seen = new Set();
    if (Array.isArray(data.tiles)) {
      for (const t of data.tiles) {
        if (!t || typeof t.url !== 'string' || !/^https?:\/\//i.test(t.url)) continue;
        let id = typeof t.id === 'string' && t.id ? t.id : newId();
        if (seen.has(id)) id = newId();
        seen.add(id);
        state.tiles.push({
          id,
          url: t.url,
          mode: t.mode === 'page' ? 'page' : 'fill',
          title: typeof t.title === 'string' ? t.title : '',
        });
      }
    }
    if (LAYOUTS.includes(data.layout)) state.layout = data.layout;
    if (data.prevLayout === 'grid' || data.prevLayout === 'focus') state.prevLayout = data.prevLayout;
    if (seen.has(data.mainId)) state.mainId = data.mainId;
    if (seen.has(data.audioId)) state.audioId = data.audioId;
    if (GAPS.includes(data.gap)) state.gap = data.gap;
    state.muteAll = !!data.muteAll;
    state.followMouse = !!data.followMouse;
    state.clean = !!data.clean;
    state.adblock = data.adblock !== false;
  }

  // ---------- toast ----------

  let toastTimer = null;
  let toastHandler = null;
  function toast(msg, action) {
    toastText.textContent = msg;
    toastHandler = action ? action.run : null;
    toastAction.hidden = !action;
    if (action) toastAction.textContent = action.label;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), action ? 5000 : 2000);
  }
  toastAction.addEventListener('click', () => {
    const run = toastHandler;
    toastHandler = null;
    toastEl.classList.remove('show');
    if (run) run();
  });

  // ---------- tiles ----------

  function hostOf(url) {
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch (e) {
      return url;
    }
  }

  function buildTile(t) {
    const el = document.createElement('div');
    el.className = 'tile';
    el.dataset.id = t.id;
    el.innerHTML =
      '<div class="tile-status" hidden><div class="status-card"><div class="spinner"></div>' +
      '<div class="status-text"></div><button class="btn status-retry" type="button" hidden>Retry</button></div></div>' +
      '<div class="tile-hot" aria-hidden="true"></div>' +
      '<div class="tile-bar" role="toolbar" aria-label="Tile controls">' +
      '<button class="tb grip" type="button" data-act="drag" title="Drag to move" aria-label="Drag to move">' + ICON.grip + '</button>' +
      '<span class="tile-num"></span>' +
      '<button class="tile-title" type="button" data-act="edit" title="Click to change the link"></button>' +
      '<form class="tile-url" hidden><input class="field" type="text" spellcheck="false" autocomplete="off" aria-label="Link for this tile"></form>' +
      '<button class="tb" type="button" data-act="audio" title="Hear this tile" aria-label="Hear this tile">' + ICON.volume + '</button>' +
      '<button class="tb opt" type="button" data-act="main" title="Make this the big tile" aria-label="Make this the big tile">' + ICON.focus + '</button>' +
      '<button class="tb" type="button" data-act="mode" aria-label="Fill or page"></button>' +
      '<button class="tb opt" type="button" data-act="back" title="Back" aria-label="Back">' + ICON.back + '</button>' +
      '<button class="tb opt" type="button" data-act="reload" title="Reload" aria-label="Reload">' + ICON.refresh + '</button>' +
      '<button class="tb opt" type="button" data-act="external" title="Open in your browser" aria-label="Open in your browser">' + ICON.external + '</button>' +
      '<button class="tb close" type="button" data-act="close" title="Remove tile" aria-label="Remove tile">' + ICON.close + '</button>' +
      '</div>' +
      '<div class="tile-flash" aria-hidden="true">' + ICON.volume + '</div>' +
      '<div class="tile-bignum" aria-hidden="true"><span></span></div>';

    const wv = document.createElement('webview');
    wv.setAttribute('partition', PARTITION);
    wv.setAttribute('src', t.url);
    el.prepend(wv);

    const rec = { t, el, wv, ready: false, attached: false, firstLoadDone: false, rect: null, barTimer: null, status: null };
    wireTile(rec);
    updateTitle(rec);
    updateModeBtn(rec);
    return rec;
  }

  function setStatus(rec, kind, text) {
    const box = $('.tile-status', rec.el);
    rec.status = kind;
    if (!kind) {
      box.hidden = true;
      return;
    }
    box.hidden = false;
    box.classList.toggle('error', kind === 'error');
    $('.status-text', box).textContent = text || '';
    $('.status-retry', box).hidden = kind !== 'error';
  }

  function updateTitle(rec) {
    const btn = $('.tile-title', rec.el);
    const label = rec.t.title || hostOf(rec.t.url);
    btn.textContent = label;
    btn.title = rec.t.url + '\nClick to change the link';
  }

  function updateModeBtn(rec) {
    const btn = $('[data-act="mode"]', rec.el);
    const fill = rec.t.mode === 'fill';
    btn.innerHTML = fill ? ICON.fill : ICON.page;
    btn.title = fill ? 'Video fills the tile. Click to show the whole page.' : 'Showing the whole page. Click to make the video fill the tile.';
    btn.classList.toggle('on', fill);
  }

  function applyFill(rec) {
    if (!rec.ready) return;
    rec.wv.executeJavaScript(FILL.script(rec.t.mode === 'fill', AD_FIX && state.adblock)).catch(() => {});
  }

  function onReady(rec) {
    rec.ready = true;
    rec.attached = true; // webview methods work from the first dom-ready on, even after a crash
    rec.wv.insertCSS(FILL.css).catch(() => {});
    applyFill(rec);
    applyAudioTo(rec);
    if (rec.status === 'loading') setStatus(rec, null);
  }

  function wireTile(rec) {
    const { el, wv, t } = rec;

    wv.addEventListener('did-start-loading', () => {
      if (!rec.firstLoadDone && rec.status !== 'error') setStatus(rec, 'loading', 'Loading ' + hostOf(t.url));
    });
    // Any new page load (Ctrl+R, right-click Reload, a new link) clears an error card.
    wv.addEventListener('did-start-navigation', (e) => {
      if (e.isMainFrame && !e.isInPlace && rec.status === 'error') setStatus(rec, 'loading', 'Loading ' + hostOf(e.url || t.url));
    });
    wv.addEventListener('dom-ready', () => onReady(rec));
    wv.addEventListener('did-stop-loading', () => {
      rec.firstLoadDone = true;
      if (rec.status === 'loading') setStatus(rec, null);
    });
    wv.addEventListener('did-fail-load', (e) => {
      if (!e.isMainFrame || e.errorCode === -3) return; // -3 = aborted by a new navigation
      setStatus(rec, 'error', 'Could not load ' + hostOf(e.validatedURL || t.url) + ' (' + (e.errorDescription || e.errorCode) + ')');
    });
    wv.addEventListener('render-process-gone', () => {
      rec.ready = false;
      setStatus(rec, 'error', 'This tile stopped working.');
    });
    wv.addEventListener('page-title-updated', (e) => {
      t.title = e.title || '';
      updateTitle(rec);
      scheduleSave();
    });

    $('.status-retry', el).addEventListener('click', () => {
      rec.firstLoadDone = false;
      setStatus(rec, 'loading', 'Loading ' + hostOf(t.url));
      navigate(rec, t.url);
    });

    // Tile bar: show on hovering the top edge, hide a moment after leaving.
    const bar = $('.tile-bar', el);
    $('.tile-hot', el).addEventListener('mouseenter', () => showBar(rec));
    bar.addEventListener('mouseenter', () => showBar(rec));
    bar.addEventListener('mouseleave', () => hideBarSoon(rec));

    bar.addEventListener('mousedown', (e) => {
      const grip = e.target.closest('[data-act="drag"]');
      if (grip && e.button === 0) startDrag(rec, e);
    });
    bar.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-act]');
      if (!btn) return;
      tileAction(rec, btn.dataset.act);
    });

    const form = $('.tile-url', el);
    const input = $('input', form);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const url = normalizeUrl(input.value);
      if (!url) {
        toast('That does not look like a link.');
        return;
      }
      t.url = url;
      t.title = '';
      updateTitle(rec);
      rec.firstLoadDone = false;
      navigate(rec, url);
      endEdit(rec);
      scheduleSave();
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        endEdit(rec);
      }
    });
    input.addEventListener('blur', () => endEdit(rec));
  }

  function showBar(rec) {
    if (state.clean) return;
    clearTimeout(rec.barTimer);
    rec.barTimer = null;
    rec.el.classList.add('bar-show');
  }

  // A pending hide is never restarted, so a moving cursor cannot keep a bar up.
  function hideBarSoon(rec) {
    if (rec.barTimer || !rec.el.classList.contains('bar-show') || rec.el.classList.contains('editing')) return;
    rec.barTimer = setTimeout(() => {
      rec.barTimer = null;
      rec.el.classList.remove('bar-show');
    }, 350);
  }

  function startEdit(rec) {
    const form = $('.tile-url', rec.el);
    const input = $('input', form);
    rec.el.classList.add('editing');
    $('.tile-title', rec.el).hidden = true;
    form.hidden = false;
    input.value = rec.t.url;
    input.focus();
    input.select();
  }

  function endEdit(rec) {
    if (!rec.el.classList.contains('editing')) return;
    rec.el.classList.remove('editing');
    $('.tile-url', rec.el).hidden = true;
    $('.tile-title', rec.el).hidden = false;
    hideBarSoon(rec);
  }

  function navigate(rec, url) {
    if (rec.attached) rec.wv.loadURL(url).catch(() => {});
    else rec.wv.setAttribute('src', url);
  }

  function tileAction(rec, act) {
    const t = rec.t;
    switch (act) {
      case 'edit':
        startEdit(rec);
        break;
      case 'audio':
        if (state.audioId === t.id && !state.muteAll) setMuteAll(true);
        else setAudio(t.id);
        break;
      case 'main':
        state.mainId = t.id;
        if (state.layout === 'grid') setLayout('focus');
        else relayout();
        scheduleSave();
        break;
      case 'mode':
        t.mode = t.mode === 'fill' ? 'page' : 'fill';
        updateModeBtn(rec);
        applyFill(rec);
        toast(t.mode === 'fill' ? 'Video fills the tile.' : 'Showing the whole page.');
        scheduleSave();
        break;
      case 'back':
        try {
          if (rec.attached && rec.wv.canGoBack()) rec.wv.goBack();
        } catch (e) {
          /* not ready */
        }
        break;
      case 'reload':
        reloadTile(t.id);
        break;
      case 'external':
        tw.openExternal(rec.attached ? rec.wv.getURL() : t.url);
        break;
      case 'close':
        removeTile(t.id);
        break;
      default:
        break;
    }
  }

  function addUrls(text) {
    const urls = splitInput(text);
    if (!urls.length) {
      toast('Paste a link, like youtube.com/watch?v=... or twitch.tv/name');
      return 0;
    }
    for (const url of urls) addTile({ id: newId(), url, mode: 'fill', title: '' });
    toast(urls.length === 1 ? 'Added a tile.' : 'Added ' + urls.length + ' tiles.');
    return urls.length;
  }

  function addTile(t, index) {
    if (typeof index === 'number') state.tiles.splice(index, 0, t);
    else state.tiles.push(t);
    const rec = buildTile(t);
    recs.set(t.id, rec);
    stage.appendChild(rec.el);
    if (!state.audioId && !state.muteAll) state.audioId = t.id;
    if (!state.mainId) state.mainId = t.id;
    refresh();
    return rec;
  }

  function removeTile(id) {
    const i = state.tiles.findIndex((x) => x.id === id);
    if (i < 0) return;
    const [t] = state.tiles.splice(i, 1);
    const rec = recs.get(id);
    rec.el.remove();
    recs.delete(id);
    const next = state.tiles[Math.min(i, state.tiles.length - 1)] || null;
    const hadAudio = state.audioId === id;
    const wasMain = state.mainId === id;
    if (hadAudio) state.audioId = next ? next.id : null;
    if (wasMain) state.mainId = next ? next.id : null;
    if (!state.tiles.length && state.layout === 'solo') state.layout = state.prevLayout;
    refresh();
    toast('Removed ' + (t.title || hostOf(t.url)) + '.', {
      label: 'Undo',
      run: () => {
        if (recs.has(t.id)) return; // already restored
        addTile({ ...t }, Math.min(i, state.tiles.length));
        // give back the sound slot without unmuting if everything is muted
        if (hadAudio) state.audioId = t.id;
        if (wasMain) state.mainId = t.id;
        refresh();
        if (hadAudio && !state.muteAll) flash(t.id);
      },
    });
  }

  function reloadTile(id) {
    const rec = recs.get(id);
    if (!rec) return;
    if (rec.attached) rec.wv.reload();
    else navigate(rec, rec.t.url);
  }

  function reloadAll() {
    for (const t of state.tiles) reloadTile(t.id);
    toast('Reloading all tiles.');
  }

  // ---------- layout ----------

  function relayout() {
    const W = stage.clientWidth;
    const H = stage.clientHeight;
    const mainIndex = state.tiles.findIndex((t) => t.id === state.mainId);
    const rects = computeLayout({ mode: state.layout, count: state.tiles.length, width: W, height: H, gap: state.gap, mainIndex });
    state.tiles.forEach((t, i) => {
      const rec = recs.get(t.id);
      const r = rects[i];
      if (!rec || !r) return;
      const x0 = Math.round(r.x);
      const y0 = Math.round(r.y);
      const x1 = Math.round(r.x + r.w);
      const y1 = Math.round(r.y + r.h);
      rec.rect = { x: x0, y: y0, w: x1 - x0, h: y1 - y0, hidden: r.hidden };
      const s = rec.el.style;
      s.left = x0 + 'px';
      s.top = y0 + 'px';
      s.width = x1 - x0 + 'px';
      s.height = y1 - y0 + 'px';
      rec.el.classList.toggle('is-hidden', !!r.hidden);
      const n = String(i + 1);
      $('.tile-num', rec.el).textContent = n;
      $('.tile-bignum span', rec.el).textContent = n;
    });
  }

  function setLayout(mode) {
    if (!LAYOUTS.includes(mode)) return;
    if (mode === 'solo' && state.layout !== 'solo') state.prevLayout = state.layout;
    state.layout = mode;
    if (!state.tiles.some((t) => t.id === state.mainId)) state.mainId = state.audioId || (state.tiles[0] && state.tiles[0].id) || null;
    refresh();
    toast('Layout: ' + LAYOUT_NAMES[mode]);
  }

  function cycleLayout() {
    setLayout(LAYOUTS[(LAYOUTS.indexOf(state.layout) + 1) % LAYOUTS.length]);
  }

  function toggleSolo() {
    if (!state.tiles.length) return;
    setLayout(state.layout === 'solo' ? state.prevLayout || 'grid' : 'solo');
  }

  function tileAt(x, y) {
    for (const t of state.tiles) {
      const r = recs.get(t.id) && recs.get(t.id).rect;
      if (r && !r.hidden && x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) return t.id;
    }
    return null;
  }

  // ---------- audio ----------

  function applyAudioTo(rec) {
    const muted = state.muteAll || rec.t.id !== state.audioId;
    rec.el.classList.toggle('has-audio', !muted);
    const btn = $('[data-act="audio"]', rec.el);
    btn.classList.toggle('on', !muted);
    btn.title = muted ? 'Hear this tile' : 'You are hearing this tile. Click to mute.';
    if (rec.attached) {
      try {
        rec.wv.setAudioMuted(muted);
      } catch (e) {
        /* not attached yet; dom-ready will apply it */
      }
    }
  }

  function applyAudio() {
    for (const rec of recs.values()) applyAudioTo(rec);
    syncDock();
  }

  function flash(id) {
    const rec = recs.get(id);
    if (!rec) return;
    rec.el.classList.add('flash');
    clearTimeout(rec.flashTimer);
    rec.flashTimer = setTimeout(() => rec.el.classList.remove('flash'), 1100);
  }

  function setAudio(id, opts) {
    const o = opts || {};
    if (!recs.has(id)) return;
    state.audioId = id;
    state.muteAll = false;
    if (o.alsoMain) state.mainId = id;
    applyAudio();
    if (o.alsoMain && state.layout !== 'grid') relayout();
    flash(id);
    if (!o.quiet) {
      const i = state.tiles.findIndex((t) => t.id === id);
      toast('Hearing tile ' + (i + 1) + '.');
    }
    scheduleSave();
  }

  function setMuteAll(on) {
    state.muteAll = !!on;
    if (!state.muteAll && !recs.has(state.audioId) && state.tiles.length) state.audioId = state.tiles[0].id;
    applyAudio();
    toast(state.muteAll ? 'All tiles muted.' : 'Sound back on.');
    scheduleSave();
  }

  function setFollow(on) {
    state.followMouse = !!on;
    syncDock();
    scheduleSave();
  }

  // ---------- pointer (OS cursor position, sent by the main process) ----------

  const EDGE = 10; // px at the top of a tile / bottom of the window that reveal controls
  const BAR_H = 44;

  // Sound follows the mouse: switch after the cursor rests on a tile briefly.
  let followCand = null;
  let followSince = 0;
  let followTimer = null;

  function overControls(p) {
    if (!help.hidden || !empty.hidden) return true;
    if (dock.classList.contains('show')) {
      const r = dock.getBoundingClientRect();
      if (p.x >= r.left - 12 && p.x < r.right + 12 && p.y >= r.top - 12 && p.y < r.bottom + 12) return true;
    }
    const over = tileAt(p.x, p.y);
    const rec = over && recs.get(over);
    return !!(rec && rec.el.classList.contains('bar-show') && p.y < rec.rect.y + BAR_H);
  }

  function followCheck(p) {
    clearTimeout(followTimer);
    if (!state.followMouse || drag || state.muteAll || !p.inside || !p.focused || overControls(p)) {
      followCand = null;
      return;
    }
    const id = tileAt(p.x, p.y);
    if (!id || id === state.audioId) {
      followCand = null;
      return;
    }
    if (followCand !== id) {
      followCand = id;
      followSince = Date.now();
    }
    const wait = FOLLOW_DWELL_MS - (Date.now() - followSince);
    if (wait <= 0) {
      followCand = null;
      setAudio(id, { quiet: true });
    } else {
      // the cursor may rest without moving, so check again when the dwell is up
      followTimer = setTimeout(() => followCheck(p), wait + 10);
    }
  }

  function hoverCheck(p) {
    if (drag) return;
    if (state.clean || !p.inside) {
      for (const rec of recs.values()) hideBarSoon(rec);
      hideDockSoon();
      return;
    }
    const near = (r, pad) => p.x >= r.left - pad && p.x < r.right + pad && p.y >= r.top - pad && p.y < r.bottom + pad;
    const inDock = dock.classList.contains('show') && near(dock.getBoundingClientRect(), 12);
    if (p.y >= innerHeight - EDGE || inDock) showDock();
    else hideDockSoon();

    for (const rec of recs.values()) {
      const r = rec.rect;
      if (!r || r.hidden) continue;
      const inX = p.x >= r.x && p.x < r.x + r.w;
      const atEdge = inX && p.y >= r.y && p.y < r.y + EDGE;
      const onBar = rec.el.classList.contains('bar-show') && inX && p.y >= r.y && p.y < r.y + BAR_H;
      if ((atEdge || onBar) && !inDock) showBar(rec);
      else hideBarSoon(rec);
    }
  }

  function onPointer(p) {
    followCheck(p);
    hoverCheck(p);
  }
  tw.onPointer(onPointer);

  // ---------- drag to move ----------

  let drag = null;

  function startDrag(rec, e) {
    e.preventDefault();
    drag = { id: rec.t.id, overId: null };
    shield.hidden = false;
    rec.el.classList.add('drag-src');
    rec.el.classList.remove('bar-show');
  }

  function setDropTarget(id) {
    if (!drag || drag.overId === id) return;
    if (drag.overId && recs.has(drag.overId)) recs.get(drag.overId).el.classList.remove('drop-target');
    drag.overId = id;
    if (id && recs.has(id)) recs.get(id).el.classList.add('drop-target');
  }

  function endDrag(commit) {
    if (!drag) return;
    const { id, overId } = drag;
    setDropTarget(null);
    if (recs.has(id)) recs.get(id).el.classList.remove('drag-src');
    shield.hidden = true;
    drag = null;
    if (commit && overId && overId !== id) {
      const a = state.tiles.findIndex((t) => t.id === id);
      const b = state.tiles.findIndex((t) => t.id === overId);
      if (a >= 0 && b >= 0) {
        const tmp = state.tiles[a];
        state.tiles[a] = state.tiles[b];
        state.tiles[b] = tmp;
        // In Focus the big spot follows the drop: a strip tile dropped on the
        // big one becomes big, and the big one dropped on the strip shrinks.
        if (state.layout === 'focus') {
          if (state.mainId === overId) state.mainId = id;
          else if (state.mainId === id) state.mainId = overId;
        }
        relayout();
        scheduleSave();
      }
    }
  }

  shield.addEventListener('mousemove', (e) => {
    if (!drag) return;
    const id = tileAt(e.clientX, e.clientY);
    setDropTarget(id && id !== drag.id ? id : null);
  });
  shield.addEventListener('mouseup', () => endDrag(true));
  shield.addEventListener('mouseleave', () => endDrag(false));

  // ---------- dock (bottom toolbar) ----------

  let dockTimer = null;
  let dockPinned = false;

  function showDock() {
    if (state.clean && !dockPinned) return;
    clearTimeout(dockTimer);
    dockTimer = null;
    dock.classList.add('show');
  }

  function hideDockSoon() {
    // only typing in the link field holds it open; a clicked button keeps focus but must not
    if (dockTimer || !dock.classList.contains('show') || dockPinned || document.activeElement === addInput) return;
    dockTimer = setTimeout(() => {
      dockTimer = null;
      dock.classList.remove('show');
    }, 500);
  }

  function openAdd() {
    if (!state.tiles.length) {
      emptyInput.focus();
      return;
    }
    dockPinned = true;
    showDock();
    addInput.focus();
    addInput.select();
  }

  dockHot.addEventListener('mouseenter', showDock);
  dock.addEventListener('mouseenter', showDock);
  dock.addEventListener('mouseleave', hideDockSoon);
  addInput.addEventListener('blur', () => {
    dockPinned = false;
    hideDockSoon();
  });
  addInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      addInput.value = '';
      addInput.blur();
      dock.classList.remove('show');
    }
  });
  $('#add-form').addEventListener('submit', (e) => {
    e.preventDefault();
    if (addUrls(addInput.value)) {
      addInput.value = '';
      addInput.blur();
      dock.classList.remove('show');
    }
  });

  dock.querySelectorAll('[data-layout]').forEach((b) => {
    b.innerHTML = ICON[b.dataset.layout];
    b.addEventListener('click', () => {
      if (!state.tiles.length) return;
      setLayout(b.dataset.layout);
    });
  });

  const btnMute = $('#btn-mute');
  const btnFollow = $('#btn-follow');
  const btnGap = $('#btn-gap');
  const btnAdblock = $('#btn-adblock');
  const btnClean = $('#btn-clean');
  const btnFull = $('#btn-full');
  const btnHelp = $('#btn-help');
  btnFollow.innerHTML = ICON.pointer;
  btnGap.innerHTML = ICON.gap;
  btnAdblock.innerHTML = ICON.shield;
  btnClean.innerHTML = ICON.eyeOff;
  btnFull.innerHTML = ICON.maximize;
  btnHelp.innerHTML = ICON.help;
  $('#help-close').innerHTML = ICON.close;

  let isFull = false;
  let adblockLive = { on: false, error: null };
  let startupAdblockPending = false;

  function syncDock() {
    dock.querySelectorAll('[data-layout]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.layout === state.layout)));
    btnMute.innerHTML = state.muteAll ? ICON.mute : ICON.volume;
    btnMute.setAttribute('aria-pressed', String(state.muteAll));
    btnMute.title = state.muteAll ? 'Unmute (Ctrl+M)' : 'Mute all (Ctrl+M)';
    btnFollow.setAttribute('aria-pressed', String(state.followMouse));
    btnFollow.title = state.followMouse ? 'Sound follows your mouse: on (Ctrl+Shift+M)' : 'Sound follows your mouse: off (Ctrl+Shift+M)';
    btnGap.title = 'Space between tiles: ' + state.gap + 'px';
    btnAdblock.setAttribute('aria-pressed', String(state.adblock));
    btnAdblock.title = !state.adblock ? 'Ad blocking: off'
      : adblockLive.on ? 'Ad blocking: on'
      : adblockLive.error ? 'Ad blocking: could not load the block list (' + adblockLive.error + ')'
      : 'Ad blocking: starting...';
    btnClean.setAttribute('aria-pressed', String(state.clean));
    btnFull.setAttribute('aria-pressed', String(isFull));
    document.body.classList.toggle('clean', state.clean);
  }

  btnMute.addEventListener('click', () => setMuteAll(!state.muteAll));
  btnFollow.addEventListener('click', () => {
    setFollow(!state.followMouse);
    toast(state.followMouse ? 'Sound follows your mouse.' : 'Sound stays put.');
  });
  btnGap.addEventListener('click', () => {
    state.gap = GAPS[(GAPS.indexOf(state.gap) + 1) % GAPS.length];
    relayout();
    syncDock();
    toast('Space between tiles: ' + state.gap + 'px');
    scheduleSave();
  });
  // state.adblock is what you chose (saved). adblockLive is what main reports
  // right now: the block list can still be loading, or fail when offline.
  btnAdblock.addEventListener('click', async () => {
    state.adblock = !state.adblock;
    startupAdblockPending = false;
    syncDock();
    scheduleSave();
    for (const rec of recs.values()) applyFill(rec); // ad skipping follows at once
    const r = await tw.setAdblock(state.adblock);
    adblockLive = r;
    syncDock();
    if (!r.ok) toast('Ad blocking could not start: ' + (r.error || 'unknown error') + '. It will try again next launch.');
    else if (state.adblock) toast('Ad blocking on. Reload tiles to apply.', { label: 'Reload all', run: reloadAll });
    else toast('Ad blocking off.', { label: 'Reload all', run: reloadAll });
  });
  tw.onAdblock((s) => {
    const wasOn = adblockLive.on;
    adblockLive = s;
    syncDock();
    if (state.adblock && s.on && !wasOn && started && state.tiles.length) {
      // Tiles that loaded before the block list was ready played unprotected
      // (first launch, slow network), so reload them once it is.
      if (startupAdblockPending) {
        startupAdblockPending = false;
        reloadAll();
        toast('Ad blocking ready. Reloaded the tiles.');
      }
    }
  });
  btnClean.addEventListener('click', () => toggleClean());
  btnFull.addEventListener('click', () => tw.toggleFullscreen());
  btnHelp.addEventListener('click', () => toggleHelp(true));

  function toggleClean() {
    state.clean = !state.clean;
    if (state.clean) {
      dock.classList.remove('show');
      for (const rec of recs.values()) rec.el.classList.remove('bar-show');
    }
    syncDock();
    toast(state.clean ? 'Controls hidden. Ctrl+H brings them back.' : 'Controls back.');
    scheduleSave();
  }

  // ---------- help ----------

  function toggleHelp(force) {
    const open = typeof force === 'boolean' ? force : help.hidden;
    help.hidden = !open;
    if (open) $('#help-close').focus();
  }
  $('#help-close').addEventListener('click', () => toggleHelp(false));
  help.addEventListener('click', (e) => {
    if (e.target === help) toggleHelp(false);
  });

  // ---------- empty state ----------

  $('#empty-form').addEventListener('submit', (e) => {
    e.preventDefault();
    if (addUrls(emptyInput.value)) emptyInput.value = '';
  });
  emptyInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      $('#empty-form').requestSubmit();
    }
  });

  function refresh() {
    const none = state.tiles.length === 0;
    if (empty.hidden !== !none) {
      empty.hidden = !none;
      if (none) setTimeout(() => emptyInput.focus(), 0);
    }
    relayout();
    applyAudio();
    scheduleSave();
  }

  // Drop links onto the toolbar or empty screen to add them.
  document.addEventListener('dragover', (e) => e.preventDefault());
  document.addEventListener('drop', (e) => {
    e.preventDefault();
    const dt = e.dataTransfer;
    const text = (dt && (dt.getData('text/uri-list') || dt.getData('text/plain'))) || '';
    if (text) addUrls(text);
  });

  // ---------- hotkeys ----------

  function currentId() {
    return state.audioId || state.mainId || (state.tiles[0] && state.tiles[0].id) || null;
  }

  function onHotkey(k) {
    if (k.indexOf('audio:') === 0) {
      const t = state.tiles[Number(k.slice(6)) - 1];
      if (t) setAudio(t.id, { alsoMain: true });
      return;
    }
    switch (k) {
      case 'add':
        openAdd();
        break;
      case 'layout':
        if (state.tiles.length) cycleLayout();
        break;
      case 'solo':
        toggleSolo();
        break;
      case 'chrome':
        toggleClean();
        break;
      case 'muteall':
        setMuteAll(!state.muteAll);
        break;
      case 'follow':
        setFollow(!state.followMouse);
        toast(state.followMouse ? 'Sound follows your mouse.' : 'Sound stays put.');
        break;
      case 'reload':
        if (currentId()) reloadTile(currentId());
        break;
      case 'reloadall':
        reloadAll();
        break;
      case 'help':
        toggleHelp();
        break;
      default:
        break;
    }
  }

  tw.onHotkey(onHotkey);
  tw.onFullscreen((on) => {
    isFull = on;
    syncDock();
  });

  let ctrlTimer = null;
  let ctrlSafety = null;
  tw.onCtrl((down) => {
    clearTimeout(ctrlTimer);
    clearTimeout(ctrlSafety);
    if (down) {
      ctrlTimer = setTimeout(() => document.body.classList.add('show-nums'), 350);
      ctrlSafety = setTimeout(() => document.body.classList.remove('show-nums'), 8000);
    } else {
      document.body.classList.remove('show-nums');
    }
  });
  window.addEventListener('blur', () => document.body.classList.remove('show-nums'));

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (drag) endDrag(false);
    else if (!help.hidden) toggleHelp(false);
  });

  new ResizeObserver(() => relayout()).observe(stage);

  // ---------- start ----------

  async function start() {
    restore(await tw.loadState());
    adblockLive = await tw.adblockStatus();
    startupAdblockPending = state.adblock && !adblockLive.on;
    isFull = await tw.isFullscreen();
    for (const t of state.tiles) {
      const rec = buildTile(t);
      recs.set(t.id, rec);
      stage.appendChild(rec.el);
    }
    if (!state.mainId && state.tiles.length) state.mainId = state.tiles[0].id;
    empty.hidden = !!state.tiles.length;
    if (!state.tiles.length) emptyInput.focus();
    relayout();
    applyAudio();
    started = true;
  }

  // Handy for debugging from DevTools (Ctrl+Shift+I) and for the smoke test.
  window.__tilewall = { state, recs, onHotkey, onPointer, addUrls, relayout, setLayout, setAudio };

  start();
})();
