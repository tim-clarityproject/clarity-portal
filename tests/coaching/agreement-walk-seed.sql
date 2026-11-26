-- The client's agreement walk (tests/coaching/agreement-walk.mjs): three agreements sent to Sam Carter, the standing
-- client, on a COPY of the Polish 1 seeded snapshot (part 6, Alex Morgan's practice). Invented data; local stand-in only,
-- never a hosted database. Each is a copy of Leila Haddad's sent agreement (5eed0600-0009-…0c, self-funded set sessions):
--   5eed0c40-…02 the newest: read, the sign step's checks, signed with a drawn signature, settled, Direct Debit, Welcome.
--   5eed0c40-…04 sent an hour earlier: once the first is signed it is the one waiting; signed with the typed name.
--   5eed0c40-…06 sent two hours earlier: then the one waiting; the walk asks for a change, and it shows that line.
-- The walk signs and asks, so each run needs a fresh copy:
--   node tests/scale/db.mjs --from <polish-seeded.tar> --dump <copy.tar> tests/coaching/agreement-walk-seed.sql
-- Its ids start 5eed0c40- (not part 6's 5eed0600-), so it lives only on the copy.
insert into public.agreements (id, coach_id, kind, profile_id, organisation_id, status, current_version, agreement_kind, package_id, created_at)
select x.id, a.coach_id, 'coaching', '5eed0600-0002-4000-8000-000000000001', null, 'sent', 1, a.agreement_kind, a.package_id, now() - x.ago
  from public.agreements a, (values ('5eed0c40-0000-4000-8000-000000000001'::uuid, interval '0'), ('5eed0c40-0000-4000-8000-000000000003'::uuid, interval '1 hour'),
               ('5eed0c40-0000-4000-8000-000000000005'::uuid, interval '2 hours')) x(id, ago)
 where a.id = '5eed0600-0009-4000-8000-00000000000c';
insert into public.agreement_versions (id, agreement_id, coach_id, version, status, terms, clauses, currency, fx_rate, fx_at, total_minor, funded_by, coach_signed_at, coach_signature_id, sent_at, send_as, personal_note, expires_on, created_at)
select x.vid, x.aid, v.coach_id, 1, 'sent',
       v.terms || jsonb_build_object('clientName', 'Sam Carter', 'clientFirst', 'Sam', 'clientEmail', 'local-client@example.com',
         'personalNote', 'Thank you for this morning. Here’s the agreement for your six months of coaching.'),
       v.clauses, v.currency, v.fx_rate, v.fx_at, v.total_minor, v.funded_by, now() - x.ago, v.coach_signature_id, now() - x.ago, 'agreement',
       'Thank you for this morning. Here’s the agreement for your six months of coaching.', (now() + interval '30 days')::date, now() - x.ago
  from public.agreement_versions v,
       (values ('5eed0c40-0000-4000-8000-000000000002'::uuid, '5eed0c40-0000-4000-8000-000000000001'::uuid, interval '0'),
               ('5eed0c40-0000-4000-8000-000000000004'::uuid, '5eed0c40-0000-4000-8000-000000000003'::uuid, interval '1 hour'),
               ('5eed0c40-0000-4000-8000-000000000006'::uuid, '5eed0c40-0000-4000-8000-000000000005'::uuid, interval '2 hours')) x(vid, aid, ago)
 where v.agreement_id = '5eed0600-0009-4000-8000-00000000000c';
