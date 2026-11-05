const test = require('node:test');
const assert = require('node:assert/strict');
const { hotkeyFor } = require('../hotkeys.js');

const key = (o) => ({ type: 'keyDown', control: false, meta: false, alt: false, shift: false, ...o });

test('ctrl + number row or numpad picks a tile', () => {
  assert.equal(hotkeyFor(key({ key: '2', code: 'Digit2', control: true })), 'audio:2');
  assert.equal(hotkeyFor(key({ key: '9', code: 'Numpad9', control: true })), 'audio:9');
  assert.equal(hotkeyFor(key({ key: '0', code: 'Digit0', control: true })), 'muteall');
});

test('plain number keys stay with the page (YouTube uses them to seek)', () => {
  assert.equal(hotkeyFor(key({ key: '2', code: 'Digit2' })), null);
});

test('letter shortcuts', () => {
  assert.equal(hotkeyFor(key({ key: 'n', code: 'KeyN', control: true })), 'add');
  assert.equal(hotkeyFor(key({ key: 't', code: 'KeyT', control: true })), 'add');
  assert.equal(hotkeyFor(key({ key: 'l', code: 'KeyL', control: true })), 'layout');
  assert.equal(hotkeyFor(key({ key: 'f', code: 'KeyF', control: true })), 'solo');
  assert.equal(hotkeyFor(key({ key: 'h', code: 'KeyH', control: true })), 'chrome');
  assert.equal(hotkeyFor(key({ key: 'm', code: 'KeyM', control: true })), 'muteall');
  assert.equal(hotkeyFor(key({ key: 'M', code: 'KeyM', control: true, shift: true })), 'follow');
  assert.equal(hotkeyFor(key({ key: 'r', code: 'KeyR', control: true })), 'reload');
  assert.equal(hotkeyFor(key({ key: 'R', code: 'KeyR', control: true, shift: true })), 'reloadall');
  assert.equal(hotkeyFor(key({ key: '/', code: 'Slash', control: true })), 'help');
});

test('ctrl + tab steps to the next tile, with shift the one before', () => {
  assert.equal(hotkeyFor(key({ key: 'Tab', code: 'Tab', control: true })), 'next');
  assert.equal(hotkeyFor(key({ key: 'Tab', code: 'Tab', control: true, shift: true })), 'prev');
  assert.equal(hotkeyFor(key({ key: 'Tab', code: 'Tab' })), null);
});

test('function keys', () => {
  assert.equal(hotkeyFor(key({ key: 'F11', code: 'F11' })), 'fullscreen');
  assert.equal(hotkeyFor(key({ key: 'F1', code: 'F1' })), 'help');
});

test('copy, paste, select all and friends are left alone', () => {
  for (const k of ['c', 'v', 'x', 'a', 'z', 'y']) {
    assert.equal(hotkeyFor(key({ key: k, code: 'Key' + k.toUpperCase(), control: true })), null, 'ctrl+' + k);
  }
});

test('alt combos and key-up events are ignored', () => {
  assert.equal(hotkeyFor(key({ key: '2', code: 'Digit2', control: true, alt: true })), null);
  assert.equal(hotkeyFor({ ...key({ key: '2', code: 'Digit2', control: true }), type: 'keyUp' }), null);
});

const { forwardKeyCode, isPrintable } = require('../hotkeys.js');

test('player keys can be handed to the picked tile', () => {
  assert.equal(forwardKeyCode(key({ key: 'f', code: 'KeyF' })), 'f');
  assert.equal(forwardKeyCode(key({ key: 'F', code: 'KeyF', shift: true })), 'F');
  assert.equal(forwardKeyCode(key({ key: ' ', code: 'Space' })), 'Space');
  assert.equal(forwardKeyCode(key({ key: 'ArrowLeft', code: 'ArrowLeft' })), 'Left');
  assert.equal(forwardKeyCode(key({ key: 'Escape', code: 'Escape' })), 'Escape');
  assert.equal(forwardKeyCode(key({ key: '>', code: 'Period', shift: true })), '>');
  assert.equal(forwardKeyCode({ ...key({ key: 'k', code: 'KeyK' }), type: 'keyUp' }), 'k');
});

test('combos and odd keys stay where they are', () => {
  assert.equal(forwardKeyCode(key({ key: 'c', code: 'KeyC', control: true })), null);
  assert.equal(forwardKeyCode(key({ key: 'f', code: 'KeyF', alt: true })), null);
  assert.equal(forwardKeyCode(key({ key: 'Shift', code: 'ShiftLeft', shift: true })), null);
  assert.equal(forwardKeyCode(key({ key: 'F5', code: 'F5' })), null);
  assert.equal(forwardKeyCode(key({ key: 'Dead', code: 'Quote' })), null);
  assert.equal(forwardKeyCode({ type: 'char', key: 'f' }), null);
});

test('printable keys also need a character event', () => {
  assert.equal(isPrintable('f'), true);
  assert.equal(isPrintable('Space'), true);
  assert.equal(isPrintable('Left'), false);
  assert.equal(isPrintable('Escape'), false);
});
