# Scale and speed check (local stand-in)

Times The Clarity Portal's main pages at Tim's scale (1,000 clients, 15 coaches) against a local stand-in for Supabase. Nothing hosted is touched and nothing is sent. The older `run.mjs`, `seed.sql` and `measure.sql` here are Phase 1's database-only timing on the test project. They are separate from this check.

## The parts

- `db.mjs`: the local database (PGlite: Postgres in WASM, in memory). `--base out.tar` builds it from the scaffolding and migrations 024 onwards. `--from in.tar [--dump out.tar] FILE.sql` runs SQL on a copy.
- `seed/01-04-*.sql`, `seed.mjs`: the invented data (names from two lists, example.com addresses, +44 7700 900xxx numbers). `seed-counts.json` holds the counts from the last run.
- `stack.mjs`: the stand-in API on one port. It runs PGlite on a local socket (`@electric-sql/pglite-socket`) and the official PostgREST binary (v16.5, macOS arm64, sha256 `d8095cb4…846a`, from github.com/PostgREST/postgrest/releases) with one connection, so every request runs under the real row rules as `anon` or `authenticated`. It also has a small GoTrue stand-in. Coaches with an authenticator get `aal2`, and everyone else gets `aal1`. Every request is counted at `/__stats`. `/__session?email=` gives a signed-in session, and `/__plan?path=` replays a GET with EXPLAIN ANALYZE. `/functions/v1` and `/storage/v1` are answered locally and never forwarded.
- `serve.mjs`: serves a production build like Vercel, with the same rewrites and cache headers, plus brotli or gzip.
- `timing.mjs`: Playwright, muted, blocks every request that isn't to this machine. It measures each page cold and warm, at 1440 wide and on a throttled phone.
- `explain.mjs`: EXPLAIN ANALYZE of the main reads, as the person who makes them.
- `offline-reload.mjs`: traces the coach portal reloading offline, step by step.
- `report.mjs`: turns the results into the table in `BASELINE.md`.

## Run it

```bash
cd tests/scale && npm install            # its own packages only, never the app's
P=<scratch>/pglite                       # where the snapshots live (not in git: ~100 to 500 MB)
node db.mjs --base $P/base-055.tar       # once: migrations 024 to 055
node seed.mjs --from $P/base-055.tar --to $P/base-scale.tar   # about 40 s
POSTGREST_BIN=<path>/postgrest node stack.mjs --snapshot $P/base-scale.tar --port 54400 &
cd ../.. && VERCEL_ENV=production VITE_SUPABASE_URL=http://localhost:54400 \
  VITE_SUPABASE_ANON_KEY=<the key printed when stack.mjs runs with SCALE_PRINT_ANON=1> npx vite build --outDir <scratch>/dist --emptyOutDir
node tests/scale/serve.mjs <scratch>/dist 4319 &
node --import ./tests/scores/register.mjs tests/scale/timing.mjs --out <scratch>/results.jsonl \
  --roles client --sizes laptop,phone          # split by --roles/--sizes/--pages to keep each run under 10 minutes
node --import ./tests/scores/register.mjs tests/scale/timing.mjs --out <scratch>/results.jsonl --roles associate,owner --sizes laptop --offline
node tests/scale/report.mjs <scratch>/results.jsonl
node tests/scale/explain.mjs --from $P/base-scale.tar
```

Stop the stand-in and the server with `kill` when you're done. PGlite runs single-threaded in WASM on one connection, so its absolute times differ from hosted Supabase: parallel requests wait in a queue. Read the request counts, rows, bytes and plans alongside the times, because those carry over to the real database.
