-- Personal Operating Plan tables

-- Missions table (one per user)
CREATE TABLE IF NOT EXISTS missions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Strategies table (pillars that belong to a mission)
CREATE TABLE IF NOT EXISTS strategies (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  mission_id UUID NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tactics table (actions that belong to a strategy)
CREATE TABLE IF NOT EXISTS tactics (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  strategy_id UUID NOT NULL REFERENCES strategies(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('tickable', 'measurable')),
  -- For measurable tactics
  target_value NUMERIC,
  unit TEXT,
  current_value NUMERIC,
  -- For tickable tactics
  is_done BOOLEAN DEFAULT FALSE,
  sort_order INTEGER DEFAULT 0,
  last_reviewed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Mission progress reviews (dated snapshots)
CREATE TABLE IF NOT EXISTS mission_progress_reviews (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  mission_id UUID NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  review_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes
CREATE INDEX idx_missions_user_id ON missions(user_id);
CREATE INDEX idx_strategies_mission_id ON strategies(mission_id);
CREATE INDEX idx_tactics_strategy_id ON tactics(strategy_id);
CREATE INDEX idx_mission_progress_reviews_user_id ON mission_progress_reviews(user_id);
CREATE INDEX idx_mission_progress_reviews_mission_id ON mission_progress_reviews(mission_id);
CREATE INDEX idx_mission_progress_reviews_created_at ON mission_progress_reviews(created_at DESC);

-- Enable Row Level Security
ALTER TABLE missions ENABLE ROW LEVEL SECURITY;
ALTER TABLE strategies ENABLE ROW LEVEL SECURITY;
ALTER TABLE tactics ENABLE ROW LEVEL SECURITY;
ALTER TABLE mission_progress_reviews ENABLE ROW LEVEL SECURITY;

-- RLS Policies for missions
CREATE POLICY "Users can view their own missions" ON missions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own missions" ON missions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own missions" ON missions
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own missions" ON missions
  FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for strategies
CREATE POLICY "Users can view strategies from their missions" ON strategies
  FOR SELECT USING (
    mission_id IN (SELECT id FROM missions WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can insert strategies to their missions" ON strategies
  FOR INSERT WITH CHECK (
    mission_id IN (SELECT id FROM missions WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can update strategies in their missions" ON strategies
  FOR UPDATE USING (
    mission_id IN (SELECT id FROM missions WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can delete strategies from their missions" ON strategies
  FOR DELETE USING (
    mission_id IN (SELECT id FROM missions WHERE user_id = auth.uid())
  );

-- RLS Policies for tactics
CREATE POLICY "Users can view tactics from their strategies" ON tactics
  FOR SELECT USING (
    strategy_id IN (
      SELECT id FROM strategies
      WHERE mission_id IN (SELECT id FROM missions WHERE user_id = auth.uid())
    )
  );

CREATE POLICY "Users can insert tactics to their strategies" ON tactics
  FOR INSERT WITH CHECK (
    strategy_id IN (
      SELECT id FROM strategies
      WHERE mission_id IN (SELECT id FROM missions WHERE user_id = auth.uid())
    )
  );

CREATE POLICY "Users can update tactics in their strategies" ON tactics
  FOR UPDATE USING (
    strategy_id IN (
      SELECT id FROM strategies
      WHERE mission_id IN (SELECT id FROM missions WHERE user_id = auth.uid())
    )
  );

CREATE POLICY "Users can delete tactics from their strategies" ON tactics
  FOR DELETE USING (
    strategy_id IN (
      SELECT id FROM strategies
      WHERE mission_id IN (SELECT id FROM missions WHERE user_id = auth.uid())
    )
  );

-- RLS Policies for mission_progress_reviews
CREATE POLICY "Users can view their own reviews" ON mission_progress_reviews
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own reviews" ON mission_progress_reviews
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own reviews" ON mission_progress_reviews
  FOR DELETE USING (auth.uid() = user_id);
