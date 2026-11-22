// The local stand-in database for the scale check: PGlite (Postgres in WASM,
// in memory). Nothing hosted is touched.
//
//   node tests/scale/db.mjs --base <out.tar>
//        builds the stand-in from nothing: the Supabase scaffolding below,
//        then supabase/migrations/024 onwards in order (the same as the
//        dry-run base, base-055.tar)
//   node tests/scale/db.mjs --from <in.tar> [--dump <out.tar>] FILE.sql ...
//        runs each file in order on a copy of a snapshot, stops at the first
//        error, and keeps the result only with --dump
//   node tests/scale/db.mjs --from <in.tar> --query "select ..."
//        prints the rows of one statement as JSON lines
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import { citext } from '@electric-sql/pglite/contrib/citext';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');

// The least Supabase scaffolding the migrations need (roles, the auth
// schema's users table and helpers, storage). auth.uid() and auth.jwt() read
// PostgREST's request.jwt.claims, so row rules see the person.
export const SCAFFOLD = `
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin noinherit bypassrls; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticator') then create role authenticator noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then create role supabase_auth_admin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'supabase_storage_admin') then create role supabase_storage_admin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'dashboard_user') then create role dashboard_user noinherit; end if;
end $$;
grant anon, authenticated, service_role to postgres;
create schema if not exists extensions;
create schema if not exists auth;
create schema if not exists storage;
grant usage on schema public, extensions, auth, storage to anon, authenticated, service_role;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists "uuid-ossp" with schema extensions;
create table if not exists auth.users (
  instance_id uuid, id uuid primary key default gen_random_uuid(), aud varchar(255), role varchar(255),
  email varchar(255), encrypted_password varchar(255), email_confirmed_at timestamptz, invited_at timestamptz,
  confirmation_token varchar(255), confirmation_sent_at timestamptz, recovery_token varchar(255), recovery_sent_at timestamptz,
  email_change_token_new varchar(255), email_change varchar(255), email_change_sent_at timestamptz, last_sign_in_at timestamptz,
  raw_app_meta_data jsonb, raw_user_meta_data jsonb, is_super_admin boolean, created_at timestamptz default now(), updated_at timestamptz default now(),
  phone text, phone_confirmed_at timestamptz, banned_until timestamptz, deleted_at timestamptz, is_anonymous boolean not null default false
);
create or replace function auth.uid() returns uuid language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''), (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'))::uuid
$$;
create or replace function auth.role() returns text language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'))::text
$$;
create or replace function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim', true), ''), nullif(current_setting('request.jwt.claims', true), ''))::jsonb
$$;
create or replace function auth.email() returns text language sql stable as $$
  select (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email')::text
$$;
grant execute on function auth.uid(), auth.role(), auth.jwt(), auth.email() to anon, authenticated, service_role;
create table if not exists storage.buckets (
  id text primary key, name text not null, owner uuid, created_at timestamptz default now(), updated_at timestamptz default now(),
  public boolean default false, avif_autodetection boolean default false, file_size_limit bigint, allowed_mime_types text[], owner_id text
);
create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets (id), name text, owner uuid,
  created_at timestamptz default now(), updated_at timestamptz default now(), last_accessed_at timestamptz default now(),
  metadata jsonb, path_tokens text[], version text, owner_id text, user_metadata jsonb
);
alter table storage.objects enable row level security;
create or replace function storage.foldername(name text) returns text[] language sql immutable as $$
  select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1]
$$;
create or replace function storage.filename(name text) returns text language sql immutable as $$
  select (string_to_array(name, '/'))[array_length(string_to_array(name, '/'), 1)]
$$;
grant all on all tables in schema storage to service_role;
grant select, insert, update, delete on storage.objects to authenticated;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
`;

export const EXTENSIONS = { pgcrypto, uuid_ossp, btree_gist, citext, pg_trgm };
export async function openDb(from) {
  const options = { extensions: EXTENSIONS };
  if (from) options.loadDataDir = new Blob([readFileSync(from)]);
  return PGlite.create(options);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  let from = null; let dump = null; let base = null; let query = null;
  const files = [];
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--from') from = args[++i];
    else if (args[i] === '--dump') dump = args[++i];
    else if (args[i] === '--base') base = args[++i];
    else if (args[i] === '--query') query = args[++i];
    else files.push(args[i]);
  }
  if (base) {
    dump = base;
    const dir = join(REPO, 'supabase/migrations');
    files.unshift(...readdirSync(dir).filter((f) => /^\d{3}_.*\.sql$/.test(f) && Number(f.slice(0, 3)) >= 24).sort().map((f) => join(dir, f)));
  }
  const db = await openDb(from);
  if (base) await db.exec(SCAFFOLD);
  let failed = false;
  const show = (n) => { const line = `${n.severity || 'NOTICE'}: ${n.message}`; if (process.env.VERBOSE || /PASSED|FAILED|SEED/.test(line)) console.log(line.slice(0, 600)); };
  if (query) {
    const r = await db.query(query);
    for (const row of r.rows) console.log(JSON.stringify(row));
  }
  for (const file of files) {
    const sql = readFileSync(file, 'utf8');
    const t = Date.now();
    try {
      await db.exec(sql, { onNotice: show });
      console.log(`ok   ${file.split('/').pop()} (${Date.now() - t} ms)`);
    } catch (e) {
      failed = true;
      console.log(`STOP ${file.split('/').pop()}: ${String(e.message).slice(0, 2000)}`);
      if (e.where) console.log(`  where: ${String(e.where).slice(0, 600)}`);
      if (e.position) { const p = Number(e.position); console.log(`  near: ${sql.slice(Math.max(0, p - 200), p + 200)}`); }
      break;
    }
  }
  if (dump && !failed) {
    const blob = await db.dumpDataDir('none');
    writeFileSync(dump, Buffer.from(await blob.arrayBuffer()));
    console.log(`kept the stand-in at ${dump}`);
  }
  await db.close();
  process.exit(failed ? 1 : 0);
}
