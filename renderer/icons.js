// Inline SVG icons (24px grid, stroke style).
(function (root) {
  function svg(body, filled) {
    const paint = filled
      ? 'fill="currentColor" stroke="none"'
      : 'fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"';
    return '<svg viewBox="0 0 24 24" ' + paint + ' aria-hidden="true">' + body + '</svg>';
  }

  root.TWIcons = {
    plus: svg('<path d="M12 5v14M5 12h14"/>'),
    grid: svg('<rect x="3.5" y="4" width="7.5" height="7" rx="1.2"/><rect x="13" y="4" width="7.5" height="7" rx="1.2"/><rect x="3.5" y="13" width="7.5" height="7" rx="1.2"/><rect x="13" y="13" width="7.5" height="7" rx="1.2"/>'),
    focus: svg('<rect x="3" y="4" width="12.5" height="16" rx="1.2"/><rect x="17.5" y="4" width="3.5" height="4.4" rx="0.8"/><rect x="17.5" y="9.8" width="3.5" height="4.4" rx="0.8"/><rect x="17.5" y="15.6" width="3.5" height="4.4" rx="0.8"/>'),
    solo: svg('<rect x="3" y="5" width="18" height="14" rx="1.6"/>'),
    volume: svg('<path d="M11 5 6.5 9H3.5v6h3L11 19z"/><path d="M15.5 9a4.5 4.5 0 0 1 0 6"/><path d="M18.5 6a8.5 8.5 0 0 1 0 12"/>'),
    mute: svg('<path d="M11 5 6.5 9H3.5v6h3L11 19z"/><path d="m16 9.5 5 5M21 9.5l-5 5"/>'),
    live: svg('<circle cx="12" cy="12" r="2.2"/><path d="M8.4 8.4a5.1 5.1 0 0 0 0 7.2M15.6 8.4a5.1 5.1 0 0 1 0 7.2M5.6 5.6a9 9 0 0 0 0 12.8M18.4 5.6a9 9 0 0 1 0 12.8"/>'),
    pointer: svg('<path d="M5 4l6.5 15.5 2.3-6.2L20 11z"/>'),
    gap: svg('<rect x="3" y="4" width="7.5" height="16" rx="1.2"/><rect x="13.5" y="4" width="7.5" height="16" rx="1.2"/>'),
    shield: svg('<path d="M12 3.2 19.5 6v5.6c0 4.4-3.2 8.1-7.5 9.2-4.3-1.1-7.5-4.8-7.5-9.2V6z"/><path d="m9 12 2 2 4-4"/>'),
    eyeOff: svg('<path d="M3.5 3.5l17 17"/><path d="M10.5 6.2A9.9 9.9 0 0 1 12 6c5.6 0 9 6 9 6a16.7 16.7 0 0 1-3 3.7M6.6 6.8C4.2 8.4 3 12 3 12s3.4 6 9 6c1.5 0 2.9-.4 4.1-1"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>'),
    maximize: svg('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>'),
    help: svg('<circle cx="12" cy="12" r="8.6"/><path d="M9.6 9.6a2.5 2.5 0 1 1 3.4 2.3c-.6.3-1 .8-1 1.5v.5"/><path d="M12 17h.01"/>'),
    refresh: svg('<path d="M19.5 11.5A7.5 7.5 0 1 0 17.3 17"/><path d="M20 4.5v6h-6"/>'),
    back: svg('<path d="M19 12H5.5M11 6l-6 6 6 6"/>'),
    close: svg('<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>'),
    external: svg('<path d="M14 4.5h5.5V10M19.5 4.5 11 13"/><path d="M18 14v4.5a1 1 0 0 1-1 1H5.5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1H10"/>'),
    fill: svg('<path d="M3.5 8.5v-4h4M20.5 8.5v-4h-4M3.5 15.5v4h4M20.5 15.5v4h-4"/><rect x="7.5" y="8.5" width="9" height="7" rx="1"/>'),
    page: svg('<path d="M6.5 3.5h7.5l4 4v13h-11.5z"/><path d="M14 3.5v4h4M9.5 12h5M9.5 15.5h5"/>'),
    grip: svg('<circle cx="9" cy="6.5" r="1.4"/><circle cx="15" cy="6.5" r="1.4"/><circle cx="9" cy="12" r="1.4"/><circle cx="15" cy="12" r="1.4"/><circle cx="9" cy="17.5" r="1.4"/><circle cx="15" cy="17.5" r="1.4"/>', true),
  };
})(typeof self !== 'undefined' ? self : this);
