// Add a coach (Phase 6a run 1; M11's Settings, Coaches): the owner adds an
// associate, who gets the branded invite to set their password.
//
// POST { firstName, fullName, email }, with the owner's own sign-in as the
// Authorization header. It:
//   1. checks that the caller is the owner (public.is_owner(), asked as them);
//   2. only on the live site, asks Supabase to invite that email (Supabase
//      sends its saved invite template: email-templates/supabase-invite, made
//      from the portal's one shared email template) and adds their row to
//      public.coaches as a coach, switched on.
// Nothing is sent, and nobody is added, from a preview or a developer's
// machine (maySend: production only): the answer then says sent: false.
//
// Needs SUPABASE_URL (or VITE_SUPABASE_URL), SUPABASE_ANON_KEY (or
// VITE_SUPABASE_ANON_KEY) and SUPABASE_SERVICE_ROLE_KEY in Vercel.
import { createClient } from '@supabase/supabase-js';
import { codeRefusal } from './_coachCode.js';
import { maySend, oneAddress } from './_guestEmails.js';
import { portalOrigin } from './_portalOrigin.js';

const reply = (res, status, body) => { res.status(status).setHeader('Cache-Control', 'no-store'); res.json(body); };
const clean = (v, max) => String(v ?? '').replace(/[\u0000-\u001F\u007F​-‏‪-‮⁠-⁤﻿]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);

export default async function handler(req, res) {
  if (req.method !== 'POST') return reply(res, 405, { message: 'That didn’t work. Try again in a moment.' });
  const env = process.env;
  const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
  const anon = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY;
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!url || !anon || !token) return reply(res, 401, { message: 'Sign in again to carry on.' });

  const firstName = clean(req.body?.firstName, 60);
  const fullName = clean(req.body?.fullName, 120) || null;
  const email = clean(req.body?.email, 254).toLowerCase();
  if (!firstName) return reply(res, 400, { message: 'Type their first name to carry on.' });
  if (!oneAddress(email)) return reply(res, 400, { message: 'That email doesn’t look right. Check it and try again.' });

  // Only a sign-in that has given its 6-digit code (054).
  const noCode = codeRefusal(token, {});
  if (noCode) return reply(res, noCode.status, noCode.body);

  // Asked as the caller: only the owner may add a coach.
  const asCaller = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false, autoRefreshToken: false } });
  const { data: owner, error: ownerError } = await asCaller.rpc('is_owner');
  if (ownerError || owner !== true) return reply(res, 403, { message: 'Only the owner can add a coach.' });

  if (!maySend(env)) return reply(res, 200, { ok: true, sent: false });
  if (!env.SUPABASE_SERVICE_ROLE_KEY) return reply(res, 500, { message: 'That didn’t work. Let Tim know the invite isn’t set up yet.' });

  const admin = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo: `${portalOrigin(req.headers, env)}/auth/invite`, data: { first_name: firstName } });
  if (inviteError || !invited?.user?.id) {
    const already = /already|registered|exists/i.test(inviteError?.message || '');
    return reply(res, already ? 409 : 502, { message: already ? 'Someone already has an account with that email. Ask them to sign in, then add them as a coach.' : 'The invite didn’t go. Try again in a moment.' });
  }
  const row = { user_id: invited.user.id, role: 'coach', display_first_name: firstName, email, active: true };
  let { error: rowError } = await admin.from('coaches').insert({ ...row, full_name: fullName });
  // Before migration 049 there is no full name to keep.
  if (rowError && /full_name/.test(rowError.message || '')) ({ error: rowError } = await admin.from('coaches').insert(row));
  if (rowError) return reply(res, 502, { message: 'The invite went, but their coach page didn’t open. Let Tim know.' });
  return reply(res, 200, { ok: true, sent: true });
}
