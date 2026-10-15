-- =============================================================================
-- alignment_sessions_test.sql
-- Checks that the Strategic Alignment Health Check database works.
--
-- RUN ORDER: run supabase/migrations/018_alignment_sessions.sql FIRST, then this.
--
-- WHAT IT DOES
--   Creates a throwaway session, then checks, in order:
--     1. opening with the wrong code is refused (generic message)
--     2. opening with the right code works
--     3. two saves in a row work and the version goes 0 -> 1 -> 2
--     4. a save with an out-of-date version is a conflict and writes nothing
--     5. bad answers (rating of 9) are refused
--     6. five wrong codes lock the session, even the right code is refused
--     7. the throwaway row is deleted
--   If every check passes it finishes with no error (the editor may also show
--   the "OK" and "ALL CHECKS PASSED" notices). If one fails, the script stops
--   with a message starting "FAIL" saying which, and nothing is left behind.
--
-- This script is safe to run in the SQL editor (it runs as the admin).
-- =============================================================================

do $$
declare
  c       jsonb;
  v_token text;
  v_code  text;
  r       jsonb;
  d1      jsonb := '{"objective":"Test objective","csfs":[{"id":"c1","text":"Factor one"}],"projects":[{"id":"p1","text":"Project one"}],"ratings":{"owner":{"p1":{"contrib":{"c1":2},"progress":3,"resource":4}}}}';
  d2      jsonb := '{"objective":"Changed objective","csfs":[{"id":"c1","text":"Factor one"}],"projects":[{"id":"p1","text":"Project one"}],"ratings":{"owner":{"p1":{"contrib":{"c1":3},"progress":4,"resource":2}}}}';
  i       integer;
begin
  c := public.create_alignment_session('TEST - delete me', '  Test.Person@Example.COM ');
  v_token := c ->> 'token';
  v_code  := c ->> 'access_code';

  if char_length(v_token) < 32 then raise exception 'FAIL: token too short'; end if;
  if char_length(v_code) <> 6 then raise exception 'FAIL: code is not 6 characters'; end if;
  if c ->> 'link_path' <> '/health-check/' || v_token then raise exception 'FAIL: link path'; end if;

  -- 1. wrong code
  r := public.alignment_open(v_token, 'test.person@example.com', 'ZZZZZZ');
  if (r ->> 'ok')::boolean then raise exception 'FAIL: wrong code was accepted'; end if;
  raise notice 'OK 1: wrong code refused: %', r ->> 'message';

  -- 2. right code (email in different case and spacing, code in lower case)
  r := public.alignment_open(v_token, ' TEST.person@example.com ', lower(v_code));
  if not (r ->> 'ok')::boolean then raise exception 'FAIL: right details refused: %', r; end if;
  if (r ->> 'version')::int <> 0 then raise exception 'FAIL: version should start at 0'; end if;
  raise notice 'OK 2: opened, status %, version %', r ->> 'status', r ->> 'version';

  -- 3. two saves
  r := public.alignment_save(v_token, 'test.person@example.com', v_code, d1, '{"screen":"objective"}', 0);
  if not (r ->> 'ok')::boolean or (r ->> 'version')::int <> 1 then raise exception 'FAIL: first save: %', r; end if;
  r := public.alignment_save(v_token, 'test.person@example.com', v_code, d2, '{"screen":"rate","project":0}', 1);
  if not (r ->> 'ok')::boolean or (r ->> 'version')::int <> 2 then raise exception 'FAIL: second save: %', r; end if;
  raise notice 'OK 3: two saves, version now %', r ->> 'version';

  -- 4. conflict (still sending version 1)
  r := public.alignment_save(v_token, 'test.person@example.com', v_code, d1, null, 1);
  if (r ->> 'ok')::boolean or not coalesce((r ->> 'conflict')::boolean, false) then
    raise exception 'FAIL: expected a conflict: %', r;
  end if;
  if r -> 'data' ->> 'objective' <> 'Changed objective' then
    raise exception 'FAIL: conflict overwrote the stored data';
  end if;
  raise notice 'OK 4: conflict returned the stored copy at version %', r ->> 'version';

  -- 5. bad rating
  r := public.alignment_save(v_token, 'test.person@example.com', v_code,
         '{"ratings":{"owner":{"p1":{"progress":9}}}}', null, 2);
  if (r ->> 'ok')::boolean or r ->> 'error' <> 'invalid_data' then
    raise exception 'FAIL: bad rating was accepted: %', r;
  end if;
  raise notice 'OK 5: bad rating refused: %', r ->> 'message';

  -- 6. lockout
  for i in 1..5 loop
    perform public.alignment_open(v_token, 'test.person@example.com', 'WRONG1');
  end loop;
  r := public.alignment_open(v_token, 'test.person@example.com', v_code);
  if (r ->> 'ok')::boolean or r ->> 'error' <> 'locked' then
    raise exception 'FAIL: expected lockout: %', r;
  end if;
  raise notice 'OK 6: locked after 5 wrong attempts: %', r ->> 'message';

  -- 7. clean up
  delete from public.alignment_sessions where token = v_token;
  raise notice 'OK 7: test row deleted';
  raise notice 'ALL CHECKS PASSED';
end;
$$;
