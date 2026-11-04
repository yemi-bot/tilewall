# Tilewall

Watch several streams or pages at once. Each one gets its own tile, and its video fills the tile like it is fullscreen. No YouTube header, no sidebar, no chat, just the player.

Works with YouTube (videos, live streams, channel `/live` links), Twitch, Kick, and any page with a video. Any other web page shows as a normal page.

## Run it

- Double-click **Tilewall** on the desktop or in the Start menu (it points at `dist\Tilewall-win32-x64\Tilewall.exe`).
- Or from this folder: `npm start`.

## Use it

- Paste one or more links and press Enter. Spaces, commas or new lines between links all work.
- **Top edge of a tile**: hover for its controls: hear it, make it the big one, fill or page view, back, reload, open in your browser, remove. Click the title to change the link. Drag the dots to swap tiles.
- **Bottom edge of the window**: hover for the toolbar: add links, layout, mute, sound follows mouse, gap, ad blocking, hide controls, fullscreen, help.
- **Right-click inside a tile**: back, forward, reload, open link or page in your browser.
- Everything is saved. Close it and it comes back the same way.

| Keys | What it does |
| --- | --- |
| Ctrl+N | Add links |
| Ctrl+1 to Ctrl+9 | Hear that tile (it also becomes the big tile in Focus and Solo) |
| Ctrl+M or Ctrl+0 | Mute all / unmute |
| Ctrl+Shift+M | Sound follows your mouse |
| Ctrl+L | Switch layout: Grid, Focus, Solo |
| Ctrl+F | One tile only, press again to go back |
| Ctrl+H | Hide all controls for a clean wall |
| Ctrl+R / Ctrl+Shift+R | Reload the tile you hear / reload all |
| F11 | Fullscreen |
| Hold Ctrl | Show tile numbers |
| F1 | Shortcuts |

## Notes

- One tile plays sound at a time. The others keep playing, muted.
- Ad blocking uses the Ghostery engine with its built-in lists. It is on by default and can be turned off from the toolbar.
- You can sign in to YouTube or Twitch inside a tile. Logins are shared by all tiles and kept between runs.
- Links that try to open new windows are blocked. Use right-click, then "Open link in your browser".
- If YouTube shows "Continue watching?", Tilewall answers it for you.

## Develop

```
npm install
npm test              # unit tests: layout, link cleanup, hotkeys
npm run smoke         # launches the app off-screen, loads 4 streams, saves screenshots
npm run package       # builds dist\Tilewall-win32-x64\Tilewall.exe
```

Set `TW_EXE=dist\Tilewall-win32-x64\Tilewall.exe` before `npm run smoke` to test the packaged build.

If `npm start` does nothing from a VS Code terminal, clear `ELECTRON_RUN_AS_NODE` first. Some editor shells set it, and it makes Electron run as plain Node.

### Layout

| File | Job |
| --- | --- |
| `main.js` | Window, saved state, hotkey filter, cursor tracking, ad blocking, tile lockdown |
| `hotkeys.js` | Which key combos are app shortcuts |
| `preload.js` | The small bridge the app page uses to talk to `main.js` |
| `renderer/app.js` | Tiles, layouts, audio, toolbar, hover bars, drag to swap |
| `renderer/fill.js` | The script and CSS injected into each tile to make its player fill the tile |
| `renderer/layout.js` | Grid, Focus and Solo math |
| `renderer/urls.js` | Cleans pasted links (youtu.be, /live, /shorts, channel links) |
