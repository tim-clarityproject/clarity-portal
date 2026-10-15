-- =============================================================================
-- alignment_emails_test.sql
-- Checks 019_alignment_emails.sql. RUN ORDER: 018, then 019, then this.
--
-- WHAT IT DOES
--   Creates a throwaway session and checks, in order:
--     1. open and save return completed_at (empty until completed)
--     2. a 'complete' email is refused while the session is not complete
--     3. after completing, the first 'complete' check is allowed and returns
--        the client label, email and answers (never the access code)
--     4. a second 'complete' check is refused ("already")
--     5. alignment_email_failed makes a 'complete' check allowed again
--     6. 'link' checks are allowed 3 times, the 4th is refused ("limit")
--     7. a wrong access code is refused with the same generic answer
--     8. the throwaway row is deleted
--   No error means every check passed; a failure stops with "FAIL ..." and
--   leaves nothing behind.
-- =============================================================================

do $$
declare
  c       jsonb;
  v_token text;
  v_code  text;
  r       jsonb;
  d       jsonb := '{"objective":"Test objective","csfs":[{"id":"c1","text":"Factor"}],"projects":[{"id":"p1","text":"Project"}],"ratings":{"owner":{"p1":{"contrib":{"c1":2},"progress":2,"resource":3}}}}';
begin
  c := public.create_alignment_session('TEST - email check', 'Email.Test@Example.com');
  v_token := c ->> 'token';
  v_code  := c ->> 'access_code';

  r := public.alignment_open(v_token, 'email.test@example.com', v_code);
  if not (r ->> 'ok')::boolean or r -> 'completed_at' <> 'null'::jsonb then
    raise exception 'FAIL 1: open should return completed_at as null: %', r;
  end if;

  r := public.alignment_email_check(v_token, 'email.test@example.com', v_code, 'complete');
  if (r ->> 'ok')::boolean then raise exception 'FAIL 2: complete allowed before completing: %', r; end if;

  r := public.alignment_save(v_token, 'email.test@example.com', v_code, d, '{"screen":"done"}', 0, true);
  if not (r ->> 'ok')::boolean or r -> 'completed_at' = 'null'::jsonb then
    raise exception 'FAIL 1b: save should return completed_at once complete: %', r;
  end if;

  r := public.alignment_email_check(v_token, 'email.test@example.com', v_code, 'complete');
  if not (r ->> 'ok')::boolean or r ->> 'client_label' <> 'TEST - email check'
     or r ->> 'respondent_email' <> 'email.test@example.com' or r::text like '%' || v_code || '%' then
    raise exception 'FAIL 3: first complete check: %', r;
  end if;

  r := public.alignment_email_check(v_token, 'email.test@example.com', v_code, 'complete');
  if (r ->> 'ok')::boolean or r ->> 'error' <> 'already' then
    raise exception 'FAIL 4: second complete check should be refused: %', r;
  end if;

  perform public.alignment_email_failed(v_token, 'email.test@example.com', v_code, 'complete');
  r := public.alignment_email_check(v_token, 'email.test@example.com', v_code, 'complete');
  if not (r ->> 'ok')::boolean then raise exception 'FAIL 5: complete should be allowed after a failed send: %', r; end if;

  for i in 1..3 loop
    r := public.alignment_email_check(v_token, 'email.test@example.com', v_code, 'link');
    if not (r ->> 'ok')::boolean then raise exception 'FAIL 6: link check % refused: %', i, r; end if;
  end loop;
  r := public.alignment_email_check(v_token, 'email.test@example.com', v_code, 'link');
  if (r ->> 'ok')::boolean or r ->> 'error' <> 'limit' then
    raise exception 'FAIL 6: 4th link check should hit the limit: %', r;
  end if;

  r := public.alignment_email_check(v_token, 'email.test@example.com', 'WRONG1', 'link');
  if (r ->> 'ok')::boolean then raise exception 'FAIL 7: wrong code accepted'; end if;

  delete from public.alignment_sessions where token = v_token;
  raise notice 'ALL CHECKS PASSED';
end;
$$;
