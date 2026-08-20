-- Create decisions table for GROW and Inversion model decisions
CREATE TABLE IF NOT EXISTS decisions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tool_type TEXT NOT NULL CHECK (tool_type IN ('grow', 'inversion')),
  title TEXT,
  form_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'completed')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create reflections table for journal entries
CREATE TABLE IF NOT EXISTS reflections (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT DEFAULT 'Journal Entry',
  content TEXT NOT NULL,
  linked_decision_id UUID REFERENCES decisions(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create strategic_alignments table for team planning
CREATE TABLE IF NOT EXISTS strategic_alignments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT,
  form_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'completed')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX idx_decisions_user_id ON decisions(user_id);
CREATE INDEX idx_decisions_created_at ON decisions(created_at DESC);
CREATE INDEX idx_reflections_user_id ON reflections(user_id);
CREATE INDEX idx_reflections_created_at ON reflections(created_at DESC);
CREATE INDEX idx_strategic_alignments_user_id ON strategic_alignments(user_id);
CREATE INDEX idx_strategic_alignments_created_at ON strategic_alignments(created_at DESC);

-- Enable Row Level Security
ALTER TABLE decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE reflections ENABLE ROW LEVEL SECURITY;
ALTER TABLE strategic_alignments ENABLE ROW LEVEL SECURITY;

-- Create RLS policies - users can only see their own data
CREATE POLICY "Users can view their own decisions" ON decisions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own decisions" ON decisions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own decisions" ON decisions
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own decisions" ON decisions
  FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Users can view their own reflections" ON reflections
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own reflections" ON reflections
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own reflections" ON reflections
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own reflections" ON reflections
  FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Users can view their own alignments" ON strategic_alignments
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own alignments" ON strategic_alignments
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own alignments" ON strategic_alignments
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own alignments" ON strategic_alignments
  FOR DELETE USING (auth.uid() = user_id);
