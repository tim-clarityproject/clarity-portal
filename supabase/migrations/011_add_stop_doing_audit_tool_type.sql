-- Add stop_doing_audit to the allowed tool_type values in decisions table
-- The old CHECK constraint doesn't allow this tool type, so we need to replace it

-- First, drop the old constraint
ALTER TABLE decisions DROP CONSTRAINT IF EXISTS decisions_tool_type_check;

-- Add new constraint with stop_doing_audit included
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
