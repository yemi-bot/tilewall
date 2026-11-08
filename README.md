# Tilewall

Watch several streams at once on Windows. Each one gets its own tile, and its video fills the tile like it is fullscreen. No header, no sidebar, no chat, just the player.

Works with YouTube (videos, live streams, channel `/live` links), Twitch, Kick, and any page with a video. Any other web page shows as a normal page.

Free and open source (MIT). Windows 10 and 11, 64-bit.

## Install

1. Download `Tilewall-Setup-<version>.exe` from the [latest release](https://github.com/yemi-bot/tilewall/releases/latest).
2. Run it. It installs for your Windows user only (no admin needed) and adds Tilewall to the desktop and the Start menu.
3. Windows may say "Windows protected your PC", because Tilewall is not code-signed yet. Click **More info**, then **Run anyway**.

Tilewall updates itself. When a new version is out, it downloads in the background and installs the next time you close the app.

To uninstall: Windows Settings, Apps, Tilewall. Your saved tiles and logins stay in `%APPDATA%\Tilewall`. Delete that folder to remove them too.

## Use it

- Paste one or more links and press Enter. Spaces, commas or new lines between links all work.
- **Top edge of a tile**: hover for its controls: hear it, make it the big one, fill or page view, back, reload, open in your browser, remove. Click the title to change the link. Drag the dots to swap tiles.
- **Bottom edge of the window**: hover for the toolbar: add links, layout, mute, sound follows mouse, gap, ad blocking, stay live, hide controls, fullscreen, help.
- **Right-click inside a tile**: back, forward, reload, open link or page in your browser, close this tile.
- Everything is saved. Close it and it comes back the same way.

| Keys | What it does |
| --- | --- |
| Ctrl+N | Add links |
| Ctrl+1 to Ctrl+9 | Hear that tile (it also becomes the big tile in Focus and Solo) |
| Ctrl+M or Ctrl+0 | Mute all / unmute |
| Ctrl+Shift+M | Sound follows your mouse |
| Ctrl+Alt+1 to Ctrl+Alt+9 | Same as Ctrl+1-9, but works while you are in another app (a game, a browser) |
| Ctrl+Alt+Right / Ctrl+Alt+Left | Next / previous tile, from any app. (Ctrl+Alt+Tab is not possible: Windows keeps it for its task switcher.) |
| Ctrl+Tab / Ctrl+Shift+Tab | Next / previous tile, inside Tilewall |
| Ctrl+Alt+M, Ctrl+Alt+F, Ctrl+Alt+L | Mute all, one tile only, switch layout, from any app |
| Ctrl+W | Close the picked tile (the one you clicked last or picked with Ctrl+1-9). Undo is in the message that pops up |
| Ctrl+L | Switch layout: Grid, Focus, Solo |
| Ctrl+F | One tile only, press again to go back |
| Ctrl+H | Hide all controls for a clean wall |
| Ctrl+R / Ctrl+Shift+R | Reload the tile you hear / reload all |
| F11 | Fullscreen |
| Hold Ctrl | Show tile numbers |
| F1 | Shortcuts |

## Good to know

- One tile plays sound at a time. The others keep playing, muted.
- **Stay live** (toolbar, on by default): a live stream that falls about 20 seconds behind jumps back to live. If you rewind on purpose, it leaves you alone until you are back at live.
- Ctrl+Alt keys never pull Tilewall to the front. If another app already uses one, Tilewall says so at startup and that key only works inside Tilewall.
- **Ad blocking** is on by default. The shield button in the toolbar turns it off.
- You can sign in to YouTube or Twitch inside a tile. Logins are shared by all tiles and kept between runs.
- Links that try to open new windows are blocked. Right-click, then "Open link in your browser".
- If YouTube asks "Continue watching?", Tilewall answers it for you.
- **Does not play:** paid services with copy protection (League Pass, ESPN, YouTube TV, Netflix, Prime Video, Peacock, Max). The engine Tilewall is built on has no Widevine.
- **Privacy:** Tilewall has no account and no analytics, and collects nothing. Your tiles, logins and settings stay on your PC. On its own it only downloads ad-block lists and checks GitHub for updates. The sites you open in tiles work as they do in any browser.

## Problems and ideas

[Open an issue](https://github.com/yemi-bot/tilewall/issues). For a page that does not fill or play, include the link.

## Build from source

You need Node.js 22 or newer.

```
git clone https://github.com/yemi-bot/tilewall
cd tilewall
npm install
npm start
```

If `npm start` does nothing from a VS Code terminal, clear `ELECTRON_RUN_AS_NODE` first. Some editor shells set it, and it makes Electron run as plain Node.

```
npm test              # unit tests: layout, link cleanup, hotkeys, YouTube ad layer, stay live
npm run smoke         # launches the app off-screen with real streams and checks it end to end
npm run dist          # builds the installer into dist\release
npm run package       # quick local build in dist\build-<stamp>, points your Desktop and Start menu shortcuts at it
node scripts/ad-check.js 45   # YouTube ad time with and without the YouTube ad layer
```

Set `TW_EXE` to a built `Tilewall.exe` before `npm run smoke` to test a packaged build.

Releasing (maintainer): bump `version` in `package.json`, commit, then `npm run release`. It builds the installer, tags the commit and publishes a GitHub release that installed copies update to. It needs the `gh` CLI signed in.

### How it works

| File | Job |
| --- | --- |
| `main.js` | Window, saved state, hotkeys, cursor tracking, ad blocking, tile lockdown, updates |
| `hotkeys.js` | Which key combos are app shortcuts |
| `tile-preload.js` | YouTube ad layer, runs in each tile before the page's own scripts |
| `preload.js` | The small bridge the app page uses to talk to `main.js` |
| `renderer/app.js` | Tiles, layouts, audio, toolbar, hover bars, drag to swap |
| `stay-live.js` | Catches live streams up when they drift; injected into every frame of a tile |
| `renderer/fill.js` | The script and CSS injected into each tile to make its player fill the tile |
| `renderer/layout.js` | Grid, Focus and Solo math |
| `renderer/urls.js` | Cleans pasted links (youtu.be, /live, /shorts, channel links) |

Ad blocking has three layers:

- YouTube: ad slots are removed from the player data before the player reads it (`tile-preload.js`).
- YouTube backup: if an ad still starts, Skip is pressed for you, or the ad jumps to its end.
- Everything else: the Ghostery engine with its built-in lists. A cached copy loads instantly, and lists older than 3 days refresh in the background.

Each tile is a locked-down `<webview>`: no Node, sandboxed, web pages only, no pop-up windows.

## Credits

Built on [Electron](https://www.electronjs.org/) and the [Ghostery ad blocker](https://github.com/ghostery/adblocker) (MPL-2.0). Tilewall is not affiliated with YouTube, Twitch, Kick or any site you watch in it.

## License

[MIT](LICENSE)
