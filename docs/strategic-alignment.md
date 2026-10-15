# Strategic Alignment Health Check: how to run it (for Tim)

This covers the database side only. The screens come in the next prompts.

## 1. Set up the database (once)

1. Open Supabase, then your project, then **SQL Editor**, then **New query**.
2. Open `supabase/migrations/018_alignment_sessions.sql` from the repo, copy everything, paste it in and press **Run**. It is safe to run more than once.
3. Open `supabase/alignment_sessions_test.sql`, copy everything, paste it in a new query and press **Run**. If it finishes without an error it worked. If something is wrong it stops with a message starting `FAIL` and leaves nothing behind.

Note: preview and live share one Supabase project, so this applies to both straight away.

## 2. Create a session for a client

In the SQL editor run:

```sql
select public.create_alignment_session('Acme Ltd', 'ceo@acme.com');
```

You get back three things:

- `token`: the long private part of the link.
- `access_code`: six characters, for example `K7QX3M`. **It is shown once and never stored.** Copy it now. If you lose it, create a new session.
- `link_path`: `/health-check/<token>`.

Send the respondent two things, ideally in separate messages:

- The link: `https://portal.theclarityproject.co.uk/health-check/<token>`
- The access code. They also need to type the email address you used above.

Neither the email nor the code is case sensitive.

## 3. See, disable and delete sessions

See everyone (no answers or hashes are shown):

```sql
select * from public.alignment_list();
```

Switch a link off (it then behaves exactly like a wrong code):

```sql
select public.alignment_disable('<token>');
```

Delete a session and its answers for good:

```sql
delete from public.alignment_sessions where token = '<token>';
```

## 4. The lockout

After 5 wrong email or code attempts on one link, that link refuses everything for 15 minutes, even the right details. The respondent sees a generic message and nothing about which part was wrong. It resets by itself, and a correct entry resets the count.

To lift a lockout early:

```sql
update public.alignment_sessions
set locked_until = null, failed_attempts = 0
where token = '<token>';
```

## 5. Backups

The Supabase free plan has **no backups**. Upgrade the plan before real client data goes in.

## 6. Emails, PDF and sign-up (SA4)

**Run in the SQL editor, in this order:** `018` (done), `019_alignment_emails.sql`, then `supabase/alignment_emails_test.sql`.

**Vercel environment variables** (Project, Settings, Environment Variables; tick Production and Preview):

| Name | Example | What it is |
|---|---|---|
| `RESEND_API_KEY` | `re_...` | A Resend API key that can send from your verified domain. |
| `ALIGNMENT_EMAIL_FROM` | `The Clarity Portal <portal@theclarityproject.co.uk>` | Must be on the domain verified in Resend. |
| `ALIGNMENT_NOTIFY_TO` | `tim@theclarityproject.co.uk,ad@theclarityproject.co.uk` | Who gets the completion email (comma-separated). |

The Supabase URL and anon key the app already uses are reused by the function. After adding variables, redeploy the preview (Deployments, the three dots, Redeploy).

- The link email goes only to the email on the session; it never contains the access code. At most 3 per session per 24 hours.
- The completion email is sent once, the first time a session is completed.
- Answers are kept for two years after the last activity. No deletion job exists yet: until one is built, delete old rows by hand:
  `delete from public.alignment_sessions where updated_at < now() - interval '2 years';`
