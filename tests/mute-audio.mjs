// Every browser a test starts is silent (Tim, 16 Nov: nothing plays out loud
// on his laptop). Loaded by tests/scores/register.mjs, which every browser
// suite is run with (node --import ./tests/scores/register.mjs ...), so no
// suite has to remember it:
//   Chromium: --mute-audio.
//   Firefox: the media volume scale set to 0.
//   WebKit (no such option): every page's media plays at volume 0. Only the
//   volume: `muted` is left as the page set it, so a test of the page's own
//   sound setting still reads the page's choice.
const SILENT_PAGES = () => {
  const quiet = (el) => { try { el.volume = 0; } catch { /* not media */ } };
  const play = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function playSilently(...args) { quiet(this); return play.apply(this, args); };
  const vol = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'volume');
  if (vol?.set) Object.defineProperty(HTMLMediaElement.prototype, 'volume', { ...vol, set() { vol.set.call(this, 0); } });
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
