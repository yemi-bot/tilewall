// "Fill" mode: make a page's main player cover the whole tile, like fullscreen.
// FILL_CSS is injected with webview.insertCSS (beats the page's own CSP), and
// install() runs inside the tile page through webview.executeJavaScript.
(function (root) {
  const FILL_CSS = `
html[data-tw-fill], html[data-tw-fill] body {
  overflow: hidden !important;
  background: #000 !important;
}
html[data-tw-fill] body { visibility: hidden !important; }
html[data-tw-fill] [data-tw-target] {
  visibility: visible !important;
  position: fixed !important;
  top: 0 !important; left: 0 !important; right: auto !important; bottom: auto !important;
  width: 100vw !important; height: 100vh !important;
  min-width: 0 !important; min-height: 0 !important;
  max-width: none !important; max-height: none !important;
  margin: 0 !important; padding: 0 !important; border: 0 !important; border-radius: 0 !important;
  transform: none !important;
  z-index: 2147483647 !important;
  background: #000 !important;
}
html[data-tw-fill] [data-tw-anc] {
  transform: none !important; filter: none !important; contain: none !important;
  will-change: auto !important; perspective: none !important; backdrop-filter: none !important;
  clip-path: none !important; mask: none !important; -webkit-mask: none !important;
}
html[data-tw-fill] [data-tw-chain] {
  width: 100% !important; height: 100% !important;
  max-width: none !important; max-height: none !important;
  top: 0 !important; left: 0 !important; transform: none !important;
}
html[data-tw-fill] [data-tw-video] {
  width: 100% !important; height: 100% !important;
  max-width: none !important; max-height: none !important;
  top: 0 !important; left: 0 !important;
  object-fit: contain !important;
}
html[data-tw-fill][data-tw-yt] .ytp-chrome-bottom {
  width: calc(100% - 24px) !important;
  left: 12px !important;
}
`;

  // Runs inside the tile page. Must be self-contained (it is sent as source text).
  function install() {
    if (window.__tw) return window.__tw;
    const H = document.documentElement;
    const host = location.hostname.replace(/^(www\.|m\.)/, '');
    const isYT = /(^|\.)youtube\.com$/.test(host);
    const isTwitch = /(^|\.)twitch\.tv$/.test(host);
    const st = { on: false, target: null, video: null, picked: null, rank: 0, lastBetter: 0, marked: [], adSkip: false, adsSkipped: 0 };

    function watchable() {
      const p = location.pathname;
      // same rule as isWatchableYouTube in urls.js
      if (isYT) return /^\/(watch$|watch\/|live\/|embed\/|shorts\/|(@[\w.-]+|channel\/[\w-]+|c\/[\w.-]+|user\/[\w.-]+)\/live\/?$)/.test(p);
      if (isTwitch) {
        return p !== '/' && !/^\/(directory|search|settings|p|downloads|subscriptions|inventory|wallet|drops|turbo|jobs)(\/|$)/.test(p);
      }
      return true;
    }

    function area(el) {
      const r = el.getBoundingClientRect();
      return r.width * r.height;
    }

    function biggest(selector) {
      let best = null;
      let bestA = 0;
      document.querySelectorAll(selector).forEach((el) => {
        const a = area(el);
        if (a > bestA) {
          best = el;
          bestA = a;
        }
      });
      return best && bestA > 0 ? { el: best, a: bestA, rank: 3 } : null;
    }

    // Every match for sel, including inside open shadow roots (some sites wrap
    // their player in a custom element that hides it from normal lookups).
    function deepAll(sel) {
      const out = [];
      const walk = (root) => {
        root.querySelectorAll(sel).forEach((el) => out.push(el));
        root.querySelectorAll('*').forEach((el) => {
          if (el.shadowRoot) walk(el.shadowRoot);
        });
      };
      walk(document);
      return out;
    }

    function hasShadowInside(el) {
      if (el.shadowRoot) return true;
      for (const n of el.querySelectorAll('*')) if (n.shadowRoot) return true;
      return false;
    }

    // The element in the page itself that stands for el: el, or the custom
    // element hosting it. The page's CSS cannot reach inside a shadow root.
    function anchor(el) {
      let n = el;
      for (let root = n.getRootNode(); root !== document && root.host; root = n.getRootNode()) n = root.host;
      return n;
    }

    const PLAYER_BOXES = 'media-player, .plyr, .video-js, .jwplayer, [class*="player" i], [id*="player" i]';

    // Sites without their own rule. A real player sits near the top of the page
    // and is video-shaped. Ranked: a video (12% of the tile or more) = 3, an
    // embedded player frame = 2, the site's player box before its video has
    // started = 1. Comment widgets (tall), GIFs and ad boxes (small or far
    // down the page) never qualify.
    function genericPick() {
      const vp = Math.max(1, innerWidth * innerHeight);
      const limit = innerHeight * 1.2;
      const shaped = (r) => {
        const ar = r.width / Math.max(1, r.height);
        return ar >= 1.2 && ar <= 2.6;
      };
      let best = null;
      const consider = (el, rank, ok) => {
        const r = el.getBoundingClientRect();
        const a = r.width * r.height;
        if (!a || r.top >= limit || !ok(r, a / vp, el)) return;
        if (!best || rank > best.rank || (rank === best.rank && a > best.a)) best = { el, a, rank };
      };
      deepAll('video').forEach((v) => consider(v, 3, (r, s) => s >= 0.12 && Math.min(r.width, r.height) >= 120));
      deepAll('iframe').forEach((f) => consider(f, 2, (r, s) => s >= 0.2 && Math.min(r.width, r.height) >= 200 && shaped(r)));
      document.querySelectorAll(PLAYER_BOXES).forEach((p) =>
        consider(p, 1, (r, s, el) => s >= 0.2 && shaped(r) && (!!el.querySelector('video, iframe, img, canvas') || hasShadowInside(el)))
      );
      return best;
    }

    function pickMedia() {
      return isYT || isTwitch ? biggest('video') : genericPick();
    }

    // Filled with an embedded frame or a player box: switch once something
    // better shows up (the video starts). Checked every few seconds only.
    function betterPick() {
      if (isYT || isTwitch || st.rank >= 3) return null;
      const now = Date.now();
      if (now - st.lastBetter < 2500) return null;
      st.lastBetter = now;
      const p = genericPick();
      return p && p.rank > st.rank ? p : null;
    }

    // The player box around the video (so its controls come along).
    function containerFor(v) {
      if (isYT) return v.closest('#movie_player, .html5-video-player') || v;
      if (isTwitch) return v.closest('.video-player') || v.closest('[data-a-target="video-player"]') || v;
      const va = Math.max(1, area(v));
      let el = v;
      let p = v.parentElement;
      while (p && p !== document.body && p !== H) {
        if (area(p) > va * 1.3) break;
        el = p;
        p = p.parentElement;
      }
      return el;
    }

    function mark(el, attr) {
      el.setAttribute(attr, '');
      st.marked.push([el, attr]);
    }

    function clear() {
      for (const [el, attr] of st.marked) el.removeAttribute(attr);
      st.marked = [];
      st.target = null;
      st.video = null;
      st.picked = null;
      st.rank = 0;
      H.removeAttribute('data-tw-fill');
      H.removeAttribute('data-tw-yt');
    }

    // Let the player re-measure itself after its box changes.
    function kick() {
      [0, 200, 800].forEach((t) => setTimeout(() => window.dispatchEvent(new Event('resize')), t));
    }

    function intact() {
      return (
        st.target && st.video && st.picked &&
        st.target.isConnected && st.video.isConnected && st.picked.isConnected &&
        (st.target === st.video || st.target.contains(st.video)) &&
        st.target.hasAttribute('data-tw-target') &&
        H.hasAttribute('data-tw-fill')
      );
    }

    function apply() {
      if (!st.on || !watchable()) {
        if (st.target || H.hasAttribute('data-tw-fill')) {
          clear();
          kick();
        }
        return;
      }
      let pick = null;
      if (intact()) {
        pick = betterPick();
        if (!pick) return;
      }
      if (st.target) clear();
      pick = pick || pickMedia();
      if (!pick) return;
      st.picked = pick.el;
      st.rank = pick.rank;
      st.video = anchor(pick.el);
      st.target = pick.rank === 3 ? containerFor(st.video) : st.video;
      mark(st.target, 'data-tw-target');
      mark(st.video, 'data-tw-video');
      if (st.target !== st.video) {
        for (let p = st.video.parentElement; p && p !== st.target && p !== H; p = p.parentElement) mark(p, 'data-tw-chain');
      }
      for (let p = st.target.parentElement; p && p !== H; p = p.parentElement) mark(p, 'data-tw-anc');
      H.setAttribute('data-tw-fill', '');
      if (isYT) H.setAttribute('data-tw-yt', '');
      kick();
    }

    // YouTube pauses long sessions with "Continue watching?". Fill mode hides
    // that dialog, so answer it for you.
    function answerStillWatching() {
      if (!isYT) return;
      document.querySelectorAll('yt-confirm-dialog-renderer').forEach((d) => {
        if (!/continue watching/i.test(d.textContent || '')) return;
        const dlg = d.closest('tp-yt-paper-dialog');
        if (dlg && (dlg.style.display === 'none' || dlg.getAttribute('aria-hidden') === 'true')) return;
        const btn = d.querySelector('#confirm-button button') || d.querySelector('#confirm-button');
        if (btn) btn.click();
      });
    }

    // Backup for ads that still get through: press Skip when it shows, and
    // jump an unskippable ad to its last moment so the stream comes back.
    function skipAds() {
      if (!isYT || !st.adSkip) return;
      const p = document.querySelector('#movie_player');
      if (!p || !p.classList.contains('ad-showing')) return;
      const btn = p.querySelector('.ytp-skip-ad-button, .ytp-ad-skip-button, .ytp-ad-skip-button-modern');
      if (btn) btn.click();
      const v = p.querySelector('video');
      if (v && isFinite(v.duration) && v.duration > 0 && v.currentTime < v.duration - 0.3) {
        v.currentTime = v.duration - 0.1;
        st.adsSkipped++;
      }
    }

    setInterval(() => {
      apply();
      answerStillWatching();
    }, 700);
    setInterval(skipAds, 250);

    function status() {
      return { on: st.on, filled: !!st.target, adSkip: st.adSkip, adsSkipped: st.adsSkipped };
    }

    function set(on, adSkip) {
      st.on = !!on;
      st.adSkip = !!adSkip;
      apply();
      skipAds();
      return status();
    }

    window.__tw = { set, status };
    return window.__tw;
  }

  function script(on, adSkip) {
    return '(' + install.toString() + ')().set(' + (on ? 'true' : 'false') + ', ' + (adSkip ? 'true' : 'false') + ')';
  }

  root.TWFill = { css: FILL_CSS, script };
})(typeof self !== 'undefined' ? self : this);
