# Tilewall

Watch several streams or pages at once. Each one gets its own tile, and its video fills the tile like it is fullscreen. No YouTube header, no sidebar, no chat, just the player.

Works with YouTube (videos, live streams, channel `/live` links), Twitch, Kick, and any page with a video. Any other web page shows as a normal page.

## Run it

- Double-click **Tilewall** on the desktop or in the Start menu. The shortcuts always point at the newest build (its path is in `dist\LATEST.txt`).
- Or from this folder: `npm start`.

## Use it

- Paste one or more links and press Enter. Spaces, commas or new lines between links all work.
- **Top edge of a tile**: hover for its controls: hear it, make it the big one, fill or page view, back, reload, open in your browser, remove. Click the title to change the link. Drag the dots to swap tiles.
- **Bottom edge of the window**: hover for the toolbar: add links, layout, mute, sound follows mouse, gap, ad blocking, hide controls, fullscreen, help.
- **Right-click inside a tile**: back, forward, reload, open link or page in your browser, close this tile.
- Everything is saved. Close it and it comes back the same way.

| Keys | What it does |
| --- | --- |
| Ctrl+N | Add links |
| Ctrl+1 to Ctrl+9 | Hear that tile (it also becomes the big tile in Focus and Solo) |
| Ctrl+M or Ctrl+0 | Mute all / unmute |
| Ctrl+Shift+M | Sound follows your mouse |
| Ctrl+Alt+1 to Ctrl+Alt+9 | Same as Ctrl+1-9, but works while you are in another app (a game, a browser) |
| Ctrl+Alt+Right / Ctrl+Alt+Left | Next / previous tile (sound, big tile, keys), from any app. Ctrl+Alt+Tab is not possible: Windows keeps it for its task switcher |
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

## Notes

- One tile plays sound at a time. The others keep playing, muted.
- Stay live (toolbar, on by default): a live stream that falls about 20 seconds behind jumps back to live. If you rewind on purpose, it leaves you alone until you are back at live. It works inside embedded players too.
- Ctrl+Alt keys never pull Tilewall to the front. If another app already uses one, Tilewall says so at startup and that key only works inside Tilewall.
- Paid services with copy protection (League Pass, ESPN, YouTube TV, Prime, Peacock, Max) do not play yet: the Electron engine has no Widevine.
- Ad blocking is on by default, and the shield button in the toolbar turns it off. It has three layers:
  - YouTube: ad slots are removed from the player data before YouTube's player reads it (`tile-preload.js`).
  - YouTube backup: if an ad still starts, Skip is pressed for you, or the ad jumps to its end.
  - Everything else: the Ghostery engine with its built-in lists. A cached copy loads instantly, and lists older than 3 days refresh in the background. If the lists arrive after the tiles loaded (first launch), the tiles reload once.
- You can sign in to YouTube or Twitch inside a tile. Logins are shared by all tiles and kept between runs.
- Links that try to open new windows are blocked. Use right-click, then "Open link in your browser".
- If YouTube shows "Continue watching?", Tilewall answers it for you.

## Develop

```
npm install
npm test              # unit tests: layout, link cleanup, hotkeys
npm run smoke         # launches the app off-screen, loads 4 streams, saves screenshots
npm run package       # builds dist\build-<stamp>\Tilewall-win32-x64\Tilewall.exe, repoints the shortcuts
node scripts/ad-check.js 45   # YouTube ad time with and without the YouTube layer
```

Set `TW_EXE` to the path in `dist\LATEST.txt` before `npm run smoke` to test the packaged build. Each build gets its own folder, so it never collides with a running copy. Older builds are removed once nothing uses them.

If `npm start` does nothing from a VS Code terminal, clear `ELECTRON_RUN_AS_NODE` first. Some editor shells set it, and it makes Electron run as plain Node.

### Layout

| File | Job |
| --- | --- |
| `main.js` | Window, saved state, hotkey filter, cursor tracking, ad blocking, tile lockdown |
| `hotkeys.js` | Which key combos are app shortcuts |
| `tile-preload.js` | YouTube ad layer, runs in each tile before the page's own scripts |
| `preload.js` | The small bridge the app page uses to talk to `main.js` |
| `renderer/app.js` | Tiles, layouts, audio, toolbar, hover bars, drag to swap |
| `stay-live.js` | Catches live streams up when they drift; injected into every frame of a tile |
| `renderer/fill.js` | The script and CSS injected into each tile to make its player fill the tile |
| `renderer/layout.js` | Grid, Focus and Solo math |
| `renderer/urls.js` | Cleans pasted links (youtu.be, /live, /shorts, channel links) |
