-- Add daily_plan to the allowed tool_type values in decisions table
ALTER TABLE decisions DROP CONSTRAINT decisions_tool_type_check;

ALTER TABLE decisions ADD CONSTRAINT decisions_tool_type_check
  CHECK (tool_type IN ('grow', 'inversion', 'tough-conversation', 'strategic-alignment', 'daily_plan'));
