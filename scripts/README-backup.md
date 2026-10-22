# Backing up The Clarity Portal database

The Clarity Portal runs on Supabase's Free plan, which makes **no automatic backups**. This script is the only backup, so run it regularly.

## What it backs up

One file containing everything in the database:

- **Database tables** (the `public` schema): plans, reviews, journals, decisions, missions and every other table the app uses.
- **Sign-in accounts** (the `auth` schema): users, email addresses and password hashes, so people could still sign in after a restore.
- **File-storage records** (the `storage` schema): the list of uploaded files and their buckets.

It does **not** back up the stored files themselves (images or documents uploaded to Supabase Storage), only the records that point to them.

The backup file contains personal data and sign-in details. Keep it private and never email it or commit it to GitHub.

## Where the backups go

`~/Documents/clarity-backups/` (that is, the `clarity-backups` folder inside your Documents folder).

Each file is named with the date and time in London time, for example `clarity-2026-10-22-1830.dump`.

The **newest 12** backups are kept. Each time the script runs, it deletes anything older and tells you which files it removed. Weekly backups therefore cover about three months.

## When to run it

- **Every week.**
- **Always before running any SQL on the live database** (migrations, fixes, anything in the Supabase SQL editor). No exceptions.

## How to run it

1. Open **Terminal** (press Cmd + Space and type "Terminal").
2. Paste this and press Return:

   ```
   cd ~/Library/CloudStorage/OneDrive-Personal/Client\ Portal/clarity-portal && bash scripts/backup-db.sh
   ```

3. It takes from a few seconds to a minute or two. The last line tells you the result:
   - `Backup saved: clarity-2026-10-22-1830.dump (2.4 MB)` means it worked.
   - `Backup failed: ...` means it did not, and the rest of the line says what to fix.

A good run also shows a line like `Checked: 2.4 MB, 31 tables, 31 table-data entries.` This means the file was read back and looks complete. The check reads the file only. It does not touch the live database again.

## The connection-details file (~/.clarity-backup.env)

The script reads the database connection string from a private file in your home folder called `.clarity-backup.env`. It contains a single line:

```
DB_URL="postgresql://..."
```

**Getting the connection string:** in Supabase, open the project, click **Connect** and copy the **Session pooler** connection string. Replace `[YOUR-PASSWORD]` with the database password. If you have forgotten it, reset it under Project Settings, Database.

**To save it or change it**, do this yourself in a normal Terminal window. Never paste the connection string into a chat with Claude, or into any file in the project.

1. Open the file in TextEdit's plain-text mode:

   ```
   touch ~/.clarity-backup.env && open -e ~/.clarity-backup.env
   ```

2. Make the file contain only the one `DB_URL="..."` line, with your connection string between the quotes. Save and close.
3. Make the file private (the script refuses to run otherwise):

   ```
   chmod 600 ~/.clarity-backup.env
   ```

If the script says the file is missing, or its permissions are not 600, repeat these steps.

## Restoring a backup (outline only)

> **Warning: restoring overwrites data.** Anything saved after the backup was taken will be lost. Do not attempt this on your own. Do it with Claude's help, one step at a time, and take a fresh backup first.

In outline, a restore would:

1. Take a fresh backup of the current database, so the restore itself can be undone.
2. Decide what to restore: the whole database, or only certain tables. Often it is safer to restore into a new, empty Supabase project first and copy across only what is needed.
3. Preview what the backup file contains with `pg_restore --list` (this reads the file only).
4. Run `pg_restore` against the target database with the right options, checked line by line with Claude beforehand.
5. Check in The Clarity Portal that sign-in works and the data looks right.

## If something goes wrong

- **"pg_dump is not installed"**: run `brew install libpq` in Terminal.
- **"~/.clarity-backup.env is missing" / "permissions"**: see the connection-details section above.
- **"pg_dump could not complete the backup"**: the message above it explains why (with the connection details hidden). Common causes are a wrong password, no internet connection, or a paused Supabase project (Free plan projects pause after a week without use; restore the project from the Supabase dashboard and try again).
