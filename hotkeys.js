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
    case 'tab':
      return input.shift ? 'prev' : 'next';
    case 'w':
      return input.shift ? null : 'close';
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

// Keys that may be handed from the tile that has keyboard focus to the tile
// picked with Ctrl+1-9 (YouTube's F, K, J, L, M, space, arrows, digits, Esc...).
// Returns the key name sendInputEvent expects, or null to leave the key alone.
// Shift is allowed (YouTube uses Shift+N, < and >); Ctrl/Alt/Win combos never move.
const NAMED = {
  ' ': 'Space',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  Escape: 'Escape',
  Enter: 'Enter',
  Tab: 'Tab',
  Backspace: 'Backspace',
  Delete: 'Delete',
  Home: 'Home',
  End: 'End',
  PageUp: 'PageUp',
  PageDown: 'PageDown',
};

function forwardKeyCode(input) {
  if (!input || (input.type !== 'keyDown' && input.type !== 'keyUp')) return null;
  if (input.control || input.alt || input.meta) return null;
  const key = input.key || '';
  if (NAMED[key]) return NAMED[key];
  if (key.length === 1 && key >= '!' && key <= '~') return key;
  return null;
}

// Whether the key also types a character (needs a 'char' event after keyDown).
function isPrintable(keyCode) {
  return keyCode === 'Space' || (typeof keyCode === 'string' && keyCode.length === 1);
}

module.exports = { hotkeyFor, forwardKeyCode, isPrintable };
