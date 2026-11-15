// The rules test's part for the Health Check's answers (migration 036): only
// the coach who made the link reads the answers, the owner reads only their
// own links and older links with no coach recorded, and only the server
// learns who gets the emails. config.mjs brings it together. Everything is
// skipped on a database without 036.
//
// SETUP makes three finished Health Checks inside the rolled-back
// transaction, with known test links (rules-hc-coach, rules-hc-owner,
// rules-hc-old): one made by the second coach (Priya), one by the owner
// (Alex), and an older one with no coach recorded.
//
// Migration 044 (guests choose who sees their answers): a fourth finished
// Health Check on the second coach's link whose guest chose Only you
// (rules-hc-private), and a finished one with the client's own email
// (rules-hc-claim), which the client's account claims. Skipped without 044.

import { ANYONE, NOBODY, SIGNED_IN } from './access.mjs';

const id = (key) => `current_setting('rules.${key}')::uuid`;

export const ALIGNMENT_SETUP = [`do $alignment$
begin
  if to_regprocedure('public.alignment_coach_answers(text)') is null then
    return;
  end if;
  insert into public.alignment_sessions (token, access_code_hash, client_label, respondent_email, status, completed_at, data, coach_user_id)
  values ('rules-hc-coach', 'x', 'Rules test', 'rules-hc-one@example.invalid', 'complete', now(), '{"objective": "Rules answers, Priya''s link"}', ${id('second_coach')}),
         ('rules-hc-owner', 'x', 'Rules test', 'rules-hc-two@example.invalid', 'complete', now(), '{"objective": "Rules answers, Alex''s link"}', ${id('owner_coach')}),
         ('rules-hc-old', 'x', 'Rules test', 'rules-hc-three@example.invalid', 'complete', now(), '{"objective": "Rules answers, older link"}', null);
  if to_regprocedure('public.alignment_claim()') is not null then
    execute $q$insert into public.alignment_sessions (token, access_code_hash, client_label, respondent_email, status, completed_at, data, coach_user_id, shared_with_coach)
      values ('rules-hc-private', extensions.crypt('ABCDEF', extensions.gen_salt('bf', 4)), 'Rules test', 'rules-hc-four@example.invalid', 'complete', now(), '{"objective": "Rules answers, Only you"}', $1, false),
             ('rules-hc-claim', 'x', 'Rules test', (select lower(btrim(email)) from auth.users where id = $2), 'complete', now(), '{"objective": "Rules answers, claimed"}', $1, false)$q$
      using ${id('second_coach')}, ${id('client')};
  end if;
end
$alignment$;`];

const fn = (sig, call, access, note) => ({ sig, call: `select ${call}`, access, note, ifExists: true });
export const ALIGNMENT_FUNCTIONS = [
  fn('alignment_coach_answers(text)', "public.alignment_coach_answers('no-such-link')", SIGNED_IN,
    'Signed in only; the answers come back only to the coach who made the link (036).'),
  fn('alignment_recipients(text)', "public.alignment_recipients('no-such-link')", NOBODY,
    'The email server only (service role): who gets which email (036).'),
  fn('alignment_set_sharing(text,text,text,boolean)', "public.alignment_set_sharing('no-such-link', 'nobody@example.invalid', 'AAAAAA', false)", ANYONE,
    'The guest\'s choice (044): link, email and code are checked inside, as alignment_open.'),
  fn('alignment_claim()', 'public.alignment_claim()', SIGNED_IN,
    'Moves in only the finished outside Health Checks of the person\'s own confirmed email (044).'),
  fn('_alignment_coach_id(text)', 'public._alignment_coach_id(null)', NOBODY,
    'Inside part of making a Health Check link (036; 037: only a real coach, and only the owner for another coach).'),
];

const s = (name, steps, expect) => ({ name, steps: steps.map(([as, sql]) => ({ as, sql })), expect, needs: 'public.alignment_coach_answers(text)' });
const s44 = (name, steps, expect) => ({ ...s(name, steps, expect), needs: 'public.alignment_claim()' });
const READ = (token) => `select coalesce(public.alignment_coach_answers('${token}') -> 'data' ->> 'objective', 'nothing')`;
export const ALIGNMENT_SCENARIOS = [
  s('The second coach reads the answers on their own link', [['second_coach', READ('rules-hc-coach')]], 'Rules answers, Priya\'s link'),
  s('... the owner can\'t', [['owner_coach', READ('rules-hc-coach')]], 'nothing'),
  s('... nor a client', [['client', READ('rules-hc-coach')]], 'nothing'),
  s('... nor someone signed out', [['signed_out', READ('rules-hc-coach')]], 'error 42501'),
  s('The owner reads the answers on their own link', [['owner_coach', READ('rules-hc-owner')]], 'Rules answers, Alex\'s link'),
  s('... the second coach can\'t', [['second_coach', READ('rules-hc-owner')]], 'nothing'),
  s('An older link with no coach goes to the owner', [['owner_coach', READ('rules-hc-old')]], 'Rules answers, older link'),
  s('... not to another coach', [['second_coach', READ('rules-hc-old')]], 'nothing'),
  s('Nobody signed in learns who gets the emails', [['owner_coach', "select (public.alignment_recipients('rules-hc-coach') ->> 'ok')"]], 'error 42501'),
  // 044: the guest chose Only you
  s44('The coach learns an Only you Health Check finished', [['second_coach', "select public.alignment_coach_answers('rules-hc-private') ->> 'status'"]], 'complete'),
  s44('... but reads none of its answers', [['second_coach', READ('rules-hc-private')]], 'nothing'),
  s44('... nor the table it is in', [['second_coach', 'select count(*)::text from public.alignment_sessions']], 'error 42501'),
  s44('... nor learns that much as another coach', [['owner_coach', "select public.alignment_coach_answers('rules-hc-private') ->> 'error'"]], 'invalid'),
  s44('Its guest\'s choice can\'t be set without their link, email and code', [['second_coach', "select public.alignment_set_sharing('rules-hc-private', 'rules-hc-four@example.invalid', 'AAAAAA', true) ->> 'error'"]], 'invalid'),
  s44('An account claims the finished Health Check of its own email', [['client', 'select public.alignment_claim()::text']], '1'),
  s44('... once', [['client', 'select public.alignment_claim()::text'], ['client', 'select public.alignment_claim()::text']], '0'),
  s44('... with its Only you', [['client', 'select public.alignment_claim()::text'], ['client', "select form_data ->> 'shared_with_coach' from public.decisions where form_data -> 'data' ->> 'objective' = 'Rules answers, claimed'"]], 'false'),
  s44('... which the coach can\'t read', [['client', 'select public.alignment_claim()::text'], ['second_coach', "select count(*)::text from public.decisions where form_data -> 'data' ->> 'objective' = 'Rules answers, claimed'"]], '0'),
  s44('Someone else claims nothing of it', [['owner_coach', 'select public.alignment_claim()::text']], '0'),
];
