-- =============================================================================
-- mission_progress_reviews_update_test.sql
-- Checks 023_mission_progress_reviews_update.sql. RUN ORDER: 023 first, then this.
--
-- WHAT IT DOES
--   Everything happens inside one transaction that is ROLLED BACK at the end,
--   so nothing is left behind. It acts as two fake signed-in people (A and B)
--   using "set local role authenticated" and "request.jwt.claims", and checks:
--     1. A can save a review as a draft and then save it over itself
--     2. A can finish the draft (status final)
--     3. A cannot hand the review to B
--     4. B cannot change the review of A (nothing is changed)
--   If every check passes it finishes with the notice "ALL CHECKS PASSED".
--   If one fails, it stops with a message starting "FAIL". Nothing is saved.
-- =============================================================================

begin;

do $mpr$
declare
  u_a  uuid := gen_random_uuid();
  u_b  uuid := gen_random_uuid();
  m_id uuid;
  r_id uuid;
  n    integer;
begin
  insert into auth.users (id, email, aud, role) values
    (u_a, 'mpr-test-a-' || u_a || '@example.invalid', 'authenticated', 'authenticated'),
    (u_b, 'mpr-test-b-' || u_b || '@example.invalid', 'authenticated', 'authenticated');

  -- ---------------------------------------------------------------- person A
  perform set_config('request.jwt.claims', json_build_object('sub', u_a, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  if auth.uid() is distinct from u_a then raise exception 'FAIL: could not act as person A'; end if;

  m_id := gen_random_uuid();
  insert into public.missions (id, user_id, title) values (m_id, u_a, 'Test mission');
  r_id := gen_random_uuid();
  insert into public.mission_progress_reviews (id, mission_id, user_id, review_data, status)
  values (r_id, m_id, u_a, '{"note":"first"}', 'draft');

  -- 1. the draft saved over itself
  update public.mission_progress_reviews set review_data = '{"note":"second"}', updated_at = now()
  where id = r_id and user_id = u_a;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: A could not save the draft over itself (% rows changed)', n; end if;
  if (select review_data ->> 'note' from public.mission_progress_reviews where id = r_id) <> 'second' then
    raise exception 'FAIL: the draft did not keep the second save';
  end if;

  -- 2. the draft finished
  update public.mission_progress_reviews set status = 'final' where id = r_id;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: A could not finish the draft'; end if;

  -- 3. not handed to someone else
  begin
    update public.mission_progress_reviews set user_id = u_b where id = r_id;
    raise exception 'FAIL: A could hand the review to B';
  exception when insufficient_privilege then null;
  end;

  -- ---------------------------------------------------------------- person B
  perform set_config('request.jwt.claims', json_build_object('sub', u_b, 'role', 'authenticated')::text, true);
  if auth.uid() is distinct from u_b then raise exception 'FAIL: could not act as person B'; end if;

  -- 4. B cannot change the review of A
  update public.mission_progress_reviews set review_data = '{"note":"by B"}' where id = r_id;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: B changed the review of A'; end if;

  raise notice 'ALL CHECKS PASSED';
end;
$mpr$;

-- Throw everything away: the two test sign-ins and all of their rows.
rollback;
