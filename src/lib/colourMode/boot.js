/* Colour mode: Light, Dark or Match my device (portal-overhaul-decisions.md,
   "Light mode rules come next"; design-reference-v3.html "Choosing a mode").

   This file is plain script with no imports or exports, so it can run in
   two ways and stay one source:
   - inlined into <head> by vite.config.js, so the mode is set before the
     first paint and the page never flashes the wrong colours;
   - imported by useColourMode.js, which only uses what it defines.

   It sets html[data-theme] to "light" or "dark" (tokens.css switches the
   colour tokens on that), the browser's colour scheme, the page
   background behind the app, and the browser's theme colour, and keeps
   following the phone or laptop when the choice is Match my device,
   including when it switches at night.

   The choice is remembered on this device for now; from Phase 1 the
   account saves it.

   Existing pages stay in dark until each is rebuilt in its own phase
   (Tim, 23 Oct), so nobody on a light-mode phone sees a page half in
   light mode. Only the pages listed in BOTH_MODES follow the choice;
   every other page shows dark whatever the choice, without changing it.
   A page joins the list when its phase rebuilds it for both modes. */
(function () {
  if (typeof window === 'undefined' || window.ClarityColourMode) return;

  var KEY = 'clarity-colour-mode';
  var CHOICES = ['light', 'dark', 'device'];
  var EVENT = 'clarity-colour-mode';
  // The page background in each mode, for the browser's theme colour and
  // the area behind the app before the styles load. Mirrors --bg in
  // src/styles/tokens.css (JavaScript can't read the tokens before the
  // first paint).
  var BACKGROUND = { dark: '#000000', light: '#F9F8F5' };

  // Pages rebuilt for both modes (path prefixes).
  var BOTH_MODES = ['/design-reference', '/performance-plan', '/performance-sprint', '/recovery'];

  var media = window.matchMedia ? window.matchMedia('(prefers-color-scheme: light)') : null;

  function read() {
    try {
      var saved = window.localStorage.getItem(KEY);
      if (CHOICES.indexOf(saved) !== -1) return saved;
    } catch {
      // Storage blocked: Match my device, the starting choice.
    }
    return 'device';
  }

  var choice = read();

  function pageHasBothModes() {
    var path = window.location.pathname.replace(/\/+$/, '');
    for (var i = 0; i < BOTH_MODES.length; i += 1) {
      var page = BOTH_MODES[i];
      if (path === page || path.indexOf(page + '/') === 0) return true;
    }
    return false;
  }

  function resolve(c) {
    if (!pageHasBothModes()) return 'dark';
    if (c === 'light' || c === 'dark') return c;
    return media && media.matches ? 'light' : 'dark';
  }

  function apply() {
    var mode = resolve(choice);
    var html = document.documentElement;
    html.setAttribute('data-theme', mode);
    html.style.colorScheme = mode;
    html.style.background = BACKGROUND[mode];
    if (document.body) document.body.style.background = BACKGROUND[mode];
    var metas = document.querySelectorAll('meta[name="theme-color"]');
    if (metas.length === 0) {
      var meta = document.createElement('meta');
      meta.name = 'theme-color';
      document.head.appendChild(meta);
      metas = [meta];
    }
    for (var i = 0; i < metas.length; i += 1) metas[i].setAttribute('content', BACKGROUND[mode]);
    return mode;
  }

  function announce() {
    var detail = { choice: choice, mode: resolve(choice) };
    try {
      window.dispatchEvent(new CustomEvent(EVENT, { detail: detail }));
    } catch {
      // Very old browsers: nothing listens there anyway.
    }
  }

  function set(next) {
    if (CHOICES.indexOf(next) === -1) return;
    choice = next;
    try {
      window.localStorage.setItem(KEY, next);
    } catch {
      // Storage blocked: the choice lasts until the page is closed.
    }
    apply();
    announce();
  }

  // The device switching between light and dark (for example at night).
  function onDeviceChange() {
    if (choice !== 'device') return;
    apply();
    announce();
  }
  if (media) {
    if (media.addEventListener) media.addEventListener('change', onDeviceChange);
    else if (media.addListener) media.addListener(onDeviceChange);
  }

  // Another tab changed the choice.
  window.addEventListener('storage', function (e) {
    if (e.key !== KEY) return;
    choice = read();
    apply();
    announce();
  });

  apply();
  // The body doesn't exist yet when this runs in <head>; give it the
  // same background as soon as it does.
  if (!document.body) {
    document.addEventListener('DOMContentLoaded', apply, { once: true });
  }

  // The app moved to another page: it may show both modes or only dark.
  function refresh() {
    var before = document.documentElement.getAttribute('data-theme');
    if (apply() !== before) announce();
  }

  window.ClarityColourMode = {
    EVENT: EVENT,
    get: function () { return choice; },
    mode: function () { return resolve(choice); },
    set: set,
    refresh: refresh,
  };
})();
