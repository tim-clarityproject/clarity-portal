# Critical Database Migration Required: Add Stop Doing Audit Support

## Problem
The Stop Doing Audit summary page (/stop-doing-audit-summary) fails to load with a **400 Bad Request** error from Supabase. This is because the `decisions` table's `tool_type` CHECK constraint was missing `'stop_doing_audit'` as an allowed value.

When the application tries to save or load Stop Doing Audit records with `tool_type = 'stop_doing_audit'`, the database constraint rejects them, causing the 400 error.

## Root Cause
The `decisions` table in `supabase/migrations/001_create_tables.sql` has a CHECK constraint that only allows these tool_type values:
- `'grow'`
- `'inversion'`
- `'tough-conversation'`
- `'strategic-alignment'`
- `'if_then_planning'`
- `'daily_plan'`
- `'plan_meeting'`

**Missing:** `'stop_doing_audit'`

## Solution
Apply the SQL migration from `supabase/migrations/011_add_stop_doing_audit_tool_type.sql` to your production Supabase database.

### How to Apply the Migration

#### Option 1: Using Supabase Dashboard (Recommended)

1. Go to https://app.supabase.com and log in to your Clarity Portal project
2. Click on "SQL Editor" in the left sidebar
3. Click "New Query" to create a new SQL query
4. Copy and paste the following SQL:

```sql
-- Add stop_doing_audit to the allowed tool_type values in decisions table
ALTER TABLE decisions DROP CONSTRAINT IF EXISTS decisions_tool_type_check;

ALTER TABLE decisions ADD CONSTRAINT decisions_tool_type_check
  CHECK (tool_type IN (
    'grow',
    'inversion',
    'tough-conversation',
    'strategic-alignment',
    'if_then_planning',
    'daily_plan',
    'plan_meeting',
    'stop_doing_audit'
  ));
```

5. Click "Run" to execute the migration
6. You should see "Query successful" message

#### Option 2: Using Supabase CLI (if installed)

```bash
supabase migration up
```

#### Option 3: Direct Database Connection (Advanced)

If you have `psql` installed and know your database connection string:

```bash
psql postgresql://postgres:[PASSWORD]@[HOST]:5432/postgres -c "
ALTER TABLE decisions DROP CONSTRAINT IF EXISTS decisions_tool_type_check;
ALTER TABLE decisions ADD CONSTRAINT decisions_tool_type_check
  CHECK (tool_type IN (
    'grow',
    'inversion',
    'tough-conversation',
    'strategic-alignment',
    'if_then_planning',
    'daily_plan',
    'plan_meeting',
    'stop_doing_audit'
  ));
"
```

## Verification

After applying the migration, verify it was successful:

1. Go to the Supabase SQL Editor
2. Run this query:

```sql
SELECT constraint_name, constraint_definition 
FROM information_schema.check_constraints 
WHERE table_name = 'decisions' AND constraint_name LIKE '%tool_type%';
```

You should see the constraint now includes `'stop_doing_audit'` in the allowed values.

3. Test the Stop Doing Audit page by navigating to https://portal.theclarityproject.co.uk/stop-doing-audit
4. Create a new audit, fill in the form, and save it
5. The summary page should now load correctly without showing "Loading audit..." forever

## Code Changes in This Commit
- ✅ Added error state to StopDoingAuditSummary component
- ✅ Added visible error messages for users instead of silent failures  
- ✅ Added detailed console logging for debugging
- ✅ Changed from `.maybeSingle()` to `.single()` to match other summary pages
- ✅ Created database migration file: `supabase/migrations/011_add_stop_doing_audit_tool_type.sql`

## What Changed
The StopDoingAuditSummary.jsx page now:
- Shows a clear error message if the audit fails to load
- Logs detailed information to the console for debugging
- Validates that decisionId and user are present before querying
- Has a button to go back to decision history if an error occurs

Once the database migration is applied, the page will work correctly.
