// Measures YouTube ads with and without the YouTube ad layer.
// Runs the app off-screen twice with fresh profiles, plays the same videos,
// and reports seconds spent on ads per tile. Usage: node scripts/ad-check.js [secs]
'use strict';

const { _electron: electron } = require('playwright-core');
const path = require('path');
const fs = require('fs');
const os = require('os');

const SECS = Number(process.argv[2] || 45);
const VIDEOS = process.env.TW_AD_URLS ? process.env.TW_AD_URLS.split(',') : [
  'https://www.youtube.com/watch?v=kJQP7kiw5Fk',
  'https://www.youtube.com/watch?v=JGwWNGJdvx8',
  'https://www.youtube.com/watch?v=9bZkp7q19f0',
  'https://www.youtube.com/watch?v=OPf0YbXqDm0',
];

function cleanEnv(extra) {
  const env = { ...process.env, ...extra };
  delete env.ELECTRON_RUN_AS_NODE;
  return env;
}

async function run(label, extraEnv) {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'tw-ad-'));
  const env = cleanEnv({ TW_USER_DATA: userData, TW_MUTE_AUDIO: '1', TW_NO_POINTER_POLL: '1', TW_TEST_OFFSCREEN: '1', ...extraEnv });
  const app = process.env.TW_EXE
    ? await electron.launch({ executablePath: process.env.TW_EXE, args: [], env })
    : await electron.launch({ executablePath: require('electron'), args: [path.join(__dirname, '..')], env });
  const page = await app.firstWindow();
  await page.waitForSelector('#empty:not([hidden])');
  await page.fill('#empty-input', VIDEOS.join('\n'));
  await page.press('#empty-input', 'Enter');

  const stats = VIDEOS.map(() => ({ adMs: 0, sawAd: false, played: 0, shield: null, skipped: 0, live: false, behind: null }));
  const t0 = Date.now();
  let last = Date.now();
  while (Date.now() - t0 < SECS * 1000) {
    await page.waitForTimeout(300);
    const now = Date.now();
    const dt = now - last;
    last = now;
    const snap = await page.evaluate(async () => {
      const out = [];
      for (const t of window.__tilewall.state.tiles) {
        const rec = window.__tilewall.recs.get(t.id);
        if (!rec.ready) {
          out.push(null);
          continue;
        }
        try {
          out.push(
            await rec.wv.executeJavaScript(`(() => {
              const p = document.querySelector('#movie_player');
              const v = p && p.querySelector('video');
              return {
                ad: !!(p && p.classList.contains('ad-showing')),
                time: v ? v.currentTime : -1,
                shield: window.__twShield === true,
                skipped: window.__tw ? window.__tw.status().adsSkipped : 0,
                live: !!(p && p.getVideoData && p.getVideoData().isLive),
                behind: v && v.seekable && v.seekable.length ? Math.round(v.seekable.end(v.seekable.length - 1) - v.currentTime) : null,
              };
            })()`)
          );
        } catch (e) {
          out.push(null);
        }
      }
      return out;
    });
    snap.forEach((s, i) => {
      if (!s) return;
      const st = stats[i];
      if (s.ad) {
        st.adMs += dt;
        st.sawAd = true;
      } else if (s.time > 0) {
        st.played = Math.max(st.played, s.time);
      }
      st.shield = s.shield;
      st.skipped = s.skipped;
      st.live = s.live;
      st.behind = s.behind;
    });
  }
  await app.close();
  fs.rmSync(userData, { recursive: true, force: true });
  console.log('\n' + label);
  stats.forEach((s, i) => {
    console.log(
      '  ' + VIDEOS[i].slice(-11) +
        '  ads seen: ' + (s.sawAd ? 'yes' : 'no ') +
        '  ad time: ' + (s.adMs / 1000).toFixed(1) + 's' +
        '  skips: ' + s.skipped +
        '  video reached: ' + s.played.toFixed(0) + 's' +
        '  shield: ' + s.shield +
        '  live: ' + s.live +
        '  secs behind live edge: ' + s.behind
    );
  });
  return stats;
}

(async () => {
  await run('WITHOUT YouTube ad layer (Ghostery only)', { TW_NO_YT_ADFIX: '1' });
  await run('WITH YouTube ad layer', {});
})().catch((e) => {
  console.error('AD CHECK FAILED', e);
  process.exit(1);
});
