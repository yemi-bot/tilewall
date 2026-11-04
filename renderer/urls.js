// Link cleanup for pasted stream links. Pure functions, shared by the app
// (browser global TWUrls) and the node tests (CommonJS).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TWUrls = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const YT_ID = /^[\w-]{6,}$/;
  const CHANNEL_ROOT = /^\/(@[\w.-]+|channel\/[\w-]+|c\/[\w.-]+|user\/[\w.-]+)\/?$/;

  function watchUrl(id, t) {
    return 'https://www.youtube.com/watch?v=' + id + (t ? '&t=' + encodeURIComponent(t) : '');
  }

  function normalizeUrl(input) {
    let s = String(input == null ? '' : input).trim();
    if (!s) return null;
    if (!/^[a-z][a-z0-9+.-]*:/i.test(s)) {
      // bare input must look like a domain with a dot, eg twitch.tv/name
      if (!/^[^\s/]+\.[a-z]{2,}([/?#:]|$)/i.test(s)) return null;
      s = 'https://' + s;
    }
    let u;
    try {
      u = new URL(s);
    } catch (e) {
      return null;
    }
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;

    const host = u.hostname.toLowerCase().replace(/^(www\.|m\.)/, '');
    const t = u.searchParams.get('t');

    if (host === 'youtu.be') {
      const id = u.pathname.slice(1).split('/')[0];
      return YT_ID.test(id) ? watchUrl(id, t) : null;
    }

    if (host === 'youtube.com') {
      const m = u.pathname.match(/^\/(live|shorts|embed)\/([\w-]+)/);
      if (m && YT_ID.test(m[2])) return watchUrl(m[2], t);
      if (u.pathname === '/watch' && u.searchParams.get('v')) return watchUrl(u.searchParams.get('v'), t);
      if (CHANNEL_ROOT.test(u.pathname)) {
        return 'https://www.youtube.com' + u.pathname.replace(/\/$/, '') + '/live';
      }
      u.hostname = 'www.youtube.com';
      return u.toString();
    }

    return u.toString();
  }

  function splitInput(text) {
    return String(text || '')
      .split(/[\s,]+/)
      .map(normalizeUrl)
      .filter(Boolean);
  }

  // Paths on youtube.com that show one big player worth filling the tile with.
  // Keep in sync with watchable() in fill.js (that copy runs inside the tile page).
  const YT_WATCHABLE = /^\/(watch$|watch\/|live\/|embed\/|shorts\/|(@[\w.-]+|channel\/[\w-]+|c\/[\w.-]+|user\/[\w.-]+)\/live\/?$)/;
  function isWatchableYouTube(pathname) {
    return YT_WATCHABLE.test(pathname || '');
  }

  return { normalizeUrl, splitInput, isWatchableYouTube };
});
