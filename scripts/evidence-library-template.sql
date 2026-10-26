-- =============================================================================
-- 031_evidence_library.sql
-- Phase 1 data model, part 6 of 6: the evidence library
-- (phase-1-data-model-spec.md section 11)
--
-- Made by scripts/make-evidence-seed.mjs from docs/claims-register.md and
-- scripts/evidence-library-template.sql. Change those, not this file, then
-- run: node scripts/make-evidence-seed.mjs
--
-- WHAT THIS DOES (plain English)
--     evidence_references        each source: citation, link(s), what it
--                                found, size of effect, how it was checked,
--                                date checked, who added it
--     evidence_claims            each claim as the portal says it, where it
--                                shows, its strength (Strong, Moderate, Early,
--                                Our model), caveat and references
--     evidence_tools             each tool: what it's based on, its strength,
--                                its claims, whether it is flagged for Tim
--                                (Early or Our model), and the "Why this
--                                works" switch that hides it from clients
--                                (the record stays)
--     evidence_claim_references, evidence_tool_claims   the links between them
--   Seeded exactly from the claims register version @VERSION@ (Parts A, B and C):
--   @COUNTS@
--
-- WHO CAN SEE WHAT
--   The owner (Tim) adds and edits. Coaches read. Clients read only a
--   visible tool's "Why this works", through public.why_this_works().
--
-- SAFE TO RUN TWICE
--   Yes. The seed adds only what is missing, so later edits are kept.
--
-- HOW TO RUN
--   After 030. Then run supabase/031_evidence_library_test.sql.
-- =============================================================================

create table if not exists public.evidence_references (
  id               text primary key check (id ~ '^R[0-9]+$'),
  citation         text not null,
  links            text[] not null default '{}'::text[],
  found            text,
  effect_size      text,
  checked_on       text,
  date_checked     date,
  added_by         text,
  register_version text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table if not exists public.evidence_claims (
  id                 text primary key check (id ~ '^C[0-9]+$'),
  area               text,
  wording            text not null,
  where_it_shows     text,
  strength           text not null,
  strength_level     text not null check (strength_level in ('strong', 'moderate', 'early', 'our_model')),
  sources            text,
  caveat             text,
  practitioner_model boolean not null default false,
  register_version   text,
  sort_order         integer not null default 0,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create table if not exists public.evidence_claim_references (
  claim_id     text not null references public.evidence_claims (id) on delete cascade,
  reference_id text not null references public.evidence_references (id) on delete cascade,
  primary key (claim_id, reference_id)
);
create index if not exists evidence_claim_references_reference_idx on public.evidence_claim_references (reference_id);

create table if not exists public.evidence_tools (
  key                    text primary key check (key ~ '^[a-z0-9_]{2,60}$'),
  name                   text not null unique,
  based_on               text,
  claims                 text,
  strength               text not null,
  strength_level         text not null check (strength_level in ('strong', 'moderate', 'early', 'our_model')),
  flagged                boolean not null default false,
  why_this_works_visible boolean not null default true,
  register_version       text,
  sort_order             integer not null default 0,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
comment on column public.evidence_tools.why_this_works_visible is
  'Tim''s switch: off hides the tool''s "Why this works" from clients; the record stays (Tim, 26 Oct, 16:54).';

create table if not exists public.evidence_tool_claims (
  tool_key text not null references public.evidence_tools (key) on delete cascade on update cascade,
  claim_id text not null references public.evidence_claims (id) on delete cascade,
  primary key (tool_key, claim_id)
);
create index if not exists evidence_tool_claims_claim_idx on public.evidence_tool_claims (claim_id);

do $touch$
declare t text;
begin
  foreach t in array array['evidence_references', 'evidence_claims', 'evidence_tools'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_touch', t);
    execute format('create trigger %I before update on public.%I for each row execute function public.p1_touch()', t || '_touch', t);
  end loop;
end
$touch$;

-- ---------------------------------------------------------------- grants and rules
do $rules$
declare t text;
begin
  foreach t in array array['evidence_references', 'evidence_claims', 'evidence_claim_references', 'evidence_tools', 'evidence_tool_claims'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from public, anon, authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('drop policy if exists "Evidence: coaches read" on public.%I', t);
    execute format('create policy "Evidence: coaches read" on public.%I for select to authenticated using ((select public.is_coach()))', t);
    execute format('drop policy if exists "Evidence: owner writes" on public.%I', t);
    execute format('create policy "Evidence: owner writes" on public.%I for all to authenticated using ((select public.is_owner())) with check ((select public.is_owner()))', t);
  end loop;
end
$rules$;

-- A tool's "Why this works", for clients: only while Tim's switch is on.
-- The tool's basis and strength, then each claim with its caveat and its
-- references. Null for a hidden or unknown tool.
create or replace function public.why_this_works(p_tool_key text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'tool', t.name,
    'based_on', t.based_on,
    'strength', t.strength,
    'strength_level', t.strength_level,
    'claims', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id, 'wording', c.wording, 'strength', c.strength, 'strength_level', c.strength_level, 'caveat', c.caveat,
        'references', coalesce((select jsonb_agg(jsonb_build_object('citation', r.citation, 'links', to_jsonb(r.links)) order by r.id)
                                from public.evidence_claim_references cr join public.evidence_references r on r.id = cr.reference_id
                                where cr.claim_id = c.id), '[]'::jsonb))
        order by c.sort_order)
      from public.evidence_tool_claims tc join public.evidence_claims c on c.id = tc.claim_id
      where tc.tool_key = t.key), '[]'::jsonb)
  )
  from public.evidence_tools t
  where t.key = p_tool_key and t.why_this_works_visible and (select auth.uid()) is not null;
$$;
revoke all on function public.why_this_works(text) from public, anon;
grant execute on function public.why_this_works(text) to authenticated;

-- ---------------------------------------------------------------- the seed
-- @SEED@

select public.record_migration(31, '031_evidence_library');
