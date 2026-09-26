// Script to apply the stop_doing_audit migration to production Supabase
// Usage: node apply-migration.js <SUPABASE_DB_PASSWORD>

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://rlrnvpwluqbpxuklldqg.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseServiceKey) {
  console.error('Error: SUPABASE_SERVICE_KEY environment variable not set');
  console.error('This script requires a service key with admin privileges to run migrations');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function applyMigration() {
  try {
    console.log('Applying migration: Add stop_doing_audit to tool_type...');

    // Drop the old constraint and add new one with stop_doing_audit
    const { error } = await supabase.rpc('run_sql', {
      sql: `
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
      `
    });

    if (error) {
      console.error('Migration failed:', error);
      process.exit(1);
    }

    console.log('✓ Migration applied successfully!');
    console.log('The decisions table now accepts tool_type = "stop_doing_audit"');
  } catch (err) {
    console.error('Error applying migration:', err);
    process.exit(1);
  }
}

applyMigration();
