const test = require('node:test');
const assert = require('node:assert/strict');
const { stayLive } = require('../stay-live.js');

// The mock clock jumps to the end of one big tick, so step like the real 2 s timer.
const run = (t, ms) => {
  for (let i = 0; i < ms; i += 2000) t.mock.timers.tick(2000);
};

// A fake page with one live <video> (not YouTube), driven by mock timers.
function fakePage({ current, seekableEnd, bufferedEnd }) {
  const v = {
    currentTime: current,
    duration: Infinity,
    paused: false,
    seekable: { length: 1, end: () => seekableEnd },
    buffered: { length: 1, end: () => bufferedEnd },
    getBoundingClientRect: () => ({ width: 640, height: 360 }),
  };
  global.window = {};
  global.document = {
    addEventListener: () => {},
    querySelector: () => null, // no YouTube player
    querySelectorAll: (sel) => (sel === 'video' ? [v] : []),
  };
  return v;
}

test('an endless made-up seekable range (Twitch: 2^30 s) is not a reason to jump', (t) => {
  t.mock.timers.enable({ apis: ['setInterval', 'setTimeout', 'Date'], now: 1e9 });
  const v = fakePage({ current: 5, seekableEnd: 2 ** 30, bufferedEnd: 6.2 });
  const s = stayLive(true);
  assert.equal(s.live, true);
  assert.ok(s.lag < 8, 'lag is measured against what has arrived, got ' + s.lag);
  run(t, 30000);
  assert.equal(v.currentTime, 5, 'video must not be thrown past its data');
  assert.equal(window.__twLive.status().jumps, 0);
});

test('a real drift behind a believable live edge still catches up', (t) => {
  t.mock.timers.enable({ apis: ['setInterval', 'setTimeout', 'Date'], now: 1e9 });
  const v = fakePage({ current: 100, seekableEnd: 160, bufferedEnd: 104 });
  stayLive(true);
  run(t, 10000);
  assert.equal(v.currentTime, 157);
  assert.equal(window.__twLive.status().jumps, 1);
});
