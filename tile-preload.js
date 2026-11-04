'use strict';

// Runs in every tile frame before the page's own scripts (registered on the
// tiles' session by main.js while ad blocking is on). On YouTube it installs
// ytShield in the page's main world: YouTube ships its ads inside the same
// player data that says what to play, so the ad slots are removed from that
// data before the player reads it. Must stay self-contained: sandboxed
// preloads cannot require local files.

function ytShield(g) {
  g = g || window;
  if (g.__twShield) return;
  Object.defineProperty(g, '__twShield', { value: true });

  const AD_KEYS = ['adPlacements', 'adSlots', 'playerAds', 'adBreakHeartbeatParams'];
  const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

  function strip(o) {
    if (!o || typeof o !== 'object') return;
    for (const k of AD_KEYS) if (has(o, k)) delete o[k];
  }

  // Player data comes bare, wrapped in { playerResponse }, or as a list of those.
  function prune(o) {
    if (!o || typeof o !== 'object') return o;
    const items = Array.isArray(o) ? o : [o];
    for (const x of items) {
      strip(x);
      if (x && typeof x === 'object') strip(x.playerResponse);
    }
    return o;
  }

  function hasAds(o) {
    if (!o || typeof o !== 'object') return false;
    const items = Array.isArray(o) ? o : [o];
    return items.some((x) => x && typeof x === 'object' && (AD_KEYS.some((k) => has(x, k)) || (x.playerResponse && typeof x.playerResponse === 'object' && AD_KEYS.some((k) => has(x.playerResponse, k)))));
  }

  // 1. The first video's data is set by an inline script on page load.
  let initial;
  try {
    Object.defineProperty(g, 'ytInitialPlayerResponse', {
      configurable: true,
      get: () => initial,
      set: (v) => {
        initial = prune(v);
      },
    });
  } catch (e) {
    /* already defined by the page */
  }

  // 2. Later videos (and live streams) arrive through fetch/XHR and JSON.parse.
  //    Proxies keep the hooked functions looking native to the page.
  try {
    g.JSON.parse = new Proxy(g.JSON.parse, {
      apply(target, thisArg, args) {
        const r = Reflect.apply(target, thisArg, args);
        try {
          if (hasAds(r)) prune(r);
        } catch (e) {
          /* never break parsing */
        }
        return r;
      },
    });
  } catch (e) {
    /* leave JSON alone */
  }

  try {
    const proto = g.Response && g.Response.prototype;
    if (proto && typeof proto.json === 'function') {
      proto.json = new Proxy(proto.json, {
        apply(target, thisArg, args) {
          return Reflect.apply(target, thisArg, args).then((r) => {
            try {
              if (hasAds(r)) prune(r);
            } catch (e) {
              /* never break fetch */
            }
            return r;
          });
        },
      });
    }
  } catch (e) {
    /* leave fetch alone */
  }
}

if (typeof module === 'object' && module && module.exports) module.exports = { ytShield };

(function run() {
  let electron;
  try {
    electron = require('electron');
  } catch (e) {
    return;
  }
  if (!electron || !electron.contextBridge || typeof location === 'undefined') return;
  if (!/(^|\.)youtube(-nocookie)?\.com$/i.test(location.hostname)) return;
  try {
    electron.contextBridge.executeInMainWorld({ func: ytShield });
  } catch (e) {
    /* page keeps working without the shield */
  }
})();
