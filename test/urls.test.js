const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeUrl, splitInput, isWatchableYouTube } = require('../renderer/urls.js');

test('adds https to bare domains', () => {
  assert.equal(normalizeUrl('twitch.tv/b0aty'), 'https://twitch.tv/b0aty');
  assert.equal(normalizeUrl('  kick.com/someone  '), 'https://kick.com/someone');
});

test('rejects junk and non-web schemes', () => {
  assert.equal(normalizeUrl(''), null);
  assert.equal(normalizeUrl('hello'), null);
  assert.equal(normalizeUrl('javascript:alert(1)'), null);
  assert.equal(normalizeUrl('file:///C:/x.html'), null);
});

test('youtu.be short links become watch links and keep the start time', () => {
  assert.equal(normalizeUrl('https://youtu.be/fe8K8AzygU0'), 'https://www.youtube.com/watch?v=fe8K8AzygU0');
  assert.equal(normalizeUrl('youtu.be/fe8K8AzygU0?si=abc&t=90'), 'https://www.youtube.com/watch?v=fe8K8AzygU0&t=90');
});

test('youtube live, shorts and embed links become watch links', () => {
  assert.equal(normalizeUrl('https://www.youtube.com/live/AR0mCbzLtnM?si=x'), 'https://www.youtube.com/watch?v=AR0mCbzLtnM');
  assert.equal(normalizeUrl('https://youtube.com/shorts/AR0mCbzLtnM'), 'https://www.youtube.com/watch?v=AR0mCbzLtnM');
  assert.equal(normalizeUrl('https://www.youtube.com/embed/AR0mCbzLtnM'), 'https://www.youtube.com/watch?v=AR0mCbzLtnM');
});

test('mobile youtube goes to desktop youtube', () => {
  assert.equal(normalizeUrl('https://m.youtube.com/watch?v=fe8K8AzygU0'), 'https://www.youtube.com/watch?v=fe8K8AzygU0');
});

test('a youtube channel link goes to that channel live stream', () => {
  assert.equal(normalizeUrl('youtube.com/@SomeStreamer'), 'https://www.youtube.com/@SomeStreamer/live');
  assert.equal(normalizeUrl('https://www.youtube.com/@SomeStreamer/'), 'https://www.youtube.com/@SomeStreamer/live');
  assert.equal(normalizeUrl('https://www.youtube.com/channel/UC123abc'), 'https://www.youtube.com/channel/UC123abc/live');
  // a channel sub page is left alone
  assert.equal(normalizeUrl('https://www.youtube.com/@SomeStreamer/videos'), 'https://www.youtube.com/@SomeStreamer/videos');
});

test('watch links keep the video id and drop tracking params', () => {
  assert.equal(
    normalizeUrl('https://www.youtube.com/watch?v=IUIBViB82O8&si=track&pp=xyz&t=12'),
    'https://www.youtube.com/watch?v=IUIBViB82O8&t=12'
  );
});

test('splitInput takes many links separated by spaces, commas or new lines', () => {
  const out = splitInput('youtu.be/aaaaaaaaaaa, twitch.tv/x\nhttps://kick.com/y   nonsense');
  assert.deepEqual(out, [
    'https://www.youtube.com/watch?v=aaaaaaaaaaa',
    'https://twitch.tv/x',
    'https://kick.com/y',
  ]);
});

test('isWatchableYouTube matches watch style paths only', () => {
  assert.equal(isWatchableYouTube('/watch'), true);
  assert.equal(isWatchableYouTube('/live/abc'), true);
  assert.equal(isWatchableYouTube('/embed/abc'), true);
  assert.equal(isWatchableYouTube('/'), false);
  // YouTube serves a channel's current stream at /@name/live without redirecting
  assert.equal(isWatchableYouTube('/@LofiGirl/live'), true);
  assert.equal(isWatchableYouTube('/channel/UC123/live'), true);
  assert.equal(isWatchableYouTube('/@LofiGirl/videos'), false);
  assert.equal(isWatchableYouTube('/@LofiGirl/live/extra'), false);
  assert.equal(isWatchableYouTube('/feed/subscriptions'), false);
});

test('fill.js carries the same YouTube watch rule as urls.js', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const dir = path.join(__dirname, '..', 'renderer');
  const a = fs.readFileSync(path.join(dir, 'urls.js'), 'utf8').match(/const YT_WATCHABLE = (\/.*\/);/);
  const b = fs.readFileSync(path.join(dir, 'fill.js'), 'utf8').match(/if \(isYT\) return (\/.*\/)\.test\(p\);/);
  assert.ok(a && b, 'both rules found');
  assert.equal(b[1], a[1]);
});
