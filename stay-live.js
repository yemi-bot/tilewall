'use strict';

// "Stay live": injected by main.js into every frame of every tile (the player
// on many sports sites lives in an embedded frame). If a live stream drifts
// behind (buffering, a hiccup), it jumps back to live. A rewind you make
// yourself, to rewatch a play, is left alone until you are back at live.
// Must stay self-contained: it is sent to the page as source text.

function stayLive(on) {
  if (window.__twLive) return window.__twLive.set(on);

  const LAG_JUMP = 20; // seconds behind live before catching up
  const LAG_LIVE = 8; // this close counts as live again
  const st = { on: !!on, userBehind: false, userSeekAt: 0, behindSince: 0, ourSeekUntil: 0, lastInput: 0, jumps: 0 };

  // A seek right after you clicked, pressed a key or scrolled is yours.
  ['pointerdown', 'keydown', 'wheel'].forEach((t) => document.addEventListener(t, () => (st.lastInput = Date.now()), true));
  document.addEventListener(
    'seeking',
    () => {
      if (Date.now() < st.ourSeekUntil) return;
      if (Date.now() - st.lastInput < 2000) {
        st.userBehind = true;
        st.userSeekAt = Date.now();
      }
    },
    true
  );

  function biggestVideo() {
    let best = null;
    let bestA = 0;
    document.querySelectorAll('video').forEach((v) => {
      const r = v.getBoundingClientRect();
      const a = r.width * r.height;
      if (a > bestA) {
        best = v;
        bestA = a;
      }
    });
    return best;
  }

  // How far behind live the main player is, and how to get back. lag can be
  // null: YouTube sometimes reports no position, but still says whether it
  // is at live.
  function info() {
    const yt = document.querySelector('#movie_player');
    if (yt && typeof yt.getProgressState === 'function' && typeof yt.seekToLiveHead === 'function') {
      const data = yt.getVideoData ? yt.getVideoData() : null;
      if (!data || !data.isLive) return null;
      const ps = yt.getProgressState() || {};
      const v = yt.querySelector('video');
      const lag = ps.seekableEnd != null && ps.current != null ? ps.seekableEnd - ps.current : NaN;
      const atHead = ps.isAtLiveHead === true || (typeof yt.isAtLiveHead === 'function' && yt.isAtLiveHead() === true);
      return {
        lag: isFinite(lag) ? lag : null,
        atHead,
        paused: !v || v.paused,
        ad: yt.classList.contains('ad-showing'),
        jump: () => {
          yt.seekToLiveHead();
          // a jump must never leave the stream paused
          setTimeout(() => {
            const vid = yt.querySelector('video');
            if (vid && vid.paused && typeof yt.playVideo === 'function') yt.playVideo();
          }, 1500);
        },
      };
    }
    const v = biggestVideo();
    if (!v || v.duration !== Infinity || !v.seekable || !v.seekable.length) return null;
    const end = v.seekable.end(v.seekable.length - 1);
    const lag = end - v.currentTime;
    return {
      lag: isFinite(lag) ? lag : null,
      atHead: isFinite(lag) && lag < LAG_LIVE,
      paused: v.paused,
      ad: false,
      jump: () => {
        v.currentTime = Math.max(0, end - 3);
      },
    };
  }

  function tick() {
    if (!st.on) return;
    const s = info();
    if (!s) return;
    // Right after your own rewind the player can still claim to be at live
    // for a moment, so that claim is ignored for a few seconds.
    const settled = Date.now() - st.userSeekAt > 5000;
    if ((s.atHead && settled) || (s.lag != null && s.lag < LAG_LIVE)) {
      st.userBehind = false;
      st.behindSince = 0;
      return;
    }
    if (st.userBehind || s.paused || s.ad || (s.lag != null && s.lag < LAG_JUMP)) {
      st.behindSince = 0;
      return;
    }
    // Give a short stall a moment to recover by itself. With no position
    // reported, wait until it has been off live for a good while.
    if (!st.behindSince) {
      st.behindSince = Date.now();
      return;
    }
    if (Date.now() - st.behindSince < (s.lag == null ? 20000 : 4000)) return;
    st.behindSince = 0;
    st.ourSeekUntil = Date.now() + 3000;
    s.jump();
    st.jumps++;
  }

  setInterval(tick, 2000);

  function status() {
    const s = info();
    return {
      on: st.on,
      live: !!s,
      lag: s && s.lag != null ? Math.round(s.lag) : null,
      atHead: s ? s.atHead : null,
      paused: s ? s.paused : null,
      ad: s ? s.ad : null,
      userBehind: st.userBehind,
      jumps: st.jumps,
    };
  }

  window.__twLive = {
    set(v) {
      st.on = !!v;
      return status();
    },
    status,
  };
  return status();
}

module.exports = { stayLive };
