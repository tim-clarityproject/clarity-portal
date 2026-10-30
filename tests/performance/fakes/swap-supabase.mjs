// A resolve hook for the queue's unit tests: the app's Supabase client
// (src/lib/supabase.js, which needs Vite's settings) is swapped for the
// in-memory stand-in next to this file.
export async function resolve(specifier, context, next) {
  const r = await next(specifier, context);
  if (r.url.endsWith('/src/lib/supabase.js')) return { ...r, url: new URL('./supabase.mjs', import.meta.url).href };
  return r;
}
