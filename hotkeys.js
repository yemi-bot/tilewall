'use strict';

// Maps a key event (Electron before-input-event input) to an app hotkey name,
// or null to let the key through to the page.
function hotkeyFor(input) {
  if (input.type !== 'keyDown') return null;
  const ctrl = input.control || input.meta;
  const key = (input.key || '').toLowerCase();
  if (key === 'f11' && !ctrl && !input.alt && !input.shift) return 'fullscreen';
  if (key === 'f1' && !ctrl && !input.alt) return 'help';
  if (!ctrl || input.alt) return null;
  const digit = (input.code || '').match(/^(?:Digit|Numpad)([0-9])$/);
  if (digit) {
    if (input.shift) return null;
    return digit[1] === '0' ? 'muteall' : 'audio:' + digit[1];
  }
  switch (key) {
    case 'n':
    case 't':
      return input.shift ? null : 'add';
    case 'l':
      return input.shift ? null : 'layout';
    case 'f':
      return input.shift ? null : 'solo';
    case 'h':
      return input.shift ? null : 'chrome';
    case 'm':
      return input.shift ? 'follow' : 'muteall';
    case 'r':
      return input.shift ? 'reloadall' : 'reload';
    case '/':
      return 'help';
    case 'i':
      return input.shift ? 'devtools' : null;
    default:
      return null;
  }
}

module.exports = { hotkeyFor };
