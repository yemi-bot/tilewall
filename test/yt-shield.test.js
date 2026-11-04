const test = require('node:test');
const assert = require('node:assert/strict');
const { ytShield } = require('../tile-preload.js');

// A fake page global with its own JSON and Response, like a browser window.
function fakePage() {
  class Response {
    constructor(body) {
      this.body = body;
    }
    json() {
      return Promise.resolve(JSON.parse(this.body));
    }
  }
  const g = { JSON: { parse: JSON.parse, stringify: JSON.stringify }, Response };
  ytShield(g);
  return g;
}

const AD_DATA = {
  adPlacements: [{ ad: 1 }],
  adSlots: [{ slot: 1 }],
  playerAds: [{ p: 1 }],
  adBreakHeartbeatParams: 'x',
  streamingData: { formats: [1, 2] },
  videoDetails: { videoId: 'abc' },
};

test('JSON.parse drops ad slots and keeps the video', () => {
  const g = fakePage();
  const r = g.JSON.parse(JSON.stringify(AD_DATA));
  assert.deepEqual(Object.keys(r).sort(), ['streamingData', 'videoDetails']);
  assert.deepEqual(r.streamingData.formats, [1, 2]);
});

test('JSON.parse handles wrapped and listed player responses', () => {
  const g = fakePage();
  const wrapped = g.JSON.parse(JSON.stringify({ playerResponse: AD_DATA, page: 'watch' }));
  assert.equal(wrapped.playerResponse.adPlacements, undefined);
  assert.equal(wrapped.playerResponse.videoDetails.videoId, 'abc');
  const listed = g.JSON.parse(JSON.stringify([{ page: 'watch' }, { playerResponse: AD_DATA }]));
  assert.equal(listed[1].playerResponse.playerAds, undefined);
});

test('JSON.parse leaves ordinary data and primitives untouched', () => {
  const g = fakePage();
  assert.deepEqual(g.JSON.parse('{"a":1,"b":[1,2]}'), { a: 1, b: [1, 2] });
  assert.equal(g.JSON.parse('42'), 42);
  assert.equal(g.JSON.parse('null'), null);
  assert.equal(g.JSON.parse('"adPlacements"'), 'adPlacements');
  assert.throws(() => g.JSON.parse('{bad'), SyntaxError);
});

test('the first video set by the page loses its ads', () => {
  const g = fakePage();
  g.ytInitialPlayerResponse = JSON.parse(JSON.stringify(AD_DATA));
  assert.equal(g.ytInitialPlayerResponse.adPlacements, undefined);
  assert.equal(g.ytInitialPlayerResponse.videoDetails.videoId, 'abc');
});

test('fetch responses read with .json() lose their ads', async () => {
  const g = fakePage();
  const r = await new g.Response(JSON.stringify(AD_DATA)).json();
  assert.equal(r.adSlots, undefined);
  assert.equal(r.videoDetails.videoId, 'abc');
});

test('installing twice is harmless', () => {
  const g = fakePage();
  ytShield(g);
  const r = g.JSON.parse(JSON.stringify(AD_DATA));
  assert.equal(r.playerAds, undefined);
});
