// The shared routers (Vercel's Hobby plan allows 12 functions; Tim, 24 Nov 2026): each function in api/ serves several
// addresses, rewritten to it by vercel.json with ?__route=<the old file's name>, so every address, check and secret is
// exactly as it was. The handlers live in api/_routes/ (a folder starting with _ is never a function of its own).
// tests/performance/api-functions.test.mjs fails if api/ ever holds more than 10 functions.

/** One function for several addresses: the handler named by ?__route, or 404 for anything else. */
export function route(table) {
  return async function handler(req, res, env) {
    const name = typeof req.query?.__route === 'string' ? req.query.__route : '';
    const fn = Object.prototype.hasOwnProperty.call(table, name) ? table[name] : null;
    if (!fn) {
      res.status(404).setHeader('Cache-Control', 'no-store');
      res.json({ ok: false });
      return undefined;
    }
    // The handler sees the query exactly as the caller sent it.
    if (req.query) delete req.query.__route;
    return env === undefined ? fn(req, res) : fn(req, res, env);
  };
}
