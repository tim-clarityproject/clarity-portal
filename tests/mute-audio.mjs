// Every browser a test starts is silent (Tim, 16 Nov: nothing plays out loud
// on his laptop). Loaded by tests/scores/register.mjs, which every browser
// suite is run with (node --import ./tests/scores/register.mjs ...), so no
// suite has to remember it:
//   Chromium: --mute-audio.
//   Firefox: the media volume scale set to 0.
//   WebKit (no such option): every page's media plays at volume 0. Only the
//   sound itself: `muted` is left as the page set it, and reading `volume`
//   gives what the page asked for (1 unless it set one), so the page and a
//   test of its own sound setting see the page's choice, never the silence.
const SILENT_PAGES = () => {
  const vol = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'volume');
  if (!vol?.set || !vol?.get) return;
  const asked = new WeakMap();
  const quiet = (el) => { try { vol.set.call(el, 0); } catch { /* not media */ } };
  const play = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function playSilently(...args) { quiet(this); return play.apply(this, args); };
  // Media that starts by itself (autoplay) never calls play().
  document.addEventListener('play', (e) => quiet(e.target), true);
  Object.defineProperty(HTMLMediaElement.prototype, 'volume', {
    ...vol,
    get() { return asked.has(this) ? asked.get(this) : 1; },
    set(v) { vol.set.call(this, v); asked.set(this, vol.get.call(this)); vol.set.call(this, 0); },
  });
};

function silence(type, patch) {
  for (const name of ['launch', 'launchPersistentContext']) {
    const real = type[name];
    if (typeof real !== 'function' || real.__silent) continue;
    const wrapped = async function launchSilently(...args) {
      const i = name === 'launch' ? 0 : 1;
      args[i] = patch({ ...(args[i] || {}) });
      const out = await real.apply(this, args);
      if (type.name() === 'webkit') {
        if (name === 'launch') {
          const newContext = out.newContext.bind(out);
          out.newContext = async (...a) => { const ctx = await newContext(...a); await ctx.addInitScript(SILENT_PAGES); return ctx; };
          const newPage = out.newPage.bind(out);
          out.newPage = async (...a) => { const page = await newPage(...a); await page.addInitScript(SILENT_PAGES); return page; };
        } else {
          await out.addInitScript(SILENT_PAGES);
        }
      }
      return out;
    };
    wrapped.__silent = true;
    type[name] = wrapped;
  }
}

try {
  const pw = await import('playwright');
  silence(pw.chromium, (o) => ({ ...o, args: [...(o.args || []).filter((a) => a !== '--mute-audio'), '--mute-audio'] }));
  silence(pw.firefox, (o) => ({ ...o, firefoxUserPrefs: { ...(o.firefoxUserPrefs || {}), 'media.volume_scale': '0.0' } }));
  silence(pw.webkit, (o) => o);
} catch {
  // No Playwright here: nothing to silence.
}
